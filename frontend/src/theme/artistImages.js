import { api } from "../api/client";

/**
 * Dynamic Artist Image & Metadata System
 * All artist metadata and images are retrieved dynamically from the Staytup API
 * and cached in Firebase Realtime Database.
 * No hardcoded dummy image URLs or static lists.
 */

// Retained as empty dictionary for backwards compatibility
export const DEFAULT_ARTIST_IMAGES = {};

/**
 * Resolves artist photo from dynamic URL or returns null.
 * Strictly avoids dummy/placeholder fallbacks.
 */
export function resolveLocalArtistImage(artistName, dynamicUrl = null) {
  if (dynamicUrl && typeof dynamicUrl === "string" && dynamicUrl.trim().length > 0) {
    const trimmed = dynamicUrl.trim();
    if (!trimmed.includes("artist-default-music.png") && !trimmed.includes("default_artist")) {
      return trimmed;
    }
  }
  if (!artistName || typeof artistName !== "string") return null;
  const clean = artistName.trim();
  if (DEFAULT_ARTIST_IMAGES[clean]) {
    return DEFAULT_ARTIST_IMAGES[clean];
  }
  return null;
}

// Deprecated: Retained as empty dictionary for backward compatibility
export const LANGUAGE_POPULAR_ARTISTS = {};

export function getPopularArtistsForLanguage(language) {
  return [];
}

// Dynamic in-memory cache for language top artists
const languageArtistsMemoryCache = new Map();

/**
 * Dynamically fetches popular artists for a specific language from Staytup API
 * and caches them in memory.
 */
export async function fetchPopularArtistsForLanguage(language, limit = 12) {
  if (!language) return [];
  const cleanLang = String(language).trim();
  const cacheKey = `${cleanLang.toLowerCase()}_${limit}`;

  if (languageArtistsMemoryCache.has(cacheKey)) {
    return languageArtistsMemoryCache.get(cacheKey);
  }

  try {
    const res = await api.getPopularArtists(cleanLang, limit);
    const artists = res?.artists || res?.results || [];
    if (Array.isArray(artists) && artists.length > 0) {
      languageArtistsMemoryCache.set(cacheKey, artists);
      return artists;
    }
  } catch (err) {
    console.warn(`[fetchPopularArtistsForLanguage] Error fetching for ${cleanLang}:`, err);
  }

  return [];
}
