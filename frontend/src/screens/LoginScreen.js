import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
  Modal,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { useResponsive } from "../context/ResponsiveContext";
import InstallAppModal from "../components/InstallAppModal";

const STAYTUP_LOGO = require("../../assets/staytup_logo.png");
const GOOGLE_ICON = require("../../assets/google_icon.png");

const userAgent = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
const platformStr = typeof navigator !== "undefined" ? navigator.platform || "" : "";

const isIOS =
  Platform.OS === "ios" ||
  (Platform.OS === "web" &&
    typeof navigator !== "undefined" &&
    (/iPad|iPhone|iPod/.test(userAgent) ||
      (platformStr === "MacIntel" && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1)));

const isAndroid =
  Platform.OS === "android" ||
  (Platform.OS === "web" &&
    typeof navigator !== "undefined" &&
    /Android/i.test(userAgent));

const isWindows =
  Platform.OS === "windows" ||
  (Platform.OS === "web" &&
    (/Win32|Win64|Windows|WinCE/i.test(userAgent) || /Win/i.test(platformStr)));

const isMac =
  Platform.OS === "macos" ||
  (Platform.OS === "web" &&
    /Macintosh|MacIntel|MacPPC|Mac68K/i.test(userAgent) &&
    !isIOS);

const isStandalone =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true);

function getOsInfo() {
  if (isWindows) return { icon: "logo-windows", title: "Download for Windows", subtitle: "Direct Desktop App (PWA)", badge: "WINDOWS", platformKey: "windows" };
  if (isMac) return { icon: "logo-apple", title: "Download for macOS", subtitle: "Direct Desktop App (PWA)", badge: "MAC", platformKey: "mac" };
  if (isIOS) return { icon: "logo-apple", title: "Download for iOS", subtitle: "Add to Home Screen", badge: "IOS", platformKey: "ios" };
  if (isAndroid) return { icon: "logo-android", title: "Download Staytup App", subtitle: "Direct 1-Tap Install (Android)", badge: "ANDROID", platformKey: "android" };
  return { icon: "desktop-outline", title: "Download Desktop App", subtitle: "Direct Desktop App (PWA)", badge: "DESKTOP", platformKey: "desktop" };
}

const osInfo = getOsInfo();

function GoogleIcon({ size = 20 }) {
  return <Image source={GOOGLE_ICON} style={{ width: size, height: size, marginRight: 12 }} resizeMode="contain" />;
}

// ─── Main LoginScreen Component ──────────────────────────────────────────────────
export default function LoginScreen({ onLoginSuccess }) {
  const { isDesktop, isTablet } = useResponsive();
  const isLargeScreen = isDesktop || isTablet;

  const [loadingProvider, setLoadingProvider] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installModalPlatform, setInstallModalPlatform] = useState(osInfo.platformKey);
  const [hasPrompt, setHasPrompt] = useState(false);

  // Modals
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [invitedUsername, setInvitedUsername] = useState("");

  // Check URL pathname for /friend/:username invite
  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined" && window.location) {
      const parts = window.location.pathname.replace(/^\/+/, "").split("/");
      if ((parts[0] === "friend" || parts[0] === "friends") && parts[1]) {
        try {
          const decoded = decodeURIComponent(parts[1]).trim();
          if (decoded) setInvitedUsername(decoded);
        } catch (_) {}
      }
    }
  }, []);

  // PWA install prompt listeners
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (window.deferredPWAInstallPrompt) setHasPrompt(true);
      const onPromptReady = () => setHasPrompt(true);
      const onInstalled = () => setHasPrompt(false);
      window.addEventListener("pwa-prompt-ready", onPromptReady);
      window.addEventListener("pwa-installed", onInstalled);
      return () => {
        window.removeEventListener("pwa-prompt-ready", onPromptReady);
        window.removeEventListener("pwa-installed", onInstalled);
      };
    }
  }, []);

  const handleProviderLogin = async (provider, extra = {}) => {
    setErrorMessage("");
    setLoadingProvider(provider);
    try {
      if (onLoginSuccess) {
        const res = await onLoginSuccess({ provider, ...extra });
        if (res && res.success === false) {
          if (res.code === "auth/popup-closed-by-user") setErrorMessage("Sign-in cancelled");
          else if (res.code === "auth/operation-not-allowed") setErrorMessage("Please enable Auth in Firebase Console");
          else setErrorMessage(res.error || "Sign-in failed. Please try again.");
        }
      }
    } catch (err) {
      setErrorMessage(err.message || "Failed to sign in");
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleDownloadApp = async () => {
    if (isIOS) { setInstallModalPlatform("ios"); setShowInstallModal(true); return; }
    if (typeof window !== "undefined" && window.deferredPWAInstallPrompt) {
      const promptEvent = window.deferredPWAInstallPrompt;
      promptEvent.prompt();
      try {
        const choice = await promptEvent.userChoice;
        if (choice && choice.outcome === "accepted") { window.deferredPWAInstallPrompt = null; setHasPrompt(false); }
      } catch (_) {}
      return;
    }
    setInstallModalPlatform(osInfo.platformKey);
    setShowInstallModal(true);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" backgroundColor="#000000" />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.loginCard, isLargeScreen && styles.loginCardDesktop]}>
          {/* Logo & Headline */}
          <View style={styles.brandHeader}>
            <View style={styles.logoContainer}>
              <Image source={STAYTUP_LOGO} style={styles.staytupLogo} resizeMode="contain" />
            </View>
            {invitedUsername ? (
              <View style={styles.inviteBanner}>
                <Ionicons name="people" size={18} color="#1DB954" style={{ marginRight: 8 }} />
                <Text style={styles.inviteBannerText}>
                  <Text style={{ fontWeight: "700", color: "#FFFFFF" }}>@{invitedUsername}</Text> invited you to connect on Staytup!
                </Text>
              </View>
            ) : (
              <Text style={styles.welcomeSubtitle}>
                Millions of songs, lossless Hi-Fi audio, and endless daily discovery.
              </Text>
            )}
          </View>

          {/* Error Message Banner */}
          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color="#FF5C5C" />
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Sign In Actions */}
          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={styles.googleButton}
              activeOpacity={0.85}
              disabled={!!loadingProvider}
              onPress={() => handleProviderLogin("google")}
            >
              {loadingProvider === "google" ? (
                <ActivityIndicator size="small" color="#0f172a" />
              ) : (
                <>
                  <GoogleIcon size={20} />
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.guestButton}
              activeOpacity={0.85}
              disabled={!!loadingProvider}
              onPress={() => handleProviderLogin("guest")}
            >
              {loadingProvider === "guest" ? (
                <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
              ) : (
                <>
                  <Ionicons name="person-outline" size={18} color="rgba(255,255,255,0.7)" style={{ marginRight: 10 }} />
                  <Text style={styles.guestButtonText}>Continue as Guest</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* PWA Download Button */}
          {!isStandalone && (
            <View style={styles.downloadWrap}>
              <TouchableOpacity style={styles.downloadAppButton} activeOpacity={0.85} onPress={handleDownloadApp}>
                <View style={styles.downloadIconWrap}>
                  <Ionicons name={osInfo.icon} size={20} color="#000000" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.downloadButtonTitle}>{osInfo.title}</Text>
                  <Text style={styles.downloadButtonSub}>{osInfo.subtitle}</Text>
                </View>
                <View style={styles.osBadgeWrap}>
                  <Text style={styles.osBadgeText}>{osInfo.badge}</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Legal Footer */}
          <View style={styles.footerContainer}>
            <Text style={styles.footerTerms}>
              By continuing, you agree to Staytup's{" "}
              <Text style={styles.footerLink} onPress={() => setShowTerms(true)}>Terms of Service</Text>
              {" "}and{" "}
              <Text style={styles.footerLink} onPress={() => setShowPrivacy(true)}>Privacy Policy</Text>.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Install App Modal */}
      <InstallAppModal visible={showInstallModal} platform={installModalPlatform} onClose={() => setShowInstallModal(false)} />

      {/* Terms of Service Modal */}
      <Modal visible={showTerms} transparent animationType="slide" onRequestClose={() => setShowTerms(false)}>
        <View style={styles.legalOverlay}>
          <View style={styles.legalContainer}>
            <View style={styles.legalHeader}>
              <TouchableOpacity onPress={() => setShowTerms(false)} style={styles.legalCloseBtn}>
                <Ionicons name="close" size={24} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
              <Text style={styles.legalTitle}>Terms of Service</Text>
              <View style={{ width: 32 }} />
            </View>
            <ScrollView contentContainerStyle={styles.legalContent}>
              <Text style={styles.legalBody}>
{`STAYTUP — TERMS OF SERVICE\n\n1. Acceptance of Terms\nBy accessing or using Staytup ("the App"), you agree to be bound by these Terms of Service.\n\n2. Description of Service\nStaytup is a music discovery and streaming application that aggregates publicly available music content. We do not host copyrighted audio files.\n\n3. User Accounts\nYou are responsible for safeguarding your account access and any activity conducted under your credentials.`}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Privacy Policy Modal */}
      <Modal visible={showPrivacy} transparent animationType="slide" onRequestClose={() => setShowPrivacy(false)}>
        <View style={styles.legalOverlay}>
          <View style={styles.legalContainer}>
            <View style={styles.legalHeader}>
              <TouchableOpacity onPress={() => setShowPrivacy(false)} style={styles.legalCloseBtn}>
                <Ionicons name="close" size={24} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
              <Text style={styles.legalTitle}>Privacy Policy</Text>
              <View style={{ width: 32 }} />
            </View>
            <ScrollView contentContainerStyle={styles.legalContent}>
              <Text style={styles.legalBody}>
{`STAYTUP — PRIVACY POLICY\n\n1. Information We Collect\n- Account Information (Username, email if authenticated via Google)\n- Usage Data (Playlists, Liked Songs, Listening History)\n\n2. Data Protection\nAll user communication and authentication are protected with industry-standard encryption.`}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
    backgroundColor: "#000000",
  },
  loginCard: {
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
  },
  loginCardDesktop: {
    maxWidth: 440,
    padding: 40,
    borderRadius: 24,
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  brandHeader: {
    alignItems: "center",
    marginBottom: 36,
    width: "100%",
  },
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  staytupLogo: {
    width: 240,
    height: 72,
  },
  welcomeSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.65)",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  inviteBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(29, 185, 84, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.3)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 6,
    width: "100%",
  },
  inviteBannerText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: "#E0E0E0",
    textAlign: "center",
    flexShrink: 1,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 92, 92, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 92, 92, 0.3)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
    width: "100%",
  },
  errorBannerText: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: "#FF5C5C",
    flex: 1,
  },
  buttonGroup: {
    width: "100%",
    gap: 12,
    marginBottom: 20,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 24,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  googleButtonText: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: "#0f172a",
    letterSpacing: 0.2,
  },
  guestButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 24,
  },
  guestButtonText: {
    fontFamily: fonts.semiBold,
    fontSize: 14.5,
    color: "rgba(255,255,255,0.75)",
    letterSpacing: 0.2,
  },
  downloadWrap: {
    width: "100%",
    marginVertical: 14,
  },
  downloadAppButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F1612",
    borderWidth: 1.2,
    borderColor: "rgba(29, 185, 84, 0.4)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    width: "100%",
  },
  downloadIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  downloadButtonTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  downloadButtonSub: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.55)",
    marginTop: 1,
  },
  osBadgeWrap: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  osBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 9.5,
    color: "rgba(255, 255, 255, 0.8)",
    letterSpacing: 0.6,
  },
  footerContainer: {
    width: "100%",
    paddingHorizontal: 12,
    marginTop: 16,
  },
  footerTerms: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: "rgba(255, 255, 255, 0.45)",
    textAlign: "center",
    lineHeight: 18,
  },
  footerLink: {
    color: "rgba(255, 255, 255, 0.7)",
    textDecorationLine: "underline",
  },
  legalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
  },
  legalContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  legalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  legalCloseBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  legalTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: "#FFFFFF",
  },
  legalContent: {
    padding: 24,
    paddingBottom: 40,
  },
  legalBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    lineHeight: 22,
  },
});
