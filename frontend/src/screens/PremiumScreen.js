import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Modal,
  Image,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { useUser } from "../context/UserContext";
import { useResponsive } from "../context/ResponsiveContext";
import { openRazorpayCheckout } from "../services/razorpay";


const PREMIUM_PLANS = [
  {
    id: "1month",
    name: "1 Month",
    badge: "Flexible",
    amount: 49,
    price: "₹49 / 1 month",
    durationMonths: 1,
    highlight: "1 Month Access",
    accentColor: colors.primary,
    features: [
      "Full Premium access for 1 month",
      "Ad-free music listening",
      "Download songs to listen offline",
      "Unlimited skips & on-demand playback",
      "High-fidelity 320kbps lossless audio",
      "Live synchronized karaoke lyrics",
    ],
  },
  {
    id: "2months",
    name: "2 Months",
    badge: "Popular",
    amount: 89,
    price: "₹89 / 2 months",
    durationMonths: 2,
    highlight: "2 Months Access",
    accentColor: "#2EBDD7",
    features: [
      "Full Premium access for 2 months",
      "Ad-free music listening",
      "Download songs to listen offline",
      "Unlimited skips & on-demand playback",
      "High-fidelity 320kbps lossless audio",
      "Live synchronized karaoke lyrics",
    ],
  },
  {
    id: "3months",
    name: "3 Months",
    badge: "Best Value",
    amount: 129,
    price: "₹129 / 3 months",
    durationMonths: 3,
    highlight: "3 Months Access",
    accentColor: "#8C52FF",
    features: [
      "Full Premium access for 3 months",
      "Save 12% compared to monthly",
      "Ad-free music & offline downloads",
      "Unlimited skips & on-demand playback",
      "High-fidelity 320kbps lossless audio",
      "Live synchronized karaoke lyrics",
    ],
  },
  {
    id: "6months",
    name: "6 Months",
    badge: "Maximum Savings",
    amount: 249,
    price: "₹249 / 6 months",
    durationMonths: 6,
    highlight: "6 Months Access",
    accentColor: "#F59B23",
    features: [
      "Full Premium access for 6 months",
      "Save 15% compared to monthly",
      "Ad-free music & offline downloads",
      "Unlimited skips & on-demand playback",
      "High-fidelity 320kbps lossless audio",
      "Live synchronized karaoke lyrics",
    ],
  },
];



const FAQ_ITEMS = [
  {
    q: "How does Staytup Premium billing work?",
    a: "Staytup Premium is duration-based (1 month, 2 months, 3 months, or 6 months). You pay only for the duration you select with no recurring monthly lock-in.",
  },
  {
    q: "Can I renew or extend my plan?",
    a: "Yes, you can extend or select any duration plan at any time to add more time to your Premium membership.",
  },
  {
    q: "How does offline listening work?",
    a: "You can download any album, playlist, or liked song directly to your device. Once downloaded, toggle offline mode or listen on flights, commutes, or remote trips without using mobile data.",
  },
  {
    q: "What is the audio quality on Premium?",
    a: "Staytup Premium streams at 320kbps High Fidelity audio, delivering exceptional clarity, deep bass, and studio-grade acoustic detail.",
  },
];

export default function PremiumScreen() {
  const { isDesktop, isTablet, width } = useResponsive();
  const { isPremium, premiumPlan, activatePremium, cancelPremium, userProfile, openProfile, currentUser } = useUser() || {};
  const userInitial = (userProfile?.username?.[0] || "A").toUpperCase();
  const avatarIcon = userProfile?.avatar && userProfile.avatar !== "initial" ? userProfile.avatar : null;
  const avatarBg = userProfile?.avatarColor || colors.primary;

  const [selectedPlan, setSelectedPlan] = useState(null);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState(null);

  const handleSubscribePlan = async (plan) => {
    if (isProcessingPayment) return;
    setIsProcessingPayment(true);
    setSelectedPlan(plan);

    openRazorpayCheckout({
      plan,
      user: {
        username: userProfile?.username || "Staytup Listener",
        email: currentUser?.email || "listener@staytup.com",
      },
      onSuccess: async (paymentDetails) => {
        setIsProcessingPayment(false);
        setPaymentInfo(paymentDetails);
        await activatePremium(plan.name, paymentDetails);
      },
      onFailure: (err) => {
        setIsProcessingPayment(false);
        const msg = err?.message || "";
        if (msg && !msg.toLowerCase().includes("cancelled") && !msg.toLowerCase().includes("dismissed")) {
          Alert.alert("Payment Notice", msg || "Payment could not be completed.");
        }
      },
    });
  };

  const handleActivateFreePremium = async () => {
    try {
      await activatePremium("Free Premium", {
        paymentId: "free_" + Date.now().toString(36),
        amount: 0,
        planId: "free",
        planName: "Free Premium",
        provider: "free",
        timestamp: new Date().toISOString(),
      });
      Alert.alert(
        "Welcome to Premium! 🎉",
        "Your Staytup Premium is now active completely free. Enjoy ad-free listening, Hi-Fi audio, and unlimited skips!"
      );
    } catch (err) {
      console.warn("Free premium activation notice:", err);
    }
  };

  const handleCancelSubscription = () => {
    setShowCancelModal(true);
  };

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={styles.headerBar}>
        <View style={[styles.innerWrap, (isDesktop || isTablet) && styles.desktopHeaderInner]}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>Premium</Text>

            <TouchableOpacity
              style={[styles.profileAvatar, { backgroundColor: avatarBg }]}
              onPress={() => openProfile && openProfile()}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {avatarIcon && avatarIcon.startsWith("http") ? (
                <Image
                  source={{ uri: avatarIcon }}
                  style={styles.profileAvatarImage}
                  resizeMode="cover"
                />
              ) : avatarIcon ? (
                <Ionicons name={avatarIcon} size={16} color="#000000" />
              ) : (
                <Text style={styles.profileAvatarText}>{userInitial}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.innerWrap, (isDesktop || isTablet) && styles.desktopInner]}>
          {/* Active Subscription Banner (if subscribed) */}
          {isPremium ? (
            <View style={styles.activeSubCard}>
              <View style={styles.activeSubHeader}>
                <View style={styles.activeCrownBox}>
                  <Ionicons name="diamond" size={24} color="#000000" />
                </View>
                <View style={styles.activeSubInfo}>
                  <Text style={styles.activeSubPlanTitle}>
                    Staytup Premium • {premiumPlan}
                  </Text>
                  <Text style={styles.activeSubStatus}>
                    Active • Unlimited access on all devices
                  </Text>
                </View>
              </View>

              <View style={styles.activeSubPerksRow}>
                <View style={styles.activePerkItem}>
                  <Ionicons name="checkmark" size={15} color={colors.primary} />
                  <Text style={styles.activePerkText}>Ad-free music</Text>
                </View>
                <View style={styles.activePerkItem}>
                  <Ionicons name="checkmark" size={15} color={colors.primary} />
                  <Text style={styles.activePerkText}>Hi-Fi 320kbps</Text>
                </View>
                <View style={styles.activePerkItem}>
                  <Ionicons name="checkmark" size={15} color={colors.primary} />
                  <Text style={styles.activePerkText}>Unlimited skips</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.cancelSubButton}
                onPress={handleCancelSubscription}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelSubText}>Manage / Cancel Subscription</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Hero Card for Free Users */
            <View style={styles.heroCard}>
              <Text style={styles.heroHeadline}>Listen without limits.</Text>
              <Text style={styles.heroSubheadline}>
                Upgrade to Staytup Premium. Enjoy ad-free music, offline
                listening, unlimited skips, and crystal-clear high fidelity sound.
              </Text>
              <TouchableOpacity
                style={styles.heroCtaButton}
                onPress={handleActivateFreePremium}
                activeOpacity={0.88}
              >
                <Text style={styles.heroCtaText}>GET STARTED FREE</Text>
              </TouchableOpacity>
              <Text style={styles.heroTermsNote}>
                100% Free for all listeners. No payment required.
              </Text>
            </View>
          )}

          {/* Section: Pick Your Plan */}
          <Text style={styles.sectionHeaderTitle}>
            Pick your Premium
          </Text>
          <Text style={styles.sectionSubtitle}>
            Listen without limits on your phone, tablet, desktop, and other devices.
          </Text>

          <View style={styles.plansGrid}>
            {PREMIUM_PLANS.map((plan) => {
              const isCurrent = isPremium && premiumPlan.toLowerCase() === plan.name.toLowerCase();
              return (
                <View
                  key={plan.id}
                  style={[
                    styles.planCard,
                    {
                      width: isDesktop
                        ? width >= 1360
                          ? "23.6%"
                          : "48.8%"
                        : isTablet
                        ? "48.5%"
                        : "100%",
                      borderColor: isCurrent ? colors.primary : "rgba(255, 255, 255, 0.08)",
                    },
                  ]}
                >
                  {/* Card Top Row */}
                  <View style={styles.planCardHeader}>
                    <View
                      style={[
                        styles.planBadge,
                        { backgroundColor: `${plan.accentColor}22` },
                      ]}
                    >
                      <Text style={[styles.planBadgeText, { color: plan.accentColor }]}>
                        {plan.badge}
                      </Text>
                    </View>
                    <Text style={styles.accountCountText}>{plan.highlight}</Text>
                  </View>

                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planPrice}>{plan.price}</Text>
                  <Text style={styles.planTrialTag}>
                    {isCurrent ? "Currently Active" : `${plan.durationMonths} ${plan.durationMonths === 1 ? "month" : "months"} full access`}
                  </Text>

                  <View style={styles.planDivider} />

                  {/* Feature Checklist */}
                  <View style={styles.planFeaturesList}>
                    {plan.features.map((feat, idx) => (
                      <View key={`f_${idx}`} style={styles.featureItemRow}>
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={colors.primary}
                          style={{ marginTop: 1 }}
                        />
                        <Text style={styles.featureItemText}>{feat}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Plan CTA Button */}
                  <TouchableOpacity
                    style={[
                      styles.planButton,
                      isCurrent && styles.planButtonCurrent,
                      !isCurrent && { backgroundColor: plan.accentColor },
                      isProcessingPayment && selectedPlan?.id === plan.id && { opacity: 0.8 },
                    ]}
                    onPress={() => handleSubscribePlan(plan)}
                    disabled={isCurrent || isProcessingPayment}
                    activeOpacity={0.88}
                  >
                    {isProcessingPayment && selectedPlan?.id === plan.id ? (
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <ActivityIndicator size="small" color="#000000" />
                        <Text style={styles.planButtonText}>Opening Razorpay...</Text>
                      </View>
                    ) : (
                      <Text
                        style={[
                          styles.planButtonText,
                          isCurrent && styles.planButtonTextCurrent,
                        ]}
                      >
                        {isCurrent ? "Current Plan" : `Pay with Razorpay • ₹${plan.amount}`}
                      </Text>
                    )}
                  </TouchableOpacity>

                  <Text style={styles.planFinePrint}>
                    One-time payment via Razorpay. No auto lock-in.
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Legal / Bottom Disclaimer */}
          <View style={styles.legalDisclaimerBox}>
            <Text style={styles.legalDisclaimerText}>
              Staytup Premium gives you unlimited music streaming with zero ads, offline playback,
              and studio-grade Hi-Fi 320kbps audio. Plans are duration-based with no lock-in.
            </Text>
          </View>

          {/* Clearance for Fixed Docked Player and Tab Bar on Mobile */}
          <View style={{ height: isDesktop || isTablet ? 30 : 140 }} />
        </View>
      </ScrollView>


      {/* Cancel Subscription Bottom Modal (No header close button, bottom Cancel/Confirm) */}
      <Modal
        visible={showCancelModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCancelModal(false)}
      >
        <TouchableOpacity
          style={styles.bottomModalOverlay}
          activeOpacity={1}
          onPress={() => setShowCancelModal(false)}
        >
          <View
            style={[
              styles.bottomModalSheet,
              (isDesktop || isTablet) && styles.desktopBottomModalSheet,
            ]}
            onStartShouldSetResponder={() => true}
          >
            {/* Grab handle indicator (no header close button) */}
            <View style={styles.sheetHandleBar} />

            {/* Warning Icon Badge */}
            <View style={styles.cancelModalIconWrap}>
              <Ionicons name="warning-outline" size={28} color="#FF5252" />
            </View>

            {/* Modal Title & Text */}
            <Text style={styles.cancelModalTitle}>Cancel Subscription?</Text>
            <Text style={styles.cancelModalSubtitle}>
              Are you sure you want to cancel your Staytup Premium subscription? You will lose access to ad-free music, offline downloads, and Hi-Fi 320kbps audio.
            </Text>

            {/* Bottom Actions: Cancel or Confirm */}
            <View style={styles.cancelModalActionsRow}>
              <TouchableOpacity
                style={styles.cancelModalDismissBtn}
                onPress={() => setShowCancelModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelModalDismissText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelModalConfirmBtn}
                onPress={() => {
                  cancelPremium();
                  setShowCancelModal(false);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelModalConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerBar: {
    paddingTop: Platform.OS === "web" ? 12 : 14,
    paddingBottom: 8,
    paddingHorizontal: 16,
    backgroundColor: "#000000",
  },
  innerWrap: {
    width: "100%",
  },
  desktopHeaderInner: {
    width: "100%",
    paddingHorizontal: 16,
  },
  desktopInner: {
    width: "100%",
    paddingHorizontal: 16,
  },
  headerTitleRow: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  diamondBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: 26,
    color: "#FFFFFF",
    letterSpacing: -0.4,
  },
  profileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    overflow: "hidden",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  profileAvatarImage: {
    width: "100%",
    height: "100%",
  },
  profileAvatarText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  heroCard: {
    backgroundColor: "#1E1E1E",
    borderRadius: 14,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    marginBottom: 28,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    alignSelf: "flex-start",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 14,
  },
  heroBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: "#000000",
    letterSpacing: 0.8,
  },
  heroHeadline: {
    fontFamily: fonts.extraBold,
    fontSize: 28,
    color: colors.text,
    letterSpacing: -0.6,
    marginBottom: 10,
  },
  heroSubheadline: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 20,
  },
  heroCtaButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 24,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  heroCtaText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
    letterSpacing: 0.4,
  },
  heroTermsNote: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 12,
  },
  activeSubCard: {
    backgroundColor: "#16241B",
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.4)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 28,
    width: "100%",
    alignSelf: "center",
  },
  activeSubHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  activeCrownBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  activeSubInfo: {
    flex: 1,
  },
  activeSubPlanTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.text,
  },
  activeSubStatus: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.primary,
    marginTop: 2,
  },
  activeSubPerksRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginVertical: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(29, 185, 84, 0.2)",
  },
  activePerkItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  activePerkText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  cancelSubButton: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
    boxShadow: "0px 4px 14px rgba(255, 255, 255, 0.15)",
  },
  cancelSubText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: "#000000",
    letterSpacing: 0.2,
  },
  sectionHeaderTitle: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.text,
    letterSpacing: -0.4,
    marginBottom: 14,
  },
  sectionSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 20,
    marginTop: -8,
  },

  plansGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  planCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 14,
    padding: 22,
    borderWidth: 1.5,
    justifyContent: "space-between",
  },
  planCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  planBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  planBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  accountCountText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.textMuted,
  },
  planName: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.text,
    marginBottom: 4,
  },
  planPrice: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.text,
  },
  planTrialTag: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.primary,
    marginTop: 2,
  },
  planDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginVertical: 16,
  },
  planFeaturesList: {
    gap: 10,
    marginBottom: 22,
  },
  featureItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  featureItemText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 19,
  },
  planButton: {
    paddingVertical: 13,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  planButtonCurrent: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  planButtonText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: "#000000",
    letterSpacing: 0.3,
  },
  planButtonTextCurrent: {
    color: colors.text,
  },
  planFinePrint: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 10,
  },
  faqContainer: {
    gap: 10,
  },
  faqCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  faqQuestionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  faqQuestionText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.text,
    flex: 1,
    paddingRight: 10,
  },
  faqAnswerText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  legalDisclaimerBox: {
    marginTop: 32,
    padding: 14,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
  },
  legalDisclaimerText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 18,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#1E1E1E",
    borderRadius: 16,
    padding: 26,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  modalTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 20,
    color: colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  modalSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  modalPerksList: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 10,
    padding: 14,
    gap: 10,
    marginBottom: 24,
  },
  modalPerkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  modalPerkText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.text,
  },
  modalCloseButton: {
    width: "100%",
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: "center",
  },
  modalCloseButtonText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
  },

  // Cancel Bottom Sheet Modal Styles
  bottomModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  bottomModalSheet: {
    width: "100%",
    backgroundColor: "#1F1F1F",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: Platform.OS === "web" ? 30 : 40,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  desktopBottomModalSheet: {
    maxWidth: 460,
    borderRadius: 24,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  sheetHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.28)",
    marginBottom: 20,
  },
  cancelModalIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(255, 82, 82, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  cancelModalTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
  },
  cancelModalSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: "#AAAAAA",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 12,
    marginBottom: 26,
  },
  cancelModalActionsRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  cancelModalDismissBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelModalDismissText: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: "#FFFFFF",
  },
  cancelModalConfirmBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E91429",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelModalConfirmText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#FFFFFF",
  },
  modalTxnBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(29, 185, 84, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.3)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 12,
    alignSelf: "center",
  },
  modalTxnText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.primary,
  },
});
