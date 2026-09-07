import React, { useState, useEffect, Component, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, Modal } from "react-native";
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

// ─── QR Login Confirmation Screen (shown when mobile user opens /qr-login?sid=xxx) ───
function QRLoginScreen({ sid, onConfirm, onCancel }) {
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [autoAttempted, setAutoAttempted] = useState(false);

  const handleClaim = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { api } = require("./src/api/client");
      const { auth } = require("./src/services/firebase");
      const user = auth?.currentUser;
      if (!user) {
        setError("Please login first on this device, then scan the QR code again.");
        setLoading(false);
        return;
      }
      const res = await api.claimQRSession(sid, {
        uid: user.uid,
        displayName: user.displayName || "Staytup Listener",
        email: user.email || null,
        photoURL: user.photoURL || null,
      });
      if (res && res.success) {
        setSuccess(true);
        if (onConfirm) setTimeout(() => onConfirm(), 1500);
      } else {
        setError(res?.error || "Failed. Session may have expired.");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [sid, onConfirm]);

  // Auto-claim if user is already logged in
  useEffect(() => {
    if (autoAttempted) return;
    setAutoAttempted(true);
    const tryAutoClaim = async () => {
      try {
        const { auth } = require("./src/services/firebase");
        const user = auth?.currentUser;
        if (user) {
          await handleClaim();
        } else {
          setLoading(false);
        }
      } catch (_) {
        setLoading(false);
      }
    };
    tryAutoClaim();
  }, [autoAttempted, handleClaim]);

  if (success) {
    return (
      <View style={qrStyles.screen}>
        <StatusBar style="light" />
        <View style={qrStyles.center}>
          <View style={qrStyles.successCircle}>
            <Ionicons name="checkmark" size={64} color="#1DB954" />
          </View>
          <Text style={qrStyles.successTitle}>Login Confirmed!</Text>
          <Text style={qrStyles.successSub}>
            You can now close this tab and continue on your other device.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={qrStyles.screen}>
      <StatusBar style="light" />
      <View style={qrStyles.center}>
        <View style={qrStyles.iconCircle}>
          <Ionicons name="qr-code" size={48} color="#1DB954" />
        </View>
        <Text style={qrStyles.title}>Confirm Login</Text>
        <Text style={qrStyles.sub}>
          Someone wants to log into Staytup on another device using your account.
        </Text>

        {error ? (
          <View style={qrStyles.errorBox}>
            <Ionicons name="alert-circle" size={16} color="#FF5C5C" />
            <Text style={qrStyles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[qrStyles.confirmBtn, loading && qrStyles.confirmBtnDisabled]}
          onPress={handleClaim}
          disabled={loading || success}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#000000" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#000000" style={{ marginRight: 8 }} />
              <Text style={qrStyles.confirmBtnText}>Yes, Confirm Login</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={qrStyles.cancelBtn} onPress={onCancel} activeOpacity={0.85}>
          <Text style={qrStyles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const qrStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(29,185,84,0.12)",
    borderWidth: 2,
    borderColor: "rgba(29,185,84,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: { fontFamily: "Poppins_700Bold", fontSize: 22, color: "#FFFFFF", marginBottom: 8 },
  sub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1DB954",
    height: 50,
    borderRadius: 25,
    paddingHorizontal: 32,
    width: "100%",
    maxWidth: 300,
    marginBottom: 14,
  },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmBtnText: { fontFamily: "Poppins_700Bold", fontSize: 15, color: "#000000", letterSpacing: 0.2 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 24 },
  cancelBtnText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: "rgba(255,255,255,0.4)" },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,92,92,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,92,92,0.3)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
    width: "100%",
    maxWidth: 300,
  },
  errorText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: "#FF5C5C", flex: 1 },
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(29,185,84,0.12)",
    borderWidth: 2,
    borderColor: "#1DB954",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  successTitle: { fontFamily: "Poppins_700Bold", fontSize: 22, color: "#1DB954", marginBottom: 8 },
  successSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
  },
});

// Valid routes allowed after "/" in the URL
const VALID_ROUTES = {
  home: "Home",
  search: "Search",
  library: "Library",
  friends: "Friends",
  premium: "Premium",
};

// Parse and validate page from browser URL (cannot open any other pages)
function getRouteFromPathname() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const raw = window.location.pathname.replace(/^\/+/, "").split("/")[0].toLowerCase();
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

// Detect QR login route from URL params
function getQRLoginSid() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    return params.get("sid") || null;
  }
  return null;
}

// Push page name to browser URL address bar
function updateBrowserPathname(page) {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.history) {
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
    { id: "Library", label: "Your Library", icon: "library", iconOutline: "library-outline" },
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

  const handleSelectTab = (tabName) => {
    setActiveTab(tabName);
    updateBrowserPathname(tabName);
  };

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

  const [qrLoginSid, setQrLoginSid] = useState(() => getQRLoginSid());

  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const handleQRRoute = () => {
        const sid = getQRLoginSid();
        if (sid) setQrLoginSid(sid);
      };
      window.addEventListener("popstate", handleQRRoute);
      return () => window.removeEventListener("popstate", handleQRRoute);
    }
  }, []);

  const handleQRLoginConfirm = useCallback(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.history.replaceState({}, "", "/home");
    }
    setQrLoginSid(null);
  }, []);

  const handleQRLoginCancel = useCallback(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.history.replaceState({}, "", "/home");
    }
    setQrLoginSid(null);
  }, []);

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

  if (isLoadingUser) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" backgroundColor="#000000" />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // QR Login Confirmation — intercepts /qr-login?sid=xxx before normal login check
  if (qrLoginSid) {
    return (
      <QRLoginScreen
        sid={qrLoginSid}
        onConfirm={handleQRLoginConfirm}
        onCancel={handleQRLoginCancel}
      />
    );
  }

  // Dummy login screen with Google and Guest options
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
