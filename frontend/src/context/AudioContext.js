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
  recordAppSongPlay,
  recordUserStream,
  saveCachedTrackImage,
  getCachedTrackImage,
  getCollabPlaylistDetails,
  addTrackToCollabPlaylist,
} from "../services/firebase";
import { getAccurateDeviceInfo } from "./ResponsiveContext";

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

// ─── Stream URL Cache & Keep-Alive Audio Session (PWA Background Playback) ──
// In-memory cache: maps clean trackId -> { stream_url, duration, timestamp }
// Pre-resolves upcoming tracks so track switches happen SYNCHRONOUSLY within
// the audio 'ended' event — keeping background playback unmuted on iOS & Android.
const globalStreamCache = new Map();

// Inaudible 0.1s silent WAV data URI used as an active-session bridge during
// network delay, so iOS Safari & Android Chrome never suspend the audio pipeline.
const SILENT_AUDIO_URI =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

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
  const [errorNotice, setErrorNotice] = useState(null);

  // Sleep Timer state
  const [sleepSecondsLeft, setSleepSecondsLeft] = useState(null);
  const [sleepEndOnTrack, setSleepEndOnTrack] = useState(false);
  const sleepEndOnTrackRef = useRef(false);

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

  const playTrackRef = useRef(null);
  const togglePlayPauseRef = useRef(null);
  const playNextRef = useRef(null);
  const playPreviousRef = useRef(null);
  const enrichmentTokenRef = useRef(0);

  queueRef.current = queue;
  queueIndexRef.current = queueIndex;
  isRepeatRef.current = isRepeat;
  isShuffleRef.current = isShuffle;
  sleepEndOnTrackRef.current = sleepEndOnTrack;
  currentTrackRef.current = currentTrack;
  positionMillisRef.current = positionMillis;
  durationMillisRef.current = durationMillis;

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
    audio.crossOrigin = "anonymous";
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

      // 3. When iPhone screen locks, iOS WebKit can emit a synthetic pause during audio pipeline handover.
      // If we are actively playing, re-assert playback so Lock Screen & Dynamic Island stay in 'playing' state!
      if (typeof document !== "undefined" && document.visibilityState === "hidden" && isPlayingRef.current) {
        if (audio && audio.src && audio.paused) {
          audio.play().then(() => {
            updateMediaSessionPlaybackState(true);
          }).catch(() => {});
          return;
        }
      }

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

        // ─── Seamless Background & Lock Screen Auto-Advance ──────────────────
        // Mobile Safari (iOS) and Chrome (Android) terminate background media sessions
        // if an audio element reaches 'ended'. To keep the hardware audio pipeline
        // continuously active without muting or requiring the app to be foregrounded,
        // we advance 0.4s before EOF while the audio element is STILL actively playing!
        if (remainingSec <= 0.4 && curSec > 5 && !advancingRef.current) {
          if (sleepEndOnTrackRef.current) {
            setSleepEndOnTrack(false);
            if (audio) {
              audio.loop = false;
              audio.pause();
            }
            setIsPlaying(false);
            isPlayingRef.current = false;
            updateMediaSessionPlaybackState(false);
            return;
          }
          if (isRepeatRef.current) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
          } else if (playNextRef.current) {
            playNextRef.current();
          }
          return;
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
      advancingRef.current = true;
      if (sleepEndOnTrackRef.current) {
        setSleepEndOnTrack(false);
        setIsPlaying(false);
        isPlayingRef.current = false;
        updateMediaSessionPlaybackState(false);
        advancingRef.current = false;
        return;
      }
      if (isRepeatRef.current) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        advancingRef.current = false;
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
          const fresh = await api.getStream(trackId);
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

    // ─── Visibility Change: Force-unmute & resume when tab becomes visible ─────
    // Mobile browsers (especially Chrome) can silently mute or suspend audio
    // when the tab is backgrounded.  When the user brings the tab back, we
    // force the audio element back to an audible state.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && webAudioRef.current) {
        const a = webAudioRef.current;
        a.muted = false;
        a.volume = volumeRef.current;

        // If we think we should be playing but the audio is actually paused
        // (browser suspended it), retry playback.
        if (isPlayingRef.current && a.paused && a.src) {
          a.play().then(() => {
            a.muted = false;
            a.volume = volumeRef.current;
          }).catch(() => {});
        }
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
    if (sleepSecondsLeft <= 0) {
      if (Platform.OS === "web" && webAudioRef.current) {
        webAudioRef.current.pause();
      }
      if (soundRef.current) {
        soundRef.current.pauseAsync().catch(() => {});
      }
      setIsPlaying(false);
      isPlayingRef.current = false;
      setSleepSecondsLeft(null);
      setSleepEndOnTrack(false);
      return;
    }
    const timer = setTimeout(() => {
      setSleepSecondsLeft((prev) => (prev !== null && prev > 0 ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [sleepSecondsLeft]);

  const setSleepTimerMinutes = (minutes) => {
    setSleepEndOnTrack(false);
    if (minutes === null) {
      setSleepSecondsLeft(null);
      return;
    }
    setSleepSecondsLeft(minutes * 60);
  };

  const setSleepEndOfTrackMode = () => {
    setSleepSecondsLeft(null);
    setSleepEndOnTrack(true);
  };

  const cancelSleepTimer = () => {
    setSleepSecondsLeft(null);
    setSleepEndOnTrack(false);
  };

  // ─── Smart Auto-Queue: Enriches queue with artist top hits & related artist tracks ──
  const enrichQueueForTrack = async (track, baseQueue = []) => {
    if (!track) return;
    // If user explicitly chose a playlist/album/list with multiple songs, preserve their queue intact!
    if (baseQueue && baseQueue.length > 1) return;

    const currentToken = ++enrichmentTokenRef.current;
    try {
      const trackId = track.videoId || track.video_id || track.id;
      const normTitle = (str) =>
        String(str || "")
          .toLowerCase()
          .replace(/\(.*?\)/g, "")
          .replace(/\[.*?\]/g, "")
          .replace(/feat\..*$/i, "")
          .replace(/ft\..*$/i, "")
          .trim();

      const currentTitleNorm = normTitle(track.title);

      const artists = (track.artist || track.primaryArtists || "")
        .split(/[,&•/]/)
        .map((a) => a.replace(/\(.*?\)/g, "").trim())
        .filter((a) => a.length > 1);

      const cleanArtist = artists[0] || (track.artist || track.primaryArtists || "").trim();

      const existingIds = new Set(
        (baseQueue || []).map((t) => t?.videoId || t?.video_id || t?.id).filter(Boolean)
      );
      if (trackId) existingIds.add(trackId);

      const existingTitles = new Set();
      if (currentTitleNorm) existingTitles.add(currentTitleNorm);
      (baseQueue || []).forEach((t) => {
        const nt = normTitle(t?.title);
        if (nt) existingTitles.add(nt);
      });

      // 1. Fetch official discography top hits by the primary artist
      let artistTracks = [];
      if (cleanArtist && cleanArtist.length > 1) {
        try {
          const artistSongsData = await api.getArtistSongs(cleanArtist, 0, 15);
          const rawTracks = artistSongsData?.tracks || artistSongsData?.results || [];
          artistTracks = rawTracks.filter((t) => {
            const id = t?.videoId || t?.video_id || t?.id;
            const tTitle = normTitle(t?.title);
            if (!id || existingIds.has(id)) return false;
            if (tTitle && existingTitles.has(tTitle)) return false;
            existingIds.add(id);
            if (tTitle) existingTitles.add(tTitle);
            return true;
          });
        } catch (_) {}
      }

      // 2. If artist has few hits or there's a co-artist, fetch from secondary artist or similar artists
      let relatedTracks = [];
      if (artistTracks.length < 8 && cleanArtist && cleanArtist.length > 1) {
        try {
          const secondaryArtist = artists[1];
          if (secondaryArtist && secondaryArtist.toLowerCase() !== cleanArtist.toLowerCase()) {
            const secSongsData = await api.getArtistSongs(secondaryArtist, 0, 6);
            const secRaw = secSongsData?.tracks || secSongsData?.results || [];
            for (const st of secRaw) {
              const id = st?.videoId || st?.video_id || st?.id;
              const tTitle = normTitle(st?.title);
              if (id && !existingIds.has(id) && (!tTitle || !existingTitles.has(tTitle))) {
                existingIds.add(id);
                if (tTitle) existingTitles.add(tTitle);
                relatedTracks.push(st);
              }
            }
          }

          if (artistTracks.length + relatedTracks.length < 8) {
            const relatedData = await api.getRelatedArtists(cleanArtist, 2);
            const relatedArtists = relatedData?.artists || relatedData?.related || [];
            for (const rel of relatedArtists) {
              const relName = rel?.name || rel?.artist;
              if (relName && relName.toLowerCase() !== cleanArtist.toLowerCase()) {
                const relSongsData = await api.getArtistSongs(relName, 0, 4);
                const rTracks = relSongsData?.tracks || relSongsData?.results || [];
                for (const rt of rTracks) {
                  const id = rt?.videoId || rt?.video_id || rt?.id;
                  const tTitle = normTitle(rt?.title);
                  if (id && !existingIds.has(id) && (!tTitle || !existingTitles.has(tTitle))) {
                    existingIds.add(id);
                    if (tTitle) existingTitles.add(tTitle);
                    relatedTracks.push(rt);
                  }
                }
              }
            }
          }
        } catch (_) {}
      }

      // 3. Queue only authentic artist hits & closely related tracks (No random Home feed dump!)
      const mergedRecs = [...artistTracks, ...relatedTracks].slice(0, 15);
      if (mergedRecs.length > 0) {
        if (currentToken !== enrichmentTokenRef.current) return;

        setQueue((prevQueue) => {
          if (currentToken !== enrichmentTokenRef.current) return prevQueue;
          const curId = currentTrackRef.current?.videoId || currentTrackRef.current?.video_id || currentTrackRef.current?.id;
          const targetId = track.videoId || track.video_id || track.id;
          if (curId && targetId && curId !== targetId) return prevQueue;

          const seen = new Set(prevQueue.map((t) => t?.videoId || t?.video_id || t?.id).filter(Boolean));
          const uniqueNew = mergedRecs.filter((t) => !seen.has(t?.videoId || t?.video_id || t?.id));
          if (uniqueNew.length === 0) return prevQueue;

          const updated = [...prevQueue, ...uniqueNew];
          queueRef.current = updated;
          return updated;
        });
      }
    } catch (err) {
      console.warn("[AudioContext] Smart queue enrichment notice:", err?.message);
    }
  };

  // Queue helper methods
  const addToQueue = (trackToAppend) => {
    if (!trackToAppend) return;
    setQueue((prev) => {
      const updated = [...prev, trackToAppend];
      queueRef.current = updated;
      return updated;
    });
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
            api.getStream(cleanId).then((data) => {
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
  const playTrack = async (track, newQueue = null, index = -1) => {
    if (!track) return;
    const trackId = track.videoId || track.video_id || track.id;
    if (!trackId) return;

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
      const uid = auth.currentUser?.uid || "guest";
      saveLastPlayback(uid, sanitizedTrack, newQueue || queueRef.current);
      addRecentlyPlayed(uid, sanitizedTrack);
      recordAppSongPlay(sanitizedTrack);
      recordUserStream(uid);
      updatePlaybackSession(uid, {
        deviceId: myDeviceId,
        deviceName: myDeviceName,
        trackId: sanitizedTrack.videoId,
        trackTitle: sanitizedTrack.title,
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

    const cachedStream = globalStreamCache.get(cleanId);
    if (cachedStream && cachedStream.stream_url) {
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
          const streamData = await api.getStream(cleanId);
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

    // Pre-cache next tracks in queue so future transitions are 100% synchronous
    prefetchUpcomingStreams(queueRef.current || effectiveQueue, queueIndexRef.current >= 0 ? queueIndexRef.current : targetIdx);

    // Web Playback: Direct HTML5 <audio>
    if (Platform.OS === "web") {
      try {
        if (!webAudioRef.current) {
          webAudioRef.current = new window.Audio();
          webAudioRef.current.preload = "auto";
          webAudioRef.current.crossOrigin = "anonymous";
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
      if (isPlaying) {
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
        audio.play().catch(() => {});
        setIsPlaying(true);
        isPlayingRef.current = true;
        updateMediaSessionPlaybackState(true);
        const dur = authoritativeDurationRef.current || durationMillisRef.current || 0;
        if (dur > 0) {
          updateMediaSessionPosition(positionMillisRef.current, dur, true);
        }
        updatePlaybackSession(uid, {
          deviceId: myDeviceId,
          deviceName: myDeviceName,
          trackId: currentTrack?.videoId || currentTrack?.video_id || currentTrack?.id,
          trackTitle: currentTrack?.title,
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

    const nextTrack = q[nextIdx];
    if (nextTrack) {
      setQueueIndex(nextIdx);
      queueIndexRef.current = nextIdx;
      // Reset advancingRef after playTrack completes (not on unreliable setTimeout)
      playTrack(nextTrack)
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
      addToQueue,
      removeFromQueue,
      clearQueue,
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
      errorNotice,
      volume,
      sleepSecondsLeft,
      sleepEndOnTrack,
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
  removeFromQueue: () => {},
  clearQueue: () => {},
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
