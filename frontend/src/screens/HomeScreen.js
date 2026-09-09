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
import { DEFAULT_ARTIST_IMAGES, resolveLocalArtistImage } from "../theme/artistImages";
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

function getHighResArtwork(url) {
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
  clean = clean.replace(/\/mqdefault\.jpg/, "/mqdefault.jpg");
  clean = clean.replace(/\/sddefault\.jpg/, "/mqdefault.jpg");
  clean = clean.replace(/\/maxresdefault\.jpg/, "/mqdefault.jpg");
  return clean;
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

  const avatarUri =
    !imgError &&
    ((user?.avatar && typeof user.avatar === "string" && user.avatar.startsWith("http"))
      ? user.avatar
      : (user?.photoURL && typeof user.photoURL === "string" && user.photoURL.startsWith("http"))
      ? user.photoURL
      : (user?.avatarUrl && typeof user.avatarUrl === "string" && user.avatarUrl.startsWith("http"))
      ? user.avatarUrl
      : null);

  const iconName =
    user?.avatar &&
    user.avatar !== "initial" &&
    typeof user.avatar === "string" &&
    !user.avatar.startsWith("http")
      ? user.avatar
      : user?.icon && typeof user.icon === "string" && !user.icon.startsWith("http")
      ? user.icon
      : null;

  const initial = (user?.username?.[0] || user?.displayName?.[0] || user?.name?.[0] || "U").toUpperCase();
  const bgColor = user?.avatarColor || colors.primary;

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bgColor,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        },
        style,
      ]}
    >
      {avatarUri ? (
        <Image
          source={{ uri: avatarUri }}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      ) : iconName ? (
        <Ionicons name={iconName} size={fontSize + 2} color="#000000" />
      ) : (
        <Text
          style={{
            fontFamily: fonts.bold,
            fontWeight: "700",
            fontSize: fontSize,
            color: "#000000",
            textAlign: "center",
            includeFontPadding: false,
          }}
        >
          {initial}
        </Text>
      )}
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

  const { userProfile, friends } = useUser() || {};
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
        const rtdbFeed = await getTrendingFeedRTDB();
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
      const data = await api.getHomeFeed(undefined, forceRefresh);
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
        const rtdbFeed = await getTrendingFeedRTDB();
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

  // 1. Fresh New Releases (First section on Home / All)
  const freshNewReleasesSection = useMemo(() => {
    const allSecs = feed?.sections || [];
    const found = allSecs.find(
      (s) => s.id === "new_releases" || s.title?.toLowerCase().includes("new release")
    );
    const items = found?.items || found?.tracks || allSecs[0]?.items || allSecs[0]?.tracks || [];
    if (items.length === 0) return null;
    return {
      id: "fresh_new_releases",
      title: "Fresh New Releases",
      description: "Brand new singles and albums out today",
      items,
    };
  }, [feed?.sections]);

  // 2. Daily Mix: 3-4 personal curated mix playlists based on history & favorite artists
  const dailyMixSection = useMemo(() => {
    const pool = [
      ...recentlyPlayed,
      ...allFollowingTracks,
      ...appTrending,
      ...(feed?.sections?.flatMap((s) => s.items || s.tracks || []) || []),
    ];

    if (pool.length === 0) return null;

    const uniqueMap = new Map();
    pool.forEach((t) => {
      const vid = t.videoId || t.video_id || t.id;
      if (vid && !uniqueMap.has(vid)) {
        uniqueMap.set(vid, t);
      }
    });
    const uniquePool = Array.from(uniqueMap.values());
    if (uniquePool.length < 3) return null;

    const mix1Tracks = uniquePool.slice(0, 15);
    const mix1Artists = Array.from(new Set(mix1Tracks.map((t) => t.artist).filter(Boolean))).slice(0, 3).join(", ");

    const mix2Tracks = uniquePool.slice(8, 23).length >= 5 ? uniquePool.slice(8, 23) : uniquePool.slice(0, 15);
    const mix2Artists = Array.from(new Set(mix2Tracks.map((t) => t.artist).filter(Boolean))).slice(0, 3).join(", ");

    const mix3Tracks = uniquePool.slice(16, 31).length >= 5 ? uniquePool.slice(16, 31) : uniquePool.slice(4, 19);
    const mix3Artists = Array.from(new Set(mix3Tracks.map((t) => t.artist).filter(Boolean))).slice(0, 3).join(", ");

    const mixes = [
      {
        id: "daily_mix_1",
        videoId: mix1Tracks[0]?.videoId || mix1Tracks[0]?.video_id || "mix_1",
        title: "Daily Mix 1",
        artist: mix1Artists ? `${mix1Artists} and more` : "Curated for you",
        artwork_url: mix1Tracks[0]?.artwork_url || mix1Tracks[0]?.thumbnail,
        thumbnail: mix1Tracks[0]?.thumbnail || mix1Tracks[0]?.artwork_url,
        mixTracks: mix1Tracks,
        badgeColor: "#1DB954",
      },
      {
        id: "daily_mix_2",
        videoId: mix2Tracks[0]?.videoId || mix2Tracks[0]?.video_id || "mix_2",
        title: "Daily Mix 2",
        artist: mix2Artists ? `${mix2Artists} and more` : "Curated for you",
        artwork_url: mix2Tracks[0]?.artwork_url || mix2Tracks[0]?.thumbnail,
        thumbnail: mix2Tracks[0]?.thumbnail || mix2Tracks[0]?.artwork_url,
        mixTracks: mix2Tracks,
        badgeColor: "#8C52FF",
      },
      {
        id: "daily_mix_3",
        videoId: mix3Tracks[0]?.videoId || mix3Tracks[0]?.video_id || "mix_3",
        title: "Daily Mix 3",
        artist: mix3Artists ? `${mix3Artists} and more` : "Curated for you",
        artwork_url: mix3Tracks[0]?.artwork_url || mix3Tracks[0]?.thumbnail,
        thumbnail: mix3Tracks[0]?.thumbnail || mix3Tracks[0]?.artwork_url,
        mixTracks: mix3Tracks,
        badgeColor: "#2EBDD7",
      },
    ];

    return {
      id: "daily_mix",
      title: "Daily Mix",
      description: "Made for you based on your listening",
      items: mixes,
    };
  }, [recentlyPlayed, allFollowingTracks, appTrending, feed?.sections]);

  // 3. Trending Now
  const trendingNowSection = useMemo(() => {
    const feedTrending = (feed?.sections || []).find(
      (s) => s.id === "trending_now" || s.title?.toLowerCase().includes("trending")
    );
    const items = appTrending.length > 0
      ? appTrending
      : feedTrending?.items || feedTrending?.tracks || [];

    if (items.length === 0) return null;
    return {
      id: "trending_now",
      title: "Trending Now",
      description: "Most played by listeners across the app right now",
      items,
    };
  }, [appTrending, feed?.sections]);

  // 4. Romantic Melodies Section
  const romanticMelodiesSection = useMemo(() => {
    const sec = (feed?.sections || []).find(
      (s) =>
        s.id === "romantic_melodies" ||
        s.id === "romantic_vibes" ||
        s.title?.toLowerCase().includes("romantic")
    );
    const items = sec?.items || sec?.tracks || [];
    if (items.length === 0) return null;
    return {
      id: "romantic_melodies",
      title: "Romantic Melodies",
      description: "Heartwarming Bollywood love songs and heartfelt melodies",
      items,
    };
  }, [feed?.sections]);

  // 5. Friends' Listening Activity Section
  const friendsListeningTracks = useMemo(() => {
    const list = [];
    const seen = new Set();
    Object.entries(friendsActivity || {}).forEach(([fUid, act]) => {
      if (act?.track) {
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

  // 6. Personal "Jump Back In" from user's listening history
  const jumpBackInSection = recentlyPlayed.length > 0 ? {
    id: "jump_back_in",
    title: "Jump Back In",
    description: "Pick up right where you left off",
    items: recentlyPlayed,
  } : null;

  // 7. Remaining Categorical Backend Sections (shuffled once per day)
  const daySeed = getDaySeed();
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
          section.id === "romantic_melodies" ||
          section.id === "romantic_vibes" ||
          section.title?.toLowerCase().includes("romantic")
        ) return false;
        if (
          section.id?.startsWith("mood_") ||
          section.id?.includes("morning") ||
          section.id?.includes("chill") ||
          section.title?.toLowerCase().includes("morning energy") ||
          section.title?.toLowerCase().includes("chill vibes")
        ) return false;
        return true;
      })
      .map((section) => ({
        ...section,
        items: section.items || section.tracks || [],
      }));
    return seededShuffle(raw, daySeed);
  }, [feed?.sections, daySeed]);

  // Combined Home / All Feed:
  // 1. Fresh New Releases -> 2. Daily Mix -> 3. Trending Now -> 4. Romantic Melodies -> 5. Friends are Listening To -> 6. Jump Back In -> 7. Remaining Genres
  const allDisplayedSections = [
    freshNewReleasesSection,
    dailyMixSection,
    trendingNowSection,
    romanticMelodiesSection,
    friendsListeningSection,
    jumpBackInSection,
    ...remainingBackendSections,
  ].filter(Boolean).filter((section) => section.items && section.items.length > 0);

  return (
    <View style={styles.container}>
      <Header
        activeFilter={activeFilter}
        onSelectFilter={setActiveFilter}
      />

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Fetching top charts...</Text>
        </View>
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
                    return Boolean(act?.isPlaying && act?.track);
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
                            onPress={() => setSelectedArtistForModal(name)}
                            activeOpacity={0.8}
                          >
                            {img ? (
                              <Image
                                source={{ uri: img }}
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
                      <SectionList key={section.id} section={section} sectionIndex={idx + 1} />
                    ))}
                  </View>
                )}
              </View>
            ) : (
              /* Home / All Feed: Fresh New Releases -> Daily Mix -> Trending Now -> Friends Are Listening To -> Jump Back In */
              allDisplayedSections?.map((section, idx) => (
                <SectionList key={section.id} section={section} sectionIndex={idx} />
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
    paddingTop: 8,
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
    paddingHorizontal: 4,
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
    paddingHorizontal: 4,
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
    marginHorizontal: -4,
  },
  listeningPillsScrollContent: {
    paddingHorizontal: 4,
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
    paddingHorizontal: 4,
    marginBottom: 12,
  },
});
