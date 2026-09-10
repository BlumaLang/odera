// Shared avatar utilities for resolving user avatars across the app

// Memoji avatar sources - Pastel Background only (10 avatars)
const MEMOJI_SOURCES = {
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

export const DEFAULT_AVATAR_ID = "memoji_0";

export function getMemojiSource(avatarId) {
  if (!avatarId) return null;
  return MEMOJI_SOURCES[avatarId] || null;
}

export function resolveAvatar(user) {
  const avatar = user?.avatar || user?.avatarUrl || user?.photoURL || null;

  if (avatar && avatar.startsWith("memoji_")) {
    const src = MEMOJI_SOURCES[avatar];
    if (src) return { source: src, uri: null, isMemoji: true, isInitial: false };
  }

  if (avatar && typeof avatar === "string" && avatar.startsWith("http") && !avatar.includes("googleusercontent.com")) {
    return { source: null, uri: avatar, isMemoji: false, isInitial: false };
  }

  return { source: null, uri: null, isMemoji: false, isInitial: true };
}

export function getInitial(user) {
  const name = user?.username || user?.displayName || user?.name || "U";
  return (name[0] || "U").toUpperCase();
}
