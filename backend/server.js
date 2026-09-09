import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { spawn, execSync } from 'child_process';
import {
  checkFirebaseHealth,
  recordPlayEvent as recordFirebasePlay,
  getFavorites as getFirebaseFavorites,
  toggleFavorite as toggleFirebaseFavorite,
  getPlaylists as getFirebasePlaylists,
  savePlaylist as saveFirebasePlaylist,
  cacheStream as cacheFirebaseStream,
  getCachedStream as getCachedFirebaseStream,
  getUserListeningData,
  getAppTrendingTracks,
  getPinUser,
  savePinUser,
  saveTrendingFeed,
  updateUsersToDicebear,
  cacheTrackImage,
  getCachedTrackImage
} from './firebase.js';

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// Enable CORS for Expo web, mobile clients, and local frontend
app.use(cors({
  origin: '*',
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Range', 'Authorization', 'Accept'],
  exposedHeaders: ['Content-Range', 'Content-Length', 'Accept-Ranges']
}));

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// In-memory cache for audio streams & home feed
const streamCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const inFlightExtractions = new Map();

// Helper: Convert time string (e.g. "3:45" or "1:02:15") into seconds
function parseDurationToSeconds(durationStr) {
  if (!durationStr) return 0;
  const parts = durationStr.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

// Find yt-dlp binary path dynamically across macOS, Linux, Render
function findYtDlpBinary() {
  const candidates = [
    process.env.YTDLP_PATH,
    process.env.HOME ? path.join(process.env.HOME, '.local/bin/yt-dlp') : null,
    '/opt/render/.local/bin/yt-dlp',
    '/Library/Frameworks/Python.framework/Versions/3.13/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    'yt-dlp'
  ];
  for (const c of candidates) {
    if (!c) continue;
    try {
      if (c === 'yt-dlp') {
        const p = execSync('which yt-dlp', { encoding: 'utf8' }).trim();
        if (p) return p;
      } else if (fs.existsSync(c)) {
        return c;
      }
    } catch (_) {}
  }
  return 'yt-dlp';
}

const YTDLP_BIN = findYtDlpBinary();

// Extract audio stream via yt-dlp with Firebase fallback cache
async function extractAudioStream(videoId) {
  // Clean video ID
  const idMatch = videoId.match(/(?:v=|\/embed\/|\/1\/|youtu\.be\/|^)([a-zA-Z0-9_-]{11})/);
  const cleanId = idMatch ? idMatch[1] : videoId.trim();

  // 1. Check in-memory cache
  const cached = streamCache.get(cleanId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  // 2. Check Firebase persistent stream cache
  const fbCached = await getCachedFirebaseStream(cleanId);
  if (fbCached && fbCached.url) {
    streamCache.set(cleanId, fbCached);
    return fbCached;
  }

  // 3. Check in-flight request deduplication
  if (inFlightExtractions.has(cleanId)) {
    return inFlightExtractions.get(cleanId);
  }

  const promise = new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_BIN, [
      '--dump-json',
      '--no-playlist',
      '--extractor-args', 'youtube:player_client=android,web',
      '-f', 'ba[ext=m4a]/ba/b',
      '--no-warnings',
      `https://www.youtube.com/watch?v=${cleanId}`
    ], { windowsHide: true });

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('Audio extraction timed out after 30s'));
    }, 30000);

    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        return reject(new Error(`yt-dlp failed: ${stderr.trim() || 'Exit code ' + code}`));
      }

      try {
        const data = JSON.parse(stdout);
        const duration = Number(data.duration || 0);
        const contentType = data.ext === 'm4a' ? 'audio/mp4' : 'audio/webm';
        const result = {
          videoId: cleanId,
          video_id: cleanId,
          title: data.title || '',
          artist: data.uploader || data.channel || '',
          duration,
          duration_seconds: duration,
          url: data.url,
          contentType,
          thumbnail: data.thumbnail || `https://i.ytimg.com/vi/${cleanId}/mqdefault.jpg`,
          expiresAt: Date.now() + CACHE_TTL_MS
        };

        streamCache.set(cleanId, result);
        cacheFirebaseStream(cleanId, result).catch(() => {});
        resolve(result);
      } catch (err) {
        reject(new Error(`Parse error: ${err.message}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  }).finally(() => {
    inFlightExtractions.delete(cleanId);
  });

  inFlightExtractions.set(cleanId, promise);
  return promise;
}

// Helper: Check if video was published within the last 30 days
function isReleasedWithin30Days(publishedText) {
  if (!publishedText || typeof publishedText !== 'string') return false;
  const p = publishedText.toLowerCase().trim();
  // Relative times: seconds, minutes, hours, days
  if (p.includes('second') || p.includes('minute') || p.includes('hour') || p.includes('day')) {
    return true;
  }
  // Up to 4 weeks ago
  if (p.includes('week')) {
    const match = p.match(/(\d+)\s*week/);
    if (!match) return true;
    const weeks = parseInt(match[1], 10);
    return weeks <= 4;
  }
  // Roughly 1 month
  if (p.startsWith('1 month') || p === '1 month ago') {
    return true;
  }
  // 2+ months, years -> definitely old
  return false;
}

// Scrape YouTube Music Search Helper
async function scrapeYouTubeSearch(query, options = {}) {
  const spParam = options.sp ? `&sp=${options.sp}` : '';
  const searchQuery = /music|audio|song|official/i.test(query)
    ? query
    : `${query} music`;

  const resp = await fetch(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}${spParam}`,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    }
  );

  const html = await resp.text();
  const match = html.match(/ytInitialData\s*=\s*({.+?});<\/script>/);
  if (!match) {
    return [];
  }

  const data = JSON.parse(match[1]);
  const contents =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;

  const results = [];
  const seenIds = new Set();

  if (Array.isArray(contents)) {
    for (const section of contents) {
      const itemSection = section?.itemSectionRenderer?.contents;
      if (Array.isArray(itemSection)) {
        for (const item of itemSection) {
          if (item.videoRenderer) {
            const v = item.videoRenderer;
            const id = v.videoId;
            if (!id || seenIds.has(id)) continue;
            seenIds.add(id);

            const title =
              v.title?.runs?.map((r) => r.text).join('') ||
              v.title?.simpleText ||
              '';
            const channel =
              v.ownerText?.runs?.map((r) => r.text).join('') ||
              v.channelTitle ||
              '';
            const durationStr = v.lengthText?.simpleText || '';
            const durationSeconds = parseDurationToSeconds(durationStr);
            const views = v.viewCountText?.simpleText || '';
            const published = v.publishedTimeText?.simpleText || '';

            // Skip videos longer than 20 minutes unless specified
            if (durationSeconds > 1200 && !query.toLowerCase().includes('hour') && !query.toLowerCase().includes('mix')) {
              continue;
            }

            // Use actual YouTube thumbnail from search results (yt3.googleusercontent.com) — higher quality
            const thumbList = v.thumbnail?.thumbnails;
            const thumbUrl = Array.isArray(thumbList) && thumbList.length > 0
              ? (thumbList.find(t => t.width >= 320)?.url || thumbList[thumbList.length - 1]?.url || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`)
              : `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

            results.push({
              id,
              videoId: id,
              video_id: id,
              title,
              artist: channel,
              duration: durationStr || '3:30',
              duration_seconds: durationSeconds || 210,
              durationSeconds: durationSeconds || 210,
              thumbnail: thumbUrl,
              artwork_url: thumbUrl,
              views,
              published,
            });

            if (results.length >= 25) break;
          }
        }
      }
      if (results.length >= 25) break;
    }
  }

  return results;
}

// Fetch verified Fresh New Releases released strictly within the last 30 days
async function fetchFreshNewReleases() {
  try {
    const verified = await fetchHomeCategoryTracks('Latest Hindi Songs', null, 15);
    if (verified && verified.length >= 6) {
      return verified;
    }

    const currentYear = new Date().getFullYear();
    const [hindiRes, punjabiRes, trendingRes] = await Promise.allSettled([
      scrapeYouTubeSearch(`latest Hindi songs ${currentYear} official video`, { sp: 'CAI%253D' }),
      scrapeYouTubeSearch(`new Punjabi songs ${currentYear} official music video`, { sp: 'CAI%253D' }),
      scrapeYouTubeSearch(`latest Indian songs official music video ${currentYear}`, { sp: 'CAI%253D' }),
    ]);

    const allCandidate = [
      ...(hindiRes.status === 'fulfilled' ? hindiRes.value : []),
      ...(punjabiRes.status === 'fulfilled' ? punjabiRes.value : []),
      ...(trendingRes.status === 'fulfilled' ? trendingRes.value : []),
    ];

    const seenIds = new Set();
    const seenThumbs = new Set();
    const freshTracks = [];

    for (const t of allCandidate) {
      if (!t || !t.videoId || seenIds.has(t.videoId)) continue;
      const thumb = t.artwork_url || t.thumbnail || '';
      if (thumb && seenThumbs.has(thumb)) continue;
      // Filter out compilations, full album jukeboxes, or long playlists
      const lowTitle = (t.title || '').toLowerCase();
      if (/jukebox|all songs|mashup|compilation|collection|top 10|top 20|audio jukebox/i.test(lowTitle)) {
        continue;
      }
      if (t.duration_seconds > 540) {
        continue; // Exclude videos longer than 9 minutes
      }

      // Check strictly if published within 30 days
      if (isReleasedWithin30Days(t.published)) {
        seenIds.add(t.videoId);
        if (thumb) seenThumbs.add(thumb);
        freshTracks.push(t);
      }
    }

    // If strictly filtered candidates are found, return them up to 15
    if (freshTracks.length >= 6) {
      return freshTracks.slice(0, 15);
    }

    // Fallback: if YouTube did not provide published text on enough tracks, include fresh candidate tracks
    for (const t of allCandidate) {
      if (!t || !t.videoId || seenIds.has(t.videoId)) continue;
      const thumb = t.artwork_url || t.thumbnail || '';
      if (thumb && seenThumbs.has(thumb)) continue;
      const lowTitle = (t.title || '').toLowerCase();
      if (/jukebox|all songs|mashup|compilation|collection/i.test(lowTitle) || t.duration_seconds > 540) continue;
      seenIds.add(t.videoId);
      if (thumb) seenThumbs.add(thumb);
      freshTracks.push(t);
      if (freshTracks.length >= 15) break;
    }

    return freshTracks.slice(0, 15);
  } catch (err) {
    console.warn('Error fetching fresh new releases:', err.message);
    return [];
  }
}

// ─── 1. Health check (/api/health and /health) with Firebase diagnostics ────────
app.get(['/api/health', '/health'], async (req, res) => {
  const fb = await checkFirebaseHealth();
  res.json({
    status: 'ok',
    service: 'Staytup Music Server',
    version: '2026.09.10-pure-saavn-v3',
    uptime: Math.round(process.uptime()),
    cacheSize: streamCache.size,
    firebase: fb.status,
    firebaseLatencyMs: fb.latencyMs,
    ytDlpBin: YTDLP_BIN,
    timestamp: new Date().toISOString()
  });
});

// ─── 2. Search suggestions (YouTube autocomplete) ─────────────────────────────
app.get(['/api/suggest', '/suggest', '/suggest/:userId'], async (req, res) => {
  try {
    const query = req.query.q ? String(req.query.q).trim() : '';
    if (!query) {
      return res.json({ suggestions: [] });
    }

    const resp = await fetch(
      `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }
    );

    const text = await resp.text();
    const match = text.match(/window\.google\.ac\.h\((.*)\)/);
    if (match && match[1]) {
      const data = JSON.parse(match[1]);
      if (Array.isArray(data) && Array.isArray(data[1])) {
        const suggestions = data[1].map((item) => item[0]).filter(Boolean);
        return res.json({ suggestions: suggestions.slice(0, 8) });
      }
    }
    res.json({ suggestions: [] });
  } catch (error) {
    console.error('Suggest error:', error.message);
    res.json({ suggestions: [] });
  }
});

// ─── JioSaavn Direct Audio & Search Integration ──────────────────────────────
const JIOSAAVN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.jiosaavn.com/',
  'Cookie': 'L=english;'
};
const SAAVN_API_PROVIDERS = [
  process.env.SAAVN_API_BASE_URL || 'https://staytup-api.onrender.com/api'
];

// BlumaLang JioSaavn API (clean normalized responses with perma_url, artists, artwork)
const BLUMALANG_API_BASE = process.env.BLUMALANG_API_BASE || 'https://staytup-api.onrender.com';

let currentProviderIndex = 0;
const saavnStreamCache = new Map(); // id -> { url, expiry }
const SAAVN_STREAM_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const trackImageCache = new Map(); // id -> { image, expiry }
const TRACK_IMAGE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in memory

function getSaavnBaseUrl() {
  return SAAVN_API_PROVIDERS[currentProviderIndex];
}

function rotateProvider() {
  currentProviderIndex = (currentProviderIndex + 1) % SAAVN_API_PROVIDERS.length;
  console.log(`Switched to Saavn provider: ${getSaavnBaseUrl()}`);
}

async function fetchSaavnJson(endpoint, retries = 2, timeoutMs = 10000) {
  const lastError = new Error('All Saavn providers failed');
  for (let providerAttempt = 0; providerAttempt < SAAVN_API_PROVIDERS.length; providerAttempt++) {
    const baseUrl = getSaavnBaseUrl();
    const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(timeoutMs)
        });
        if (res.status === 429 || res.status === 503) {
          const delay = Math.min(1500 * Math.pow(2, attempt), 6000);
          console.warn(`Saavn ${res.status} on ${baseUrl}, retry ${attempt + 1}/${retries} after ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        if (!res.ok) {
          throw new Error(`Saavn API HTTP ${res.status}`);
        }
        return await res.json();
      } catch (err) {
        lastError.message = err.message;
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }
    }
    // All retries on this provider failed, rotate to next
    rotateProvider();
  }
  throw lastError;
}

async function fetchBlumaLangApi(endpoint, timeoutMs = 12000) {
  const url = `${BLUMALANG_API_BASE}${endpoint}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) throw new Error(`BlumaLang API HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[blumaLang] ${endpoint} failed: ${err.message}`);
    return null;
  }
}

function normalizeBlumaLangSong(song) {
  if (!song || !song.id) return null;
  const rawId = String(song.id);
  const title = decodeHtmlEntities(song.name || song.title || '');

  let artist = '';
  if (song.artists?.primary && Array.isArray(song.artists.primary) && song.artists.primary.length > 0) {
    artist = song.artists.primary.map(a => a.name).filter(Boolean).join(', ');
  } else if (song.primaryArtists) {
    artist = String(song.primaryArtists);
  } else if (song.singers) {
    artist = String(song.singers);
  }

  const album = decodeHtmlEntities(song.album?.name || '');
  const year = String(song.year || '');
  const language = String(song.language || '');
  const permaUrl = String(song.url || '');

  let artworkUrl = '';
  if (Array.isArray(song.image) && song.image.length > 0) {
    const fiveHundred = song.image.find(img => img.quality === '500x500');
    const largest = song.image.reduce((best, img) => {
      const size = parseInt(img.quality, 10) || 0;
      const bestSize = parseInt(best.quality, 10) || 0;
      return size > bestSize ? img : best;
    }, song.image[0]);
    artworkUrl = fiveHundred?.url || largest?.url || '';
  }

  const duration = Number(song.duration) || 0;

  let resolvedStream = null;
  if (Array.isArray(song.downloadUrl) && song.downloadUrl.length > 0) {
    const sorted = [...song.downloadUrl].sort((a, b) => (parseInt(b.quality, 10) || 0) - (parseInt(a.quality, 10) || 0));
    resolvedStream = sorted[0]?.url || null;
  }

  return {
    id: rawId,
    source: 'saavn',
    videoId: rawId,
    video_id: rawId,
    title,
    artist: artist || 'Staytup Artist',
    album,
    year,
    language,
    artwork_url: artworkUrl,
    thumbnail: artworkUrl,
    duration,
    duration_seconds: duration,
    stream_url: resolvedStream,
    playCount: song.playCount || 0,
    perma_url: permaUrl
  };
}

function decodeHtmlEntities(str) {
  return String(str)
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'");
}

function normalizeSaavnSong(song, streamUrl = null) {
  if (!song || !song.id) return null;
  const rawId = String(song.id);
  const title = decodeHtmlEntities(song.name || song.title || song.song || '');

  let artist = '';
  if (song.more_info?.artistMap?.primary_artists && Array.isArray(song.more_info.artistMap.primary_artists) && song.more_info.artistMap.primary_artists.length > 0) {
    artist = song.more_info.artistMap.primary_artists.map(a => a.name).filter(Boolean).join(', ');
  } else if (song.artists?.primary && Array.isArray(song.artists.primary) && song.artists.primary.length > 0) {
    artist = song.artists.primary.map(a => a.name).filter(Boolean).join(', ');
  } else if (song.primaryArtists) {
    artist = String(song.primaryArtists);
  } else if (song.more_info?.primary_artists) {
    artist = String(song.more_info.primary_artists);
  } else if (song.primary_artists) {
    artist = String(song.primary_artists);
  } else if (song.singers) {
    artist = String(song.singers);
  } else if (song.subtitle) {
    const parts = String(song.subtitle).split(' - ');
    artist = decodeHtmlEntities(parts[0] || String(song.subtitle));
  } else if (song.artist) {
    artist = String(song.artist);
  }

  const rawAlbum = song.more_info?.album || (typeof song.album === 'object' ? song.album?.name : song.album) || '';
  const album = decodeHtmlEntities(rawAlbum);

  const year = String(song.year || song.more_info?.year || song.release_date?.slice(0, 4) || '');
  const language = String(song.language || song.more_info?.language || '');

  const permaUrl = String(song.perma_url || song.url || '');

  let artworkUrl = '';
  if (typeof song.image === 'string') {
    artworkUrl = song.image;
  } else if (Array.isArray(song.image) && song.image.length > 0) {
    const fiveHundred = song.image.find(img => img.quality === '500x500');
    const largest = song.image.reduce((best, img) => {
      const size = parseInt(img.quality, 10) || 0;
      const bestSize = parseInt(best.quality, 10) || 0;
      return size > bestSize ? img : best;
    }, song.image[0]);
    artworkUrl = fiveHundred?.url || largest?.url || song.image[song.image.length - 1]?.url || '';
  }
  if (artworkUrl) {
    artworkUrl = artworkUrl.replace(/150x150\.jpg/g, '500x500.jpg').replace(/50x50\.jpg/g, '500x500.jpg');
  }

  let duration = 0;
  if (song.more_info?.duration) {
    duration = Number(song.more_info.duration) || 0;
  } else if (song.duration) {
    duration = Number(song.duration) || 0;
  }

  let resolvedStream = streamUrl;
  if (!resolvedStream && Array.isArray(song.downloadUrl) && song.downloadUrl.length > 0) {
    const sorted = [...song.downloadUrl].sort((a, b) => (parseInt(b.quality, 10) || 0) - (parseInt(a.quality, 10) || 0));
    resolvedStream = sorted[0]?.url || null;
  }

  return {
    id: rawId,
    source: 'saavn',
    videoId: rawId,
    video_id: rawId,
    title,
    artist: artist || 'Staytup Artist',
    album,
    year,
    language,
    artwork_url: artworkUrl,
    thumbnail: artworkUrl,
    duration,
    duration_seconds: duration,
    stream_url: resolvedStream || null,
    playCount: song.playCount || song.play_count || 0,
    perma_url: permaUrl
  };
}

// 1. Saavn Search Route (BlumaLang API primary + direct JioSaavn fallback)
app.get(['/api/search/saavn', '/search/saavn'], async (req, res) => {
  try {
    const query = req.query.q ? String(req.query.q).trim() : (req.query.query ? String(req.query.query).trim() : '');
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const page = Math.max(0, Math.floor(offset / limit));
    if (!query) {
      return res.json({ query: '', count: 0, results: [], tracks: [], has_more: false });
    }

    // Direct JioSaavn Link Detection
    if (query.includes('jiosaavn.com/song/') || query.includes('jiosaavn.com/album/')) {
      try {
        const linkData = await fetchBlumaLangApi(`/api/songs?link=${encodeURIComponent(query)}`);
        if (linkData && linkData.success && Array.isArray(linkData.data) && linkData.data.length > 0) {
          const matched = linkData.data.map(s => normalizeBlumaLangSong(s)).filter(Boolean);
          if (matched.length > 0) {
            return res.json({ query, total: matched.length, count: matched.length, offset: 0, page: 0, results: matched, tracks: matched, has_more: false });
          }
        }
      } catch (_) {}
    }

    const isExplicitInstrumental = /instrumental|karaoke|bgm/i.test(query);
    const encodedQuery = encodeURIComponent(query);

    // Primary: BlumaLang JioSaavn API — clean normalized responses
    const blumaLangPromise = fetchBlumaLangApi(`/api/search/songs?query=${encodedQuery}&page=${page}&limit=${Math.min(limit, 50)}`);

    // Fallback: Direct JioSaavn API (if BlumaLang is down)
    const baseSubpage = (page * 3) + 1;
    const directPromise = fetch(`https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q=${encodedQuery}&p=${baseSubpage}&n=50`, {
      headers: JIOSAAVN_HEADERS,
      signal: AbortSignal.timeout(12000)
    }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).catch(e => { console.warn(`[saavn-search] Direct fallback failed: ${e.message}`); return null; });

    const [blumaLangResult, directResult] = await Promise.allSettled([blumaLangPromise, directPromise]);

    let rawSongs = [];
    let totalCount = 0;
    let source = 'none';

    // Try BlumaLang API first (cleanest data)
    if (blumaLangResult.status === 'fulfilled' && blumaLangResult.value?.success && Array.isArray(blumaLangResult.value?.data?.results)) {
      rawSongs = blumaLangResult.value.data.results;
      totalCount = blumaLangResult.value.data.total || rawSongs.length;
      source = 'blumalang';
      console.log(`[saavn-search] q="${query}" BlumaLang: ${rawSongs.length} songs`);
    }
    // Fallback to direct JioSaavn API
    else if (directResult.status === 'fulfilled' && directResult.value && Array.isArray(directResult.value.results)) {
      rawSongs = directResult.value.results;
      totalCount = directResult.value.total || rawSongs.length;
      source = 'direct';
      console.log(`[saavn-search] q="${query}" Direct fallback: ${rawSongs.length} songs`);
    } else {
      console.log(`[saavn-search] q="${query}" No results from any source`);
    }

    // Normalize based on source
    let normalized;
    if (source === 'blumalang') {
      normalized = rawSongs.map(s => normalizeBlumaLangSong(s)).filter(Boolean);
    } else {
      normalized = rawSongs.map(s => normalizeSaavnSong(s, null)).filter(Boolean);
    }

    // Aggressive garbage/instrumental filter
    if (!isExplicitInstrumental) {
      normalized = normalized.filter(s => {
        const t = (s.title || '').toLowerCase();
        const a = (s.artist || '').toLowerCase();
        const alb = (s.album || '').toLowerCase();
        const lang = (s.language || '').toLowerCase();

        if (lang === 'instrumental') return false;
        if (/(?:^|\s)instrumental|(?:\s|^)karaoke|originally\s*performed|\(lofi\)|\(hardstyle\)|\(nightcore\)|\(techno\)|8-bit|16-bit|hypertechno|sped\s*up|slowed\s*(?:&|and)?\s*reverb|emulation|(?:cover|remake|version)\s*(?:by|of)/i.test(t)) return false;
        if (/zzang\s*karaoke|8-bit\s*arcade|arcade\s*player|hyperave|turborave|basston|très\s*moyen|lost\s*soul|th3\s*darp|lauren\s*st\s*james/i.test(a)) return false;
        if (/soundtrack.*vol|impossible\s*game/i.test(alb)) return false;
        return true;
      });
    }

    // Relevance scoring
    const qLower = query.toLowerCase().trim();
    const qWords = qLower.split(/\s+/).filter(w => w.length > 1);
    const songTitleWords = /(?:official|music|video|audio|lyrics|song|album|live|remix|feat|ft|version)/i;
    const qIsArtistName = qWords.length >= 2 && !songTitleWords.test(query);

    function cleanSearchTitle(t) {
      return (t || '')
        .replace(/\s*\(.*?\)/g, '')
        .replace(/\s*\[.*?\]/g, '')
        .replace(/official\s*(music\s*)?(video|audio)|lyrics|mv|full\s*song/gi, '')
        .replace(/[^a-z0-9]/gi, ' ')
        .trim()
        .toLowerCase();
    }

    const scoreTrack = (t) => {
      const titleLower = (t.title || '').toLowerCase();
      const cleanT = cleanSearchTitle(t.title || '');
      const artistLower = (t.artist || '').toLowerCase();
      let score = 0;

      if (titleLower === qLower) score += 300;
      else if (cleanT === qLower) score += 200;
      else if (cleanT.startsWith(qLower + ' ') || titleLower.startsWith(qLower + ' ')) score += 120;
      else if (cleanT.includes(qLower) || titleLower.includes(qLower)) score += 70;
      else if (qWords.length > 0 && qWords.every(w => cleanT.includes(w) || titleLower.includes(w))) score += 55;
      else if (qWords.some(w => cleanT.includes(w))) score += 20;

      if (artistLower === qLower) score += 250;
      else if (artistLower.startsWith(qLower + ',') || artistLower.startsWith(qLower + ' &') || artistLower.startsWith(qLower + ' ft') || artistLower.startsWith(qLower + ' x ')) score += 240;
      else if (artistLower.includes(qLower)) score += 180;
      else if (qWords.length > 0 && qWords.every(w => artistLower.includes(w))) score += 120;
      else if (qWords.some(w => artistLower.includes(w))) score += 40;

      if (qIsArtistName) {
        const anyWordInArtist = qWords.some(w => artistLower.includes(w));
        if (!anyWordInArtist) score -= 150;
      }

      if (!isExplicitInstrumental) {
        if (/instrumental|karaoke|cover|remake|orchestra/i.test(titleLower) || /instrumental/i.test(t.album || '')) score -= 60;
      }

      if (t.source === 'saavn') score += 15;

      const playCount = Number(t.playCount) || 0;
      if (playCount > 10000000) score += 80;
      else if (playCount > 1000000) score += 40;
      else if (playCount > 100000) score += 20;
      else if (playCount > 10000) score += 5;

      return score;
    };

    normalized.sort((a, b) => scoreTrack(b) - scoreTrack(a));

    const seenKeys = new Set();
    const seenIds = new Set();
    const finalTracks = [];

    for (const t of normalized) {
      const vid = t.videoId || t.video_id || t.id;
      const cleanTitle = (t.title || '').toLowerCase().replace(/\s*\([^)]*\)/g, '').replace(/[^a-z0-9]/g, '').trim();
      const cleanArtist = (t.artist || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
      const dedupeKey = `${cleanTitle}_${cleanArtist}`;
      if (!vid || seenIds.has(vid)) continue;
      if (dedupeKey && seenKeys.has(dedupeKey)) continue;
      seenIds.add(vid);
      if (dedupeKey) seenKeys.add(dedupeKey);
      finalTracks.push(t);
      if (finalTracks.length >= limit) break;
    }

    console.log(`[saavn-search] q="${query}" final=${finalTracks.length} total=${totalCount} source=${source}`);

    res.json({
      query,
      total: totalCount,
      count: finalTracks.length,
      offset,
      page,
      results: finalTracks,
      tracks: finalTracks,
      has_more: normalized.length >= 10 || finalTracks.length >= 15
    });
  } catch (err) {
    console.error('[saavn-search] Error:', err.message, err.stack);
    res.status(500).json({ error: 'Search failed', details: err.message, results: [], tracks: [] });
  }
});

// 2. Saavn Stream URL Resolution Route (with in-memory cache & YouTube fallback)
app.get(['/api/stream/saavn/:id', '/stream/saavn/:id'], async (req, res) => {
  const rawId = req.params.id ? String(req.params.id).replace(/^saavn_/, '').trim() : '';
  if (!rawId) {
    return res.status(400).json({ error: 'Song ID required' });
  }

  // Check cache first
  const cached = saavnStreamCache.get(rawId);
  if (cached && cached.expiry > Date.now()) {
    return res.json(cached.data);
  }

  // If rawId is an 11-char YouTube video ID, resolve directly via yt-dlp
  if (/^[a-zA-Z0-9_-]{11}$/.test(rawId)) {
    try {
      const ytStream = await extractAudioStream(rawId);
      if (ytStream && ytStream.url) {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const host = req.get('host') || `localhost:${PORT}`;
        const responseData = {
          id: rawId,
          videoId: rawId,
          title: ytStream.title || 'Audio Track',
          artist: ytStream.artist || 'Artist',
          thumbnail: ytStream.thumbnail || `https://i.ytimg.com/vi/${rawId}/hqdefault.jpg`,
          artwork_url: ytStream.thumbnail || `https://i.ytimg.com/vi/${rawId}/hqdefault.jpg`,
          duration: ytStream.duration,
          duration_seconds: ytStream.duration,
          stream_url: ytStream.url,
          proxy_url: `${protocol}://${host}/stream/${rawId}/audio`,
          bitrate: '320kbps',
          contentType: ytStream.contentType || 'audio/mp4',
          source: 'youtube'
        };
        saavnStreamCache.set(rawId, { data: responseData, expiry: Date.now() + SAAVN_STREAM_CACHE_TTL });
        return res.json(responseData);
      }
    } catch (err) {
      console.warn(`Direct YouTube stream extraction for ${rawId} failed:`, err.message);
    }
  }

  let resolvedSong = null;
  try {
    const data = await fetchSaavnJson(`/songs/${encodeURIComponent(rawId)}`);
    if (data && data.success && data.data) {
      const song = Array.isArray(data.data) ? data.data[0] : data.data;
      if (song) {
        resolvedSong = song;
        let streamUrl = null;
        let bitrate = '320kbps';
        if (Array.isArray(song.downloadUrl) && song.downloadUrl.length > 0) {
          const sorted = [...song.downloadUrl].sort((a, b) => (parseInt(b.quality, 10) || 0) - (parseInt(a.quality, 10) || 0));
          streamUrl = sorted[0]?.url || null;
          bitrate = sorted[0]?.quality || '320kbps';
        }

        if (streamUrl) {
          const normalized = normalizeSaavnSong(song, streamUrl);
          const responseData = {
            ...normalized,
            stream_url: streamUrl,
            bitrate,
            contentType: 'audio/mp4'
          };

          // Cache the result
          saavnStreamCache.set(rawId, { data: responseData, expiry: Date.now() + SAAVN_STREAM_CACHE_TTL });

          // Cache high-res artwork
          if (normalized?.artwork_url) {
            cacheTrackImage(rawId, normalized.artwork_url).catch(() => {});
            trackImageCache.set(rawId, { image: normalized.artwork_url, expiry: Date.now() + TRACK_IMAGE_CACHE_TTL });
          }

          return res.json(responseData);
        }
      }
    }
  } catch (err) {
    console.warn(`Saavn stream resolution failed for ${rawId}:`, err.message);
  }

  res.status(502).json({ error: 'Failed to resolve audio stream', id: rawId });
});

// 2b. High-Res Track Image Route with Firebase RTDB Caching & Staytup-API
app.get(['/api/track-image/:id', '/track-image/:id'], async (req, res) => {
  const rawId = req.params.id ? String(req.params.id).replace(/^saavn_/, '').trim() : '';
  if (!rawId) {
    return res.status(400).json({ error: 'Song ID required' });
  }

  // 1. Check in-memory cache
  const memCached = trackImageCache.get(rawId);
  if (memCached && memCached.expiry > Date.now() && memCached.image) {
    return res.json({ success: true, videoId: rawId, image: memCached.image, source: 'memory' });
  }

  // 2. Check Firebase RTDB (persisted across restarts and instances)
  try {
    const dbImage = await getCachedTrackImage(rawId);
    if (dbImage) {
      const highRes = String(dbImage).replace(/(?:50x50|150x150)\.jpg/i, '500x500.jpg');
      trackImageCache.set(rawId, { image: highRes, expiry: Date.now() + TRACK_IMAGE_CACHE_TTL });
      return res.json({ success: true, videoId: rawId, image: highRes, source: 'database' });
    }
  } catch (dbErr) {
    console.warn(`[RTDB] Error checking track image for ${rawId}:`, dbErr.message);
  }

  // 3. Query Staytup API and Saavn providers
  try {
    let resolvedImage = null;
    const providers = [
      `https://staytup-api.onrender.com/api/songs/${encodeURIComponent(rawId)}`
    ];

    for (const pUrl of providers) {
      try {
        const fetchRes = await fetch(pUrl, { signal: AbortSignal.timeout(6000) });
        if (fetchRes.ok) {
          const sData = await fetchRes.json();
          const song = Array.isArray(sData?.data) ? sData.data[0] : sData?.data;
          if (song) {
            if (Array.isArray(song.image) && song.image.length > 0) {
              const fiveHundred = song.image.find(img => img.quality === '500x500');
              resolvedImage = fiveHundred?.url || song.image[song.image.length - 1]?.url || '';
            } else if (typeof song.image === 'string') {
              resolvedImage = song.image;
            }
            if (resolvedImage) break;
          }
        }
      } catch (_) {}
    }

    if (!resolvedImage) {
      try {
        const data = await fetchSaavnJson(`/songs/${encodeURIComponent(rawId)}`);
        const song = Array.isArray(data?.data) ? data.data[0] : data?.data;
        if (song) {
          if (Array.isArray(song.image) && song.image.length > 0) {
            const fiveHundred = song.image.find(img => img.quality === '500x500');
            resolvedImage = fiveHundred?.url || song.image[song.image.length - 1]?.url || '';
          } else if (typeof song.image === 'string') {
            resolvedImage = song.image;
          }
        }
      } catch (_) {}
    }

    // 4. If not resolved by direct ID, search Staytup API by track title & artist
    if (!resolvedImage) {
      let queryToSearch = (req.query.q || req.query.query || "").trim();
      if (!queryToSearch && (req.query.title || req.query.artist)) {
        queryToSearch = `${req.query.title || ""} ${req.query.artist || ""}`.trim();
      }

      // If still no title and rawId is an 11-char YouTube ID, fetch title via oEmbed
      if (!queryToSearch && rawId.length === 11) {
        try {
          const oeRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${rawId}&format=json`, { signal: AbortSignal.timeout(3500) });
          if (oeRes.ok) {
            const oeData = await oeRes.json();
            if (oeData?.title) {
              queryToSearch = cleanVideoTitle(oeData.title);
            }
          }
        } catch (_) {}
      }

      if (queryToSearch) {
        const searchUrls = [
          `https://staytup-api.onrender.com/api/search/songs?query=${encodeURIComponent(queryToSearch)}&limit=1`
        ];
        for (const sUrl of searchUrls) {
          try {
            const sRes = await fetch(sUrl, { signal: AbortSignal.timeout(6000) });
            if (sRes.ok) {
              const sData = await sRes.json();
              const results = sData?.data?.results || (Array.isArray(sData?.data) ? sData.data : []);
              if (results && results.length > 0) {
                const song = results[0];
                if (Array.isArray(song.image) && song.image.length > 0) {
                  const fiveHundred = song.image.find((img) => img.quality === "500x500");
                  resolvedImage = fiveHundred?.url || song.image[song.image.length - 1]?.url || "";
                } else if (typeof song.image === "string") {
                  resolvedImage = song.image;
                }
                if (resolvedImage) break;
              }
            }
          } catch (_) {}
        }
      }
    }

    if (resolvedImage) {
      const highRes = String(resolvedImage).replace(/(?:50x50|150x150)\.jpg/i, '500x500.jpg');
      // Store in Firebase RTDB so future requests load instantly from DB without calling API
      await cacheTrackImage(rawId, highRes);
      // Cache in memory
      trackImageCache.set(rawId, { image: highRes, expiry: Date.now() + TRACK_IMAGE_CACHE_TTL });
      return res.json({ success: true, videoId: rawId, image: highRes, source: 'api' });
    }

    return res.status(404).json({ error: 'Artwork not found', videoId: rawId });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to resolve artwork', details: err.message, videoId: rawId });
  }
});

function isCompilationAlbum(albumName, songTitle) {
  if (!albumName) return false;
  const a = albumName.toLowerCase().trim();
  const t = (songTitle || '').toLowerCase().trim();
  if (a.includes(t) || t.includes(a)) return false;
  const keywords = [
    'bollywood hits',
    'bollywood top hits',
    'world music day',
    'best of',
    'hits of',
    'greatest hits',
    'superhits',
    'top hits',
    'collection',
    'mashup'
  ];
  return keywords.some(kw => a.includes(kw));
}

// 3. Saavn Home / Trending Route
app.get(['/api/home/saavn', '/home/saavn'], async (req, res) => {
  try {
    const playlistSections = [
      { id: 'trending_now', title: 'Trending Now', playlistId: '47599074', fallbackQ: 'Trending Hindi Hits' },
      { id: 'bollywood_hits', title: 'Bollywood Top Hits', playlistId: '1134543272', fallbackQ: 'Bollywood Superhits' },
      { id: 'romantic_melodies', title: 'Romantic Melodies', playlistId: '1302033575', fallbackQ: 'Bollywood Romantic Melodies' },
      { id: 'punjabi_vibes', title: 'Punjabi Blockbusters', playlistId: '1134543511', fallbackQ: 'Punjabi Top Hits' },
      { id: 'new_releases', title: 'Fresh New Releases', playlistId: '6689255', fallbackQ: 'Latest Hindi Songs' },
      { id: 'indie_pop', title: 'Indie Pop Hits', playlistId: '1219169738', fallbackQ: 'Indian Indie' },
    ];

    const sections = await Promise.all(
      playlistSections.map(async (sec) => {
        let tracks = [];
        try {
          // 1. Fetch from official curated playlist (guarantees official single/movie cover art)
          const data = await fetchSaavnJson(`/playlists?id=${sec.playlistId}&limit=25`);
          const raw = data?.data?.songs || [];
          const seen = new Set();
          for (const s of raw) {
            const album = s.album?.name || s.album || '';
            const title = (s.name || s.title || '').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
            const normTitle = title.toLowerCase().replace(/\s*\(.*?\)/g, '').trim();
            if (seen.has(normTitle)) continue;
            if (isCompilationAlbum(album, title)) continue;
            seen.add(normTitle);
            const normalized = normalizeSaavnSong(s, null);
            if (normalized) tracks.push(normalized);
            if (tracks.length >= 15) break;
          }
        } catch (e) {
          console.warn(`[Saavn Feed] Playlist ${sec.playlistId} failed, trying search fallback:`, e.message);
        }

        // 2. Fallback search if playlist was unavailable or returned few tracks
        if (tracks.length < 10) {
          try {
            const data = await fetchSaavnJson(`/search/songs?query=${encodeURIComponent(sec.fallbackQ)}&limit=30`);
            const raw = data?.data?.results || [];
            const seen = new Set(tracks.map(t => (t.title || '').toLowerCase().replace(/\s*\(.*?\)/g, '').trim()));
            for (const s of raw) {
              const album = s.album?.name || s.album || '';
              const title = (s.name || s.title || '').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
              const normTitle = title.toLowerCase().replace(/\s*\(.*?\)/g, '').trim();
              if (seen.has(normTitle)) continue;
              if (isCompilationAlbum(album, title)) continue;
              seen.add(normTitle);
              const normalized = normalizeSaavnSong(s, null);
              if (normalized) tracks.push(normalized);
              if (tracks.length >= 15) break;
            }
          } catch (_) {}
        }

        return {
          id: sec.id,
          title: sec.title,
          tracks,
          items: tracks
        };
      })
    );

    const validSections = sections.filter(s => s.tracks.length > 0);
    const allTracks = validSections.flatMap(s => s.tracks);

    res.json({
      timestamp: new Date().toISOString(),
      trending: allTracks.slice(0, 20),
      sections: validSections,
      count: allTracks.length
    });
  } catch (err) {
    console.error('Saavn home feed error:', err.message);
    res.status(500).json({ error: 'Failed to generate Saavn home feed', details: err.message, sections: [] });
  }
});

// 4. Personalized feed — deprecated mood sections removed, return clean empty state
app.get(['/api/personalized', '/api/personalized/:userId', '/personalized', '/personalized/:userId'], (req, res) => {
  res.json({ sections: [], personalized: false });
});

// ─── 3. Search YouTube music videos (/api/search and /search) ─────────────────
app.get(['/api/search', '/search'], async (req, res) => {
  try {
    const query = req.query.q ? String(req.query.q).trim() : (req.query.query ? String(req.query.query).trim() : '');
    if (!query) {
      return res.json({ query: '', count: 0, results: [], tracks: [], has_more: false });
    }

    const results = await scrapeYouTubeSearch(query);
    // Filter out tracks with invalid thumbnails
    const validResults = await filterValidTracks(results);
    res.json({
      query,
      count: validResults.length,
      results: validResults,
      tracks: validResults,
      has_more: validResults.length >= 20
    });
  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({ query: '', count: 0, results: [], tracks: [], error: error.message });
  }
});

// ─── 3b. Import YouTube Playlist (/api/import-playlist and /import-playlist) ───

function extractPlaylistId(input) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();
  if (/^[a-zA-Z0-9_-]{10,}$/.test(str) && (str.startsWith('PL') || str.startsWith('OLAK') || str.startsWith('RD') || str.startsWith('UU') || str.startsWith('FL') || str.startsWith('TL'))) {
    return str;
  }
  const match = str.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

function cleanVideoTitle(rawTitle) {
  if (!rawTitle) return '';
  return rawTitle
    .replace(/\s*\((Official\s*(Music\s*)?Video|Lyrics|Lyric\s*Video|Audio|Official\s*Audio|4K|HD|HQ)\)/gi, '')
    .replace(/\s*\[(Official\s*(Music\s*)?Video|Lyrics|Lyric\s*Video|Audio|Official\s*Audio|4K|HD|HQ)\]/gi, '')
    .trim();
}

async function scrapeYouTubePlaylist(playlistUrlOrId) {
  const listId = extractPlaylistId(playlistUrlOrId);
  if (!listId) {
    throw new Error('Invalid YouTube playlist URL or ID');
  }

  const url = `https://www.youtube.com/playlist?list=${listId}`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!resp.ok) {
    throw new Error(`YouTube returned status ${resp.status}`);
  }

  const html = await resp.text();
  const match = html.match(/ytInitialData\s*=\s*({.+?});<\/script>/);
  if (!match) {
    throw new Error('Could not parse playlist data from YouTube');
  }

  const data = JSON.parse(match[1]);

  if (Array.isArray(data?.alerts)) {
    for (const alert of data.alerts) {
      if (alert.alertRenderer?.type === 'ERROR') {
        const msg = alert.alertRenderer?.text?.runs?.map((r) => r.text).join('') || 'Playlist does not exist or is private';
        throw new Error(msg);
      }
    }
  }

  const rawTitle =
    data?.metadata?.playlistMetadataRenderer?.title ||
    data?.header?.playlistHeaderRenderer?.title?.simpleText ||
    data?.header?.pageHeaderRenderer?.pageTitle ||
    'Imported Playlist';

  const rawDesc =
    data?.metadata?.playlistMetadataRenderer?.description ||
    data?.header?.playlistHeaderRenderer?.descriptionText?.simpleText ||
    '';

  const tracks = [];
  const seenIds = new Set();

  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
      return;
    }

    // Classic format: playlistVideoRenderer
    if (obj.playlistVideoRenderer) {
      const v = obj.playlistVideoRenderer;
      const id = v.videoId;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        const rawT = v.title?.runs?.map((r) => r.text).join('') || v.title?.simpleText || '';
        const rawA = v.shortBylineText?.runs?.map((r) => r.text).join('') || '';
        const thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
        const durSec = parseInt(v.lengthSeconds, 10) || 0;

        let artist = rawA;
        let title = cleanVideoTitle(rawT);
        if ((!artist || artist.toLowerCase().includes('topic')) && title.includes(' - ')) {
          const parts = title.split(' - ');
          artist = parts[0].trim();
          title = parts.slice(1).join(' - ').trim();
        }

        tracks.push({
          id,
          videoId: id,
          video_id: id,
          title,
          artist: artist || 'YouTube Artist',
          artwork_url: thumb,
          thumbnail: thumb,
          duration: durSec,
          duration_seconds: durSec,
        });
      }
    }

    // Modern format: lockupViewModel
    if (obj.lockupViewModel && obj.lockupViewModel.contentId) {
      const v = obj.lockupViewModel;
      const id = v.contentId;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        const meta = v.metadata?.lockupMetadataViewModel;
        const rawT = meta?.title?.content || '';
        const rows = meta?.metadata?.contentMetadataViewModel?.metadataRows || meta?.metadataRows || [];
        const rawA = rows?.[0]?.metadataParts?.[0]?.text?.content || '';
        const thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

        let artist = rawA;
        let title = cleanVideoTitle(rawT);
        if ((!artist || artist.toLowerCase().includes('topic')) && title.includes(' - ')) {
          const parts = title.split(' - ');
          artist = parts[0].trim();
          title = parts.slice(1).join(' - ').trim();
        }

        tracks.push({
          id,
          videoId: id,
          video_id: id,
          title,
          artist: artist || 'YouTube Artist',
          artwork_url: thumb,
          thumbnail: thumb,
        });
      }
    }

    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === 'object') walk(obj[k]);
    }
  }

  walk(data);

  const coverUrl = tracks[0]?.artwork_url || '';

  return {
    playlistId: listId,
    title: rawTitle,
    description: rawDesc,
    cover_url: coverUrl,
    preview_artwork: coverUrl,
    count: tracks.length,
    tracks,
  };
}

function isSpotifyPlaylist(input) {
  if (!input || typeof input !== 'string') return false;
  return input.includes('spotify.com/playlist/') || input.includes('spotify:playlist:');
}

function extractSpotifyPlaylistId(input) {
  if (!input || typeof input !== 'string') return null;
  const match = input.match(/playlist[\/:]([a-zA-Z0-9]+)/i);
  return match ? match[1] : null;
}

async function scrapeSpotifyPlaylist(urlOrId) {
  const playlistId = extractSpotifyPlaylistId(urlOrId);
  if (!playlistId) {
    throw new Error('Invalid Spotify playlist URL or ID');
  }

  // 1. Try Spotify embed page (fast, public, provides full tracklist up to 100 tracks without auth)
  try {
    const embedResp = await fetch(`https://open.spotify.com/embed/playlist/${playlistId}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (embedResp.ok) {
      const html = await embedResp.text();
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
      if (nextDataMatch) {
        const json = JSON.parse(nextDataMatch[1]);
        const entity = json.props?.pageProps?.state?.data?.entity;
        const trackList = entity?.trackList || [];

        if (trackList.length > 0) {
          const title = entity?.title || entity?.name || 'Spotify Playlist';
          const coverUrl = entity?.coverArt?.sources?.[0]?.url || '';
          const tracks = trackList.map((t, idx) => {
            const trackTitle = cleanVideoTitle(t.title || '');
            const artist = (t.subtitle || '').replace(/[\u00A0\u200B\u200C\u200D]/g, ' ').trim();
            const durSec = Math.round((t.duration || 0) / 1000);
            return {
              id: t.id || t.uid || `sp_${idx}`,
              videoId: `sp_${idx}`,
              video_id: `sp_${idx}`,
              title: trackTitle,
              artist: artist || 'Spotify Artist',
              artwork_url: coverUrl,
              thumbnail: coverUrl,
              duration: durSec,
              duration_seconds: durSec,
            };
          });

          return {
            platform: 'spotify',
            playlistId,
            title,
            description: entity?.subtitle || '',
            cover_url: coverUrl,
            preview_artwork: coverUrl,
            count: tracks.length,
            tracks,
          };
        }
      }
    }
  } catch (embedErr) {
    console.warn('Spotify embed parse fallback:', embedErr.message);
  }

  // 2. Fallback: Parse open.spotify.com/playlist/<id> HTML initialState
  const pageResp = await fetch(`https://open.spotify.com/playlist/${playlistId}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!pageResp.ok) {
    throw new Error(`Spotify returned status ${pageResp.status}`);
  }

  const pageHtml = await pageResp.text();
  const stateMatch = pageHtml.match(/<script id="initialState"[^>]*>([\s\S]*?)<\/script>/i);
  if (!stateMatch) {
    throw new Error('Could not parse playlist information from Spotify');
  }

  const stateJson = JSON.parse(Buffer.from(stateMatch[1].trim(), 'base64').toString('utf-8'));
  const pl = Object.values(stateJson?.entities?.items || {})[0];
  if (!pl) {
    throw new Error('Spotify playlist not found or private');
  }

  const title = pl.name || 'Spotify Playlist';
  const desc = pl.description || '';
  const coverUrl = pl.images?.items?.[0]?.sources?.[0]?.url || '';
  const rawItems = pl.content?.items || [];
  const tracks = [];

  for (let i = 0; i < rawItems.length; i++) {
    const d = rawItems[i]?.itemV2?.data;
    if (d?.name) {
      const trackTitle = cleanVideoTitle(d.name);
      const artists = d.artists?.items?.map((a) => a.profile?.name).filter(Boolean).join(', ') || 'Spotify Artist';
      const durSec = Math.round((d.duration?.totalMilliseconds || 0) / 1000);
      const trackArt = d.albumOfTrack?.coverArt?.sources?.[0]?.url || coverUrl;

      tracks.push({
        id: `sp_${i}`,
        videoId: `sp_${i}`,
        video_id: `sp_${i}`,
        title: trackTitle,
        artist: artists,
        artwork_url: trackArt,
        thumbnail: trackArt,
        duration: durSec,
        duration_seconds: durSec,
      });
    }
  }

  if (tracks.length === 0) {
    throw new Error('No songs found in this Spotify playlist. Ensure it is public.');
  }

  return {
    platform: 'spotify',
    playlistId,
    title,
    description: desc,
    cover_url: coverUrl,
    preview_artwork: coverUrl,
    count: tracks.length,
    tracks,
  };
}

const handleImportPlaylist = async (req, res) => {
  const queryUrl = req.query.url || req.query.list || req.query.link || req.body?.url || req.body?.listId;
  if (!queryUrl) {
    return res.status(400).json({ success: false, error: 'Playlist URL or list ID is required' });
  }

  try {
    let playlistData;
    if (isSpotifyPlaylist(queryUrl)) {
      playlistData = await scrapeSpotifyPlaylist(queryUrl);
    } else {
      playlistData = await scrapeYouTubePlaylist(queryUrl);
    }
    res.json({
      success: true,
      ...playlistData,
    });
  } catch (err) {
    console.error('Import playlist error:', err.message);
    res.status(500).json({ success: false, error: err.message || 'Failed to import playlist' });
  }
};

app.get(['/api/import-playlist', '/import-playlist'], handleImportPlaylist);
app.post(['/api/import-playlist', '/import-playlist'], handleImportPlaylist);

// ─── 4. Stream Metadata Resolution (/stream/:id and /api/stream/:id) ──────────
app.get(['/stream/:id', '/api/stream/:id'], async (req, res) => {
  const videoId = req.params.id;
  if (!videoId || videoId.length < 5) {
    return res.status(400).json({ error: 'Valid YouTube video ID required' });
  }

  try {
    const info = await extractAudioStream(videoId);
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || `localhost:${PORT}`;
    const baseUrl = `${protocol}://${host}`;

    res.json({
      id: info.videoId,
      videoId: info.videoId,
      video_id: info.videoId,
      title: info.title,
      artist: info.artist,
      duration: info.duration,
      duration_seconds: info.duration,
      durationSeconds: info.duration,
      thumbnail: info.thumbnail,
      stream_url: info.url,
      proxy_url: `${baseUrl}/stream/${info.videoId}/audio`,
      contentType: info.contentType,
      source: 'yt-dlp'
    });
  } catch (err) {
    console.error(`[Stream Error] Resolution failed for ${videoId}:`, err.message);
    res.status(502).json({
      error: 'Failed to extract audio stream',
      details: err.message,
      videoId
    });
  }
});

// ─── 5. Audio Streaming Range Proxy (/stream/:id/audio) ───────────────────────
const handleAudioProxy = async (req, res) => {
  const videoId = req.params.id || req.query.id;
  if (!videoId || videoId.length < 5) {
    return res.status(400).json({ error: 'Valid YouTube video ID required' });
  }

  try {
    let streamInfo = await extractAudioStream(videoId);

    const upstreamHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Encoding': 'identity'
    };

    if (req.headers.range) {
      upstreamHeaders['Range'] = req.headers.range;
    }

    let upstreamRes = null;
    try {
      upstreamRes = await fetch(streamInfo.url, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: upstreamHeaders
      });
    } catch (_) {}

    if (!upstreamRes || (!upstreamRes.ok && upstreamRes.status !== 206)) {
      streamCache.delete(videoId);
      streamInfo = await extractAudioStream(videoId);
      upstreamRes = await fetch(streamInfo.url, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: upstreamHeaders
      });
    }

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      throw new Error(`Upstream returned HTTP ${upstreamRes.status}`);
    }

    const contentType = upstreamRes.headers.get('content-type') || streamInfo.contentType || 'audio/webm';
    const contentLength = upstreamRes.headers.get('content-length');
    const contentRange = upstreamRes.headers.get('content-range');
    const acceptRanges = upstreamRes.headers.get('accept-ranges') || 'bytes';

    res.status(upstreamRes.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', acceptRanges);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);

    if (req.method === 'HEAD') {
      return res.end();
    }

    if (upstreamRes.body) {
      const nodeStream = Readable.fromWeb(upstreamRes.body);
      nodeStream.pipe(res);

      nodeStream.on('error', (streamErr) => {
        console.warn(`[Audio Proxy] Pipe error for ${videoId}:`, streamErr.message);
        if (!res.headersSent) res.status(500).end();
      });

      req.on('close', () => {
        nodeStream.destroy();
      });
    } else {
      res.end();
    }
  } catch (err) {
    console.error(`[Audio Proxy Error] Stream failed for ${videoId}:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Audio proxy error', details: err.message });
    }
  }
};

app.get('/stream/:id/audio', handleAudioProxy);
app.head('/stream/:id/audio', handleAudioProxy);
app.get('/stream.php', handleAudioProxy);

// ─── 6. Track Info (YouTube oEmbed lookup) ────────────────────────────────────
app.get(['/api/track-info', '/track-info'], async (req, res) => {
  try {
    const videoId = req.query.v ? String(req.query.v).trim() : (req.query.id ? String(req.query.id).trim() : '');
    if (!videoId) {
      return res.status(400).json({ error: 'videoId required' });
    }

    const resp = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );

    if (!resp.ok) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const data = await resp.json();
    // oEmbed provides thumbnail_url with yt3.googleusercontent.com — use it for best quality
    const thumbUrl = data.thumbnail_url
      || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    res.json({
      id: videoId,
      videoId,
      video_id: videoId,
      title: data.title || 'YouTube Track',
      artist: data.author_name || 'YouTube Music',
      thumbnail: thumbUrl,
      artwork_url: thumbUrl,
      duration: '3:30',
      durationSeconds: 210,
      duration_seconds: 210
    });
  } catch (error) {
    console.error('Track info error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── 7. Lyrics Lookup (LRCLIB) ────────────────────────────────────────────────
app.get(['/api/lyrics', '/lyrics'], async (req, res) => {
  try {
    const title = req.query.title ? String(req.query.title).trim() : '';
    const artist = req.query.artist ? String(req.query.artist).trim() : '';
    const duration = req.query.duration ? Number(req.query.duration) : undefined;

    if (!title) {
      return res.json({ plainLyrics: null, syncedLyrics: null });
    }

    // Clean up title
    const cleanTitle = title
      .replace(/\[.*?\]|\(.*?\)/g, '')
      .replace(/official\s*(music\s*)?video|official\s*audio|lyric\s*video|audio|remastered/gi, '')
      .replace(/ft\..*|feat\..*/gi, '')
      .trim();

    const cleanArtist = artist
      .replace(/ - Topic|VEVO/gi, '')
      .trim();

    // 1. Exact get
    let url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}`;
    if (cleanArtist) url += `&artist_name=${encodeURIComponent(cleanArtist)}`;
    if (duration) url += `&duration=${Math.round(duration)}`;

    let resp = await fetch(url, {
      headers: { 'User-Agent': 'YouTubeMusicWebPlayer/1.0' }
    });

    if (resp.ok) {
      const data = await resp.json();
      const plain = data.plainLyrics || null;
      const synced = data.syncedLyrics || null;
      return res.json({
        plainLyrics: plain,
        syncedLyrics: synced,
        plain_lyrics: plain,
        synced_lyrics: synced,
        instrumental: Boolean(data.instrumental),
        has_lyrics: Boolean(plain || synced)
      });
    }

    // 2. Search fallback
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanArtist} ${cleanTitle}`.trim())}`;
    const searchResp = await fetch(searchUrl, {
      headers: { 'User-Agent': 'YouTubeMusicWebPlayer/1.0' }
    });

    if (searchResp.ok) {
      const list = await searchResp.json();
      if (Array.isArray(list) && list.length > 0) {
        const best = list[0];
        const plain = best.plainLyrics || null;
        const synced = best.syncedLyrics || null;
        return res.json({
          plainLyrics: plain,
          syncedLyrics: synced,
          plain_lyrics: plain,
          synced_lyrics: synced,
          instrumental: Boolean(best.instrumental),
          has_lyrics: Boolean(plain || synced)
        });
      }
    }

    res.json({ plainLyrics: null, syncedLyrics: null, plain_lyrics: null, synced_lyrics: null, has_lyrics: false });
  } catch (error) {
    console.error('Lyrics error:', error.message);
    res.json({ plainLyrics: null, syncedLyrics: null, plain_lyrics: null, synced_lyrics: null, has_lyrics: false });
  }
});

// Helper: Deduplicate tracks by videoId and avoid duplicate spam thumbnails across sections
function dedupeTracks(allSections) {
  const seen = new Set();
  const seenThumbnails = new Set();
  return allSections.map(section => {
    const unique = (section.tracks || []).filter(t => {
      const id = t.videoId || t.video_id;
      if (!id || seen.has(id)) return false;
      const thumb = t.artwork_url || t.thumbnail;
      if (thumb && seenThumbnails.has(thumb)) {
        return false; // Skip duplicate album art (no spam channel repeat thumbnails)
      }
      seen.add(id);
      if (thumb) seenThumbnails.add(thumb);
      return true;
    });
    return { ...section, tracks: unique };
  }).filter(s => s.tracks.length > 0);
}

// Helper: Validate a thumbnail URL exists
async function validateThumbnail(videoId, thumbnailUrl) {
  try {
    if (thumbnailUrl && (thumbnailUrl.includes('saavncdn.com') || thumbnailUrl.includes('googleusercontent.com') || thumbnailUrl.includes('pinimg.com'))) {
      return true;
    }
    const resp = await fetch(`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// Helper: Filter tracks to only include those with valid thumbnails
async function filterValidTracks(tracks) {
  const validations = await Promise.allSettled(
    tracks.map(async (track) => {
      const id = track.videoId || track.video_id;
      if (!id) return null;
      const valid = await validateThumbnail(id, track.thumbnail || track.artwork_url);
      return valid ? track : null;
    })
  );
  return validations
    .map((r) => (r.status === 'fulfilled' ? r.value : null))
    .filter(Boolean);
}

// Helper: Fetch verified category tracks using Staytup API first (for authentic 500x500 album art) with clean YouTube fallback
async function fetchHomeCategoryTracks(saavnQuery, ytFallbackQuery, limit = 15) {
  if (saavnQuery) {
    try {
      const data = await fetchSaavnJson(`/search/songs?query=${encodeURIComponent(saavnQuery)}&limit=${limit}`);
      const raw = data?.data?.results || (Array.isArray(data?.data) ? data.data : []);
      if (Array.isArray(raw) && raw.length > 0) {
        const normalized = raw.map(s => normalizeSaavnSong(s, null)).filter(Boolean);
        if (normalized.length >= 4) {
          return normalized.slice(0, limit);
        }
      }
    } catch (_) {}
  }

  if (ytFallbackQuery) {
    try {
      const yt = await scrapeYouTubeSearch(ytFallbackQuery);
      const seenThumbs = new Set();
      const cleanYt = [];
      for (const t of (yt || [])) {
        const thumb = t.artwork_url || t.thumbnail || '';
        if (thumb && seenThumbs.has(thumb)) continue;
        if (/jukebox|full album|top 10|top 20|compilation/i.test(t.title || '')) continue;
        if (thumb) seenThumbs.add(thumb);
        cleanYt.push(t);
        if (cleanYt.length >= limit) break;
      }
      return cleanYt;
    } catch (_) {}
  }

  return [];
}

// ─── 8. Daily Home Feed — India-focused rich sections ────────────────────────
app.get(['/home', '/home/:userId', '/api/home'], async (req, res) => {
  // If the browser requested HTML (user typed URL or refreshed in browser), serve the SPA app!
  if (req.accepts('html') && !req.accepts('json') && !req.path.startsWith('/api')) {
    const distIndex = path.join(process.cwd(), 'dist', 'index.html');
    if (fs.existsSync(distIndex)) return res.sendFile(distIndex);
    const pubIndex = path.join(process.cwd(), 'public', 'index.html');
    if (fs.existsSync(pubIndex)) return res.sendFile(pubIndex);
  }

  try {
    const now = new Date();
    const timestamp = now.toISOString();

    // Parallel fetch: each category uses Staytup API first (for genuine 500x500 album art) with clean YouTube fallback
    const [
      hindiTop,
      newReleases,
      romanticVibes,
      bollywoodBlockbusters,
      punjabiHits,
      tamilHits,
      teluguHits,
      southIndianMix,
      englishIndia,
      desiHipHop,
      indiePopIndia,
      partyAnthem,
      lofiChillHindi,
      devotional,
      retroClassics,
      indieViral,
      romanticEnglish,
      workoutEnergy,
      lateNightChill
    ] = await Promise.allSettled([
      fetchHomeCategoryTracks('Top Hindi Songs Latest', 'top Hindi songs latest 2025 2026', 15),
      fetchFreshNewReleases(),
      fetchHomeCategoryTracks('Romantic Hindi Songs', 'top Bollywood romantic melodies Hindi songs', 15),
      fetchHomeCategoryTracks('Latest Bollywood Songs', 'Bollywood blockbuster hit songs', 15),
      fetchHomeCategoryTracks('Punjabi Hits Blockbusters', 'Punjabi hit songs', 15),
      fetchHomeCategoryTracks('Top Tamil Hits', 'Tamil hit songs latest', 15),
      fetchHomeCategoryTracks('Top Telugu Hits', 'Telugu hit songs latest', 15),
      fetchHomeCategoryTracks('South Indian Top Hits', 'Malayalam Kannada Marathi hit songs', 15),
      fetchHomeCategoryTracks('Top English Pop Hits', 'top English pop songs', 15),
      fetchHomeCategoryTracks('Hindi Rap', 'desi hip hop rap Indian', 15),
      fetchHomeCategoryTracks('Indie Pop Hindi', 'Indian indie pop songs', 15),
      fetchHomeCategoryTracks('Bollywood Dance Hits', 'party anthem Bollywood Hindi', 15),
      fetchHomeCategoryTracks('Hindi Lofi', 'lofi chill Hindi songs study relax', 15),
      fetchHomeCategoryTracks('Popular Devotional Bhajans', 'devotional spiritual songs Hindu bhajan', 15),
      fetchHomeCategoryTracks('Evergreen Hindi Songs', 'retro Bollywood classic songs evergreen', 15),
      fetchHomeCategoryTracks('Indian Indie', 'Indian indie songs', 15),
      fetchHomeCategoryTracks('English Love Songs', 'romantic English songs love', 15),
      fetchHomeCategoryTracks('Workout Gym Motivation Beats', 'workout gym motivation Indian English songs', 12),
      fetchHomeCategoryTracks('Late Night Chill Vibes', 'late night chill Hindi English songs', 12)
    ]);

    const get = (r) => r.status === 'fulfilled' ? r.value : [];

    const allSections = [
      { id: 'top_hindi', title: 'Top Hindi Songs', language: 'Hindi', genre: 'bollywood', tracks: get(hindiTop) },
      { id: 'new_releases', title: 'Fresh New Releases', language: 'Hindi', genre: 'releases', tracks: get(newReleases) },
      { id: 'romantic_melodies', title: 'Romantic Melodies', language: 'Hindi', genre: 'romantic', tracks: get(romanticVibes) },
      { id: 'bollywood_blockbusters', title: 'Bollywood Blockbusters', language: 'Hindi', genre: 'bollywood', tracks: get(bollywoodBlockbusters) },
      { id: 'punjabi_bangers', title: 'Punjabi Bangers', language: 'Punjabi', genre: 'punjabi', tracks: get(punjabiHits) },
      { id: 'indie_pop', title: 'Indie Pop India', language: 'Hindi', genre: 'indie', tracks: get(indiePopIndia) },
      { id: 'desi_hip_hop', title: 'Desi Hip Hop & Rap', language: 'Hindi', genre: 'hiphop', tracks: get(desiHipHop) },
      { id: 'party_anthems', title: 'Party Anthems', language: 'Hindi', genre: 'party', tracks: get(partyAnthem) },
      { id: 'lofi_chill_hindi', title: 'Lofi Chill Beats', language: 'Hindi', genre: 'lofi', tracks: get(lofiChillHindi) },
      { id: 'tamil_hits', title: 'Tamil Hits', language: 'Tamil', genre: 'regional', tracks: get(tamilHits) },
      { id: 'telugu_hits', title: 'Telugu Hits', language: 'Telugu', genre: 'regional', tracks: get(teluguHits) },
      { id: 'south_indian_mix', title: 'South Indian Mix', language: 'South Indian', genre: 'regional', tracks: get(southIndianMix) },
      { id: 'english_india', title: 'Top English Hits', language: 'English', genre: 'pop', tracks: get(englishIndia) },
      { id: 'romantic_english', title: 'Romantic English Songs', language: 'English', genre: 'romantic', tracks: get(romanticEnglish) },
      { id: 'indie_viral', title: 'Indie & Viral', language: 'Hindi', genre: 'indie', tracks: get(indieViral) },
      { id: 'devotional', title: 'Devotional & Spiritual', language: 'Hindi', genre: 'devotional', tracks: get(devotional) },
      { id: 'retro_classics', title: 'Retro Classics', language: 'Hindi', genre: 'retro', tracks: get(retroClassics) },
    ];

    // Deduplicate across all sections
    const sections = dedupeTracks(allSections);

    // Validate thumbnails in parallel for all sections (filter out invalid video IDs)
    const validatedSections = await Promise.allSettled(
      sections.map(async (section) => {
        const validTracks = await filterValidTracks(section.tracks);
        return { ...section, tracks: validTracks };
      })
    );
    const validSections = validatedSections
      .map((r) => (r.status === 'fulfilled' ? r.value : null))
      .filter((s) => s && s.tracks.length > 0);

    const payload = {
      sections: validSections,
      trending: validSections.find(s => s.id === 'top_hindi')?.tracks || validSections[0]?.tracks || [],
      recommended: validSections.find(s => s.id === 'top_hindi')?.tracks || [],
      freshPicks: validSections.find(s => s.id === 'new_releases')?.tracks || [],
      moods: [],
      generated_at: timestamp,
      total_sections: sections.length,
    };

    // Upload & persist fresh feed to Firebase RTDB asynchronously
    saveTrendingFeed({
      ...payload,
      lastUpdated: timestamp,
    }).catch((err) => console.warn('Failed to upload feed to RTDB:', err.message));

    res.json(payload);
  } catch (err) {
    console.error('Home feed error:', err.message);
    res.json({ sections: [], trending: [], recommended: [], freshPicks: [], moods: [] });
  }
});

// ─── 8b. Personalized For You Feed ─────────────────────────────────────────────
// Extracts listening patterns from user history + liked songs + trending,
// then builds smart search queries to discover new tracks tailored to them.
const personalizedCache = new Map();
const PERSONALIZED_CACHE_TTL = 45 * 60 * 1000; // 45 minutes

function extractArtistsFromTracks(tracks) {
  const artistCounts = {};
  for (const t of tracks) {
    const a = (t.artist || '').trim();
    if (!a || a.length < 2) continue;
    const key = a.toLowerCase().replace(/\s+/g, ' ');
    artistCounts[key] = (artistCounts[key] || 0) + 1;
  }
  return Object.entries(artistCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
}

function extractKeywordsFromTitles(tracks) {
  const words = {};
  const skip = new Set([
    'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'it',
    'my', 'me', 'you', 'we', 'he', 'she', 'they', 'this', 'that', 'with', 'from',
    'official', 'video', 'audio', 'song', 'music', 'lyric', 'lyrics', 'hd', '4k',
    'feat', 'ft', 'remix', 'live', 'version', '2024', '2025', '2026',
  ]);
  for (const t of tracks) {
    const title = (t.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, '');
    for (const w of title.split(/\s+/)) {
      if (w.length > 2 && !skip.has(w) && !/^\d+$/.test(w)) {
        words[w] = (words[w] || 0) + 1;
      }
    }
  }
  return Object.entries(words)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

function getMoodFromTime() {
  const hour = new Date().getUTCHours();
  const istHour = (hour + 5) % 24;
  if (istHour >= 5 && istHour < 9) return { mood: 'morning', label: 'Good Morning', querySuffix: 'upbeat morning energy' };
  if (istHour >= 9 && istHour < 12) return { mood: 'workday', label: 'Focus Mode', querySuffix: 'chill focus study' };
  if (istHour >= 12 && istHour < 17) return { mood: 'afternoon', label: 'Afternoon Vibes', querySuffix: 'vibes upbeat catchy' };
  if (istHour >= 17 && istHour < 21) return { mood: 'evening', label: 'Evening Picks', querySuffix: 'evening chill melodic' };
  return { mood: 'night', label: 'Late Night', querySuffix: 'lofi late night chill' };
}

app.get(['/api/personalized/:userId', '/personalized/:userId'], async (req, res) => {
  try {
    const userId = req.params.userId || 'guest';
    const cacheKey = `personalized_${userId}`;

    const cached = personalizedCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.data);
    }

    const listeningData = await getUserListeningData(userId);
    const recentTracks = listeningData.recent || [];
    const likedTracks = listeningData.liked || [];
    const allUserTracks = [...recentTracks, ...likedTracks];
    const appTrendingTracks = await getAppTrendingTracks(20);

    const sections = [];

    if (allUserTracks.length > 0) {
      const topArtists = extractArtistsFromTracks(allUserTracks);
      const keywords = extractKeywordsFromTitles(allUserTracks);

      const { mood, label, querySuffix } = getMoodFromTime();

      const searchQueries = [];

      if (topArtists.length > 0) {
        const top3 = topArtists.slice(0, 3);
        for (const artist of top3) {
          searchQueries.push({
            id: `artist_${artist.replace(/\s+/g, '_')}`,
            title: `Because you like ${artist.charAt(0).toUpperCase() + artist.slice(1)}`,
            query: `${artist} latest songs 2025 2026`,
            limit: 12,
          });
        }

        const mixArtists = topArtists.slice(0, 5).join(' ');
        searchQueries.push({
          id: 'your_mix',
          title: 'Your Daily Mix',
          query: `${mixArtists} mix songs 2025 2026`,
          limit: 15,
        });
      }

      if (keywords.length > 0) {
        const kwQuery = keywords.slice(0, 4).join(' ');
        searchQueries.push({
          id: 'mood_match',
          title: `Mood: ${label}`,
          query: `${kwQuery} ${querySuffix} songs 2025 2026`,
          limit: 12,
        });
      }

      if (recentTracks.length > 0) {
        const recentArtists = extractArtistsFromTracks(recentTracks).slice(0, 3);
        if (recentArtists.length > 0) {
          searchQueries.push({
            id: 'recent_similar',
            title: 'More Like What You Play',
            query: `songs like ${recentArtists.join(' ')} 2025 2026`,
            limit: 12,
          });
        }
      }

      if (likedTracks.length > 0) {
        const likedArtists = extractArtistsFromTracks(likedTracks).slice(0, 2);
        if (likedArtists.length > 0) {
          searchQueries.push({
            id: 'discover_new',
            title: 'Discover Something New',
            query: `${likedArtists.join(' ')} similar artists songs 2025 2026`,
            limit: 12,
          });
        }
      }
    } else {
      sections.push({
        id: 'for_you_trending',
        title: 'Popular Right Now',
        description: 'Start listening to get personalized picks',
        tracks: appTrendingTracks,
      });

      const moodData = getMoodFromTime();
      const moodSearches = [
        { id: 'mood_morning', title: 'Morning Energy', query: 'upbeat Hindi English morning songs 2025 2026', limit: 12 },
        { id: 'mood_chill', title: 'Chill Vibes', query: 'lofi chill Hindi English songs 2025', limit: 12 },
        { id: 'mood_party', title: 'Party Mode', query: 'party dance Bollywood English hits 2025 2026', limit: 12 },
      ];

      const moodResults = await Promise.allSettled(
        moodSearches.map(s => scrapeYouTubeSearch(s.query).then(r => r.slice(0, s.limit)))
      );

      for (let i = 0; i < moodSearches.length; i++) {
        const tracks = moodResults[i].status === 'fulfilled' ? moodResults[i].value : [];
        if (tracks.length > 0) {
          sections.push({ ...moodSearches[i], tracks });
        }
      }

      const responseData = { sections, userId, personalized: false, generated_at: new Date().toISOString() };
      personalizedCache.set(cacheKey, { data: responseData, expiresAt: Date.now() + PERSONALIZED_CACHE_TTL });
      return res.json(responseData);
    }

    const results = await Promise.allSettled(
      searchQueries.map(s => scrapeYouTubeSearch(s.query).then(r => r.slice(0, s.limit)))
    );

    const seenIds = new Set();
    for (let i = 0; i < searchQueries.length; i++) {
      const tracks = (results[i].status === 'fulfilled' ? results[i].value : []).filter(t => {
        const id = t.videoId || t.video_id;
        if (!id || seenIds.has(id)) return false;
        const isUserTrack = allUserTracks.some(u => (u.videoId || u.video_id) === id);
        if (isUserTrack) return false;
        seenIds.add(id);
        return true;
      });

      if (tracks.length > 0) {
        sections.push({ ...searchQueries[i], tracks });
      }
    }

    const responseData = { sections, userId, personalized: true, generated_at: new Date().toISOString() };
    personalizedCache.set(cacheKey, { data: responseData, expiresAt: Date.now() + PERSONALIZED_CACHE_TTL });
    res.json(responseData);
  } catch (err) {
    console.error('Personalized feed error:', err.message);
    res.json({ sections: [], personalized: false, generated_at: new Date().toISOString() });
  }
});
// ─── Song Recognition (Shazam / AudD) ─────────────────────────────────────────
app.post(['/api/recognize', '/recognize'], async (req, res) => {
  try {
    const { audio, url: audioUrl } = req.body || {};
    if (!audio && !audioUrl) {
      return res.status(400).json({ status: 'error', message: 'No audio data or URL provided' });
    }

    const token = process.env.AUDD_API_TOKEN || 'test';
    const formParams = new URLSearchParams();
    formParams.append('api_token', token);

    if (audio) {
      const cleanBase64 = audio.includes('base64,') ? audio.split('base64,')[1] : audio;
      formParams.append('audio', cleanBase64);
    } else if (audioUrl) {
      formParams.append('url', audioUrl);
    }

    const auddRes = await fetch('https://api.audd.io/', {
      method: 'POST',
      body: formParams,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const data = await auddRes.json();
    if (data.status === 'success' && data.result) {
      const title = data.result.title || '';
      const artist = data.result.artist || '';

      // Try searching local Saavn catalog for immediate direct stream & artwork
      let matchedTrack = null;
      if (title) {
        try {
          const saavnSearch = await fetchSaavnJson(`/search/songs?query=${encodeURIComponent(`${title} ${artist}`)}&limit=5`);
          if (saavnSearch && saavnSearch.success && Array.isArray(saavnSearch.data?.results) && saavnSearch.data.results.length > 0) {
            matchedTrack = normalizeSaavnSong(saavnSearch.data.results[0], null);
          }
        } catch (_) {}
      }

      return res.json({
        status: 'success',
        result: {
          title,
          artist,
          album: data.result.album || '',
          release_date: data.result.release_date || '',
          song_link: data.result.song_link || '',
          timecode: data.result.timecode || '',
          label: data.result.label || '',
          spotify: data.result.spotify || null,
          track: matchedTrack,
        },
      });
    }

    return res.json({
      status: 'not_found',
      message: data.error?.error_message || 'Song could not be identified',
    });
  } catch (err) {
    console.error('Recognition endpoint error:', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/play-event', async (req, res) => {
  recordFirebasePlay(req.body).catch(() => {});
  res.json({ status: 'ok' });
});

app.get(['/favorites/:userId', '/api/favorites/:userId'], async (req, res) => {
  const userId = req.params.userId || 'guest';
  const favorites = await getFirebaseFavorites(userId);
  res.json({ favorites });
});

app.post(['/favorite', '/api/favorite'], async (req, res) => {
  const userId = req.body.user_id || 'guest';
  const result = await toggleFirebaseFavorite(userId, req.body);
  res.json({ status: 'ok', ...result });
});

app.get(['/playlists', '/api/playlists'], async (req, res) => {
  const userId = (req.query.user_id ? String(req.query.user_id) : 'guest');
  const playlists = await getFirebasePlaylists(userId);
  res.json({ playlists });
});

app.post(['/playlists', '/api/playlists'], async (req, res) => {
  const userId = req.body.user_id || 'guest';
  const playlist = await saveFirebasePlaylist(userId, req.body);
  res.json({ status: 'ok', playlist });
});

app.post('/api/premium/subscribe', (req, res) => res.json({ status: 'ok' }));

// ─── QR Login (WhatsApp-Style Device Linking with 4-Digit PIN) ────────────────
const qrSessions = new Map();
const qrPins = new Map(); // Maps 4-digit PIN -> sid
const QR_SESSION_TTL_MS = 5 * 60 * 1000;

function generateSid() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let sid = '';
  for (let i = 0; i < 12; i++) sid += chars[Math.floor(Math.random() * chars.length)];
  return sid;
}

function generate4DigitPin() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function cleanupExpiredQRSessions() {
  const now = Date.now();
  for (const [sid, s] of qrSessions) {
    if (now - s.createdAt > QR_SESSION_TTL_MS) {
      if (s.pin) qrPins.delete(s.pin);
      qrSessions.delete(sid);
    }
  }
}

app.post(['/api/qr-login/create', '/qr-login/create'], (req, res) => {
  cleanupExpiredQRSessions();
  const sid = generateSid();
  let pin = generate4DigitPin();
  while (qrPins.has(pin)) {
    pin = generate4DigitPin();
  }
  const createdAt = Date.now();
  const authUser = req.body && req.body.user ? {
    uid: req.body.user.uid || `user_${Date.now()}`,
    displayName: req.body.user.displayName || req.body.user.username || 'Staytup Listener',
    username: req.body.user.username || null,
    email: req.body.user.email || null,
    photoURL: req.body.user.photoURL || req.body.user.avatar || null,
  } : null;

  qrSessions.set(sid, {
    sid,
    pin,
    status: 'pending',
    user: authUser,
    createdAt,
    expiresAt: createdAt + QR_SESSION_TTL_MS,
  });
  qrPins.set(pin, sid);
  res.json({
    sid,
    pin,
    status: 'pending',
    hasUser: !!authUser,
    expiresIn: Math.floor(QR_SESSION_TTL_MS / 1000),
    expiresAt: createdAt + QR_SESSION_TTL_MS,
  });
});

app.get(['/api/qr-login/status/:sid', '/qr-login/status/:sid'], (req, res) => {
  const session = qrSessions.get(req.params.sid);
  if (!session) return res.json({ status: 'expired' });
  if (session.status === 'claimed') {
    if (session.pin) qrPins.delete(session.pin);
    qrSessions.delete(req.params.sid);
    return res.json({ status: 'claimed', user: session.user, claimedByPhone: session.claimedByPhone || false });
  }
  const remaining = Math.max(0, Math.floor((session.createdAt + QR_SESSION_TTL_MS - Date.now()) / 1000));
  res.json({
    status: 'pending',
    pin: session.pin,
    hasUser: !!session.user,
    user: session.user || null,
    remaining,
  });
});

app.post(['/api/qr-login/claim', '/qr-login/claim'], (req, res) => {
  const { sid, pin, user } = req.body;
  if (!sid && !pin) {
    return res.status(400).json({ error: 'sid or pin required' });
  }

  let session = null;
  if (sid) {
    session = qrSessions.get(sid);
  } else if (pin) {
    const pinStr = pin.toString().trim();
    const matchedSid = qrPins.get(pinStr);
    if (matchedSid) {
      session = qrSessions.get(matchedSid);
    }
  }

  if (!session) {
    return res.json({ success: false, error: 'Session expired or invalid 4-digit code' });
  }

  // If the session was created from an already logged-in profile, transfer account to phone!
  if (session.user) {
    const authUser = session.user;
    session.status = 'claimed';
    session.claimedByPhone = true;
    return res.json({
      success: true,
      mode: 'phone_login',
      user: authUser,
      message: 'Phone successfully logged in',
    });
  }

  // Otherwise (Desktop waiting for phone scan - WhatsApp Web direction):
  if (!user) {
    return res.status(400).json({ error: 'user required to link device' });
  }

  session.status = 'claimed';
  session.user = {
    uid: user.uid || `user_${Date.now()}`,
    displayName: user.displayName || user.username || 'Staytup Listener',
    email: user.email || null,
    photoURL: user.photoURL || null,
  };
  res.json({ success: true, message: 'Device successfully linked' });
});

// Dedicated endpoint: Enter 4-Digit Code on Phone to Log In
app.post(['/api/qr-login/phone-login', '/qr-login/phone-login'], (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ success: false, error: '4-digit code required' });
  }
  const cleanCode = code.toString().trim();
  const matchedSid = qrPins.get(cleanCode);
  const session = matchedSid ? qrSessions.get(matchedSid) : qrSessions.get(cleanCode);

  if (!session) {
    return res.json({
      success: false,
      error: 'Invalid or expired 4-digit code. Please check your screen.',
    });
  }

  if (!session.user) {
    return res.json({
      success: false,
      error: 'This code has not been authorized by an active profile yet.',
    });
  }

  const authUser = session.user;
  session.status = 'claimed';
  session.claimedByPhone = true;

  return res.json({
    success: true,
    user: authUser,
    message: `Logged in as ${authUser.displayName || authUser.username || 'Listener'}`,
  });
});

// ─── 4-Digit PIN Authentication ────────────────────────────────────────────────
// Users can create or sign in with just their Username and a 4-Digit PIN
const localPinUsers = new Map();

app.post(['/api/auth/pin-login', '/auth/pin-login'], async (req, res) => {
  try {
    const { username, pin } = req.body;
    if (!username || !pin) {
      return res.status(400).json({ error: 'Username and 4-digit PIN are required' });
    }

    const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const cleanPin = pin.toString().trim();

    if (cleanUser.length < 2) {
      return res.status(400).json({ error: 'Username must be at least 2 characters' });
    }
    if (!/^\d{4}$/.test(cleanPin)) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    }

    // Check in local cache or Firebase RTDB
    let userRecord = localPinUsers.get(cleanUser);
    if (!userRecord) {
      userRecord = await getPinUser(cleanUser);
      if (userRecord) localPinUsers.set(cleanUser, userRecord);
    }

    if (!userRecord) {
      // Create new user account with 4-digit PIN ("create 4 digit PIN that's it")
      const newUser = {
        uid: `pin_${cleanUser}_${Date.now().toString(36)}`,
        username: username.trim(),
        displayName: username.trim(),
        cleanUser,
        pin: cleanPin,
        createdAt: Date.now(),
      };
      localPinUsers.set(cleanUser, newUser);
      await savePinUser(cleanUser, newUser);

      return res.json({
        success: true,
        isNewUser: true,
        user: {
          uid: newUser.uid,
          displayName: newUser.displayName,
          username: newUser.username,
        },
      });
    }

    // Existing user: verify PIN
    if (userRecord.pin !== cleanPin) {
      return res.status(401).json({ success: false, error: 'Incorrect 4-digit PIN. Please try again.' });
    }

    return res.json({
      success: true,
      isNewUser: false,
      user: {
        uid: userRecord.uid,
        displayName: userRecord.displayName,
        username: userRecord.username,
      },
    });
  } catch (err) {
    console.error('PIN Auth Error:', err);
    res.status(500).json({ error: 'Failed to authenticate PIN' });
  }
});

// ─── User QR Profile (share your account) ───────────────────────────────────────
app.get(['/api/user-qr/:userId', '/user-qr/:userId'], async (req, res) => {
  const uid = req.params.userId || 'guest';
  const origin = req.get('origin') || req.get('referer');
  let baseUrl = 'https://staytup.odireca.com';
  if (origin) {
    try {
      baseUrl = new URL(origin).origin;
    } catch (_) {}
  }
  res.json({ uid, url: `${baseUrl}/qr-login?uid=${encodeURIComponent(uid)}` });
});

// ─── Referral System ────────────────────────────────────────────────────────────
const referralStore = new Map();

app.post(['/api/referral/create', '/referral/create'], (req, res) => {
  const { userId, username } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const code = (username || userId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12).toLowerCase();
  if (!referralStore.has(code)) {
    referralStore.set(code, { userId, username: username || userId, count: 0, createdAt: Date.now() });
  }
  const origin = req.get('origin') || req.get('referer');
  let baseUrl = 'https://staytup.odireca.com';
  if (origin) {
    try {
      baseUrl = new URL(origin).origin;
    } catch (_) {}
  }
  res.json({ code, url: `${baseUrl}/qr-login?ref=${code}` });
});

app.post(['/api/referral/claim', '/referral/claim'], (req, res) => {
  const { code, newUserId } = req.body;
  if (!code || !newUserId) return res.status(400).json({ error: 'code and newUserId required' });
  const ref = referralStore.get(code);
  if (!ref) return res.json({ success: false, error: 'Invalid referral code' });
  ref.count = (ref.count || 0) + 1;
  res.json({ success: true, referrer: ref.username, rewards: ref.count * 10 });
});

app.get(['/api/referral/stats/:code', '/referral/stats/:code'], (req, res) => {
  const ref = referralStore.get(req.params.code);
  if (!ref) return res.json({ count: 0, rewards: 0 });
  res.json({ count: ref.count, rewards: (ref.count || 0) * 10 });
});

function extractStaytupArtistImage(imageObj) {
  if (!imageObj) return null;
  if (typeof imageObj === 'string') return imageObj;
  if (Array.isArray(imageObj)) {
    if (imageObj.length === 0) return null;
    const sorted = [...imageObj].sort((a, b) => {
      const qA = parseInt(String(a?.quality || '').split('x')[0] || '0', 10);
      const qB = parseInt(String(b?.quality || '').split('x')[0] || '0', 10);
      return qB - qA;
    });
    for (const item of sorted) {
      const u = item?.url || (typeof item === 'string' ? item : null);
      if (u && !u.includes('default-film') && !u.includes('default-music')) return u;
    }
    return sorted[0]?.url || null;
  }
  return null;
}

// ─── Artist Songs Endpoint (Original movie/album tracks, no compilation spam, deduplicated) ─
app.get(['/api/artists/:idOrName/songs', '/artists/:idOrName/songs', '/api/artist-songs'], async (req, res) => {
  const queryParam = req.params.idOrName || req.query.id || req.query.name || req.query.q || '';
  const page = parseInt(req.query.page, 10) || 0;
  const limit = Math.min(parseInt(req.query.limit, 10) || 25, 50);

  if (!queryParam.trim()) {
    return res.json({ tracks: [], results: [], has_more: false });
  }

  const cleanQuery = queryParam.trim();
  let artistId = /^\d+$/.test(cleanQuery) ? cleanQuery : null;
  let artistName = cleanQuery;

  try {
    // If not numeric id, resolve artist id from name
    if (!artistId) {
      const sUrl = `https://staytup-api.onrender.com/api/search/artists?query=${encodeURIComponent(cleanQuery)}&limit=1`;
      const sResp = await fetch(sUrl, { signal: AbortSignal.timeout(5000) });
      if (sResp.ok) {
        const sJson = await sResp.json();
        const first = sJson?.data?.results?.[0];
        if (first && first.id) {
          artistId = String(first.id);
          artistName = first.name || artistName;
        }
      }
    }

    let tracks = [];
    const seenTitles = new Set();

    function addCandidateSongs(rawList) {
      if (!Array.isArray(rawList)) return;
      for (const s of rawList) {
        if (!s) continue;
        const album = s.album?.name || s.album || '';
        const title = (s.name || s.title || s.song || '').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
        const normTitle = title.toLowerCase().replace(/\s*\(.*?\)/g, '').replace(/[^a-z0-9]/g, '').trim();
        const songArtist = s.artists?.primary?.[0]?.name || s.primaryArtists || s.subtitle || s.primary_artists || s.artist || '';
        if (!normTitle || seenTitles.has(normTitle)) continue;
        if (isCompilationAlbum(album, title)) continue;
        if (/karaoke|zzang|8-bit|16-bit|arcade/i.test(title) || /karaoke|zzang|8-bit|16-bit|arcade/i.test(songArtist)) continue;
        seenTitles.add(normTitle);
        const normalized = normalizeSaavnSong(s, null);
        if (normalized) {
          tracks.push(normalized);
          if (tracks.length >= limit) break;
        }
      }
    }

    // 1. Concurrently fetch official artist discography from staytup-api and direct JioSaavn (2 subpages for 20 songs)
    if (artistId) {
      const subpage1 = page * 2;
      const subpage2 = page * 2 + 1;
      const discographyPromises = [
        fetchSaavnJson(`/artists/${artistId}/songs?page=${subpage1}`).catch(() => null),
        fetchSaavnJson(`/artists/${artistId}/songs?page=${subpage2}`).catch(() => null),
        fetch(`https://www.jiosaavn.com/api.php?__call=artist.getArtistMoreSong&_format=json&_marker=0&api_version=4&ctx=web6dot0&artistId=${artistId}&page=${subpage1}&category=popularity&sort_order=desc&n=20`, {
          headers: JIOSAAVN_HEADERS,
          signal: AbortSignal.timeout(8000)
        }).then(r => r.json()).catch(() => null),
        fetch(`https://www.jiosaavn.com/api.php?__call=artist.getArtistMoreSong&_format=json&_marker=0&api_version=4&ctx=web6dot0&artistId=${artistId}&page=${subpage2}&category=popularity&sort_order=desc&n=20`, {
          headers: JIOSAAVN_HEADERS,
          signal: AbortSignal.timeout(8000)
        }).then(r => r.json()).catch(() => null),
      ];

      if (page === 0) {
        discographyPromises.push(
          fetch(`https://www.jiosaavn.com/api.php?__call=artist.getArtistPageDetails&_format=json&_marker=0&artistId=${artistId}`, {
            headers: JIOSAAVN_HEADERS,
            signal: AbortSignal.timeout(8000)
          }).then(r => r.json()).catch(() => null)
        );
      }

      const discResults = await Promise.allSettled(discographyPromises);
      for (const res of discResults) {
        if (res.status === 'fulfilled' && res.value) {
          const list = res.value?.data?.songs || res.value?.songs || res.value?.topSongs?.songs || (Array.isArray(res.value?.topSongs) ? res.value.topSongs : []);
          addCandidateSongs(list);
          if (tracks.length >= limit) break;
        }
      }
    }

    // 2. If under limit tracks, supplement with search results for this artist
    if (tracks.length < limit) {
      const searchPromises = [
        fetchSaavnJson(`/search/songs?query=${encodeURIComponent(artistName)}&page=${page + 1}&limit=${limit}`).catch(() => null),
        fetch(`https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q=${encodeURIComponent(artistName)}&p=${page + 1}&n=${limit}`, {
          headers: JIOSAAVN_HEADERS,
          signal: AbortSignal.timeout(8000)
        }).then(r => r.json()).catch(() => null),
        fetch(`https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q=${encodeURIComponent(artistName + ' songs')}&p=${page + 1}&n=${limit}`, {
          headers: JIOSAAVN_HEADERS,
          signal: AbortSignal.timeout(8000)
        }).then(r => r.json()).catch(() => null),
        fetch(`https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q=${encodeURIComponent(artistName + ' hits')}&p=${page + 1}&n=${limit}`, {
          headers: JIOSAAVN_HEADERS,
          signal: AbortSignal.timeout(8000)
        }).then(r => r.json()).catch(() => null),
      ];

      const sResults = await Promise.allSettled(searchPromises);
      for (const res of sResults) {
        if (res.status === 'fulfilled' && res.value) {
          const list = res.value?.data?.results || res.value?.results || [];
          addCandidateSongs(list);
          if (tracks.length >= limit) break;
        }
      }
    }

    const hasMore = tracks.length >= 10 || page < 15;

    return res.json({
      tracks,
      results: tracks,
      artistId: artistId || '',
      artistName,
      page,
      has_more: hasMore
    });
  } catch (err) {
    console.warn('[API /artists/:id/songs] Error:', err.message);
    res.json({ tracks: [], results: [], has_more: false });
  }
});

app.get('/artists/search', async (req, res) => {
  const q = req.query.q ? String(req.query.q).trim() : '';
  const limit = Math.min(parseInt(req.query.limit) || 10, 30);
  if (!q) return res.json({ results: [], artists: [] });

  try {
    const url = `https://staytup-api.onrender.com/api/search/artists?query=${encodeURIComponent(q)}&limit=${limit}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (resp.ok) {
      const json = await resp.json();
      const rawList = json?.data?.results || [];
      const normalized = rawList
        .filter((item) => item && item.name)
        .map((item) => ({
          id: String(item.id || ''),
          name: item.name.trim(),
          image: extractStaytupArtistImage(item.image),
          thumbnail: extractStaytupArtistImage(item.image),
          role: item.role || 'Artist',
          type: 'artist',
        }))
        .filter((item) => item.name.length > 1);

      const seenIds = new Set();
      const seenNames = new Set();
      const unique = normalized.filter((item) => {
        const idKey = item.id;
        const nameKey = item.name.toLowerCase();
        if (idKey && seenIds.has(idKey)) return false;
        if (seenNames.has(nameKey)) return false;
        if (idKey) seenIds.add(idKey);
        seenNames.add(nameKey);
        return true;
      });

      return res.json({ results: unique.slice(0, limit), artists: unique.slice(0, limit) });
    }
  } catch (err) {
    console.warn('[API /artists/search] Staytup API error:', err.message);
  }

  res.json({ results: [], artists: [] });
});

// ─── Popular Artists by Language Endpoint (Staytup API Powered) ───────────────
const popularArtistsCache = new Map();
const POPULAR_ARTISTS_TTL = 1000 * 60 * 60 * 6; // 6 hours

app.get(['/artists/popular', '/api/artists/popular'], async (req, res) => {
  const language = req.query.language ? String(req.query.language).trim() : 'Hindi';
  const limit = Math.min(parseInt(req.query.limit) || 12, 30);
  const cacheKey = `${language.toLowerCase()}_${limit}`;

  const cached = popularArtistsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < POPULAR_ARTISTS_TTL) {
    return res.json({ artists: cached.artists, results: cached.artists, cached: true });
  }

  try {
    const url = `https://staytup-api.onrender.com/api/search/songs?query=${encodeURIComponent(language + ' top hits')}&limit=25`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (resp.ok) {
      const json = await resp.json();
      const songs = json?.data?.results || [];
      const seenIds = new Set();
      const seenNames = new Set();
      const artists = [];

      for (const song of songs) {
        const primary = song.artists?.primary || [];
        for (const a of primary) {
          if (!a || !a.name) continue;
          const cleanName = a.name.trim();
          const cleanId = String(a.id || cleanName);
          const nameLower = cleanName.toLowerCase();
          if (seenIds.has(cleanId) || seenNames.has(nameLower)) continue;
          seenIds.add(cleanId);
          seenNames.add(nameLower);

          const img = extractStaytupArtistImage(a.image);
          if (img && !img.includes('artist-default-music.png') && !img.includes('default_artist')) {
            artists.push({
              id: cleanId,
              name: cleanName,
              image: img,
              thumbnail: img,
              role: 'Artist',
              type: 'artist',
            });
          }
        }
      }

      if (artists.length > 0) {
        const sliced = artists.slice(0, limit);
        popularArtistsCache.set(cacheKey, { artists: sliced, timestamp: Date.now() });
        return res.json({ artists: sliced, results: sliced });
      }
    }
  } catch (err) {
    console.warn('[API /artists/popular] Staytup API error:', err.message);
  }

  // Fallback to searching artists directly
  try {
    const fallbackUrl = `https://staytup-api.onrender.com/api/search/artists?query=${encodeURIComponent(language)}&limit=${limit}`;
    const resp = await fetch(fallbackUrl, { signal: AbortSignal.timeout(6000) });
    if (resp.ok) {
      const json = await resp.json();
      const raw = json?.data?.results || [];
      const artists = raw
        .filter((a) => a && a.name)
        .map((a) => ({
          id: String(a.id || a.name),
          name: a.name.trim(),
          image: extractStaytupArtistImage(a.image),
          thumbnail: extractStaytupArtistImage(a.image),
          role: a.role || 'Artist',
          type: 'artist',
        }))
        .filter((a) => a.image && !a.image.includes('artist-default-music.png') && !a.image.includes('default_artist'))
        .slice(0, limit);

      if (artists.length > 0) {
        popularArtistsCache.set(cacheKey, { artists, timestamp: Date.now() });
        return res.json({ artists, results: artists });
      }
    }
  } catch (err) {
    console.warn('[API /artists/popular] Fallback error:', err.message);
  }

  res.json({ artists: [], results: [] });
});

// ─── Similar Artists Endpoint (Staytup API Powered) ───────────────────────────
app.get(['/artists/similar', '/api/artists/similar'], async (req, res) => {
  const q = req.query.q ? String(req.query.q).trim() : '';
  const artistId = req.query.id ? String(req.query.id).trim() : '';
  const limit = Math.min(parseInt(req.query.limit) || 6, 12);
  if (!q && !artistId) return res.json({ artists: [], results: [] });

  const targetName = q.toLowerCase();

  // 1. If artistId is provided, or query can be looked up to get artist details
  let resolvedId = artistId;
  let resolvedImage = null;

  if (!resolvedId && q) {
    try {
      const sUrl = `https://staytup-api.onrender.com/api/search/artists?query=${encodeURIComponent(q)}&limit=1`;
      const sResp = await fetch(sUrl, { signal: AbortSignal.timeout(5000) });
      if (sResp.ok) {
        const sJson = await sResp.json();
        const first = sJson?.data?.results?.[0];
        if (first?.id) {
          resolvedId = String(first.id);
          resolvedImage = extractStaytupArtistImage(first.image);
        }
      }
    } catch (_) {}
  }

  // 2. Query Staytup API artist details to extract real collaborative artists / similar artists
  if (resolvedId) {
    try {
      const dUrl = `https://staytup-api.onrender.com/api/artists?id=${encodeURIComponent(resolvedId)}`;
      const dResp = await fetch(dUrl, { signal: AbortSignal.timeout(6000) });
      if (dResp.ok) {
        const dJson = await dResp.json();
        const artistData = dJson?.data;

        const candidates = [];
        const seenCandidateIds = new Set([resolvedId]);
        const seenCandidateNames = new Set([targetName]);

        // A. If similarArtists exist in data
        if (Array.isArray(artistData?.similarArtists) && artistData.similarArtists.length > 0) {
          artistData.similarArtists.forEach((sim) => {
            if (!sim || !sim.name) return;
            const sId = String(sim.id || '');
            const sName = sim.name.trim();
            const sNameLower = sName.toLowerCase();
            if (seenCandidateNames.has(sNameLower)) return;
            seenCandidateNames.add(sNameLower);
            if (sId) seenCandidateIds.add(sId);
            candidates.push({
              id: sId || '',
              name: sName,
              image: extractStaytupArtistImage(sim.image),
              thumbnail: extractStaytupArtistImage(sim.image),
              type: 'artist',
            });
          });
        }

        // B. Extract collaborating artists from topSongs and singles
        const songCollections = [
          ...(Array.isArray(artistData?.topSongs) ? artistData.topSongs : []),
          ...(Array.isArray(artistData?.singles) ? artistData.singles : []),
        ];

        for (const song of songCollections) {
          if (!song?.artists) continue;
          const artistLists = [
            ...(Array.isArray(song.artists.primary) ? song.artists.primary : []),
            ...(Array.isArray(song.artists.featured) ? song.artists.featured : []),
            ...(Array.isArray(song.artists.all) ? song.artists.all : []),
          ];

          for (const a of artistLists) {
            if (!a || !a.name) continue;
            const role = (a.role || '').toLowerCase();
            // Focus on genuine musicians / singers / primary creators, avoiding lyricists and film stars
            if (role.includes('starring') || role.includes('lyricist')) continue;

            const aId = String(a.id || '');
            const aName = a.name.trim();
            const aNameLower = aName.toLowerCase();

            if (seenCandidateNames.has(aNameLower)) continue;
            if (aId && seenCandidateIds.has(aId)) continue;

            seenCandidateNames.add(aNameLower);
            if (aId) seenCandidateIds.add(aId);

            candidates.push({
              id: aId || '',
              name: aName,
              image: extractStaytupArtistImage(a.image),
              thumbnail: extractStaytupArtistImage(a.image),
              type: 'artist',
            });

            if (candidates.length >= limit * 2) break;
          }
          if (candidates.length >= limit * 2) break;
        }

        if (candidates.length > 0) {
          const selected = candidates.slice(0, limit);
          return res.json({ artists: selected, results: selected });
        }
      }
    } catch (err) {
      console.warn('[API /artists/similar] Detail lookup error:', err.message);
    }
  }

  // 3. Fallback: Search related artists via Staytup search relevance
  try {
    const fallbackUrl = `https://staytup-api.onrender.com/api/search/artists?query=${encodeURIComponent(q)}&limit=${limit + 4}`;
    const fbResp = await fetch(fallbackUrl, { signal: AbortSignal.timeout(5000) });
    if (fbResp.ok) {
      const fbJson = await fbResp.json();
      const results = fbJson?.data?.results || [];
      const filtered = results
        .filter((a) => a?.name && a.name.toLowerCase() !== targetName)
        .slice(0, limit)
        .map((a) => ({
          id: String(a.id || ''),
          name: a.name.trim(),
          image: extractStaytupArtistImage(a.image),
          thumbnail: extractStaytupArtistImage(a.image),
          type: 'artist',
        }));

      return res.json({ artists: filtered, results: filtered });
    }
  } catch (_) {}

  res.json({ artists: [], results: [] });
});

// ─── 10. Start Server ─────────────────────────────────────────────────────────
async function startServer() {
  const distPath = path.join(process.cwd(), 'dist');
  const publicPath = path.join(process.cwd(), 'public');

  app.use(express.static(publicPath));
  app.use(express.static(distPath));

  // SPA fallback: serve index.html for all non-API, non-stream routes
  const API_PREFIXES = ['/api/', '/stream/', '/stream.php'];
  const API_EXACT = ['/search', '/suggest', '/home', '/lyrics', '/play-event', '/favorite', '/recognize'];

  app.get('*', (req, res) => {
    const p = req.path.toLowerCase();

    // Skip API and stream routes — they already have their own handlers
    if (!req.accepts('html') && API_PREFIXES.some(prefix => p.startsWith(prefix))) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (!req.accepts('html') && API_EXACT.some(route => p === route || p === route + '/')) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Serve SPA index.html for all client-side routes
    const distIndex = path.join(distPath, 'index.html');
    if (fs.existsSync(distIndex)) {
      return res.sendFile(distIndex);
    }
    const pubIndex = path.join(publicPath, 'index.html');
    if (fs.existsSync(pubIndex)) {
      return res.sendFile(pubIndex);
    }
    res.status(200).send('Staytup is running!');
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log('===========================================================');
    console.log(`🎵 YouTube Music Server running on http://0.0.0.0:${PORT}`);
    console.log(`🔍 Search:       http://localhost:${PORT}/api/search?q=coldplay`);
    console.log(`🎧 Audio Stream: http://localhost:${PORT}/stream/:videoId`);
    console.log(`📡 Health:       http://localhost:${PORT}/api/health`);
    console.log('===========================================================');
  });
}

startServer();
