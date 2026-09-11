import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayback } from "../context/AudioContext";
import { colors, fonts } from "../theme/colors";

export default function QueueNoticeBanner() {
  const { queueNotice } = useAudioPlayback();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (queueNotice) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 7,
          tension: 70,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(slideAnim, {
          toValue: -20,
          duration: 180,
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
          <Ionicons name={iconName} size={12} color="#000000" />
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
    top: Platform.OS === "web" ? 16 : 48,
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
    backgroundColor: "rgba(16, 16, 20, 0.94)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: 1,
    borderRadius: 22,
    paddingVertical: 6,
    paddingHorizontal: 12,
    maxWidth: "88%",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
    ...(Platform.OS === "web"
      ? {
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
        }
      : {}),
  },
  iconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary || "#1DB954",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  noticeText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: "#FFFFFF",
    letterSpacing: 0.1,
  },
});
