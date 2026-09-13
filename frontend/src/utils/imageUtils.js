/**
 * Shared image utilities for consistent, high-quality artwork rendering.
 */

// In-memory global cache for resolved high-res track artwork across the app
export const globalTrackImageCache = new Map();

export function setCachedTrackArtwork(id, url) {
  if (!id || !url) return;
  const cleanId = String(id).replace(/^saavn_/, "").trim();
  const httpsUrl = String(url).replace(/^http:\/\//i, "https://");
  globalTrackImageCache.set(cleanId, httpsUrl);
  if (globalTrackImageCache.size > 3000) {
    const firstKey = globalTrackImageCache.keys().next().value;
    globalTrackImageCache.delete(firstKey);
  }
}

export function getCachedTrackArtwork(id) {
  if (!id) return null;
  const cleanId = String(id).replace(/^saavn_/, "").trim();
  return globalTrackImageCache.get(cleanId) || null;
}

/**
 * Safely extract an image URL from strings, nested objects, or quality arrays.
 */
export function extractImageUrl(val) {
  if (!val) return null;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed || trimmed === "[object Object]" || trimmed === "undefined" || trimmed === "null") {
      return null;
    }
    return trimmed.replace(/^http:\/\//i, "https://");
  }
  if (Array.isArray(val)) {
    // Array of qualities or URLs - try from highest/last to lowest/first
    for (let i = val.length - 1; i >= 0; i--) {
      const extracted = extractImageUrl(val[i]);
      if (extracted) return extracted;
    }
    return null;
  }
  if (typeof val === "object") {
    return (
      extractImageUrl(val.link) ||
      extractImageUrl(val.url) ||
      extractImageUrl(val.image) ||
      extractImageUrl(val.artwork_url) ||
      extractImageUrl(val.thumbnail) ||
      extractImageUrl(val["500x500"]) ||
      extractImageUrl(val["250x250"]) ||
      extractImageUrl(val["150x150"]) ||
      null
    );
  }
  return null;
}

/**
 * Upgrade artwork URLs to the highest available resolution.
 * Handles YouTube thumbnails, JioSaavn, and generic image CDNs.
 * Guarantees HTTPS to prevent iOS WebKit mixed content blocking.
 */
export function getHighResArtwork(url) {
  const extracted = extractImageUrl(url);
  if (!extracted) return null;
  let clean = extracted;

  // Always enforce HTTPS to prevent iOS WebKit mixed-content image blocking
  if (clean.startsWith("http://")) {
    clean = clean.replace(/^http:\/\//i, "https://");
  }

  // YouTube / Google user content — force 512px
  if (clean.includes("yt3.googleusercontent.com") || clean.includes("yt3.ggpht.com")) {
    clean = clean.replace(/=s\d+[^?&]*/, "=s512").replace(/=w\d+-h\d+[^?&]*/, "=s512");
    if (!clean.includes("=")) clean = `${clean}=s512`;
    return clean;
  }

  // JioSaavn CDN — upgrade to 500x500
  if (clean.includes("saavncdn.com") || clean.includes("c.saavncdn.com")) {
    clean = clean.replace(/\/(50x50|150x150|250x250)\//g, "/500x500/");
    clean = clean.replace(/([_-])(50x50|150x150|250x250)\./g, "$1500x500.");
    return clean;
  }

  // YouTube video thumbnails — upgrade to high quality (480x360)
  if (clean.includes("i.ytimg.com/vi/")) {
    // Upgrade low-res thumbnails to hqdefault (reliable 480x360)
    clean = clean.replace(/\/(default|sddefault|mqdefault)\.jpg/, "/hqdefault.jpg");
    return clean;
  }

  // Generic CDN — upgrade to 800px
  clean = clean.replace(/=w\d+-h\d+[^?&]*/, "=w800-h800-l90-rj");
  clean = clean.replace(/=s\d+[^?&]*/, "=s800");

  return clean;
}

/**
 * HTML entity decoder for track titles, artists, and album names.
 */
export function decodeHtml(str) {
  if (!str || typeof str !== "string") return str || "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

/**
 * Get highest quality artist image (always 500x500 or higher).
 * JioSaavn images often have size parameters we can upgrade.
 */
export function getHighResArtistImage(url) {
  if (!url) return null;
  // Apply full artwork upgrade pipeline (handles JioSaavn _150x150., -150x150., /150x150/, YT, etc.)
  let clean = getHighResArtwork(url);
  if (!clean) return null;
  // Additional artist specific params
  clean = clean.replace(/=\d+x\d+/, "=500x500");
  clean = clean.replace(/\/\d+x\d+\//, "/500x500/");
  return clean;
}

/**
 * Resolve artwork from a track object with consistent fallback chain.
 */
export function resolveArtwork(track) {
  if (!track) return null;
  const cleanId = String(track.videoId || track.video_id || track.id || "").replace(/^saavn_/, "").trim();
  const cached = getCachedTrackArtwork(cleanId);
  if (cached) return cached;

  const raw =
    extractImageUrl(track.artwork_url) ||
    extractImageUrl(track.cover_url) ||
    extractImageUrl(track.coverUrl) ||
    extractImageUrl(track.preview_artwork) ||
    extractImageUrl(track.image) ||
    extractImageUrl(track.thumbnail) ||
    extractImageUrl(track.coverImage) ||
    extractImageUrl(track.cover_image) ||
    extractImageUrl(track.artwork) ||
    null;

  if (raw) return getHighResArtwork(raw);

  const vid = getVideoId(track);
  if (vid && typeof vid === "string" && vid.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(vid)) {
    return `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
  }
  return null;
}

/**
 * Resolve artist image with high quality.
 */
export function resolveArtistImage(artist) {
  if (!artist) return null;
  const raw = extractImageUrl(artist.image) || extractImageUrl(artist.thumbnail) || null;
  return getHighResArtistImage(raw);
}

/**
 * Resolve playlist/album cover with a 4-level fallback.
 */
export function resolvePlaylistCover(item) {
  if (!item) return null;
  const cover =
    extractImageUrl(item.cover_url) ||
    extractImageUrl(item.preview_artwork) ||
    extractImageUrl(item.image) ||
    extractImageUrl(item.thumbnail) ||
    extractImageUrl(item.tracks?.[0]?.artwork_url) ||
    extractImageUrl(item.tracks?.[0]?.thumbnail) ||
    extractImageUrl(item.tracks?.[0]?.image) ||
    null;
  return getHighResArtwork(cover);
}

/**
 * Normalize a video ID from various track shapes.
 */
export function getVideoId(track) {
  if (!track) return null;
  return track.videoId || track.video_id || track.id || null;
}
