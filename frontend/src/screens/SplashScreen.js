import React, { useEffect, useRef } from "react";
import {
  View,
  Image,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { colors } from "../theme/colors";

const STAYTUP_LOGO = require("../../assets/staytup_logo.png");

export default function SplashScreen({ onFinish }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    // Fade and scale in
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start();

    // Auto-transition to next screen (immediate on web, 1.5s on native)
    const timer = setTimeout(() => {
      if (onFinish) onFinish();
    }, Platform.OS === "web" ? 150 : 1500);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Flat Staytup Logo in Center */}
        <View style={styles.logoContainer}>
          <Image
            source={STAYTUP_LOGO}
            style={styles.staytupLogo}
            resizeMode="contain"
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
  },
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  staytupLogo: {
    width: 270,
    height: 90,
  },
});
