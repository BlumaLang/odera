import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { useResponsive } from "../context/ResponsiveContext";

export const PLAYLIST_PRESET_COVERS = [
  { id: "preset1", label: "Cover 1", url: "https://i.pinimg.com/736x/0a/0c/1e/0a0c1e61f487c99518f1cf2aff8df6b8.jpg" },
  { id: "preset2", label: "Cover 2", url: "https://i.pinimg.com/736x/8c/68/e3/8c68e3352dbb43ab0e8d30346f1fb29e.jpg" },
  { id: "preset3", label: "Cover 3", url: "https://i.pinimg.com/736x/ef/f1/02/eff10290cdf26d8d70f7da9a2ecb0dea.jpg" },
  { id: "preset4", label: "Cover 4", url: "https://i.pinimg.com/736x/8c/44/41/8c44417d29fe788f556ccbbeec8a9b16.jpg" },
  { id: "preset5", label: "Cover 5", url: "https://i.pinimg.com/736x/50/ed/08/50ed084eac9b3fc060a3f5f74f5beeae.jpg" },
  { id: "preset6", label: "Cover 6", url: "https://i.pinimg.com/736x/39/ad/9f/39ad9f51cd2fffb7dbc31ce6d219fac6.jpg" },
];

function getNextPlaylistDefaultName(playlists = []) {
  const customList = Array.isArray(playlists) ? playlists : [];
  let num = 1;
  const regex = /^My Playlist #(\d+)$/i;
  const usedNums = new Set();
  customList.forEach((p) => {
    const name = (p.name || p.title || "").trim();
    const match = name.match(regex);
    if (match) {
      usedNums.add(parseInt(match[1], 10));
    }
  });
  while (usedNums.has(num)) {
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
  initialCover = "",
  mode = "create", // "create" | "edit"
}) {
  const { isDesktop, isTablet } = useResponsive();
  const [playlistName, setPlaylistName] = useState("");
  const [selectedCover, setSelectedCover] = useState("");
  const [customCoverInput, setCustomCoverInput] = useState("");
  const [showCustomLinkInput, setShowCustomLinkInput] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef(null);

  // Initialize input value ONLY when modal opens
  useEffect(() => {
    if (visible) {
      const startingName =
        initialName && initialName.trim()
          ? initialName.trim()
          : getNextPlaylistDefaultName(existingPlaylists);
      setPlaylistName(startingName);
      const defaultCover = initialCover || PLAYLIST_PRESET_COVERS[0]?.url || "";
      setSelectedCover(defaultCover);
      setCustomCoverInput(
        initialCover && !PLAYLIST_PRESET_COVERS.some((p) => p.url === initialCover)
          ? initialCover
          : ""
      );
      setShowCustomLinkInput(
        Boolean(initialCover && !PLAYLIST_PRESET_COVERS.some((p) => p.url === initialCover))
      );
      setLoading(false);

      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 120);
      return () => clearTimeout(timer);
    } else {
      setPlaylistName("");
      setSelectedCover("");
      setCustomCoverInput("");
      setShowCustomLinkInput(false);
      setLoading(false);
    }
  }, [visible, initialName, initialCover]);

  const handleSave = async () => {
    const trimmed = playlistName.trim();
    const finalName =
      trimmed || (initialName && initialName.trim()) || getNextPlaylistDefaultName(existingPlaylists);
    const finalCover =
      (customCoverInput && customCoverInput.trim())
        ? customCoverInput.trim()
        : (selectedCover || PLAYLIST_PRESET_COVERS[0]?.url || "");
    setLoading(true);
    try {
      if (onSubmit) {
        await onSubmit(finalName, finalCover);
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
  const modalHeading = isEdit
    ? "Edit playlist name"
    : "Give your playlist a name";

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

        {/* Top Navigation Bar */}
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

          <View style={styles.topBarSpacer} />
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
            {/* Playlist Avatar Preview */}
            {(customCoverInput.trim() || selectedCover) ? (
              <Image
                source={{ uri: customCoverInput.trim() || selectedCover }}
                style={styles.avatarPreviewImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.iconCircle}>
                <Ionicons
                  name={isEdit ? "pencil" : "musical-notes"}
                  size={34}
                  color={colors.primary}
                />
              </View>
            )}

            <Text style={styles.mainTitle}>{modalHeading}</Text>
            <Text style={styles.subtitle}>
              {isEdit
                ? "Choose a fresh name and avatar for your playlist"
                : "Give your playlist a title and choose a rounded avatar"}
            </Text>

            {/* Editable Input Box */}
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
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color="rgba(255, 255, 255, 0.45)"
                  />
                </TouchableOpacity>
              )}
            </View>

            {/* Playlist Avatar / Cover Presets */}
            <View style={styles.presetsSection}>
              <View style={styles.coverHeaderRow}>
                <Text style={styles.presetsLabel}>PLAYLIST AVATAR / COVER</Text>
                <TouchableOpacity
                  onPress={() => setShowCustomLinkInput(!showCustomLinkInput)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.customLinkToggleText}>
                    {showCustomLinkInput ? "Hide Link Input" : "Paste Image Link"}
                  </Text>
                </TouchableOpacity>
              </View>

              {showCustomLinkInput && (
                <View style={[styles.inputWrapper, styles.customLinkWrapper]}>
                  <TextInput
                    style={[styles.textInput, { fontSize: 13 }]}
                    value={customCoverInput}
                    onChangeText={(t) => {
                      setCustomCoverInput(t);
                      if (t.trim()) setSelectedCover(t.trim());
                    }}
                    placeholder="Paste image URL (https://...)"
                    placeholderTextColor="rgba(255, 255, 255, 0.3)"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {customCoverInput.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setCustomCoverInput("")}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="close-circle"
                        size={18}
                        color="rgba(255, 255, 255, 0.45)"
                      />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.coverPresetsRow}
              >
                {PLAYLIST_PRESET_COVERS.map((cov) => {
                  const isSelected = selectedCover === cov.url && !customCoverInput;
                  return (
                    <TouchableOpacity
                      key={cov.id}
                      style={[
                        styles.coverPresetCard,
                        isSelected && styles.coverPresetCardActive,
                      ]}
                      onPress={() => {
                        setSelectedCover(cov.url);
                        setCustomCoverInput("");
                      }}
                      activeOpacity={0.8}
                    >
                      <Image
                        source={{ uri: cov.url }}
                        style={styles.coverPresetThumb}
                        resizeMode="cover"
                      />
                      {isSelected && (
                        <View style={styles.coverSelectedBadge}>
                          <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
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

            {/* Bottom Create Button */}
            <TouchableOpacity
              style={[styles.bottomCreateBtn, loading && styles.disabledBtn]}
              onPress={handleSave}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <Text style={styles.bottomCreateBtnText}>
                  {isEdit ? "Save Changes" : "Create Playlist"}
                </Text>
              )}
            </TouchableOpacity>
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
  topBarSpacer: {
    width: 38,
    height: 38,
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
    paddingVertical: 28,
  },
  desktopScrollContent: {
    maxWidth: 540,
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
    marginBottom: 24,
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
    marginBottom: 20,
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
    fontSize: 16,
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
    marginBottom: 26,
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
  bottomCreateBtn: {
    width: "100%",
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  bottomCreateBtnText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#000000",
  },
  disabledBtn: {
    opacity: 0.6,
  },
  avatarPreviewImage: {
    width: 84,
    height: 84,
    borderRadius: 42,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  coverHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  customLinkToggleText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.primary,
    letterSpacing: 0.2,
  },
  customLinkWrapper: {
    height: 44,
    marginBottom: 12,
    borderRadius: 10,
  },
  coverPresetsRow: {
    flexDirection: "row",
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  coverPresetCard: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: "visible",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.12)",
    position: "relative",
  },
  coverPresetCardActive: {
    borderColor: colors.primary,
    borderWidth: 2.5,
  },
  coverPresetThumb: {
    width: "100%",
    height: "100%",
    borderRadius: 27,
    overflow: "hidden",
  },
  coverSelectedBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    borderWidth: 2.5,
    borderColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    elevation: 5,
  },
});
