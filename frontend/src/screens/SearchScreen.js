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
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import SongCard from "../components/SongCard";
import AddToPlaylistModal from "../components/AddToPlaylistModal";
import ArtistModal from "../components/ArtistModal";
import { DEFAULT_ARTIST_IMAGES, resolveLocalArtistImage } from "../theme/artistImages";
import { colors, fonts } from "../theme/colors";
import { api } from "../api/client";
import { useAudio } from "../context/AudioContext";
import { useResponsive } from "../context/ResponsiveContext";
import { useUser } from "../context/UserContext";
import { auth, getRecentlyPlayed, subscribeRecentlyPlayed, addRecentSearch, getRecentSearches, removeRecentSearch, clearRecentSearches } from "../services/firebase";

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

const TRENDING_QUERIES = [
  "Shararat",
  "Tauba Tauba",
  "Arijit Singh",
  "Diljit Dosanjh",
  "Big Dawgs",
  "Die With A Smile",
  "Karan Aujla",
  "Millionaire",
  "Anuv Jain",
  "Aaj Ki Raat",
];

const PAGE_SIZE = 25;

export default function SearchScreen() {
  const { isDesktop, isTablet, isPhone, width } = useResponsive();
  const { userProfile, isFavoriteArtist, toggleFavoriteArtist, openProfile, currentUser, recentlyPlayed: contextRecents } = useUser() || {};
  const userInitial = (userProfile?.username?.[0] || "A").toUpperCase();
  const avatarIcon = userProfile?.avatar && userProfile.avatar !== "initial" ? userProfile.avatar : null;
  const avatarBg = userProfile?.avatarColor || colors.primary;

  // Search State (Inline, no modal)
  const [query, setQuery] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [results, setResults] = useState([]);
  const [artistResults, setArtistResults] = useState([]);
  const [selectedArtistForModal, setSelectedArtistForModal] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalLoaded, setTotalLoaded] = useState(0);
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState(null);
  const [recentSearches, setRecentSearches] = useState([]);

  // Recently Played Songs (Realtime from Firebase + Local Cache)
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const effectiveRecentlyPlayed = (recentlyPlayed && recentlyPlayed.length > 0)
    ? recentlyPlayed
    : (contextRecents && contextRecents.length > 0 ? contextRecents : []);

  const { currentTrack, playTrack } = useAudio();
  const searchTimeoutRef = useRef(null);
  const searchInputRef = useRef(null);

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

  // Load recent search queries from Firebase
  useEffect(() => {
    const uid = currentUser?.uid || auth.currentUser?.uid;
    if (!uid) return;
    getRecentSearches(uid).then((items) => {
      setRecentSearches(Array.isArray(items) ? items : []);
    }).catch(() => {});
  }, [currentUser]);

  // Debounced search when query changes
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      setArtistResults([]);
      setIsSearching(false);
      setIsLoadingMore(false);
      setHasSearched(false);
      setHasMore(true);
      setTotalLoaded(0);
      return;
    }

    const cleanQ = query.trim().toLowerCase();
    // Instant local matches from cached artist images
    const localMatches = Object.keys(DEFAULT_ARTIST_IMAGES)
      .filter((name) => name.toLowerCase().includes(cleanQ))
      .slice(0, 6)
      .map((name) => ({
        name,
        thumbnail: DEFAULT_ARTIST_IMAGES[name],
      }));
    if (localMatches.length > 0) {
      setArtistResults(localMatches);
    }

    setIsSearching(true);
    setHasMore(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const [searchRes, artistsRes] = await Promise.allSettled([
          api.search(query.trim(), 0, PAGE_SIZE),
          api.searchArtists(query.trim(), 6),
        ]);

        if (searchRes.status === "fulfilled") {
          const tracks = searchRes.value?.tracks || searchRes.value?.results || [];
          setResults(tracks);
          setHasMore(Boolean(searchRes.value?.has_more));
          setTotalLoaded(searchRes.value?.total_loaded || tracks.length);
        }

        if (artistsRes.status === "fulfilled") {
          const remoteArtists = artistsRes.value?.artists || [];
          const seen = new Set();
          const merged = [];
          [...remoteArtists, ...localMatches].forEach((a) => {
            const key = a.name.toLowerCase();
            if (!seen.has(key)) {
              seen.add(key);
              merged.push({
                ...a,
                thumbnail: a.thumbnail || DEFAULT_ARTIST_IMAGES[a.name] || null,
              });
            }
          });
          setArtistResults(merged.slice(0, 6));
        }

        setHasSearched(true);

        // Persist this search query to Firebase
        const uid = auth.currentUser?.uid;
        if (uid && query.trim()) {
          addRecentSearch(uid, query.trim()).then(() => {
            getRecentSearches(uid).then((items) => {
              setRecentSearches(Array.isArray(items) ? items : []);
            }).catch(() => {});
          }).catch(() => {});
        }
      } catch (err) {
        console.warn("Search error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 320);

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

  const handlePlaySong = (track, index, trackList = results) => {
    playTrack(track, trackList, index);
  };

  const handleSelectArtist = (artistName) => {
    setSelectedArtistForModal(artistName);
  };

  const handleFocusSearch = () => {
    if (Platform.OS !== "web" && UIManager?.setLayoutAnimationEnabledExperimental) {
      try {
        UIManager.setLayoutAnimationEnabledExperimental(true);
      } catch (e) {}
    }
    if (Platform.OS !== "web") {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setIsSearchActive(true);
  };

  const handleSelectQuery = (q) => {
    handleFocusSearch();
    setQuery(q);
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const handleCancelSearch = () => {
    if (Platform.OS !== "web") {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setQuery("");
    setIsSearchActive(false);
    if (searchInputRef.current) {
      searchInputRef.current.blur();
    }
    Keyboard.dismiss();
  };

  const renderFooter = () => {
    if (results.length === 0) return <View style={{ height: isDesktop || isTablet ? 30 : 130 }} />;

    return (
      <View style={styles.footerContainer}>
        {isLoadingMore ? (
          <View style={styles.loadingMoreBox}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingMoreText}>Loading more songs...</Text>
          </View>
        ) : hasMore ? (
          <TouchableOpacity
            style={styles.loadMoreButton}
            onPress={handleLoadMore}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-down-circle" size={17} color={colors.primary} />
            <Text style={styles.loadMoreText}>
              Load More Songs ({results.length} loaded)
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.endOfResultsBox}>
            <Ionicons name="checkmark-circle-outline" size={16} color={colors.primary} />
            <Text style={styles.endOfResultsText}>
              All {results.length} songs loaded from catalog
            </Text>
          </View>
        )}
        <View style={{ height: isDesktop || isTablet ? 30 : 130 }} />
      </View>
    );
  };

  const isQueryActive = Boolean(query.trim());

  return (
    <View style={styles.container}>
      {/* Top Header with Inline Search Bar */}
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
            <TouchableOpacity
              style={[styles.profileAvatar, { backgroundColor: avatarBg }]}
              onPress={() => openProfile && openProfile()}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {avatarIcon && avatarIcon.startsWith("http") ? (
                <Image
                  source={{ uri: avatarIcon }}
                  style={styles.profileAvatarImage}
                  resizeMode="cover"
                />
              ) : avatarIcon ? (
                <Ionicons name={avatarIcon} size={16} color="#000000" />
              ) : (
                <Text style={styles.profileAvatarText}>{userInitial}</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Unified Search Input Bar that smoothly lifts up */}
          <View style={styles.searchRowWrapper}>
            <View style={[styles.inlineSearchBox, styles.flexSearchBox, isSearchActive && styles.liftedSearchBox]}>
              <Ionicons name="search" size={19} color={colors.textMuted} style={{ marginRight: 10 }} />
              <TextInput
                ref={searchInputRef}
                style={styles.inlineSearchInput}
                placeholder="What do you want to listen to?"
                placeholderTextColor="#777777"
                value={query}
                onChangeText={setQuery}
                onFocus={handleFocusSearch}
                returnKeyType="search"
                autoCorrect={false}
                accessibilityLabel="Search input"
              />
              {isSearching ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ flexShrink: 0, marginRight: 6 }} />
              ) : query.length > 0 ? (
                <TouchableOpacity
                  onPress={() => setQuery("")}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{ flexShrink: 0, padding: 4, marginRight: 8 }}
                >
                  <Ionicons name="close-circle" size={18} color="#888888" />
                </TouchableOpacity>
              ) : null}
            </View>

            {isSearchActive && (
              <TouchableOpacity
                style={styles.cancelSearchBtn}
                onPress={handleCancelSearch}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelSearchText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Main Content Area */}
      {isQueryActive ? (
        /* LIVE SEARCH RESULTS (Inline FlatList) */
        <FlatList
          style={styles.resultsList}
          contentContainerStyle={[
            styles.resultsContent,
            (isDesktop || isTablet) && styles.desktopResultsContent,
          ]}
          data={results}
          keyExtractor={(item, index) => (item.videoId || item.video_id) + "_" + index}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.8}
          ListHeaderComponent={
            <View style={{ width: "100%" }}>
              {/* Artist Matching Section */}
              {artistResults.length > 0 && (
                <View style={[styles.artistsSection, (isDesktop || isTablet) && styles.desktopArtistsSection]}>
                  <View style={styles.artistsHeaderRow}>
                    <Text style={styles.artistsSectionTitle}>Artists</Text>
                    {(isDesktop || isTablet) && (
                      <Text style={styles.artistsSectionSub}>Matching your search</Text>
                    )}
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={[
                      styles.artistsScrollList,
                      (isDesktop || isTablet) && styles.desktopArtistsScrollList,
                    ]}
                  >
                    {artistResults.map((artist, idx) => {
                      const isFav = isFavoriteArtist ? isFavoriteArtist(artist.name) : false;
                      const resolvedImg = resolveLocalArtistImage(artist.name, artist.thumbnail);
                      return (
                        <TouchableOpacity
                          key={artist.name + "_" + idx}
                          style={[styles.artistCard, (isDesktop || isTablet) && styles.desktopArtistCard]}
                          onPress={() => handleSelectArtist(artist.name)}
                          activeOpacity={0.8}
                        >
                          <View
                            style={[
                              styles.artistAvatarWrap,
                              (isDesktop || isTablet) && styles.desktopArtistAvatarWrap,
                            ]}
                          >
                            {resolvedImg ? (
                              <Image
                                source={{ uri: resolvedImg }}
                                style={[
                                  styles.artistAvatar,
                                  (isDesktop || isTablet) && styles.desktopArtistAvatar,
                                ]}
                              />
                            ) : (
                              <View
                                style={[
                                  styles.artistAvatar,
                                  styles.artistAvatarFallback,
                                  (isDesktop || isTablet) && styles.desktopArtistAvatar,
                                ]}
                              >
                                <Ionicons name="person" size={isDesktop ? 34 : 28} color={colors.primary} />
                              </View>
                            )}
                            <TouchableOpacity
                              style={[
                                styles.artistFavBadge,
                                (isDesktop || isTablet) && styles.desktopArtistFavBadge,
                                isFav && styles.artistFavBadgeActive,
                              ]}
                              onPress={(e) => {
                                e.stopPropagation && e.stopPropagation();
                                toggleFavoriteArtist &&
                                  toggleFavoriteArtist(artist.name, artist.thumbnail);
                              }}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              activeOpacity={0.7}
                            >
                              <Ionicons
                                name={isFav ? "heart" : "heart-outline"}
                                size={15}
                                color={isFav ? colors.primary : "#FFFFFF"}
                              />
                            </TouchableOpacity>
                          </View>
                          <Text
                            style={[
                              styles.artistCardName,
                              (isDesktop || isTablet) && styles.desktopArtistCardName,
                            ]}
                            numberOfLines={1}
                          >
                            {artist.name}
                          </Text>
                          <Text style={styles.artistCardRole}>Artist</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {results.length > 0 && (
                <View style={styles.countBadgeRow}>
                  <Text style={styles.countBadgeText}>
                    Found <Text style={styles.highlightNumber}>{results.length}</Text> songs for{" "}
                    <Text style={styles.highlightQuery}>"{query}"</Text>
                  </Text>
                  {hasMore && <Text style={styles.scrollTipText}>Scroll for more</Text>}
                </View>
              )}

              {/* Table Column Headers on Desktop */}
              {(isDesktop || isTablet) && results.length > 0 && (
                <View style={styles.desktopTableHeader}>
                  <View style={styles.desktopTableColIndex}>
                    <Text style={styles.desktopTableHeaderText}>#</Text>
                  </View>
                  <View style={styles.desktopTableColTitle}>
                    <Text style={styles.desktopTableHeaderText}>TITLE</Text>
                  </View>
                  {isDesktop && (
                    <View style={styles.desktopTableColAlbum}>
                      <Text style={styles.desktopTableHeaderText}>ALBUM</Text>
                    </View>
                  )}
                  <View style={styles.desktopTableColAction}>
                    <MaterialCommunityIcons name="playlist-plus" size={18} color={colors.textMuted} />
                  </View>
                </View>
              )}
            </View>
          }
          renderItem={({ item, index }) => (
            <SongCard
              track={item}
              index={index + 1}
              layout="row"
              isActive={currentTrack?.videoId === (item.videoId || item.video_id)}
              showDuration={false}
              showPlayButton={false}
              onAddToPlaylist={(t) => setAddToPlaylistTrack(t)}
              onPress={() => handlePlaySong(item, index, results)}
            />
          )}
          ListEmptyComponent={
            !isSearching && hasSearched ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="musical-notes-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>No songs or artists found</Text>
                <Text style={styles.emptySub}>
                  Try searching for another artist name or song title.
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={renderFooter}
        />
      ) : isSearchActive ? (
        /* SEARCH FOCUSED STATE: RECENT SEARCHES */
        <ScrollView
          style={styles.mainScrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.mainScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.innerContent, (isDesktop || isTablet) && styles.desktopInnerContent]}>
            {recentSearches.length > 0 ? (
              <View>
                <Text style={styles.recentSearchesTitle}>Recent Searches</Text>
                {recentSearches.map((item, idx) => (
                  <TouchableOpacity
                    key={item.query + "_" + idx}
                    style={styles.recentSearchRow}
                    onPress={() => {
                      setQuery(item.query);
                      if (searchInputRef.current) searchInputRef.current.focus();
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="list-outline"
                      size={18}
                      color={colors.textSecondary || "rgba(255,255,255,0.5)"}
                      style={{ marginRight: 14 }}
                    />
                    <Text style={styles.recentSearchText} numberOfLines={1}>
                      {item.query}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        const uid = auth.currentUser?.uid;
                        if (uid) {
                          removeRecentSearch(uid, item.query).catch(() => {});
                        }
                        setRecentSearches((prev) => prev.filter((s) => s.query !== item.query));
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={{ padding: 4 }}
                    >
                      <Ionicons
                        name="close"
                        size={18}
                        color={colors.textSecondary || "rgba(255,255,255,0.5)"}
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
                {recentSearches.length >= 20 && (
                  <TouchableOpacity
                    style={styles.clearAllPill}
                    onPress={() => {
                      const uid = auth.currentUser?.uid;
                      if (uid) clearRecentSearches(uid).catch(() => {});
                      setRecentSearches([]);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.clearAllText}>Clear All</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.emptyRecentSearchBox}>
                <Ionicons name="search-outline" size={40} color={colors.textMuted} />
                <Text style={styles.emptyRecentSearchText}>Search for songs, artists, or albums</Text>
              </View>
            )}
          </View>
        </ScrollView>
      ) : (
        /* DEFAULT STATE: RECENTLY PLAYED SONGS (CARDS) & EXPLORE / BROWSE CATEGORIES */
        <ScrollView
          style={styles.mainScrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.mainScrollContent}
        >
          <View style={[styles.innerContent, (isDesktop || isTablet) && styles.desktopInnerContent]}>
            {/* Recently Played Songs Section (Song cards stored in Firebase / Local Cache) */}
            {effectiveRecentlyPlayed.length > 0 && (
              <View style={styles.recentlyPlayedSection}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeading}>Recently Played</Text>
                  <Text style={styles.sectionSubheading}>Songs you played</Text>
                </View>

                {isDesktop || isTablet ? (
                  /* Desktop / Tablet Grid of Song Cards */
                  <View style={styles.recentCardsGrid}>
                    {effectiveRecentlyPlayed.slice(0, 10).map((song, idx) => (
                      <SongCard
                        key={(song.videoId || song.video_id || "recent") + "_" + idx}
                        track={song}
                        layout="card"
                        isActive={currentTrack?.videoId === (song.videoId || song.video_id)}
                        onAddToPlaylist={(t) => setAddToPlaylistTrack(t)}
                        onPress={() => handlePlaySong(song, idx, effectiveRecentlyPlayed)}
                      />
                    ))}
                  </View>
                ) : (
                  /* Phone Horizontal Carousel of Song Cards */
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.recentHorizontalScroll}
                  >
                    {effectiveRecentlyPlayed.slice(0, 10).map((song, idx) => (
                      <SongCard
                        key={(song.videoId || song.video_id || "recent") + "_" + idx}
                        track={song}
                        layout="card"
                        isActive={currentTrack?.videoId === (song.videoId || song.video_id)}
                        onAddToPlaylist={(t) => setAddToPlaylistTrack(t)}
                        onPress={() => handlePlaySong(song, idx, effectiveRecentlyPlayed)}
                      />
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {/* Featured Artists Section */}
            <View style={styles.artistsFeaturedSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeading}>Popular Artists</Text>
                <Text style={styles.sectionSubheading}>Explore discography</Text>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.artistsCarouselList}
              >
                {FEATURED_ARTISTS.map((artistName) => {
                  const img =
                    resolveLocalArtistImage(artistName) || DEFAULT_ARTIST_IMAGES[artistName];
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
                          <View
                            style={[styles.featuredArtistAvatar, styles.featuredArtistFallback]}
                          >
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
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
    ...(Platform.OS === "web"
      ? {
          transition: "padding 0.25s cubic-bezier(0.2, 0, 0, 1)",
        }
      : {}),
  },
  screenHeaderActive: {
    paddingBottom: 10,
  },
  searchRowWrapper: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  flexSearchBox: {
    flex: 1,
    ...(Platform.OS === "web"
      ? {
          transition: "height 0.25s cubic-bezier(0.2, 0, 0, 1), background-color 0.2s ease",
        }
      : {}),
  },
  liftedSearchBox: {
    height: 48,
    backgroundColor: "#1c1c1c",
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  cancelSearchBtn: {
    marginLeft: 12,
    paddingVertical: 6,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  cancelSearchText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  lastSearchSection: {
    marginTop: 6,
    marginBottom: 24,
  },
  lastSearchList: {
    width: "100%",
  },
  emptyRecentSearchBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 70,
  },
  emptyRecentSearchText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 12,
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
    marginBottom: 12,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? {
          transition:
            "height 0.26s cubic-bezier(0.2, 0, 0, 1), opacity 0.2s cubic-bezier(0.2, 0, 0, 1), margin-bottom 0.26s cubic-bezier(0.2, 0, 0, 1)",
        }
      : {}),
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
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.09)",
  },
  inlineSearchInput: {
    flex: 1,
    fontFamily: fonts.medium,
    color: "#FFFFFF",
    fontSize: 15,
    height: "100%",
    paddingVertical: 0,
    paddingHorizontal: 0,
    margin: 0,
    ...(Platform.OS === "web"
      ? {
          outlineStyle: "none",
          borderWidth: 0,
          backgroundColor: "transparent",
        }
      : {}),
  },

  // Main Scroll View
  mainScrollView: {
    flex: 1,
  },
  mainScrollContent: {
    paddingTop: 14,
    paddingHorizontal: 16,
  },

  // Recently Played Songs Section
  recentlyPlayedSection: {
    marginBottom: 28,
  },
  recentCardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    paddingVertical: 4,
  },
  recentHorizontalScroll: {
    gap: 14,
    paddingVertical: 4,
  },

  // Quick Chips
  quickChipsSection: {
    marginBottom: 24,
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
  sectionSubheading: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  chipsScrollList: {
    gap: 8,
  },
  queryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
  },
  queryChipText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#FFFFFF",
  },

  // Featured Artists
  artistsFeaturedSection: {
    marginBottom: 28,
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
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 2,
  },

  // Unique Vibe & Mood Cards
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

  // Live Results List
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

  // Results View Header
  countBadgeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  countBadgeText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  highlightNumber: {
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  highlightQuery: {
    fontFamily: fonts.semiBold,
    color: "#FFFFFF",
  },
  scrollTipText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.primary,
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
    color: colors.textSecondary,
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
    color: colors.textSecondary,
  },
  loadMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  loadMoreText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: "#FFFFFF",
  },
  endOfResultsBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  endOfResultsText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textMuted,
  },

  // Table Column Headers on Desktop
  desktopTableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    marginBottom: 6,
    width: "100%",
  },
  desktopTableColIndex: {
    width: 34,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  desktopTableColTitle: {
    flex: 4,
    paddingLeft: 62,
    marginRight: 16,
  },
  desktopTableColAlbum: {
    flex: 3,
    paddingRight: 16,
  },
  desktopTableColAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    minWidth: 90,
  },
  desktopTableHeaderText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1,
  },

  // Artists in Modal Results
  artistsSection: {
    paddingTop: 8,
    paddingBottom: 14,
  },
  desktopArtistsSection: {
    paddingTop: 16,
    paddingBottom: 22,
  },
  artistsHeaderRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  artistsSectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: "#FFFFFF",
  },
  artistsSectionSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  artistsScrollList: {
    gap: 14,
    paddingVertical: 4,
  },
  desktopArtistsScrollList: {
    gap: 20,
    paddingVertical: 8,
  },
  artistCard: {
    alignItems: "center",
    width: 96,
  },
  desktopArtistCard: {
    width: 124,
    alignItems: "center",
  },
  artistAvatarWrap: {
    width: 82,
    height: 82,
    borderRadius: 41,
    position: "relative",
    marginBottom: 8,
    backgroundColor: "#181818",
  },
  desktopArtistAvatarWrap: {
    width: 104,
    height: 104,
    borderRadius: 52,
    marginBottom: 10,
  },
  artistAvatar: {
    width: 82,
    height: 82,
    borderRadius: 41,
  },
  desktopArtistAvatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
  },
  artistAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  artistFavBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#1F1F1F",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#000000",
  },
  desktopArtistFavBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  artistFavBadgeActive: {
    backgroundColor: "rgba(29, 185, 84, 0.2)",
    borderColor: colors.primary,
  },
  artistCardName: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: "#FFFFFF",
    textAlign: "center",
    width: "100%",
  },
  desktopArtistCardName: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: "#FFFFFF",
    textAlign: "center",
    width: "100%",
  },
  artistCardRole: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 2,
  },
  // ── Recent Searches ──────────────────────────────────────────────────────
  recentSearchesTitle: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 4,
    marginTop: 8,
    textTransform: "uppercase",
    opacity: 0.5,
  },
  recentSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  recentSearchText: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: fonts.regular,
  },
  clearAllPill: {
    alignSelf: "center",
    marginTop: 24,
    marginBottom: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 28,
    paddingVertical: 11,
    borderRadius: 50,
  },
  clearAllText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});

