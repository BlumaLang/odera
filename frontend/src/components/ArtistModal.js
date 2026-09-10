import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Easing,
  Dimensions,
  Platform,
  FlatList,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { api } from "../api/client";
import { useAudioPlayback, fisherYatesShuffle } from "../context/AudioContext";
import { useUser } from "../context/UserContext";
import { useResponsive } from "../context/ResponsiveContext";
import { resolveLocalArtistImage } from "../theme/artistImages";
import SongCard from "./SongCard";
import AddToPlaylistModal from "./AddToPlaylistModal";
import { registerBackAction } from "../services/navigation";
import { getHighResArtistImage } from "../utils/imageUtils";

const { width, height } = Dimensions.get("window");
const PAGE_SIZE = 10;

// In-memory module cache for artist info and songs to prevent re-fetching and flicker
const artistDataCache = new Map();

// Deduplicate songs by both videoId and normalized title to prevent compilation album spam
function dedupeArtistSongs(existing, incoming) {
  const seenIds = new Set(existing.map((s) => s.videoId || s.video_id || s.id));
  const seenTitles = new Set(
    existing.map((s) =>
      (s.title || "")
        .toLowerCase()
        .replace(/\s*\([^)]*\)/g, "")
        .replace(/\s*\[[^\]]*\]/g, "")
        .replace(/[^a-z0-9]/g, "")
        .trim()
    ).filter(Boolean)
  );
  const deduped = [];
  for (const item of incoming) {
    if (!item) continue;
    const tid = item.videoId || item.video_id || item.id;
    if (tid && seenIds.has(tid)) continue;
    const cleanT = (item.title || "")
      .toLowerCase()
      .replace(/\s*\([^)]*\)/g, "")
      .replace(/\s*\[[^\]]*\]/g, "")
      .replace(/[^a-z0-9]/g, "")
      .trim();
    if (cleanT && seenTitles.has(cleanT)) continue;
    if (tid) seenIds.add(tid);
    if (cleanT) seenTitles.add(cleanT);
    deduped.push(item);
  }
  return deduped;
}

// Skeleton pulse component
function ArtistSongSkeleton() {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.65,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  return (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3, 4, 5, 6].map((k) => (
        <View key={k} style={styles.skeletonRow}>
          <Animated.View style={[styles.skeletonRank, { opacity: pulseAnim }]} />
          <Animated.View style={[styles.skeletonSquare, { opacity: pulseAnim }]} />
          <View style={styles.skeletonTextCol}>
            <Animated.View style={[styles.skeletonLine, { width: 160 + (k % 3) * 35, height: 14, opacity: pulseAnim }]} />
            <Animated.View style={[styles.skeletonLine, { width: 110 + (k % 2) * 20, height: 11, marginTop: 6, opacity: pulseAnim }]} />
          </View>
          <Animated.View style={[styles.skeletonIcon, { opacity: pulseAnim }]} />
        </View>
      ))}
    </View>
  );
}

// Memoized row component so song items do not re-render on audio playback ticks
const ArtistSongRow = React.memo(function ArtistSongRow({
  item,
  index,
  isActive,
  onPlay,
  onAddToPlaylist,
}) {
  return (
    <View style={styles.songRowWrapper}>
      <SongCard
        track={{ ...item, rank: index + 1 }}
        layout="row"
        showRank={true}
        isActive={isActive}
        style={styles.artistSongRow}
        onAddToPlaylist={onAddToPlaylist}
        onPress={onPlay}
        showPlayButton={false}
      />
    </View>
  );
});

export default function ArtistModal({ visible, onClose, artistName, initialPhoto, onSelectArtist, onArtistImageResolved }) {
  const { isDesktop, isTablet } = useResponsive();
  const { currentTrack, playTrack, setShuffle } = useAudioPlayback();
  const { isFavoriteArtist, toggleFavoriteArtist, recordArtistMovement } = useUser();

  const cleanName = (artistName || "").trim();
  const cachedData = cleanName ? artistDataCache.get(cleanName) : null;

  const [artistImage, setArtistImage] = useState(
    initialPhoto || cachedData?.image || resolveLocalArtistImage(cleanName) || null
  );
  const [songs, setSongs] = useState(cachedData?.songs || []);
  const [isLoading, setIsLoading] = useState(!cachedData?.songs?.length);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(cachedData ? cachedData.hasMore : true);
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState(null);
  const [artistInfo, setArtistInfo] = useState(cachedData?.artistInfo || null);
  const pageRef = useRef(cachedData?.page || 0);

  const isFav = isFavoriteArtist(cleanName);
  const currentTrackId = currentTrack?.videoId;

  useEffect(() => {
    if (addToPlaylistTrack) {
      return registerBackAction(() => {
        setAddToPlaylistTrack(null);
        return true;
      });
    }
  }, [addToPlaylistTrack]);

  useEffect(() => {
    if (visible && onClose) {
      return registerBackAction(() => {
        onClose();
        return true;
      });
    }
  }, [visible, onClose]);

  useEffect(() => {
    if (initialPhoto) {
      setArtistImage(initialPhoto);
    }
  }, [initialPhoto]);

  // Fix stale songs: immediately clear songs when artist changes
  useEffect(() => {
    if (!visible || !cleanName) return;
    const cached = artistDataCache.get(cleanName);
    if (cached && cached.songs?.length > 0) {
      // Has cache – show cached data instantly
      setSongs(cached.songs);
      setHasMore(cached.hasMore);
      setIsLoading(false);
      if (cached.image) setArtistImage(cached.image);
      else if (initialPhoto) setArtistImage(initialPhoto);
      if (cached.artistInfo) setArtistInfo(cached.artistInfo);
    } else {
      // No cache – clear everything so previous artist's songs disappear
      setSongs([]);
      setIsLoading(true);
      setHasMore(true);
      setArtistInfo(null);
    }
    pageRef.current = cached?.page || 0;
  }, [cleanName, visible]);

  // Fetch artist photo and official songs
  useEffect(() => {
    if (!visible || !cleanName) return;

    let isMounted = true;

    // Track user movement on opening artist
    if (recordArtistMovement) {
      recordArtistMovement(cleanName);
    }

    // 1. Resolve photo from local cache, props, or API
    const cached = artistDataCache.get(cleanName);
    const initialBest =
      initialPhoto ||
      cached?.image ||
      resolveLocalArtistImage(cleanName) ||
      null;
    if (initialBest) {
      setArtistImage(initialBest);
    }

    // Always fetch latest high-res 500x500 image from DB cache & Staytup API
    api
      .getArtistImage(cleanName)
      .then((res) => {
        const photo = res?.image || res?.image_url;
        if (
          isMounted &&
          photo &&
          !photo.includes("artist-default-music.png") &&
          !photo.includes("default_artist")
        ) {
          setArtistImage(photo);
          if (onArtistImageResolved) {
            onArtistImageResolved(cleanName, photo);
          }
          artistDataCache.set(cleanName, {
            ...(artistDataCache.get(cleanName) || {}),
            image: photo,
          });
        }
      })
      .catch(() => {});

    // 1b. Fetch full artist info (bio, followers, etc.)
    api
      .getArtistInfo(cleanName)
      .then((info) => {
        if (isMounted && info.artist) {
          setArtistInfo(info.artist);
          artistDataCache.set(cleanName, {
            ...(artistDataCache.get(cleanName) || {}),
            artistInfo: info.artist,
          });
          // Update image if we got a better one from info
          if (info.artist.image && !info.artist.image.includes("default")) {
            setArtistImage(info.artist.image);
            if (onArtistImageResolved) {
              onArtistImageResolved(cleanName, info.artist.image);
            }
          }
        }
      })
      .catch(() => {});

    // 2. If no cache, fetch first page of songs
    if (cached?.songs?.length > 0) {
      // Already populated from the cache-clearing effect
      if (isMounted) setIsLoading(false);
      return () => { isMounted = false; };
    }

    setIsLoading(true);
    setIsLoadingMore(false);
    setHasMore(true);
    pageRef.current = 0;

    api
      .getArtistSongs(cleanName, 0, PAGE_SIZE)
      .then((data) => {
        if (isMounted) {
          const list = data.tracks || data.results || [];
          const deduped = dedupeArtistSongs([], list);
          setSongs(deduped);
          
          // Determine has_more: use backend value if available, otherwise infer
          let more;
          if (typeof data.has_more === "boolean") {
            more = data.has_more;
          } else {
            more = list.length >= PAGE_SIZE;
          }
          
          setHasMore(more);
          pageRef.current = 0;
          
          // Get existing cached data to preserve artistInfo
          const existingCache = artistDataCache.get(cleanName) || {};
          artistDataCache.set(cleanName, {
            ...existingCache,
            songs: deduped,
            hasMore: more,
            page: 0,
          });
        }
      })
      .catch(() => {
        if (isMounted) { setSongs([]); setHasMore(false); }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => { isMounted = false; };
  }, [visible, cleanName, recordArtistMovement]);

  // Infinite scroll: fetch next page when user scrolls to bottom
  const handleLoadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMore || songs.length === 0 || !cleanName) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      const data = await api.getArtistSongs(cleanName, nextPage, PAGE_SIZE);
      const newTracks = data.tracks || data.results || [];

      if (newTracks.length > 0) {
        pageRef.current = nextPage;
        setSongs((prev) => {
          const uniqueNew = dedupeArtistSongs(prev, newTracks);
          const updated = [...prev, ...uniqueNew];
          
          // Determine if there are more songs to load
          const noNewSongs = uniqueNew.length === 0;
          const backendSaysNoMore = data.has_more === false;
          const fewerThanRequested = newTracks.length < PAGE_SIZE;
          
          const shouldHaveMore = !noNewSongs && !backendSaysNoMore && !fewerThanRequested;
          
          // Get existing cached data to preserve artistInfo
          const existingCache = artistDataCache.get(cleanName) || {};
          artistDataCache.set(cleanName, {
            ...existingCache,
            songs: updated,
            hasMore: shouldHaveMore,
            page: nextPage,
          });
          
          // Update hasMore state outside of setSongs to avoid stale closure
          if (!shouldHaveMore) {
            setTimeout(() => setHasMore(false), 0);
          }
          
          return updated;
        });
      } else {
        // No new tracks returned - we've reached the end
        setHasMore(false);
      }
    } catch (err) {
      console.warn("Error loading more artist tracks:", err);
      // On error, don't stop trying entirely - user might scroll again
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoading, isLoadingMore, hasMore, songs.length, cleanName]);

  // Play a song and track movement (including collaborators)
  const handlePlaySong = useCallback((item, index) => {
    if (!item) return;
    const collabs = item.artist ? item.artist.split(/,|&|feat\./i).map((s) => s.trim()) : [];
    if (recordArtistMovement) {
      recordArtistMovement(cleanName, collabs);
    }
    playTrack(item, songs, index);
  }, [cleanName, songs, playTrack, recordArtistMovement]);

  // Play all songs starting from the first track
  const handlePlayAll = useCallback(() => {
    if (songs.length === 0) return;
    handlePlaySong(songs[0], 0);
  }, [songs, handlePlaySong]);

  // Shuffle and play all songs
  const handleShuffle = useCallback(() => {
    if (songs.length === 0) return;
    const shuffled = fisherYatesShuffle(songs);
    if (setShuffle) setShuffle(true);
    handlePlaySong(shuffled[0], 0);
  }, [songs, handlePlaySong, setShuffle]);

  // Memoized Header: Prevents header remount on playback ticks
  const headerComponent = useMemo(() => (
    <View>
      {/* Artist Hero Header */}
      <View style={styles.heroSection}>
        {artistImage ? (
          <Image source={{ uri: getHighResArtistImage(artistImage) || artistImage }} style={styles.heroImage} resizeMode="cover" />
        ) : (
          <View style={[styles.heroImage, styles.heroFallback]}>
            <Ionicons name="person" size={72} color={colors.primary} />
          </View>
        )}

        {/* Gradient Overlay */}
        <View style={styles.heroOverlay} />

        {/* Artist Info Text */}
        <View style={styles.heroMeta}>
          <View style={styles.verifiedRow}>
            <Ionicons name="checkmark-circle" size={16} color="#3D91F4" />
            <Text style={styles.verifiedText}>Verified Artist</Text>
          </View>
          <Text style={styles.artistTitle} numberOfLines={2}>
            {cleanName}
          </Text>
          {artistInfo?.monthly_listeners ? (
            <Text style={styles.listenerText}>
              {artistInfo.monthly_listeners.toLocaleString()} monthly listeners
            </Text>
          ) : artistInfo?.follower_count ? (
            <Text style={styles.listenerText}>
              {artistInfo.follower_count.toLocaleString()} followers
            </Text>
          ) : (
            <Text style={styles.listenerText}>
              Top Indian & Global Streaming Artist
            </Text>
          )}
        </View>
      </View>

      {/* Action Row: Follow/Favorite, Shuffle */}
      <View style={styles.actionsRow}>
        {/* Follow / Favorite Button */}
        <TouchableOpacity
          style={[styles.followButton, isFav && styles.followingButton]}
          onPress={() => toggleFavoriteArtist(cleanName, artistImage)}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isFav ? "heart" : "heart-outline"}
            size={18}
            color={isFav ? colors.primary : "#FFFFFF"}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.followButtonText, isFav && styles.followingButtonText]}>
            {isFav ? "Following" : "Follow"}
          </Text>
        </TouchableOpacity>

        <View style={styles.playActionsRight}>
          {/* Shuffle Button */}
          <TouchableOpacity
            style={styles.shuffleButton}
            onPress={handleShuffle}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.8}
          >
            <Ionicons name="shuffle" size={22} color="#AAAAAA" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Popular Songs Section Header */}
      <View style={styles.songsSection}>
        <Text style={styles.sectionTitle}>Popular Songs</Text>
      </View>

    </View>
  ), [artistImage, cleanName, isFav, handleShuffle, handlePlayAll, artistInfo]);

  // Memoized Footer with Related Artists & Collaborators
  const footerComponent = useMemo(() => {
    return (
      <View>
        {isLoadingMore && (
          <View style={styles.loadingMoreFooter}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingMoreText}>Loading more songs...</Text>
          </View>
        )}
        {!isLoadingMore && !hasMore && songs.length > 0 && (
          <View style={styles.endOfListFooter}>
            <Text style={styles.endOfListText}>
              {songs.length} song{songs.length !== 1 ? 's' : ''} loaded
            </Text>
          </View>
        )}
        <View style={{ height: 80 }} />
      </View>
    );
  }, [isLoadingMore, hasMore, songs.length]);

  // Memoized Empty – skeleton while loading, empty state when no songs
  const emptyComponent = useMemo(() => {
    if (isLoading) {
      return <ArtistSongSkeleton />;
    }
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="musical-notes-outline" size={40} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>No songs found</Text>
        <Text style={styles.emptySub}>Could not load songs for this artist right now.</Text>
      </View>
    );
  }, [isLoading]);

  const renderItem = useCallback(
    ({ item, index }) => (
      <ArtistSongRow
        item={item}
        index={index}
        isActive={currentTrackId === item.videoId}
        onPlay={() => handlePlaySong(item, index)}
        onAddToPlaylist={(t) => setAddToPlaylistTrack(t)}
      />
    ),
    [currentTrackId, handlePlaySong]
  );

  if (!visible || !cleanName) return null;

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <View style={styles.container}>
        <StatusBar
          translucent={true}
          backgroundColor="transparent"
          barStyle="light-content"
        />
        {/* Top Floating Bar */}
        <View style={[styles.topFloatingBar, (isDesktop || isTablet) && styles.desktopBar]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle} numberOfLines={1}>
            {cleanName}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Infinite Scrolling List of Songs */}
        <FlatList
          data={songs}
          keyExtractor={(item, idx) => `${item.videoId}_${idx}`}
          ListHeaderComponent={headerComponent}
          ListFooterComponent={footerComponent}
          ListEmptyComponent={emptyComponent}
          renderItem={renderItem}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={1.5}
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, (isDesktop || isTablet) && styles.desktopContent]}
          showsVerticalScrollIndicator={false}
        />

        {/* Add To Playlist Modal */}
        <AddToPlaylistModal
          visible={!!addToPlaylistTrack}
          onClose={() => setAddToPlaylistTrack(null)}
          track={addToPlaylistTrack}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  topFloatingBar: {
    position: "absolute",
    top: Platform.OS === "web" ? 14 : (Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 8 : 44),
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  desktopBar: {
    width: "100%",
    paddingHorizontal: 24,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
    maxWidth: width * 0.6,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  desktopContent: {
    width: "100%",
  },
  heroSection: {
    width: "100%",
    height: Math.min(height * 0.46, 420),
    position: "relative",
    backgroundColor: "#000000",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000",
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    ...(Platform.OS === "web"
      ? {
          backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.3) 65%, rgba(0,0,0,1) 100%)",
        }
      : {}),
  },
  heroMeta: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
  },
  verifiedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  verifiedText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: "#FFFFFF",
  },
  artistTitle: {
    fontFamily: fonts.bold,
    fontSize: Platform.OS === "web" ? 38 : 30,
    color: "#FFFFFF",
    letterSpacing: -0.6,
    marginBottom: 6,
  },
  listenerText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 18,
    width: "100%",
  },
  followButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#777777",
    backgroundColor: "transparent",
  },
  followingButton: {
    borderColor: colors.primary,
    backgroundColor: "rgba(29, 185, 84, 0.12)",
  },
  followButtonText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: "#FFFFFF",
  },
  followingButtonText: {
    color: colors.primary,
  },
  playActionsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  shuffleButton: {
    padding: 8,
  },
  mainPlayButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 4px 14px rgba(29, 185, 84, 0.4)",
  },
  songsSection: {
    paddingHorizontal: 4,
    marginTop: 8,
    width: "100%",
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: "#FFFFFF",
    marginBottom: 14,
    marginHorizontal: 12,
    letterSpacing: -0.3,
  },
  songsList: {
    width: "100%",
    gap: 4,
  },
  artistSongRow: {
    width: "100%",
    paddingHorizontal: 12,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
    marginTop: 10,
  },
  emptySub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  songRowWrapper: {
    width: "100%",
  },
  loadingMoreFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    gap: 10,
  },
  loadingMoreText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  endOfListFooter: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  endOfListText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.4)",
  },
  skeletonContainer: {
    paddingHorizontal: 4,
    marginTop: 8,
  },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  skeletonRank: {
    width: 20,
    height: 14,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginRight: 10,
  },
  skeletonSquare: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginRight: 12,
  },
  skeletonTextCol: {
    flex: 1,
  },
  skeletonLine: {
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  skeletonIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
});
