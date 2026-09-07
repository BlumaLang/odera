import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase, ref, set, get, update, remove, child } from 'firebase/database';

export const firebaseConfig = {
  apiKey: "AIzaSyD-mRppofIyLkhgTs7o2nQjrrSru9fAzwY",
  authDomain: "staytupnow.firebaseapp.com",
  databaseURL: "https://staytupnow-default-rtdb.firebaseio.com",
  projectId: "staytupnow",
  storageBucket: "staytupnow.firebasestorage.app",
  messagingSenderId: "587558849306",
  appId: "1:587558849306:web:32f77a9805636af31bfaa3",
  measurementId: "G-EQ0GJYR33L"
};

// Initialize Firebase App singleton
export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const rtdb = getDatabase(firebaseApp);

/**
 * Health check for Firebase connectivity
 */
export async function checkFirebaseHealth() {
  const t0 = Date.now();
  try {
    const healthRef = ref(rtdb, 'server_health');
    await set(healthRef, {
      status: 'online',
      service: 'YouTube Music Server Backend',
      lastPing: new Date().toISOString(),
      timestamp: Date.now()
    });
    return { status: 'connected', latencyMs: Date.now() - t0 };
  } catch (err) {
    return { status: `error: ${err.message}`, latencyMs: Date.now() - t0 };
  }
}

/**
 * Record song playback to Firebase Realtime Database
 */
export async function recordPlayEvent(eventData) {
  if (!eventData || (!eventData.videoId && !eventData.video_id)) return;
  const vid = eventData.videoId || eventData.video_id;
  const userId = eventData.user_id || 'guest';
  const timestamp = Date.now();

  try {
    // 1. Log playback event
    const eventRef = ref(rtdb, `playback_events/${timestamp}_${vid}`);
    await set(eventRef, {
      ...eventData,
      videoId: vid,
      timestamp
    });

    // 2. Increment global play count for trending ranking
    const trendingRef = ref(rtdb, `app_trending/${vid}`);
    const snap = await get(trendingRef);
    const existing = snap.val() || {};
    await set(trendingRef, {
      videoId: vid,
      title: eventData.title || existing.title || '',
      artist: eventData.artist || existing.artist || '',
      thumbnail: eventData.artwork_url || eventData.thumbnail || existing.thumbnail || '',
      playCount: (existing.playCount || 0) + 1,
      lastPlayed: timestamp
    });

    // 3. Update user recent listening history
    if (userId) {
      const historyRef = ref(rtdb, `users/${userId}/history/${vid}`);
      await set(historyRef, {
        videoId: vid,
        title: eventData.title || '',
        artist: eventData.artist || '',
        thumbnail: eventData.artwork_url || eventData.thumbnail || '',
        lastPlayed: timestamp
      });
    }
  } catch (err) {
    console.warn('[Firebase] recordPlayEvent error:', err.message);
  }
}

/**
 * Get user favorites from Firebase RTDB
 */
export async function getFavorites(userId) {
  try {
    const favRef = ref(rtdb, `users/${userId}/favorites`);
    const snap = await get(favRef);
    if (!snap.exists()) return [];
    const val = snap.val();
    return Object.values(val);
  } catch (err) {
    console.warn('[Firebase] getFavorites error:', err.message);
    return [];
  }
}

/**
 * Toggle or save song favorite in Firebase RTDB
 */
export async function toggleFavorite(userId, songData) {
  const vid = songData.videoId || songData.video_id || songData.id;
  if (!vid) return { isFavorite: false };

  try {
    const songRef = ref(rtdb, `users/${userId}/favorites/${vid}`);
    const snap = await get(songRef);

    if (snap.exists()) {
      await remove(songRef);
      return { isFavorite: false };
    } else {
      await set(songRef, {
        id: vid,
        videoId: vid,
        video_id: vid,
        title: songData.title || '',
        artist: songData.artist || '',
        thumbnail: songData.artwork_url || songData.thumbnail || `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`,
        duration: songData.duration || '',
        duration_seconds: songData.duration_seconds || 0,
        savedAt: Date.now()
      });
      return { isFavorite: true };
    }
  } catch (err) {
    console.warn('[Firebase] toggleFavorite error:', err.message);
    return { isFavorite: false };
  }
}

/**
 * Get playlists from Firebase RTDB
 */
export async function getPlaylists(userId) {
  try {
    const listRef = ref(rtdb, `users/${userId}/playlists`);
    const snap = await get(listRef);
    if (!snap.exists()) return [];
    const val = snap.val();
    return Object.keys(val).map(id => ({ id, ...val[id] }));
  } catch (err) {
    console.warn('[Firebase] getPlaylists error:', err.message);
    return [];
  }
}

/**
 * Create or update playlist in Firebase RTDB
 */
export async function savePlaylist(userId, playlist) {
  const id = playlist.id || `pl_${Date.now()}`;
  try {
    const plRef = ref(rtdb, `users/${userId}/playlists/${id}`);
    const data = {
      id,
      name: playlist.name || 'My Playlist',
      description: playlist.description || '',
      cover_url: playlist.cover_url || '',
      tracks: playlist.tracks || [],
      updatedAt: Date.now()
    };
    await set(plRef, data);
    return data;
  } catch (err) {
    console.warn('[Firebase] savePlaylist error:', err.message);
    return playlist;
  }
}

/**
 * Cache resolved stream in Firebase RTDB
 */
export async function cacheStream(videoId, streamInfo) {
  try {
    const cacheRef = ref(rtdb, `stream_cache/${videoId}`);
    await set(cacheRef, {
      ...streamInfo,
      cachedAt: Date.now()
    });
  } catch (_) {}
}

/**
 * Read cached stream from Firebase RTDB
 */
export async function getCachedStream(videoId) {
  try {
    const cacheRef = ref(rtdb, `stream_cache/${videoId}`);
    const snap = await get(cacheRef);
    if (snap.exists()) {
      const data = snap.val();
      // Only return if under 4 hours old
      if (data.cachedAt && (Date.now() - data.cachedAt < 4 * 60 * 60 * 1000)) {
        return data;
      }
    }
  } catch (_) {}
  return null;
}

/**
 * Get user listening data (recent + liked) for personalization
 */
export async function getUserListeningData(userId) {
  const result = { recent: [], liked: [] };
  try {
    const recentRef = ref(rtdb, `users/${userId}/recentlyPlayed`);
    const recentSnap = await get(recentRef);
    if (recentSnap.exists()) {
      const val = recentSnap.val();
      result.recent = Array.isArray(val) ? val : Object.values(val);
    }
  } catch (_) {}

  try {
    const likedRef = ref(rtdb, `users/${userId}/likedSongs`);
    const likedSnap = await get(likedRef);
    if (likedSnap.exists()) {
      const val = likedSnap.val();
      result.liked = Array.isArray(val) ? val : Object.values(val);
    }
  } catch (_) {}

  return result;
}

/**
 * Get app-wide trending tracks ranked by play count
 */
export async function getAppTrendingTracks(limit = 20) {
  try {
    const trendRef = ref(rtdb, 'app_trending');
    const snap = await get(trendRef);
    if (!snap.exists()) return [];
    const val = snap.val();
    return Object.values(val)
      .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
      .slice(0, limit)
      .map(t => ({
        videoId: t.videoId,
        video_id: t.videoId,
        title: t.title || '',
        artist: t.artist || '',
        thumbnail: t.thumbnail || '',
        artwork_url: t.thumbnail || '',
        playCount: t.playCount || 0,
      }));
  } catch (_) {
    return [];
  }
}
