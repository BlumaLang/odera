import React from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";

const APP_ICON = require("../../assets/icon.png");

export default function InstallAppModal({ visible, onClose, platform = "ios" }) {
  if (!visible) return null;

  const isIos = platform === "ios";
  const isWindows = platform === "windows";
  const isMac = platform === "mac";
  const isDesktop = platform === "desktop" || isWindows || isMac;

  let headlineText = "Install Staytup on Android";
  let subheadlineText = "Install Staytup directly on your phone without opening the browser each time.";
  if (isIos) {
    headlineText = "Install Staytup on iPhone";
    subheadlineText = "Enjoy full-screen music streaming, instant one-tap launch from your Home Screen, and lossless Hi-Fi playback.";
  } else if (isWindows) {
    headlineText = "Install Staytup for Windows";
    subheadlineText = "Install Staytup as a standalone desktop app on your Windows PC with taskbar and start menu shortcuts.";
  } else if (isMac) {
    headlineText = "Install Staytup for macOS";
    subheadlineText = "Install Staytup directly to your Mac Dock and Applications folder for full-screen listening.";
  } else if (isDesktop) {
    headlineText = "Install Staytup Desktop App";
    subheadlineText = "Install Staytup as a standalone desktop application for faster loading and keyboard media controls.";
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollWrapper}
          showsVerticalScrollIndicator={false}
        >
          {/* App Icon Card - Centered on Top */}
          <View style={styles.iconWrapper}>
            <View style={styles.iconGlowRing}>
              <Image source={APP_ICON} style={styles.appIcon} resizeMode="cover" />
            </View>
            <View style={styles.appBadge}>
              <Text style={styles.appBadgeText} numberOfLines={1}>
                {isWindows ? "WINDOWS PWA" : isIos ? "OFFICIAL PWA" : "DESKTOP APP"}
              </Text>
            </View>
          </View>

          {/* Title Header */}
          <Text style={styles.headline}>{headlineText}</Text>
          <Text style={styles.subheadline}>{subheadlineText}</Text>

          {/* Step by Step Cards */}
          <View style={styles.stepsContainer}>
            {isIos ? (
              <>
                {/* Step 1 */}
                <View style={styles.stepCard}>
                  <View style={[styles.stepIconWrap, { backgroundColor: "rgba(0, 122, 255, 0.16)" }]}>
                    <Ionicons name="share-outline" size={24} color="#007AFF" />
                  </View>
                  <View style={styles.stepContent}>
                    <View style={styles.stepBadgeRow}>
                      <Text style={styles.stepNumberText}>STEP 1</Text>
                    </View>
                    <Text style={styles.stepTitle}>Tap the Safari Share Button</Text>
                    <Text style={styles.stepDesc}>
                      Look at the bottom navigation bar in Safari and tap the{" "}
                      <Text style={{ color: "#007AFF", fontFamily: fonts.bold }}>Share</Text> icon
                      (the square with an arrow pointing up).
                    </Text>
                  </View>
                </View>

                {/* Safari Bottom Bar Visual Hint */}
                <View style={styles.safariBarHint}>
                  <View style={styles.safariBarIcons}>
                    <Ionicons name="chevron-back" size={20} color="#666" />
                    <Ionicons name="chevron-forward" size={20} color="#666" />
                    <View style={styles.safariShareHighlighted}>
                      <Ionicons name="share-outline" size={22} color="#007AFF" />
                      <View style={styles.pulseDot} />
                    </View>
                    <Ionicons name="book-outline" size={20} color="#666" />
                    <Ionicons name="copy-outline" size={20} color="#666" />
                  </View>
                  <Text style={styles.safariBarLabel}>Tap the highlighted icon</Text>
                </View>

                {/* Step 2 */}
                <View style={styles.stepCard}>
                  <View style={[styles.stepIconWrap, { backgroundColor: "rgba(29, 185, 84, 0.16)" }]}>
                    <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
                  </View>
                  <View style={styles.stepContent}>
                    <View style={styles.stepBadgeRow}>
                      <Text style={styles.stepNumberText}>STEP 2</Text>
                    </View>
                    <Text style={styles.stepTitle}>Tap "Add to Home Screen"</Text>
                    <Text style={styles.stepDesc}>
                      Scroll down through the share options and tap{" "}
                      <Text style={{ color: colors.primary, fontFamily: fonts.bold }}>
                        Add to Home Screen
                      </Text>
                      .
                    </Text>
                  </View>
                </View>

                {/* Step 3 */}
                <View style={styles.stepCard}>
                  <View style={[styles.stepIconWrap, { backgroundColor: "rgba(255, 215, 0, 0.16)" }]}>
                    <Ionicons name="checkmark-circle-outline" size={24} color="#FFD700" />
                  </View>
                  <View style={styles.stepContent}>
                    <View style={styles.stepBadgeRow}>
                      <Text style={styles.stepNumberText}>STEP 3</Text>
                    </View>
                    <Text style={styles.stepTitle}>Tap "Add" in the Top Corner</Text>
                    <Text style={styles.stepDesc}>
                      Confirm by tapping{" "}
                      <Text style={{ color: "#FFFFFF", fontFamily: fonts.bold }}>Add</Text> in the
                      top-right corner. Staytup is now installed!
                    </Text>
                  </View>
                </View>
              </>
            ) : isDesktop ? (
              <>
                {/* Desktop / Windows Steps */}
                <View style={styles.stepCard}>
                  <View style={[styles.stepIconWrap, { backgroundColor: "rgba(0, 164, 239, 0.16)" }]}>
                    <Ionicons name={isWindows ? "logo-windows" : "desktop-outline"} size={24} color="#00A4EF" />
                  </View>
                  <View style={styles.stepContent}>
                    <View style={styles.stepBadgeRow}>
                      <Text style={[styles.stepNumberText, { color: "#00A4EF" }]}>STEP 1</Text>
                    </View>
                    <Text style={styles.stepTitle}>Click the Install Icon in URL Bar</Text>
                    <Text style={styles.stepDesc}>
                      Look at the right end of your browser's address bar (Chrome, Edge, or Brave) and click the{" "}
                      <Text style={{ color: "#00A4EF", fontFamily: fonts.bold }}>Install App</Text> icon (or computer monitor icon).
                    </Text>
                  </View>
                </View>

                <View style={styles.stepCard}>
                  <View style={[styles.stepIconWrap, { backgroundColor: "rgba(29, 185, 84, 0.16)" }]}>
                    <Ionicons name="checkmark-done-circle" size={24} color={colors.primary} />
                  </View>
                  <View style={styles.stepContent}>
                    <View style={styles.stepBadgeRow}>
                      <Text style={styles.stepNumberText}>STEP 2</Text>
                    </View>
                    <Text style={styles.stepTitle}>Click "Install"</Text>
                    <Text style={styles.stepDesc}>
                      Confirm the installation prompt. Staytup will launch in its own native app window with desktop and taskbar shortcuts!
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <>
                {/* Android Fallback Steps */}
                <View style={styles.stepCard}>
                  <View style={[styles.stepIconWrap, { backgroundColor: "rgba(29, 185, 84, 0.16)" }]}>
                    <Ionicons name="ellipsis-vertical" size={24} color={colors.primary} />
                  </View>
                  <View style={styles.stepContent}>
                    <View style={styles.stepBadgeRow}>
                      <Text style={styles.stepNumberText}>STEP 1</Text>
                    </View>
                    <Text style={styles.stepTitle}>Open Browser Menu</Text>
                    <Text style={styles.stepDesc}>
                      Tap the three vertical dots (⋮) in the top-right corner of Chrome.
                    </Text>
                  </View>
                </View>

                <View style={styles.stepCard}>
                  <View style={[styles.stepIconWrap, { backgroundColor: "rgba(46, 189, 215, 0.16)" }]}>
                    <Ionicons name="download-outline" size={24} color="#2EBDD7" />
                  </View>
                  <View style={styles.stepContent}>
                    <View style={styles.stepBadgeRow}>
                      <Text style={styles.stepNumberText}>STEP 2</Text>
                    </View>
                    <Text style={styles.stepTitle}>Select "Install App" or "Add to Home Screen"</Text>
                    <Text style={styles.stepDesc}>
                      Select the install option from the menu list to download the app directly.
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>
        </ScrollView>

        {/* Fixed Bottom Footer */}
        <View style={styles.fixedFooter}>
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={onClose}
            activeOpacity={0.88}
          >
            <Text style={styles.doneBtnText}>Got It, Take Me Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  scrollArea: {
    flex: 1,
    width: "100%",
  },
  scrollWrapper: {
    paddingHorizontal: 22,
    paddingTop: Platform.OS === "web" ? 36 : 48,
    paddingBottom: 24,
    maxWidth: 540,
    width: "100%",
    alignSelf: "center",
    alignItems: "center",
  },
  iconWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
    position: "relative",
  },
  iconGlowRing: {
    width: 96,
    height: 96,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: "rgba(29, 185, 84, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  appIcon: {
    width: "100%",
    height: "100%",
  },
  appBadge: {
    position: "absolute",
    bottom: -11,
    alignSelf: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 104,
    alignItems: "center",
    justifyContent: "center",
  },
  appBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: "#000000",
    letterSpacing: 0.8,
    textAlign: "center",
    ...(Platform.OS === "web" ? { whiteSpace: "nowrap" } : {}),
  },
  headline: {
    fontFamily: fonts.extraBold,
    fontSize: 26,
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -0.5,
    marginTop: 14,
    marginBottom: 8,
  },
  subheadline: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: "#9E9E9E",
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 420,
    marginBottom: 28,
  },
  stepsContainer: {
    width: "100%",
    gap: 14,
    marginBottom: 20,
  },
  stepCard: {
    flexDirection: "row",
    backgroundColor: "#0C0F0E",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "flex-start",
    gap: 14,
  },
  stepIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepContent: {
    flex: 1,
  },
  stepBadgeRow: {
    marginBottom: 4,
  },
  stepNumberText: {
    fontFamily: fonts.bold,
    fontSize: 10.5,
    color: colors.primary,
    letterSpacing: 1.2,
  },
  stepTitle: {
    fontFamily: fonts.bold,
    fontSize: 15.5,
    color: "#FFFFFF",
    marginBottom: 4,
  },
  stepDesc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: "#A0A0A0",
    lineHeight: 19,
  },
  safariBarHint: {
    width: "100%",
    backgroundColor: "#0A0E0C",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0, 122, 255, 0.3)",
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 8,
  },
  safariBarIcons: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 10,
  },
  safariShareHighlighted: {
    position: "relative",
    padding: 6,
    borderRadius: 8,
    backgroundColor: "rgba(0, 122, 255, 0.18)",
    borderWidth: 1,
    borderColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
  },
  pulseDot: {
    position: "absolute",
    top: -3,
    right: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#007AFF",
  },
  safariBarLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: "#007AFF",
    letterSpacing: 0.4,
  },
  fixedFooter: {
    width: "100%",
    backgroundColor: "#000000",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === "web" ? 20 : 34,
    alignItems: "center",
  },
  doneBtn: {
    width: "100%",
    maxWidth: 540,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 4px 12px rgba(29, 185, 84, 0.4)", cursor: "pointer" }
      : { elevation: 4 }),
  },
  doneBtnText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#000000",
  },
});
