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

  // ─── Artist songs (from artist page topSongs + search fallback) ───────────
  getArtistSongs: async (artistIdOrName, page = 1, limit = 20) => {
    if (!artistIdOrName) return { tracks: [], results: [], has_more: false };
    try {
      const data = await backendFetch(`artist/${artistIdOrName}/songs`, {
        page,
        limit,
      });
      const tracks = data.tracks || [];
      const results = data.results || tracks;
      
      // Use backend's has_more if provided, otherwise infer from page size
      let hasMore;
      if (typeof data.has_more === "boolean") {
        hasMore = data.has_more;
      } else {
        hasMore = tracks.length >= limit;
      }
      
      return {
        tracks,
        results,
        has_more: hasMore,
        artist: data.artist || {},
        total: data.total || tracks.length,
      };
    } catch (err) {
      console.warn("[API] Artist songs error:", err.message);
    }

    // Fallback: search for artist songs
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

  // ─── YouTube Playlist Import (stub) ──────────────────────────────────────
  importYouTubePlaylist: async (url) => {
    try {
      const data = await backendFetch("import", {}, {
        method: "POST",
        body: { url },
      });
      return data;
    } catch (err) {
      console.warn("[API] YouTube/Spotify import error:", err.message);
      throw err;
    }
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
