import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { useResponsive } from "../context/ResponsiveContext";

/**
 * Calculates the next available default playlist name like "My Playlist #1", "My Playlist #2"
 */
export function getNextPlaylistDefaultName(playlists = []) {
  const existingNames = new Set(
    (playlists || []).map((p) => (p?.name || "").trim().toLowerCase())
  );
  let num = (playlists?.length || 0) + 1;
  while (existingNames.has(`my playlist #${num}`.toLowerCase())) {
    num++;
  }
  return `My Playlist #${num}`;
}

const PRESET_NAMES = [
  "My Favorites",
  "Late Night Vibes",
  "Daily Chill",
  "Workout Energy",
  "Roadtrip Beats",
  "Focus & Study",
];

export default function CreatePlaylistModal({
  visible,
  onClose,
  onSubmit,
  existingPlaylists = [],
  initialName = "",
  mode = "create", // "create" | "edit"
}) {
  const { isDesktop, isTablet } = useResponsive();
  const [playlistName, setPlaylistName] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  // Initialize input value ONLY when modal opens (when visible becomes true)
  useEffect(() => {
    if (visible) {
      const startingName =
        initialName && initialName.trim()
          ? initialName.trim()
          : getNextPlaylistDefaultName(existingPlaylists);
      setPlaylistName(startingName);
      setLoading(false);

      // Auto-focus input after modal renders
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setPlaylistName("");
      setLoading(false);
    }
  }, [visible]);

  const handleSave = async () => {
    const trimmed = playlistName.trim();
    const finalName =
      trimmed || (initialName && initialName.trim()) || getNextPlaylistDefaultName(existingPlaylists);
    setLoading(true);
    try {
      if (onSubmit) {
        await onSubmit(finalName);
      }
      onClose();
    } catch (err) {
      console.warn("Failed to save playlist name:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  const isEdit = mode === "edit";
  const modalHeading = isEdit ? "Edit playlist name" : "Give your playlist a name";
  const buttonLabel = isEdit ? "Save Changes" : "Create Playlist";

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <View style={styles.container}>
        <StatusBar translucent backgroundColor="#000000" barStyle="light-content" />

        {/* Clean Full-Screen Top Navigation Bar */}
        <View style={[styles.topBar, (isDesktop || isTablet) && styles.desktopTopBar]}>
          <TouchableOpacity
            style={styles.navCloseBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <Text style={styles.topBarTitle} numberOfLines={1}>
            {isEdit ? "Rename Playlist" : "New Playlist"}
          </Text>

          <TouchableOpacity
            style={[styles.topActionBtn, loading && styles.disabledBtn]}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <Text style={styles.topActionBtnText}>{isEdit ? "Save" : "Create"}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Scrollable Center Body Area */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboardAvoidArea}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              (isDesktop || isTablet) && styles.desktopScrollContent,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.iconCircle}>
              <Ionicons
                name={isEdit ? "pencil" : "musical-notes"}
                size={34}
                color={colors.primary}
              />
            </View>

            <Text style={styles.mainTitle}>{modalHeading}</Text>
            <Text style={styles.subtitle}>
              {isEdit
                ? "Choose a fresh name for your playlist collection"
                : "Give your playlist a title to easily recognize and play it"}
            </Text>

            {/* Fully Editable Input Box */}
            <View
              style={[
                styles.inputWrapper,
                isFocused && styles.inputWrapperFocused,
              ]}
            >
              <TextInput
                ref={inputRef}
                style={styles.textInput}
                value={playlistName}
                onChangeText={(text) => setPlaylistName(text)}
                placeholder="My Playlist"
                placeholderTextColor="rgba(255, 255, 255, 0.3)"
                maxLength={60}
                autoCorrect={false}
                autoCapitalize="words"
                editable={!loading}
                returnKeyType="done"
                onSubmitEditing={handleSave}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
              />
              {playlistName.length > 0 && !loading && (
                <TouchableOpacity
                  style={styles.clearBtn}
                  onPress={() => {
                    setPlaylistName("");
                    inputRef.current?.focus();
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle" size={20} color="rgba(255, 255, 255, 0.45)" />
                </TouchableOpacity>
              )}
            </View>

            {/* Name Preset Suggestions */}
            {!isEdit && (
              <View style={styles.presetsSection}>
                <Text style={styles.presetsLabel}>QUICK SUGGESTIONS</Text>
                <View style={styles.presetsRow}>
                  {PRESET_NAMES.map((preset) => (
                    <TouchableOpacity
                      key={preset}
                      style={[
                        styles.presetChip,
                        playlistName === preset && styles.presetChipActive,
                      ]}
                      onPress={() => {
                        setPlaylistName(preset);
                        inputRef.current?.focus();
                      }}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.presetChipText,
                          playlistName === preset && styles.presetChipTextActive,
                        ]}
                      >
                        {preset}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop:
      Platform.OS === "web"
        ? 14
        : Platform.OS === "android"
        ? (StatusBar.currentHeight || 24) + 8
        : 46,
    paddingBottom: 14,
    backgroundColor: "#000000",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  desktopTopBar: {
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 24,
  },
  navCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  topActionBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 18,
    minWidth: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  topActionBtnText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: "#000000",
  },
  keyboardAvoidArea: {
    flex: 1,
    backgroundColor: "#000000",
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 36,
  },
  desktopScrollContent: {
    maxWidth: 580,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(29, 185, 84, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: "rgba(29, 185, 84, 0.3)",
  },
  mainTitle: {
    fontFamily: fonts.bold,
    fontSize: 24,
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 28,
    paddingHorizontal: 12,
  },
  inputWrapper: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.12)",
    paddingHorizontal: 16,
    marginBottom: 24,
    height: 56,
  },
  inputWrapperFocused: {
    borderColor: colors.primary,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  textInput: {
    flex: 1,
    height: "100%",
    fontFamily: fonts.semiBold,
    fontSize: 18,
    color: "#FFFFFF",
    paddingVertical: 0,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
  },
  clearBtn: {
    padding: 4,
    marginLeft: 8,
  },
  presetsSection: {
    width: "100%",
    marginBottom: 30,
  },
  presetsLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 10,
    textAlign: "center",
  },
  presetsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  presetChip: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  presetChipActive: {
    backgroundColor: "rgba(29, 185, 84, 0.18)",
    borderColor: colors.primary,
  },
  presetChipText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: "#CCCCCC",
  },
  presetChipTextActive: {
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  primaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    marginBottom: 12,
  },
  primaryActionBtnText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#000000",
    letterSpacing: -0.2,
  },
  cancelLinkBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelLinkText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textMuted,
  },
  disabledBtn: {
    opacity: 0.6,
  },
});
