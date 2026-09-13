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
  auth,
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
  const {
    currentTrack,
    isPlaying,
    playbackSession,
    isRemotePlaying,
    remotePlaybackSession,
    transferPlaybackToThisDevice,
    isDeviceModalOpen,
    closeDeviceModal,
  } = useAudio() || {};
  const responsive = (typeof useResponsive === "function" ? useResponsive() : null) || {};
  const isDesktop = responsive.isDesktop ?? (typeof window !== "undefined" ? window.innerWidth >= 1024 : false);
  const isTablet = responsive.isTablet ?? (typeof window !== "undefined" ? (window.innerWidth >= 768 && window.innerWidth < 1024) : false);
  const deviceName = responsive.deviceName || "This Device";
  const deviceIcon = responsive.deviceIcon || (isDesktop ? "laptop-outline" : isTablet ? "tablet-portrait-outline" : "phone-portrait-outline");
  const deviceType = responsive.deviceType || (isDesktop ? "desktop" : isTablet ? "tablet" : "phone");

  const [internalVisible, setInternalVisible] = useState(false);
  const isShown = Boolean(visible || isDeviceModalOpen || internalVisible);
  const handleClose = () => {
    setInternalVisible(false);
    if (onClose) onClose();
    if (closeDeviceModal) closeDeviceModal();
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("staytup-close-devices"));
      }
    } catch (_) {}
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

  const activeUid = userProfile?.uid || auth?.currentUser?.uid;

  // Subscribe to live active devices for this user
  useEffect(() => {
    if (!isShown || !activeUid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeActiveDevices(activeUid, (list) => {
      setDevices(list || []);
      setLoading(false);
    });

    return () => {
      try {
        unsubscribe();
      } catch (_) {}
    };
  }, [isShown, activeUid]);

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
            <Text style={styles.headerTitle}>Active Devices</Text>
          </View>

          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={styles.scrollContentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Section 1: Current Device Row */}
            <View style={styles.sectionHeaderWrap}>
              <Text style={styles.sectionLabel}>CURRENT DEVICE</Text>
            </View>

            {(() => {
              const isCurrentPlayingNow = isPlaying && (!playbackSession?.deviceId || playbackSession?.deviceId === currentDeviceId);
              return (
                <View style={styles.deviceRow}>
                  <View style={styles.deviceIconBox}>
                    <Ionicons name={myIcon} size={22} color="#FFFFFF" />
                  </View>

                  <View style={styles.deviceInfoCol}>
                    <View style={styles.deviceNameRow}>
                      <Text style={styles.deviceNameText} numberOfLines={1}>
                        {myName}
                      </Text>
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>This device</Text>
                      </View>
                    </View>

                    <View style={styles.deviceMetaRow}>
                      <Text style={styles.deviceMetaText} numberOfLines={1}>
                        {myPlatform} &middot; {myBrowser}
                      </Text>
                    </View>
                  </View>

                  {isRemotePlaying ? (
                    <TouchableOpacity
                      style={styles.playHereButton}
                      onPress={async () => {
                        if (transferPlaybackToThisDevice) {
                          await transferPlaybackToThisDevice();
                        }
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="play" size={13} color="#000000" style={{ marginRight: 4 }} />
                      <Text style={styles.playHereButtonText}>Play here</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.liveStatusPill}>
                      <View style={[styles.liveDotPulsing, !isCurrentPlayingNow && { backgroundColor: "rgba(255, 255, 255, 0.35)" }]} />
                      <Text style={styles.liveStatusText}>
                        {isCurrentPlayingNow ? "Listening" : "Online"}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })()}

            {/* Section 2: Other Registered Devices */}
            <View style={[styles.sectionHeaderWrap, { marginTop: 20 }]}>
              <Text style={styles.sectionLabel}>
                OTHER SESSIONS ({otherDevices.length})
              </Text>
            </View>

            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color="rgba(255, 255, 255, 0.6)" />
                <Text style={styles.loadingText}>Updating devices...</Text>
              </View>
            ) : otherDevices.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="shield-checkmark-outline" size={24} color="rgba(255, 255, 255, 0.25)" style={{ marginBottom: 6 }} />
                <Text style={styles.emptyTitle}>No other devices active</Text>
                <Text style={styles.emptySub}>
                  Log in on your laptop, iPad, or phone with this account to listen seamlessly across devices.
                </Text>
              </View>
            ) : (
              otherDevices.map((dev) => {
                const isOnline = dev.isOnline === true;
                const isThisDevPlaying = Boolean(
                  playbackSession?.isPlaying &&
                  playbackSession?.deviceId === dev.id
                );
                const relTime = isThisDevPlaying ? "Listening" : isOnline ? "Online" : formatRelativeTime(dev.lastActive);
                const devIcon = dev.icon || (dev.deviceType === "desktop" ? "desktop-outline" : dev.deviceType === "tablet" ? "tablet-portrait-outline" : "phone-portrait-outline");

                return (
                  <View
                    key={dev.id}
                    style={styles.deviceRow}
                  >
                    <View style={styles.deviceIconBox}>
                      <Ionicons
                        name={devIcon}
                        size={20}
                        color={isOnline || isThisDevPlaying ? "#FFFFFF" : "rgba(255, 255, 255, 0.45)"}
                      />
                    </View>

                    <View style={styles.deviceInfoCol}>
                      <View style={styles.deviceNameRow}>
                        <Text style={styles.deviceNameText} numberOfLines={1}>
                          {dev.name || "Staytup Device"}
                        </Text>
                        {isThisDevPlaying && (
                          <View style={styles.playingBadge}>
                            <Text style={styles.playingBadgeText}>Listening</Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.deviceMetaRow}>
                        <Text style={styles.deviceMetaText} numberOfLines={1}>
                          {dev.platform || "Device"} &middot; {dev.browser || "Web"}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.deviceActionCol}>
                      {isThisDevPlaying ? (
                        <TouchableOpacity
                          style={styles.playHereButtonSmall}
                          onPress={async () => {
                            if (transferPlaybackToThisDevice) {
                              await transferPlaybackToThisDevice();
                            }
                          }}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="play" size={11} color="#000000" style={{ marginRight: 3 }} />
                          <Text style={styles.playHereButtonTextSmall}>Play here</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.statusIndicatorRow}>
                          <View style={[styles.statusDot, isOnline ? styles.statusDotOnline : styles.statusDotOffline]} />
                          <Text style={[styles.statusText, isOnline && styles.statusTextOnline]}>
                            {relTime}
                          </Text>
                        </View>
                      )}

                      {/* Log out / Disconnect device session button */}
                      <TouchableOpacity
                        style={[styles.disconnectBtn, isThisDevPlaying && { marginTop: 4 }]}
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
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    justifyContent: "flex-end",
    ...(Platform.OS === "web"
      ? {
          cursor: "default",
          alignItems: "center",
        }
      : {}),
  },
  modalContainer: {
    width: "100%",
    maxHeight: "85%",
    backgroundColor: "#111114",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  modalContainerDesktop: {
    width: 520,
    maxWidth: "96%",
    borderRadius: 16,
    alignSelf: "center",
    marginBottom: "auto",
    marginTop: "auto",
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  dragHandleContainer: {
    alignItems: "center",
    paddingVertical: 6,
    marginBottom: 4,
  },
  dragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    marginBottom: 8,
  },
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  scrollContent: {
    maxHeight: 460,
  },
  scrollContentContainer: {
    paddingVertical: 4,
  },
  sectionHeaderWrap: {
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  sectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.4)",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  deviceIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
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
    marginBottom: 2,
  },
  deviceNameText: {
    fontFamily: fonts.semiBold,
    fontSize: 14.5,
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  currentBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  currentBadgeText: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.7)",
  },
  playingBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  playingBadgeText: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.7)",
  },
  deviceMetaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  deviceMetaText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.45)",
  },
  liveStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  liveDotPulsing: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
  },
  liveStatusText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.65)",
  },
  playHereButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  playHereButtonText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: "#000000",
  },
  playHereButtonSmall: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  playHereButtonTextSmall: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: "#000000",
  },
  deviceActionCol: {
    alignItems: "flex-end",
    gap: 4,
  },
  statusIndicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotOnline: {
    backgroundColor: "rgba(255, 255, 255, 0.6)",
  },
  statusDotOffline: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  statusText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.4)",
  },
  statusTextOnline: {
    color: "rgba(255, 255, 255, 0.7)",
    fontFamily: fonts.medium,
  },
  disconnectBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  disconnectBtnText: {
    fontFamily: fonts.regular,
    fontSize: 10.5,
    color: "rgba(255, 255, 255, 0.35)",
  },
  emptyBox: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  emptyTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13.5,
    color: "rgba(255, 255, 255, 0.7)",
    marginBottom: 4,
  },
  emptySub: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: "rgba(255, 255, 255, 0.4)",
    textAlign: "center",
    lineHeight: 16,
  },
  loadingBox: {
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.4)",
  },
  footerNoteWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  footerNoteText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.3)",
    lineHeight: 15,
  },
});
