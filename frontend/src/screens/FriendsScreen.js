import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { useResponsive } from "../context/ResponsiveContext";

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
  const [activeTab, setActiveTab] = useState("friends");
  const comingSoon = COMING_SOON_DATA[activeTab];

  return (
    <View style={styles.container}>
      <View style={[styles.header, (isDesktop || isTablet) && styles.desktopHeader]}>
        <Text style={styles.headerTitle}>Friends</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.tabsContainer, (isDesktop || isTablet) && styles.desktopTabs]}
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
                size={18}
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

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  desktopHeader: {
    paddingHorizontal: 32,
    paddingTop: 24,
  },
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: 24,
    color: colors.text,
    letterSpacing: -0.5,
  },
  tabsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  desktopTabs: {
    paddingHorizontal: 32,
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
    paddingBottom: 160,
  },
  comingSoonContainer: {
    alignItems: "center",
    padding: 32,
  },
  desktopComingSoon: {
    marginTop: 40,
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
