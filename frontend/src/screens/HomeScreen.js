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
import { Ionicons } from "@expo/vector-icons";
import Header from "../components/Header";
import SectionList from "../components/SectionList";
import SongCard from "../components/SongCard";
import { colors, fonts } from "../theme/colors";
import { api } from "../api/client";
import { useAudio } from "../context/AudioContext";
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

export default function HomeScreen() {
  const { isDesktop, isTablet, isPhone } = useResponsive();
  const [feed, setFeed] = useState(null);
  const feedRef = useRef(null);
  const [activeFilter, setActiveFilter] = useState("All");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const { userProfile } = useUser() || {};
  const favoriteArtists = userProfile?.favoriteArtists || userProfile?.favorite_artists || [];
  const [followingSections, setFollowingSections] = useState([]);
  const [followingQuickItems, setFollowingQuickItems] = useState([]);
  const [allFollowingTracks, setAllFollowingTracks] = useState([]);
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const [appTrending, setAppTrending] = useState([]);
  const [artistImages, setArtistImages] = useState({});

  const { currentTrack, isPlaying, togglePlayPause, playTrack } = useAudio();

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

  // Fetch artist images for followed artists
  useEffect(() => {
    if (favoriteArtists.length === 0) return;
    const missing = favoriteArtists.filter(
      (name) => !artistImages[name] && !DEFAULT_ARTIST_IMAGES[name]
    );
    if (missing.length === 0) return;
    api.getBatchArtistImages(missing.slice(0, 6)).then((res) => {
      if (res && res.images && Object.keys(res.images).length > 0) {
        setArtistImages((prev) => ({ ...prev, ...res.images }));
      }
    }).catch(() => {});
  }, [favoriteArtists]);

  // 1. Personal "Jump Back In" from user's listening history
  const jumpBackInSection = recentlyPlayed.length > 0 ? {
    id: "jump_back_in",
    title: "Jump Back In",
    description: "Pick up right where you left off",
    items: recentlyPlayed,
  } : null;

  // 2. Community "Trending on Staytup" from real playback counts in Firebase across all profiles
  const appTrendingSection = appTrending.length > 0 ? {
    id: "app_trending",
    title: "Trending on Staytup",
    description: "Most played by listeners across the app right now",
    items: appTrending,
  } : null;

  // 3. Filter & normalize backend sections: map tracks -> items, remove stale/empty sections
  // 4. Daily seeded shuffle — sections reorder once per day based on date seed (memoized to prevent render glitch)
  const daySeed = getDaySeed();
  const shuffledBackendSections = useMemo(() => {
    const raw = (feed?.sections || [])
      .filter((section) => {
        const tracks = section.tracks || section.items || [];
        if (!section || tracks.length === 0) return false;
        if (section.id === "trending_global" || section.title?.toLowerCase().includes("global")) return false;
        if (section.id === "trending_india" || section.title?.toLowerCase().includes("youtube india")) return false;
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

  const allDisplayedSections = [
    jumpBackInSection,
    appTrendingSection,
    ...shuffledBackendSections,
  ].filter(Boolean).filter((section) => section.items && section.items.length > 0);

  // Quick 6-Grid items for Spotify top row:
  // Priority: 1. User's recently played history (Jump Back In) -> 2. App trending tracks -> 3. Suggested tracks
  const quickItems = (recentlyPlayed.length > 0
    ? recentlyPlayed.slice(0, 6)
    : appTrending.length > 0
    ? appTrending.slice(0, 6)
    : shuffledBackendSections?.[0]?.items?.slice(0, 6) || []
  );

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
                {loadingFollowing ? (
                  <View style={styles.followingLoadingBox}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.followingLoadingText}>Loading followed artists...</Text>
                  </View>
                ) : favoriteArtists.length === 0 ? (
                  <View style={styles.followingEmptyBox}>
                    <Ionicons name="person-add-outline" size={44} color="rgba(255,255,255,0.25)" />
                    <Text style={styles.followingEmptyTitle}>No followed artists yet</Text>
                    <Text style={styles.followingEmptySub}>
                      Follow artists on their profiles to see their tracks here.
                    </Text>
                  </View>
                ) : (
                  <>
                    {favoriteArtists.length > 0 && (
                      <View style={styles.followedArtistsRow}>
                        {favoriteArtists.map((name, idx) => {
                          const img = resolveLocalArtistImage(name, artistImages[name]);
                          return (
                            <TouchableOpacity
                              key={`fav_artist_${idx}`}
                              style={styles.followedArtistItem}
                              onPress={() => {
                                const section = followingSections.find(
                                  (s) => s.artistName === name
                                );
                                if (section && section.items.length > 0) {
                                  playTrack(section.items[0], section.items, 0);
                                }
                              }}
                              activeOpacity={0.8}
                            >
                              <Image
                                source={{ uri: img }}
                                style={styles.followedArtistImg}
                                resizeMode="cover"
                              />
                              <Text style={styles.followedArtistName} numberOfLines={1}>
                                {name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                    {followingQuickItems.length > 0 && (
                      <View style={styles.quickGridContainer}>
                        {followingQuickItems.map((item, index) => {
                          const artistImg = resolveLocalArtistImage(item.artist, artistImages[item.artist]);
                          const thumb = artistImg || getHighResArtwork(item.artwork_url || item.thumbnail);
                          return (
                            <TouchableOpacity
                              key={`following_quick_${item.videoId || item.video_id}_${index}`}
                              style={[
                                styles.quickCard,
                                { width: isDesktop ? "32.4%" : isTablet ? "32%" : "48.5%" },
                              ]}
                              onPress={() => playTrack(item, allFollowingTracks, index)}
                              activeOpacity={0.8}
                            >
                              <Image source={{ uri: thumb }} style={styles.quickCardThumb} resizeMode="cover" />
                              <View style={styles.quickCardInfo}>
                                <Text style={styles.quickCardTitle} numberOfLines={1}>{item.artist || "Followed Artist"}</Text>
                                <Text style={styles.quickCardArtist} numberOfLines={1}>{cleanTitle(item.title)}</Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                    {followingSections.map((section, idx) => (
                      <SectionList key={section.id} section={section} sectionIndex={idx} />
                    ))}
                  </>
                )}
              </View>
            ) : (
              <>
                {quickItems.length > 0 && (
                  <View style={styles.quickGridContainer}>
                    {quickItems.map((item, index) => {
                      const isItemActive = currentTrack?.videoId === (item.videoId || item.video_id);
                      const thumb = getHighResArtwork(item.artwork_url || item.thumbnail);
                      return (
                        <TouchableOpacity
                          key={`quick_${item.videoId || item.video_id}_${index}`}
                          style={[
                            styles.quickCard,
                            { width: isDesktop ? "32.4%" : isTablet ? "32%" : "48.5%" },
                          ]}
                          onPress={() => isItemActive ? togglePlayPause() : playTrack(item, quickItems, index)}
                          activeOpacity={0.8}
                        >
                          <Image source={{ uri: thumb }} style={styles.quickCardThumb} resizeMode="cover" />
                          <View style={styles.quickCardInfo}>
                            <Text style={styles.quickCardTitle} numberOfLines={1}>{cleanTitle(item.title)}</Text>
                            <Text style={styles.quickCardArtist} numberOfLines={1}>{item.artist || "Recently Played"}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                {allDisplayedSections?.map((section, idx) => (
                  <SectionList key={section.id} section={section} sectionIndex={idx} />
                ))}
              </>
            )}

            <View style={{ height: isDesktop || isTablet ? 24 : 140 }} />
          </View>
        </ScrollView>
      )}
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
  followedArtistsRow: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 4,
    paddingBottom: 14,
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
});
