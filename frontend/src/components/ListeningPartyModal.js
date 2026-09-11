import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { useUser } from "../context/UserContext";
import { useAudio } from "../context/AudioContext";
import { api } from "../api/client";
import {
  subscribeListeningParty,
  leaveListeningParty,
  deleteListeningParty,
  updatePartyPlayback,
  addSongToPartyQueue,
  votePartyQueueSong,
  playPartyQueueSong,
  removePartyQueueSong,
  voteToSkipParty,
  triggerPartyReaction,
} from "../services/firebase";
import { triggerLocalReactionBurst, triggerIncomingReaction } from "./LiveReactionOverlay";
import { openShareSheet } from "./ShareSheetModal";
import UserAvatar from "./UserAvatar";

const REACTION_EMOJIS = ["❤️", "🔥", "😂", "😮", "👏"];

export default function ListeningPartyModal({ partyId, visible, onClose }) {
  const { currentUser, userProfile } = useUser() || {};
  const {
    currentTrack,
    isPlaying,
    positionMillis,
    durationMillis,
    playTrack,
    togglePlayPause,
    seekTo,
  } = useAudio() || {};

  const myUid = currentUser?.uid || userProfile?.uid;
  const myName = userProfile?.username || userProfile?.displayName || "Listener";

  const [party, setParty] = useState(null);
  const [loading, setLoading] = useState(true);

  // Suggest song sheet
  const [isSuggestOpen, setIsSuggestOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Reaction burst tracker to avoid duplicate triggers
  const lastReactionIdRef = useRef(null);

  // ─── Realtime Party Subscription ──────────────────────────────────────────
  useEffect(() => {
    if (!partyId || !visible) return;
    setLoading(true);

    const unsubscribe = subscribeListeningParty(partyId, (data) => {
      setLoading(false);
      if (!data) {
        setParty(null);
        return;
      }
      setParty(data);

      // Handle incoming reaction burst from another member
      if (data.lastReaction && data.lastReaction.id !== lastReactionIdRef.current) {
        lastReactionIdRef.current = data.lastReaction.id;
        if (data.lastReaction.uid !== myUid) {
          triggerIncomingReaction({
            emoji: data.lastReaction.emoji,
            senderName: data.lastReaction.username || "Listener",
            source: "party",
          });
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [partyId, visible, myUid]);

  // ─── Listener Clock-Drift Sync Engine ─────────────────────────────────────
  const isHost = party?.hostUid === myUid;

  useEffect(() => {
    if (!party || isHost || !party.playbackState) return;

    const { isPlaying: remoteIsPlaying, positionMillis: remotePos, timestamp } = party.playbackState;
    const now = Date.now();
    const elapsed = Math.max(0, now - (timestamp || now));
    const targetPos = remoteIsPlaying ? remotePos + elapsed : remotePos;

    // 1. Sync track
    if (party.currentTrack && (!currentTrack || (currentTrack.videoId || currentTrack.id) !== (party.currentTrack.videoId || party.currentTrack.id))) {
      playTrack({ ...party.currentTrack });
    }

    // 2. Sync play/pause state
    if (remoteIsPlaying !== isPlaying) {
      togglePlayPause();
    }

    // 3. Sync seek position if drift > 400ms
    if (positionMillis !== undefined && Math.abs(positionMillis - targetPos) > 400) {
      seekTo(targetPos);
    }
  }, [party?.playbackState, party?.currentTrack, isHost]);

  // ─── Actions ─────────────────────────────────────────────────────────────
  const handleLeave = async () => {
    if (partyId && myUid) {
      await leaveListeningParty(partyId, myUid);
    }
    if (onClose) onClose();
  };

  const handleDeleteParty = async () => {
    if (!partyId || !isHost) return;
    const confirmDelete =
      typeof window !== "undefined" && window.confirm
        ? window.confirm("Are you sure you want to end and delete this listening party?")
        : true;
    if (!confirmDelete) return;

    await deleteListeningParty(partyId);
    if (onClose) onClose();
  };

  const handleHostPlayPause = async () => {
    if (!isHost || !partyId) return;
    const nextPlay = !isPlaying;
    togglePlayPause();
    await updatePartyPlayback(partyId, {
      isPlaying: nextPlay,
      positionMillis: positionMillis || 0,
      hostUid: myUid,
    });
  };

  const handleVoteSkip = async () => {
    if (!partyId || !myUid) return;
    await voteToSkipParty(partyId, myUid);
  };

  const handleReaction = async (emoji) => {
    triggerLocalReactionBurst({
      emoji,
      senderName: myName,
      source: "party",
    });
    if (partyId) {
      await triggerPartyReaction(partyId, {
        emoji,
        uid: myUid,
        username: myName,
      });
    }
  };

  const handleShareRoom = () => {
    openShareSheet({
      type: "room",
      id: partyId,
      title: party?.name || "Listening Party",
      subtitle: `${party?.hostName || "Friend"}'s Synchronized Room`,
      image: party?.currentTrack?.image || "",
    });
  };

  // ─── Song Suggestion Search ──────────────────────────────────────────────
  const handleSearchSongs = async (q) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await api.searchWithFilter(q, "songs", 0, 15);
      const list = res?.tracks || res?.results || res?.songs || [];
      setSearchResults(list);
    } catch (_) {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddTrackToQueue = async (rawTrack) => {
    if (!partyId || !rawTrack) return;
    const normalized = {
      ...rawTrack,
      id: rawTrack.videoId || rawTrack.video_id || rawTrack.id,
      videoId: rawTrack.videoId || rawTrack.video_id || rawTrack.id,
      title: rawTrack.title || rawTrack.name || "Unknown Track",
      artist: rawTrack.artist || rawTrack.subtitle || "Unknown Artist",
      image: rawTrack.image || rawTrack.thumbnail || rawTrack.artwork_url || "",
      thumbnail: rawTrack.thumbnail || rawTrack.image || "",
    };
    await addSongToPartyQueue(partyId, normalized, {
      uid: myUid,
      displayName: myName,
      photoURL: userProfile?.photoURL || "",
    });
    setIsSuggestOpen(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  if (!visible) return null;

  const membersList = party?.members ? Object.values(party.members) : [];
  const onlineCount = membersList.filter((m) => m?.isOnline).length || membersList.length || 1;

  const queueObj = party?.queue || {};
  const queueItems = Object.keys(queueObj)
    .map((k) => queueObj[k])
    .sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0) || (a.suggestedAt || 0) - (b.suggestedAt || 0));

  const skipVotes = party?.skipVotes || {};
  const skipCount = Object.keys(skipVotes).length;
  const skipThreshold = Math.max(1, Math.ceil(membersList.length / 2));
  const hasVotedSkip = !!skipVotes[myUid];

  const track = party?.currentTrack || currentTrack;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleLeave}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Top Bar */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave} activeOpacity={0.8}>
              <Ionicons name="chevron-down" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.headerTitleWrap}>
              <View style={styles.partyBadgeRow}>
                <View style={styles.livePulsingDot} />
                <Text style={styles.partyBadgeText}>LIVE PARTY</Text>
              </View>
              <Text style={styles.partyName} numberOfLines={1}>
                {party?.name || "Listening Party"}
              </Text>
            </View>

            <View style={styles.headerRightBtns}>
              {isHost && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={handleDeleteParty}
                  activeOpacity={0.8}
                  accessibilityLabel="End and delete party"
                >
                  <Ionicons name="trash-outline" size={17} color="#FF4D4D" />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.shareBtn} onPress={handleShareRoom} activeOpacity={0.8}>
                <Ionicons name="share-social-outline" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Members Presence Strip */}
            <View style={styles.membersStrip}>
              <View style={styles.membersCountBadge}>
                <Ionicons name="people" size={13} color="#1DB954" style={{ marginRight: 5 }} />
                <Text style={styles.membersCountText}>{onlineCount} Listening</Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.avatarsRow}>
                {membersList.map((m, idx) => {
                  const isCur = m.uid === myUid || m.uid === currentUser?.uid;
                  const memberUser = {
                    uid: m.uid,
                    name: m.name || (isCur ? myName : "Listener"),
                    username: m.name || (isCur ? myName : "Listener"),
                    displayName: m.name || (isCur ? myName : "Listener"),
                    avatar: m.avatar || (isCur ? userProfile?.avatar || userProfile?.photoURL : "") || (m.isHost ? party?.hostPhoto : ""),
                    avatarColor: m.avatarColor || (isCur ? userProfile?.avatarColor : ""),
                    photoURL: m.avatar || (isCur ? userProfile?.photoURL : "") || (m.isHost ? party?.hostPhoto : ""),
                  };
                  return (
                    <View key={(m.uid || idx) + "_m"} style={styles.memberAvatarWrap}>
                      <UserAvatar user={memberUser} size={32} fontSize={12} />
                      {m.isHost && (
                        <View style={styles.hostCrownBadge}>
                          <Ionicons name="star" size={8} color="#000000" />
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>

            {/* Now Playing Synchronized Card */}
            {track ? (
              <View style={styles.nowPlayingCard}>
                <Image source={{ uri: track.image || track.thumbnail }} style={styles.albumArt} />

                <View style={styles.trackDetails}>
                  <Text style={styles.trackTitle} numberOfLines={1}>
                    {track.title}
                  </Text>
                  <Text style={styles.trackArtist} numberOfLines={1}>
                    {track.artist}
                  </Text>

                  {/* Sync Status Badge */}
                  <View style={styles.syncBadge}>
                    <Ionicons
                      name={isHost ? "radio-outline" : "sync"}
                      size={12}
                      color={isHost ? "#1DB954" : "#4FC3F7"}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.syncBadgeText, { color: isHost ? "#1DB954" : "#4FC3F7" }]}>
                      {isHost ? "Host Controlling Audio" : `In Sync with ${party?.hostName || "Host"}`}
                    </Text>
                  </View>
                </View>

                {/* Host Control Actions */}
                {isHost && (
                  <TouchableOpacity style={styles.hostPlayBtn} onPress={handleHostPlayPause} activeOpacity={0.85}>
                    <Ionicons name={isPlaying ? "pause" : "play"} size={22} color="#000000" />
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.noTrackWrap}>
                <Ionicons name="musical-note-outline" size={32} color="#666666" />
                <Text style={styles.noTrackTitle}>No Track Playing</Text>
                <Text style={styles.noTrackSub}>Suggest a song below to start the party!</Text>
              </View>
            )}

            {/* Vote to Skip Bar */}
            <View style={styles.skipRow}>
              <View style={styles.skipInfo}>
                <Text style={styles.skipTitle}>Vote to Skip</Text>
                <Text style={styles.skipSub}>
                  {skipCount} of {skipThreshold} votes needed
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.skipBtn, hasVotedSkip && styles.skipBtnActive]}
                onPress={handleVoteSkip}
                activeOpacity={0.8}
              >
                <Ionicons name="play-skip-forward" size={14} color={hasVotedSkip ? "#000000" : "#FFFFFF"} style={{ marginRight: 5 }} />
                <Text style={[styles.skipBtnText, hasVotedSkip && styles.skipBtnTextActive]}>
                  {hasVotedSkip ? "Voted" : "Vote Skip"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Synchronized Queue Shelf */}
            <View style={styles.queueSection}>
              <View style={styles.queueHeaderRow}>
                <Text style={styles.queueHeading}>Up Next in Room ({queueItems.length})</Text>
                <TouchableOpacity style={styles.suggestBtn} onPress={() => setIsSuggestOpen(true)} activeOpacity={0.8}>
                  <Ionicons name="add" size={15} color="#1DB954" style={{ marginRight: 4 }} />
                  <Text style={styles.suggestBtnText}>Suggest Song</Text>
                </TouchableOpacity>
              </View>

              {queueItems.length === 0 ? (
                <View style={styles.emptyQueueCard}>
                  <Text style={styles.emptyQueueText}>Party queue is empty. Anyone can suggest a song!</Text>
                </View>
              ) : (
                queueItems.map((item) => {
                  const hasVotedItem = !!item.votes?.[myUid];
                  return (
                    <View key={item.id} style={styles.queueRow}>
                      <Image source={{ uri: item.track?.image || item.track?.thumbnail }} style={styles.queueThumb} />
                      <View style={styles.queueMeta}>
                        <Text style={styles.queueSongTitle} numberOfLines={1}>
                          {item.track?.title}
                        </Text>
                        <Text style={styles.queueSongSub} numberOfLines={1}>
                          {item.track?.artist} • Suggested by {item.suggestedByName}
                        </Text>
                      </View>

                      <View style={styles.queueActionsRow}>
                        {isHost && (
                          <TouchableOpacity
                            style={styles.hostPlayQueueBtn}
                            onPress={() => playPartyQueueSong(partyId, item.id)}
                            activeOpacity={0.8}
                            accessibilityLabel="Play this track now"
                          >
                            <Ionicons name="play" size={12} color="#000000" />
                            <Text style={styles.hostPlayQueueText}>Play</Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={[styles.upvoteBtn, hasVotedItem && styles.upvoteBtnActive]}
                          onPress={() => votePartyQueueSong(partyId, item.id, myUid)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="caret-up" size={14} color={hasVotedItem ? "#1DB954" : "#888888"} />
                          <Text style={[styles.upvoteCount, hasVotedItem && styles.upvoteCountActive]}>
                            {item.voteCount || 1}
                          </Text>
                        </TouchableOpacity>

                        {(isHost || item.suggestedBy === myUid) && (
                          <TouchableOpacity
                            style={styles.removeQueueBtn}
                            onPress={() => removePartyQueueSong(partyId, item.id)}
                            activeOpacity={0.8}
                            accessibilityLabel="Remove from queue"
                          >
                            <Ionicons name="close" size={13} color="#888888" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>

          {/* Floating Reaction Bar (Strictly No Chat) */}
          <View style={styles.reactionBar}>
            <Text style={styles.reactionLabel}>LIVE VIBES</Text>
            <View style={styles.reactionButtonsRow}>
              {REACTION_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.emojiBtn}
                  onPress={() => handleReaction(emoji)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Suggest Song Sheet Modal */}
          {isSuggestOpen && (
            <View style={styles.suggestSheet}>
              <View style={styles.suggestHeader}>
                <Text style={styles.suggestTitle}>Suggest a Song</Text>
                <TouchableOpacity onPress={() => setIsSuggestOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={20} color="#AAAAAA" />
                </TouchableOpacity>
              </View>

              <View style={styles.searchBarWrap}>
                <Ionicons name="search" size={16} color="#888888" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={handleSearchSongs}
                  placeholder="Search song title or artist..."
                  placeholderTextColor="#666666"
                  autoFocus
                />
                {isSearching && <ActivityIndicator size="small" color="#1DB954" />}
              </View>

              <ScrollView style={styles.suggestResultsList} keyboardShouldPersistTaps="handled">
                {searchResults.map((item) => (
                  <TouchableOpacity
                    key={item.videoId || item.id}
                    style={styles.suggestResultRow}
                    onPress={() => handleAddTrackToQueue(item)}
                    activeOpacity={0.8}
                  >
                    <Image source={{ uri: item.image || item.thumbnail }} style={styles.suggestResultThumb} />
                    <View style={styles.suggestResultMeta}>
                      <Text style={styles.suggestResultTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.suggestResultArtist} numberOfLines={1}>
                        {item.artist}
                      </Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={22} color="#1DB954" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "flex-end",
  },
  container: {
    width: "100%",
    height: "92%",
    maxHeight: 760,
    backgroundColor: "#101012",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  leaveBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleWrap: {
    alignItems: "center",
    flex: 1,
    marginHorizontal: 10,
  },
  partyBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  livePulsingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1DB954",
  },
  partyBadgeText: {
    fontFamily: fonts.bold || "System",
    fontSize: 10,
    color: "#1DB954",
    letterSpacing: 1,
  },
  partyName: {
    fontFamily: fonts.bold || "System",
    fontSize: 15,
    color: "#FFFFFF",
    marginTop: 2,
  },
  headerRightBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 77, 77, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 77, 77, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  shareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 110,
  },
  membersStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 16,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  membersCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(29, 185, 84, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginRight: 12,
  },
  membersCountText: {
    fontFamily: fonts.semiBold || "System",
    fontSize: 11.5,
    color: "#1DB954",
  },
  avatarsRow: {
    gap: 8,
    alignItems: "center",
  },
  memberAvatarWrap: {
    position: "relative",
  },
  memberAvatarImg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#222222",
  },
  memberAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#333333",
    alignItems: "center",
    justifyContent: "center",
  },
  memberAvatarText: {
    fontFamily: fonts.bold || "System",
    fontSize: 12,
    color: "#FFFFFF",
  },
  hostCrownBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#FFD700",
    alignItems: "center",
    justifyContent: "center",
  },
  nowPlayingCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 20,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  albumArt: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: "#222222",
  },
  trackDetails: {
    flex: 1,
    marginLeft: 14,
    marginRight: 10,
  },
  trackTitle: {
    fontFamily: fonts.bold || "System",
    fontSize: 15,
    color: "#FFFFFF",
  },
  trackArtist: {
    fontFamily: fonts.regular || "System",
    fontSize: 12.5,
    color: "#888888",
    marginTop: 2,
  },
  syncBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  syncBadgeText: {
    fontFamily: fonts.medium || "System",
    fontSize: 11,
  },
  hostPlayBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#1DB954",
    alignItems: "center",
    justifyContent: "center",
  },
  noTrackWrap: {
    alignItems: "center",
    paddingVertical: 32,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderRadius: 16,
    marginBottom: 20,
  },
  noTrackTitle: {
    fontFamily: fonts.semiBold || "System",
    fontSize: 14,
    color: "#AAAAAA",
    marginTop: 8,
  },
  noTrackSub: {
    fontFamily: fonts.regular || "System",
    fontSize: 12,
    color: "#666666",
    marginTop: 2,
  },
  skipRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
  },
  skipInfo: {
    flex: 1,
  },
  skipTitle: {
    fontFamily: fonts.semiBold || "System",
    fontSize: 13,
    color: "#FFFFFF",
  },
  skipSub: {
    fontFamily: fonts.regular || "System",
    fontSize: 11.5,
    color: "#888888",
    marginTop: 1,
  },
  skipBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  skipBtnActive: {
    backgroundColor: "#FFFFFF",
  },
  skipBtnText: {
    fontFamily: fonts.semiBold || "System",
    fontSize: 12,
    color: "#FFFFFF",
  },
  skipBtnTextActive: {
    color: "#000000",
  },
  queueSection: {
    marginTop: 4,
  },
  queueHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  queueHeading: {
    fontFamily: fonts.bold || "System",
    fontSize: 14,
    color: "#FFFFFF",
  },
  suggestBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "rgba(29, 185, 84, 0.1)",
  },
  suggestBtnText: {
    fontFamily: fonts.semiBold || "System",
    fontSize: 12,
    color: "#1DB954",
  },
  emptyQueueCard: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  emptyQueueText: {
    fontFamily: fonts.regular || "System",
    fontSize: 12,
    color: "#666666",
  },
  queueRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  queueThumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: "#222222",
  },
  queueMeta: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  queueSongTitle: {
    fontFamily: fonts.semiBold || "System",
    fontSize: 13,
    color: "#FFFFFF",
  },
  queueSongSub: {
    fontFamily: fonts.regular || "System",
    fontSize: 11,
    color: "#777777",
    marginTop: 2,
  },
  queueActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  hostPlayQueueBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1DB954",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  hostPlayQueueText: {
    fontFamily: fonts.bold || "System",
    fontSize: 11,
    color: "#000000",
  },
  removeQueueBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  upvoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  upvoteBtnActive: {
    backgroundColor: "rgba(29, 185, 84, 0.12)",
  },
  upvoteCount: {
    fontFamily: fonts.semiBold || "System",
    fontSize: 12,
    color: "#888888",
  },
  upvoteCountActive: {
    color: "#1DB954",
  },
  reactionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#141416",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
  },
  reactionLabel: {
    fontFamily: fonts.bold || "System",
    fontSize: 9.5,
    color: "#777777",
    letterSpacing: 1,
    marginBottom: 8,
  },
  reactionButtonsRow: {
    flexDirection: "row",
    gap: 12,
  },
  emojiBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  emojiText: {
    fontSize: 22,
  },
  suggestSheet: {
    position: "absolute",
    inset: 0,
    backgroundColor: "#121214",
    padding: 20,
    zIndex: 99,
  },
  suggestHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  suggestTitle: {
    fontFamily: fonts.bold || "System",
    fontSize: 17,
    color: "#FFFFFF",
  },
  searchBarWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.medium || "System",
    fontSize: 14,
    color: "#FFFFFF",
  },
  suggestResultsList: {
    flex: 1,
  },
  suggestResultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  suggestResultThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#222222",
  },
  suggestResultMeta: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  suggestResultTitle: {
    fontFamily: fonts.semiBold || "System",
    fontSize: 13.5,
    color: "#FFFFFF",
  },
  suggestResultArtist: {
    fontFamily: fonts.regular || "System",
    fontSize: 12,
    color: "#888888",
    marginTop: 2,
  },
});
