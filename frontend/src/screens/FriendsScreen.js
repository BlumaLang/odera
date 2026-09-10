import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Image,
  Platform,
  ActivityIndicator,
  Modal,
  Animated,
  Easing,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { useResponsive } from "../context/ResponsiveContext";
import { useUser, formatPersonName, formatUsername, getDeterministicAvatarColor } from "../context/UserContext";
import { useAudioPlayback } from "../context/AudioContext";
import {
  subscribeFriendActivity,
  getUserData,
  getUserStreamCount,
  getLikedSongs,
} from "../services/firebase";
import PlaylistModal from "../components/PlaylistModal";
import CreatePlaylistModal from "../components/CreatePlaylistModal";
import { registerBackAction } from "../services/navigation";
import { getHighResArtwork } from "../utils/imageUtils";

function FriendsSkeleton({ type }) {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.6,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  if (type === "blend") {
    return (
      <View style={styles.skeletonWrap}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={styles.skeletonBlendRow}>
            <View style={styles.skeletonBlendAvatars}>
              <Animated.View style={[styles.skeletonCircle, { width: 44, height: 44, opacity: pulseAnim }]} />
              <Animated.View style={[styles.skeletonCircle, { width: 44, height: 44, marginLeft: -14, opacity: pulseAnim }]} />
            </View>
            <View style={styles.skeletonBlendInfo}>
              <Animated.View style={[styles.skeletonLine, { width: 130 + (i % 2) * 30, height: 14, opacity: pulseAnim }]} />
              <Animated.View style={[styles.skeletonLine, { width: 100 + (i % 3) * 20, height: 11, marginTop: 6, opacity: pulseAnim }]} />
            </View>
            <Animated.View style={[styles.skeletonPill, { width: 60, height: 28, opacity: pulseAnim }]} />
          </View>
        ))}
      </View>
    );
  }

  if (type === "requests") {
    return (
      <View style={styles.skeletonWrap}>
        <Animated.View style={[styles.skeletonLine, { width: 160, height: 14, marginBottom: 14, opacity: pulseAnim }]} />
        {[1, 2, 3].map((i) => (
          <View key={i} style={styles.skeletonUserRow}>
            <Animated.View style={[styles.skeletonCircle, { width: 46, height: 46, opacity: pulseAnim }]} />
            <View style={styles.skeletonUserInfo}>
              <Animated.View style={[styles.skeletonLine, { width: 120 + (i % 2) * 30, height: 14, opacity: pulseAnim }]} />
              <Animated.View style={[styles.skeletonLine, { width: 80 + (i % 3) * 15, height: 10, marginTop: 5, opacity: pulseAnim }]} />
            </View>
            <View style={styles.skeletonRequestBtns}>
              <Animated.View style={[styles.skeletonPill, { width: 70, height: 32, opacity: pulseAnim }]} />
              <Animated.View style={[styles.skeletonCircle, { width: 32, height: 32, opacity: pulseAnim }]} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (type === "collab") {
    return (
      <View style={styles.skeletonWrap}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={styles.skeletonCollabRow}>
            <View style={styles.skeletonCollabCoverWrap}>
              <Animated.View style={[styles.skeletonCircle, { width: 60, height: 60, borderRadius: 30, opacity: pulseAnim }]} />
            </View>
            <View style={styles.skeletonCollabInfo}>
              <Animated.View style={[styles.skeletonLine, { width: 140 + (i % 2) * 30, height: 14, opacity: pulseAnim }]} />
              <View style={styles.skeletonCollabBadges}>
                <Animated.View style={[styles.skeletonPill, { width: 50, height: 18, opacity: pulseAnim }]} />
                <Animated.View style={[styles.skeletonPill, { width: 40, height: 18, opacity: pulseAnim }]} />
              </View>
              <Animated.View style={[styles.skeletonLine, { width: 100 + (i % 3) * 20, height: 10, marginTop: 6, opacity: pulseAnim }]} />
            </View>
            <Animated.View style={[styles.skeletonCircle, { width: 38, height: 38, borderRadius: 19, opacity: pulseAnim }]} />
          </View>
        ))}
      </View>
    );
  }

  // friends or search
  return (
    <View style={styles.skeletonWrap}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={styles.skeletonUserRow}>
          <View style={styles.skeletonAvatarWrap}>
            <Animated.View style={[styles.skeletonCircle, { width: 46, height: 46, opacity: pulseAnim }]} />
            <Animated.View style={[styles.skeletonDot, { opacity: pulseAnim }]} />
          </View>
          <View style={styles.skeletonUserInfo}>
            <Animated.View style={[styles.skeletonLine, { width: 120 + (i % 3) * 25, height: 14, opacity: pulseAnim }]} />
            <Animated.View style={[styles.skeletonLine, { width: 90 + (i % 2) * 20, height: 10, marginTop: 5, opacity: pulseAnim }]} />
          </View>
          <View style={styles.skeletonActionBtns}>
            {i % 3 === 0 ? (
              <Animated.View style={[styles.skeletonPill, { width: 70, height: 30, opacity: pulseAnim }]} />
            ) : (
              <Animated.View style={[styles.skeletonPill, { width: 70, height: 30, opacity: pulseAnim }]} />
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Robust UserAvatar component using memoji, photo, or vibrant colored monogram
 */
function UserAvatar({ user, size = 44, fontSize = 15, style }) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [user?.avatar, user?.photoURL, user?.avatarUrl]);

  const username = user?.username || user?.displayName || user?.name || "Friend";
  const avatar = user?.avatar;
  const initial = (username[0] || "U").toUpperCase();

  const bgColor =
    user?.avatarColor && user.avatarColor !== "#1DB954"
      ? user.avatarColor
      : getDeterministicAvatarColor(user?.uid || username);

  // Memoji local asset
  if (avatar && avatar.startsWith("memoji_")) {
    const memojiMap = {
      memoji_0: require("../../assets/memoji/pastel_0.jpg"),
      memoji_1: require("../../assets/memoji/pastel_1.jpg"),
      memoji_2: require("../../assets/memoji/pastel_2.jpg"),
      memoji_3: require("../../assets/memoji/pastel_3.jpg"),
      memoji_4: require("../../assets/memoji/pastel_4.jpg"),
      memoji_5: require("../../assets/memoji/pastel_5.jpg"),
      memoji_6: require("../../assets/memoji/pastel_6.jpg"),
      memoji_7: require("../../assets/memoji/pastel_7.jpg"),
      memoji_8: require("../../assets/memoji/pastel_8.jpg"),
      memoji_9: require("../../assets/memoji/pastel_9.jpg"),
    };
    const src = memojiMap[avatar];
    if (src) {
      return (
        <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: "hidden" }, style]}>
          <Image source={src} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        </View>
      );
    }
  }

  // HTTP URL (not google)
  const candidateUri =
    (avatar && typeof avatar === "string" && avatar.startsWith("http") && !avatar.includes("googleusercontent.com"))
      ? avatar
      : (user?.avatarUrl && typeof user.avatarUrl === "string" && user.avatarUrl.startsWith("http") && !user.avatarUrl.includes("googleusercontent.com"))
      ? user.avatarUrl
      : (user?.photoURL && typeof user.photoURL === "string" && user.photoURL.startsWith("http") && !user.photoURL.includes("googleusercontent.com"))
      ? user.photoURL
      : null;

  const showImage = !imgError && Boolean(candidateUri);
  const isLightBg = bgColor === "#FFFFFF" || bgColor === "#FFA500";
  const textColor = isLightBg ? "#000000" : "#FFFFFF";

  if (showImage) {
    return (
      <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor, overflow: "hidden" }, style]}>
        <Image source={{ uri: candidateUri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" onError={() => setImgError(true)} />
      </View>
    );
  }

  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor, alignItems: "center", justifyContent: "center" }, style]}>
      <Text style={{ fontFamily: fonts.bold, fontSize, color: textColor }}>{initial}</Text>
    </View>
  );
}

export default function FriendsScreen({ onNavigate }) {
  const { isDesktop, isTablet, isPhone } = useResponsive();
  const {
    currentUser,
    userProfile,
    openProfile,
    friends,
    friendRequests,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
    searchUsers,
    collabPlaylists,
    createCollabPlaylist,
    getFriendBlend,
    collabInvites,
    sendCollabInvite,
    acceptCollabInvite,
    declineCollabInvite,
    pendingRequestsCount,
  } = useUser() || {};

  const { playTrack, currentTrack, isPlaying, togglePlayPause } = useAudioPlayback();

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendFeedback, setSendFeedback] = useState({ text: "", isError: false });
  const [friendToDelete, setFriendToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Friends / Requests / Collab / Blend Tab State: 'friends' | 'blend' | 'requests' | 'collab'
  const [activeTab, setActiveTab] = useState("friends");

  // Blend Radar states
  const [selectedBlendFriend, setSelectedBlendFriend] = useState(null);
  const [blendResult, setBlendResult] = useState(null);
  const [isLoadingBlend, setIsLoadingBlend] = useState(false);
  const [showBlendModal, setShowBlendModal] = useState(false);
  const [blendFriendsMap, setBlendFriendsMap] = useState({});
  const [copiedBlendShare, setCopiedBlendShare] = useState(false);
  const [isCreatingBlend, setIsCreatingBlend] = useState(false);
  const [blendSuccessMsg, setBlendSuccessMsg] = useState("");
  const [blendRequestSent, setBlendRequestSent] = useState(false);
  const searchInputRef = useRef(null);

  // Collab Playlist states
  const [selectedCollabPlaylist, setSelectedCollabPlaylist] = useState(null);
  const [showCollabCreateModal, setShowCollabCreateModal] = useState(false);
  const [collabModalTab, setCollabModalTab] = useState("custom");

  // Dismissed suggested users in this session
  const [dismissedUids, setDismissedUids] = useState(new Set());

  // Discoverable users & global search results
  const [discoverUsers, setDiscoverUsers] = useState([]);
  const [isLoadingDiscover, setIsLoadingDiscover] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [contextLoaded, setContextLoaded] = useState(false);
  const [tabLoading, setTabLoading] = useState(true);

  useEffect(() => {
    if (friends !== undefined || friendRequests !== undefined) {
      setContextLoaded(true);
    }
  }, [friends, friendRequests]);

  useEffect(() => {
    if (!contextLoaded) return;
    setTabLoading(true);
    const timer = setTimeout(() => setTabLoading(false), 300);
    return () => clearTimeout(timer);
  }, [activeTab, contextLoaded]);

  // Live activities mapped by friend UID: { [uid]: { track, isPlaying, updatedAt } }
  const [friendsActivity, setFriendsActivity] = useState({});

  // Focused user for Friend Profile Modal
  const [selectedUserProfile, setSelectedUserProfile] = useState(null);
  const [selectedUserStats, setSelectedUserStats] = useState({
    isPremium: false,
    listeningHours: 0,
    streamCount: 0,
    likedSongsCount: 0,
    isLoading: false,
  });
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // Fetch full stats (streamCount, listening hours, premium plan, liked songs) for selectedUserProfile
  useEffect(() => {
    if (!selectedUserProfile?.uid) {
      setSelectedUserStats({
        isPremium: false,
        listeningHours: 0,
        streamCount: 0,
        likedSongsCount: 0,
        isLoading: false,
      });
      return;
    }

    const uid = selectedUserProfile.uid;
    setSelectedUserStats((prev) => ({ ...prev, isLoading: true }));

    let isMounted = true;
    Promise.all([
      getUserData(uid).catch(() => null),
      getUserStreamCount(uid).catch(() => 0),
      getLikedSongs(uid).catch(() => []),
    ]).then(([userData, streams, likedList]) => {
      if (!isMounted) return;
      const rawStreams = Math.max(0, parseInt(streams, 10) || parseInt(userData?.streamCount, 10) || 0);
      const isPrem = Boolean(userData?.isPremium || userData?.premiumPlan === "VIP" || userData?.premiumPlan === "1 Month");
      // Compute estimated listening hours based on streams (~3.2 minutes per song)
      const calculatedHours = (rawStreams * 3.2) / 60;
      const displayHours = calculatedHours >= 10 ? Math.round(calculatedHours) : Math.round(calculatedHours * 10) / 10;
      const totalLiked = Array.isArray(likedList) ? likedList.length : typeof userData?.likedSongs === "object" ? Object.keys(userData.likedSongs || {}).length : 0;

      setSelectedUserStats({
        isPremium: isPrem,
        listeningHours: displayHours || 0,
        streamCount: rawStreams,
        likedSongsCount: totalLiked,
        isLoading: false,
      });
    });

    return () => {
      isMounted = false;
    };
  }, [selectedUserProfile?.uid]);

  // Android hardware back button handler registrations
  useEffect(() => {
    if (selectedUserProfile) {
      return registerBackAction(() => {
        setSelectedUserProfile(null);
        return true;
      });
    }
  }, [selectedUserProfile]);

  useEffect(() => {
    if (showBlendModal) {
      return registerBackAction(() => {
        setShowBlendModal(false);
        setSelectedBlendFriend(null);
        setBlendResult(null);
        return true;
      });
    }
  }, [showBlendModal]);

  useEffect(() => {
    if (friendToDelete) {
      return registerBackAction(() => {
        setFriendToDelete(null);
        return true;
      });
    }
  }, [friendToDelete]);

  useEffect(() => {
    if (showCollabCreateModal) {
      return registerBackAction(() => {
        setShowCollabCreateModal(false);
        return true;
      });
    }
  }, [showCollabCreateModal]);

  useEffect(() => {
    if (selectedCollabPlaylist) {
      return registerBackAction(() => {
        setSelectedCollabPlaylist(null);
        return true;
      });
    }
  }, [selectedCollabPlaylist]);

  useEffect(() => {
    if (isSearchActive) {
      return registerBackAction(() => {
        setIsSearchActive(false);
        setSearchQuery("");
        return true;
      });
    }
  }, [isSearchActive]);

  const userInitial = (userProfile?.username?.[0] || currentUser?.displayName?.[0] || "U").toUpperCase();
  const avatarIcon = userProfile?.avatar && userProfile.avatar !== "initial" ? userProfile.avatar : null;
  const avatarBg = userProfile?.avatarColor || colors.primary;

  const incomingRequests = friendRequests?.incoming || [];
  const outgoingRequests = friendRequests?.outgoing || [];
  const friendsList = friends || [];

  // Keep selectedUserProfile fresh when friends list updates (avatar, name changes)
  useEffect(() => {
    if (!selectedUserProfile?.uid || !friendsList.length) return;
    const fresh = friendsList.find((f) => f.uid === selectedUserProfile.uid);
    if (fresh && (
      fresh.avatar !== selectedUserProfile.avatar ||
      fresh.avatarColor !== selectedUserProfile.avatarColor ||
      fresh.username !== selectedUserProfile.username
    )) {
      setSelectedUserProfile((prev) => ({ ...prev, ...fresh }));
    }
  }, [friendsList]);

  // Read URL query parameter ?search= or /friend/{username} on web
  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined" && window.location) {
      try {
        const params = new URLSearchParams(window.location.search);
        const q = params.get("search");
        if (q && q.trim()) {
          setSearchQuery(q.trim());
          setIsSearchActive(true);
        } else {
          // Check pathname for /friend/{username}
          const segments = window.location.pathname.replace(/^\/+/, "").split("/");
          if ((segments[0] === "friend" || segments[0] === "friends") && segments[1]) {
            const targetUsername = decodeURIComponent(segments[1]).trim();
            if (targetUsername) {
              setSearchQuery(targetUsername);
              setIsSearchActive(true);
              // Auto search and resolve user profile modal
              if (searchUsers) {
                searchUsers(targetUsername).then((results) => {
                  if (results && results.length > 0) {
                    const matched = results.find(
                      (u) => u.username?.toLowerCase() === targetUsername.toLowerCase()
                    ) || results[0];
                    if (matched) {
                      setSelectedUserProfile(matched);
                    }
                  }
                }).catch(() => {});
              }
            }
          }
        }
      } catch (_) {}
    }
  }, [searchUsers]);

  // Listen to live playback status for all friends
  useEffect(() => {
    if (!friendsList || friendsList.length === 0) return;

    const unsubs = friendsList.map((f) => {
      if (!f?.uid) return () => {};
      return subscribeFriendActivity(f.uid, (activity) => {
        setFriendsActivity((prev) => ({
          ...prev,
          [f.uid]: activity,
        }));
      });
    });

    return () => {
      unsubs.forEach((unsub) => {
        try {
          unsub();
        } catch (_) {}
      });
    };
  }, [friendsList]);

  // Auto-clear send feedback message
  useEffect(() => {
    if (!sendFeedback.text) return;
    const timer = setTimeout(() => {
      setSendFeedback({ text: "", isError: false });
    }, 4500);
    return () => clearTimeout(timer);
  }, [sendFeedback]);

  // Load discover users
  const loadDiscoverUsers = useCallback(async () => {
    if (!searchUsers) return;
    setIsLoadingDiscover(true);
    try {
      const res = await searchUsers("");
      setDiscoverUsers(res || []);
    } catch (_) {
      setDiscoverUsers([]);
    } finally {
      setIsLoadingDiscover(false);
    }
  }, [searchUsers]);

  useEffect(() => {
    loadDiscoverUsers();
  }, [loadDiscoverUsers]);

  // Debounced global user search
  useEffect(() => {
    const q = searchQuery.trim().replace(/^@/, "");
    if (!q || !searchUsers) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingUsers(true);
      try {
        const res = await searchUsers(q);
        setSearchResults(res || []);
      } catch (_) {
        setSearchResults([]);
      } finally {
        setIsSearchingUsers(false);
      }
    }, 90);
    return () => clearTimeout(timer);
  }, [searchQuery, searchUsers]);

  // Filtered suggested people: strictly excludes self, existing friends, pending requests, and dismissed
  const suggestedPeople = useMemo(() => {
    const myUid = currentUser?.uid;
    const myName = (userProfile?.username || currentUser?.displayName || "").toLowerCase();
    const friendUids = new Set(friendsList.map((f) => f.uid).filter(Boolean));
    const friendNames = new Set(friendsList.map((f) => f.username?.toLowerCase()).filter(Boolean));
    const incomingUids = new Set(incomingRequests.map((r) => r.uid).filter(Boolean));
    const outgoingUids = new Set(outgoingRequests.map((r) => r.uid).filter(Boolean));

    const seenUids = new Set();
    return discoverUsers.filter((u) => {
      if (!u || !u.uid) return false;
      if (seenUids.has(u.uid)) return false;
      seenUids.add(u.uid);
      if (myUid && u.uid === myUid) return false;
      if (myName && u.username && u.username.toLowerCase() === myName) return false;
      if (friendUids.has(u.uid)) return false;
      if (u.username && friendNames.has(u.username.toLowerCase())) return false;
      if (incomingUids.has(u.uid) || outgoingUids.has(u.uid)) return false;
      if (dismissedUids.has(u.uid)) return false;
      return true;
    });
  }, [discoverUsers, currentUser, userProfile, friendsList, incomingRequests, outgoingRequests, dismissedUids]);

  // Search-matched friends
  const searchMatchedFriends = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase().replace(/^@/, "");
    return friendsList.filter(
      (f) =>
        (f.username && f.username.toLowerCase().includes(q)) ||
        (f.friendCode && f.friendCode.toLowerCase().includes(q)) ||
        (f.uid && f.uid.toLowerCase() === q)
    );
  }, [friendsList, searchQuery]);

  // Unified Search Results: Combines friends and public users without splitting into disjoint sections
  const combinedSearchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase().replace(/^@/, "");
    if (!q) {
      return suggestedPeople;
    }

    const myUid = currentUser?.uid;
    const myName = (userProfile?.username || currentUser?.displayName || "").toLowerCase();

    const friendMap = new Map();
    friendsList.forEach((f) => {
      if (f?.uid) friendMap.set(f.uid, f);
      if (f?.username) friendMap.set(f.username.toLowerCase(), f);
    });

    const outgoingMap = new Map();
    outgoingRequests.forEach((r) => {
      if (r?.uid) outgoingMap.set(r.uid, r);
    });

    const incomingMap = new Map();
    incomingRequests.forEach((r) => {
      if (r?.uid) incomingMap.set(r.uid, r);
    });

    const results = [];
    const seenUids = new Set();

    // 1. Matching existing friends
    searchMatchedFriends.forEach((f) => {
      if (!f || !f.uid || seenUids.has(f.uid)) return;
      seenUids.add(f.uid);
      results.push({
        ...f,
        isFriend: true,
        isOutgoing: false,
        isIncoming: false,
      });
    });

    // 1b. Instantly match discoverable users locally with zero lag
    const cleanQ = q.toLowerCase();
    discoverUsers.forEach((u) => {
      if (!u || !u.uid || seenUids.has(u.uid)) return;
      if (myUid && u.uid === myUid) return;
      if (myName && u.username && u.username.toLowerCase() === myName) return;
      if (
        (u.username && u.username.toLowerCase().includes(cleanQ)) ||
        (u.friendCode && u.friendCode.toLowerCase().includes(cleanQ))
      ) {
        seenUids.add(u.uid);
        results.push({
          ...u,
          isFriend: false,
          isOutgoing: outgoingMap.has(u.uid),
          isIncoming: incomingMap.has(u.uid),
        });
      }
    });

    // 2. Matching global users from backend
    searchResults.forEach((u) => {
      if (!u || !u.uid || seenUids.has(u.uid)) return;
      if (myUid && u.uid === myUid) return;
      if (myName && u.username && u.username.toLowerCase() === myName) return;

      seenUids.add(u.uid);
      const friendObj = friendMap.get(u.uid) || (u.username ? friendMap.get(u.username.toLowerCase()) : null);
      const isFriend = Boolean(friendObj);
      const isOutgoing = outgoingMap.has(u.uid);
      const isIncoming = incomingMap.has(u.uid);

      results.push({
        ...(friendObj || u),
        isFriend,
        isOutgoing,
        isIncoming,
      });
    });

    return results;
  }, [
    searchQuery,
    suggestedPeople,
    currentUser,
    userProfile,
    friendsList,
    outgoingRequests,
    incomingRequests,
    searchMatchedFriends,
    searchResults,
  ]);

  // Sort friends: live listening first, then alphabetical
  const sortedFriends = useMemo(() => {
    return [...friendsList].sort((a, b) => {
      const actA = friendsActivity[a.uid];
      const actB = friendsActivity[b.uid];
      const liveA = Boolean(actA?.isPlaying && actA?.track);
      const liveB = Boolean(actB?.isPlaying && actB?.track);
      if (liveA && !liveB) return -1;
      if (!liveA && liveB) return 1;
      return (a.username || "").localeCompare(b.username || "");
    });
  }, [friendsList, friendsActivity]);

  const handleSendFriendDirect = async (targetUser) => {
    if (!targetUser?.uid || !sendFriendRequest || isSending) return;
    setIsSending(true);
    try {
      const ok = await sendFriendRequest(targetUser.uid, targetUser);
      if (ok) {
        setSendFeedback({ text: `Friend request sent to ${targetUser.username}!`, isError: false });
      } else {
        setSendFeedback({ text: "Could not send friend request. Please try again.", isError: true });
      }
    } catch (err) {
      setSendFeedback({ text: "Failed to send friend request.", isError: true });
    } finally {
      setIsSending(false);
    }
  };

  const handleAcceptRequest = async (reqUser) => {
    if (!acceptFriendRequest) return;
    try {
      await acceptFriendRequest(reqUser);
      setSendFeedback({ text: `Accepted friend request from ${reqUser.username}!`, isError: false });
    } catch (err) {
      console.warn("Failed to accept friend request:", err);
    }
  };

  const handleDeclineRequest = async (senderUid) => {
    if (!declineFriendRequest) return;
    try {
      await declineFriendRequest(senderUid);
    } catch (err) {
      console.warn("Failed to decline friend request:", err);
    }
  };

  const handleDismissSuggestion = (uid) => {
    setDismissedUids((prev) => new Set([...prev, uid]));
  };

  const handleConfirmDeleteFriend = async () => {
    if (!friendToDelete?.uid || !removeFriend) return;
    setIsDeleting(true);
    try {
      await removeFriend(friendToDelete.uid);
      if (selectedUserProfile?.uid === friendToDelete.uid) {
        setSelectedUserProfile(null);
      }
    } catch (err) {
      console.warn("Failed to remove friend:", err);
    } finally {
      setIsDeleting(false);
      setFriendToDelete(null);
    }
  };

  const handleListenAlong = (track) => {
    if (!track || !playTrack) return;
    playTrack({
      ...track,
      videoId: track.videoId || track.video_id,
    });
  };

  // Find existing blend playlist for a friend pair
  const findExistingBlend = useCallback((friendUid) => {
    const myUid = currentUser?.uid || userProfile?.uid;
    if (!collabPlaylists || !myUid || !friendUid) return null;
    const pairKey = [myUid, friendUid].sort().join("_");
    return collabPlaylists.find((pl) => {
      // New Blend records use a stable pair key. Keep the collaborator/name
      // checks for records created before that key existed.
      const isBlend = pl?.isBlend || pl?.type === "blend" || 
        String(pl?.name || "").startsWith("Blend:") || 
        /^Blend\s*#\d+$/.test(String(pl?.name || ""));
      if (!isBlend) return false;
      if (pl.blendKey === pairKey) return true;
      const collabs = pl.collaborators || {};
      const collabKeys = Object.keys(collabs);
      // Check if both users are collaborators
      const hasMe = collabKeys.some((k) => {
        const c = collabs[k];
        return (c?.uid || k) === myUid;
      });
      const hasFriend = collabKeys.some((k) => {
        const c = collabs[k];
        return (c?.uid || k) === friendUid;
      });
      return hasMe && hasFriend;
    });
  }, [collabPlaylists, currentUser?.uid, userProfile?.uid]);

  const activeBlend = selectedBlendFriend ? findExistingBlend(selectedBlendFriend.uid) : null;

  const handleOpenBlend = async (friend) => {
    if (!friend?.uid || !getFriendBlend) return;
    setSelectedBlendFriend(friend);
    setIsLoadingBlend(true);
    setShowBlendModal(true);
    setCopiedBlendShare(false);
    setBlendRequestSent(false);

    // Check if a blend playlist already exists for this friend pair
    const existingBlend = findExistingBlend(friend.uid);
    if (existingBlend) {
      const matchPct = existingBlend.matchPercentage || 85;
      setBlendFriendsMap((prev) => ({ ...prev, [friend.uid]: matchPct }));
      // Check if friend has joined (has role in collaborators)
      const friendJoined = Boolean(existingBlend.collaborators?.[friend.uid]?.role);
      if (!friendJoined) {
        setBlendRequestSent(true);
      }
      // Use existing playlist tracks if available
      const existingTracks = existingBlend.tracks || [];
      if (existingTracks.length > 0) {
        setBlendResult({
          matchPercentage: matchPct,
          sharedSongsCount: existingTracks.filter((t) => t.blendSource === "both").length,
          topVibe: "music styles",
          tracks: existingTracks,
          friend,
          updatedAt: existingBlend.updatedAt,
        });
        setIsLoadingBlend(false);
        return;
      }
    }

    try {
      const res = await getFriendBlend(friend.uid, friend);
      setBlendResult(res);
    } catch (err) {
      console.warn("Failed to calculate blend:", err);
    } finally {
      setIsLoadingBlend(false);
    }
  };

  const handleCreateBlend = async () => {
    if (!blendResult || !selectedBlendFriend || isCreatingBlend) return;
    setIsCreatingBlend(true);
    try {
      const myName = userProfile?.username || "You";
      const friendName = selectedBlendFriend.username || "Friend";
      const matchPct = blendResult.matchPercentage || 85;
      const formattedTracks = (blendResult.tracks || []).map((t) => ({
        ...t,
        videoId: t.videoId || t.video_id,
      }));

      // Check if a blend already exists for this friend pair
      const existingBlend = findExistingBlend(selectedBlendFriend.uid);
      let activeCollabId;

      if (existingBlend) {
        // Update existing blend playlist with new tracks
        activeCollabId = existingBlend.collabId || existingBlend.id;
        if (addTracksToCollab && formattedTracks.length > 0) {
          const existingTrackIds = new Set((existingBlend.tracks || []).map((t) => t.videoId || t.id));
          const newTracks = formattedTracks.filter((t) => !existingTrackIds.has(t.videoId));
          if (newTracks.length > 0) {
            await addTracksToCollab(activeCollabId, newTracks);
          }
        }
        setBlendSuccessMsg("Blend playlist updated!");
      } else {
        // Create new blend playlist and send invite
        let created = null;
        if (createCollabPlaylist) {
          // Find existing blend count for this user to generate Blend #N
          const existingBlendCount = (collabPlaylists || []).filter(
            (pl) => pl.isBlend || pl.type === "blend" || String(pl.name || "").startsWith("Blend")
          ).length;
          const blendNumber = existingBlendCount + 1;
          const blendName = `Blend #${blendNumber}`;
          
          created = await createCollabPlaylist({
            name: blendName,
            description: `${matchPct}% Music Match • Auto-curated daily shared blend`,
            tracks: formattedTracks,
            cover_url: formattedTracks[0]?.artwork_url || formattedTracks[0]?.thumbnail || "",
            collaborators: {
              [currentUser?.uid]: true,
              [selectedBlendFriend.uid]: true,
            },
            isBlend: true,
            matchPercentage: matchPct,
          });
        }
        activeCollabId = created?.collabId || created?.playlist?.id || created?.id;

        if (sendCollabInvite && selectedBlendFriend.uid) {
          await sendCollabInvite(selectedBlendFriend.uid, {
            collabId: activeCollabId,
            playlistId: activeCollabId,
            id: activeCollabId,
            name: blendName,
            playlistName: blendName,
            tracks: formattedTracks,
            tracksCount: formattedTracks.length,
            cover_url: formattedTracks[0]?.artwork_url || formattedTracks[0]?.thumbnail || "",
            type: "blend",
            matchPercentage: matchPct,
            playlist: created?.playlist,
          });
        }
      }

      setBlendFriendsMap((prev) => ({
        ...prev,
        [selectedBlendFriend.uid]: matchPct,
      }));

      // Only mark as request sent if friend hasn't joined yet
      const friendUid = selectedBlendFriend.uid;
      const updatedBlend = findExistingBlend(friendUid);
      const friendJoinedNow = Boolean(updatedBlend?.collaborators?.[friendUid]?.role);
      if (!friendJoinedNow) {
        setBlendRequestSent(true);
        setBlendSuccessMsg("Blend request sent!");
      } else {
        setBlendSuccessMsg("Blend updated!");
      }
      setTimeout(() => setBlendSuccessMsg(""), 4000);
    } catch (err) {
      console.warn("Failed to create blend playlist:", err);
    } finally {
      setIsCreatingBlend(false);
    }
  };

  const handleShareBlend = async () => {
    if (!blendResult || !selectedBlendFriend) return;
    const myName = userProfile?.username || "I";
    const friendName = selectedBlendFriend.username || "my friend";
    const matchPct = blendResult.matchPercentage || 85;
    const shareText = `⚡ ${myName} & ${friendName} have a ${matchPct}% Music Match on Staytup! Check out our shared Blend radar & playlist.`;
    const shareUrl = typeof window !== "undefined" && window.location ? window.location.origin : "https://staytup.odireca.com";

    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `${matchPct}% Music Match with ${friendName}`,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch (_) {}
    }

    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        setCopiedBlendShare(true);
        setTimeout(() => setCopiedBlendShare(false), 3000);
        return;
      } catch (_) {}
    }

    setCopiedBlendShare(true);
    setTimeout(() => setCopiedBlendShare(false), 3000);
  };

  const isUserFriend = (user) => {
    if (!user?.uid) return false;
    return friendsList.some((f) => f.uid === user.uid || (f.username && f.username.toLowerCase() === user.username?.toLowerCase()));
  };

  const isUserOutgoing = (user) => {
    if (!user?.uid) return false;
    return outgoingRequests.some((r) => r.uid === user.uid);
  };

  const isUserIncoming = (user) => {
    if (!user?.uid) return false;
    return incomingRequests.some((r) => r.uid === user.uid);
  };

  return (
    <View style={styles.container}>
      {/* Header Profile Row (Matching LibraryScreen exactly) */}
      <View style={styles.header}>
        <View style={[styles.headerInner, (isDesktop || isTablet) && styles.desktopHeaderInner]}>
          <View style={[styles.profileRow, isSearchActive && styles.profileRowHidden]}>
            <Text style={styles.profileName}>Friends</Text>

            {/* Top Right Header Controls */}
            <View style={styles.headerRightGroup}>
              <TouchableOpacity
                style={styles.headerCircleBtn}
                onPress={() => {
                  setIsSearchActive(true);
                  setTimeout(() => {
                    searchInputRef.current?.focus();
                  }, 100);
                }}
                activeOpacity={0.75}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Search friends"
              >
                <Ionicons name="search" size={17} color="#FFFFFF" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.avatarContainer, { backgroundColor: avatarBg }]}
                onPress={() => openProfile && openProfile()}
                activeOpacity={0.75}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {(() => {
                  const av = userProfile?.avatar;
                  if (av && av.startsWith("memoji_")) {
                    const memojiMap = {
                      memoji_0: require("../../assets/memoji/pastel_0.jpg"),
                      memoji_1: require("../../assets/memoji/pastel_1.jpg"),
                      memoji_2: require("../../assets/memoji/pastel_2.jpg"),
                      memoji_3: require("../../assets/memoji/pastel_3.jpg"),
                      memoji_4: require("../../assets/memoji/pastel_4.jpg"),
                      memoji_5: require("../../assets/memoji/pastel_5.jpg"),
                      memoji_6: require("../../assets/memoji/pastel_6.jpg"),
                      memoji_7: require("../../assets/memoji/pastel_7.jpg"),
                      memoji_8: require("../../assets/memoji/pastel_8.jpg"),
                      memoji_9: require("../../assets/memoji/pastel_9.jpg"),
                    };
                    const src = memojiMap[av];
                    if (src) return <Image source={src} style={styles.avatarImage} resizeMode="cover" />;
                  }
                  if (av && av.startsWith("http") && !av.includes("googleusercontent.com")) {
                    return <Image source={{ uri: av }} style={styles.avatarImage} resizeMode="cover" />;
                  }
                  return <Text style={styles.avatarText}>{(userProfile?.username?.[0] || "U").toUpperCase()}</Text>;
                })()}
              </TouchableOpacity>
            </View>
          </View>

          {/* Single Rounded Pill Search Bar (only shown when search is activated) */}
          {isSearchActive && (
            <View style={styles.topSearchWrapper}>
              <View style={styles.topSearchRow}>
                <View style={[styles.topSearchBar, styles.topSearchBarActive]}>
                  <Ionicons name="search" size={19} color={colors.textMuted} style={styles.searchIcon} />
                  <TextInput
                    ref={searchInputRef}
                    style={styles.topSearchInput}
                    placeholder="Search friends or find users..."
                    placeholderTextColor="#777777"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoFocus={true}
                    autoCapitalize="none"
                    returnKeyType="search"
                  />
                  {isSearchingUsers ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ flexShrink: 0, marginRight: 6 }} />
                  ) : searchQuery.length > 0 ? (
                    <TouchableOpacity
                      onPress={() => setSearchQuery("")}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      style={styles.searchClearBtn}
                      activeOpacity={0.7}
                      accessibilityLabel="Clear search input"
                    >
                      <View style={styles.clearCircleBadge}>
                        <Ionicons name="close" size={13} color="#121212" style={styles.clearIconGlyph} />
                      </View>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setIsSearchActive(false);
                    setSearchQuery("");
                  }}
                  style={styles.cancelCircleBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.75}
                  accessibilityLabel="Close search"
                >
                  <Ionicons name="close" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.friendsInner, (isDesktop || isTablet) && styles.desktopFriendsInner]}>
        {/* Spotify Pills (Matching LibraryScreen position and sizing exactly) */}
        {!isSearchActive && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsRow}
            style={styles.tabsRowContainer}
          >
            <TouchableOpacity
              style={[styles.tabButton, activeTab === "friends" && styles.activeTabButton]}
              onPress={() => setActiveTab("friends")}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, activeTab === "friends" && styles.activeTabText]}>
                Friends
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === "blend" && styles.activeTabButton]}
              onPress={() => setActiveTab("blend")}
              activeOpacity={0.8}
            >
              <View style={styles.tabPillLabelRow}>
                <Ionicons
                  name="infinite"
                  size={14}
                  color={activeTab === "blend" ? "#000000" : "#1DB954"}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.tabText, activeTab === "blend" && styles.activeTabText]}>
                  Blend Radar
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === "requests" && styles.activeTabButton]}
              onPress={() => setActiveTab("requests")}
              activeOpacity={0.8}
            >
              <View style={styles.tabPillLabelRow}>
                <Text style={[styles.tabText, activeTab === "requests" && styles.activeTabText]}>
                  Requests
                </Text>
                {(incomingRequests.length + (collabInvites?.length || 0)) > 0 && (
                  <View style={[styles.tabPillBadge, activeTab === "requests" && styles.tabPillBadgeActive]}>
                    <Text style={[styles.tabPillBadgeText, activeTab === "requests" && styles.tabPillBadgeTextActive]}>
                      {incomingRequests.length + (collabInvites?.length || 0)}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === "collab" && styles.activeTabButton]}
              onPress={() => setActiveTab("collab")}
              activeOpacity={0.8}
            >
              <View style={styles.tabPillLabelRow}>
                <Text style={[styles.tabText, activeTab === "collab" && styles.activeTabText]}>
                  Collab
                </Text>
                {collabPlaylists?.length > 0 && (
                  <View style={[styles.tabPillBadge, activeTab === "collab" && styles.tabPillBadgeActive]}>
                    <Text style={[styles.tabPillBadgeText, activeTab === "collab" && styles.tabPillBadgeTextActive]}>
                      {collabPlaylists.length}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </ScrollView>
        )}

      {/* Main Content Area */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.innerContent, (isDesktop || isTablet) && styles.desktopInnerContent]}>
          {/* Feedback banner */}
          {sendFeedback.text.length > 0 && (
            <View
              style={[
                styles.statusMsgWrap,
                sendFeedback.isError ? styles.statusMsgError : styles.statusMsgSuccess,
                { marginBottom: 16 },
              ]}
            >
              <Ionicons
                name={sendFeedback.isError ? "alert-circle" : "checkmark-circle"}
                size={15}
                color={sendFeedback.isError ? "#FF5252" : "#1DB954"}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.statusMsgText,
                  sendFeedback.isError ? { color: "#FF5252" } : { color: "#1DB954" },
                ]}
              >
                {sendFeedback.text}
              </Text>
            </View>
          )}

          {/* ═══════════ SEARCH VIEW ═══════════ */}
          {isSearchActive ? (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeaderTitle}>
                  {searchQuery.trim().length > 0
                    ? `Search Results (${combinedSearchResults.length})`
                    : "Suggested People"}
                </Text>
              </View>

              {isSearchingUsers ? (
                <FriendsSkeleton type="search" />
              ) : combinedSearchResults.length > 0 ? (
                <View style={styles.unifiedUserList}>
                  {combinedSearchResults.map((u) => {
                    const activity = friendsActivity[u.uid];
                    const isLive = u.isFriend && Boolean(activity?.isPlaying && activity?.track);

                    return (
                      <TouchableOpacity
                        key={`search_item_${u.uid}`}
                        style={styles.userRowItem}
                        onPress={() => {
                          if (u.isFriend) {
                            setSelectedUserProfile(u);
                          }
                        }}
                        activeOpacity={u.isFriend ? 0.7 : 1}
                      >
                        <View style={styles.avatarWrapper}>
                          <UserAvatar user={u} size={46} fontSize={16} />
                          {u.isFriend && (
                            <View
                              style={[
                                styles.statusDot,
                                isLive ? styles.statusDotLive : styles.statusDotOffline,
                              ]}
                            />
                          )}
                        </View>

                        <View style={styles.userInfoWrap}>
                          <Text style={styles.userNameText} numberOfLines={1}>
                            {formatPersonName(u.displayName || u.name || u.username || "")}
                          </Text>
                          {isLive ? (
                            <View style={styles.liveTrackRow}>
                              <MaterialCommunityIcons name="waveform" size={14} color="#1DB954" style={{ marginRight: 4 }} />
                              <Text style={styles.liveTrackText} numberOfLines={1}>
                                {activity.track.title}{activity.track.artist ? ` • ${activity.track.artist}` : ""}
                              </Text>
                            </View>
                          ) : (activity?.track || u.lastPlayback?.track || u.lastPlayback || u.lastPlayed) ? (
                            (() => {
                              const s = activity?.track || u.lastPlayback?.track || u.lastPlayback || u.lastPlayed;
                              const sTitle = s?.title || s?.name || "";
                              const sArtist = s?.artist || s?.subtitle || "";
                              return (
                                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                                  <Ionicons name="musical-note" size={12} color="#1DB954" style={{ marginRight: 4 }} />
                                  <Text style={styles.userHandleSubText} numberOfLines={1}>
                                    {sTitle}{sArtist ? ` • ${sArtist}` : ""}
                                  </Text>
                                </View>
                              );
                            })()
                          ) : !u.isFriend ? (
                            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                              <Ionicons name="musical-notes-outline" size={12} color="#888888" style={{ marginRight: 4 }} />
                              <Text style={[styles.userHandleSubText, { color: colors.textSecondary }]} numberOfLines={1}>
                                Add friend to see currently played songs
                              </Text>
                            </View>
                          ) : (
                            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                              <Ionicons name="musical-notes-outline" size={12} color="#888888" style={{ marginRight: 4 }} />
                              <Text style={[styles.userHandleSubText, { color: colors.textSecondary }]} numberOfLines={1}>
                                No songs played recently
                              </Text>
                            </View>
                          )}
                        </View>

                        {/* Action buttons */}
                        <View style={styles.userActionsRow}>
                          {u.isFriend ? (
                            <>
                              {isLive && activity?.track && (
                                <TouchableOpacity
                                  style={styles.listenAlongBtn}
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    handleListenAlong(activity.track);
                                  }}
                                  activeOpacity={0.8}
                                >
                                  <Ionicons name="play" size={12} color="#000000" />
                                  <Text style={styles.listenAlongText}>Listen</Text>
                                </TouchableOpacity>
                              )}
                              <View style={styles.statusBadgeFriend}>
                                <Ionicons name="checkmark" size={12} color="#1DB954" style={{ marginRight: 3 }} />
                                <Text style={styles.statusBadgeFriendText}>Friends</Text>
                              </View>
                            </>
                          ) : u.isIncoming ? (
                            <TouchableOpacity
                              style={styles.addUserBtn}
                              onPress={(e) => {
                                e.stopPropagation();
                                handleAcceptRequest(u);
                              }}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="checkmark" size={13} color="#000000" style={{ marginRight: 4 }} />
                              <Text style={styles.addUserBtnText}>Accept</Text>
                            </TouchableOpacity>
                          ) : u.isOutgoing ? (
                            <View style={styles.statusBadgePending}>
                              <Text style={styles.statusBadgePendingText}>Pending</Text>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={styles.addUserBtn}
                              onPress={(e) => {
                                e.stopPropagation();
                                handleSendFriendDirect(u);
                              }}
                              disabled={isSending}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="add" size={14} color="#000000" style={{ marginRight: 4 }} />
                              <Text style={styles.addUserBtnText}>Add</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : searchQuery.trim().length > 0 ? null : null}
            </View>
          ) : (
            /* ═══════════ TABBED VIEW: Friends | Requests ═══════════ */
            <>
              {tabLoading ? (
                <FriendsSkeleton type={activeTab} />
              ) : activeTab === "friends" ? (
                /* ── FRIENDS TAB ── */
                <View style={styles.sectionBlock}>
                  {sortedFriends.length > 0 ? (
                    <View style={styles.unifiedUserList}>
                      {sortedFriends.map((friend) => {
                        const activity = friendsActivity[friend.uid];
                        const isLive = Boolean(activity?.isPlaying && activity?.track);
                        const isCurrentPlayingThis =
                          currentTrack &&
                          activity?.track &&
                          (currentTrack.videoId === activity.track.videoId ||
                            currentTrack.id === activity.track.id);

                        return (
                          <TouchableOpacity
                            key={friend.uid}
                            style={styles.userRowItem}
                            onPress={() => setSelectedUserProfile(friend)}
                            activeOpacity={0.7}
                          >
                            {/* Avatar & Online Dot */}
                            <View style={styles.avatarWrapper}>
                              <UserAvatar user={friend} size={46} fontSize={16} />
                              <View
                                style={[
                                  styles.statusDot,
                                  isLive ? styles.statusDotLive : styles.statusDotOffline,
                                ]}
                              />
                            </View>

                            {/* Friend Info & Song */}
                            <View style={styles.userInfoWrap}>
                              <Text style={styles.userNameText} numberOfLines={1}>
                                {formatPersonName(friend.displayName || friend.name || friend.username || "")}
                              </Text>

                              {isLive ? (
                                <View style={styles.liveTrackRow}>
                                  <MaterialCommunityIcons
                                    name="waveform"
                                    size={14}
                                    color="#1DB954"
                                    style={{ marginRight: 4 }}
                                  />
                                  <Text style={styles.liveTrackTitle} numberOfLines={1}>
                                    {activity.track.title}
                                  </Text>
                                  {activity.track.artist ? (
                                    <Text style={styles.liveTrackArtist} numberOfLines={1}>
                                      {"  "}• {activity.track.artist}
                                    </Text>
                                  ) : null}
                                </View>
                              ) : (activity?.track || friend.lastPlayback?.track || friend.lastPlayback || friend.lastPlayed) ? (
                                (() => {
                                  const s = activity?.track || friend.lastPlayback?.track || friend.lastPlayback || friend.lastPlayed;
                                  const sTitle = s?.title || s?.name || "";
                                  const sArtist = s?.artist || s?.subtitle || "";
                                  return (
                                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                                      <Ionicons name="musical-note" size={12} color="#888888" style={{ marginRight: 4 }} />
                                      <Text style={styles.userHandleSubText} numberOfLines={1}>
                                        {sTitle}{sArtist ? ` • ${sArtist}` : ""}
                                      </Text>
                                    </View>
                                  );
                                })()
                              ) : (
                                <Text style={styles.userHandleSubText} numberOfLines={1}>
                                  Staytup Listener
                                </Text>
                              )}
                            </View>

                            {/* Action Buttons */}
                            <View style={styles.userActionsRow}>
                              {isLive && activity?.track && (
                                <TouchableOpacity
                                  style={[
                                    styles.listenAlongBtn,
                                    isCurrentPlayingThis && styles.listenAlongBtnActive,
                                  ]}
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    handleListenAlong(activity.track);
                                  }}
                                  activeOpacity={0.8}
                                >
                                  <Ionicons
                                    name={isCurrentPlayingThis ? "volume-high" : "play"}
                                    size={12}
                                    color="#000000"
                                  />
                                  <Text style={styles.listenAlongText}>
                                    {isCurrentPlayingThis ? "Listening" : "Listen"}
                                  </Text>
                                </TouchableOpacity>
                              )}

                              <TouchableOpacity
                                style={styles.dismissCloseBtn}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  setFriendToDelete(friend);
                                }}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                accessibilityLabel="Remove friend"
                              >
                                <Ionicons name="close" size={18} color="#888888" />
                              </TouchableOpacity>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    /* Center-oriented empty state with subtle gray icon (no card) */
                    <View style={styles.emptyCenterState}>
                      <Ionicons name="people-outline" size={48} color="#444444" style={styles.emptyCenterIcon} />
                      <Text style={styles.emptyCenterTitle}>No friends yet</Text>
                      <Text style={styles.emptyCenterSub}>
                        Add people you know and start building your Staytup network.
                      </Text>
                    </View>
                  )}
                </View>
              ) : activeTab === "blend" ? (
                /* ── BLEND RADAR TAB (Friend Music Compatibility) ── */
                <View style={styles.sectionBlock}>
                  {friendsList.length > 0 ? (
                    <View style={styles.blendFriendsList}>
                      {friendsList.map((friend) => {
                        const savedScore = blendFriendsMap[friend.uid];
                        const existingBlend = findExistingBlend(friend.uid);
                        const friendJoined = Boolean(existingBlend?.collaborators?.[friend.uid]?.role);
                        const requestPending = existingBlend && !friendJoined;
                        return (
                          <TouchableOpacity
                            key={`blend_${friend.uid}`}
                            style={styles.blendFriendCard}
                            onPress={() => handleOpenBlend(friend)}
                            activeOpacity={0.75}
                          >
                            <View style={styles.blendCardAvatarCluster}>
                              <View style={styles.blendAvatarUserWrap}>
                                <UserAvatar
                                  user={{
                                    username: userProfile?.username || "You",
                                    avatar: avatarIcon,
                                    avatarColor: avatarBg,
                                  }}
                                  size={44}
                                  fontSize={15}
                                />
                              </View>
                              <View style={[styles.blendAvatarFriendWrap, { marginLeft: -14 }]}>
                                <UserAvatar user={friend} size={44} fontSize={15} />
                              </View>
                            </View>

                            <View style={styles.blendCardInfo}>
                              <Text style={styles.blendCardTitle} numberOfLines={1}>
                                You & {friend.username}
                              </Text>
                              {requestPending ? (
                                <Text style={styles.blendCardSubtitle} numberOfLines={1}>
                                  Waiting for friend to join
                                </Text>
                              ) : existingBlend && friendJoined ? (
                                <View style={styles.blendCardActiveRow}>
                                  <View style={styles.blendCardActiveDot} />
                                  <Text style={styles.blendCardActiveText} numberOfLines={1}>
                                    {existingBlend.track_count || existingBlend.tracks?.length || 0} songs • Active blend
                                  </Text>
                                </View>
                              ) : (
                                <Text style={styles.blendCardSubtitle} numberOfLines={1}>
                                  {savedScore
                                    ? `${savedScore}% Music Compatibility`
                                    : "Tap to calculate vibe match & playlist"}
                                </Text>
                              )}
                            </View>

                            <View style={styles.blendCardActionWrap}>
                              {requestPending ? (
                                <View style={[styles.blendMatchScoreBadge, { backgroundColor: "rgba(255, 255, 255, 0.08)", borderColor: "rgba(255, 255, 255, 0.15)" }]}>
                                  <Ionicons name="hourglass" size={12} color="#AAAAAA" style={{ marginRight: 3 }} />
                                  <Text style={[styles.blendMatchScoreBadgeText, { color: "#AAAAAA" }]}>Sent</Text>
                                </View>
                              ) : (
                                <View style={styles.blendOpenPillBtn}>
                                  <Text style={styles.blendOpenPillText}>Blend</Text>
                                  <Ionicons name="chevron-forward" size={14} color="#000000" />
                                </View>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    /* Center empty state for Blend */
                    <View style={styles.emptyCenterState}>
                      <Ionicons name="infinite-outline" size={54} color="#444444" style={styles.emptyCenterIcon} />
                      <Text style={styles.emptyCenterTitle}>No friends to blend with</Text>
                      <Text style={styles.emptyCenterSub}>
                        Add friends on Staytup to check your music compatibility and generate shared daily playlists.
                      </Text>
                    </View>
                  )}
                </View>
              ) : activeTab === "requests" ? (
                /* ── REQUESTS TAB (Incoming Requests & Collab Invites) ── */
                <View style={styles.sectionBlock}>
                  {collabInvites && collabInvites.length > 0 && (
                    <View style={{ marginBottom: 20 }}>
                      <Text style={[styles.sectionHeaderTitle, { fontSize: 13, color: "#1DB954", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.6 }]}>
                        Blend & Collab Invites ({collabInvites.length})
                      </Text>
                      <View style={styles.unifiedUserList}>
                        {collabInvites.map((inv) => (
                          <View key={`collab_inv_${inv.inviteId || inv.id}`} style={styles.userRowItem}>
                            <UserAvatar user={{ username: inv.senderName || "Friend", avatar: inv.senderAvatar }} size={46} fontSize={16} />
                            <View style={styles.userInfoWrap}>
                              <Text style={styles.userNameText} numberOfLines={1}>
                                {inv.playlistName || "Collab Playlist"}
                              </Text>
                              <Text style={styles.userHandleSubText} numberOfLines={1}>
                                Invited by @{inv.senderName || "Friend"}{inv.matchPercentage ? ` • ${inv.matchPercentage}% Match` : ""}
                              </Text>
                            </View>
                            <View style={styles.requestActionsRow}>
                              <TouchableOpacity
                                style={styles.acceptBtn}
                                onPress={() => acceptCollabInvite && acceptCollabInvite(inv.collabId || inv.playlistId || inv.id)}
                                activeOpacity={0.8}
                              >
                                <Ionicons name="checkmark" size={14} color="#000000" style={{ marginRight: 4 }} />
                                <Text style={styles.acceptBtnText}>Join</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.declineCloseBtn}
                                onPress={() => declineCollabInvite && declineCollabInvite(inv.collabId || inv.playlistId || inv.id)}
                                activeOpacity={0.8}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <Ionicons name="close" size={18} color="#888888" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {incomingRequests.length > 0 ? (
                    <View>
                      {collabInvites && collabInvites.length > 0 && (
                        <Text style={[styles.sectionHeaderTitle, { fontSize: 13, color: colors.textMuted, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.6 }]}>
                          Friend Requests ({incomingRequests.length})
                        </Text>
                      )}
                      <View style={styles.unifiedUserList}>
                        {incomingRequests.map((req) => (
                          <TouchableOpacity
                            key={`req_${req.uid}`}
                            style={styles.userRowItem}
                            onPress={() => setSelectedUserProfile(req)}
                            activeOpacity={0.7}
                          >
                            <UserAvatar user={req} size={46} fontSize={16} />

                            <View style={styles.userInfoWrap}>
                              <Text style={styles.userNameText} numberOfLines={1}>
                                {req.username}
                              </Text>
                              <Text style={styles.userHandleSubText} numberOfLines={1}>
                                @{req.username}
                              </Text>
                            </View>

                            <View style={styles.requestActionsRow}>
                              <TouchableOpacity
                                style={styles.acceptBtn}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  handleAcceptRequest(req);
                                }}
                                activeOpacity={0.8}
                              >
                                <Ionicons name="checkmark" size={14} color="#000000" style={{ marginRight: 4 }} />
                                <Text style={styles.acceptBtnText}>Accept</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.declineCloseBtn}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  handleDeclineRequest(req.uid);
                                }}
                                activeOpacity={0.8}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                accessibilityLabel="Decline request"
                              >
                                <Ionicons name="close" size={18} color="#888888" />
                              </TouchableOpacity>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ) : (!collabInvites || collabInvites.length === 0) ? (
                    /* Center-oriented empty state with subtle gray icon for requests */
                    <View style={styles.emptyCenterState}>
                      <Ionicons name="mail-unread-outline" size={48} color="#444444" style={styles.emptyCenterIcon} />
                      <Text style={styles.emptyCenterTitle}>No friend requests</Text>
                      <Text style={styles.emptyCenterSub}>You're all caught up.</Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                /* ── COLLAB PLAYLISTS TAB ── */
                <View style={styles.sectionBlock}>
                  {Array.isArray(collabPlaylists) && collabPlaylists.length > 0 ? (
                    <View style={styles.collabCardsList}>
                      {collabPlaylists.map((pl) => {
                        const trackList = Array.isArray(pl.tracks) ? pl.tracks : [];
                        const trackCount = trackList.length || pl.track_count || 0;
                        const collabs = Object.values(pl.collaborators || {});
                        const coverUrl =
                          pl.cover_url ||
                          pl.preview_artwork ||
                          trackList[0]?.artwork_url ||
                          trackList[0]?.thumbnail ||
                          null;
                        const isThisPlaylistPlaying =
                          currentTrack &&
                          trackList.some((t) => (t.videoId || t.video_id) === currentTrack.videoId);

                        return (
                          <TouchableOpacity
                            key={pl.id || pl.collabId}
                            style={styles.collabCard}
                            onPress={() => setSelectedCollabPlaylist(pl)}
                            activeOpacity={0.75}
                          >
                            {/* Playlist Cover */}
                            <View style={styles.collabCoverOuter}>
                              <View style={[
                                styles.collabCardCoverWrap,
                                (pl.isBlend || pl.type === "blend" || String(pl.name || "").startsWith("Blend:") || /^Blend\s*#\d+$/.test(String(pl.name || ""))) && {
                                  borderColor: "#8B5CF6",
                                  borderWidth: 2,
                                }
                              ]}>
                                {coverUrl ? (
                                  <Image source={{ uri: getHighResArtwork(coverUrl) || coverUrl }} style={styles.collabCardCover} resizeMode="cover" />
                                ) : (
                                  <View style={[styles.collabCardCover, styles.collabCoverFallback]}>
                                    <Ionicons name="musical-notes" size={26} color={colors.primary} />
                                  </View>
                                )}
                                {isThisPlaylistPlaying && isPlaying && (
                                  <View style={styles.collabPlayingOverlay}>
                                    <MaterialCommunityIcons name="waveform" size={18} color="#1DB954" />
                                  </View>
                                )}
                              </View>
                              {(pl.isBlend || pl.type === "blend" || String(pl.name || "").startsWith("Blend:") || /^Blend\s*#\d+$/.test(String(pl.name || ""))) && (
                                <View style={styles.blendTagOverlay}>
                                  <Ionicons name="flash" size={9} color="#FFFFFF" />
                                </View>
                              )}
                            </View>

                            {/* Playlist Info */}
                            <View style={styles.collabCardInfo}>
                              <View style={styles.collabCardTitleRow}>
                                <Text style={styles.collabCardTitle} numberOfLines={1}>
                                  {pl.name}
                                </Text>
                              </View>

                              {/* Collaborator Avatars */}
                              <View style={styles.collabAvatarsRowInline}>
                                <View style={styles.overlappingAvatarsInline}>
                                  {collabs.slice(0, 4).map((c, i) => (
                                    <UserAvatar
                                      key={c.uid || i}
                                      user={c}
                                      size={18}
                                      fontSize={8}
                                      style={{
                                        marginLeft: i > 0 ? -6 : 0,
                                        borderWidth: 1,
                                        borderColor: "#121212",
                                      }}
                                    />
                                  ))}
                                  {collabs.length > 4 && (
                                    <View style={[styles.avatarPillSmall, styles.avatarMoreSmall]}>
                                      <Text style={styles.avatarMoreTextSmall}>+{collabs.length - 4}</Text>
                                    </View>
                                  )}
                                </View>
                                <Text style={styles.collabCardMeta} numberOfLines={1}>
                                  {collabs.length} {collabs.length === 1 ? "friend" : "friends"} • {trackCount} {trackCount === 1 ? "song" : "songs"}
                                </Text>
                              </View>
                            </View>

                            {/* Play Button */}
                            <TouchableOpacity
                              style={styles.collabPlayBtn}
                              onPress={(e) => {
                                e.stopPropagation();
                                if (trackList.length > 0) {
                                  const formatted = trackList.map((t) => ({
                                    ...t,
                                    videoId: t.video_id || t.videoId,
                                  }));
                                  playTrack(formatted[0], formatted, 0);
                                }
                              }}
                              activeOpacity={0.8}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons
                                name={isThisPlaylistPlaying && isPlaying ? "pause" : "play"}
                                size={18}
                                color="#000000"
                              />
                            </TouchableOpacity>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    /* Center-oriented empty state for Collab Playlists */
                    <View style={styles.emptyCenterState}>
                      <Ionicons name="people-circle-outline" size={54} color="#444444" style={styles.emptyCenterIcon} />
                      <Text style={styles.emptyCenterTitle}>No collab playlists yet</Text>
                      <Text style={styles.emptyCenterSub}>
                        Create a playlist with friends, add songs together in real time, and share the music.
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
      </View>

      {/* ═══════════ FRIEND PROFILE MODAL (COMPACT BOTTOM SHEET) ═══════════ */}
      <Modal
        visible={!!selectedUserProfile}
        transparent={true}
        animationType="slide"
        onRequestClose={() => { setSelectedUserProfile(null); setShowProfileMenu(false); }}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => { setSelectedUserProfile(null); setShowProfileMenu(false); }}
          />
          <View
            style={styles.profileModalCard}
            onStartShouldSetResponder={() => true}
          >
            {/* Drag Handle */}
            <View style={styles.profileModalTopBar}>
              <View style={styles.profileModalDragHandle} />
            </View>

            {/* Compact Header: Avatar + Name + Online + Menu */}
            <View style={styles.pmHeaderRow}>
              <View style={styles.pmAvatarWrap}>
                <UserAvatar user={selectedUserProfile} size={56} fontSize={20} />
                {isUserFriend(selectedUserProfile) && friendsActivity[selectedUserProfile?.uid]?.isPlaying && (
                  <View style={styles.pmOnlineDot} />
                )}
              </View>
              <View style={styles.pmHeaderInfo}>
                <Text style={styles.pmName} numberOfLines={1}>
                  {formatPersonName(selectedUserProfile?.displayName || selectedUserProfile?.name || selectedUserProfile?.username || "")}
                </Text>
                <Text style={styles.pmStatus} numberOfLines={1}>
                  {isUserFriend(selectedUserProfile) && friendsActivity[selectedUserProfile?.uid]?.isPlaying
                    ? "Listening now"
                    : isUserFriend(selectedUserProfile)
                    ? "Friend"
                    : isUserIncoming(selectedUserProfile)
                    ? "Wants to be your friend"
                    : isUserOutgoing(selectedUserProfile)
                    ? "Request sent"
                    : "Listener"}
                </Text>
              </View>
              {/* ••• Menu */}
              <TouchableOpacity
                style={styles.pmMenuBtn}
                onPress={() => setShowProfileMenu(!showProfileMenu)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="ellipsis-horizontal" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Dropdown Menu */}
            {showProfileMenu && isUserFriend(selectedUserProfile) && (
              <View style={styles.pmDropdown}>
                <TouchableOpacity
                  style={styles.pmDropdownItem}
                  onPress={() => {
                    setShowProfileMenu(false);
                    setSelectedUserProfile(null);
                    setFriendToDelete(selectedUserProfile);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="person-remove-outline" size={15} color="#FF5252" style={{ marginRight: 10 }} />
                  <Text style={[styles.pmDropdownText, { color: "#FF5252" }]}>Remove Friend</Text>
                </TouchableOpacity>
                <View style={styles.pmDropdownDivider} />
                <TouchableOpacity
                  style={styles.pmDropdownItem}
                  onPress={() => setShowProfileMenu(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="volume-mute-outline" size={15} color="#FFFFFF" style={{ marginRight: 10 }} />
                  <Text style={styles.pmDropdownText}>Mute Activity</Text>
                </TouchableOpacity>
                <View style={styles.pmDropdownDivider} />
                <TouchableOpacity
                  style={styles.pmDropdownItem}
                  onPress={() => setShowProfileMenu(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="share-outline" size={15} color="#FFFFFF" style={{ marginRight: 10 }} />
                  <Text style={styles.pmDropdownText}>Share Profile</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Current Listening Card */}
            {friendsActivity[selectedUserProfile?.uid]?.track ? (() => {
              const friendTrack = friendsActivity[selectedUserProfile?.uid]?.track;
              const isFriendPlaying = Boolean(friendsActivity[selectedUserProfile?.uid]?.isPlaying);
              const isThisPlaying =
                currentTrack &&
                friendTrack &&
                (currentTrack.videoId === friendTrack.videoId ||
                  currentTrack.id === friendTrack.id ||
                  currentTrack.videoId === friendTrack.video_id);
              const isThisPlayingNow = isThisPlaying && isPlaying;
              const artworkUrl =
                friendTrack.artwork_url ||
                friendTrack.cover_url ||
                friendTrack.thumbnail ||
                null;

              return (
                <View style={styles.pmNowPlaying}>
                  <View style={styles.pmNowPlayingHeader}>
                    <Text style={styles.pmNowPlayingLabel}>NOW PLAYING</Text>
                    {isFriendPlaying && (
                      <View style={styles.pmLivePill}>
                        <View style={styles.pmLiveDot} />
                        <Text style={styles.pmLiveText}>LIVE</Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.pmTrackRow}
                    onPress={() => {
                      if (isThisPlaying) {
                        if (typeof togglePlayPause === "function") togglePlayPause();
                      } else {
                        handleListenAlong(friendTrack);
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.pmTrackArtwork}>
                      {artworkUrl ? (
                        <Image source={{ uri: getHighResArtwork(artworkUrl) || artworkUrl }} style={styles.pmTrackArtworkImg} resizeMode="cover" />
                      ) : (
                        <View style={styles.pmTrackArtworkFallback}>
                          <Ionicons name="musical-notes" size={18} color="#555555" />
                        </View>
                      )}
                      {isThisPlayingNow && (
                        <View style={styles.pmArtworkScrim}>
                          <MaterialCommunityIcons name="waveform" size={14} color="#1DB954" />
                        </View>
                      )}
                    </View>
                    <View style={styles.pmTrackInfo}>
                      <Text style={styles.pmTrackTitle} numberOfLines={1}>{friendTrack.title}</Text>
                      <Text style={styles.pmTrackArtist} numberOfLines={1}>{friendTrack.artist || "Unknown Artist"}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.pmPlayBtn, isThisPlayingNow && styles.pmPlayBtnActive]}
                      onPress={() => {
                        if (isThisPlaying) {
                          if (typeof togglePlayPause === "function") togglePlayPause();
                        } else {
                          handleListenAlong(friendTrack);
                        }
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={isThisPlayingNow ? "pause" : "play"}
                        size={16}
                        color="#000000"
                        style={!isThisPlayingNow ? { marginLeft: 2 } : {}}
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>
                </View>
              );
            })() : null}

            {/* Music Connection Stats */}
            {isUserFriend(selectedUserProfile) && (
              <View style={styles.pmConnectionSection}>
                <Text style={styles.pmConnectionTitle}>YOUR MUSIC CONNECTION</Text>
                <View style={styles.pmStatsRow}>
                  <View style={styles.pmStatItem}>
                    <Text style={styles.pmStatValue}>76%</Text>
                    <Text style={styles.pmStatLabel}>Taste Match</Text>
                  </View>
                  <View style={styles.pmStatDivider} />
                  <View style={styles.pmStatItem}>
                    <Text style={styles.pmStatValue}>42</Text>
                    <Text style={styles.pmStatLabel}>Shared Songs</Text>
                  </View>
                  <View style={styles.pmStatDivider} />
                  <View style={styles.pmStatItem}>
                    <Text style={styles.pmStatValue}>18</Text>
                    <Text style={styles.pmStatLabel}>Shared Artists</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Bottom Actions */}
            <View style={styles.pmActions}>
              {isUserFriend(selectedUserProfile) ? (
                <TouchableOpacity
                  style={styles.pmCloseBtn}
                  onPress={() => { setSelectedUserProfile(null); setShowProfileMenu(false); }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.pmCloseBtnText}>Close</Text>
                </TouchableOpacity>
              ) : isUserIncoming(selectedUserProfile) ? (
                <View style={{ width: "100%", gap: 8 }}>
                  <TouchableOpacity
                    style={styles.pmAcceptBtn}
                    onPress={() => {
                      handleAcceptRequest(selectedUserProfile);
                      setSelectedUserProfile(null);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="checkmark" size={15} color="#000000" style={{ marginRight: 5 }} />
                    <Text style={styles.pmAcceptBtnText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.pmCloseBtn}
                    onPress={() => setSelectedUserProfile(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.pmCloseBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              ) : isUserOutgoing(selectedUserProfile) ? (
                <View style={{ width: "100%", gap: 8, alignItems: "center" }}>
                  <View style={styles.pmPendingBadge}>
                    <Text style={styles.pmPendingText}>Request Pending</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.pmCloseBtn, { width: "100%" }]}
                    onPress={() => setSelectedUserProfile(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.pmCloseBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ width: "100%", gap: 8, flexDirection: "row" }}>
                  <TouchableOpacity
                    style={styles.pmCloseBtn}
                    onPress={() => setSelectedUserProfile(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.pmCloseBtnText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pmAcceptBtn, { flex: 1 }]}
                    onPress={() => {
                      handleSendFriendDirect(selectedUserProfile);
                      setSelectedUserProfile(null);
                    }}
                    disabled={isSending}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="person-add" size={15} color="#000000" style={{ marginRight: 5 }} />
                    <Text style={styles.pmAcceptBtnText}>Add Friend</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══════════ DELETE FRIEND CONFIRMATION MODAL ═══════════ */}
      <Modal
        visible={!!friendToDelete}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setFriendToDelete(null)}
      >
        <View style={styles.deleteModalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setFriendToDelete(null)}
          />
          <View
            style={styles.deleteModalContent}
            onStartShouldSetResponder={() => true}
          >
            {/* Drag Handle */}
            <View style={styles.dragHandle} />

            {/* Friend Avatar */}
            <View style={styles.deleteAvatarWrap}>
              <UserAvatar user={friendToDelete} size={64} fontSize={22} />
            </View>

            {/* Title & Warning */}
            <Text style={styles.deleteModalTitle}>
              Remove {friendToDelete?.username}?
            </Text>
            <Text style={styles.deleteModalSub}>
              Are you sure you want to remove {friendToDelete?.username} from your friends? You will no longer see their music activity.
            </Text>

            {/* Actions */}
            <View style={styles.deleteModalActions}>
              <TouchableOpacity
                style={styles.deleteModalConfirmBtn}
                onPress={handleConfirmDeleteFriend}
                disabled={isDeleting}
                activeOpacity={0.8}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.deleteModalConfirmBtnText}>Remove Friend</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteModalCancelBtn}
                onPress={() => setFriendToDelete(null)}
                disabled={isDeleting}
                activeOpacity={0.8}
              >
                <Text style={styles.deleteModalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Collaborative Playlist Details Modal */}
      {selectedCollabPlaylist && (
        <PlaylistModal
          visible={!!selectedCollabPlaylist}
          playlist={selectedCollabPlaylist}
          onClose={() => setSelectedCollabPlaylist(null)}
          onPlaylistUpdated={(updated) => setSelectedCollabPlaylist(updated)}
        />
      )}

      {/* Create Collab Playlist Modal */}
      <CreatePlaylistModal
        visible={showCollabCreateModal}
        initialTab={collabModalTab}
        onClose={() => setShowCollabCreateModal(false)}
        onSubmit={async (name, coverUrl = "") => {
          if (!createCollabPlaylist) return;
          const res = await createCollabPlaylist({
            name,
            description: "",
            tracks: [],
            cover_url: typeof coverUrl === "string" ? coverUrl : "",
          });
          if (res && res.success && res.playlist) {
            setSelectedCollabPlaylist(res.playlist);
          }
        }}
        existingPlaylists={collabPlaylists || []}
      />

      {/* ═══════════ BLEND RADAR MODAL ═══════════ */}
      <Modal
        visible={showBlendModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowBlendModal(false);
          setSelectedBlendFriend(null);
          setBlendResult(null);
          setBlendRequestSent(false);
        }}
      >
        <View style={styles.blendModalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => {
              setShowBlendModal(false);
              setSelectedBlendFriend(null);
              setBlendResult(null);
              setBlendRequestSent(false);
            }}
          />
          <View style={styles.blendModalSheet} onStartShouldSetResponder={() => true}>
            {/* Header bar */}
            <View style={styles.blendModalHeaderBar}>
              <View style={styles.dragHandle} />
              <TouchableOpacity
                style={styles.blendModalCloseBtn}
                onPress={() => {
                  setShowBlendModal(false);
                  setSelectedBlendFriend(null);
                  setBlendResult(null);
                  setBlendRequestSent(false);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {isLoadingBlend ? (
              <View style={styles.blendLoadingContainer}>
                <ActivityIndicator size="large" color="#1DB954" />
                <Text style={styles.blendLoadingTitle}>Calculating Vibe Match...</Text>
                <Text style={styles.blendLoadingSub}>
                  Cross-referencing your listening history, favorite artists, and top tracks with {selectedBlendFriend?.username}...
                </Text>
              </View>
            ) : blendResult ? (
              <ScrollView
                style={styles.blendModalScroll}
                contentContainerStyle={styles.blendModalScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {/* Hero Radar Compatibility Badge */}
                <View style={styles.blendHeroSection}>
                  <View style={styles.blendHeroAvatarPair}>
                    <View style={styles.blendHeroAvatarLeft}>
                      <UserAvatar
                        user={{
                          username: userProfile?.username || "You",
                          avatar: avatarIcon,
                          avatarColor: avatarBg,
                        }}
                        size={64}
                        fontSize={22}
                      />
                    </View>
                    <View style={styles.blendHeroCenterBadge}>
                      <Ionicons name="flash" size={16} color="#1DB954" />
                    </View>
                    <View style={styles.blendHeroAvatarRight}>
                      <UserAvatar user={selectedBlendFriend} size={64} fontSize={22} />
                    </View>
                  </View>

                  {/* Big Match Score */}
                  <View style={styles.blendScoreGaugeWrap}>
                    <Text style={styles.blendScoreNumber}>{blendResult.matchPercentage}%</Text>
                    <Text style={styles.blendScoreLabel}>MUSIC VIBE MATCH</Text>
                  </View>

                  <Text style={styles.blendMatchDescription}>
                    You and {selectedBlendFriend?.username} are in sync! Sharing {blendResult.topVibe || "music styles"}.
                  </Text>

                  {blendSuccessMsg ? (
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 16, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: "rgba(29, 185, 84, 0.12)", borderRadius: 20, alignSelf: "center" }}>
                      <Ionicons name="checkmark-circle" size={15} color="#1DB954" style={{ marginRight: 6 }} />
                      <Text style={{ color: "#1DB954", fontFamily: fonts.medium, fontSize: 13 }}>
                        {blendSuccessMsg}
                      </Text>
                    </View>
                  ) : null}

                  {/* Actions Row */}
                  {(() => {
                    const friendUid = selectedBlendFriend?.uid;
                    const friendJoined = Boolean(activeBlend?.collaborators?.[friendUid]?.role);
                    const requestPending = blendRequestSent || (activeBlend && !friendJoined);

                    if (friendJoined) {
                      // Active blend - both users joined
                      return (
                        <View style={styles.blendActionButtonsRow}>
                          {blendResult.tracks?.length > 0 && (
                            <TouchableOpacity
                              style={styles.blendPlayAllBtn}
                              onPress={() => {
                                const formatted = blendResult.tracks.map((t) => ({
                                  ...t,
                                  videoId: t.videoId || t.video_id,
                                }));
                                playTrack(formatted[0], formatted, 0);
                              }}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="play" size={18} color="#000000" style={{ marginRight: 6 }} />
                              <Text style={styles.blendPlayAllBtnText}>Play Blend</Text>
                            </TouchableOpacity>
                          )}

                          <TouchableOpacity
                            style={styles.blendShareBtn}
                            onPress={handleShareBlend}
                            activeOpacity={0.8}
                          >
                            <Ionicons
                              name={copiedBlendShare ? "checkmark" : "share-social"}
                              size={16}
                              color="#FFFFFF"
                              style={{ marginRight: 6 }}
                            />
                            <Text style={styles.blendShareBtnText}>
                              {copiedBlendShare ? "Copied!" : "Share Match"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    }

                    if (requestPending) {
                      // Request sent, waiting for friend to join
                      return (
                        <View style={styles.blendActionButtonsRow}>
                          <TouchableOpacity
                            style={[styles.blendCreatePlaylistBtn, { opacity: 0.6 }]}
                            disabled={true}
                            activeOpacity={1}
                          >
                            <Ionicons name="hourglass" size={18} color="#000000" style={{ marginRight: 8 }} />
                            <Text style={styles.blendCreatePlaylistBtnText}>Request Sent</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    }

                    // No request yet - show send button
                    return (
                      <View style={styles.blendActionButtonsRow}>
                        <TouchableOpacity
                          style={styles.blendCreatePlaylistBtn}
                          onPress={handleCreateBlend}
                          disabled={isCreatingBlend}
                          activeOpacity={0.8}
                        >
                          {isCreatingBlend ? (
                            <ActivityIndicator size="small" color="#000000" />
                          ) : (
                            <>
                              <Ionicons name="send" size={17} color="#000000" style={{ marginRight: 8 }} />
                              <Text style={styles.blendCreatePlaylistBtnText}>Send Blend Request</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  })()}
                </View>

                {/* Shared Blend Playlist Tracks */}
                <View style={styles.blendTracksSection}>
                  <View style={styles.blendTracksSectionHeader}>
                    <View>
                      <Text style={styles.blendTracksTitle}>Shared Blend Playlist</Text>
                      <Text style={styles.blendTracksSubtitle}>
                        Auto-curated daily mix alternating both of your favorite songs
                      </Text>
                    </View>
                    <View style={styles.blendTrackCountBadge}>
                      <Text style={styles.blendTrackCountText}>
                        {blendResult.tracks?.length || 0} songs
                      </Text>
                    </View>
                  </View>

                  {blendResult.tracks && blendResult.tracks.length > 0 ? (
                    blendResult.tracks.map((track, idx) => {
                      const isCurrentThis =
                        currentTrack &&
                        (currentTrack.videoId === (track.videoId || track.video_id) ||
                          currentTrack.id === (track.videoId || track.video_id));
                      const isThisPlaying = isCurrentThis && isPlaying;
                      const artwork = track.artwork_url || track.thumbnail || null;

                      return (
                        <TouchableOpacity
                          key={track.videoId || track.video_id || idx}
                          style={[styles.blendTrackItem, isCurrentThis && styles.blendTrackItemActive]}
                          onPress={() => {
                            const formatted = blendResult.tracks.map((t) => ({
                              ...t,
                              videoId: t.videoId || t.video_id,
                            }));
                            playTrack(formatted[idx], formatted, idx);
                          }}
                          activeOpacity={0.7}
                        >
                            <View style={styles.blendTrackCoverWrap}>
                            {artwork ? (
                              <Image source={{ uri: getHighResArtwork(artwork) || artwork }} style={styles.blendTrackCover} resizeMode="cover" />
                            ) : (
                              <View style={[styles.blendTrackCover, styles.blendTrackCoverFallback]}>
                                <Ionicons name="musical-note" size={16} color="#1DB954" />
                              </View>
                            )}
                            {isThisPlaying && (
                              <View style={styles.blendTrackPlayingOverlay}>
                                <MaterialCommunityIcons name="waveform" size={14} color="#1DB954" />
                              </View>
                            )}
                          </View>

                          <View style={styles.blendTrackDetails}>
                            <Text
                              style={[styles.blendTrackTitle, isCurrentThis && styles.blendTrackTitleActive]}
                              numberOfLines={1}
                            >
                              {track.title}
                            </Text>
                            <View style={styles.blendTrackMetaRow}>
                              <Text style={styles.blendTrackArtist} numberOfLines={1}>
                                {track.artist || "Unknown Artist"}
                              </Text>
                              <View style={styles.blendTrackSourcePill}>
                                <Text style={styles.blendTrackSourceText}>
                                  {track.blendSource === "both"
                                    ? "Shared Favorite"
                                    : `Via ${track.blendSource}`}
                                </Text>
                              </View>
                            </View>
                          </View>

                          <TouchableOpacity
                            style={styles.blendTrackPlayBtn}
                            onPress={() => {
                              if (isCurrentThis) {
                                togglePlayPause && togglePlayPause();
                              } else {
                                const formatted = blendResult.tracks.map((t) => ({
                                  ...t,
                                  videoId: t.videoId || t.video_id,
                                }));
                                playTrack(formatted[idx], formatted, idx);
                              }
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons
                              name={isThisPlaying ? "pause" : "play"}
                              size={16}
                              color={isCurrentThis ? "#1DB954" : "#FFFFFF"}
                            />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      );
                    })
                  ) : (
                    <View style={styles.blendNoTracksWrap}>
                      <Text style={styles.blendNoTracksText}>
                        Listen to more songs to expand your shared Blend tracklist!
                      </Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "web" ? 12 : 14,
    paddingBottom: 8,
    backgroundColor: "#000000",
  },
  headerInner: {
    width: "100%",
  },
  desktopHeaderInner: {
    width: "100%",
    paddingHorizontal: 16,
  },
  profileRow: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  profileRowHidden: {
    height: 0,
    opacity: 0,
    marginBottom: 0,
    pointerEvents: "none",
  },
  profileName: {
    fontFamily: fonts.bold,
    fontSize: 26,
    color: "#FFFFFF",
    letterSpacing: -0.4,
  },
  headerRightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerCircleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  avatarContainer: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    fontFamily: fonts.bold,
    fontWeight: "700",
    fontSize: 14,
    color: "#000000",
    textAlign: "center",
    includeFontPadding: false,
  },

  // Pill Search Bar
  topSearchWrapper: {
    width: "100%",
    height: 38,
    justifyContent: "center",
    ...(Platform.OS === "web"
      ? {
          transition: "all 0.25s cubic-bezier(0.2, 0, 0, 1)",
        }
      : {}),
  },
  topSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    height: 38,
  },
  topSearchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161616",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    paddingHorizontal: 12,
    height: 34,
  },
  topSearchBarActive: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#1c1c1c",
  },
  searchIcon: {
    marginRight: 8,
  },
  topSearchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontFamily: fonts.medium,
    fontSize: 13.5,
    height: "100%",
    padding: 0,
    margin: 0,
    minWidth: 0,
    ...(Platform.OS === "web"
      ? {
          outlineStyle: "none",
          borderWidth: 0,
        }
      : {}),
  },
  searchClearBtn: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    marginRight: 2,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  clearCircleBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#8E8E93",
    alignItems: "center",
    justifyContent: "center",
  },
  clearIconGlyph: {
    marginTop: Platform.OS === "android" ? -1 : 0,
  },
  cancelCircleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
    flexShrink: 0,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },

  // Friends Tabs (Matching LibraryScreen exactly)
  friendsInner: {
    flex: 1,
    width: "100%",
    userSelect: "none",
  },
  desktopFriendsInner: {
    width: "100%",
    paddingHorizontal: 16,
  },
  tabsRowContainer: {
    flexGrow: 0,
    flexShrink: 0,
    height: 50,
    maxHeight: 50,
  },
  tabsRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: "center",
    gap: 8,
  },
  tabButton: {
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    flexShrink: 0,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  activeTabButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#FFFFFF",
  },
  activeTabText: {
    fontFamily: fonts.bold,
    color: "#000000",
  },
  tabPillLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tabPillBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  tabPillBadgeActive: {
    backgroundColor: "rgba(0, 0, 0, 0.25)",
  },
  tabPillBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: "#FFFFFF",
  },
  tabPillBadgeTextActive: {
    color: "#000000",
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 8,
    paddingBottom: 110,
    paddingHorizontal: 16,
  },

  // Status message
  statusMsgWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#161616",
    borderWidth: 1,
  },
  statusMsgSuccess: {
    borderColor: "rgba(29, 185, 84, 0.35)",
    backgroundColor: "rgba(29, 185, 84, 0.08)",
  },
  statusMsgError: {
    borderColor: "rgba(255, 82, 82, 0.35)",
    backgroundColor: "rgba(255, 82, 82, 0.08)",
  },
  statusMsgText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    flex: 1,
  },

  // Section Blocks
  sectionBlock: {
    marginBottom: 26,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  sectionHeaderTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  countPill: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  countPillText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: "#FFFFFF",
  },

  // User List & Rows
  unifiedUserList: {
    gap: 2,
    width: "100%",
  },
  userRowItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    width: "100%",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  avatarWrapper: {
    position: "relative",
  },
  statusDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#000000",
  },
  statusDotLive: {
    backgroundColor: "#1DB954",
  },
  statusDotOffline: {
    backgroundColor: "#555555",
  },

  userInfoWrap: {
    flex: 1,
    marginLeft: 12,
    justifyContent: "center",
  },
  userNameText: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: "#FFFFFF",
  },
  userHandleSubText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: "#888888",
    marginTop: 2,
  },
  requestSubText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: "#888888",
    marginTop: 2,
  },

  liveTrackRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  liveTrackTitle: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#1DB954",
    maxWidth: 180,
  },
  liveTrackArtist: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "#999999",
    maxWidth: 140,
  },
  liveTrackText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#1DB954",
    flex: 1,
  },

  // Actions
  userActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addUserBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 16,
  },
  addUserBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: "#000000",
  },
  acceptBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 16,
  },
  acceptBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: "#000000",
  },
  requestActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  declineCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  dismissCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  listenAlongBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    gap: 4,
  },
  listenAlongBtnActive: {
    backgroundColor: "#169c46",
  },
  listenAlongText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: "#000000",
  },
  statusBadgeFriend: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(29, 185, 84, 0.12)",
  },
  statusBadgeFriendText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: "#1DB954",
  },
  statusBadgePending: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  statusBadgePendingText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: "#888888",
  },

  // Clean Center-Oriented Empty State with gray icon (No card, no borders, no shadow)
  emptyCenterState: {
    paddingVertical: 56,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  emptyCenterIcon: {
    marginBottom: 14,
    opacity: 0.8,
  },
  emptyCenterTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: "#FFFFFF",
    letterSpacing: -0.3,
    textAlign: "center",
    marginBottom: 8,
  },
  emptyCenterSub: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: "#888888",
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 320,
  },

  // ═══════════ FRIEND PROFILE MODAL STYLES (COMPACT) ═══════════
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  profileModalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#161616",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: Platform.OS === "web" ? 1 : 0,
    borderRightWidth: Platform.OS === "web" ? 1 : 0,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === "web" ? 24 : 36,
    alignItems: "center",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.6)" }
      : {}),
  },
  profileModalTopBar: {
    width: "100%",
    alignItems: "center",
    height: 24,
    justifyContent: "center",
  },
  profileModalDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
  },

  // Compact Header
  pmHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingVertical: 10,
    gap: 12,
  },
  pmAvatarWrap: {
    position: "relative",
    flexShrink: 0,
  },
  pmOnlineDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#1DB954",
    borderWidth: 2.5,
    borderColor: "#161616",
  },
  pmHeaderInfo: {
    flex: 1,
  },
  pmName: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  pmStatus: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: "#1DB954",
    marginTop: 1,
  },
  pmMenuBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },

  // Dropdown Menu
  pmDropdown: {
    width: "100%",
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 10,
    overflow: "hidden",
  },
  pmDropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 14,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  pmDropdownText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#FFFFFF",
  },
  pmDropdownDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginLeft: 14,
  },

  // Now Playing Card
  pmNowPlaying: {
    width: "100%",
    marginBottom: 12,
  },
  pmNowPlayingHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  pmNowPlayingLabel: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: "#1DB954",
    letterSpacing: 0.8,
  },
  pmLivePill: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(29, 185, 84, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  pmLiveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#1DB954",
  },
  pmLiveText: {
    fontFamily: fonts.bold,
    fontSize: 8,
    color: "#1DB954",
    letterSpacing: 0.4,
  },
  pmTrackRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    padding: 8,
    gap: 10,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  pmTrackArtwork: {
    width: 48,
    height: 48,
    borderRadius: 6,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#202020",
    flexShrink: 0,
  },
  pmTrackArtworkImg: {
    width: "100%",
    height: "100%",
  },
  pmTrackArtworkFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  pmArtworkScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  pmTrackInfo: {
    flex: 1,
  },
  pmTrackTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  pmTrackArtist: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "#999999",
    marginTop: 1,
  },
  pmPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1DB954",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  pmPlayBtnActive: {
    backgroundColor: "#FFFFFF",
  },

  // Music Connection
  pmConnectionSection: {
    width: "100%",
    marginBottom: 14,
  },
  pmConnectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 0.8,
    marginBottom: 10,
    textAlign: "center",
  },
  pmStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  pmStatItem: {
    alignItems: "center",
    flex: 1,
  },
  pmStatValue: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: "#FFFFFF",
  },
  pmStatLabel: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: "rgba(255,255,255,0.45)",
    marginTop: 2,
  },
  pmStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  // Bottom Actions
  pmActions: {
    width: "100%",
    alignItems: "center",
  },
  pmCloseBtn: {
    width: "100%",
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  pmCloseBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: "#FFFFFF",
  },
  pmAcceptBtn: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1DB954",
    borderRadius: 20,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  pmAcceptBtnText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: "#000000",
  },
  pmPendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  pmPendingText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: "#888888",
  },

  // ═══════════ DELETE FRIEND CONFIRMATION MODAL ═══════════
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  deleteModalContent: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#161616",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === "web" ? 32 : 44,
    alignItems: "center",
    borderTopWidth: 1,
    borderLeftWidth: Platform.OS === "web" ? 1 : 0,
    borderRightWidth: Platform.OS === "web" ? 1 : 0,
    borderColor: "rgba(255,255,255,0.12)",
  },
  dragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginBottom: 20,
  },
  deleteAvatarWrap: {
    marginBottom: 14,
  },
  deleteModalTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
  },
  deleteModalSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 340,
    marginBottom: 24,
  },
  deleteModalActions: {
    width: "100%",
    gap: 10,
  },
  deleteModalConfirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E53935",
    height: 46,
    borderRadius: 23,
    width: "100%",
  },
  deleteModalConfirmBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  deleteModalCancelBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    height: 46,
    borderRadius: 23,
    width: "100%",
  },
  deleteModalCancelBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
  },

  // ─── Collab Playlists Tab Styles ───
  collabHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  collabHeaderTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: "#FFFFFF",
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  collabHeaderSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  newCollabBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  newCollabBtnText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: "#000000",
  },
  collabCardsList: {
    gap: 4,
  },
  collabCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 0,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  collabCardCoverWrap: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#202020",
    flexShrink: 0,
  },
  collabCoverOuter: {
    position: "relative",
    width: 60,
    height: 60,
    flexShrink: 0,
  },
  collabCardCover: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
  },
  collabCoverFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1e1e1e",
    width: "100%",
    height: "100%",
    borderRadius: 8,
  },
  collabPlayingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  blendTagOverlay: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#141414",
    zIndex: 10,
  },
  collabCardInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 10,
    justifyContent: "center",
  },
  collabCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    flexWrap: "wrap",
    gap: 6,
  },
  collabCardTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  collabGreenBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(29, 185, 84, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  collabGreenBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: "#1DB954",
  },
  collabAvatarsRowInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  overlappingAvatarsInline: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarPillSmall: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#141414",
  },
  avatarPillInitialSmall: {
    fontFamily: fonts.bold,
    fontWeight: "700",
    fontSize: 9,
    color: "#000000",
    textAlign: "center",
    includeFontPadding: false,
  },
  avatarMoreSmall: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  avatarMoreTextSmall: {
    fontFamily: fonts.bold,
    fontSize: 8,
    color: "#FFFFFF",
  },
  collabCardMeta: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textMuted,
    flexShrink: 1,
  },
  collabPlayBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  startCollabBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 18,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  startCollabBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
  },

  // ─── Blend Radar Styles ───
  blendIntroBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(29, 185, 84, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.2)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    gap: 14,
  },
  blendIntroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(29, 185, 84, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  blendIntroTextWrap: {
    flex: 1,
  },
  blendIntroTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  blendIntroSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  blendFriendsList: {
    gap: 4,
  },
  blendFriendCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: 0,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  blendCardAvatarCluster: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 12,
  },
  blendAvatarUserWrap: {
    borderWidth: 2,
    borderColor: "#000000",
    borderRadius: 24,
    zIndex: 1,
  },
  blendAvatarFriendWrap: {
    borderWidth: 2,
    borderColor: "#000000",
    borderRadius: 24,
    zIndex: 2,
  },
  blendCardInfo: {
    flex: 1,
    marginRight: 10,
  },
  blendCardTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: "#FFFFFF",
    marginBottom: 3,
  },
  blendCardSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  blendCardActiveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  blendCardActiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1DB954",
  },
  blendCardActiveText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: "#1DB954",
  },
  blendCardActionWrap: {
    flexShrink: 0,
  },
  blendMatchScoreBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(29, 185, 84, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.3)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  blendMatchScoreBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: "#1DB954",
  },
  blendOpenPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 3,
  },
  blendOpenPillText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: "#000000",
  },

  // ─── Blend Modal Styles ───
  blendModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
  },
  blendModalSheet: {
    backgroundColor: "#121212",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    minHeight: 450,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  blendModalHeaderBar: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
    position: "relative",
  },
  blendModalCloseBtn: {
    position: "absolute",
    right: 18,
    top: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  blendLoadingContainer: {
    paddingVertical: 60,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  blendLoadingTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: "#FFFFFF",
    marginTop: 18,
    marginBottom: 6,
  },
  blendLoadingSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 300,
  },
  blendModalScroll: {
    flex: 1,
  },
  blendModalScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  blendHeroSection: {
    alignItems: "center",
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    marginBottom: 16,
  },
  blendHeroAvatarPair: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  blendHeroAvatarLeft: {
    borderWidth: 3,
    borderColor: "#000000",
    borderRadius: 36,
    zIndex: 1,
  },
  blendHeroCenterBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(29, 185, 84, 0.2)",
    borderWidth: 2,
    borderColor: "#1DB954",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: -8,
    zIndex: 3,
  },
  blendHeroAvatarRight: {
    borderWidth: 3,
    borderColor: "#000000",
    borderRadius: 36,
    zIndex: 2,
  },
  blendScoreGaugeWrap: {
    alignItems: "center",
    marginBottom: 8,
  },
  blendScoreNumber: {
    fontFamily: fonts.bold || "Poppins_700Bold",
    fontSize: 48,
    color: "#1DB954",
    letterSpacing: -1.5,
  },
  blendScoreLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginTop: -4,
  },
  blendMatchDescription: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: "#E0E0E0",
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
    marginBottom: 20,
  },
  blendActionButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  blendPlayAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  blendPlayAllBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
  },
  blendShareBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  blendShareBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  blendCreatePlaylistBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1DB954",
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 20,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  blendCreatePlaylistBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
  },
  blendTracksSection: {
    paddingTop: 8,
  },
  blendTracksSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  blendTracksTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  blendTracksSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  blendTrackCountBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  blendTrackCountText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.textMuted,
  },
  blendTrackItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "transparent",
    marginBottom: 4,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  blendTrackItemActive: {
    backgroundColor: "rgba(29, 185, 84, 0.08)",
  },
  blendTrackCoverWrap: {
    width: 44,
    height: 44,
    borderRadius: 6,
    overflow: "hidden",
    position: "relative",
    marginRight: 12,
    backgroundColor: "#1e1e1e",
  },
  blendTrackCover: {
    width: "100%",
    height: "100%",
  },
  blendTrackCoverFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  blendTrackPlayingOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  blendTrackDetails: {
    flex: 1,
    marginRight: 10,
  },
  blendTrackTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
    marginBottom: 3,
  },
  blendTrackTitleActive: {
    color: "#1DB954",
  },
  blendTrackMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  blendTrackArtist: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    maxWidth: 150,
  },
  blendTrackSourcePill: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  blendTrackSourceText: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: "#AAAAAA",
  },
  blendTrackPlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  blendNoTracksWrap: {
    paddingVertical: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  blendNoTracksText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
  },

  // Skeleton Styles
  skeletonWrap: {
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  skeletonLine: {
    height: 13,
    borderRadius: 4,
    backgroundColor: "#1A1A1A",
  },
  skeletonCircle: {
    borderRadius: 23,
    backgroundColor: "#1A1A1A",
  },
  skeletonPill: {
    height: 30,
    borderRadius: 15,
    backgroundColor: "#1A1A1A",
  },
  skeletonSquare: {
    borderRadius: 8,
    backgroundColor: "#1A1A1A",
  },
  skeletonDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#1A1A1A",
    position: "absolute",
    bottom: 0,
    right: 0,
  },
  skeletonUserRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  skeletonAvatarWrap: {
    position: "relative",
  },
  skeletonUserInfo: {
    flex: 1,
  },
  skeletonActionBtns: {
    flexDirection: "row",
    alignItems: "center",
  },
  skeletonRequestBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  skeletonBlendRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  skeletonBlendAvatars: {
    flexDirection: "row",
    marginRight: 12,
  },
  skeletonBlendInfo: {
    flex: 1,
  },
  skeletonCollabRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  skeletonCollabCoverWrap: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: "hidden",
    flexShrink: 0,
  },
  skeletonCollabInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 10,
  },
  skeletonCollabBadges: {
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
  },
});
