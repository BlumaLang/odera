import React, { useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { useResponsive } from "../context/ResponsiveContext";
import { useAudioPlayback } from "../context/AudioContext";
import { useUser } from "../context/UserContext";
import {
  getHighResArtwork,
  decodeHtml,
  extractImageUrl,
  getCachedTrackArtwork,
  setCachedTrackArtwork,
} from "../utils/imageUtils";
import { api } from "../api/client";

function formatCardDuration(track) {
  if (
    track?.duration &&
    typeof track.duration === "string" &&
    track.duration.includes(":") &&
    !track.duration.toLowerCase().includes("infinity") &&
    !track.duration.toLowerCase().includes("nan")
  ) {
    return track.duration;
  }
  const s = Number(track?.duration_seconds || (typeof track?.duration === "number" ? track.duration : 0));
  if (s > 0 && Number.isFinite(s) && s < 86400) {
    const totalSec = s > 10000 ? Math.floor(s / 1000) : Math.floor(s);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  }
  return null;
}

function SongCard({
  track,
  onPress,
  layout = "card",
  isActive = false,
  showRank = true,
  index,
  onAddToPlaylist,
  showPlayButton = true,
  showDuration = true,
  onRemove,
  style,
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const responsive = useResponsive?.() || { isDesktop: false, isTablet: false };
  const isDesktop = responsive.isDesktop;
  const isTablet = responsive.isTablet;

  const {
    currentTrack,
    isPlaying,
    isLoading,
    togglePlayPause,
    addToPlayNext,
    addToQueue,
  } = useAudioPlayback();
  const { isTrackInAnyPlaylist } = useUser?.() || {};
  const isInPlaylist = isTrackInAnyPlaylist ? isTrackInAnyPlaylist(track) : false;
  const trackId = track?.videoId || track?.video_id || track?.id;
  const cleanSongId = trackId ? String(trackId).replace(/^saavn_/, "").trim() : "";
  const isCurrent = Boolean(
    isActive ||
    (currentTrack?.videoId && trackId && currentTrack.videoId === trackId)
  );
  // A next track can be resolving while the previous stream finishes. Do not
  // present this card as playing until its audio has reached the ready state.
  const isThisPlaying = isCurrent && Boolean(isPlaying) && !isLoading;

  const handlePress = (e) => {
    if (isCurrent) {
      togglePlayPause();
    } else if (onPress) {
      onPress(e);
    }
  };

  const isValidYtId = (id) =>
    typeof id === "string" && id.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(id);

  const rawArtwork =
    extractImageUrl(track?.artwork_url) ||
    extractImageUrl(track?.cover_url) ||
    extractImageUrl(track?.coverUrl) ||
    extractImageUrl(track?.preview_artwork) ||
    extractImageUrl(track?.image) ||
    extractImageUrl(track?.thumbnail) ||
    extractImageUrl(track?.coverImage) ||
    extractImageUrl(track?.cover_image) ||
    extractImageUrl(track?.artwork);

  const trackVid = isValidYtId(trackId)
    ? trackId
    : isValidYtId(track?.videoId)
    ? track?.videoId
    : isValidYtId(track?.video_id)
    ? track?.video_id
    : isValidYtId(track?.id)
    ? track?.id
    : "";

  const [imageError, setImageError] = useState(false);
  const [currentArtwork, setCurrentArtwork] = useState("");
  const failedUrlsRef = React.useRef(new Set());

  // Helper to extract candidate covers from track or playlist
  const getCandidateCovers = React.useCallback((item) => {
    const list = [];
    if (!item) return list;

    const addIfValid = (url) => {
      const extracted = extractImageUrl(url);
      if (extracted && typeof extracted === "string" && extracted.startsWith("http")) {
        const httpsUrl = extracted.replace(/^http:\/\//i, "https://");
        if (!list.includes(httpsUrl)) {
          list.push(httpsUrl);
        }
      }
    };

    // 0. Check in-memory shared cache from AudioContext / prior lookups
    const cId = String(item.videoId || item.video_id || item.id || "").replace(/^saavn_/, "").trim();
    if (cId) {
      const cached = getCachedTrackArtwork(cId);
      if (cached) addIfValid(cached);
    }

    // 1. Direct artwork with multi-resolution fallbacks
    const directArt =
      extractImageUrl(item.artwork_url) ||
      extractImageUrl(item.cover_url) ||
      extractImageUrl(item.coverUrl) ||
      extractImageUrl(item.preview_artwork) ||
      extractImageUrl(item.image) ||
      extractImageUrl(item.thumbnail) ||
      extractImageUrl(item.coverImage) ||
      extractImageUrl(item.cover_image) ||
      extractImageUrl(item.artwork);

    if (directArt) {
      const highRes = getHighResArtwork(directArt);
      if (highRes) addIfValid(highRes);
      addIfValid(directArt);

      // Add alternate JioSaavn resolutions as fallbacks in case 500x500 is missing (404)
      if (directArt.includes("saavncdn.com")) {
        addIfValid(directArt.replace(/(?:50x50|500x500|250x250)/g, "150x150"));
        addIfValid(directArt.replace(/(?:50x50|500x500|150x150)/g, "250x250"));
        addIfValid(directArt.replace(/(?:150x150|500x500|250x250)/g, "50x50"));
      }
    }

    // 2. Direct YT video thumbnail
    const vid = isValidYtId(item.videoId)
      ? item.videoId
      : isValidYtId(item.video_id)
      ? item.video_id
      : isValidYtId(item.id)
      ? item.id
      : null;
    if (vid) {
      addIfValid(`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`);
      addIfValid(`https://i.ytimg.com/vi/${vid}/mqdefault.jpg`);
      addIfValid(`https://i.ytimg.com/vi/${vid}/default.jpg`);
    }

    // 3. If item is a playlist or has child tracks, scan child tracks for first valid artwork
    const childTracks = item.tracks || item.mixTracks || item.songs;
    if (childTracks) {
      const arr = Array.isArray(childTracks) ? childTracks : Object.values(childTracks);
      for (const t of arr) {
        if (!t) continue;
        const cArt =
          extractImageUrl(t.artwork_url) ||
          extractImageUrl(t.cover_url) ||
          extractImageUrl(t.coverUrl) ||
          extractImageUrl(t.preview_artwork) ||
          extractImageUrl(t.image) ||
          extractImageUrl(t.thumbnail) ||
          extractImageUrl(t.coverImage) ||
          extractImageUrl(t.cover_image) ||
          extractImageUrl(t.artwork);
        if (cArt) {
          const highRes = getHighResArtwork(cArt);
          if (highRes) addIfValid(highRes);
          addIfValid(cArt);
        }
        const cVid = isValidYtId(t.videoId)
          ? t.videoId
          : isValidYtId(t.video_id)
          ? t.video_id
          : isValidYtId(t.id)
          ? t.id
          : null;
        if (cVid) {
          addIfValid(`https://i.ytimg.com/vi/${cVid}/hqdefault.jpg`);
          addIfValid(`https://i.ytimg.com/vi/${cVid}/mqdefault.jpg`);
          addIfValid(`https://i.ytimg.com/vi/${cVid}/default.jpg`);
        }
        if (list.length >= 8) break;
      }
    }

    return list;
  }, []);

  React.useEffect(() => {
    setImageError(false);
    failedUrlsRef.current = new Set();
    const candidates = getCandidateCovers(track);
    if (candidates.length > 0) {
      setCurrentArtwork(candidates[0]);
    } else if (rawArtwork) {
      setCurrentArtwork(getHighResArtwork(rawArtwork) || rawArtwork);
    } else if (trackVid) {
      setCurrentArtwork(`https://i.ytimg.com/vi/${trackVid}/hqdefault.jpg`);
    } else if (cleanSongId) {
      // Missing artwork: resolve via backend/cache just like player does
      const cached = getCachedTrackArtwork(cleanSongId);
      if (cached) {
        setCurrentArtwork(cached);
      } else {
        api.getTrackImage(cleanSongId, track?.title, track?.artist)
          .then((resolvedImg) => {
            if (resolvedImg) {
              setCachedTrackArtwork(cleanSongId, resolvedImg);
              setCurrentArtwork(resolvedImg);
              setImageError(false);
            } else {
              setImageError(true);
            }
          })
          .catch(() => setImageError(true));
      }
    } else {
      setCurrentArtwork("");
      setImageError(true);
    }
  }, [track, rawArtwork, trackVid, cleanSongId, getCandidateCovers]);

  const handleImageError = () => {
    if (currentArtwork) failedUrlsRef.current.add(currentArtwork);

    const candidates = getCandidateCovers(track);
    const nextCandidate = candidates.find(
      (c) => c && !failedUrlsRef.current.has(c) && c !== currentArtwork
    );
    if (nextCandidate) {
      setCurrentArtwork(nextCandidate);
      return;
    }

    if (trackVid) {
      const fallbackYt = `https://i.ytimg.com/vi/${trackVid}/hqdefault.jpg`;
      if (!failedUrlsRef.current.has(fallbackYt) && currentArtwork !== fallbackYt) {
        setCurrentArtwork(fallbackYt);
        return;
      }
      const mqFallback = `https://i.ytimg.com/vi/${trackVid}/mqdefault.jpg`;
      if (!failedUrlsRef.current.has(mqFallback) && currentArtwork !== mqFallback) {
        setCurrentArtwork(mqFallback);
        return;
      }
    }

    // If candidates exhausted and we have cleanSongId, attempt api.getTrackImage fallback
    if (cleanSongId && !failedUrlsRef.current.has(`lookup_${cleanSongId}`)) {
      failedUrlsRef.current.add(`lookup_${cleanSongId}`);
      api.getTrackImage(cleanSongId, track?.title, track?.artist)
        .then((resolvedImg) => {
          if (resolvedImg && !failedUrlsRef.current.has(resolvedImg)) {
            setCachedTrackArtwork(cleanSongId, resolvedImg);
            setCurrentArtwork(resolvedImg);
            setImageError(false);
          } else {
            setImageError(true);
          }
        })
        .catch(() => setImageError(true));
      return;
    }

    setImageError(true);
  };

  const renderActionModal = () => (
    <Modal
      visible={showMenu}
      transparent
      animationType="fade"
      onRequestClose={() => setShowMenu(false)}
    >
      <TouchableOpacity
        style={styles.modalBackdrop}
        activeOpacity={1}
        onPress={() => setShowMenu(false)}
      >
        <TouchableOpacity
          style={styles.menuSheet}
          activeOpacity={1}
          onPress={(e) => e?.stopPropagation?.()}
        >
          {/* Header with track preview */}
          <View style={styles.menuHeaderRow}>
            {currentArtwork && !imageError ? (
              <Image
                key={currentArtwork || "menu-art"}
                source={{ uri: currentArtwork }}
                style={styles.menuArtwork}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.menuArtwork, styles.menuArtworkFallback]}>
                <Ionicons name="musical-notes" size={22} color={colors.primary} />
              </View>
            )}
            <View style={styles.menuTrackInfo}>
              <Text style={styles.menuTitle} numberOfLines={1}>
                {decodeHtml(track?.title || "Track")}
              </Text>
              <Text style={styles.menuArtist} numberOfLines={1}>
                {decodeHtml(track?.artist || "Artist")}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowMenu(false)}
              style={styles.menuCloseBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color="#888888" />
            </TouchableOpacity>
          </View>

          <View style={styles.menuDivider} />

          {/* Action 1: Play Next */}
          <TouchableOpacity
            style={styles.menuActionItem}
            activeOpacity={0.7}
            onPress={() => {
              setShowMenu(false);
              addToPlayNext?.(track);
            }}
          >
            <View style={[styles.menuActionIconCircle, { backgroundColor: "rgba(29, 185, 84, 0.15)" }]}>
              <Ionicons name="play-forward" size={17} color="#1DB954" />
            </View>
            <View style={styles.menuActionTextWrap}>
              <Text style={[styles.menuActionTitle, { color: "#1DB954" }]}>Play Next</Text>
              <Text style={styles.menuActionSubtitle}>Play immediately after current song</Text>
            </View>
          </TouchableOpacity>

          {/* Action 2: Add to Queue */}
          <TouchableOpacity
            style={styles.menuActionItem}
            activeOpacity={0.7}
            onPress={() => {
              setShowMenu(false);
              addToQueue?.(track);
            }}
          >
            <View style={styles.menuActionIconCircle}>
              <Ionicons name="list" size={17} color="#FFFFFF" />
            </View>
            <View style={styles.menuActionTextWrap}>
              <Text style={styles.menuActionTitle}>Add to Queue</Text>
              <Text style={styles.menuActionSubtitle}>Add to end of upcoming queue</Text>
            </View>
          </TouchableOpacity>

          {/* Action 3: Add to Playlist */}
          {onAddToPlaylist && (
            <TouchableOpacity
              style={styles.menuActionItem}
              activeOpacity={0.7}
              onPress={() => {
                setShowMenu(false);
                onAddToPlaylist(track);
              }}
            >
              <View style={styles.menuActionIconCircle}>
                <Ionicons
                  name={isInPlaylist ? "checkmark-circle" : "add-circle-outline"}
                  size={19}
                  color={isInPlaylist ? colors.primary : "#FFFFFF"}
                />
              </View>
              <View style={styles.menuActionTextWrap}>
                <Text style={styles.menuActionTitle}>
                  {isInPlaylist ? "In Playlist" : "Add to Playlist"}
                </Text>
                <Text style={styles.menuActionSubtitle}>Save to your personal playlists</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Action 4: Play Track Now */}
          <TouchableOpacity
            style={styles.menuActionItem}
            activeOpacity={0.7}
            onPress={(e) => {
              setShowMenu(false);
              handlePress(e);
            }}
          >
            <View style={styles.menuActionIconCircle}>
              <Ionicons name={isThisPlaying ? "pause" : "play"} size={17} color="#FFFFFF" />
            </View>
            <View style={styles.menuActionTextWrap}>
              <Text style={styles.menuActionTitle}>{isThisPlaying ? "Pause Track" : "Play Track Now"}</Text>
              <Text style={styles.menuActionSubtitle}>Start listening right away</Text>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  const rank = track?.rank;

  if (layout === "row") {
    return (
      <TouchableOpacity
        style={[
          styles.rowContainer,
          isCurrent && styles.activeRow,
          isHovered && styles.hoveredRow,
          (isDesktop || isTablet) && styles.desktopRowContainer,
          style,
        ]}
        onPress={handlePress}
        activeOpacity={0.7}
        {...(Platform.OS === "web"
          ? {
              onMouseEnter: () => setIsHovered(true),
              onMouseLeave: () => setIsHovered(false),
            }
          : {})}
      >
        {/* Optional Rank / Index Number */}
        {showRank && rank ? (
          <View style={styles.rankContainer}>
            <Text
              style={[
                styles.rankNumber,
                rank <= 3 && styles.topRankNumber,
                isCurrent && styles.activeRankNumber,
              ]}
            >
              {rank}
            </Text>
          </View>
        ) : (isDesktop || isTablet) && index != null ? (
          <View style={styles.rankContainer}>
            {isHovered ? (
              <Ionicons
                name={isThisPlaying ? "pause" : "play"}
                size={15}
                color={isCurrent ? colors.primary : "#FFFFFF"}
              />
            ) : (
              <Text
                style={[
                  styles.rankNumber,
                  isCurrent && styles.activeRankNumber,
                ]}
              >
                {index}
              </Text>
            )}
          </View>
        ) : null}

        <View style={styles.artworkWrapper}>
          {currentArtwork && !imageError ? (
            <Image
              key={currentArtwork || "row-art"}
              source={{ uri: currentArtwork }}
              style={styles.rowArtwork}
              resizeMode="cover"
              onError={handleImageError}
            />
          ) : (
            <View style={[styles.rowArtwork, styles.artworkFallback]}>
              <Ionicons name="musical-note" size={20} color={colors.primary} />
            </View>
          )}
          {isThisPlaying && (
            <View style={styles.activeOverlay}>
              <Ionicons name="volume-high" size={16} color={colors.primary} />
            </View>
          )}
        </View>

        <View style={[styles.rowTextContainer, isDesktop && styles.desktopRowTextCol]}>
          <Text
            style={[styles.rowTitle, isCurrent && styles.activeTitle]}
            numberOfLines={1}
          >
            {decodeHtml(track.title)}
          </Text>
          <Text style={styles.rowArtist} numberOfLines={1}>
            {decodeHtml(track.artist)}
            {!isDesktop && track.album ? ` • ${decodeHtml(track.album)}` : ""}
          </Text>
          {Boolean(track.subtitle && !track.album) ? (
            <Text style={styles.subtitleTag} numberOfLines={1}>
              {decodeHtml(track.subtitle)}
            </Text>
          ) : null}
        </View>

        {/* Dedicated Album Column on Desktop */}
        {isDesktop && (
          <View style={styles.desktopAlbumCol}>
            <Text style={styles.desktopAlbumText} numberOfLines={1}>
              {decodeHtml(track.album) || "Single"}
            </Text>
          </View>
        )}

        <View style={[styles.rowAction, !showPlayButton && !showDuration && { minWidth: "auto" }]}>
          {showDuration && formatCardDuration(track) ? (
            <Text style={styles.durationText}>{formatCardDuration(track)}</Text>
          ) : null}
          {onAddToPlaylist && (
            <TouchableOpacity
              style={styles.actionIconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={(e) => {
                e?.stopPropagation?.();
                onAddToPlaylist(track);
              }}
              accessibilityLabel={isInPlaylist ? "In playlist" : "Add to playlist"}
            >
              <Ionicons
                name={isInPlaylist ? "checkmark-circle" : "add-circle-outline"}
                size={23}
                color={isInPlaylist ? colors.primary : (isHovered ? "#FFFFFF" : colors.textSecondary)}
              />
            </TouchableOpacity>
          )}
          {/* 3-dots Options Menu */}
          <TouchableOpacity
            style={styles.actionIconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={(e) => {
              e?.stopPropagation?.();
              setShowMenu(true);
            }}
            accessibilityLabel="Song options"
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={18}
              color={isHovered ? "#FFFFFF" : "rgba(255, 255, 255, 0.45)"}
            />
          </TouchableOpacity>
          {onRemove && (
            <TouchableOpacity
              style={styles.actionIconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={(e) => {
                e?.stopPropagation?.();
                onRemove(track);
              }}
              accessibilityLabel="Remove"
            >
              <Ionicons
                name="close"
                size={20}
                color={isHovered ? "#FFFFFF" : "rgba(255, 255, 255, 0.45)"}
              />
            </TouchableOpacity>
          )}
          {showPlayButton && (
            <TouchableOpacity
              style={{ padding: 4 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={(e) => {
                e?.stopPropagation?.();
                handlePress(e);
              }}
            >
              <Ionicons
                name={isThisPlaying ? "pause" : "play"}
                size={20}
                color={isCurrent ? colors.primary : isHovered ? "#FFFFFF" : colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>
        {renderActionModal()}
      </TouchableOpacity>
    );
  }

  // Vertical card layout for horizontal carousels (Spotify style)
  return (
    <TouchableOpacity
      style={[styles.cardContainer, isCurrent && styles.activeCard]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <View style={styles.cardArtworkContainer}>
        {currentArtwork && !imageError ? (
          <Image
            key={currentArtwork || "card-art"}
            source={{ uri: currentArtwork }}
            style={styles.cardArtwork}
            resizeMode="cover"
            onError={handleImageError}
          />
        ) : (
          <View style={[styles.cardArtwork, styles.artworkFallback]}>
            <Ionicons name="musical-notes" size={36} color={colors.primary} />
          </View>
        )}

        {/* Daily Mix Badge */}
        {track.badgeColor ? (
          <View style={[styles.dailyMixBadge, { backgroundColor: track.badgeColor }]}>
            <Text style={styles.dailyMixBadgeText}>DAILY MIX</Text>
          </View>
        ) : showRank && rank ? (
          <View style={[styles.cardRankBadge, rank <= 3 && styles.cardTopRankBadge]}>
            <Text style={styles.cardRankText}>#{rank}</Text>
          </View>
        ) : null}

        <View style={[styles.cardPlayBadge, isCurrent && styles.cardPlayBadgeActive]}>
          <Ionicons
            name={isThisPlaying ? "pause" : "play"}
            size={16}
            color={isCurrent ? "#000000" : colors.text}
          />
        </View>

        {/* 3-dots Options Menu button */}
        <TouchableOpacity
          style={styles.cardMenuBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={(e) => {
            e?.stopPropagation?.();
            setShowMenu(true);
          }}
          accessibilityLabel="Track options"
        >
          <Ionicons name="ellipsis-horizontal" size={16} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <Text
        style={[styles.cardTitle, isCurrent && styles.activeTitle]}
        numberOfLines={1}
      >
        {decodeHtml(track.title)}
      </Text>
      <Text style={styles.cardArtist} numberOfLines={1}>
        {decodeHtml(track.artist)}
      </Text>
      {track.album ? (
        <Text style={styles.cardAlbum} numberOfLines={1}>
          {decodeHtml(track.album)}
        </Text>
      ) : track.subtitle ? (
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {decodeHtml(track.subtitle)}
        </Text>
      ) : formatCardDuration(track) ? (
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {formatCardDuration(track)}
        </Text>
      ) : null}
      {renderActionModal()}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Row layout styles
  rowContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    minWidth: "100%",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 2,
    backgroundColor: "transparent",
    ...(Platform.OS === "web"
      ? {
          cursor: "pointer",
          transition: "background-color 0.15s ease",
        }
      : {}),
  },
  desktopRowContainer: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginVertical: 3,
  },
  hoveredRow: {
    backgroundColor: "transparent",
  },
  activeRow: {
    backgroundColor: "transparent",
  },
  rankContainer: {
    width: 34,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  rankNumber: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.textMuted,
  },
  topRankNumber: {
    color: colors.primary,
  },
  activeRankNumber: {
    color: colors.primary,
  },
  artworkWrapper: {
    position: "relative",
  },
  rowArtwork: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: colors.surfaceCard,
    overflow: "hidden",
  },
  activeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTextContainer: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  desktopRowTextCol: {
    flex: 4,
    marginLeft: 14,
    marginRight: 16,
  },
  rowTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.text,
    letterSpacing: -0.2,
  },
  activeTitle: {
    color: colors.primary,
  },
  rowArtist: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "#FFFFFF",
    marginTop: 2,
  },
  desktopAlbumCol: {
    flex: 3,
    justifyContent: "center",
    paddingRight: 16,
  },
  desktopAlbumText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  subtitleTag: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  rowAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
    minWidth: 90,
  },
  actionIconBtn: {
    padding: 4,
  },
  durationText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
  },

  // Card layout styles
  cardContainer: {
    width: 148,
    marginRight: 14,
  },
  activeCard: {
    opacity: 0.95,
  },
  cardArtworkContainer: {
    width: 148,
    height: 148,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
    backgroundColor: colors.surfaceCard,
  },
  cardArtwork: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.surfaceCard,
  },
  artworkFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceCard,
  },
  dailyMixBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 3,
  },
  dailyMixBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 9,
    color: "#000000",
    letterSpacing: 0.5,
  },
  cardRankBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.75)",
  },
  cardTopRankBadge: {
    backgroundColor: colors.primary,
  },
  cardRankText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.text,
  },
  cardPlayBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardPlayBadgeActive: {
    backgroundColor: colors.primary,
  },
  cardTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.text,
    marginTop: 8,
    letterSpacing: -0.2,
  },
  cardArtist: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "#FFFFFF",
    marginTop: 2,
  },
  cardAlbum: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    fontStyle: "italic",
  },
  cardSubtitle: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  cardMenuBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  menuSheet: {
    width: "100%",
    maxWidth: 500,
    minWidth: Platform.OS === "web" ? 340 : undefined,
    backgroundColor: "#161616",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  menuHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  menuArtwork: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: colors.surfaceCard,
    overflow: "hidden",
  },
  menuArtworkFallback: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  menuTrackInfo: {
    flex: 1,
  },
  menuTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: "#FFFFFF",
    marginBottom: 3,
  },
  menuArtist: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.6)",
  },
  menuCloseBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  menuDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginVertical: 10,
  },
  menuActionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  menuActionIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  menuActionTextWrap: {
    flex: 1,
  },
  menuActionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  menuActionSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.45)",
    marginTop: 2,
  },
});

export default React.memo(SongCard);
