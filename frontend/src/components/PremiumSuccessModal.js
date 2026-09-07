import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Confetti Particle Colors: Gold, Emerald, Cyan, Violet, Coral, Shimmer
const CONFETTI_COLORS = [
  "#1DB954", // Spotify Green
  "#FFD700", // Gold
  "#00F2FE", // Electric Cyan
  "#FF416C", // Coral Pink
  "#8C52FF", // Royal Purple
  "#FFFFFF", // Shimmer White
  "#2EBDD7", // Aqua
];

// Single animated confetti piece
function ConfettiPiece({ index, total }) {
  const animY = useRef(new Animated.Value(-50)).current;
  const animX = useRef(new Animated.Value(0)).current;
  const animRotate = useRef(new Animated.Value(0)).current;
  const animOpacity = useRef(new Animated.Value(1)).current;

  // Deterministic random variations based on index
  const startX = (index / total) * SCREEN_WIDTH + (Math.sin(index * 7) * 40);
  const driftX = Math.cos(index * 3) * (60 + (index % 5) * 20);
  const duration = 2800 + (index % 15) * 180;
  const delay = (index % 25) * 45;
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const size = 6 + (index % 4) * 3;
  const isCircle = index % 3 === 0;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(animY, {
          toValue: SCREEN_HEIGHT + 100,
          duration,
          useNativeDriver: false,
        }),
        Animated.timing(animX, {
          toValue: driftX,
          duration,
          useNativeDriver: false,
        }),
        Animated.timing(animRotate, {
          toValue: 720 + (index % 5) * 360,
          duration,
          useNativeDriver: false,
        }),
        Animated.timing(animOpacity, {
          toValue: 0,
          duration,
          delay: duration * 0.7,
          useNativeDriver: false,
        }),
      ]),
    ]).start();
  }, []);

  const spin = animRotate.interpolate({
    inputRange: [0, 360],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: startX,
        top: animY,
        transform: [{ translateX: animX }, { rotate: spin }],
        opacity: animOpacity,
        width: size,
        height: isCircle ? size : size * 1.6,
        borderRadius: isCircle ? size / 2 : 2,
        backgroundColor: color,
        zIndex: 9999,
        pointerEvents: "none",
      }}
    />
  );
}

export default function PremiumSuccessModal({
  visible,
  plan,
  paymentInfo,
  userName = "Staytup VIP",
  onClose,
}) {
  const [confettiKeys, setConfettiKeys] = useState([]);

  useEffect(() => {
    if (visible) {
      // Generate 70 confetti particles
      setConfettiKeys(Array.from({ length: 70 }, (_, i) => i));
    } else {
      setConfettiKeys([]);
    }
  }, [visible]);

  if (!visible) return null;

  const planName = plan?.name || "1 Month";
  const planHighlight = plan?.highlight || "Full VIP Access";
  const planPrice = plan?.price || "₹49";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.fullPageContainer}>
        {/* Render Confetti Particles Shower */}
        {confettiKeys.map((idx) => (
          <ConfettiPiece key={`confetti_${idx}`} index={idx} total={confettiKeys.length} />
        ))}

        {/* Top Floating Close Button */}
        <TouchableOpacity
          style={styles.floatingCloseBtn}
          onPress={onClose}
          activeOpacity={0.8}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={styles.scrollWrapper}
          showsVerticalScrollIndicator={false}
        >
          {/* Glowing Diamond Emblem */}
          <View style={styles.emblemWrapper}>
            <View style={styles.outerGlowRing}>
              <View style={styles.innerDiamondCircle}>
                <Ionicons name="diamond" size={44} color="#000000" />
              </View>
            </View>
          </View>

          {/* Hero Welcome Header */}
          <View style={styles.headerTextBox}>
            <View style={styles.vipPillBadge}>
              <Ionicons name="sparkles" size={13} color="#FFD700" />
              <Text style={styles.vipPillText}>VIP MEMBERSHIP UNLOCKED</Text>
            </View>
            <Text style={styles.heroHeadline}>Welcome to Staytup Premium!</Text>
            <Text style={styles.heroSubheadline}>
              Congratulations, <Text style={styles.highlightName}>{userName}</Text>! You now have unlimited, studio-grade listening across all your devices.
            </Text>
          </View>

          {/* VIP Metal / Holographic Membership Card */}
          <View style={styles.vipCard}>
            <View style={styles.vipCardBgPattern} />
            <View style={styles.vipCardHeader}>
              <View style={styles.brandRow}>
                <Ionicons name="musical-notes" size={22} color={colors.primary} />
                <Text style={styles.brandText}>STAYTUP PREMIUM</Text>
              </View>
              <View style={styles.passBadge}>
                <Text style={styles.passBadgeText}>VIP ACCESS</Text>
              </View>
            </View>

            <View style={styles.cardMiddle}>
              <Text style={styles.planTitleBig}>{planName.toUpperCase()} PASS</Text>
              <Text style={styles.planSubBig}>{planHighlight} � {planPrice}</Text>
            </View>

            <View style={styles.vipCardFooter}>
              <View>
                <Text style={styles.cardLabel}>CARDHOLDER</Text>
                <Text style={styles.cardValue}>{userName.toUpperCase()}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.cardLabel}>STATUS</Text>
                <View style={styles.statusRow}>
                  <View style={styles.greenLiveDot} />
                  <Text style={styles.cardStatusValue}>ACTIVE</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Payment & Database Verification Badge */}
          {paymentInfo?.paymentId ? (
            <View style={styles.receiptBox}>
              <View style={styles.receiptHeader}>
                <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
                <Text style={styles.receiptTitle}>Payment Verified & Stored in Database</Text>
              </View>
              <View style={styles.receiptDetails}>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptKey}>Transaction ID:</Text>
                  <Text style={styles.receiptVal}>{paymentInfo.paymentId}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptKey}>Payment Gateway:</Text>
                  <Text style={styles.receiptVal}>Razorpay Official Test</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptKey}>Database Status:</Text>
                  <Text style={[styles.receiptVal, { color: colors.primary }]}>Synced to Profile & Cloud RTDB</Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* Premium Perks Showcase */}
          <Text style={styles.perksSectionTitle}>Everything Unlocked for You</Text>
          <View style={styles.perksGrid}>
            <View style={styles.perkCard}>
              <View style={[styles.perkIconBox, { backgroundColor: "rgba(29, 185, 84, 0.15)" }]}>
                <Ionicons name="volume-high" size={22} color={colors.primary} />
              </View>
              <View style={styles.perkInfo}>
                <Text style={styles.perkTitle}>Hi-Fi 320kbps Audio</Text>
                <Text style={styles.perkDesc}>Studio-master sound with lossless clarity and punchy bass.</Text>
              </View>
            </View>

            <View style={styles.perkCard}>
              <View style={[styles.perkIconBox, { backgroundColor: "rgba(46, 189, 215, 0.15)" }]}>
                <Ionicons name="cloud-offline" size={22} color="#2EBDD7" />
              </View>
              <View style={styles.perkInfo}>
                <Text style={styles.perkTitle}>Offline Music Downloads</Text>
                <Text style={styles.perkDesc}>Save playlists and albums to listen anywhere without data.</Text>
              </View>
            </View>

            <View style={styles.perkCard}>
              <View style={[styles.perkIconBox, { backgroundColor: "rgba(245, 155, 35, 0.15)" }]}>
                <Ionicons name="ban" size={22} color="#F59B23" />
              </View>
              <View style={styles.perkInfo}>
                <Text style={styles.perkTitle}>100% Ad-Free Listening</Text>
                <Text style={styles.perkDesc}>Zero audio or banner interruptions, ever. Pure music.</Text>
              </View>
            </View>

            <View style={styles.perkCard}>
              <View style={[styles.perkIconBox, { backgroundColor: "rgba(140, 82, 255, 0.15)" }]}>
                <Ionicons name="play-skip-forward" size={22} color="#8C52FF" />
              </View>
              <View style={styles.perkInfo}>
                <Text style={styles.perkTitle}>Unlimited Skips & Scrubbing</Text>
                <Text style={styles.perkDesc}>Skip tracks freely and seek to any second of any song.</Text>
              </View>
            </View>
          </View>

          {/* Big Green CTA Button */}
          <TouchableOpacity
            style={styles.primaryCtaBtn}
            onPress={onClose}
            activeOpacity={0.88}
          >
            <Text style={styles.primaryCtaText}>Start Listening Now</Text>
            <Ionicons name="arrow-forward" size={20} color="#000000" style={{ marginLeft: 6 }} />
          </TouchableOpacity>

          <Text style={styles.footerNote}>
            Enjoy your Staytup Premium benefits. Tap anywhere above to begin streaming.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullPageContainer: {
    flex: 1,
    backgroundColor: "#0B0E0D",
    position: "relative",
  },
  scrollWrapper: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "web" ? 36 : 56,
    paddingBottom: 60,
    maxWidth: 680,
    width: "100%",
    alignSelf: "center",
    alignItems: "center",
  },
  floatingCloseBtn: {
    position: "absolute",
    top: Platform.OS === "web" ? 20 : 44,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  emblemWrapper: {
    marginBottom: 20,
    alignItems: "center",
  },
  outerGlowRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(29, 185, 84, 0.15)",
    borderWidth: 2,
    borderColor: "rgba(29, 185, 84, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
  },
  innerDiamondCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextBox: {
    alignItems: "center",
    marginBottom: 28,
  },
  vipPillBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 215, 0, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.35)",
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginBottom: 12,
  },
  vipPillText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: "#FFD700",
    letterSpacing: 1.2,
  },
  heroHeadline: {
    fontFamily: fonts.extraBold,
    fontSize: 32,
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -0.8,
    marginBottom: 10,
  },
  heroSubheadline: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: "#B3B3B3",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 520,
  },
  highlightName: {
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  vipCard: {
    width: "100%",
    backgroundColor: "#161F1A",
    borderRadius: 18,
    padding: 24,
    borderWidth: 1.5,
    borderColor: "rgba(29, 185, 84, 0.4)",
    marginBottom: 24,
    shadowColor: "#1DB954",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
  },
  vipCardBgPattern: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.15)",
    pointerEvents: "none",
  },
  vipCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brandText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#FFFFFF",
    letterSpacing: 1.5,
  },
  passBadge: {
    backgroundColor: "#FFD700",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  passBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: "#000000",
    letterSpacing: 1,
  },
  cardMiddle: {
    marginBottom: 28,
  },
  planTitleBig: {
    fontFamily: fonts.extraBold,
    fontSize: 26,
    color: "#FFFFFF",
    letterSpacing: -0.4,
  },
  planSubBig: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.primary,
    marginTop: 4,
  },
  vipCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    paddingTop: 16,
  },
  cardLabel: {
    fontFamily: fonts.bold,
    fontSize: 9,
    color: "#777777",
    letterSpacing: 1,
    marginBottom: 2,
  },
  cardValue: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  greenLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  cardStatusValue: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.primary,
    letterSpacing: 0.5,
  },
  receiptBox: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 28,
  },
  receiptHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  receiptTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  receiptDetails: {
    gap: 6,
  },
  receiptRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  receiptKey: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "#888888",
  },
  receiptVal: {
    fontFamily: fonts.mono || fonts.medium,
    fontSize: 12,
    color: "#DDDDDD",
  },
  perksSectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: "#FFFFFF",
    alignSelf: "flex-start",
    marginBottom: 16,
  },
  perksGrid: {
    width: "100%",
    gap: 12,
    marginBottom: 32,
  },
  perkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#161817",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  perkIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  perkInfo: {
    flex: 1,
  },
  perkTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#FFFFFF",
    marginBottom: 2,
  },
  perkDesc: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "#999999",
    lineHeight: 18,
  },
  primaryCtaBtn: {
    width: "100%",
    backgroundColor: colors.primary,
    height: 56,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  primaryCtaText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#000000",
    letterSpacing: 0.3,
  },
  footerNote: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "#666666",
    textAlign: "center",
  },
});
