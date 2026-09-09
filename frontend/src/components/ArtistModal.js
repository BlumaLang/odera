import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Platform,
  FlatList,
  StatusBar,
  ScrollView,
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

const { width, height } = Dimensions.get("window");
const PAGE_SIZE = 20;

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

  // Fetch artist photo and official songs
  useEffect(() => {
    if (!visible || !cleanName) return;

    let isMounted = true;

    // Track user movement on opening artist
    if (recordArtistMovement) {
      recordArtistMovement(cleanName);
    }

    const cached = artistDataCache.get(cleanName);
    if (cached) {
      if (cached.image) setArtistImage(cached.image);
      else if (initialPhoto) setArtistImage(initialPhoto);
      if (cached.songs && cached.songs.length > 0) {
        setSongs(cached.songs);
        setHasMore(cached.hasMore);
        setIsLoading(false);
        if (cached.image) return;
      }
    }

    setIsLoading(true);
    setIsLoadingMore(false);
    setHasMore(true);
    pageRef.current = 0;

    // 1. Resolve photo from local cache, props, or API
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


    // 2. Fetch top songs using official artist endpoint with deduplication
    api
      .getArtistSongs(cleanName, 0, PAGE_SIZE)
      .then((data) => {
        if (isMounted) {
          const list = data.tracks || data.results || [];
          const deduped = dedupeArtistSongs([], list);
          setSongs(deduped);
          const more = Boolean(data.has_more !== false && list.length > 0);
          setHasMore(more);
          pageRef.current = 0;
          artistDataCache.set(cleanName, {
            ...(artistDataCache.get(cleanName) || {}),
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
          artistDataCache.set(cleanName, {
            ...(artistDataCache.get(cleanName) || {}),
            songs: updated,
            hasMore: Boolean(data.has_more !== false && uniqueNew.length > 0),
            page: nextPage,
          });
          return updated;
        });
        if (data.has_more === false) {
          setHasMore(false);
        }
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.warn("Error loading more artist tracks:", err);
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
          <Image source={{ uri: artistImage }} style={styles.heroImage} resizeMode="cover" />
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
          <Text style={styles.listenerText}>
            Top Indian & Global Streaming Artist
          </Text>
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
  ), [artistImage, cleanName, isFav, handleShuffle, handlePlayAll]);

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
            <Text style={styles.endOfListText}>You've reached the end</Text>
          </View>
        )}
        <View style={{ height: 80 }} />
      </View>
    );
  }, [isLoadingMore, hasMore, songs.length]);

  // Memoized Empty
  const emptyComponent = useMemo(() => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading tracks for {cleanName}...</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="musical-notes-outline" size={40} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>No songs found</Text>
        <Text style={styles.emptySub}>Could not load songs for this artist right now.</Text>
      </View>
    );
  }, [isLoading, cleanName]);

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
          onEndReachedThreshold={0.5}
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
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textSecondary,
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
});
