import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Image,
  Animated,
  Easing,
  Platform,
  LayoutAnimation,
  UIManager,
} from "react-native";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import AddToPlaylistModal from "../components/AddToPlaylistModal";
import ArtistModal from "../components/ArtistModal";
import { resolveLocalArtistImage } from "../theme/artistImages";
import { colors, fonts } from "../theme/colors";
import { api } from "../api/client";
import { useAudioPlayback } from "../context/AudioContext";
import { registerBackAction } from "../services/navigation";
import { useResponsive } from "../context/ResponsiveContext";
import { useUser } from "../context/UserContext";
import {
  auth,
  getRecentlyPlayed,
  subscribeRecentlyPlayed,
  addRecentSearch,
  getRecentSearches,
  removeRecentSearch,
  clearRecentSearches,
} from "../services/firebase";

// Spotify-style Browse Category Cards (Full solid background colors with angled cover art)
const EXPLORE_VIBES = [
  {
    id: "bollywood",
    title: "Bollywood",
    query: "Latest Bollywood Hits 2025",
    color: "#E13300",
    image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80",
  },
  {
    id: "punjabi",
    title: "Punjabi",
    query: "Trending Punjabi Songs 2025",
    color: "#BA5D07",
    image: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80",
  },
  {
    id: "pop",
    title: "Pop",
    query: "Global Pop Hits",
    color: "#8D67AB",
    image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=300&q=80",
  },
  {
    id: "romance",
    title: "Romance",
    query: "Bollywood Romantic Songs 2025",
    color: "#DC148C",
    image: "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=300&q=80",
  },
  {
    id: "indie",
    title: "Indie India",
    query: "Indian Indie Songs 2025",
    color: "#1E3264",
    image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80",
  },
  {
    id: "top50",
    title: "Top 50 India",
    query: "Top 50 India Songs",
    color: "#477D95",
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&q=80",
  },
  {
    id: "hiphop",
    title: "Desi Hip-Hop",
    query: "Desi Hip Hop Rap",
    color: "#BC5900",
    image: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=300&q=80",
  },
  {
    id: "lofi",
    title: "Lo-Fi Beats",
    query: "Hindi Lofi Chill Beats",
    color: "#503750",
    image: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&q=80",
  },
  {
    id: "workout",
    title: "Workout",
    query: "Workout Punjabi Hindi High BPM",
    color: "#E91429",
    image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=300&q=80",
  },
  {
    id: "party",
    title: "Party & Club",
    query: "Party Dance Hits 2025",
    color: "#006450",
    image: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=300&q=80",
  },
  {
    id: "devotional",
    title: "Devotional",
    query: "Devotional Spiritual Bhakti Songs",
    color: "#27856A",
    image: "https://images.unsplash.com/photo-1545128485-c400e7702796?w=300&q=80",
  },
  {
    id: "global",
    title: "Global Charts",
    query: "Global Viral Hits 2025",
    color: "#0D73EC",
    image: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=300&q=80",
  },
];

const FEATURED_ARTISTS = [
  "Arijit Singh",
  "Diljit Dosanjh",
  "Karan Aujla",
  "Shreya Ghoshal",
  "Anuv Jain",
  "AP Dhillon",
  "Yo Yo Honey Singh",
  "Pritam",
  "Atif Aslam",
  "Billie Eilish",
  "Taylor Swift",
];

const PAGE_SIZE = 25;
const LOCAL_RECENTS_KEY = "@staytup_spotify_recent_items_v3";

/**
 * Spotify Circular Plus Button - for adding track into playlist
 */
function CircularPlusButton({ track, onAddToPlaylist, style }) {
  const animScale = useRef(new Animated.Value(1)).current;
  const { isTrackInAnyPlaylist } = useUser?.() || {};
  const isInPlaylist = isTrackInAnyPlaylist ? isTrackInAnyPlaylist(track) : false;

  const handlePress = (e) => {
    e?.stopPropagation?.();
    Animated.sequence([
      Animated.timing(animScale, { toValue: 1.25, duration: 110, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(animScale, { toValue: 1, duration: 110, useNativeDriver: Platform.OS !== "web" }),
    ]).start();

    if (onAddToPlaylist) {
      onAddToPlaylist(track);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[styles.circularPlusTouch, style]}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      activeOpacity={0.7}
      accessibilityLabel={isInPlaylist ? "In playlist" : "Add to playlist"}
    >
      <Animated.View style={{ transform: [{ scale: animScale }] }}>
        <Ionicons
          name={isInPlaylist ? "checkmark-circle" : "add-circle-outline"}
          size={24}
          color={isInPlaylist ? colors.primary : "#B3B3B3"}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

/**
 * Spotify-Style Skeleton Loader (Preserves full layout geometry)
 */
function SearchSkeleton() {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.65,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  return (
    <View style={styles.skeletonContainer}>
      {/* Top Artist Skeleton */}
      <View style={styles.skeletonArtistRow}>
        <Animated.View style={[styles.skeletonCircle, { opacity: pulseAnim }]} />
        <View style={styles.skeletonTextCol}>
          <Animated.View style={[styles.skeletonLine, { width: 140, height: 16, opacity: pulseAnim }]} />
          <Animated.View style={[styles.skeletonLine, { width: 60, height: 12, marginTop: 6, opacity: pulseAnim }]} />
        </View>
      </View>

      {/* Song Skeletons */}
      {[1, 2, 3, 4, 5, 6].map((k) => (
        <View key={k} style={styles.skeletonSongRow}>
          <Animated.View style={[styles.skeletonSquare, { opacity: pulseAnim }]} />
          <View style={styles.skeletonTextCol}>
            <Animated.View style={[styles.skeletonLine, { width: 160 + (k % 3) * 35, height: 14, opacity: pulseAnim }]} />
            <Animated.View style={[styles.skeletonLine, { width: 110 + (k % 2) * 20, height: 11, marginTop: 6, opacity: pulseAnim }]} />
          </View>
          <Animated.View style={[styles.skeletonIcon, { opacity: pulseAnim }]} />
        </View>
      ))}
    </View>
  );
}

/**
 * Initial page skeleton - shows when SearchScreen first opens
 */
function SearchPageSkeleton() {
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
    <View style={styles.skeletonPageWrap}>
      {/* Recent Searches Skeleton */}
      <View style={styles.skeletonPageSection}>
        <Animated.View style={[styles.skeletonLine, { width: 130, height: 14, opacity: pulseAnim, marginBottom: 14 }]} />
        {[1, 2, 3].map((i) => (
          <View key={i} style={styles.skeletonRecentRow}>
            <Animated.View style={[styles.skeletonCircleSmall, { opacity: pulseAnim }]} />
            <Animated.View style={[styles.skeletonLine, { width: 140 + (i % 2) * 40, height: 13, opacity: pulseAnim }]} />
          </View>
        ))}
      </View>

      {/* Browse Categories Skeleton */}
      <View style={styles.skeletonPageSection}>
        <Animated.View style={[styles.skeletonLine, { width: 100, height: 14, opacity: pulseAnim, marginBottom: 14 }]} />
        <View style={styles.skeletonCategoryGrid}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Animated.View key={i} style={[styles.skeletonCategoryCard, { opacity: pulseAnim }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

export default function SearchScreen() {
  const { isDesktop, isTablet, width } = useResponsive();
  const {
    userProfile,
    openProfile,
    currentUser,
    recentlyPlayed: contextRecents,
  } = useUser() || {};

  const userInitial = (userProfile?.username?.[0] || "A").toUpperCase();
  const avatarIcon = userProfile?.avatar && userProfile.avatar !== "initial" ? userProfile.avatar : null;
  const avatarBg = userProfile?.avatarColor || colors.primary;

  // Search State
  const [query, setQuery] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [results, setResults] = useState([]);
  const [artistResults, setArtistResults] = useState([]);
  const [artistImagesMap, setArtistImagesMap] = useState({});
  const [suggestions, setSuggestions] = useState([]);
  const [selectedArtistForModal, setSelectedArtistForModal] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalLoaded, setTotalLoaded] = useState(0);
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setPageLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  // Recent items (Tracks + Queries)
  const [recentItems, setRecentItems] = useState([]);

  // Recently Played Songs (Realtime from Firebase)
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const effectiveRecentlyPlayed =
    recentlyPlayed && recentlyPlayed.length > 0
      ? recentlyPlayed
      : contextRecents && contextRecents.length > 0
      ? contextRecents
      : [];

  const { currentTrack, playTrack, isPlaying, setFullPlayerVisible } = useAudioPlayback();

  // Race condition guard & Debouncing
  const requestVersionRef = useRef(0);
  const searchTimeoutRef = useRef(null);
  const searchInputRef = useRef(null);

  // Android hardware back action for search
  useEffect(() => {
    if (isSearchActive || query) {
      return registerBackAction(() => {
        setIsSearchActive(false);
        setQuery("");
        setResults([]);
        setHasSearched(false);
        return true;
      });
    }
  }, [isSearchActive, query]);

  // Dynamically fetch official high-res photos for featured artists
  useEffect(() => {
    api
      .getBatchArtistImages(FEATURED_ARTISTS)
      .then((res) => {
        if (res?.images && Object.keys(res.images).length > 0) {
          setArtistImagesMap((prev) => ({ ...prev, ...res.images }));
        }
      })
      .catch(() => {});

    FEATURED_ARTISTS.forEach((name) => {
      api
        .getArtistImage(name)
        .then((res) => {
          const photo = res?.image || res?.image_url;
          if (
            photo &&
            !photo.includes("artist-default-music.png") &&
            !photo.includes("default_artist")
          ) {
            setArtistImagesMap((prev) => ({ ...prev, [name]: photo }));
          }
        })
        .catch(() => {});
    });
  }, []);

  // Load and subscribe to real-time Recently Played songs from Firebase RTDB
  useEffect(() => {
    const uid = currentUser?.uid || auth.currentUser?.uid || "guest";
    getRecentlyPlayed(uid)
      .then((items) => {
        if (Array.isArray(items)) {
          setRecentlyPlayed(items);
        }
      })
      .catch((e) => console.warn("Failed to get recently played songs:", e));

    const unsub = subscribeRecentlyPlayed(uid, (items) => {
      if (Array.isArray(items)) {
        setRecentlyPlayed(items);
      }
    });

    return () => {
      if (unsub) unsub();
    };
  }, [currentUser]);

  // Load recent items from localStorage / Firebase
  useEffect(() => {
    let localList = [];
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const stored = window.localStorage.getItem(LOCAL_RECENTS_KEY);
        if (stored) {
          localList = JSON.parse(stored);
        }
      } catch (_) {}
    }

    const uid = currentUser?.uid || auth.currentUser?.uid;
    if (uid) {
      getRecentSearches(uid)
        .then((items) => {
          if (Array.isArray(items) && items.length > 0) {
            const queryItems = items.map((q) => (typeof q === "string" ? { type: "query", query: q } : { type: "query", ...q }));
            // Merge query items with track items
            const seen = new Set();
            const merged = [];
            [...localList, ...queryItems].forEach((it) => {
              const k = it.videoId || it.video_id || it.id || it.query;
              if (k && !seen.has(k)) {
                seen.add(k);
                merged.push(it);
              }
            });
            setRecentItems(merged);
            return;
          }
          if (localList.length > 0) {
            setRecentItems(localList);
          }
        })
        .catch(() => {
          if (localList.length > 0) setRecentItems(localList);
        });
    } else if (localList.length > 0) {
      setRecentItems(localList);
    }
  }, [currentUser]);

  // Load and cache popular artists images from DB cache and Staytup API
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { images } = await api.getBatchArtistImages(FEATURED_ARTISTS);
        if (isMounted && images && Object.keys(images).length > 0) {
          setArtistImagesMap((prev) => ({ ...prev, ...images }));
        }
      } catch (err) {
        console.warn("Featured artists cache load error:", err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Sync recent items back to localStorage
  const persistRecentItems = (items) => {
    setRecentItems(items);
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.setItem(LOCAL_RECENTS_KEY, JSON.stringify(items.slice(0, 20)));
      } catch (_) {}
    }
  };

  const addTrackToRecent = (track) => {
    if (!track) return;
    const trackId = track.videoId || track.video_id || track.id;
    setRecentItems((prev) => {
      const filtered = prev.filter((item) => (item.videoId || item.video_id || item.id) !== trackId);
      const updated = [{ ...track, type: "track" }, ...filtered].slice(0, 20);
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          window.localStorage.setItem(LOCAL_RECENTS_KEY, JSON.stringify(updated));
        } catch (_) {}
      }
      return updated;
    });
  };

  const handleRemoveRecentItem = (itemToRemove) => {
    const targetKey = itemToRemove.videoId || itemToRemove.video_id || itemToRemove.id || itemToRemove.query;
    const updated = recentItems.filter((item) => {
      const k = item.videoId || item.video_id || item.id || item.query;
      return k !== targetKey;
    });
    persistRecentItems(updated);

    if (itemToRemove.query) {
      const uid = currentUser?.uid || auth.currentUser?.uid;
      if (uid) {
        removeRecentSearch(uid, itemToRemove.query).catch(() => {});
      }
    }
  };

  const handleClearAllRecent = () => {
    persistRecentItems([]);
    const uid = currentUser?.uid || auth.currentUser?.uid;
    if (uid) {
      clearRecentSearches(uid).catch(() => {});
    }
  };

  // Pure Staytup Saavn Search with Race Condition Protection
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setArtistResults([]);
      setSuggestions([]);
      setIsSearching(false);
      setIsLoadingMore(false);
      setHasSearched(false);
      setHasMore(true);
      setTotalLoaded(0);
      return;
    }

    // Immediately fetch autocomplete suggestions
    api.getSuggestions(trimmed).then((data) => {
      if (Array.isArray(data?.suggestions)) {
        setSuggestions(data.suggestions.slice(0, 4));
      }
    }).catch(() => {});

    setIsSearching(true);
    setHasMore(true);

    const thisVersion = ++requestVersionRef.current;

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const [searchRes, artistsRes] = await Promise.allSettled([
          api.search(trimmed, 0, PAGE_SIZE),
          api.searchArtists(trimmed, 4),
        ]);

        // Guard against race conditions: abort if user typed a newer character
        if (thisVersion !== requestVersionRef.current) {
          return;
        }

        if (searchRes.status === "fulfilled") {
          const tracks = searchRes.value?.tracks || searchRes.value?.results || [];
          setResults(tracks);
          setHasMore(Boolean(searchRes.value?.has_more));
          setTotalLoaded(searchRes.value?.total_loaded || tracks.length);
        }

        if (artistsRes.status === "fulfilled") {
          const remoteArtists = artistsRes.value?.artists || artistsRes.value?.results || [];
          const valid = remoteArtists.filter((a) => a && a.name && a.name.trim().length > 1);
          setArtistResults(valid.slice(0, 3));

          // Enrich and upload any missing artist images to database cache
          const topBatch = valid.slice(0, 3);
          if (topBatch.length > 0) {
            api
              .getBatchArtistImages(topBatch.map((a) => a.name))
              .then(({ images }) => {
                if (images && Object.keys(images).length > 0) {
                  setArtistImagesMap((prev) => ({ ...prev, ...images }));
                  setArtistResults((prev) =>
                    prev.map((art) => {
                      const resolved =
                        art.image ||
                        art.thumbnail ||
                        images[art.name] ||
                        images[art.id] ||
                        resolveLocalArtistImage(art.name);
                      return resolved ? { ...art, image: resolved, thumbnail: resolved } : art;
                    })
                  );
                }
              })
              .catch(() => {});
          }
        }

        setHasSearched(true);

        // Record query to recent searches
        const uid = auth.currentUser?.uid;
        if (uid && trimmed) {
          addRecentSearch(uid, trimmed).catch(() => {});
        }
      } catch (err) {
        console.warn("Search error:", err);
      } finally {
        if (thisVersion === requestVersionRef.current) {
          setIsSearching(false);
        }
      }
    }, 280);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query]);

  // Load more tracks for infinite scroll
  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || isSearching || !hasMore || !query.trim() || results.length === 0) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const nextOffset = results.length;
      const data = await api.search(query.trim(), nextOffset, PAGE_SIZE);
      const newTracks = data.tracks || data.results || [];

      if (newTracks.length > 0) {
        setResults((prev) => {
          const seen = new Set(prev.map((s) => s.videoId || s.video_id));
          const uniqueNew = newTracks.filter((s) => !seen.has(s.videoId || s.video_id));
          return [...prev, ...uniqueNew];
        });
        setHasMore(Boolean(data.has_more));
        setTotalLoaded(data.total_loaded || results.length + newTracks.length);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.warn("Load more error:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, isSearching, hasMore, query, results.length]);

  // Important: Playing a track must NEVER modify `query`
  const handlePlaySong = (track) => {
    addTrackToRecent(track);
    playTrack(track, [track], 0);
  };

  const handleSelectArtist = (artistName) => {
    setSelectedArtistForModal(artistName);
  };

  const handleFocusSearch = () => {
    setIsSearchActive(true);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  const handleSelectQuery = (q) => {
    handleFocusSearch();
    setQuery(q);
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const handleCancelSearch = () => {
    if (searchInputRef.current) {
      searchInputRef.current.blur();
    }
    Keyboard.dismiss();
    setQuery("");
    setIsSearchActive(false);
  };

  const isQueryActive = Boolean(query.trim());
  const topArtist = artistResults && artistResults.length > 0 ? artistResults[0] : null;

  // Effective recent items for Screenshot 2 display
  const displayRecents =
    recentItems.length > 0
      ? recentItems
      : effectiveRecentlyPlayed.slice(0, 6).map((t) => ({ ...t, type: "track" }));

  return (
    <View style={styles.container}>
      {/* 1. Header with Spotify Search Pill */}
      <View style={[styles.screenHeader, isSearchActive && styles.screenHeaderActive]}>
        <View style={[styles.innerContent, (isDesktop || isTablet) && styles.desktopInnerContent]}>
          {/* Collapsible Header Top Row: Title & Profile */}
          <View
            style={[
              styles.headerTopRow,
              isSearchActive && styles.headerTopRowHidden,
            ]}
          >
            <Text style={styles.screenTitle}>Search</Text>
            <View style={styles.headerRightGroup}>
              <TouchableOpacity
                style={styles.headerCircleBtn}
                onPress={() => {
                  handleFocusSearch();
                }}
                activeOpacity={0.75}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Open search"
              >
                <Ionicons name="search" size={17} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.profileAvatar, { backgroundColor: avatarBg }]}
                onPress={() => openProfile && openProfile()}
                activeOpacity={0.75}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {(() => {
                  const av = userProfile?.avatar;
                  if (av && av.startsWith("memoji_")) {
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
                    const src = memojiMap[av];
                    if (src) return <Image source={src} style={styles.profileAvatarImage} resizeMode="cover" />;
                  }
                  if (av && av.startsWith("http") && !av.includes("googleusercontent.com")) {
                    return <Image source={{ uri: av }} style={styles.profileAvatarImage} resizeMode="cover" />;
                  }
                  return <Text style={styles.profileAvatarText}>{userInitial}</Text>;
                })()}
              </TouchableOpacity>
            </View>
          </View>

          {/* Search Pill Row (only shown when search is active via the top header button) */}
          {isSearchActive && (
            <View style={styles.searchRowWrapper}>
              <View style={[styles.inlineSearchBox, styles.flexSearchBox, styles.liftedSearchBox]}>
                <Ionicons name="search" size={19} color="#727272" style={{ marginRight: 10 }} />
                <TextInput
                  ref={searchInputRef}
                  style={styles.inlineSearchInput}
                  placeholder="What do you want to listen to?"
                  placeholderTextColor="#777777"
                  value={query}
                  onChangeText={setQuery}
                  autoFocus={true}
                  returnKeyType="search"
                  autoCorrect={false}
                  accessibilityLabel="Search input"
                />
                {query.length > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      setQuery("");
                      searchInputRef.current?.focus();
                    }}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={styles.searchClearBtn}
                    activeOpacity={0.7}
                    accessibilityLabel="Clear search input"
                  >
                    <View style={styles.clearCircleBadge}>
                      <Ionicons name="close" size={13} color="#121212" style={styles.clearIconGlyph} />
                    </View>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={styles.cancelCircleBtn}
                onPress={handleCancelSearch}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.75}
                accessibilityLabel="Close search"
              >
                <Ionicons name="close" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* 2. Main Body Content */}
      {isQueryActive ? (
        /* ACTIVE QUERY STATE (Screenshot 1) */
        <FlatList
          style={styles.resultsList}
          contentContainerStyle={[
            styles.resultsContent,
            (isDesktop || isTablet) && styles.desktopResultsContent,
          ]}
          data={results}
          keyExtractor={(item, index) => (item.videoId || item.video_id || item.id) + "_" + index}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.8}
          ListHeaderComponent={
            <View style={{ width: "100%" }}>
              {/* Autocomplete suggestions chips (Screenshot 1) */}
              {suggestions.length > 0 && (
                <View style={styles.suggestionsContainer}>
                  {suggestions.map((sugText, sIdx) => (
                    <TouchableOpacity
                      key={sugText + "_" + sIdx}
                      style={styles.suggestionRow}
                      onPress={() => {
                        setQuery(sugText);
                        Keyboard.dismiss();
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="search" size={17} color="#999999" style={{ marginRight: 14 }} />
                      <Text style={styles.suggestionText} numberOfLines={1}>
                        {sugText}
                      </Text>
                      <TouchableOpacity
                        style={styles.diagonalArrowBtn}
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          setQuery(sugText);
                          if (searchInputRef.current) searchInputRef.current.focus();
                        }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        activeOpacity={0.7}
                        accessibilityLabel={`Fill search with ${sugText}`}
                      >
                        <Feather name="arrow-up-left" size={19} color="#999999" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Skeleton loading placeholders when starting a new search */}
              {isSearching && <SearchSkeleton />}

              {/* Top Matching Artist Spotlight (Screenshot 1) */}
              {topArtist && (() => {
                const topArtistImg =
                  topArtist.image ||
                  topArtist.thumbnail ||
                  artistImagesMap[topArtist.name] ||
                  artistImagesMap[topArtist.id] ||
                  resolveLocalArtistImage(topArtist.name) ||
                  null;
                return (
                  <TouchableOpacity
                    style={styles.topArtistCard}
                    onPress={() => handleSelectArtist(topArtist.name)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.topArtistAvatarWrap}>
                      {topArtistImg ? (
                        <Image
                          source={{ uri: topArtistImg }}
                          style={styles.topArtistAvatar}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.topArtistAvatar, styles.topArtistAvatarFallback]}>
                          <Ionicons name="person" size={26} color={colors.primary} />
                        </View>
                      )}
                    </View>
                    <View style={styles.topArtistInfoCol}>
                      <View style={styles.topArtistNameRow}>
                        <Text style={styles.topArtistName} numberOfLines={1}>
                          {topArtist.name}
                        </Text>
                        <Ionicons name="checkmark-circle" size={16} color="#3D91F4" style={styles.verifiedIcon} />
                      </View>
                      <Text style={styles.topArtistRole}>Artist</Text>
                    </View>
                  </TouchableOpacity>
                );
              })()}

              {/* Additional Matching Artists Horizontal Carousel (if multiple artists) */}
              {artistResults.length > 1 && (
                <View style={styles.moreArtistsWrap}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moreArtistsList}>
                    {artistResults.slice(1).map((art, idx) => {
                      const artImg =
                        art.image ||
                        art.thumbnail ||
                        artistImagesMap[art.name] ||
                        artistImagesMap[art.id] ||
                        resolveLocalArtistImage(art.name) ||
                        null;
                      return (
                        <TouchableOpacity
                          key={(art.id || art.name) + "_" + idx}
                          style={styles.artistPill}
                          onPress={() => handleSelectArtist(art.name)}
                          activeOpacity={0.8}
                        >
                          {artImg ? (
                            <Image source={{ uri: artImg }} style={styles.artistPillImg} />
                          ) : (
                            <View style={[styles.artistPillImg, styles.topArtistAvatarFallback]}>
                              <Ionicons name="person" size={14} color={colors.primary} />
                            </View>
                          )}
                          <Text style={styles.artistPillName} numberOfLines={1}>
                            {art.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Songs count badge */}
              {results.length > 0 && (
                <View style={styles.songsSectionHeader}>
                  <Text style={styles.songsSectionTitle}>Songs</Text>
                </View>
              )}
            </View>
          }
          renderItem={({ item, index }) => {
            const trackId = item.videoId || item.video_id || item.id;
            const isCurrent = Boolean(currentTrack?.videoId && trackId && currentTrack.videoId === trackId);
            const isThisPlaying = isCurrent && Boolean(isPlaying);
            const rawArtwork = item.artwork_url || item.thumbnail || item.image;
            const artistName = item.artist || item.primaryArtists || "Staytup";

            return (
              <TouchableOpacity
                style={[styles.spotifySongRow, isCurrent && styles.activeSongRow]}
                onPress={() => handlePlaySong(item)}
                activeOpacity={0.7}
              >
                {/* Artwork */}
                <View style={styles.spotifyArtworkWrap}>
                  {rawArtwork ? (
                    <Image source={{ uri: rawArtwork }} style={styles.spotifyArtwork} resizeMode="cover" />
                  ) : (
                    <View style={[styles.spotifyArtwork, styles.artworkFallback]}>
                      <Ionicons name="musical-note" size={20} color={colors.primary} />
                    </View>
                  )}
                  {isThisPlaying && (
                    <View style={styles.playingBadgeOverlay}>
                      <Ionicons name="volume-high" size={14} color="#1DB954" />
                    </View>
                  )}
                </View>

                {/* Info */}
                <View style={styles.spotifySongTextCol}>
                  <Text
                    style={[styles.spotifySongTitle, isCurrent && styles.activeSongTitle]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text style={styles.spotifySongSubtitle} numberOfLines={1}>
                    {`Song • ${artistName}`}
                  </Text>
                </View>

                {/* Right Action: Plus circle to add into playlist */}
                <View style={styles.spotifySongActions}>
                  <CircularPlusButton
                    track={item}
                    onAddToPlaylist={(t) => setAddToPlaylistTrack(t)}
                  />
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            !isSearching && hasSearched ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="musical-notes-outline" size={48} color="#555555" />
                <Text style={styles.emptyTitle}>No songs or artists found</Text>
                <Text style={styles.emptySub}>
                  Try searching for another artist name or song title.
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={() => (
            <View style={styles.footerContainer}>
              {isLoadingMore ? (
                <View style={styles.loadingMoreBox}>
                  {[1, 2].map((k) => (
                    <View key={k} style={styles.skeletonSongRow}>
                      <Animated.View style={[styles.skeletonSquare, { opacity: 0.4 }]} />
                      <View style={styles.skeletonTextCol}>
                        <Animated.View style={[styles.skeletonLine, { width: 160 + (k % 3) * 30, height: 14, opacity: 0.4 }]} />
                        <Animated.View style={[styles.skeletonLine, { width: 100 + (k % 2) * 20, height: 11, marginTop: 6, opacity: 0.4 }]} />
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
              <View style={{ height: isDesktop || isTablet ? 30 : 130 }} />
            </View>
          )}
        />
      ) : (
        /* EMPTY SEARCH INPUT STATE: RECENT SEARCHES (Screenshot 2) & BROWSE CATEGORIES */
        pageLoading ? (
          <SearchPageSkeleton />
        ) : (
        <ScrollView
          style={styles.mainScrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.mainScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.innerContent, (isDesktop || isTablet) && styles.desktopInnerContent]}>
            {/* Recent Searches Section (Screenshot 2) */}
            {displayRecents.length > 0 && (
              <View style={styles.recentSearchesSection}>
                <View style={styles.recentSearchesHeaderRow}>
                  <Text style={styles.recentSearchesTitle}>Recent searches</Text>
                  {displayRecents.length >= 2 && (
                    <TouchableOpacity
                      onPress={handleClearAllRecent}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.clearRecentText}>Clear</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {displayRecents.map((item, idx) => (
                  <View
                    key={(item.id || item.videoId || item.video_id || item.query) + "_" + idx}
                    style={styles.recentItemRow}
                  >
                    {item.type === "query" ? (
                      /* Query Search Row */
                      <TouchableOpacity
                        style={styles.recentQueryTouch}
                        onPress={() => handleSelectQuery(item.query)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="time-outline" size={20} color="#777777" style={{ marginRight: 14 }} />
                        <Text style={styles.recentQueryText} numberOfLines={1}>
                          {item.query}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      /* Track Row (Screenshot 2) */
                      (() => {
                        const trackId = item.videoId || item.video_id || item.id;
                        const isCurrentTrack = currentTrack && (
                          currentTrack.videoId === trackId ||
                          currentTrack.id === trackId ||
                          currentTrack.video_id === trackId
                        );
                        const isCurrentlyPlaying = isCurrentTrack && isPlaying;

                        return (
                          <TouchableOpacity
                            style={styles.recentTrackTouch}
                            onPress={() => {
                              if (isCurrentTrack) {
                                setFullPlayerVisible(true);
                              } else {
                                handlePlaySong(item);
                              }
                            }}
                            activeOpacity={0.7}
                          >
                            <View style={styles.spotifyArtworkWrap}>
                              {item.artwork_url || item.thumbnail || item.image ? (
                                <Image
                                  source={{ uri: item.artwork_url || item.thumbnail || item.image }}
                                  style={styles.spotifyArtwork}
                                />
                              ) : (
                                <View style={[styles.spotifyArtwork, styles.artworkFallback]}>
                                  <Ionicons name="musical-note" size={20} color={colors.primary} />
                                </View>
                              )}
                              {isCurrentlyPlaying && (
                                <View style={styles.playingIndicatorOverlay}>
                                  <Ionicons name="volume-high" size={14} color="#FFFFFF" />
                                </View>
                              )}
                            </View>
                            <View style={styles.spotifySongTextCol}>
                              <Text
                                style={[styles.spotifySongTitle, isCurrentlyPlaying && styles.activeSongTitle]}
                                numberOfLines={1}
                              >
                                {item.title}
                              </Text>
                              <Text style={styles.spotifySongSubtitle} numberOfLines={1}>
                                {`Song • ${item.artist || "Staytup"}`}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })()
                    )}

                    {/* Right actions: Circular plus (for track) + Remove 'x' button */}
                    <View style={styles.recentRightActions}>
                      {item.type !== "query" && (
                        <CircularPlusButton
                          track={item}
                          onAddToPlaylist={(t) => setAddToPlaylistTrack(t)}
                        />
                      )}
                      <TouchableOpacity
                        style={styles.removeRecentBtn}
                        onPress={() => handleRemoveRecentItem(item)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        activeOpacity={0.7}
                        accessibilityLabel="Remove from recent searches"
                      >
                        <Ionicons name="close" size={20} color="#888888" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Popular Artists Section */}
            <View style={styles.artistsFeaturedSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeading}>Popular Artists</Text>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.artistsCarouselList}
              >
                {FEATURED_ARTISTS.map((artistName) => {
                  const img =
                    artistImagesMap[artistName] ||
                    resolveLocalArtistImage(artistName) ||
                    null;
                  return (
                    <TouchableOpacity
                      key={artistName}
                      style={styles.featuredArtistCard}
                      onPress={() => handleSelectArtist(artistName)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.featuredArtistAvatarWrap}>
                        {img ? (
                          <Image source={{ uri: img }} style={styles.featuredArtistAvatar} />
                        ) : (
                          <View style={[styles.featuredArtistAvatar, styles.featuredArtistFallback]}>
                            <Ionicons name="person" size={26} color={colors.primary} />
                          </View>
                        )}
                      </View>
                      <Text style={styles.featuredArtistName} numberOfLines={1}>
                        {artistName}
                      </Text>
                      <Text style={styles.featuredArtistRole}>Artist</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Spotify-style Browse Category Cards */}
            <View style={styles.vibesSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeading}>Browse All</Text>
              </View>

              <View style={styles.vibesGrid}>
                {EXPLORE_VIBES.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.vibeCard,
                      {
                        backgroundColor: item.color,
                        width: isDesktop
                          ? width >= 1600
                            ? "15.7%"
                            : width >= 1200
                            ? "18.8%"
                            : "23.8%"
                          : isTablet
                          ? "31.5%"
                          : "48.2%",
                      },
                    ]}
                    onPress={() => handleSelectQuery(item.query)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.vibeCardTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Image
                      source={{ uri: item.image }}
                      style={styles.vibeCardCoverImage}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ height: isDesktop || isTablet ? 30 : 130 }} />
          </View>
        </ScrollView>
        )
      )}

      {/* Add To Playlist Modal */}
      <AddToPlaylistModal
        visible={!!addToPlaylistTrack}
        onClose={() => setAddToPlaylistTrack(null)}
        track={addToPlaylistTrack}
      />

      {/* Artist Profile & Discography Modal */}
      <ArtistModal
        visible={!!selectedArtistForModal}
        onClose={() => setSelectedArtistForModal(null)}
        artistName={selectedArtistForModal}
        initialPhoto={
          selectedArtistForModal
            ? artistImagesMap[selectedArtistForModal] ||
              resolveLocalArtistImage(selectedArtistForModal) ||
              null
            : null
        }
        onSelectArtist={(name) => setSelectedArtistForModal(name)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  screenHeader: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "web" ? 12 : 14,
    paddingBottom: 14,
    backgroundColor: "#000000",
  },
  screenHeaderActive: {
    paddingBottom: 10,
  },
  searchRowWrapper: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    height: 38,
  },
  flexSearchBox: {
    flex: 1,
  },
  liftedSearchBox: {
    height: 34,
    borderRadius: 17,
    backgroundColor: "#1c1c1c",
    borderColor: "rgba(255, 255, 255, 0.12)",
    paddingLeft: 10,
    paddingRight: 6,
  },
  cancelCircleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
    flexShrink: 0,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  innerContent: {
    width: "100%",
  },
  desktopInnerContent: {
    width: "100%",
    paddingHorizontal: 16,
  },
  headerTopRow: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
    overflow: "hidden",
  },
  headerTopRowHidden: {
    height: 0,
    opacity: 0,
    marginBottom: 0,
    pointerEvents: "none",
  },
  screenTitle: {
    fontFamily: fonts.bold,
    fontSize: 26,
    color: "#FFFFFF",
    letterSpacing: -0.4,
  },
  headerRightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerCircleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  profileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  profileAvatarImage: {
    width: "100%",
    height: "100%",
  },
  profileAvatarText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
  },
  inlineSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161616",
    borderRadius: 17,
    paddingLeft: 12,
    paddingRight: 6,
    height: 34,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.09)",
  },
  inlineSearchInput: {
    flex: 1,
    fontFamily: fonts.medium,
    color: "#FFFFFF",
    fontSize: 13.5,
    height: "100%",
    paddingVertical: 0,
    paddingHorizontal: 0,
    margin: 0,
    minWidth: 0,
    ...(Platform.OS === "web"
      ? {
          outlineStyle: "none",
          borderWidth: 0,
          backgroundColor: "transparent",
        }
      : {}),
  },
  searchClearBtn: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    marginRight: 2,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  clearCircleBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#8E8E93",
    alignItems: "center",
    justifyContent: "center",
  },
  clearIconGlyph: {
    marginTop: Platform.OS === "android" ? -1 : 0,
  },

  // Autocomplete Suggestions Chips (Screenshot 1)
  suggestionsContainer: {
    paddingVertical: 4,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  suggestionText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: "#FFFFFF",
  },
  diagonalArrowBtn: {
    padding: 6,
    justifyContent: "center",
    alignItems: "center",
  },

  // Top Artist Spotlight (Screenshot 1)
  topArtistCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  topArtistAvatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#222222",
    marginRight: 14,
  },
  topArtistAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  topArtistAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#222222",
  },
  topArtistInfoCol: {
    flex: 1,
    justifyContent: "center",
  },
  topArtistNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  topArtistName: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: "#FFFFFF",
    marginRight: 6,
  },
  verifiedIcon: {
    marginTop: 1,
  },
  topArtistRole: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: "#A7A7A7",
  },

  // Additional Artist Pills
  moreArtistsWrap: {
    marginBottom: 14,
  },
  moreArtistsList: {
    gap: 8,
    paddingVertical: 4,
  },
  artistPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    gap: 8,
  },
  artistPillImg: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  artistPillName: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#FFFFFF",
  },

  // Songs Section Header
  songsSectionHeader: {
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  songsSectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: "#FFFFFF",
  },

  // Spotify Song Row (Screenshot 1)
  spotifySongRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  activeSongRow: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  spotifyArtworkWrap: {
    width: 48,
    height: 48,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#242424",
    marginRight: 14,
    position: "relative",
  },
  spotifyArtwork: {
    width: 48,
    height: 48,
    borderRadius: 6,
  },
  artworkFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  playingBadgeOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  spotifySongTextCol: {
    flex: 1,
    justifyContent: "center",
    paddingRight: 10,
  },
  spotifySongTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: "#FFFFFF",
    marginBottom: 4,
  },
  activeSongTitle: {
    color: "#1DB954",
  },
  playingIndicatorOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#1DB954",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#000000",
  },
  spotifySongSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: "#A7A7A7",
  },
  spotifySongActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  moreIconBtn: {
    padding: 6,
  },
  circularPlusTouch: {
    padding: 4,
  },

  // Recent Searches Section (Screenshot 2)
  recentSearchesSection: {
    marginBottom: 28,
  },
  recentSearchesHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  recentSearchesTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  clearRecentText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#A7A7A7",
  },
  recentItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  recentTrackTouch: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  recentQueryTouch: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  recentQueryText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: "#FFFFFF",
  },
  recentRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  removeRecentBtn: {
    padding: 6,
  },

  // Skeleton Styles
  skeletonContainer: {
    paddingVertical: 8,
  },
  skeletonArtistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    marginBottom: 10,
  },
  skeletonCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#222222",
    marginRight: 14,
  },
  skeletonSongRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  skeletonSquare: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: "#222222",
    marginRight: 14,
  },
  skeletonTextCol: {
    flex: 1,
  },
  skeletonLine: {
    backgroundColor: "#222222",
    borderRadius: 4,
  },
  skeletonIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#222222",
  },

  // Popular Artists Carousel
  artistsFeaturedSection: {
    marginBottom: 28,
  },
  sectionHeading: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: "#FFFFFF",
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  artistsCarouselList: {
    gap: 16,
    paddingVertical: 4,
  },
  featuredArtistCard: {
    alignItems: "center",
    width: 88,
  },
  featuredArtistAvatarWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    marginBottom: 8,
    overflow: "hidden",
    backgroundColor: "#181818",
  },
  featuredArtistAvatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  featuredArtistFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  featuredArtistName: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: "#FFFFFF",
    textAlign: "center",
    width: "100%",
  },
  featuredArtistRole: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: "#A7A7A7",
    textAlign: "center",
    marginTop: 2,
  },

  // Browse All Vibes
  vibesSection: {
    marginBottom: 20,
  },
  vibesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  vibeCard: {
    height: 104,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
    padding: 12,
    justifyContent: "flex-start",
  },
  vibeCardTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
    lineHeight: 21,
    maxWidth: "65%",
    letterSpacing: -0.2,
  },
  vibeCardCoverImage: {
    position: "absolute",
    bottom: -6,
    right: -10,
    width: 66,
    height: 66,
    borderRadius: 6,
    transform: [{ rotate: "25deg" }],
    ...(Platform.OS === "web"
      ? {
          boxShadow: "-2px 4px 10px rgba(0, 0, 0, 0.4)",
        }
      : {
          shadowColor: "#000000",
          shadowOffset: { width: -2, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 6,
          elevation: 5,
        }),
  },

  // Results & Scroll Content
  mainScrollView: {
    flex: 1,
  },
  mainScrollContent: {
    paddingTop: 4,
    paddingHorizontal: 16,
  },
  resultsList: {
    flex: 1,
    width: "100%",
  },
  resultsContent: {
    width: "100%",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 80,
  },
  desktopResultsContent: {
    paddingHorizontal: 32,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: "#FFFFFF",
    marginTop: 14,
  },
  emptySub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: "#A7A7A7",
    textAlign: "center",
    marginTop: 6,
    maxWidth: 280,
  },
  footerContainer: {
    paddingVertical: 16,
    alignItems: "center",
  },
  loadingMoreBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  loadingMoreText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#A7A7A7",
  },

  // Page Skeleton Styles
  skeletonPageWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  skeletonPageSection: {
    marginBottom: 28,
  },
  skeletonRecentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 10,
  },
  skeletonCircleSmall: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#222222",
  },
  skeletonCategoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  skeletonCategoryCard: {
    width: "47%",
    height: 90,
    borderRadius: 12,
    backgroundColor: "#222222",
  },
});
