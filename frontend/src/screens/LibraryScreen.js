import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
  Image,
  Modal,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import SongCard from "../components/SongCard";
import AddToPlaylistModal from "../components/AddToPlaylistModal";
import ArtistModal from "../components/ArtistModal";
import PlaylistModal from "../components/PlaylistModal";
import CreatePlaylistModal from "../components/CreatePlaylistModal";
import { colors, fonts } from "../theme/colors";
import { api } from "../api/client";
import { useAudio } from "../context/AudioContext";
import { useUser } from "../context/UserContext";
import { useResponsive } from "../context/ResponsiveContext";
import { auth, getRecentlyPlayed, subscribeRecentlyPlayed, removeRecentlyPlayed } from "../services/firebase";

export default function LibraryScreen() {
  const navigation = useNavigation();
  const { isDesktop, isTablet, isPhone } = useResponsive();
  const {
    userProfile,
    openProfile,
    likedSongs,
    playlists: rtdbPlaylists,
    recentlyPlayed: rtdbRecentlyPlayed,
    createPlaylist,
    deletePlaylist,
    removeTrackFromPlaylist,
  } = useUser();

  const [activeTab, setActiveTab] = useState("playlists"); // "playlists" | "favorites" | "history"
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [loadingPlaylistDetails, setLoadingPlaylistDetails] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState(null);
  const [selectedArtistForModal, setSelectedArtistForModal] = useState(null);
  const [localRecentlyPlayed, setLocalRecentlyPlayed] = useState([]);

  const { currentUser } = useUser();

  // Subscribe to real-time listening history from Firebase Realtime Database
  useEffect(() => {
    const uid = currentUser?.uid || auth.currentUser?.uid || "guest";
    getRecentlyPlayed(uid).then((items) => {
      if (Array.isArray(items) && items.length > 0) {
        setLocalRecentlyPlayed(items);
      }
    }).catch(() => {});

    const unsub = subscribeRecentlyPlayed(uid, (items) => {
      if (Array.isArray(items)) {
        setLocalRecentlyPlayed(items);
      }
    });

    return () => unsub();
  }, [currentUser]);

  const playlists = rtdbPlaylists || [];
  const favorites = likedSongs || [];
  const rawHistory = localRecentlyPlayed.length > 0 ? localRecentlyPlayed : (rtdbRecentlyPlayed || []);
  const isLoading = false;

  const { currentTrack, playTrack } = useAudio();

  const removeFromHistory = useCallback(async (track) => {
    const uid = currentUser?.uid || auth.currentUser?.uid || "guest";
    const vid = track.video_id || track.videoId;
    if (!vid) return;
    setLocalRecentlyPlayed((prev) => prev.filter((t) => (t.video_id || t.videoId) !== vid));
    try {
      await removeRecentlyPlayed(uid, vid);
    } catch (err) {
      console.warn("Failed to remove from history:", err);
    }
  }, [currentUser]);

  const openPlaylist = (playlist) => {
    setSelectedPlaylist(playlist);
  };

  const handleCreatePlaylist = async (name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    try {
      const res = await createPlaylist(trimmed);
      if (res) {
        setShowCreateModal(false);
        openPlaylist(res);
      }
    } catch (err) {
      console.warn("Failed to create playlist:", err);
    }
  };

  const handleDeletePlaylist = async (playlistId) => {
    const doDelete = async () => {
      try {
        await deletePlaylist(playlistId);
        setSelectedPlaylist(null);
      } catch (err) {
        console.warn("Failed to delete playlist:", err);
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm("Are you sure you want to delete this playlist?")) {
        await doDelete();
      }
    } else {
      Alert.alert(
        "Delete Playlist",
        "Are you sure you want to delete this playlist? This action cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: doDelete },
        ]
      );
    }
  };

  const handleRemoveTrack = async (playlistId, videoId) => {
    try {
      await removeTrackFromPlaylist(playlistId, videoId);
      setSelectedPlaylist((prev) => {
        if (!prev) return null;
        const updatedTracks = (prev.tracks || []).filter(
          (t) => (t.video_id || t.videoId) !== videoId
        );
        return {
          ...prev,
          tracks: updatedTracks,
          track_count: updatedTracks.length,
        };
      });
    } catch (err) {
      console.warn("Failed to remove track:", err);
    }
  };

  const handlePlayWholePlaylist = (tracks, startIndex = 0) => {
    if (!tracks || tracks.length === 0) return;
    const formatted = tracks.map((t) => ({
      ...t,
      videoId: t.video_id || t.videoId,
    }));
    playTrack(formatted[startIndex], formatted, startIndex);
  };

  const handleShufflePlaylist = (tracks) => {
    if (!tracks || tracks.length === 0) return;
    const formatted = tracks.map((t) => ({
      ...t,
      videoId: t.video_id || t.videoId,
    }));
    const shuffled = [...formatted].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled, 0);
  };

  // Merged listening history removing duplicate plays and sorting by Latest
  const mergedHistory = useMemo(() => {
    const raw = rawHistory;
    const map = new Map();

    for (const item of raw) {
      const id = item.video_id || item.videoId;
      if (!id) continue;

      if (!map.has(id)) {
        map.set(id, {
          ...item,
          videoId: id,
          video_id: id,
          play_count: item.play_count || 1,
          last_played: item.playedAt || item.played_at || item.timestamp || 0,
        });
      } else {
        const existing = map.get(id);
        existing.play_count = (existing.play_count || 1) + 1;
        const itemTime = item.playedAt || item.played_at || item.timestamp;
        if (itemTime && (!existing.last_played || itemTime > existing.last_played)) {
          existing.last_played = itemTime;
        }
      }
    }

    const list = Array.from(map.values());
    return list.sort((a, b) => {
      const timeA = new Date(a.last_played || 0).getTime();
      const timeB = new Date(b.last_played || 0).getTime();
      return timeB - timeA;
    });
  }, [rawHistory]);

  return (
    <View style={styles.container}>
      {/* Header Profile Row */}
      <View style={styles.header}>
        <View style={[styles.headerInner, (isDesktop || isTablet) && styles.desktopHeaderInner]}>
          <View style={styles.profileRow}>
            <Text style={styles.profileName}>Your Library</Text>

            {/* User profile icon on right side */}
            <TouchableOpacity
              style={[
                styles.avatarContainer,
                userProfile?.avatarColor && { backgroundColor: userProfile.avatarColor },
              ]}
              onPress={() => openProfile && openProfile()}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {userProfile?.avatar && userProfile.avatar !== "initial" ? (
                userProfile.avatar.startsWith("http") ? (
                  <Image
                    source={{ uri: userProfile.avatar }}
                    style={styles.avatarImage}
                    resizeMode="cover"
                  />
                ) : (
                  <Ionicons name={userProfile.avatar} size={16} color="#000000" />
                )
              ) : (
                <Text style={styles.avatarText}>
                  {(userProfile?.username?.[0] || "U").toUpperCase()}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={[styles.libraryInner, (isDesktop || isTablet) && styles.desktopLibraryInner]}>
        {/* Spotify Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow} style={styles.tabsRowContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "playlists" && styles.activeTabButton]}
          onPress={() => setActiveTab("playlists")}
        >
          <Text style={[styles.tabText, activeTab === "playlists" && styles.activeTabText]}>
            Playlists ({playlists.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === "favorites" && styles.activeTabButton]}
          onPress={() => {
            setActiveTab("favorites");
            setSelectedPlaylist(null);
          }}
        >
          <Text style={[styles.tabText, activeTab === "favorites" && styles.activeTabText]}>
            Liked Songs ({favorites.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === "history" && styles.activeTabButton]}
          onPress={() => {
            setActiveTab("history");
            setSelectedPlaylist(null);
          }}
        >
          <Text style={[styles.tabText, activeTab === "history" && styles.activeTabText]}>
            Recently Played
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Content */}
      <View style={{ flex: 1, justifyContent: "flex-start" }}>
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : activeTab === "playlists" ? (
        /* Playlists List View */
        <FlatList
          data={playlists}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.playlistsListHeader}>
              <Text style={styles.sectionHeader}>Your Playlists</Text>
              <TouchableOpacity
                style={styles.createPlBtn}
                onPress={() => setShowCreateModal(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={18} color="#000000" />
                <Text style={styles.createPlBtnText}>New Playlist</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.playlistCardRow}
              onPress={() => openPlaylist(item)}
              activeOpacity={0.7}
            >
              {item.preview_artwork ? (
                <Image
                  source={{ uri: item.preview_artwork }}
                  style={styles.playlistRowThumb}
                />
              ) : (
                <View style={[styles.playlistRowThumb, styles.playlistRowThumbFallback]}>
                  <Ionicons name="musical-notes" size={24} color={colors.primary} />
                </View>
              )}
              <View style={styles.playlistRowInfo}>
                <Text style={styles.playlistRowTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.playlistRowCount}>
                  {item.track_count || 0} {item.track_count === 1 ? "track" : "tracks"}
                  {item.description ? ` • ${item.description}` : ""}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="folder-open-outline" size={44} color={colors.textMuted} />
              <Text style={styles.emptyText}>No playlists created yet</Text>
              <Text style={styles.emptySub}>
                Create custom playlists to group and save your favorite tracks!
              </Text>
              <TouchableOpacity
                style={styles.createEmptyBtn}
                onPress={() => setShowCreateModal(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={18} color="#000000" style={{ marginRight: 6 }} />
                <Text style={styles.createEmptyBtnText}>Create Your First Playlist</Text>
              </TouchableOpacity>
            </View>
          }
          ListFooterComponent={<View style={{ height: isDesktop || isTablet ? 24 : 140 }} />}
        />
      ) : activeTab === "history" ? (
        <FlatList
          data={mergedHistory}
          keyExtractor={(item, index) => `${item.video_id || item.videoId}_${index}`}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={<View style={{ height: 8 }} />}
          renderItem={({ item, index }) => (
            <View style={styles.historyItemRow}>
              <View style={{ flex: 1 }}>
                <SongCard
                  track={{
                    ...item,
                    videoId: item.video_id || item.videoId,
                  }}
                  layout="row"
                  showRank={false}
                  isActive={currentTrack?.videoId === (item.video_id || item.videoId)}
                  onAddToPlaylist={(t) => setAddToPlaylistTrack(t)}
                  onPress={() =>
                    playTrack(
                      { ...item, videoId: item.video_id || item.videoId },
                      mergedHistory.map((h) => ({ ...h, videoId: h.video_id || h.videoId })),
                      index
                    )
                  }
                />
              </View>
              <TouchableOpacity
                style={styles.historyRemoveBtn}
                onPress={() => removeFromHistory(item)}
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle" size={22} color="rgba(255,255,255,0.25)" />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No listening history yet.</Text>
              <Text style={styles.emptySub}>
                Tracks you play will appear here and shape your daily recommendations.
              </Text>
            </View>
          }
          ListFooterComponent={<View style={{ height: isDesktop || isTablet ? 24 : 140 }} />}
        />
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item, index) => `${item.video_id}_${index}`}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <SongCard
              track={{ ...item, videoId: item.video_id }}
              layout="row"
              showRank={false}
              isActive={currentTrack?.videoId === item.video_id}
              onAddToPlaylist={(t) => setAddToPlaylistTrack(t)}
              onPress={() =>
                playTrack(
                  { ...item, videoId: item.video_id },
                  favorites.map((f) => ({ ...f, videoId: f.video_id })),
                  index
                )
              }
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="heart-outline" size={44} color={colors.textMuted} />
              <Text style={styles.emptyText}>No liked songs yet</Text>
              <Text style={styles.emptySub}>
                Tap the heart icon on any song to save it to your liked songs.
              </Text>
            </View>
          }
          ListFooterComponent={<View style={{ height: isDesktop || isTablet ? 24 : 140 }} />}
        />
      )}
      </View>
      </View>

      {/* Spotify-style Centered Full-Screen Create Playlist Modal */}
      <CreatePlaylistModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreatePlaylist}
        existingPlaylists={playlists}
      />

      {/* Add To Playlist Modal */}
      <AddToPlaylistModal
        visible={!!addToPlaylistTrack}
        onClose={() => setAddToPlaylistTrack(null)}
        track={addToPlaylistTrack}
        onSuccess={() => loadLibrary()}
      />

      {/* Artist Profile & Discography Modal */}
      <ArtistModal
        visible={!!selectedArtistForModal}
        onClose={() => setSelectedArtistForModal(null)}
        artistName={selectedArtistForModal}
      />

      {/* Separate Fullscreen Playlist Preview Modal */}
      <PlaylistModal
        visible={!!selectedPlaylist}
        playlist={selectedPlaylist}
        onClose={() => setSelectedPlaylist(null)}
        onDeletePlaylist={(playlistId) => {
          setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
          setSelectedPlaylist(null);
        }}
        onTrackRemoved={(playlistId, videoId) => {
          setPlaylists((prev) =>
            prev.map((p) =>
              p.id === playlistId
                ? { ...p, track_count: Math.max(0, (p.track_count || 1) - 1) }
                : p
            )
          );
        }}
        onPlaylistUpdated={(updated) => {
          setPlaylists((prev) =>
            prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    userSelect: "none",
  },
  libraryInner: {
    flex: 1,
    width: "100%",
    userSelect: "none",
  },
  tabsRowContainer: {
    flexShrink: 0,
  },
  desktopLibraryInner: {
    width: "100%",
    paddingHorizontal: 16,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "web" ? 10 : 14,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    backgroundColor: colors.background,
  },
  headerInner: {
    width: "100%",
  },
  desktopHeaderInner: {
    width: "100%",
    paddingHorizontal: 16,
  },
  profileRow: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  avatarContainer: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
    overflow: "hidden",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
  },
  profileName: {
    fontFamily: fonts.bold,
    fontSize: 24,
    color: colors.text,
    letterSpacing: -0.4,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  statNumber: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
  },
  statLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  tabsRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
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
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  topArtistsSection: {
    marginBottom: 14,
  },
  topArtistsHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 12,
  },
  topArtistsTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
  },
  topArtistsSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  sectionHeader: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
    marginBottom: 10,
  },
  artistCardsScroll: {
    paddingVertical: 2,
    gap: 12,
  },
  artistCard: {
    width: 114,
    alignItems: "center",
    backgroundColor: "#181818",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  artistAvatarWrap: {
    position: "relative",
    width: 72,
    height: 72,
    marginBottom: 10,
  },
  artistAvatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#282828",
  },
  artistAvatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  artistInitialText: {
    fontFamily: fonts.bold,
    fontSize: 26,
    color: "#FFFFFF",
  },
  artistRankBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 2,
    borderColor: "#181818",
  },
  rankGold: {
    backgroundColor: "#F59B23",
  },
  rankSilver: {
    backgroundColor: "#2EBDD7",
  },
  rankBronze: {
    backgroundColor: colors.primary,
  },
  artistRankText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: "#000000",
  },
  artistCardName: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: "#FFFFFF",
    textAlign: "center",
    width: "100%",
    marginTop: 4,
  },
  artistCardSub: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: "#FFFFFF",
    marginTop: 2,
    textAlign: "center",
  },
  artistName: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: "#FFFFFF",
    textAlign: "center",
    width: "100%",
    marginTop: 4,
  },
  artistPlays: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: "#FFFFFF",
    marginTop: 2,
    textAlign: "center",
  },
  historySectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  historyFilterGroup: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: 3,
    gap: 4,
  },
  historyFilterPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  historyFilterPillActive: {
    backgroundColor: colors.primary,
  },
  historyFilterText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.textSecondary,
  },
  historyFilterTextActive: {
    color: "#000000",
    fontFamily: fonts.bold,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
    marginTop: 10,
  },
  emptySub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 4,
    paddingHorizontal: 32,
  },

  // Playlists UI Styles
  playlistsListHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  createPlBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  createPlBtnText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: "#000000",
  },
  playlistCardRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  playlistRowThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  playlistRowThumbFallback: {
    backgroundColor: colors.surfaceCard,
    alignItems: "center",
    justifyContent: "center",
  },
  playlistRowInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  playlistRowTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
  },
  playlistRowCount: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  createEmptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 18,
  },
  createEmptyBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
  },

  // Playlist Detail View
  playlistDetailHeader: {
    marginBottom: 16,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
    paddingVertical: 4,
  },
  backButtonText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.text,
  },
  playlistHeroCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  playlistHeroArtwork: {
    width: 96,
    height: 96,
    borderRadius: 10,
  },
  playlistHeroArtworkFallback: {
    backgroundColor: colors.surfaceCard,
    alignItems: "center",
    justifyContent: "center",
  },
  playlistHeroInfo: {
    flex: 1,
    marginLeft: 16,
  },
  playlistHeroTag: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.primary,
    letterSpacing: 1,
  },
  playlistHeroTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
    marginTop: 2,
  },
  playlistHeroDesc: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  playlistHeroMeta: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 6,
  },
  playlistActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 16,
  },
  playAllButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 6,
  },
  playAllText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
  },
  shuffleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceVariant,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  deleteButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(233, 20, 41, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "auto",
  },
  disabledBtn: {
    opacity: 0.4,
  },
  playlistTracksHeader: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
    marginBottom: 8,
    marginTop: 6,
  },
  playlistTrackRowWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  removeTrackBtn: {
    paddingHorizontal: 10,
    paddingVertical: 12,
  },

  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  createModalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  createModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  createModalTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
  },
  modalInput: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 8,
    paddingHorizontal: 14,
    height: 44,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: 12,
  },
  modalInputDesc: {
    height: 72,
    paddingTop: 10,
    textAlignVertical: "top",
  },
  modalButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 8,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modalCancelText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.textSecondary,
  },
  modalConfirmBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalConfirmText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: "#000000",
  },
  historyItemRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  historyRemoveBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -4,
  },
});
