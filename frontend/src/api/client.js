// API client — connects to Render production backend (https://staytup.onrender.com)
// for all data loading: search, home feed, lyrics, suggestions, artist search.
// Music playback is handled directly client-side via the default YouTube web engine.
import { Platform } from "react-native";

// Primary production backend link on Render
const RENDER_BASE_URL = "https://staytup.onrender.com";

let customBaseUrl = null;

export function getBackendBase() {
  if (customBaseUrl) {
    return customBaseUrl;
  }
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
  }
  return RENDER_BASE_URL;
}

export const setApiBaseUrl = (url) => {
  if (url) {
    customBaseUrl = url.replace(/\/$/, "");
  }
};

export const getApiBaseUrl = () => getBackendBase();

// Standard user identifier
export const DEFAULT_USER_ID = "staytup_user_main";

// Helper to parse LRC lyrics strings
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

// Core request with timeout + 1 auto-retry
async function request(endpoint, options = {}, retries = 1) {
  const base = getBackendBase();
  const url = endpoint.startsWith("http") ? endpoint : `${base}${endpoint}`;
  const timeoutMs = 25000;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  const config = {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    ...(controller && !options.signal ? { signal: controller.signal } : {}),
  };

  try {
    const response = await fetch(url, config);
    if (timeoutId) clearTimeout(timeoutId);

    if (!response.ok) {
      if ((response.status === 408 || response.status === 502 || response.status === 503) && retries > 0) {
        await new Promise((r) => setTimeout(r, 1200));
        return request(endpoint, options, retries - 1);
      }
      const body = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${body || response.statusText}`);
    }
    return await response.json();
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    if (err.name === "AbortError" && retries > 0) {
      await new Promise((r) => setTimeout(r, 1200));
      return request(endpoint, options, retries - 1);
    }
    throw err;
  }
}



// Ping backend on app launch to keep Render instance warm
export const warmupBackend = () => {
  fetch(`${getBackendBase()}/api/health`).catch(() => {});
};

export const api = {
  // Health check
  getHealth: () => request("/api/health"),

  // Search songs via https://staytup.onrender.com backend
  search: async (query, offset = 0, limit = 25) => {
    if (!query || !query.trim()) {
      return { query: "", count: 0, results: [], tracks: [], has_more: false };
    }
    try {
      const q = encodeURIComponent(query.trim());
      const data = await request(`/api/search?q=${q}&offset=${offset}&limit=${limit}`);
      const raw = data?.results || data?.tracks || [];
      const list = raw.map((item) => ({
        ...item,
        artwork_url: item.artwork_url || item.thumbnail || `https://i.ytimg.com/vi/${item.videoId || item.video_id}/mqdefault.jpg`,
        thumbnail: item.thumbnail || item.artwork_url || `https://i.ytimg.com/vi/${item.videoId || item.video_id}/mqdefault.jpg`,
      }));
      return {
        query,
        count: list.length,
        results: list,
        tracks: list,
        has_more: Boolean(data?.has_more ?? (list.length >= 20)),
      };
    } catch (err) {
      console.warn("Search request error:", err.message);
      return { query, count: 0, results: [], tracks: [], has_more: false };
    }
  },

  // Autocomplete suggestions
  getSuggestions: async (query = "") => {
    if (!query || !query.trim()) return { suggestions: [] };
    try {
      return await request(`/api/suggest?q=${encodeURIComponent(query.trim())}`);
    } catch (_) {
      return { suggestions: [] };
    }
  },

  // Home feed — structured into sections for HomeScreen
  getHomeFeed: async (userId = DEFAULT_USER_ID, forceRefresh = false) => {
    try {
      const data = await request(`/home${forceRefresh ? "?force_refresh=true" : ""}`);
      if (data && Array.isArray(data.sections) && data.sections.length > 0) {
        return data;
      }
      if (data && (data.trending || data.recommended)) {
        const norm = (arr = []) =>
          arr.map((item) => ({
            ...item,
            artwork_url: item.artwork_url || item.thumbnail || `https://i.ytimg.com/vi/${item.videoId || item.video_id}/mqdefault.jpg`,
            thumbnail: item.thumbnail || item.artwork_url || `https://i.ytimg.com/vi/${item.videoId || item.video_id}/mqdefault.jpg`,
          }));
        const trending = norm(data.trending || []);
        const recommended = norm(data.recommended || []);
        const freshPicks = norm(data.freshPicks || []);
        return {
          sections: [
            { id: "trending_hits", title: "Trending Hits", tracks: trending },
            { id: "recommended_foryou", title: "Recommended For You", tracks: recommended },
            { id: "fresh_picks", title: "Fresh Picks", tracks: freshPicks },
          ],
          trending,
          recommended,
          freshPicks,
          moods: data.moods || [],
        };
      }
    } catch (err) {
      console.warn("Error fetching feed:", err.message);
    }
    return { sections: [] };
  },

  // Personalized "For You" feed based on user listening patterns
  getPersonalizedFeed: async (userId = "guest") => {
    try {
      const data = await request(`/api/personalized/${encodeURIComponent(userId)}`);
      if (data && Array.isArray(data.sections)) {
        const norm = (arr) =>
          (arr || []).map((t) => ({
            ...t,
            artwork_url: t.artwork_url || t.thumbnail || "",
            videoId: t.videoId || t.video_id,
            video_id: t.videoId || t.video_id,
          }));
        const sections = data.sections.map((s) => ({
          ...s,
          items: norm(s.tracks || []),
        }));
        return { sections, personalized: data.personalized };
      }
    } catch (err) {
      console.warn("Error fetching personalized feed:", err.message);
    }
    return { sections: [], personalized: false };
  },

  // Lyrics — proxied through backend
  getLyrics: async (title, artist = "", videoId = "") => {
    if (!title || !title.trim()) {
      return { has_lyrics: false, is_synced: false, synced_lyrics: [], plain_lyrics: "", instrumental: false };
    }
    try {
      const qs = new URLSearchParams({
        title: title.trim(),
        artist: (artist || "").trim(),
        videoId: videoId || "",
      }).toString();
      const data = await request(`/api/lyrics?${qs}`);
      if (data) {
        let synced = [];
        if (Array.isArray(data.synced_lyrics)) {
          synced = data.synced_lyrics;
        } else if (Array.isArray(data.syncedLyrics)) {
          synced = data.syncedLyrics;
        } else if (typeof (data.syncedLyrics || data.synced_lyrics) === "string") {
          synced = parseLrc(data.syncedLyrics || data.synced_lyrics);
        }

        const plain =
          data.plain_lyrics ||
          data.plainLyrics ||
          (synced.length > 0 ? synced.map((s) => s.text).join("\n") : "");

        const has = Boolean(synced.length > 0 || (plain && plain.trim().length > 0));
        return {
          has_lyrics: has,
          is_synced: synced.length > 0,
          synced_lyrics: synced,
          plain_lyrics: plain,
          plainLyrics: plain,
          syncedLyrics: data.syncedLyrics || null,
          instrumental: Boolean(data.instrumental),
        };
      }
    } catch (err) {
      console.warn("Lyrics fetch error:", err.message);
    }
    return { has_lyrics: false, is_synced: false, synced_lyrics: [], plain_lyrics: "", instrumental: false };
  },

  // Stream — on web and in default app runner, music is played directly via YouTube web player (no yt-dlp)
  getStream: async (videoId) => {
    return { stream_url: null, proxy_url: null, videoId };
  },

  // Track info via oEmbed on backend
  getTrackInfo: (videoId) => request(`/api/track-info?v=${encodeURIComponent(videoId)}`),

  // Search artists live via backend
  searchArtists: async (query, limit = 10) => {
    try {
      const data = await request(`/artists/search?q=${encodeURIComponent(query)}&limit=${limit}`);
      const list = data?.results || data?.artists || [];
      return {
        artists: list.map((a) => ({
          name: a.artist || a.title || a.name || "",
          thumbnail: a.thumbnail || a.artwork_url || null,
        })),
        results: list,
      };
    } catch (_) {
      return { artists: [] };
    }
  },

  // Firebase-backed user data endpoints (no-op stubs if called directly)
  recordPlayEvent: () => Promise.resolve({}),
  toggleFavorite: () => Promise.resolve({}),
  getFavorites: () => Promise.resolve({ favorites: [] }),
  getUserHistory: () => Promise.resolve({ recent: [], stats: {} }),
  onboardUser: () => Promise.resolve({}),
  getUserProfile: () => Promise.resolve({}),

  // Get artist image from YouTube search
  getArtistImage: async (artistName) => {
    try {
      const data = await request(`/artists/search?q=${encodeURIComponent(artistName)}&limit=1`);
      const results = data?.results || [];
      if (results.length > 0 && results[0].thumbnail) {
        return { image: results[0].thumbnail };
      }
      return { image: null };
    } catch (_) {
      return { image: null };
    }
  },

  // Get related/similar artists by searching for similar names
  getRelatedArtists: async (artistName) => {
    try {
      const data = await request(`/artists/search?q=${encodeURIComponent(artistName)}&limit=6`);
      const results = data?.results || [];
      const related = results
        .filter((a) => (a.artist || a.title || "").toLowerCase() !== artistName.toLowerCase())
        .slice(0, 5)
        .map((a) => ({
          name: a.artist || a.title || a.name || "",
          thumbnail: a.thumbnail || a.artwork_url || null,
        }));
      return { artists: related };
    } catch (_) {
      return { artists: [] };
    }
  },

  getBatchArtistImages: () => Promise.resolve({ images: {} }),
  getUserPlaylists: () => Promise.resolve([]),
  createPlaylist: () => Promise.resolve({}),
  getPlaylistDetails: () => Promise.resolve({}),
  updatePlaylist: () => Promise.resolve({}),
  addTrackToPlaylist: () => Promise.resolve({}),
  removeTrackFromPlaylist: () => Promise.resolve({}),
  deletePlaylist: () => Promise.resolve({}),
  savePremiumSubscription: () => Promise.resolve({}),

  // QR Login (Device Linking)
  createQRSession: () => request("/api/qr-login/create", { method: "POST" }),
  pollQRSession: (sid) => request(`/api/qr-login/status/${encodeURIComponent(sid)}`),
  claimQRSession: (sid, user) =>
    request("/api/qr-login/claim", {
      method: "POST",
      body: JSON.stringify({ sid, user }),
    }),

  // Referral System
  createReferral: (userId, username) =>
    request("/api/referral/create", {
      method: "POST",
      body: JSON.stringify({ userId, username }),
    }),
  claimReferral: (code, newUserId) =>
    request("/api/referral/claim", {
      method: "POST",
      body: JSON.stringify({ code, newUserId }),
    }),
  getReferralStats: (code) => request(`/api/referral/stats/${encodeURIComponent(code)}`),
};
