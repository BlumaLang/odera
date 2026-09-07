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
  const [isSending, setIsSending] = useState(false);
  const [sendFeedback, setSendFeedback] = useState({ text: "", isError: false });
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

  // Auto-clear send feedback message
  useEffect(() => {
    if (!sendFeedback.text) return;
    const timer = setTimeout(() => {
      setSendFeedback({ text: "", isError: false });
    }, 4500);
    return () => clearTimeout(timer);
  }, [sendFeedback]);

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

  const handleSendFriend = async () => {
    const raw = searchQuery.trim();
    if (!raw) return;

    const normalized = raw.toUpperCase();
    if (
      normalized === myFriendCode ||
      raw.toLowerCase() === (userProfile?.username || "").toLowerCase()
    ) {
      setSendFeedback({ text: "You cannot add yourself as a friend.", isError: true });
      return;
    }

    // Check if already friends
    const alreadyFriend = friendsList.find(
      (f) =>
        (f.username || "").toLowerCase() === raw.toLowerCase() ||
        (f.friendCode || "").toUpperCase() === normalized
    );
    if (alreadyFriend) {
      setSendFeedback({ text: `You are already friends with ${alreadyFriend.username}!`, isError: true });
      return;
    }

    // Check if outgoing request already exists
    const alreadySent = outgoingRequests.find(
      (r) =>
        (r.username || "").toLowerCase() === raw.toLowerCase() ||
        (r.friendCode || "").toUpperCase() === normalized
    );
    if (alreadySent) {
      setSendFeedback({ text: `Friend request already pending for ${alreadySent.username}.`, isError: true });
      return;
    }

    setIsSending(true);
    setSendFeedback({ text: "Sending friend request...", isError: false });

    try {
      const results = searchUsers ? await searchUsers(raw) : [];
      const match = results?.find(
        (u) =>
          (u.friendCode || "").toUpperCase() === normalized ||
          (u.username || "").toLowerCase() === raw.toLowerCase()
      ) || (results && results.length === 1 ? results[0] : null);

      if (match) {
        const ok = await sendFriendRequest(match.uid, match);
        if (ok) {
          setSendFeedback({ text: `Friend request sent to ${match.username}!`, isError: false });
          setSearchQuery("");
        } else {
          setSendFeedback({ text: "Could not send friend request. Please try again.", isError: true });
        }
      } else {
        setSendFeedback({ text: `No user found with username or code "${raw}".`, isError: true });
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
                  <View style={[styles.emptyButtonsRow, { marginTop: 28 }]}>
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

              {/* Simple Search & Send Box */}
              <View style={styles.simpleAddSection}>
                <Text style={styles.sectionHeaderTitle}>Add Friend</Text>
                <Text style={styles.sectionSubDesc}>
                  Enter a username or friend code to send a request
                </Text>

                <View style={styles.simpleSearchRow}>
                  <Ionicons name="search" size={17} color={colors.textMuted} style={{ marginLeft: 12, marginRight: 8 }} />
                  <TextInput
                    style={styles.simpleSearchInput}
                    placeholder="Search username or friend code..."
                    placeholderTextColor={colors.textMuted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    onSubmitEditing={handleSendFriend}
                    returnKeyType="send"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        setSearchQuery("");
                        setSendFeedback({ text: "", isError: false });
                      }}
                      style={{ padding: 6 }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.sendActionBtn,
                      (!searchQuery.trim() || isSending) && styles.sendActionBtnDisabled,
                    ]}
                    onPress={handleSendFriend}
                    disabled={!searchQuery.trim() || isSending}
                    activeOpacity={0.8}
                  >
                    {isSending ? (
                      <ActivityIndicator size="small" color="#000000" />
                    ) : (
                      <>
                        <Ionicons name="send" size={13} color="#000000" style={{ marginRight: 5 }} />
                        <Text style={styles.sendActionBtnText}>Send</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {sendFeedback.text.length > 0 && (
                  <View
                    style={[
                      styles.statusMsgWrap,
                      sendFeedback.isError ? styles.statusMsgError : styles.statusMsgSuccess,
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
                        <View style={styles.liveThumbWrap}>
                          <Image
                            source={{ uri: track.artwork_url || track.thumbnail }}
                            style={styles.liveThumbImg}
                            resizeMode="cover"
                          />
                          <View style={styles.liveBadgeOverlay}>
                            <Ionicons name="volume-high" size={11} color="#FFFFFF" />
                          </View>
                        </View>

                        <View style={styles.liveCardInfo}>
                          <View style={styles.liveUserHeader}>
                            <View style={styles.liveDot} />
                            <Text style={styles.liveUserTag} numberOfLines={1}>
                              {friend.username}
                            </Text>
                            <Text style={styles.liveListeningLabel}>is listening</Text>
                          </View>

                          <Text style={styles.liveTrackTitle} numberOfLines={1}>
                            {track.title}
                          </Text>
                          <Text style={styles.liveTrackArtist} numberOfLines={1}>
                            {track.artist || "Unknown Artist"}
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={styles.liveListenAlongBtn}
                          onPress={() => handleListenAlong(track)}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="headset" size={14} color="#000000" style={{ marginRight: 5 }} />
                          <Text style={styles.liveListenAlongBtnText}>Listen Along</Text>
                        </TouchableOpacity>
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
                    style={[styles.primaryActionBtn, { marginTop: 28 }]}
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
  simpleAddSection: {
    width: "100%",
  },
  simpleSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161616",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingRight: 6,
    height: 48,
    marginTop: 12,
  },
  simpleSearchInput: {
    flex: 1,
    height: 48,
    color: "#FFFFFF",
    fontFamily: fonts.medium,
    fontSize: 13,
    paddingHorizontal: 6,
  },
  sendActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1DB954",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  sendActionBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  sendActionBtnText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: "#000000",
  },
  statusMsgWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  statusMsgSuccess: {
    backgroundColor: "rgba(29,185,84,0.1)",
    borderWidth: 1,
    borderColor: "rgba(29,185,84,0.25)",
  },
  statusMsgError: {
    backgroundColor: "rgba(255,82,82,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,82,82,0.25)",
  },
  statusMsgText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    flex: 1,
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
    gap: 12,
  },
  liveCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#131313",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  liveThumbWrap: {
    width: 60,
    height: 60,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#1c1c1c",
  },
  liveThumbImg: {
    width: "100%",
    height: "100%",
  },
  liveBadgeOverlay: {
    position: "absolute",
    bottom: 3,
    right: 3,
    backgroundColor: "#1DB954",
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  liveCardInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 10,
    justifyContent: "center",
  },
  liveUserHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 3,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1DB954",
  },
  liveUserTag: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: "#1DB954",
  },
  liveListeningLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
  },
  liveTrackTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  liveTrackArtist: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  liveListenAlongBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1DB954",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  liveListenAlongBtnText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: "#000000",
  },
});
