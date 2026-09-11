import React from "react";
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
 * Deep Link Web Preview Modal
 * Displays a Spotify-style preview card when a user navigates directly to a deep link:
 * e.g., /song/{id}, /album/{id}, /artist/{id}, /playlist/{id}, /room/{id}, /user/{username}
 */
export default function DeepLinkPreviewModal({
  visible,
  onClose,
  type = "song", // "song" | "album" | "artist" | "playlist" | "room" | "user"
  data = null,
  onPlayInStaytup,
  onOpenApp,
}) {
  if (!visible || !data) return null;

  const title =
    data.title || data.name || data.username || data.displayName || "Staytup Music";
  const subtitle =
    data.artist ||
    (type === "artist" ? "Artist on Staytup" : type === "user" ? `@${data.username}` : data.subtitle || "Staytup Music");
  const artwork = data.artwork_url || data.thumbnail || data.image || data.avatar || null;

  const handleOpenApp = () => {
    if (onOpenApp) {
      onOpenApp();
      return;
    }
    // Attempt PWA / app scheme launch or trigger install prompt
    if (typeof window !== "undefined") {
      if (window.__staytupInstallPrompt) {
        window.__staytupInstallPrompt.prompt();
      } else {
        // Fallback: stay inside web player
        if (onPlayInStaytup) onPlayInStaytup();
      }
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card} onStartShouldSetResponder={() => true}>
          {/* Close button */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Close preview"
          >
            <Ionicons name="close" size={20} color="#AAAAAA" />
          </TouchableOpacity>

          {/* Type Badge */}
          <View style={styles.badgeRow}>
            <Ionicons name="musical-notes" size={13} color="#1DB954" style={{ marginRight: 5 }} />
            <Text style={styles.badgeText}>
              SHARED {type.toUpperCase()}
            </Text>
          </View>

          {/* Big Artwork with Drop Shadow */}
          <View style={styles.artworkContainer}>
            {artwork ? (
              <Image source={{ uri: artwork }} style={styles.artwork} resizeMode="cover" />
            ) : (
              <View style={[styles.artwork, styles.artworkFallback]}>
                <Ionicons name="musical-notes" size={54} color={colors.primary} />
              </View>
            )}
          </View>

          {/* Metadata */}
          <Text style={styles.title} numberOfLines={2}>
            {type === "song" ? `🎵 ${title}` : title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {subtitle}
          </Text>

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            {onPlayInStaytup && (
              <TouchableOpacity
                style={styles.playBtn}
                onPress={() => {
                  onPlayInStaytup(data);
                  onClose();
                }}
                activeOpacity={0.88}
              >
                <Ionicons name="play" size={18} color="#000000" style={{ marginRight: 6 }} />
                <Text style={styles.playBtnText}>Play in Staytup</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.openAppBtn}
              onPress={handleOpenApp}
              activeOpacity={0.8}
            >
              <Ionicons name="download-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.openAppBtnText}>Open App</Text>
            </TouchableOpacity>
          </View>

          {/* Bottom dismiss footnote */}
          <TouchableOpacity
            style={styles.dismissBtn}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.dismissText}>Explore more on Staytup</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    ...(Platform.OS === "web" ? { cursor: "default" } : {}),
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#16161A",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 28,
    elevation: 20,
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(29, 185, 84, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.3)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 18,
  },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: 10.5,
    color: "#1DB954",
    letterSpacing: 0.8,
  },
  artworkContainer: {
    width: 170,
    height: 170,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#202025",
    marginBottom: 18,
    shadowColor: "#1DB954",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  artwork: {
    width: "100%",
    height: "100%",
  },
  artworkFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 19,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 4,
    lineHeight: 24,
  },
  artist: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    color: "#AAAAAA",
    textAlign: "center",
    marginBottom: 20,
  },
  actionsRow: {
    width: "100%",
    gap: 10,
    marginBottom: 12,
  },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    height: 48,
    borderRadius: 24,
    width: "100%",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  playBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14.5,
    color: "#000000",
  },
  openAppBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    height: 44,
    borderRadius: 22,
    width: "100%",
  },
  openAppBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 13.5,
    color: "#FFFFFF",
  },
  dismissBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  dismissText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: "#777777",
  },
});
