import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, Component } from "react";
import { Platform } from "react-native";
import { Audio } from "expo-av";
import { api } from "../api/client";
import {
  auth,
  saveLastPlayback,
  getLastPlayback,
  onAuthChange,
  getOrCreateDeviceId,
  updatePlaybackSession,
  subscribePlaybackSession,
  addRecentlyPlayed,
  loadHiddenTracks,
  isTrackHidden,
  restoreHiddenTrack,
  recordAppSongPlay,
  recordUserStream,
  saveCachedTrackImage,
  getCachedTrackImage,
  getCollabPlaylistDetails,
  addTrackToCollabPlaylist,
  subscribeFollowedArtists,
  getAppTrendingTracksRTDB,
  getTrendingFeedRTDB,
  registerActiveDevice,
  updateActiveDeviceHeartbeat,
} from "../services/firebase";
import { getAccurateDeviceInfo } from "./ResponsiveContext";
import { getOfflineAudioUrl, isTrackDownloaded } from "../services/offlineStorage";

let LockScreenControls = null;
try {
  if (Platform.OS !== "web") {
    LockScreenControls = require("../../modules/lock-screen-controls/src/index").default;
  }
} catch (_) {}

const AudioContext = createContext(null);
export const AudioPlaybackContext = createContext(null);

// Auto-add played songs to blend playlists if not already present
async function autoAddToBlendPlaylists(uid, track) {
  if (!uid || !track?.videoId) return;
  try {
    const { ref: dbRef, get, child } = await import("firebase/database");
    const { db } = await import("../services/firebase");
    const userCollabsSnap = await get(child(dbRef(db), `users/${uid}/collab_playlists`));
    if (!userCollabsSnap.exists()) return;
    const collabIds = Object.keys(userCollabsSnap.val());
    for (const collabId of collabIds) {
      const plSnap = await get(child(dbRef(db), `collab_playlists/${collabId}`));
      if (!plSnap.exists()) continue;
      const pl = plSnap.val();
      if (!pl.isBlend) continue;
      const existingTracks = pl.tracks || [];
      const alreadyAdded = existingTracks.some((t) => (t.videoId || t.id) === track.videoId);
      if (!alreadyAdded) {
        await addTrackToCollabPlaylist(collabId, {
          ...track,
          videoId: track.videoId,
          addedAt: Date.now(),
          blendSource: "auto",
        });
      }
    }
  } catch (_) {}
}

export function fisherYatesShuffle(arr) {
  if (!Array.isArray(arr)) return [];
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function cleanTrackTitle(title) {
  if (!title) return "Track";
  return String(title)
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s*\([^)]*(?:official|video|audio|lyrics|hd|4k)[^)]*\)/gi, "")
    .replace(/\s*\[[^\]]*(?:official|video|audio|lyrics|hd|4k)[^\]]*\]/gi, "")
    .trim();
}

// ─── Stream URL Cache ───────────────────────────────────────────────────────
// In-memory cache: maps clean trackId -> { stream_url, duration, timestamp }.
// Resolving the next URL early reduces the normal gap between queued tracks.
const globalStreamCache = new Map();

const AudioProvider = ({ children }) => {
  const myDeviceId = getOrCreateDeviceId();
  const myDeviceInfo = useMemo(() => getAccurateDeviceInfo(), []);
  const myDeviceName = myDeviceInfo.name;
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(1);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isRepeat, setIsRepeat] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isFullPlayerVisible, setIsFullPlayerVisible] = useState(false);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [errorNotice, setErrorNotice] = useState(null);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [queueNotice, setQueueNotice] = useState(null);
  const queueNoticeTimerRef = useRef(null);

  const openDeviceModal = useCallback(() => setIsDeviceModalOpen(true), []);
  const closeDeviceModal = useCallback(() => setIsDeviceModalOpen(false), []);

  // Sleep Timer state
  const [sleepSecondsLeft, setSleepSecondsLeft] = useState(null);
  const [sleepEndOnTrack, setSleepEndOnTrack] = useState(false);
  const sleepEndOnTrackRef = useRef(false);
  const sleepTimerEndAtRef = useRef(null);

  // Native player reference (expo-av)
  const soundRef = useRef(null);
  // Web player reference (HTML5 Audio)
  const webAudioRef = useRef(null);
  const audioRetryCountRef = useRef(0);

  const isPlayingRef = useRef(false);
  const queueRef = useRef(queue);
  const queueIndexRef = useRef(queueIndex);
  const isRepeatRef = useRef(isRepeat);
  const isShuffleRef = useRef(isShuffle);
  const originalQueueRef = useRef(queue);
  const currentTrackRef = useRef(currentTrack);
  const positionMillisRef = useRef(positionMillis);
  const durationMillisRef = useRef(durationMillis);
  const authoritativeDurationRef = useRef(0);
  const advancingRef = useRef(false);
  const volumeRef = useRef(0.85);
  const lastUpdatePosRef = useRef(0);
  const prevCurSecRef = useRef(0);
  const lastMediaSessionPosUpdateRef = useRef(0);
  // Every requested track load gets an id. Stream resolution is asynchronous,
  // so an older request must never replace a newer selection.
  const playbackRequestRef = useRef(0);

  const playTrackRef = useRef(null);
  const togglePlayPauseRef = useRef(null);
  const playNextRef = useRef(null);
  const playPreviousRef = useRef(null);
  const enrichmentTokenRef = useRef(0);
  const followedArtistsRef = useRef([]);

  // Keep followed artists live and maintain active device presence
  useEffect(() => {
    let unsubscribeFollowed = null;
    let heartbeatTimer = null;

    const unsubAuth = onAuthChange((user) => {
      if (unsubscribeFollowed) {
        unsubscribeFollowed();
        unsubscribeFollowed = null;
      }
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }

      if (user?.uid) {
        // 1. Register this device presence in RTDB
        registerActiveDevice(user.uid, {
          id: myDeviceId,
          name: myDeviceInfo.name,
          platform: myDeviceInfo.platform,
          browser: myDeviceInfo.browser,
          deviceType: myDeviceInfo.deviceType,
          icon: myDeviceInfo.icon,
        }).catch(() => {});

        // 2. Periodic presence heartbeat (every 45s)
        heartbeatTimer = setInterval(() => {
          updateActiveDeviceHeartbeat(user.uid, myDeviceId).catch(() => {});
        }, 45000);

        // 3. Followed artists subscription
        unsubscribeFollowed = subscribeFollowedArtists(user.uid, (artistsList) => {
          const cleanList = (Array.isArray(artistsList) ? artistsList : [])
            .map((a) => (typeof a === "string" ? a : a?.name || "").trim())
            .filter((a) => a.length > 0);
          followedArtistsRef.current = cleanList;
        });
      } else {
        followedArtistsRef.current = [];
      }
    });

    return () => {
      if (unsubscribeFollowed) unsubscribeFollowed();
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (unsubAuth) unsubAuth();
    };
  }, [myDeviceId, myDeviceInfo]);

  queueRef.current = queue;
  queueIndexRef.current = queueIndex;
  isRepeatRef.current = isRepeat;
  isShuffleRef.current = isShuffle;
  sleepEndOnTrackRef.current = sleepEndOnTrack;
  currentTrackRef.current = currentTrack;
  positionMillisRef.current = positionMillis;
  durationMillisRef.current = durationMillis;

  // Use an absolute deadline rather than subtracting one second per render.
  // iOS may throttle JavaScript timers while the screen is locked; comparing
  // against the clock keeps the timer accurate as soon as playback reports.
  const stopForSleepTimer = () => {
    if (Platform.OS === "web" && webAudioRef.current) {
      webAudioRef.current.pause();
    }
    if (soundRef.current) {
      soundRef.current.pauseAsync().catch(() => {});
    }
    setIsPlaying(false);
    isPlayingRef.current = false;
    updateMediaSessionPlaybackState(false);
    sleepTimerEndAtRef.current = null;
    setSleepSecondsLeft(null);
    setSleepEndOnTrack(false);
  };

  const refreshSleepTimer = () => {
    const endAt = sleepTimerEndAtRef.current;
    if (!endAt) return false;
    const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    if (remaining <= 0) {
      stopForSleepTimer();
      return true;
    }
    setSleepSecondsLeft((previous) => (previous === remaining ? previous : remaining));
    return false;
  };

  // MediaSession API helper: renders high-res 512x512 album banner on OS lock screens & notification panels
  const setupMediaSessionHandlers = useCallback(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

    const handlers = {
      play: async () => {
        try {
          if (Platform.OS === "web") {
            const audio = webAudioRef.current;
            if (audio && audio.src && !audio.error) {
              audio.muted = false;
              audio.volume = volumeRef.current;
              const playPromise = audio.play();
              if (playPromise !== undefined) {
                await playPromise;
              }
              audio.muted = false;
              audio.volume = volumeRef.current;
              setIsPlaying(true);
              isPlayingRef.current = true;
              updateMediaSessionPlaybackState(true);
              return;
            }
            if (playTrackRef.current && currentTrackRef.current) {
              await playTrackRef.current(currentTrackRef.current);
            }
          } else if (soundRef.current) {
            await soundRef.current.playAsync();
            setIsPlaying(true);
            isPlayingRef.current = true;
            updateMediaSessionPlaybackState(true);
          } else if (currentTrackRef.current && playTrackRef.current) {
            await playTrackRef.current(currentTrackRef.current);
          }
        } catch (err) {
          console.warn("[MediaSession] play failed, attempting fresh track load:", err?.message);
          if (playTrackRef.current && currentTrackRef.current) {
            playTrackRef.current(currentTrackRef.current).catch(() => {});
          }
        }
      },
      pause: async () => {
        try {
          if (Platform.OS === "web") {
            if (webAudioRef.current) {
              webAudioRef.current.pause();
            }
            setIsPlaying(false);
            isPlayingRef.current = false;
            updateMediaSessionPlaybackState(false);
            try {
              const uid = auth.currentUser?.uid || "guest";
              updatePlaybackSession(uid, { deviceId: myDeviceId, deviceName: myDeviceName, isPlaying: false });
            } catch (_) {}
          } else if (soundRef.current) {
            await soundRef.current.pauseAsync().catch(() => {});
            setIsPlaying(false);
            isPlayingRef.current = false;
            updateMediaSessionPlaybackState(false);
          }
        } catch (err) {
          console.warn("[MediaSession] pause failed:", err?.message);
          setIsPlaying(false);
          isPlayingRef.current = false;
          updateMediaSessionPlaybackState(false);
        }
      },
      stop: () => {
        try {
          if (Platform.OS === "web" && webAudioRef.current) {
            webAudioRef.current.pause();
            webAudioRef.current.currentTime = 0;
          } else if (soundRef.current) {
            soundRef.current.stopAsync().catch(() => {});
          }
          setIsPlaying(false);
          isPlayingRef.current = false;
          updateMediaSessionPlaybackState(false);
        } catch (_) {}
      },
      previoustrack: () => {
        if (playPreviousRef.current) playPreviousRef.current();
      },
      nexttrack: () => {
        if (playNextRef.current) playNextRef.current();
      },
      seekto: (details) => {
        if (details.seekTime !== undefined && Number.isFinite(details.seekTime)) {
          seekTo(Math.floor(details.seekTime * 1000));
        }
      },
    };

    // Explicitly unregister seekforward & seekbackward so OS lock screen
    // shows Next Track and Previous Track buttons instead of 10s jump icons
    try {
      navigator.mediaSession.setActionHandler("seekforward", null);
    } catch (_) {}
    try {
      navigator.mediaSession.setActionHandler("seekbackward", null);
    } catch (_) {}

    for (const [action, handler] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (err) {
        // action not supported in current browser
      }
    }
  }, []);

  const updateMediaSessionMetadata = (track) => {
    if (typeof window === "undefined" || !("mediaSession" in navigator) || !window.MediaMetadata) return;
    if (!track) return;
    try {
      const rawArt = track.artwork_url || track.thumbnail || "";
      const art = rawArt ? rawArt.replace(/^http:\/\//i, "https://") : "";
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: track.title || "Staytup Music",
        artist: track.artist || "Unknown Artist",
        album: track.album || "Staytup Music",
        artwork: art
          ? [
              { src: art, sizes: "512x512", type: "image/jpeg" },
              { src: art, sizes: "256x256", type: "image/jpeg" },
              { src: art, sizes: "128x128", type: "image/jpeg" },
              { src: art, sizes: "96x96", type: "image/jpeg" },
            ]
          : [],
      });
      navigator.mediaSession.playbackState = isPlayingRef.current ? "playing" : "paused";
    } catch (e) {
      console.warn("Error updating MediaSession metadata:", e);
    }
    // Re-register action handlers after metadata so Chrome PWA shows prev/next buttons
    setupMediaSessionHandlers();
  };

  const updateMediaSessionPlaybackState = (playing) => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    } catch (_) {}
  };

  const updateMediaSessionPosition = (posMs, durMs, force = false) => {
    if (
      typeof window === "undefined" ||
      !("mediaSession" in navigator) ||
      !navigator.mediaSession.setPositionState
    )
      return;
    try {
      const posSec = Math.max(0, (posMs || 0) / 1000);
      const durSec = Math.max(0, (durMs || 0) / 1000);
      if (durSec > 0 && posSec <= durSec) {
        const now = Date.now();
        if (!force && now - lastMediaSessionPosUpdateRef.current < 4000) {
          return;
        }
        lastMediaSessionPosUpdateRef.current = now;

        navigator.mediaSession.playbackState = isPlayingRef.current ? "playing" : "paused";
        navigator.mediaSession.setPositionState({
          duration: durSec,
          playbackRate: isPlayingRef.current ? 1.0 : 0.0,
          position: posSec,
        });
      }
    } catch (_) {}
  };

  // ─── Web HTML5 Audio Engine Setup ──────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const audio = new window.Audio();
    audio.preload = "auto";
    try {
      audio.playsInline = true;
      audio.setAttribute("playsinline", "true");
      audio.setAttribute("webkit-playsinline", "true");
    } catch (_) {}
    audio.volume = volumeRef.current;
    audio.muted = false;
    audio.loop = Boolean(isRepeatRef.current);

    // Attach audio element to DOM so iOS Safari power management never suspends it in background
    if (typeof document !== "undefined" && document.body) {
      audio.id = "staytup-audio-player";
      audio.style.display = "none";
      if (!document.getElementById("staytup-audio-player")) {
        document.body.appendChild(audio);
      }
    }
    webAudioRef.current = audio;

    // Web Autoplay Policy Unlocker: Prime audio element on very first user gesture
    const unlockAudio = () => {
      if (webAudioRef.current && webAudioRef.current.paused && (!webAudioRef.current.src || webAudioRef.current.src === window.location.href)) {
        try {
          webAudioRef.current.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
          webAudioRef.current.play().then(() => {
            if (webAudioRef.current && webAudioRef.current.src.startsWith("data:")) {
              webAudioRef.current.pause();
              webAudioRef.current.src = "";
            }
          }).catch(() => {});
        } catch (_) {}
      }
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
    window.addEventListener("pointerdown", unlockAudio, { passive: true, once: true });
    window.addEventListener("touchstart", unlockAudio, { passive: true, once: true });
    window.addEventListener("click", unlockAudio, { passive: true, once: true });
    window.addEventListener("keydown", unlockAudio, { passive: true, once: true });

    const onPlay = () => {
      // Force-ensure audio is audible every time playback starts
      if (audio) {
        audio.muted = false;
        audio.volume = volumeRef.current;
      }
      setIsPlaying(true);
      isPlayingRef.current = true;
      setIsLoading(false);
      updateMediaSessionPlaybackState(true);
      setupMediaSessionHandlers();
      if (currentTrackRef.current) {
        updateMediaSessionMetadata(currentTrackRef.current);
      }
      const dur = authoritativeDurationRef.current || durationMillisRef.current || 0;
      if (dur > 0) {
        updateMediaSessionPosition(positionMillisRef.current, dur, true);
      }
    };

    const onPause = () => {
      // 1. During track transitions, changing audio.src fires a synthetic 'pause' event.
      if (advancingRef.current) return;
      // 2. If the audio element is NOT actually paused (it's actively outputting sound),
      // this event was a delayed synthetic pause from the previous track — DO NOT mark paused!
      if (audio && !audio.paused) return;

      setIsPlaying(false);
      isPlayingRef.current = false;
      updateMediaSessionPlaybackState(false);
    };

    const onWaiting = () => {
      setIsLoading(true);
    };

    const onPlaying = () => {
      setIsLoading(false);
      setIsPlaying(true);
      isPlayingRef.current = true;
      updateMediaSessionPlaybackState(true);
      if (currentTrackRef.current) {
        updateMediaSessionMetadata(currentTrackRef.current);
      }
      const dur = authoritativeDurationRef.current || durationMillisRef.current || 0;
      if (dur > 0) {
        updateMediaSessionPosition(positionMillisRef.current, dur, true);
      }
    };

    const onTimeUpdate = () => {
      if (!audio) return;
      if (refreshSleepTimer()) return;
      const curSec = audio.currentTime || 0;
      const durSec = audio.duration || 0;
      const curMs = Math.round(curSec * 1000);
      positionMillisRef.current = curMs;

      // Keep lock screen and notification bar in 'playing' state whenever audio is actively playing
      if (!audio.paused && (!isPlayingRef.current || navigator?.mediaSession?.playbackState !== "playing")) {
        setIsPlaying(true);
        isPlayingRef.current = true;
        updateMediaSessionPlaybackState(true);
      }

      // Throttle React state update to at most once every 500ms to eliminate CPU spikes and phone heating
      if (Math.abs(curMs - lastUpdatePosRef.current) >= 500) {
        lastUpdatePosRef.current = curMs;
        setPositionMillis(curMs);
      }

      if (durSec && Number.isFinite(durSec) && durSec > 0) {
        const durMs = Math.round(durSec * 1000);
        if (Math.abs(durMs - (durationMillisRef.current || 0)) > 1000) {
          setDurationMillis(durMs);
          durationMillisRef.current = durMs;
        }
        updateMediaSessionPosition(curMs, durMs, false);

        // Pre-fetch upcoming streams 25s before track ends so URL is ready in cache well ahead of time
        const remainingSec = durSec - curSec;
        if (remainingSec <= 25 && remainingSec > 5) {
          prefetchUpcomingStreams(queueRef.current, queueIndexRef.current);
        }

      }

      // Detect wrap-around fallback (if audio.loop wrapped before timeupdate caught it)
      const prevSec = prevCurSecRef.current || 0;
      prevCurSecRef.current = curSec;
      if (prevSec > 5 && curSec < 1 && !advancingRef.current) {
        if (isRepeatRef.current) return;
        if (playNextRef.current) {
          playNextRef.current();
        }
      }
    };

    const onDurationChange = () => {
      if (!audio) return;
      const durSec = audio.duration || 0;
      if (durSec && Number.isFinite(durSec) && durSec > 0) {
        const durMs = Math.round(durSec * 1000);
        setDurationMillis(durMs);
        durationMillisRef.current = durMs;
      }
    };

    const onEnded = () => {
      if (advancingRef.current) return;
      if (sleepEndOnTrackRef.current) {
        setSleepEndOnTrack(false);
        setIsPlaying(false);
        isPlayingRef.current = false;
        updateMediaSessionPlaybackState(false);
        return;
      }
      if (isRepeatRef.current) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        if (playNextRef.current) playNextRef.current();
      }
    };

    const onError = async (e) => {
      // 1. Never handle errors during track transition / auto-advance
      if (advancingRef.current) {
        return;
      }

      // 2. Ignore MEDIA_ERR_ABORTED (code 1) — this occurs whenever a stream is superseded
      const mediaErr = audio ? audio.error : null;
      if (mediaErr && mediaErr.code === 1) {
        return;
      }

      // 3. Ignore empty or uninitialized source
      if (!audio || !audio.src || audio.src === "" || audio.src === window.location.href) {
        return;
      }

      console.warn("[AudioContext] Web audio error:", e, mediaErr?.code, mediaErr?.message);
      setIsLoading(false);

      // If stream URL expired or failed, re-fetch fresh URL once and retry
      if (currentTrackRef.current && audioRetryCountRef.current < 1) {
        audioRetryCountRef.current += 1;
        const trackId = currentTrackRef.current.videoId || currentTrackRef.current.video_id || currentTrackRef.current.id;
        try {
          console.log(`[AudioContext] Re-resolving fresh stream URL for ${trackId}...`);
          const fresh = await api.getStream(trackId, 1, currentTrackRef.current?.title, currentTrackRef.current?.artist);
          if (fresh && fresh.stream_url && webAudioRef.current) {
            webAudioRef.current.src = fresh.stream_url;
            await webAudioRef.current.play();
            return;
          }
        } catch (retryErr) {
          console.error("[AudioContext] Stream retry failed:", retryErr.message);
        }
      }

      // Only mark playback state as paused if genuine failure and retry failed
      updateMediaSessionPlaybackState(false);
      setErrorNotice("Playback error. Skipping to next song...");
      setTimeout(() => {
        if (playNextRef.current) playNextRef.current();
      }, 1500);
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    // Restore the UI state when the app becomes visible. Playback itself is never
    // forced: browsers require a user gesture after a real system interruption.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && webAudioRef.current) {
        const a = webAudioRef.current;
        setIsPlaying(!a.paused);
        isPlayingRef.current = !a.paused;
        updateMediaSessionPlaybackState(!a.paused);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      audio.pause();
      audio.src = "";
    };
  }, []);

  // ─── MediaSession Action Handlers ──────────────────────────────────────────
  useEffect(() => {
    setupMediaSessionHandlers();
  }, [setupMediaSessionHandlers]);

  // ─── Native Lock Screen Next/Previous/Play/Pause (iOS & Android) ────────────
  useEffect(() => {
    if (Platform.OS === "web" || !LockScreenControls) return;

    let subNext = null;
    let subPrev = null;
    let subPlay = null;
    let subPause = null;
    let subToggle = null;

    try {
      subNext = LockScreenControls.addListener("onNextTrack", () => {
        if (playNextRef.current) playNextRef.current();
      });
      subPrev = LockScreenControls.addListener("onPreviousTrack", () => {
        if (playPreviousRef.current) playPreviousRef.current();
      });
      subPlay = LockScreenControls.addListener("onPlay", () => {
        if (!isPlayingRef.current && togglePlayPauseRef.current) {
          togglePlayPauseRef.current();
        }
      });
      subPause = LockScreenControls.addListener("onPause", () => {
        if (isPlayingRef.current && togglePlayPauseRef.current) {
          togglePlayPauseRef.current();
        }
      });
      subToggle = LockScreenControls.addListener("onTogglePlayPause", () => {
        if (togglePlayPauseRef.current) {
          togglePlayPauseRef.current();
        }
      });
    } catch (err) {
      console.warn("Lock screen controls setup error:", err);
    }

    return () => {
      subNext?.remove?.();
      subPrev?.remove?.();
      subPlay?.remove?.();
      subPause?.remove?.();
      subToggle?.remove?.();
    };
  }, []);

  // ─── Native Audio Mode (expo-av for iOS & Android) ─────────────────────────
  useEffect(() => {
    async function configureAudio() {
      if (Platform.OS !== "web") {
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            staysActiveInBackground: true,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
          });
        } catch (err) {
          console.warn("Could not set audio mode:", err);
        }
      }
    }
    configureAudio();

    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  // ─── Firebase Session & Last Playback Restore ──────────────────────────────
  useEffect(() => {
    let unsubscribePlayback = null;

    const unsubscribeAuth = onAuthChange(async (firebaseUser) => {
      if (unsubscribePlayback) {
        unsubscribePlayback();
        unsubscribePlayback = null;
      }

      const uid = firebaseUser?.uid || "guest";
      loadHiddenTracks(uid).catch(() => {});

      // 1. Restore last played track so miniplayer appears immediately
      try {
        const playbackData = await getLastPlayback(uid);
        if (playbackData && playbackData.track) {
          const track = playbackData.track;
          if (track && (track.videoId || track.video_id || track.id) && !currentTrackRef.current) {
            // NEVER use cached stream_url — always resolve fresh on user tap
            track.stream_url = null;
            setCurrentTrack(track);
            currentTrackRef.current = track;

            let initDurationMs = 0;
            if (track.duration_seconds && Number.isFinite(Number(track.duration_seconds)) && Number(track.duration_seconds) > 0) {
              const s = Number(track.duration_seconds);
              initDurationMs = s > 10000 ? s : s * 1000;
            } else if (typeof track.duration === "number" && track.duration > 0) {
              initDurationMs = track.duration * 1000;
            }
            if (initDurationMs > 0 && initDurationMs < 86400000) {
              authoritativeDurationRef.current = initDurationMs;
              durationMillisRef.current = initDurationMs;
              setDurationMillis(initDurationMs);
            }
            updateMediaSessionMetadata(track);
            if (Array.isArray(playbackData.queue) && playbackData.queue.length > 0) {
              setQueue(playbackData.queue);
              const idx = playbackData.queue.findIndex(
                (t) => (t.videoId || t.video_id || t.id) === (track.videoId || track.video_id || track.id)
              );
              setQueueIndex(idx >= 0 ? idx : 0);
            }
          }
        }
      } catch (err) {
        console.warn("Error restoring last played track from Firebase:", err);
      }

      // 2. Single-device playback listener
      if (firebaseUser) {
        unsubscribePlayback = subscribePlaybackSession(firebaseUser.uid, (session) => {
          if (
            session &&
            session.isPlaying &&
            session.deviceId &&
            session.deviceId !== myDeviceId &&
            isPlayingRef.current
          ) {
            if (Platform.OS === "web" && webAudioRef.current) {
              webAudioRef.current.pause();
            }
            if (soundRef.current) {
              soundRef.current.pauseAsync().catch(() => {});
            }
            setIsPlaying(false);
            isPlayingRef.current = false;
            updateMediaSessionPlaybackState(false);
            const activeDev = session.deviceName || "another device";
            setErrorNotice(`Playback paused — active on ${activeDev}`);
            setTimeout(() => setErrorNotice(null), 4500);
          }
        });
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribePlayback) unsubscribePlayback();
    };
  }, []);

  // Update playback status handler for native expo-av
  const onPlaybackStatusUpdate = (status) => {
    if (refreshSleepTimer()) return;
    if (!status.isLoaded) {
      if (status.error) {
        console.error(`Native audio playback error: ${status.error}`);
        setErrorNotice("Streaming error occurred. Skipping...");
        if (playNextRef.current) playNextRef.current();
      }
      return;
    }

    const wasPlaying = isPlayingRef.current;
    setIsPlaying(status.isPlaying);
    isPlayingRef.current = status.isPlaying;

    if (wasPlaying !== status.isPlaying) {
      updateMediaSessionPlaybackState(status.isPlaying);

      // Keep native lock screen & Dynamic Island in sync when state changes
      if (LockScreenControls?.updateNowPlaying && currentTrackRef.current) {
        try {
          LockScreenControls.updateNowPlaying({
            title: currentTrackRef.current.title || "Staytup Music",
            artist: currentTrackRef.current.artist || "Unknown Artist",
            duration: ((authoritativeDurationRef.current || durationMillisRef.current || 0) / 1000) || 0,
            position: (status.positionMillis || 0) / 1000,
            isPlaying: status.isPlaying,
            artworkUrl: currentTrackRef.current.artwork_url || currentTrackRef.current.thumbnail || "",
          });
        } catch (_) {}
      }
    }

    const pos = Number.isFinite(status.positionMillis) ? Math.max(0, status.positionMillis) : 0;
    positionMillisRef.current = pos;

    // Throttle React state update to at most once every 500ms to stop phone heating
    if (Math.abs(pos - lastUpdatePosRef.current) >= 500) {
      lastUpdatePosRef.current = pos;
      setPositionMillis(pos);
    }

    if (
      (!authoritativeDurationRef.current || authoritativeDurationRef.current <= 0) &&
      status.durationMillis &&
      Number.isFinite(status.durationMillis) &&
      status.durationMillis > 0
    ) {
      authoritativeDurationRef.current = status.durationMillis;
      durationMillisRef.current = status.durationMillis;
      setDurationMillis(status.durationMillis);
    }

    const effectiveDur = authoritativeDurationRef.current || durationMillisRef.current || 0;
    updateMediaSessionPosition(pos, effectiveDur, false);

    if (status.didJustFinish && !status.isLooping) {
      if (advancingRef.current) return;
      if (sleepEndOnTrackRef.current) {
        setSleepEndOnTrack(false);
        setIsPlaying(false);
        isPlayingRef.current = false;
        soundRef.current?.pauseAsync();
        updateMediaSessionPlaybackState(false);
        return;
      }
      if (isRepeatRef.current) {
        seekTo(0);
        soundRef.current?.playAsync();
      } else {
        if (playNextRef.current) playNextRef.current();
      }
    }
  };

  // Sleep timer countdown
  useEffect(() => {
    if (sleepSecondsLeft === null) return;
    if (refreshSleepTimer()) return;
    const timer = setTimeout(() => {
      refreshSleepTimer();
    }, 1000);
    return () => clearTimeout(timer);
  }, [sleepSecondsLeft]);

  const setSleepTimerMinutes = (minutes) => {
    setSleepEndOnTrack(false);
    if (minutes === null) {
      sleepTimerEndAtRef.current = null;
      setSleepSecondsLeft(null);
      return;
    }
    const seconds = Math.max(1, Math.round(Number(minutes) * 60));
    sleepTimerEndAtRef.current = Date.now() + seconds * 1000;
    setSleepSecondsLeft(seconds);
  };

  const setSleepEndOfTrackMode = () => {
    sleepTimerEndAtRef.current = null;
    setSleepSecondsLeft(null);
    setSleepEndOnTrack(true);
  };

  const cancelSleepTimer = () => {
    sleepTimerEndAtRef.current = null;
    setSleepSecondsLeft(null);
    setSleepEndOnTrack(false);
  };

  // ─── Song Title Root Normalizer & Similarity Checker ──
  // Strictly eliminates duplicate and near-duplicate song names (e.g. "Riha", "Rihaa", "Riha (Unplugged)")
  const cleanSongTitleRoot = (str) => {
    if (!str) return "";
    let s = String(str).toLowerCase();
    s = s.replace(/[\(\[\{].*?[\)\]\}]/g, " ");
    s = s.replace(/\b(feat|ft|featuring|with)\b.*$/i, " ");
    s = s.replace(/\b(official|audio|video|music|lyric|lyrics|mv|hd|4k|visualizer|teaser)\b/gi, " ");
    s = s.replace(/\b(acoustic|unplugged|remix|alternate|live|version|edit|instrumental|slowed|reverb|reprise|extended|mix|lofi|lq|hq)\b/gi, " ");
    s = s.replace(/[^a-z0-9]/g, "");
    s = s.replace(/(.)\1+/g, "$1");
    return s.trim();
  };

  const areTitlesSameOrTooSimilar = (titleA, titleB) => {
    const rootA = cleanSongTitleRoot(titleA);
    const rootB = cleanSongTitleRoot(titleB);
    if (!rootA || !rootB) return false;
    if (rootA === rootB) return true;
    const minLen = Math.min(rootA.length, rootB.length);
    if (minLen >= 4) {
      if (rootA.startsWith(rootB) || rootB.startsWith(rootA)) return true;
      if (rootA.slice(0, 4) === rootB.slice(0, 4) && Math.abs(rootA.length - rootB.length) <= 3) {
        return true;
      }
    } else if (minLen === 3 && rootA.slice(0, 3) === rootB.slice(0, 3) && Math.abs(rootA.length - rootB.length) <= 1) {
      return true;
    }
    return false;
  };

  // Helper to fetch user's Blend tracks from Firebase RTDB
  const fetchUserBlendTracks = async (uid) => {
    if (!uid) return [];
    try {
      const { ref: dbRef, get, child } = await import("firebase/database");
      const { db } = await import("../services/firebase");
      const userCollabsSnap = await get(child(dbRef(db), `users/${uid}/collab_playlists`));
      if (!userCollabsSnap.exists()) return [];
      const collabs = userCollabsSnap.val() || {};
      const collabIds = Object.keys(collabs);
      const tracks = [];
      for (const cid of collabIds) {
        const plSnap = await get(child(dbRef(db), `collab_playlists/${cid}`));
        if (!plSnap.exists()) continue;
        const pl = plSnap.val();
        if (!pl.isBlend && !cid.startsWith("blend_")) continue;
        const rawTracks = pl.tracks ? (Array.isArray(pl.tracks) ? pl.tracks : Object.values(pl.tracks)) : [];
        for (const t of rawTracks) {
          if (t && (t.videoId || t.video_id || t.id)) tracks.push(t);
        }
      }
      return tracks;
    } catch (_) {
      return [];
    }
  };

  // Helper to fetch user's Personal Playlists and Liked Songs from Firebase RTDB
  const fetchUserLibraryTracks = async (uid) => {
    if (!uid) return [];
    try {
      const { ref: dbRef, get, child } = await import("firebase/database");
      const { db } = await import("../services/firebase");
      const [plsSnap, likedSnap] = await Promise.allSettled([
        get(child(dbRef(db), `users/${uid}/playlists`)),
        get(child(dbRef(db), `users/${uid}/likedSongs`)),
      ]);
      const tracks = [];
      if (likedSnap.status === "fulfilled" && likedSnap.value.exists()) {
        const likedVal = likedSnap.value.val();
        const likedArr = Array.isArray(likedVal) ? likedVal : Object.values(likedVal || {});
        tracks.push(...likedArr);
      }
      if (plsSnap.status === "fulfilled" && plsSnap.value.exists()) {
        const plsVal = plsSnap.value.val();
        const plsArr = Array.isArray(plsVal) ? plsVal : Object.values(plsVal || {});
        for (const pl of plsArr) {
          const pTracks = pl?.tracks ? (Array.isArray(pl.tracks) ? pl.tracks : Object.values(pl.tracks)) : [];
          tracks.push(...pTracks);
        }
      }
      return tracks.filter((t) => t && (t.videoId || t.video_id || t.id));
    } catch (_) {
      return [];
    }
  };

  // Helper to fetch Trending on Staytup tracks
  const fetchTrendingStaytupTracks = async () => {
    try {
      const rtdbTrending = await getAppTrendingTracksRTDB(25);
      if (Array.isArray(rtdbTrending) && rtdbTrending.length > 0) {
        return rtdbTrending;
      }
    } catch (_) {}
    try {
      const feedData = await api.getHomeFeed("staytup", false);
      const sections = feedData?.sections || [];
      const trendingSec = sections.find(
        (s) => s.id === "trending_now" || s.id === "trending_on_staytup" || s.title?.toLowerCase().includes("trending")
      );
      return trendingSec?.items || trendingSec?.tracks || sections[0]?.items || [];
    } catch (_) {
      return [];
    }
  };

  // ─── Core Smart Queue Builder: Followed Artists, Blend, Playlists & Trending ──
  const buildSmartPersonalizedQueue = async (track, baseQueue = [], maxTracks = 20) => {
    if (!track) return [];
    try {
      const trackId = track.videoId || track.video_id || track.id;
      const currentTitle = track.title || "";
      const currentTitleRoot = cleanSongTitleRoot(currentTitle);

      const artists = (track.artist || track.primaryArtists || "")
        .split(/[,&•/]/)
        .map((a) => a.replace(/\(.*?\)/g, "").trim())
        .filter((a) => a.length > 1);

      const cleanArtist = artists[0] || (track.artist || track.primaryArtists || "").trim();

      const existingIds = new Set(
        (baseQueue || []).map((t) => t?.videoId || t?.video_id || t?.id).filter(Boolean)
      );
      if (trackId) existingIds.add(trackId);

      const existingTitleRoots = new Set();
      if (currentTitleRoot) existingTitleRoots.add(currentTitleRoot);
      (baseQueue || []).forEach((t) => {
        const r = cleanSongTitleRoot(t?.title);
        if (r) existingTitleRoots.add(r);
      });

      const uid = auth.currentUser?.uid;

      const isCandidateAllowed = (t) => {
        if (!t) return false;
        const id = t?.videoId || t?.video_id || t?.id;
        if (!id || existingIds.has(id)) return false;
        if (uid && isTrackHidden(uid, id)) return false;
        const tTitle = t?.title;
        if (!tTitle) return false;
        const root = cleanSongTitleRoot(tTitle);
        if (!root) return false;
        if (existingTitleRoots.has(root)) return false;
        if (areTitlesSameOrTooSimilar(tTitle, currentTitle)) return false;
        for (const exRoot of existingTitleRoots) {
          if (areTitlesSameOrTooSimilar(root, exRoot)) return false;
        }
        return true;
      };

      const filterUniqueCandidates = (rawList, maxCount = 5) => {
        const out = [];
        for (const t of rawList || []) {
          if (isCandidateAllowed(t)) {
            const id = t?.videoId || t?.video_id || t?.id;
            const root = cleanSongTitleRoot(t?.title);
            existingIds.add(id);
            if (root) existingTitleRoots.add(root);
            out.push(t);
            if (out.length >= maxCount) break;
          }
        }
        return out;
      };

      // 1. Fetch concurrently from all requested sources
      const [
        primaryArtistRes,
        followedArtistsRes,
        blendTracksRes,
        libraryTracksRes,
        trendingTracksRes,
      ] = await Promise.allSettled([
        // Source 0: Current Artist Top Songs (max 2)
        cleanArtist && cleanArtist.length > 1
          ? api.getArtistSongs(cleanArtist, 0, 6)
          : Promise.resolve([]),

        // Source 1: Artists I Follow (pick 3 random followed artists)
        (async () => {
          const userFollowed = followedArtistsRef.current || [];
          const validFollowed = userFollowed.filter(
            (fa) => fa && fa.toLowerCase() !== cleanArtist.toLowerCase()
          );
          const chosen = fisherYatesShuffle(validFollowed).slice(0, 3);
          if (chosen.length === 0) return [];
          const fetches = chosen.map((name) => api.getArtistSongs(name, 0, 4).catch(() => null));
          const res = await Promise.all(fetches);
          const out = [];
          for (const d of res) {
            const r = d?.tracks || d?.results || [];
            out.push(...r);
          }
          return out;
        })(),

        // Source 2: My Blend Playlists
        fetchUserBlendTracks(uid),

        // Source 3: My Playlists & Liked Songs
        fetchUserLibraryTracks(uid),

        // Source 4: Trending on Staytup (Community Listening via RTDB)
        fetchTrendingStaytupTracks(),
      ]);

      const rawPrimary = primaryArtistRes.status === "fulfilled" ? (primaryArtistRes.value?.tracks || primaryArtistRes.value?.results || []) : [];
      const rawFollowed = followedArtistsRes.status === "fulfilled" ? followedArtistsRes.value : [];
      const rawBlend = blendTracksRes.status === "fulfilled" ? blendTracksRes.value : [];
      const rawLibrary = libraryTracksRes.status === "fulfilled" ? libraryTracksRes.value : [];
      const rawTrending = trendingTracksRes.status === "fulfilled" ? trendingTracksRes.value : [];

      // Extract distinct non-repetitive tracks from each pool
      const distinctPrimary = filterUniqueCandidates(fisherYatesShuffle(rawPrimary), 2);
      const distinctFollowed = filterUniqueCandidates(fisherYatesShuffle(rawFollowed), 5);
      const distinctBlend = filterUniqueCandidates(fisherYatesShuffle(rawBlend), 4);
      const distinctLibrary = filterUniqueCandidates(fisherYatesShuffle(rawLibrary), 4);
      const distinctTrending = filterUniqueCandidates(fisherYatesShuffle(rawTrending), 5);

      const combinedPool = [
        ...distinctPrimary,
        ...distinctFollowed,
        ...distinctBlend,
        ...distinctLibrary,
        ...distinctTrending,
      ];

      // Randomize completely across all sources: "AMKE IT A RANDOM AMKE IT MORE AWSOME AND ALL DONE"
      return fisherYatesShuffle(combinedPool).slice(0, maxTracks);
    } catch (err) {
      console.warn("[AudioContext] Smart personalized queue build notice:", err?.message);
      return [];
    }
  };

  // ─── Smart Auto-Queue: Populates queue when playing a song ──
  const enrichQueueForTrack = async (track, baseQueue = []) => {
    if (!track) return;
    // If baseQueue already has multiple distinct tracks from an explicit album/playlist, preserve it
    if (baseQueue && baseQueue.length > 1) return;

    const currentToken = ++enrichmentTokenRef.current;
    try {
      const randomizedTracks = await buildSmartPersonalizedQueue(track, baseQueue, 20);
      if (randomizedTracks.length === 0) return;
      if (currentToken !== enrichmentTokenRef.current) return;

      setQueue((prevQueue) => {
        if (currentToken !== enrichmentTokenRef.current) return prevQueue;
        const curId = currentTrackRef.current?.videoId || currentTrackRef.current?.video_id || currentTrackRef.current?.id;
        const targetId = track.videoId || track.video_id || track.id;
        if (curId && targetId && curId !== targetId) return prevQueue;

        const seen = new Set(prevQueue.map((t) => t?.videoId || t?.video_id || t?.id).filter(Boolean));
        const finalNew = randomizedTracks.filter((t) => {
          const id = t?.videoId || t?.video_id || t?.id;
          return id && !seen.has(id);
        });
        if (finalNew.length === 0) return prevQueue;

        const updated = [...prevQueue, ...finalNew];
        queueRef.current = updated;
        return updated;
      });
    } catch (err) {
      console.warn("[AudioContext] Smart queue enrichment error:", err?.message);
    }
  };

  // ─── Smart Autoplay: Generates diverse randomized tracks when queue is ending ──
  const autoplayGeneratedRef = useRef(false);

  const generateAutoplayTracks = async (currentQueue, currentIndex) => {
    if (!currentQueue || currentIndex < 0) return;
    const currentTrackObj = currentQueue[currentIndex];
    if (!currentTrackObj) return;

    try {
      const newAutoplayTracks = await buildSmartPersonalizedQueue(currentTrackObj, currentQueue, 15);
      if (newAutoplayTracks.length > 0) {
        setQueue((prevQueue) => {
          const curId = currentTrackRef.current?.videoId || currentTrackRef.current?.video_id || currentTrackRef.current?.id;
          const targetId = currentTrackObj?.videoId || currentTrackObj?.video_id || currentTrackObj?.id;
          if (curId && targetId && curId !== targetId) return prevQueue;

          const seen = new Set(prevQueue.map((t) => t?.videoId || t?.video_id || t?.id).filter(Boolean));
          const uniqueNew = newAutoplayTracks.filter((t) => {
            const id = t?.videoId || t?.video_id || t?.id;
            return id && !seen.has(id);
          });
          if (uniqueNew.length === 0) return prevQueue;

          const updated = [...prevQueue, ...uniqueNew];
          queueRef.current = updated;
          autoplayGeneratedRef.current = false;
          return updated;
        });
      }
    } catch (err) {
      console.warn("[AudioContext] Autoplay generation notice:", err?.message);
    }
  };

  const showQueueNotice = (text, icon = "play-forward") => {
    if (queueNoticeTimerRef.current) clearTimeout(queueNoticeTimerRef.current);
    setQueueNotice({ text, icon });
    queueNoticeTimerRef.current = setTimeout(() => {
      setQueueNotice(null);
    }, 2800);
  };

  const openQueue = () => {
    setIsQueueOpen(true);
    setIsFullPlayerVisible(true);
  };

  const closeQueue = () => {
    setIsQueueOpen(false);
  };

  // Queue helper methods
  const addToQueue = (trackToAppend) => {
    if (!trackToAppend) return;
    const cleanT = cleanTrackTitle(trackToAppend.title || "Track");

    if (!currentTrackRef.current) {
      playTrack(trackToAppend);
      showQueueNotice(`Playing now: ${cleanT}`, "play");
      return;
    }

    setQueue((prev) => {
      const updated = [...prev, trackToAppend];
      queueRef.current = updated;
      return updated;
    });

    prefetchUpcomingStreams(queueRef.current, queueIndexRef.current);
    showQueueNotice(`Added to queue: ${cleanT}`, "list");
  };

  const addToPlayNext = (trackToPlayNext) => {
    if (!trackToPlayNext) return;
    const cleanT = cleanTrackTitle(trackToPlayNext.title || "Track");

    if (!currentTrackRef.current) {
      playTrack(trackToPlayNext);
      showQueueNotice(`Playing now: ${cleanT}`, "play");
      return;
    }

    const currentIdx = queueIndexRef.current >= 0 ? queueIndexRef.current : 0;
    const targetIdx = currentIdx + 1;
    const vid = trackToPlayNext.videoId || trackToPlayNext.video_id || trackToPlayNext.id;

    setQueue((prev) => {
      const updated = [...prev];
      // If already in upcoming queue after currentIdx, remove duplicate
      const existingAfterIdx = updated.findIndex(
        (t, idx) => idx > currentIdx && (t?.videoId || t?.video_id || t?.id) === vid
      );
      if (existingAfterIdx > -1) {
        updated.splice(existingAfterIdx, 1);
      }
      updated.splice(targetIdx, 0, trackToPlayNext);
      queueRef.current = updated;
      return updated;
    });

    prefetchUpcomingStreams(queueRef.current, currentIdx);
    showQueueNotice(`Playing next: ${cleanT}`, "play-forward");
  };

  const setAsNextTrack = (fromIndexOrTrackId) => {
    const currentIdx = queueIndexRef.current >= 0 ? queueIndexRef.current : 0;
    const targetIdx = currentIdx + 1;
    let targetTitle = "";

    setQueue((prev) => {
      let fromIdx = -1;
      if (typeof fromIndexOrTrackId === "number") {
        fromIdx = fromIndexOrTrackId;
      } else {
        fromIdx = prev.findIndex(
          (t) => (t?.videoId || t?.video_id || t?.id) === fromIndexOrTrackId
        );
      }

      if (fromIdx < 0 || fromIdx >= prev.length || fromIdx === targetIdx || fromIdx === currentIdx) {
        return prev;
      }

      const updated = [...prev];
      const [movedTrack] = updated.splice(fromIdx, 1);
      if (!movedTrack) return prev;

      targetTitle = movedTrack.title || "";
      const insertAt = fromIdx < targetIdx ? targetIdx - 1 : targetIdx;
      updated.splice(insertAt, 0, movedTrack);
      queueRef.current = updated;
      return updated;
    });

    prefetchUpcomingStreams(queueRef.current, currentIdx);
    if (targetTitle) {
      showQueueNotice(`Set as next: ${cleanTrackTitle(targetTitle)}`, "play-forward");
    }
  };

  const moveQueueItem = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    setQueue((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) {
        return prev;
      }
      const updated = [...prev];
      const [item] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, item);

      let newQueueIndex = queueIndexRef.current;
      if (fromIndex === queueIndexRef.current) {
        newQueueIndex = toIndex;
      } else if (fromIndex < queueIndexRef.current && toIndex >= queueIndexRef.current) {
        newQueueIndex--;
      } else if (fromIndex > queueIndexRef.current && toIndex <= queueIndexRef.current) {
        newQueueIndex++;
      }
      setQueueIndex(newQueueIndex);
      queueIndexRef.current = newQueueIndex;
      queueRef.current = updated;
      return updated;
    });
  };

  const playQueueTrack = (index) => {
    const q = queueRef.current || [];
    if (index >= 0 && index < q.length) {
      playTrack(q[index], q, index);
    }
  };

  const removeFromQueue = (indexOrTrackId) => {
    setQueue((prev) => {
      let updated;
      if (typeof indexOrTrackId === "number") {
        updated = prev.filter((_, idx) => idx !== indexOrTrackId);
        if (indexOrTrackId < queueIndexRef.current) {
          const newIdx = Math.max(0, queueIndexRef.current - 1);
          setQueueIndex(newIdx);
          queueIndexRef.current = newIdx;
        }
      } else {
        const removeIdx = prev.findIndex(
          (t) => (t?.videoId || t?.video_id || t?.id) === indexOrTrackId
        );
        updated = prev.filter(
          (t) => (t?.videoId || t?.video_id || t?.id) !== indexOrTrackId
        );
        if (removeIdx >= 0 && removeIdx < queueIndexRef.current) {
          const newIdx = Math.max(0, queueIndexRef.current - 1);
          setQueueIndex(newIdx);
          queueIndexRef.current = newIdx;
        }
      }
      queueRef.current = updated;
      return updated;
    });
  };

  const clearQueue = () => {
    enrichmentTokenRef.current++;
    if (currentTrackRef.current) {
      const single = [currentTrackRef.current];
      setQueue(single);
      queueRef.current = single;
      setQueueIndex(0);
      queueIndexRef.current = 0;
    }
    showQueueNotice("Upcoming queue cleared", "trash-outline");
  };


  // Pre-resolve stream URLs for upcoming tracks so track transitions in background/PWA
  // happen SYNCHRONOUSLY with 0ms gap — preventing iOS & Android from muting background audio.
  const prefetchUpcomingStreams = (q, currentIndex) => {
    if (!q || !Array.isArray(q) || q.length === 0) return;
    const targets = [currentIndex + 1, currentIndex + 2];
    if (isRepeatRef.current && currentIndex + 1 >= q.length) {
      targets.push(0);
    }
    for (const idx of targets) {
      if (idx >= 0 && idx < q.length) {
        const t = q[idx];
        const tId = t?.videoId || t?.video_id || t?.id;
        const cleanId = String(tId).replace(/^saavn_/, "").trim();
        if (cleanId && !globalStreamCache.has(cleanId)) {
          const delay = idx === currentIndex + 1 ? 0 : 400 * (idx - currentIndex);
          setTimeout(() => {
            api.getStream(cleanId, 1, t.title, t.artist).then((data) => {
              if (data && data.stream_url) {
                globalStreamCache.set(cleanId, {
                  stream_url: data.stream_url,
                  duration: data.duration,
                  timestamp: Date.now(),
                });
                console.log(`[AudioContext] Pre-cached upcoming stream #${idx}: ${t.title || cleanId}`);
                if (typeof window !== "undefined" && Platform.OS === "web") {
                  try {
                    const preloader = new window.Audio();
                    preloader.preload = "auto";
                    preloader.src = data.stream_url;
                  } catch (_) {}
                }
              }
            }).catch(() => {});
          }, delay);
        }
      }
    }
  };

  // ─── Play a specific track (JioSaavn Direct Audio Stream) ───────────────────
  const playTrack = async (track, newQueue = null, index = -1, options = {}) => {
    if (!track) return;
    const trackId = track.videoId || track.video_id || track.id;
    if (!trackId) return;

    // Web synchronous user activation capture: prime audio element immediately within user gesture
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        if (!webAudioRef.current) {
          const audio = new window.Audio();
          audio.preload = "auto";
          try {
            audio.playsInline = true;
            audio.setAttribute("playsinline", "true");
            audio.setAttribute("webkit-playsinline", "true");
          } catch (_) {}
          audio.volume = volumeRef.current;
          audio.muted = false;
          audio.loop = Boolean(isRepeatRef.current);
          if (typeof document !== "undefined" && document.body) {
            audio.id = "staytup-audio-player";
            audio.style.display = "none";
            if (!document.getElementById("staytup-audio-player")) {
              document.body.appendChild(audio);
            }
          }
          webAudioRef.current = audio;
        }
        const aEl = webAudioRef.current;
        if (aEl && aEl.paused && (!aEl.src || aEl.src === window.location.href)) {
          aEl.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
          aEl.play().catch(() => {});
        }
      } catch (_) {}
    }

    const requestId = ++playbackRequestRef.current;
    const uid = auth.currentUser?.uid || "guest";
    // A track removed from history stays out of automatic queues. Selecting it
    // intentionally restores it to recommendations and history.
    if (!options.autoAdvance && isTrackHidden(uid, trackId)) {
      restoreHiddenTrack(uid, trackId).catch(() => {});
    }

    // Reset autoplay flag when user explicitly selects a track
    if (!options.autoAdvance) {
      autoplayGeneratedRef.current = false;
    }

    advancingRef.current = true;
    audioRetryCountRef.current = 0;
    setIsLoading(true);
    setErrorNotice(null);

    // Immediate 500x500 artwork upgrade if 50x50 or 150x150 is present
    const rawArt = track.artwork_url || track.thumbnail || "";
    const immediateArtwork = rawArt ? String(rawArt).replace(/(?:50x50|150x150)\.jpg/i, "500x500.jpg") : "";
    const preparedTrack = {
      ...track,
      artwork_url: immediateArtwork || track.artwork_url || track.thumbnail || "",
      thumbnail: immediateArtwork || track.thumbnail || track.artwork_url || "",
    };

    setCurrentTrack(preparedTrack);
    currentTrackRef.current = preparedTrack;
    lastUpdatePosRef.current = 0;
    setPositionMillis(0);
    positionMillisRef.current = 0;
    prevCurSecRef.current = 0;

    let initDurationMs = 0;
    if (track.duration_seconds && Number.isFinite(Number(track.duration_seconds)) && Number(track.duration_seconds) > 0) {
      const s = Number(track.duration_seconds);
      initDurationMs = s > 10000 ? s : s * 1000;
    } else if (typeof track.duration === "number" && track.duration > 0) {
      initDurationMs = track.duration * 1000;
    }
    if (initDurationMs > 0 && initDurationMs < 86400000) {
      authoritativeDurationRef.current = initDurationMs;
      durationMillisRef.current = initDurationMs;
      setDurationMillis(initDurationMs);
    } else {
      authoritativeDurationRef.current = 0;
    }

    updateMediaSessionMetadata(preparedTrack);
    updateMediaSessionPlaybackState(true);
    updateMediaSessionPosition(0, initDurationMs);

    let effectiveQueue = newQueue && Array.isArray(newQueue) && newQueue.length > 0 ? newQueue : null;
    if (!effectiveQueue) {
      const existingQueue = queueRef.current || [];
      const foundIdx = existingQueue.findIndex(
        (t) => (t?.videoId || t?.video_id || t?.id) === trackId
      );
      if (foundIdx >= 0) {
        effectiveQueue = existingQueue;
        index = foundIdx;
      } else {
        effectiveQueue = [preparedTrack];
        index = 0;
      }
    }

    // Auto-clean & Deduplicate: Remove duplicate IDs and same-name song clones
    if (effectiveQueue && effectiveQueue.length > 1) {
      const seenIds = new Set();
      const seenRoots = new Set();
      const deduped = [];
      const targetSongTitle = preparedTrack?.title || "";
      for (let i = 0; i < effectiveQueue.length; i++) {
        const t = effectiveQueue[i];
        if (!t) continue;
        const id = t?.videoId || t?.video_id || t?.id;
        const root = cleanSongTitleRoot(t?.title);
        const isCurrentTarget = i === index;
        if (isCurrentTarget) {
          if (id) seenIds.add(id);
          if (root) seenRoots.add(root);
          deduped.push(t);
        } else if (id && !seenIds.has(id)) {
          const isCloneOfTarget = areTitlesSameOrTooSimilar(t?.title, targetSongTitle);
          let isCloneOfOther = root ? seenRoots.has(root) : false;
          if (!isCloneOfOther && root) {
            for (const existingRoot of seenRoots) {
              if (areTitlesSameOrTooSimilar(root, existingRoot)) {
                isCloneOfOther = true;
                break;
              }
            }
          }
          if (!isCloneOfTarget && !isCloneOfOther) {
            seenIds.add(id);
            if (root) seenRoots.add(root);
            deduped.push(t);
          }
        }
      }
      if (deduped.length > 0) {
        effectiveQueue = deduped;
        const newTargetIdx = effectiveQueue.findIndex((t) => (t?.videoId || t?.video_id || t?.id) === trackId);
        index = newTargetIdx >= 0 ? newTargetIdx : 0;
      }
    }

    originalQueueRef.current = [...effectiveQueue];
    let targetIdx = 0;
    if (isShuffleRef.current && effectiveQueue.length > 1) {
      const cId = track.videoId || track.video_id || track.id;
      const others = effectiveQueue.filter((t, idx) => {
        const tId = t?.videoId || t?.video_id || t?.id;
        return tId && cId ? tId !== cId : idx !== index;
      });
      const shuffledQueue = [preparedTrack, ...fisherYatesShuffle(others)];
      setQueue(shuffledQueue);
      queueRef.current = shuffledQueue;
      targetIdx = 0;
      setQueueIndex(0);
      queueIndexRef.current = 0;
    } else {
      setQueue(effectiveQueue);
      queueRef.current = effectiveQueue;
      targetIdx = index >= 0 ? index : 0;
      setQueueIndex(targetIdx);
      queueIndexRef.current = targetIdx;
    }

    // Automatically enrich queue with artist songs, trending hits, and feed new releases
    enrichQueueForTrack(preparedTrack, effectiveQueue);

    const cleanId = String(trackId).replace(/^saavn_/, "").trim();

    // Persist current track & queue to Firebase Realtime Database
    // Strictly store metadata only — NEVER save stream_url to Firebase!
    const sanitizedTrack = {
      id: track.id || `saavn_${trackId}`,
      videoId: cleanId,
      title: preparedTrack.title || "",
      artist: preparedTrack.artist || "",
      artwork_url: preparedTrack.artwork_url || preparedTrack.thumbnail || "",
      thumbnail: preparedTrack.thumbnail || preparedTrack.artwork_url || "",
      duration: preparedTrack.duration || 0,
      duration_seconds: preparedTrack.duration_seconds || preparedTrack.duration || 0,
      source: "saavn",
    };

    try {
      saveLastPlayback(uid, sanitizedTrack, newQueue || queueRef.current);
      addRecentlyPlayed(uid, sanitizedTrack);
      recordAppSongPlay(sanitizedTrack);
      recordUserStream(uid);
      updatePlaybackSession(uid, {
        deviceId: myDeviceId,
        deviceName: myDeviceName,
        trackId: sanitizedTrack.videoId,
        trackTitle: sanitizedTrack.title,
        track: sanitizedTrack,
        isPlaying: true,
      });

      // Auto-add played song to blend playlists if not already present
      autoAddToBlendPlaylists(uid, sanitizedTrack).catch(() => {});
    } catch (_) {}

    // Resolve proper 500x500 high-res image from Server / RTDB / Staytup API
    (async () => {
      try {
        const properImg = await api.getTrackImage(cleanId, sanitizedTrack.title, sanitizedTrack.artist);
        if (properImg && properImg !== preparedTrack.artwork_url) {
          setCurrentTrack((prev) => {
            if (!prev) return prev;
            const prevId = prev.videoId || prev.video_id || prev.id;
            if (prevId === trackId || String(prevId).replace(/^saavn_/, "") === cleanId) {
              return { ...prev, artwork_url: properImg, thumbnail: properImg };
            }
            return prev;
          });
          if (currentTrackRef.current) {
            const curId = currentTrackRef.current.videoId || currentTrackRef.current.video_id || currentTrackRef.current.id;
            if (curId === trackId || String(curId).replace(/^saavn_/, "") === cleanId) {
              currentTrackRef.current.artwork_url = properImg;
              currentTrackRef.current.thumbnail = properImg;
              updateMediaSessionMetadata(currentTrackRef.current);
              if (Platform.OS === "ios" && LockScreenControls?.updateNowPlaying) {
                LockScreenControls.updateNowPlaying({
                  title: currentTrackRef.current.title || "",
                  artist: currentTrackRef.current.artist || "",
                  artworkUrl: properImg,
                  duration: durationMillisRef.current > 0 ? durationMillisRef.current / 1000 : 0,
                  position: positionMillisRef.current > 0 ? positionMillisRef.current / 1000 : 0,
                  playbackRate: 1.0,
                  isPlaying: true,
                });
              }
            }
          }
          try {
            const uid = auth.currentUser?.uid || "guest";
            const updatedSanitized = {
              ...sanitizedTrack,
              artwork_url: properImg,
              thumbnail: properImg,
            };
            saveCachedTrackImage(cleanId, properImg).catch(() => {});
            saveLastPlayback(uid, updatedSanitized, queueRef.current).catch(() => {});
            addRecentlyPlayed(uid, updatedSanitized).catch(() => {});
            recordAppSongPlay(updatedSanitized).catch(() => {});
          } catch (_) {}
        }
      } catch (_) {}
    })();

    // Resolve stream URL: Check in-memory cache first for instant synchronous resolution.
    // When a song auto-advances in background, pre-cached stream URLs allow audio.play()
    // to execute SYNCHRONOUSLY within the 'ended' event — which iOS & Android PWA allow without muting!
    let playableUrl = track.stream_url;

    // 1. Check if track is downloaded for offline listening
    const offlineUrl = await getOfflineAudioUrl(cleanId);
    if (offlineUrl) {
      playableUrl = offlineUrl;
    }

    const cachedStream = globalStreamCache.get(cleanId);
    if (cachedStream && cachedStream.stream_url && !playableUrl) {
      playableUrl = cachedStream.stream_url;
      if (cachedStream.duration && (!initDurationMs || initDurationMs <= 0)) {
        const ms = cachedStream.duration * 1000;
        authoritativeDurationRef.current = ms;
        durationMillisRef.current = ms;
        setDurationMillis(ms);
      }
    }

    // If stream URL is not in cache, fetch it. The current track continues outputting
    // audio seamlessly via loop=true while we fetch, avoiding any pipeline termination.
    if (!playableUrl || track.source === "saavn" || String(track.id).startsWith("saavn_")) {
      if (!playableUrl) {
        try {
          const streamData = await api.getStream(cleanId, 2, preparedTrack.title, preparedTrack.artist);
          // The listener selected another track while this URL was resolving.
          // Do not let this stale request seize the shared audio element.
          if (requestId !== playbackRequestRef.current) return;
          if (streamData && streamData.stream_url) {
            playableUrl = streamData.stream_url;
            globalStreamCache.set(cleanId, {
              stream_url: playableUrl,
              duration: streamData.duration,
              timestamp: Date.now(),
            });
            if (streamData.duration && (!initDurationMs || initDurationMs <= 0)) {
              const ms = streamData.duration * 1000;
              authoritativeDurationRef.current = ms;
              durationMillisRef.current = ms;
              setDurationMillis(ms);
            }
          }
        } catch (err) {
          console.warn(`[AudioContext] Failed to fetch stream URL for ${trackId}:`, err.message);
          setErrorNotice("Unable to load track stream. Skipping...");
          setIsLoading(false);
          advancingRef.current = false;
          setTimeout(() => { if (playNextRef.current) playNextRef.current(); }, 1200);
          return;
        }
      }
    }

    if (!playableUrl) {
      setErrorNotice("Stream URL unavailable.");
      setIsLoading(false);
      advancingRef.current = false;
      return;
    }

    if (requestId !== playbackRequestRef.current) {
      return;
    }

    // Pre-cache next tracks in queue so future transitions are 100% synchronous
    prefetchUpcomingStreams(queueRef.current || effectiveQueue, queueIndexRef.current >= 0 ? queueIndexRef.current : targetIdx);

    // Web Playback: Direct HTML5 <audio>
    if (Platform.OS === "web") {
      try {
        if (!webAudioRef.current) {
          webAudioRef.current = new window.Audio();
          webAudioRef.current.preload = "auto";
          try {
            webAudioRef.current.playsInline = true;
            webAudioRef.current.setAttribute("playsinline", "true");
            webAudioRef.current.setAttribute("webkit-playsinline", "true");
          } catch (_) {}
        }
        const audio = webAudioRef.current;

        // Keep loop enabled during playback so the browser & mobile OS (iOS/Android)
        // never terminate the hardware audio session upon reaching the end of the buffer.
        audio.loop = Boolean(isRepeatRef.current);
        audio.src = playableUrl;
        audio.muted = false;
        audio.volume = volumeRef.current;

        // Force unmuted and audible state as soon as playback starts
        const onceAudible = () => {
          audio.muted = false;
          audio.volume = volumeRef.current;
          audio.removeEventListener("playing", onceAudible);
        };
        audio.addEventListener("playing", onceAudible);

        // Immediate play attempt
        let playSuccess = false;
        const delays = [0, 80, 250, 600];
        for (let attempt = 0; attempt < delays.length; attempt++) {
          if (attempt > 0) {
            await new Promise(r => setTimeout(r, delays[attempt]));
            audio.muted = false;
            audio.volume = volumeRef.current;
          }
          try {
            await audio.play();
            if (requestId !== playbackRequestRef.current) {
              // A newer request owns this shared element now. Do not pause it:
              // its source may already have been replaced by the newer track.
              return;
            }
            playSuccess = true;
            break;
          } catch (playErr) {
            console.warn(`[AudioContext] Web play attempt ${attempt + 1} failed:`, playErr?.message);
            if (playErr?.name === "AbortError") {
              continue;
            }
          }
        }

        if (playSuccess) {
          audio.muted = false;
          audio.volume = volumeRef.current;
          setIsPlaying(true);
          isPlayingRef.current = true;
          setIsLoading(false);
          updateMediaSessionPlaybackState(true);
          setupMediaSessionHandlers();
        } else {
          console.warn("[AudioContext] Web play failed in background — will resume as soon as tab/app is visible");
          setIsLoading(false);
          const retryOnVisible = async () => {
            if (document.visibilityState === "visible" && webAudioRef.current) {
              document.removeEventListener("visibilitychange", retryOnVisible);
              try {
                webAudioRef.current.muted = false;
                webAudioRef.current.volume = volumeRef.current;
                await webAudioRef.current.play();
                setIsPlaying(true);
                isPlayingRef.current = true;
                updateMediaSessionPlaybackState(true);
              } catch (_) {}
            }
          };
          document.addEventListener("visibilitychange", retryOnVisible);
        }
      } catch (e) {
        console.warn("[AudioContext] Web play error:", e);
        setIsLoading(false);
      } finally {
        advancingRef.current = false;
      }
      return;
    }

    // Native Playback: expo-av Audio.Sound
    try {
      // Re-configure audio mode before each track load to guard against
      // iOS/Android silently deactivating the audio session during background transitions
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      }).catch(err => console.warn("[AudioContext] Audio mode reconfigure warning:", err?.message));

      if (soundRef.current) {
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync(
        { uri: playableUrl },
        { shouldPlay: true, progressUpdateIntervalMillis: 500 },
        onPlaybackStatusUpdate
      );
      soundRef.current = sound;
      setIsPlaying(true);
      isPlayingRef.current = true;
      setIsLoading(false);
      updateMediaSessionPlaybackState(true);

      // Update native lock screen metadata after successful track load
      if (LockScreenControls && LockScreenControls.updateNowPlaying) {
        try {
          LockScreenControls.updateNowPlaying({
            title: track.title || "Staytup Music",
            artist: track.artist || "Unknown Artist",
            duration: initDurationMs > 0 ? initDurationMs / 1000 : 0,
            position: 0,
            isPlaying: true,
            artworkUrl: track.artwork_url || track.thumbnail || "",
          });
        } catch (_) {}
      }
    } catch (err) {
      console.error("[AudioContext] Native playback error:", err);
      setErrorNotice("Playback error occurred.");
      setIsLoading(false);
    } finally {
      // A direct play and an automatic queue transition both take this path.
      // Always release the transition guard once the native sound is settled.
      advancingRef.current = false;
    }
  };
  playTrackRef.current = playTrack;

  // Toggle Play / Pause
  const togglePlayPause = async () => {
    const uid = auth.currentUser?.uid || "guest";
    // Web: HTML5 audio
    if (Platform.OS === "web") {
      const audio = webAudioRef.current;
      if (!audio) {
        if (currentTrack) playTrack(currentTrack);
        return;
      }
      // The media element is authoritative. React state can briefly lag during
      // an automatic track transition, which previously inverted this button.
      const actuallyPlaying = Boolean(audio.src && !audio.paused);
      if (actuallyPlaying) {
        audio.pause();
        setIsPlaying(false);
        isPlayingRef.current = false;
        updateMediaSessionPlaybackState(false);
        const dur = authoritativeDurationRef.current || durationMillisRef.current || 0;
        if (dur > 0) {
          updateMediaSessionPosition(positionMillisRef.current, dur, true);
        }
        updatePlaybackSession(uid, { deviceId: myDeviceId, deviceName: myDeviceName, isPlaying: false });
      } else {
        if (!audio.src && currentTrack) {
          playTrack(currentTrack);
          return;
        }
        // Force-ensure unmuted and loop matching repeat setting before resuming
        audio.loop = Boolean(isRepeatRef.current);
        audio.muted = false;
        audio.volume = volumeRef.current;
        try {
          await audio.play();
          setIsPlaying(true);
          isPlayingRef.current = true;
          updateMediaSessionPlaybackState(true);
        } catch (err) {
          setIsPlaying(false);
          isPlayingRef.current = false;
          updateMediaSessionPlaybackState(false);
          return;
        }
        const dur = authoritativeDurationRef.current || durationMillisRef.current || 0;
        if (dur > 0) {
          updateMediaSessionPosition(positionMillisRef.current, dur, true);
        }
        updatePlaybackSession(uid, {
          deviceId: myDeviceId,
          deviceName: myDeviceName,
          trackId: currentTrack?.videoId || currentTrack?.video_id || currentTrack?.id,
          trackTitle: currentTrack?.title,
          track: currentTrack || null,
          isPlaying: true,
        });
      }
      return;
    }

    // Native: expo-av
    if (!soundRef.current) {
      if (currentTrack) playTrack(currentTrack);
      return;
    }
    try {
      if (isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
        isPlayingRef.current = false;
        updateMediaSessionPlaybackState(false);
        updatePlaybackSession(uid, { deviceId: myDeviceId, deviceName: myDeviceName, isPlaying: false });
        if (LockScreenControls?.updateNowPlaying && currentTrackRef.current) {
          try {
            LockScreenControls.updateNowPlaying({
              title: currentTrackRef.current.title || "Staytup Music",
              artist: currentTrackRef.current.artist || "Unknown Artist",
              duration: (authoritativeDurationRef.current || durationMillisRef.current || 0) / 1000,
              position: (positionMillisRef.current || 0) / 1000,
              isPlaying: false,
              artworkUrl: currentTrackRef.current.artwork_url || currentTrackRef.current.thumbnail || "",
            });
          } catch (_) {}
        }
      } else {
        await soundRef.current.playAsync();
        setIsPlaying(true);
        isPlayingRef.current = true;
        updateMediaSessionPlaybackState(true);
        updatePlaybackSession(uid, {
          deviceId: myDeviceId,
          deviceName: myDeviceName,
          trackId: currentTrack?.videoId || currentTrack?.video_id || currentTrack?.id,
          trackTitle: currentTrack?.title,
          track: currentTrack || null,
          isPlaying: true,
        });
        if (LockScreenControls?.updateNowPlaying && currentTrackRef.current) {
          try {
            LockScreenControls.updateNowPlaying({
              title: currentTrackRef.current.title || "Staytup Music",
              artist: currentTrackRef.current.artist || "Unknown Artist",
              duration: (authoritativeDurationRef.current || durationMillisRef.current || 0) / 1000,
              position: (positionMillisRef.current || 0) / 1000,
              isPlaying: true,
              artworkUrl: currentTrackRef.current.artwork_url || currentTrackRef.current.thumbnail || "",
            });
          } catch (_) {}
        }
      }
    } catch (err) {
      console.warn("Toggle play error:", err);
    }
  };
  togglePlayPauseRef.current = togglePlayPause;

  // Seek to position
  const seekTo = async (posMillis) => {
    const dur = authoritativeDurationRef.current || durationMillisRef.current || 0;
    const clamped = dur > 0 ? Math.max(0, Math.min(posMillis, dur)) : Math.max(0, posMillis);

    if (Platform.OS === "web" && webAudioRef.current) {
      try {
        webAudioRef.current.currentTime = clamped / 1000;
        lastUpdatePosRef.current = clamped;
        setPositionMillis(clamped);
        positionMillisRef.current = clamped;
        updateMediaSessionPosition(clamped, dur);
      } catch (err) {
        console.warn("Seek error:", err);
      }
      return;
    }

    if (!soundRef.current) return;
    try {
      await soundRef.current.setPositionAsync(clamped);
      lastUpdatePosRef.current = clamped;
      setPositionMillis(clamped);
      positionMillisRef.current = clamped;
      updateMediaSessionPosition(clamped, dur);
    } catch (err) {
      console.warn("Seek error:", err);
    }
  };

  // Play Next Track in Queue
  const playNext = () => {
    if (advancingRef.current) return;
    advancingRef.current = true;

    const q = queueRef.current;
    if (!q || q.length === 0) {
      advancingRef.current = false;
      return;
    }

    let nextIdx = queueIndexRef.current + 1;

    if (nextIdx >= q.length) {
      if (isRepeatRef.current) {
        nextIdx = 0;
      } else {
        // Autoplay: generate more tracks when queue ends
        if (!autoplayGeneratedRef.current && q.length > 0) {
          autoplayGeneratedRef.current = true;
          generateAutoplayTracks(q, queueIndexRef.current).then(() => {
            const updatedQ = queueRef.current;
            if (updatedQ && updatedQ.length > q.length) {
              // New tracks were added, play the next one
              const newNextIdx = queueIndexRef.current + 1;
              if (newNextIdx < updatedQ.length) {
                setQueueIndex(newNextIdx);
                queueIndexRef.current = newNextIdx;
                playTrack(updatedQ[newNextIdx], null, newNextIdx, { autoAdvance: true })
                  .catch(() => {})
                  .finally(() => { advancingRef.current = false; });
                return;
              }
            }
            setIsPlaying(false);
            isPlayingRef.current = false;
            updateMediaSessionPlaybackState(false);
            if (webAudioRef.current) {
              webAudioRef.current.loop = false;
              webAudioRef.current.pause();
            }
            advancingRef.current = false;
          }).catch(() => {
            setIsPlaying(false);
            isPlayingRef.current = false;
            updateMediaSessionPlaybackState(false);
            advancingRef.current = false;
          });
          return;
        }
        setIsPlaying(false);
        isPlayingRef.current = false;
        updateMediaSessionPlaybackState(false);
        if (webAudioRef.current) {
          webAudioRef.current.loop = false;
          webAudioRef.current.pause();
        }
        advancingRef.current = false;
        return;
      }
    }

    // Reset autoplay flag when advancing to a new track within the queue
    if (nextIdx > 0 && nextIdx < q.length) {
      autoplayGeneratedRef.current = false;
    }

    // Skip tracks the listener explicitly removed from history. This does not
    // alter their saved playlists; it only prevents surprise autoplay.
    while (nextIdx < q.length && isTrackHidden(auth.currentUser?.uid || "guest", q[nextIdx]?.videoId || q[nextIdx]?.video_id || q[nextIdx]?.id)) {
      nextIdx += 1;
    }
    if (nextIdx >= q.length) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      updateMediaSessionPlaybackState(false);
      advancingRef.current = false;
      return;
    }
    const nextTrack = q[nextIdx];
    if (nextTrack) {
      setQueueIndex(nextIdx);
      queueIndexRef.current = nextIdx;
      // Reset advancingRef after playTrack completes (not on unreliable setTimeout)
      playTrack(nextTrack, null, nextIdx, { autoAdvance: true })
        .catch(() => {})
        .finally(() => { advancingRef.current = false; });
    } else {
      advancingRef.current = false;
    }
  };
  playNextRef.current = playNext;

  // Play Previous Track
  const playPrevious = () => {
    if (positionMillis > 3000) {
      seekTo(0);
      return;
    }

    const q = queueRef.current;
    if (!q || q.length === 0) return;

    let prevIdx = queueIndexRef.current - 1;
    if (prevIdx < 0) {
      prevIdx = Math.max(0, q.length - 1);
    }

    const prevTrack = q[prevIdx];
    if (prevTrack) {
      setQueueIndex(prevIdx);
      queueIndexRef.current = prevIdx;
      playTrack(prevTrack);
    }
  };
  playPreviousRef.current = playPrevious;

  // Toggle Repeat
  const toggleRepeat = () => {
    setIsRepeat((prev) => {
      const next = !prev;
      isRepeatRef.current = next;
      if (Platform.OS === "web" && webAudioRef.current) {
        webAudioRef.current.loop = next;
      }
      return next;
    });
  };

  // Toggle Shuffle with queue preservation and Fisher-Yates randomization
  const toggleShuffle = () => {
    setIsShuffle((prev) => {
      const next = !prev;
      isShuffleRef.current = next;
      const currentQ = queueRef.current || [];
      const current = currentTrackRef.current;

      if (next) {
        if (currentQ.length > 1) {
          if (!originalQueueRef.current || originalQueueRef.current.length === 0) {
            originalQueueRef.current = [...currentQ];
          }
          const cId = current?.videoId || current?.video_id || current?.id;
          const others = currentQ.filter((t, idx) => {
            const tId = t?.videoId || t?.video_id || t?.id;
            return tId && cId ? tId !== cId : idx !== queueIndexRef.current;
          });
          const shuffled = current ? [current, ...fisherYatesShuffle(others)] : fisherYatesShuffle(currentQ);
          setQueue(shuffled);
          queueRef.current = shuffled;
          setQueueIndex(0);
          queueIndexRef.current = 0;
        }
      } else {
        const orig = originalQueueRef.current;
        if (orig && orig.length > 0) {
          const cId = current?.videoId || current?.video_id || current?.id;
          let origIndex = 0;
          if (cId) {
            const foundIdx = orig.findIndex((t) => (t.videoId || t.video_id || t.id) === cId);
            if (foundIdx >= 0) origIndex = foundIdx;
          }
          setQueue([...orig]);
          queueRef.current = [...orig];
          setQueueIndex(origIndex);
          queueIndexRef.current = origIndex;
        }
      }
      return next;
    });
  };

  const setShuffle = (desiredState) => {
    if (isShuffleRef.current !== desiredState) {
      toggleShuffle();
    }
  };

  // Volume Control with RAF throttling
  const [volume, setVolumeState] = useState(0.85);
  const volumeRafRef = useRef(null);

  const setVolume = (newVol) => {
    const clamped = Math.max(0, Math.min(1, newVol));
    setVolumeState(clamped);
    volumeRef.current = clamped;

    if (Platform.OS === "web" && webAudioRef.current) {
      webAudioRef.current.volume = clamped;
    }

    if (soundRef.current) {
      if (volumeRafRef.current) {
        cancelAnimationFrame(volumeRafRef.current);
      }
      volumeRafRef.current = requestAnimationFrame(async () => {
        try {
          await soundRef.current?.setVolumeAsync(clamped);
        } catch (e) {
          console.warn("setVolume error:", e);
        }
      });
    }
  };

  const playbackValue = useMemo(
    () => ({
      currentTrack,
      isPlaying,
      isLoading,
      queue,
      queueIndex,
      isRepeat,
      isShuffle,
      isFullPlayerVisible,
      isDeviceModalOpen,
      setIsDeviceModalOpen,
      openDeviceModal,
      closeDeviceModal,
      errorNotice,
      volume,
      setVolume,
      playTrack,
      togglePlayPause,
      seekTo,
      playNext,
      playPrevious,
      toggleRepeat,
      toggleShuffle,
      setShuffle,
      setFullPlayerVisible: setIsFullPlayerVisible,
      sleepSecondsLeft,
      sleepEndOnTrack,
      setSleepTimer: setSleepTimerMinutes,
      setSleepEndOfTrack: setSleepEndOfTrackMode,
      cancelSleepTimer,
      // Queue management methods
      addToQueue,
      addToPlayNext,
      setAsNextTrack,
      moveQueueItem,
      playQueueTrack,
      removeFromQueue,
      clearQueue,
      openQueue,
      closeQueue,
      isQueueOpen,
      setIsQueueOpen,
      queueNotice,
      showQueueNotice,
    }),
    [
      currentTrack,
      isPlaying,
      isLoading,
      queue,
      queueIndex,
      isRepeat,
      isShuffle,
      isFullPlayerVisible,
      isDeviceModalOpen,
      openDeviceModal,
      closeDeviceModal,
      errorNotice,
      volume,
      sleepSecondsLeft,
      sleepEndOnTrack,
      isQueueOpen,
      queueNotice,
    ]
  );

  const contextValue = useMemo(
    () => ({
      ...playbackValue,
      positionMillis,
      durationMillis: authoritativeDurationRef.current || durationMillisRef.current || durationMillis,
    }),
    [
      playbackValue,
      positionMillis,
      durationMillis,
    ]
  );

  return (
    <AudioPlaybackContext.Provider value={playbackValue}>
      <AudioContext.Provider value={contextValue}>
        {children}
      </AudioContext.Provider>
    </AudioPlaybackContext.Provider>
  );
};

class AudioProviderSafe extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error) {
    console.warn("[AudioProviderSafe] caught:", error?.message);
  }
  render() {
    if (this.state.hasError) {
      return (
        <AudioPlaybackContext.Provider value={defaultAudioContext}>
          <AudioContext.Provider value={defaultAudioContext}>
            {this.props.children}
          </AudioContext.Provider>
        </AudioPlaybackContext.Provider>
      );
    }
    return <AudioProvider {...this.props} />;
  }
}

const defaultAudioContext = {
  currentTrack: null,
  isPlaying: false,
  isLoading: false,
  positionMillis: 0,
  durationMillis: 0,
  queue: [],
  queueIndex: 0,
  isRepeat: false,
  isShuffle: false,
  isFullPlayerVisible: false,
  errorNotice: null,
  volume: 0.85,
  setVolume: () => {},
  playTrack: () => {},
  togglePlayPause: () => {},
  seekTo: () => {},
  playNext: () => {},
  playPrevious: () => {},
  toggleRepeat: () => {},
  toggleShuffle: () => {},
  setShuffle: () => {},
  setFullPlayerVisible: () => {},
  sleepSecondsLeft: 0,
  sleepEndOnTrack: false,
  setSleepTimer: () => {},
  setSleepEndOfTrack: () => {},
  cancelSleepTimer: () => {},
  addToQueue: () => {},
  addToPlayNext: () => {},
  setAsNextTrack: () => {},
  moveQueueItem: () => {},
  playQueueTrack: () => {},
  removeFromQueue: () => {},
  clearQueue: () => {},
  openQueue: () => {},
  closeQueue: () => {},
  isQueueOpen: false,
  setIsQueueOpen: () => {},
  queueNotice: null,
  showQueueNotice: () => {},
  isDeviceModalOpen: false,
  setIsDeviceModalOpen: () => {},
  openDeviceModal: () => {},
  closeDeviceModal: () => {},
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  return context || defaultAudioContext;
};

export const useAudioPlayback = () => {
  const playback = useContext(AudioPlaybackContext);
  return playback || useContext(AudioContext) || defaultAudioContext;
};

export { AudioProviderSafe as AudioProvider };
