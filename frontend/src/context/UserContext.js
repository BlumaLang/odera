// UserContext - Manages user profile, onboarding state, and preferences persistence via Firebase
import React, { createContext, useContext, useState, useEffect } from "react";
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
} from "../services/firebase";

const UserContext = createContext(null);

export const STORAGE_ARTIST_PHOTOS_KEY = "@staytup_artist_photos_cache";

export const UserProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState(false);
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

      if (firebaseUser) {
        setCurrentUser(firebaseUser);
        setIsLoggedIn(true);

        const providerId = firebaseUser.isAnonymous
          ? "guest"
          : firebaseUser.providerData?.[0]?.providerId || "google";
        setLoginProvider(providerId.includes("google") ? "google" : providerId);

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
            if (typeof data.onboardingCompleted === "boolean") {
              setIsOnboardingCompleted(data.onboardingCompleted);
            }
            if (typeof data.isPremium === "boolean") {
              setIsPremium(data.isPremium);
              setPremiumPlan(data.premiumPlan || "Free");
            }
          } else {
            // First time login - initialize clean node in Firebase RTDB without seed data
            fbSaveUserProfile(firebaseUser.uid, initialProfile);
            fbSaveOnboardingState(firebaseUser.uid, false);
            fbSaveUserPremium(firebaseUser.uid, false, "Free");
          }

          if (!initialSyncCompleted) {
            initialSyncCompleted = true;
            clearTimeout(initialSyncTimer);
            setIsLoadingUser(false);
          }
        });

        // Realtime sync for Liked Songs, Playlists, and Recently Played
        unsubscribeLiked = subscribeLikedSongs(firebaseUser.uid, (songs) => {
          setLikedSongs(songs || []);
        });

        unsubscribePls = subscribePlaylists(firebaseUser.uid, (pls) => {
          setPlaylists(pls || []);
        });

        unsubscribeRecents = subscribeRecentlyPlayed(firebaseUser.uid, (recents) => {
          setRecentlyPlayed(recents || []);
        });
      } else {
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
    };
  }, []);

  // Login handler - keeps LoginScreen interactive with its own button spinner
  const loginUser = async (info = {}) => {
    const provider = info.provider || "guest";
    try {
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
      await fbLogout();
    } catch (err) {
      console.warn("Logout error:", err);
    }
  };

  // Complete onboarding and save to Firebase Realtime Database
  const completeOnboarding = async (profileData) => {
    const favs = profileData.favoriteArtists || profileData.favorite_artists || [];
    const fullProfile = {
      username: profileData.username?.trim() || "Staytup Listener",
      languages: profileData.languages || [],
      favoriteArtists: favs,
      favorite_artists: favs,
    };

    setUserProfile((prev) => ({ ...prev, ...fullProfile }));
    setIsOnboardingCompleted(true);

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

  // Playlists helpers
  const createPlaylist = async (name, description = "", initialTracks = [], coverUrl = "") => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    return await createPlaylistRTDB(uid, name, description, initialTracks, coverUrl);
  };

  const deletePlaylist = async (playlistId) => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    return await deletePlaylistRTDB(uid, playlistId);
  };

  const addTrackToPlaylist = async (playlistId, track) => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    return await addTrackToPlaylistRTDB(uid, playlistId, track);
  };

  const removeTrackFromPlaylist = async (playlistId, videoId) => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    return await removeTrackFromPlaylistRTDB(uid, playlistId, videoId);
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
        // RTDB Liked Songs, Playlists & Recently Played
        likedSongs,
        isSongLiked,
        toggleLikeSong,
        playlists,
        createPlaylist,
        deletePlaylist,
        addTrackToPlaylist,
        removeTrackFromPlaylist,
        recentlyPlayed,
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
