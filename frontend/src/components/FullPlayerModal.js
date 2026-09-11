import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Dimensions,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Platform,
  Animated,
  PanResponder,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudio } from "../context/AudioContext";
import { useUser } from "../context/UserContext";
import { colors, fonts } from "../theme/colors";
import { api } from "../api/client";
import AddToPlaylistModal from "./AddToPlaylistModal";
import ArtistModal from "./ArtistModal";
import LikeConfetti from "./LikeConfetti";
import LiveReactionOverlay from "./LiveReactionOverlay";
import { resolveLocalArtistImage } from "../theme/artistImages";
import { useResponsive } from "../context/ResponsiveContext";
import { registerBackAction } from "../services/navigation";
import { getHighResArtwork } from "../utils/imageUtils";

const { width, height } = Dimensions.get("window");
// Larger artwork size for better visual impact
const ARTWORK_SIZE = Math.min(width - 24, height * 0.48, 480);

const globalArtistPhotoCache = new Map();

function ArtistPickerRow({ name, photo, onPress }) {
  const [imgError, setImgError] = useState(false);
  const initial = (name?.[0] || "A").toUpperCase();

  return (
    <TouchableOpacity
      style={styles.artistPickerItem}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {photo && !imgError ? (
        <Image
          source={{ uri: photo }}
          style={styles.artistPickerAvatar}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <View style={[styles.artistPickerAvatar, styles.artistPickerFallback]}>
          <Text style={styles.artistPickerFallbackInitial}>{initial}</Text>
        </View>
      )}
      <View style={styles.artistPickerTextWrap}>
        <Text style={styles.artistPickerName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.artistPickerRole}>Artist</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#666666" />
    </TouchableOpacity>
  );
}

function parseTrackArtists(artistStr) {
  if (!artistStr) return [];
  const splitRegex = /,|\s+&\s+|\s+\+\s+|\s+(?:feat|ft)\.?\s+|\s+vs\.?\s+|\s*\/\s*/i;
  const parts = artistStr
    .split(splitRegex)
    .map((name) => name.replace(/[\(\)\[\]]/g, "").trim())
    .filter((name) => name.length > 0);
  return Array.from(new Set(parts));
}

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

export default function FullPlayerModal() {
  const {
    currentTrack,
    isPlaying,
    isLoading,
    positionMillis,
    durationMillis,
    queue,
    queueIndex,
    isRepeat,
    isShuffle,
    isFullPlayerVisible,
    togglePlayPause,
    seekTo,
    playNext,
    playPrevious,
    toggleRepeat,
    toggleShuffle,
    setFullPlayerVisible,
    playTrack,
    sleepSecondsLeft,
    sleepEndOnTrack,
    setSleepTimer,
    setSleepEndOfTrack,
    cancelSleepTimer,
    removeFromQueue,
    clearQueue,
    addToPlayNext,
    setAsNextTrack,
    moveQueueItem,
    isQueueOpen,
    setIsQueueOpen,
  } = useAudio();

  const { isDesktop, isTablet, deviceName, deviceIcon: accurateDeviceIcon } = useResponsive();

  const { isSongLiked, toggleLikeSong, isTrackInAnyPlaylist } = useUser();
  const isFavorite = isSongLiked(currentTrack?.videoId || currentTrack?.video_id);
  const isTrackInPlaylist = isTrackInAnyPlaylist ? isTrackInAnyPlaylist(currentTrack) : false;
  const [showLikeConfetti, setShowLikeConfetti] = useState(false);
  const likeScaleAnim = useRef(new Animated.Value(1)).current;

  // Smooth dragging / scrubbing state
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPercent, setScrubPercent] = useState(0);
  const isScrubbingRef = useRef(false);
  const scrubPercentRef = useRef(0);
  const desktopProgressBarRef = useRef(null);
  const mobileProgressBarRef = useRef(null);
  const [isScrubberHovered, setIsScrubberHovered] = useState(false);
  const barLayoutRef = useRef({ pageX: 0, width: 0 });

  const [showQueue, setShowQueue] = useState(false);

  useEffect(() => {
    if (isQueueOpen) {
      setShowQueue(true);
    }
  }, [isQueueOpen]);
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState(null);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [showSleepModal, setShowSleepModal] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const [selectedArtistForModal, setSelectedArtistForModal] = useState(null);
  const [showArtistPickerModal, setShowArtistPickerModal] = useState(false);
  const [artistsOnTrack, setArtistsOnTrack] = useState([]);
  const [artistPhotos, setArtistPhotos] = useState({});
  const artistPanY = useRef(new Animated.Value(0)).current;

  const artistPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          artistPanY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 70 || gestureState.vy > 0.5) {
          Animated.timing(artistPanY, {
            toValue: 400,
            duration: 180,
            useNativeDriver: Platform.OS !== "web",
          }).start(() => {
            setShowArtistPickerModal(false);
            artistPanY.setValue(0);
          });
        } else {
          Animated.spring(artistPanY, {
            toValue: 0,
            friction: 8,
            useNativeDriver: Platform.OS !== "web",
          }).start();
        }
      },
    })
  ).current;

  // Helper to fetch and cache an artist's image
  const loadArtistImage = useCallback(async (artistName) => {
    const clean = (artistName || "").trim();
    if (!clean) return;

    if (globalArtistPhotoCache.has(clean)) {
      const cached = globalArtistPhotoCache.get(clean);
      if (cached) {
        setArtistPhotos((prev) => (prev[clean] === cached ? prev : { ...prev, [clean]: cached }));
      }
      return;
    }

    const local = resolveLocalArtistImage(clean);
    if (local) {
      globalArtistPhotoCache.set(clean, local);
      setArtistPhotos((prev) => (prev[clean] === local ? prev : { ...prev, [clean]: local }));
      return;
    }

    try {
      const res = await api.getArtistImage(clean);
      const photo = res?.image || res?.image_url;
      if (
        photo &&
        !photo.includes("artist-default-music.png") &&
        !photo.includes("default_artist")
      ) {
        globalArtistPhotoCache.set(clean, photo);
        setArtistPhotos((prev) => ({ ...prev, [clean]: photo }));
      }
    } catch (_) {}
  }, []);

  // Pre-fetch artist images for current playing track
  useEffect(() => {
    if (!currentTrack?.artist) return;
    const artists = parseTrackArtists(currentTrack.artist);
    artists.forEach((name) => loadArtistImage(name));
  }, [currentTrack?.artist, loadArtistImage]);

  // Fetch when artistsOnTrack changes
  useEffect(() => {
    if (artistsOnTrack && artistsOnTrack.length > 0) {
      artistsOnTrack.forEach((name) => loadArtistImage(name));
    }
  }, [artistsOnTrack, loadArtistImage]);

  const [showPreviousQueue, setShowPreviousQueue] = useState(false);
  const lyricsListRef = useRef(null);

  // Android hardware back button handler stack
  useEffect(() => {
    if (selectedArtistForModal) {
      return registerBackAction(() => {
        setSelectedArtistForModal(null);
        return true;
      });
    }
  }, [selectedArtistForModal]);

  useEffect(() => {
    if (showArtistPickerModal) {
      return registerBackAction(() => {
        setShowArtistPickerModal(false);
        return true;
      });
    }
  }, [showArtistPickerModal]);

  useEffect(() => {
    if (showSleepModal) {
      return registerBackAction(() => {
        setShowSleepModal(false);
        return true;
      });
    }
  }, [showSleepModal]);

  useEffect(() => {
    if (showAddToPlaylist) {
      return registerBackAction(() => {
        setShowAddToPlaylist(false);
        return true;
      });
    }
  }, [showAddToPlaylist]);

  useEffect(() => {
    if (showQueue) {
      return registerBackAction(() => {
        setShowQueue(false);
        return true;
      });
    }
  }, [showQueue]);

  useEffect(() => {
    if (showLyrics) {
      return registerBackAction(() => {
        setShowLyrics(false);
        return true;
      });
    }
  }, [showLyrics]);

  useEffect(() => {
    if (isFullPlayerVisible) {
      return registerBackAction(() => {
        setFullPlayerVisible(false);
        return true;
      });
    }
  }, [isFullPlayerVisible, setFullPlayerVisible]);

  const handleArtistPress = () => {
    const artists = parseTrackArtists(currentTrack?.artist);
    if (artists.length > 1) {
      setArtistsOnTrack(artists);
      artistPanY.setValue(0);
      setShowArtistPickerModal(true);
      artists.forEach((name) => loadArtistImage(name));
    } else if (artists.length === 1) {
      setSelectedArtistForModal(artists[0]);
    } else if (currentTrack?.artist) {
      setSelectedArtistForModal(currentTrack.artist);
    }
  };

  // Flip animation
  const flipAnim = useRef(new Animated.Value(0)).current;
  const isFlipped = useRef(false);

  const flipToLyrics = () => {
    const toValue = isFlipped.current ? 0 : 180;
    Animated.spring(flipAnim, {
      toValue,
      friction: 8,
      tension: 60,
      useNativeDriver: Platform.OS !== "web",
    }).start();
    isFlipped.current = !isFlipped.current;
    setShowLyrics(isFlipped.current);
  };

  // Reset flip and queue on close
  useEffect(() => {
    if (!isFullPlayerVisible) {
      flipAnim.setValue(0);
      isFlipped.current = false;
      setShowLyrics(false);
      setShowQueue(false);
    }
  }, [isFullPlayerVisible]);

  // Format countdown seconds to mm:ss
  const formatSleep = (s) => {
    if (s === null || s <= 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? "0" : ""}${sec}`;
  };

  // Dynamic device label & icon based on accurate device name (MacBook, Windows, iPhone, iPad, Android)
  const deviceLabel = deviceName || (isDesktop ? "Desktop" : isTablet ? "iPad / Tablet" : "Phone");
  const deviceIcon = accurateDeviceIcon || (isDesktop
    ? "desktop-outline"
    : isTablet
    ? "tablet-portrait-outline"
    : "phone-portrait-outline");

  // Fetch lyrics whenever currentTrack changes
  useEffect(() => {
    if (currentTrack?.title) {
      fetchSongLyrics();
    } else {
      setLyrics(null);
    }
  }, [currentTrack?.videoId, currentTrack?.title]);

  const parseLrcString = (lrc) => {
    if (!lrc || typeof lrc !== "string") return [];
    const lines = lrc.split("\n");
    const parsed = [];
    for (const line of lines) {
      const match = line.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/);
      if (match) {
        const min = parseInt(match[1], 10);
        const sec = parseInt(match[2], 10);
        const frac = match[3] ? parseFloat(`0.${match[3]}`) : 0;
        const time = min * 60 + sec + frac;
        const text = match[4].trim();
        if (text) {
          parsed.push({ time, text });
        }
      }
    }
    return parsed.sort((a, b) => a.time - b.time);
  };

  const fetchSongLyrics = async () => {
    if (!currentTrack?.title) return;
    setLoadingLyrics(true);
    try {
      const data = await api.getLyrics(
        currentTrack.title,
        currentTrack.artist || "",
        currentTrack.videoId || ""
      );
      if (data) {
        let synced = [];
        if (Array.isArray(data.synced_lyrics)) {
          synced = data.synced_lyrics;
        } else if (typeof (data.syncedLyrics || data.synced_lyrics) === "string") {
          synced = parseLrcString(data.syncedLyrics || data.synced_lyrics);
        }
        const plain = data.plain_lyrics || data.plainLyrics || (synced.length > 0 ? synced.map((s) => s.text).join("\n") : "");
        const has = Boolean(synced.length > 0 || (plain && plain.trim().length > 0));
        setLyrics({
          has_lyrics: has,
          is_synced: synced.length > 0,
          synced_lyrics: synced,
          plain_lyrics: plain,
          instrumental: Boolean(data.instrumental),
        });
      } else {
        setLyrics(null);
      }
    } catch (err) {
      console.warn("Error fetching lyrics:", err);
      setLyrics(null);
    } finally {
      setLoadingLyrics(false);
    }
  };

  // Calculate current active line in synced lyrics
  const currentSeconds = (positionMillis || 0) / 1000;
  let activeLineIndex = -1;
  if (lyrics?.synced_lyrics && lyrics.synced_lyrics.length > 0) {
    for (let i = 0; i < lyrics.synced_lyrics.length; i++) {
      if (currentSeconds >= lyrics.synced_lyrics[i].time) {
        activeLineIndex = i;
      } else {
        break;
      }
    }
  }

  // Auto-scroll lyrics as song plays
  useEffect(() => {
    if (showLyrics && lyrics?.is_synced && activeLineIndex >= 0 && lyricsListRef.current) {
      try {
        lyricsListRef.current.scrollToIndex({
          index: activeLineIndex,
          viewPosition: 0.35,
          animated: true,
        });
      } catch (_) {}
    }
  }, [activeLineIndex, showLyrics]);

  // ⚠️ panResponder useRef MUST be before any early return (Rules of Hooks)
  // Use a ref for duration so the closure always reads the latest value
  const durationRef = useRef(0);

  const getTargetFromClientX = (clientX, barRef) => {
    const dur = durationRef.current || 0;
    if (!dur || !barRef?.current) return 0;
    const rect = barRef.current.getBoundingClientRect?.();
    if (!rect || rect.width <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * dur;
  };

  const startScrub = (e, barRef) => {
    const dur = durationRef.current || 0;
    if (!dur) return;

    const isTouch = Boolean(e.touches && e.touches.length > 0);
    const startX = isTouch
      ? e.touches[0].clientX
      : (e.nativeEvent?.clientX ?? e.clientX ?? 0);
    const initialTarget = getTargetFromClientX(startX, barRef);
    const initialPercent = dur > 0 ? (initialTarget / dur) * 100 : 0;

    isScrubbingRef.current = true;
    scrubPercentRef.current = initialPercent;
    setIsScrubbing(true);
    setScrubPercent(initialPercent);

    if (Platform.OS === "web" && typeof window !== "undefined") {
      let lastClientX = startX;

      const onMouseMove = (moveEvt) => {
        lastClientX = moveEvt.clientX;
        const target = getTargetFromClientX(moveEvt.clientX, barRef);
        const percent = dur > 0 ? (target / dur) * 100 : 0;
        scrubPercentRef.current = percent;
        setScrubPercent(percent);
      };

      const onMouseUp = (upEvt) => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        const finalClientX = upEvt.clientX ?? lastClientX;
        const finalTarget = getTargetFromClientX(finalClientX, barRef);
        const finalPercent = dur > 0 ? (finalTarget / dur) * 100 : 0;

        if (finalPercent >= 99 && dur > 0) {
          playNext();
        } else {
          seekTo(finalTarget);
        }

        setTimeout(() => {
          isScrubbingRef.current = false;
          setIsScrubbing(false);
        }, 120);
      };

      const onTouchMove = (touchEvt) => {
        if (touchEvt.touches && touchEvt.touches[0]) {
          lastClientX = touchEvt.touches[0].clientX;
          const target = getTargetFromClientX(lastClientX, barRef);
          const percent = dur > 0 ? (target / dur) * 100 : 0;
          scrubPercentRef.current = percent;
          setScrubPercent(percent);
        }
      };

      const onTouchEnd = (touchEndEvt) => {
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", onTouchEnd);
        const t = touchEndEvt.changedTouches?.[0];
        const finalClientX = t ? t.clientX : lastClientX;
        const finalTarget = getTargetFromClientX(finalClientX, barRef);
        const finalPercent = dur > 0 ? (finalTarget / dur) * 100 : 0;

        if (finalPercent >= 99 && dur > 0) {
          playNext();
        } else {
          seekTo(finalTarget);
        }

        setTimeout(() => {
          isScrubbingRef.current = false;
          setIsScrubbing(false);
        }, 120);
      };

      if (isTouch) {
        window.addEventListener("touchmove", onTouchMove, { passive: true });
        window.addEventListener("touchend", onTouchEnd, { passive: true });
      } else {
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
      }
    }
  };

  const handlePressSeek = (e, barRef) => {
    const dur = durationRef.current || 0;
    if (!dur) return;
    if (Platform.OS === "web") {
      const clientX = e.nativeEvent?.clientX ?? e.clientX ?? 0;
      const target = getTargetFromClientX(clientX, barRef);
      const ratio = target / dur;
      if (ratio >= 0.99) {
        playNext();
      } else {
        seekTo(target);
      }
      return;
    }
    const locX = e.nativeEvent?.locationX ?? 0;
    const barW = barLayoutRef.current.width > 0 ? barLayoutRef.current.width : (width - 56);
    const ratio = Math.max(0, Math.min(1, locX / barW));
    if (ratio >= 0.985) {
      playNext();
    } else {
      seekTo(Math.floor(ratio * dur));
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => Platform.OS !== "web",
      onMoveShouldSetPanResponder: () => Platform.OS !== "web",
      onPanResponderGrant: (evt, gestureState) => {
        isScrubbingRef.current = true;
        setIsScrubbing(true);
        const barW = barLayoutRef.current.width > 0 ? barLayoutRef.current.width : (width - 56);
        const barX = barLayoutRef.current.pageX || 0;
        const pageX = evt.nativeEvent.pageX ?? gestureState.x0;
        const clampedRatio = Math.max(0, Math.min(1, (pageX - barX) / barW));
        const percent = clampedRatio * 100;
        scrubPercentRef.current = percent;
        setScrubPercent(percent);
      },
      onPanResponderMove: (evt, gestureState) => {
        const barW = barLayoutRef.current.width > 0 ? barLayoutRef.current.width : (width - 56);
        const barX = barLayoutRef.current.pageX || 0;
        const pageX = evt.nativeEvent.pageX ?? (gestureState.x0 + gestureState.dx);
        const clampedRatio = Math.max(0, Math.min(1, (pageX - barX) / barW));
        const percent = clampedRatio * 100;
        scrubPercentRef.current = percent;
        setScrubPercent(percent);
      },
      onPanResponderRelease: async () => {
        const finalPercent = scrubPercentRef.current;
        const dur = durationRef.current || 0;

        if (finalPercent >= 98.5 && dur > 0) {
          playNext();
        } else {
          const targetMillis = Math.floor((finalPercent / 100) * dur);
          try {
            await seekTo(targetMillis);
          } catch (_) {}
        }
        setTimeout(() => {
          isScrubbingRef.current = false;
          setIsScrubbing(false);
        }, 120);
      },
      onPanResponderTerminate: () => {
        isScrubbingRef.current = false;
        setIsScrubbing(false);
      },
    })
  ).current;

  if (!currentTrack) return null;

  // Clean track title — strip YouTube noise like "(Official Video)", "(Audio)", etc.
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

  // Accurate duration with fallback to metadata duration_seconds or duration string
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

  const progressRatio =
    effectiveDuration > 0
      ? Math.min(1, Math.max(0, (positionMillis || 0) / effectiveDuration))
      : 0;
  const progressPercent = progressRatio * 100;

  // Keep durationRef in sync so panResponder closure always reads the latest value
  durationRef.current = effectiveDuration || durationMillis || 0;

  // Get 2 lines to show as overlay preview (current + next)
  const overlayLines = [];
  if (lyrics?.synced_lyrics?.length > 0 && activeLineIndex >= 0) {
    const line1 = lyrics.synced_lyrics[activeLineIndex]?.text;
    const line2 =
      activeLineIndex + 1 < lyrics.synced_lyrics.length
        ? lyrics.synced_lyrics[activeLineIndex + 1]?.text
        : null;
    if (line1) overlayLines.push(line1);
    if (line2) overlayLines.push(line2);
  } else if (lyrics?.plain_lyrics) {
    const lines = lyrics.plain_lyrics.split("\n").filter((l) => l.trim());
    if (lines[0]) overlayLines.push(lines[0]);
    if (lines[1]) overlayLines.push(lines[1]);
  }

  const isSliderActive = isScrubbing || isScrubberHovered;
  const currentDisplayPercent = isScrubbing ? scrubPercent : progressPercent;
  const currentDisplayTime = isScrubbing
    ? Math.floor((scrubPercent / 100) * (effectiveDuration || 1))
    : (positionMillis || 0);

  const handleToggleFavorite = async () => {
    if (!currentTrack) return;
    try {
      // Spring pop animation on heart button
      Animated.sequence([
        Animated.timing(likeScaleAnim, {
          toValue: 1.4,
          duration: 140,
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

  // Flip interpolations
  const frontRotate = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ["0deg", "180deg"],
  });
  const backRotate = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ["180deg", "360deg"],
  });
  const frontOpacity = flipAnim.interpolate({
    inputRange: [89, 90],
    outputRange: [1, 0],
  });
  const backOpacity = flipAnim.interpolate({
    inputRange: [89, 90],
    outputRange: [0, 1],
  });

  const renderQueueView = () => {
    const validQueue = Array.isArray(queue) ? queue : [];
    const currentQueueTrack =
      queueIndex >= 0 && queueIndex < validQueue.length
        ? validQueue[queueIndex]
        : currentTrack;
    const previousTracks = queueIndex > 0 ? validQueue.slice(0, queueIndex) : [];
    const upcomingTracks =
      queueIndex >= 0 ? validQueue.slice(queueIndex + 1) : validQueue;

    return (
      <View style={[styles.queueContainer, (isDesktop || isTablet) && styles.desktopQueueContainer]}>
        {/* Queue Header with count and Clear option */}
        <View style={styles.queueHeaderRow}>
          <View>
            <Text style={styles.queueHeaderTitle}>Queue</Text>
            <Text style={styles.queueHeaderSubtitle}>
              {validQueue.length} {validQueue.length === 1 ? "song" : "songs"}
            </Text>
          </View>
          {upcomingTracks.length > 0 && (
            <TouchableOpacity
              style={styles.clearQueueBtn}
              onPress={clearQueue}
              hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Text style={styles.clearQueueText}>Clear Queue</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          style={styles.queueScrollView}
          contentContainerStyle={{ paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Previous Tracks Collapsible Section */}
          {previousTracks.length > 0 && (
            <View style={styles.queueSectionWrap}>
              <TouchableOpacity
                onPress={() => setShowPreviousQueue(!showPreviousQueue)}
                style={styles.queueSectionToggleRow}
                activeOpacity={0.7}
              >
                <Text style={styles.queueSectionLabel}>
                  PREVIOUS ({previousTracks.length})
                </Text>
                <Ionicons
                  name={showPreviousQueue ? "chevron-up" : "chevron-down"}
                  size={15}
                  color="#888888"
                />
              </TouchableOpacity>
              {showPreviousQueue &&
                previousTracks.map((item, idx) => (
                  <TouchableOpacity
                    key={`${item.videoId || item.video_id}_prev_${idx}`}
                    style={styles.queueItem}
                    onPress={() => playTrack(item, validQueue, idx)}
                    activeOpacity={0.7}
                  >
                    <Image
                      source={{ uri: item.artwork_url || item.thumbnail }}
                      style={[styles.queueThumb, { opacity: 0.55 }]}
                    />
                    <View style={styles.queueItemText}>
                      <Text style={[styles.queueTitle, { color: "#888888" }]} numberOfLines={1}>
                        {cleanTitle(item.title)}
                      </Text>
                      <Text style={styles.queueArtist} numberOfLines={1}>
                        {item.artist}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
            </View>
          )}

          {/* Now Playing Section */}
          {currentQueueTrack && (
            <View style={styles.queueSectionWrap}>
              <Text style={styles.queueSectionLabel}>NOW PLAYING</Text>
              <TouchableOpacity
                style={styles.queueItem}
                onPress={togglePlayPause}
                activeOpacity={0.85}
              >
                <Image
                  source={{ uri: currentQueueTrack.artwork_url || currentQueueTrack.thumbnail }}
                  style={styles.queueThumb}
                />
                <View style={styles.queueItemText}>
                  {/* Name highlighted in green (#1DB954) */}
                  <Text
                    style={[styles.queueTitle, styles.activeQueueText]}
                    numberOfLines={1}
                  >
                    {cleanTitle(currentQueueTrack.title)}
                  </Text>
                  <Text style={styles.queueArtist} numberOfLines={1}>
                    {currentQueueTrack.artist}
                  </Text>
                </View>
                {/* No speaker icon, no background highlight */}
              </TouchableOpacity>
            </View>
          )}

          {/* Next In Queue Section */}
          <View style={styles.queueSectionWrap}>
            <Text style={styles.queueSectionLabel}>
              NEXT IN QUEUE {upcomingTracks.length > 0 ? `(${upcomingTracks.length})` : ""}
            </Text>

            {upcomingTracks.length === 0 ? (
              <View style={styles.queueEmptyState}>
                <Ionicons name="musical-notes-outline" size={32} color="rgba(255,255,255,0.2)" />
                <Text style={styles.queueEmptyText}>Queue is empty</Text>
                <Text style={styles.queueEmptySubtext}>
                  Songs based on this artist, trending hits, and fresh releases are queued automatically when you play music.
                </Text>
              </View>
            ) : (
              upcomingTracks.map((item, idx) => {
                const actualIndex = (queueIndex >= 0 ? queueIndex + 1 : 0) + idx;
                return (
                  <TouchableOpacity
                    key={`${item.videoId || item.video_id}_up_${actualIndex}`}
                    style={styles.queueItem}
                    onPress={() => playTrack(item, validQueue, actualIndex)}
                    activeOpacity={0.7}
                  >
                    <Image
                      source={{ uri: item.artwork_url || item.thumbnail }}
                      style={styles.queueThumb}
                    />
                    <View style={styles.queueItemText}>
                      <Text style={styles.queueTitle} numberOfLines={1}>
                        {cleanTitle(item.title)}
                      </Text>
                      <Text style={styles.queueArtist} numberOfLines={1}>
                        {item.artist}
                      </Text>
                    </View>

                    <TouchableOpacity
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        removeFromQueue(actualIndex);
                      }}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      style={styles.queueRemoveBtn}
                    >
                      <Ionicons name="close" size={18} color="#777777" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>
      </View>
    );
  };

  const renderDesktopPlayer = () => {
    return (
      <View style={styles.desktopContainer}>
        {/* Soft Ambient Album Glow Background */}
        {artwork && (
          <View style={[styles.desktopAmbientWrapper, { pointerEvents: "none" }]}>
            <Image
              source={{ uri: artwork }}
              style={styles.desktopAmbientImage}
              resizeMode="cover"
              blurRadius={Platform.OS === "web" ? 80 : 36}
            />
            <View style={styles.desktopAmbientVignette} />
          </View>
        )}

        {/* Desktop Top Navigation Bar */}
        <View style={styles.desktopTopBar}>
          <TouchableOpacity
            style={styles.desktopMinimizeBtn}
            onPress={() => setFullPlayerVisible(false)}
            activeOpacity={0.8}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-down" size={20} color="#FFFFFF" />
            <Text style={styles.desktopMinimizeText}>Minimize</Text>
          </TouchableOpacity>

          <View style={styles.desktopTopTitleCol}>
            <Text style={styles.desktopNowPlayingLabel}>PLAYING FROM FEED</Text>
            <Text style={styles.desktopTopSubtitle} numberOfLines={1}>
              {currentTrack.album || currentTrack.title || "Staytup Music"}
            </Text>
          </View>

          <View style={styles.desktopTopRightActions}>
            <TouchableOpacity
              style={styles.desktopSleepBtn}
              onPress={() => setShowSleepModal(true)}
              activeOpacity={0.8}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={sleepSecondsLeft !== null || sleepEndOnTrack ? "moon" : "moon-outline"}
                size={16}
                color={sleepSecondsLeft !== null || sleepEndOnTrack ? colors.primary : "#FFFFFF"}
              />
              <Text
                style={[
                  styles.desktopSleepBtnText,
                  (sleepSecondsLeft !== null || sleepEndOnTrack) && styles.desktopSleepBtnTextActive,
                ]}
              >
                {sleepSecondsLeft !== null
                  ? formatSleep(sleepSecondsLeft)
                  : sleepEndOnTrack
                  ? "End of track"
                  : "Sleep Timer"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.desktopSleepBtn, showQueue && { borderColor: colors.primary }]}
              onPress={() => setShowQueue(!showQueue)}
              activeOpacity={0.8}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={showQueue ? "close" : "list"}
                size={16}
                color={showQueue ? colors.primary : "#FFFFFF"}
              />
              <Text
                style={[
                  styles.desktopSleepBtnText,
                  showQueue && { color: colors.primary },
                ]}
              >
                {showQueue ? "Close Queue" : "Queue"}
              </Text>
            </TouchableOpacity>

          </View>
        </View>

        {/* Desktop Main Stage */}
        <View style={styles.desktopMiddleContainer}>
          {showQueue ? (
            renderQueueView()
          ) : (
            /* Desktop Flippable Card Main Stage (Just like phone) */
            <View style={styles.desktopMainStageCenter}>
            {/* Flippable Artwork / Lyrics Card */}
            <View style={styles.desktopFlipWrapper}>
              <TouchableOpacity
                activeOpacity={0.95}
                onPress={flipToLyrics}
                style={styles.desktopFlipTouchable}
              >
                {/* Front - Artwork */}
                <Animated.View
                  style={[
                    styles.desktopArtworkContainer,
                    { transform: [{ rotateY: frontRotate }], opacity: frontOpacity },
                  ]}
                >
                  {artwork ? (
                    <Image
                      key={currentTrack?.videoId || currentTrack?.video_id || "artwork-desktop"}
                      source={{ uri: artwork }}
                      style={styles.desktopArtworkImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.desktopArtworkImage, styles.artworkFallback]}>
                      <Ionicons name="musical-notes" size={80} color={colors.primary} />
                    </View>
                  )}

                  {/* 2-line lyrics overlay at bottom of artwork */}
                  {overlayLines.length > 0 && (
                    <View style={styles.lyricsOverlay}>
                      <View style={styles.lyricsOverlayBg} />
                      {overlayLines.map((line, i) => (
                        <Text
                          key={i}
                          style={[
                            styles.lyricsOverlayText,
                            i === 0 && styles.lyricsOverlayTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {line}
                        </Text>
                      ))}
                      <View style={styles.lyricsOverlayHint}>
                        <Ionicons name="mic" size={11} color="rgba(255,255,255,0.6)" />
                        <Text style={styles.lyricsOverlayHintText}> click thumbnail to see lyrics</Text>
                      </View>
                    </View>
                  )}
                </Animated.View>

                {/* Back - Lyrics */}
                <Animated.View
                  style={[
                    styles.desktopLyricsCard,
                    {
                      transform: [{ rotateY: backRotate }],
                      opacity: backOpacity,
                      position: "absolute",
                      top: 0,
                      left: 0,
                    },
                  ]}
                >
                  {loadingLyrics ? (
                    <View style={styles.desktopLyricsCenter}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={styles.desktopLyricsLoadingText}>Fetching synced lyrics...</Text>
                    </View>
                  ) : lyrics?.has_lyrics ? (
                    lyrics.is_synced && lyrics.synced_lyrics?.length > 0 ? (
                      <FlatList
                        ref={lyricsListRef}
                        data={lyrics.synced_lyrics}
                        keyExtractor={(item, index) => `${item.time}_${index}`}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.desktopLyricsScroll}
                        onScrollToIndexFailed={() => {}}
                        renderItem={({ item, index }) => {
                          const isCurrent = index === activeLineIndex;
                          const isPast = index < activeLineIndex;
                          return (
                            <TouchableOpacity
                              onPress={() => seekTo(Math.floor(item.time * 1000))}
                              activeOpacity={0.75}
                              style={[
                                styles.desktopSyncedLineWrap,
                                isCurrent && styles.desktopSyncedLineWrapActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.desktopSyncedLineText,
                                  isCurrent && styles.desktopSyncedLineCurrent,
                                  isPast && styles.desktopSyncedLinePast,
                                ]}
                              >
                                {item.text || "♪ ♪ ♪"}
                              </Text>
                            </TouchableOpacity>
                          );
                        }}
                      />
                    ) : (
                      <FlatList
                        data={(lyrics.plain_lyrics || "").split("\n")}
                        keyExtractor={(_, idx) => String(idx)}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.desktopLyricsScroll}
                        renderItem={({ item }) => (
                          <Text style={styles.desktopPlainLyricsLine}>{item || " "}</Text>
                        )}
                      />
                    )
                  ) : (
                    <View style={styles.desktopLyricsCenter}>
                      <Ionicons name="musical-notes-outline" size={42} color="rgba(255,255,255,0.2)" />
                      <Text style={styles.desktopNoLyricsTitle}>Lyrics not available</Text>
                      <Text style={styles.desktopNoLyricsSub}>
                        Synced lyrics haven't been published for this song yet.
                      </Text>
                    </View>
                  )}

                  {/* Flip-back hint */}
                  <View style={styles.flipBackHint}>
                    <Ionicons name="image-outline" size={12} color="rgba(255,255,255,0.4)" />
                    <Text style={styles.flipBackHintText}> click to flip back to artwork</Text>
                  </View>
                </Animated.View>
              </TouchableOpacity>
            </View>

            {/* Song Meta Information Centered Under Card */}
            <View style={styles.desktopCenterMeta}>
              <Text style={styles.desktopCenterSongTitle} numberOfLines={1}>
                {cleanTitle(currentTrack.title)}
              </Text>

              <TouchableOpacity
                onPress={handleArtistPress}
                activeOpacity={0.75}
                style={styles.desktopCenterArtistPressable}
                hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
              >
                <Text style={styles.desktopCenterArtistName} numberOfLines={1}>
                  {currentTrack.artist}
                </Text>
                <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>

              {/* Actions Row */}
              <View style={styles.desktopCenterActionsRow}>
                {/* Heart Favorite with Confetti */}
                <View style={styles.likeButtonWrapper}>
                  {showLikeConfetti && (
                    <LikeConfetti onComplete={() => setShowLikeConfetti(false)} />
                  )}
                  <TouchableOpacity
                    onPress={handleToggleFavorite}
                    style={styles.desktopActionIconBtn}
                    activeOpacity={0.8}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Animated.View style={{ transform: [{ scale: likeScaleAnim }] }}>
                      <Ionicons
                        name={isFavorite ? "heart" : "heart-outline"}
                        size={22}
                        color={isFavorite ? colors.primary : "#FFFFFF"}
                      />
                    </Animated.View>
                  </TouchableOpacity>
                </View>

                {/* Add to Playlist */}
                <TouchableOpacity
                  onPress={() => setShowAddToPlaylist(true)}
                  style={styles.desktopActionIconBtn}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={isTrackInPlaylist ? "In playlist" : "Add to playlist"}
                >
                  <Ionicons
                    name={isTrackInPlaylist ? "checkmark-circle" : "add-circle-outline"}
                    size={22}
                    color={isTrackInPlaylist ? colors.primary : "#FFFFFF"}
                  />
                </TouchableOpacity>

                {/* View Artist Profile */}
                <TouchableOpacity
                  onPress={handleArtistPress}
                  style={styles.desktopActionIconBtn}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="person-outline" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
          )}
        </View>

        {/* Desktop Full-Width Playback Control Deck */}
        <View style={styles.desktopControlDeck}>
          {/* Full-width Scrubber Bar */}
          <View style={styles.desktopScrubberRow}>
            <Text style={[styles.desktopTimeText, isSliderActive && styles.timeTextActive]}>
              {formatTime(currentDisplayTime)}
            </Text>

            <TouchableOpacity
              ref={desktopProgressBarRef}
              {...(Platform.OS !== "web" ? panResponder.panHandlers : {})}
              onPress={(e) => handlePressSeek(e, desktopProgressBarRef)}
              activeOpacity={1}
              {...(Platform.OS === "web"
                ? {
                    onMouseEnter: () => setIsScrubberHovered(true),
                    onMouseLeave: () => setIsScrubberHovered(false),
                    onMouseDown: (e) => startScrub(e, desktopProgressBarRef),
                    onTouchStart: (e) => startScrub(e, desktopProgressBarRef),
                  }
                : {})}
              onLayout={(e) => {
                const layoutWidth = e.nativeEvent.layout.width;
                setProgressBarWidth(layoutWidth);
                barLayoutRef.current.width = layoutWidth;
                e.target?.measure?.((x, y, w, h, pageX) => {
                  if (w > 0) barLayoutRef.current = { pageX, width: w };
                });
              }}
              style={styles.desktopSeekTouchArea}
            >
              <View
                style={[
                  styles.progressBarTrack,
                  isSliderActive && styles.progressBarTrackActive,
                  { pointerEvents: "none" },
                ]}
              >
                <View
                  style={[
                    styles.progressBarFilled,
                    isSliderActive && styles.progressBarFilledActive,
                    {
                      width: `${Math.min(100, Math.max(0, currentDisplayPercent))}%`,
                      pointerEvents: "none",
                    },
                  ]}
                />
                <View
                  style={[
                    styles.progressKnob,
                    isSliderActive && styles.progressKnobActive,
                    {
                      left: `${Math.min(100, Math.max(0, currentDisplayPercent))}%`,
                      pointerEvents: "none",
                    },
                  ]}
                />
              </View>
            </TouchableOpacity>

            <Text style={styles.desktopTimeText}>{formatTime(effectiveDuration)}</Text>
          </View>

          {/* 3-Section Control Row */}
          <View style={styles.desktopDeckRow}>
            {/* Left Section: Device & Status */}
            <View style={styles.desktopDeckLeft}>
              <Ionicons name={deviceIcon} size={16} color={colors.primary} />
              <Text style={styles.desktopDeckDeviceText}>Playing on {deviceLabel}</Text>
            </View>

            {/* Center Section: Primary Playback Controls */}
            <View style={styles.desktopDeckCenter}>
              <TouchableOpacity
                onPress={toggleShuffle}
                style={styles.desktopControlIconBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons
                  name="shuffle"
                  size={20}
                  color={isShuffle ? colors.primary : "#888888"}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={playPrevious}
                style={styles.desktopControlIconBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="play-skip-back" size={24} color="#FFFFFF" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={togglePlayPause}
                style={styles.desktopMainPlayBtn}
                activeOpacity={0.88}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Ionicons
                    name={isPlaying ? "pause" : "play"}
                    size={26}
                    color="#000000"
                    style={{ marginLeft: isPlaying ? 0 : 2 }}
                  />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={playNext}
                style={styles.desktopControlIconBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="play-skip-forward" size={24} color="#FFFFFF" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={toggleRepeat}
                style={styles.desktopControlIconBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons
                  name="repeat"
                  size={20}
                  color={isRepeat ? colors.primary : "#888888"}
                />
              </TouchableOpacity>
            </View>

            {/* Right Section: Minimize */}
            <View style={styles.desktopDeckRight}>
              <TouchableOpacity
                style={styles.desktopMinimizeDeckBtn}
                onPress={() => setFullPlayerVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="contract-outline" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderMobilePlayer = () => (
    <>
      {/* Top Header Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.topBarButton}
          onPress={() => setFullPlayerVisible(false)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-down" size={26} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.topTitleContainer}>
          <Text style={styles.nowPlayingLabel}>PLAYING FROM FEED</Text>
          <Text style={styles.topSubtitle} numberOfLines={1}>
            {currentTrack.album || currentTrack.title || "Staytup Music"}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.topBarButton}
          onPress={() => setShowQueue(!showQueue)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons
            name={showQueue ? "close" : "list"}
            size={24}
            color={showQueue ? colors.primary : "#FFFFFF"}
          />
        </TouchableOpacity>
      </View>

      {showQueue ? (
        renderQueueView()
      ) : (
        /* Main Player View */
        <View style={styles.playerBody}>
          {/* Flippable Artwork / Lyrics Card */}
          <View style={styles.artworkWrapper}>
            <TouchableOpacity
              activeOpacity={0.95}
              onPress={flipToLyrics}
              style={styles.flipTouchable}
            >
              {/* Front - Artwork */}
              <Animated.View
                style={[
                  styles.artworkContainer,
                  { transform: [{ rotateY: frontRotate }], opacity: frontOpacity },
                ]}
              >
                {artwork ? (
                  <Image key={currentTrack?.videoId || currentTrack?.video_id || "artwork-mobile"} source={{ uri: artwork }} style={styles.artwork} resizeMode="cover" />
                ) : (
                  <View style={[styles.artwork, styles.artworkFallback]}>
                    <Ionicons name="musical-notes" size={80} color={colors.primary} />
                  </View>
                )}

                {/* 2-line lyrics overlay at bottom of artwork */}
                {overlayLines.length > 0 && (
                  <View style={styles.lyricsOverlay}>
                    <View style={styles.lyricsOverlayBg} />
                    {overlayLines.map((line, i) => (
                      <Text
                        key={i}
                        style={[
                          styles.lyricsOverlayText,
                          i === 0 && styles.lyricsOverlayTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {line}
                      </Text>
                    ))}
                    <View style={styles.lyricsOverlayHint}>
                      <Ionicons name="mic" size={10} color="rgba(255,255,255,0.5)" />
                      <Text style={styles.lyricsOverlayHintText}> tap to see lyrics</Text>
                    </View>
                  </View>
                )}
              </Animated.View>

              {/* Back - Lyrics */}
              <Animated.View
                style={[
                  styles.lyricsCard,
                  {
                    transform: [{ rotateY: backRotate }],
                    opacity: backOpacity,
                    position: "absolute",
                    top: 0,
                    left: 0,
                  },
                ]}
              >
                {loadingLyrics ? (
                  <View style={styles.lyricsCenterWrap}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.lyricsLoadingText}>Loading lyrics...</Text>
                  </View>
                ) : lyrics?.has_lyrics ? (
                  lyrics.is_synced && lyrics.synced_lyrics?.length > 0 ? (
                    <FlatList
                      ref={lyricsListRef}
                      data={lyrics.synced_lyrics}
                      keyExtractor={(item, index) => `${item.time}_${index}`}
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={styles.lyricsScrollContent}
                      onScrollToIndexFailed={() => {}}
                      renderItem={({ item, index }) => {
                        const isCurrent = index === activeLineIndex;
                        const isPast = index < activeLineIndex;
                        return (
                          <TouchableOpacity
                            onPress={() => seekTo(Math.floor(item.time * 1000))}
                            activeOpacity={0.7}
                            style={[
                              styles.syncedLineWrap,
                              isCurrent && styles.syncedLineWrapActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.syncedLineText,
                                isCurrent && styles.syncedLineCurrent,
                                isPast && styles.syncedLinePast,
                              ]}
                            >
                              {item.text || "♪ ♪ ♪"}
                            </Text>
                          </TouchableOpacity>
                        );
                      }}
                    />
                  ) : (
                    <FlatList
                      data={(lyrics.plain_lyrics || "").split("\n")}
                      keyExtractor={(_, idx) => String(idx)}
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={styles.lyricsScrollContent}
                      renderItem={({ item }) => (
                        <Text style={styles.plainLyricsLine}>{item || " "}</Text>
                      )}
                    />
                  )
                ) : (
                  <View style={styles.lyricsCenterWrap}>
                    <Ionicons name="musical-note-outline" size={40} color={colors.textMuted} />
                    <Text style={styles.noLyricsTitle}>No lyrics available</Text>
                    <Text style={styles.noLyricsSub}>
                      Lyrics aren't synced for this track yet.
                    </Text>
                  </View>
                )}

                {/* Flip-back hint */}
                <View style={styles.flipBackHint}>
                  <Ionicons name="image-outline" size={12} color="rgba(255,255,255,0.4)" />
                  <Text style={styles.flipBackHintText}> tap to flip back</Text>
                </View>
              </Animated.View>
            </TouchableOpacity>
          </View>

          {/* Song Meta & Actions */}
          <View style={styles.metaRow}>
            <View style={styles.metaTextContainer}>
              <Text style={styles.songTitle} numberOfLines={1} ellipsizeMode="tail">
                {cleanTitle(currentTrack.title)}
              </Text>
              <TouchableOpacity
                onPress={handleArtistPress}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 0, right: 10 }}
              >
                <Text style={styles.artistName} numberOfLines={1}>
                  {currentTrack.artist}
                </Text>
              </TouchableOpacity>
              {(currentTrack.recommendation_reason || currentTrack.subtitle) ? (
                <View style={styles.reasonTagRow}>
                  <Ionicons name="sparkles" size={12} color={colors.primary} style={{ marginRight: 4 }} />
                  <Text style={styles.reasonTag} numberOfLines={1}>
                    {currentTrack.recommendation_reason || currentTrack.subtitle}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.metaActionsGroup}>
              <TouchableOpacity
                onPress={() => setShowAddToPlaylist(true)}
                style={styles.metaActionButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel={isTrackInPlaylist ? "In playlist" : "Add to playlist"}
              >
                <Ionicons
                  name={isTrackInPlaylist ? "checkmark-circle" : "add-circle-outline"}
                  size={26}
                  color={isTrackInPlaylist ? colors.primary : "#FFFFFF"}
                />
              </TouchableOpacity>

              <View style={styles.likeButtonWrapper}>
                {showLikeConfetti && (
                  <LikeConfetti onComplete={() => setShowLikeConfetti(false)} />
                )}
                <TouchableOpacity
                  onPress={handleToggleFavorite}
                  style={styles.metaActionButton}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Animated.View style={{ transform: [{ scale: likeScaleAnim }] }}>
                    <Ionicons
                      name={isFavorite ? "heart" : "heart-outline"}
                      size={26}
                      color={isFavorite ? colors.primary : "#FFFFFF"}
                    />
                  </Animated.View>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Progress Slider with Smooth Drag & Skip */}
          <View style={styles.progressSection}>
            <TouchableOpacity
              ref={mobileProgressBarRef}
              {...(Platform.OS !== "web" ? panResponder.panHandlers : {})}
              onPress={(e) => handlePressSeek(e, mobileProgressBarRef)}
              activeOpacity={1}
              {...(Platform.OS === "web"
                ? {
                    onMouseEnter: () => setIsScrubberHovered(true),
                    onMouseLeave: () => setIsScrubberHovered(false),
                    onMouseDown: (e) => startScrub(e, mobileProgressBarRef),
                    onTouchStart: (e) => startScrub(e, mobileProgressBarRef),
                  }
                : {})}
              onLayout={(e) => {
                const layoutWidth = e.nativeEvent.layout.width;
                setProgressBarWidth(layoutWidth);
                barLayoutRef.current.width = layoutWidth;
                e.target?.measure?.((x, y, w, h, pageX) => {
                  if (w > 0) barLayoutRef.current = { pageX, width: w };
                });
              }}
              style={styles.seekTouchArea}
            >
              <View
                style={[
                  styles.progressBarTrack,
                  isSliderActive && styles.progressBarTrackActive,
                  { pointerEvents: "none" },
                ]}
              >
                <View
                  style={[
                    styles.progressBarFilled,
                    isSliderActive && styles.progressBarFilledActive,
                    {
                      width: `${Math.min(100, Math.max(0, currentDisplayPercent))}%`,
                      pointerEvents: "none",
                    },
                  ]}
                />
                <View
                  style={[
                    styles.progressKnob,
                    isSliderActive && styles.progressKnobActive,
                    {
                      left: `${Math.min(100, Math.max(0, currentDisplayPercent))}%`,
                      pointerEvents: "none",
                    },
                  ]}
                />
              </View>
            </TouchableOpacity>

            <View style={styles.timeRow}>
              <Text style={[styles.timeText, isSliderActive && styles.timeTextActive]}>
                {formatTime(currentDisplayTime)}
              </Text>
              <Text style={styles.timeText}>{formatTime(effectiveDuration)}</Text>
            </View>
          </View>

          {/* Playback Controls */}
          <View style={styles.controlsRow}>
            <TouchableOpacity
              onPress={toggleShuffle}
              style={styles.controlIcon}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons
                name="shuffle"
                size={22}
                color={isShuffle ? colors.primary : "#777777"}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={playPrevious}
              style={styles.controlIcon}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="play-skip-back" size={28} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={togglePlayPause}
              style={styles.mainPlayButton}
              activeOpacity={0.88}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <Ionicons
                  name={isPlaying ? "pause" : "play"}
                  size={30}
                  color="#000000"
                  style={{ marginLeft: isPlaying ? 0 : 2 }}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={playNext}
              style={styles.controlIcon}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="play-skip-forward" size={28} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={toggleRepeat}
              style={styles.controlIcon}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons
                name="repeat"
                size={22}
                color={isRepeat ? colors.primary : "#777777"}
              />
            </TouchableOpacity>
          </View>

          {/* Bottom Utilities Row (Device Indicator on left, Sleep Timer on right) */}
          <View style={styles.bottomUtilitiesRow}>
            {/* Dynamic Device Indicator */}
            <View style={styles.deviceIndicator}>
              <Ionicons name={deviceIcon} size={16} color={colors.primary} />
              <Text style={styles.deviceLabel}>Playing on {deviceLabel}</Text>
            </View>

            {/* Sleep Timer Trigger Button */}
            <TouchableOpacity
              style={styles.utilityButton}
              onPress={() => setShowSleepModal(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={sleepSecondsLeft !== null || sleepEndOnTrack ? "moon" : "moon-outline"}
                size={20}
                color={sleepSecondsLeft !== null || sleepEndOnTrack ? colors.primary : "#A7A7A7"}
              />
              {(sleepSecondsLeft !== null || sleepEndOnTrack) && (
                <View style={styles.sleepActiveDot} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={isFullPlayerVisible}
      onRequestClose={() => setFullPlayerVisible(false)}
    >
      {isFullPlayerVisible && (
        <View style={styles.modalContainer}>
          {isDesktop || isTablet ? renderDesktopPlayer() : renderMobilePlayer()}

        {/* Dedicated Sleep Timer Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={showSleepModal}
          onRequestClose={() => setShowSleepModal(false)}
        >
          <View style={styles.sleepModalOverlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setShowSleepModal(false)}
              accessibilityLabel="Close sleep timer"
            />
            <View style={styles.sleepModalContent}>
              {/* Drag handle */}
              <View style={styles.sleepDragHandle} />

              {/* Header */}
              <View style={styles.sleepModalHeader}>
                <Text style={styles.sleepModalTitle}>Sleep Timer</Text>
              </View>

              {/* Active countdown or status banner if running */}
              {(sleepSecondsLeft !== null || sleepEndOnTrack) && (
                <View style={styles.sleepActiveHero}>
                  <View style={styles.sleepActiveHeroLeft}>
                    <View style={styles.sleepActivePulseRing}>
                      <Ionicons
                        name={sleepEndOnTrack ? "musical-notes" : "hourglass-outline"}
                        size={18}
                        color={colors.primary}
                      />
                    </View>
                    <View>
                      <View style={styles.sleepActiveBadgeRow}>
                        <View style={styles.sleepActiveGreenDot} />
                        <Text style={styles.sleepActiveTag}>ACTIVE TIMER</Text>
                      </View>
                      <Text style={styles.sleepActiveCountdown}>
                        {sleepEndOnTrack
                          ? "End of song"
                          : formatSleep(sleepSecondsLeft)}
                      </Text>
                      <Text style={styles.sleepActiveDesc}>
                        {sleepEndOnTrack
                          ? "Stops when current song ends"
                          : "Remaining until playback stops"}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.sleepCancelBtn}
                    onPress={() => {
                      cancelSleepTimer();
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="stop-circle-outline" size={15} color="#FF5C5C" />
                    <Text style={styles.sleepCancelText}>Turn Off</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Section heading */}
              <Text style={styles.sleepSectionHeading}>QUICK PRESETS</Text>

              {/* Preset Options Grid */}
              <View style={styles.sleepGrid}>
                {[
                  { mins: 5, label: "5 min", tag: "Power nap" },
                  { mins: 10, label: "10 min", tag: "Quick rest" },
                  { mins: 15, label: "15 min", tag: "Short rest" },
                  { mins: 30, label: "30 min", tag: "Wind down" },
                  { mins: 45, label: "45 min", tag: "Deep sleep" },
                  { mins: 60, label: "1 hr", tag: "Full hour" },
                ].map((item) => {
                  const isSelected =
                    sleepSecondsLeft !== null &&
                    Math.ceil(sleepSecondsLeft / 60) === item.mins;
                  return (
                    <TouchableOpacity
                      key={item.mins}
                      style={[
                        styles.sleepGridCard,
                        isSelected && styles.sleepGridCardActive,
                      ]}
                      onPress={() => {
                        setSleepTimer(item.mins);
                        setShowSleepModal(false);
                      }}
                      activeOpacity={0.75}
                    >
                      <View style={styles.sleepGridCardTop}>
                        <Text
                          style={[
                            styles.sleepGridTime,
                            isSelected && styles.sleepGridTimeActive,
                          ]}
                        >
                          {item.label}
                        </Text>
                        {isSelected && (
                          <Ionicons
                            name="checkmark-circle"
                            size={15}
                            color={colors.primary}
                          />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.sleepGridTag,
                          isSelected && styles.sleepGridTagActive,
                        ]}
                      >
                        {item.tag}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* End of Track Option */}
              <TouchableOpacity
                style={[
                  styles.sleepEndTrackCard,
                  sleepEndOnTrack && styles.sleepEndTrackCardActive,
                ]}
                onPress={() => {
                  setSleepEndOfTrack();
                  setShowSleepModal(false);
                }}
                activeOpacity={0.75}
              >
                <View style={styles.sleepEndTrackLeft}>
                  <View
                    style={[
                      styles.sleepEndTrackIconWrap,
                      sleepEndOnTrack && styles.sleepEndTrackIconWrapActive,
                    ]}
                  >
                    <Ionicons
                      name="musical-notes"
                      size={18}
                      color={sleepEndOnTrack ? colors.primary : "#AAAAAA"}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.sleepEndTrackTitle,
                        sleepEndOnTrack && styles.sleepEndTrackTitleActive,
                      ]}
                    >
                      End of current track
                    </Text>
                    <Text style={styles.sleepEndTrackSub}>
                      Playback will finish this song, then pause
                    </Text>
                  </View>
                </View>
                {sleepEndOnTrack ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={colors.primary}
                  />
                ) : (
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color="#555555"
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Add to Playlist Modal */}
        <AddToPlaylistModal
          visible={showAddToPlaylist}
          onClose={() => setShowAddToPlaylist(false)}
          track={currentTrack}
        />

        {/* Multi-Artist Selection Bottom Sheet */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={showArtistPickerModal}
          onRequestClose={() => setShowArtistPickerModal(false)}
        >
          <TouchableOpacity
            style={styles.artistPickerOverlay}
            activeOpacity={1}
            onPress={() => setShowArtistPickerModal(false)}
          >
            <Animated.View
              style={[
                styles.artistPickerContent,
                { transform: [{ translateY: artistPanY }] },
              ]}
              {...artistPanResponder.panHandlers}
              onStartShouldSetResponder={() => true}
            >
              {/* Swipe Drag Handle */}
              <View style={styles.artistPickerDragHandle} />

              <View style={styles.artistPickerHeader}>
                <Text style={styles.artistPickerTitle}>Artists on this track</Text>
              </View>

              <View style={styles.artistPickerList}>
                {artistsOnTrack.map((name, idx) => {
                  const photo =
                    artistPhotos[name] ||
                    globalArtistPhotoCache.get(name) ||
                    resolveLocalArtistImage(name) ||
                    null;
                  return (
                    <ArtistPickerRow
                      key={`${name}_${idx}`}
                      name={name}
                      photo={photo}
                      onPress={() => {
                        setShowArtistPickerModal(false);
                        setSelectedArtistForModal(name);
                      }}
                    />
                  );
                })}
              </View>
            </Animated.View>
          </TouchableOpacity>
        </Modal>

        {/* Full Artist Profile & Discography Modal */}
        <ArtistModal
          visible={!!selectedArtistForModal}
          onClose={() => setSelectedArtistForModal(null)}
          artistName={selectedArtistForModal}
          initialPhoto={
            selectedArtistForModal
              ? artistPhotos[selectedArtistForModal] ||
                globalArtistPhotoCache.get(selectedArtistForModal) ||
                resolveLocalArtistImage(selectedArtistForModal) ||
                null
              : null
          }
        />
        {/* Airbuds Live Reaction Bursts Floating Over Player & Artwork */}
        <LiveReactionOverlay />
      </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  desktopModalInner: {
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },

  // ----------------------------------------------------
  // DESKTOP WIDESCREEN IMMERSIVE STYLES
  // ----------------------------------------------------
  desktopContainer: {
    flex: 1,
    backgroundColor: "#070707",
    position: "relative",
    overflow: "hidden",
    justifyContent: "space-between",
  },
  desktopAmbientWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
  },
  desktopAmbientImage: {
    width: "120%",
    height: "120%",
    position: "absolute",
    top: "-10%",
    left: "-10%",
    opacity: 0.2,
  },
  desktopAmbientVignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7, 7, 7, 0.84)",
  },
  desktopTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 32,
    paddingTop: 18,
    paddingBottom: 10,
    width: "100%",
  },
  desktopMinimizeBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  desktopMinimizeText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#FFFFFF",
    marginLeft: 4,
  },
  desktopTopTitleCol: {
    alignItems: "center",
  },
  desktopNowPlayingLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  desktopTopSubtitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: "#FFFFFF",
    marginTop: 2,
    maxWidth: 360,
  },
  desktopTopRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  desktopSleepBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  desktopSleepBtnText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: "#FFFFFF",
    marginLeft: 6,
  },
  desktopSleepBtnTextActive: {
    color: colors.primary,
    fontFamily: fonts.bold,
  },
  desktopMainStageCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingVertical: 12,
    minHeight: 0,
  },
  desktopFlipWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  desktopFlipTouchable: {
    width: 370,
    height: 370,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  desktopArtworkContainer: {
    width: 370,
    height: 370,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#161616",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backfaceVisibility: "hidden",
    elevation: 12,
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 16px 28px rgba(0, 0, 0, 0.65)" }
      : {
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 0.65,
          shadowRadius: 28,
        }),
  },
  desktopArtworkImage: {
    width: "100%",
    height: "100%",
  },
  desktopLyricsCard: {
    width: 370,
    height: 370,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    backfaceVisibility: "hidden",
    elevation: 12,
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 16px 28px rgba(0, 0, 0, 0.65)" }
      : {
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 0.65,
          shadowRadius: 28,
        }),
  },
  desktopCenterMeta: {
    alignItems: "center",
    marginTop: 18,
    maxWidth: 520,
    width: "100%",
    paddingHorizontal: 16,
  },
  desktopCenterSongTitle: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: "#FFFFFF",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  desktopCenterArtistPressable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
  },
  desktopCenterArtistName: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: "rgba(255, 255, 255, 0.72)",
    marginRight: 4,
  },
  desktopCenterActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 14,
  },
  desktopActionIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.09)",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  desktopLyricsCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  desktopLyricsLoadingText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: "#B3B3B3",
    marginTop: 12,
  },
  desktopNoLyricsTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: "#FFFFFF",
    marginTop: 12,
  },
  desktopNoLyricsSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: "#888888",
    marginTop: 4,
    textAlign: "center",
  },
  desktopLyricsScroll: {
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  desktopSyncedLineWrap: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 3,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  desktopSyncedLineWrapActive: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  desktopSyncedLineText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.45)",
    lineHeight: 22,
    letterSpacing: 0,
  },
  desktopSyncedLineCurrent: {
    color: "#FFFFFF",
    fontSize: 17,
    lineHeight: 25,
    fontFamily: fonts.bold,
  },
  desktopSyncedLinePast: {
    color: "rgba(255, 255, 255, 0.28)",
    fontSize: 14,
    lineHeight: 22,
  },
  desktopPlainLyricsLine: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 23,
    color: "rgba(255, 255, 255, 0.75)",
    marginVertical: 2,
  },
  desktopMiddleContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingHorizontal: 32,
    minHeight: 0,
  },
  desktopControlDeck: {
    width: "100%",
    backgroundColor: "rgba(10, 10, 10, 0.94)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 32,
    paddingTop: 10,
    paddingBottom: 16,
  },
  desktopScrubberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    marginBottom: 6,
  },
  desktopTimeText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: "#A7A7A7",
    minWidth: 38,
    textAlign: "center",
  },
  desktopSeekTouchArea: {
    flex: 1,
    height: 24,
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  desktopDeckRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  desktopDeckLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  desktopDeckDeviceText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.primary,
    marginLeft: 6,
  },
  desktopDeckCenter: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  desktopMainPlayBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.35)" }
      : {
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
        }),
  },
  desktopControlIconBtn: {
    padding: 6,
  },
  desktopDeckRight: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
  },
  desktopMinimizeDeckBtn: {
    padding: 4,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "web" ? 12 : Platform.OS === "ios" ? 44 : 16,
    paddingBottom: 8,
  },
  topBarButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitleContainer: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 10,
  },
  nowPlayingLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    color: "#A7A7A7",
    letterSpacing: 1.2,
  },
  topSubtitle: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: "#FFFFFF",
    marginTop: 2,
  },
  playerBody: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: Platform.OS === "web" ? 10 : 16,
  },
  artworkWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 4,
  },
  flipTouchable: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
  },
  artworkContainer: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    backfaceVisibility: "hidden",
  },
  lyricsCard: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 36,
    backfaceVisibility: "hidden",
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

  // Lyrics overlay on artwork bottom
  lyricsOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 40,
  },
  lyricsOverlayBg: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  lyricsOverlayText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    lineHeight: 20,
    textAlign: "center",
  },
  lyricsOverlayTextActive: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#FFFFFF",
    lineHeight: 22,
  },
  lyricsOverlayHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  lyricsOverlayHintText: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: "rgba(255,255,255,0.4)",
  },

  // Flip back hint at bottom of lyrics card
  flipBackHint: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  flipBackHintText: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: "rgba(255,255,255,0.35)",
  },

  metaRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  metaTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  songTitle: {
    fontFamily: fonts.bold,
    fontSize: 21,
    color: "#FFFFFF",
    letterSpacing: -0.4,
  },
  artistName: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: "#FFFFFF",
    marginTop: 3,
  },
  reasonTagRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  reasonTag: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.primary,
  },
  metaActionsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  likeButtonWrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  metaActionButton: {
    padding: 6,
  },
  progressSection: {
    width: "100%",
    marginVertical: 6,
  },
  seekTouchArea: {
    height: 32,
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: "#333333",
    borderRadius: 2,
    position: "relative",
  },
  progressBarTrackActive: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#444444",
  },
  progressBarFilled: {
    height: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 2,
  },
  progressBarFilledActive: {
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  progressKnob: {
    position: "absolute",
    top: -3,
    marginLeft: -5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
  },
  progressKnobActive: {
    width: 16,
    height: 16,
    borderRadius: 8,
    top: -5,
    marginLeft: -8,
    backgroundColor: colors.primary,
    elevation: 8,
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 2px 6px rgba(29, 185, 84, 0.9)" }
      : {
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.9,
          shadowRadius: 6,
        }),
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  timeText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: "#A7A7A7",
  },
  timeTextActive: {
    color: colors.primary,
    fontFamily: fonts.semiBold,
  },
  controlsRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 8,
    paddingHorizontal: 4,
  },
  controlIcon: {
    padding: 8,
  },
  mainPlayButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 6px 10px rgba(0, 0, 0, 0.35)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.35,
          shadowRadius: 10,
        }),
  },
  bottomUtilitiesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    paddingBottom: 4,
  },
  deviceIndicator: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  deviceLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.primary,
    marginLeft: 6,
  },
  utilityButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },

  sleepActiveDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },

  // Dedicated Sleep Timer Modal Styles (Sleek & Clean Bottom Sheet)
  sleepModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sleepModalContent: {
    backgroundColor: "#0D0D0D",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === "web" ? 28 : 40,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
  },
  sleepDragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    alignSelf: "center",
    marginBottom: 16,
  },
  sleepModalHeader: {
    marginBottom: 18,
    paddingHorizontal: 2,
  },
  sleepModalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sleepMoonBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(167, 139, 250, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  sleepModalTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: "#FFFFFF",
  },
  sleepModalSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 2,
  },
  sleepModalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  sleepActiveHero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(29, 185, 84, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.3)",
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
  },
  sleepActiveHeroLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  sleepActivePulseRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(29, 185, 84, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  sleepActiveBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 2,
  },
  sleepActiveGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  sleepActiveTag: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.primary,
    letterSpacing: 0.8,
  },
  sleepActiveCountdown: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  sleepActiveDesc: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: "#AAAAAA",
    marginTop: 1,
  },
  sleepCancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255, 77, 77, 0.12)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 77, 77, 0.28)",
  },
  sleepCancelText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: "#FF5C5C",
  },
  sleepSectionHeading: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: "#666666",
    letterSpacing: 1,
    marginBottom: 10,
    marginLeft: 2,
  },
  sleepGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  sleepGridCard: {
    flexBasis: "31%",
    flexGrow: 1,
    backgroundColor: "#161616",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  sleepGridCardActive: {
    backgroundColor: "rgba(29, 185, 84, 0.12)",
    borderColor: colors.primary,
  },
  sleepGridCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginBottom: 3,
  },
  sleepGridTime: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#FFFFFF",
  },
  sleepGridTimeActive: {
    color: colors.primary,
  },
  sleepGridTag: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: "#777777",
  },
  sleepGridTagActive: {
    color: "#A0E8B8",
  },
  sleepEndTrackCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#161616",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  sleepEndTrackCardActive: {
    backgroundColor: "rgba(29, 185, 84, 0.12)",
    borderColor: colors.primary,
  },
  sleepEndTrackLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },
  sleepEndTrackIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  sleepEndTrackIconWrapActive: {
    backgroundColor: "rgba(29, 185, 84, 0.18)",
  },
  sleepEndTrackTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  sleepEndTrackTitleActive: {
    color: colors.primary,
    fontFamily: fonts.bold,
  },
  sleepEndTrackSub: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: "#777777",
    marginTop: 2,
  },

  // Lyrics Card Styles (larger font sizes)
  lyricsCenterWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    gap: 8,
  },
  lyricsLoadingText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textSecondary,
  },
  noLyricsTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.text,
    marginTop: 8,
  },
  noLyricsSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    maxWidth: 240,
  },
  lyricsScrollContent: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  syncedLineWrap: {
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  syncedLineWrapActive: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  syncedLineText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.4)",
    lineHeight: 22,
  },
  syncedLineCurrent: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: fonts.bold,
    lineHeight: 24,
  },
  syncedLinePast: {
    color: "rgba(255, 255, 255, 0.3)",
  },
  plainLyricsLine: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.8)",
    lineHeight: 22,
    marginVertical: 3,
  },

  // Queue styles
  queueContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  desktopQueueContainer: {
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 24,
  },
  queueScrollView: {
    flex: 1,
  },
  queueHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  queueHeaderTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: "#FFFFFF",
  },
  queueHeaderSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: "#888888",
    marginTop: 2,
  },
  clearQueueBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  clearQueueText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: "#E0E0E0",
  },
  queueSectionWrap: {
    marginBottom: 18,
  },
  queueSectionToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  queueSectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: "#888888",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  queueItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 6,
    backgroundColor: "transparent",
    marginBottom: 3,
  },
  queueItemActive: {
    backgroundColor: "transparent",
  },
  queueThumb: {
    width: 46,
    height: 46,
    borderRadius: 6,
    backgroundColor: colors.surfaceCard,
  },
  queueItemText: {
    flex: 1,
    marginLeft: 12,
    marginRight: 10,
  },
  queueTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  activeQueueText: {
    color: colors.primary,
    fontFamily: fonts.bold,
  },
  queueArtist: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "#B3B3B3",
    marginTop: 2,
  },
  queueRemoveBtn: {
    padding: 6,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  queueEmptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  queueEmptyText: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: "#FFFFFF",
    marginTop: 10,
    marginBottom: 6,
  },
  queueEmptySubtext: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "#888888",
    textAlign: "center",
    lineHeight: 18,
  },
  artistPickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "flex-end",
  },
  artistPickerContent: {
    backgroundColor: "#1E1E1E",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 40 : 28,
    maxHeight: height * 0.65,
  },
  artistPickerDragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    alignSelf: "center",
    marginBottom: 14,
  },
  artistPickerHeader: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  artistPickerTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: "#FFFFFF",
  },
  artistPickerList: {
    gap: 8,
  },
  artistPickerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  artistPickerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#2A2A2A",
  },
  artistPickerFallback: {
    backgroundColor: "#2A2A2A",
    alignItems: "center",
    justifyContent: "center",
  },
  artistPickerFallbackInitial: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: "#FFFFFF",
  },
  artistPickerTextWrap: {
    flex: 1,
    marginLeft: 14,
    marginRight: 10,
  },
  artistPickerName: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: "#FFFFFF",
  },
  artistPickerRole: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
