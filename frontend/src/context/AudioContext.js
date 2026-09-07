import React, { createContext, useContext, useState, useEffect, useRef, Component } from "react";
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

const AudioContext = createContext(null);

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

  // Sleep Timer state (persists across views)
  const [sleepSecondsLeft, setSleepSecondsLeft] = useState(null); // null = off, or seconds remaining
  const [sleepEndOnTrack, setSleepEndOnTrack] = useState(false);
  const sleepEndOnTrackRef = useRef(false);

  const soundRef = useRef(null);
  const isPlayingRef = useRef(false);
  const queueRef = useRef(queue);
  const queueIndexRef = useRef(queueIndex);
  const isRepeatRef = useRef(isRepeat);
  const currentTrackRef = useRef(currentTrack);
  const positionMillisRef = useRef(positionMillis);
  const durationMillisRef = useRef(durationMillis);
  const authoritativeDurationRef = useRef(0);
  const advancingRef = useRef(false);

  // Headless YouTube IFrame Player engine (zero backend / zero yt-dlp required)
  const ytPlayerRef = useRef(null);
  const ytReadyRef = useRef(false);
  const pendingTrackRef = useRef(null);
  const initYtPlayerRef = useRef(null);
  const volumeRef = useRef(0.85);
  const playNextRef = useRef(null);
  const playPreviousRef = useRef(null);

  // HTML5 <audio> element for iOS web background playback (YouTube IFrame gets killed on lock screen)
  const htmlAudioRef = useRef(null);
  // Detect iOS/iPadOS Safari — iPadOS 13+ sends "Macintosh" UA, check maxTouchPoints
  const isIOSWeb = Platform.OS === "web" && typeof navigator !== "undefined" && typeof window !== "undefined" && (
    /iPad|iPhone|iPod/.test(navigator.userAgent || "") ||
    (/Macintosh/.test(navigator.userAgent || "") && navigator.maxTouchPoints > 1)
  );

  queueRef.current = queue;
  queueIndexRef.current = queueIndex;
  isRepeatRef.current = isRepeat;
  sleepEndOnTrackRef.current = sleepEndOnTrack;
  currentTrackRef.current = currentTrack;
  positionMillisRef.current = positionMillis;
  durationMillisRef.current = durationMillis;

  // MediaSession API helper: renders high-res album banner on OS lock screens & notification panels
  const updateMediaSessionMetadata = (track) => {
    if (typeof window === "undefined" || !("mediaSession" in navigator) || !window.MediaMetadata) return;
    if (!track) return;
    try {
      const rawArt = track.artwork_url || track.thumbnail || "";
      let highRes = rawArt;
      if (rawArt) {
        if (rawArt.includes("yt3.googleusercontent.com") || rawArt.includes("yt3.ggpht.com")) {
          highRes = highRes.replace(/=s\d+[^?&]*/, "=s512").replace(/=w\d+-h\d+[^?&]*/, "=s512");
          if (!highRes.includes("=")) highRes = `${highRes}=s512`;
        } else {
          highRes = highRes
            .replace(/=w\d+-h\d+[^?&]*/, "=w800-h800-l90-rj")
            .replace(/=s\d+[^?&]*/, "=s800");
        }
        highRes = highRes
          .replace(/\/default\.jpg/, "/mqdefault.jpg")
          .replace(/\/sddefault\.jpg/, "/mqdefault.jpg");
      }

      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: track.title || "Staytup Music",
        artist: track.artist || "Unknown Artist",
        album: track.album || "Staytup Music",
        artwork: highRes
          ? [
              { src: highRes, sizes: "512x512", type: "image/jpeg" },
              { src: highRes, sizes: "384x384", type: "image/jpeg" },
              { src: highRes, sizes: "256x256", type: "image/jpeg" },
              { src: highRes, sizes: "128x128", type: "image/jpeg" },
              { src: highRes, sizes: "96x96", type: "image/jpeg" },
            ]
          : [],
      });
    } catch (e) {
      console.warn("Error updating MediaSession metadata:", e);
    }
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

  // Set up MediaSession Action Handlers for OS lock screen & notification panel
  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler("play", () => {
        if (Platform.OS === "web" && ytPlayerRef.current && ytReadyRef.current) {
          try {
            ytPlayerRef.current.playVideo();
          } catch (_) {}
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
      });

      navigator.mediaSession.setActionHandler("pause", () => {
        if (Platform.OS === "web" && ytPlayerRef.current && ytReadyRef.current) {
          try {
            ytPlayerRef.current.pauseVideo();
          } catch (_) {}
          setIsPlaying(false);
          isPlayingRef.current = false;
          updateMediaSessionPlaybackState(false);
        } else if (soundRef.current) {
          soundRef.current.pauseAsync();
          setIsPlaying(false);
          isPlayingRef.current = false;
          updateMediaSessionPlaybackState(false);
        }
      });

      navigator.mediaSession.setActionHandler("previoustrack", () => {
        if (playPreviousRef.current) playPreviousRef.current();
      });

      navigator.mediaSession.setActionHandler("nexttrack", () => {
        if (playNextRef.current) playNextRef.current();
      });

      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime !== undefined && Number.isFinite(details.seekTime)) {
          seekTo(Math.floor(details.seekTime * 1000));
        }
      });

      navigator.mediaSession.setActionHandler("seekforward", (details) => {
        const offset = (details.seekOffset || 10) * 1000;
        const dur = authoritativeDurationRef.current || durationMillisRef.current || 0;
        const target = Math.min(dur, (positionMillisRef.current || 0) + offset);
        seekTo(target);
      });

      navigator.mediaSession.setActionHandler("seekbackward", (details) => {
        const offset = (details.seekOffset || 10) * 1000;
        const target = Math.max(0, (positionMillisRef.current || 0) - offset);
        seekTo(target);
      });
    } catch (err) {
      console.warn("MediaSession action handler setup error:", err);
    }
  }, []);

    // Initialize headless YouTube IFrame Player engine for Web (client-side, 0 backend dependencies)
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || typeof window === "undefined") return;

    try {
    // 0. Create hidden HTML5 <audio> element for iOS background playback
    if (isIOSWeb) {
      if (!htmlAudioRef.current) {
        const audio = new Audio();
        audio.setAttribute("playsinline", "");
        audio.preload = "auto";
        audio.crossOrigin = "anonymous";
        audio.volume = volumeRef.current;
        audio.style.cssText = "display:none;";
        audio.addEventListener("ended", () => {
          if (isRepeatRef.current) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
          } else if (playNextRef.current && !advancingRef.current) {
            playNextRef.current();
          }
        });
        audio.addEventListener("error", (e) => {
          console.warn("[iOS Audio] HTML5 audio error:", e);
        });
        document.body.appendChild(audio);
        htmlAudioRef.current = audio;
      }
    }

    // 1. Create hidden off-screen wrapper for headless YouTube playback
    let wrapper = document.getElementById("yt-player-headless-wrapper");
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.id = "yt-player-headless-wrapper";
      wrapper.setAttribute("aria-hidden", "true");
      wrapper.style.cssText =
        "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;opacity:0;overflow:hidden;";
      const ytDiv = document.createElement("div");
      ytDiv.id = "youtube-iframe-player";
      wrapper.appendChild(ytDiv);
      document.body.appendChild(wrapper);
    }

    const initYtPlayer = (initialVid) => {
      if (!window.YT || !window.YT.Player || ytPlayerRef.current) return;
      const targetVid = initialVid || pendingTrackRef.current?.videoId || pendingTrackRef.current?.video_id || pendingTrackRef.current?.id;
      if (!targetVid) return; // Wait until an actual track is queued to instantiate YT.Player
      try {
        ytPlayerRef.current = new window.YT.Player("youtube-iframe-player", {
          height: "100%",
          width: "100%",
          videoId: targetVid,
          playerVars: {
            autoplay: 1,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            iv_load_policy: 3,
            playsinline: 1,
            enablejsapi: 1,
            origin: typeof window !== "undefined" && window.location ? window.location.origin : undefined,
          },
          events: {
            onReady: (event) => {
              ytReadyRef.current = true;
              try {
                event.target.setVolume(Math.round((volumeRef.current || 0.85) * 100));
              } catch (_) {}
              if (pendingTrackRef.current) {
                const t = pendingTrackRef.current;
                pendingTrackRef.current = null;
                const vid = t.videoId || t.video_id || t.id;
                try {
                  event.target.loadVideoById(vid);
                  event.target.playVideo();
                } catch (e) {
                  console.warn("YouTube play pending track error:", e);
                }
              }
            },
            onStateChange: (event) => {
              const state = event.data;
              if (state === 1) {
                // PLAYING
                setIsPlaying(true);
                isPlayingRef.current = true;
                setIsLoading(false);
                updateMediaSessionPlaybackState(true);
                const dur = event.target.getDuration();
                if (dur && dur > 0) {
                  const durMs = dur * 1000;
                  setDurationMillis(durMs);
                  durationMillisRef.current = durMs;
                }
              } else if (state === 2) {
                // PAUSED
                setIsPlaying(false);
                isPlayingRef.current = false;
                updateMediaSessionPlaybackState(false);
              } else if (state === 3) {
                // BUFFERING
                setIsLoading(true);
              } else if (state === 0) {
                // ENDED
                if (advancingRef.current) return;
                if (sleepEndOnTrackRef.current) {
                  setSleepEndOnTrack(false);
                  setIsPlaying(false);
                  isPlayingRef.current = false;
                  updateMediaSessionPlaybackState(false);
                  return;
                }
                if (isRepeatRef.current) {
                  try {
                    event.target.seekTo(0, true);
                    event.target.playVideo();
                  } catch (_) {}
                } else {
                  if (playNextRef.current) playNextRef.current();
                }
              }
            },
            onError: (event) => {
              // Code 2 is invalid param / unplayable video - gracefully advance to next track without spamming console
              setIsLoading(false);
              if (advancingRef.current) return;
              setTimeout(() => {
                if (playNextRef.current) playNextRef.current();
              }, 1200);
            },
          },
        });
      } catch (err) {
        console.error("Failed to instantiate YT.Player:", err);
      }
    };
    initYtPlayerRef.current = initYtPlayer;

    if (window.YT && window.YT.Player) {
      initYtPlayer();
    } else {
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prevCallback === "function") prevCallback();
        initYtPlayer();
      };
      const existingTag = document.getElementById("yt-iframe-api-script");
      if (!existingTag) {
        const tag = document.createElement("script");
        tag.id = "yt-iframe-api-script";
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName("script")[0];
        firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
      }
    }
    } catch (e) {
      console.warn("[AudioContext] Web init error:", e);
    }
  }, []);

  // Polling loop for playback time and duration on Web
  useEffect(() => {
    if (Platform.OS !== "web") return;

    const interval = setInterval(() => {
      // iOS: poll HTML5 <audio> element
      if (isIOSWeb && htmlAudioRef.current && isPlayingRef.current) {
        try {
          const audio = htmlAudioRef.current;
          const sec = audio.currentTime;
          const dur = audio.duration;
          if (typeof sec === "number" && !isNaN(sec)) {
            const posMs = Math.max(0, sec * 1000);
            if (Math.abs(posMs - positionMillisRef.current) >= 100) {
              positionMillisRef.current = posMs;
              setPositionMillis(posMs);
            }
          }
          if (typeof dur === "number" && dur > 0 && !isNaN(dur)) {
            const durMs = dur * 1000;
            if (Math.abs(durMs - durationMillisRef.current) >= 500) {
              durationMillisRef.current = durMs;
              setDurationMillis(durMs);
            }
            if (sec > 0 && dur > 5 && sec >= dur - 0.75 && !advancingRef.current) {
              if (isRepeatRef.current) {
                audio.currentTime = 0;
                audio.play().catch(() => {});
              } else {
                if (playNextRef.current) playNextRef.current();
              }
            }
          }
          const effectiveDur = durationMillisRef.current || (dur ? dur * 1000 : 0);
          updateMediaSessionPosition(positionMillisRef.current, effectiveDur);
        } catch (_) {}
      }

      // Non-iOS: poll YouTube IFrame
      if (!isIOSWeb && ytPlayerRef.current && ytReadyRef.current && isPlayingRef.current) {
        try {
          const sec = ytPlayerRef.current.getCurrentTime();
          const dur = ytPlayerRef.current.getDuration();
          if (typeof sec === "number" && !isNaN(sec)) {
            const posMs = Math.max(0, sec * 1000);
            // Only trigger re-render when position changes by ≥100ms to avoid render loops
            if (Math.abs(posMs - positionMillisRef.current) >= 100) {
              positionMillisRef.current = posMs;
              setPositionMillis(posMs);
            }
          }
          if (typeof dur === "number" && dur > 0 && !isNaN(dur)) {
            const durMs = dur * 1000;
            if (Math.abs(durMs - durationMillisRef.current) >= 500) {
              durationMillisRef.current = durMs;
              setDurationMillis(durMs);
            }
            if (sec > 0 && dur > 5 && sec >= dur - 0.75 && !advancingRef.current) {
              if (isRepeatRef.current) {
                ytPlayerRef.current.seekTo(0, true);
                ytPlayerRef.current.playVideo();
              } else {
                if (playNextRef.current) playNextRef.current();
              }
            }
          }
          const effectiveDur = durationMillisRef.current || (dur ? dur * 1000 : 0);
          updateMediaSessionPosition(positionMillisRef.current, effectiveDur);
        } catch (_) {}
      }
    }, 250);

    return () => clearInterval(interval);
  }, []);


  // Initialize background audio mode
  useEffect(() => {
    async function configureAudio() {
      // expo-av setAudioModeAsync is native-only; skip on web to avoid crashes on iOS Safari
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
      // Cleanup HTML5 <audio> element on unmount
      if (htmlAudioRef.current) {
        htmlAudioRef.current.pause();
        htmlAudioRef.current.src = "";
        htmlAudioRef.current.load();
        if (htmlAudioRef.current.parentNode) {
          htmlAudioRef.current.parentNode.removeChild(htmlAudioRef.current);
        }
        htmlAudioRef.current = null;
      }
    };
  }, []);

  // Restore last played track and queue from Firebase Realtime Database
  // and enforce single-device playback per account
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
          if (track && (track.videoId || track.video_id) && !currentTrackRef.current) {
            setCurrentTrack(track);
            currentTrackRef.current = track;
            let initDurationMs = 0;
            if (track.duration_seconds && Number.isFinite(Number(track.duration_seconds)) && Number(track.duration_seconds) > 0) {
              const s = Number(track.duration_seconds);
              initDurationMs = s > 10000 ? s : s * 1000;
            } else if (typeof track.duration === "string" && track.duration.includes(":")) {
              const parts = track.duration.split(":").map(Number);
              if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                initDurationMs = (parts[0] * 60 + parts[1]) * 1000;
              } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
                initDurationMs = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
              }
            }
            if (initDurationMs > 0 && initDurationMs < 86400000) {
              authoritativeDurationRef.current = initDurationMs;
              durationMillisRef.current = initDurationMs;
              setDurationMillis(initDurationMs);
            }
            updateMediaSessionMetadata(track);
            if (Array.isArray(playbackData.queue) && playbackData.queue.length > 0) {
              setQueue(playbackData.queue);
              const idx = playbackData.queue.findIndex((t) => (t.videoId || t.video_id) === (track.videoId || track.video_id));
              setQueueIndex(idx >= 0 ? idx : 0);
            }
          }
        }
      } catch (err) {
        console.warn("Error restoring last played track from Firebase:", err);
      }

      // 2. Single-device playback listener:
      // If another device under the same account starts playing, immediately pause playback here
      if (firebaseUser) {
        unsubscribePlayback = subscribePlaybackSession(firebaseUser.uid, (session) => {
          if (
            session &&
            session.isPlaying === true &&
            session.deviceId &&
            session.deviceId !== myDeviceId
          ) {
            if (isPlayingRef.current) {
              if (Platform.OS === "web" && ytPlayerRef.current && ytReadyRef.current) {
                try {
                  ytPlayerRef.current.pauseVideo();
                } catch (_) {}
              }
              soundRef.current?.pauseAsync().catch(() => {});
              setIsPlaying(false);
              isPlayingRef.current = false;
              updateMediaSessionPlaybackState(false);
              setErrorNotice("Playback paused — your account is playing on another device.");
            }
          }
        });
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribePlayback) unsubscribePlayback();
    };
  }, []);

  // Pre-fetch next track's stream URL in background so skipping/advancing is instant (debounced 3.5s)
  useEffect(() => {
    if (Platform.OS === 'web') return; // Web uses Headless YouTube IFrame, avoid redundant backend stream calls
    if (queue && queueIndex >= 0 && queueIndex + 1 < queue.length && isPlaying) {
      const nextTrack = queue[queueIndex + 1];
      const nextVid = nextTrack?.videoId || nextTrack?.video_id;
      if (nextVid) {
        const timer = setTimeout(() => {
          api.getStream(nextVid).catch(() => {});
        }, 3500);
        return () => clearTimeout(timer);
      }
    }
  }, [queueIndex, currentTrack?.videoId, isPlaying]);

  // Update playback status handler
  const onPlaybackStatusUpdate = (status) => {
    if (!status.isLoaded) {
      if (status.error) {
        console.error(`Audio playback error: ${status.error}`);
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

    // Rock-solid duration handling:
    // When authoritative duration is already known from metadata or yt-dlp, NEVER overwrite it.
    // HTML5 / WebM decoders frequently miscalculate VBR streams and report doubled or inflated durations.
    if (
      (!authoritativeDurationRef.current || authoritativeDurationRef.current <= 0) &&
      status.durationMillis &&
      Number.isFinite(status.durationMillis) &&
      status.durationMillis > 0 &&
      status.durationMillis < 86400000
    ) {
      authoritativeDurationRef.current = status.durationMillis;
      durationMillisRef.current = status.durationMillis;
      setDurationMillis(status.durationMillis);
    }

    // Keep OS lock screen progress bar in sync
    const effectiveDur = authoritativeDurationRef.current || durationMillisRef.current || 0;
    updateMediaSessionPosition(pos, effectiveDur);

    // Song ended
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

  // Sleep timer interval countdown
  useEffect(() => {
    if (sleepSecondsLeft === null) return;
    if (sleepSecondsLeft <= 0) {
      if (Platform.OS === "web" && ytPlayerRef.current && ytReadyRef.current) {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch (_) {}
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

  // Play a specific track
  const playTrack = async (track, newQueue = null, index = -1) => {
    if (!track || !(track.videoId || track.video_id || track.id)) return;

    setIsLoading(true);
    setErrorNotice(null);
    setCurrentTrack(track);
    currentTrackRef.current = track;
    setPositionMillis(0);
    positionMillisRef.current = 0;

    // Immediately set duration if available from track data (safely handling s vs ms)
    let initDurationMs = 0;
    if (track.duration_seconds && Number.isFinite(Number(track.duration_seconds)) && Number(track.duration_seconds) > 0) {
      const s = Number(track.duration_seconds);
      initDurationMs = s > 10000 ? s : s * 1000;
    } else if (typeof track.duration === "string" && track.duration.includes(":")) {
      const parts = track.duration.split(":").map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        initDurationMs = (parts[0] * 60 + parts[1]) * 1000;
      } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        initDurationMs = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
      }
    }
    if (initDurationMs > 0 && initDurationMs < 86400000) {
      authoritativeDurationRef.current = initDurationMs;
      durationMillisRef.current = initDurationMs;
      setDurationMillis(initDurationMs);
    } else {
      authoritativeDurationRef.current = 0;
    }

    // Set lock screen album banner immediately!
    updateMediaSessionMetadata(track);
    updateMediaSessionPlaybackState(true);
    updateMediaSessionPosition(0, initDurationMs);

    if (newQueue) {
      setQueue(newQueue);
      setQueueIndex(index >= 0 ? index : 0);
    }

    // Persist current track & queue to Firebase Realtime Database, record Recently Played, and update active playback session
    try {
      const uid = auth.currentUser?.uid || "guest";
      saveLastPlayback(uid, track, newQueue || queueRef.current);
      addRecentlyPlayed(uid, track);
      recordAppSongPlay(track);
      updatePlaybackSession(uid, {
        deviceId: myDeviceId,
        trackId: track.videoId || track.video_id,
        trackTitle: track.title,
        isPlaying: true,
      });
    } catch (_) {}

    try {
      // 1. Unload existing sound
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      // Pause existing HTML5 audio for iOS
      if (isIOSWeb && htmlAudioRef.current) {
        htmlAudioRef.current.pause();
        htmlAudioRef.current.removeAttribute("src");
        htmlAudioRef.current.load();
      }

      // 2. Play via Headless YouTube Engine on Web (Zero backend stream extraction needed)
      const vid = track.videoId || track.video_id || track.id;
      if (!vid) {
        throw new Error("Missing videoId for track");
      }

      if (Platform.OS === "web") {
        setIsLoading(true);
        setErrorNotice(null);

        // iOS: use HTML5 <audio> element (YouTube IFrame gets killed on lock screen)
        if (isIOSWeb) {
          try {
            const streamData = await api.getStream(vid);
            const streamUrl = streamData?.stream_url || streamData?.proxy_url;
            if (!streamUrl) throw new Error("No stream URL available");

            // Authoritative duration from backend
            const streamSec = Number(streamData.duration || 0);
            if (streamSec > 0 && Number.isFinite(streamSec) && streamSec < 86400) {
              const streamMs = streamSec > 10000 ? streamSec : streamSec * 1000;
              authoritativeDurationRef.current = streamMs;
              durationMillisRef.current = streamMs;
              setDurationMillis(streamMs);
              track.duration_seconds = Math.floor(streamMs / 1000);
              if (!track.duration) {
                const m = Math.floor(streamSec / 60);
                const s = streamSec % 60;
                track.duration = `${m}:${s < 10 ? "0" : ""}${s}`;
              }
            }

            const audio = htmlAudioRef.current;
            if (!audio) throw new Error("HTML5 audio element not initialized");

            audio.src = streamUrl;
            audio.load();
            await audio.play();

            // Update MediaSession metadata for lock screen banner
            updateMediaSessionMetadata(track);
            updateMediaSessionPlaybackState(true);
            updateMediaSessionPosition(0, authoritativeDurationRef.current);

            setIsPlaying(true);
            isPlayingRef.current = true;
            setIsLoading(false);
            return;
          } catch (e) {
            console.warn("[AudioContext] iOS HTML5 audio error:", e);
            setIsLoading(false);
            setErrorNotice("Playback error on iOS. Trying next track...");
            setTimeout(() => { if (playNextRef.current) playNextRef.current(); }, 1200);
            return;
          }
        }

        // Non-iOS: use YouTube IFrame player
        if (ytPlayerRef.current && ytReadyRef.current) {
          try {
            ytPlayerRef.current.loadVideoById(vid);
            ytPlayerRef.current.playVideo();
            setIsPlaying(true);
            isPlayingRef.current = true;
            setIsLoading(false);
            updateMediaSessionPlaybackState(true);
            return;
          } catch (e) {
            console.warn("[AudioContext] YouTube loadVideoById error:", e);
            try {
              ytPlayerRef.current.cueVideoById(vid);
              ytPlayerRef.current.playVideo();
            } catch (_) {}
            return;
          }
        } else {
          pendingTrackRef.current = track;
          if (initYtPlayerRef.current) {
            initYtPlayerRef.current(vid);
          }
          return;
        }
      }

      // Fallback for native: Fetch direct playable stream URL from our backend with auto-retry
      let streamData = null;
      try {
        streamData = await api.getStream(vid);
      } catch (firstErr) {
        console.warn(`[AudioContext] Primary stream fetch failed (${firstErr.message}), retrying in 1.2s...`);
        await new Promise((resolve) => setTimeout(resolve, 1200));
        streamData = await api.getStream(vid);
      }

      if (!streamData || (!streamData.stream_url && !streamData.proxy_url)) {
        throw new Error("Unable to retrieve audio stream URL");
      }

      const isWeb = Platform.OS === "web";
      const primaryUrl = (isWeb && streamData.proxy_url) ? streamData.proxy_url : (streamData.stream_url || streamData.proxy_url);
      const fallbackProxyUrl = streamData.proxy_url || streamData.stream_url;

      // Authoritative duration from backend yt-dlp
      const streamSec = Number(streamData.duration || 0);
      if (streamSec > 0 && Number.isFinite(streamSec) && streamSec < 86400) {
        const streamMs = streamSec > 10000 ? streamSec : streamSec * 1000;
        authoritativeDurationRef.current = streamMs;
        durationMillisRef.current = streamMs;
        setDurationMillis(streamMs);
        track.duration_seconds = Math.floor(streamMs / 1000);
        if (!track.duration) {
          const m = Math.floor(streamSec / 60);
          const s = streamSec % 60;
          track.duration = `${m}:${s < 10 ? "0" : ""}${s}`;
        }
        updateMediaSessionPosition(positionMillisRef.current || 0, streamMs);
      }

      // 3. Load and play sound via expo-av (with resilient multi-candidate fallback)
      const candidateUrls = [
        primaryUrl,
        streamData.stream_url,
        streamData.proxy_url,
      ].filter(Boolean);
      const uniqueCandidates = [...new Set(candidateUrls)];

      let soundInstance = null;
      let lastErr = null;
      for (const candidateUri of uniqueCandidates) {
        try {
          const { sound } = await Audio.Sound.createAsync(
            { uri: candidateUri },
            { shouldPlay: true, progressUpdateIntervalMillis: 500 },
            onPlaybackStatusUpdate
          );
          soundInstance = sound;
          break;
        } catch (err) {
          lastErr = err;
          console.warn(`[AudioContext] Candidate URL failed (${candidateUri}):`, err.message);
        }
      }

      if (!soundInstance) {
        throw lastErr || new Error("Failed to load audio from any candidate stream URL");
      }

      soundRef.current = soundInstance;
      setIsPlaying(true);
      isPlayingRef.current = true;
      setIsLoading(false);
      updateMediaSessionPlaybackState(true);

      // 4. Record play event to backend SQLite for taste adaptation
      api.recordPlayEvent({
        video_id: track.videoId,
        title: track.title,
        artist: track.artist,
        album: track.album || "",
        artwork_url: track.artwork_url || "",
        duration_seconds: Math.floor((streamData.duration || track.duration_seconds || 0)),
      }).catch((e) => console.warn("Could not log play event:", e.message));

    } catch (err) {
      console.error("Failed to play track:", err);
      setIsLoading(false);
      setErrorNotice(`Could not play "${track.title}".`);
    }
  };

  // Toggle Play / Pause
  const togglePlayPause = async () => {
    // iOS: HTML5 <audio> element
    if (isIOSWeb && htmlAudioRef.current) {
      try {
        const uid = auth.currentUser?.uid || "guest";
        if (isPlaying) {
          htmlAudioRef.current.pause();
          setIsPlaying(false);
          isPlayingRef.current = false;
          updateMediaSessionPlaybackState(false);
          updatePlaybackSession(uid, { deviceId: myDeviceId, isPlaying: false });
        } else {
          htmlAudioRef.current.play().catch(() => {});
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
        console.warn("iOS toggle play error:", err);
      }
      return;
    }

    // Non-iOS Web: YouTube IFrame player
    if (Platform.OS === "web" && ytPlayerRef.current && ytReadyRef.current) {
      try {
        const uid = auth.currentUser?.uid || "guest";
        if (isPlaying) {
          try {
            ytPlayerRef.current.pauseVideo();
          } catch (_) {}
          setIsPlaying(false);
          isPlayingRef.current = false;
          updateMediaSessionPlaybackState(false);
          updatePlaybackSession(uid, {
            deviceId: myDeviceId,
            isPlaying: false,
          });
        } else {
          try {
            ytPlayerRef.current.playVideo();
          } catch (_) {}
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
      return;
    }

    if (!soundRef.current) {
      if (currentTrack) {
        playTrack(currentTrack);
      }
      return;
    }

    try {
      const uid = auth.currentUser?.uid || "guest";
      if (isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
        isPlayingRef.current = false;
        updateMediaSessionPlaybackState(false);
        updatePlaybackSession(uid, {
          deviceId: myDeviceId,
          isPlaying: false,
        });
      } else {
        await soundRef.current.playAsync();
        setIsPlaying(true);
        isPlayingRef.current = true;
        updateMediaSessionPlaybackState(true);
        updatePlaybackSession(uid, {
          deviceId: myDeviceId,
          trackId: currentTrack?.videoId || currentTrack?.video_id,
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

    // iOS: HTML5 <audio> element
    if (isIOSWeb && htmlAudioRef.current) {
      try {
        htmlAudioRef.current.currentTime = clamped / 1000;
        setPositionMillis(clamped);
        positionMillisRef.current = clamped;
        updateMediaSessionPosition(clamped, dur);
      } catch (err) {
        console.warn("iOS seek error:", err);
      }
      return;
    }

    // Non-iOS Web: YouTube IFrame
    if (Platform.OS === "web" && ytPlayerRef.current && ytReadyRef.current) {
      try {
        ytPlayerRef.current.seekTo(clamped / 1000, true);
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
    let nextIdx = queueIndexRef.current + 1;

    if (nextIdx >= q.length) {
      // Loop back to start if repeat is enabled or stop
      if (q.length > 0) {
        nextIdx = 0;
      } else {
        return;
      }
    }

    const nextTrack = q[nextIdx];
    if (nextTrack) {
      setQueueIndex(nextIdx);
      playTrack(nextTrack);
    }
  };
  playNextRef.current = playNext;

  // Play Previous Track
  const playPrevious = () => {
    if (positionMillis > 3000) {
      // If played more than 3 seconds, replay track from beginning
      seekTo(0);
      return;
    }

    const q = queueRef.current;
    let prevIdx = queueIndexRef.current - 1;

    if (prevIdx < 0) {
      prevIdx = Math.max(0, q.length - 1);
    }

    const prevTrack = q[prevIdx];
    if (prevTrack) {
      setQueueIndex(prevIdx);
      playTrack(prevTrack);
    }
  };
  playPreviousRef.current = playPrevious;

  // Toggle Repeat
  const toggleRepeat = () => {
    setIsRepeat((prev) => !prev);
  };

  // Toggle Shuffle
  const toggleShuffle = () => {
    setIsShuffle((prev) => !prev);
  };

  // Volume Control with RAF throttling for 60fps smooth dragging
  const [volume, setVolumeState] = useState(0.85);
  const volumeRafRef = useRef(null);

  const setVolume = (newVol) => {
    const clamped = Math.max(0, Math.min(1, newVol));
    setVolumeState(clamped);
    volumeRef.current = clamped;

    // iOS: HTML5 <audio> element
    if (isIOSWeb && htmlAudioRef.current) {
      htmlAudioRef.current.volume = clamped;
    }

    if (Platform.OS === "web" && ytPlayerRef.current && ytReadyRef.current) {
      try {
        ytPlayerRef.current.setVolume(Math.round(clamped * 100));
      } catch (e) {
        console.warn("setVolume error:", e);
      }
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

// Wrap AudioProvider in a class error boundary so provider-level crashes
// never take down the entire app tree
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
