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

            <TouchableOpacity
              style={styles.partyPillBtn}
              onPress={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("staytup-create-party"));
                }
              }}
              activeOpacity={0.8}
              accessibilityLabel="Listening Party"
            >
              <Ionicons name="headset" size={13} color="#1DB954" style={{ marginRight: 4 }} />
              <Text style={styles.partyPillText}>Party</Text>
              <View style={styles.partyPillLiveDot} />
            </TouchableOpacity>
          </View>

          <View style={styles.topRightGroup}>
            <TouchableOpacity
              style={styles.partyCircleBtn}
              onPress={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("staytup-create-party"));
                }
              }}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Listening Party"
            >
              <Ionicons name="headset" size={18} color="#1DB954" />
              <View style={styles.partyCircleLiveDot} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.profileAvatar, { backgroundColor: avatarBg }]}
              onPress={() => openProfile && openProfile()}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {(() => {
                const av = userProfile?.avatar;
                if (av && av.startsWith("memoji_")) {
                  const memojiMap = {
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
                  const src = memojiMap[av];
                  if (src) return <Image source={src} style={styles.profileAvatarImage} resizeMode="cover" />;
                }
                if (av && av.startsWith("http") && !av.includes("googleusercontent.com")) {
                  return <Image source={{ uri: av }} style={styles.profileAvatarImage} resizeMode="cover" />;
                }
                return <Text style={styles.profileAvatarText}>{userInitial}</Text>;
              })()}
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
  partyPillBtn: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "rgba(29, 185, 84, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.3)",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  partyPillText: {
    fontFamily: fonts.semiBold,
    fontSize: 12.5,
    color: "#FFFFFF",
    marginRight: 4,
  },
  partyPillLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1DB954",
  },
  partyCircleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  partyCircleLiveDot: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#1DB954",
    borderWidth: 1.5,
    borderColor: "#000000",
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
