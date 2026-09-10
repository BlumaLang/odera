import React, { useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { useResponsive } from "../context/ResponsiveContext";
import { useAudioPlayback } from "../context/AudioContext";
import { useUser } from "../context/UserContext";

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
  const responsive = useResponsive?.() || { isDesktop: false, isTablet: false };
  const isDesktop = responsive.isDesktop;
  const isTablet = responsive.isTablet;

  const { currentTrack, isPlaying, isLoading, togglePlayPause } = useAudioPlayback();
  const { isTrackInAnyPlaylist } = useUser?.() || {};
  const isInPlaylist = isTrackInAnyPlaylist ? isTrackInAnyPlaylist(track) : false;
  const trackId = track?.videoId || track?.video_id;
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

  const rawArtwork = track?.artwork_url || track?.thumbnail;
  const trackVid = trackId || track?.videoId || track?.video_id || "";
  const [imageError, setImageError] = useState(false);
  const [currentArtwork, setCurrentArtwork] = useState("");
  const failedUrlsRef = React.useRef(new Set());

  React.useEffect(() => {
    setImageError(false);
    failedUrlsRef.current = new Set();
    let resolved = rawArtwork;
    if (resolved && typeof resolved === "string") {
      // Normalize YouTube URLs upfront to avoid expired sqp= tokens or broken hq720 thumbnails
      if (resolved.includes("hq720.jpg") || resolved.includes("maxresdefault.jpg") || resolved.includes("sddefault.jpg")) {
        const match = resolved.match(/\/vi\/([a-zA-Z0-9_-]+)/);
        const vid = match ? match[1] : trackVid;
        resolved = vid ? `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` : resolved.replace(/\/(hq720|maxresdefault|sddefault)\.jpg.*/, "/mqdefault.jpg");
      }
    } else if (trackVid) {
      resolved = `https://i.ytimg.com/vi/${trackVid}/mqdefault.jpg`;
    }
    setCurrentArtwork(resolved);
  }, [rawArtwork, trackVid]);

  const handleImageError = () => {
    if (currentArtwork) failedUrlsRef.current.add(currentArtwork);
    if (trackVid) {
      const fallbackYt = `https://i.ytimg.com/vi/${trackVid}/mqdefault.jpg`;
      if (!failedUrlsRef.current.has(fallbackYt) && currentArtwork !== fallbackYt) {
        setCurrentArtwork(fallbackYt);
        return;
      }
      const hqFallback = `https://i.ytimg.com/vi/${trackVid}/hqdefault.jpg`;
      if (!failedUrlsRef.current.has(hqFallback) && currentArtwork !== hqFallback) {
        setCurrentArtwork(hqFallback);
        return;
      }
    }
    setImageError(true);
  };

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
              source={{ uri: currentArtwork }}
              style={styles.rowArtwork}
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
            {track.title}
          </Text>
          <Text style={styles.rowArtist} numberOfLines={1}>
            {track.artist}
            {!isDesktop && track.album ? ` • ${track.album}` : ""}
          </Text>
          {Boolean(track.subtitle && !track.album) ? (
            <Text style={styles.subtitleTag} numberOfLines={1}>
              {track.subtitle}
            </Text>
          ) : null}
        </View>

        {/* Dedicated Album Column on Desktop */}
        {isDesktop && (
          <View style={styles.desktopAlbumCol}>
            <Text style={styles.desktopAlbumText} numberOfLines={1}>
              {track.album || "Single"}
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
            source={{ uri: currentArtwork }}
            style={styles.cardArtwork}
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
      </View>

      <Text
        style={[styles.cardTitle, isCurrent && styles.activeTitle]}
        numberOfLines={1}
      >
        {track.title}
      </Text>
      <Text style={styles.cardArtist} numberOfLines={1}>
        {track.artist}
      </Text>
      {track.album ? (
        <Text style={styles.cardAlbum} numberOfLines={1}>
          {track.album}
        </Text>
      ) : track.subtitle ? (
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {track.subtitle}
        </Text>
      ) : formatCardDuration(track) ? (
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {formatCardDuration(track)}
        </Text>
      ) : null}
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
});

export default React.memo(SongCard);
