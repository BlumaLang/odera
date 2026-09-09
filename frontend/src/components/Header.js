import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { useResponsive } from "../context/ResponsiveContext";
import { useUser } from "../context/UserContext";

export default function Header({
  activeFilter = "All",
  onSelectFilter,
  onAddPress,
}) {
  const { isDesktop, isTablet } = useResponsive();
  const { userProfile, openProfile } = useUser() || {};
  const userInitial = (userProfile?.username?.[0] || "A").toUpperCase();
  const avatarIcon = userProfile?.avatar && userProfile.avatar !== "initial" ? userProfile.avatar : null;
  const avatarBg = userProfile?.avatarColor || colors.primary;

  const filters = [
    { id: "All", label: "All" },
    { id: "Following", label: "Following" },
  ];

  return (
    <View style={styles.headerWrapper}>
      <View style={[styles.innerContainer, (isDesktop || isTablet) && styles.desktopInnerContainer]}>
        <View style={styles.topRow}>
          <View style={styles.pillRow}>
            {filters.map((f) => (
              <TouchableOpacity
                key={f.id}
                style={[styles.pillBtn, activeFilter === f.id && styles.pillBtnActive]}
                onPress={() => onSelectFilter && onSelectFilter(f.id)}
                activeOpacity={0.8}
              >
                <Text style={[styles.pillText, activeFilter === f.id && styles.pillTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.topRightGroup}>
            <TouchableOpacity
              style={[styles.profileAvatar, { backgroundColor: avatarBg }]}
              onPress={() => openProfile && openProfile()}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {userProfile?.avatar === "initial" ? (
                <Text style={styles.profileAvatarText}>{userInitial}</Text>
              ) : avatarIcon && avatarIcon.startsWith("http") && !avatarIcon.includes("googleusercontent.com") ? (
                <Image
                  source={{ uri: avatarIcon }}
                  style={styles.profileAvatarImage}
                  resizeMode="cover"
                />
              ) : (
                <Image
                  source={{
                    uri: `https://api.dicebear.com/10.x/toon-head/svg?seed=${encodeURIComponent(
                      userProfile?.username || "Felix"
                    )}`,
                  }}
                  style={styles.profileAvatarImage}
                  resizeMode="cover"
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrapper: {
    backgroundColor: "#000000",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "web" ? 12 : 14,
    paddingBottom: 8,
  },
  innerContainer: {
    width: "100%",
  },
  desktopInnerContainer: {
    width: "100%",
    paddingHorizontal: 16,
  },
  topRow: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pillBtn: {
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  pillBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#FFFFFF",
  },
  pillTextActive: {
    fontFamily: fonts.bold,
    color: "#000000",
  },
  topRightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  addCircleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  profileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
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
});
