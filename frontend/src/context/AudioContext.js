import React, { createContext, useContext, useState, useEffect, useRef, useCallback, Component } from "react";
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
} from "../services/firebase";

let LockScreenControls = null;
try {
  if (Platform.OS !== "web") {
    LockScreenControls = require("../../modules/lock-screen-controls/src/index").default;
  }
} catch (_) {}

const AudioContext = createContext(null);

export function fisherYatesShuffle(arr) {
  if (!Array.isArray(arr)) return [];
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const AudioProvider = ({ children }) => {
  const myDeviceId = getOrCreateDeviceId();
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

  const playNextRef = useRef(null);
  const playPreviousRef = useRef(null);

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
      play: () => {
        if (Platform.OS === "web" && webAudioRef.current) {
          webAudioRef.current.play().catch(() => {});
          setIsPlaying(true);
          isPlayingRef.current = true;
          updateMediaSessionPlaybackState(true);
        } else if (soundRef.current) {
          soundRef.current.playAsync();
          setIsPlaying(true);
          isPlayingRef.current = true;
          updateMediaSessionPlaybackState(true);
        } else if (currentTrackRef.current) {
          playTrack(currentTrackRef.current);
        }
      },
      pause: () => {
        if (Platform.OS === "web" && webAudioRef.current) {
          webAudioRef.current.pause();
          setIsPlaying(false);
          isPlayingRef.current = false;
          updateMediaSessionPlaybackState(false);
        } else if (soundRef.current) {
          soundRef.current.pauseAsync();
          setIsPlaying(false);
          isPlayingRef.current = false;
          updateMediaSessionPlaybackState(false);
        }
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
        console.warn(`MediaSession setActionHandler("${action}") not supported:`, err.message);
      }
    }
  }, []);

  const updateMediaSessionMetadata = (track) => {
    if (typeof window === "undefined" || !("mediaSession" in navigator) || !window.MediaMetadata) return;
    if (!track) return;
    try {
      const art = track.artwork_url || track.thumbnail || "";
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: track.title || "Staytup Music",
        artist: track.artist || "Unknown Artist",
        album: track.album || "Staytup Music",
        artwork: art
          ? [
              { src: art, sizes: "512x512", type: "image/jpeg" },
              { src: art, sizes: "256x256", type: "image/jpeg" },
              { src: art, sizes: "128x128", type: "image/jpeg" },
            ]
          : [],
      });
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

  const updateMediaSessionPosition = (posMs, durMs) => {
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
        navigator.mediaSession.setPositionState({
          duration: durSec,
          playbackRate: 1.0,
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
    audio.volume = volumeRef.current;
    webAudioRef.current = audio;

    const onPlay = () => {
      setIsPlaying(true);
      isPlayingRef.current = true;
      setIsLoading(false);
      updateMediaSessionPlaybackState(true);
    };

    const onPause = () => {
      setIsPlaying(false);
      isPlayingRef.current = false;
      updateMediaSessionPlaybackState(false);
    };

    const onWaiting = () => {
      setIsLoading(true);
    };

    const onPlaying = () => {
      setIsLoading(false);
    };

    const onTimeUpdate = () => {
      if (!audio) return;
      const curSec = audio.currentTime || 0;
      const durSec = audio.duration || 0;
      const curMs = Math.round(curSec * 1000);
      setPositionMillis(curMs);
      positionMillisRef.current = curMs;

      if (durSec && Number.isFinite(durSec) && durSec > 0) {
        const durMs = Math.round(durSec * 1000);
        if (Math.abs(durMs - (durationMillisRef.current || 0)) > 1000) {
          setDurationMillis(durMs);
          durationMillisRef.current = durMs;
        }
        updateMediaSessionPosition(curMs, durMs);
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
      console.warn("[AudioContext] Web audio error:", e);
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

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.pause();
      audio.src = "";
    };
  }, []);

  // ─── MediaSession Action Handlers ──────────────────────────────────────────
  useEffect(() => {
    setupMediaSessionHandlers();
  }, [setupMediaSessionHandlers]);

  // ─── Native Lock Screen Next/Previous (iOS & Android) ─────────────────────
  useEffect(() => {
    if (Platform.OS === "web" || !LockScreenControls) return;

    let subNext = null;
    let subPrev = null;

    try {
      subNext = LockScreenControls.addListener("onNextTrack", () => {
        if (playNextRef.current) playNextRef.current();
      });
      subPrev = LockScreenControls.addListener("onPreviousTrack", () => {
        if (playPreviousRef.current) playPreviousRef.current();
      });
    } catch (err) {
      console.warn("Lock screen controls setup error:", err);
    }

    return () => {
      subNext?.remove?.();
      subPrev?.remove?.();
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
            setErrorNotice("Playback paused — active on another device");
            setTimeout(() => setErrorNotice(null), 4000);
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
        playNext();
      }
      return;
    }

    setIsPlaying(status.isPlaying);
    isPlayingRef.current = status.isPlaying;
    updateMediaSessionPlaybackState(status.isPlaying);

    const pos = Number.isFinite(status.positionMillis) ? Math.max(0, status.positionMillis) : 0;
    setPositionMillis(pos);
    positionMillisRef.current = pos;

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
    updateMediaSessionPosition(pos, effectiveDur);

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
        playNext();
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

  // ─── Play a specific track (JioSaavn Direct Audio Stream) ───────────────────
  const playTrack = async (track, newQueue = null, index = -1) => {
    if (!track) return;
    const trackId = track.videoId || track.video_id || track.id;
    if (!trackId) return;

    audioRetryCountRef.current = 0;
    setIsLoading(true);
    setErrorNotice(null);
    setCurrentTrack(track);
    currentTrackRef.current = track;
    setPositionMillis(0);
    positionMillisRef.current = 0;

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

    updateMediaSessionMetadata(track);
    updateMediaSessionPlaybackState(true);
    updateMediaSessionPosition(0, initDurationMs);

    if (newQueue && Array.isArray(newQueue) && newQueue.length > 0) {
      originalQueueRef.current = [...newQueue];
      if (isShuffleRef.current && newQueue.length > 1) {
        const cId = track.videoId || track.video_id || track.id;
        const others = newQueue.filter((t, idx) => {
          const tId = t?.videoId || t?.video_id || t?.id;
          return tId && cId ? tId !== cId : idx !== index;
        });
        const shuffledQueue = [track, ...fisherYatesShuffle(others)];
        setQueue(shuffledQueue);
        queueRef.current = shuffledQueue;
        setQueueIndex(0);
        queueIndexRef.current = 0;
      } else {
        setQueue(newQueue);
        queueRef.current = newQueue;
        const targetIdx = index >= 0 ? index : 0;
        setQueueIndex(targetIdx);
        queueIndexRef.current = targetIdx;
      }
    }

    // Persist current track & queue to Firebase Realtime Database
    // Strictly store metadata only — NEVER save stream_url to Firebase!
    try {
      const uid = auth.currentUser?.uid || "guest";
      const sanitizedTrack = {
        id: track.id || `saavn_${trackId}`,
        videoId: String(trackId).replace(/^saavn_/, ""),
        title: track.title || "",
        artist: track.artist || "",
        artwork_url: track.artwork_url || track.thumbnail || "",
        thumbnail: track.thumbnail || track.artwork_url || "",
        duration: track.duration || 0,
        duration_seconds: track.duration_seconds || track.duration || 0,
        source: "saavn",
      };
      saveLastPlayback(uid, sanitizedTrack, newQueue || queueRef.current);
      addRecentlyPlayed(uid, sanitizedTrack);
      recordAppSongPlay(sanitizedTrack);
      updatePlaybackSession(uid, {
        deviceId: myDeviceId,
        trackId: sanitizedTrack.videoId,
        trackTitle: sanitizedTrack.title,
        isPlaying: true,
      });
    } catch (_) {}

    // Resolve fresh stream URL from JioSaavn backend endpoint
    let playableUrl = track.stream_url;
    if (!playableUrl || track.source === "saavn" || String(track.id).startsWith("saavn_")) {
      try {
        const streamData = await api.getStream(trackId);
        if (streamData && streamData.stream_url) {
          playableUrl = streamData.stream_url;
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
        setTimeout(() => { if (playNextRef.current) playNextRef.current(); }, 1200);
        return;
      }
    }

    if (!playableUrl) {
      setErrorNotice("Stream URL unavailable.");
      setIsLoading(false);
      return;
    }

    // Web Playback: Direct HTML5 <audio>
    if (Platform.OS === "web") {
      try {
        if (!webAudioRef.current) {
          webAudioRef.current = new window.Audio();
        }
        const audio = webAudioRef.current;
        audio.src = playableUrl;
        audio.load();
        audio.volume = volumeRef.current;
        await audio.play();
        setIsPlaying(true);
        isPlayingRef.current = true;
        setIsLoading(false);
        updateMediaSessionPlaybackState(true);
      } catch (e) {
        console.warn("[AudioContext] Web play error:", e);
        setIsLoading(false);
      }
      return;
    }

    // Native Playback: expo-av Audio.Sound
    try {
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
    } catch (err) {
      console.error("[AudioContext] Native playback error:", err);
      setErrorNotice("Playback error occurred.");
      setIsLoading(false);
    }
  };

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
        updatePlaybackSession(uid, { deviceId: myDeviceId, isPlaying: false });
      } else {
        if (!audio.src && currentTrack) {
          playTrack(currentTrack);
          return;
        }
        audio.play().catch(() => {});
        setIsPlaying(true);
        isPlayingRef.current = true;
        updateMediaSessionPlaybackState(true);
        updatePlaybackSession(uid, {
          deviceId: myDeviceId,
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
        updatePlaybackSession(uid, { deviceId: myDeviceId, isPlaying: false });
      } else {
        await soundRef.current.playAsync();
        setIsPlaying(true);
        isPlayingRef.current = true;
        updateMediaSessionPlaybackState(true);
        updatePlaybackSession(uid, {
          deviceId: myDeviceId,
          trackId: currentTrack?.videoId || currentTrack?.video_id || currentTrack?.id,
          trackTitle: currentTrack?.title,
          isPlaying: true,
        });
      }
    } catch (err) {
      console.warn("Toggle play error:", err);
    }
  };

  // Seek to position
  const seekTo = async (posMillis) => {
    const dur = authoritativeDurationRef.current || durationMillisRef.current || 0;
    const clamped = dur > 0 ? Math.max(0, Math.min(posMillis, dur)) : Math.max(0, posMillis);

    if (Platform.OS === "web" && webAudioRef.current) {
      try {
        webAudioRef.current.currentTime = clamped / 1000;
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
    setTimeout(() => { advancingRef.current = false; }, 800);

    const q = queueRef.current;
    if (!q || q.length === 0) return;

    let nextIdx = queueIndexRef.current + 1;

    if (nextIdx >= q.length) {
      if (isRepeatRef.current) {
        nextIdx = 0;
      } else {
        setIsPlaying(false);
        isPlayingRef.current = false;
        updateMediaSessionPlaybackState(false);
        return;
      }
    }

    const nextTrack = q[nextIdx];
    if (nextTrack) {
      setQueueIndex(nextIdx);
      queueIndexRef.current = nextIdx;
      playTrack(nextTrack);
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
    setIsRepeat((prev) => !prev);
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

  return (
    <AudioContext.Provider
      value={{
        currentTrack,
        isPlaying,
        isLoading,
        positionMillis,
        durationMillis: authoritativeDurationRef.current || durationMillisRef.current || durationMillis,
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
      }}
    >
      {children}
    </AudioContext.Provider>
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
        <AudioContext.Provider value={defaultAudioContext}>
          {this.props.children}
        </AudioContext.Provider>
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
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  return context || defaultAudioContext;
};

export { AudioProviderSafe as AudioProvider };
