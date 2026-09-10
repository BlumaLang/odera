// API client — Routes all JioSaavn calls through PHP backend
// No CORS proxies needed — server-side cURL handles everything
// Firebase stays untouched for user data (auth, playlists, likes, history)
import { Platform } from "react-native";
import { getCachedArtist, saveCachedArtist, getBatchCachedArtists } from "../services/firebase";

// ─── Configuration ───────────────────────────────────────────────────────────
const LRCLIB_API = "https://lrclib.net/api";

// Backend URL — set EXPO_PUBLIC_API_URL to your PHP backend
// For local dev with XAMPP (no mod_rewrite): http://localhost/odera/api/index.php
// For production: /api/index.php (relative, same domain)
const configuredApiBase =
  (typeof process !== "undefined" && process.env?.EXPO_PUBLIC_API_URL) ||
  null;

// Expo web development runs on port 8081, while XAMPP serves this repository's
// PHP API from port 80 under /staytup. Without this, every stream request goes
// to Metro and receives a 404, so no song can start. Production stays relative.
const API_BASE = configuredApiBase || (
  typeof window !== "undefined" &&
  window.location.hostname === "localhost" &&
  window.location.port === "8081"
    ? `${window.location.protocol}//${window.location.hostname}/staytup/api/index.php`
    : "/api/index.php"
);

// ─── CryptoJS lazy load ──────────────────────────────────────────────────────
let CryptoJS = null;
function getCryptoJS() {
  if (CryptoJS) return CryptoJS;
  try {
    CryptoJS = require("crypto-js");
  } catch (e) {
    console.warn("[API] crypto-js not available:", e.message);
  }
  return CryptoJS;
}

// ─── Core Backend Fetch ──────────────────────────────────────────────────────
async function backendFetch(endpoint, params = {}, options = {}) {
  // Build full URL — handle both absolute and relative API_BASE
  let baseUrl = `${API_BASE}/${endpoint}`;
  if (typeof window !== "undefined" && baseUrl.startsWith("/")) {
    baseUrl = window.location.origin + baseUrl;
  }
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null) url.searchParams.set(key, val);
  });

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), options.timeout || 12000) : null;

  try {
    const resp = await fetch(url.toString(), {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      ...(controller ? { signal: controller.signal } : {}),
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!resp.ok) {
      const errorBody = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status}: ${errorBody || resp.statusText}`);
    }

    return await resp.json();
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    if (err.name === "AbortError") throw new Error("Request timeout");
    throw err;
  }
}

// ─── Stream URL Decryption (DES-ECB, key 38346591) ──────────────────────────
function decryptStreamUrl(encrypted) {
  if (!encrypted) return null;
  const CJ = getCryptoJS();
  if (!CJ) return null;
  try {
    const key = CJ.enc.Utf8.parse("38346591");
    const decrypted = CJ.DES.decrypt(
      { ciphertext: CJ.enc.Base64.parse(encrypted) },
      key,
      { mode: CJ.mode.ECB, padding: CJ.pad.Pkcs7 }
    );
    let url = decrypted.toString(CJ.enc.Utf8);
    if (!url) return null;
    url = url.replace("_96.mp4", "_320.mp4").replace("_160.mp4", "_320.mp4");
    url = url.replace("http://", "https://");
    return url;
  } catch (e) {
    console.error("[API] Decrypt failed:", e.message);
    return null;
  }
}

// ─── Extract best quality stream URL from song details ───────────────────────
function extractStreamUrl(songData) {
  if (!songData) return null;

  // 1. Try encrypted_media_url (JioSaavn v1 format)
  const encrypted = songData.encrypted_media_url || songData.more_info?.encrypted_media_url;
  if (encrypted) {
    const url = decryptStreamUrl(encrypted);
    if (url) return url;
  }

  // 2. Try downloadUrl array (JioSaavn v4 format)
  const dl = songData.downloadUrl || songData.data?.downloadUrl;
  if (Array.isArray(dl) && dl.length > 0) {
    const sorted = [...dl].sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
    return sorted[0]?.url || dl[dl.length - 1]?.url;
  }

  // 3. Try direct url
  if (songData.url) return songData.url;

  return null;
}

// ─── LRC Lyrics Parser ───────────────────────────────────────────────────────
function parseLrc(lrcText) {
  if (!lrcText || typeof lrcText !== "string") return [];
  const result = [];
  for (const line of lrcText.split("\n")) {
    const m = line.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/);
    if (m) {
      const time = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseFloat(`0.${m[3]}`) : 0);
      const text = m[4].trim();
      if (text) result.push({ time, text });
    }
  }
  return result.sort((a, b) => a.time - b.time);
}

// ─── Helper for user identifier (kept for backward compat) ───────────────────
export const DEFAULT_USER_ID = "staytup_user_main";

// ─── Backend URL helpers ─────────────────────────────────────────────────────
export function getBackendBase() {
  return API_BASE;
}
export const setApiBaseUrl = () => {};
export const getApiBaseUrl = () => API_BASE;
export const warmupBackend = () => backendFetch("health").catch(() => {});

// ─── Client-side YouTube/Spotify playlist scrapers ────────────────────────────
function extractYouTubePlaylistId(url) {
  const m = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function extractSpotifyPlaylistId(url) {
  const m = url.match(/playlist\/([a-zA-Z0-9]+)/);
  if (m) return m[1];
  const m2 = url.match(/spotify:playlist:([a-zA-Z0-9]+)/);
  return m2 ? m2[1] : null;
}

function cleanYouTubeTitle(title) {
  return (title || "")
    .replace(/[\(\[](Official\s*(Music\s*)?Video|Lyrics|Lyric\s*Video|Audio|Official\s*Audio|4K|HD|HQ|Visualizer|Full\s*Song|Video|Official)[\)\]]/gi, "")
    .replace(/[\(\[]\s*feat\.?.*?[\]\)]/gi, "")
    .replace(/[\(\[]\s*ft\.?.*?[\]\)]/gi, "")
    .replace(/[\(\[]\s*prod\.?.*?[\]\)]/gi, "")
    .replace(/\|.*$/g, "")
    .replace(/[-–—]\s*YouTube$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchYouTubePlaylistClient(playlistId) {
  const CORS_PROXIES = [
    "https://api.allorigins.win/raw?url=",
    "https://corsproxy.io/?",
  ];

  let html = null;
  for (const proxy of CORS_PROXIES) {
    try {
      const resp = await fetch(proxy + encodeURIComponent(`https://www.youtube.com/playlist?list=${playlistId}`), { signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        html = await resp.text();
        if (html && html.includes("videoId")) break;
      }
    } catch (_) {}
  }

  if (!html) {
    return { success: false, error: "Could not fetch YouTube playlist. Please try again." };
  }

  const tracks = [];

  // Method 1: Parse ytInitialData JSON
  const ytMatch = html.match(/var ytInitialData\s*=\s*({.*?});\s*<\/script>/s)
    || html.match(/window\["ytInitialData"\]\s*=\s*({.*?});\s*<\/script>/s);
  if (ytMatch) {
    try {
      const data = JSON.parse(ytMatch[1]);
      const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
      const sections = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      const items = sections[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents
        || sections[0]?.playlistVideoListRenderer?.contents || [];

      for (const item of items) {
        const v = item?.playlistVideoRenderer;
        if (!v) continue;
        const title = v?.title?.runs?.[0]?.text || "";
        const artist = v?.shortBylineText?.runs?.[0]?.text || "";
        if (title) {
          tracks.push({ title: cleanYouTubeTitle(title), artist, videoId: v?.videoId || "" });
        }
      }
    } catch (_) {}
  }

  // Method 2: Regex fallback
  if (tracks.length === 0) {
    const titles = [...html.matchAll(/"title":\s*\{"runs":\[\{"text":"([^"]+)"/g)].map(m => m[1]);
    const vids = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map(m => m[1]);
    const count = Math.min(titles.length, vids.length);
    for (let i = 0; i < count; i++) {
      tracks.push({ title: cleanYouTubeTitle(titles[i]), artist: "", videoId: vids[i] });
    }
  }

  if (tracks.length === 0) {
    return { success: false, error: "Could not parse YouTube playlist. It may be private." };
  }

  // Get playlist name
  let name = "YouTube Playlist";
  const nameMatch = html.match(/"title":\s*\{"runs":\[\{"text":"([^"]+)"/);
  if (nameMatch) name = nameMatch[1].replace(/&amp;/g, "&").replace(/&#39;/g, "'");

  return {
    success: true,
    source: "youtube",
    playlist: { name, tracks, track_count: tracks.length },
  };
}

async function fetchSpotifyPlaylistClient(playlistId) {
  try {
    const resp = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/playlist/${playlistId}`, { signal: AbortSignal.timeout(8000) });
    const oembed = resp.ok ? await resp.json() : {};
    const name = oembed?.title || "Spotify Playlist";

    // Try embed page via CORS proxy
    const CORS_PROXIES = [
      "https://api.allorigins.win/raw?url=",
      "https://corsproxy.io/?",
    ];
    let html = null;
    for (const proxy of CORS_PROXIES) {
      try {
        const r = await fetch(proxy + encodeURIComponent(`https://open.spotify.com/embed/playlist/${playlistId}`), { signal: AbortSignal.timeout(10000) });
        if (r.ok) { html = await r.text(); break; }
      } catch (_) {}
    }

    const tracks = [];
    if (html) {
      // Extract from __NEXT_DATA__
      const nextMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
      if (nextMatch) {
        try {
          const data = JSON.parse(nextMatch[1]);
          const items = data?.props?.pageProps?.state?.data?.playlist?.tracks?.items || [];
          for (const item of items) {
            const t = item?.track;
            if (!t) continue;
            tracks.push({
              title: t.name || "",
              artist: (t.artists || []).map(a => a.name).join(", "),
            });
          }
        } catch (_) {}
      }
      // Regex fallback
      if (tracks.length === 0) {
        const names = [...html.matchAll(/"name"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
        const artists = [...html.matchAll(/"artists?"?\s*:\s*\[?\{[^}]*"name"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
        for (let i = 0; i < names.length; i++) {
          tracks.push({ title: names[i], artist: artists[i] || "" });
        }
      }
    }

    if (tracks.length === 0) {
      return { success: false, error: "Could not parse Spotify playlist. It may be private." };
    }

    return { success: true, source: "spotify", playlist: { name, tracks, track_count: tracks.length } };
  } catch (err) {
    return { success: false, error: "Failed to load Spotify playlist: " + err.message };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC API — Routes through PHP backend (no CORS issues)
// ═════════════════════════════════════════════════════════════════════════════
export const api = {
  // Health check
  getHealth: async () => {
    try {
      return await backendFetch("health");
    } catch (_) {
      return { status: "error", source: "backend_unreachable" };
    }
  },

  // ─── Search songs ─────────────────────────────────────────────────────────
  search: async (query, offset = 0, limit = 30) => {
    if (!query || !query.trim()) {
      return { query: "", count: 0, results: [], tracks: [], has_more: false };
    }
    try {
      const data = await backendFetch("search", {
        q: query.trim(),
        offset,
        limit,
      });
      return {
        query: query.trim(),
        count: data.count || 0,
        results: data.results || [],
        tracks: data.tracks || [],
        has_more: data.has_more || false,
      };
    } catch (err) {
      console.warn("[API] Search error:", err.message);
      return { query: query.trim(), count: 0, results: [], tracks: [], has_more: false };
    }
  },

  // ─── Autocomplete suggestions ─────────────────────────────────────────────
  getSuggestions: async (query = "") => {
    if (!query || !query.trim()) return { suggestions: [] };
    try {
      const data = await backendFetch("suggestions", { q: query.trim() });
      return { suggestions: data.suggestions || [] };
    } catch (_) {
      return { suggestions: [] };
    }
  },

  // ─── Home feed ────────────────────────────────────────────────────────────
  getHomeFeed: async (_userId, forceRefresh = false) => {
    try {
      const data = await backendFetch("home", {
        user_id: _userId,
        force: forceRefresh ? "true" : "false",
      });
      return { sections: data.sections || [], _raw: data._raw };
    } catch (err) {
      console.warn("[API] Home feed error:", err.message);
      return { sections: [] };
    }
  },

  getPersonalizedFeed: async () => {
    try {
      const data = await backendFetch("feed/personalized");
      return { sections: data.sections || [], personalized: data.personalized || false };
    } catch (_) {
      return { sections: [], personalized: false };
    }
  },

  // ─── Lyrics (via PHP backend → lrclib.net) ──────────────────────────────
  getLyrics: async (title, artist = "", _videoId = "") => {
    if (!title || !title.trim()) {
      return { has_lyrics: false, is_synced: false, synced_lyrics: [], plain_lyrics: "", instrumental: false };
    }
    try {
      const data = await backendFetch("lyrics", {
        title: title.trim(),
        artist: artist.trim(),
        video_id: _videoId,
      }, { timeout: 5000 });
      return {
        has_lyrics: data.has_lyrics || false,
        is_synced: data.is_synced || false,
        synced_lyrics: data.synced_lyrics || [],
        plain_lyrics: data.plain_lyrics || "",
        plainLyrics: data.plainLyrics || data.plain_lyrics || "",
        syncedLyrics: data.syncedLyrics || null,
        instrumental: data.instrumental || false,
      };
    } catch (err) {
      console.warn("[API] Lyrics fetch error:", err.message);
    }
    return { has_lyrics: false, is_synced: false, synced_lyrics: [], plain_lyrics: "", instrumental: false };
  },

  // ─── Stream URL (PHP backend decrypts DES-ECB) ──────────────────────────
  getStream: async (videoIdOrTrackId, retries = 2) => {
    if (!videoIdOrTrackId) return { stream_url: null, proxy_url: null };
    const cleanId = String(videoIdOrTrackId).replace(/^saavn_/, "").trim();

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const data = await backendFetch(`stream/${cleanId}`, {}, { timeout: 8000 });
        if (data && data.stream_url) {
          return {
            stream_url: data.stream_url,
            videoId: data.videoId || cleanId,
            id: data.id || `saavn_${cleanId}`,
            duration: data.duration,
          };
        }
      } catch (err) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        console.warn(`[API] Stream resolve failed for ${cleanId}:`, err.message);
      }
    }
    return { stream_url: null, proxy_url: null, videoId: cleanId, id: `saavn_${cleanId}` };
  },

  getSaavnStream: async (id) => api.getStream(id),

  // ─── Track image resolution ───────────────────────────────────────────────
  getTrackImage: async (videoIdOrTrackId, title = "", artist = "") => {
    if (!videoIdOrTrackId) return null;
    const cleanId = String(videoIdOrTrackId).replace(/^saavn_/, "").trim();
    if (!cleanId) return null;

    try {
      const data = await backendFetch(`track/${cleanId}/image`);
      return data?.image || null;
    } catch (_) {}

    // Fallback: search for image
    try {
      const query = title ? `${title} ${artist}`.trim() : cleanId;
      const data = await backendFetch("search", { q: query, offset: 0, limit: 5 });
      const results = data?.results || [];
      const match = results.find((r) => {
        const rid = String(r.id || "").replace(/^saavn_/, "");
        return rid === cleanId || r.title?.toLowerCase() === title?.toLowerCase();
      });
      if (match?.image) return match.image;
    } catch (_) {}
    return null;
  },

  getTrackInfo: async (videoId) => {
    try {
      const data = await backendFetch(`track/${videoId}`);
      return data || {};
    } catch (_) {
      return {};
    }
  },

  // ─── Artist search ────────────────────────────────────────────────────────
  searchArtists: async (query, limit = 10) => {
    if (!query || !query.trim()) return { artists: [], results: [] };
    try {
      const data = await backendFetch("artists/search", { q: query.trim(), limit });
      return { artists: data.artists || [], results: data.results || [] };
    } catch (err) {
      console.warn("[API] Artist search error:", err.message);
      return { artists: [], results: [] };
    }
  },

  // ─── Artist songs (via /search?q=artistName+songs) ────────────────────────
  getArtistSongs: async (artistIdOrName, page = 1, limit = 20) => {
    if (!artistIdOrName) return { tracks: [], results: [], has_more: false };

    try {
      // Fetch up to 100 results from the search endpoint
      const data = await backendFetch(`search`, {
        q: `${artistIdOrName} songs`,
        offset: 0,
        limit: 100,
      });
      const allResults = data.results || [];

      // Filter to only songs by this artist
      const target = (artistIdOrName || "").toLowerCase();
      const filtered = allResults.filter((song) => {
        const artist = (song.artist || "").toLowerCase();
        const title = (song.title || "").toLowerCase();
        return (
          artist.includes(target) ||
          target.includes(artist) ||
          title.includes(target)
        );
      });

      // Paginate through filtered results
      const offset = (page - 1) * limit;
      const pageTracks = filtered.slice(offset, offset + limit);
      const hasMore = (offset + limit) < filtered.length;

      return {
        tracks: pageTracks,
        results: pageTracks,
        has_more: hasMore,
        artist: {},
        total: filtered.length,
      };
    } catch (err) {
      console.warn("[API] Artist songs error:", err.message);
    }

    // Fallback: generic search
    try {
      return await api.search(`${artistIdOrName} songs`, (page - 1) * limit, limit);
    } catch (_) {
      return { tracks: [], results: [], has_more: false };
    }
  },

  // ─── Artist image ─────────────────────────────────────────────────────────
  getArtistImage: async (artistIdOrName) => {
    if (!artistIdOrName) return { image: null };
    try {
      const cached = await getCachedArtist(artistIdOrName);
      if (cached && (cached.imageUrl || cached.image)) {
        return { image: cached.imageUrl || cached.image, id: cached.id };
      }

      const data = await backendFetch(`artist/${artistIdOrName}/image`);
      if (data?.image) {
        saveCachedArtist({ id: data.id || artistIdOrName, name: artistIdOrName, imageUrl: data.image }).catch(() => {});
        return { image: data.image, id: data.id };
      }
    } catch (_) {}
    return { image: null };
  },

  // ─── Artist full info (bio, followers, etc.) ──────────────────────────────
  getArtistInfo: async (artistIdOrName) => {
    if (!artistIdOrName) return { artist: null, top_songs: [], similar_artists: [] };
    try {
      const data = await backendFetch(`artist/${artistIdOrName}/info`);
      return {
        artist: data.artist || null,
        top_songs: data.top_songs || [],
        similar_artists: data.similar_artists || [],
        top_songs_count: data.top_songs_count || 0,
      };
    } catch (err) {
      console.warn("[API] Artist info error:", err.message);
      return { artist: null, top_songs: [], similar_artists: [] };
    }
  },

  // ─── Related / Similar artists ────────────────────────────────────────────
  getRelatedArtists: async (artistIdOrName, limit = 6) => {
    if (!artistIdOrName) return { artists: [], related: [] };
    try {
      const data = await backendFetch(`artist/${artistIdOrName}/related`, { limit });
      const artists = data.artists || data.related || [];
      artists.forEach((a) => {
        if (a.image) saveCachedArtist({ id: a.id || a.name, name: a.name, imageUrl: a.image }).catch(() => {});
      });
      return { artists, related: artists };
    } catch (_) {
      return { artists: [], related: [] };
    }
  },

  // ─── Batch fetch artist images ────────────────────────────────────────────
  getBatchArtistImages: async (artists) => {
    if (!Array.isArray(artists) || artists.length === 0) return { images: {} };
    const images = {};
    const missing = [];

    const cachedMap = await getBatchCachedArtists(artists);
    artists.forEach((item) => {
      const key = typeof item === "object" ? item.id || item.name : item;
      const name = typeof item === "object" ? item.name : item;
      if (cachedMap[key]?.imageUrl) {
        images[name] = cachedMap[key].imageUrl;
        images[key] = cachedMap[key].imageUrl;
      } else {
        missing.push(item);
      }
    });

    if (missing.length > 0) {
      try {
        const data = await backendFetch("artists/batch-images", {}, {
          method: "POST",
          body: { artists: missing },
        });
        Object.assign(images, data.images || {});
      } catch (_) {
        // Fallback: fetch individually
        const results = await Promise.allSettled(
          missing.map(async (item) => {
            const queryName = typeof item === "object" ? item.name || item.id : item;
            try {
              const result = await api.getArtistImage(queryName);
              if (result?.image) {
                saveCachedArtist({ id: queryName, name: queryName, imageUrl: result.image }).catch(() => {});
                return { name: queryName, thumbnail: result.image };
              }
            } catch (_) {}
            return null;
          })
        );
        results.forEach((r) => {
          if (r.status === "fulfilled" && r.value) {
            images[r.value.name] = r.value.thumbnail;
          }
        });
      }
    }
    return { images };
  },

  // ─── Popular artists by language ──────────────────────────────────────────
  getPopularArtists: async (language = "Hindi", limit = 12) => {
    try {
      const data = await backendFetch("artists/popular", { lang: language, limit });
      return { artists: data.artists || [], results: data.results || [] };
    } catch (_) {
      return { artists: [], results: [] };
    }
  },

  // ─── User data stubs (handled by Firebase directly) ───────────────────────
  recordPlayEvent: () => Promise.resolve({}),
  toggleFavorite: () => Promise.resolve({}),
  getFavorites: () => Promise.resolve({ favorites: [] }),
  getUserHistory: () => Promise.resolve({ recent: [], stats: {} }),
  onboardUser: () => Promise.resolve({}),
  getUserProfile: () => Promise.resolve({}),
  getUserPlaylists: () => Promise.resolve([]),
  createPlaylist: () => Promise.resolve({}),
  getPlaylistDetails: () => Promise.resolve({}),
  updatePlaylist: () => Promise.resolve({}),
  addTrackToPlaylist: () => Promise.resolve({}),
  removeTrackFromPlaylist: () => Promise.resolve({}),
  deletePlaylist: () => Promise.resolve({}),
  savePremiumSubscription: () => Promise.resolve({}),

  // ─── YouTube / Spotify Playlist Import ────────────────────────────────────
  importYouTubePlaylist: async (url) => {
    // Try backend import first
    try {
      const data = await backendFetch("import", {}, {
        method: "POST",
        body: { url },
        timeout: 15000,
      });
      if (data?.success && data?.playlist?.tracks?.length > 0) {
        return data;
      }
    } catch (err) {
      console.warn("[API] Backend import failed, trying client-side:", err.message);
    }

    // Client-side fallback: fetch YouTube page via CORS proxy
    const playlistId = extractYouTubePlaylistId(url);
    if (playlistId) {
      return await fetchYouTubePlaylistClient(playlistId);
    }

    // Spotify fallback
    const spotifyId = extractSpotifyPlaylistId(url);
    if (spotifyId) {
      return await fetchSpotifyPlaylistClient(spotifyId);
    }

    return { success: false, error: "Could not load playlist. Please check the link and try again." };
  },

  // ─── QR Login stubs ──────────────────────────────────────────────────────
  createQRSession: () => Promise.resolve({ error: "Not available" }),
  pollQRSession: () => Promise.resolve({ error: "Not available" }),
  claimQRSession: () => Promise.resolve({ error: "Not available" }),
  claimQRSessionWithPin: () => Promise.resolve({ error: "Not available" }),
  loginPhoneWithCode: () => Promise.resolve({ error: "Not available" }),
  loginWithPin: () => Promise.resolve({ error: "Not available" }),

  // ─── Referral stubs ───────────────────────────────────────────────────────
  createReferral: () => Promise.resolve({ error: "Not available" }),
  claimReferral: () => Promise.resolve({ error: "Not available" }),
  getReferralStats: () => Promise.resolve({ error: "Not available" }),

  // ─── Song Recognizer (stub) ───────────────────────────────────────────────
  recognizeSong: () => Promise.resolve({ error: "Not available" }),
};
