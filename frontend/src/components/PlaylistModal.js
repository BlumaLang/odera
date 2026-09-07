import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  Modal,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import SongCard from "./SongCard";
import AddToPlaylistModal from "./AddToPlaylistModal";
import CreatePlaylistModal from "./CreatePlaylistModal";
import { colors, fonts } from "../theme/colors";
import { api } from "../api/client";
import { useAudio, fisherYatesShuffle } from "../context/AudioContext";
import { useResponsive } from "../context/ResponsiveContext";

export default function PlaylistModal({
  visible,
  onClose,
  playlist,
  onDeletePlaylist,
  onTrackRemoved,
  onPlaylistUpdated,
}) {
  const { isDesktop, isTablet } = useResponsive();
  const { currentTrack, playTrack, setShuffle } = useAudio();

  const [playlistData, setPlaylistData] = useState(playlist || null);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Sync state with playlist prop and refresh details from backend
  useEffect(() => {
    if (!visible || !playlist?.id) return;

    setPlaylistData(playlist);
    let isMounted = true;
    setIsLoadingTracks(true);

    api
      .getPlaylistDetails(playlist.id)
      .then((res) => {
        if (isMounted && res?.playlist) {
          setPlaylistData(res.playlist);
          if (onPlaylistUpdated) {
            onPlaylistUpdated(res.playlist);
          }
        }
      })
      .catch((err) => {
        console.warn("Failed to load playlist details in modal:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingTracks(false);
      });

    return () => {
      isMounted = false;
    };
  }, [visible, playlist?.id]);

  const handlePlayAll = useCallback(
    (startIndex = 0) => {
      const tracks = playlistData?.tracks || [];
      if (tracks.length === 0) return;
      const formatted = tracks.map((t) => ({
        ...t,
        videoId: t.video_id || t.videoId,
      }));
      playTrack(formatted[startIndex], formatted, startIndex);
    },
    [playlistData?.tracks, playTrack]
  );

  const handleShuffle = useCallback(() => {
    const tracks = playlistData?.tracks || [];
    if (tracks.length === 0) return;
    const formatted = tracks.map((t) => ({
      ...t,
      videoId: t.video_id || t.videoId,
    }));
    const shuffled = fisherYatesShuffle(formatted);
    if (setShuffle) setShuffle(true);
    playTrack(shuffled[0], shuffled, 0);
  }, [playlistData?.tracks, playTrack, setShuffle]);

  const doDelete = useCallback(async () => {
    if (!playlistData?.id) return;
    try {
      await api.deletePlaylist(playlistData.id);
      if (onDeletePlaylist) {
        onDeletePlaylist(playlistData.id);
      }
      onClose();
    } catch (err) {
      console.warn("Failed to delete playlist:", err);
    }
  }, [playlistData?.id, onDeletePlaylist, onClose]);

  const handleDelete = useCallback(() => {
    setShowDeleteModal(true);
  }, []);

  const handleRemoveTrack = useCallback(
    async (videoId) => {
      if (!playlistData?.id) return;
      try {
        await api.removeTrackFromPlaylist(playlistData.id, videoId);
        const updatedTracks = (playlistData.tracks || []).filter(
          (t) => (t.video_id || t.videoId) !== videoId
        );
        const updated = {
          ...playlistData,
          tracks: updatedTracks,
          track_count: updatedTracks.length,
        };
        setPlaylistData(updated);

        if (onTrackRemoved) {
          onTrackRemoved(playlistData.id, videoId);
        }
        if (onPlaylistUpdated) {
          onPlaylistUpdated(updated);
        }
      } catch (err) {
        console.warn("Failed to remove track from playlist:", err);
      }
    },
    [playlistData, onTrackRemoved, onPlaylistUpdated]
  );

  const handleRenamePlaylist = useCallback(
    async (newName) => {
      const trimmed = (newName || "").trim();
      if (!playlistData?.id || !trimmed) return;
      try {
        const res = await api.updatePlaylist(playlistData.id, { name: trimmed });
        const updated = {
          ...playlistData,
          name: trimmed,
        };
        setPlaylistData(updated);
        if (onPlaylistUpdated) {
          onPlaylistUpdated(res?.playlist || updated);
        }
      } catch (err) {
        console.warn("Failed to rename playlist:", err);
      }
    },
    [playlistData, onPlaylistUpdated]
  );

  if (!visible && !playlistData) return null;

  const tracks = playlistData?.tracks || [];
  const trackCount = tracks.length || playlistData?.track_count || 0;
  const firstTrackArtwork = tracks[0]?.artwork_url || tracks[0]?.thumbnail || "";
  const artwork =
    playlistData?.cover_url ||
    playlistData?.preview_artwork ||
    firstTrackArtwork ||
    null;

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <View style={styles.container}>
        <StatusBar translucent={true} backgroundColor="transparent" barStyle="light-content" />

        {/* Top Header Bar with Normal Back Button */}
        <View style={[styles.topBar, (isDesktop || isTablet) && styles.desktopTopBar]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Back to Library"
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.topBarTitleWrap}>
            <Text style={styles.topBarTitle} numberOfLines={1}>
              {playlistData?.name || "Playlist"}
            </Text>
          </View>

          <View style={styles.topBarActions}>
            <TouchableOpacity
              style={styles.deleteHeaderBtn}
              onPress={handleDelete}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Delete Playlist"
            >
              <Ionicons name="trash-outline" size={19} color={colors.error} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Main Content Area */}
        <View style={[styles.contentWrap, (isDesktop || isTablet) && styles.desktopContentWrap]}>
          <FlatList
            data={tracks}
            keyExtractor={(item, index) => `${item.video_id || item.videoId}_${index}`}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View style={styles.headerContainer}>
                {/* Hero Card Section */}
                <View
                  style={[
                    styles.heroCard,
                    (isDesktop || isTablet) && styles.heroCardDesktop,
                  ]}
                >
                  {artwork ? (
                    <Image source={{ uri: artwork }} style={styles.heroArtwork} />
                  ) : (
                    <View style={[styles.heroArtwork, styles.heroArtworkFallback]}>
                      <Ionicons name="musical-notes" size={54} color={colors.primary} />
                    </View>
                  )}

                  <View style={styles.heroInfo}>
                    <View style={styles.playlistBadge}>
                      <Text style={styles.playlistBadgeText}>PLAYLIST</Text>
                    </View>

                    <View style={styles.heroTitleRow}>
                      <Text style={styles.heroTitle} numberOfLines={2}>
                        {playlistData?.name}
                      </Text>
                    </View>

                    {playlistData?.description ? (
                      <Text style={styles.heroDesc} numberOfLines={3}>
                        {playlistData.description}
                      </Text>
                    ) : null}

                    <Text style={styles.heroMeta}>
                      {trackCount} {trackCount === 1 ? "track" : "tracks"} • Staytup Music
                    </Text>
                  </View>
                </View>

                {/* Playlist Action Bar: Play All, Shuffle, Edit */}
                <View style={styles.actionsBar}>
                  <TouchableOpacity
                    style={[
                      styles.playAllButton,
                      tracks.length === 0 && styles.disabledBtn,
                    ]}
                    disabled={tracks.length === 0}
                    onPress={() => handlePlayAll(0)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="play" size={20} color="#000000" style={{ marginRight: 6 }} />
                    <Text style={styles.playAllText}>Play All</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.shuffleButton,
                      tracks.length === 0 && styles.disabledBtn,
                    ]}
                    disabled={tracks.length === 0}
                    onPress={handleShuffle}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="shuffle" size={22} color={colors.text} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.renameActionButton}
                    onPress={() => setShowRenameModal(true)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Edit Playlist"
                  >
                    <Ionicons name="pencil-outline" size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>

                {/* Tracks Header */}
                <View style={styles.tracksHeaderRow}>
                  <Text style={styles.tracksHeaderText}>Tracks</Text>
                  {isLoadingTracks && (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 10 }} />
                  )}
                </View>
              </View>
            }
            renderItem={({ item, index }) => (
              <View style={styles.trackRowWrapper}>
                <View style={{ flex: 1 }}>
                  <SongCard
                    track={{
                      ...item,
                      videoId: item.video_id || item.videoId,
                    }}
                    layout="row"
                    showRank={false}
                    isActive={currentTrack?.videoId === (item.video_id || item.videoId)}
                    onPress={() => handlePlayAll(index)}
                    onAddToPlaylist={(t) => setAddToPlaylistTrack(t)}
                  />
                </View>

                <TouchableOpacity
                  style={styles.removeTrackBtn}
                  onPress={() => handleRemoveTrack(item.video_id || item.videoId)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Remove track from playlist"
                >
                  <Ionicons name="remove-circle-outline" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              isLoadingTracks ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.loadingText}>Loading playlist songs...</Text>
                </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="musical-notes-outline" size={48} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>This playlist is empty</Text>
                  <Text style={styles.emptySub}>
                    Add songs using the '+' icon on any track or from search.
                  </Text>
                </View>
              )
            }
            ListFooterComponent={<View style={{ height: isDesktop || isTablet ? 40 : 130 }} />}
          />
        </View>

        {/* Add to Playlist Modal (if user wants to add a track from this playlist to another) */}
        <AddToPlaylistModal
          visible={!!addToPlaylistTrack}
          onClose={() => setAddToPlaylistTrack(null)}
          track={addToPlaylistTrack}
        />

        {/* Rename / Edit Playlist Modal */}
        <CreatePlaylistModal
          visible={showRenameModal}
          onClose={() => setShowRenameModal(false)}
          onSubmit={handleRenamePlaylist}
          initialName={playlistData?.name}
          mode="edit"
        />

        {/* Delete Playlist Confirmation Modal */}
        <Modal
          visible={showDeleteModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowDeleteModal(false)}
        >
          <View style={styles.deleteModalBackdrop}>
            <View style={styles.deleteModalCard}>
              <View style={styles.deleteModalIconWrap}>
                <Ionicons name="trash-outline" size={28} color={colors.error} />
              </View>
              <Text style={styles.deleteModalTitle}>Delete Playlist?</Text>
              <Text style={styles.deleteModalDesc}>
                Are you sure you want to delete "{playlistData?.name}"? This action cannot be undone.
              </Text>
              <View style={styles.deleteModalActions}>
                <TouchableOpacity
                  style={styles.deleteModalCancelBtn}
                  onPress={() => setShowDeleteModal(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.deleteModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteModalConfirmBtn}
                  onPress={() => {
                    setShowDeleteModal(false);
                    doDelete();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.deleteModalConfirmText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop:
      Platform.OS === "web"
        ? 16
        : Platform.OS === "android"
        ? (StatusBar.currentHeight || 24) + 10
        : 50,
    paddingBottom: 14,
    paddingHorizontal: 20,
    backgroundColor: "#000000",
    zIndex: 10,
  },
  desktopTopBar: {
    width: "100%",
    backgroundColor: "#000000",
    paddingHorizontal: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitleWrap: {
    flex: 1,
    marginHorizontal: 10,
    alignItems: "center",
  },
  topBarTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
    textAlign: "center",
  },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  deleteHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(235, 67, 53, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  contentWrap: {
    flex: 1,
    width: "100%",
  },
  desktopContentWrap: {
    width: "100%",
    paddingHorizontal: 16,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  headerContainer: {
    marginBottom: 16,
  },
  heroCard: {
    flexDirection: "column",
    alignItems: "center",
    marginBottom: 20,
    paddingVertical: 12,
  },
  heroCardDesktop: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 20,
    gap: 24,
  },
  heroArtwork: {
    width: 170,
    height: 170,
    borderRadius: 14,
    backgroundColor: "#121212",
    marginBottom: 16,
  },
  heroArtworkFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#181818",
  },
  heroInfo: {
    flex: 1,
    alignItems: "center",
  },
  playlistBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(29, 185, 84, 0.18)",
    borderRadius: 4,
    marginBottom: 8,
    alignSelf: "center",
  },
  playlistBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    letterSpacing: 1,
  },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    paddingHorizontal: 16,
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.text,
    textAlign: "center",
  },
  heroEditIcon: {
    marginLeft: 8,
  },
  heroDesc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  heroMeta: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
  },
  actionsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    marginBottom: 24,
  },
  playAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 24,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  playAllText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#000000",
  },
  shuffleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  renameActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  disabledBtn: {
    opacity: 0.4,
  },
  tracksHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 10,
    marginBottom: 10,
  },
  tracksHeaderText: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
  },
  trackRowWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  removeTrackBtn: {
    padding: 8,
    marginLeft: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
    marginTop: 8,
  },
  emptySub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    maxWidth: 280,
  },
  deleteModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  deleteModalCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#181818",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  deleteModalIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(235, 67, 53, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  deleteModalTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  deleteModalDesc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 22,
  },
  deleteModalActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
  },
  deleteModalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  deleteModalCancelText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.text,
  },
  deleteModalConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  deleteModalConfirmText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#FFFFFF",
  },
});
