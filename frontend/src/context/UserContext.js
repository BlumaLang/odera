// UserContext - Manages user profile, onboarding state, and preferences persistence via Firebase
import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { api, DEFAULT_USER_ID } from "../api/client";
import {
  auth,
  loginWithGoogle as fbLoginWithGoogle,
  loginAsGuest as fbLoginAsGuest,
  logoutUser as fbLogout,
  onAuthChange,
  subscribeUserData,
  saveUserProfile as fbSaveUserProfile,
  saveOnboardingState as fbSaveOnboardingState,
  saveUserPremium as fbSaveUserPremium,
  subscribeLikedSongs,
  toggleLikedSong as fbToggleLikedSong,
  subscribePlaylists,
  createPlaylistRTDB,
  deletePlaylistRTDB,
  addTrackToPlaylistRTDB,
  removeTrackFromPlaylistRTDB,
  subscribeRecentlyPlayed,
  subscribeUserStreamCount,
  recordUserStream,
  loginOrCreatePinUser,
  getLocalSession,
  saveLocalSession,
  removeLocalSession,
} from "../services/firebase";

const UserContext = createContext(null);

export const STORAGE_ARTIST_PHOTOS_KEY = "@staytup_artist_photos_cache";
export const ONBOARDING_COMPLETED_KEY = "@staytup_onboarding_completed";

export const UserProvider = ({ children }) => {
  const isFreshLoginRef = useRef(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState(() => {
    if (typeof window !== "undefined") {
      if (window.sessionStorage?.getItem("@staytup_retuning") === "true") {
        return false;
      }
      const localVal = window.localStorage?.getItem(ONBOARDING_COMPLETED_KEY);
      if (localVal === "false") return false;
      // Default to true so existing/restored users never see an onboarding flash
      return true;
    }
    return true;
  });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginProvider, setLoginProvider] = useState(null);
  const [userProfile, setUserProfile] = useState({
    username: "Music Lover",
    avatar: "initial",
    avatarColor: "#1DB954",
    languages: [],
    favoriteArtists: [],
  });
  const [likedSongs, setLikedSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const [streamCount, setStreamCount] = useState(0);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [premiumPlan, setPremiumPlan] = useState("Free");
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Subscribe to Firebase Auth state
  useEffect(() => {
    let unsubscribeUserData = null;
    let unsubscribeLiked = null;
    let unsubscribePls = null;
    let unsubscribeRecents = null;
    let unsubscribeStreams = null;

    // Safety timeout: Ensure app never stays stuck on loading screen on startup
    const safetyTimer = setTimeout(() => {
      setIsLoadingUser(false);
    }, 1500);

    const unsubscribeAuth = onAuthChange(async (firebaseUser) => {
      clearTimeout(safetyTimer);

      if (unsubscribeUserData) {
        unsubscribeUserData();
        unsubscribeUserData = null;
      }
      if (unsubscribeLiked) {
        unsubscribeLiked();
        unsubscribeLiked = null;
      }
      if (unsubscribePls) {
        unsubscribePls();
        unsubscribePls = null;
      }
      if (unsubscribeRecents) {
        unsubscribeRecents();
        unsubscribeRecents = null;
      }
      if (unsubscribeStreams) {
        unsubscribeStreams();
        unsubscribeStreams = null;
      }

      if (firebaseUser) {
        setCurrentUser(firebaseUser);
        setIsLoggedIn(true);

        const providerId = firebaseUser.isAnonymous
          ? "guest"
          : firebaseUser.providerData?.[0]?.providerId || "google";
        setLoginProvider(providerId.includes("google") ? "google" : providerId);

        const isFresh = isFreshLoginRef.current;
        const isExplicitRetune =
          typeof window !== "undefined" &&
          window.sessionStorage?.getItem("@staytup_retuning") === "true";

        // Returning user on app launch / refresh: immediately guarantee onboarding is completed
        if (!isFresh && !isExplicitRetune) {
          setIsOnboardingCompleted(true);
          saveLocalSession(ONBOARDING_COMPLETED_KEY, "true").catch(() => {});
        }

        // Pre-populate initial profile so UI has basic info (Zero dummy seed data)
        const initialProfile = {
          username:
            firebaseUser.displayName ||
            (firebaseUser.isAnonymous ? "Guest Listener" : "Staytup Listener"),
          avatar: firebaseUser.photoURL || "initial",
          avatarColor: "#1DB954",
          languages: [],
          favoriteArtists: [],
        };
        setUserProfile((prev) => ({ ...initialProfile, ...prev }));

        // Smooth initial sync: give RTDB up to 800ms to provide onboarding status before unlocking
        let initialSyncCompleted = false;
        const initialSyncTimer = setTimeout(() => {
          if (!initialSyncCompleted) {
            initialSyncCompleted = true;
            setIsLoadingUser(false);
          }
        }, 800);

        // Realtime sync from Firebase Realtime Database
        unsubscribeUserData = subscribeUserData(firebaseUser.uid, (data) => {
          if (data) {
            if (data.profile) {
              setUserProfile((prev) => ({
                ...prev,
                ...data.profile,
              }));
            }
            if (isExplicitRetune) {
              setIsOnboardingCompleted(false);
            } else if (!isFresh) {
              // Returning user: NEVER show onboarding screen
              setIsOnboardingCompleted(true);
              saveLocalSession(ONBOARDING_COMPLETED_KEY, "true").catch(() => {});
            } else {
              // Fresh login from LoginScreen: check if this account already has taste or was completed
              const hasTaste =
                (data.profile?.favoriteArtists && data.profile.favoriteArtists.length > 0) ||
                (data.profile?.languages && data.profile.languages.length > 0);

              if (data.onboardingCompleted === true || hasTaste) {
                setIsOnboardingCompleted(true);
                saveLocalSession(ONBOARDING_COMPLETED_KEY, "true").catch(() => {});
              } else {
                setIsOnboardingCompleted(false);
              }
            }

            if (typeof data.isPremium === "boolean") {
              setIsPremium(data.isPremium);
              setPremiumPlan(data.premiumPlan || "Free");
            }
          } else {
            if (!isFresh && !isExplicitRetune) {
              setIsOnboardingCompleted(true);
              saveLocalSession(ONBOARDING_COMPLETED_KEY, "true").catch(() => {});
            }
            fbSaveUserProfile(firebaseUser.uid, initialProfile);
            fbSaveOnboardingState(firebaseUser.uid, !isFresh && !isExplicitRetune);
            fbSaveUserPremium(firebaseUser.uid, false, "Free");
          }

          if (!initialSyncCompleted) {
            initialSyncCompleted = true;
            clearTimeout(initialSyncTimer);
            setIsLoadingUser(false);
          }
        });

        // Realtime sync for Liked Songs, Playlists, Recently Played and Streams
        unsubscribeLiked = subscribeLikedSongs(firebaseUser.uid, (songs) => {
          setLikedSongs(songs || []);
        });

        unsubscribePls = subscribePlaylists(firebaseUser.uid, (pls) => {
          setPlaylists(pls || []);
        });

        unsubscribeRecents = subscribeRecentlyPlayed(firebaseUser.uid, (recents) => {
          setRecentlyPlayed(recents || []);
        });

        unsubscribeStreams = subscribeUserStreamCount(firebaseUser.uid, (count) => {
          setStreamCount(count || 0);
        });
      } else {
        // Check for active local PIN or QR session before clearing state
        let storedSession = null;
        try {
          storedSession = (await getLocalSession("@staytup_pin_user")) || (await getLocalSession("@staytup_qr_user"));
        } catch (_) {}

        if (storedSession && storedSession.uid) {
          const restoredUser = {
            uid: storedSession.uid,
            displayName: storedSession.displayName || storedSession.username || "Staytup Listener",
            isAnonymous: false,
          };
          setCurrentUser(restoredUser);
          setIsLoggedIn(true);
          setLoginProvider(storedSession.pin ? "pin" : "qr");
          setIsOnboardingCompleted(true);
          setIsLoadingUser(false);
          setUserProfile((prev) => ({
            ...prev,
            username: restoredUser.displayName,
          }));

          unsubscribeLiked = subscribeLikedSongs(restoredUser.uid, (songs) => {
            setLikedSongs(songs || []);
          });
          unsubscribePls = subscribePlaylists(restoredUser.uid, (pls) => {
            setPlaylists(pls || []);
          });
          unsubscribeRecents = subscribeRecentlyPlayed(restoredUser.uid, (recents) => {
            setRecentlyPlayed(recents || []);
          });
          unsubscribeStreams = subscribeUserStreamCount(restoredUser.uid, (count) => {
            setStreamCount(count || 0);
          });
          return;
        }

        // User logged out or unauthenticated
        setCurrentUser(null);
        setIsLoggedIn(false);
        setLoginProvider(null);
        setIsOnboardingCompleted(false);
        setIsPremium(false);
        setPremiumPlan("Free");
        setLikedSongs([]);
        setPlaylists([]);
        setRecentlyPlayed([]);
        setStreamCount(0);
        setIsLoadingUser(false);
      }
    });

    return () => {
      clearTimeout(safetyTimer);
      unsubscribeAuth();
      if (unsubscribeUserData) unsubscribeUserData();
      if (unsubscribeLiked) unsubscribeLiked();
      if (unsubscribePls) unsubscribePls();
      if (unsubscribeRecents) unsubscribeRecents();
      if (unsubscribeStreams) unsubscribeStreams();
    };
  }, []);

  // Login handler - keeps LoginScreen interactive with its own button spinner
  const loginUser = async (info = {}) => {
    isFreshLoginRef.current = true;
    const provider = info.provider || "guest";
    try {
      if (provider === "pin") {
        const res = await loginOrCreatePinUser(info.username, info.pin);
        if (res && res.success && res.user) {
          const pinUser = {
            uid: res.user.uid,
            displayName: res.user.displayName || info.username,
            username: info.username,
            isAnonymous: false,
          };
          setCurrentUser(pinUser);
          setIsLoggedIn(true);
          setLoginProvider("pin");
          setIsOnboardingCompleted(true);
          setIsLoadingUser(false);
          setUserProfile((prev) => ({
            ...prev,
            username: pinUser.displayName,
          }));
          return { success: true, user: pinUser, isNewUser: res.isNewUser };
        }
        return res || { success: false, error: "PIN authentication failed" };
      }
      if (provider === "qr") {
        // QR login — user confirmed on another device, user data from backend
        const qrUser = info.qrUser || {};
        const fallbackUser = {
          uid: qrUser.uid || `qr_user_${Date.now()}`,
          isAnonymous: false,
          displayName: qrUser.displayName || qrUser.email?.split("@")[0] || "Staytup Listener",
          photoURL: qrUser.photoURL || null,
          email: qrUser.email || null,
        };
        await saveLocalSession("@staytup_qr_user", fallbackUser);
        setCurrentUser(fallbackUser);
        setIsLoggedIn(true);
        setLoginProvider("qr");
        setIsOnboardingCompleted(true);
        setIsLoadingUser(false);
        setUserProfile((prev) => ({
          ...prev,
          username: fallbackUser.displayName,
          avatar: fallbackUser.photoURL || "initial",
        }));
        return { success: true, user: fallbackUser };
      }
      if (provider === "google") {
        const res = await fbLoginWithGoogle();
        return res;
      } else {
        const res = await fbLoginAsGuest();
        if (!res.success) {
          if (res.code === "auth/admin-restricted-operation" || res.code === "auth/operation-not-allowed") {
            // Fallback guest session while user enables Anonymous sign-in in Firebase console
            const fallbackGuest = {
              uid: "guest_user",
              isAnonymous: true,
              displayName: "Guest Listener",
            };
            setCurrentUser(fallbackGuest);
            setIsLoggedIn(true);
            setLoginProvider("guest");
            setIsOnboardingCompleted(true);
            setIsLoadingUser(false);
            return {
              success: true,
              user: fallbackGuest,
              notice: "Anonymous auth not enabled in Firebase Console yet. Running in local guest mode.",
            };
          }
          return res;
        }
        return res;
      }
    } catch (err) {
      console.warn("Login failed:", err);
      return { success: false, error: err.message };
    }
  };

  // Logout handler
  const logoutUser = async () => {
    try {
      isFreshLoginRef.current = false;
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.removeItem("@staytup_retuning");
      }
      await removeLocalSession("@staytup_pin_user");
      await removeLocalSession("@staytup_qr_user");
      await removeLocalSession(ONBOARDING_COMPLETED_KEY);
      await fbLogout();
    } catch (err) {
      console.warn("Logout error:", err);
    }
  };

  // Complete onboarding and save to Firebase Realtime Database
  const completeOnboarding = async (profileData) => {
    isFreshLoginRef.current = false;
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.removeItem("@staytup_retuning");
    }
    const favs = profileData.favoriteArtists || profileData.favorite_artists || [];
    const fullProfile = {
      username: profileData.username?.trim() || "Staytup Listener",
      languages: profileData.languages || [],
      favoriteArtists: favs,
      favorite_artists: favs,
    };

    setUserProfile((prev) => ({ ...prev, ...fullProfile }));
    setIsOnboardingCompleted(true);
    await saveLocalSession(ONBOARDING_COMPLETED_KEY, "true").catch(() => {});

    const uid = currentUser?.uid || DEFAULT_USER_ID;
    try {
      // Save directly to Firebase Realtime Database
      await Promise.all([
        fbSaveUserProfile(uid, fullProfile),
        fbSaveOnboardingState(uid, true),
      ]);

      // Sync with backend API
      api.onboardUser({
        user_id: uid,
        ...fullProfile,
      }).catch((e) => console.warn("Backend onboarding sync error:", e.message));
    } catch (err) {
      console.warn("Error saving onboarding state to Firebase:", err);
    }
  };

  // Reset onboarding (allows re-tuning taste from Library / Settings)
  const resetOnboarding = async () => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    try {
      isFreshLoginRef.current = true;
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.setItem("@staytup_retuning", "true");
      }
      await removeLocalSession(ONBOARDING_COMPLETED_KEY).catch(() => {});
      await fbSaveOnboardingState(uid, false);
      setIsOnboardingCompleted(false);
    } catch (err) {
      console.warn("Error resetting onboarding in Firebase:", err);
    }
  };

  // Activate Premium subscription with selected tier in Firebase Realtime Database & Backend
  const activatePremium = async (plan = "1 Month", paymentDetails = null) => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    const planName = typeof plan === "string" ? plan : plan?.name || "1 Month";
    try {
      await fbSaveUserPremium(uid, true, planName, paymentDetails);
      setIsPremium(true);
      setPremiumPlan(planName);

      // Also persist to backend database
      api.savePremiumSubscription({
        user_id: uid,
        plan: planName,
        is_premium: true,
        payment_details: paymentDetails,
      }).catch((e) => console.warn("Backend premium sync notice:", e.message));
    } catch (err) {
      console.warn("Error activating premium in Firebase:", err);
    }
  };

  // Cancel Premium subscription in Firebase Realtime Database
  const cancelPremium = async () => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    try {
      await fbSaveUserPremium(uid, false, "Free");
      setIsPremium(false);
      setPremiumPlan("Free");
    } catch (err) {
      console.warn("Error cancelling premium in Firebase:", err);
    }
  };

  // Check if an artist is in user's favorite artists
  const isFavoriteArtist = (artistName) => {
    if (!artistName) return false;
    const list = userProfile?.favoriteArtists || userProfile?.favorite_artists || [];
    const target = artistName.trim().toLowerCase();
    return list.some((a) => a.trim().toLowerCase() === target);
  };

  // Toggle favorite status of an artist (add or remove)
  const toggleFavoriteArtist = async (artistInput) => {
    if (!artistInput) return;
    const cleanName = typeof artistInput === "string" ? artistInput.trim() : (artistInput?.name || "").trim();
    if (!cleanName) return;

    const target = cleanName.toLowerCase();
    const currentList = userProfile?.favoriteArtists || userProfile?.favorite_artists || [];
    const exists = currentList.some((a) => {
      const name = typeof a === "string" ? a : a?.name;
      return (name || "").trim().toLowerCase() === target;
    });

    const updatedList = exists
      ? currentList.filter((a) => {
          const name = typeof a === "string" ? a : a?.name;
          return (name || "").trim().toLowerCase() !== target;
        })
      : [...currentList, cleanName];

    const updatedProfile = {
      ...userProfile,
      favoriteArtists: updatedList,
      favorite_artists: updatedList,
    };

    setUserProfile(updatedProfile);

    const uid = currentUser?.uid || DEFAULT_USER_ID;
    try {
      await fbSaveUserProfile(uid, updatedProfile);
      api.onboardUser({
        user_id: uid,
        ...updatedProfile,
      }).catch((e) => console.warn("Syncing favorite artist error:", e.message));
    } catch (err) {
      console.warn("Error saving favorite artist to Firebase:", err);
    }
  };

  // Open and close profile page
  const openProfile = () => setIsProfileOpen(true);
  const closeProfile = () => setIsProfileOpen(false);

  // Update user profile fields (username, avatar, avatarColor, etc.)
  const updateProfile = async (updates) => {
    if (!updates || typeof updates !== "object") return;
    const updatedProfile = {
      ...userProfile,
      ...updates,
    };
    setUserProfile(updatedProfile);
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    try {
      await fbSaveUserProfile(uid, updatedProfile);
      api.onboardUser({
        user_id: uid,
        ...updatedProfile,
      }).catch((e) => console.warn("Update profile sync error:", e.message));
    } catch (err) {
      console.warn("Error updating profile in Firebase:", err);
    }
  };

  const updateUsername = async (newUsername) => {
    return await updateProfile({ username: newUsername });
  };

  // Liked songs helpers
  const isSongLiked = (videoId) => {
    if (!videoId) return false;
    return likedSongs.some((t) => (t.videoId || t.video_id) === videoId);
  };

  const toggleLikeSong = async (track) => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    return await fbToggleLikedSong(uid, track);
  };

  // Playlists helpers with immediate optimistic state update & RTDB sync
  const createPlaylist = async (name, description = "", initialTracks = [], coverUrl = "") => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    const res = await createPlaylistRTDB(uid, name, description, initialTracks, coverUrl);
    if (res) {
      setPlaylists((prev) => [res, ...(prev || [])]);
    }
    return res;
  };

  const deletePlaylist = async (playlistId) => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    setPlaylists((prev) => (prev || []).filter((p) => p.id !== playlistId));
    return await deletePlaylistRTDB(uid, playlistId);
  };

  const addTrackToPlaylist = async (playlistId, track) => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    const ok = await addTrackToPlaylistRTDB(uid, playlistId, track);
    if (ok) {
      setPlaylists((prev) =>
        (prev || []).map((p) => {
          if (p.id !== playlistId) return p;
          const curTracks = Array.isArray(p.tracks) ? [...p.tracks] : [];
          const vid = track.videoId || track.video_id;
          if (!curTracks.some((t) => (t.videoId || t.video_id) === vid)) {
            curTracks.push({
              ...track,
              videoId: vid,
              video_id: vid,
              addedAt: new Date().toISOString(),
            });
          }
          return {
            ...p,
            tracks: curTracks,
            track_count: curTracks.length,
            cover_url: p.cover_url || track.artwork_url || track.thumbnail || "",
          };
        })
      );
    }
    return ok;
  };

  const removeTrackFromPlaylist = async (playlistId, videoId) => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    const ok = await removeTrackFromPlaylistRTDB(uid, playlistId, videoId);
    setPlaylists((prev) =>
      (prev || []).map((p) => {
        if (p.id !== playlistId) return p;
        const curTracks = (p.tracks || []).filter(
          (t) => (t.videoId || t.video_id) !== videoId
        );
        return {
          ...p,
          tracks: curTracks,
          track_count: curTracks.length,
        };
      })
    );
    return ok;
  };

  return (
    <UserContext.Provider
      value={{
        currentUser,
        user: currentUser,
        isLoggedIn,
        loginProvider,
        loginUser,
        logoutUser,
        isOnboardingCompleted,
        userProfile,
        isLoadingUser,
        isPremium,
        premiumPlan,
        activatePremium,
        cancelPremium,
        completeOnboarding,
        resetOnboarding,
        isFavoriteArtist,
        toggleFavoriteArtist,
        isProfileOpen,
        openProfile,
        closeProfile,
        updateProfile,
        updateUsername,
        // RTDB Liked Songs, Playlists, Streams & Recently Played
        likedSongs,
        isSongLiked,
        toggleLikeSong,
        playlists,
        setPlaylists,
        createPlaylist,
        deletePlaylist,
        addTrackToPlaylist,
        removeTrackFromPlaylist,
        recentlyPlayed,
        streamCount,
        recordUserStream,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

const defaultUserContext = {
  user: null,
  isLoggedIn: true,
  isOnboardingCompleted: true,
  isLoadingUser: false,
  favorites: [],
  likedSongs: [],
  playlists: [],
  setPlaylists: () => {},
  recentlyPlayed: [],
  streamCount: 0,
  recordUserStream: () => {},
  isFavoriteArtist: () => false,
  toggleFavoriteArtist: () => {},
  isProfileOpen: false,
  openProfile: () => {},
  closeProfile: () => {},
  loginUser: () => {},
  logoutUser: () => {},
  updateUsername: () => {},
};

export const useUser = () => {
  const context = useContext(UserContext);
  return context || defaultUserContext;
};
