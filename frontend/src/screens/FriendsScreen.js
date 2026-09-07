import React, { useState, useEffect, useMemo, useCallback } from "react";
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
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { useResponsive } from "../context/ResponsiveContext";
import { useUser } from "../context/UserContext";
import { useAudio } from "../context/AudioContext";
import {
  subscribeFriendActivity,
  getUserData,
  getUserStreamCount,
  getLikedSongs,
} from "../services/firebase";

/**
 * Robust UserAvatar component with image error fallback to initial
 */
function UserAvatar({ user, size = 44, fontSize = 15 }) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [user?.avatar, user?.photoURL, user?.avatarUrl]);

  const avatarUri =
    !imgError &&
    ((user?.avatar && typeof user.avatar === "string" && user.avatar.startsWith("http"))
      ? user.avatar
      : (user?.photoURL && typeof user.photoURL === "string" && user.photoURL.startsWith("http"))
      ? user.photoURL
      : (user?.avatarUrl && typeof user.avatarUrl === "string" && user.avatarUrl.startsWith("http"))
      ? user.avatarUrl
      : null);

  const iconName =
    user?.avatar &&
    user.avatar !== "initial" &&
    typeof user.avatar === "string" &&
    !user.avatar.startsWith("http")
      ? user.avatar
      : null;

  const initial = (user?.username?.[0] || user?.displayName?.[0] || "U").toUpperCase();
  const bgColor = user?.avatarColor || colors.primary;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bgColor,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {avatarUri ? (
        <Image
          source={{ uri: avatarUri }}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      ) : iconName ? (
        <Ionicons name={iconName} size={Math.round(size * 0.44)} color="#000000" />
      ) : (
        <Text style={{ fontFamily: fonts.bold, fontSize, color: "#000000" }}>{initial}</Text>
      )}
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
  } = useUser() || {};

  const { playTrack, currentTrack, isPlaying, togglePlayPause } = useAudio();

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendFeedback, setSendFeedback] = useState({ text: "", isError: false });
  const [friendToDelete, setFriendToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Dismissed suggested users in this session
  const [dismissedUids, setDismissedUids] = useState(new Set());

  // Discoverable users & global search results
  const [discoverUsers, setDiscoverUsers] = useState([]);
  const [isLoadingDiscover, setIsLoadingDiscover] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);

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

  const userInitial = (userProfile?.username?.[0] || currentUser?.displayName?.[0] || "U").toUpperCase();
  const avatarIcon = userProfile?.avatar && userProfile.avatar !== "initial" ? userProfile.avatar : null;
  const avatarBg = userProfile?.avatarColor || colors.primary;

  const incomingRequests = friendRequests?.incoming || [];
  const outgoingRequests = friendRequests?.outgoing || [];
  const friendsList = friends || [];

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
    }, 220);
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

    // 2. Matching global users
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
      {/* Top Header with lifting search bar */}
      <View style={styles.screenHeader}>
        <View style={[styles.innerContent, (isDesktop || isTablet) && styles.desktopInnerContent]}>
          <View style={[styles.headerTopRow, isSearchActive && styles.headerTopRowHidden]}>
            <View>
              <Text style={styles.screenTitle}>Friends</Text>
            </View>

            <TouchableOpacity
              style={[styles.profileAvatar, { backgroundColor: avatarBg }]}
              onPress={() => openProfile && openProfile()}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {avatarIcon && avatarIcon.startsWith("http") ? (
                <Image
                  source={{ uri: avatarIcon }}
                  style={styles.profileAvatarImage}
                  resizeMode="cover"
                />
              ) : avatarIcon ? (
                <Ionicons name={avatarIcon} size={16} color="#000000" />
              ) : (
                <Text style={styles.profileAvatarText}>{userInitial}</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Single Rounded Pill Search Bar */}
          <View style={styles.topSearchWrapper}>
            <View style={styles.topSearchRow}>
              <View style={[styles.topSearchBar, isSearchActive && styles.topSearchBarActive]}>
                <Ionicons name="search" size={19} color={colors.textMuted} style={styles.searchIcon} />
                <TextInput
                  style={styles.topSearchInput}
                  placeholder="Search friends or find users..."
                  placeholderTextColor="#777777"
                  value={searchQuery}
                  onChangeText={(text) => {
                    setSearchQuery(text);
                    if (text.length > 0 && !isSearchActive) {
                      setIsSearchActive(true);
                    }
                  }}
                  onFocus={() => setIsSearchActive(true)}
                  autoCapitalize="none"
                  returnKeyType="search"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearchQuery("")}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.searchClearBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close-circle" size={19} color="#888888" />
                  </TouchableOpacity>
                )}
              </View>
              {isSearchActive && (
                <TouchableOpacity
                  onPress={() => {
                    setIsSearchActive(false);
                    setSearchQuery("");
                  }}
                  style={styles.cancelSearchBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.cancelSearchBtnText}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>

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
                <View style={{ paddingVertical: 36, alignItems: "center" }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : combinedSearchResults.length > 0 ? (
                <View style={styles.unifiedUserList}>
                  {combinedSearchResults.map((u) => {
                    const activity = friendsActivity[u.uid];
                    const isLive = u.isFriend && Boolean(activity?.isPlaying && activity?.track);

                    return (
                      <TouchableOpacity
                        key={`search_item_${u.uid}`}
                        style={styles.userRowItem}
                        onPress={() => setSelectedUserProfile(u)}
                        activeOpacity={0.7}
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
                            {u.username}
                          </Text>
                          {isLive ? (
                            <View style={styles.liveTrackRow}>
                              <MaterialCommunityIcons name="waveform" size={14} color="#1DB954" style={{ marginRight: 4 }} />
                              <Text style={styles.liveTrackText} numberOfLines={1}>
                                {activity.track.title}{activity.track.artist ? ` • ${activity.track.artist}` : ""}
                              </Text>
                            </View>
                          ) : (
                            <Text style={styles.userHandleSubText} numberOfLines={1}>
                              @{u.username}
                            </Text>
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
            /* ═══════════ DEFAULT SINGLE-PAGE VIEW (NO TABS) ═══════════ */
            <>
              {/* 1. Incoming Friend Requests (Only when there are incoming requests) */}
              {incomingRequests.length > 0 && (
                <View style={styles.sectionBlock}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionHeaderTitle}>Friend Requests</Text>
                    <View style={styles.countPill}>
                      <Text style={styles.countPillText}>{incomingRequests.length}</Text>
                    </View>
                  </View>

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
                          <Text style={styles.requestSubText}>Wants to be friends</Text>
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
              )}

              {/* Your Friends */}
              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeaderTitle}>Your Friends</Text>
                  {sortedFriends.length > 0 && (
                    <View style={styles.countPill}>
                      <Text style={styles.countPillText}>{sortedFriends.length}</Text>
                    </View>
                  )}
                </View>

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
                              {friend.username}
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
                            ) : (
                              <Text style={styles.userHandleSubText} numberOfLines={1}>
                                {activity?.track ? `♫ ${activity.track.title}` : `@${friend.username}`}
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
                  <View style={styles.emptyStateBox}>
                    <View style={styles.emptyIconCircle}>
                      <Ionicons name="people-outline" size={32} color={colors.primary} />
                    </View>
                    <Text style={styles.emptyTitle}>No Friends Yet</Text>
                    <Text style={styles.emptySub}>
                      Use the search bar above or check out suggested listeners to connect with friends and listen along together.
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* ═══════════ FRIEND PROFILE MODAL (BOTTOM SHEET) ═══════════ */}
      <Modal
        visible={!!selectedUserProfile}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSelectedUserProfile(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setSelectedUserProfile(null)}
          />
          <View
            style={styles.profileModalCard}
            onStartShouldSetResponder={() => true}
          >
            {/* Modal Top Bar with Drag Handle and Close Button */}
            <View style={styles.profileModalTopBar}>
              <View style={styles.profileModalDragHandle} />
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setSelectedUserProfile(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* User Profile Header: Avatar on Left, Info on Right (Matching Profile layout) */}
            <View style={styles.profileModalHeaderRow}>
              <View style={styles.profileModalAvatarWrap}>
                <UserAvatar user={selectedUserProfile} size={72} fontSize={26} />
                {isUserFriend(selectedUserProfile) && friendsActivity[selectedUserProfile?.uid]?.isPlaying && (
                  <View style={styles.profileModalDotLive} />
                )}
              </View>

              <View style={styles.profileModalHeaderInfo}>
                <Text style={styles.profileModalName} numberOfLines={1}>
                  {selectedUserProfile?.username}
                </Text>

                {/* Badges: PREMIUM / FREE + Listened Hours */}
                <View style={styles.profileModalBadgeRow}>
                  {selectedUserStats.isPremium ? (
                    <View style={styles.profileModalPremiumPill}>
                      <Ionicons name="diamond" size={11} color="#000000" style={{ marginRight: 4 }} />
                      <Text style={styles.profileModalPremiumPillText}>PREMIUM</Text>
                    </View>
                  ) : (
                    <View style={styles.profileModalFreePill}>
                      <Text style={styles.profileModalFreePillText}>FREE</Text>
                    </View>
                  )}

                  <View style={styles.profileModalHoursPill}>
                    <Ionicons name="time" size={12} color="rgba(255,255,255,0.6)" style={{ marginRight: 4 }} />
                    <Text style={styles.profileModalHoursText}>
                      {selectedUserStats.listeningHours}h Listened
                    </Text>
                  </View>
                </View>

                {/* Metrics: Streams & Liked Songs */}
                <View style={styles.profileModalMetricsRow}>
                  <Text style={styles.profileModalMetricsText}>
                    <Text style={styles.profileModalMetricsBold}>{selectedUserStats.streamCount}</Text> Streams
                  </Text>
                  <Text style={styles.profileModalMetricsDot}>•</Text>
                  <Text style={styles.profileModalMetricsText}>
                    <Text style={styles.profileModalMetricsBold}>{selectedUserStats.likedSongsCount}</Text> Liked Songs
                  </Text>
                </View>
              </View>
            </View>

            {/* Live Playing Music Activity Card */}
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
                <View style={styles.profileMusicBox}>
                  {/* Activity Status Header */}
                  <View style={styles.profileMusicHeader}>
                    <MaterialCommunityIcons
                      name={isFriendPlaying ? "waveform" : "history"}
                      size={15}
                      color={isFriendPlaying ? "#1DB954" : "#888888"}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.profileMusicHeaderText,
                        !isFriendPlaying && { color: "#888888" },
                      ]}
                    >
                      {isFriendPlaying ? "Listening Now" : "Last Listened"}
                    </Text>
                    {isFriendPlaying && (
                      <View style={styles.livePulsePill}>
                        <View style={styles.liveDot} />
                        <Text style={styles.livePulsePillText}>LIVE</Text>
                      </View>
                    )}
                  </View>

                  {/* Modern Track Row */}
                  <TouchableOpacity
                    style={styles.profileTrackRow}
                    onPress={() => {
                      if (isThisPlaying) {
                        if (typeof togglePlayPause === "function") togglePlayPause();
                      } else {
                        handleListenAlong(friendTrack);
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    {/* Track Artwork */}
                    <View style={styles.profileTrackArtworkWrap}>
                      {artworkUrl ? (
                        <Image
                          source={{ uri: artworkUrl }}
                          style={styles.profileTrackArtwork}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.profileTrackArtworkFallback}>
                          <Ionicons name="musical-notes" size={24} color="#555555" />
                        </View>
                      )}
                      {isThisPlayingNow && (
                        <View style={styles.artworkPlayingScrim}>
                          <MaterialCommunityIcons name="waveform" size={16} color="#1DB954" />
                        </View>
                      )}
                    </View>

                    {/* Track Info */}
                    <View style={styles.profileTrackInfo}>
                      <Text style={styles.profileTrackTitle} numberOfLines={1}>
                        {friendTrack.title}
                      </Text>
                      <Text style={styles.profileTrackArtist} numberOfLines={1}>
                        {friendTrack.artist || "Unknown Artist"}
                      </Text>
                    </View>

                    {/* Circular Play / Pause Button */}
                    <TouchableOpacity
                      style={[
                        styles.profilePlayCircleBtn,
                        isThisPlayingNow && styles.profilePlayCircleBtnActive,
                      ]}
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
                        size={18}
                        color="#000000"
                        style={!isThisPlayingNow ? { marginLeft: 2 } : {}}
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>
                </View>
              );
            })() : null}

            {/* Friendship Actions */}
            <View style={styles.profileModalActions}>
              {isUserFriend(selectedUserProfile) ? (
                <View style={styles.friendsCardSection}>
                  <View style={styles.friendsBadgePill}>
                    <Ionicons name="checkmark-circle" size={15} color="#1DB954" style={{ marginRight: 6 }} />
                    <Text style={styles.friendsBadgeText}>Friends</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.removeFriendBtn}
                    onPress={() => {
                      const u = selectedUserProfile;
                      setSelectedUserProfile(null);
                      setFriendToDelete(u);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="person-remove-outline" size={14} color="#FF5252" style={{ marginRight: 5 }} />
                    <Text style={styles.removeFriendBtnText}>Remove Friend</Text>
                  </TouchableOpacity>
                </View>
              ) : isUserIncoming(selectedUserProfile) ? (
                <TouchableOpacity
                  style={styles.profileMainBtn}
                  onPress={() => {
                    handleAcceptRequest(selectedUserProfile);
                    setSelectedUserProfile(null);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark" size={16} color="#000000" style={{ marginRight: 6 }} />
                  <Text style={styles.profileMainBtnText}>Accept Friend Request</Text>
                </TouchableOpacity>
              ) : isUserOutgoing(selectedUserProfile) ? (
                <View style={styles.pendingBadgeRow}>
                  <Ionicons name="time-outline" size={16} color="#888888" style={{ marginRight: 6 }} />
                  <Text style={styles.pendingBadgeText}>Friend Request Pending</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.profileMainBtn}
                  onPress={() => {
                    handleSendFriendDirect(selectedUserProfile);
                    setSelectedUserProfile(null);
                  }}
                  disabled={isSending}
                  activeOpacity={0.8}
                >
                  <Ionicons name="person-add" size={16} color="#000000" style={{ marginRight: 6 }} />
                  <Text style={styles.profileMainBtnText}>Add Friend</Text>
                </TouchableOpacity>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  screenHeader: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "web" ? 12 : 14,
    paddingBottom: 14,
    backgroundColor: "#000000",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  innerContent: {
    width: "100%",
  },
  desktopInnerContent: {
    width: "100%",
    paddingHorizontal: 16,
  },
  headerTopRow: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? {
          transition:
            "height 0.24s cubic-bezier(0.2, 0, 0, 1), opacity 0.2s cubic-bezier(0.2, 0, 0, 1), margin-bottom 0.24s cubic-bezier(0.2, 0, 0, 1)",
        }
      : {}),
  },
  headerTopRowHidden: {
    height: 0,
    opacity: 0,
    marginBottom: 0,
    pointerEvents: "none",
  },
  screenTitle: {
    fontFamily: fonts.bold,
    fontSize: 26,
    color: "#FFFFFF",
    letterSpacing: -0.4,
  },
  profileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  profileAvatarImage: {
    width: "100%",
    height: "100%",
  },
  profileAvatarText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
  },

  // Pill Search Bar
  topSearchWrapper: {
    width: "100%",
  },
  topSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  topSearchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161616",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    paddingHorizontal: 14,
    height: 48,
  },
  topSearchBarActive: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#1c1c1c",
  },
  searchIcon: {
    marginRight: 10,
  },
  topSearchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontFamily: fonts.medium,
    fontSize: 15,
    height: "100%",
    padding: 0,
    margin: 0,
    ...(Platform.OS === "web"
      ? {
          outlineStyle: "none",
          borderWidth: 0,
        }
      : {}),
  },
  searchClearBtn: {
    flexShrink: 0,
    marginRight: 8,
    padding: 4,
    justifyContent: "center",
    alignItems: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  cancelSearchBtn: {
    marginLeft: 12,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  cancelSearchBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 14,
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
    color: colors.primary,
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

  // Empty State
  emptyStateBox: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 20,
    backgroundColor: "#0d0d0d",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(29, 185, 84, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
    marginBottom: 6,
  },
  emptySub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: "#888888",
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 380,
  },

  // ═══════════ FRIEND PROFILE MODAL STYLES (BOTTOM SHEET) ═══════════
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  profileModalCard: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#161616",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: Platform.OS === "web" ? 1 : 0,
    borderRightWidth: Platform.OS === "web" ? 1 : 0,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === "web" ? 32 : 44,
    alignItems: "center",
    position: "relative",
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.6)",
        }
      : {}),
  },
  profileModalTopBar: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    height: 32,
    marginBottom: 10,
  },
  modalCloseBtn: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  profileModalDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  profileModalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingTop: 8,
    paddingBottom: 20,
    gap: 16,
  },
  profileModalAvatarWrap: {
    position: "relative",
    flexShrink: 0,
  },
  profileModalHeaderInfo: {
    flex: 1,
    justifyContent: "center",
  },
  profileModalDotLive: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#1DB954",
    borderWidth: 3,
    borderColor: "#161616",
  },
  profileModalName: {
    fontFamily: fonts.bold,
    fontSize: 24,
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  profileModalHandle: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#888888",
    marginTop: 2,
  },
  profileModalBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 8,
    flexWrap: "wrap",
  },
  profileModalPremiumPill: {
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  profileModalPremiumPillText: {
    fontFamily: fonts.bold,
    fontSize: 10.5,
    color: "#000000",
    letterSpacing: 0.4,
  },
  profileModalFreePill: {
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  profileModalFreePillText: {
    fontFamily: fonts.semiBold,
    fontSize: 10.5,
    color: "#AAAAAA",
    letterSpacing: 0.3,
  },
  profileModalHoursPill: {
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  profileModalHoursText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.85)",
  },
  profileModalMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 6,
    flexWrap: "wrap",
  },
  profileModalMetricsText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  profileModalMetricsBold: {
    fontFamily: fonts.bold,
    color: "#FFFFFF",
  },
  profileModalMetricsDot: {
    color: "rgba(255, 255, 255, 0.3)",
    fontSize: 11,
  },
  profileMusicBox: {
    width: "100%",
    backgroundColor: "#121212",
    borderRadius: 16,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  profileMusicHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  profileMusicHeaderText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: "#1DB954",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  livePulsePill: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(29, 185, 84, 0.15)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 4,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#1DB954",
  },
  livePulsePillText: {
    fontFamily: fonts.bold,
    fontSize: 9,
    color: "#1DB954",
    letterSpacing: 0.5,
  },
  profileTrackRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
    ...(Platform.OS === "web" ? { cursor: "pointer", transition: "background-color 0.15s ease" } : {}),
  },
  profileTrackArtworkWrap: {
    width: 52,
    height: 52,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#202020",
    flexShrink: 0,
  },
  profileTrackArtwork: {
    width: "100%",
    height: "100%",
  },
  profileTrackArtworkFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#202020",
  },
  artworkPlayingScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  profileTrackInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 10,
  },
  profileTrackTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#FFFFFF",
  },
  profileTrackArtist: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: "#999999",
    marginTop: 2,
  },
  profilePlayCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    ...(Platform.OS === "web" ? { cursor: "pointer", transition: "transform 0.15s ease" } : {}),
  },
  profilePlayCircleBtnActive: {
    backgroundColor: "#FFFFFF",
  },
  profileModalActions: {
    width: "100%",
    alignItems: "center",
  },
  friendsCardSection: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  friendsBadgePill: {
    flex: 1,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(29, 185, 84, 0.1)",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.25)",
  },
  friendsBadgeText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#1DB954",
  },
  removeFriendBtn: {
    flex: 1,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 82, 82, 0.08)",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255, 82, 82, 0.25)",
    ...(Platform.OS === "web" ? { cursor: "pointer", transition: "all 0.15s ease" } : {}),
  },
  removeFriendBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FF5252",
  },
  pendingBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  pendingBadgeText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#888888",
  },
  profileMainBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    height: 44,
    borderRadius: 22,
    width: "100%",
  },
  profileMainBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
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
});
