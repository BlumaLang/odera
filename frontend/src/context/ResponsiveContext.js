import React, { createContext, useContext } from "react";
import { useWindowDimensions } from "react-native";

const ResponsiveContext = createContext(null);

export function ResponsiveProvider({ children }) {
  const { width, height } = useWindowDimensions();

  const isPhone = width < 768;
  const isTablet = width >= 768 && width < 1024;
  const isDesktop = width >= 1024;
  const deviceType = isDesktop ? "desktop" : isTablet ? "tablet" : "phone";

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
    return {
      width,
      height,
      isPhone,
      isTablet,
      isDesktop,
      deviceType: isDesktop ? "desktop" : isTablet ? "tablet" : "phone",
      contentPadding: isDesktop ? 32 : isTablet ? 24 : 16,
      contentMaxWidth: isDesktop ? 1400 : isTablet ? 960 : "100%",
      songCardWidth: isDesktop ? "18.5%" : isTablet ? "31%" : "47.5%",
      artistCardWidth: isDesktop ? "15%" : isTablet ? "23%" : "30.5%",
    };
  }
  return context;
}
