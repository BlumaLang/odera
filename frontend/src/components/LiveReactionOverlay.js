import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  useWindowDimensions,
  Platform,
} from "react-native";
import { useUser } from "../context/UserContext";
import { subscribeLiveReactions } from "../services/firebase";
import { colors, fonts } from "../theme/colors";

// Global dispatcher so sender screens can trigger local burst immediately
const localBurstListeners = new Set();
export function triggerLocalReactionBurst(payload) {
  localBurstListeners.forEach((fn) => {
    try {
      fn(payload);
    } catch (_) {}
  });
}

// Web CSS Keyframes injection (runs once on browser load for pure GPU 60fps animations)
let stylesInjected = false;
function injectKeyframesOnce() {
  if (Platform.OS !== "web" || stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;
  const styleEl = document.createElement("style");
  styleEl.textContent = `
    @keyframes airbudsHeroPop {
      0% {
        transform: scale(0.2) rotate(-15deg);
        opacity: 0;
      }
      20% {
        transform: scale(1.4) rotate(8deg);
        opacity: 1;
      }
      45% {
        transform: scale(1.1) rotate(-4deg);
        opacity: 0.95;
      }
      80% {
        transform: scale(1.3) translateY(-40px);
        opacity: 0.8;
      }
      100% {
        transform: scale(1.6) translateY(-100px);
        opacity: 0;
      }
    }

    @keyframes airbudsFountainFloat {
      0% {
        transform: translate3d(0, 0, 0) scale(0.3) rotate(0deg);
        opacity: 0;
      }
      12% {
        transform: translate3d(calc(var(--dx) * 0.3), -80px, 0) scale(1.25) rotate(calc(var(--rot) * 0.5));
        opacity: 1;
      }
      50% {
        transform: translate3d(calc(var(--dx) * 0.7), calc(var(--dy) * 0.55), 0) scale(1.05) rotate(calc(var(--rot) * 0.9));
        opacity: 0.95;
      }
      85% {
        opacity: 0.7;
      }
      100% {
        transform: translate3d(var(--dx), var(--dy), 0) scale(0.8) rotate(var(--rot));
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(styleEl);
}

function WebParticle({ particle }) {
  return (
    <div
      style={{
        position: "fixed",
        left: `${particle.startX}px`,
        bottom: `${particle.startY}px`,
        fontSize: `${particle.size}px`,
        lineHeight: 1,
        pointerEvents: "none",
        zIndex: 999999,
        userSelect: "none",
        animation: `airbudsFountainFloat ${particle.duration}ms cubic-bezier(0.2, 0.8, 0.25, 1) ${particle.delay}ms forwards`,
        filter: "drop-shadow(0 4px 12px rgba(0, 0, 0, 0.6))",
        willChange: "transform, opacity",
        "--dx": `${particle.driftX}px`,
        "--dy": `${particle.targetY}px`,
        "--rot": `${particle.rotation}deg`,
      }}
    >
      {particle.emoji}
    </div>
  );
}

function NativeParticle({ particle, onComplete }) {
  const animY = useRef(new Animated.Value(0)).current;
  const animX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(animY, {
          toValue: particle.targetY,
          duration: particle.duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(animX, {
          toValue: particle.driftX,
          duration: particle.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.spring(scale, {
            toValue: 1.25,
            friction: 4,
            tension: 50,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.85,
            duration: particle.duration * 0.6,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.delay(particle.duration * 0.5),
          Animated.timing(opacity, {
            toValue: 0,
            duration: particle.duration * 0.35,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        if (onComplete) onComplete();
      });
    }, particle.delay);

    return () => clearTimeout(timer);
  }, [animX, animY, onComplete, opacity, particle, scale]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.floatingEmojiContainer,
        {
          left: particle.startX,
          bottom: particle.startY,
          opacity,
          transform: [{ translateX: animX }, { translateY: animY }, { scale }],
        },
      ]}
    >
      <Text style={[styles.floatingEmojiText, { fontSize: particle.size }]}>
        {particle.emoji}
      </Text>
    </Animated.View>
  );
}

export default function LiveReactionOverlay() {
  const { currentUser } = useUser() || {};
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [particles, setParticles] = useState([]);
  const [heroEmoji, setHeroEmoji] = useState(null);
  const [activeBanner, setActiveBanner] = useState(null);

  const bannerAnimY = useRef(new Animated.Value(-100)).current;
  const bannerOpacity = useRef(new Animated.Value(0)).current;
  const bannerTimerRef = useRef(null);

  useEffect(() => {
    injectKeyframesOnce();
  }, []);

  const spawnBurst = useCallback(
    (reaction) => {
      const emoji = reaction.emoji || "🔥";
      const count = 16;
      const centerX = (windowWidth || 360) / 2 - 20;
      const bottomY = Math.max(120, (windowHeight || 600) * 0.28);

      // Trigger subtle haptic pulse on supported mobile devices
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate([25, 35, 25]);
        } catch (_) {}
      }

      // Hero Center Emoji pop
      setHeroEmoji({
        id: `hero_${Date.now()}`,
        emoji,
        x: centerX - 16,
        y: bottomY + 40,
      });
      setTimeout(() => {
        setHeroEmoji(null);
      }, 1600);

      // 16 Particle fountain
      const newItems = [];
      for (let i = 0; i < count; i++) {
        const driftX = (Math.random() - 0.5) * Math.min(windowWidth * 0.85, 340);
        const targetY = -(260 + Math.random() * 320);
        const delay = i * 35 + Math.random() * 30;
        const duration = 1800 + Math.random() * 700;
        const size = Math.floor(30 + Math.random() * 24);
        const rotation = Math.floor((Math.random() - 0.5) * 60);

        newItems.push({
          id: `p_${Date.now()}_${i}_${Math.random()}`,
          emoji,
          startX: centerX + (Math.random() - 0.5) * 80,
          startY: bottomY + (Math.random() - 0.5) * 40,
          driftX,
          targetY,
          delay,
          duration,
          size,
          rotation,
        });
      }

      setParticles((prev) => [...prev.slice(-24), ...newItems]);

      // Top Toast Banner
      if (reaction.senderName) {
        setActiveBanner({
          emoji,
          senderName: reaction.senderName,
          trackTitle: reaction.trackTitle || "",
        });

        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);

        Animated.parallel([
          Animated.spring(bannerAnimY, {
            toValue: Platform.OS === "web" ? 24 : 50,
            tension: 85,
            friction: 7,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(bannerOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: Platform.OS !== "web",
          }),
        ]).start();

        bannerTimerRef.current = setTimeout(() => {
          Animated.parallel([
            Animated.timing(bannerAnimY, {
              toValue: -100,
              duration: 300,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: Platform.OS !== "web",
            }),
            Animated.timing(bannerOpacity, {
              toValue: 0,
              duration: 250,
              useNativeDriver: Platform.OS !== "web",
            }),
          ]).start(() => {
            setActiveBanner(null);
          });
        }, 3600);
      }

      // Auto-cleanup particles after animation completes
      setTimeout(() => {
        setParticles((prev) => prev.filter((p) => !newItems.some((n) => n.id === p.id)));
      }, 3000);
    },
    [bannerAnimY, bannerOpacity, windowHeight, windowWidth]
  );

  // Subscribe to Firebase RTDB for incoming friend reactions
  useEffect(() => {
    const uid = currentUser?.uid;
    if (!uid) return;

    const unsubscribe = subscribeLiveReactions(uid, (reaction) => {
      spawnBurst(reaction);
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    };
  }, [currentUser?.uid, spawnBurst]);

  // Listen to local triggers (when currentUser reacts to a friend, preview it instantly!)
  useEffect(() => {
    const listener = (payload) => {
      spawnBurst(payload);
    };
    localBurstListeners.add(listener);
    return () => {
      localBurstListeners.delete(listener);
    };
  }, [spawnBurst]);

  if (particles.length === 0 && !activeBanner && !heroEmoji) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.overlayRoot}>
      {/* Top Airbuds Toast Notification */}
      {activeBanner && (
        <Animated.View
          style={[
            styles.bannerPill,
            {
              top: bannerAnimY,
              opacity: bannerOpacity,
              maxWidth: Math.min(windowWidth - 32, 420),
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

      {/* Central Hero Pop Emoji */}
      {heroEmoji && (
        Platform.OS === "web" ? (
          <div
            style={{
              position: "fixed",
              left: `${heroEmoji.x}px`,
              bottom: `${heroEmoji.y}px`,
              fontSize: "68px",
              lineHeight: 1,
              pointerEvents: "none",
              zIndex: 999998,
              userSelect: "none",
              animation: "airbudsHeroPop 1400ms cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards",
              filter: "drop-shadow(0 0 24px rgba(29, 185, 84, 0.7))",
            }}
          >
            {heroEmoji.emoji}
          </div>
        ) : null
      )}

      {/* Floating Burst Particles */}
      {particles.map((p) =>
        Platform.OS === "web" ? (
          <WebParticle key={p.id} particle={p} />
        ) : (
          <NativeParticle
            key={p.id}
            particle={p}
            onComplete={() => setParticles((prev) => prev.filter((item) => item.id !== p.id))}
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    ...(Platform.OS === "web"
      ? {
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100vw",
          height: "100vh",
        }
      : StyleSheet.absoluteFillObject),
    zIndex: 999999,
    elevation: 999999,
    pointerEvents: "none",
    alignItems: "center",
    justifyContent: "center",
  },
  bannerPill: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(14, 14, 18, 0.96)",
    borderRadius: 30,
    paddingVertical: 10,
    paddingHorizontal: 16,
    paddingRight: 20,
    borderWidth: 1.5,
    borderColor: "rgba(29, 185, 84, 0.4)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 24,
    zIndex: 1000000,
  },
  bannerEmojiCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(29, 185, 84, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.3)",
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
    marginTop: 2,
  },
  floatingEmojiContainer: {
    position: "absolute",
    zIndex: 999999,
  },
  floatingEmojiText: {
    textShadowColor: "rgba(0, 0, 0, 0.6)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
  },
});
