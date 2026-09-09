// Firebase Service - Auth & Realtime Database for Staytup
import { Platform } from "react-native";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  OAuthProvider,
  signOut,
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence,
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

// Force browserLocalPersistence (localStorage) for resilient PWA & mobile sessions
if (typeof window !== "undefined") {
  try {
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn("[Auth] setPersistence warning:", err);
    });
  } catch (_) {}
}

// Detect installed/standalone PWA mode on iOS (Homescreen webclip), Android (WebAPK/TWA), and desktop
export const isStandaloneMode = () => {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true ||
    (typeof document !== "undefined" &&
      document.referrer &&
      document.referrer.includes("android-app://"))
  );
};

// Helper to detect mobile browser/device
export const isMobileDevice = () => {
  if (Platform.OS === "android" || Platform.OS === "ios") return true;
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent || "";
    const platform = navigator.platform || "";
    if (/Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua)) return true;
    if (platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
    if (typeof window !== "undefined" && window.innerWidth <= 768 && (navigator.maxTouchPoints > 0 || "ontouchstart" in window)) {
      return true;
    }
  }
  return false;
};

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// Apple Auth Provider
// Configured with Firebase Auth handler: https://staytupnow.firebaseapp.com/__/auth/handler
const appleProvider = new OAuthProvider("apple.com");
appleProvider.addScope("email");
appleProvider.addScope("name");

/**
 * Sign in using Google popup / redirect
 * - In standalone PWA mode (iOS & Android home screen app), signInWithRedirect
 *   forces the user out of the standalone container into external Safari/Chrome,
 *   losing the PWA session. Therefore, PWAs MUST use signInWithPopup.
 * - In standard mobile and desktop browsers, signInWithPopup is attempted first.
 *   With Cross-Origin-Opener-Policy "same-origin-allow-popups", popups work cleanly.
 *   If blocked or failing, it falls back seamlessly to signInWithRedirect.
 */
export async function loginWithGoogle() {
  const isPWA = isStandaloneMode();

  if (isPWA) {
    try {
      console.log("[Auth] Standalone PWA mode: authenticating via popup.");
      const result = await signInWithPopup(auth, googleProvider);
      return { success: true, user: result.user };
    } catch (popupErr) {
      console.warn("[Auth] PWA popup sign-in error:", popupErr.code, popupErr.message);
      if (
        popupErr.code === "auth/popup-blocked" ||
        popupErr.code === "auth/cancelled-popup-request"
      ) {
        try {
          console.log("[Auth] PWA popup blocked: falling back to redirect.");
          if (typeof window !== "undefined") {
            window.sessionStorage?.setItem("@staytup_pending_oauth_redirect", "true");
            window.sessionStorage?.setItem("@staytup_oauth_fresh_login", "true");
            window.sessionStorage?.removeItem("@staytup_auth_error");
            window.localStorage?.setItem("@staytup_pending_oauth_redirect", "true");
            window.localStorage?.setItem("@staytup_oauth_fresh_login", "true");
            window.localStorage?.removeItem("@staytup_auth_error");
          }
          await signInWithRedirect(auth, googleProvider);
          return { success: true, redirecting: true };
        } catch (redirErr) {
          return { success: false, error: redirErr.message, code: redirErr.code };
        }
      }
      return { success: false, error: popupErr.message, code: popupErr.code };
    }
  }

  // Standard web browser flow (desktop & mobile browser)
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return { success: true, user: result.user };
  } catch (error) {
    console.warn("Google Sign-In Popup Error:", error.code, error.message);
    const isCoopOrPopupError =
      error.code === "auth/popup-blocked" ||
      error.code === "auth/cancelled-popup-request" ||
      error.code === "auth/unauthorized-domain" ||
      error.code === "auth/popup-closed-by-user" ||
      (error.message &&
        (error.message.includes("Cross-Origin-Opener-Policy") ||
          error.message.includes("window.closed") ||
          error.message.includes("popup")));

    if (isCoopOrPopupError) {
      try {
        console.log("[Auth] Falling back to OAuth redirect via https://staytupnow.firebaseapp.com/__/auth/handler");
        if (typeof window !== "undefined") {
          window.sessionStorage?.setItem("@staytup_pending_oauth_redirect", "true");
          window.sessionStorage?.setItem("@staytup_oauth_fresh_login", "true");
          window.sessionStorage?.removeItem("@staytup_auth_error");
          window.localStorage?.setItem("@staytup_pending_oauth_redirect", "true");
          window.localStorage?.setItem("@staytup_oauth_fresh_login", "true");
          window.localStorage?.removeItem("@staytup_auth_error");
        }
        await signInWithRedirect(auth, googleProvider);
        return { success: true, redirecting: true };
      } catch (redirErr) {
        return { success: false, error: redirErr.message, code: redirErr.code };
      }
    }
    return { success: false, error: error.message, code: error.code };
  }
}

/**
 * Sign in using Apple
 * Configured with https://staytupnow.firebaseapp.com/__/auth/handler
 */
export async function loginWithApple() {
  const isPWA = isStandaloneMode();

  if (isPWA) {
    try {
      console.log("[Auth] Standalone PWA mode: authenticating Apple via popup.");
      const result = await signInWithPopup(auth, appleProvider);
      return { success: true, user: result.user };
    } catch (popupErr) {
      console.warn("[Auth] PWA Apple popup sign-in error:", popupErr.code, popupErr.message);
      if (
        popupErr.code === "auth/popup-blocked" ||
        popupErr.code === "auth/cancelled-popup-request"
      ) {
        try {
          console.log("[Auth] PWA Apple popup blocked: falling back to redirect.");
          if (typeof window !== "undefined") {
            window.sessionStorage?.setItem("@staytup_pending_oauth_redirect", "true");
            window.sessionStorage?.setItem("@staytup_oauth_fresh_login", "true");
            window.sessionStorage?.removeItem("@staytup_auth_error");
            window.localStorage?.setItem("@staytup_pending_oauth_redirect", "true");
            window.localStorage?.setItem("@staytup_oauth_fresh_login", "true");
            window.localStorage?.removeItem("@staytup_auth_error");
          }
          await signInWithRedirect(auth, appleProvider);
          return { success: true, redirecting: true };
        } catch (redirErr) {
          return { success: false, error: redirErr.message, code: redirErr.code };
        }
      }
      return { success: false, error: popupErr.message, code: popupErr.code };
    }
  }

  try {
    const result = await signInWithPopup(auth, appleProvider);
    return { success: true, user: result.user };
  } catch (error) {
    console.warn("Apple Sign-In Popup Error:", error.code, error.message);
    const isCoopOrPopupError =
      error.code === "auth/popup-blocked" ||
      error.code === "auth/cancelled-popup-request" ||
      error.code === "auth/unauthorized-domain" ||
      error.code === "auth/popup-closed-by-user" ||
      (error.message &&
        (error.message.includes("Cross-Origin-Opener-Policy") ||
          error.message.includes("window.closed") ||
          error.message.includes("popup")));

    if (isCoopOrPopupError) {
      try {
        console.log("[Auth] Falling back to Apple OAuth redirect via https://staytupnow.firebaseapp.com/__/auth/handler");
        if (typeof window !== "undefined") {
          window.sessionStorage?.setItem("@staytup_pending_oauth_redirect", "true");
          window.sessionStorage?.setItem("@staytup_oauth_fresh_login", "true");
          window.sessionStorage?.removeItem("@staytup_auth_error");
          window.localStorage?.setItem("@staytup_pending_oauth_redirect", "true");
          window.localStorage?.setItem("@staytup_oauth_fresh_login", "true");
          window.localStorage?.removeItem("@staytup_auth_error");
        }
        await signInWithRedirect(auth, appleProvider);
        return { success: true, redirecting: true };
      } catch (redirErr) {
        return { success: false, error: redirErr.message, code: redirErr.code };
      }
    }
    return { success: false, error: error.message, code: error.code };
  }
}

/**
 * Check if user returned from OAuth redirect (e.g. Apple or Google sign-in)
 */
export async function checkAuthRedirect() {
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      let isNewUser = false;
      try {
        const info = getAdditionalUserInfo(result);
        if (info && info.isNewUser) {
          isNewUser = true;
        }
      } catch (_) {}
      return { success: true, user: result.user, isNewUser, credential: result };
    }
    return null;
  } catch (error) {
    console.warn("Auth Redirect Result Error:", error.code, error.message);
    return { success: false, error: error.message, code: error.code };
  }
}

/**
 * Guest login removed permanently
 */
export async function loginAsGuest() {
  return { success: false, error: "Guest login has been disabled. Please sign in with Google or Apple." };
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
        // Name already taken with a different PIN: assign random unique username suffix without blocking
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const uniqueUsername = `${username.trim()}_${randomSuffix}`;
        const uniqueClean = `${clean}_${randomSuffix}`;
        const newUser = {
          uid: `pin_${uniqueClean}_${Date.now().toString(36)}`,
          displayName: uniqueUsername,
          username: uniqueUsername,
          cleanUser: uniqueClean,
          pin: cleanPin,
          createdAt: Date.now(),
        };
        await set(ref(db, `pin_users/${uniqueClean}`), newUser);
        await saveLocalSession("@staytup_pin_user", { ...newUser, pin: cleanPin });
        return { success: true, user: newUser, isNewUser: true };
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
    const rawUsername = profileData.username || "listener";
    const cleanUsername = rawUsername.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 15) || "listener";

    let cleanDisplayName = profileData.displayName || profileData.name || "";
    if (cleanDisplayName) {
      cleanDisplayName = cleanDisplayName
        .slice(0, 15)
        .split(/\s+/)
        .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ""))
        .join(" ")
        .slice(0, 15);
    }

    const payload = {
      ...profileData,
      username: cleanUsername,
      ...(cleanDisplayName ? { displayName: cleanDisplayName, name: cleanDisplayName } : {}),
      updatedAt: new Date().toISOString(),
    };

    const profileRef = ref(db, `users/${uid}/profile`);
    await update(profileRef, payload);

    // Public directory index for friend search & discovery
    const friendCode = cleanUsername.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    const publicRef = ref(db, `publicUsers/${uid}`);
    await update(publicRef, {
      uid,
      username: cleanUsername,
      displayName: cleanDisplayName || cleanUsername,
      avatar: profileData.avatar || "initial",
      avatarColor: profileData.avatarColor || "#8C52FF",
      friendCode,
      updatedAt: Date.now(),
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
      const seen = new Set();
      const deduped = [];
      for (const p of normalized) {
        const id = String(p.id || p.collabId || "");
        if (id && !seen.has(id)) {
          seen.add(id);
          deduped.push(p);
        } else if (!id) {
          deduped.push(p);
        }
      }
      callback(deduped);
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

export function getActiveAuthUid() {
  if (auth?.currentUser?.uid) return auth.currentUser.uid;
  if (Platform.OS === "web" && typeof window !== "undefined" && window.localStorage) {
    try {
      const fb = window.localStorage.getItem("@staytup_firebase_user");
      if (fb) {
        const p = JSON.parse(fb);
        if (p?.uid) return p.uid;
      }
      const pin = window.localStorage.getItem("@staytup_pin_user");
      if (pin) {
        const p = JSON.parse(pin);
        if (p?.uid) return p.uid;
      }
      const qr = window.localStorage.getItem("@staytup_qr_user");
      if (qr) {
        const p = JSON.parse(qr);
        if (p?.uid) return p.uid;
      }
    } catch (_) {}
  }
  return "guest";
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
  const activeUid = getActiveAuthUid();
  const safeUid = (uid && uid !== "guest") ? uid : activeUid;
  if (!track) return;
  const vid = track.videoId || track.video_id || (track.id ? String(track.id).replace(/^saavn_/, "") : "");
  if (!vid) return;

  const cleanTrack = {
    id: track.id || `saavn_${vid}`,
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

  // Immediate local update for active UID and guest
  const currentLocal = getLocalRecents(safeUid);
  const updatedLocal = [cleanTrack, ...currentLocal.filter((t) => (t.videoId || t.video_id || t.id) !== vid && String(t.id || "").replace(/^saavn_/, "") !== vid)].slice(0, 50);
  setLocalRecents(safeUid, updatedLocal);
  if (safeUid !== "guest") {
    setLocalRecents("guest", updatedLocal);
  }

  try {
    const recentRef = ref(db, `users/${safeUid}/recentlyPlayed`);
    const snapshot = await get(recentRef);
    let list = [];
    if (snapshot.exists() && Array.isArray(snapshot.val())) {
      list = snapshot.val();
    }
    list = list.filter((t) => (t.videoId || t.video_id || t.id) !== vid && String(t.id || "").replace(/^saavn_/, "") !== vid);
    list.unshift(cleanTrack);
    if (list.length > 50) list = list.slice(0, 50);

    await set(recentRef, list);
    setLocalRecents(safeUid, list);
    if (safeUid !== "guest") {
      setLocalRecents("guest", list);
    }
  } catch (error) {
    console.warn("Failed to save recently played track to RTDB:", error.message);
  }

  // Also record user stream count
  recordUserStream(safeUid).catch(() => {});
}

export async function getRecentlyPlayed(uid) {
  const activeUid = getActiveAuthUid();
  const safeUid = (uid && uid !== "guest") ? uid : activeUid;
  let local = getLocalRecents(safeUid);
  if ((!local || local.length === 0) && safeUid !== "guest") {
    local = getLocalRecents("guest");
  }
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
    if (safeUid !== "guest") {
      const guestLocal = getLocalRecents("guest");
      if (guestLocal && guestLocal.length > 0) return guestLocal;
    }
    return [];
  } catch (error) {
    console.warn("Failed to get recently played from RTDB:", error.message);
    return getLocalRecents(safeUid) || getLocalRecents("guest") || [];
  }
}

export function subscribeRecentlyPlayed(uid, callback) {
  const activeUid = getActiveAuthUid();
  const safeUid = (uid && uid !== "guest") ? uid : activeUid;
  if (!callback) return () => {};

  // Immediate callback with cached items
  let local = getLocalRecents(safeUid);
  if ((!local || local.length === 0) && safeUid !== "guest") {
    local = getLocalRecents("guest");
  }
  if (local && local.length > 0) {
    callback(local);
  }

  const localListener = (list, listenerUid) => {
    if (listenerUid === safeUid || listenerUid === "guest" || listenerUid === activeUid) {
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
      if (list.length > 0 || safeUid === "guest") {
        setLocalRecents(safeUid, list);
        callback(list);
      } else {
        const guestRecents = getLocalRecents("guest");
        if (guestRecents && guestRecents.length > 0) {
          callback(guestRecents);
        } else {
          callback([]);
        }
      }
    },
    (err) => {
      console.warn("RTDB recently played subscription error:", err.message);
      callback(getLocalRecents(safeUid) || getLocalRecents("guest") || []);
    }
  );

  return () => {
    localRecentsListeners.delete(localListener);
    off(recentRef, "value", listener);
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
    const rawExisting = snapshot.exists() && Array.isArray(snapshot.val()) ? snapshot.val() : (snapshot.exists() && typeof snapshot.val() === "object" ? Object.values(snapshot.val()) : []);
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
    const seen = new Set([newPlaylist.id]);
    const dedupedExisting = [];
    for (const p of rawExisting) {
      const pid = String(p?.id || p?.collabId || "");
      if (pid && !seen.has(pid)) {
        seen.add(pid);
        dedupedExisting.push(p);
      }
    }
    const updated = [newPlaylist, ...dedupedExisting];
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

export async function addTracksToPlaylistRTDB(uid, playlistId, newTracks) {
  if (!uid || !playlistId || !Array.isArray(newTracks) || newTracks.length === 0) return false;
  try {
    const playlistsRef = ref(db, `users/${uid}/playlists`);
    const snapshot = await get(playlistsRef);
    if (!snapshot.exists()) return false;
    const list = Array.isArray(snapshot.val()) ? snapshot.val() : [];
    const idx = list.findIndex((p) => p.id === playlistId);
    if (idx < 0) return false;

    const pl = list[idx];
    const tracks = Array.isArray(pl.tracks) ? [...pl.tracks] : [];
    const existingIds = new Set(tracks.map((t) => t.videoId || t.video_id || t.id));

    let addedCount = 0;
    for (const track of newTracks) {
      const vid = track.videoId || track.video_id || track.id;
      if (vid && !existingIds.has(vid)) {
        existingIds.add(vid);
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
          stream_url: track.stream_url || "",
          addedAt: new Date().toISOString(),
        });
        addedCount++;
      }
    }

    if (addedCount > 0) {
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
    return list[idx];
  } catch (error) {
    console.warn("Failed to batch add tracks to playlist in RTDB:", error.message);
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

export async function renamePlaylistRTDB(uid, playlistId, newName, newCover = "") {
  if (!uid || !playlistId || !newName) return false;
  try {
    const playlistsRef = ref(db, `users/${uid}/playlists`);
    const snapshot = await get(playlistsRef);
    if (!snapshot.exists()) return false;
    const list = Array.isArray(snapshot.val()) ? snapshot.val() : [];
    const idx = list.findIndex((p) => p.id === playlistId);
    if (idx < 0) return false;

    list[idx] = {
      ...list[idx],
      name: newName.trim(),
      ...(newCover ? { cover_url: newCover, preview_artwork: newCover } : {}),
      updatedAt: Date.now(),
    };
    await set(playlistsRef, list);
    return list[idx];
  } catch (error) {
    console.warn("Failed to rename playlist in RTDB:", error.message);
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

// ----------------------------------------------------
// Realtime Database Friend System
// ----------------------------------------------------

/**
 * Subscribe to user friends in RTDB
 */
export function subscribeFriends(uid, callback) {
  if (!uid || !callback) return () => {};
  const safeUid = uid || "guest";
  const friendsRef = ref(db, `users/${safeUid}/friends`);
  const listener = onValue(
    friendsRef,
    (snapshot) => {
      const val = snapshot.val();
      const list = val && typeof val === "object" ? Object.values(val) : [];
      callback(list);
    },
    (error) => {
      console.warn("RTDB friends subscription error:", error.message);
    }
  );
  return () => off(friendsRef, "value", listener);
}

/**
 * Subscribe to incoming and outgoing friend requests
 */
export function subscribeFriendRequests(uid, callback) {
  if (!uid || !callback) return () => {};
  const safeUid = uid || "guest";
  const requestsRef = ref(db, `users/${safeUid}/friendRequests`);
  const listener = onValue(
    requestsRef,
    (snapshot) => {
      const val = snapshot.val() || {};
      const incoming = val.incoming && typeof val.incoming === "object" ? Object.values(val.incoming) : [];
      const outgoing = val.outgoing && typeof val.outgoing === "object" ? Object.values(val.outgoing) : [];
      callback({ incoming, outgoing });
    },
    (error) => {
      console.warn("RTDB friend requests subscription error:", error.message);
    }
  );
  return () => off(requestsRef, "value", listener);
}

/**
 * Send a friend request to another user
 */
export async function sendFriendRequestRTDB(senderUser, recipientUid, recipientUser) {
  if (!senderUser?.uid || !recipientUid) return false;
  if (senderUser.uid === recipientUid) return false;

  try {
    const senderData = {
      uid: senderUser.uid,
      username: senderUser.username || senderUser.displayName || "Staytup Listener",
      avatar: senderUser.avatar || senderUser.photoURL || "initial",
      avatarColor: senderUser.avatarColor || "#1DB954",
      sentAt: Date.now(),
    };

    const recipientData = {
      uid: recipientUid,
      username: recipientUser?.username || "Staytup Friend",
      avatar: recipientUser?.avatar || "initial",
      avatarColor: recipientUser?.avatarColor || "#1DB954",
      sentAt: Date.now(),
    };

    const incomingRef = ref(db, `users/${recipientUid}/friendRequests/incoming/${senderUser.uid}`);
    const outgoingRef = ref(db, `users/${senderUser.uid}/friendRequests/outgoing/${recipientUid}`);

    await Promise.all([
      set(incomingRef, senderData),
      set(outgoingRef, recipientData),
    ]);
    return true;
  } catch (error) {
    console.warn("Failed to send friend request:", error.message);
    return false;
  }
}

/**
 * Accept an incoming friend request
 */
export async function acceptFriendRequestRTDB(currentUser, requestUser) {
  if (!currentUser?.uid || !requestUser?.uid) return false;
  try {
    const curUid = currentUser.uid;
    const reqUid = requestUser.uid;

    const myFriendData = {
      uid: reqUid,
      username: requestUser.username || "Friend",
      avatar: requestUser.avatar || "initial",
      avatarColor: requestUser.avatarColor || "#1DB954",
      addedAt: Date.now(),
    };

    const theirFriendData = {
      uid: curUid,
      username: currentUser.username || currentUser.displayName || "Friend",
      avatar: currentUser.avatar || currentUser.photoURL || "initial",
      avatarColor: currentUser.avatarColor || "#1DB954",
      addedAt: Date.now(),
    };

    await Promise.all([
      set(ref(db, `users/${curUid}/friends/${reqUid}`), myFriendData),
      set(ref(db, `users/${reqUid}/friends/${curUid}`), theirFriendData),
      set(ref(db, `users/${curUid}/friendRequests/incoming/${reqUid}`), null),
      set(ref(db, `users/${reqUid}/friendRequests/outgoing/${curUid}`), null),
    ]);
    return true;
  } catch (error) {
    console.warn("Failed to accept friend request:", error.message);
    return false;
  }
}

/**
 * Decline an incoming friend request
 */
export async function declineFriendRequestRTDB(currentUid, senderUid) {
  if (!currentUid || !senderUid) return false;
  try {
    await Promise.all([
      set(ref(db, `users/${currentUid}/friendRequests/incoming/${senderUid}`), null),
      set(ref(db, `users/${senderUid}/friendRequests/outgoing/${currentUid}`), null),
    ]);
    return true;
  } catch (error) {
    console.warn("Failed to decline friend request:", error.message);
    return false;
  }
}

/**
 * Cancel an outgoing friend request
 */
export async function cancelFriendRequestRTDB(currentUid, recipientUid) {
  if (!currentUid || !recipientUid) return false;
  try {
    await Promise.all([
      set(ref(db, `users/${currentUid}/friendRequests/outgoing/${recipientUid}`), null),
      set(ref(db, `users/${recipientUid}/friendRequests/incoming/${currentUid}`), null),
    ]);
    return true;
  } catch (error) {
    console.warn("Failed to cancel friend request:", error.message);
    return false;
  }
}

/**
 * Remove a friend from both sides
 */
export async function removeFriendRTDB(currentUid, friendUid) {
  if (!currentUid || !friendUid) return false;
  try {
    await Promise.all([
      set(ref(db, `users/${currentUid}/friends/${friendUid}`), null),
      set(ref(db, `users/${friendUid}/friends/${currentUid}`), null),
    ]);
    return true;
  } catch (error) {
    console.warn("Failed to remove friend:", error.message);
    return false;
  }
}

/**
 * Search public users by username or friendCode
 */
export async function searchUsersRTDB(query, currentUid) {
  const cleanQ = (query || "").trim().toLowerCase().replace(/^@/, "");
  try {
    const publicRef = ref(db, "publicUsers");
    const snapshot = await get(publicRef);
    let list = [];
    if (snapshot.exists()) {
      const val = snapshot.val();
      list = Object.values(val || {}).filter((u) => u && u.uid && u.uid !== currentUid);
    }
    if (cleanQ) {
      list = list.filter((u) =>
        (u.username && u.username.toLowerCase().includes(cleanQ)) ||
        (u.friendCode && u.friendCode.toLowerCase().includes(cleanQ)) ||
        (u.uid && u.uid.toLowerCase() === cleanQ)
      );
    }
    return list.slice(0, 20);
  } catch (error) {
    console.warn("Failed to search users in RTDB:", error.message);
    return [];
  }
}

/**
 * Subscribe to a friend's live playback status
 */
export function subscribeFriendActivity(friendUid, callback) {
  if (!friendUid || !callback) return () => {};

  const playbackRef = ref(db, `users/${friendUid}/lastPlayback`);
  const sessionRef = ref(db, `users/${friendUid}/playbackSession`);

  let currentPlayback = null;
  let currentSession = null;

  const emit = () => {
    const isPlaying = Boolean(currentSession?.isPlaying);
    const sessionAge = currentSession?.updatedAt ? Date.now() - currentSession.updatedAt : Infinity;
    const isLive = isPlaying && sessionAge < 1000 * 60 * 30; // Within 30 minutes
    callback({
      track: currentPlayback?.track || null,
      isPlaying: isLive,
      updatedAt: currentPlayback?.updatedAt || currentSession?.updatedAt || null,
    });
  };

  const pbListener = onValue(playbackRef, (snap) => {
    currentPlayback = snap.val();
    emit();
  });

  const sessListener = onValue(sessionRef, (snap) => {
    currentSession = snap.val();
    emit();
  });

  return () => {
    try {
      off(playbackRef, "value", pbListener);
      off(sessionRef, "value", sessListener);
    } catch (_) {}
  };
}


// ─── ARTIST DATABASE CACHE ──────────────────────────────────────────────────

function sanitizeDbKey(key) {
  if (!key || typeof key !== "string") return "";
  return key.trim().toLowerCase().replace(/\s+/g, "_").replace(/[.#$[\]/]/g, "_");
}

/**
 * Get a cached artist record by artist ID or sanitized name
 */
export async function getCachedArtist(artistIdOrName) {
  if (!artistIdOrName) return null;
  const clean = sanitizeDbKey(String(artistIdOrName));
  if (!clean) return null;

  try {
    const snap = await get(ref(db, `artists_cache/${clean}`));
    if (snap && snap.exists()) {
      const data = snap.val();
      if (data && (data.imageUrl || data.image)) {
        return {
          id: data.id || clean,
          name: data.name || artistIdOrName,
          imageUrl: data.imageUrl || data.image,
          image: data.imageUrl || data.image,
          updatedAt: data.updatedAt || 0,
        };
      }
    }
  } catch (_) {}
  return null;
}

/**
 * Save an artist record to database cache
 * Saves uniquely under standardized key (no duplicates)
 */
export async function saveCachedArtist(artist) {
  if (!artist) return false;
  const name = artist.name || "";
  const rawKey = name || artist.id || "";
  const cleanKey = sanitizeDbKey(rawKey);
  if (!cleanKey) return false;

  const imageUrl = artist.imageUrl || artist.image;
  if (!imageUrl || typeof imageUrl !== "string") return false;

  const record = {
    id: String(artist.id || cleanKey),
    name: name || artist.id || cleanKey,
    imageUrl,
    updatedAt: Date.now(),
  };

  try {
    await set(ref(db, `artists_cache/${cleanKey}`), record);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Get cached artist records in batch
 */
export async function getBatchCachedArtists(artistIdsOrNames) {
  if (!Array.isArray(artistIdsOrNames) || artistIdsOrNames.length === 0) return {};
  const results = {};
  await Promise.allSettled(
    artistIdsOrNames.map(async (item) => {
      if (!item) return;
      const key = typeof item === "object" ? (item.id || item.name) : item;
      const cached = await getCachedArtist(key);
      if (cached) {
        results[key] = cached;
        if (cached.name) results[cached.name] = cached;
        if (cached.id) results[cached.id] = cached;
      }
    })
  );
  return results;
}

// ─── Referral Code System ─────────────────────────────────────────────────────

/**
 * Generate a random 8-character alphanumeric referral code.
 */
function generateReferralCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Get the user's referral code from the database.
 * If no code exists yet, generate one and store it.
 * Returns { code, createdAt, usedBy }
 */
export async function getOrCreateReferralCode(uid) {
  if (!uid) return null;
  try {
    const codeRef = ref(db, `referral_codes/byUser/${uid}`);
    const snap = await get(codeRef);
    if (snap.exists()) {
      return snap.val();
    }
    // Generate a unique code and store it
    const code = generateReferralCode();
    const data = {
      code,
      uid,
      createdAt: Date.now(),
      usedCount: 0,
    };
    // Store under user's UID
    await set(codeRef, data);
    // Also store a reverse lookup: code → uid
    await set(ref(db, `referral_codes/byCode/${code}`), { uid, createdAt: Date.now() });
    return data;
  } catch (err) {
    console.warn("getOrCreateReferralCode error:", err);
    return null;
  }
}

/**
 * Look up a referral code to find the inviter's UID.
 */
export async function lookupReferralCode(code) {
  if (!code) return null;
  try {
    const snap = await get(ref(db, `referral_codes/byCode/${code.toUpperCase()}`));
    return snap.exists() ? snap.val() : null;
  } catch (err) {
    console.warn("lookupReferralCode error:", err);
    return null;
  }
}

/**
 * Record that a user signed up using a referral code.
 */
export async function recordReferralUsage(referralCode, newUserUid) {
  if (!referralCode || !newUserUid) return;
  try {
    const codeData = await lookupReferralCode(referralCode);
    if (!codeData || !codeData.uid) return;

    const inviterUid = codeData.uid;
    // Record who used the code
    await set(ref(db, `referral_codes/byCode/${referralCode.toUpperCase()}/usedBy/${newUserUid}`), Date.now());
    // Increment the inviter's usage count
    const countSnap = await get(ref(db, `referral_codes/byUser/${inviterUid}/usedCount`));
    const currentCount = countSnap.exists() ? countSnap.val() : 0;
    await set(ref(db, `referral_codes/byUser/${inviterUid}/usedCount`), currentCount + 1);
  } catch (err) {
    console.warn("recordReferralUsage error:", err);
  }
}

/**
 * Get the referral count for a user.
 */
export async function getReferralCount(uid) {
  if (!uid) return 0;
  try {
    const snap = await get(ref(db, `referral_codes/byUser/${uid}/usedCount`));
    return snap.exists() ? snap.val() : 0;
  } catch (err) {
    return 0;
  }
}

// ─── COLLABORATIVE PLAYLISTS ──────────────────────────────────────────────────

/**
 * Create a new collaborative playlist or convert an existing playlist
 */
export async function createCollabPlaylist(ownerUid, ownerProfile = {}, playlistData = {}) {
  if (!ownerUid) return { success: false, error: "Authentication required" };

  try {
    const existingId = playlistData.existingId || playlistData.id;
    // If it is already a collab playlist, preserve id, otherwise use existingId if valid or generate collabId
    const collabId = playlistData.collabId || (existingId ? `collab_${existingId.replace(/^pl_/, '')}` : `collab_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`);
    const ownerName = ownerProfile?.username || ownerProfile?.displayName || "Staytup Listener";
    const ownerAvatar = ownerProfile?.avatar || "initial";
    const ownerAvatarColor = ownerProfile?.avatarColor || "#1DB954";

    const initialTracks = Array.isArray(playlistData.tracks) ? playlistData.tracks : [];
    const firstArtwork = initialTracks[0]?.artwork_url || initialTracks[0]?.thumbnail || "";
    const cover = playlistData.cover_url || playlistData.preview_artwork || firstArtwork || "";

    const collabRecord = {
      id: collabId,
      collabId,
      originalPlaylistId: existingId || null,
      name: (playlistData.name || "Collab Playlist").trim(),
      description: (playlistData.description || "Shared with friends").trim(),
      cover_url: cover,
      preview_artwork: cover,
      ownerUid,
      ownerName,
      ownerAvatar,
      ownerAvatarColor,
      collaborators: {
        [ownerUid]: {
          uid: ownerUid,
          name: ownerName,
          avatar: ownerAvatar,
          avatarColor: ownerAvatarColor,
          role: "owner",
          joinedAt: Date.now(),
        },
      },
      tracks: initialTracks,
      track_count: initialTracks.length,
      createdAt: playlistData.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    // Store in global collab_playlists
    await set(ref(db, `collab_playlists/${collabId}`), collabRecord);

    // Register on owner's collabPlaylists index
    await set(ref(db, `users/${ownerUid}/collab_playlists/${collabId}`), {
      collabId,
      role: "owner",
      joinedAt: Date.now(),
    });

    // If converting from an existing personal playlist, remove from personal playlists so no duplicate exists
    if (existingId) {
      await deletePlaylistRTDB(ownerUid, existingId).catch(() => {});
    }

    return { success: true, collabId, playlist: collabRecord };
  } catch (err) {
    console.warn("createCollabPlaylist error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Join an existing collaborative playlist
 */
export async function joinCollabPlaylist(uid, userProfile = {}, collabId) {
  if (!uid || !collabId) return { success: false, error: "Missing user ID or playlist ID" };

  try {
    const playlistRef = ref(db, `collab_playlists/${collabId}`);
    const snap = await get(playlistRef);
    if (!snap.exists()) {
      return { success: false, error: "Collaborative playlist not found" };
    }

    const playlist = snap.val();
    const userName = userProfile?.username || userProfile?.displayName || "Staytup Listener";
    const userAvatar = userProfile?.avatar || "initial";
    const userAvatarColor = userProfile?.avatarColor || "#1DB954";

    const collaboratorInfo = {
      uid,
      name: userName,
      avatar: userAvatar,
      avatarColor: userAvatarColor,
      role: "editor",
      joinedAt: Date.now(),
    };

    // Add to playlist's collaborators
    await set(ref(db, `collab_playlists/${collabId}/collaborators/${uid}`), collaboratorInfo);

    // Register on user's personal collab_playlists index
    await set(ref(db, `users/${uid}/collab_playlists/${collabId}`), {
      collabId,
      role: "editor",
      joinedAt: Date.now(),
    });

    const updatedPlaylist = {
      ...playlist,
      collaborators: {
        ...(playlist.collaborators || {}),
        [uid]: collaboratorInfo,
      },
    };

    return { success: true, playlist: updatedPlaylist };
  } catch (err) {
    console.warn("joinCollabPlaylist error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Leave a collaborative playlist
 */
export async function leaveCollabPlaylist(uid, collabId) {
  if (!uid || !collabId) return false;
  try {
    await set(ref(db, `collab_playlists/${collabId}/collaborators/${uid}`), null);
    await set(ref(db, `users/${uid}/collab_playlists/${collabId}`), null);
    return true;
  } catch (err) {
    console.warn("leaveCollabPlaylist error:", err);
    return false;
  }
}

/**
 * Add a track to a collaborative playlist in real time
 */
export async function addTrackToCollabPlaylist(collabId, track) {
  if (!collabId || !track) return false;
  try {
    const plRef = ref(db, `collab_playlists/${collabId}`);
    const snap = await get(plRef);
    if (!snap.exists()) return false;

    const pl = snap.val();
    const tracks = Array.isArray(pl.tracks) ? [...pl.tracks] : [];
    const vid = track.videoId || track.video_id || track.id;

    if (!tracks.some((t) => (t.videoId || t.video_id || t.id) === vid)) {
      const formattedTrack = {
        id: vid,
        videoId: vid,
        video_id: vid,
        title: track.title || "Unknown Song",
        artist: track.artist || "Unknown Artist",
        album: track.album || "",
        thumbnail: track.thumbnail || track.artwork_url || "",
        artwork_url: track.artwork_url || track.thumbnail || "",
        duration: track.duration || "",
        duration_seconds: track.duration_seconds || 0,
        addedAt: Date.now(),
      };
      tracks.push(formattedTrack);

      const firstArtwork = tracks[0]?.artwork_url || tracks[0]?.thumbnail || "";
      const cover = pl.cover_url || pl.preview_artwork || firstArtwork || "";

      await update(plRef, {
        tracks,
        track_count: tracks.length,
        cover_url: cover,
        preview_artwork: cover,
        updatedAt: Date.now(),
      });
    }
    return true;
  } catch (err) {
    console.warn("addTrackToCollabPlaylist error:", err);
    return false;
  }
}

/**
 * Add multiple tracks to a collaborative playlist in real time
 */
export async function addTracksToCollabPlaylist(collabId, newTracks) {
  if (!collabId || !Array.isArray(newTracks) || newTracks.length === 0) return false;
  try {
    const plRef = ref(db, `collab_playlists/${collabId}`);
    const snap = await get(plRef);
    if (!snap.exists()) return false;

    const pl = snap.val();
    const tracks = Array.isArray(pl.tracks) ? [...pl.tracks] : [];
    const existingIds = new Set(tracks.map((t) => t.videoId || t.video_id || t.id));

    let addedCount = 0;
    for (const track of newTracks) {
      const vid = track.videoId || track.video_id || track.id;
      if (vid && !existingIds.has(vid)) {
        existingIds.add(vid);
        tracks.push({
          id: vid,
          videoId: vid,
          video_id: vid,
          title: track.title || "Unknown Song",
          artist: track.artist || "Unknown Artist",
          album: track.album || "",
          thumbnail: track.thumbnail || track.artwork_url || "",
          artwork_url: track.artwork_url || track.thumbnail || "",
          duration: track.duration || "",
          duration_seconds: track.duration_seconds || 0,
          stream_url: track.stream_url || "",
          addedAt: Date.now(),
        });
        addedCount++;
      }
    }

    if (addedCount > 0) {
      const firstArtwork = tracks[0]?.artwork_url || tracks[0]?.thumbnail || "";
      const cover = pl.cover_url || pl.preview_artwork || firstArtwork || "";
      await update(plRef, {
        tracks,
        track_count: tracks.length,
        cover_url: cover,
        preview_artwork: cover,
        updatedAt: Date.now(),
      });
    }
    return true;
  } catch (err) {
    console.warn("addTracksToCollabPlaylist error:", err);
    return false;
  }
}

/**
 * Remove a track from a collaborative playlist in real time
 */
export async function removeTrackFromCollabPlaylist(collabId, videoId) {
  if (!collabId || !videoId) return false;
  try {
    const plRef = ref(db, `collab_playlists/${collabId}`);
    const snap = await get(plRef);
    if (!snap.exists()) return false;

    const pl = snap.val();
    const tracks = (pl.tracks || []).filter((t) => (t.videoId || t.video_id || t.id) !== videoId);
    const firstArtwork = tracks[0]?.artwork_url || tracks[0]?.thumbnail || "";
    const cover = tracks.length > 0 ? (firstArtwork || pl.cover_url || "") : "";

    await update(plRef, {
      tracks,
      track_count: tracks.length,
      cover_url: cover,
      preview_artwork: cover,
      updatedAt: Date.now(),
    });
    return true;
  } catch (err) {
    console.warn("removeTrackFromCollabPlaylist error:", err);
    return false;
  }
}

/**
 * Get details for a single collaborative playlist
 */
export async function getCollabPlaylistDetails(collabId) {
  if (!collabId) return null;
  try {
    const snap = await get(ref(db, `collab_playlists/${collabId}`));
    return snap.exists() ? snap.val() : null;
  } catch (_) {
    return null;
  }
}

/**
 * Remove a specific collaborator from a collaborative playlist (by owner or self)
 */
export async function removeCollaboratorFromCollabPlaylist(collabId, targetUid) {
  if (!collabId || !targetUid) return false;
  try {
    await set(ref(db, `collab_playlists/${collabId}/collaborators/${targetUid}`), null);
    await set(ref(db, `users/${targetUid}/collab_playlists/${collabId}`), null);
    return true;
  } catch (err) {
    console.warn("removeCollaboratorFromCollabPlaylist error:", err);
    return false;
  }
}

/**
 * Rename a collaborative playlist
 */
export async function renameCollabPlaylist(collabId, newName, newCover = "") {
  if (!collabId || !newName) return false;
  try {
    const plRef = ref(db, `collab_playlists/${collabId}`);
    const updates = {
      name: newName.trim(),
      updatedAt: Date.now(),
    };
    if (newCover) {
      updates.cover_url = newCover;
      updates.preview_artwork = newCover;
    }
    await update(plRef, updates);
    return true;
  } catch (err) {
    console.warn("renameCollabPlaylist error:", err);
    return false;
  }
}

/**
 * Delete a collaborative playlist completely across all participants
 */
export async function deleteCollabPlaylist(collabId) {
  if (!collabId) return false;
  try {
    const plRef = ref(db, `collab_playlists/${collabId}`);
    const snap = await get(plRef);
    if (snap.exists()) {
      const pl = snap.val();
      const collabs = pl.collaborators || {};
      // Remove from all participants' indexes
      for (const cUid of Object.keys(collabs)) {
        await set(ref(db, `users/${cUid}/collab_playlists/${collabId}`), null).catch(() => {});
      }
      if (pl.ownerUid) {
        await set(ref(db, `users/${pl.ownerUid}/collab_playlists/${collabId}`), null).catch(() => {});
      }
    }
    // Delete the master collab playlist record
    await set(plRef, null);
    return true;
  } catch (err) {
    console.warn("deleteCollabPlaylist error:", err);
    return false;
  }
}

/**
 * Subscribe to all collaborative playlists for a user
 */
export function subscribeCollabPlaylists(uid, callback) {
  if (!uid || typeof callback !== "function") return () => {};

  const userIndexRef = ref(db, `users/${uid}/collab_playlists`);
  const activeListeners = new Map(); // collabId -> unsubscribe fn
  let latestPlaylistsMap = new Map();

  const handleIndexChange = (snap) => {
    if (!snap.exists()) {
      // Clear all child listeners
      activeListeners.forEach((unsub) => unsub());
      activeListeners.clear();
      latestPlaylistsMap.clear();
      callback([]);
      return;
    }

    const indexData = snap.val() || {};
    const collabIds = Object.keys(indexData);

    // Remove listeners for removed playlists
    for (const [id, unsub] of activeListeners.entries()) {
      if (!collabIds.includes(id)) {
        unsub();
        activeListeners.delete(id);
        latestPlaylistsMap.delete(id);
      }
    }

    if (collabIds.length === 0) {
      callback([]);
      return;
    }

    // Subscribe to each collab playlist
    collabIds.forEach((cId) => {
      if (!activeListeners.has(cId)) {
        const plRef = ref(db, `collab_playlists/${cId}`);
        const plListener = onValue(plRef, (plSnap) => {
          if (plSnap.exists()) {
            latestPlaylistsMap.set(cId, plSnap.val());
          } else {
            latestPlaylistsMap.delete(cId);
          }
          const sorted = Array.from(latestPlaylistsMap.values()).sort(
            (a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)
          );
          callback(sorted);
        });

        activeListeners.set(cId, () => {
          try {
            off(plRef, "value", plListener);
          } catch (_) {}
        });
      }
    });
  };

  const indexListener = onValue(userIndexRef, handleIndexChange);

  return () => {
    try {
      off(userIndexRef, "value", indexListener);
    } catch (_) {}
    activeListeners.forEach((unsub) => unsub());
    activeListeners.clear();
  };
}

// ─── BLEND & MUSIC COMPATIBILITY RADAR ──────────────────────────────────────

/**
 * Calculate music compatibility between two users and generate a daily Blend playlist.
 * Based on overlapping recentlyPlayed, likedSongs, and artist overlaps.
 */
export async function calculateFriendBlend(myUid, myProfile, friendUid, friendProfile) {
  if (!myUid || !friendUid) return null;

  try {
    const [myRecents, friendRecents, myLiked, friendLiked] = await Promise.all([
      getRecentlyPlayed(myUid).catch(() => []),
      getRecentlyPlayed(friendUid).catch(() => []),
      getLikedSongs(myUid).catch(() => []),
      getLikedSongs(friendUid).catch(() => []),
    ]);

    const mySongs = [...(myRecents || []), ...(myLiked || [])];
    const friendSongs = [...(friendRecents || []), ...(friendLiked || [])];

    const myVids = new Set(mySongs.map((s) => s.videoId || s.video_id).filter(Boolean));
    const friendVids = new Set(friendSongs.map((s) => s.videoId || s.video_id).filter(Boolean));

    const myArtists = new Set(
      mySongs
        .map((s) => (s.artist || "").toLowerCase().trim())
        .filter(Boolean)
    );
    const friendArtists = new Set(
      friendSongs
        .map((s) => (s.artist || "").toLowerCase().trim())
        .filter(Boolean)
    );

    // 1. Shared songs match
    let sharedSongs = 0;
    for (const id of myVids) {
      if (friendVids.has(id)) sharedSongs++;
    }

    // 2. Shared artists match
    let sharedArtists = 0;
    for (const a of myArtists) {
      if (friendArtists.has(a)) sharedArtists++;
    }

    // Calculate score: baseline 50% + shared music bonuses
    let matchScore = 52;
    if (sharedSongs > 0) matchScore += Math.min(28, sharedSongs * 6);
    if (sharedArtists > 0) matchScore += Math.min(20, sharedArtists * 4);

    // If both users have little data yet, generate realistic natural high compatibility
    if (mySongs.length === 0 || friendSongs.length === 0) {
      // Deterministic based on combined UIDs
      const hash = (myUid + friendUid).split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
      matchScore = 72 + (hash % 23); // 72% to 94%
    } else {
      matchScore = Math.min(99, Math.max(58, matchScore));
    }

    // Curate Blend Tracklist (alternating between both users' top tracks + shared gems)
    const blendTracks = [];
    const addedIds = new Set();

    // Priority 1: Common tracks
    for (const s of mySongs) {
      const vid = s.videoId || s.video_id;
      if (vid && friendVids.has(vid) && !addedIds.has(vid)) {
        addedIds.add(vid);
        blendTracks.push({
          ...s,
          videoId: vid,
          video_id: vid,
          blendSource: "both",
        });
      }
    }

    // Priority 2: Alternate between friend & me
    const maxTracks = 25;
    const maxLen = Math.max(mySongs.length, friendSongs.length);
    for (let i = 0; i < maxLen && blendTracks.length < maxTracks; i++) {
      if (i < friendSongs.length) {
        const s = friendSongs[i];
        const vid = s.videoId || s.video_id;
        if (vid && !addedIds.has(vid)) {
          addedIds.add(vid);
          blendTracks.push({
            ...s,
            videoId: vid,
            video_id: vid,
            blendSource: friendProfile?.username || "Friend",
          });
        }
      }
      if (i < mySongs.length && blendTracks.length < maxTracks) {
        const s = mySongs[i];
        const vid = s.videoId || s.video_id;
        if (vid && !addedIds.has(vid)) {
          addedIds.add(vid);
          blendTracks.push({
            ...s,
            videoId: vid,
            video_id: vid,
            blendSource: "You",
          });
        }
      }
    }

    // Top shared genre / vibe descriptor
    let topVibe = "Pop & Bollywood Hits";
    if (sharedArtists > 0) {
      const sampleArtist = Array.from(myArtists).find((a) => friendArtists.has(a));
      if (sampleArtist) {
        topVibe = `${sampleArtist.charAt(0).toUpperCase() + sampleArtist.slice(1)} & Vibes`;
      }
    }

    return {
      matchPercentage: matchScore,
      sharedSongsCount: sharedSongs,
      sharedArtistsCount: sharedArtists,
      topVibe,
      tracks: blendTracks,
      friend: friendProfile,
      updatedAt: Date.now(),
    };
  } catch (err) {
    console.warn("calculateFriendBlend error:", err);
    return null;
  }
}

/**
 * Cache high-res track artwork in Firebase RTDB
 */
export async function saveCachedTrackImage(videoId, imageUrl) {
  if (!videoId || !imageUrl) return;
  try {
    const cleanId = String(videoId).replace(/^saavn_/, "").trim();
    const highRes = String(imageUrl).replace(/(?:50x50|150x150)\.jpg/i, "500x500.jpg");
    const imgRef = ref(rtdb, `track_images/${cleanId}`);
    await set(imgRef, {
      videoId: cleanId,
      image: highRes,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn("saveCachedTrackImage error:", err.message);
  }
}

/**
 * Get cached track artwork from Firebase RTDB
 */
export async function getCachedTrackImage(videoId) {
  if (!videoId) return null;
  try {
    const cleanId = String(videoId).replace(/^saavn_/, "").trim();
    const imgRef = ref(rtdb, `track_images/${cleanId}`);
    const snap = await get(imgRef);
    if (snap.exists()) {
      const data = snap.val();
      if (typeof data === "string") return data;
      return data?.image || null;
    }
  } catch (err) {
    console.warn("getCachedTrackImage error:", err.message);
  }
  return null;
}

