import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Platform,
  Animated,
  Easing,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Header from "../components/Header";
import SectionList from "../components/SectionList";
import SongCard from "../components/SongCard";
import ArtistModal from "../components/ArtistModal";
import { colors, fonts } from "../theme/colors";
import { api } from "../api/client";
import { useAudioPlayback } from "../context/AudioContext";
import { useResponsive } from "../context/ResponsiveContext";
import { useUser } from "../context/UserContext";
import { resolveLocalArtistImage } from "../theme/artistImages";
import {
  auth,
  getTrendingFeedRTDB,
  saveTrendingFeedRTDB,
  subscribeTrendingFeedRTDB,
  getRecentlyPlayed,
  subscribeRecentlyPlayed,
  getAppTrendingTracksRTDB,
  subscribeAppTrendingRTDB,
  subscribeFriendActivity,
} from "../services/firebase";
import { getHighResArtwork } from "../utils/imageUtils";

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function cleanTitle(title) {
  if (!title) return "";
  return title
    .replace(/\s*[\(\[]\s*(official\s*(video|audio|music\s*video|lyric\s*video|mv)|lyric\s*video|audio|hd|4k|lyrics|ft\.?.*?|feat\.?.*?)\s*[\)\]]/gi, "")
    .replace(/\s*[\(\[]\s*\d{4}\s*[\)\]]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function getSongDuration(song) {
  if (
    song?.duration &&
    typeof song.duration === "string" &&
    song.duration.includes(":") &&
    !song.duration.toLowerCase().includes("infinity") &&
    !song.duration.toLowerCase().includes("nan")
  ) {
    return song.duration;
  }
  const s = Number(song?.duration_seconds || 0);
  if (s > 0 && Number.isFinite(s) && s < 86400) {
    const totalSec = s > 10000 ? Math.floor(s / 1000) : Math.floor(s);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  }
  return "";
}

function seededShuffle(arr, seed) {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getDaySeed() {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

function UserAvatar({ user, size = 44, fontSize = 15, style }) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [user?.avatar, user?.photoURL, user?.avatarUrl]);

  const username = user?.username || user?.displayName || user?.name || "Friend";
  const initial = (username[0] || "U").toUpperCase();
  const bgColor = user?.avatarColor || colors.primary;
  const avatar = user?.avatar;

  // Memoji local asset
  if (avatar && avatar.startsWith("memoji_")) {
    const memojiMap = {
      memoji_0: require("../../assets/memoji/pastel_0.jpg"),
      memoji_1: require("../../assets/memoji/pastel_1.jpg"),
      memoji_2: require("../../assets/memoji/pastel_2.jpg"),
      memoji_3: require("../../assets/memoji/pastel_3.jpg"),
      memoji_4: require("../../assets/memoji/pastel_4.jpg"),
      memoji_5: require("../../assets/memoji/pastel_5.jpg"),
      memoji_6: require("../../assets/memoji/pastel_6.jpg"),
      memoji_7: require("../../assets/memoji/pastel_7.jpg"),
      memoji_8: require("../../assets/memoji/pastel_8.jpg"),
      memoji_9: require("../../assets/memoji/pastel_9.jpg"),
    };
    const src = memojiMap[avatar];
    if (src) {
      return (
        <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: "hidden" }, style]}>
          <Image source={src} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        </View>
      );
    }
  }

  // HTTP URL (not google)
  const candidateUri =
    (avatar && typeof avatar === "string" && avatar.startsWith("http") && !avatar.includes("googleusercontent.com"))
      ? avatar
      : (user?.avatarUrl && typeof user.avatarUrl === "string" && user.avatarUrl.startsWith("http"))
      ? user.avatarUrl
      : (user?.photoURL && typeof user.photoURL === "string" && user.photoURL.startsWith("http") && !user.photoURL.includes("googleusercontent.com"))
      ? user.photoURL
      : null;

  if (candidateUri && !imgError) {
    return (
      <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor, overflow: "hidden" }, style]}>
        <Image source={{ uri: candidateUri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" onError={() => setImgError(true)} />
      </View>
    );
  }

  // Monogram initial
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor, alignItems: "center", justifyContent: "center" }, style]}>
      <Text style={{ fontFamily: fonts.bold, fontSize, color: "#000000" }}>{initial}</Text>
    </View>
  );
}

function HomeSkeleton() {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.6,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  return (
    <View style={styles.skeletonWrap}>
      <View style={styles.skeletonHeader}>
        <Animated.View style={[styles.skeletonPill, { opacity: pulseAnim, width: 100 }]} />
        <Animated.View style={[styles.skeletonPill, { opacity: pulseAnim, width: 80 }]} />
        <Animated.View style={[styles.skeletonPill, { opacity: pulseAnim, width: 90 }]} />
      </View>
      {[1, 2, 3].map((s) => (
        <View key={s} style={styles.skeletonSection}>
          <Animated.View style={[styles.skeletonSectionTitle, { opacity: pulseAnim }]} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {[1, 2, 3, 4].map((c) => (
              <View key={c} style={styles.skeletonCardCol}>
                <Animated.View style={[styles.skeletonCardImg, { opacity: pulseAnim }]} />
                <Animated.View style={[styles.skeletonCardLine1, { opacity: pulseAnim }]} />
                <Animated.View style={[styles.skeletonCardLine2, { opacity: pulseAnim }]} />
              </View>
            ))}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

export default function HomeScreen({ onNavigate } = {}) {
  const { isDesktop, isTablet, isPhone } = useResponsive();
  const [feed, setFeed] = useState(null);
  const feedRef = useRef(null);
  const [activeFilter, setActiveFilter] = useState("All");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const { userProfile, friends, likedSongs, userArtistMovements, recordArtistMovement } = useUser() || {};
  const favoriteArtists = userProfile?.favoriteArtists || userProfile?.favorite_artists || [];
  const friendsList = friends || [];
  const [followingSections, setFollowingSections] = useState([]);
  const [followingQuickItems, setFollowingQuickItems] = useState([]);
  const [allFollowingTracks, setAllFollowingTracks] = useState([]);
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const [appTrending, setAppTrending] = useState([]);
  const [artistImages, setArtistImages] = useState({});
  const [friendsActivity, setFriendsActivity] = useState({});
  const [selectedArtistForModal, setSelectedArtistForModal] = useState(null);

  const { currentTrack, isPlaying, togglePlayPause, playTrack } = useAudioPlayback();

  const loadFeed = useCallback(async (forceRefresh = false) => {
    try {
      setError(null);

      // 1. Try immediate load from Firebase Realtime Database (only if purely Indian content)
      if (!forceRefresh) {
        const rtdbFeed = await withTimeout(
          getTrendingFeedRTDB(),
          3500,
          "Cached feed request timed out"
        );
        const hasInvalidSection = rtdbFeed?.sections?.some(
          (s) => s.id === "trending_global" ||
                 s.id === "trending_india" ||
                 s.id?.startsWith("mood_") ||
                 s.id?.includes("morning") ||
                 s.id?.includes("chill") ||
                 s.title?.toLowerCase().includes("global") ||
                 s.title?.toLowerCase().includes("youtube india") ||
                 s.title?.toLowerCase().includes("morning energy") ||
                 s.title?.toLowerCase().includes("chill vibes")
        );
        if (rtdbFeed && Array.isArray(rtdbFeed.sections) && rtdbFeed.sections.length > 0 && !hasInvalidSection) {
          feedRef.current = rtdbFeed;
          setFeed(rtdbFeed);
          setIsLoading(false);
          // If RTDB data was updated in the last 4 hours, use it immediately
          const ageMs = rtdbFeed.lastUpdated
            ? Date.now() - new Date(rtdbFeed.lastUpdated).getTime()
            : Infinity;
          if (ageMs < 4 * 60 * 60 * 1000) {
            return;
          }
        }
      }

      if (!forceRefresh && !feedRef.current) setIsLoading(true);

      // 2. Fetch fresh 3-month trending Indian feed from backend (zero seed data)
      const data = await withTimeout(
        api.getHomeFeed(undefined, forceRefresh),
        7500,
        "Latest feed request timed out"
      );
      if (data && Array.isArray(data.sections) && data.sections.length > 0) {
        // Ensure only clean Indian sections within 3-month fresh range, removing global, trending_india, and mood sections
        const cleanIndianData = {
          ...data,
          sections: data.sections.filter(
            (s) => s.id !== "trending_global" &&
                   s.id !== "trending_india" &&
                   !s.id?.startsWith("mood_") &&
                   !s.id?.includes("morning") &&
                   !s.id?.includes("chill") &&
                   !s.title?.toLowerCase().includes("global") &&
                   !s.title?.toLowerCase().includes("youtube india") &&
                   !s.title?.toLowerCase().includes("morning energy") &&
                   !s.title?.toLowerCase().includes("chill vibes")
          ),
        };
        feedRef.current = cleanIndianData;
        setFeed(cleanIndianData);
        // Persist fresh Indian feed to Firebase Realtime Database
        saveTrendingFeedRTDB(cleanIndianData);
      }
    } catch (err) {
      console.warn("Error fetching feed:", err);
      if (!feedRef.current) {
        const rtdbFeed = await withTimeout(
          getTrendingFeedRTDB(),
          2000,
          "Cached feed request timed out"
        ).catch(() => null);
        if (rtdbFeed && Array.isArray(rtdbFeed.sections) && rtdbFeed.sections.length > 0) {
          feedRef.current = rtdbFeed;
          setFeed(rtdbFeed);
        } else {
          setError("Unable to load latest trending feed.");
        }
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Real-time synchronization with Firebase Realtime Database
  useEffect(() => {
    loadFeed();
    const unsub = subscribeTrendingFeedRTDB((liveFeed) => {
      if (liveFeed && Array.isArray(liveFeed.sections) && liveFeed.sections.length > 0) {
        const cleanIndianFeed = {
          ...liveFeed,
          sections: liveFeed.sections.filter(
            (s) => s.id !== "trending_global" &&
                   s.id !== "trending_india" &&
                   !s.id?.startsWith("mood_") &&
                   !s.id?.includes("morning") &&
                   !s.id?.includes("chill") &&
                   !s.title?.toLowerCase().includes("global") &&
                   !s.title?.toLowerCase().includes("youtube india") &&
                   !s.title?.toLowerCase().includes("morning energy") &&
                   !s.title?.toLowerCase().includes("chill vibes")
          ),
        };
        if (
          !feedRef.current ||
          feedRef.current.generated_date !== cleanIndianFeed.generated_date ||
          feedRef.current.lastUpdated !== cleanIndianFeed.lastUpdated ||
          feedRef.current.sections?.[0]?.items?.[0]?.videoId !== cleanIndianFeed.sections?.[0]?.items?.[0]?.videoId
        ) {
          feedRef.current = cleanIndianFeed;
          setFeed(cleanIndianFeed);
          setIsLoading(false);
        }
      }
    });
    return () => unsub();
  }, [loadFeed]);

  // Subscribe to user recently played (Jump Back In) and app-wide community trending
  useEffect(() => {
    const uid = auth.currentUser?.uid || "guest";
    getRecentlyPlayed(uid).then((items) => {
      if (Array.isArray(items)) setRecentlyPlayed(items);
    }).catch(() => {});

    const unsubRecent = subscribeRecentlyPlayed(uid, (items) => {
      if (Array.isArray(items)) setRecentlyPlayed(items);
    });

    getAppTrendingTracksRTDB(20).then((items) => {
      if (Array.isArray(items)) setAppTrending(items);
    }).catch(() => {});

    const unsubTrending = subscribeAppTrendingRTDB((items) => {
      if (Array.isArray(items)) setAppTrending(items);
    }, 20);

    return () => {
      unsubRecent();
      unsubTrending();
    };
  }, []);

  // Real-time synchronization of Friends live listening activity
  useEffect(() => {
    if (!friendsList || friendsList.length === 0) {
      setFriendsActivity({});
      return;
    }

    const unsubs = friendsList.map((f) => {
      if (!f?.uid) return () => {};
      return subscribeFriendActivity(f.uid, (act) => {
        setFriendsActivity((prev) => ({
          ...prev,
          [f.uid]: act,
        }));
      });
    });

    return () => {
      unsubs.forEach((unsub) => {
        try {
          unsub();
        } catch (_) {}
      });
    };
  }, [friendsList]);

  const onRefresh = () => {
    setIsRefreshing(true);
    const uid = auth.currentUser?.uid || "guest";
    getRecentlyPlayed(uid).then((items) => {
      if (Array.isArray(items)) setRecentlyPlayed(items);
    }).catch(() => {});
    getAppTrendingTracksRTDB(20).then((items) => {
      if (Array.isArray(items)) setAppTrending(items);
    }).catch(() => {});
    if (activeFilter === "Following") {
      fetchFollowingSongs(true);
    } else {
      loadFeed(true);
    }
  };

  const fetchFollowingSongs = useCallback(async (force = false) => {
    if (favoriteArtists.length === 0) {
      setFollowingSections([]);
      setFollowingQuickItems([]);
      setAllFollowingTracks([]);
      return;
    }
    if (!force && followingSections.length > 0) return;

    setLoadingFollowing(true);
    try {
      const artistTrackLists = await Promise.all(
        favoriteArtists.slice(0, 12).map(async (artistName) => {
          try {
            const res = await api.search(`${artistName} songs`, 0, 12);
            return res?.tracks || [];
          } catch (err) {
            return [];
          }
        })
      );

      const validLists = artistTrackLists.filter((list) => list.length > 0);
      if (validLists.length === 0) {
        setFollowingSections([]);
        setFollowingQuickItems([]);
        setAllFollowingTracks([]);
        return;
      }

      const seenIds = new Set();
      const interleaved = [];
      let maxLen = 0;
      for (const list of validLists) { if (list.length > maxLen) maxLen = list.length; }
      for (let i = 0; i < maxLen; i++) {
        for (const list of validLists) {
          if (i < list.length) {
            const track = list[i];
            const id = track.videoId || track.video_id;
            if (id && !seenIds.has(id)) { seenIds.add(id); interleaved.push(track); }
          }
        }
      }

      setAllFollowingTracks(interleaved);
      setFollowingQuickItems(interleaved.slice(0, 6));

      const artistNamesLabel =
        favoriteArtists.slice(0, 3).join(", ") +
        (favoriteArtists.length > 3 ? " & more" : "");

      const sections = [
        {
          id: "following_mix",
          title: "Your Following Mix",
          description: `Tracks from ${artistNamesLabel}`,
          items: interleaved.slice(0, 18),
        },
        {
          id: "following_hits",
          title: "Top Hits from Your Artists",
          description: "Most popular tracks from artists in your library",
          items: [...interleaved].reverse().slice(0, 18),
        },
      ];

      setFollowingSections(sections);
    } finally {
      setLoadingFollowing(false);
      setIsRefreshing(false);
    }
  }, [favoriteArtists, followingSections.length]);

  useEffect(() => {
    if (activeFilter === "Following") {
      fetchFollowingSongs();
    }
  }, [activeFilter, fetchFollowingSongs]);

  // Fetch latest high-res artist images for followed artists
  useEffect(() => {
    if (!favoriteArtists || favoriteArtists.length === 0) return;
    const missing = favoriteArtists.filter((name) => !artistImages[name]);
    if (missing.length === 0) return;

    api
      .getBatchArtistImages(missing)
      .then((res) => {
        if (res && res.images && Object.keys(res.images).length > 0) {
          setArtistImages((prev) => ({ ...prev, ...res.images }));
        }
      })
      .catch(() => {});

    // Also fetch individual high-res image (identical to ArtistModal)
    missing.forEach((name) => {
      api
        .getArtistImage(name)
        .then((res) => {
          const photo = res?.image || res?.image_url;
          if (
            photo &&
            !photo.includes("artist-default-music.png") &&
            !photo.includes("default_artist")
          ) {
            setArtistImages((prev) => ({ ...prev, [name]: photo }));
          }
        })
        .catch(() => {});
    });
  }, [favoriteArtists]);

  // ─── USER TASTE & LANGUAGE AFFINITY ENGINE ─────────────────────────────────

  // 1. User Preferred Languages
  const userLanguages = useMemo(() => {
    const langs = userProfile?.languages || [];
    if (Array.isArray(langs) && langs.length > 0) {
      return langs.map((l) => l.trim());
    }
    return ["Hindi", "English"];
  }, [userProfile?.languages]);

  // 2. Ranked Artist Affinities (combining followed artists + user movements + recently played + liked songs)
  const affinityArtists = useMemo(() => {
    const counts = {};
    (favoriteArtists || []).forEach((name) => {
      if (name) counts[name.trim()] = (counts[name.trim()] || 0) + 20;
    });
    // Add user artist movements (viewed artist profiles, similar artist clicks, collaborator discoveries)
    Object.entries(userArtistMovements || {}).forEach(([name, weight]) => {
      if (name) {
        counts[name] = (counts[name] || 0) + (weight || 3);
      }
    });
    (recentlyPlayed || []).forEach((t) => {
      const a = t?.artist;
      if (a) {
        a.split(/,|&|feat\./i).forEach((sub) => {
          const clean = sub.trim();
          if (clean && clean.length > 2 && !/t-series|sony|records|music/i.test(clean)) {
            counts[clean] = (counts[clean] || 0) + 4;
          }
        });
      }
    });
    (likedSongs || []).forEach((t) => {
      const a = t?.artist;
      if (a) {
        a.split(/,|&|feat\./i).forEach((sub) => {
          const clean = sub.trim();
          if (clean && clean.length > 2 && !/t-series|sony|records|music/i.test(clean)) {
            counts[clean] = (counts[clean] || 0) + 3;
          }
        });
      }
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [favoriteArtists, userArtistMovements, recentlyPlayed, likedSongs]);

  // 3. Known language artist registries for accurate affinity detection
  const PUNJABI_ARTISTS_SET = useMemo(() => new Set([
    "diljit dosanjh", "karan aujla", "ap dhillon", "sidhu moose wala", "ammy virk", "shubh",
    "guru randhawa", "b praak", "harrdy sandhu", "jordan sandhu", "sunanda sharma", "jasmine sandlas",
    "mankirt aulakh", "jassie gill", "parmish verma", "kulwinder billa", "tarsem jassar", "yo yo honey singh",
    "bohemia", "sukhe", "mika singh", "khan bhaini", "nimrat khaira"
  ]), []);

  const TELUGU_ARTISTS_SET = useMemo(() => new Set([
    "sid sriram", "anirudh ravichander", "devi sri prasad", "thaman s", "armaan malik", "spb", "ram miriyala"
  ]), []);

  const TAMIL_ARTISTS_SET = useMemo(() => new Set([
    "anirudh ravichander", "ar rahman", "yuvan shankar raja", "harris jayaraj", "sid sriram", "ilayaraja", "d imman", "santhosh narayanan"
  ]), []);

  // 4. Affinity flags: whether user cares about each language
  const hasPunjabiAffinity = useMemo(() => {
    return (
      userLanguages.some((l) => l.toLowerCase() === "punjabi") ||
      affinityArtists.some((a) => PUNJABI_ARTISTS_SET.has(a.toLowerCase()))
    );
  }, [userLanguages, affinityArtists, PUNJABI_ARTISTS_SET]);

  const hasTeluguAffinity = useMemo(() => {
    return (
      userLanguages.some((l) => l.toLowerCase() === "telugu") ||
      affinityArtists.some((a) => TELUGU_ARTISTS_SET.has(a.toLowerCase()))
    );
  }, [userLanguages, affinityArtists, TELUGU_ARTISTS_SET]);

  const hasTamilAffinity = useMemo(() => {
    return (
      userLanguages.some((l) => l.toLowerCase() === "tamil") ||
      affinityArtists.some((a) => TAMIL_ARTISTS_SET.has(a.toLowerCase()))
    );
  }, [userLanguages, affinityArtists, TAMIL_ARTISTS_SET]);

  const hasEnglishAffinity = useMemo(() => {
    return (
      userLanguages.some((l) => l.toLowerCase().includes("english") || l.toLowerCase().includes("pop")) ||
      affinityArtists.some((a) => [
        "taylor swift", "the weeknd", "drake", "ed sheeran", "billie eilish", "bruno mars",
        "post malone", "travis scott", "21 savage", "future", "kendrick lamar", "sza", "olivia rodrigo", "sabrina carpenter"
      ].includes(a.toLowerCase()))
    );
  }, [userLanguages, affinityArtists]);

  const hasHindiAffinity = useMemo(() => {
    return (
      userLanguages.some((l) => l.toLowerCase() === "hindi") ||
      affinityArtists.length === 0 ||
      affinityArtists.some((a) => [
        "arijit singh", "shreya ghoshal", "pritam", "atif aslam", "anuv jain", "mohit chauhan",
        "jubin nautiyal", "kk", "sunidhi chauhan", "neha kakkar", "prateek kuhad", "sonu nigam"
      ].includes(a.toLowerCase()))
    );
  }, [userLanguages, affinityArtists]);

  // Helper: check if a track is Punjabi
  const isTrackPunjabi = useCallback((track) => {
    if (!track) return false;
    const artistStr = (track.artist || "").toLowerCase();
    for (const pa of PUNJABI_ARTISTS_SET) {
      if (artistStr.includes(pa)) return true;
    }
    return false;
  }, [PUNJABI_ARTISTS_SET]);

  // 5. Personal "Jump Back In" from user's listening history
  const jumpBackInSection = recentlyPlayed.length > 0 ? {
    id: "jump_back_in",
    title: "Jump Back In",
    description: "Pick up right where you left off",
    items: recentlyPlayed,
  } : null;

  // 5b. Dedicated "Trending on Staytup" Section (driven by app-wide community listening in RTDB + user history)
  const trendingOnStaytupSection = useMemo(() => {
    const raw = [...appTrending];
    const seen = new Set();
    const cleanList = [];

    for (const t of raw) {
      const vid = t.videoId || t.video_id || t.id;
      if (!vid || seen.has(vid)) continue;
      if (!hasPunjabiAffinity && isTrackPunjabi(t)) continue;
      seen.add(vid);
      cleanList.push(t);
    }

    // If appTrending is still building up, merge with top played from recentlyPlayed & feed
    if (cleanList.length < 10) {
      for (const t of recentlyPlayed) {
        const vid = t.videoId || t.video_id || t.id;
        if (!vid || seen.has(vid)) continue;
        if (!hasPunjabiAffinity && isTrackPunjabi(t)) continue;
        seen.add(vid);
        cleanList.push(t);
        if (cleanList.length >= 15) break;
      }
    }
    if (cleanList.length < 10) {
      const allSecs = feed?.sections || [];
      const trendingSec = allSecs.find((s) => s.id === "trending_now" || s.title?.toLowerCase().includes("trending"));
      const items = trendingSec?.items || trendingSec?.tracks || allSecs[0]?.items || [];
      for (const t of items) {
        const vid = t.videoId || t.video_id || t.id;
        if (!vid || seen.has(vid)) continue;
        if (!hasPunjabiAffinity && isTrackPunjabi(t)) continue;
        seen.add(vid);
        cleanList.push(t);
        if (cleanList.length >= 15) break;
      }
    }

    if (cleanList.length === 0) return null;

    return {
      id: "trending_on_staytup",
      title: "Trending on Staytup",
      description: "Most played songs across the Staytup community",
      items: cleanList.slice(0, 15),
    };
  }, [appTrending, recentlyPlayed, feed?.sections, hasPunjabiAffinity, isTrackPunjabi]);

  // 5c. Dedicated "Trending Now" Section (hottest Indian chart hits with real movie/single posters)
  const trendingNowSection = useMemo(() => {
    const allSecs = feed?.sections || [];
    const found = allSecs.find(
      (s) => s.id === "trending_now" || (s.title?.toLowerCase().includes("trending") && s.id !== "trending_on_staytup")
    );
    let items = found?.items || found?.tracks || [];
    if (!hasPunjabiAffinity) {
      items = items.filter((t) => !isTrackPunjabi(t));
    }
    if (items.length === 0) return null;
    return {
      id: "trending_now",
      title: "Trending Now",
      description: "Hottest chart-toppers and viral hits right now",
      items: items.slice(0, 20),
    };
  }, [feed?.sections, hasPunjabiAffinity, isTrackPunjabi]);

  // 6. Intelligent Daily Mix (tailored dynamically to user's active languages, artists & genres)
  const dailyMixSection = useMemo(() => {
    // 1. Gather all strictly validated playable tracks across user profile, followings, history and feed
    const pool = [];
    const poolSeen = new Set();

    const addSafeTracks = (list) => {
      if (!Array.isArray(list)) return;
      for (const t of list) {
        if (!t || t.type === "playlist") continue;
        const vid = t.videoId || t.video_id;
        if (vid && !poolSeen.has(vid)) {
          if (!hasPunjabiAffinity && isTrackPunjabi(t)) continue;
          poolSeen.add(vid);
          pool.push(t);
        }
      }
    };

    addSafeTracks(allFollowingTracks);
    addSafeTracks(recentlyPlayed);
    addSafeTracks(likedSongs);
    addSafeTracks(appTrending);
    (feed?.sections || []).forEach((sec) => {
      if (sec.type === "songs" || (!sec.type && Array.isArray(sec.items))) {
        addSafeTracks(sec.items || sec.tracks || []);
      }
    });

    if (pool.length === 0) return null;

    // 2. Define intelligent mix configs for Daily Mix 1, 2, 3, 4, 5, 6
    const mixConfigs = [
      {
        id: "daily_mix_1",
        title: "Daily Mix 1",
        badgeColor: "#1DB954",
        defaultGenre: "Bollywood & Romantic Melodies",
        filter: (t) => {
          const a = (t.artist || "").toLowerCase();
          const target = affinityArtists.slice(0, 2).map((x) => x.toLowerCase());
          if (target.some((x) => a.includes(x))) return true;
          return /romantic|love|dil|ishq|tum|tere|aashiqui|humsafar|khairiyat|kesariya|shayad/i.test((t.title || "") + " " + a);
        },
      },
      {
        id: "daily_mix_2",
        title: "Daily Mix 2",
        badgeColor: "#E91E63",
        defaultGenre: "Trending Chartbusters & Energy",
        filter: (t) => {
          const a = (t.artist || "").toLowerCase();
          const target = affinityArtists.slice(2, 5).map((x) => x.toLowerCase());
          if (target.some((x) => a.includes(x))) return true;
          return /dance|party|dhamaka|nach|tauba|bhangra|groove|hit|chart|jawan|animal|war/i.test((t.title || "") + " " + a);
        },
      },
      {
        id: "daily_mix_3",
        title: "Daily Mix 3",
        badgeColor: "#3A86FF",
        defaultGenre: "Indie Pop & Acoustic Vibe",
        filter: (t) => {
          const a = (t.artist || "").toLowerCase();
          return /indie|acoustic|unplugged|chitta|baarish|kho|alvida|kasoor|jeena|anuv|prateek/i.test((t.title || "") + " " + a);
        },
      },
      {
        id: "daily_mix_4",
        title: "Daily Mix 4",
        badgeColor: "#9C27B0",
        defaultGenre: "Chill Beats & Lo-Fi Vibes",
        filter: (t) => {
          const a = (t.artist || "").toLowerCase();
          return /lofi|lo-fi|chill|slowed|midnight|raat|sukoon|peace|vibes|samjho|hona/i.test((t.title || "") + " " + a);
        },
      },
      {
        id: "daily_mix_5",
        title: "Daily Mix 5",
        badgeColor: hasPunjabiAffinity ? "#FF9800" : "#00BCD4",
        defaultGenre: hasPunjabiAffinity ? "Punjabi Bangers" : "Global Pop & English Hits",
        filter: (t) => {
          if (hasPunjabiAffinity) return isTrackPunjabi(t);
          return /[a-z]/i.test(t.title) && !/[\u0900-\u097F]/.test(t.title);
        },
      },
      {
        id: "daily_mix_6",
        title: "Daily Mix 6",
        badgeColor: "#FF5722",
        defaultGenre: "Discover Fresh Mix",
        filter: () => true,
      },
    ];

    const usedInMixes = new Set();
    const usedArtworks = new Set();
    const mixes = [];

    for (let c = 0; c < mixConfigs.length; c++) {
      const config = mixConfigs[c];

      // Match tracks matching the genre/artist filter
      let matched = pool.filter((t) => config.filter(t));
      // Deduplicate against tracks used in earlier mixes for maximum diversity
      let fresh = matched.filter((t) => !usedInMixes.has(t.videoId || t.video_id));
      let mixTracks = fresh.length >= 8 ? fresh : [...fresh, ...matched];

      // If still fewer than 8 tracks, backfill with shifted pool
      if (mixTracks.length < 8) {
        const offset = (c * 7) % Math.max(1, pool.length);
        const rotated = [...pool.slice(offset), ...pool.slice(0, offset)];
        mixTracks = [...mixTracks, ...rotated];
      }

      // Deduplicate within the mix & cap at 25 playable songs
      const seen = new Set();
      const finalTracks = [];
      for (const t of mixTracks) {
        const vid = t.videoId || t.video_id;
        if (vid && !seen.has(vid)) {
          seen.add(vid);
          usedInMixes.add(vid);
          finalTracks.push(t);
          if (finalTracks.length >= 25) break;
        }
      }

      if (finalTracks.length < 3) continue;

      // Select unique cover artwork
      let chosenArtwork = null;
      let leadTrack = finalTracks[0];
      for (const t of finalTracks) {
        const art = t.artwork_url || t.thumbnail;
        if (art && !usedArtworks.has(art)) {
          chosenArtwork = art;
          leadTrack = t;
          usedArtworks.add(art);
          break;
        }
      }
      if (!chosenArtwork) {
        chosenArtwork = finalTracks[0]?.artwork_url || finalTracks[0]?.thumbnail;
      }

      // Top distinct artists for subtitle
      const artists = Array.from(
        new Set(
          finalTracks
            .map((t) => t.artist)
            .filter(Boolean)
            .flatMap((a) => a.split(/,|&|feat\./i).map((s) => s.trim()))
            .filter((s) => s.length > 1 && !/t-series|sony|music|records/i.test(s))
        )
      ).slice(0, 3).join(", ");

      mixes.push({
        id: config.id,
        videoId: leadTrack?.videoId || leadTrack?.video_id || `mix_${c}`,
        title: config.title,
        artist: artists ? `${artists} and more` : config.defaultGenre,
        artwork_url: chosenArtwork,
        thumbnail: chosenArtwork,
        mixTracks: finalTracks,
        badgeColor: config.badgeColor,
      });
    }

    if (mixes.length === 0) return null;

    return {
      id: "daily_mix",
      title: "Daily Mix",
      description: "Curated specifically for your taste and favorite artists",
      items: mixes,
    };
  }, [allFollowingTracks, recentlyPlayed, likedSongs, appTrending, feed?.sections, affinityArtists, hasPunjabiAffinity, isTrackPunjabi]);

  // 7. Dynamic "Because You Listen To [Top Artist]" Section
  const topAffinityArtist = affinityArtists[0];
  const becauseYouListenSection = useMemo(() => {
    if (!topAffinityArtist) return null;

    const pool = [
      ...allFollowingTracks,
      ...recentlyPlayed,
      ...(feed?.sections?.flatMap((s) => s.items || s.tracks || []) || []),
    ];

    const artistLower = topAffinityArtist.toLowerCase();
    const seenIds = new Set();
    const directMatches = [];
    const relatedMatches = [];

    for (const t of pool) {
      const tid = t.videoId || t.video_id || t.id;
      if (!tid || seenIds.has(tid)) continue;
      if (!hasPunjabiAffinity && isTrackPunjabi(t)) continue;

      const tArtist = (t.artist || "").toLowerCase();
      if (tArtist.includes(artistLower)) {
        seenIds.add(tid);
        directMatches.push(t);
      } else {
        relatedMatches.push(t);
      }
    }

    const combined = [...directMatches, ...relatedMatches];
    if (combined.length < 3) return null;

    return {
      id: `because_you_listen_${topAffinityArtist.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
      title: `More Like ${topAffinityArtist}`,
      description: `Tracks inspired by your love for ${topAffinityArtist}`,
      items: combined.slice(0, 15),
    };
  }, [topAffinityArtist, allFollowingTracks, recentlyPlayed, feed?.sections, hasPunjabiAffinity, isTrackPunjabi]);

  // 7b. Multi-Artist & Collaborator Recommendation Intelligence
  // If user follows/listens to an artist (e.g. Arijit Singh), surfaces their co-artists/collaborators
  // (e.g. Sachin-Jigar, Pritam, Amitabh Bhattacharya, Mithoon) and their joint/individual tracks!
  const collaborationsSection = useMemo(() => {
    const topArtists = affinityArtists.slice(0, 3);
    if (topArtists.length === 0) return null;

    const pool = [
      ...allFollowingTracks,
      ...recentlyPlayed,
      ...likedSongs,
      ...(feed?.sections?.flatMap((s) => s.items || s.tracks || []) || []),
    ];

    // Find all collaborator names appearing alongside topArtists
    const collaboratorNames = new Set();
    topArtists.forEach((mainArt) => {
      const mainLower = mainArt.toLowerCase();
      pool.forEach((t) => {
        const a = (t.artist || "").toLowerCase();
        if (a.includes(mainLower)) {
          a.split(/,|&|feat\./i).forEach((sub) => {
            const clean = sub.trim();
            if (clean && clean.length > 2 && !clean.includes(mainLower) && !/t-series|sony|records|music/i.test(clean)) {
              collaboratorNames.add(clean);
            }
          });
        }
      });
    });

    // Also add any artist from user movements
    Object.keys(userArtistMovements || {}).forEach((mName) => {
      if (!topArtists.some((ta) => ta.toLowerCase() === mName.toLowerCase())) {
        collaboratorNames.add(mName.toLowerCase());
      }
    });

    if (collaboratorNames.size === 0) return null;

    // Pick top tracks featuring these collaborators
    const seenIds = new Set();
    const collabTracks = [];

    for (const t of pool) {
      const tid = t.videoId || t.video_id || t.id;
      if (!tid || seenIds.has(tid)) continue;
      if (!hasPunjabiAffinity && isTrackPunjabi(t)) continue;

      const tArtist = (t.artist || "").toLowerCase();
      const hasCollab = Array.from(collaboratorNames).some((c) => tArtist.includes(c));
      if (hasCollab) {
        seenIds.add(tid);
        collabTracks.push(t);
        if (collabTracks.length >= 15) break;
      }
    }

    if (collabTracks.length < 3) return null;

    const leadArtist = topArtists[0];
    return {
      id: "collaborations_recommended",
      title: "Collaborations & Recommended for You",
      description: `Top tracks from collaborators and related artists you love`,
      items: collabTracks,
    };
  }, [affinityArtists, allFollowingTracks, recentlyPlayed, likedSongs, feed?.sections, userArtistMovements, hasPunjabiAffinity, isTrackPunjabi]);

  // 8. Fresh New Releases (Gated by language affinity)
  const freshNewReleasesSection = useMemo(() => {
    const allSecs = feed?.sections || [];
    const found = allSecs.find(
      (s) => s.id === "new_releases" || s.title?.toLowerCase().includes("new release")
    );
    let items = found?.items || found?.tracks || allSecs[0]?.items || allSecs[0]?.tracks || [];
    if (!hasPunjabiAffinity) {
      items = items.filter((t) => !isTrackPunjabi(t));
    }
    if (items.length === 0) return null;
    return {
      id: "fresh_new_releases",
      title: "Fresh New Releases",
      description: "Brand new singles and albums out today",
      items,
    };
  }, [feed?.sections, hasPunjabiAffinity, isTrackPunjabi]);

  // 9. Friends' Listening Activity Section
  const friendsListeningTracks = useMemo(() => {
    const list = [];
    const seen = new Set();
    Object.entries(friendsActivity || {}).forEach(([fUid, act]) => {
      if (act?.isPlaying && act?.track) {
        const isRecent = !act.updatedAt || (Date.now() - act.updatedAt < 1000 * 60 * 10);
        if (!isRecent) return;

        const vid = act.track.videoId || act.track.video_id;
        if (vid && !seen.has(vid)) {
          seen.add(vid);
          const friend = friendsList.find((f) => f.uid === fUid);
          list.push({
            ...act.track,
            videoId: vid,
            video_id: vid,
            customSubtitle: friend?.username ? `Listened by @${friend.username}` : undefined,
          });
        }
      }
    });
    return list;
  }, [friendsActivity, friendsList]);

  const friendsListeningSection = friendsListeningTracks.length > 0 ? {
    id: "friends_listening_section",
    title: "Friends are Listening To",
    description: "Real-time tracks your friends have on repeat",
    items: friendsListeningTracks,
  } : null;

  // 10. Categorical Backend Sections sorted logically and filtered strictly by User Taste
  const GENRE_PRIORITY = [
    "top_hindi",
    "romantic_melodies",
    "bollywood_blockbusters",
    "punjabi_bangers",
    "indie_pop",
    "desi_hip_hop",
    "party_anthems",
    "lofi_chill_hindi",
    "tamil_hits",
    "telugu_hits",
    "south_indian_mix",
    "english_india",
    "romantic_english",
    "indie_viral",
    "devotional",
    "retro_classics",
  ];

  const remainingBackendSections = useMemo(() => {
    const raw = (feed?.sections || [])
      .filter((section) => {
        const tracks = section.tracks || section.items || [];
        if (!section || tracks.length === 0) return false;
        if (section.id === "new_releases" || section.title?.toLowerCase().includes("new release")) return false;
        if (section.id === "trending_now" || section.title?.toLowerCase().includes("trending")) return false;
        if (section.id === "trending_global" || section.title?.toLowerCase().includes("global")) return false;
        if (section.id === "trending_india" || section.title?.toLowerCase().includes("youtube india")) return false;
        if (
          section.id?.startsWith("mood_") ||
          section.id?.includes("morning") ||
          section.id?.includes("chill") ||
          section.title?.toLowerCase().includes("morning energy") ||
          section.title?.toLowerCase().includes("chill vibes")
        ) return false;

        // Language Gating:
        const secLang = (section.language || "").toLowerCase();
        const secId = (section.id || "").toLowerCase();
        const secTitle = (section.title || "").toLowerCase();

        // 1. Punjabi: if user has no Punjabi affinity, completely drop section
        if (secLang === "punjabi" || secId.includes("punjabi") || secTitle.includes("punjabi")) {
          if (!hasPunjabiAffinity) return false;
        }

        // 2. Tamil: if user has no Tamil affinity, drop section
        if (secLang === "tamil" || secId.includes("tamil") || secTitle.includes("tamil")) {
          if (!hasTamilAffinity) return false;
        }

        // 3. Telugu: if user has no Telugu affinity, drop section
        if (secLang === "telugu" || secId.includes("telugu") || secTitle.includes("telugu")) {
          if (!hasTeluguAffinity) return false;
        }

        // 4. South Indian: if user has neither Tamil nor Telugu affinity, drop section
        if (secLang.includes("south") || secId.includes("south") || secTitle.includes("south indian")) {
          if (!hasTamilAffinity && !hasTeluguAffinity) return false;
        }

        // 5. English: if user has no English affinity, drop section
        if (secLang === "english" || secId.includes("english") || secTitle.includes("english")) {
          if (!hasEnglishAffinity) return false;
        }

        return true;
      })
      .map((section) => {
        let items = section.items || section.tracks || [];
        // If user has no Punjabi affinity, strip any Punjabi tracks that snuck into other sections
        if (!hasPunjabiAffinity) {
          items = items.filter((t) => !isTrackPunjabi(t));
        }
        return {
          ...section,
          items,
        };
      })
      .filter((s) => s.items.length > 0);

    return raw.sort((a, b) => {
      const idxA = GENRE_PRIORITY.indexOf(a.id);
      const idxB = GENRE_PRIORITY.indexOf(b.id);
      const orderA = idxA !== -1 ? idxA : 999;
      const orderB = idxB !== -1 ? idxB : 999;
      return orderA - orderB;
    });
  }, [feed?.sections, hasPunjabiAffinity, hasTamilAffinity, hasTeluguAffinity, hasEnglishAffinity, isTrackPunjabi]);

  // Combined Home / All Feed:
  // 1. Jump Back In -> 2. Trending on Staytup -> 3. Trending Now -> 4. Daily Mix -> 5. Because You Listen to [Top Artist] -> 6. Collaborations & Recommended for You -> 7. Fresh New Releases -> 8. Friends are Listening To -> 9. Categorical Genres
  const allDisplayedSections = [
    jumpBackInSection,
    trendingOnStaytupSection,
    trendingNowSection,
    dailyMixSection,
    becauseYouListenSection,
    collaborationsSection,
    freshNewReleasesSection,
    friendsListeningSection,
    ...remainingBackendSections,
  ].filter(Boolean).filter((section) => section.items && section.items.length > 0);

  return (
    <View style={styles.container}>
      <Header
        activeFilter={activeFilter}
        onSelectFilter={setActiveFilter}
      />

      {isLoading ? (
        <HomeSkeleton />
      ) : error ? (
        <View style={styles.centerContainer}>
          <Ionicons name="cloud-offline-outline" size={54} color={colors.error} />
          <Text style={styles.errorTitle}>Connection Failed</Text>
          <Text style={styles.errorDescription}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadFeed(true)}>
            <Text style={styles.retryButtonText}>Retry Feed</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          <View style={[styles.mainInner, (isDesktop || isTablet) && styles.desktopMainInner]}>
            {activeFilter === "Following" ? (
              <View style={styles.followingContainer}>
                {/* 1. Friends Listening Now (Horizontal Scrolling Live Pills ONLY) */}
                {(() => {
                  const listeningFriends = friendsList.filter((f) => {
                    const act = friendsActivity[f.uid];
                    const isRecent = !act?.updatedAt || (Date.now() - act.updatedAt < 1000 * 60 * 10);
                    return Boolean(act?.isPlaying && act?.track && isRecent);
                  });

                  if (listeningFriends.length === 0) return null;

                  return (
                    <View style={styles.followingFriendsSection}>
                      <View style={styles.followingFriendsHeaderRow}>
                        <View style={styles.followingFriendsTitleGroup}>
                          <Ionicons name="people" size={16} color={colors.primary} />
                          <Text style={styles.followingFriendsTitle}>Friends Listening Now</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => onNavigate && onNavigate("Friends")}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.followingFriendsViewAllText}>View All</Text>
                        </TouchableOpacity>
                      </View>

                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.listeningPillsScrollContent}
                        style={styles.listeningPillsScrollView}
                      >
                        {listeningFriends.map((friend) => {
                          const act = friendsActivity[friend.uid];
                          const track = act?.track;
                          const isCurrentPlayingThis =
                            currentTrack &&
                            track &&
                            ((track.videoId && currentTrack.videoId === track.videoId) ||
                              (track.video_id && currentTrack.videoId === track.video_id) ||
                              currentTrack.id === track.id);

                          return (
                            <TouchableOpacity
                              key={`listening_pill_${friend.uid}`}
                              style={[
                                styles.listeningPill,
                                isCurrentPlayingThis && styles.listeningPillActive,
                              ]}
                              onPress={() => {
                                if (track) {
                                  playTrack(
                                    {
                                      ...track,
                                      videoId: track.videoId || track.video_id || track.id,
                                    },
                                    [track],
                                    0
                                  );
                                }
                              }}
                              activeOpacity={0.8}
                            >
                              <View style={styles.listeningPillAvatarWrap}>
                                <UserAvatar user={friend} size={30} fontSize={12} />
                                <View style={styles.listeningPillLiveDot} />
                              </View>

                              <View style={styles.listeningPillInfo}>
                                <Text style={styles.listeningPillName} numberOfLines={1}>
                                  {friend.username}
                                </Text>
                                <View style={styles.listeningPillTrackRow}>
                                  <MaterialCommunityIcons
                                    name="waveform"
                                    size={10}
                                    color={colors.primary}
                                    style={{ marginRight: 3 }}
                                  />
                                  <Text style={styles.listeningPillTrackTitle} numberOfLines={1}>
                                    {cleanTitle(track.title)}
                                  </Text>
                                </View>
                              </View>

                              <View style={styles.listeningPillPlayBtn}>
                                <Ionicons
                                  name={isCurrentPlayingThis && isPlaying ? "pause" : "play"}
                                  size={11}
                                  color="#000000"
                                />
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  );
                })()}

                {/* 2. Your Following Mix */}
                {allFollowingTracks.length > 0 && (
                  <SectionList
                    section={{
                      id: "your_following_mix",
                      title: "Your Following Mix",
                      description: "Fresh tracks from the artists and curators you follow",
                      items: allFollowingTracks,
                    }}
                    sectionIndex={0}
                  />
                )}

                {/* 3. Top Hits From Your Artists */}
                {loadingFollowing ? (
                  <View style={styles.followingLoadingBox}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.followingLoadingText}>Loading followed artists...</Text>
                  </View>
                ) : favoriteArtists.length === 0 ? (
                  <View style={styles.followingEmptyBox}>
                    <Ionicons name="person-add-outline" size={40} color={colors.primary} />
                    <Text style={styles.followingEmptyTitle}>Follow Your Favorite Artists</Text>
                    <Text style={styles.followingEmptySub}>
                      Follow artists from search or their profiles to see all their fresh tracks right here.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.followingArtistsSection}>
                    <Text style={styles.followingArtistsSectionTitle}>Top Hits From Your Artists</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.followedArtistsRow}
                      style={styles.followedArtistsScrollView}
                    >
                      {favoriteArtists.map((name, idx) => {
                        const img = artistImages[name] || resolveLocalArtistImage(name);
                        return (
                          <TouchableOpacity
                            key={`fav_artist_${idx}`}
                            style={styles.followedArtistItem}
                            onPress={() => {
                              if (recordArtistMovement) recordArtistMovement(name);
                              setSelectedArtistForModal(name);
                            }}
                            activeOpacity={0.8}
                          >
                            {img ? (
                              <Image
                                source={{ uri: getHighResArtwork(img) || img }}
                                style={styles.followedArtistImg}
                                resizeMode="cover"
                              />
                            ) : (
                              <View style={[styles.followedArtistImg, styles.followedArtistFallback]}>
                                <Ionicons name="person" size={24} color="#777777" />
                              </View>
                            )}
                            <Text style={styles.followedArtistName} numberOfLines={1}>
                              {name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    {followingSections.map((section, idx) => (
                      <SectionList key={section.id || `following_${idx}`} section={section} sectionIndex={idx + 1} />
                    ))}
                  </View>
                )}
              </View>
            ) : (
              /* Home / All Feed: Fresh New Releases -> Daily Mix -> Trending Now -> Friends Are Listening To -> Jump Back In */
              allDisplayedSections?.map((section, idx) => (
                <SectionList key={section.id || `section_${idx}`} section={section} sectionIndex={idx} />
              ))
            )}

            <View style={{ height: isDesktop || isTablet ? 24 : 140 }} />
          </View>
        </ScrollView>
      )}

      <ArtistModal
        visible={Boolean(selectedArtistForModal)}
        artistName={selectedArtistForModal}
        initialPhoto={selectedArtistForModal ? (artistImages[selectedArtistForModal] || resolveLocalArtistImage(selectedArtistForModal)) : null}
        onArtistImageResolved={(name, photo) => {
          if (name && photo) {
            setArtistImages((prev) => ({ ...prev, [name]: photo }));
          }
        }}
        onSelectArtist={(name) => {
          if (name) {
            if (recordArtistMovement) {
              recordArtistMovement(name);
            }
            setSelectedArtistForModal(name);
          }
        }}
        onClose={() => setSelectedArtistForModal(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  mainInner: {
    width: "100%",
  },
  desktopMainInner: {
    width: "100%",
    paddingHorizontal: 16,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  loadingText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 14,
  },
  errorTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
    marginTop: 16,
  },
  errorDescription: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 18,
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: colors.primary,
  },
  retryButtonText: {
    fontFamily: fonts.bold,
    color: "#000000",
    fontSize: 13,
  },

  // Spotify 6-Grid
  quickGridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 4,
    marginBottom: 12,
  },
  quickCard: {
    width: "48.5%",
    height: 58,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  quickCardActive: {
    backgroundColor: "rgba(29, 185, 84, 0.18)",
  },
  quickCardThumb: {
    width: 58,
    height: 58,
    backgroundColor: "#181818",
  },
  quickCardInfo: {
    flex: 1,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  quickCardTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: "#FFFFFF",
    lineHeight: 17,
  },
  quickCardArtist: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 14,
  },
  quickCardPlayingIndicator: {
    paddingRight: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  // Hero Featured Spotlight
  heroWrapper: {
    paddingHorizontal: 16,
    marginBottom: 22,
    marginTop: 6,
  },
  heroSectionHeaderRow: {
    marginBottom: 12,
  },
  heroSectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
  },
  heroSectionSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceCard,
    borderRadius: 14,
    padding: 14,
    gap: 16,
  },
  heroCardTablet: {
    padding: 16,
    gap: 20,
  },
  heroCardDesktop: {
    padding: 18,
    gap: 24,
  },
  heroArtworkContainer: {
    position: "relative",
    width: 105,
    height: 105,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#181818",
    flexShrink: 0,
  },
  heroArtworkContainerTablet: {
    width: 125,
    height: 125,
  },
  heroArtworkContainerDesktop: {
    width: 135,
    height: 135,
  },
  heroArtwork: {
    width: "100%",
    height: "100%",
  },
  heroArtOverlayBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  heroArtOverlayText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: "#FFFFFF",
  },
  heroContent: {
    flex: 1,
    justifyContent: "center",
  },
  heroTagRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  heroTagText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    letterSpacing: 0.6,
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
    letterSpacing: -0.3,
    lineHeight: 22,
    marginBottom: 4,
  },
  heroTitleDesktop: {
    fontSize: 20,
    lineHeight: 26,
  },
  heroMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 12,
  },
  heroArtist: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  heroMetaDot: {
    color: colors.textMuted,
    fontSize: 12,
  },
  heroDurationText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  heroActionRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  heroPlayButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  heroPlayButtonText: {
    fontFamily: fonts.bold,
    fontSize: 12.5,
    color: "#000000",
  },
  bottomSpacer: {
    height: 90,
  },

  // Following
  followingContainer: {
    width: "100%",
    paddingTop: 0,
  },
  followingLoadingBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 12,
  },
  followingLoadingText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#A7A7A7",
  },
  followedArtistsScrollView: {
    marginBottom: 6,
  },
  followedArtistsRow: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 16,
    paddingBottom: 14,
    alignItems: "center",
  },
  followedArtistItem: {
    alignItems: "center",
    width: 72,
  },
  followedArtistImg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#1a1a1a",
  },
  followedArtistFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  followedArtistName: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: "#FFFFFF",
    marginTop: 6,
    textAlign: "center",
  },
  followingEmptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 8,
  },
  followingEmptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: "#FFFFFF",
    marginTop: 8,
  },
  followingEmptySub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: "#888888",
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 18,
  },

  // Following Friends Live Activity
  followingFriendsSection: {
    marginBottom: 20,
    marginTop: 4,
  },
  followingFriendsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  followingFriendsTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  followingFriendsTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  followingFriendsViewAllText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.primary,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  listeningPillsScrollView: {
    marginHorizontal: 0,
  },
  listeningPillsScrollContent: {
    paddingHorizontal: 16,
    gap: 10,
    alignItems: "center",
  },
  listeningPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 24,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 10,
    maxWidth: 240,
    minWidth: 140,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  listeningPillActive: {
    backgroundColor: "rgba(29, 185, 84, 0.12)",
    borderColor: "rgba(29, 185, 84, 0.4)",
  },
  listeningPillAvatarWrap: {
    position: "relative",
  },
  listeningPillLiveDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: "#1DB954",
    borderWidth: 1.5,
    borderColor: "#000000",
  },
  listeningPillInfo: {
    flex: 1,
  },
  listeningPillName: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: "#FFFFFF",
  },
  listeningPillTrackRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  listeningPillTrackTitle: {
    fontFamily: fonts.regular,
    fontSize: 10.5,
    color: "#1DB954",
    flexShrink: 1,
  },
  listeningPillPlayBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  compactFriendCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  compactFriendCardLive: {
    backgroundColor: "rgba(29, 185, 84, 0.06)",
    borderColor: "rgba(29, 185, 84, 0.22)",
  },
  compactFriendMain: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
    marginRight: 10,
  },
  compactAvatarWrapper: {
    position: "relative",
  },
  compactStatusDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 2,
    borderColor: "#000000",
  },
  compactStatusDotLive: {
    backgroundColor: "#1DB954",
  },
  compactStatusDotOffline: {
    backgroundColor: "#555555",
  },
  compactFriendInfo: {
    flex: 1,
  },
  compactNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  compactFriendName: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  compactStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  compactStatusSmallDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  compactStatusText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.textMuted,
  },
  compactStatusTextLive: {
    color: "#1DB954",
  },
  compactTrackRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  compactTrackTitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.85)",
    flexShrink: 1,
  },
  compactInactiveText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.4)",
  },
  compactPlayActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },

  // Following Artists Section
  followingArtistsSection: {
    marginTop: 10,
    marginBottom: 24,
  },
  followingArtistsSectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 19,
    color: "#FFFFFF",
    letterSpacing: -0.3,
    paddingHorizontal: 16,
    marginBottom: 12,
  },

  skeletonWrap: {
    flex: 1,
    paddingTop: 10,
  },
  skeletonHeader: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 28,
  },
  skeletonPill: {
    height: 34,
    borderRadius: 17,
    backgroundColor: "#1A1A1A",
  },
  skeletonSection: {
    marginBottom: 28,
  },
  skeletonSectionTitle: {
    height: 18,
    width: 160,
    borderRadius: 6,
    backgroundColor: "#1A1A1A",
    marginLeft: 16,
    marginBottom: 14,
  },
  skeletonCardCol: {
    marginLeft: 16,
    width: 150,
  },
  skeletonCardImg: {
    width: 150,
    height: 150,
    borderRadius: 8,
    backgroundColor: "#1A1A1A",
    marginBottom: 8,
  },
  skeletonCardLine1: {
    height: 13,
    width: 120,
    borderRadius: 4,
    backgroundColor: "#1A1A1A",
    marginBottom: 6,
  },
  skeletonCardLine2: {
    height: 11,
    width: 80,
    borderRadius: 4,
    backgroundColor: "#1A1A1A",
  },
});
