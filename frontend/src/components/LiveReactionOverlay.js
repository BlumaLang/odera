import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  Platform,
} from "react-native";
import { useUser } from "../context/UserContext";
import { subscribeLiveReactions } from "../services/firebase";
import { colors, fonts } from "../theme/colors";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

function SingleFloatingEmoji({ emoji, startX, startY, delay = 0, onComplete }) {
  const animY = useRef(new Animated.Value(0)).current;
  const animX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const driftX = (Math.random() - 0.5) * 140;
    const targetY = -(280 + Math.random() * 240);
    const duration = 2000 + Math.random() * 800;

    const timer = setTimeout(() => {
      Animated.parallel([
        // Float upwards
        Animated.timing(animY, {
          toValue: targetY,
          duration: duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== "web",
        }),
        // Drift horizontally with gentle sway
        Animated.sequence([
          Animated.timing(animX, {
            toValue: driftX * 0.6,
            duration: duration * 0.45,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(animX, {
            toValue: driftX,
            duration: duration * 0.55,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: Platform.OS !== "web",
          }),
        ]),
        // Scale pop
        Animated.sequence([
          Animated.spring(scale, {
            toValue: 1.15 + Math.random() * 0.35,
            friction: 4,
            tension: 50,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(scale, {
            toValue: 0.9,
            duration: duration * 0.6,
            useNativeDriver: Platform.OS !== "web",
          }),
        ]),
        // Fade in and out
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.delay(duration * 0.45),
          Animated.timing(opacity, {
            toValue: 0,
            duration: duration * 0.4,
            easing: Easing.in(Easing.quad),
            useNativeDriver: Platform.OS !== "web",
          }),
        ]),
      ]).start(() => {
        if (onComplete) onComplete();
      });
    }, delay);

    return () => clearTimeout(timer);
  }, [animX, animY, delay, emoji, onComplete, opacity, scale]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.floatingEmojiContainer,
        {
          left: startX,
          bottom: startY,
          opacity,
          transform: [
            { translateX: animX },
            { translateY: animY },
            { scale },
          ],
        },
      ]}
    >
      <Text style={styles.floatingEmojiText}>{emoji}</Text>
    </Animated.View>
  );
}

export default function LiveReactionOverlay() {
  const { currentUser } = useUser() || {};
  const [particles, setParticles] = useState([]);
  const [activeBanner, setActiveBanner] = useState(null);
  const bannerAnimY = useRef(new Animated.Value(-80)).current;
  const bannerOpacity = useRef(new Animated.Value(0)).current;
  const bannerTimerRef = useRef(null);

  const spawnParticles = useCallback((reaction) => {
    const burstCount = 10;
    const emoji = reaction.emoji || "🔥";
    const baseCenterX = SCREEN_WIDTH / 2 - 20;
    const baseBottomY = Platform.OS === "web" ? 180 : 160;

    const newParticles = [];
    for (let i = 0; i < burstCount; i++) {
      const pId = `${Date.now()}_${i}_${Math.random()}`;
      const jitterX = (Math.random() - 0.5) * 160;
      const jitterY = (Math.random() - 0.5) * 60;
      const delay = i * 45 + Math.random() * 40;

      newParticles.push({
        id: pId,
        emoji,
        startX: baseCenterX + jitterX,
        startY: baseBottomY + jitterY,
        delay,
      });
    }

    setParticles((prev) => [...prev.slice(-20), ...newParticles]);

    // Show Airbuds-style top notification pill
    setActiveBanner({
      emoji,
      senderName: reaction.senderName || "A friend",
      trackTitle: reaction.trackTitle || "",
    });

    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
    }

    Animated.parallel([
      Animated.spring(bannerAnimY, {
        toValue: Platform.OS === "web" ? 28 : 56,
        tension: 80,
        friction: 8,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(bannerOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start();

    bannerTimerRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(bannerAnimY, {
          toValue: -80,
          duration: 320,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(bannerOpacity, {
          toValue: 0,
          duration: 280,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start(() => {
        setActiveBanner(null);
      });
    }, 3800);
  }, [bannerAnimY, bannerOpacity]);

  // Remove individual particle once finished
  const removeParticle = useCallback((id) => {
    setParticles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  useEffect(() => {
    const uid = currentUser?.uid;
    if (!uid) return;

    const unsubscribe = subscribeLiveReactions(uid, (reaction) => {
      spawnParticles(reaction);
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    };
  }, [currentUser?.uid, spawnParticles]);

  if (particles.length === 0 && !activeBanner) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.overlayRoot}>
      {/* Airbuds Reaction Pill Banner */}
      {activeBanner && (
        <Animated.View
          style={[
            styles.bannerPill,
            {
              top: bannerAnimY,
              opacity: bannerOpacity,
            },
          ]}
        >
          <View style={styles.bannerEmojiCircle}>
            <Text style={styles.bannerEmojiText}>{activeBanner.emoji}</Text>
          </View>
          <View style={styles.bannerTextGroup}>
            <Text style={styles.bannerTitle} numberOfLines={1}>
              <Text style={styles.bannerSenderBold}>{activeBanner.senderName}</Text> reacted to your vibe
            </Text>
            {Boolean(activeBanner.trackTitle) && (
              <Text style={styles.bannerSubtext} numberOfLines={1}>
                {activeBanner.trackTitle}
              </Text>
            )}
          </View>
        </Animated.View>
      )}

      {/* Floating Burst Particles */}
      {particles.map((p) => (
        <SingleFloatingEmoji
          key={p.id}
          emoji={p.emoji}
          startX={p.startX}
          startY={p.startY}
          delay={p.delay}
          onComplete={() => removeParticle(p.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    elevation: 99999,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerPill: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(18, 18, 22, 0.94)",
    borderRadius: 30,
    paddingVertical: 9,
    paddingHorizontal: 16,
    paddingRight: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 18,
    elevation: 20,
    maxWidth: Math.min(SCREEN_WIDTH - 36, 420),
    zIndex: 100000,
  },
  bannerEmojiCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  bannerEmojiText: {
    fontSize: 22,
  },
  bannerTextGroup: {
    flexShrink: 1,
    justifyContent: "center",
  },
  bannerTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: fonts.medium,
    letterSpacing: 0.1,
  },
  bannerSenderBold: {
    fontFamily: fonts.bold,
    color: "#1DB954",
  },
  bannerSubtext: {
    color: "#A0A0A0",
    fontSize: 11,
    fontFamily: fonts.regular,
    marginTop: 1,
  },
  floatingEmojiContainer: {
    position: "absolute",
    zIndex: 99999,
  },
  floatingEmojiText: {
    fontSize: 36,
    textShadowColor: "rgba(0, 0, 0, 0.45)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
});
