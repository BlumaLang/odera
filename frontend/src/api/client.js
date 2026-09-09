// API client — connects to Render production backend (https://staytup.onrender.com)
// for all data loading: search, home feed, lyrics, suggestions, artist search.
// Music playback is handled directly client-side via the default YouTube web engine.
import { Platform } from "react-native";
import { getCachedArtist, saveCachedArtist, getBatchCachedArtists } from "../services/firebase";

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
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    if (window.location.port === "3000") {
      return window.location.origin;
    }
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

  // Search songs via Saavn direct audio catalog
  search: async (query, offset = 0, limit = 30) => {
    if (!query || !query.trim()) {
      return { query: "", count: 0, results: [], tracks: [], has_more: false };
    }
    try {
      const q = encodeURIComponent(query.trim());
      const data = await request(`/api/search/saavn?q=${q}&offset=${offset}&limit=${limit}`);
      const raw = data?.results || data?.tracks || [];
      const list = raw.map((item) => ({
        ...item,
        artwork_url: item.artwork_url || item.thumbnail || "",
        thumbnail: item.thumbnail || item.artwork_url || "",
      }));
      return {
        query,
        count: list.length,
        results: list,
        tracks: list,
        has_more: Boolean(data?.has_more ?? (list.length >= 20)),
      };
    } catch (err) {
      console.warn("Saavn search request error:", err.message);
      // Fallback to standard search if Saavn endpoint fails
      try {
        const q = encodeURIComponent(query.trim());
        const data = await request(`/api/search?q=${q}&offset=${offset}&limit=${limit}`);
        const raw = data?.results || data?.tracks || [];
        return { query, count: raw.length, results: raw, tracks: raw, has_more: false };
      } catch (_) {
        return { query, count: 0, results: [], tracks: [], has_more: false };
      }
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

  // Home feed — direct Saavn rich trending sections
  getHomeFeed: async (userId = DEFAULT_USER_ID, forceRefresh = false) => {
    try {
      const data = await request(`/api/home/saavn${forceRefresh ? "?force_refresh=true" : ""}`);
      if (data && Array.isArray(data.sections) && data.sections.length > 0) {
        return data;
      }
    } catch (err) {
      console.warn("Error fetching Saavn feed, falling back:", err.message);
    }
    // Fallback to legacy /home
    try {
      const data = await request(`/home${forceRefresh ? "?force_refresh=true" : ""}`);
      if (data && Array.isArray(data.sections) && data.sections.length > 0) {
        return data;
      }
    } catch (_) {}
    return { sections: [] };
  },

  // Personalized feed — deprecated mood sections removed
  getPersonalizedFeed: async () => {
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

  // Stream — resolves fresh direct audio stream URL from Saavn (with retry for rate limits)
  getStream: async (videoIdOrTrackId, retries = 3) => {
    if (!videoIdOrTrackId) return { stream_url: null, proxy_url: null };
    const cleanId = String(videoIdOrTrackId).replace(/^saavn_/, "").trim();
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const data = await request(`/api/stream/saavn/${encodeURIComponent(cleanId)}`);
        return {
          ...data,
          stream_url: data?.stream_url || null,
          videoId: cleanId,
          id: `saavn_${cleanId}`,
        };
      } catch (err) {
        const is429 = err.message?.includes("429");
        const is502 = err.message?.includes("502");
        if ((is429 || is502) && attempt < retries) {
          const delay = Math.min(1500 * Math.pow(2, attempt), 6000);
          console.warn(`[API] Stream resolve ${is429 ? "429 rate limited" : "502"} for ${cleanId}, retry ${attempt + 1}/${retries} after ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        console.warn(`[API] Backend failed to resolve Saavn stream for ${cleanId}, trying direct provider fallback:`, err.message);
        try {
          const directUrls = [
            `https://staytup-api.onrender.com/api/songs/${encodeURIComponent(cleanId)}`,
            `https://saavn.sumit.co/api/songs/${encodeURIComponent(cleanId)}`,
          ];
          for (const dUrl of directUrls) {
            try {
              const res = await fetch(dUrl, { signal: AbortSignal.timeout(6000) });
              if (res.ok) {
                const sData = await res.json();
                const song = Array.isArray(sData?.data) ? sData.data[0] : sData?.data;
                const dList = song?.downloadUrl;
                if (Array.isArray(dList) && dList.length > 0) {
                  const sorted = [...dList].sort((a, b) => {
                    const qa = parseInt(a.quality || 0, 10);
                    const qb = parseInt(b.quality || 0, 10);
                    return qb - qa;
                  });
                  return {
                    stream_url: sorted[0]?.url || dList[dList.length - 1]?.url,
                    videoId: cleanId,
                    id: `saavn_${cleanId}`,
                    duration: song?.duration ? parseInt(song.duration, 10) : undefined,
                  };
                }
              }
            } catch (_) {}
          }
        } catch (_) {}
        throw err;
      }
    }
  },

  getSaavnStream: async (id) => {
    return api.getStream(id);
  },

  // Track info via oEmbed on backend
  getTrackInfo: (videoId) => request(`/api/track-info?v=${encodeURIComponent(videoId)}`),

  // Search artists live via Staytup API
  searchArtists: async (query, limit = 10) => {
    if (!query || !query.trim()) return { artists: [], results: [] };
    const cleanQ = query.trim();

    // 1. Direct call to Staytup API for fastest, verified Saavn artist data
    try {
      const directUrl = `https://staytup-api.onrender.com/api/search/artists?query=${encodeURIComponent(cleanQ)}&limit=${limit}`;
      const resp = await fetch(directUrl, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const json = await resp.json();
        const rawList = json?.data?.results || [];
        if (Array.isArray(rawList) && rawList.length > 0) {
          const normalized = rawList
            .filter((a) => a && a.name)
            .map((a) => {
              const id = String(a.id || a.artistId || "");
              const name = a.name.trim();
              const imgUrl = Array.isArray(a.image)
                ? (a.image[2]?.url || a.image[1]?.url || a.image[0]?.url || null)
                : (typeof a.image === "string" ? a.image : null);
              if (id && imgUrl) {
                saveCachedArtist({ id, name, imageUrl: imgUrl }).catch(() => {});
              }
              return {
                id,
                name,
                image: imgUrl,
                thumbnail: imgUrl,
                role: a.role || "Artist",
                type: "artist",
              };
            })
            .filter((a) => a.name.length > 1 && !a.name.toLowerCase().includes("default"));

          if (normalized.length > 0) {
            return { artists: normalized, results: normalized };
          }
        }
      }
    } catch (_) {}

    // 2. Fallback to backend /artists/search
    try {
      const data = await request(`/artists/search?q=${encodeURIComponent(cleanQ)}&limit=${limit}`);
      const list = data?.results || data?.artists || [];
      const normalized = list.map((a) => {
        const id = String(a.id || a.artistId || "");
        const name = a.name || a.artist || a.title || "";
        const image = a.image || a.thumbnail || a.artwork_url || null;
        if (id && image) {
          saveCachedArtist({ id, name, imageUrl: image }).catch(() => {});
        }
        return {
          id,
          name,
          image,
          thumbnail: image,
          role: a.role || "Artist",
          type: "artist",
        };
      });
      return {
        artists: normalized,
        results: normalized,
      };
    } catch (_) {
      return { artists: [], results: [] };
    }
  },

  // Firebase-backed user data endpoints (no-op stubs if called directly)
  recordPlayEvent: () => Promise.resolve({}),
  toggleFavorite: () => Promise.resolve({}),
  getFavorites: () => Promise.resolve({ favorites: [] }),
  getUserHistory: () => Promise.resolve({ recent: [], stats: {} }),
  onboardUser: () => Promise.resolve({}),
  getUserProfile: () => Promise.resolve({}),

  // Get artist image: check RTDB first, then Staytup API, save to RTDB
  getArtistImage: async (artistIdOrName) => {
    if (!artistIdOrName) return { image: null };
    try {
      const cached = await getCachedArtist(artistIdOrName);
      if (cached && (cached.imageUrl || cached.image)) {
        return { image: cached.imageUrl || cached.image, id: cached.id };
      }
      const cleanName = String(artistIdOrName).trim();
      const directUrl = `https://staytup-api.onrender.com/api/search/artists?query=${encodeURIComponent(cleanName)}&limit=1`;
      const resp = await fetch(directUrl, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const json = await resp.json();
        const first = json?.data?.results?.[0];
        if (first) {
          const img = Array.isArray(first.image)
            ? (first.image[2]?.url || first.image[1]?.url || first.image[0]?.url)
            : first.image;
          if (img && !img.includes("artist-default-music.png") && !img.includes("default_artist")) {
            saveCachedArtist({
              id: String(first.id || cleanName),
              name: first.name || cleanName,
              imageUrl: img,
            }).catch(() => {});
            return { image: img, id: String(first.id || "") };
          }
        }
      }
      return { image: null };
    } catch (_) {
      return { image: null };
    }
  },

  // Get related/similar artists via Staytup API
  getRelatedArtists: async (artistIdOrName, limit = 6) => {
    if (!artistIdOrName) return { artists: [], related: [] };
    try {
      const param = encodeURIComponent(String(artistIdOrName).trim());
      const data = await request(`/artists/similar?q=${param}&id=${param}&limit=${limit}`);
      const list = data?.artists || data?.results || [];
      const normalized = list.map((a) => {
        const id = String(a.id || "");
        const name = a.name || a.artist || "";
        const image = a.image || a.thumbnail || null;
        if (image) {
          saveCachedArtist({ id: id || name, name, imageUrl: image }).catch(() => {});
        }
        return {
          id: id || name,
          name,
          image,
          thumbnail: image,
          type: "artist",
        };
      });
      return { artists: normalized, related: normalized };
    } catch (_) {
      return { artists: [], related: [] };
    }
  },

  // Batch fetch artist images from DB cache and Staytup API
  getBatchArtistImages: async (artists) => {
    if (!Array.isArray(artists) || artists.length === 0) {
      return { images: {} };
    }
    try {
      const images = {};
      const missing = [];

      // 1. Check local DB cache
      const cachedMap = await getBatchCachedArtists(artists);
      artists.forEach((item) => {
        const key = typeof item === "object" ? (item.id || item.name) : item;
        const name = typeof item === "object" ? item.name : item;
        if (cachedMap[key]?.imageUrl) {
          images[name] = cachedMap[key].imageUrl;
          images[key] = cachedMap[key].imageUrl;
        } else if (cachedMap[name]?.imageUrl) {
          images[name] = cachedMap[name].imageUrl;
          images[key] = cachedMap[name].imageUrl;
        } else {
          missing.push(item);
        }
      });

      // 2. Fetch missing from Staytup API in parallel and upload to database cache
      if (missing.length > 0) {
        const fetchResults = await Promise.allSettled(
          missing.map(async (item) => {
            const queryName = typeof item === "object" ? (item.name || item.id) : item;
            const directUrl = `https://staytup-api.onrender.com/api/search/artists?query=${encodeURIComponent(queryName)}&limit=1`;
            const resp = await fetch(directUrl, { signal: AbortSignal.timeout(5000) });
            if (resp.ok) {
              const json = await resp.json();
              const first = json?.data?.results?.[0];
              if (first) {
                const img = Array.isArray(first.image)
                  ? (first.image[2]?.url || first.image[1]?.url || first.image[0]?.url)
                  : first.image;
                if (img && !img.includes("artist-default-music.png") && !img.includes("default_artist")) {
                  saveCachedArtist({
                    id: String(first.id || queryName),
                    name: first.name || queryName,
                    imageUrl: img,
                  }).catch(() => {});
                  return { name: queryName, id: String(first.id || ""), thumbnail: img };
                }
              }
            }
            return null;
          })
        );

        fetchResults.forEach((r) => {
          if (r.status === "fulfilled" && r.value) {
            images[r.value.name] = r.value.thumbnail;
            if (r.value.id) images[r.value.id] = r.value.thumbnail;
          }
        });
      }

      return { images };
    } catch (_) {
      return { images: {} };
    }
  },
  getUserPlaylists: () => Promise.resolve([]),
  createPlaylist: () => Promise.resolve({}),
  getPlaylistDetails: () => Promise.resolve({}),
  updatePlaylist: () => Promise.resolve({}),
  addTrackToPlaylist: () => Promise.resolve({}),
  removeTrackFromPlaylist: () => Promise.resolve({}),
  deletePlaylist: () => Promise.resolve({}),
  savePremiumSubscription: () => Promise.resolve({}),

  // YouTube Playlist Import
  importYouTubePlaylist: (playlistUrlOrId) =>
    request(`/api/import-playlist?url=${encodeURIComponent(playlistUrlOrId)}`),

  // QR Login (Device Linking) & 4-Digit PIN Authentication
  createQRSession: (user = null) =>
    request("/api/qr-login/create", {
      method: "POST",
      body: user ? JSON.stringify({ user }) : undefined,
    }),
  pollQRSession: (sid) => request(`/api/qr-login/status/${encodeURIComponent(sid)}`),
  claimQRSession: (target, user = null) => {
    const payload = typeof target === "object" ? { ...target, ...(user ? { user } : {}) } : { sid: target, ...(user ? { user } : {}) };
    return request("/api/qr-login/claim", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  claimQRSessionWithPin: (pin, user = null) =>
    request("/api/qr-login/claim", {
      method: "POST",
      body: JSON.stringify({ pin, ...(user ? { user } : {}) }),
    }),
  loginPhoneWithCode: (code) =>
    request("/api/qr-login/phone-login", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  loginWithPin: (username, pin) =>
    request("/api/auth/pin-login", {
      method: "POST",
      body: JSON.stringify({ username, pin }),
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

  // Song Recognizer (Shazam / AudD)
  recognizeSong: async (base64Audio, audioUrl = null) => {
    return await request("/api/recognize", {
      method: "POST",
      body: JSON.stringify({ audio: base64Audio, url: audioUrl }),
    });
  },
};
