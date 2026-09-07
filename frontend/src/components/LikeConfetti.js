import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, Easing, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const PARTICLE_COUNT = 16;

const COLORS = [
  "#1DB954", // Spotify Green
  "#FF4081", // Vibrant Rose
  "#FFD700", // Gold
  "#00E5FF", // Cyan
  "#FF5252", // Coral Red
  "#E040FB", // Electric Violet
  "#FFFFFF", // Sparkle White
  "#69F0AE", // Emerald Mint
];

export default function LikeConfetti({ onComplete }) {
  const anim = useRef(new Animated.Value(0)).current;

  // Pre-calculate deterministic random particle trajectories
  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const angle = (i / PARTICLE_COUNT) * 2 * Math.PI + (Math.random() * 0.3 - 0.15);
      const distance = 30 + Math.random() * 38;
      const targetX = Math.cos(angle) * distance;
      const targetY = Math.sin(angle) * distance - 10; // Slight upward bias
      const color = COLORS[i % COLORS.length];
      const type = i % 4; // 0: heart, 1: star, 2: sparkle, 3: dot
      const rotation = `${Math.floor(Math.random() * 360 - 180)}deg`;
      const size = 8 + (i % 3) * 2;

      return { targetX, targetY, color, type, rotation, size };
    })
  ).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 750,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start(() => {
      if (onComplete) onComplete();
    });
  }, []);

  return (
    <View style={[styles.container, { pointerEvents: "none" }]}>
      {particles.map((p, index) => {
        const translateX = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, p.targetX],
        });
        const translateY = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, p.targetY],
        });
        const scale = anim.interpolate({
          inputRange: [0, 0.25, 0.7, 1],
          outputRange: [0.1, 1.25, 0.9, 0],
        });
        const opacity = anim.interpolate({
          inputRange: [0, 0.7, 1],
          outputRange: [1, 0.9, 0],
        });

        return (
          <Animated.View
            key={`confetti_${index}`}
            style={[
              styles.particle,
              {
                transform: [
                  { translateX },
                  { translateY },
                  { scale },
                  { rotate: p.rotation },
                ],
                opacity,
              },
            ]}
          >
            {p.type === 0 ? (
              <Ionicons name="heart" size={p.size} color={p.color} />
            ) : p.type === 1 ? (
              <Ionicons name="star" size={p.size} color={p.color} />
            ) : p.type === 2 ? (
              <Ionicons name="sparkles" size={p.size} color={p.color} />
            ) : (
              <View
                style={[
                  styles.dot,
                  {
                    width: p.size,
                    height: p.size,
                    borderRadius: p.size / 2,
                    backgroundColor: p.color,
                  },
                ]}
              />
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 0,
    height: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  particle: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 1px 2px rgba(0, 0, 0, 0.3)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.3,
          shadowRadius: 2,
        }),
  },
});
