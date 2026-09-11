import React, { useRef, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import SongCard from "./SongCard";
import { colors, fonts } from "../theme/colors";
import { useAudioPlayback } from "../context/AudioContext";
import { useResponsive } from "../context/ResponsiveContext";

const SECTION_BACKGROUNDS = [
  "transparent",
  "rgba(255, 255, 255, 0.02)",
  "transparent",
  "rgba(255, 255, 255, 0.025)",
];

export default function SectionList({ section, sectionIndex = 0 }) {
  const { currentTrack, playTrack } = useAudioPlayback();
  const { isDesktop, isTablet } = useResponsive();
  const flatListRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [hoveredLeft, setHoveredLeft] = useState(false);
  const [hoveredRight, setHoveredRight] = useState(false);

  const items = section?.items || section?.tracks || [];

  if (!section || items.length === 0) {
    return null;
  }

  const handleSongPress = (track, index) => {
    if (section?.onItemPress) {
      section.onItemPress(track, index);
      return;
    }
    if (track?.isPlaylist || track?.type === "playlist") {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("staytup-open-playlist-modal", { detail: track }));
      }
      return;
    }
    if (track?.mixTracks && Array.isArray(track.mixTracks) && track.mixTracks.length > 0) {
      playTrack(track.mixTracks[0], track.mixTracks, 0);
      return;
    }
    playTrack(track, items, index);
  };

  const handleScroll = (e) => {
    const x = e.nativeEvent?.contentOffset?.x || 0;
    scrollOffsetRef.current = x;
    setCanScrollLeft(x > 10);
  };

  const scrollDistance = 500;

  const handleScrollLeft = () => {
    const target = Math.max(0, scrollOffsetRef.current - scrollDistance);
    if (flatListRef.current?.scrollToOffset) {
      flatListRef.current.scrollToOffset({ offset: target, animated: true });
    }
    scrollOffsetRef.current = target;
    setCanScrollLeft(target > 10);
  };

  const handleScrollRight = () => {
    const target = scrollOffsetRef.current + scrollDistance;
    if (flatListRef.current?.scrollToOffset) {
      flatListRef.current.scrollToOffset({ offset: target, animated: true });
    }
    scrollOffsetRef.current = target;
    setCanScrollLeft(true);
  };

  const showScrollButtons = isDesktop || isTablet || Platform.OS === "web";

  return (
    <View
      style={[
        styles.sectionWrapper,
        sectionIndex === 0 && styles.firstSectionWrapper,
        { backgroundColor: SECTION_BACKGROUNDS[sectionIndex % SECTION_BACKGROUNDS.length] },
      ]}
    >
      <View style={styles.sectionHeaderRow}>
        <View style={styles.headerTextGroup}>
          <Text
            style={[styles.sectionTitle, (isDesktop || isTablet) && styles.sectionTitleDesktop]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {section.title}
          </Text>
          {section.description ? (
            <Text
              style={styles.sectionDescription}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {section.description}
            </Text>
          ) : null}
        </View>

        {showScrollButtons && (
          <View style={styles.scrollButtonsContainer}>
            <TouchableOpacity
              style={[
                styles.scrollCircleButton,
                !canScrollLeft && styles.scrollCircleButtonDisabled,
                hoveredLeft && styles.scrollCircleButtonHovered,
              ]}
              onPress={handleScrollLeft}
              disabled={!canScrollLeft}
              activeOpacity={0.7}
              {...(Platform.OS === "web"
                ? {
                    onMouseEnter: () => setHoveredLeft(true),
                    onMouseLeave: () => setHoveredLeft(false),
                  }
                : {})}
            >
              <Ionicons
                name="chevron-back"
                size={18}
                color={canScrollLeft ? colors.text : "rgba(255, 255, 255, 0.25)"}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.scrollCircleButton,
                hoveredRight && styles.scrollCircleButtonHovered,
              ]}
              onPress={handleScrollRight}
              activeOpacity={0.7}
              {...(Platform.OS === "web"
                ? {
                    onMouseEnter: () => setHoveredRight(true),
                    onMouseLeave: () => setHoveredRight(false),
                  }
                : {})}
            >
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.text}
              />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <FlatList
        ref={flatListRef}
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalListContent}
        keyExtractor={(item, index) => `${section.id}_${item.videoId || item.video_id || item.id || index}_${index}`}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        renderItem={({ item, index }) => (
          <SongCard
            track={item}
            layout="card"
            isActive={currentTrack?.videoId === (item.videoId || item.video_id)}
            onPress={() => handleSongPress(item, index)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionWrapper: {
    marginVertical: 4,
    paddingVertical: 2,
  },
  firstSectionWrapper: {
    marginTop: 0,
    paddingTop: 0,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  headerTextGroup: {
    flex: 1,
    paddingRight: 16,
    justifyContent: "center",
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.text,
    letterSpacing: -0.4,
  },
  sectionTitleDesktop: {
    fontSize: 22,
  },
  sectionDescription: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 3,
  },
  scrollButtonsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scrollCircleButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  scrollCircleButtonHovered: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  scrollCircleButtonDisabled: {
    opacity: 0.35,
    ...(Platform.OS === "web" ? { cursor: "default" } : {}),
  },
  horizontalListContent: {
    paddingHorizontal: 16,
  },
});
