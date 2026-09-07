import React, { useState, useEffect, useRef, useCallback } from "react";
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
  Dimensions,
  Linking,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { api } from "../api/client";
import InstallAppModal from "../components/InstallAppModal";

const STAYTUP_LOGO = require("../../assets/staytup_logo.png");
const GOOGLE_ICON = require("../../assets/google_icon.png");

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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

// QR Scanner simulation component (uses device camera via web API or shows manual input)
function QRScannerView({ onScan, onClose }) {
  const [scanning, setScanning] = useState(true);
  const [manualCode, setManualCode] = useState("");
  const [cameraError, setCameraError] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    const startCamera = async () => {
      if (Platform.OS !== "web" || typeof navigator === "undefined" || !navigator.mediaDevices) {
        if (mounted) setCameraError(true);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 640 } },
        });
        if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch (_) {
        if (mounted) setCameraError(true);
      }
    };
    startCamera();
    return () => {
      mounted = false;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleManualSubmit = () => {
    if (manualCode.trim().length >= 6) {
      onScan(manualCode.trim());
    }
  };

  return (
    <View style={scannerStyles.container}>
      <StatusBar style="light" />
      {/* Top bar */}
      <View style={scannerStyles.topBar}>
        <TouchableOpacity onPress={onClose} style={scannerStyles.closeBtn}>
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={scannerStyles.topTitle}>Scan QR Code</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Camera viewport */}
      <View style={scannerStyles.viewport}>
        {cameraError ? (
          <View style={scannerStyles.cameraFallback}>
            <Ionicons name="camera-outline" size={56} color="rgba(255,255,255,0.3)" />
            <Text style={scannerStyles.fallbackText}>Camera not available</Text>
            <Text style={scannerStyles.fallbackSub}>Enter the code manually below</Text>
          </View>
        ) : (
          <>
            <video
              ref={videoRef}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: 16,
              }}
              playsInline
              muted
              autoPlay
            />
            {/* Scan frame overlay */}
            <View style={scannerStyles.scanFrame}>
              <View style={[scannerStyles.corner, scannerStyles.cornerTL]} />
              <View style={[scannerStyles.corner, scannerStyles.cornerTR]} />
              <View style={[scannerStyles.corner, scannerStyles.cornerBL]} />
              <View style={[scannerStyles.corner, scannerStyles.cornerBR]} />
            </View>
            {scanning && (
              <View style={scannerStyles.scanningIndicator}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={scannerStyles.scanningText}>Looking for QR code...</Text>
              </View>
            )}
          </>
        )}
      </View>

      {/* Manual code input */}
      <View style={scannerStyles.bottomSection}>
        <Text style={scannerStyles.bottomHint}>
          Point your camera at a Staytup QR code to log in
        </Text>
        <View style={scannerStyles.manualRow}>
          <View style={scannerStyles.manualInputWrap}>
            <Ionicons name="keypad-outline" size={18} color="rgba(255,255,255,0.4)" />
            <input
              type="text"
              placeholder="Enter code manually"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleManualSubmit(); }}
              style={{
                flex: 1,
                backgroundColor: "transparent",
                border: "none",
                outline: "none",
                color: "#FFFFFF",
                fontFamily: fonts.medium,
                fontSize: 14,
                paddingLeft: 8,
              }}
            />
          </View>
          <TouchableOpacity
            style={[scannerStyles.manualSubmitBtn, manualCode.trim().length < 6 && scannerStyles.manualSubmitDisabled]}
            onPress={handleManualSubmit}
            disabled={manualCode.trim().length < 6}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-forward" size={20} color="#000000" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const scannerStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  closeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  topTitle: { fontFamily: fonts.bold, fontSize: 17, color: "#FFFFFF" },
  viewport: {
    flex: 1,
    marginHorizontal: 20,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#111111",
    position: "relative",
  },
  cameraFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  fallbackText: { fontFamily: fonts.semiBold, fontSize: 16, color: "rgba(255,255,255,0.6)", marginTop: 12 },
  fallbackSub: { fontFamily: fonts.regular, fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 4, textAlign: "center" },
  scanFrame: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 220,
    height: 220,
    marginTop: -110,
    marginLeft: -110,
  },
  corner: {
    position: "absolute",
    width: 28,
    height: 28,
    borderColor: colors.primary,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
  scanningIndicator: {
    position: "absolute",
    bottom: 20,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  scanningText: { fontFamily: fonts.medium, fontSize: 12, color: "rgba(255,255,255,0.7)" },
  bottomSection: { paddingHorizontal: 20, paddingBottom: 32, paddingTop: 16 },
  bottomHint: { fontFamily: fonts.regular, fontSize: 13, color: "rgba(255,255,255,0.45)", textAlign: "center", marginBottom: 16 },
  manualRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  manualInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  manualSubmitBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  manualSubmitDisabled: { opacity: 0.4 },
});

export default function LoginScreen({ onLoginSuccess }) {
  const [loadingProvider, setLoadingProvider] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installModalPlatform, setInstallModalPlatform] = useState(osInfo.platformKey);
  const [hasPrompt, setHasPrompt] = useState(false);

  // QR Scanner modal
  const [showScanner, setShowScanner] = useState(false);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scannerError, setScannerError] = useState("");

  // Legal modals
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

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

  const handleQRScan = useCallback(async (code) => {
    setScannerLoading(true);
    setScannerError("");
    try {
      const res = await api.claimQRSession(code, {
        uid: "scanner_user_" + Date.now(),
        displayName: "Scanned User",
        email: null,
        photoURL: null,
      });
      if (res && res.success) {
        setShowScanner(false);
        if (onLoginSuccess) {
          await onLoginSuccess({ provider: "qr", qrUser: res.user || { uid: "scanner_user", displayName: "Scanned User" } });
        }
      } else {
        setScannerError(res?.error || "Invalid code. Please try again.");
      }
    } catch (err) {
      setScannerError("Network error. Please try again.");
    } finally {
      setScannerLoading(false);
    }
  }, [onLoginSuccess]);

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

  const handleProviderLogin = async (provider) => {
    setErrorMessage("");
    setLoadingProvider(provider);
    try {
      if (onLoginSuccess) {
        const res = await onLoginSuccess({ provider });
        if (res && res.success === false) {
          if (res.code === "auth/popup-closed-by-user") setErrorMessage("Sign-in cancelled");
          else if (res.code === "auth/operation-not-allowed") setErrorMessage("Please enable Google/Anonymous Auth in your Firebase Console");
          else setErrorMessage(res.error || "Sign-in failed. Please try again.");
        }
      }
    } catch (err) {
      setErrorMessage(err.message || "Failed to sign in");
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.mainSection}>
          {/* Brand Header */}
          <View style={styles.brandHeader}>
            <View style={styles.logoContainer}>
              <Image source={STAYTUP_LOGO} style={styles.staytupLogo} resizeMode="contain" />
            </View>
            <Text style={styles.welcomeSubtitle}>
              Millions of songs, lossless Hi-Fi audio, and endless daily discovery.
            </Text>
          </View>

          {/* Error Banner */}
          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color="#FF5C5C" />
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Primary Action */}
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
          </View>

          {/* Secondary Actions */}
          <View style={styles.secondaryGroup}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              activeOpacity={0.85}
              disabled={!!loadingProvider}
              onPress={() => handleProviderLogin("guest")}
            >
              {loadingProvider === "guest" ? (
                <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
              ) : (
                <>
                  <Ionicons name="person-outline" size={18} color="rgba(255,255,255,0.5)" style={styles.secondaryIcon} />
                  <Text style={styles.secondaryBtnText}>Continue as Guest</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.qrScannerBtn}
              activeOpacity={0.85}
              disabled={!!loadingProvider}
              onPress={() => { setShowScanner(true); setScannerError(""); }}
            >
              <Ionicons name="scan-outline" size={18} color={colors.primary} style={styles.secondaryIcon} />
              <Text style={styles.qrScannerBtnText}>Login with QR Code</Text>
            </TouchableOpacity>
          </View>

          {/* Divider + Download */}
          {!isStandalone && (
            <>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>
              <TouchableOpacity
                style={styles.downloadAppButton}
                activeOpacity={0.85}
                onPress={handleDownloadApp}
              >
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
            </>
          )}

          {/* Footer */}
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

      {/* QR Scanner Full Screen Modal */}
      <Modal visible={showScanner} animationType="slide" onRequestClose={() => setShowScanner(false)}>
        <QRScannerView
          onScan={handleQRScan}
          onClose={() => { setShowScanner(false); setScannerError(""); }}
        />
        {scannerLoading && (
          <View style={styles.scannerLoadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.scannerLoadingText}>Verifying...</Text>
          </View>
        )}
        {scannerError ? (
          <View style={styles.scannerErrorBanner}>
            <Ionicons name="alert-circle" size={16} color="#FF5C5C" />
            <Text style={styles.scannerErrorText}>{scannerError}</Text>
          </View>
        ) : null}
      </Modal>

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
            <ScrollView contentContainerStyle={styles.legalContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.legalBody}>
{`STAYTUP — TERMS OF SERVICE\n\nLast Updated: September 2025\n\n1. Acceptance of Terms\nBy accessing or using Staytup ("the App"), you agree to be bound by these Terms of Service. If you do not agree, do not use the App.\n\n2. Description of Service\nStaytup is a music discovery and streaming application that aggregates publicly available music content from YouTube and other public sources. We do not host, store, or distribute any copyrighted audio files.\n\n3. User Conduct\nYou agree not to:\n- Use the App for any unlawful purpose\n- Attempt to reverse-engineer or exploit the App\n- Use automated tools to access the App\n- Interfere with the App's servers or infrastructure\n\n4. Intellectual Property\nAll trademarks, logos, and branding associated with Staytup are the property of their respective owners. Music content is sourced from publicly available platforms.\n\n5. Third-Party Content\nThe App streams content from YouTube. Your use of such content is subject to YouTube's Terms of Service. Staytup is not affiliated with YouTube or Google.\n\n6. Limitation of Liability\nStaytup is provided "as is" without warranties of any kind. We are not liable for any damages arising from your use of the App.\n\n7. Modifications\nWe reserve the right to modify these Terms at any time. Continued use of the App after changes constitutes acceptance of the new Terms.\n\n8. Contact\nFor questions about these Terms, contact: info.to.animikh@gmail.com`}
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
            <ScrollView contentContainerStyle={styles.legalContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.legalBody}>
{`STAYTUP — PRIVACY POLICY\n\nLast Updated: September 2025\n\n1. Information We Collect\n- Account Information (name, email, photo via Google)\n- Usage Data (listening history, search queries)\n- Device Information\n\n2. How We Use Information\n- To provide and improve the App\n- To personalize recommendations\n- To track listening statistics\n\n3. Data Storage\nYour data is stored securely in Firebase (Google Cloud).\n\n4. Third-Party Services\n- Firebase Authentication & Database\n- YouTube API\n- Analytics services\n\n5. Your Rights\n- Access your data\n- Request deletion\n- Opt out of personalization\n\n6. Children's Privacy\nThe App is not intended for users under 13 years of age.\n\n7. Contact\ninfo.to.animikh@gmail.com`}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  scrollContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 48 },
  mainSection: { width: "100%", maxWidth: 360, alignItems: "center" },
  brandHeader: { alignItems: "center", marginBottom: 36, width: "100%" },
  logoContainer: { alignItems: "center", justifyContent: "center", marginBottom: 16 },
  staytupLogo: { width: 240, height: 74 },
  welcomeSubtitle: { fontFamily: fonts.regular, fontSize: 13.5, color: "rgba(255, 255, 255, 0.65)", textAlign: "center", lineHeight: 20, paddingHorizontal: 16, letterSpacing: 0.1 },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255, 92, 92, 0.12)", borderWidth: 1, borderColor: "rgba(255, 92, 92, 0.3)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 18, width: "100%" },
  errorBannerText: { fontFamily: fonts.medium, fontSize: 12, color: "#FF5C5C", flex: 1 },
  buttonGroup: { width: "100%", marginBottom: 12 },
  googleButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", height: 50, borderRadius: 25, backgroundColor: "#FFFFFF", paddingHorizontal: 24 },
  googleButtonText: { fontFamily: fonts.semiBold, fontSize: 14.5, color: "#0f172a", letterSpacing: 0.2 },
  secondaryGroup: { width: "100%", gap: 10, marginBottom: 24 },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", paddingHorizontal: 24 },
  secondaryBtnText: { fontFamily: fonts.semiBold, fontSize: 14, color: "rgba(255,255,255,0.6)", letterSpacing: 0.2 },
  secondaryIcon: { marginRight: 10 },
  qrScannerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", height: 46, borderRadius: 23, backgroundColor: "rgba(29, 185, 84, 0.1)", borderWidth: 1, borderColor: "rgba(29, 185, 84, 0.3)", paddingHorizontal: 24 },
  qrScannerBtnText: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.primary, letterSpacing: 0.2 },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 4, paddingHorizontal: 8, marginBottom: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "rgba(255, 255, 255, 0.1)" },
  dividerText: { marginHorizontal: 14, fontFamily: fonts.medium, fontSize: 12, color: "rgba(255, 255, 255, 0.35)", textTransform: "uppercase", letterSpacing: 0.6 },
  downloadAppButton: { flexDirection: "row", alignItems: "center", backgroundColor: "#0F1612", borderWidth: 1.2, borderColor: "rgba(29, 185, 84, 0.4)", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, gap: 12, width: "100%" },
  downloadIconWrap: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  downloadButtonTitle: { fontFamily: fonts.bold, fontSize: 14, color: "#FFFFFF", letterSpacing: 0.2 },
  downloadButtonSub: { fontFamily: fonts.regular, fontSize: 11, color: "rgba(255, 255, 255, 0.55)", marginTop: 1 },
  osBadgeWrap: { backgroundColor: "rgba(255, 255, 255, 0.08)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.12)" },
  osBadgeText: { fontFamily: fonts.bold, fontSize: 9.5, color: "rgba(255, 255, 255, 0.8)", letterSpacing: 0.6 },
  footerContainer: { width: "100%", paddingHorizontal: 12, marginTop: 20 },
  footerTerms: { fontFamily: fonts.regular, fontSize: 11.5, color: "rgba(255, 255, 255, 0.45)", textAlign: "center", lineHeight: 17 },
  footerLink: { color: "rgba(255, 255, 255, 0.7)", textDecorationLine: "underline" },
  scannerLoadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" },
  scannerLoadingText: { fontFamily: fonts.medium, fontSize: 14, color: "#FFFFFF", marginTop: 12 },
  scannerErrorBanner: { position: "absolute", bottom: 100, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,92,92,0.15)", borderWidth: 1, borderColor: "rgba(255,92,92,0.3)", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  scannerErrorText: { fontFamily: fonts.medium, fontSize: 12, color: "#FF5C5C" },
  legalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)" },
  legalContainer: { flex: 1, backgroundColor: "#000000" },
  legalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  legalCloseBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  legalTitle: { fontFamily: fonts.bold, fontSize: 17, color: "#FFFFFF" },
  legalContent: { padding: 20, paddingBottom: 40 },
  legalBody: { fontFamily: fonts.regular, fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 20, letterSpacing: 0.1 },
});
