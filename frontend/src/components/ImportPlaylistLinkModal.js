import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { api } from "../api/client";
import { useResponsive } from "../context/ResponsiveContext";

export default function ImportPlaylistLinkModal({
  visible,
  onClose,
  onSuccess,
  playlistName = "Playlist",
}) {
  const { isDesktop, isTablet } = useResponsive();
  const [url, setUrl] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState(null);
  const [matchProgress, setMatchProgress] = useState(null);
  const [matchedSongs, setMatchedSongs] = useState([]);
  const urlInputRef = useRef(null);
  const listScrollRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setUrl("");
      setError(null);
      setFetching(false);
      setMatchProgress(null);
      setMatchedSongs([]);
      const timer = setTimeout(() => {
        urlInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    } else {
      setUrl("");
      setError(null);
      setFetching(false);
      setMatchProgress(null);
      setMatchedSongs([]);
    }
  }, [visible]);

  const handleImport = async () => {
    const targetUrl = (url || "").trim();
    if (!targetUrl) {
      setError("Please enter or paste a playlist link");
      return;
    }

    const isSpotify = targetUrl.includes("spotify.com/playlist/") || targetUrl.includes("spotify:playlist:");
    const isYouTube = targetUrl.includes("list=") || targetUrl.startsWith("PL") || targetUrl.startsWith("OLAK");

    if (!isSpotify && !isYouTube) {
      setError("Please provide a valid YouTube or Spotify playlist link.");
      return;
    }

    setFetching(true);
    setError(null);
    setMatchedSongs([]);
    setMatchProgress({ current: 0, total: 0, matched: 0, title: "Connecting to playlist..." });

    try {
      // 1. Fetch raw playlist from scraper to get track titles
      const data = await api.importYouTubePlaylist(targetUrl);
      const playlist = data?.playlist || (data?.success && data?.tracks ? data : null);
      const rawTracks = playlist?.tracks || [];

      if (!playlist || rawTracks.length === 0) {
        setError(data?.error || "Could not find any songs in this playlist. Please ensure it is public.");
        setFetching(false);
        setMatchProgress(null);
        return;
      }

      setMatchProgress({
        current: 0,
        total: rawTracks.length,
        matched: 0,
        title: "Scanning playlist tracks...",
      });

      const matchedTracks = [];
      const seenIds = new Set();

      for (let i = 0; i < rawTracks.length; i++) {
        const raw = rawTracks[i];
        const rawTitle = (raw?.title || "").trim();
        const rawArtist = (raw?.artist || "").trim();

        setMatchProgress({
          current: i + 1,
          total: rawTracks.length,
          matched: matchedTracks.length,
          title: rawTitle || `Track #${i + 1}`,
        });

        if (rawTitle) {
          const cleanTitle = rawTitle
            .replace(/[\(\[](Official\s*(Music\s*)?Video|Lyrics|Lyric\s*Video|Audio|Official\s*Audio|4K|HD|HQ|Visualizer|Full\s*Song|Video)[\)\]]/gi, "")
            .replace(/[\(\[]\s*feat\.?.*?[\]\)]/gi, "")
            .replace(/[\(\[]\s*ft\.?.*?[\]\)]/gi, "")
            .replace(/[\(\[]\s*prod\.?.*?[\]\)]/gi, "")
            .replace(/\|.*$/g, "")
            .replace(/\s+/g, " ")
            .trim();

          let query = cleanTitle;
          const isGenericArtist =
            !rawArtist ||
            rawArtist.toLowerCase().includes("topic") ||
            rawArtist.toLowerCase().includes("youtube") ||
            rawArtist.toLowerCase().includes("various") ||
            cleanTitle.toLowerCase().includes(rawArtist.toLowerCase());

          if (!isGenericArtist) {
            query = `${cleanTitle} ${rawArtist}`.trim();
          }

          let found = null;
          try {
            const searchRes = await api.search(query, 0, 5);
            const candidates = searchRes?.results || searchRes?.tracks || [];
            if (candidates.length > 0) {
              found = candidates[0];
            } else if (query !== cleanTitle) {
              const fallbackRes = await api.search(cleanTitle, 0, 5);
              const fallbackCandidates = fallbackRes?.results || fallbackRes?.tracks || [];
              if (fallbackCandidates.length > 0) {
                found = fallbackCandidates[0];
              }
            }
          } catch (e) {
            console.warn("Search error for track:", rawTitle, e);
          }

          if (found) {
            const sid = found.videoId || found.video_id || found.id;
            if (sid && !seenIds.has(sid)) {
              seenIds.add(sid);
              const artwork = found.artwork_url || found.thumbnail || "";
              const matchedItem = {
                id: sid,
                videoId: sid,
                video_id: sid,
                title: found.title || cleanTitle,
                artist: found.artist || found.subtitle || rawArtist || "Staytup",
                artwork_url: artwork,
                thumbnail: artwork,
                duration: found.duration || found.duration_seconds || raw.duration || 0,
                duration_seconds: found.duration_seconds || found.duration || raw.duration || 0,
                stream_url: found.stream_url || found.audio_url || "",
              };
              matchedTracks.push(matchedItem);
              setMatchedSongs([...matchedTracks]);

              // Auto-scroll to the bottom of the list as each song is added
              setTimeout(() => {
                try {
                  listScrollRef.current?.scrollToEnd({ animated: true });
                } catch (_) {}
              }, 40);
            }
          }
        }

        if (i < rawTracks.length - 1) {
          await new Promise((r) => setTimeout(r, 60));
        }
      }

      if (matchedTracks.length === 0) {
        setError("No matching songs found in the Staytup catalog for this playlist.");
        setFetching(false);
        setMatchProgress(null);
      } else {
        await new Promise((r) => setTimeout(r, 450));
        if (onSuccess) {
          await onSuccess(matchedTracks);
        }
        onClose();
      }
    } catch (err) {
      console.warn("handleImport error:", err);
      setError(err?.message || "Failed to load playlist. Check your internet connection.");
      setFetching(false);
      setMatchProgress(null);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={fetching ? undefined : onClose}
      statusBarTranslucent={true}
    >
      <View style={styles.fullPageContainer}>
        <StatusBar translucent={true} backgroundColor="#000000" barStyle="light-content" />

        {/* Header Bar with Back Button and Pill Search Link Input */}
        <View style={[styles.topHeaderBar, (isDesktop || isTablet) && styles.desktopTopBar]}>
          <TouchableOpacity
            style={styles.navCloseBtn}
            onPress={onClose}
            disabled={fetching}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Rounded Pill Search Input placed in header */}
          <View
            style={[
              styles.headerSearchWrapper,
              isFocused && styles.headerSearchWrapperFocused,
            ]}
          >
            <Ionicons
              name="link"
              size={18}
              color={colors.textMuted}
              style={{ marginRight: 8, marginLeft: 2 }}
            />
            <TextInput
              ref={urlInputRef}
              style={styles.headerSearchInput}
              value={url}
              onChangeText={(text) => {
                setUrl(text);
                setError(null);
              }}
              placeholder={`Link to Add to ${playlistName}`}
              placeholderTextColor="rgba(255, 255, 255, 0.4)"
              autoCorrect={false}
              autoCapitalize="none"
              keyboardType="url"
              editable={!fetching}
              returnKeyType="go"
              onSubmitEditing={handleImport}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />
            {url.length > 0 && !fetching ? (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => {
                  setUrl("");
                  setError(null);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="close-circle"
                  size={18}
                  color="rgba(255, 255, 255, 0.45)"
                />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboardAvoidArea}
        >
          <View style={[styles.mainWrapper, (isDesktop || isTablet) && styles.desktopMainWrapper]}>
            {/* Error Banner */}
            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color="#FF5252" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Live Match Progress Status */}
            {matchProgress && (
              <View style={styles.progressStatusSection}>
                <View style={styles.progressRow}>
                  <View style={styles.progressHeaderLeft}>
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
                    <Text style={styles.matchProgressTitle}>
                      Adding songs to playlist...
                    </Text>
                  </View>
                  <Text style={styles.matchProgressCount}>
                    {matchProgress.matched} {matchProgress.matched === 1 ? "song" : "songs"} added
                  </Text>
                </View>

                <Text style={styles.matchProgressSub} numberOfLines={1}>
                  {matchProgress.current} of {matchProgress.total}: {matchProgress.title}
                </Text>

                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(100, Math.round(
                          (matchProgress.current / Math.max(matchProgress.total, 1)) * 100
                        ))}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            )}

            {/* Live Song List showing each song as it's added */}
            {matchedSongs.length > 0 ? (
              <View style={styles.songListContainer}>
                <View style={styles.songListHeader}>
                  <Text style={styles.songListHeaderTitle}>
                    Added Songs ({matchedSongs.length})
                  </Text>
                  {fetching && (
                    <View style={styles.liveBadge}>
                      <View style={styles.livePulseDot} />
                      <Text style={styles.liveBadgeText}>LIVE</Text>
                    </View>
                  )}
                </View>

                <ScrollView
                  ref={listScrollRef}
                  style={styles.songListScroll}
                  contentContainerStyle={styles.songListScrollContent}
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                >
                  {matchedSongs.map((song, index) => {
                    const artworkUri = song.artwork_url || song.thumbnail;
                    return (
                      <View key={song.id || `${song.videoId}_${index}`} style={styles.songRow}>
                        <View style={styles.songIndexCol}>
                          <Text style={styles.songIndexText}>{index + 1}</Text>
                        </View>

                        <View style={styles.songArtworkCol}>
                          {artworkUri ? (
                            <Image source={{ uri: artworkUri }} style={styles.songArtwork} />
                          ) : (
                            <View style={[styles.songArtwork, styles.artworkFallback]}>
                              <Ionicons name="musical-note" size={16} color={colors.primary} />
                            </View>
                          )}
                        </View>

                        <View style={styles.songInfoCol}>
                          <Text style={styles.songTitle} numberOfLines={1}>
                            {song.title}
                          </Text>
                          <Text style={styles.songArtist} numberOfLines={1}>
                            {song.artist}
                          </Text>
                        </View>

                        <View style={styles.songStatusCol}>
                          <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            ) : (
              !fetching && (
                <View style={styles.emptyPromptContainer}>
                  <Ionicons name="link-outline" size={44} color="rgba(255, 255, 255, 0.2)" style={{ marginBottom: 12 }} />
                  <Text style={styles.emptyPromptTitle}>Add to {playlistName}</Text>
                  <Text style={styles.emptyPromptSubtitle}>
                    Paste a YouTube or Spotify playlist link in the top bar to import songs.
                  </Text>
                </View>
              )
            )}
          </View>
        </KeyboardAvoidingView>

        {/* Bottom Fixed Footer with Import Button */}
        <View style={[styles.bottomFixedFooter, (isDesktop || isTablet) && styles.desktopFooter]}>
          <TouchableOpacity
            style={[
              styles.importBtn,
              (!url.trim() || fetching) && styles.disabledBtn,
            ]}
            onPress={handleImport}
            disabled={!url.trim() || fetching}
            activeOpacity={0.85}
          >
            {fetching ? (
              <View style={styles.btnLoadingRow}>
                <ActivityIndicator size="small" color="#000000" style={{ marginRight: 8 }} />
                <Text style={styles.importBtnText}>Importing Songs...</Text>
              </View>
            ) : (
              <>
                <Ionicons
                  name="cloud-download-outline"
                  size={20}
                  color="#000000"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.importBtnText}>Import Songs</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullPageContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  topHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
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
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    gap: 12,
  },
  desktopTopBar: {
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 20,
  },
  navCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  // Rounded Pill Search Link inside Header
  headerSearchWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.12)",
    paddingHorizontal: 14,
    height: 44,
  },
  headerSearchWrapperFocused: {
    borderColor: colors.primary,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  headerSearchInput: {
    flex: 1,
    height: "100%",
    fontFamily: fonts.semiBold,
    fontSize: 13.5,
    color: "#FFFFFF",
    paddingVertical: 0,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
  },
  clearBtn: {
    padding: 4,
    marginLeft: 4,
  },
  keyboardAvoidArea: {
    flex: 1,
  },
  mainWrapper: {
    flex: 1,
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  desktopMainWrapper: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  emptyPromptContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  emptyPromptTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: "#FFFFFF",
    marginBottom: 6,
  },
  emptyPromptSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 320,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 82, 82, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 82, 82, 0.3)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: "100%",
    marginBottom: 12,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#FF5252",
    lineHeight: 18,
  },
  progressStatusSection: {
    width: "100%",
    paddingVertical: 8,
    marginBottom: 8,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  progressHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  matchProgressTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  matchProgressCount: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.primary,
  },
  matchProgressSub: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 8,
  },
  progressBarTrack: {
    width: "100%",
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  songListContainer: {
    flex: 1,
    marginTop: 4,
  },
  songListHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  songListHeaderTitle: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(29, 185, 84, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 5,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  liveBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.primary,
    letterSpacing: 0.5,
  },
  songListScroll: {
    flex: 1,
  },
  songListScrollContent: {
    paddingBottom: 24,
  },
  songRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginVertical: 1,
  },
  songIndexCol: {
    width: 24,
    alignItems: "flex-start",
  },
  songIndexText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.textMuted,
  },
  songArtworkCol: {
    marginRight: 12,
  },
  songArtwork: {
    width: 42,
    height: 42,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  artworkFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  songInfoCol: {
    flex: 1,
    justifyContent: "center",
    marginRight: 10,
  },
  songTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  songArtist: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  songStatusCol: {
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  // Bottom Fixed Footer
  bottomFixedFooter: {
    width: "100%",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 22 : 10,
    backgroundColor: "#000000",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  desktopFooter: {
    maxWidth: 680,
    alignSelf: "center",
    paddingHorizontal: 24,
  },
  importBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  importBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
    letterSpacing: -0.2,
  },
  btnLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  disabledBtn: {
    opacity: 0.5,
  },
});
