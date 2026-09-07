import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Animated,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { useAudio } from "../context/AudioContext";
import { useUser } from "../context/UserContext";
import { useResponsive } from "../context/ResponsiveContext";
import LikeConfetti from "./LikeConfetti";

function formatTime(millis) {
  if (!millis || !Number.isFinite(millis) || millis <= 0 || millis >= 86400000) return "0:00";
  const totalSeconds = Math.floor(millis / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes < 10 ? "0" : ""}${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  }
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

const cleanTitle = (title) => {
  if (!title) return "";
  return title
    .replace(/\s*[\(\[]\s*(official\s*(video|audio|music\s*video|lyric\s*video|mv)|lyric\s*video|audio|hd|4k|lyrics|ft\.?.*?|feat\.?.*?)\s*[\)\]]/gi, "")
    .replace(/\s*[\(\[]\s*\d{4}\s*[\)\]]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
};

const getHighResArtwork = (url) => {
  if (!url) return null;
  let clean = url;
  if (clean.includes("yt3.googleusercontent.com") || clean.includes("yt3.ggpht.com")) {
    clean = clean.replace(/=s\d+[^?&]*/, "=s512").replace(/=w\d+-h\d+[^?&]*/, "=s512");
    if (!clean.includes("=")) clean = `${clean}=s512`;
    return clean;
  }
  clean = clean.replace(/=w\d+-h\d+[^?&]*/, "=w800-h800-l90-rj");
  clean = clean.replace(/=s\d+[^?&]*/, "=s800");
  clean = clean.replace(/\/default\.jpg/, "/mqdefault.jpg");
  clean = clean.replace(/\/sddefault\.jpg/, "/mqdefault.jpg");
  clean = clean.replace(/\/maxresdefault\.jpg/, "/mqdefault.jpg");
  return clean;
};

export default function DesktopPlayerBar() {
  const { isTablet, isDesktop } = useResponsive();
  const {
    currentTrack,
    isPlaying,
    isLoading,
    positionMillis,
    durationMillis,
    isShuffle,
    isRepeat,
    volume,
    setVolume,
    togglePlayPause,
    seekTo,
    playNext,
    playPrevious,
    toggleShuffle,
    toggleRepeat,
    setFullPlayerVisible,
  } = useAudio();
  const { isSongLiked, toggleLikeSong } = useUser();

  const isFavorite = isSongLiked(currentTrack?.videoId || currentTrack?.video_id);
  const [showLikeConfetti, setShowLikeConfetti] = useState(false);
  const [prevVolume, setPrevVolume] = useState(0.85);
  const [isArtworkHovered, setIsArtworkHovered] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPositionMillis, setScrubPositionMillis] = useState(0);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const [isVolumeDragging, setIsVolumeDragging] = useState(false);
  const [isScrubberHovered, setIsScrubberHovered] = useState(false);

  const likeScaleAnim = useRef(new Animated.Value(1)).current;
  const progressBarRef = useRef(null);
  const progressBarWidthRef = useRef(0);
  const volumeBarRef = useRef(null);
  const volumeBarWidthRef = useRef(0);

  useEffect(() => {
    setShowLikeConfetti(false);
  }, [currentTrack?.videoId, currentTrack?.video_id]);

  const artworkUri = currentTrack
    ? (getHighResArtwork(currentTrack.artwork_url || currentTrack.thumbnail) ||
       "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200")
    : null;

  const handleToggleFavorite = async () => {
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
        artwork_url: artworkUri || "",
        thumbnail: artworkUri || "",
        duration: currentTrack.duration || "",
        duration_seconds: currentTrack.duration_seconds || 0,
      });
    } catch (err) {
      console.warn("Favorite error:", err);
    }
  };

  const getFallbackDurationMs = () => {
    if (!currentTrack) return 0;
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

  const getTargetFromClientX = (clientX) => {
    if (!effectiveDuration || !progressBarRef.current) return 0;
    const rect = progressBarRef.current.getBoundingClientRect?.();
    if (!rect || rect.width <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * effectiveDuration;
  };

  const handleSeekMouseDown = (e) => {
    if (!effectiveDuration) return;
    if (Platform.OS === "web") {
      const startClientX = e.nativeEvent?.clientX ?? e.clientX ?? 0;
      const initialTarget = getTargetFromClientX(startClientX);
      setIsScrubbing(true);
      setScrubPositionMillis(initialTarget);

      const onMouseMove = (moveEvent) => {
        const moveTarget = getTargetFromClientX(moveEvent.clientX);
        setScrubPositionMillis(moveTarget);
      };

      const onMouseUp = (upEvent) => {
        if (typeof window !== "undefined") {
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
        }
        setIsScrubbing(false);
        const finalTarget = getTargetFromClientX(upEvent.clientX);
        seekTo(finalTarget);
      };

      if (typeof window !== "undefined") {
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
      }
    }
  };

  const handleSeekPress = (e) => {
    if (!effectiveDuration) return;
    if (Platform.OS === "web") {
      const clientX = e.nativeEvent?.clientX ?? e.clientX ?? 0;
      const target = getTargetFromClientX(clientX);
      seekTo(target);
      return;
    }
    const locX = e.nativeEvent?.locationX ?? 0;
    const width = progressBarWidthRef.current || 420;
    const ratio = Math.max(0, Math.min(1, locX / width));
    seekTo(ratio * effectiveDuration);
  };

  const getVolFromClientX = (clientX) => {
    if (!volumeBarRef.current) return 0.5;
    const rect = volumeBarRef.current.getBoundingClientRect?.();
    if (!rect || rect.width <= 0) return 0.5;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const handleVolumeMouseDown = (e) => {
    if (Platform.OS === "web") {
      setIsVolumeDragging(true);
      const startClientX = e.nativeEvent?.clientX ?? e.clientX ?? 0;
      setVolume(getVolFromClientX(startClientX));

      const onMouseMove = (moveEvent) => {
        setVolume(getVolFromClientX(moveEvent.clientX));
      };

      const onMouseUp = (upEvent) => {
        if (typeof window !== "undefined") {
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
        }
        setIsVolumeDragging(false);
        setVolume(getVolFromClientX(upEvent.clientX));
      };

      if (typeof window !== "undefined") {
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
      }
    }
  };

  const handleVolumePress = (e) => {
    if (Platform.OS === "web") {
      const clientX = e.nativeEvent?.clientX ?? e.clientX ?? 0;
      setVolume(getVolFromClientX(clientX));
      return;
    }
    const locX = e.nativeEvent?.locationX ?? 0;
    const width = volumeBarWidthRef.current || 96;
    const ratio = Math.max(0, Math.min(1, locX / width));
    setVolume(ratio);
  };

  const isVolActive = isVolumeHovered || isVolumeDragging;
  const isScrubberActive = isScrubberHovered || isScrubbing;
  const volumePercent = Math.min(100, Math.max(0, (volume || 0) * 100));

  const currentDisplayPosition = isScrubbing ? scrubPositionMillis : positionMillis;
  const progress = effectiveDuration > 0 ? Math.min(1, Math.max(0, (currentDisplayPosition || 0) / effectiveDuration)) : 0;
  const progressPercent = Math.min(100, Math.max(0, progress * 100));

  const toggleMute = () => {
    if (volume > 0) {
      setPrevVolume(volume);
      setVolume(0);
    } else {
      setVolume(prevVolume || 0.85);
    }
  };

  if (!currentTrack) {
    return (
      <View style={styles.playerBarContainer}>
        <View style={styles.idleRow}>
          <Ionicons name="musical-note" size={16} color={colors.textMuted} />
          <Text style={styles.idleText}>
            Select a song or explore trending music to begin playing on Staytup
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.playerBarContainer}>
      {/* 1. LEFT SECTION: Track Artwork, Title, Artist, Heart */}
      <View style={[styles.leftSection, isTablet && styles.leftSectionTablet]}>
        <TouchableOpacity
          style={styles.artworkWrapper}
          onPress={() => setFullPlayerVisible(true)}
          onMouseEnter={() => setIsArtworkHovered(true)}
          onMouseLeave={() => setIsArtworkHovered(false)}
          activeOpacity={0.82}
          accessibilityLabel="Open Full Player"
          accessibilityRole="button"
        >
          <Image
            source={{ uri: artworkUri }}
            style={styles.artwork}
            resizeMode="cover"
          />
          <View style={[styles.artworkOverlay, isArtworkHovered && styles.artworkOverlayHovered]}>
            <Ionicons name="expand" size={16} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.trackInfo}
          onPress={() => setFullPlayerVisible(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Text style={styles.trackTitle} numberOfLines={1} ellipsizeMode="tail">
            {cleanTitle(currentTrack.title)}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1} ellipsizeMode="tail">
            {currentTrack.artist}
          </Text>
        </TouchableOpacity>
        <View style={styles.likeButtonWrapper}>
          {showLikeConfetti && (
            <LikeConfetti onComplete={() => setShowLikeConfetti(false)} />
          )}
          <TouchableOpacity
            style={styles.heartBtn}
            onPress={handleToggleFavorite}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Animated.View style={{ transform: [{ scale: likeScaleAnim }] }}>
              <Ionicons
                name={isFavorite ? "heart" : "heart-outline"}
                size={19}
                color={isFavorite ? colors.primary : colors.textSecondary}
              />
            </Animated.View>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. CENTER SECTION: Controls + Progress Scrubber */}
      <View style={styles.centerSection}>
        {/* Playback Controls Row */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={toggleShuffle}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="shuffle"
              size={17}
              color={isShuffle ? colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlBtn}
            onPress={playPrevious}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="play-skip-back" size={19} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.playPauseBtn}
            onPress={togglePlayPause}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={20}
                color="#000000"
                style={{ marginLeft: isPlaying ? 0 : 2 }}
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlBtn}
            onPress={playNext}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="play-skip-forward" size={19} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlBtn}
            onPress={toggleRepeat}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="repeat"
              size={17}
              color={isRepeat ? colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Live Scrubber Bar Row */}
        <View style={styles.scrubberRow}>
          <Text style={styles.timeLabel}>{formatTime(currentDisplayPosition)}</Text>
          <TouchableOpacity
            ref={progressBarRef}
            style={styles.progressBarWrapper}
            activeOpacity={1}
            onPress={handleSeekPress}
            {...(Platform.OS === "web"
              ? {
                  onMouseEnter: () => setIsScrubberHovered(true),
                  onMouseLeave: () => setIsScrubberHovered(false),
                  onMouseDown: handleSeekMouseDown,
                }
              : {})}
            onLayout={(e) => {
              progressBarWidthRef.current = e.nativeEvent.layout.width;
            }}
          >
            <View style={[styles.progressBarTrack, { pointerEvents: "none" }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${progressPercent}%`,
                    backgroundColor: isScrubberActive ? colors.primary : "#FFFFFF",
                    pointerEvents: "none",
                  },
                ]}
              />
              <View
                style={[
                  styles.progressKnob,
                  { left: `${progressPercent}%`, pointerEvents: "none" },
                  (isScrubberActive || Platform.OS !== "web") && styles.knobVisible,
                ]}
              />
            </View>
          </TouchableOpacity>
          <Text style={styles.timeLabel}>{formatTime(effectiveDuration)}</Text>
        </View>
      </View>

      {/* 3. RIGHT SECTION: Device, Volume Slider, Expand */}
      <View style={[styles.rightSection, isTablet && styles.rightSectionTablet]}>
        <View style={styles.streamBadge}>
          <Ionicons
            name={isDesktop ? "desktop-outline" : isTablet ? "tablet-portrait-outline" : "phone-portrait-outline"}
            size={14}
            color={colors.primary}
            style={{ marginRight: 6 }}
          />
          <Text style={styles.streamText}>
            {isDesktop ? "Desktop" : isTablet ? "iPad / Tablet" : "Phone"}
          </Text>
        </View>



        {/* Maximize to modal */}
        <TouchableOpacity
          style={styles.expandBtn}
          onPress={() => setFullPlayerVisible(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="expand-outline" size={17} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  playerBarContainer: {
    height: 86,
    backgroundColor: "#000000",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    zIndex: 100,
  },
  idleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  idleText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
  },

  // Left Section
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    width: 260,
  },
  leftSectionTablet: {
    width: 190,
  },
  artworkWrapper: {
    position: "relative",
    width: 54,
    height: 54,
    borderRadius: 6,
    marginRight: 12,
    overflow: "hidden",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  artwork: {
    width: "100%",
    height: "100%",
    borderRadius: 6,
    backgroundColor: colors.surfaceCard,
  },
  artworkOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0,
  },
  artworkOverlayHovered: {
    opacity: 1,
  },
  trackInfo: {
    flex: 1,
    marginRight: 10,
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  trackTitle: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: "#FFFFFF",
    lineHeight: 18,
  },
  trackArtist: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: "#FFFFFF",
    marginTop: 2,
  },
  likeButtonWrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  heartBtn: {
    padding: 6,
  },

  // Center Section
  centerSection: {
    flex: 1,
    maxWidth: 580,
    alignItems: "center",
    justifyContent: "center",
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 6,
  },
  controlBtn: {
    padding: 6,
  },
  playPauseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  scrubberRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 10,
  },
  timeLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
    minWidth: 32,
    textAlign: "center",
  },
  progressBarWrapper: {
    flex: 1,
    height: 20,
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer", touchAction: "none" } : {}),
  },
  progressBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.24)",
    position: "relative",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 2,
    ...(Platform.OS === "web" ? { transition: "background-color 0.15s ease" } : {}),
  },
  progressKnob: {
    position: "absolute",
    top: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
    marginLeft: -5,
    opacity: 0,
    elevation: 3,
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 1px 2px rgba(0, 0, 0, 0.35)", transition: "opacity 0.15s ease" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.35,
          shadowRadius: 2,
        }),
  },

  // Right Section
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 16,
    width: 280,
  },
  rightSectionTablet: {
    width: 170,
    gap: 12,
  },
  streamBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(29, 185, 84, 0.08)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.2)",
  },
  streamDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  streamText: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: colors.primary,
  },
  volumeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  volumeBarWrapper: {
    width: 96,
    height: 20,
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer", touchAction: "none" } : {}),
  },
  volumeTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.24)",
    position: "relative",
  },
  volumeFill: {
    height: "100%",
    borderRadius: 2,
    ...(Platform.OS === "web" ? { transition: "background-color 0.15s ease" } : {}),
  },
  volumeKnob: {
    position: "absolute",
    top: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
    marginLeft: -5,
    opacity: 0,
    elevation: 3,
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 1px 2px rgba(0, 0, 0, 0.35)", transition: "opacity 0.15s ease" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.35,
          shadowRadius: 2,
        }),
  },
  knobVisible: {
    opacity: 1,
  },
  expandBtn: {
    padding: 6,
  },
});
