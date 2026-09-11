import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Image,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";

/**
 * Universal Share Sheet Modal for Staytup
 * Supports sharing: songs, albums, artists, playlists, user profiles, and listening rooms.
 */
export default function ShareSheetModal({
  visible,
  onClose,
  type = "song", // "song" | "album" | "artist" | "playlist" | "profile" | "room"
  data = null,
}) {
  const [copiedToast, setCopiedToast] = useState(false);

  if (!visible || !data) return null;

  // Resolve share metadata
  const title =
    data.title || data.name || data.username || data.displayName || "Staytup Music";
  const subtitle =
    data.artist ||
    (type === "artist" ? "Artist on Staytup" : type === "profile" ? `@${data.username}` : data.subtitle || "Staytup");
  const artwork = data.artwork_url || data.thumbnail || data.image || data.avatar || null;
  const id = data.id || data.videoId || data.video_id || data.username || "";

  // Deep link URL generation
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://staytup.odireca.com";

  let sharePath = "";
  switch (type) {
    case "song":
      sharePath = `/song/${encodeURIComponent(id)}`;
      break;
    case "album":
      sharePath = `/album/${encodeURIComponent(id)}`;
      break;
    case "artist":
      sharePath = `/artist/${encodeURIComponent(id || title)}`;
      break;
    case "playlist":
      sharePath = `/playlist/${encodeURIComponent(id)}`;
      break;
    case "profile":
      sharePath = `/user/${encodeURIComponent(data.username || id)}`;
      break;
    case "room":
      sharePath = `/room/${encodeURIComponent(id)}`;
      break;
    default:
      sharePath = `/?track=${encodeURIComponent(id)}`;
  }

  const shareUrl = `${origin}${sharePath}`;
  const shareText = `Check out "${title}" by ${subtitle} on Staytup 🎵`;

  const handleCopyLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        setCopiedToast(true);
        setTimeout(() => setCopiedToast(false), 2200);
      }).catch(() => {
        prompt("Copy this link:", shareUrl);
      });
    } else {
      prompt("Copy this link:", shareUrl);
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title,
          text: shareText,
          url: shareUrl,
        });
        onClose();
      } catch (err) {
        if (err.name !== "AbortError") {
          handleCopyLink();
        }
      }
    } else {
      handleCopyLink();
    }
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(`${shareText}\n${shareUrl}`);
    if (typeof window !== "undefined") {
      window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
    }
  };

  const handleMessagesShare = () => {
    const text = encodeURIComponent(`${shareText} ${shareUrl}`);
    if (typeof window !== "undefined") {
      window.open(`sms:?&body=${text}`, "_blank");
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
          {/* Top Header */}
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Share {type.toUpperCase()}</Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Close share sheet"
            >
              <Ionicons name="close" size={20} color="#AAAAAA" />
            </TouchableOpacity>
          </View>

          {/* Social Preview Card */}
          <View style={styles.previewCard}>
            {artwork ? (
              <Image source={{ uri: artwork }} style={styles.previewArtwork} resizeMode="cover" />
            ) : (
              <View style={[styles.previewArtwork, styles.previewFallback]}>
                <Ionicons name="musical-notes" size={26} color={colors.primary} />
              </View>
            )}
            <View style={styles.previewMeta}>
              <Text style={styles.previewTitle} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.previewSub} numberOfLines={1}>
                {subtitle}
              </Text>
              <View style={styles.staytupBrandRow}>
                <Ionicons name="radio" size={12} color="#1DB954" style={{ marginRight: 4 }} />
                <Text style={styles.staytupBrandText}>Staytup Deep Link</Text>
              </View>
            </View>
          </View>

          {/* Copied Toast Banner */}
          {copiedToast && (
            <View style={styles.toastBanner}>
              <Ionicons name="checkmark-circle" size={15} color="#1DB954" />
              <Text style={styles.toastText}>Link copied to clipboard!</Text>
            </View>
          )}

          {/* Quick Share Action Row */}
          <View style={styles.actionsGrid}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleCopyLink}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIconWrap, { backgroundColor: "rgba(255, 255, 255, 0.1)" }]}>
                <Ionicons name="link" size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.actionLabel}>Copy link</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleWhatsAppShare}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIconWrap, { backgroundColor: "#25D366" }]}>
                <Ionicons name="logo-whatsapp" size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.actionLabel}>WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleMessagesShare}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIconWrap, { backgroundColor: "#007AFF" }]}>
                <Ionicons name="chatbubble" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.actionLabel}>Messages</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleNativeShare}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIconWrap, { backgroundColor: colors.primary }]}>
                <Ionicons name="share-social" size={20} color="#000000" />
              </View>
              <Text style={styles.actionLabel}>More</Text>
            </TouchableOpacity>
          </View>

          {/* Deep link copy box */}
          <View style={styles.linkBox}>
            <Text style={styles.linkText} numberOfLines={1}>
              {shareUrl}
            </Text>
            <TouchableOpacity
              style={styles.linkCopyBtn}
              onPress={handleCopyLink}
              activeOpacity={0.8}
            >
              <Text style={styles.linkCopyBtnText}>Copy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    justifyContent: "flex-end",
    alignItems: "center",
    ...(Platform.OS === "web" ? { cursor: "default" } : {}),
  },
  modalCard: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#16161A",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: Platform.OS === "web" ? 32 : 44,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#FFFFFF",
    letterSpacing: 0.6,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
  },
  previewArtwork: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: "#222228",
    marginRight: 14,
  },
  previewFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  previewMeta: {
    flex: 1,
    justifyContent: "center",
  },
  previewTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: "#FFFFFF",
    marginBottom: 2,
  },
  previewSub: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: "#AAAAAA",
    marginBottom: 4,
  },
  staytupBrandRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  staytupBrandText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: "#1DB954",
  },
  toastBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(29, 185, 84, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.35)",
    paddingVertical: 8,
    borderRadius: 10,
    gap: 8,
    marginBottom: 14,
  },
  toastText: {
    fontFamily: fonts.semiBold,
    fontSize: 12.5,
    color: "#1DB954",
  },
  actionsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  actionBtn: {
    alignItems: "center",
    gap: 8,
  },
  actionIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: "#DDDDDD",
  },
  linkBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
  },
  linkText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "#888888",
    marginRight: 10,
  },
  linkCopyBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  linkCopyBtnText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: "#000000",
  },
});
