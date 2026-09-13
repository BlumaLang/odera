import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Platform,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { api } from "../api/client";
import { useAudioPlayback, fisherYatesShuffle } from "../context/AudioContext";
import { useUser } from "../context/UserContext";
import { useResponsive } from "../context/ResponsiveContext";
import SongCard from "./SongCard";
import AddToPlaylistModal from "./AddToPlaylistModal";
import { registerBackAction } from "../services/navigation";
import { getHighResArtwork, decodeHtml } from "../utils/imageUtils";
import { downloadTrack, isTrackDownloaded } from "../services/offlineStorage";

export default function AlbumModal({ visible, onClose, album, albumId }) {
  const { isDesktop, isTablet } = useResponsive();
  const { currentTrack, playTrack, setShuffle } = useAudioPlayback();
  const { toggleSaveAlbum, isAlbumSaved } = useUser();

  const [albumData, setAlbumData] = useState(album || null);
  const [loading, setLoading] = useState(!album?.tracks?.length);
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const activeAlbumId = String(albumId || album?.id || album?.album_id || "");

  useEffect(() => {
    if (visible && onClose) {
      return registerBackAction(() => {
        onClose();
        return true;
      });
    }
  }, [visible, onClose]);

  useEffect(() => {
    if (!visible) return;

    if (album?.tracks?.length) {
      setAlbumData(album);
      setLoading(false);
      return;
    }

    if (activeAlbumId) {
      setLoading(true);
      api.getAlbumDetails(activeAlbumId)
        .then((res) => {
          if (res) {
            setAlbumData(res);
          } else if (album) {
            setAlbumData(album);
          }
        })
        .catch(() => {
          if (album) setAlbumData(album);
        })
        .finally(() => setLoading(false));
    }
  }, [visible, activeAlbumId, album]);

  const tracks = useMemo(() => {
    const raw = albumData?.tracks || [];
    return raw.map((t) => ({
      ...t,
      videoId: t.videoId || t.video_id || t.id,
      video_id: t.videoId || t.video_id || t.id,
      title: decodeHtml(t.title || t.name || ""),
      artist: decodeHtml(t.artist || albumData?.artist || ""),
      album: decodeHtml(albumData?.title || albumData?.name || t.album || ""),
      artwork_url: t.artwork_url || t.image || albumData?.image || albumData?.artwork_url || "",
      thumbnail: t.thumbnail || t.artwork_url || t.image || albumData?.image || "",
    }));
  }, [albumData]);

  const isSaved = isAlbumSaved(activeAlbumId);

  const handlePlayAll = useCallback(() => {
    if (tracks.length === 0) return;
    playTrack(tracks[0], tracks, 0);
  }, [tracks, playTrack]);

  const handleShuffle = useCallback(() => {
    if (tracks.length === 0) return;
    const shuffled = fisherYatesShuffle(tracks);
    if (setShuffle) setShuffle(true);
    playTrack(shuffled[0], shuffled, 0);
  }, [tracks, playTrack, setShuffle]);

  const handleDownloadAll = async () => {
    if (tracks.length === 0 || isDownloadingAll) return;
    setIsDownloadingAll(true);
    setDownloadProgress(0);

    let completed = 0;
    for (const track of tracks) {
      try {
        await downloadTrack(track);
      } catch (_) {}
      completed++;
      setDownloadProgress(Math.round((completed / tracks.length) * 100));
    }

    setIsDownloadingAll(false);
  };

  const coverUrl = albumData?.image || albumData?.artwork_url || albumData?.cover_url || (tracks[0]?.artwork_url) || "";
  const highResCover = getHighResArtwork(coverUrl) || coverUrl;
  const albumTitle = decodeHtml(albumData?.title || albumData?.name || "Album");
  const artistName = decodeHtml(albumData?.artist || albumData?.primary_artists || "Various Artists");
  const year = albumData?.year || "";

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <View style={styles.container}>
        <StatusBar translucent backgroundColor="#000000" barStyle="light-content" />

        {/* Navigation Bar */}
        <View style={[styles.navBar, (isDesktop || isTablet) && styles.desktopNavBar]}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-down" size={26} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.navTitle} numberOfLines={1}>
            {albumTitle}
          </Text>
          <TouchableOpacity
            style={styles.saveHeaderBtn}
            onPress={() => toggleSaveAlbum(albumData || album)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={isSaved ? "heart" : "heart-outline"}
              size={22}
              color={isSaved ? colors.primary : "#FFFFFF"}
            />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading album...</Text>
          </View>
        ) : (
          <FlatList
            data={tracks}
            keyExtractor={(item, index) => `${item.videoId || index}_${index}`}
            contentContainerStyle={[styles.listContent, (isDesktop || isTablet) && styles.desktopListContent]}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View style={[styles.heroWrap, (isDesktop || isTablet) && styles.desktopHeroWrap]}>
                {coverUrl ? (
                  <Image
                    source={{ uri: highResCover }}
                    style={[styles.heroArtwork, (isDesktop || isTablet) && styles.desktopHeroArtwork]}
                  />
                ) : (
                  <View
                    style={[
                      styles.heroArtwork,
                      styles.artworkFallback,
                      (isDesktop || isTablet) && styles.desktopHeroArtwork,
                    ]}
                  >
                    <Ionicons name="disc-outline" size={64} color={colors.primary} />
                  </View>
                )}

                <View style={[styles.heroInfo, (isDesktop || isTablet) && styles.desktopHeroInfo]}>
                  <Text style={styles.albumBadge}>ALBUM</Text>
                  <Text
                    style={[styles.heroTitle, (isDesktop || isTablet) && styles.desktopHeroTitle]}
                    numberOfLines={2}
                  >
                    {albumTitle}
                  </Text>
                  <Text
                    style={[styles.heroArtist, (isDesktop || isTablet) && styles.desktopHeroArtist]}
                    numberOfLines={1}
                  >
                    {artistName}
                  </Text>
                  <Text style={[styles.heroMeta, (isDesktop || isTablet) && styles.desktopHeroMeta]}>
                    {year ? `${year} • ` : ""}{tracks.length} {tracks.length === 1 ? "track" : "tracks"}
                  </Text>

                  {/* Action Buttons */}
                  <View style={[styles.actionsRow, (isDesktop || isTablet) && styles.desktopActionsRow]}>
                    <TouchableOpacity
                      style={styles.playAllBtn}
                      onPress={handlePlayAll}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="play" size={18} color="#000000" style={{ marginRight: 6 }} />
                      <Text style={styles.playAllText}>Play All</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.iconActionBtn}
                      onPress={handleShuffle}
                      activeOpacity={0.7}
                      accessibilityLabel="Shuffle"
                    >
                      <Ionicons name="shuffle" size={20} color="#FFFFFF" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.iconActionBtn, isSaved && styles.activeIconActionBtn]}
                      onPress={() => toggleSaveAlbum(albumData || album)}
                      activeOpacity={0.7}
                      accessibilityLabel="Save Album"
                    >
                      <Ionicons
                        name={isSaved ? "heart" : "heart-outline"}
                        size={20}
                        color={isSaved ? colors.primary : "#FFFFFF"}
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.iconActionBtn}
                      onPress={handleDownloadAll}
                      activeOpacity={0.7}
                      accessibilityLabel="Download Album"
                    >
                      <Ionicons
                        name={isDownloadingAll ? "sync" : "arrow-down-circle-outline"}
                        size={20}
                        color="#FFFFFF"
                      />
                    </TouchableOpacity>
                  </View>

                  {isDownloadingAll && (
                    <Text style={styles.downloadProgressText}>
                      Downloading album offline... {downloadProgress}%
                    </Text>
                  )}
                </View>
              </View>
            }
            renderItem={({ item, index }) => (
              <SongCard
                track={item}
                layout="row"
                showRank={true}
                rank={index + 1}
                showRowAddButton={false}
                isActive={currentTrack?.videoId === item.videoId}
                onAddToPlaylist={(t) => setAddToPlaylistTrack(t)}
                onPress={() => playTrack(item, tracks, index)}
              />
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="musical-notes-outline" size={44} color={colors.textMuted} />
                <Text style={styles.emptyText}>No tracks found in this album</Text>
              </View>
            }
            ListFooterComponent={<View style={{ height: 120 }} />}
          />
        )}

        {/* Add to Playlist Modal */}
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
    backgroundColor: colors.background,
  },
  navBar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    backgroundColor: "#000000",
  },
  desktopNavBar: {
    width: "100%",
    paddingHorizontal: 32,
    backgroundColor: "#000000",
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  saveHeaderBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  navTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
    marginHorizontal: 12,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textMuted,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  desktopListContent: {
    width: "100%",
    paddingHorizontal: 32,
    paddingTop: 20,
  },
  heroWrap: {
    alignItems: "center",
    marginBottom: 24,
  },
  desktopHeroWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 32,
    paddingVertical: 24,
    marginBottom: 20,
    width: "100%",
  },
  heroArtwork: {
    width: 170,
    height: 170,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  desktopHeroArtwork: {
    width: 220,
    height: 220,
    borderRadius: 10,
    marginBottom: 0,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.65,
    shadowRadius: 28,
    elevation: 16,
  },
  artworkFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  heroInfo: {
    flex: 1,
    marginTop: 16,
    alignItems: "center",
  },
  desktopHeroInfo: {
    alignItems: "flex-start",
    justifyContent: "flex-end",
    flex: 1,
    paddingBottom: 4,
  },
  albumBadge: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 4,
  },
  desktopHeroTitle: {
    fontSize: 38,
    lineHeight: 44,
    textAlign: "left",
    letterSpacing: -0.5,
    fontFamily: fonts.bold,
    marginBottom: 8,
  },
  heroArtist: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.textMuted,
    marginBottom: 6,
  },
  desktopHeroArtist: {
    fontSize: 16,
    color: "#FFFFFF",
    textAlign: "left",
    marginBottom: 6,
  },
  heroMeta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.5)",
    marginBottom: 16,
  },
  desktopHeroMeta: {
    textAlign: "left",
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.65)",
    marginBottom: 16,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  desktopActionsRow: {
    justifyContent: "flex-start",
    alignSelf: "flex-start",
  },
  playAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  playAllText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
  },
  iconActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  activeIconActionBtn: {
    borderColor: "rgba(29, 185, 84, 0.4)",
    backgroundColor: "rgba(29, 185, 84, 0.15)",
  },
  downloadProgressText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.primary,
    marginTop: 8,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 8,
  },
  emptyText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.textMuted,
  },
});
