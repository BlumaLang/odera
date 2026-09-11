import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { useUser } from "../context/UserContext";
import { useAudio } from "../context/AudioContext";
import { createListeningParty } from "../services/firebase";

export default function CreatePartyModal({ visible, onClose, onCreated }) {
  const { currentUser, userProfile } = useUser() || {};
  const { currentTrack } = useAudio() || {};

  const hostUid = currentUser?.uid || userProfile?.uid;
  const hostName = userProfile?.username || userProfile?.displayName || currentUser?.displayName || "Host";
  const hostPhoto = userProfile?.avatar || userProfile?.photoURL || userProfile?.avatarUrl || currentUser?.photoURL || "";
  const hostColor = userProfile?.avatarColor || "";

  const [partyName, setPartyName] = useState(`${hostName}'s Room`);
  const [isPrivate, setIsPrivate] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleCreate = async () => {
    if (!hostUid) {
      setErrorMsg("Please sign in to start a listening party.");
      return;
    }
    if (!partyName.trim()) {
      setErrorMsg("Please enter a room name.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const partyId = await createListeningParty({
        name: partyName.trim(),
        hostUid,
        hostName,
        hostPhoto,
        hostColor,
        isPrivate,
        passcode: isPrivate ? passcode.trim() : "",
        initialTrack: currentTrack || null,
      });

      if (onCreated) {
        onCreated(partyId);
      }
      if (onClose) {
        onClose();
      }
    } catch (err) {
      setErrorMsg(err.message || "Failed to create listening room.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={styles.card}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconWrap}>
                <Ionicons name="headset" size={20} color="#1DB954" />
              </View>
              <View>
                <Text style={styles.title}>Start Listening Party</Text>
                <Text style={styles.subTitle}>Sync playback with friends • Zero chat</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={20} color="#888888" />
            </TouchableOpacity>
          </View>

          {/* Current track preview */}
          {currentTrack ? (
            <View style={styles.trackCard}>
              <Image
                source={{ uri: currentTrack.image || currentTrack.thumbnail }}
                style={styles.trackThumb}
              />
              <View style={styles.trackMeta}>
                <Text style={styles.trackPlayingLabel}>STARTING TRACK</Text>
                <Text style={styles.trackTitle} numberOfLines={1}>
                  {currentTrack.title}
                </Text>
                <Text style={styles.trackArtist} numberOfLines={1}>
                  {currentTrack.artist}
                </Text>
              </View>
              <Ionicons name="musical-notes" size={18} color="#1DB954" />
            </View>
          ) : (
            <View style={styles.noTrackCard}>
              <Ionicons name="disc-outline" size={20} color="#666666" style={{ marginRight: 8 }} />
              <Text style={styles.noTrackText}>
                No song currently playing. You can pick tracks inside the room.
              </Text>
            </View>
          )}

          {/* Room Name Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>ROOM NAME</Text>
            <TextInput
              style={styles.textInput}
              value={partyName}
              onChangeText={setPartyName}
              placeholder="e.g. Late Night Lo-Fi"
              placeholderTextColor="#555555"
              maxLength={40}
            />
          </View>

          {/* Privacy Toggle */}
          <View style={styles.privacyRow}>
            <TouchableOpacity
              style={[styles.privacyPill, !isPrivate && styles.privacyPillActive]}
              onPress={() => setIsPrivate(false)}
              activeOpacity={0.8}
            >
              <Ionicons
                name="globe-outline"
                size={16}
                color={!isPrivate ? "#000000" : "#888888"}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.privacyPillText, !isPrivate && styles.privacyPillTextActive]}>
                Public Room
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.privacyPill, isPrivate && styles.privacyPillActive]}
              onPress={() => setIsPrivate(true)}
              activeOpacity={0.8}
            >
              <Ionicons
                name="lock-closed-outline"
                size={16}
                color={isPrivate ? "#000000" : "#888888"}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.privacyPillText, isPrivate && styles.privacyPillTextActive]}>
                Private (Invite Link)
              </Text>
            </TouchableOpacity>
          </View>

          {isPrivate && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>PASSCODE (OPTIONAL)</Text>
              <TextInput
                style={styles.textInput}
                value={passcode}
                onChangeText={setPasscode}
                placeholder="e.g. 1234"
                placeholderTextColor="#555555"
                secureTextEntry
                maxLength={10}
              />
            </View>
          )}

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.createBtn, isSubmitting && styles.createBtnDisabled]}
            onPress={handleCreate}
            disabled={isSubmitting}
            activeOpacity={0.85}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <>
                <Ionicons name="radio" size={18} color="#000000" style={{ marginRight: 8 }} />
                <Text style={styles.createBtnText}>Create & Open Room</Text>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#141416",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0 20px 48px rgba(0, 0, 0, 0.6)",
        }
      : {}),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(29, 185, 84, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: fonts.bold || "System",
    fontSize: 17,
    color: "#FFFFFF",
  },
  subTitle: {
    fontFamily: fonts.regular || "System",
    fontSize: 12,
    color: "#888888",
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  trackCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 14,
    padding: 10,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  trackThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#222222",
  },
  trackMeta: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  trackPlayingLabel: {
    fontFamily: fonts.semiBold || "System",
    fontSize: 9.5,
    color: "#1DB954",
    letterSpacing: 0.5,
  },
  trackTitle: {
    fontFamily: fonts.semiBold || "System",
    fontSize: 13,
    color: "#FFFFFF",
    marginTop: 1,
  },
  trackArtist: {
    fontFamily: fonts.regular || "System",
    fontSize: 11.5,
    color: "#888888",
  },
  noTrackCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 18,
  },
  noTrackText: {
    fontFamily: fonts.regular || "System",
    fontSize: 12,
    color: "#777777",
    flex: 1,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontFamily: fonts.bold || "System",
    fontSize: 10.5,
    color: "#888888",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: fonts.medium || "System",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  privacyRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  privacyPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  privacyPillActive: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
  },
  privacyPillText: {
    fontFamily: fonts.medium || "System",
    fontSize: 12,
    color: "#888888",
  },
  privacyPillTextActive: {
    color: "#000000",
    fontFamily: fonts.semiBold || "System",
  },
  errorText: {
    fontFamily: fonts.regular || "System",
    fontSize: 12,
    color: "#FF453A",
    marginBottom: 12,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1DB954",
    borderRadius: 22,
    height: 46,
    marginTop: 4,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  createBtnDisabled: {
    opacity: 0.6,
  },
  createBtnText: {
    fontFamily: fonts.bold || "System",
    fontSize: 14,
    color: "#000000",
  },
});
