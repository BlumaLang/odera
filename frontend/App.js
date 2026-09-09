import React, { useState, useEffect, Component, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, Modal, BackHandler } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from "@expo-google-fonts/poppins";

import { ResponsiveProvider, useResponsive } from "./src/context/ResponsiveContext";
import { UserProvider, useUser } from "./src/context/UserContext";
import { AudioProvider } from "./src/context/AudioContext";
import SplashScreen from "./src/screens/SplashScreen";
import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import SearchScreen from "./src/screens/SearchScreen";
import LibraryScreen from "./src/screens/LibraryScreen";
import PremiumScreen from "./src/screens/PremiumScreen";
import FriendsScreen from "./src/screens/FriendsScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import MiniPlayer from "./src/components/MiniPlayer";
import FullPlayerModal from "./src/components/FullPlayerModal";
import DesktopSidebar from "./src/components/DesktopSidebar";
import DesktopPlayerBar from "./src/components/DesktopPlayerBar";
import ChangelogModal from "./src/components/ChangelogModal";
import { BUILD_NUMBER, APP_VERSION } from "./src/config/version";
import { colors, fonts } from "./src/theme/colors";

const Tab = createBottomTabNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: "#000000",
    text: colors.text,
    border: colors.surfaceBorder,
  },
};

// Error boundary — catches render crashes and shows recovery screen instead of black screen
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.warn("[ErrorBoundary] caught:", error?.message);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", padding: 30 }}>
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 8 }}>Something went wrong</Text>
          <Text style={{ color: "#999", fontSize: 13, textAlign: "center", marginBottom: 20 }}>
            {this.state.error?.message || "An unexpected error occurred"}
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false, error: null })}
            style={{ backgroundColor: "#1DB954", paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// Valid routes allowed after "/" in the URL
const VALID_ROUTES = {
  home: "Home",
  search: "Search",
  library: "Library",
  friends: "Friends",
  friend: "Friends",
  premium: "Premium",
};

// Parse and validate page from browser URL (cannot open any other pages)
function getRouteFromPathname() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const segments = window.location.pathname.replace(/^\/+/, "").split("/");
    const raw = segments[0].toLowerCase();
    if (!raw || raw === "") {
      return "Home";
    }
    if (VALID_ROUTES[raw]) {
      return VALID_ROUTES[raw];
    }
    // Restrict to allowed pages only: redirect unknown routes to /home
    try {
      window.history.replaceState({ page: "Home" }, "", "/home");
    } catch (_) {}
    return "Home";
  }
  return "Home";
}

// Push page name to browser URL address bar
function updateBrowserPathname(page) {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.history) {
    const curPath = window.location.pathname.toLowerCase();
    // Preserve /friend/{username} when navigating to Friends tab
    if (page.toLowerCase() === "friends" && (curPath.startsWith("/friend/") || curPath.startsWith("/friends/"))) {
      return;
    }
    const targetPath = `/${page.toLowerCase()}`;
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ page }, "", targetPath);
    }
  }
}

// Spotify-style Bottom Navigation Bar
function SpotifyBottomTabBar({ activeTab, onSelectTab, fixedTabBarHeight, bottomLift }) {
  const tabs = [
    { id: "Home", label: "Home", icon: "home", iconOutline: "home-outline" },
    { id: "Search", label: "Search", icon: "search", iconOutline: "search-outline" },
    { id: "Friends", label: "Friends", icon: "people", iconOutline: "people-outline" },
    { id: "Library", label: "Library", icon: "library", iconOutline: "library-outline" },
    { id: "Premium", label: "Premium", icon: "diamond", iconOutline: "diamond-outline" },
  ];

  return (
    <View
      style={[
        styles.spotifyTabBar,
        {
          height: fixedTabBarHeight,
          paddingBottom: bottomLift,
        },
      ]}
    >
      {tabs.map((tab) => {
        const isFocused = activeTab === tab.id;
        const activeColor = "#FFFFFF";
        const inactiveColor = "#9E9E9E";

        return (
          <TouchableOpacity
            key={tab.id}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            onPress={() => onSelectTab && onSelectTab(tab.id)}
            style={styles.spotifyTabItem}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isFocused ? tab.icon : tab.iconOutline}
              size={22}
              color={isFocused ? activeColor : inactiveColor}
            />
            <Text
              style={[
                styles.spotifyTabLabel,
                {
                  color: isFocused ? activeColor : inactiveColor,
                  fontFamily: isFocused ? fonts.semiBold : fonts.regular,
                },
              ]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function MainTabs() {
  const { isPhone, isTablet, isDesktop } = useResponsive();
  const [activeTab, setActiveTab] = useState(() => getRouteFromPathname());
  const insets = useSafeAreaInsets();

  const tabHistoryRef = React.useRef(["Home"]);

  const handleSelectTab = (tabName) => {
    if (tabName !== activeTab) {
      tabHistoryRef.current.push(tabName);
    }
    setActiveTab(tabName);
    updateBrowserPathname(tabName);
  };

  // Android hardware / gesture back handling
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const onHardwareBack = () => {
      // If we are not on Home, navigate to previous tab in history or to Home
      if (tabHistoryRef.current.length > 1) {
        tabHistoryRef.current.pop(); // remove current
        const prevTab = tabHistoryRef.current[tabHistoryRef.current.length - 1] || "Home";
        setActiveTab(prevTab);
        updateBrowserPathname(prevTab);
        return true; // handled
      }
      if (activeTab !== "Home") {
        tabHistoryRef.current = ["Home"];
        setActiveTab("Home");
        updateBrowserPathname("Home");
        return true; // handled
      }
      return false; // let Android exit the app
    };

    const backSub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
    return () => backSub.remove();
  }, [activeTab]);

  // Synchronize browser URL on load and handle Browser Back/Forward buttons (popstate)
  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const currentSegment = window.location.pathname.replace(/^\/+/, "").split("/")[0].toLowerCase();
      // If user visited http://localhost:8081/ or invalid path, format URL to /home
      if (!VALID_ROUTES[currentSegment]) {
        window.history.replaceState({ page: activeTab }, "", `/${activeTab.toLowerCase()}`);
      }

      const onPopState = () => {
        const page = getRouteFromPathname();
        setActiveTab(page);
      };

      window.addEventListener("popstate", onPopState);
      return () => window.removeEventListener("popstate", onPopState);
    }
  }, [activeTab]);

  // Desktop & Tablet Form Factor: Spotify Desktop Layout with Sidebar + Player Bar
  if (isDesktop || isTablet) {
    return (
      <View style={styles.desktopLayoutRoot}>
        <View style={styles.desktopBodyRow}>
          {/* Spotify Persistent Left Sidebar */}
          <DesktopSidebar
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
          />

          {/* Central Scrollable Content Area */}
          <View style={styles.desktopContentArea}>
            <View style={[styles.tabContentPane, activeTab !== "Home" && styles.hiddenPane]}>
              <HomeScreen onNavigate={handleSelectTab} />
            </View>
            <View style={[styles.tabContentPane, activeTab !== "Search" && styles.hiddenPane]}>
              <SearchScreen onNavigate={handleSelectTab} />
            </View>
            <View style={[styles.tabContentPane, activeTab !== "Library" && styles.hiddenPane]}>
              <LibraryScreen onNavigate={handleSelectTab} />
            </View>
            <View style={[styles.tabContentPane, activeTab !== "Friends" && styles.hiddenPane]}>
              <FriendsScreen onNavigate={handleSelectTab} />
            </View>
            <View style={[styles.tabContentPane, activeTab !== "Premium" && styles.hiddenPane]}>
              <PremiumScreen onNavigate={handleSelectTab} />
            </View>
          </View>
        </View>

        {/* Docked Full-Width Desktop Player Bar */}
        <DesktopPlayerBar />

        {/* Full-Screen Player Modal (Available when expanded) */}
        <FullPlayerModal />
      </View>
    );
  }

  // Phone Form Factor (< 768px): Spotify-Style Mobile Layout with Lifted Bottom Nav + Flush MiniPlayer
  const safeBottom = insets?.bottom ? Math.min(insets.bottom, 24) : 0;
  const bottomLift = safeBottom > 0 ? safeBottom + 4 : 10;
  const fixedTabBarHeight = 56 + bottomLift;
  const miniPlayerBottom = fixedTabBarHeight;

  return (
    <View style={styles.appContainer}>
      <View style={{ flex: 1, position: "relative" }}>
        <View style={[styles.tabContentPane, activeTab !== "Home" && styles.hiddenPane]}>
          <HomeScreen onNavigate={handleSelectTab} />
        </View>
        <View style={[styles.tabContentPane, activeTab !== "Search" && styles.hiddenPane]}>
          <SearchScreen onNavigate={handleSelectTab} />
        </View>
        <View style={[styles.tabContentPane, activeTab !== "Library" && styles.hiddenPane]}>
          <LibraryScreen onNavigate={handleSelectTab} />
        </View>
        <View style={[styles.tabContentPane, activeTab !== "Friends" && styles.hiddenPane]}>
          <FriendsScreen onNavigate={handleSelectTab} />
        </View>
        <View style={[styles.tabContentPane, activeTab !== "Premium" && styles.hiddenPane]}>
          <PremiumScreen onNavigate={handleSelectTab} />
        </View>
      </View>

      {/* Fixed bottom tab bar */}
      <SpotifyBottomTabBar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        fixedTabBarHeight={fixedTabBarHeight}
        bottomLift={bottomLift}
      />

      {/* Full-width docked mini player placed flush right above the fixed bottom tab bar with 0 gap */}
      <View style={[styles.miniPlayerAnchor, { bottom: miniPlayerBottom }]}>
        <MiniPlayer />
      </View>

      {/* Full screen player modal */}
      <FullPlayerModal />
    </View>
  );
}

function AppContent() {
  const {
    isLoggedIn,
    loginUser,
    isOnboardingCompleted,
    isLoadingUser,
    isProfileOpen,
    closeProfile,
  } = useUser();

  const [showUpdateChangelog, setShowUpdateChangelog] = useState(false);

  // Android back gesture: close profile modal first if open
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const onBack = () => {
      if (isProfileOpen) {
        closeProfile();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [isProfileOpen, closeProfile]);

  // Enforce pure black PWA theme-color and status bar on Web and Mobile browsers
  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      let metaTheme = document.querySelector('meta[name="theme-color"]');
      if (!metaTheme) {
        metaTheme = document.createElement("meta");
        metaTheme.name = "theme-color";
        document.head.appendChild(metaTheme);
      }
      metaTheme.setAttribute("content", "#000000");

      let metaApple = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
      if (!metaApple) {
        metaApple = document.createElement("meta");
        metaApple.name = "apple-mobile-web-app-status-bar-style";
        document.head.appendChild(metaApple);
      }
      metaApple.setAttribute("content", "black");

      let metaNav = document.querySelector('meta[name="msapplication-navbutton-color"]');
      if (!metaNav) {
        metaNav = document.createElement("meta");
        metaNav.name = "msapplication-navbutton-color";
        document.head.appendChild(metaNav);
      }
      metaNav.setAttribute("content", "#000000");

      if (document.body) document.body.style.backgroundColor = "#000000";
      if (document.documentElement) document.documentElement.style.backgroundColor = "#000000";
    }
  }, []);

  // Show changelog on app open: ONLY ONCE per version/build update
  useEffect(() => {
    if (!isLoggedIn || !isOnboardingCompleted) return;

    try {
      const updateKey = `@staytup_changelog_seen_${BUILD_NUMBER}`;
      let seen = null;
      if (typeof window !== "undefined" && window.localStorage) {
        seen = window.localStorage.getItem(updateKey);
      }
      if (!seen) {
        // First time opening after this update -> show changelog modal
        setShowUpdateChangelog(true);
      }
    } catch (_) {}
  }, [isLoggedIn, isOnboardingCompleted]);

  const handleDismissUpdateChangelog = () => {
    setShowUpdateChangelog(false);
    try {
      const updateKey = `@staytup_changelog_seen_${BUILD_NUMBER}`;
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(updateKey, "true");
      }
    } catch (_) {}
  };

  if (isLoadingUser) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" backgroundColor="#000000" />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Login screen with Google and Guest options
  if (!isLoggedIn) {
    return <LoginScreen onLoginSuccess={loginUser} />;
  }

  // Smooth onboarding flow without page refresh
  if (!isOnboardingCompleted) {
    return (
      <>
        <StatusBar style="light" backgroundColor="#000000" />
        <OnboardingScreen />
      </>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style="light" backgroundColor="#000000" />
      <MainTabs />
      {/* Global Profile Page Modal */}
      <ProfileScreen visible={isProfileOpen} onClose={closeProfile} />
      {/* One-time Update Changelog Modal (shows once per version update on app open) */}
      <ChangelogModal
        visible={showUpdateChangelog}
        onClose={handleDismissUpdateChangelog}
      />
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  // Show the React splash screen while fonts are loading
  // (the HTML native splash is already showing behind this)
  if (!fontsLoaded) {
    return (
      <SafeAreaProvider>
        <SplashScreen onFinish={() => {}} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ResponsiveProvider>
        <UserProvider>
          <ErrorBoundary>
            <AudioProvider>
              <AppContent />
            </AudioProvider>
          </ErrorBoundary>
        </UserProvider>
      </ResponsiveProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  appContainer: {
    flex: 1,
    backgroundColor: colors.background,
    position: "relative",
  },
  miniPlayerAnchor: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 99,
  },
  desktopLayoutRoot: {
    flex: 1,
    backgroundColor: colors.background,
    flexDirection: "column",
  },
  desktopBodyRow: {
    flex: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  desktopContentArea: {
    flex: 1,
    backgroundColor: "#000000",
  },
  tabContentPane: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  hiddenPane: {
    display: "none",
  },
  spotifyTabBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    width: "100%",
    backgroundColor: "#000000",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    elevation: 12,
    zIndex: 98,
    paddingTop: 7,
  },
  spotifyTabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
  spotifyTabLabel: {
    fontSize: 10.5,
    marginTop: 3,
    textAlign: "center",
    letterSpacing: 0.1,
  },
});
