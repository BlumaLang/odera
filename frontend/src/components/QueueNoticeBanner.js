import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayback } from "../context/AudioContext";
import { colors, fonts } from "../theme/colors";

export default function QueueNoticeBanner() {
  const { queueNotice } = useAudioPlayback();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-24)).current;

  useEffect(() => {
    if (queueNotice) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 6,
          tension: 60,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(slideAnim, {
          toValue: -24,
          duration: 200,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start();
    }
  }, [queueNotice]);

  if (!queueNotice) return null;

  const iconName = queueNotice.icon || "play-forward";

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.pill}>
        <View style={styles.iconCircle}>
          <Ionicons name={iconName} size={14} color="#000000" />
        </View>
        <Text style={styles.noticeText} numberOfLines={1}>
          {queueNotice.text}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: Platform.OS === "web" ? 24 : 52,
    left: 0,
    right: 0,
    zIndex: 99999,
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(18, 18, 18, 0.94)",
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderWidth: 1,
    borderRadius: 30,
    paddingVertical: 9,
    paddingHorizontal: 16,
    maxWidth: "88%",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary || "#1DB954",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  noticeText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
});
