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

  // Generic CDN — upgrade to 800px
  clean = clean.replace(/=w\d+-h\d+[^?&]*/, "=w800-h800-l90-rj");
  clean = clean.replace(/=s\d+[^?&]*/, "=s800");

  // Fallback: downgrade overly large / broken YouTube defaults
  clean = clean.replace(/\/default\.jpg/, "/mqdefault.jpg");
  clean = clean.replace(/\/sddefault\.jpg/, "/mqdefault.jpg");
  clean = clean.replace(/\/maxresdefault\.jpg/, "/mqdefault.jpg");

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
