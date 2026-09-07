import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { useAudio } from "../context/AudioContext";
import { useResponsive } from "../context/ResponsiveContext";
import { useUser } from "../context/UserContext";
import { api } from "../api/client";

const MOOD_GRADIENTS = [
  ["#1DB954", "#134E2F"],
  ["#2EBDD7", "#164E5A"],
  ["#8C52FF", "#3D2560"],
  ["#F59B23", "#5C3A0E"],
  ["#E91429", "#5C0A11"],
  ["#1E3264", "#0D1830"],
];

function cleanTitle(title) {
  if (!title) return "";
  return title
    .replace(
      /\s*[\(\[]\s*(official\s*(video|audio|music\s*video|lyric\s*video|mv)|lyric\s*video|audio|hd|4k|lyrics|ft\.?.*?|feat\.?.*?)\s*[\)\]]/gi,
      ""
    )
    .replace(/\s*[\(\[]\s*\d{4}\s*[\)\]]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function getHighResArtwork(url) {
  if (!url) return null;
  let clean = url;
  if (
    clean.includes("yt3.googleusercontent.com") ||
    clean.includes("yt3.ggpht.com")
  ) {
    clean = clean
      .replace(/=s\d+[^?&]*/, "=s512")
      .replace(/=w\d+-h\d+[^?&]*/, "=s512");
    if (!clean.includes("=")) clean = `${clean}=s512`;
    return clean;
  }
  clean = clean.replace(/=w\d+-h\d+[^?&]*/, "=w400-h400-l90-rj");
  clean = clean.replace(/=s\d+[^?&]*/, "=s512");
  clean = clean.replace(/\/default\.jpg/, "/mqdefault.jpg");
  return clean;
}

export default function PersonalizedMix() {
  const { currentTrack, isPlaying, togglePlayPause, playTrack } = useAudio();
  const { isDesktop, isTablet } = useResponsive();
  const { currentUser, recentlyPlayed, likedSongs } = useUser();

  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const flatListRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPersonalized() {
      try {
        setLoading(true);
        setError(null);

        const userId = currentUser?.uid || "guest";
        const data = await api.getPersonalizedFeed(userId);

        if (!cancelled && mountedRef.current && data?.sections?.length > 0) {
          setSections(data.sections);
        }
      } catch (err) {
        if (!cancelled && mountedRef.current) {
          setError(err.message);
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setLoading(false);
        }
      }
    }

    loadPersonalized();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.uid]);

  const handleTrackPress = (track, sectionItems) => {
    const idx = sectionItems.findIndex((t) => (t.videoId || t.video_id) === (track.videoId || track.video_id));
    playTrack(track, sectionItems, idx >= 0 ? idx : 0);
  };

  const handleScroll = (e) => {
    const x = e.nativeEvent?.contentOffset?.x || 0;
    scrollOffsetRef.current = x;
    setCanScrollLeft(x > 10);
  };

  const scrollDistance = 500;

  const scrollLeft = () => {
    const target = Math.max(0, scrollOffsetRef.current - scrollDistance);
    flatListRef.current?.scrollToOffset?.({ offset: target, animated: true });
    scrollOffsetRef.current = target;
    setCanScrollLeft(target > 10);
  };

  const scrollRight = () => {
    const target = scrollOffsetRef.current + scrollDistance;
    flatListRef.current?.scrollToOffset?.({ offset: target, animated: true });
    scrollOffsetRef.current = target;
    setCanScrollLeft(true);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.loadingText}>Building your mix...</Text>
      </View>
    );
  }

  if (error || sections.length === 0) {
    return null;
  }

  const showScrollButtons = isDesktop || isTablet || Platform.OS === "web";
  const cardWidth = isDesktop ? 180 : isTablet ? 160 : 140;
  const cardGap = 12;

  return (
    <View style={styles.container}>
      {sections.map((section, sectionIdx) => {
        const items = section.items || section.tracks || [];
        if (items.length === 0) return null;

        const gradient = MOOD_GRADIENTS[sectionIdx % MOOD_GRADIENTS.length];
        const topTracks = items.slice(0, 4);

        return (
          <View key={section.id || sectionIdx} style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: gradient[0] + "20" }]}>
                <Ionicons
                  name={
                    section.id?.includes("mix")
                      ? "shuffle"
                      : section.id?.includes("mood")
                      ? "moon"
                      : section.id?.includes("discover")
                      ? "compass"
                      : section.id?.includes("similar")
                      ? "duplicate"
                      : section.id?.includes("artist")
                      ? "person"
                      : "sparkles"
                  }
                  size={16}
                  color={gradient[0]}
                />
              </View>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle} numberOfLines={1}>
                  {section.title}
                </Text>
                {section.description ? (
                  <Text style={styles.sectionDesc} numberOfLines={1}>
                    {section.description}
                  </Text>
                ) : null}
              </View>
              {showScrollButtons && (
                <View style={styles.scrollBtns}>
                  <TouchableOpacity
                    style={[styles.scrollBtn, !canScrollLeft && styles.scrollBtnDisabled]}
                    onPress={scrollLeft}
                    disabled={!canScrollLeft}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={16}
                      color={canScrollLeft ? colors.text : colors.textMuted}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.scrollBtn} onPress={scrollRight}>
                    <Ionicons name="chevron-forward" size={16} color={colors.text} />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={styles.heroRow}>
              {topTracks.map((track, i) => {
                const isActive =
                  currentTrack?.videoId === (track.videoId || track.video_id) ||
                  currentTrack?.video_id === (track.videoId || track.video_id);
                const thumb = getHighResArtwork(track.artwork_url || track.thumbnail);

                return (
                  <TouchableOpacity
                    key={`${section.id}_hero_${i}`}
                    style={styles.heroCard}
                    activeOpacity={0.85}
                    onPress={() => handleTrackPress(track, items)}
                  >
                    <View style={styles.heroThumbWrap}>
                      {thumb ? (
                        <Image source={{ uri: thumb }} style={styles.heroThumb} resizeMode="cover" />
                      ) : (
                        <View style={[styles.heroThumb, styles.heroThumbPlaceholder]}>
                          <Ionicons name="musical-note" size={24} color={colors.textMuted} />
                        </View>
                      )}
                      {isActive && (
                        <View style={styles.playingOverlay}>
                          <Ionicons
                            name={isPlaying ? "pause" : "play"}
                            size={20}
                            color="#fff"
                          />
                        </View>
                      )}
                    </View>
                    <Text style={styles.heroTitle} numberOfLines={1}>
                      {cleanTitle(track.title)}
                    </Text>
                    <Text style={styles.heroArtist} numberOfLines={1}>
                      {track.artist || "Unknown"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <FlatList
              ref={flatListRef}
              data={items}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              keyExtractor={(item, idx) =>
                `${section.id}_${item.videoId || item.video_id}_${idx}`
              }
              onScroll={handleScroll}
              scrollEventThrottle={16}
              renderItem={({ item, index }) => {
                const isActive =
                  currentTrack?.videoId === (item.videoId || item.video_id) ||
                  currentTrack?.video_id === (item.videoId || item.video_id);
                const thumb = getHighResArtwork(item.artwork_url || item.thumbnail);

                return (
                  <TouchableOpacity
                    style={[styles.trackCard, { width: cardWidth }]}
                    activeOpacity={0.8}
                    onPress={() => handleTrackPress(item, items)}
                  >
                    <View style={styles.trackThumbWrap}>
                      {thumb ? (
                        <Image
                          source={{ uri: thumb }}
                          style={[styles.trackThumb, { width: cardWidth, height: cardWidth }]}
                          resizeMode="cover"
                        />
                      ) : (
                        <View
                          style={[
                            styles.trackThumb,
                            styles.trackThumbPlaceholder,
                            { width: cardWidth, height: cardWidth },
                          ]}
                        >
                          <Ionicons name="musical-note" size={20} color={colors.textMuted} />
                        </View>
                      )}
                      {isActive && (
                        <View style={styles.trackPlayingBadge}>
                          <Ionicons name={isPlaying ? "pause" : "play"} size={12} color="#fff" />
                        </View>
                      )}
                    </View>
                    <Text style={styles.trackTitle} numberOfLines={1}>
                      {cleanTitle(item.title)}
                    </Text>
                    <Text style={styles.trackArtist} numberOfLines={1}>
                      {item.artist || "Unknown"}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    gap: 10,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: fonts.medium,
  },
  sectionBlock: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontFamily: fonts.semiBold,
    letterSpacing: 0.3,
  },
  sectionDesc: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: fonts.regular,
    marginTop: 1,
  },
  scrollBtns: {
    flexDirection: "row",
    gap: 6,
  },
  scrollBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollBtnDisabled: {
    opacity: 0.35,
  },
  heroRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 14,
  },
  heroCard: {
    flex: 1,
    maxWidth: "24%",
  },
  heroThumbWrap: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.surfaceVariant,
    marginBottom: 6,
  },
  heroThumb: {
    width: "100%",
    height: "100%",
  },
  heroThumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  playingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    color: colors.text,
    fontSize: 11,
    fontFamily: fonts.medium,
  },
  heroArtist: {
    color: colors.textSecondary,
    fontSize: 10,
    fontFamily: fonts.regular,
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  trackCard: {
    marginRight: 0,
  },
  trackThumbWrap: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: colors.surfaceVariant,
    marginBottom: 6,
    position: "relative",
  },
  trackThumb: {
    width: "100%",
    height: "100%",
  },
  trackThumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  trackPlayingBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  trackTitle: {
    color: colors.text,
    fontSize: 11,
    fontFamily: fonts.medium,
  },
  trackArtist: {
    color: colors.textSecondary,
    fontSize: 10,
    fontFamily: fonts.regular,
  },
});
