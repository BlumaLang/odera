import React, { useState, useEffect } from "react";
import { View, Text, Image } from "react-native";
import { fonts } from "../theme/colors";
import { getDeterministicAvatarColor } from "../context/UserContext";

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

export default function UserAvatar({ user, size = 36, fontSize, style }) {
  const [imgError, setImgError] = useState(false);

  const rawUser = typeof user === "string" ? { name: user } : (user || {});
  const avatar = rawUser.avatar || rawUser.avatarUrl || rawUser.photoURL || rawUser.image;
  const username = rawUser.username || rawUser.displayName || rawUser.name || "User";
  const initial = (username.trim()[0] || "U").toUpperCase();

  useEffect(() => {
    setImgError(false);
  }, [avatar]);

  const calcFontSize = fontSize || Math.max(10, Math.round(size * 0.42));

  const bgColor =
    rawUser.avatarColor && rawUser.avatarColor !== "#1DB954"
      ? rawUser.avatarColor
      : getDeterministicAvatarColor(rawUser.uid || username);

  // 1. Check if avatar is a local memoji key
  if (avatar && typeof avatar === "string" && avatar.startsWith("memoji_")) {
    const memojiSrc = MEMOJI_MAP[avatar];
    if (memojiSrc) {
      return (
        <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: bgColor }, style]}>
          <Image source={memojiSrc} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        </View>
      );
    }
  }

  // 2. Check if avatar is a remote HTTP URL
  const candidateUri =
    avatar && typeof avatar === "string" && avatar.startsWith("http") && !imgError
      ? avatar
      : null;

  if (candidateUri) {
    return (
      <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: bgColor }, style]}>
        <Image
          source={{ uri: candidateUri }}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      </View>
    );
  }

  // 3. Fallback: Vibrant Monogram Circle
  const isLightBg = bgColor === "#FFFFFF" || bgColor === "#FFA500";
  const textColor = isLightBg ? "#000000" : "#FFFFFF";

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bgColor,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Text style={{ fontFamily: fonts.bold || "System", fontSize: calcFontSize, color: textColor }}>
        {initial}
      </Text>
    </View>
  );
}
