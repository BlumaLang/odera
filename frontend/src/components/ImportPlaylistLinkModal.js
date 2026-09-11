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
import { getHighResArtwork } from "../utils/imageUtils";

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
  const isBackgroundImportRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setUrl("");
      setError(null);
      if (!isBackgroundImportRef.current) {
        setFetching(false);
        setMatchProgress(null);
        setMatchedSongs([]);
      }
      const timer = setTimeout(() => {
        urlInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    } else {
      if (!isBackgroundImportRef.current) {
        setUrl("");
        setError(null);
        setFetching(false);
        setMatchProgress(null);
        setMatchedSongs([]);
      }
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
    isBackgroundImportRef.current = false;
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
        title: `Found ${rawTracks.length} tracks. Matching with catalog...`,
      });

      // Helper to extract clean title and primary artist from YouTube title/channel
      const extractCleanTitleAndArtist = (rawTitle, rawArtist = "") => {
        if (!rawTitle) return { title: "", artist: "" };

        let clean = rawTitle
          .replace(/[\(\[](Official\s*(Music\s*)?Video|Lyrics|Lyric\s*Video|Audio|Official\s*Audio|4K|HD|HQ|Visualizer|Full\s*Song|Video|Official|Lyrical|Remix|Slowed\s*\+?\s*Reverb|8D\s*Audio|Live|Hindi|Telugu|Tamil|Punjabi|English)[\)\]]/gi, "")
          .replace(/[\(\[]\s*feat\.?.*?[\]\)]/gi, "")
          .replace(/[\(\[]\s*ft\.?.*?[\]\)]/gi, "")
          .replace(/[\(\[]\s*prod\.?.*?[\]\)]/gi, "")
          .replace(/-\s*YouTube$/i, "")
          .replace(/\s+/g, " ")
          .trim();

        const recordLabels = /^(t-series|sony\s*music|zee\s*music|tips\s*official|yrf|saregama|speed\s*records|white\s*hill|eros\s*now|times\s*music|venus|geet\s*mp3)/i;

        let channelArtist = "";
        if (rawArtist && !recordLabels.test(rawArtist) && !/topic|vevo|records|music|company/i.test(rawArtist)) {
          channelArtist = rawArtist.replace(/-?\s*topic/i, "").trim();
        }

        const segments = clean.split(/\s*[|–—]\s*/).map((s) => s.trim()).filter((s) => s.length > 0);

        let titleCandidate = "";
        let artistCandidate = channelArtist;

        if (segments.length >= 1) {
          if (segments[0].includes(" - ")) {
            const sub = segments[0].split(" - ");
            artistCandidate = sub[0].trim();
            titleCandidate = sub[1].trim();
          } else if (/^([^:]+):\s*(.+)$/.test(segments[0])) {
            const match = segments[0].match(/^([^:]+):\s*(.+)$/);
            artistCandidate = match[1].trim();
            titleCandidate = match[2].trim();
          } else {
            titleCandidate = segments[0];
            if (!artistCandidate && segments.length > 1) {
              for (let i = segments.length - 1; i >= 1; i--) {
                const seg = segments[i];
                if (!recordLabels.test(seg) && seg.length > 2) {
                  artistCandidate = seg;
                  break;
                }
              }
            }
          }
        } else {
          titleCandidate = clean;
        }

        titleCandidate = titleCandidate.replace(/\b(Full\s*Song|Song|Video|Teaser)\b/gi, "").replace(/["']/g, "").trim();

        let primaryArtist = "";
        if (artistCandidate) {
          const parts = artistCandidate.split(/[,&|]/);
          primaryArtist = parts[0].trim();
          if (/topic|records|vevo/i.test(primaryArtist)) {
            primaryArtist = "";
          }
        }

        return {
          title: titleCandidate || rawTitle,
          artist: primaryArtist,
        };
      };

      // Helper to score match relevance between JioSaavn candidate and target
      const scoreMatch = (candidate, targetTitle, targetArtist) => {
        if (!candidate || !candidate.title) return 0;
        const cTitle = (candidate.title || "")
          .toLowerCase()
          .replace(/[\(\[](from\s*["'].*?["']|remix|version)[\)\]]/gi, "")
          .replace(/[^a-z0-9\s]/g, "")
          .trim();
        const tTitle = targetTitle.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
        const cArtist = (candidate.artist || candidate.subtitle || "").toLowerCase();
        const tArtist = (targetArtist || "").toLowerCase();

        let score = 0;
        if (cTitle === tTitle) {
          score += 60;
        } else if (cTitle.includes(tTitle) || tTitle.includes(cTitle)) {
          score += 40;
        }

        const tWords = tTitle.split(/\s+/).filter((w) => w.length >= 3);
        let matchedWords = 0;
        for (const w of tWords) {
          if (cTitle.includes(w)) matchedWords++;
        }
        if (tWords.length > 0) {
          score += (matchedWords / tWords.length) * 30;
        }

        if (tArtist && tArtist.length > 2) {
          if (cArtist.includes(tArtist) || tArtist.includes(cArtist)) {
            score += 30;
          }
        }

        return score;
      };

      const matchSingleTrack = async (raw) => {
        const rawTitle = (raw?.title || "").trim();
        const rawArtist = (raw?.artist || "").trim();
        if (!rawTitle) return null;

        const { title: cleanTitle, artist: parsedArtist } = extractCleanTitleAndArtist(rawTitle, rawArtist);
        if (!cleanTitle) return null;

        const query = parsedArtist && !cleanTitle.toLowerCase().includes(parsedArtist.toLowerCase())
          ? `${cleanTitle} ${parsedArtist}`.trim()
          : cleanTitle;

        try {
          let searchRes = await api.search(query, 0, 10);
          let candidates = searchRes?.results || searchRes?.tracks || [];

          if (candidates.length === 0 && query !== cleanTitle) {
            searchRes = await api.search(cleanTitle, 0, 8);
            candidates = searchRes?.results || searchRes?.tracks || [];
          }

          if (candidates.length > 0) {
            let best = null;
            let bestScore = 0;

            for (const cand of candidates) {
              const s = scoreMatch(cand, cleanTitle, parsedArtist);
              if (s > bestScore) {
                bestScore = s;
                best = cand;
              }
            }

            // Only accept candidate if score is >= 30 (has meaningful title/artist match)
            if (best && bestScore >= 30) {
              const sid = best.videoId || best.video_id || best.id;
              // Guarantee 500x500 high-res API image from JioSaavn CDN
              const rawImg = best.artwork_url || best.thumbnail || best.image || "";
              const apiArtwork = rawImg
                ? String(rawImg).replace(/(?:50x50|150x150|250x250)\.jpg/i, "500x500.jpg")
                : "";

              return {
                id: String(sid).startsWith("saavn_") ? String(sid) : `saavn_${sid}`,
                videoId: String(sid).replace(/^saavn_/, ""),
                video_id: String(sid).replace(/^saavn_/, ""),
                title: best.title || cleanTitle,
                artist: best.artist || best.subtitle || parsedArtist || "Staytup",
                artwork_url: apiArtwork,
                thumbnail: apiArtwork,
                duration: best.duration || best.duration_seconds || raw.duration || 0,
                duration_seconds: best.duration_seconds || best.duration || raw.duration || 0,
                stream_url: best.stream_url || best.audio_url || "",
                encrypted_media_url: best.encrypted_media_url || "",
                source: "saavn",
              };
            }
          }
        } catch (_) {}
        return null;
      };

      const matchedTracks = [];
      const seenIds = new Set();
      const CONCURRENCY = 10;

      for (let i = 0; i < rawTracks.length; i += CONCURRENCY) {
        const chunk = rawTracks.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(chunk.map((raw) => matchSingleTrack(raw)));

        let newlyFound = 0;
        for (const res of results) {
          if (res.status === "fulfilled" && res.value) {
            const track = res.value;
            const tid = track.videoId || track.video_id || track.id;
            if (tid && !seenIds.has(tid)) {
              seenIds.add(tid);
              matchedTracks.push(track);
              newlyFound++;
            }
          }
        }

        const currentCount = Math.min(i + CONCURRENCY, rawTracks.length);
        const lastTitle = chunk[chunk.length - 1]?.title || `Track #${currentCount}`;

        setMatchProgress({
          current: currentCount,
          total: rawTracks.length,
          matched: matchedTracks.length,
          title: lastTitle,
        });

        if (newlyFound > 0) {
          setMatchedSongs([...matchedTracks]);

          // Auto-scroll list smoothly as items arrive
          setTimeout(() => {
            try {
              listScrollRef.current?.scrollToEnd({ animated: true });
            } catch (_) {}
          }, 20);

          // If running in background, incrementally update playlist every 20 songs
          if (isBackgroundImportRef.current && matchedTracks.length % 20 < CONCURRENCY && onSuccess) {
            onSuccess([...matchedTracks], playlist?.name).catch(() => {});
          }
        }
      }

      if (matchedTracks.length === 0) {
        if (!isBackgroundImportRef.current) {
          setError("No matching songs found in the Staytup catalog for this playlist.");
        }
        setFetching(false);
        setMatchProgress(null);
        isBackgroundImportRef.current = false;
      } else {
        if (onSuccess) {
          await onSuccess(matchedTracks, playlist?.name);
        }
        setFetching(false);
        setMatchProgress(null);
        isBackgroundImportRef.current = false;
        onClose();
      }
    } catch (err) {
      console.warn("handleImport error:", err);
      if (!isBackgroundImportRef.current) {
        setError(err?.message || "Failed to load playlist. Check your internet connection.");
      }
      setFetching(false);
      setMatchProgress(null);
      isBackgroundImportRef.current = false;
    }
  };

  if (!visible && !isBackgroundImportRef.current) return null;

  const handleUserDismiss = () => {
    if (fetching) {
      isBackgroundImportRef.current = true;
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={handleUserDismiss}
      statusBarTranslucent={true}
    >
      <View style={styles.fullPageContainer}>
        <StatusBar translucent={true} backgroundColor="#000000" barStyle="light-content" />

        {/* Header Bar with Back Button and Pill Search Link Input */}
        <View style={[styles.topHeaderBar, (isDesktop || isTablet) && styles.desktopTopBar]}>
          <TouchableOpacity
            style={styles.navCloseBtn}
            onPress={handleUserDismiss}
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
                            <Image source={{ uri: getHighResArtwork(artworkUri) || artworkUri }} style={styles.songArtwork} />
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
          {fetching ? (
            <View style={styles.fetchingBtnRow}>
              <View style={styles.importingStatusPill}>
                <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={styles.importingStatusText}>
                  {matchProgress ? `${matchProgress.matched}/${matchProgress.total} matched` : "Importing..."}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.importBtnBackground}
                onPress={handleUserDismiss}
                activeOpacity={0.8}
              >
                <Ionicons name="layers-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.backgroundBtnText}>Run in Background</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.importBtn,
                !url.trim() && styles.disabledBtn,
              ]}
              onPress={handleImport}
              disabled={!url.trim()}
              activeOpacity={0.85}
            >
              <Ionicons
                name="cloud-download-outline"
                size={20}
                color="#000000"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.importBtnText}>Import Songs</Text>
            </TouchableOpacity>
          )}
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
  fetchingBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    gap: 12,
  },
  importingStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  importingStatusText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: "#FFFFFF",
  },
  importBtnBackground: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 20,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  backgroundBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: "#FFFFFF",
  },
});
