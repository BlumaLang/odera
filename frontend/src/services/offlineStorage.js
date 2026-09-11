// offlineStorage.js - Manages downloaded audio tracks for offline playback via Cache API & Web Storage
import { api } from "../api/client";

const OFFLINE_AUDIO_CACHE = "staytup-offline-audio-v1";
const OFFLINE_TRACKS_KEY = "@staytup_offline_tracks";

// In-memory set of downloaded video IDs for instantaneous UI lookups
let downloadedIdSet = new Set();

// Initialize downloaded IDs from localStorage
function initDownloadedIds() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage?.getItem(OFFLINE_TRACKS_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        downloadedIdSet = new Set(list.map((t) => String(t.videoId || t.video_id || t.id)));
      }
    }
  } catch (_) {}
}

initDownloadedIds();

export function getDownloadedTracks() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage?.getItem(OFFLINE_TRACKS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

export function isTrackDownloaded(videoId) {
  if (!videoId) return false;
  return downloadedIdSet.has(String(videoId));
}

export async function downloadTrack(track, onProgress = null) {
  if (!track) return false;
  const vid = String(track.videoId || track.video_id || track.id || "");
  if (!vid) return false;

  try {
    if (onProgress) onProgress(0.1);

    // 1. Resolve stream URL
    let streamUrl = track.stream_url;
    if (!streamUrl) {
      try {
        const streamData = await api.getStreamUrl(vid);
        streamUrl = streamData?.stream_url || streamData?.url || streamData?.encrypted_media_url;
      } catch (err) {
        console.warn("Failed resolving stream for download:", err);
      }
    }

    if (!streamUrl) {
      throw new Error("Unable to resolve audio stream for offline download");
    }

    if (onProgress) onProgress(0.3);

    // 2. Fetch audio data as blob / response
    const audioRes = await fetch(streamUrl, { mode: "cors" });
    if (!audioRes.ok) {
      throw new Error(`Audio download failed with status ${audioRes.status}`);
    }

    const audioBlob = await audioRes.blob();
    const fileSize = audioBlob.size || 0;

    if (onProgress) onProgress(0.7);

    // 3. Store in Cache API
    if (typeof window !== "undefined" && "caches" in window) {
      const cache = await window.caches.open(OFFLINE_AUDIO_CACHE);
      const offlineUrl = `https://staytup.offline/audio/${vid}`;
      const cacheResponse = new Response(audioBlob, {
        headers: {
          "Content-Type": audioBlob.type || "audio/mp4",
          "Content-Length": String(fileSize),
        },
      });
      await cache.put(offlineUrl, cacheResponse);
    }

    // 4. Save metadata to localStorage
    const existing = getDownloadedTracks();
    const updated = existing.filter((t) => (t.videoId || t.video_id || t.id) !== vid);
    const offlineRecord = {
      id: vid,
      videoId: vid,
      video_id: vid,
      title: track.title || track.name || "Unknown Title",
      artist: track.artist || track.subtitle || "Unknown Artist",
      album: track.album || "",
      duration: track.duration || 0,
      duration_seconds: track.duration_seconds || track.duration || 0,
      artwork_url: track.artwork_url || track.image || track.thumbnail || "",
      thumbnail: track.artwork_url || track.image || track.thumbnail || "",
      fileSize,
      downloadedAt: new Date().toISOString(),
      isDownloaded: true,
    };

    updated.unshift(offlineRecord);
    window.localStorage?.setItem(OFFLINE_TRACKS_KEY, JSON.stringify(updated));
    downloadedIdSet.add(vid);

    if (onProgress) onProgress(1.0);

    // Notify components
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("staytup-downloads-changed", { detail: { videoId: vid, action: "add" } }));
    }

    return true;
  } catch (err) {
    console.warn("Download track failed:", err);
    return false;
  }
}

export async function removeDownloadedTrack(videoId) {
  if (!videoId) return false;
  const vid = String(videoId);

  try {
    // 1. Remove from Cache API
    if (typeof window !== "undefined" && "caches" in window) {
      const cache = await window.caches.open(OFFLINE_AUDIO_CACHE);
      const offlineUrl = `https://staytup.offline/audio/${vid}`;
      await cache.delete(offlineUrl);
    }

    // 2. Remove from localStorage
    const existing = getDownloadedTracks();
    const updated = existing.filter((t) => String(t.videoId || t.video_id || t.id) !== vid);
    window.localStorage?.setItem(OFFLINE_TRACKS_KEY, JSON.stringify(updated));
    downloadedIdSet.delete(vid);

    // Notify components
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("staytup-downloads-changed", { detail: { videoId: vid, action: "remove" } }));
    }

    return true;
  } catch (err) {
    console.warn("Remove downloaded track error:", err);
    return false;
  }
}

export async function getOfflineAudioUrl(videoId) {
  if (!videoId || typeof window === "undefined" || !("caches" in window)) return null;
  const vid = String(videoId);

  try {
    const cache = await window.caches.open(OFFLINE_AUDIO_CACHE);
    const offlineUrl = `https://staytup.offline/audio/${vid}`;
    const response = await cache.match(offlineUrl);
    if (!response) return null;

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (err) {
    console.warn("Error getting offline audio url:", err);
    return null;
  }
}

export function getOfflineStorageFormatted() {
  const tracks = getDownloadedTracks();
  const totalBytes = tracks.reduce((acc, t) => acc + (t.fileSize || 0), 0);
  if (totalBytes <= 0) return "0 MB";
  const mb = (totalBytes / (1024 * 1024)).toFixed(1);
  return `${mb} MB`;
}

export async function clearAllDownloads() {
  if (typeof window === "undefined") return;
  try {
    if ("caches" in window) {
      await window.caches.delete(OFFLINE_AUDIO_CACHE);
    }
    window.localStorage?.removeItem(OFFLINE_TRACKS_KEY);
    downloadedIdSet.clear();
    window.dispatchEvent(new CustomEvent("staytup-downloads-changed", { detail: { action: "clear" } }));
    return true;
  } catch (err) {
    console.warn("Clear downloads error:", err);
    return false;
  }
}
