import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ScrollView,
  TouchableOpacity,
  Image,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { useResponsive } from "../context/ResponsiveContext";
import { useUser } from "../context/UserContext";

const MEMOJI_MAP = {
  memoji_0: require("../../assets/memoji/pastel_0.jpg"),
  memoji_1: require("../../assets/memoji/pastel_1.jpg"),
  memoji_2: require("../../assets/memoji/pastel_2.jpg"),
  memoji_3: require("../../assets/memoji/pastel_3.jpg"),
  memoji_4: require("../../assets/memoji/pastel_4.jpg"),
  memoji_5: require("../../assets/memoji/pastel_5.jpg"),
  memoji_6: require("../../assets/memoji/pastel_6.jpg"),
  memoji_7: require("../../assets/memoji/pastel_7.jpg"),
  memoji_8: require("../../assets/memoji/pastel_8.jpg"),
  memoji_9: require("../../assets/memoji/pastel_9.jpg"),
};

const FEATURES = [
  {
    icon: "musical-notes",
    title: "Unlimited on-demand",
    desc: "Play any song, anytime, without limits",
  },
  {
    icon: "download-outline",
    title: "Offline downloads",
    desc: "Save songs and listen without internet",
  },
  {
    icon: "ban-outline",
    title: "Ad-free listening",
    desc: "No interruptions, just pure music",
  },
  {
    icon: "equalizer",
    title: "High-fidelity audio",
    desc: "Lossless quality for audiophiles",
  },
  {
    icon: "globe-outline",
    title: "Global catalogue",
    desc: "Access over 100M tracks worldwide",
  },
];

function FeatureCard({ icon, title, desc, index }) {
  return (
    <View style={styles.featureCard}>
      <View style={styles.featureIconWrap}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={styles.featureTextWrap}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{desc}</Text>
      </View>
    </View>
  );
}

export default function PremiumScreen() {
  const { isDesktop, isTablet } = useResponsive();
  const navigation = useNavigation();
  const { currentUser, userProfile } = useUser();

  const renderAvatar = () => {
    const av = userProfile?.avatar;
    if (av && av.startsWith("memoji_")) {
      const src = MEMOJI_MAP[av];
      if (src) return <Image source={src} style={styles.avatarImage} resizeMode="cover" />;
    }
    if (av && av.startsWith("http") && !av.includes("googleusercontent.com")) {
      return <Image source={{ uri: av }} style={styles.avatarImage} resizeMode="cover" />;
    }
    return <Text style={styles.avatarText}>{(userProfile?.username?.[0] || "U").toUpperCase()}</Text>;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.headerBar, (isDesktop || isTablet) && styles.desktopHeader]}>
        <Text style={styles.headerTitle}>Premium</Text>
        <View style={styles.headerRightGroup}>
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={() => navigation.navigate("Profile")}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {renderAvatar()}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          (isDesktop || isTablet) && styles.desktopScroll,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.iconRing}>
            <View style={styles.iconInner}>
              <Ionicons name="diamond" size={40} color={colors.primary} />
            </View>
          </View>
          <Text style={styles.heroTitle}>Staytup Premium</Text>
          <Text style={styles.heroSub}>
            Everything you love, without the limits.
          </Text>
        </View>

        {/* Features Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>What you'll get</Text>
          <View style={styles.featureGrid}>
            {FEATURES.map((f, i) => (
              <FeatureCard key={i} {...f} index={i} />
            ))}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: 26,
    color: colors.text,
    letterSpacing: -0.4,
  },
  headerRightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarContainer: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    fontFamily: fonts.bold,
    fontWeight: "700",
    fontSize: 14,
    color: "#000000",
    textAlign: "center",
    includeFontPadding: false,
  },
  desktopHeader: {
    paddingHorizontal: 16,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 16,
    paddingHorizontal: 20,
    // The mini player and bottom tabs are fixed above this screen on phones.
    // Reserve their footprint so the final feature can always scroll into view.
    paddingBottom: 156,
  },
  desktopScroll: {
    paddingHorizontal: 24,
    paddingBottom: 120,
    maxWidth: 600,
    alignSelf: "center",
    width: "100%",
  },
  hero: {
    alignItems: "center",
    paddingVertical: 28,
  },
  iconRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(29, 185, 84, 0.08)",
    borderWidth: 2,
    borderColor: "rgba(29, 185, 84, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  iconInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(29, 185, 84, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: 24,
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  heroSub: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
  },
  section: {
    marginTop: 8,
  },
  sectionHeader: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 0.2,
    marginBottom: 10,
  },
  featureGrid: {
    gap: 10,
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  featureIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(29, 185, 84, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  featureTextWrap: {
    flex: 1,
  },
  featureTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
    marginBottom: 2,
  },
  featureDesc: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
  },
  timeline: {
    paddingLeft: 4,
  },
});
