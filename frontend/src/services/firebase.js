// Firebase Service - Auth & Realtime Database for Staytup
import { Platform } from "react-native";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  onValue,
  off,
} from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyD-mRppofIyLkhgTs7o2nQjrrSru9fAzwY",
  authDomain: "staytupnow.firebaseapp.com",
  projectId: "staytupnow",
  storageBucket: "staytupnow.firebasestorage.app",
  messagingSenderId: "587558849306",
  appId: "1:587558849306:web:32f77a9805636af31bfaa3",
  measurementId: "G-EQ0GJYR33L",
  databaseURL: "https://staytupnow-default-rtdb.firebaseio.com",
};

// Initialize Firebase App singleton
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

/**
 * Sign in using Google popup
 */
export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return { success: true, user: result.user };
  } catch (error) {
    console.warn("Google Sign-In Error:", error.code, error.message);
    return { success: false, error: error.message, code: error.code };
  }
}

/**
 * Sign in anonymously (Guest Mode)
 */
export async function loginAsGuest() {
  try {
    const result = await signInAnonymously(auth);
    return { success: true, user: result.user };
  } catch (error) {
    console.warn("Guest Sign-In Error:", error.code, error.message);
    return { success: false, error: error.message, code: error.code };
  }
}

/**
 * Sign out current user
 */
export async function logoutUser() {
  try {
    await removeLocalSession("@staytup_pin_user");
    await signOut(auth);
    return { success: true };
  } catch (error) {
    console.warn("Sign-Out Error:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Local Session Helpers for Persistent PIN & Device Sessions
 */
export async function saveLocalSession(key, data) {
  try {
    const val = JSON.stringify(data);
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, val);
    }
  } catch (_) {}
}

export async function getLocalSession(key) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const v = window.localStorage.getItem(key);
      if (v) return JSON.parse(v);
    }
    return null;
  } catch (_) {
    return null;
  }
}

export async function removeLocalSession(key) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch (_) {}
}

/**
 * 4-Digit PIN Authentication (Instant Create or Login)
 */
export async function loginOrCreatePinUser(username, pin) {
  if (!username || !pin) {
    return { success: false, error: "Username and 4-digit PIN required" };
  }
  const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  const cleanPin = pin.toString().trim();
  if (clean.length < 2) {
    return { success: false, error: "Username must be at least 2 characters" };
  }
  if (!/^\d{4}$/.test(cleanPin)) {
    return { success: false, error: "PIN must be exactly 4 digits" };
  }

  try {
    // 1. Try backend API first
    const { api } = await import("../api/client");
    const res = await api.loginWithPin(clean, cleanPin);
    if (res && res.success && res.user) {
      await saveLocalSession("@staytup_pin_user", {
        ...res.user,
        username: username.trim(),
        pin: cleanPin,
      });
      return { success: true, user: res.user, isNewUser: res.isNewUser };
    } else if (res && res.error) {
      return { success: false, error: res.error };
    }
  } catch (_) {}

  // 2. Direct Firebase RTDB fallback
  try {
    const userRef = ref(db, `pin_users/${clean}`);
    const snap = await get(userRef);
    if (snap.exists()) {
      const existing = snap.val();
      if (existing.pin !== cleanPin) {
        return { success: false, error: "Incorrect 4-digit PIN. Please try again." };
      }
      const user = {
        uid: existing.uid,
        displayName: existing.displayName || username.trim(),
        username: existing.username || username.trim(),
      };
      await saveLocalSession("@staytup_pin_user", { ...user, pin: cleanPin });
      return { success: true, user, isNewUser: false };
    } else {
      // Create new user with 4-digit PIN
      const newUser = {
        uid: `pin_${clean}_${Date.now().toString(36)}`,
        displayName: username.trim(),
        username: username.trim(),
        cleanUser: clean,
        pin: cleanPin,
        createdAt: Date.now(),
      };
      await set(userRef, newUser);
      await saveLocalSession("@staytup_pin_user", { ...newUser, pin: cleanPin });
      return { success: true, user: newUser, isNewUser: true };
    }
  } catch (err) {
    // Offline local fallback
    const offlineUser = {
      uid: `pin_${clean}`,
      displayName: username.trim(),
      username: username.trim(),
      cleanUser: clean,
      pin: cleanPin,
    };
    await saveLocalSession("@staytup_pin_user", offlineUser);
    return { success: true, user: offlineUser, isNewUser: true };
  }
}

/**
 * Subscribe to Auth state changes
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// ----------------------------------------------------
// Realtime Database Persistence Helpers
// ----------------------------------------------------

/**
 * Fetch full user data node from Realtime Database
 */
export async function getUserData(uid) {
  if (!uid) return null;
  try {
    const userRef = ref(db, `users/${uid}`);
    const snapshot = await get(userRef);
    if (snapshot.exists()) {
      return snapshot.val();
    }
    return null;
  } catch (error) {
    console.warn("Failed to get user data from RTDB:", error.message);
    return null;
  }
}

/**
 * Subscribe to real-time changes of a user node with timeout safety
 */
export function subscribeUserData(uid, callback) {
  if (!uid || !callback) return () => {};

  let hasResponded = false;
  const timeoutId = setTimeout(() => {
    if (!hasResponded) {
      hasResponded = true;
      callback(null);
    }
  }, 2500);

  try {
    const userRef = ref(db, `users/${uid}`);
    const listener = onValue(
      userRef,
      (snapshot) => {
        if (!hasResponded) {
          hasResponded = true;
          clearTimeout(timeoutId);
        }
        callback(snapshot.val());
      },
      (error) => {
        console.warn("RTDB user subscription error:", error.message);
        if (!hasResponded) {
          hasResponded = true;
          clearTimeout(timeoutId);
          callback(null);
        }
      }
    );

    return () => {
      clearTimeout(timeoutId);
      try {
        off(userRef, "value", listener);
      } catch (_) {}
    };
  } catch (err) {
    console.warn("subscribeUserData catch error:", err.message);
    if (!hasResponded) {
      hasResponded = true;
      clearTimeout(timeoutId);
      callback(null);
    }
    return () => {};
  }
}

/**
 * Save / update user profile in Realtime Database
 */
export async function saveUserProfile(uid, profileData) {
  if (!uid) return;
  try {
    const profileRef = ref(db, `users/${uid}/profile`);
    await update(profileRef, {
      ...profileData,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("Failed to save profile to RTDB:", error.message);
  }
}

/**
 * Save onboarding completion state in Realtime Database
 */
export async function saveOnboardingState(uid, isCompleted) {
  if (!uid) return;
  try {
    const onboardingRef = ref(db, `users/${uid}/onboardingCompleted`);
    await set(onboardingRef, !!isCompleted);
  } catch (error) {
    console.warn("Failed to save onboarding to RTDB:", error.message);
  }
}

/**
 * Save user premium status, plan & payment transaction details in Realtime Database
 */
export async function saveUserPremium(uid, isPremium, plan = "Free", paymentDetails = null) {
  if (!uid) return;
  try {
    const userRef = ref(db, `users/${uid}`);
    const now = new Date().toISOString();
    const updatePayload = {
      isPremium: !!isPremium,
      premiumPlan: plan,
      updatedAt: now,
    };
    if (paymentDetails) {
      updatePayload.premiumPayment = {
        ...paymentDetails,
        purchasedAt: now,
      };

      // Append to user subscription history in RTDB
      const payId = paymentDetails.paymentId || "sub_" + Date.now();
      const historyRef = ref(db, `users/${uid}/subscriptionHistory/${payId}`);
      await set(historyRef, {
        ...paymentDetails,
        plan,
        isPremium: !!isPremium,
        timestamp: now,
      });

      // Record in global app-wide subscriptions table in RTDB
      const globalSubRef = ref(db, `premiumSubscriptions/${payId}`);
      await set(globalSubRef, {
        uid,
        ...paymentDetails,
        plan,
        timestamp: now,
      });
    }
    await update(userRef, updatePayload);
  } catch (error) {
    console.warn("Failed to save premium status to RTDB:", error.message);
  }
}

/**
 * Save user playlists to Realtime Database
 */
export async function savePlaylists(uid, playlists) {
  if (!uid) return;
  try {
    const playlistsRef = ref(db, `users/${uid}/playlists`);
    await set(playlistsRef, playlists || []);
  } catch (error) {
    console.warn("Failed to save playlists to RTDB:", error.message);
  }
}

/**
 * Subscribe to user playlists in Realtime Database
 */
export function subscribePlaylists(uid, callback) {
  if (!uid) return () => {};
  const playlistsRef = ref(db, `users/${uid}/playlists`);
  const listener = onValue(
    playlistsRef,
    (snapshot) => {
      const val = snapshot.val();
      let list = [];
      if (Array.isArray(val)) {
        list = val;
      } else if (val && typeof val === "object") {
        list = Object.values(val);
      }
      const normalized = list.map((p) => {
        const tracks = Array.isArray(p.tracks) ? p.tracks : [];
        const firstArtwork = tracks[0]?.artwork_url || tracks[0]?.thumbnail || "";
        const resolvedCover = p.cover_url || p.preview_artwork || firstArtwork || "";
        return {
          ...p,
          tracks,
          track_count: tracks.length || p.track_count || 0,
          cover_url: resolvedCover,
          preview_artwork: resolvedCover,
        };
      });
      callback(normalized);
    },
    (error) => {
      console.warn("RTDB playlists subscription error:", error.message);
    }
  );

  return () => off(playlistsRef, "value", listener);
}

/**
 * Save search history to Realtime Database
 */
export async function saveSearchHistory(uid, history) {
  if (!uid) return;
  try {
    const historyRef = ref(db, `users/${uid}/searchHistory`);
    await set(historyRef, history || []);
  } catch (error) {
    console.warn("Failed to save search history to RTDB:", error.message);
  }
}

/**
 * Load search history from Realtime Database
 */
export async function getSearchHistory(uid) {
  if (!uid) return [];
  try {
    const historyRef = ref(db, `users/${uid}/searchHistory`);
    const snapshot = await get(historyRef);
    if (snapshot.exists()) {
      return snapshot.val() || [];
    }
    return [];
  } catch (error) {
    console.warn("Failed to get search history from RTDB:", error.message);
    return [];
  }
}

/**
 * Save last played track and queue in Realtime Database
 */
export async function saveLastPlayback(uid, track, queue) {
  if (!uid) return;
  try {
    const playbackRef = ref(db, `users/${uid}/lastPlayback`);
    await set(playbackRef, {
      track: track || null,
      queue: queue || [],
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("Failed to save last playback to RTDB:", error.message);
  }
}

/**
 * Load last played track and queue from Realtime Database
 */
export async function getLastPlayback(uid) {
  if (!uid) return null;
  try {
    const playbackRef = ref(db, `users/${uid}/lastPlayback`);
    const snapshot = await get(playbackRef);
    if (snapshot.exists()) {
      return snapshot.val();
    }
    return null;
  } catch (error) {
    console.warn("Failed to get last playback from RTDB:", error.message);
    return null;
  }
}

/**
 * Subscribe to last playback changes
 */
export function subscribeLastPlayback(uid, callback) {
  if (!uid || !callback) return () => {};
  const playbackRef = ref(db, `users/${uid}/lastPlayback`);
  const listener = onValue(
    playbackRef,
    (snapshot) => {
      callback(snapshot.val());
    },
    (error) => {
      console.warn("RTDB last playback subscription error:", error.message);
    }
  );
  return () => {
    try {
      off(playbackRef, "value", listener);
    } catch (_) {}
  };
}

// ----------------------------------------------------
// Single Device Playback Enforcement & Device Management
// ----------------------------------------------------

let cachedDeviceId = null;

export function getOrCreateDeviceId() {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      let stored = window.localStorage.getItem("staytup_device_id");
      if (!stored) {
        stored = "dev_" + Math.random().toString(36).substring(2, 12) + "_" + Date.now();
        window.localStorage.setItem("staytup_device_id", stored);
      }
      cachedDeviceId = stored;
      return stored;
    }
  } catch (_) {}
  cachedDeviceId = "dev_" + Math.random().toString(36).substring(2, 12) + "_" + Date.now();
  return cachedDeviceId;
}

/**
 * Update active playback session in RTDB to enforce single-device playback per account
 */
export async function updatePlaybackSession(uid, sessionData) {
  if (!uid) return;
  try {
    const sessionRef = ref(db, `users/${uid}/playbackSession`);
    await update(sessionRef, {
      ...sessionData,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.warn("Failed to update playback session in RTDB:", error.message);
  }
}

/**
 * Subscribe to active playback session to pause when another device plays
 */
export function subscribePlaybackSession(uid, callback) {
  if (!uid || !callback) return () => {};
  const sessionRef = ref(db, `users/${uid}/playbackSession`);
  const listener = onValue(
    sessionRef,
    (snapshot) => {
      callback(snapshot.val());
    },
    (error) => {
      console.warn("RTDB playback session subscription error:", error.message);
    }
  );
  return () => {
    try {
      off(sessionRef, "value", listener);
    } catch (_) {}
  };
}

// ----------------------------------------------------
// Recently Played Tracks in RTDB
// ----------------------------------------------------

// Local cache and listener set for immediate zero-latency updates
const localRecentsCache = new Map();
const localRecentsListeners = new Set();

function getLocalRecents(uid) {
  const safeUid = uid || "guest";
  if (localRecentsCache.has(safeUid)) {
    return localRecentsCache.get(safeUid);
  }
  if (Platform.OS === "web" && typeof window !== "undefined" && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(`odera_recents_${safeUid}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          localRecentsCache.set(safeUid, parsed);
          return parsed;
        }
      }
    } catch (_) {}
  }
  return [];
}

function setLocalRecents(uid, list) {
  const safeUid = uid || "guest";
  localRecentsCache.set(safeUid, list);
  if (Platform.OS === "web" && typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(`odera_recents_${safeUid}`, JSON.stringify(list));
    } catch (_) {}
  }
  localRecentsListeners.forEach((fn) => {
    try {
      fn(list, safeUid);
    } catch (_) {}
  });
}

/**
 * Record recently played track in RTDB (deduplicated, max 50 items)
 */
export async function addRecentlyPlayed(uid, track) {
  const safeUid = uid || "guest";
  if (!track) return;
  const vid = track.videoId || track.video_id;
  if (!vid) return;

  const cleanTrack = {
    videoId: vid,
    video_id: vid,
    title: track.title || "",
    artist: track.artist || "Unknown Artist",
    album: track.album || "",
    thumbnail: track.thumbnail || track.artwork_url || "",
    artwork_url: track.artwork_url || track.thumbnail || "",
    duration: track.duration || "",
    duration_seconds: track.duration_seconds || 0,
    playedAt: new Date().toISOString(),
  };

  // Immediate local update
  const currentLocal = getLocalRecents(safeUid);
  const updatedLocal = [cleanTrack, ...currentLocal.filter((t) => (t.videoId || t.video_id) !== vid)].slice(0, 50);
  setLocalRecents(safeUid, updatedLocal);

  try {
    const recentRef = ref(db, `users/${safeUid}/recentlyPlayed`);
    const snapshot = await get(recentRef);
    let list = [];
    if (snapshot.exists() && Array.isArray(snapshot.val())) {
      list = snapshot.val();
    }
    list = list.filter((t) => (t.videoId || t.video_id) !== vid);
    list.unshift(cleanTrack);
    if (list.length > 50) list = list.slice(0, 50);

    await set(recentRef, list);
    setLocalRecents(safeUid, list);
  } catch (error) {
    console.warn("Failed to save recently played track to RTDB:", error.message);
  }

  // Also record user stream count
  recordUserStream(safeUid).catch(() => {});
}

export async function getRecentlyPlayed(uid) {
  const safeUid = uid || "guest";
  const local = getLocalRecents(safeUid);
  if (local && local.length > 0) {
    // Return local immediately and refresh in background
    setTimeout(async () => {
      try {
        const recentRef = ref(db, `users/${safeUid}/recentlyPlayed`);
        const snapshot = await get(recentRef);
        if (snapshot.exists() && Array.isArray(snapshot.val())) {
          setLocalRecents(safeUid, snapshot.val());
        }
      } catch (_) {}
    }, 50);
    return local;
  }

  try {
    const recentRef = ref(db, `users/${safeUid}/recentlyPlayed`);
    const snapshot = await get(recentRef);
    if (snapshot.exists()) {
      const val = snapshot.val();
      const res = Array.isArray(val) ? val : [];
      setLocalRecents(safeUid, res);
      return res;
    }
    return [];
  } catch (error) {
    console.warn("Failed to get recently played from RTDB:", error.message);
    return getLocalRecents(safeUid);
  }
}

export function subscribeRecentlyPlayed(uid, callback) {
  const safeUid = uid || "guest";
  if (!callback) return () => {};

  // Immediate callback with cached items
  const local = getLocalRecents(safeUid);
  if (local && local.length > 0) {
    callback(local);
  }

  const localListener = (list, listenerUid) => {
    if (listenerUid === safeUid) {
      callback(list);
    }
  };
  localRecentsListeners.add(localListener);

  const recentRef = ref(db, `users/${safeUid}/recentlyPlayed`);
  const listener = onValue(
    recentRef,
    (snapshot) => {
      const val = snapshot.val();
      const list = Array.isArray(val) ? val : [];
      setLocalRecents(safeUid, list);
      callback(list);
    },
    (error) => {
      console.warn("RTDB recently played subscription error:", error.message);
    }
  );

  return () => {
    localRecentsListeners.delete(localListener);
    try {
      off(recentRef, "value", listener);
    } catch (_) {}
  };
}

export async function removeRecentlyPlayed(uid, videoId) {
  const safeUid = uid || "guest";
  const vid = videoId;
  if (!vid) return;

  // Update local cache immediately
  const currentLocal = getLocalRecents(safeUid);
  const updatedLocal = currentLocal.filter((t) => (t.videoId || t.video_id) !== vid);
  setLocalRecents(safeUid, updatedLocal);

  try {
    const recentRef = ref(db, `users/${safeUid}/recentlyPlayed`);
    const snapshot = await get(recentRef);
    let list = [];
    if (snapshot.exists() && Array.isArray(snapshot.val())) {
      list = snapshot.val();
    }
    list = list.filter((t) => (t.videoId || t.video_id) !== vid);
    await set(recentRef, list);
  } catch (error) {
    console.warn("Failed to remove recently played track:", error.message);
  }
}

// ----------------------------------------------------
// User Streams & Play Statistics
// ----------------------------------------------------

const localStreamCounts = new Map();
const localStreamListeners = new Set();

function getLocalStreamCount(uid) {
  const safeUid = uid || "guest";
  if (localStreamCounts.has(safeUid)) {
    return localStreamCounts.get(safeUid);
  }
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(`@staytup_stream_count_${safeUid}`);
      if (raw) {
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed)) {
          localStreamCounts.set(safeUid, parsed);
          return parsed;
        }
      }
    } catch (_) {}
  }
  return 0;
}

function setLocalStreamCount(uid, count) {
  const safeUid = uid || "guest";
  const num = Math.max(0, parseInt(count, 10) || 0);
  localStreamCounts.set(safeUid, num);
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(`@staytup_stream_count_${safeUid}`, String(num));
    } catch (_) {}
  }
  localStreamListeners.forEach((fn) => {
    try {
      fn(num, safeUid);
    } catch (_) {}
  });
}

/**
 * Record a user stream / playback increment
 */
export async function recordUserStream(uid) {
  const safeUid = uid || "guest";
  const currentLocal = getLocalStreamCount(safeUid);
  const updatedLocal = currentLocal + 1;
  setLocalStreamCount(safeUid, updatedLocal);

  try {
    const streamRef = ref(db, `users/${safeUid}/streamCount`);
    const snapshot = await get(streamRef);
    const existing = snapshot.exists() && typeof snapshot.val() === "number" ? snapshot.val() : 0;
    const nextCount = Math.max(existing + 1, updatedLocal);
    await set(streamRef, nextCount);
    setLocalStreamCount(safeUid, nextCount);
  } catch (err) {
    console.warn("Failed to record user stream in RTDB:", err.message);
  }
}

/**
 * Get current user stream count
 */
export async function getUserStreamCount(uid) {
  const safeUid = uid || "guest";
  const local = getLocalStreamCount(safeUid);
  try {
    const streamRef = ref(db, `users/${safeUid}/streamCount`);
    const snapshot = await get(streamRef);
    if (snapshot.exists()) {
      const val = parseInt(snapshot.val(), 10);
      if (!isNaN(val)) {
        setLocalStreamCount(safeUid, Math.max(val, local));
        return Math.max(val, local);
      }
    }
  } catch (_) {}
  return local;
}

/**
 * Subscribe to real-time user stream count
 */
export function subscribeUserStreamCount(uid, callback) {
  const safeUid = uid || "guest";
  if (!callback) return () => {};

  // Immediate local callback
  const local = getLocalStreamCount(safeUid);
  if (local > 0) {
    callback(local);
  }

  const localListener = (count, listenerUid) => {
    if (listenerUid === safeUid) {
      callback(count);
    }
  };
  localStreamListeners.add(localListener);

  const streamRef = ref(db, `users/${safeUid}/streamCount`);
  const listener = onValue(
    streamRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const val = parseInt(snapshot.val(), 10);
        if (!isNaN(val)) {
          setLocalStreamCount(safeUid, val);
          callback(val);
          return;
        }
      }
      callback(getLocalStreamCount(safeUid));
    },
    (error) => {
      console.warn("RTDB stream count subscription error:", error.message);
    }
  );

  return () => {
    localStreamListeners.delete(localListener);
    try {
      off(streamRef, "value", listener);
    } catch (_) {}
  };
}

// ----------------------------------------------------
// Liked Songs (Favorites) in RTDB
// ----------------------------------------------------

/**
 * Toggle Liked Song in RTDB (stores directly under users/${uid}/likedSongs/${videoId})
 */
export async function toggleLikedSong(uid, track) {
  if (!uid || !track) return false;
  const vid = track.videoId || track.video_id;
  if (!vid) return false;

  try {
    const songRef = ref(db, `users/${uid}/likedSongs/${vid}`);
    const snapshot = await get(songRef);
    if (snapshot.exists()) {
      await set(songRef, null);
      return false;
    } else {
      const cleanTrack = {
        videoId: vid,
        video_id: vid,
        title: track.title || "",
        artist: track.artist || "Unknown Artist",
        album: track.album || "",
        thumbnail: track.thumbnail || track.artwork_url || "",
        artwork_url: track.artwork_url || track.thumbnail || "",
        duration: track.duration || "",
        duration_seconds: track.duration_seconds || 0,
        likedAt: new Date().toISOString(),
      };
      await set(songRef, cleanTrack);
      return true;
    }
  } catch (error) {
    console.warn("Failed to toggle liked song in RTDB:", error.message);
    return false;
  }
}

export async function getLikedSongs(uid) {
  if (!uid) return [];
  try {
    const likedRef = ref(db, `users/${uid}/likedSongs`);
    const snapshot = await get(likedRef);
    if (snapshot.exists()) {
      const val = snapshot.val();
      return Object.values(val || {});
    }
    return [];
  } catch (error) {
    console.warn("Failed to get liked songs from RTDB:", error.message);
    return [];
  }
}

export function subscribeLikedSongs(uid, callback) {
  if (!uid || !callback) return () => {};
  const likedRef = ref(db, `users/${uid}/likedSongs`);
  const listener = onValue(
    likedRef,
    (snapshot) => {
      const val = snapshot.val();
      callback(val ? Object.values(val) : []);
    },
    (error) => {
      console.warn("RTDB liked songs subscription error:", error.message);
    }
  );
  return () => {
    try {
      off(likedRef, "value", listener);
    } catch (_) {}
  };
}

// ----------------------------------------------------
// Realtime Database Playlists Operations
// ----------------------------------------------------

export async function createPlaylistRTDB(uid, name, description = "", initialTracks = [], coverUrl = "") {
  if (!uid || !name) return null;
  try {
    const playlistsRef = ref(db, `users/${uid}/playlists`);
    const snapshot = await get(playlistsRef);
    const existing = snapshot.exists() && Array.isArray(snapshot.val()) ? snapshot.val() : [];
    const firstArtwork = initialTracks[0]?.artwork_url || initialTracks[0]?.thumbnail || "";
    const resolvedCover = coverUrl || firstArtwork || "";
    const newPlaylist = {
      id: "pl_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
      name: name.trim(),
      description: description.trim(),
      cover_url: resolvedCover,
      preview_artwork: resolvedCover,
      tracks: initialTracks || [],
      track_count: (initialTracks || []).length,
      created_at: new Date().toISOString(),
    };
    const updated = [newPlaylist, ...existing];
    await set(playlistsRef, updated);
    return newPlaylist;
  } catch (error) {
    console.warn("Failed to create playlist in RTDB:", error.message);
    return null;
  }
}

export async function addTrackToPlaylistRTDB(uid, playlistId, track) {
  if (!uid || !playlistId || !track) return false;
  try {
    const playlistsRef = ref(db, `users/${uid}/playlists`);
    const snapshot = await get(playlistsRef);
    if (!snapshot.exists()) return false;
    const list = Array.isArray(snapshot.val()) ? snapshot.val() : [];
    const idx = list.findIndex((p) => p.id === playlistId);
    if (idx < 0) return false;

    const pl = list[idx];
    const tracks = Array.isArray(pl.tracks) ? [...pl.tracks] : [];
    const vid = track.videoId || track.video_id;
    if (!tracks.some((t) => (t.videoId || t.video_id) === vid)) {
      tracks.push({
        videoId: vid,
        video_id: vid,
        title: track.title || "",
        artist: track.artist || "Unknown Artist",
        album: track.album || "",
        thumbnail: track.thumbnail || track.artwork_url || "",
        artwork_url: track.artwork_url || track.thumbnail || "",
        duration: track.duration || "",
        duration_seconds: track.duration_seconds || 0,
        addedAt: new Date().toISOString(),
      });
      const firstTrackArtwork = tracks[0]?.artwork_url || tracks[0]?.thumbnail || "";
      const resolvedCover = pl.cover_url || pl.preview_artwork || firstTrackArtwork || "";
      list[idx] = {
        ...pl,
        tracks,
        track_count: tracks.length,
        cover_url: resolvedCover,
        preview_artwork: resolvedCover,
      };
      await set(playlistsRef, list);
    }
    return true;
  } catch (error) {
    console.warn("Failed to add track to playlist in RTDB:", error.message);
    return false;
  }
}

export async function removeTrackFromPlaylistRTDB(uid, playlistId, videoId) {
  if (!uid || !playlistId || !videoId) return false;
  try {
    const playlistsRef = ref(db, `users/${uid}/playlists`);
    const snapshot = await get(playlistsRef);
    if (!snapshot.exists()) return false;
    const list = Array.isArray(snapshot.val()) ? snapshot.val() : [];
    const idx = list.findIndex((p) => p.id === playlistId);
    if (idx < 0) return false;

    const pl = list[idx];
    const tracks = (pl.tracks || []).filter((t) => (t.videoId || t.video_id) !== videoId);
    const firstTrackArtwork = tracks[0]?.artwork_url || tracks[0]?.thumbnail || "";
    const resolvedCover = tracks.length > 0 ? (firstTrackArtwork || pl.cover_url || "") : "";
    list[idx] = {
      ...pl,
      tracks,
      track_count: tracks.length,
      cover_url: resolvedCover,
      preview_artwork: resolvedCover,
    };
    await set(playlistsRef, list);
    return true;
  } catch (error) {
    console.warn("Failed to remove track from playlist in RTDB:", error.message);
    return false;
  }
}

export async function deletePlaylistRTDB(uid, playlistId) {
  if (!uid || !playlistId) return false;
  try {
    const playlistsRef = ref(db, `users/${uid}/playlists`);
    const snapshot = await get(playlistsRef);
    if (!snapshot.exists()) return false;
    const list = Array.isArray(snapshot.val()) ? snapshot.val() : [];
    const updated = list.filter((p) => p.id !== playlistId);
    await set(playlistsRef, updated);
    return true;
  } catch (error) {
    console.warn("Failed to delete playlist from RTDB:", error.message);
    return false;
  }
}

// ----------------------------------------------------
// Global 1-Month Trending Music Feed in RTDB
// ----------------------------------------------------

export async function getTrendingFeedRTDB() {
  try {
    const feedRef = ref(db, "trendingFeed");
    const snapshot = await get(feedRef);
    if (snapshot.exists()) {
      return snapshot.val();
    }
    return null;
  } catch (e) {
    console.warn("Failed to read trending feed from RTDB:", e.message);
    return null;
  }
}

export async function saveTrendingFeedRTDB(feedData) {
  if (!feedData || !Array.isArray(feedData.sections)) return;
  try {
    const feedRef = ref(db, "trendingFeed");
    await set(feedRef, {
      ...feedData,
      lastUpdated: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("Failed to save trending feed to RTDB:", e.message);
  }
}

export function subscribeTrendingFeedRTDB(callback) {
  if (!callback) return () => {};
  const feedRef = ref(db, "trendingFeed");
  const listener = onValue(
    feedRef,
    (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val());
      }
    },
    (error) => {
      console.warn("RTDB trending feed subscription error:", error.message);
    }
  );
  return () => {
    try {
      off(feedRef, "value", listener);
    } catch (_) {}
  };
}

// ----------------------------------------------------
// App-Wide Community Song Play Tracking & Trending in RTDB
// ----------------------------------------------------

/**
 * Record a song play across all user profiles to track community popularity
 */
export async function recordAppSongPlay(track) {
  if (!track) return;
  const vid = track.videoId || track.video_id;
  if (!vid) return;

  try {
    const songPlayRef = ref(db, `appSongPlays/${vid}`);
    const snapshot = await get(songPlayRef);
    const existing = snapshot.exists() ? snapshot.val() : null;
    const currentPlayCount = existing && typeof existing.playCount === "number" ? existing.playCount : 0;

    const cleanData = {
      videoId: vid,
      video_id: vid,
      title: track.title || existing?.title || "",
      artist: track.artist || existing?.artist || "Unknown Artist",
      album: track.album || existing?.album || "",
      thumbnail: track.thumbnail || track.artwork_url || existing?.thumbnail || "",
      artwork_url: track.artwork_url || track.thumbnail || existing?.artwork_url || "",
      duration: track.duration || existing?.duration || "",
      duration_seconds: track.duration_seconds || existing?.duration_seconds || 0,
      playCount: currentPlayCount + 1,
      lastPlayedAt: new Date().toISOString(),
    };

    await set(songPlayRef, cleanData);
  } catch (err) {
    console.warn("Failed to record app song play in RTDB:", err.message);
  }
}

/**
 * Get top most-played songs across all app user profiles
 */
export async function getAppTrendingTracksRTDB(limit = 20) {
  try {
    const songsRef = ref(db, "appSongPlays");
    const snapshot = await get(songsRef);
    if (!snapshot.exists()) return [];

    const val = snapshot.val();
    const list = Object.values(val || {}).filter((s) => s && (s.videoId || s.video_id));
    list.sort((a, b) => {
      const pDiff = (b.playCount || 0) - (a.playCount || 0);
      if (pDiff !== 0) return pDiff;
      const bTime = b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : 0;
      const aTime = a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : 0;
      return bTime - aTime;
    });

    return list.slice(0, limit);
  } catch (err) {
    console.warn("Failed to get app trending tracks from RTDB:", err.message);
    return [];
  }
}

/**
 * Subscribe to real-time updates for app trending tracks across all user profiles
 */
export function subscribeAppTrendingRTDB(callback, limit = 20) {
  if (!callback) return () => {};
  const songsRef = ref(db, "appSongPlays");
  const listener = onValue(
    songsRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }
      const val = snapshot.val();
      const list = Object.values(val || {}).filter((s) => s && (s.videoId || s.video_id));
      list.sort((a, b) => {
        const pDiff = (b.playCount || 0) - (a.playCount || 0);
        if (pDiff !== 0) return pDiff;
        const bTime = b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : 0;
        const aTime = a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : 0;
        return bTime - aTime;
      });
      callback(list.slice(0, limit));
    },
    (error) => {
      console.warn("RTDB app trending subscription error:", error.message);
    }
  );

  return () => {
    try {
      off(songsRef, "value", listener);
    } catch (_) {}
  };
}// ─── Recent Searches ───────────────────────────────────────────────────────
// Stored at users/{uid}/recentSearches as [{query, timestamp}]

export async function addRecentSearch(uid, query) {
  if (!uid || !query || uid === "guest") return;
  try {
    const r = ref(rtdb, `users/${uid}/recentSearches`);
    const snap = await get(r);
    let searches = snap.exists() ? (snap.val() || []) : [];
    // Remove existing duplicate (case-insensitive)
    searches = searches.filter((s) => s.query.toLowerCase() !== query.toLowerCase());
    // Prepend newest
    searches.unshift({ query, timestamp: Date.now() });
    // Keep max 20
    await set(r, searches.slice(0, 20));
  } catch (_) {}
}

export async function getRecentSearches(uid) {
  if (!uid || uid === "guest") return [];
  try {
    const snap = await get(ref(rtdb, `users/${uid}/recentSearches`));
    return snap.exists() ? (snap.val() || []) : [];
  } catch (_) {
    return [];
  }
}

export async function removeRecentSearch(uid, query) {
  if (!uid || uid === "guest") return;
  try {
    const r = ref(rtdb, `users/${uid}/recentSearches`);
    const snap = await get(r);
    if (!snap.exists()) return;
    await set(r, (snap.val() || []).filter((s) => s.query.toLowerCase() !== query.toLowerCase()));
  } catch (_) {}
}

export async function clearRecentSearches(uid) {
  if (!uid || uid === "guest") return;
  try {
    await set(ref(rtdb, `users/${uid}/recentSearches`), []);
  } catch (_) {}
}

