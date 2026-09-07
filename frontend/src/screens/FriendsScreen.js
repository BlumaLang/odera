import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { useResponsive } from "../context/ResponsiveContext";
import { useUser } from "../context/UserContext";

const TABS = [
  { id: "friends", label: "Friends", icon: "people" },
  { id: "requests", label: "Requests", icon: "person-add" },
  { id: "discover", label: "Discover", icon: "compass" },
  { id: "listening", label: "Listening", icon: "headset" },
];

const COMING_SOON_DATA = {
  friends: {
    icon: "people-outline",
    title: "Friends List",
    description: "See what your friends are listening to right now.",
  },
  requests: {
    icon: "person-add-outline",
    title: "Friend Requests",
    description: "Manage incoming and outgoing friend requests.",
  },
  discover: {
    icon: "compass-outline",
    title: "Discover Friends",
    description: "Find people with similar music taste.",
  },
  listening: {
    icon: "headset-outline",
    title: "Live Listening",
    description: "See what friends are playing in real time.",
  },
};

export default function FriendsScreen() {
  const { isDesktop, isTablet } = useResponsive();
  const { userProfile, openProfile } = useUser() || {};
  const userInitial = (userProfile?.username?.[0] || "A").toUpperCase();
  const avatarIcon = userProfile?.avatar && userProfile.avatar !== "initial" ? userProfile.avatar : null;
  const avatarBg = userProfile?.avatarColor || colors.primary;

  const [activeTab, setActiveTab] = useState("friends");
  const comingSoon = COMING_SOON_DATA[activeTab];

  return (
    <View style={styles.container}>
      {/* Aligned Top Header matching SearchScreen */}
      <View style={styles.screenHeader}>
        <View style={[styles.innerContent, (isDesktop || isTablet) && styles.desktopInnerContent]}>
          <View style={styles.headerTopRow}>
            <Text style={styles.screenTitle}>Friends</Text>

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

      {/* Tabs Row */}
      <View style={styles.tabsWrapper}>
        <View style={[styles.innerContent, (isDesktop || isTablet) && styles.desktopInnerContent]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsRowContainer}
            contentContainerStyle={styles.tabsContainer}
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.tab, isActive && styles.activeTab]}
                  onPress={() => setActiveTab(tab.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isActive ? tab.icon : `${tab.icon}-outline`}
                    size={16}
                    color={isActive ? "#000000" : "#FFFFFF"}
                  />
                  <Text
                    style={[
                      styles.tabLabel,
                      isActive && { fontFamily: fonts.bold, color: "#000000" },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.innerContent, (isDesktop || isTablet) && styles.desktopInnerContent]}>
          <View style={[styles.comingSoonContainer, (isDesktop || isTablet) && styles.desktopComingSoon]}>
            <View style={styles.comingSoonIconWrap}>
              <Ionicons name={comingSoon.icon} size={64} color={colors.textMuted} />
            </View>
            <Text style={styles.comingSoonTitle}>{comingSoon.title}</Text>
            <Text style={styles.comingSoonDescription}>{comingSoon.description}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Coming Soon</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  screenHeader: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "web" ? 12 : 14,
    paddingBottom: 8,
    backgroundColor: "#000000",
  },
  innerContent: {
    width: "100%",
  },
  desktopInnerContent: {
    width: "100%",
    paddingHorizontal: 16,
  },
  headerTopRow: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  screenTitle: {
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
  tabsWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  tabsRowContainer: {
    flexGrow: 0,
    flexShrink: 0,
    height: 40,
  },
  tabsContainer: {
    alignItems: "center",
    gap: 8,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    gap: 6,
    height: 32,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  activeTab: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#FFFFFF",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 60,
  },
  comingSoonContainer: {
    alignItems: "center",
    padding: 32,
  },
  desktopComingSoon: {
    marginTop: 0,
  },
  comingSoonIconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surfaceVariant,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  comingSoonTitle: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.text,
    marginBottom: 8,
  },
  comingSoonDescription: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 22,
  },
  badge: {
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surfaceVariant,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  badgeText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
});
