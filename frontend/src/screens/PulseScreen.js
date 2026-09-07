import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { useAudio } from "../context/AudioContext";
import { useUser } from "../context/UserContext";
import { useResponsive } from "../context/ResponsiveContext";
import {
  subscribeFriendActivity,
  auth,
  getRecentlyPlayed,
  createPulsePost,
  subscribePulseFeed,
} from "../services/firebase";

function getRelativeTime(timestamp) {
  if (!timestamp) return "just now";
  const now = Date.now();
  const diff = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

/**
 * Clean UserAvatar component supporting HTTP image URLs, icon avatars, and initial letters
 */
function UserAvatar({ user, size = 32, fontSize = 12 }) {
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
        flexShrink: 0,
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
        <Ionicons name={iconName} size={Math.round(size * 0.48)} color="#000000" />
      ) : (
        <Text style={{ fontFamily: fonts.bold, fontSize, color: "#000000" }}>
          {initial}
        </Text>
      )}
    </View>
  );
}

// Aspect ratio variations for natural Pinterest staggered waterfall look
const PIN_ASPECT_RATIOS = [0.95, 1.3, 0.75, 1.15, 1.4, 0.85];

function getPinAspectRatio(postId, index) {
  if (!postId) return PIN_ASPECT_RATIOS[index % PIN_ASPECT_RATIOS.length];
  let hash = 0;
  for (let i = 0; i < postId.length; i++) {
    hash = (hash << 5) - hash + postId.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % PIN_ASPECT_RATIOS.length;
  return PIN_ASPECT_RATIOS[idx];
}

export default function PulseScreen({
  onNavigate,
  embedded = false,
  composerOpen,
  onCloseComposer,
}) {
  const { isDesktop, isTablet, width } = useResponsive();
  const { playTrack, currentTrack, isPlaying, togglePlayPause } = useAudio();
  const { friends, userProfile } = useUser();

  const [feedFilter, setFeedFilter] = useState("Following");
  const [posts, setPosts] = useState([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);
  const [friendsActivity, setFriendsActivity] = useState({});

  // Share Composer state
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [recentTracks, setRecentTracks] = useState([]);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);

  const closeComposerModal = () => {
    setShowShareModal(false);
    if (onCloseComposer) onCloseComposer();
  };

  useEffect(() => {
    if (typeof composerOpen === "boolean") {
      setShowShareModal(composerOpen);
      if (composerOpen) {
        setSelectedTrack(currentTrack || null);
      }
    }
  }, [composerOpen, currentTrack]);

  const friendsList = useMemo(() => {
    if (Array.isArray(friends)) return friends;
    if (friends && typeof friends === "object") return Object.values(friends);
    return [];
  }, [friends]);

  // Subscribe to live Realtime Firebase Pulse feed
  useEffect(() => {
    setIsLoadingFeed(true);
    const unsubFeed = subscribePulseFeed((livePosts) => {
      setPosts(livePosts || []);
      setIsLoadingFeed(false);
    }, 60);

    return () => {
      if (typeof unsubFeed === "function") unsubFeed();
    };
  }, []);

  // Subscribe to live friend listening activity for "Listening Now" strip
  useEffect(() => {
    if (friendsList.length === 0) return;
    const unsubs = friendsList.map((f) => {
      if (!f?.uid) return null;
      return subscribeFriendActivity(f.uid, (data) => {
        setFriendsActivity((prev) => ({ ...prev, [f.uid]: data }));
      });
    });
    return () => {
      unsubs.forEach((u) => {
        if (typeof u === "function") u();
      });
    };
  }, [friendsList]);

  // Load recently played for song selector in composer
  useEffect(() => {
    if (!showShareModal) return;
    const uid = auth.currentUser?.uid || userProfile?.uid || "guest";
    getRecentlyPlayed(uid)
      .then((items) => {
        if (Array.isArray(items)) setRecentTracks(items.slice(0, 10));
      })
      .catch(() => {});
  }, [showShareModal, userProfile]);

  // Friends currently listening live
  const liveFriends = useMemo(() => {
    return friendsList.filter((f) => {
      const act = friendsActivity[f.uid];
      return Boolean(act?.isPlaying && act?.track);
    });
  }, [friendsList, friendsActivity]);

  const handlePlayTrack = (track) => {
    if (!track) return;
    const isThisTrack =
      currentTrack &&
      (currentTrack.videoId === track.videoId ||
        currentTrack.id === track.id ||
        currentTrack.videoId === track.video_id);
    if (isThisTrack) {
      if (typeof togglePlayPause === "function") {
        togglePlayPause();
      }
    } else {
      playTrack({
        ...track,
        videoId: track.videoId || track.video_id || track.id,
      });
    }
  };

  const handleCreatePost = async () => {
    const track = selectedTrack || currentTrack;
    if (!track || isSubmittingPost) return;

    setIsSubmittingPost(true);
    const myUid = auth.currentUser?.uid || userProfile?.uid || "guest";
    const myName = userProfile?.username || "You";
    const myAvatar = userProfile?.avatar || userProfile?.photoURL || null;
    const myPhotoURL =
      userProfile?.photoURL || (typeof myAvatar === "string" && myAvatar.startsWith("http") ? myAvatar : null);
    const myColor = userProfile?.avatarColor || colors.primary;

    const newPostData = {
      uid: myUid,
      username: myName,
      author: {
        uid: myUid,
        username: myName,
        displayName: userProfile?.displayName || myName,
        avatar: myAvatar,
        photoURL: myPhotoURL,
        avatarColor: myColor,
      },
      avatar: myAvatar,
      photoURL: myPhotoURL,
      avatarColor: myColor,
      track: {
        videoId: track.videoId || track.video_id || track.id,
        title: track.title,
        artist: track.artist || "Unknown Artist",
        artwork_url:
          track.artwork_url ||
          track.cover_url ||
          track.thumbnail ||
          "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80",
      },
      likes: 0,
    };

    try {
      await createPulsePost(newPostData);
      closeComposerModal();
      setSelectedTrack(null);
    } catch (err) {
      console.warn("Error creating post:", err);
    } finally {
      setIsSubmittingPost(false);
    }
  };

  const currentUid = auth.currentUser?.uid || userProfile?.uid;

  // Responsive column count for Pinterest Masonry layout
  const numColumns = useMemo(() => {
    if (width >= 1280) return 4;
    if (width >= 900) return 3;
    if (width >= 600) return 2;
    return 2; // Mobile dual columns like Pinterest app
  }, [width]);

  // Distribute posts across columns
  const columns = useMemo(() => {
    const cols = Array.from({ length: numColumns }, () => []);
    posts.forEach((post, index) => {
      cols[index % numColumns].push({ post, index });
    });
    return cols;
  }, [posts, numColumns]);

  return (
    <View style={styles.container}>
      {/* Top Header (only when standalone) */}
      {!embedded && (
        <View style={styles.screenHeader}>
          <View style={[styles.innerContent, (isDesktop || isTablet) && styles.desktopInnerContent]}>
            <View style={styles.headerTopRow}>
              <Text style={styles.screenTitle}>Feed</Text>

              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.addCircleBtn}
                  onPress={() => {
                    setSelectedTrack(currentTrack || null);
                    setShowShareModal(true);
                  }}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="add" size={22} color="#000000" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Feed Filter Tabs */}
            <View style={styles.filterRow}>
              {["Following", "For You"].map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, feedFilter === f && styles.filterChipActive]}
                  onPress={() => setFeedFilter(f)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterChipText, feedFilter === f && styles.filterChipTextActive]}>
                    {f}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Main Feed Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, embedded && { paddingTop: 6 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.innerContent, (isDesktop || isTablet) && styles.desktopInnerContent]}>
          {/* 1. Listening Now Strip (If friends are live) */}
          {liveFriends.length > 0 && (
            <View style={styles.liveStripSection}>
              <View style={styles.sectionHeaderRow}>
                <MaterialCommunityIcons name="waveform" size={16} color="#1DB954" style={{ marginRight: 6 }} />
                <Text style={styles.sectionHeaderTitle}>LISTENING NOW</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.liveStripScroll}>
                {liveFriends.map((f) => {
                  const act = friendsActivity[f.uid];
                  const track = act?.track;
                  const isCurrentPlayingThis =
                    currentTrack && track && (currentTrack.videoId === track.videoId || currentTrack.id === track.id);

                  return (
                    <TouchableOpacity
                      key={f.uid}
                      style={[styles.liveFriendCard, isCurrentPlayingThis && styles.liveFriendCardActive]}
                      onPress={() => handlePlayTrack(track)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.liveFriendAvatarWrap}>
                        <UserAvatar user={f} size={30} fontSize={12} />
                        <View style={styles.livePulseDot} />
                      </View>
                      <View style={{ marginLeft: 9, flex: 1 }}>
                        <Text style={styles.liveFriendName} numberOfLines={1}>
                          {f.username || f.displayName || "Friend"}
                        </Text>
                        <Text style={styles.liveFriendTrack} numberOfLines={1}>
                          {track?.title || "Listening to music"}
                        </Text>
                      </View>
                      <View style={styles.livePlayIconWrap}>
                        <Ionicons
                          name={isCurrentPlayingThis && isPlaying ? "pause" : "play"}
                          size={11}
                          color="#000000"
                          style={isCurrentPlayingThis && isPlaying ? {} : { marginLeft: 1 }}
                        />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* 2. Pinterest Gallery Masonry Feed */}
          {isLoadingFeed ? (
            <View style={styles.feedLoadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.feedLoadingText}>Connecting to Feed...</Text>
            </View>
          ) : posts.length === 0 ? (
            <View style={styles.emptyFeedBox}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="musical-notes" size={30} color={colors.primary} />
              </View>
              <Text style={styles.emptyFeedTitle}>Feed is Quiet</Text>
              <Text style={styles.emptyFeedSub}>
                No music shared to the gallery yet. Be the first to share what you're listening to!
              </Text>
              <TouchableOpacity
                style={styles.emptyShareBtn}
                onPress={() => {
                  setSelectedTrack(currentTrack || null);
                  setShowShareModal(true);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="musical-notes" size={16} color="#000000" style={{ marginRight: 6 }} />
                <Text style={styles.emptyShareBtnText}>Share the First Song</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.masonryContainer}>
              {columns.map((columnItems, colIdx) => (
                <View key={`col_${colIdx}`} style={styles.masonryColumn}>
                  {columnItems.map(({ post, index }) => {
                    const postId = post.id || post.postId;
                    const track = post.track;

                    const isMyPost =
                      (post.uid && currentUid && post.uid === currentUid) ||
                      (post.author?.uid && currentUid && post.author?.uid === currentUid) ||
                      (userProfile?.username && post.username === userProfile.username);

                    const resolvedAuthor = {
                      ...post.author,
                      username: post.author?.username || post.username || "User",
                      displayName: post.author?.displayName || post.author?.username || post.username,
                      avatar:
                        (isMyPost ? (userProfile?.avatar || userProfile?.photoURL) : null) ||
                        post.author?.avatar ||
                        post.avatar ||
                        post.photoURL ||
                        post.author?.photoURL ||
                        null,
                      photoURL:
                        (isMyPost ? userProfile?.photoURL : null) ||
                        post.author?.photoURL ||
                        post.photoURL ||
                        null,
                      avatarColor:
                        (isMyPost ? userProfile?.avatarColor : null) ||
                        post.author?.avatarColor ||
                        post.avatarColor ||
                        colors.primary,
                    };

                    const isThisTrackPlaying =
                      currentTrack &&
                      track &&
                      (currentTrack.videoId === track.videoId ||
                        currentTrack.id === track.id ||
                        currentTrack.videoId === track.video_id);
                    const isTrackPlayingNow = isThisTrackPlaying && isPlaying;
                    const aspectRatio = getPinAspectRatio(postId, index);
                    const artworkUri =
                      track?.artwork_url ||
                      track?.cover_url ||
                      track?.thumbnail ||
                      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&q=80";

                    return (
                      <View key={postId} style={styles.pinCard}>
                        {/* Artwork Image Container with Pinterest Rounded Corners & Staggered Ratio */}
                        <TouchableOpacity
                          activeOpacity={0.92}
                          onPress={() => track && handlePlayTrack(track)}
                          style={[styles.pinMediaWrap, { aspectRatio }]}
                        >
                          <Image
                            source={{ uri: artworkUri }}
                            style={styles.pinImage}
                            resizeMode="cover"
                          />

                          {/* Top Right Floating Play / Waveform Button */}
                          <View
                            style={[
                              styles.pinPlayOverlayBtn,
                              isTrackPlayingNow && styles.pinPlayOverlayBtnActive,
                            ]}
                          >
                            {isTrackPlayingNow ? (
                              <MaterialCommunityIcons name="waveform" size={16} color="#000000" />
                            ) : (
                              <Ionicons
                                name="play"
                                size={14}
                                color="#FFFFFF"
                                style={{ marginLeft: 1 }}
                              />
                            )}
                          </View>

                          {/* Dark Vignette at bottom for Song Details */}
                          {track ? (
                            <View style={styles.pinTrackPill}>
                              <Text style={styles.pinTrackTitle} numberOfLines={1}>
                                {track.title}
                              </Text>
                              <Text style={styles.pinTrackArtist} numberOfLines={1}>
                                {track.artist || "Staytup"}
                              </Text>
                            </View>
                          ) : null}
                        </TouchableOpacity>

                        {/* Pin Author Row: Avatar + Username + Time ago */}
                        <View style={styles.pinAuthorRow}>
                          <UserAvatar user={resolvedAuthor} size={22} fontSize={10} />
                          <Text style={styles.pinAuthorName} numberOfLines={1}>
                            @{resolvedAuthor.username}
                          </Text>
                          <Text style={styles.pinDot}>•</Text>
                          <Text style={styles.pinTimeAgo}>
                            {post.timestamp ? getRelativeTime(post.timestamp) : "now"}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ═══════════ COMPOSER MODAL ═══════════ */}
      <Modal
        visible={showShareModal}
        transparent={true}
        animationType="slide"
        onRequestClose={closeComposerModal}
      >
        <View style={styles.modalOverlay}>
          {/* Backdrop Touch to Dismiss */}
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={closeComposerModal}
          />

          <View style={styles.composerCard} onStartShouldSetResponder={() => true}>
            <View style={styles.dragHandle} />

            <View style={styles.composerHeader}>
              <Text style={styles.composerTitle}>Share Music</Text>
              <TouchableOpacity onPress={closeComposerModal} style={styles.composerCloseBtn}>
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ width: "100%", maxHeight: 520 }}>
              {/* Selected Track Preview */}
              <Text style={styles.sectionMiniLabel}>SONG TO SHARE</Text>
              {selectedTrack ? (
                <View style={styles.composerSelectedTrack}>
                  <Image
                    source={{
                      uri:
                        selectedTrack.artwork_url ||
                        selectedTrack.cover_url ||
                        selectedTrack.thumbnail ||
                        "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80",
                    }}
                    style={styles.composerTrackThumb}
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.composerTrackTitle} numberOfLines={1}>
                      {selectedTrack.title}
                    </Text>
                    <Text style={styles.composerTrackArtist} numberOfLines={1}>
                      {selectedTrack.artist}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedTrack(null)}
                    style={{ padding: 4 }}
                  >
                    <Ionicons name="close-circle" size={20} color="#888888" />
                  </TouchableOpacity>
                </View>
              ) : currentTrack ? (
                <TouchableOpacity
                  style={styles.composerCurrentTrackBanner}
                  onPress={() => setSelectedTrack(currentTrack)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="musical-notes" size={16} color={colors.primary} style={{ marginRight: 8 }} />
                  <Text style={styles.composerCurrentTrackText} numberOfLines={1}>
                    Use currently playing: {currentTrack.title}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {/* Quick Pick from Recent */}
              {!selectedTrack && recentTracks.length > 0 && (
                <View style={styles.recentPickSection}>
                  <Text style={styles.recentPickHeading}>Pick from recently played:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 6 }}>
                    {recentTracks.slice(0, 6).map((t, idx) => (
                      <TouchableOpacity
                        key={`recent_${t.videoId || idx}`}
                        style={styles.recentPickChip}
                        onPress={() => setSelectedTrack(t)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.recentPickChipTitle} numberOfLines={1}>
                          {t.title}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Share Button */}
              <TouchableOpacity
                style={[
                  styles.composerShareBtn,
                  ((!selectedTrack && !currentTrack) || isSubmittingPost) && styles.composerShareBtnDisabled,
                ]}
                onPress={handleCreatePost}
                disabled={(!selectedTrack && !currentTrack) || isSubmittingPost}
                activeOpacity={0.85}
              >
                {isSubmittingPost ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={styles.composerShareBtnText}>Post to Feed</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
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
  },
  screenTitle: {
    fontFamily: fonts.bold,
    fontSize: 26,
    color: "#FFFFFF",
    letterSpacing: -0.4,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  addCircleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  filterChipActive: {
    backgroundColor: "#FFFFFF",
  },
  filterChipText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: "#AAAAAA",
  },
  filterChipTextActive: {
    fontFamily: fonts.bold,
    color: "#000000",
  },

  // Main Content
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 14,
    paddingHorizontal: 12,
    paddingBottom: 110,
  },

  // Live Strip
  liveStripSection: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionHeaderTitle: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: "#888888",
    letterSpacing: 0.8,
  },
  liveStripScroll: {
    gap: 10,
    paddingVertical: 2,
  },
  liveFriendCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#141414",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    maxWidth: 240,
  },
  liveFriendCardActive: {
    borderColor: colors.primary,
    backgroundColor: "#162016",
  },
  liveFriendAvatarWrap: {
    position: "relative",
  },
  livePulseDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: "#1DB954",
    borderWidth: 2,
    borderColor: "#000000",
  },
  liveFriendName: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: "#FFFFFF",
  },
  liveFriendTrack: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: "#888888",
  },
  livePlayIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },

  // ════ Pinterest Masonry Layout ════
  masonryContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    width: "100%",
  },
  masonryColumn: {
    flex: 1,
    flexDirection: "column",
    gap: 16,
  },
  pinCard: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  pinMediaWrap: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#181818",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  pinImage: {
    width: "100%",
    height: "100%",
  },
  pinPlayOverlayBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  pinPlayOverlayBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pinTrackPill: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  pinTrackTitle: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: "#FFFFFF",
  },
  pinTrackArtist: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.7)",
    marginTop: 1,
  },
  pinAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    paddingHorizontal: 2,
    gap: 6,
  },
  pinAuthorName: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "#888888",
    flexShrink: 1,
  },
  pinDot: {
    fontSize: 9,
    color: "#555555",
  },
  pinTimeAgo: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: "#666666",
  },

  // Empty & Loading States
  feedLoadingBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  feedLoadingText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 14,
  },
  emptyFeedBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(29, 185, 84, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyFeedTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: "#FFFFFF",
    marginBottom: 8,
  },
  emptyFeedSub: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 380,
    marginBottom: 24,
  },
  emptyShareBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    height: 44,
    borderRadius: 22,
  },
  emptyShareBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
  },

  // Composer Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  composerCard: {
    width: "100%",
    maxWidth: 520,
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
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    marginBottom: 16,
  },
  composerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 16,
  },
  composerTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: "#FFFFFF",
  },
  composerCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  sectionMiniLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: "#888888",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  composerSelectedTrack: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D0D0D",
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  composerTrackThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  composerTrackTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  composerTrackArtist: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "#888888",
    marginTop: 2,
  },
  composerCurrentTrackBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(29, 185, 84, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.25)",
    padding: 10,
    borderRadius: 12,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  composerCurrentTrackText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#1DB954",
    flex: 1,
  },
  recentPickSection: {
    marginTop: 10,
  },
  recentPickHeading: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "#888888",
    marginBottom: 4,
  },
  recentPickChip: {
    backgroundColor: "#202020",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    maxWidth: 160,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  recentPickChipTitle: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: "#CCCCCC",
  },
  composerShareBtn: {
    backgroundColor: colors.primary,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    marginBottom: 10,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  composerShareBtnDisabled: {
    opacity: 0.5,
  },
  composerShareBtnText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#000000",
  },
});
