/**
 * Shared image utilities for consistent, high-quality artwork rendering.
 */

/**
 * Upgrade artwork URLs to the highest available resolution.
 * Handles YouTube thumbnails, JioSaavn, and generic image CDNs.
 */
export function getHighResArtwork(url) {
  if (!url) return null;
  let clean = url;

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
  return getHighResArtwork(track.artwork_url || track.thumbnail || null);
}

/**
 * Resolve artist image with high quality.
 */
export function resolveArtistImage(artist) {
  if (!artist) return null;
  return getHighResArtistImage(artist.image || artist.thumbnail || null);
}

/**
 * Resolve playlist/album cover with a 4-level fallback.
 */
export function resolvePlaylistCover(item) {
  if (!item) return null;
  const cover =
    item.cover_url ||
    item.preview_artwork ||
    item.tracks?.[0]?.artwork_url ||
    item.tracks?.[0]?.thumbnail ||
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
