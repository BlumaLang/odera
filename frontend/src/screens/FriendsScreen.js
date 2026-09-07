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
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { useResponsive } from "../context/ResponsiveContext";
import { useUser } from "../context/UserContext";
import { useAudio } from "../context/AudioContext";
import { subscribeFriendActivity } from "../services/firebase";

const TABS = [
  { id: "friends", label: "Friends", icon: "people" },
  { id: "requests", label: "Requests", icon: "person-add" },
  { id: "discover", label: "Discover", icon: "compass" },
  { id: "listening", label: "Live Listening", icon: "headset" },
];

const COMMUNITY_SUGGESTIONS = [
  {
    uid: "comm_aria",
    username: "Aria Melody",
    avatar: "musical-notes",
    avatarColor: "#FF5E3A",
    tag: "Pop & Bollywood",
    favoriteArtist: "Arijit Singh",
    friendCode: "ARIAMELODY",
    recentTrack: {
      videoId: "comm_song_1",
      title: "Chaleya",
      artist: "Arijit Singh, Shilpa Rao",
      thumbnail: "https://c.saavncdn.com/026/Chaleya-From-Jawan-Hindi-2023-20230814014337-500x500.jpg",
      artwork_url: "https://c.saavncdn.com/026/Chaleya-From-Jawan-Hindi-2023-20230814014337-500x500.jpg",
    },
  },
  {
    uid: "comm_kabir",
    username: "Kabir Rhythm",
    avatar: "headset",
    avatarColor: "#1DB954",
    tag: "Punjabi & Hip-Hop",
    favoriteArtist: "Diljit Dosanjh",
    friendCode: "KABIRRHYTHM",
    recentTrack: {
      videoId: "comm_song_2",
      title: "Lover",
      artist: "Diljit Dosanjh",
      thumbnail: "https://c.saavncdn.com/152/MoonChild-Era-Punjabi-2021-20210822180846-500x500.jpg",
      artwork_url: "https://c.saavncdn.com/152/MoonChild-Era-Punjabi-2021-20210822180846-500x500.jpg",
    },
  },
  {
    uid: "comm_zara",
    username: "Zara Vibes",
    avatar: "radio",
    avatarColor: "#9B51E0",
    tag: "Lo-Fi & Acoustic",
    favoriteArtist: "Prateek Kuhad",
    friendCode: "ZARAVIBES",
    recentTrack: {
      videoId: "comm_song_3",
      title: "Kasoor",
      artist: "Prateek Kuhad",
      thumbnail: "https://c.saavncdn.com/835/Kasoor-Hindi-2020-20200630043135-500x500.jpg",
      artwork_url: "https://c.saavncdn.com/835/Kasoor-Hindi-2020-20200630043135-500x500.jpg",
    },
  },
  {
    uid: "comm_leo",
    username: "Leo Sound",
    avatar: "flame",
    avatarColor: "#F2994A",
    tag: "EDM & Global Hits",
    favoriteArtist: "The Weeknd",
    friendCode: "LEOSOUND",
    recentTrack: {
      videoId: "comm_song_4",
      title: "Blinding Lights",
      artist: "The Weeknd",
      thumbnail: "https://c.saavncdn.com/978/After-Hours-English-2020-20200320180429-500x500.jpg",
      artwork_url: "https://c.saavncdn.com/978/After-Hours-English-2020-20200320180429-500x500.jpg",
    },
  },
];

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
    cancelFriendRequest,
    removeFriend,
    searchUsers,
  } = useUser() || {};

  const { playTrack, currentTrack } = useAudio();

  const [activeTab, setActiveTab] = useState("friends"); // "friends" | "requests" | "discover" | "listening"
  const [friendsFilter, setFriendsFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [codeInputValue, setCodeInputValue] = useState("");
  const [codeStatusMsg, setCodeStatusMsg] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  // Live activities mapped by friend UID: { [uid]: { track, isPlaying, updatedAt } }
  const [friendsActivity, setFriendsActivity] = useState({});

  const userInitial = (userProfile?.username?.[0] || "A").toUpperCase();
  const avatarIcon = userProfile?.avatar && userProfile.avatar !== "initial" ? userProfile.avatar : null;
  const avatarBg = userProfile?.avatarColor || colors.primary;
  const myFriendCode = (userProfile?.username || "staytup")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();

  const incomingRequests = friendRequests?.incoming || [];
  const outgoingRequests = friendRequests?.outgoing || [];
  const friendsList = friends || [];

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

  // Debounced user search in Discover tab
  useEffect(() => {
    if (activeTab !== "discover") return;
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        if (searchUsers) {
          const results = await searchUsers(q);
          setSearchResults(results || []);
        }
      } catch (err) {
        console.warn("User search failed:", err);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery, activeTab, searchUsers]);

  // Filtered friends list
  const filteredFriends = useMemo(() => {
    if (!friendsFilter.trim()) return friendsList;
    const q = friendsFilter.trim().toLowerCase();
    return friendsList.filter(
      (f) =>
        (f.username && f.username.toLowerCase().includes(q)) ||
        (f.uid && f.uid.toLowerCase().includes(q))
    );
  }, [friendsList, friendsFilter]);

  // Live friends who are currently listening
  const liveFriends = useMemo(() => {
    return friendsList.filter((f) => {
      const act = friendsActivity[f.uid];
      return act && act.isPlaying && act.track;
    });
  }, [friendsList, friendsActivity]);

  const handleCopyCode = () => {
    if (Platform.OS === "web" && navigator.clipboard) {
      navigator.clipboard.writeText(myFriendCode).catch(() => {});
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2200);
  };

  const handleSendByCode = async () => {
    const raw = codeInputValue.trim().toUpperCase();
    if (!raw) return;

    if (raw === myFriendCode) {
      setCodeStatusMsg("You cannot add yourself as a friend.");
      return;
    }

    setCodeStatusMsg("Sending request...");
    try {
      const results = searchUsers ? await searchUsers(raw) : [];
      const match = results?.find(
        (u) => (u.friendCode || "").toUpperCase() === raw || (u.username || "").toUpperCase() === raw
      );

      if (match) {
        const ok = await sendFriendRequest(match.uid, match);
        if (ok) {
          setCodeStatusMsg(`Friend request sent to ${match.username}!`);
          setCodeInputValue("");
        } else {
          setCodeStatusMsg("Could not send request. Please try again.");
        }
      } else {
        const commMatch = COMMUNITY_SUGGESTIONS.find((c) => c.friendCode === raw);
        if (commMatch) {
          await sendFriendRequest(commMatch.uid, commMatch);
          setCodeStatusMsg(`Friend request sent to ${commMatch.username}!`);
          setCodeInputValue("");
        } else {
          setCodeStatusMsg(`No user found with code "${raw}".`);
        }
      }
    } catch (err) {
      setCodeStatusMsg("Failed to send request.");
    }

    setTimeout(() => setCodeStatusMsg(""), 4000);
  };

  const handleAcceptRequest = async (reqUser) => {
    if (!acceptFriendRequest) return;
    try {
      await acceptFriendRequest(reqUser);
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

  const handleCancelRequest = async (recipientUid) => {
    if (!cancelFriendRequest) return;
    try {
      await cancelFriendRequest(recipientUid);
    } catch (err) {
      console.warn("Failed to cancel friend request:", err);
    }
  };

  const handleRemoveFriend = (friend) => {
    const doRemove = async () => {
      if (removeFriend) {
        await removeFriend(friend.uid);
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(`Remove ${friend.username} from your friends?`)) {
        doRemove();
      }
    } else {
      Alert.alert(
        "Remove Friend",
        `Are you sure you want to remove ${friend.username}?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Remove", style: "destructive", onPress: doRemove },
        ]
      );
    }
  };

  const handleListenAlong = (track) => {
    if (!track || !playTrack) return;
    playTrack({
      ...track,
      videoId: track.videoId || track.video_id,
    });
  };

  return (
    <View style={styles.container}>
      {/* Aligned Top Header matching SearchScreen */}
      <View style={styles.screenHeader}>
        <View style={[styles.innerContent, (isDesktop || isTablet) && styles.desktopInnerContent]}>
          <View style={styles.headerTopRow}>
            <View>
              <Text style={styles.screenTitle}>Friends & Social</Text>
              <Text style={styles.screenSubTitle}>
                {friendsList.length} {friendsList.length === 1 ? "friend" : "friends"} • Live listening & sharing
              </Text>
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
        </View>
      </View>

      {/* Tabs Row with badge for pending requests */}
      <View style={styles.tabsWrapper}>
        <View style={[styles.innerContent, (isDesktop || isTablet) && styles.desktopInnerContent]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsRowContainer}
            contentContainerStyle={styles.tabsContainer}
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const hasBadge = tab.id === "requests" && incomingRequests.length > 0;
              const hasLive = tab.id === "listening" && liveFriends.length > 0;

              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.tab, isActive && styles.activeTab]}
                  onPress={() => setActiveTab(tab.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isActive ? tab.icon : `${tab.icon}-outline`}
                    size={16}
                    color={isActive ? "#000000" : "#FFFFFF"}
                  />
                  <Text
                    style={[
                      styles.tabLabel,
                      isActive && { fontFamily: fonts.bold, color: "#000000" },
                    ]}
                  >
                    {tab.label}
                  </Text>
                  {hasBadge && (
                    <View style={styles.tabBadge}>
                      <Text style={styles.tabBadgeText}>{incomingRequests.length}</Text>
                    </View>
                  )}
                  {hasLive && (
                    <View style={styles.tabLiveDot} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* Main Tab Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.innerContent, (isDesktop || isTablet) && styles.desktopInnerContent]}>
          {/* TAB 1: FRIENDS LIST */}
          {activeTab === "friends" && (
            <View style={styles.tabSection}>
              {/* Quick Search / Filter Bar */}
              {friendsList.length > 0 && (
                <View style={styles.searchBarWrap}>
                  <Ionicons name="search" size={16} color={colors.textMuted} style={styles.searchIcon} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search your friends..."
                    placeholderTextColor={colors.textMuted}
                    value={friendsFilter}
                    onChangeText={setFriendsFilter}
                  />
                  {friendsFilter.length > 0 && (
                    <TouchableOpacity onPress={() => setFriendsFilter("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Friends List Items */}
              {filteredFriends.length > 0 ? (
                <View style={styles.friendsCardList}>
                  {filteredFriends.map((friend) => {
                    const activity = friendsActivity[friend.uid];
                    const isLive = Boolean(activity?.isPlaying && activity?.track);
                    const friendInitial = (friend.username?.[0] || "F").toUpperCase();
                    const isCurrentPlayingThis =
                      currentTrack && activity?.track &&
                      (currentTrack.videoId === activity.track.videoId || currentTrack.id === activity.track.id);

                    return (
                      <View key={friend.uid} style={styles.friendCard}>
                        {/* Avatar & Online Dot */}
                        <View style={styles.friendAvatarWrap}>
                          <View
                            style={[
                              styles.friendAvatar,
                              { backgroundColor: friend.avatarColor || colors.primary },
                            ]}
                          >
                            {friend.avatar && friend.avatar.startsWith("http") ? (
                              <Image source={{ uri: friend.avatar }} style={styles.friendAvatarImg} />
                            ) : friend.avatar && friend.avatar !== "initial" ? (
                              <Ionicons name={friend.avatar} size={18} color="#000000" />
                            ) : (
                              <Text style={styles.friendAvatarInitial}>{friendInitial}</Text>
                            )}
                          </View>
                          <View
                            style={[
                              styles.statusDot,
                              isLive ? styles.statusDotLive : styles.statusDotOffline,
                            ]}
                          />
                        </View>

                        {/* Info & Live Song */}
                        <View style={styles.friendInfoWrap}>
                          <Text style={styles.friendName} numberOfLines={1}>
                            {friend.username}
                          </Text>

                          {isLive ? (
                            <View style={styles.friendLiveRow}>
                              <MaterialCommunityIcons name="waveform" size={14} color="#1DB954" style={{ marginRight: 4 }} />
                              <Text style={styles.friendLiveSong} numberOfLines={1}>
                                {activity.track.title} • {activity.track.artist}
                              </Text>
                            </View>
                          ) : (
                            <Text style={styles.friendOfflineText}>
                              {activity?.track ? `Last listened to ${activity.track.title}` : "Offline"}
                            </Text>
                          )}
                        </View>

                        {/* Action Buttons */}
                        <View style={styles.friendActionsRow}>
                          {isLive && activity?.track && (
                            <TouchableOpacity
                              style={[
                                styles.listenAlongBtn,
                                isCurrentPlayingThis && styles.listenAlongBtnActive,
                              ]}
                              onPress={() => handleListenAlong(activity.track)}
                              activeOpacity={0.8}
                            >
                              <Ionicons
                                name={isCurrentPlayingThis ? "volume-high" : "play"}
                                size={14}
                                color="#000000"
                              />
                              <Text style={styles.listenAlongText}>
                                {isCurrentPlayingThis ? "Listening" : "Listen Along"}
                              </Text>
                            </TouchableOpacity>
                          )}

                          <TouchableOpacity
                            style={styles.friendRemoveBtn}
                            onPress={() => handleRemoveFriend(friend)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="trash-outline" size={16} color="#777777" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : friendsList.length === 0 ? (
                /* Empty Friends State */
                <View style={styles.emptyStateBox}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons name="people-outline" size={36} color={colors.primary} />
                  </View>
                  <Text style={styles.emptyTitle}>No Friends Added Yet</Text>
                  <Text style={styles.emptySub}>
                    Connect with your friends to see what they are listening to in real time and listen along together!
                  </Text>
                  <View style={styles.emptyButtonsRow}>
                    <TouchableOpacity
                      style={styles.primaryActionBtn}
                      onPress={() => setActiveTab("discover")}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="search" size={16} color="#000000" style={{ marginRight: 6 }} />
                      <Text style={styles.primaryActionBtnText}>Discover & Add Friends</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.secondaryActionBtn}
                      onPress={handleCopyCode}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={copiedCode ? "checkmark" : "copy-outline"}
                        size={16}
                        color={copiedCode ? "#1DB954" : "#FFFFFF"}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={[styles.secondaryActionBtnText, copiedCode && { color: "#1DB954" }]}>
                        {copiedCode ? "Code Copied!" : "Copy Your Code"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.emptyStateBox}>
                  <Text style={styles.emptySub}>No friends matching "{friendsFilter}"</Text>
                </View>
              )}
            </View>
          )}

          {/* TAB 2: REQUESTS (INCOMING & OUTGOING) */}
          {activeTab === "requests" && (
            <View style={styles.tabSection}>
              {/* Section 1: Incoming Requests */}
              <View style={styles.requestSectionHeaderRow}>
                <Text style={styles.sectionHeaderTitle}>Incoming Requests</Text>
                {incomingRequests.length > 0 && (
                  <View style={styles.countPill}>
                    <Text style={styles.countPillText}>{incomingRequests.length}</Text>
                  </View>
                )}
              </View>

              {incomingRequests.length > 0 ? (
                <View style={styles.requestsList}>
                  {incomingRequests.map((req) => {
                    const reqInitial = (req.username?.[0] || "U").toUpperCase();
                    return (
                      <View key={req.uid} style={styles.requestCard}>
                        <View
                          style={[
                            styles.friendAvatar,
                            { backgroundColor: req.avatarColor || colors.primary },
                          ]}
                        >
                          {req.avatar && req.avatar.startsWith("http") ? (
                            <Image source={{ uri: req.avatar }} style={styles.friendAvatarImg} />
                          ) : req.avatar && req.avatar !== "initial" ? (
                            <Ionicons name={req.avatar} size={18} color="#000000" />
                          ) : (
                            <Text style={styles.friendAvatarInitial}>{reqInitial}</Text>
                          )}
                        </View>

                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={styles.friendName} numberOfLines={1}>
                            {req.username}
                          </Text>
                          <Text style={styles.requestTimeText}>Wants to be friends</Text>
                        </View>

                        <View style={styles.requestActionsRow}>
                          <TouchableOpacity
                            style={styles.acceptBtn}
                            onPress={() => handleAcceptRequest(req)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="checkmark" size={16} color="#000000" />
                            <Text style={styles.acceptBtnText}>Accept</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.declineBtn}
                            onPress={() => handleDeclineRequest(req.uid)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="close" size={16} color="#FFFFFF" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={[styles.emptyStateBox, { paddingVertical: 24, marginBottom: 20 }]}>
                  <Ionicons name="mail-open-outline" size={28} color="#555555" />
                  <Text style={[styles.emptySub, { marginTop: 8 }]}>No pending incoming friend requests</Text>
                </View>
              )}

              {/* Section 2: Outgoing Sent Requests */}
              <View style={[styles.requestSectionHeaderRow, { marginTop: 24 }]}>
                <Text style={styles.sectionHeaderTitle}>Sent Requests</Text>
                {outgoingRequests.length > 0 && (
                  <View style={[styles.countPill, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
                    <Text style={[styles.countPillText, { color: "#AAAAAA" }]}>{outgoingRequests.length}</Text>
                  </View>
                )}
              </View>

              {outgoingRequests.length > 0 ? (
                <View style={styles.requestsList}>
                  {outgoingRequests.map((req) => (
                    <View key={req.uid} style={styles.requestCard}>
                      <View
                        style={[
                          styles.friendAvatar,
                          { backgroundColor: req.avatarColor || "#444444" },
                        ]}
                      >
                        <Text style={styles.friendAvatarInitial}>
                          {(req.username?.[0] || "U").toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.friendName} numberOfLines={1}>
                          {req.username}
                        </Text>
                        <Text style={styles.pendingBadgeText}>Pending approval...</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.cancelRequestBtn}
                        onPress={() => handleCancelRequest(req.uid)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.cancelRequestText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={[styles.emptyStateBox, { paddingVertical: 24 }]}>
                  <Text style={styles.emptySub}>No outgoing requests waiting for response</Text>
                </View>
              )}
            </View>
          )}

          {/* TAB 3: DISCOVER & ADD FRIENDS */}
          {activeTab === "discover" && (
            <View style={styles.tabSection}>
              {/* Your Friend Code Card */}
              <View style={styles.myCodeCard}>
                <View style={styles.myCodeCardHeader}>
                  <View style={[styles.myCodeAvatar, { backgroundColor: avatarBg }]}>
                    {avatarIcon && avatarIcon.startsWith("http") ? (
                      <Image source={{ uri: avatarIcon }} style={styles.friendAvatarImg} />
                    ) : avatarIcon ? (
                      <Ionicons name={avatarIcon} size={18} color="#000000" />
                    ) : (
                      <Text style={styles.friendAvatarInitial}>{userInitial}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.myCodeTitle}>{userProfile?.username || "Staytup Listener"}</Text>
                    <Text style={styles.myCodeSub}>Your Personal Friend Code</Text>
                  </View>
                </View>

                <View style={styles.codeDisplayRow}>
                  <View style={styles.codePillBox}>
                    <Text style={styles.codeText}>{myFriendCode}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.copyCodeBtn, copiedCode && styles.copyCodeBtnDone]}
                    onPress={handleCopyCode}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={copiedCode ? "checkmark" : "copy-outline"}
                      size={16}
                      color={copiedCode ? "#1DB954" : "#000000"}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.copyCodeBtnText, copiedCode && { color: "#1DB954" }]}>
                      {copiedCode ? "Copied!" : "Copy"}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.codeHintText}>
                  Share this code with friends so they can add you instantly!
                </Text>
              </View>

              {/* Add by Friend Code Box */}
              <View style={styles.quickAddSection}>
                <Text style={styles.sectionHeaderTitle}>Add by Code or Username</Text>
                <View style={styles.quickAddRow}>
                  <TextInput
                    style={styles.quickAddInput}
                    placeholder="Enter friend's code or username..."
                    placeholderTextColor={colors.textMuted}
                    value={codeInputValue}
                    onChangeText={setCodeInputValue}
                    autoCapitalize="characters"
                  />
                  <TouchableOpacity
                    style={styles.quickAddBtn}
                    onPress={handleSendByCode}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.quickAddBtnText}>Send Request</Text>
                  </TouchableOpacity>
                </View>
                {codeStatusMsg.length > 0 && (
                  <Text style={styles.codeStatusMsgText}>{codeStatusMsg}</Text>
                )}
              </View>

              {/* Search Users Input */}
              <View style={[styles.quickAddSection, { marginTop: 28 }]}>
                <Text style={styles.sectionHeaderTitle}>Search Music Community</Text>
                <View style={styles.searchBarWrap}>
                  <Ionicons name="search" size={16} color={colors.textMuted} style={styles.searchIcon} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search users by name or taste..."
                    placeholderTextColor={colors.textMuted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {isSearching && (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
                  )}
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Search Results */}
                {searchResults.length > 0 ? (
                  <View style={styles.requestsList}>
                    {searchResults.map((user) => {
                      const isAlreadyFriend = friendsList.some((f) => f.uid === user.uid);
                      const isPending = outgoingRequests.some((r) => r.uid === user.uid);

                      return (
                        <View key={user.uid} style={styles.requestCard}>
                          <View
                            style={[
                              styles.friendAvatar,
                              { backgroundColor: user.avatarColor || colors.primary },
                            ]}
                          >
                            <Text style={styles.friendAvatarInitial}>
                              {(user.username?.[0] || "U").toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.friendName} numberOfLines={1}>
                              {user.username}
                            </Text>
                            <Text style={styles.requestTimeText}>Code: {user.friendCode || user.uid.substring(0, 8)}</Text>
                          </View>
                          {isAlreadyFriend ? (
                            <View style={styles.alreadyFriendBadge}>
                              <Ionicons name="checkmark" size={14} color="#1DB954" style={{ marginRight: 4 }} />
                              <Text style={styles.alreadyFriendText}>Friends</Text>
                            </View>
                          ) : isPending ? (
                            <View style={styles.pendingPill}>
                              <Text style={styles.pendingPillText}>Requested</Text>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={styles.addFriendActionBtn}
                              onPress={async () => {
                                await sendFriendRequest(user.uid, user);
                              }}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="person-add" size={14} color="#000000" style={{ marginRight: 4 }} />
                              <Text style={styles.addFriendActionText}>Add</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>

              {/* Community Music Lover Suggestions */}
              <View style={[styles.quickAddSection, { marginTop: 24 }]}>
                <Text style={styles.sectionHeaderTitle}>Suggested Listeners</Text>
                <Text style={styles.sectionSubDesc}>
                  Staytup music lovers who enjoy similar artists and tracks
                </Text>

                <View style={styles.communityGrid}>
                  {COMMUNITY_SUGGESTIONS.map((comm) => {
                    const isAlreadyFriend = friendsList.some((f) => f.uid === comm.uid);
                    const isPending = outgoingRequests.some((r) => r.uid === comm.uid);

                    return (
                      <View key={comm.uid} style={styles.commCard}>
                        <View style={styles.commCardTop}>
                          <View style={[styles.commAvatar, { backgroundColor: comm.avatarColor }]}>
                            <Ionicons name={comm.avatar} size={20} color="#000000" />
                          </View>
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.commName} numberOfLines={1}>
                              {comm.username}
                            </Text>
                            <Text style={styles.commTag} numberOfLines={1}>
                              {comm.tag}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.commTrackRow}>
                          <Image source={{ uri: comm.recentTrack.thumbnail }} style={styles.commTrackThumb} />
                          <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text style={styles.commTrackTitle} numberOfLines={1}>
                              {comm.recentTrack.title}
                            </Text>
                            <Text style={styles.commTrackArtist} numberOfLines={1}>
                              {comm.recentTrack.artist}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.commCardActions}>
                          <TouchableOpacity
                            style={styles.commListenBtn}
                            onPress={() => handleListenAlong(comm.recentTrack)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="play" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                            <Text style={styles.commListenBtnText}>Play</Text>
                          </TouchableOpacity>

                          {isAlreadyFriend ? (
                            <View style={styles.alreadyFriendBadge}>
                              <Ionicons name="checkmark" size={13} color="#1DB954" style={{ marginRight: 4 }} />
                              <Text style={styles.alreadyFriendText}>Friends</Text>
                            </View>
                          ) : isPending ? (
                            <View style={styles.pendingPill}>
                              <Text style={styles.pendingPillText}>Pending</Text>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={styles.commAddBtn}
                              onPress={async () => {
                                await sendFriendRequest(comm.uid, comm);
                              }}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="person-add" size={13} color="#000000" style={{ marginRight: 4 }} />
                              <Text style={styles.commAddBtnText}>Add Friend</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          )}

          {/* TAB 4: LIVE LISTENING (FRIEND ACTIVITY) */}
          {activeTab === "listening" && (
            <View style={styles.tabSection}>
              <View style={styles.liveHeaderWrap}>
                <View style={styles.livePulseDot} />
                <Text style={styles.sectionHeaderTitle}>Live Listening Feed</Text>
              </View>
              <Text style={styles.sectionSubDesc}>
                Real-time listening activity from your friends. Tap "Listen Along" to synchronize playback!
              </Text>

              {liveFriends.length > 0 ? (
                <View style={styles.liveCardsList}>
                  {liveFriends.map((friend) => {
                    const activity = friendsActivity[friend.uid];
                    const track = activity?.track;
                    if (!track) return null;

                    return (
                      <View key={friend.uid} style={styles.liveCard}>
                        <Image
                          source={{ uri: track.artwork_url || track.thumbnail }}
                          style={styles.liveCardThumb}
                          resizeMode="cover"
                        />
                        <View style={styles.liveCardBody}>
                          {/* Live Indicator Bar */}
                          <View style={styles.liveTagRow}>
                            <View style={styles.liveDot} />
                            <Text style={styles.liveTagText}>LISTENING NOW</Text>
                            <Text style={styles.liveUserTag}>• {friend.username}</Text>
                          </View>

                          <Text style={styles.liveTrackTitle} numberOfLines={1}>
                            {track.title}
                          </Text>
                          <Text style={styles.liveTrackArtist} numberOfLines={1}>
                            {track.artist || "Unknown Artist"}
                          </Text>

                          {/* Listen Along Action */}
                          <TouchableOpacity
                            style={styles.liveListenAlongBtn}
                            onPress={() => handleListenAlong(track)}
                            activeOpacity={0.85}
                          >
                            <Ionicons name="headset" size={16} color="#000000" style={{ marginRight: 6 }} />
                            <Text style={styles.liveListenAlongBtnText}>Listen Along</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                /* Empty Live Feed */
                <View style={styles.emptyStateBox}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons name="headset-outline" size={38} color={colors.primary} />
                  </View>
                  <Text style={styles.emptyTitle}>No Friends Live Right Now</Text>
                  <Text style={styles.emptySub}>
                    When your friends are listening to songs on Staytup, their activity appears right here so you can listen along together!
                  </Text>
                  <TouchableOpacity
                    style={styles.primaryActionBtn}
                    onPress={() => setActiveTab("discover")}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="person-add" size={16} color="#000000" style={{ marginRight: 6 }} />
                    <Text style={styles.primaryActionBtnText}>Invite & Add Friends</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
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
    paddingTop: Platform.OS === "web" ? 12 : 40,
    paddingBottom: 8,
    backgroundColor: "#000000",
  },
  innerContent: {
    width: "100%",
  },
  desktopInnerContent: {
    maxWidth: 920,
    alignSelf: "center",
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  screenTitle: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: "#FFFFFF",
    letterSpacing: -0.4,
  },
  screenSubTitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
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
  tabsWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    paddingVertical: 10,
    backgroundColor: "#000000",
  },
  tabsRowContainer: {
    maxHeight: 44,
  },
  tabsContainer: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    gap: 6,
  },
  activeTab: {
    backgroundColor: "#FFFFFF",
  },
  tabLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#FFFFFF",
  },
  tabBadge: {
    backgroundColor: "#FF3B30",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    marginLeft: 2,
  },
  tabBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: "#FFFFFF",
  },
  tabLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#1DB954",
    marginLeft: 2,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 130,
  },
  tabSection: {
    width: "100%",
  },
  searchBarWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161616",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  friendsCardList: {
    gap: 10,
  },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#121212",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  friendAvatarWrap: {
    position: "relative",
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  friendAvatarImg: {
    width: "100%",
    height: "100%",
  },
  friendAvatarInitial: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#000000",
  },
  statusDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#121212",
    position: "absolute",
    bottom: -1,
    right: -1,
  },
  statusDotLive: {
    backgroundColor: "#1DB954",
  },
  statusDotOffline: {
    backgroundColor: "#555555",
  },
  friendInfoWrap: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  friendName: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  friendLiveRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  friendLiveSong: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: "#1DB954",
  },
  friendOfflineText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  friendActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  listenAlongBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1DB954",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 4,
  },
  listenAlongBtnActive: {
    backgroundColor: "#FFFFFF",
  },
  listenAlongText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: "#000000",
  },
  friendRemoveBtn: {
    padding: 6,
  },
  emptyStateBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: "#101010",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(29,185,84,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: "#FFFFFF",
    marginBottom: 6,
    textAlign: "center",
  },
  emptySub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 420,
  },
  emptyButtonsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 20,
    justifyContent: "center",
  },
  primaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1DB954",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
  },
  primaryActionBtnText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: "#000000",
  },
  secondaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
  },
  secondaryActionBtnText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#FFFFFF",
  },
  requestSectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionHeaderTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
  },
  sectionSubDesc: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 3,
    marginBottom: 16,
  },
  countPill: {
    backgroundColor: "#1DB954",
    paddingHorizontal: 8,
    paddingVertical: 1,
    borderRadius: 12,
  },
  countPillText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: "#000000",
  },
  requestsList: {
    gap: 10,
  },
  requestCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#121212",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  requestTimeText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  pendingBadgeText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: "#E2B93B",
    marginTop: 2,
  },
  requestActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  acceptBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1DB954",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    gap: 4,
  },
  acceptBtnText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: "#000000",
  },
  declineBtn: {
    backgroundColor: "rgba(255,255,255,0.12)",
    padding: 8,
    borderRadius: 18,
  },
  cancelRequestBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  cancelRequestText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textMuted,
  },
  myCodeCard: {
    backgroundColor: "#141414",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 24,
  },
  myCodeCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  myCodeAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  myCodeTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
  },
  myCodeSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  codeDisplayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  codePillBox: {
    flex: 1,
    backgroundColor: "#1c1c1c",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  codeText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#1DB954",
    letterSpacing: 1.5,
  },
  copyCodeBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  copyCodeBtnDone: {
    backgroundColor: "rgba(29,185,84,0.15)",
  },
  copyCodeBtnText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: "#000000",
  },
  codeHintText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 10,
  },
  quickAddSection: {
    width: "100%",
  },
  quickAddRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  quickAddInput: {
    flex: 1,
    backgroundColor: "#161616",
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 44,
    color: "#FFFFFF",
    fontFamily: fonts.medium,
    fontSize: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  quickAddBtn: {
    backgroundColor: "#1DB954",
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  quickAddBtnText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: "#000000",
  },
  codeStatusMsgText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: "#1DB954",
    marginTop: 6,
  },
  alreadyFriendBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(29,185,84,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  alreadyFriendText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: "#1DB954",
  },
  pendingPill: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  pendingPillText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: "#AAAAAA",
  },
  addFriendActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addFriendActionText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: "#000000",
  },
  communityGrid: {
    gap: 12,
  },
  commCard: {
    backgroundColor: "#131313",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  commCardTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  commAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  commName: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  commTag: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.primary,
    marginTop: 1,
  },
  commTrackRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
  },
  commTrackThumb: {
    width: 34,
    height: 34,
    borderRadius: 4,
    backgroundColor: "#1c1c1c",
  },
  commTrackTitle: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: "#FFFFFF",
  },
  commTrackArtist: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
  },
  commCardActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  commListenBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  commListenBtnText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: "#FFFFFF",
  },
  commAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1DB954",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  commAddBtnText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: "#000000",
  },
  liveHeaderWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  livePulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#1DB954",
  },
  liveCardsList: {
    gap: 16,
  },
  liveCard: {
    backgroundColor: "#141414",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  liveCardThumb: {
    width: "100%",
    height: 180,
    backgroundColor: "#1c1c1c",
  },
  liveCardBody: {
    padding: 16,
  },
  liveTagRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#1DB954",
    marginRight: 6,
  },
  liveTagText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: "#1DB954",
    letterSpacing: 1,
  },
  liveUserTag: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: "#FFFFFF",
    marginLeft: 4,
  },
  liveTrackTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
  },
  liveTrackArtist: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: 14,
  },
  liveListenAlongBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1DB954",
    paddingVertical: 10,
    borderRadius: 22,
  },
  liveListenAlongBtnText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: "#000000",
  },
});
