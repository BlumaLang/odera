import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Image,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { useUser } from "../context/UserContext";
import { DEFAULT_ARTIST_IMAGES } from "../theme/artistImages";

import { useResponsive } from "../context/ResponsiveContext";

export default function DesktopSidebar({
  activeTab = "Home",
  onSelectTab,
  onSelectArtist,
}) {
  const { isTablet } = useResponsive();
  const { userProfile } = useUser();
  const favoriteArtists = userProfile?.favoriteArtists || userProfile?.favorite_artists || [];

  const NAV_ITEMS = [
    { id: "Home", label: "Home", icon: "home", iconOutline: "home-outline" },
    { id: "Search", label: "Search", icon: "search", iconOutline: "search-outline" },
    { id: "Friends", label: "Friends", icon: "people", iconOutline: "people-outline" },
    { id: "Library", label: "Your Library", icon: "library", iconOutline: "library-outline" },
    { id: "Premium", label: "Premium", icon: "diamond", iconOutline: "diamond-outline" },
  ];

  return (
    <View style={[styles.sidebarContainer, isTablet && styles.sidebarContainerTablet]}>
      {/* Brand Header */}
      <View style={[styles.brandRow, isTablet && styles.brandRowTablet]}>
        <View style={styles.brandLogoBox}>
          <Ionicons name="musical-notes" size={20} color="#000000" />
        </View>
        {!isTablet && <Text style={styles.brandTitle}>Staytup</Text>}
      </View>

      {/* Primary Navigation Links */}
      <View style={[styles.navSection, isTablet && styles.navSectionTablet]}>
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.navItem,
                isTablet && styles.navItemTablet,
                isActive && styles.navItemActive,
              ]}
              onPress={() => onSelectTab && onSelectTab(item.id)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isActive ? item.icon : item.iconOutline}
                size={isTablet ? 24 : 22}
                color={isActive ? "#FFFFFF" : colors.textSecondary}
              />
              {!isTablet && (
                <Text
                  style={[
                    styles.navLabel,
                    isActive && styles.navLabelActive,
                  ]}
                >
                  {item.label}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.divider} />

      {/* Your Taste / Favorite Artists Quick Access */}
      <View style={[styles.tasteHeaderRow, isTablet && styles.tasteHeaderRowTablet]}>
        {!isTablet && <Text style={styles.tasteHeaderTitle}>YOUR TASTE</Text>}
        <Ionicons name="sparkles" size={13} color={colors.primary} />
      </View>

      <ScrollView
        style={styles.tasteScrollView}
        contentContainerStyle={[styles.tasteListContent, isTablet && styles.tasteListContentTablet]}
        showsVerticalScrollIndicator={false}
      >
        {favoriteArtists.length > 0 ? (
          favoriteArtists.map((artistName) => {
            const photoUrl = DEFAULT_ARTIST_IMAGES[artistName];
            return (
              <TouchableOpacity
                key={artistName}
                style={[styles.artistTasteRow, isTablet && styles.artistTasteRowTablet]}
                onPress={() => onSelectArtist && onSelectArtist(artistName)}
                activeOpacity={0.7}
              >
                {photoUrl ? (
                  <Image source={{ uri: photoUrl }} style={styles.artistTastePhoto} />
                ) : (
                  <View style={styles.artistTasteAvatarFallback}>
                    <Text style={styles.artistTasteInitial}>
                      {artistName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                {!isTablet && (
                  <View style={styles.artistTasteInfo}>
                    <Text style={styles.artistTasteName} numberOfLines={1}>
                      {artistName}
                    </Text>
                    <Text style={styles.artistTasteSub}>Artist</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        ) : !isTablet ? (
          <View style={styles.emptyTasteBox}>
            <Text style={styles.emptyTasteText}>
              Pick artists in onboarding or search to pin them here!
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebarContainer: {
    width: 250,
    backgroundColor: "#000000",
    borderRightWidth: 1,
    borderRightColor: "rgba(255, 255, 255, 0.07)",
    flexDirection: "column",
    paddingTop: Platform.OS === "web" ? 10 : 14,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  sidebarContainerTablet: {
    width: 76,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 6,
    height: 34,
    marginBottom: 20,
  },
  brandRowTablet: {
    justifyContent: "center",
    paddingHorizontal: 0,
    height: 34,
    marginBottom: 16,
  },
  brandLogoBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: {
    fontFamily: fonts.bold,
    fontSize: 21,
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  navSection: {
    gap: 4,
  },
  navSectionTablet: {
    alignItems: "center",
    gap: 8,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    position: "relative",
  },
  navItemTablet: {
    paddingHorizontal: 0,
    paddingVertical: 10,
    width: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  navItemActive: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  navLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.textSecondary,
  },
  navLabelActive: {
    color: "#FFFFFF",
    fontFamily: fonts.bold,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginVertical: 18,
  },
  tasteHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  tasteHeaderRowTablet: {
    justifyContent: "center",
    paddingHorizontal: 0,
    marginBottom: 12,
  },
  tasteHeaderTitle: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1.2,
  },
  tasteScrollView: {
    flex: 1,
  },
  tasteListContent: {
    gap: 4,
    paddingBottom: 12,
  },
  tasteListContentTablet: {
    alignItems: "center",
    gap: 8,
    paddingBottom: 12,
  },
  artistTasteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  artistTasteRowTablet: {
    paddingHorizontal: 0,
    paddingVertical: 4,
    justifyContent: "center",
  },
  artistTastePhoto: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceCard,
  },
  artistTasteAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceCard,
    alignItems: "center",
    justifyContent: "center",
  },
  artistTasteInitial: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.textSecondary,
  },
  artistTasteInfo: {
    flex: 1,
  },
  artistTasteName: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.text,
  },
  artistTasteSub: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  emptyTasteBox: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  emptyTasteText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
  },
});
