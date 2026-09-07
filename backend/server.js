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
  getAppTrendingTracks
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

app.use(express.json());

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
      '-f', 'ba[ext=m4a]/ba/b',
      '--no-warnings',
      `https://www.youtube.com/watch?v=${cleanId}`
    ], { windowsHide: true });

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('Audio extraction timed out after 15s'));
    }, 15000);

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

// Scrape YouTube Music Search Helper
async function scrapeYouTubeSearch(query) {
  const searchQuery = /music|audio|song|official/i.test(query)
    ? query
    : `${query} music`;

  const resp = await fetch(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`,
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

// ─── 1. Health check (/api/health and /health) with Firebase diagnostics ────────
app.get(['/api/health', '/health'], async (req, res) => {
  const fb = await checkFirebaseHealth();
  res.json({
    status: 'ok',
    service: 'YouTube Music Server',
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

// Helper: Deduplicate tracks by videoId across sections
function dedupeTracks(allSections) {
  const seen = new Set();
  return allSections.map(section => {
    const unique = (section.tracks || []).filter(t => {
      const id = t.videoId || t.video_id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return { ...section, tracks: unique };
  }).filter(s => s.tracks.length > 0);
}

// Helper: Validate a YouTube thumbnail URL exists (HEAD request)
async function validateThumbnail(videoId, thumbnailUrl) {
  try {
    // If a yt3.googleusercontent.com URL is provided, it's from YouTube directly — trust it
    if (thumbnailUrl && thumbnailUrl.includes('yt3.googleusercontent.com')) {
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

// Helper: Run multiple search queries in parallel with individual timeouts
async function parallelSearch(queries, limitPerQuery = 12) {
  const results = await Promise.allSettled(
    queries.map(q => scrapeYouTubeSearch(q).then(r => r.slice(0, limitPerQuery)))
  );
  return results
    .filter(r => r.status === 'fulfilled' && Array.isArray(r.value))
    .flatMap(r => r.value);
}

// ─── 8. Daily Home Feed — India-focused rich sections ────────────────────────
app.get(['/home', '/home/:userId', '/api/home'], async (req, res) => {
  try {
    const now = new Date();
    const timestamp = now.toISOString();

    // Parallel fetch: each query targets a specific Indian music category
    const [
      trendingIndia,
      hindiTop,
      englishIndia,
      bollywoodBlockbusters,
      punjabiHits,
      tamilHits,
      teluguHits,
      indieViral,
      partyAnthem,
      romanticVibes,
      workoutEnergy,
      lateNightChill,
      devotional,
      retroClassics,
      newReleases,
      southIndianMix,
      lofiChillHindi,
      romanticEnglish,
      desiHipHop,
      indiePopIndia
    ] = await Promise.allSettled([
      scrapeYouTubeSearch('trending songs India 2025 2026').then(r => r.slice(0, 15)),
      scrapeYouTubeSearch('top Hindi songs 2025 2026 latest').then(r => r.slice(0, 15)),
      scrapeYouTubeSearch('top English songs India trending 2025 2026').then(r => r.slice(0, 12)),
      scrapeYouTubeSearch('Bollywood blockbuster hit songs 2025 2026').then(r => r.slice(0, 15)),
      scrapeYouTubeSearch('Punjabi hit songs 2025 2026 trending').then(r => r.slice(0, 12)),
      scrapeYouTubeSearch('Tamil hit songs 2025 2026 latest').then(r => r.slice(0, 15)),
      scrapeYouTubeSearch('Telugu hit songs 2025 2026 latest').then(r => r.slice(0, 15)),
      scrapeYouTubeSearch('Indian indie viral songs 2025 2026').then(r => r.slice(0, 12)),
      scrapeYouTubeSearch('party anthem Bollywood English Hindi 2025 2026').then(r => r.slice(0, 12)),
      scrapeYouTubeSearch('romantic Hindi English songs 2025 2026').then(r => r.slice(0, 12)),
      scrapeYouTubeSearch('workout gym motivation Indian English songs 2025').then(r => r.slice(0, 10)),
      scrapeYouTubeSearch('late night chill Hindi English songs 2025 2026').then(r => r.slice(0, 10)),
      scrapeYouTubeSearch('devotional spiritual songs Hindu bhajan 2025 2026').then(r => r.slice(0, 10)),
      scrapeYouTubeSearch('retro Bollywood classic songs evergreen').then(r => r.slice(0, 10)),
      scrapeYouTubeSearch('new release songs India September 2025 2026').then(r => r.slice(0, 15)),
      scrapeYouTubeSearch('Malayalam Kannada Marathi hit songs 2025 2026').then(r => r.slice(0, 12)),
      scrapeYouTubeSearch('lofi chill Hindi songs study relax 2025').then(r => r.slice(0, 10)),
      scrapeYouTubeSearch('romantic English songs love 2025 2026').then(r => r.slice(0, 10)),
      scrapeYouTubeSearch('desi hip hop rap Indian 2025 2026').then(r => r.slice(0, 10)),
      scrapeYouTubeSearch('Indian indie pop songs 2025 2026').then(r => r.slice(0, 10)),
    ]);

    const get = (r) => r.status === 'fulfilled' ? r.value : [];

    const allSections = [
      { id: 'trending_now', title: 'Trending Now India', tracks: get(trendingIndia) },
      { id: 'new_releases', title: 'New Releases', tracks: get(newReleases) },
      { id: 'top_hindi', title: 'Top Hindi Songs', tracks: get(hindiTop) },
      { id: 'bollywood_blockbusters', title: 'Bollywood Blockbusters', tracks: get(bollywoodBlockbusters) },
      { id: 'punjabi_bangers', title: 'Punjabi Bangers', tracks: get(punjabiHits) },
      { id: 'tamil_hits', title: 'Tamil Hits', tracks: get(tamilHits) },
      { id: 'telugu_hits', title: 'Telugu Hits', tracks: get(teluguHits) },
      { id: 'south_indian_mix', title: 'South Indian Mix', tracks: get(southIndianMix) },
      { id: 'english_india', title: 'Top English India', tracks: get(englishIndia) },
      { id: 'desi_hip_hop', title: 'Desi Hip Hop & Rap', tracks: get(desiHipHop) },
      { id: 'indie_pop', title: 'Indie Pop India', tracks: get(indiePopIndia) },
      { id: 'indie_viral', title: 'Indie & Viral', tracks: get(indieViral) },
      { id: 'party_anthems', title: 'Party Anthems', tracks: get(partyAnthem) },
      { id: 'romantic_vibes', title: 'Romantic Vibes', tracks: get(romanticVibes) },
      { id: 'romantic_english', title: 'Romantic English Songs', tracks: get(romanticEnglish) },
      { id: 'workout_energy', title: 'Workout Energy', tracks: get(workoutEnergy) },
      { id: 'lofi_chill_hindi', title: 'Lofi Chill Hindi', tracks: get(lofiChillHindi) },
      { id: 'late_night_chill', title: 'Late Night Chill', tracks: get(lateNightChill) },
      { id: 'devotional', title: 'Devotional & Spiritual', tracks: get(devotional) },
      { id: 'retro_classics', title: 'Retro Classics', tracks: get(retroClassics) },
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

    res.json({
      sections: validSections,
      trending: validSections.find(s => s.id === 'trending_now')?.tracks || [],
      recommended: validSections.find(s => s.id === 'top_hindi')?.tracks || [],
      freshPicks: validSections.find(s => s.id === 'new_releases')?.tracks || [],
      moods: [
        { id: 'chill', name: 'Chill & Relax', query: 'chill lofi acoustic Hindi English music' },
        { id: 'workout', name: 'Workout Energy', query: 'workout gym motivation music India' },
        { id: 'party', name: 'Party Anthems', query: 'party dance club Bollywood English hits' },
        { id: 'focus', name: 'Deep Focus', query: 'deep focus study ambient lofi music' },
        { id: 'romantic', name: 'Romantic Mood', query: 'romantic love Hindi English songs' },
        { id: 'devotional', name: 'Spiritual', query: 'devotional bhajan spiritual songs India' },
      ],
      generated_at: timestamp,
      total_sections: sections.length,
    });
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

// ─── QR Login (Device Linking) ─────────────────────────────────────────────────
const qrSessions = new Map();
const QR_SESSION_TTL_MS = 5 * 60 * 1000;

function generateSid() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let sid = '';
  for (let i = 0; i < 12; i++) sid += chars[Math.floor(Math.random() * chars.length)];
  return sid;
}

function cleanupExpiredQRSessions() {
  const now = Date.now();
  for (const [sid, s] of qrSessions) {
    if (now - s.createdAt > QR_SESSION_TTL_MS) qrSessions.delete(sid);
  }
}

app.post(['/api/qr-login/create', '/qr-login/create'], (req, res) => {
  cleanupExpiredQRSessions();
  const sid = generateSid();
  qrSessions.set(sid, { status: 'pending', user: null, createdAt: Date.now() });
  res.json({ sid, status: 'pending' });
});

app.get(['/api/qr-login/status/:sid', '/qr-login/status/:sid'], (req, res) => {
  const session = qrSessions.get(req.params.sid);
  if (!session) return res.json({ status: 'expired' });
  if (session.status === 'claimed') {
    qrSessions.delete(req.params.sid);
    return res.json({ status: 'claimed', user: session.user });
  }
  res.json({ status: 'pending' });
});

app.post(['/api/qr-login/claim', '/qr-login/claim'], (req, res) => {
  const { sid, user } = req.body;
  if (!sid || !user) return res.status(400).json({ error: 'sid and user required' });
  const session = qrSessions.get(sid);
  if (!session) return res.json({ success: false, error: 'Session expired' });
  session.status = 'claimed';
  session.user = user;
  res.json({ success: true });
});

// ─── User QR Profile (share your account) ───────────────────────────────────────
app.get(['/api/user-qr/:userId', '/user-qr/:userId'], async (req, res) => {
  const uid = req.params.userId || 'guest';
  res.json({ uid, url: `https://staytup.in/qr-login?uid=${encodeURIComponent(uid)}` });
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
  res.json({ code, url: `https://staytup.in/qr-login?ref=${code}` });
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

app.get('/artists/search', async (req, res) => {
  const q = req.query.q ? String(req.query.q).trim() : '';
  const list = await scrapeYouTubeSearch(`${q} artist music`);
  res.json({ results: list.slice(0, 10) });
});

// ─── 10. Start Server ─────────────────────────────────────────────────────────
async function startServer() {
  const distPath = path.join(process.cwd(), 'dist');
  const publicPath = path.join(process.cwd(), 'public');

  app.use(express.static(publicPath));
  app.use(express.static(distPath));

  // SPA fallback: serve index.html for all non-API, non-stream routes
  const API_PREFIXES = ['/api/', '/stream/', '/stream.php'];
  const API_EXACT = ['/search', '/suggest', '/home', '/lyrics', '/play-event', '/favorite'];

  app.get('*', (req, res) => {
    const p = req.path.toLowerCase();

    // Skip API and stream routes — they already have their own handlers
    if (API_PREFIXES.some(prefix => p.startsWith(prefix))) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (API_EXACT.some(route => p === route || p === route + '/')) {
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
