import React, { createContext, useContext, useMemo } from "react";
import { useWindowDimensions, Platform } from "react-native";

const ResponsiveContext = createContext(null);

/**
 * Returns accurate device name and Ionicons icon name:
 * "MacBook", "Windows", "iPhone", "iPad", "Android", "Chromebook", "Linux"
 */
export function getAccurateDeviceInfo(width = 1024) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.navigator) {
      const ua = window.navigator.userAgent || "";
      const platform = window.navigator.platform || "";
      const maxTouchPoints = window.navigator.maxTouchPoints || 0;

      // iPhone
      if (/iPhone/i.test(ua)) {
        return { name: "iPhone", icon: "phone-portrait-outline" };
      }
      // iPad (including iPadOS Safari reporting MacIntel with touch points)
      if (/iPad/i.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1 && !window.MSStream)) {
        return { name: "iPad", icon: "tablet-portrait-outline" };
      }
      // iPod
      if (/iPod/i.test(ua)) {
        return { name: "iPod", icon: "phone-portrait-outline" };
      }
      // Mac / MacBook
      if (/Macintosh|Mac OS X|MacIntel/i.test(ua) || platform.startsWith("Mac")) {
        return { name: "MacBook", icon: "laptop-outline" };
      }
      // Windows PC
      if (/Windows|Win32|Win64|WOW64/i.test(ua) || platform.startsWith("Win")) {
        return { name: "Windows", icon: "desktop-outline" };
      }
      // Android Phone / Tablet
      if (/Android/i.test(ua)) {
        const isTablet = !/Mobile/i.test(ua) || width >= 768;
        return {
          name: isTablet ? "iPad / Tablet" : "Android",
          icon: isTablet ? "tablet-portrait-outline" : "phone-portrait-outline",
        };
      }
      // Chromebook / ChromeOS
      if (/CrOS/i.test(ua)) {
        return { name: "Chromebook", icon: "laptop-outline" };
      }
      // Linux PC
      if (/Linux/i.test(ua) || platform.startsWith("Linux")) {
        return { name: "Linux", icon: "desktop-outline" };
      }
    }
  } else {
    // Native React Native / Expo
    if (Platform.OS === "ios") {
      return Platform.isPad
        ? { name: "iPad", icon: "tablet-portrait-outline" }
        : { name: "iPhone", icon: "phone-portrait-outline" };
    }
    if (Platform.OS === "android") {
      return width >= 768
        ? { name: "Tablet", icon: "tablet-portrait-outline" }
        : { name: "Android", icon: "phone-portrait-outline" };
    }
    if (Platform.OS === "macos") {
      return { name: "MacBook", icon: "laptop-outline" };
    }
    if (Platform.OS === "windows") {
      return { name: "Windows", icon: "desktop-outline" };
    }
  }

  // Fallback based on viewport width
  if (width >= 1024) return { name: "Desktop", icon: "desktop-outline" };
  if (width >= 768) return { name: "iPad / Tablet", icon: "tablet-portrait-outline" };
  return { name: "Phone", icon: "phone-portrait-outline" };
}

export function ResponsiveProvider({ children }) {
  const { width, height } = useWindowDimensions();

  const isPhone = width < 768;
  const isTablet = width >= 768 && width < 1024;
  const isDesktop = width >= 1024;
  const deviceType = isDesktop ? "desktop" : isTablet ? "tablet" : "phone";

  const deviceInfo = useMemo(() => getAccurateDeviceInfo(width), [width]);

  // Dynamic layout helpers
  const contentPadding = isDesktop ? 32 : isTablet ? 24 : 16;
  const contentMaxWidth = isDesktop ? 1400 : isTablet ? 960 : "100%";
  
  // Track cards grid width
  const songCardWidth = isDesktop ? "18.5%" : isTablet ? "31%" : "47.5%";
  
  // Onboarding artist cards width
  const artistCardWidth = isDesktop ? "15%" : isTablet ? "23%" : "30.5%";

  const value = {
    width,
    height,
    isPhone,
    isTablet,
    isDesktop,
    deviceType,
    deviceName: deviceInfo.name,
    deviceIcon: deviceInfo.icon,
    deviceLabel: deviceInfo.name,
    contentPadding,
    contentMaxWidth,
    songCardWidth,
    artistCardWidth,
  };

  return (
    <ResponsiveContext.Provider value={value}>
      {children}
    </ResponsiveContext.Provider>
  );
}

export function useResponsive() {
  const context = useContext(ResponsiveContext);
  if (!context) {
    // Fallback if accessed outside provider
    const { width, height } = useWindowDimensions();
    const isPhone = width < 768;
    const isTablet = width >= 768 && width < 1024;
    const isDesktop = width >= 1024;
    const fbInfo = getAccurateDeviceInfo(width);

    return {
      width,
      height,
      isPhone,
      isTablet,
      isDesktop,
      deviceType: isDesktop ? "desktop" : isTablet ? "tablet" : "phone",
      deviceName: fbInfo.name,
      deviceIcon: fbInfo.icon,
      deviceLabel: fbInfo.name,
      contentPadding: isDesktop ? 32 : isTablet ? 24 : 16,
      contentMaxWidth: isDesktop ? 1400 : isTablet ? 960 : "100%",
      songCardWidth: isDesktop ? "18.5%" : isTablet ? "31%" : "47.5%",
      artistCardWidth: isDesktop ? "15%" : isTablet ? "23%" : "30.5%",
    };
  }
  return context;
}
