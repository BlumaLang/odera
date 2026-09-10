import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Image,
  Modal,
  StatusBar,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import SongCard from "./SongCard";
import AddToPlaylistModal from "./AddToPlaylistModal";
import CreatePlaylistModal from "./CreatePlaylistModal";
import ImportPlaylistLinkModal from "./ImportPlaylistLinkModal";
import { registerBackAction } from "../services/navigation";
import { colors, fonts } from "../theme/colors";
import { api } from "../api/client";
import { useAudioPlayback, fisherYatesShuffle } from "../context/AudioContext";
import { useResponsive } from "../context/ResponsiveContext";
import { useUser, getDeterministicAvatarColor } from "../context/UserContext";

function getTrackDurationSeconds(t) {
  if (!t) return 0;
  if (typeof t.duration_seconds === "number" && t.duration_seconds > 0) {
    return t.duration_seconds;
  }
  if (typeof t.duration === "number" && t.duration > 0) {
    return t.duration;
  }
  if (typeof t.duration === "string") {
    const parts = t.duration.trim().split(":").map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

function formatPlaylistDuration(seconds) {
  if (!seconds || seconds <= 0) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
  }
  return `${Math.max(1, minutes)} min`;
}

function formatTotalPlaylistDuration(tracks) {
  if (!Array.isArray(tracks) || tracks.length === 0) return "";
  const totalSeconds = tracks.reduce((acc, t) => acc + getTrackDurationSeconds(t), 0);
  return formatPlaylistDuration(totalSeconds);
}

function UserAvatar({ user, size = 38, fontSize = 14, style }) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [user?.avatar, user?.photoURL, user?.avatarUrl]);

  const name = user?.username || user?.name || user?.displayName || "Friend";
  const avatar = user?.avatar;
  const initial = (name[0] || "F").toUpperCase();

  const bgColor =
    user?.avatarColor && user.avatarColor !== "#1DB954"
      ? user.avatarColor
      : getDeterministicAvatarColor(user?.uid || name);

  // Memoji local asset
  if (avatar && avatar.startsWith("memoji_")) {
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
    const src = memojiMap[avatar];
    if (src) {
      return (
        <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: "hidden" }, style]}>
          <Image source={src} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        </View>
      );
    }
  }

  // HTTP URL (not google)
  const candidateUri =
    (avatar && typeof avatar === "string" && avatar.startsWith("http") && !avatar.includes("googleusercontent.com"))
      ? avatar
      : (user?.photoURL && typeof user.photoURL === "string" && user.photoURL.startsWith("http") && !user.photoURL.includes("googleusercontent.com"))
      ? user.photoURL
      : (user?.avatarUrl && typeof user.avatarUrl === "string" && user.avatarUrl.startsWith("http") && !user.avatarUrl.includes("googleusercontent.com"))
      ? user.avatarUrl
      : null;

  if (candidateUri && !imgError) {
    return (
      <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor, overflow: "hidden" }, style]}>
        <Image source={{ uri: candidateUri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" onError={() => setImgError(true)} />
      </View>
    );
  }

  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor, alignItems: "center", justifyContent: "center" }, style]}>
      <Text style={{ fontFamily: fonts.bold, fontSize, color: "#FFFFFF" }}>{initial}</Text>
    </View>
  );
}

export default function PlaylistModal({
  visible,
  onClose,
  playlist,
  onDeletePlaylist,
  onTrackRemoved,
  onPlaylistUpdated,
}) {
  const { isDesktop, isTablet } = useResponsive();
  const { currentTrack, playTrack, setShuffle } = useAudioPlayback();
  const {
    currentUser,
    userProfile,
    friends,
    createCollabPlaylist,
    joinCollabPlaylist,
    leaveCollabPlaylist,
    addTracksToPlaylist,
    addTracksToCollabPlaylist,
    removeTrackFromCollabPlaylist,
    removeCollaboratorFromCollabPlaylist,
    deleteCollabPlaylist,
    sendCollabInvite,
    renamePlaylist,
    setPlaylists,
  } = useUser() || {};

  const [playlistData, setPlaylistData] = useState(playlist || null);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCollabDeleteModal, setShowCollabDeleteModal] = useState(false);
  const [showCollabModal, setShowCollabModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [invitingUids, setInvitingUids] = useState(new Set());
  const [enablingCollab, setEnablingCollab] = useState(false);
  const playlistListRef = useRef(null);
  const playlistScrollOffsetRef = useRef(0);

  const openCollabModal = useCallback(() => {
    setShowCollabModal(true);
  }, []);

  const closeCollabModal = useCallback(() => {
    setShowCollabModal(false);
    // The web modal can return FlatList to its measured end. Restore the
    // listener's last position after the closing transition is complete.
    setTimeout(() => {
      playlistListRef.current?.scrollToOffset({
        offset: playlistScrollOffsetRef.current,
        animated: false,
      });
    }, 350);
  }, []);

  // Android hardware back button handler stack
  useEffect(() => {
    if (showRenameModal) {
      return registerBackAction(() => {
        setShowRenameModal(false);
        return true;
      });
    }
  }, [showRenameModal]);

  useEffect(() => {
    if (showDeleteModal) {
      return registerBackAction(() => {
        setShowDeleteModal(false);
        return true;
      });
    }
  }, [showDeleteModal]);

  useEffect(() => {
    if (showCollabDeleteModal) {
      return registerBackAction(() => {
        setShowCollabDeleteModal(false);
        return true;
      });
    }
  }, [showCollabDeleteModal]);

  useEffect(() => {
    if (showCollabModal) {
      return registerBackAction(() => {
        closeCollabModal();
        return true;
      });
    }
  }, [showCollabModal, closeCollabModal]);

  useEffect(() => {
    if (showImportModal) {
      return registerBackAction(() => {
        setShowImportModal(false);
        return true;
      });
    }
  }, [showImportModal]);

  useEffect(() => {
    if (addToPlaylistTrack) {
      return registerBackAction(() => {
        setAddToPlaylistTrack(null);
        return true;
      });
    }
  }, [addToPlaylistTrack]);

  useEffect(() => {
    if (visible && onClose) {
      return registerBackAction(() => {
        onClose();
        return true;
      });
    }
  }, [visible, onClose]);

  // Sync state with playlist prop and refresh details from backend
  useEffect(() => {
    if (!visible || !playlist?.id) return;

    setPlaylistData(playlist);
    let isMounted = true;
    setIsLoadingTracks(true);

    api
      .getPlaylistDetails(playlist.id)
      .then((res) => {
        if (isMounted && res?.playlist) {
          setPlaylistData((prev) => ({
            ...prev,
            ...res.playlist,
            // retain isCollab flag or collaborators if already present
            isCollab: prev?.isCollab || res.playlist?.isCollab || Boolean(res.playlist?.collaborators),
            collaborators: res.playlist?.collaborators || prev?.collaborators,
          }));
          if (onPlaylistUpdated) {
            onPlaylistUpdated(res.playlist);
          }
        }
      })
      .catch((err) => {
        console.warn("Failed to load playlist details in modal:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingTracks(false);
      });

    return () => {
      isMounted = false;
    };
  }, [visible, playlist?.id]);

  const isCollab = Boolean(playlistData?.isCollab || playlistData?.collaborators);
  const isBlend = Boolean(playlistData?.isBlend || playlistData?.type === "blend" || String(playlistData?.name || "").startsWith("Blend:"));
  const collaboratorsObj = playlistData?.collaborators || {};
  const collaboratorList = Object.values(collaboratorsObj);
  const tracks = playlistData?.tracks || [];
  const trackCount = tracks.length || playlistData?.track_count || 0;
  const totalDurationStr = useMemo(() => {
    return formatTotalPlaylistDuration(tracks);
  }, [tracks]);

  const friendsMap = useMemo(() => {
    const map = {};
    if (Array.isArray(friends)) {
      friends.forEach((f) => {
        if (f?.uid) map[f.uid] = f;
      });
    }
    if (currentUser?.uid) {
      map[currentUser.uid] = {
        uid: currentUser.uid,
        username: userProfile?.username || currentUser.displayName || "You",
        name: userProfile?.username || currentUser.displayName || "You",
        avatar: userProfile?.avatar || currentUser.photoURL,
        avatarColor: userProfile?.avatarColor || colors.primary,
        photoURL: currentUser.photoURL,
        avatarUrl: userProfile?.avatarUrl,
      };
    }
    return map;
  }, [friends, currentUser, userProfile]);

  const getCollabUser = useCallback(
    (c) => {
      const match = c?.uid ? friendsMap[c.uid] : null;
      const uname = c?.name || c?.username || match?.username || match?.name || "Listener";
      const rawAvatar = c?.avatar || match?.avatar || match?.photoURL || match?.avatarUrl || "memoji_0";
      const avatar =
        typeof rawAvatar === "string" && !rawAvatar.includes("googleusercontent.com")
          ? rawAvatar
          : "memoji_0";

      const rawColor = c?.avatarColor || match?.avatarColor;
      const color =
        rawColor && rawColor !== "#1DB954"
          ? rawColor
          : getDeterministicAvatarColor(c?.uid || uname);

      return {
        uid: c?.uid,
        username: uname,
        name: uname,
        avatar,
        avatarColor: color,
        photoURL: match?.photoURL,
        avatarUrl: match?.avatarUrl,
        role: c?.role,
      };
    },
    [friendsMap]
  );

  const handlePlayAll = useCallback(
    (startIndex = 0) => {
      const tracks = playlistData?.tracks || [];
      if (tracks.length === 0) return;
      const formatted = tracks.map((t) => ({
        ...t,
        videoId: t.video_id || t.videoId,
      }));
      playTrack(formatted[startIndex], formatted, startIndex);
    },
    [playlistData?.tracks, playTrack]
  );

  const handleShuffle = useCallback(() => {
    const tracks = playlistData?.tracks || [];
    if (tracks.length === 0) return;
    const formatted = tracks.map((t) => ({
      ...t,
      videoId: t.video_id || t.videoId,
    }));
    const shuffled = fisherYatesShuffle(formatted);
    if (setShuffle) setShuffle(true);
    playTrack(shuffled[0], shuffled, 0);
  }, [playlistData?.tracks, playTrack, setShuffle]);

  const doDelete = useCallback(async () => {
    const targetId = playlistData?.collabId || playlistData?.id;
    if (!targetId) return;
    try {
      if (isCollab && deleteCollabPlaylist) {
        await deleteCollabPlaylist(targetId);
      } else {
        await api.deletePlaylist(targetId);
      }
      if (onDeletePlaylist) {
        onDeletePlaylist(targetId);
      }
      setShowCollabModal(false);
      onClose();
    } catch (err) {
      console.warn("Failed to delete playlist:", err);
    }
  }, [playlistData?.id, playlistData?.collabId, isCollab, deleteCollabPlaylist, onDeletePlaylist, onClose]);

  const handleDelete = useCallback(() => {
    setShowDeleteModal(true);
  }, []);

  const handleRemoveTrack = useCallback(
    async (videoId) => {
      if (!playlistData?.id) return;
      try {
        if (isCollab && removeTrackFromCollabPlaylist) {
          await removeTrackFromCollabPlaylist(playlistData.id, videoId);
        } else {
          await api.removeTrackFromPlaylist(playlistData.id, videoId);
        }
        const updatedTracks = (playlistData.tracks || []).filter(
          (t) => (t.video_id || t.videoId) !== videoId
        );
        const updated = {
          ...playlistData,
          tracks: updatedTracks,
          track_count: updatedTracks.length,
        };
        setPlaylistData(updated);

        if (onTrackRemoved) {
          onTrackRemoved(playlistData.id, videoId);
        }
        if (onPlaylistUpdated) {
          onPlaylistUpdated(updated);
        }
      } catch (err) {
        console.warn("Failed to remove track from playlist:", err);
      }
    },
    [playlistData, isCollab, removeTrackFromCollabPlaylist, onTrackRemoved, onPlaylistUpdated]
  );

  const handleRenamePlaylist = useCallback(
    async (newName, newCover = "") => {
      const trimmed = (newName || "").trim();
      const pId = playlistData?.id || playlistData?.collabId;
      if (!pId || !trimmed) return;
      try {
        const coverUpdate = newCover ? { cover_url: newCover, preview_artwork: newCover } : {};
        const updated = {
          ...playlistData,
          name: trimmed,
          ...coverUpdate,
        };
        setPlaylistData(updated);

        if (renamePlaylist) {
          await renamePlaylist(pId, trimmed, newCover);
        } else {
          await api.updatePlaylist(pId, { name: trimmed, cover_url: newCover });
        }

        if (onPlaylistUpdated) {
          onPlaylistUpdated(updated);
        }
      } catch (err) {
        console.warn("Failed to rename playlist:", err);
      }
    },
    [playlistData, renamePlaylist, onPlaylistUpdated]
  );

  const handleImportSuccess = useCallback(
    async (matchedTracks) => {
      if (!matchedTracks || matchedTracks.length === 0 || !playlistData?.id) return;

      const currentTracks = Array.isArray(playlistData.tracks) ? [...playlistData.tracks] : [];
      const existingIds = new Set(currentTracks.map((t) => t.videoId || t.video_id || t.id));
      const newlyAdded = [];

      for (const t of matchedTracks) {
        const vid = t.videoId || t.video_id || t.id;
        if (vid && !existingIds.has(vid)) {
          existingIds.add(vid);
          const item = {
            id: vid,
            videoId: vid,
            video_id: vid,
            title: t.title,
            artist: t.artist,
            album: t.album || "",
            artwork_url: t.artwork_url || t.thumbnail || "",
            thumbnail: t.thumbnail || t.artwork_url || "",
            duration: t.duration || "",
            duration_seconds: t.duration_seconds || 0,
            stream_url: t.stream_url || "",
            addedAt: Date.now(),
          };
          currentTracks.push(item);
          newlyAdded.push(item);
        }
      }

      if (newlyAdded.length === 0) return;

      const firstArt = currentTracks[0]?.artwork_url || currentTracks[0]?.thumbnail || "";
      const cover = playlistData.cover_url || playlistData.preview_artwork || firstArt || "";

      const updated = {
        ...playlistData,
        tracks: currentTracks,
        track_count: currentTracks.length,
        cover_url: cover,
        preview_artwork: cover,
      };

      setPlaylistData(updated);

      try {
        if (isCollab && addTracksToCollabPlaylist) {
          await addTracksToCollabPlaylist(playlistData.id, newlyAdded);
        } else if (addTracksToPlaylist) {
          await addTracksToPlaylist(playlistData.id, newlyAdded);
        }
      } catch (err) {
        console.warn("Error saving imported tracks to playlist:", err);
      }

      if (onPlaylistUpdated) {
        onPlaylistUpdated(updated);
      }
    },
    [playlistData, isCollab, addTracksToCollabPlaylist, addTracksToPlaylist, onPlaylistUpdated]
  );

  // Copy Collaboration Share Link
  const handleCopyCollabLink = async () => {
    const link = `https://staytup.odireca.com/playlist?collab=${playlistData?.collabId || playlistData?.id}`;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2200);
      }
    } catch (_) {}
  };

  // Turn regular playlist into a collaborative playlist
  const handleEnableCollaboration = async () => {
    setEnablingCollab(true);
    try {
      if (createCollabPlaylist) {
        const res = await createCollabPlaylist({
          id: playlistData.id,
          existingId: playlistData.id,
          name: playlistData.name,
          description: playlistData.description || "",
          cover_url: artwork || "",
          tracks: playlistData.tracks || [],
        });
        if (res && res.success && res.playlist) {
          const updated = {
            ...playlistData,
            ...res.playlist,
            isCollab: true,
          };
          setPlaylistData(updated);
          // Remove old playlist from personal playlists list if setPlaylists is available
          if (setPlaylists && playlistData.id) {
            setPlaylists((prev) => (prev || []).filter((p) => p.id !== playlistData.id));
          }
          if (onPlaylistUpdated) onPlaylistUpdated(updated);
        }
      }
    } catch (err) {
      console.warn("Failed to enable collaboration:", err);
    } finally {
      setEnablingCollab(false);
    }
  };

  // Invite a friend to collaborate
  const handleInviteFriend = async (friend) => {
    if (!friend?.uid || invitingUids.has(friend.uid)) return;
    setInvitingUids((prev) => new Set([...prev, friend.uid]));
    try {
      const targetId = playlistData?.collabId || playlistData?.id;
      if (sendCollabInvite) {
        await sendCollabInvite(friend.uid, {
          collabId: targetId,
          playlistId: targetId,
          name: playlistData?.name || "Collab Playlist",
          cover_url: playlistData?.cover_url || playlistData?.preview_artwork || "",
          tracks: playlistData?.tracks || [],
          playlist: playlistData,
        });
      }
      // Optimistically add to collaborators
      const newCollabs = {
        ...collaboratorsObj,
        [friend.uid]: {
          uid: friend.uid,
          name: friend.username || friend.displayName || "Friend",
          avatar: friend.avatar || "memoji_0",
          avatarColor: friend.avatarColor || colors.primary,
          role: "Collaborator",
        },
      };
      setPlaylistData((prev) => ({
        ...prev,
        isCollab: true,
        collaborators: newCollabs,
      }));
    } catch (err) {
      console.warn("handleInviteFriend error:", err);
    } finally {
      setInvitingUids((prev) => {
        const next = new Set(prev);
        next.delete(friend.uid);
        return next;
      });
    }
  };

  // Remove a collaborator from this playlist
  const handleRemoveCollaborator = async (targetUid) => {
    const targetId = playlistData?.collabId || playlistData?.id;
    if (!targetId || !targetUid) return;
    try {
      if (removeCollaboratorFromCollabPlaylist) {
        await removeCollaboratorFromCollabPlaylist(targetId, targetUid);
      }
      setPlaylistData((prev) => {
        if (!prev) return null;
        const nextCollabs = { ...(prev.collaborators || {}) };
        delete nextCollabs[targetUid];
        const updated = { ...prev, collaborators: nextCollabs };
        if (onPlaylistUpdated) onPlaylistUpdated(updated);
        return updated;
      });
    } catch (err) {
      console.warn("handleRemoveCollaborator error:", err);
    }
  };

  // Stop collaboration anytime / delete collab playlist directly
  const handleStopCollab = async () => {
    const targetId = playlistData?.collabId || playlistData?.id;
    if (!targetId) return;
    try {
      if (deleteCollabPlaylist) {
        await deleteCollabPlaylist(targetId);
      }
      setShowCollabModal(false);
      if (onDeletePlaylist) {
        onDeletePlaylist(targetId);
      }
      onClose();
    } catch (err) {
      console.warn("handleStopCollab error:", err);
    }
  };

  if (!visible && !playlistData) return null;

  const firstTrackArtwork = tracks[0]?.artwork_url || tracks[0]?.thumbnail || "";
  const artwork =
    playlistData?.cover_url ||
    playlistData?.preview_artwork ||
    firstTrackArtwork ||
    null;

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <View style={styles.container}>
        <StatusBar translucent={true} backgroundColor="transparent" barStyle="light-content" />

        {/* Top Header Bar */}
        <View style={[styles.topBar, (isDesktop || isTablet) && styles.desktopTopBar]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Back to Library"
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.topBarTitleWrap}>
            <Text style={styles.topBarTitle} numberOfLines={1}>
              {playlistData?.name || "Playlist"}
            </Text>
          </View>

          <View style={styles.topBarActions}>
            <TouchableOpacity
              style={styles.deleteHeaderBtn}
              onPress={handleDelete}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Playlist Options"
            >
              <Ionicons name="ellipsis-horizontal" size={22} color="#A7A7A7" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Main Content Area */}
        <View style={[styles.contentWrap, (isDesktop || isTablet) && styles.desktopContentWrap]}>
          <FlatList
            ref={playlistListRef}
            data={tracks}
            keyExtractor={(item, index) => `${item.video_id || item.videoId}_${index}`}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onScroll={(event) => {
              if (!showCollabModal) {
                playlistScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
              }
            }}
            scrollEventThrottle={16}
            ListHeaderComponent={
              <View style={styles.headerContainer}>
                {/* Hero Card Section */}
                <View
                  style={[
                    styles.heroCard,
                    (isDesktop || isTablet) && styles.heroCardDesktop,
                  ]}
                >
                  {artwork ? (
                    <Image source={{ uri: artwork }} style={styles.heroArtwork} />
                  ) : (
                    <View style={[styles.heroArtwork, styles.heroArtworkFallback]}>
                      <Ionicons name="musical-notes" size={54} color={colors.primary} />
                    </View>
                  )}

                  <View style={styles.heroInfo}>
                    <View style={styles.badgeRow}>
                      <View style={styles.playlistBadge}>
                        <Text style={styles.playlistBadgeText}>PLAYLIST</Text>
                      </View>
                      {isCollab && !isBlend && (
                        <View style={styles.collabBadge}>
                          <Ionicons name="people" size={11} color="#1DB954" style={{ marginRight: 4 }} />
                          <Text style={styles.collabBadgeText}>COLLABORATIVE</Text>
                        </View>
                      )}
                      {isBlend && (
                        <View style={[styles.collabBadge, { borderColor: "rgba(139, 92, 246, 0.4)", backgroundColor: "rgba(139, 92, 246, 0.12)" }]}>
                          <Ionicons name="flash" size={11} color="#8B5CF6" style={{ marginRight: 4 }} />
                          <Text style={[styles.collabBadgeText, { color: "#8B5CF6" }]}>BLEND</Text>
                        </View>
                      )}
                    </View>

                    <TouchableOpacity
                      style={styles.heroTitleRow}
                      onPress={() => setShowRenameModal(true)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Rename Playlist"
                    >
                      <Text style={styles.heroTitle} numberOfLines={2}>
                        {playlistData?.name}
                      </Text>
                      <Ionicons
                        name="pencil-outline"
                        size={16}
                        color="rgba(255, 255, 255, 0.4)"
                        style={{ marginLeft: 8 }}
                      />
                    </TouchableOpacity>

                    {playlistData?.description ? (
                      <Text style={styles.heroDesc} numberOfLines={3}>
                        {playlistData.description}
                      </Text>
                    ) : null}

                    {/* Collaborator Avatars (if any) */}
                    {collaboratorList.length > 0 && (
                      <TouchableOpacity
                        style={styles.collabAvatarsRow}
                        onPress={openCollabModal}
                        activeOpacity={0.8}
                      >
                        <View style={styles.overlappingAvatars}>
                          {collaboratorList.slice(0, 4).map((c, i) => (
                            <UserAvatar
                              key={c.uid || i}
                              user={getCollabUser(c)}
                              size={24}
                              fontSize={10}
                              style={{
                                marginLeft: i > 0 ? -8 : 0,
                                borderWidth: 1.5,
                                borderColor: "#000000",
                              }}
                            />
                          ))}
                          {collaboratorList.length > 4 && (
                            <View style={[styles.avatarCircleWrap, styles.avatarMoreWrap]}>
                              <Text style={styles.avatarMoreText}>
                                +{collaboratorList.length - 4}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.collabCountText}>
                          {collaboratorList.length}{" "}
                          {isBlend
                            ? (collaboratorList.length === 1 ? "participant" : "participants")
                            : (collaboratorList.length === 1 ? "collaborator" : "collaborators")}
                        </Text>
                      </TouchableOpacity>
                    )}

                    <Text style={styles.heroMeta}>
                      {trackCount} {trackCount === 1 ? "track" : "tracks"}
                      {totalDurationStr ? ` • ${totalDurationStr}` : ""} • Staytup Music
                    </Text>
                  </View>
                </View>

                {/* Playlist Action Bar: Play All, Shuffle, Collab, Edit */}
                <View style={styles.actionsBar}>
                  <TouchableOpacity
                    style={[
                      styles.playAllButton,
                      tracks.length === 0 && styles.disabledBtn,
                    ]}
                    disabled={tracks.length === 0}
                    onPress={() => handlePlayAll(0)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="play" size={20} color="#000000" style={{ marginRight: 6 }} />
                    <Text style={styles.playAllText}>Play All</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.shuffleButton,
                      tracks.length === 0 && styles.disabledBtn,
                    ]}
                    disabled={tracks.length === 0}
                    onPress={handleShuffle}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="shuffle" size={22} color={colors.text} />
                  </TouchableOpacity>

                  {/* Collaborate Icon Button */}
                  <TouchableOpacity
                    style={[
                      styles.collabActionButton,
                      isCollab && styles.collabActionButtonActive,
                    ]}
                    onPress={openCollabModal}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Collaborate"
                  >
                    <Ionicons
                      name="people-outline"
                      size={20}
                      color={isCollab ? colors.primary : colors.text}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.renameActionButton}
                    onPress={() => setShowRenameModal(true)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Edit Playlist"
                  >
                    <Ionicons name="pencil-outline" size={20} color={colors.text} />
                  </TouchableOpacity>

                  {/* Import Songs from Link Button */}
                  <TouchableOpacity
                    style={styles.importActionButton}
                    onPress={() => setShowImportModal(true)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Import from link"
                  >
                    <Ionicons name="link-outline" size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>

                {/* Tracks Header */}
                <View style={styles.tracksHeaderRow}>
                  <Text style={styles.tracksHeaderText}>Tracks</Text>
                  {isLoadingTracks && (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 10 }} />
                  )}
                </View>
              </View>
            }
            renderItem={({ item, index }) => (
              <View style={styles.trackRowWrapper}>
                <View style={{ flex: 1 }}>
                  <SongCard
                    track={{
                      ...item,
                      videoId: item.video_id || item.videoId,
                    }}
                    layout="row"
                    showRank={false}
                    showPlayButton={false}
                    showDuration={false}
                    isActive={currentTrack?.videoId === (item.video_id || item.videoId)}
                    onPress={() => handlePlayAll(index)}
                    onAddToPlaylist={(t) => setAddToPlaylistTrack(t)}
                  />
                </View>

                <TouchableOpacity
                  style={styles.removeTrackBtn}
                  onPress={() => handleRemoveTrack(item.video_id || item.videoId)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Remove track from playlist"
                >
                  <Ionicons name="remove-circle-outline" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              isLoadingTracks ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.loadingText}>Loading playlist songs...</Text>
                </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="musical-notes-outline" size={48} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>This playlist is empty</Text>
                  <Text style={styles.emptySub}>
                    Add songs from search or import all songs from a playlist link.
                  </Text>
                  <TouchableOpacity
                    style={styles.emptyImportBtn}
                    onPress={() => setShowImportModal(true)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Import from link"
                  >
                    <Ionicons name="link-outline" size={16} color="#000000" style={{ marginRight: 6 }} />
                    <Text style={styles.emptyImportBtnText}>Import from link</Text>
                  </TouchableOpacity>
                </View>
              )
            }
            ListFooterComponent={
              tracks.length > 0 ? (
                <View style={styles.endOfPlaylistFooter}>
                  <Text style={styles.endOfPlaylistText}>You've reached the end</Text>
                  <View style={{ height: isDesktop || isTablet ? 40 : 130 }} />
                </View>
              ) : (
                <View style={{ height: isDesktop || isTablet ? 40 : 130 }} />
              )
            }
          />
        </View>

        {/* Add to Playlist Modal */}
        <AddToPlaylistModal
          visible={!!addToPlaylistTrack}
          onClose={() => setAddToPlaylistTrack(null)}
          track={addToPlaylistTrack}
        />

        {/* Rename / Edit Playlist Modal */}
        <CreatePlaylistModal
          visible={showRenameModal}
          onClose={() => setShowRenameModal(false)}
          onSubmit={handleRenamePlaylist}
          initialName={playlistData?.name}
          initialCover={playlistData?.cover_url || playlistData?.preview_artwork || ""}
          mode="edit"
        />

        {/* Import Playlist from Link Modal */}
        <ImportPlaylistLinkModal
          visible={showImportModal}
          onClose={() => setShowImportModal(false)}
          onSuccess={handleImportSuccess}
          playlistName={playlistData?.name || "Playlist"}
        />

        {/* Delete Playlist Confirmation Modal */}
        {/* ═══════════ DELETE PLAYLIST BOTTOM SHEET MODAL ═══════════ */}
        <Modal
          visible={showDeleteModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowDeleteModal(false)}
        >
          <View style={styles.deleteModalBackdrop}>
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={() => setShowDeleteModal(false)}
            />
            <View style={styles.deleteModalCard} onStartShouldSetResponder={() => true}>
              <View style={styles.dragHandle} />
              <View style={styles.deleteModalIconWrap}>
                <Ionicons name="trash-outline" size={28} color={colors.error} />
              </View>
              <Text style={styles.deleteModalTitle}>Delete Playlist?</Text>
              <Text style={styles.deleteModalDesc}>
                Are you sure you want to delete "{playlistData?.name}"? This action cannot be undone.
              </Text>
              <View style={styles.deleteModalActions}>
                <TouchableOpacity
                  style={styles.deleteModalCancelBtn}
                  onPress={() => setShowDeleteModal(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.deleteModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteModalConfirmBtn}
                  onPress={() => {
                    setShowDeleteModal(false);
                    doDelete();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.deleteModalConfirmText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

            {/* ═══════════ COLLABORATION FULL SCREEN MODAL ═══════════ */}
        <Modal
          visible={showCollabModal}
          transparent={false}
          animationType="slide"
          onRequestClose={closeCollabModal}
          statusBarTranslucent={true}
        >
          <View style={styles.collabFullScreenContainer}>
            <StatusBar translucent={true} backgroundColor="#000000" barStyle="light-content" />

            <View style={[styles.collabHeaderBar, (isDesktop || isTablet) && styles.collabHeaderDesktop]}>
              <TouchableOpacity
                style={styles.collabBackBtn}
                onPress={closeCollabModal}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                activeOpacity={0.7}
                accessibilityLabel="Back"
              >
                <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.collabHeaderTitle} numberOfLines={1}>
                {isBlend ? "Blend Participants" : "Collaborate"}
              </Text>
              {isCollab ? (
                <TouchableOpacity
                  style={styles.collabBackBtn}
                  onPress={() => setShowCollabDeleteModal(true)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  activeOpacity={0.7}
                  accessibilityLabel="Collab Options"
                >
                  <Ionicons name="ellipsis-horizontal" size={22} color="#A7A7A7" />
                </TouchableOpacity>
              ) : (
                <View style={{ width: 40 }} />
              )}
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.collabScroll}
              contentContainerStyle={[
                styles.collabScrollContent,
                (isDesktop || isTablet) && styles.collabContentDesktop,
              ]}
            >
              {/* Status Card - hidden for Blends */}
              {!isBlend && (
                <View style={styles.collabStatusCard}>
                  <Text style={styles.collabStatusTitle}>
                    {isCollab ? "Collaborative Playlist Active" : "Private Playlist"}
                  </Text>
                  <Text style={styles.collabStatusSub}>
                    {isCollab
                      ? "Friends can add songs, remove songs, and sync changes in real time."
                      : "Make this playlist collaborative so you and your friends can curate together."}
                  </Text>

                  {!isCollab ? (
                    <TouchableOpacity
                      style={[styles.enableCollabBtn, enablingCollab && styles.disabledBtn]}
                      onPress={handleEnableCollaboration}
                      disabled={enablingCollab}
                      activeOpacity={0.85}
                    >
                      {enablingCollab ? (
                        <ActivityIndicator size="small" color="#000000" />
                      ) : (
                        <>
                          <Ionicons name="people" size={16} color="#000000" style={{ marginRight: 6 }} />
                          <Text style={styles.enableCollabBtnText}>Turn into Collaborative Playlist</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.copyLinkBtn}
                      onPress={handleCopyCollabLink}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={copiedLink ? "checkmark" : "link-outline"}
                        size={16}
                        color={copiedLink ? "#1DB954" : "#FFFFFF"}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={[styles.copyLinkBtnText, copiedLink && { color: "#1DB954" }]}>
                        {copiedLink ? "Invite Link Copied!" : "Copy Invite Link"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Existing Collaborators */}
              {collaboratorList.length > 0 && (
                <View style={styles.collabSection}>
                  <Text style={styles.collabSectionHeader}>
                    {isBlend ? "BLEND PARTICIPANTS" : "CURRENT COLLABORATORS"}
                  </Text>
                  {collaboratorList.map((c, i) => {
                    const collabUser = getCollabUser(c);
                    return (
                      <View key={c.uid || i} style={styles.collabMemberRow}>
                        <UserAvatar user={collabUser} size={38} fontSize={14} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={styles.collabMemberName} numberOfLines={1}>
                            {collabUser.name}
                          </Text>
                          <Text style={styles.collabMemberRole}>
                            {c.role || (c.uid === playlistData?.ownerUid ? "Owner" : "Contributor")}
                          </Text>
                        </View>

                        {/* Allow owner or self to remove collaborator */}
                        {isCollab && c.uid !== playlistData?.ownerUid && (
                          <TouchableOpacity
                            style={styles.removeCollabUserBtn}
                            onPress={() => handleRemoveCollaborator(c.uid)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            activeOpacity={0.7}
                            accessibilityLabel={`Remove ${collabUser.name}`}
                          >
                            <Ionicons name="close-circle-outline" size={20} color="#EB4335" />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Invite Friends - hidden for Blends */}
              {!isBlend && (
                <View style={styles.collabSection}>
                  <Text style={styles.collabSectionHeader}>INVITE FRIENDS</Text>
                {Array.isArray(friends) && friends.length > 0 ? (
                  friends.map((friend) => {
                    const isAlreadyCollab = Boolean(collaboratorsObj[friend.uid]);
                    const isInviting = invitingUids.has(friend.uid);

                    return (
                      <View key={friend.uid} style={styles.collabFriendRow}>
                        <UserAvatar user={friend} size={38} fontSize={14} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={styles.collabMemberName} numberOfLines={1}>
                            {friend.username}
                          </Text>
                          <Text style={styles.collabMemberRole}>Staytup Friend</Text>
                        </View>

                        {isAlreadyCollab ? (
                          <View style={styles.joinedBadge}>
                            <Ionicons name="checkmark" size={12} color="#1DB954" style={{ marginRight: 4 }} />
                            <Text style={styles.joinedBadgeText}>Joined</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.inviteFriendBtn}
                            onPress={() => handleInviteFriend(friend)}
                            disabled={isInviting}
                            activeOpacity={0.8}
                          >
                            {isInviting ? (
                              <ActivityIndicator size="small" color="#000000" />
                            ) : (
                              <>
                                <Ionicons name="person-add" size={13} color="#000000" style={{ marginRight: 4 }} />
                                <Text style={styles.inviteFriendBtnText}>Invite</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })
                ) : (
                  <View style={styles.noFriendsBox}>
                    <Text style={styles.noFriendsText}>
                      You haven't added any friends yet. Add friends in the Friends tab to collaborate!
                    </Text>
                  </View>
                )}
                </View>
              )}
            </ScrollView>

            {/* Confirmation Modal for Collab Playlist Delete */}
            {showCollabDeleteModal && (
              <View style={styles.deleteModalBackdropOverlay}>
                <TouchableOpacity
                  style={StyleSheet.absoluteFillObject}
                  activeOpacity={1}
                  onPress={() => setShowCollabDeleteModal(false)}
                />
                <View style={styles.deleteModalCard} onStartShouldSetResponder={() => true}>
                  <View style={styles.dragHandle} />
                  <View style={styles.deleteModalIconWrap}>
                    <Ionicons name="trash-outline" size={28} color={colors.error} />
                  </View>
                  <Text style={styles.deleteModalTitle}>Delete Playlist?</Text>
                  <Text style={styles.deleteModalDesc}>
                    Are you sure you want to delete "{playlistData?.name}"? All collaborators will lose access and this action cannot be undone.
                  </Text>
                  <View style={styles.deleteModalActions}>
                    <TouchableOpacity
                      style={styles.deleteModalCancelBtn}
                      onPress={() => setShowCollabDeleteModal(false)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.deleteModalCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteModalConfirmBtn}
                      onPress={() => {
                        setShowCollabDeleteModal(false);
                        handleStopCollab();
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.deleteModalConfirmText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>
        </Modal>
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
    paddingTop:
      Platform.OS === "web"
        ? 16
        : Platform.OS === "android"
        ? (StatusBar.currentHeight || 24) + 10
        : 50,
    paddingBottom: 14,
    paddingHorizontal: 20,
    backgroundColor: "#000000",
    zIndex: 10,
  },
  desktopTopBar: {
    width: "100%",
    backgroundColor: "#000000",
    paddingHorizontal: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitleWrap: {
    flex: 1,
    marginHorizontal: 10,
    alignItems: "center",
  },
  topBarTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
    textAlign: "center",
  },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  closeHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  deleteHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  contentWrap: {
    flex: 1,
    width: "100%",
  },
  desktopContentWrap: {
    width: "100%",
    paddingHorizontal: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  endOfPlaylistFooter: {
    alignItems: "center",
    paddingTop: 20,
  },
  endOfPlaylistText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.4)",
  },
  headerContainer: {
    marginBottom: 16,
  },
  heroCard: {
    flexDirection: "column",
    alignItems: "center",
    marginBottom: 20,
    paddingVertical: 12,
  },
  heroCardDesktop: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 20,
    gap: 24,
  },
  heroArtwork: {
    width: 170,
    height: 170,
    borderRadius: 12,
    backgroundColor: "#121212",
    marginBottom: 16,
    overflow: "hidden",
  },
  heroArtworkFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#181818",
  },
  heroInfo: {
    flex: 1,
    alignItems: "center",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  playlistBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(29, 185, 84, 0.18)",
    borderRadius: 14,
  },
  playlistBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    letterSpacing: 1,
  },
  collabBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(29, 185, 84, 0.25)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.4)",
  },
  collabBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: "#1DB954",
    letterSpacing: 0.8,
  },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    paddingHorizontal: 16,
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.text,
    textAlign: "center",
  },
  heroDesc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  collabAvatarsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 10,
    gap: 8,
  },
  overlappingAvatars: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarCircleWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#000000",
  },
  avatarInitial: {
    fontFamily: fonts.bold,
    fontWeight: "700",
    fontSize: 10,
    color: "#000000",
    textAlign: "center",
    includeFontPadding: false,
  },
  avatarMoreWrap: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  avatarMoreText: {
    fontFamily: fonts.bold,
    fontWeight: "700",
    fontSize: 9,
    color: "#FFFFFF",
    textAlign: "center",
    includeFontPadding: false,
  },
  collabCountText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: "#CCCCCC",
  },
  heroMeta: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
  },
  actionsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 24,
  },
  playAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 26,
    borderRadius: 24,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  playAllText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#000000",
  },
  shuffleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  collabActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  collabActionButtonActive: {
    backgroundColor: "rgba(29, 185, 84, 0.2)",
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  renameActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  importActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  deleteActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(235, 67, 53, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  tracksHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    marginBottom: 8,
    paddingLeft: 12,
  },
  tracksHeaderText: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
  },
  tracksImportLink: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "rgba(29, 185, 84, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.3)",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  tracksImportLinkText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.primary,
  },
  emptyImportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 22,
    marginTop: 18,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  emptyImportBtnText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: "#000000",
  },
  trackRowWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  removeTrackBtn: {
    padding: 8,
    marginLeft: 6,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  disabledBtn: {
    opacity: 0.4,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 12,
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
    marginTop: 14,
    marginBottom: 6,
  },
  emptySub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
  deleteModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
  },
  deleteModalBackdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
    zIndex: 999,
  },
  deleteModalCard: {
    width: "100%",
    maxWidth: 540,
    alignSelf: "center",
    backgroundColor: "#161616",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 38 : 24,
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  deleteModalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(235, 67, 53, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  deleteModalTitle: {
    fontFamily: fonts.bold,
    fontSize: 19,
    color: colors.text,
    marginBottom: 8,
    textAlign: "center",
  },
  deleteModalDesc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 24,
  },
  deleteModalActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
  },
  deleteModalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
  },
  deleteModalCancelText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.text,
  },
  deleteModalConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.error,
    alignItems: "center",
  },
  deleteModalConfirmText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#FFFFFF",
  },

  // Collaboration Modal Styles (Full Screen Black)
  collabFullScreenContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  collabHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop:
      Platform.OS === "web"
        ? 14
        : Platform.OS === "android"
        ? (StatusBar.currentHeight || 24) + 8
        : 46,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: "#000000",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.12)",
  },
  collabHeaderDesktop: {
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  collabBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  collabHeaderTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: "#FFFFFF",
    textAlign: "center",
  },
  collabScroll: {
    flex: 1,
    backgroundColor: "#000000",
  },
  collabScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === "ios" ? 50 : 36,
  },
  collabContentDesktop: {
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  collabStatusCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  collabStatusTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#FFFFFF",
    marginBottom: 4,
  },
  collabStatusSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: 14,
  },
  enableCollabBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderRadius: 20,
    height: 42,
  },
  enableCollabBtnText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: "#000000",
  },
  copyLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 20,
    height: 42,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  copyLinkBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: "#FFFFFF",
  },
  collabSection: {
    marginBottom: 20,
  },
  collabSectionHeader: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  collabMemberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  collabMemberAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  collabMemberInitial: {
    fontFamily: fonts.bold,
    fontWeight: "700",
    fontSize: 14,
    color: "#000000",
    textAlign: "center",
    includeFontPadding: false,
  },
  collabMemberName: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  collabMemberRole: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  collabFriendRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  joinedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(29, 185, 84, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  joinedBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: "#1DB954",
  },
  inviteFriendBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  inviteFriendBtnText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: "#000000",
  },
  noFriendsBox: {
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  noFriendsText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
  },
  removeCollabUserBtn: {
    padding: 6,
    marginLeft: 8,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  stopCollabContainer: {
    marginTop: 20,
    marginBottom: 10,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  stopCollabBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(235, 67, 53, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(235, 67, 53, 0.3)",
    borderRadius: 14,
    paddingVertical: 12,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  stopCollabBtnText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: "#EB4335",
  },
});
