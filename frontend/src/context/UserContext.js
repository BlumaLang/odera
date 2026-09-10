// UserContext - Manages user profile, onboarding state, and preferences persistence via Firebase
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { api, DEFAULT_USER_ID } from "../api/client";
import {
  auth,
  loginWithGoogle as fbLoginWithGoogle,
  loginWithApple as fbLoginWithApple,
  checkAuthRedirect as fbCheckAuthRedirect,
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
  renamePlaylistRTDB,
  deletePlaylistRTDB,
  addTrackToPlaylistRTDB,
  addTracksToPlaylistRTDB,
  removeTrackFromPlaylistRTDB,
  subscribeRecentlyPlayed,
  subscribeUserStreamCount,
  recordUserStream,
  subscribeFriends,
  subscribeFriendRequests,
  sendFriendRequestRTDB,
  acceptFriendRequestRTDB,
  declineFriendRequestRTDB,
  cancelFriendRequestRTDB,
  removeFriendRTDB,
  searchUsersRTDB,
  createCollabPlaylist as fbCreateCollabPlaylist,
  joinCollabPlaylist as fbJoinCollabPlaylist,
  leaveCollabPlaylist as fbLeaveCollabPlaylist,
  renameCollabPlaylist as fbRenameCollabPlaylist,
  subscribeCollabPlaylists as fbSubscribeCollabPlaylists,
  addTrackToCollabPlaylist as fbAddTrackToCollabPlaylist,
  addTracksToCollabPlaylist as fbAddTracksToCollabPlaylist,
  removeTrackFromCollabPlaylist as fbRemoveTrackFromCollabPlaylist,
  getCollabPlaylistDetails as fbGetCollabPlaylistDetails,
  removeCollaboratorFromCollabPlaylist as fbRemoveCollaboratorFromCollabPlaylist,
  deleteCollabPlaylist as fbDeleteCollabPlaylist,
  calculateFriendBlend as fbCalculateFriendBlend,
  sendCollabInvite as fbSendCollabInvite,
  subscribeCollabInvites as fbSubscribeCollabInvites,
  acceptCollabInvite as fbAcceptCollabInvite,
  declineCollabInvite as fbDeclineCollabInvite,
  loginOrCreatePinUser,
  getLocalSession,
  saveLocalSession,
  removeLocalSession,
  generateAutoPlaylist as fbGenerateAutoPlaylist,
  syncAvatarToFriends,
  syncProfileToFriends,
  saveFollowedArtists as fbSaveFollowedArtists,
  subscribeFollowedArtists as fbSubscribeFollowedArtists,
} from "../services/firebase";

const UserContext = createContext(null);

export const STORAGE_ARTIST_PHOTOS_KEY = "@staytup_artist_photos_cache";
export const ONBOARDING_COMPLETED_KEY = "@staytup_onboarding_completed";

export const AVATAR_BG_COLORS = [
  "#8C52FF", // Amethyst
  "#2EBDD7", // Cyan
  "#FFA500", // Amber
  "#E8115B", // Rose
  "#3A86FF", // Electric Blue
  "#FF5722", // Coral
  "#FFFFFF", // White
  "#9D4EDD", // Purple
  "#00B4D8", // Teal
];

export function getDeterministicAvatarColor(seedOrUid) {
  if (!seedOrUid) return AVATAR_BG_COLORS[0];
  const str = String(seedOrUid);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_BG_COLORS[Math.abs(hash) % AVATAR_BG_COLORS.length];
}

export function formatPersonName(raw) {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim().slice(0, 15);
  return trimmed
    .split(/\s+/)
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : ""))
    .join(" ")
    .slice(0, 15);
}

export function formatUsername(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, "")
    .slice(0, 15);
}

// Default avatar is now a local memoji (Pastel Background set)
export const DEFAULT_AVATAR = "memoji_0";

export const UserProvider = ({ children }) => {
  const isFreshLoginRef = useRef(
    typeof window !== "undefined" &&
      (window.sessionStorage?.getItem("@staytup_oauth_fresh_login") === "true" ||
        window.localStorage?.getItem("@staytup_oauth_fresh_login") === "true")
  );
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
    avatar: DEFAULT_AVATAR,
    avatarColor: "#8C52FF",
    languages: [],
    favoriteArtists: [],
  });
  const [likedSongs, setLikedSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const [streamCount, setStreamCount] = useState(0);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState({ incoming: [], outgoing: [] });
  const [collabPlaylists, setCollabPlaylists] = useState([]);
  const [collabInvites, setCollabInvites] = useState([]);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [premiumPlan, setPremiumPlan] = useState("Free");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [userArtistMovements, setUserArtistMovements] = useState({});

  // Subscribe to Firebase Auth state
  useEffect(() => {
    let unsubscribeUserData = null;
    let unsubscribeLiked = null;
    let unsubscribePls = null;
    let unsubscribeRecents = null;
    let unsubscribeStreams = null;
    let unsubscribeFriends = null;
    let unsubscribeRequests = null;
    let unsubscribeCollab = null;
    let unsubscribeCollabInvites = null;
    let unsubscribeFollowedArtists = null;

    const isPendingRedirect =
      typeof window !== "undefined" &&
      (window.sessionStorage?.getItem("@staytup_pending_oauth_redirect") === "true" ||
        window.localStorage?.getItem("@staytup_pending_oauth_redirect") === "true");

    // Fast-track restoration from cached session for seamless, instant startup
    Promise.all([
      getLocalSession("@staytup_firebase_user"),
      getLocalSession("@staytup_pin_user"),
      getLocalSession("@staytup_qr_user"),
    ]).then(([cachedFb, cachedPin, cachedQr]) => {
      const cached = cachedFb || cachedPin || cachedQr;
      if (cached && cached.uid) {
        setCurrentUser((prev) => prev || {
          uid: cached.uid,
          displayName: cached.displayName || cached.username || "Staytup Listener",
          email: cached.email || null,
          photoURL: cached.photoURL || null,
          isAnonymous: false,
        });
        setIsLoggedIn(true);
        if (cached.providerId || cached.pin) {
          setLoginProvider(cached.providerId || (cached.pin ? "pin" : "qr"));
        }
        setIsLoadingUser(false);
      }
    }).catch(() => {});

    // Fast startup safety timeout: never hang after splash screen
    const safetyTimer = setTimeout(() => {
      setIsLoadingUser(false);
    }, isPendingRedirect ? 4000 : 1200);

    // Check OAuth redirect result (for Apple / Google Sign-In)
    fbCheckAuthRedirect()
      .then((res) => {
        if (res && res.success && res.user) {
          isFreshLoginRef.current = true;
          if (res.isNewUser) {
            setIsOnboardingCompleted(false);
          }
          setCurrentUser(res.user);
          setIsLoggedIn(true);
          if (typeof window !== "undefined") {
            window.sessionStorage?.removeItem("@staytup_pending_oauth_redirect");
            window.sessionStorage?.removeItem("@staytup_oauth_fresh_login");
            window.sessionStorage?.removeItem("@staytup_auth_error");
            window.localStorage?.removeItem("@staytup_pending_oauth_redirect");
            window.localStorage?.removeItem("@staytup_oauth_fresh_login");
            window.localStorage?.removeItem("@staytup_auth_error");
          }
        } else if (res && res.success === false && res.error) {
          let userMsg = res.error;
          if (res.code === "auth/popup-closed-by-user") userMsg = "Sign-in was cancelled before completion.";
          else if (res.code === "auth/unauthorized-domain") userMsg = "Domain not authorized in Firebase Console -> Authentication -> Settings.";
          else if (res.code === "auth/account-exists-with-different-credential") userMsg = "An account already exists with this email.";
          else if (res.code === "auth/network-request-failed") userMsg = "Network error. Please check your internet connection.";

          if (typeof window !== "undefined") {
            window.sessionStorage?.setItem("@staytup_auth_error", userMsg);
            window.localStorage?.setItem("@staytup_auth_error", userMsg);
            window.sessionStorage?.removeItem("@staytup_pending_oauth_redirect");
            window.sessionStorage?.removeItem("@staytup_oauth_fresh_login");
            window.localStorage?.removeItem("@staytup_pending_oauth_redirect");
            window.localStorage?.removeItem("@staytup_oauth_fresh_login");
          }
          setIsLoadingUser(false);
        } else {
          // res is null (no redirect was pending)
          if (typeof window !== "undefined") {
            window.sessionStorage?.removeItem("@staytup_pending_oauth_redirect");
            window.localStorage?.removeItem("@staytup_pending_oauth_redirect");
          }
        }
      })
      .catch((err) => {
        console.warn("[Auth] Redirect check error:", err);
        if (typeof window !== "undefined") {
          window.sessionStorage?.setItem("@staytup_auth_error", err?.message || "Sign-in failed");
          window.localStorage?.setItem("@staytup_auth_error", err?.message || "Sign-in failed");
          window.sessionStorage?.removeItem("@staytup_pending_oauth_redirect");
          window.localStorage?.removeItem("@staytup_pending_oauth_redirect");
        }
        setIsLoadingUser(false);
      });

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
      if (unsubscribeFriends) {
        unsubscribeFriends();
        unsubscribeFriends = null;
      }
      if (unsubscribeRequests) {
        unsubscribeRequests();
        unsubscribeRequests = null;
      }
      if (unsubscribeCollab) {
        unsubscribeCollab();
        unsubscribeCollab = null;
      }
      if (unsubscribeCollabInvites) {
        unsubscribeCollabInvites();
        unsubscribeCollabInvites = null;
      }

      if (firebaseUser) {
        setCurrentUser(firebaseUser);
        setIsLoggedIn(true);

        const rawProviderId = firebaseUser.providerData?.[0]?.providerId || "";
        const providerId = rawProviderId.includes("apple")
          ? "apple"
          : rawProviderId.includes("google")
          ? "google"
          : rawProviderId || "google";
        setLoginProvider(providerId);

        saveLocalSession("@staytup_firebase_user", {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || "",
          email: firebaseUser.email || "",
          photoURL: firebaseUser.photoURL || null,
          providerId,
        }).catch(() => {});

        const isFresh = isFreshLoginRef.current;
        const isExplicitRetune =
          typeof window !== "undefined" &&
          window.sessionStorage?.getItem("@staytup_retuning") === "true";

        // Returning user on app launch / refresh: immediately guarantee onboarding is completed
        if (!isFresh && !isExplicitRetune) {
          setIsOnboardingCompleted(true);
          saveLocalSession(ONBOARDING_COMPLETED_KEY, "true").catch(() => {});
        }

        // Pre-populate initial profile with clean handle (DO NOT leak Gmail personal name as username!)
        const defaultHandle = `listener_${(firebaseUser.uid || "user").slice(0, 5).toLowerCase()}`;

        const initialProfile = {
          username: defaultHandle,
          avatar: DEFAULT_AVATAR,
          avatarColor: getDeterministicAvatarColor(firebaseUser.uid || defaultHandle),
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
              const currentProfile = { ...data.profile };
              const isGoogle = typeof currentProfile.avatar === "string" && currentProfile.avatar.includes("googleusercontent.com");
              const isDicebear = typeof currentProfile.avatar === "string" && currentProfile.avatar.includes("toon-head");
              const isOldGreen = currentProfile.avatarColor === "#1DB954";
              let needsSave = false;

              // Migrate all old avatars (Google, Dicebear, missing) to memoji_0
              if (!currentProfile.avatar || isGoogle || isDicebear || currentProfile.avatar === "initial") {
                currentProfile.avatar = DEFAULT_AVATAR;
                needsSave = true;
              }

              if (!currentProfile.avatarColor || isOldGreen) {
                currentProfile.avatarColor = getDeterministicAvatarColor(firebaseUser.uid || cleanName);
                needsSave = true;
              }

              if (currentProfile.username) {
                const formattedUser = formatUsername(currentProfile.username);
                if (formattedUser && formattedUser !== currentProfile.username) {
                  currentProfile.username = formattedUser;
                  needsSave = true;
                }
              }

              if (currentProfile.displayName || currentProfile.name) {
                const formattedName = formatPersonName(currentProfile.displayName || currentProfile.name);
                if (formattedName && (formattedName !== currentProfile.displayName || formattedName !== currentProfile.name)) {
                  currentProfile.displayName = formattedName;
                  currentProfile.name = formattedName;
                  needsSave = true;
                }
              }

              if (needsSave) {
                fbSaveUserProfile(firebaseUser.uid, currentProfile);
              }

              setUserProfile((prev) => ({
                ...prev,
                ...currentProfile,
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
            } else {
              setIsOnboardingCompleted(false);
              saveLocalSession(ONBOARDING_COMPLETED_KEY, "false").catch(() => {});
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

        unsubscribeFriends = subscribeFriends(firebaseUser.uid, (list) => {
          setFriends(list || []);
        });

        unsubscribeRequests = subscribeFriendRequests(firebaseUser.uid, (reqs) => {
          setFriendRequests(reqs || { incoming: [], outgoing: [] });
        });

        unsubscribeCollab = fbSubscribeCollabPlaylists(firebaseUser.uid, (collabs) => {
          setCollabPlaylists(collabs || []);
        });

        unsubscribeCollabInvites = fbSubscribeCollabInvites(firebaseUser.uid, (invs) => {
          setCollabInvites(invs || []);
        });

        // Dedicated followed artists subscription for cross-device sync
        unsubscribeFollowedArtists = fbSubscribeFollowedArtists(firebaseUser.uid, (artistsList) => {
          if (Array.isArray(artistsList) && artistsList.length >= 0) {
            setUserProfile((prev) => ({
              ...prev,
              favoriteArtists: artistsList,
              favorite_artists: artistsList,
            }));
          }
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
          unsubscribeFriends = subscribeFriends(restoredUser.uid, (list) => {
            setFriends(list || []);
          });
          unsubscribeRequests = subscribeFriendRequests(restoredUser.uid, (reqs) => {
            setFriendRequests(reqs || { incoming: [], outgoing: [] });
          });
          unsubscribeCollab = fbSubscribeCollabPlaylists(restoredUser.uid, (collabs) => {
            setCollabPlaylists(collabs || []);
          });
          unsubscribeCollabInvites = fbSubscribeCollabInvites(restoredUser.uid, (invs) => {
            setCollabInvites(invs || []);
          });
          return;
        }

        // User logged out or unauthenticated
        removeLocalSession("@staytup_firebase_user").catch(() => {});
        setCurrentUser(null);
        setIsLoggedIn(false);
        setLoginProvider(null);
        setIsOnboardingCompleted(false);
        setIsPremium(false);
        setPremiumPlan("Free");
        setLikedSongs([]);
        setPlaylists([]);
        if (unsubscribeRecents) {
          unsubscribeRecents();
          unsubscribeRecents = null;
        }
        unsubscribeRecents = subscribeRecentlyPlayed("guest", (recents) => {
          setRecentlyPlayed(recents || []);
        });
        setStreamCount(0);
        setFriends([]);
        setFriendRequests({ incoming: [], outgoing: [] });
        setCollabPlaylists([]);
        setCollabInvites([]);
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
      if (unsubscribeFriends) unsubscribeFriends();
      if (unsubscribeRequests) unsubscribeRequests();
      if (unsubscribeCollab) unsubscribeCollab();
      if (unsubscribeFollowedArtists) unsubscribeFollowedArtists();
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
          avatar: fallbackUser.photoURL || DEFAULT_AVATAR,
        }));
        return { success: true, user: fallbackUser };
      }
      if (provider === "google") {
        const res = await fbLoginWithGoogle();
        return res;
      }
      if (provider === "apple") {
        const res = await fbLoginWithApple();
        return res;
      }
      return { success: false, error: "Unsupported login provider. Please sign in with Google or Apple." };
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
      await removeLocalSession("@staytup_firebase_user");
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

    // Optimistic local update
    setUserProfile(updatedProfile);

    const uid = currentUser?.uid || DEFAULT_USER_ID;
    try {
      await fbSaveFollowedArtists(uid, updatedList);
      api.onboardUser({
        user_id: uid,
        ...updatedProfile,
      }).catch((e) => console.warn("Syncing favorite artist error:", e.message));
    } catch (err) {
      console.warn("Error saving followed artists, rolling back:", err.message);
      // Rollback local state on save failure
      setUserProfile(userProfile);
    }
  };

  // Track artist movements (artist profile viewed, similar artist tapped, co-artist discovered)
  const recordArtistMovement = useCallback((artistInput, collaborators = []) => {
    if (!artistInput) return;
    const cleanMain = (typeof artistInput === "string" ? artistInput : artistInput?.name || "").trim();
    if (!cleanMain) return;

    setUserArtistMovements((prev) => {
      const nextMap = { ...prev };
      const mainKey = cleanMain.toLowerCase();
      nextMap[mainKey] = (nextMap[mainKey] || 0) + 5;

      if (Array.isArray(collaborators)) {
        collaborators.forEach((c) => {
          const cName = (typeof c === "string" ? c : c?.name || "").trim();
          if (cName && cName.length > 2 && !/t-series|sony|records|music/i.test(cName)) {
            const cKey = cName.toLowerCase();
            nextMap[cKey] = (nextMap[cKey] || 0) + 2;
          }
        });
      }
      return nextMap;
    });
  }, []);

  // Open and close profile page
  const openProfile = () => setIsProfileOpen(true);
  const closeProfile = () => setIsProfileOpen(false);

  // Update user profile fields (username, avatar, avatarColor, etc.)
  const updateProfile = async (updates) => {
    if (!updates || typeof updates !== "object") return;
    const cleanUpdates = { ...updates };
    if (cleanUpdates.username) {
      cleanUpdates.username = formatUsername(cleanUpdates.username);
    }
    if (cleanUpdates.name) {
      cleanUpdates.name = formatPersonName(cleanUpdates.name);
    }
    if (cleanUpdates.displayName) {
      cleanUpdates.displayName = formatPersonName(cleanUpdates.displayName);
    }
    const updatedProfile = {
      ...userProfile,
      ...cleanUpdates,
    };
    setUserProfile(updatedProfile);
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    try {
      await fbSaveUserProfile(uid, updatedProfile);
      api.onboardUser({
        user_id: uid,
        ...updatedProfile,
      }).catch((e) => console.warn("Update profile sync error:", e.message));
      // Sync profile changes (username, avatar, etc.) to all friends instantly
      syncProfileToFriends(uid, updatedProfile).catch(() => {});
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
      setPlaylists((prev) => {
        const remaining = (prev || []).filter((p) => (p.id || p.collabId) !== res.id);
        return [res, ...remaining];
      });
    }
    return res;
  };

  const renamePlaylist = async (playlistId, newName, newCover = "") => {
    const trimmed = (newName || "").trim();
    if (!playlistId || !trimmed) return false;
    const uid = currentUser?.uid || DEFAULT_USER_ID;

    const coverUpdates = newCover ? { cover_url: newCover, preview_artwork: newCover } : {};

    // Optimistically update local playlists & collabPlaylists state
    setPlaylists((prev) =>
      (prev || []).map((p) =>
        (p.id === playlistId || p.collabId === playlistId)
          ? { ...p, name: trimmed, ...coverUpdates, updatedAt: Date.now() }
          : p
      )
    );
    setCollabPlaylists((prev) =>
      (prev || []).map((p) =>
        (p.id === playlistId || p.collabId === playlistId)
          ? { ...p, name: trimmed, ...coverUpdates, updatedAt: Date.now() }
          : p
      )
    );

    if (/^(collab_|blend_)/.test(String(playlistId))) {
      return await fbRenameCollabPlaylist(playlistId, trimmed, newCover);
    }
    return await renamePlaylistRTDB(uid, playlistId, trimmed, newCover);
  };

  const deletePlaylist = async (playlistId) => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    setPlaylists((prev) => (prev || []).filter((p) => (p.id || p.collabId) !== playlistId));
    setCollabPlaylists((prev) => (prev || []).filter((p) => (p.id || p.collabId) !== playlistId));
    if (/^(collab_|blend_)/.test(String(playlistId))) {
      return await fbDeleteCollabPlaylist(playlistId);
    }
    return await deletePlaylistRTDB(uid, playlistId);
  };

  const addTrackToPlaylist = async (playlistId, track) => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    const isCollab = /^(collab_|blend_)/.test(String(playlistId));
    const ok = isCollab
      ? await fbAddTrackToCollabPlaylist(playlistId, track)
      : await addTrackToPlaylistRTDB(uid, playlistId, track);
    if (ok) {
      const updater = (prev) =>
        (prev || []).map((p) => {
          if ((p.id || p.collabId) !== playlistId) return p;
          const curTracks = Array.isArray(p.tracks) ? [...p.tracks] : [];
          const vid = track.videoId || track.video_id || track.id;
          if (!curTracks.some((t) => (t.videoId || t.video_id || t.id) === vid)) {
            curTracks.push({
              ...track,
              videoId: vid,
              video_id: vid,
              addedAt: new Date().toISOString(),
            });
          }
          const firstTrackArtwork = curTracks[0]?.artwork_url || curTracks[0]?.thumbnail || "";
          const resolvedCover = p.cover_url || p.preview_artwork || firstTrackArtwork || "";
          return {
            ...p,
            tracks: curTracks,
            track_count: curTracks.length,
            cover_url: resolvedCover,
            preview_artwork: resolvedCover,
          };
        });
      setPlaylists(updater);
      if (isCollab) setCollabPlaylists(updater);
    }
    return ok;
  };

  const addTracksToPlaylist = async (playlistId, newTracks) => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    const updated = await addTracksToPlaylistRTDB(uid, playlistId, newTracks);
    if (updated) {
      setPlaylists((prev) =>
        (prev || []).map((p) => (p.id === playlistId ? updated : p))
      );
      return updated;
    }
    return null;
  };

  const removeTrackFromPlaylist = async (playlistId, videoId) => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    const isCollab = /^(collab_|blend_)/.test(String(playlistId));
    const ok = isCollab
      ? await fbRemoveTrackFromCollabPlaylist(playlistId, videoId)
      : await removeTrackFromPlaylistRTDB(uid, playlistId, videoId);
    const updater = (prev) =>
      (prev || []).map((p) => {
        if ((p.id || p.collabId) !== playlistId) return p;
        const curTracks = (p.tracks || []).filter(
          (t) => (t.videoId || t.video_id || t.id) !== videoId
        );
        const firstTrackArtwork = curTracks[0]?.artwork_url || curTracks[0]?.thumbnail || "";
        const resolvedCover = curTracks.length > 0 ? (firstTrackArtwork || p.cover_url || "") : "";
        return {
          ...p,
          tracks: curTracks,
          track_count: curTracks.length,
          cover_url: resolvedCover,
          preview_artwork: resolvedCover,
        };
      });
    setPlaylists(updater);
    if (isCollab) setCollabPlaylists(updater);
    return ok;
  };

  const isTrackInAnyPlaylist = useCallback((trackOrVideoId) => {
    if (!trackOrVideoId) return false;
    const vid = typeof trackOrVideoId === "string"
      ? trackOrVideoId
      : (trackOrVideoId.videoId || trackOrVideoId.video_id || trackOrVideoId.id);
    if (!vid) return false;
    const allLists = [...(playlists || []), ...(collabPlaylists || [])];
    return allLists.some((pl) => {
      const tracks = Array.isArray(pl.tracks) ? pl.tracks : [];
      return tracks.some((t) => (t.videoId || t.video_id || t.id) === vid);
    });
  }, [playlists, collabPlaylists]);
  const sendFriendRequest = async (recipientUid, recipientUser) => {
    const sender = {
      uid: currentUser?.uid || DEFAULT_USER_ID,
      username: userProfile?.username || currentUser?.displayName || "Staytup Listener",
      avatar: userProfile?.avatar || DEFAULT_AVATAR,
      avatarColor: userProfile?.avatarColor || getDeterministicAvatarColor(currentUser?.uid),
    };
    return await sendFriendRequestRTDB(sender, recipientUid, recipientUser);
  };

  const acceptFriendRequest = async (requestUser) => {
    const me = {
      uid: currentUser?.uid || DEFAULT_USER_ID,
      username: userProfile?.username || currentUser?.displayName || "Staytup Listener",
      avatar: userProfile?.avatar || DEFAULT_AVATAR,
      avatarColor: userProfile?.avatarColor || getDeterministicAvatarColor(currentUser?.uid),
    };
    return await acceptFriendRequestRTDB(me, requestUser);
  };

  const declineFriendRequest = async (senderUid) => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    return await declineFriendRequestRTDB(uid, senderUid);
  };

  const cancelFriendRequest = async (recipientUid) => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    return await cancelFriendRequestRTDB(uid, recipientUid);
  };

  const removeFriend = async (friendUid) => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    return await removeFriendRTDB(uid, friendUid);
  };

  const searchUsers = async (query) => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    return await searchUsersRTDB(query, uid);
  };

  // Collaborative Playlists
  const createCollab = async (playlistData) => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    return await fbCreateCollabPlaylist(uid, userProfile, playlistData);
  };

  const joinCollab = async (collabId) => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    return await fbJoinCollabPlaylist(uid, userProfile, collabId);
  };

  const leaveCollab = async (collabId) => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    return await fbLeaveCollabPlaylist(uid, collabId);
  };

  const addTrackToCollab = async (collabId, track) => {
    return await fbAddTrackToCollabPlaylist(collabId, track);
  };

  const addTracksToCollab = async (collabId, tracks) => {
    return await fbAddTracksToCollabPlaylist(collabId, tracks);
  };

  const removeTrackFromCollab = async (collabId, videoId) => {
    return await fbRemoveTrackFromCollabPlaylist(collabId, videoId);
  };

  const getCollabDetails = async (collabId) => {
    return await fbGetCollabPlaylistDetails(collabId);
  };

  const removeCollaborator = async (collabId, targetUid) => {
    return await fbRemoveCollaboratorFromCollabPlaylist(collabId, targetUid);
  };

  const deleteCollab = async (collabId) => {
    const uid = currentUser?.uid || DEFAULT_USER_ID;
    setCollabPlaylists((prev) => (prev || []).filter((p) => (p.id || p.collabId) !== collabId));
    return await fbDeleteCollabPlaylist(collabId, uid);
  };

  const sendCollabInvite = async (targetUid, data) => {
    const uid = currentUser?.uid;
    if (!uid) return { success: false, error: "Not authenticated" };
    return await fbSendCollabInvite(uid, userProfile, targetUid, data);
  };

  const acceptCollabInvite = async (collabIdOrInvite) => {
    const uid = currentUser?.uid;
    if (!uid) return { success: false, error: "Not authenticated" };
    const res = await fbAcceptCollabInvite(uid, userProfile, collabIdOrInvite);
    if (res?.success && res.playlist) {
      setCollabPlaylists((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const pId = res.playlist.collabId || res.playlist.id;
        if (list.some((p) => (p.collabId || p.id) === pId)) {
          return list;
        }
        return [res.playlist, ...list];
      });
      // Remove invite from local state
      const targetId = typeof collabIdOrInvite === "string" ? collabIdOrInvite.replace(/^invite_/, "") : (collabIdOrInvite?.collabId || collabIdOrInvite?.id);
      setCollabInvites((prev) => (prev || []).filter((inv) => (inv.collabId || inv.id) !== targetId && inv.id !== `invite_${targetId}`));
    }
    return res;
  };

  const declineCollabInvite = async (collabIdOrInvite) => {
    const uid = currentUser?.uid;
    if (!uid) return { success: false };
    const targetId = typeof collabIdOrInvite === "string" ? collabIdOrInvite.replace(/^invite_/, "") : (collabIdOrInvite?.collabId || collabIdOrInvite?.id);
    setCollabInvites((prev) => (prev || []).filter((inv) => (inv.collabId || inv.id) !== targetId && inv.id !== `invite_${targetId}`));
    return await fbDeclineCollabInvite(uid, collabIdOrInvite);
  };

  const getFriendBlend = async (friendUid, friendProfile) => {
    const myUid = currentUser?.uid || DEFAULT_USER_ID;
    return await fbCalculateFriendBlend(myUid, userProfile, friendUid, friendProfile);
  };

  const pendingRequestsCount =
    (friendRequests?.incoming?.length || 0) + (collabInvites?.length || 0);

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
        userArtistMovements,
        recordArtistMovement,
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
        renamePlaylist,
        deletePlaylist,
        addTrackToPlaylist,
        addTracksToPlaylist,
        removeTrackFromPlaylist,
        isTrackInAnyPlaylist,
        recentlyPlayed,
        streamCount,
        recordUserStream,
        // Friend System
        friends,
        friendRequests,
        sendFriendRequest,
        acceptFriendRequest,
        declineFriendRequest,
        cancelFriendRequest,
        removeFriend,
        searchUsers,
        // Collaborative Playlists & Blend Invites
        collabPlaylists,
        collabInvites,
        sendCollabInvite,
        acceptCollabInvite,
        declineCollabInvite,
        pendingRequestsCount,
        createCollabPlaylist: createCollab,
        joinCollabPlaylist: joinCollab,
        leaveCollabPlaylist: leaveCollab,
        addTrackToCollabPlaylist: addTrackToCollab,
        addTracksToCollabPlaylist: addTracksToCollab,
        removeTrackFromCollabPlaylist: removeTrackFromCollab,
        getCollabPlaylistDetails: getCollabDetails,
        removeCollaboratorFromCollabPlaylist: removeCollaborator,
        deleteCollabPlaylist: deleteCollab,
        // Blend & Compatibility
        getFriendBlend,
        // Auto Playlist Generation
        generateAutoPlaylist: fbGenerateAutoPlaylist,
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
  renamePlaylist: () => Promise.resolve(false),
  recentlyPlayed: [],
  streamCount: 0,
  recordUserStream: () => {},
  friends: [],
  friendRequests: { incoming: [], outgoing: [] },
  sendFriendRequest: () => Promise.resolve(false),
  acceptFriendRequest: () => Promise.resolve(false),
  declineFriendRequest: () => Promise.resolve(false),
  cancelFriendRequest: () => Promise.resolve(false),
  removeFriend: () => Promise.resolve(false),
  searchUsers: () => Promise.resolve([]),
  collabPlaylists: [],
  createCollabPlaylist: () => Promise.resolve({ success: false }),
  joinCollabPlaylist: () => Promise.resolve({ success: false }),
  leaveCollabPlaylist: () => Promise.resolve(false),
  addTrackToCollabPlaylist: () => Promise.resolve(false),
  removeTrackFromCollabPlaylist: () => Promise.resolve(false),
  getCollabPlaylistDetails: () => Promise.resolve(null),
  removeCollaboratorFromCollabPlaylist: () => Promise.resolve(false),
  deleteCollabPlaylist: () => Promise.resolve(false),
  collabInvites: [],
  sendCollabInvite: () => Promise.resolve({ success: false }),
  acceptCollabInvite: () => Promise.resolve({ success: false }),
  declineCollabInvite: () => Promise.resolve({ success: false }),
  pendingRequestsCount: 0,
  getFriendBlend: () => Promise.resolve(null),
  isFavoriteArtist: () => false,
  toggleFavoriteArtist: () => {},
  userArtistMovements: {},
  recordArtistMovement: () => {},
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
