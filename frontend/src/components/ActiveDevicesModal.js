import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
  PanResponder,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { useUser } from "../context/UserContext";
import { useAudio } from "../context/AudioContext";
import { useResponsive } from "../context/ResponsiveContext";
import {
  getOrCreateDeviceId,
  subscribeActiveDevices,
  removeActiveDevice,
} from "../services/firebase";

function formatRelativeTime(timestamp) {
  if (!timestamp) return "Recently active";
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);

  if (diffSec < 45) return "Active now";
  if (diffSec < 90) return "1 min ago";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

export default function ActiveDevicesModal({ visible, onClose }) {
  const { userProfile } = useUser() || {};
  const responsive = (typeof useResponsive === "function" ? useResponsive() : null) || {};
  const isDesktop = responsive.isDesktop ?? (typeof window !== "undefined" ? window.innerWidth >= 1024 : false);
  const isTablet = responsive.isTablet ?? (typeof window !== "undefined" ? (window.innerWidth >= 768 && window.innerWidth < 1024) : false);
  const deviceName = responsive.deviceName || "This Device";
  const deviceIcon = responsive.deviceIcon || (isDesktop ? "laptop-outline" : isTablet ? "tablet-portrait-outline" : "phone-portrait-outline");
  const deviceType = responsive.deviceType || (isDesktop ? "desktop" : isTablet ? "tablet" : "phone");

  const [internalVisible, setInternalVisible] = useState(false);
  const isShown = visible !== undefined ? visible : internalVisible;
  const handleClose = () => {
    if (onClose) onClose();
    setInternalVisible(false);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const openHandler = () => setInternalVisible(true);
    const closeHandler = () => setInternalVisible(false);
    window.addEventListener("staytup-open-devices", openHandler);
    window.addEventListener("staytup-close-devices", closeHandler);
    window.staytupOpenDevices = openHandler;
    window.staytupCloseDevices = closeHandler;
    return () => {
      window.removeEventListener("staytup-open-devices", openHandler);
      window.removeEventListener("staytup-close-devices", closeHandler);
    };
  }, []);

  const currentDeviceId = getOrCreateDeviceId();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nowTime, setNowTime] = useState(Date.now());

  const panY = useRef(new Animated.Value(0)).current;

  // Tick relative timestamps every 30 seconds
  useEffect(() => {
    if (!isShown) return;
    const interval = setInterval(() => setNowTime(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [isShown]);

  // Subscribe to live active devices for this user
  useEffect(() => {
    if (!isShown || !userProfile?.uid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeActiveDevices(userProfile.uid, (list) => {
      setDevices(list || []);
      setLoading(false);
    });

    return () => {
      try {
        unsubscribe();
      } catch (_) {}
    };
  }, [visible, userProfile?.uid]);

  // Keyboard Escape listener (web)
  useEffect(() => {
    if (!isShown || Platform.OS !== "web" || typeof window === "undefined") return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape" || e.keyCode === 27) {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isShown]);

  // Swipe-to-dismiss gesture on mobile
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) panY.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 80 || gestureState.vy > 0.5) {
          Animated.timing(panY, {
            toValue: 400,
            duration: 180,
            useNativeDriver: Platform.OS !== "web",
          }).start(() => {
            handleClose();
            panY.setValue(0);
          });
        } else {
          Animated.spring(panY, {
            toValue: 0,
            friction: 8,
            useNativeDriver: Platform.OS !== "web",
          }).start();
        }
      },
    })
  ).current;

  if (!isShown) return null;

  // Separate current device from other sessions
  const currentDeviceFromList = devices.find((d) => d.id === currentDeviceId);
  const otherDevices = devices.filter((d) => d.id !== currentDeviceId);

  // Derive current device display info with fallback
  const myName = currentDeviceFromList?.name || deviceName || "This Device";
  const myPlatform = currentDeviceFromList?.platform || (isDesktop ? "Desktop" : isTablet ? "Tablet" : "Mobile");
  const myBrowser = currentDeviceFromList?.browser || "Web Browser";
  const myIcon = currentDeviceFromList?.icon || deviceIcon || "desktop-outline";

  const totalOnline = devices.filter((d) => d.isOnline).length || 1;

  const handleLogoutDevice = async (deviceId) => {
    if (!userProfile?.uid || !deviceId) return;
    try {
      await removeActiveDevice(userProfile.uid, deviceId);
    } catch (_) {}
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={isShown}
      onRequestClose={handleClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={handleClose}
      >
        <Animated.View
          style={[
            styles.modalContainer,
            isDesktop && styles.modalContainerDesktop,
            { transform: [{ translateY: panY }] },
          ]}
          {...(!isDesktop ? panResponder.panHandlers : {})}
          onStartShouldSetResponder={() => true}
        >
          {/* Top Drag Indicator (Mobile) */}
          {!isDesktop && (
            <View style={styles.dragHandleContainer}>
              <View style={styles.dragHandle} />
            </View>
          )}

          {/* Header Row */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconCircle}>
                <Ionicons name="hardware-chip-outline" size={18} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.headerTitle}>Active Devices</Text>
                <Text style={styles.headerSubtitle}>
                  {totalOnline} device{totalOnline === 1 ? "" : "s"} online on your account
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Close active devices"
            >
              <Ionicons name="close" size={20} color="#AAAAAA" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={styles.scrollContentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Section 1: Current Device Card */}
            <View style={styles.sectionHeaderWrap}>
              <Text style={styles.sectionLabel}>CURRENT DEVICE</Text>
            </View>

            <View style={styles.currentDeviceCard}>
              <View style={styles.deviceIconCircleCurrent}>
                <Ionicons name={myIcon} size={22} color={colors.primary} />
              </View>

              <View style={styles.deviceInfoCol}>
                <View style={styles.deviceNameRow}>
                  <Text style={styles.deviceNameText} numberOfLines={1}>
                    {myName}
                  </Text>
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentBadgeText}>Current device</Text>
                  </View>
                </View>

                <View style={styles.deviceMetaRow}>
                  <Text style={styles.deviceMetaText} numberOfLines={1}>
                    {myPlatform} &middot; {myBrowser}
                  </Text>
                </View>

                {currentTrack && (
                  <View style={styles.playingTrackRow}>
                    <Ionicons
                      name={isPlaying ? "volume-high" : "pause"}
                      size={12}
                      color={colors.primary}
                      style={{ marginRight: 5 }}
                    />
                    <Text style={styles.playingTrackText} numberOfLines={1}>
                      {currentTrack.title}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.liveStatusPill}>
                <View style={styles.liveDotPulsing} />
                <Text style={styles.liveStatusText}>Active now</Text>
              </View>
            </View>

            {/* Section 2: Other Registered Devices */}
            <View style={[styles.sectionHeaderWrap, { marginTop: 18 }]}>
              <Text style={styles.sectionLabel}>
                OTHER SESSIONS ({otherDevices.length})
              </Text>
            </View>

            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingText}>Updating device status...</Text>
              </View>
            ) : otherDevices.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="shield-checkmark-outline" size={28} color="rgba(255, 255, 255, 0.3)" style={{ marginBottom: 6 }} />
                <Text style={styles.emptyTitle}>No other active devices</Text>
                <Text style={styles.emptySub}>
                  Log in on your laptop, iPad, or phone with this account to listen seamlessly across devices.
                </Text>
              </View>
            ) : (
              otherDevices.map((dev) => {
                const isOnline = dev.isOnline === true;
                const relTime = isOnline ? "Active now" : formatRelativeTime(dev.lastActive);
                const devIcon = dev.icon || (dev.deviceType === "desktop" ? "desktop-outline" : dev.deviceType === "tablet" ? "tablet-portrait-outline" : "phone-portrait-outline");

                return (
                  <View key={dev.id} style={styles.deviceCard}>
                    <View style={[styles.deviceIconCircle, isOnline && styles.deviceIconCircleOnline]}>
                      <Ionicons
                        name={devIcon}
                        size={20}
                        color={isOnline ? colors.primary : "rgba(255, 255, 255, 0.55)"}
                      />
                    </View>

                    <View style={styles.deviceInfoCol}>
                      <View style={styles.deviceNameRow}>
                        <Text style={styles.deviceNameText} numberOfLines={1}>
                          {dev.name || "Staytup Device"}
                        </Text>
                      </View>

                      <View style={styles.deviceMetaRow}>
                        <Text style={styles.deviceMetaText} numberOfLines={1}>
                          {dev.platform || "Device"} &middot; {dev.browser || "Web"}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.deviceActionCol}>
                      <View style={styles.statusIndicatorRow}>
                        <View style={[styles.statusDot, isOnline ? styles.statusDotOnline : styles.statusDotOffline]} />
                        <Text style={[styles.statusText, isOnline && styles.statusTextOnline]}>
                          {relTime}
                        </Text>
                      </View>

                      {/* Log out / Disconnect device session button */}
                      <TouchableOpacity
                        style={styles.disconnectBtn}
                        onPress={() => handleLogoutDevice(dev.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel="Disconnect session"
                      >
                        <Text style={styles.disconnectBtnText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}

            {/* Bottom Security Note */}
            <View style={styles.footerNoteWrap}>
              <Ionicons name="information-circle-outline" size={14} color="rgba(255, 255, 255, 0.4)" style={{ marginRight: 6 }} />
              <Text style={styles.footerNoteText}>
                Your playback and library automatically sync between all verified active devices.
              </Text>
            </View>
          </ScrollView>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    justifyContent: "flex-end",
    ...(Platform.OS === "web"
      ? {
          backdropFilter: "blur(8px)",
          cursor: "default",
          alignItems: "center",
        }
      : {}),
  },
  modalContainer: {
    width: "100%",
    maxHeight: "85%",
    backgroundColor: "#121215",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 20,
  },
  modalContainerDesktop: {
    width: 480,
    maxWidth: "92%",
    borderRadius: 20,
    alignSelf: "center",
    marginBottom: "auto",
    marginTop: "auto",
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    shadowOffset: { width: 0, height: 12 },
  },
  dragHandleContainer: {
    alignItems: "center",
    paddingVertical: 6,
    marginBottom: 4,
  },
  dragHandle: {
    width: 38,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(29, 185, 84, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.5)",
    marginTop: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  scrollContent: {
    maxHeight: 460,
  },
  scrollContentContainer: {
    paddingVertical: 6,
  },
  sectionHeaderWrap: {
    marginBottom: 8,
  },
  sectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.4)",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  currentDeviceCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A20",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.28)",
    shadowColor: "rgba(29, 185, 84, 0.2)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  deviceIconCircleCurrent: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(29, 185, 84, 0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  deviceInfoCol: {
    flex: 1,
    marginRight: 8,
  },
  deviceNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 3,
  },
  deviceNameText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  currentBadge: {
    backgroundColor: "rgba(29, 185, 84, 0.18)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.35)",
  },
  currentBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.primary,
    letterSpacing: 0.2,
  },
  deviceMetaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  deviceMetaText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.55)",
  },
  playingTrackRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
  },
  playingTrackText: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: colors.primary,
    flex: 1,
  },
  liveStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(29, 185, 84, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  liveDotPulsing: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  liveStatusText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.primary,
  },
  deviceCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16161B",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  deviceIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  deviceIconCircleOnline: {
    backgroundColor: "rgba(29, 185, 84, 0.1)",
  },
  deviceActionCol: {
    alignItems: "flex-end",
    gap: 4,
  },
  statusIndicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotOnline: {
    backgroundColor: colors.primary,
  },
  statusDotOffline: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  statusText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.45)",
  },
  statusTextOnline: {
    color: colors.primary,
    fontFamily: fonts.medium,
  },
  disconnectBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  disconnectBtnText: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.45)",
  },
  emptyCard: {
    backgroundColor: "#16161B",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  emptyTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.8)",
    marginBottom: 4,
  },
  emptySub: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: "rgba(255, 255, 255, 0.45)",
    textAlign: "center",
    lineHeight: 16,
  },
  loadingBox: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.45)",
  },
  footerNoteWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    paddingHorizontal: 4,
  },
  footerNoteText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.35)",
    lineHeight: 15,
  },
});
