import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudio } from "../context/AudioContext";
import { useUser } from "../context/UserContext";
import { colors, fonts } from "../theme/colors";
import LikeConfetti from "./LikeConfetti";
import { getHighResArtwork } from "../utils/imageUtils";

export default function MiniPlayer() {
  const {
    currentTrack,
    isPlaying,
    isLoading,
    positionMillis,
    durationMillis,
    togglePlayPause,
    playNext,
    setFullPlayerVisible,
    isRemotePlaying,
    remotePlaybackSession,
    transferPlaybackToThisDevice,
    openDeviceModal,
  } = useAudio();
  const { isSongLiked, toggleLikeSong } = useUser();

  const isFavorite = isSongLiked(currentTrack?.videoId || currentTrack?.video_id);
  const [showLikeConfetti, setShowLikeConfetti] = useState(false);
  const likeScaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setShowLikeConfetti(false);
  }, [currentTrack?.videoId, currentTrack?.video_id]);

  const cleanTitle = (title) => {
    if (!title) return "";
    return title
      .replace(/\s*[\(\[]\s*(official\s*(video|audio|music\s*video|lyric\s*video|mv)|lyric\s*video|audio|hd|4k|lyrics|ft\.?.*?|feat\.?.*?)\s*[\)\]]/gi, "")
      .replace(/\s*[\(\[]\s*\d{4}\s*[\)\]]/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  };

  // Don't display or start miniplayer when no track is playing
  if (!currentTrack && !isRemotePlaying) return null;

  // Remote Playback Active on Another Device (Spotify Connect Mode)
  if (isRemotePlaying && remotePlaybackSession?.track) {
    const remoteTrack = remotePlaybackSession.track;
    const remoteDevName = remotePlaybackSession.deviceName || "Another Device";
    const remoteArtwork = getHighResArtwork(remoteTrack.artwork_url || remoteTrack.thumbnail);

    return (
      <View style={styles.outerContainer}>
        {/* Top Spotify Connect Bar */}
        <TouchableOpacity
          style={styles.connectTopBanner}
          onPress={() => setFullPlayerVisible(true)}
          activeOpacity={0.85}
        >
          <View style={styles.connectTopBannerLeft}>
            <Ionicons name="volume-high" size={14} color="#000000" style={{ marginRight: 6 }} />
            <Text style={styles.connectTopBannerText} numberOfLines={1}>
              Listening on <Text style={{ fontFamily: fonts.bold }}>{remoteDevName}</Text>
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={13} color="#000000" />
        </TouchableOpacity>

        {/* Remote Song Row */}
        <TouchableOpacity
          style={[styles.container, styles.remoteContainer]}
          onPress={() => setFullPlayerVisible(true)}
          activeOpacity={0.92}
        >
          <View style={styles.contentRow}>
            {/* Artwork */}
            <TouchableOpacity
              style={styles.artworkContainer}
              onPress={() => setFullPlayerVisible(true)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Open Full Player"
            >
              {remoteArtwork ? (
                <Image source={{ uri: remoteArtwork }} style={styles.artwork} resizeMode="cover" />
              ) : (
                <View style={[styles.artwork, styles.artworkFallback]}>
                  <Ionicons name="musical-note" size={18} color={colors.primary} />
                </View>
              )}
            </TouchableOpacity>

            {/* Song Info */}
            <TouchableOpacity
              style={styles.infoContainer}
              onPress={() => setFullPlayerVisible(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
                {cleanTitle(remoteTrack.title)}
              </Text>
              <Text style={styles.artist} numberOfLines={1} ellipsizeMode="tail">
                {remoteTrack.artist}
              </Text>
            </TouchableOpacity>

            {/* Play on this device Button */}
            <TouchableOpacity
              style={styles.playHereMiniBtn}
              onPress={async (e) => {
                e?.stopPropagation?.();
                if (transferPlaybackToThisDevice) {
                  await transferPlaybackToThisDevice();
                }
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="play" size={14} color="#000000" style={{ marginRight: 5 }} />
              <Text style={styles.playHereMiniBtnText}>Play on this device</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  if (!currentTrack) return null;

  const rawArtwork = currentTrack.artwork_url || currentTrack.thumbnail;
  const artwork = getHighResArtwork(rawArtwork);

  const getFallbackDurationMs = () => {
    if (currentTrack?.duration_seconds && Number.isFinite(Number(currentTrack.duration_seconds))) {
      const s = Number(currentTrack.duration_seconds);
      return s > 10000 ? s : s * 1000;
    }
    if (typeof currentTrack?.duration === "string" && currentTrack.duration.includes(":")) {
      const parts = currentTrack.duration.split(":").map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return (parts[0] * 60 + parts[1]) * 1000;
      }
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
      }
    }
    return 0;
  };

  const rawDuration = Number(durationMillis);
  const fallbackDuration = getFallbackDurationMs();
  const effectiveDuration =
    fallbackDuration > 0
      ? fallbackDuration
      : Number.isFinite(rawDuration) && rawDuration > 0 && rawDuration < 86400000
      ? rawDuration
      : 0;

  const progressPercent =
    effectiveDuration > 0
      ? Math.min(100, Math.max(0, ((positionMillis || 0) / effectiveDuration) * 100))
      : 0;

  const handleToggleFavorite = async (e) => {
    e.stopPropagation && e.stopPropagation();
    if (!currentTrack) return;
    try {
      Animated.sequence([
        Animated.spring(likeScaleAnim, {
          toValue: 1.35,
          friction: 3,
          tension: 40,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.spring(likeScaleAnim, {
          toValue: 1.0,
          friction: 4,
          tension: 50,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start();

      const nextFavState = !isFavorite;
      if (nextFavState) {
        setShowLikeConfetti(true);
      }

      await toggleLikeSong({
        videoId: currentTrack.videoId || currentTrack.video_id,
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album || "",
        artwork_url: artwork || "",
        thumbnail: artwork || "",
        duration: currentTrack.duration || "",
        duration_seconds: currentTrack.duration_seconds || 0,
      });
    } catch (err) {
      console.warn("Favorite error:", err);
    }
  };

  return (
    <View style={styles.outerContainer}>
      <TouchableOpacity
        style={styles.container}
        onPress={() => setFullPlayerVisible(true)}
        activeOpacity={0.92}
      >
        <View style={styles.contentRow}>
          {/* Artwork */}
          <TouchableOpacity
            style={styles.artworkContainer}
            onPress={() => setFullPlayerVisible(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open Full Player"
          >
            {artwork ? (
              <Image source={{ uri: artwork }} style={styles.artwork} resizeMode="cover" />
            ) : (
              <View style={[styles.artwork, styles.artworkFallback]}>
                <Ionicons name="musical-note" size={18} color={colors.primary} />
              </View>
            )}
          </TouchableOpacity>

          {/* Song Info */}
          <View style={styles.infoContainer}>
            <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
              {cleanTitle(currentTrack.title)}
            </Text>
            <Text style={styles.artist} numberOfLines={1} ellipsizeMode="tail">
              {currentTrack.artist}
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.controlsContainer}>
            <View style={styles.likeButtonWrapper}>
              {showLikeConfetti && (
                <LikeConfetti onComplete={() => setShowLikeConfetti(false)} />
              )}
              <TouchableOpacity
                onPress={handleToggleFavorite}
                style={styles.iconButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Animated.View style={{ transform: [{ scale: likeScaleAnim }] }}>
                  <Ionicons
                    name={isFavorite ? "heart" : "heart-outline"}
                    size={22}
                    color={isFavorite ? colors.primary : colors.textSecondary}
                  />
                </Animated.View>
              </TouchableOpacity>
            </View>

            {isLoading ? (
              <ActivityIndicator
                size="small"
                color={colors.primary}
                style={styles.spinner}
              />
            ) : (
              <TouchableOpacity
                onPress={togglePlayPause}
                style={styles.iconButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={isPlaying ? "pause" : "play"}
                  size={24}
                  color={colors.text}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Spotify Green Bottom Progress Indicator */}
        <View style={styles.progressBarContainer}>
          <View
            style={[styles.progressBarFill, { width: `${progressPercent}%` }]}
          />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    paddingHorizontal: 0,
    marginBottom: 0,
    width: "100%",
  },
  container: {
    backgroundColor: "#000000",
    borderRadius: 0,
    overflow: "hidden",
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    borderBottomWidth: 1,
    borderBottomColor: "#1A1A1A",
    elevation: 0,
    ...(Platform.OS === "web" ? { boxShadow: "none" } : { shadowColor: "transparent", shadowOpacity: 0 }),
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  artworkContainer: {
    width: 44,
    height: 44,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: colors.surfaceCard,
  },
  artwork: {
    width: "100%",
    height: "100%",
  },
  artworkFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceCard,
  },
  infoContainer: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
  },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.text,
    letterSpacing: -0.2,
  },
  artist: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: "#FFFFFF",
    marginTop: 1,
  },
  controlsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  likeButtonWrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  iconButton: {
    padding: 4,
  },
  spinner: {
    padding: 4,
  },
  progressBarContainer: {
    height: 2,
    backgroundColor: colors.progressBarBg,
    width: "100%",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: colors.primary,
  },
  connectTopBanner: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  connectTopBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  connectTopBannerText: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: "#000000",
  },
  remoteContainer: {
    borderTopWidth: 0,
  },
  playHereMiniBtn: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: "auto",
  },
  playHereMiniBtnText: {
    color: "#000000",
    fontSize: 11,
    fontFamily: fonts.bold,
  },
});
