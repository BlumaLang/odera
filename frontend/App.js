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
import QueueNoticeBanner from "./src/components/QueueNoticeBanner";
import LiveReactionOverlay from "./src/components/LiveReactionOverlay";
import ActiveDevicesModal from "./src/components/ActiveDevicesModal";
import DeepLinkPreviewModal from "./src/components/DeepLinkPreviewModal";
import ShareSheetModal from "./src/components/ShareSheetModal";
import ListeningPartyModal from "./src/components/ListeningPartyModal";
import CreatePartyModal from "./src/components/CreatePartyModal";
import { api } from "./src/api/client";
import { useAudio } from "./src/context/AudioContext";
import { BUILD_NUMBER, APP_VERSION } from "./src/config/version";
import { colors, fonts } from "./src/theme/colors";
import { handleGlobalBack, registerBackAction } from "./src/services/navigation";

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
  profile: "Home",
  // Deep link routes
  song: "Home",
  album: "Home",
  artist: "Search",
  playlist: "Library",
  room: "Home",
  user: "Friends",
};

// Parse and validate page from browser URL
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
  const { pendingRequestsCount } = useUser() || {};
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
            <View style={styles.tabIconContainer}>
              <Ionicons
                name={isFocused ? tab.icon : tab.iconOutline}
                size={22}
                color={isFocused ? activeColor : inactiveColor}
              />
              {tab.id === "Friends" && pendingRequestsCount > 0 && (
                <View style={styles.tabRedBadge}>
                  <Text style={styles.tabRedBadgeText}>
                    {pendingRequestsCount > 99 ? "99+" : pendingRequestsCount}
                  </Text>
                </View>
              )}
            </View>
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

  const [friendsSubTab, setFriendsSubTab] = useState("friends");
  const tabHistoryRef = React.useRef(["Home"]);

  const handleSelectTab = (tabName, params) => {
    if (tabName !== activeTab) {
      tabHistoryRef.current.push(tabName);
    }
    if (params?.tab) {
      setFriendsSubTab(params.tab);
    }
    setActiveTab(tabName);
    updateBrowserPathname(tabName);
  };

  // Android hardware / gesture back handling
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const onHardwareBack = () => {
      // 1. Check if any topmost modal/sheet is open in the navigation stack
      if (handleGlobalBack()) {
        return true; // handled by topmost modal
      }

      // 2. If no modal is open, navigate to previous tab in history or to Home
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
              <FriendsScreen onNavigate={handleSelectTab} initialTab={friendsSubTab} />
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
  const bottomLift = safeBottom > 0 ? safeBottom + 4 : (Platform.OS === "android" ? 14 : 10);
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
          <FriendsScreen onNavigate={handleSelectTab} initialTab={friendsSubTab} />
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
    openProfile,
    closeProfile,
  } = useUser();
  const { isDeviceModalOpen, closeDeviceModal } = useAudio();

  const [showUpdateChangelog, setShowUpdateChangelog] = useState(false);
  const [forceReady, setForceReady] = useState(Platform.OS === "web");

  // Deep Link Web Preview & Sharing State
  const [deepLinkData, setDeepLinkData] = useState(null);
  const [deepLinkType, setDeepLinkType] = useState("song");
  const [showDeepLinkModal, setShowDeepLinkModal] = useState(false);
  const [shareSheetConfig, setShareSheetConfig] = useState(null);

  // Synchronized Listening Party State
  const [activePartyId, setActivePartyId] = useState(null);
  const [showPartyModal, setShowPartyModal] = useState(false);
  const [showCreatePartyModal, setShowCreatePartyModal] = useState(false);

  const { playTrack } = useAudio();

  // Listen for global share and party requests
  useEffect(() => {
    if (typeof window !== "undefined") {
      const handleOpenShare = (e) => {
        if (e?.detail) {
          setShareSheetConfig(e.detail);
        }
      };
      const handleOpenParty = (e) => {
        const id = e?.detail?.partyId || e?.detail;
        if (id) {
          setActivePartyId(id);
          setShowPartyModal(true);
        }
      };
      const handleCreateParty = () => {
        setShowCreatePartyModal(true);
      };

      window.addEventListener("staytup-open-share", handleOpenShare);
      window.addEventListener("staytup-open-party", handleOpenParty);
      window.addEventListener("staytup-create-party", handleCreateParty);
      window.staytupOpenParty = (id) => {
        setActivePartyId(id);
        setShowPartyModal(true);
      };
      window.staytupCreateParty = () => setShowCreatePartyModal(true);

      return () => {
        window.removeEventListener("staytup-open-share", handleOpenShare);
        window.removeEventListener("staytup-open-party", handleOpenParty);
        window.removeEventListener("staytup-create-party", handleCreateParty);
      };
    }
  }, []);

  // Parse deep link on initial mount (staytup.app/song/{id}, /album/{id}, /artist/{id}, /playlist/{id}, /room/{id}, /user/{username})
  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const parts = window.location.pathname.replace(/^\/+/, "").split("/");
      const section = parts[0]?.toLowerCase();
      const entityId = parts[1];

      if (["song", "album", "artist", "playlist", "room", "user"].includes(section) && entityId) {
        setDeepLinkType(section);
        if (section === "song") {
          // Fetch song info or search by ID
          api.getSong(entityId).then((res) => {
            const track = res?.track || res?.song || res?.data;
            if (track) {
              setDeepLinkData(track);
              setShowDeepLinkModal(true);
            }
          }).catch(() => {
            setDeepLinkData({ title: "Song Preview", subtitle: "Staytup Music", id: entityId });
            setShowDeepLinkModal(true);
          });
        } else if (section === "album") {
          setDeepLinkData({ title: decodeURIComponent(entityId), subtitle: "Album on Staytup", id: entityId });
          setShowDeepLinkModal(true);
        } else if (section === "artist") {
          setDeepLinkData({ name: decodeURIComponent(entityId), subtitle: "Artist on Staytup", id: entityId });
          setShowDeepLinkModal(true);
        } else if (section === "playlist") {
          setDeepLinkData({ title: decodeURIComponent(entityId), subtitle: "Playlist on Staytup", id: entityId });
          setShowDeepLinkModal(true);
        } else if (section === "room") {
          setActivePartyId(entityId);
          setShowPartyModal(true);
        } else if (section === "user") {
          setDeepLinkData({ username: entityId, subtitle: `@${entityId} on Staytup` });
          setShowDeepLinkModal(true);
        }
      }
    }
  }, []);

  // Profile modal back handler registration
  useEffect(() => {
    if (isProfileOpen) {
      return registerBackAction(() => {
        closeProfile();
        return true;
      });
    }
  }, [isProfileOpen, closeProfile]);

  // Reset window scroll offset on login
  useEffect(() => {
    if (isLoggedIn && Platform.OS === "web" && typeof window !== "undefined") {
      window.scrollTo(0, 0);
    }
  }, [isLoggedIn]);

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

  // Auto-open profile modal if URL starts with /profile
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname.toLowerCase().startsWith("/profile")) {
      openProfile();
    }
  }, [openProfile]);

  const handleDismissUpdateChangelog = () => {
    setShowUpdateChangelog(false);
  };

  if (isLoadingUser && !forceReady) {
    return (
      <SafeAreaProvider>
        <SplashScreen onFinish={() => setForceReady(true)} />
      </SafeAreaProvider>
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
    <NavigationContainer
      theme={navTheme}
      // This app uses custom tabs rather than navigator-managed screens. Without
      // a formatter, React Navigation writes an undefined route title on web.
      documentTitle={{ formatter: () => "Staytup" }}
    >
      <StatusBar style="light" backgroundColor="#000000" />
      <MainTabs />
      {/* Global Floating Queue Action Feedback */}
      <QueueNoticeBanner />
      {/* Global Profile Page Modal */}
      <ProfileScreen visible={isProfileOpen} onClose={closeProfile} />
      {/* One-time Update Changelog Modal (shows once per version update on app open) */}
      <ChangelogModal
        visible={showUpdateChangelog}
        onClose={handleDismissUpdateChangelog}
      />
      {/* Real-time Airbuds Live Reaction Bursts & Floating Emojis */}
      <LiveReactionOverlay />
      {/* Global Active Devices Modal */}
      <ActiveDevicesModal visible={isDeviceModalOpen} onClose={closeDeviceModal} />
      {/* Deep Link Web Preview Modal */}
      <DeepLinkPreviewModal
        visible={showDeepLinkModal}
        type={deepLinkType}
        data={deepLinkData}
        onClose={() => setShowDeepLinkModal(false)}
        onPlayInStaytup={() => {
          setShowDeepLinkModal(false);
          if (deepLinkData) {
            playTrack(deepLinkData);
          }
        }}
        onOpenApp={() => setShowDeepLinkModal(false)}
      />
      {/* Universal Share Sheet Modal */}
      <ShareSheetModal
        visible={!!shareSheetConfig}
        type={shareSheetConfig?.type || "song"}
        data={shareSheetConfig?.data || {}}
        onClose={() => setShareSheetConfig(null)}
      />
      {/* Synchronized Listening Party Room Modal */}
      <ListeningPartyModal
        partyId={activePartyId}
        visible={showPartyModal}
        onClose={() => {
          setShowPartyModal(false);
          setActivePartyId(null);
        }}
      />
      {/* Create Listening Party Modal */}
      <CreatePartyModal
        visible={showCreatePartyModal}
        onClose={() => setShowCreatePartyModal(false)}
        onCreated={(newPartyId) => {
          setActivePartyId(newPartyId);
          setShowPartyModal(true);
        }}
      />
    </NavigationContainer>
  );
}

export default function App() {
  const isWeb = Platform.OS === "web";
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });
  const [fontTimeout, setFontTimeout] = useState(isWeb);

  useEffect(() => {
    if (isWeb) return;
    const timer = setTimeout(() => setFontTimeout(true), 1000);
    return () => clearTimeout(timer);
  }, [isWeb]);

  // On web, Poppins is preloaded with font-display: swap in CSS, so it starts immediately
  // On native, wait for bundled fonts or 1s timeout
  if (!isWeb && !fontsLoaded && !fontTimeout) {
    return (
      <SafeAreaProvider>
        <SplashScreen onFinish={() => setFontTimeout(true)} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ResponsiveProvider>
        <ErrorBoundary>
          <UserProvider>
            <AudioProvider>
              <AppContent />
            </AudioProvider>
          </UserProvider>
        </ErrorBoundary>
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
  tabIconContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  tabRedBadge: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: "#FF3B30",
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#000000",
  },
  tabRedBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontFamily: fonts.bold,
    lineHeight: 11,
    textAlign: "center",
  },
});
