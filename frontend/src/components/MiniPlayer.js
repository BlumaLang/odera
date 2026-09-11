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
    openQueue,
  } = useAudio();
  const { isSongLiked, toggleLikeSong } = useUser();

  const isFavorite = isSongLiked(currentTrack?.videoId || currentTrack?.video_id);
  const [showLikeConfetti, setShowLikeConfetti] = useState(false);
  const likeScaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setShowLikeConfetti(false);
  }, [currentTrack?.videoId, currentTrack?.video_id]);

  if (!currentTrack) return null;

  const cleanTitle = (title) => {
    if (!title) return "";
    return title
      .replace(/\s*[\(\[]\s*(official\s*(video|audio|music\s*video|lyric\s*video|mv)|lyric\s*video|audio|hd|4k|lyrics|ft\.?.*?|feat\.?.*?)\s*[\)\]]/gi, "")
      .replace(/\s*[\(\[]\s*\d{4}\s*[\)\]]/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  };

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

            {/* Queue Button */}
            <TouchableOpacity
              onPress={(e) => {
                e?.stopPropagation?.();
                openQueue();
              }}
              style={styles.iconButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Open Queue"
            >
              <Ionicons
                name="list"
                size={21}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

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
});
