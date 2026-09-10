import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Platform,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { useResponsive } from "../context/ResponsiveContext";
import { useUser } from "../context/UserContext";
import LikeConfetti from "./LikeConfetti";
import CreatePlaylistModal from "./CreatePlaylistModal";
import { registerBackAction } from "../services/navigation";
import { getHighResArtwork } from "../utils/imageUtils";

export default function AddToPlaylistModal({ visible, onClose, track, onSuccess }) {
  const { isDesktop, isTablet } = useResponsive();
  const {
    playlists: rtdbPlaylists,
    collabPlaylists,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    createPlaylist,
  } = useUser();
  const playlists = useMemo(() => {
    const seen = new Set();
    const result = [];
    // Merge regular playlists
    for (const p of rtdbPlaylists || []) {
      const id = String(p.id || p.collabId || "");
      if (id && !seen.has(id)) {
        seen.add(id);
        result.push(p);
      }
    }
    // Merge collab playlists
    for (const p of collabPlaylists || []) {
      const id = String(p.id || p.collabId || "");
      if (id && !seen.has(id)) {
        seen.add(id);
        result.push(p);
      }
    }
    return result;
  }, [rtdbPlaylists, collabPlaylists]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [addedPlaylists, setAddedPlaylists] = useState({});
  const [statusMessage, setStatusMessage] = useState("");
  const [confettiPlaylistId, setConfettiPlaylistId] = useState(null);
  const [showBannerConfetti, setShowBannerConfetti] = useState(false);

  useEffect(() => {
    if (showCreateModal) {
      return registerBackAction(() => {
        setShowCreateModal(false);
        return true;
      });
    }
  }, [showCreateModal]);

  useEffect(() => {
    if (visible && onClose) {
      return registerBackAction(() => {
        onClose();
        return true;
      });
    }
  }, [visible, onClose]);

  useEffect(() => {
    if (visible) {
      setAddedPlaylists({});
      setStatusMessage("");
      setShowCreateModal(false);
      setConfettiPlaylistId(null);
      setShowBannerConfetti(false);
    }
  }, [visible]);

  const handleAddToPlaylist = async (playlist, isCurrentlyIn) => {
    if (!track) return;
    const vid = track.videoId || track.video_id || track.id;
    try {
      setAddedPlaylists((prev) => ({ ...prev, [playlist.id]: "adding" }));
      if (isCurrentlyIn) {
        const ok = await removeTrackFromPlaylist(playlist.id, vid);
        if (ok) {
          setAddedPlaylists((prev) => ({ ...prev, [playlist.id]: "removed" }));
          setStatusMessage(`Removed from "${playlist.name}"`);
          setTimeout(() => {
            setStatusMessage("");
          }, 2500);
        } else {
          setAddedPlaylists((prev) => ({ ...prev, [playlist.id]: "error" }));
        }
      } else {
        const ok = await addTrackToPlaylist(playlist.id, track);
        if (ok) {
          setAddedPlaylists((prev) => ({ ...prev, [playlist.id]: "done" }));
          setStatusMessage(`Added to "${playlist.name}"`);
          setConfettiPlaylistId(playlist.id);
          setShowBannerConfetti(true);
          if (onSuccess) onSuccess(playlist);
          setTimeout(() => {
            setStatusMessage("");
            setShowBannerConfetti(false);
          }, 2500);
        } else {
          setAddedPlaylists((prev) => ({ ...prev, [playlist.id]: "error" }));
        }
      }
    } catch (err) {
      console.warn("Failed to update track in playlist:", err);
      setAddedPlaylists((prev) => ({ ...prev, [playlist.id]: "error" }));
    }
  };

  const handleCreatePlaylist = async (name, cover = "") => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    try {
      const newPl = await createPlaylist(trimmed, "", [], cover);
      if (newPl) {
        setShowCreateModal(false);
        // Automatically add current track to the newly created playlist
        if (track) {
          await handleAddToPlaylist(newPl);
        }
      }
    } catch (err) {
      console.warn("Failed to create playlist:", err);
    }
  };

  if (!visible) return null;

  return (
    <>
      <Modal
        visible={visible}
        transparent={false}
        animationType="slide"
        onRequestClose={onClose}
        statusBarTranslucent={true}
      >
        <View style={styles.container}>
          <StatusBar translucent backgroundColor="#000000" barStyle="light-content" />

          {/* Clean Full-Width Top Navigation Bar */}
          <View style={[styles.topBar, (isDesktop || isTablet) && styles.desktopTopBar]}>
            <TouchableOpacity
              style={styles.navCloseBtn}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            <Text style={styles.topBarTitle} numberOfLines={1}>
              Add to Playlist
            </Text>

            {/* Quick Action in Top Bar */}
            <TouchableOpacity
              style={styles.topActionBtn}
              onPress={() => setShowCreateModal(true)}
              activeOpacity={0.85}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="add" size={16} color="#000000" style={{ marginRight: 2 }} />
              <Text style={styles.topActionBtnText}>New</Text>
            </TouchableOpacity>
          </View>

          {/* Full Screen Body */}
          <View style={[styles.bodyContent, (isDesktop || isTablet) && styles.desktopBodyContent]}>
            {/* Track Preview Header */}
            {track && (
              <View style={styles.trackPreview}>
                {track.artwork_url || track.thumbnail ? (
                  <Image
                    source={{ uri: getHighResArtwork(track.artwork_url || track.thumbnail) || track.artwork_url || track.thumbnail }}
                    style={styles.trackThumb}
                  />
                ) : (
                  <View style={[styles.trackThumb, styles.thumbFallback]}>
                    <Ionicons name="musical-notes" size={20} color={colors.primary} />
                  </View>
                )}
                <View style={styles.trackInfo}>
                  <Text style={styles.trackTitle} numberOfLines={1}>
                    {track.title}
                  </Text>
                  <Text style={styles.trackArtist} numberOfLines={1}>
                    {track.artist}
                  </Text>
                </View>
              </View>
            )}

            {/* Status Banner */}
            {statusMessage ? (
              <View style={styles.statusBanner}>
                <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                <Text style={styles.statusText}>{statusMessage}</Text>
                {showBannerConfetti && (
                  <View style={styles.bannerConfettiAnchor}>
                    <LikeConfetti onComplete={() => setShowBannerConfetti(false)} />
                  </View>
                )}
              </View>
            ) : null}

            {/* Create New Playlist Action Card */}
            <TouchableOpacity
              style={styles.newPlaylistBtn}
              onPress={() => setShowCreateModal(true)}
              activeOpacity={0.8}
            >
              <View style={styles.plusIconWrap}>
                <Ionicons name="add" size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.newPlaylistText}>Create New Playlist</Text>
            </TouchableOpacity>

            <View style={styles.separator} />

            {/* Playlists List */}
            {loading ? (
              <View style={styles.loaderWrap}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingText}>Loading playlists...</Text>
              </View>
            ) : playlists.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="folder-open-outline" size={44} color={colors.textMuted} />
                <Text style={styles.emptyText}>No playlists yet</Text>
                <Text style={styles.emptySubtext}>
                  Create your first playlist above to save songs
                </Text>
              </View>
            ) : (
              <FlatList
                data={playlists}
                keyExtractor={(item, index) => `${item.id || item.collabId || "pl"}_${index}`}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const trackVid = track?.videoId || track?.video_id || track?.id;
                  const itemTracks = Array.isArray(item.tracks) ? item.tracks : [];
                  const isInitiallyIn = trackVid && itemTracks.some(
                    (t) => (t.videoId || t.video_id || t.id) === trackVid
                  );
                  const status = addedPlaylists[item.id];
                  const isAdded = status === "done" || (isInitiallyIn && status !== "removed");

                  const playlistCover =
                    item.cover_url ||
                    item.preview_artwork ||
                    item.tracks?.[0]?.artwork_url ||
                    item.tracks?.[0]?.thumbnail ||
                    "";
                  const trackCount = itemTracks.length || (item.track_count || 0);

                  return (
                    <TouchableOpacity
                      style={[
                        styles.playlistRow,
                        isAdded && { borderColor: "rgba(29, 185, 84, 0.35)", backgroundColor: "rgba(29, 185, 84, 0.06)" },
                      ]}
                      onPress={() => handleAddToPlaylist(item, isAdded)}
                      activeOpacity={0.7}
                    >
                      {playlistCover ? (
                        <Image
                          source={{ uri: getHighResArtwork(playlistCover) || playlistCover }}
                          style={styles.playlistThumb}
                        />
                      ) : (
                        <View style={[styles.playlistThumb, styles.playlistThumbFallback]}>
                          <Ionicons
                            name="musical-notes"
                            size={18}
                            color={isAdded ? colors.primary : colors.textMuted}
                          />
                        </View>
                      )}
                      <View style={styles.playlistInfo}>
                        <Text
                          style={[
                            styles.playlistName,
                            isAdded && { color: "#FFFFFF" },
                          ]}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                        <Text style={styles.playlistCount}>
                          {trackCount} {trackCount === 1 ? "song" : "songs"}
                        </Text>
                      </View>
                      <View style={styles.actionWrap}>
                        {confettiPlaylistId === item.id && (
                          <LikeConfetti onComplete={() => setConfettiPlaylistId(null)} />
                        )}
                        {status === "adding" ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : isAdded ? (
                          <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                        ) : (
                          <Ionicons
                            name="add-circle-outline"
                            size={24}
                            color={colors.textSecondary}
                          />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Full-Screen Create Playlist Modal */}
      <CreatePlaylistModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreatePlaylist}
        existingPlaylists={playlists}
      />
    </>
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
    paddingHorizontal: 16,
    paddingTop:
      Platform.OS === "web"
        ? 14
        : Platform.OS === "android"
        ? (StatusBar.currentHeight || 24) + 8
        : 46,
    paddingBottom: 14,
    backgroundColor: "#000000",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  desktopTopBar: {
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 24,
  },
  navCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  topActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
  },
  topActionBtnText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: "#000000",
  },
  bodyContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    width: "100%",
  },
  desktopBodyContent: {
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 24,
  },
  trackPreview: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111111",
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  trackThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  thumbFallback: {
    backgroundColor: "#222222",
    alignItems: "center",
    justifyContent: "center",
  },
  trackInfo: {
    flex: 1,
    marginLeft: 12,
  },
  trackTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  trackArtist: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(29, 185, 84, 0.15)",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
    position: "relative",
  },
  statusText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.primary,
    flex: 1,
  },
  bannerConfettiAnchor: {
    position: "absolute",
    right: 20,
    top: "50%",
  },
  newPlaylistBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#111111",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    marginBottom: 16,
  },
  plusIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  newPlaylistText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  separator: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    marginBottom: 8,
  },
  loaderWrap: {
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
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
  emptyText: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: "#FFFFFF",
    marginTop: 12,
  },
  emptySubtext: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: "center",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 40,
    gap: 4,
  },
  playlistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "transparent",
  },
  playlistThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#181818",
  },
  playlistThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#181818",
    borderRadius: 8,
  },
  playlistInfo: {
    flex: 1,
    marginLeft: 14,
  },
  playlistName: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: "#FFFFFF",
  },
  playlistCount: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 3,
  },
  actionWrap: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
});
