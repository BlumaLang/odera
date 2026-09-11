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
import { getHighResArtwork } from "../utils/imageUtils";
import { downloadTrack } from "../services/offlineStorage";

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
    getCollabPlaylistDetails,
  } = useUser() || {};

  const [playlistData, setPlaylistData] = useState(playlist || null);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCollabDeleteModal, setShowCollabDeleteModal] = useState(false);
  const [showCollabModal, setShowCollabModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [invitingUids, setInvitingUids] = useState(new Set());
  const [enablingCollab, setEnablingCollab] = useState(false);
  const playlistListRef = useRef(null);
  const playlistScrollOffsetRef = useRef(0);
  const savedScrollOffsetRef = useRef(0);
  const isSubmodalOpenRef = useRef(false);

  const freezeScrollPosition = useCallback(() => {
    isSubmodalOpenRef.current = true;
    savedScrollOffsetRef.current = playlistScrollOffsetRef.current;
  }, []);

  const restoreScrollPosition = useCallback(() => {
    const targetOffset = savedScrollOffsetRef.current;
    const restore = () => {
      try {
        playlistListRef.current?.scrollToOffset({
          offset: targetOffset,
          animated: false,
        });
      } catch (_) {}
    };
    restore();
    setTimeout(restore, 50);
    setTimeout(restore, 150);
    setTimeout(() => {
      restore();
      isSubmodalOpenRef.current = false;
    }, 350);
  }, []);

  const openCollabModal = useCallback(() => {
    freezeScrollPosition();
    setShowCollabModal(true);
  }, [freezeScrollPosition]);

  const closeCollabModal = useCallback(() => {
    setShowCollabModal(false);
    restoreScrollPosition();
  }, [restoreScrollPosition]);

  const openRenameModal = useCallback(() => {
    freezeScrollPosition();
    setShowRenameModal(true);
  }, [freezeScrollPosition]);

  const closeRenameModal = useCallback(() => {
    setShowRenameModal(false);
    restoreScrollPosition();
  }, [restoreScrollPosition]);

  const openImportModal = useCallback(() => {
    freezeScrollPosition();
    setShowImportModal(true);
  }, [freezeScrollPosition]);

  const closeImportModal = useCallback(() => {
    setShowImportModal(false);
    restoreScrollPosition();
  }, [restoreScrollPosition]);

  const openDeleteModal = useCallback(() => {
    freezeScrollPosition();
    setShowDeleteModal(true);
  }, [freezeScrollPosition]);

  const closeDeleteModal = useCallback(() => {
    setShowDeleteModal(false);
    restoreScrollPosition();
  }, [restoreScrollPosition]);

  const openOptionsMenu = useCallback(() => {
    freezeScrollPosition();
    setShowOptionsMenu(true);
  }, [freezeScrollPosition]);

  const closeOptionsMenu = useCallback(() => {
    setShowOptionsMenu(false);
    restoreScrollPosition();
  }, [restoreScrollPosition]);

  // Android hardware back button handler stack
  useEffect(() => {
    if (showOptionsMenu) {
      return registerBackAction(() => {
        setShowOptionsMenu(false);
        return true;
      });
    }
  }, [showOptionsMenu]);

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
    if (!visible || (!playlist?.id && !playlist?.collabId)) return;

    setPlaylistData(playlist);
    let isMounted = true;
    setIsLoadingTracks(true);

    const collabId = playlist?.collabId || (playlist?.isCollab ? playlist?.id : null);
    if (collabId && typeof getCollabPlaylistDetails === "function") {
      getCollabPlaylistDetails(collabId)
        .then((collabData) => {
          if (isMounted && collabData) {
            setPlaylistData((prev) => ({
              ...prev,
              ...collabData,
              isCollab: true,
              collaborators: collabData.collaborators || prev?.collaborators,
              tracks: collabData.tracks || prev?.tracks || [],
            }));
            if (onPlaylistUpdated) {
              onPlaylistUpdated(collabData);
            }
          }
        })
        .catch((err) => {
          console.warn("Failed to load collab playlist details:", err);
        })
        .finally(() => {
          if (isMounted) setIsLoadingTracks(false);
        });
      return () => {
        isMounted = false;
      };
    }

    if (playlist?.id) {
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
    } else {
      setIsLoadingTracks(false);
    }

    return () => {
      isMounted = false;
    };
  }, [visible, playlist?.id, playlist?.collabId]);

  const isCollab = Boolean(playlistData?.isCollab || playlistData?.collaborators);
  const isBlend = Boolean(playlistData?.isBlend || playlistData?.type === "blend" || String(playlistData?.name || "").startsWith("Blend:") || /^Blend\s*#\d+$/.test(String(playlistData?.name || "")));
  const collaboratorsObj = playlistData?.collaborators || {};
  const collaboratorList = Object.values(collaboratorsObj);
  const currentUid = currentUser?.uid || currentUser?.id;
  const isOwner = !playlistData?.ownerUid || playlistData?.ownerUid === currentUid;
  const isCollabMember = Boolean(collaboratorsObj[currentUid]);
  const isPublicPlaylist = Boolean(
    playlistData?.isPublic ||
    playlistData?.is_public ||
    playlistData?.type === "public" ||
    (playlistData?.ownerUid && !isOwner && !isCollabMember)
  );
  const isListenOnly = Boolean(isPublicPlaylist && !isOwner && !isCollabMember);
  const tracks = playlistData?.tracks || [];
  const trackCount = tracks.length || playlistData?.track_count || 0;
  const totalDurationStr = useMemo(() => {
    return formatTotalPlaylistDuration(tracks);
  }, [tracks]);

  // Bulk Edit state
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedVideoIds, setSelectedVideoIds] = useState(new Set());

  // Duplicate track detection
  const duplicateTrackCount = useMemo(() => {
    const seen = new Set();
    let dupes = 0;
    for (const t of tracks) {
      const vid = t.videoId || t.video_id || t.id;
      const key = vid || (t.title || "").trim().toLowerCase();
      if (seen.has(key)) {
        dupes++;
      } else if (key) {
        seen.add(key);
      }
    }
    return dupes;
  }, [tracks]);

  const handleRemoveDuplicates = useCallback(async () => {
    if (!tracks.length) return;
    const seen = new Set();
    const uniqueTracks = [];
    const duplicateIds = [];

    for (const t of tracks) {
      const vid = t.videoId || t.video_id || t.id;
      const key = vid || (t.title || "").trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueTracks.push(t);
      } else {
        if (vid) duplicateIds.push(vid);
      }
    }

    if (uniqueTracks.length === tracks.length) return;

    const updated = {
      ...playlistData,
      tracks: uniqueTracks,
      track_count: uniqueTracks.length,
    };
    setPlaylistData(updated);
    if (onPlaylistUpdated) onPlaylistUpdated(updated);

    const playlistId = playlistData?.id || playlistData?.collabId;
    const uid = currentUser?.uid || "staytup_user_main";
    api.updatePlaylist(playlistId, { tracks: uniqueTracks, track_count: uniqueTracks.length }, uid).catch(() => {});
  }, [tracks, playlistData, onPlaylistUpdated, currentUser]);

  const handleExportPlaylist = useCallback(() => {
    try {
      const exportData = {
        staytup_backup_version: "1.0",
        exported_at: new Date().toISOString(),
        name: playlistData?.name || "Playlist",
        description: playlistData?.description || "",
        cover_url: playlistData?.cover_url || "",
        track_count: tracks.length,
        tracks: tracks.map((t) => ({
          videoId: t.videoId || t.video_id || t.id,
          title: t.title,
          artist: t.artist,
          album: t.album,
          duration: t.duration,
          duration_seconds: t.duration_seconds,
          artwork_url: t.artwork_url || t.image || t.thumbnail,
        })),
      };

      const jsonStr = JSON.stringify(exportData, null, 2);
      if (typeof window !== "undefined") {
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const safeName = (playlistData?.name || "playlist").replace(/[^a-zA-Z0-9_-]/g, "_");
        a.href = url;
        a.download = `${safeName}_backup.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.warn("Failed exporting playlist:", err);
    }
  }, [playlistData, tracks]);

  const toggleSelectTrack = useCallback((vid) => {
    setSelectedVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(vid)) next.delete(vid);
      else next.add(vid);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedVideoIds.size === tracks.length) {
      setSelectedVideoIds(new Set());
    } else {
      setSelectedVideoIds(new Set(tracks.map((t) => t.videoId || t.video_id || t.id).filter(Boolean)));
    }
  }, [tracks, selectedVideoIds.size]);

  const handleBulkDelete = useCallback(async () => {
    if (!selectedVideoIds.size) return;
    const remaining = tracks.filter((t) => !selectedVideoIds.has(t.videoId || t.video_id || t.id));
    const idsToDelete = Array.from(selectedVideoIds);

    const updated = {
      ...playlistData,
      tracks: remaining,
      track_count: remaining.length,
    };
    setPlaylistData(updated);
    if (onPlaylistUpdated) onPlaylistUpdated(updated);
    setSelectedVideoIds(new Set());
    setIsBulkMode(false);

    const playlistId = playlistData?.id || playlistData?.collabId;
    const uid = currentUser?.uid || "staytup_user_main";
    api.bulkDeleteTracksFromPlaylist(playlistId, idsToDelete, uid).catch(() => {});
  }, [tracks, selectedVideoIds, playlistData, onPlaylistUpdated, currentUser]);

  const handleBulkDownload = useCallback(async () => {
    const selectedTracks = tracks.filter((t) => selectedVideoIds.has(t.videoId || t.video_id || t.id));
    for (const t of selectedTracks) {
      try {
        await downloadTrack(t);
      } catch (_) {}
    }
    setIsBulkMode(false);
    setSelectedVideoIds(new Set());
  }, [tracks, selectedVideoIds]);

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
    openDeleteModal();
  }, [openDeleteModal]);

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
      const pId = playlistData?.collabId || playlistData?.id;
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
    async (matchedTracks, sourcePlaylistName) => {
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
      const isDefaultName = !playlistData.name ||
        /^My Playlist #\d+$/i.test(playlistData.name) ||
        playlistData.name.toLowerCase() === "new playlist" ||
        playlistData.name.toLowerCase() === "playlist";

      const targetName = (isDefaultName && sourcePlaylistName && sourcePlaylistName.trim())
        ? sourcePlaylistName.trim()
        : playlistData.name;

      const isYtCover = playlistData.cover_url && (playlistData.cover_url.includes("ytimg.com") || playlistData.cover_url.includes("youtube"));
      const currentCover = (!isYtCover && (playlistData.cover_url || playlistData.preview_artwork)) || firstArt || "";

      const updated = {
        ...playlistData,
        name: targetName,
        tracks: currentTracks,
        track_count: currentTracks.length,
        cover_url: currentCover,
        preview_artwork: currentCover,
      };

      setPlaylistData(updated);

      const targetPlaylistId = playlistData.collabId || playlistData.id;

      try {
        if (targetName !== playlistData.name && renamePlaylist) {
          await renamePlaylist(targetPlaylistId, targetName, currentCover);
        }
        if (isCollab && addTracksToCollabPlaylist) {
          await addTracksToCollabPlaylist(targetPlaylistId, newlyAdded);
        } else if (addTracksToPlaylist) {
          await addTracksToPlaylist(targetPlaylistId, newlyAdded);
        }
      } catch (err) {
        console.warn("Error saving imported tracks to playlist:", err);
      }

      if (onPlaylistUpdated) {
        onPlaylistUpdated(updated);
      }
    },
    [playlistData, isCollab, addTracksToCollabPlaylist, addTracksToPlaylist, renamePlaylist, onPlaylistUpdated]
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
      let newCollabId = targetId;
      let createdPl = null;

      if (sendCollabInvite) {
        const res = await sendCollabInvite(friend.uid, {
          collabId: targetId,
          playlistId: targetId,
          name: playlistData?.name || "Collab Playlist",
          cover_url: playlistData?.cover_url || playlistData?.preview_artwork || "",
          tracks: playlistData?.tracks || [],
          playlist: playlistData,
        });
        if (res?.success) {
          newCollabId = res.collabId || targetId;
          createdPl = res.playlist || null;
        }
      }

      // Add to collaborators and persist collab status
      const newCollabs = {
        ...collaboratorsObj,
        ...(createdPl?.collaborators || {}),
        [friend.uid]: {
          uid: friend.uid,
          name: friend.username || friend.displayName || "Friend",
          avatar: friend.avatar || "memoji_0",
          avatarColor: friend.avatarColor || colors.primary,
          role: "Collaborator",
        },
      };

      const updated = {
        ...playlistData,
        ...(createdPl || {}),
        id: newCollabId || playlistData?.id,
        collabId: newCollabId || playlistData?.collabId,
        isCollab: true,
        collaborators: newCollabs,
      };

      setPlaylistData(updated);
      if (onPlaylistUpdated) onPlaylistUpdated(updated);
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
              onPress={openOptionsMenu}
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
              const y = event?.nativeEvent?.contentOffset?.y;
              if (typeof y === "number" && !isSubmodalOpenRef.current) {
                playlistScrollOffsetRef.current = y;
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
                    <Image
                      source={{ uri: getHighResArtwork(artwork) || artwork }}
                      style={[
                        styles.heroArtwork,
                        (isDesktop || isTablet) && styles.heroArtworkDesktop,
                      ]}
                    />
                  ) : (
                    <View
                      style={[
                        styles.heroArtwork,
                        styles.heroArtworkFallback,
                        (isDesktop || isTablet) && styles.heroArtworkDesktop,
                      ]}
                    >
                      <Ionicons name="musical-notes" size={(isDesktop || isTablet) ? 68 : 54} color={colors.primary} />
                    </View>
                  )}

                  <View
                    style={[
                      styles.heroInfo,
                      (isDesktop || isTablet) && styles.heroInfoDesktop,
                    ]}
                  >
                    <View
                      style={[
                        styles.badgeRow,
                        (isDesktop || isTablet) && styles.badgeRowDesktop,
                      ]}
                    >
                      {!isBlend && (
                        <View style={[styles.playlistBadge, (isDesktop || isTablet) && styles.playlistBadgeDesktop, isListenOnly && { borderColor: "rgba(59, 130, 246, 0.5)", backgroundColor: "rgba(59, 130, 246, 0.15)" }]}>
                          <Text style={[styles.playlistBadgeText, (isDesktop || isTablet) && styles.playlistBadgeTextDesktop, isListenOnly && { color: "#60A5FA" }]}>
                            {isListenOnly ? "PUBLIC PLAYLIST • LISTEN ONLY" : isCollab ? "COLLABORATIVE PLAYLIST" : "PLAYLIST"}
                          </Text>
                        </View>
                      )}
                      {isBlend && (
                        <View
                          style={[
                            styles.collabBadge,
                            styles.blendBadge,
                            (isDesktop || isTablet) && styles.blendBadgeDesktop,
                          ]}
                        >
                          <Ionicons name="flash" size={12} color="#8B5CF6" style={{ marginRight: 5 }} />
                          <Text style={[styles.collabBadgeText, { color: "#8B5CF6" }]}>BLEND</Text>
                        </View>
                      )}
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.heroTitleRow,
                        (isDesktop || isTablet) && styles.heroTitleRowDesktop,
                      ]}
                      onPress={openRenameModal}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Rename Playlist"
                    >
                      <Text
                        style={[
                          styles.heroTitle,
                          (isDesktop || isTablet) && styles.heroTitleDesktop,
                        ]}
                        numberOfLines={2}
                      >
                        {playlistData?.name}
                      </Text>
                      <Ionicons
                        name="pencil-outline"
                        size={(isDesktop || isTablet) ? 20 : 16}
                        color="rgba(255, 255, 255, 0.4)"
                        style={{ marginLeft: 8 }}
                      />
                    </TouchableOpacity>

                    {playlistData?.description ? (
                      <Text
                        style={[
                          styles.heroDesc,
                          (isDesktop || isTablet) && styles.heroDescDesktop,
                        ]}
                        numberOfLines={3}
                      >
                        {playlistData.description}
                      </Text>
                    ) : null}

                    {/* Collaborator Avatars (if any) */}
                    {collaboratorList.length > 0 && (
                      <TouchableOpacity
                        style={[
                          styles.collabAvatarsRow,
                          (isDesktop || isTablet) && styles.collabAvatarsRowDesktop,
                        ]}
                        onPress={openCollabModal}
                        activeOpacity={0.8}
                      >
                        <View style={styles.overlappingAvatars}>
                          {collaboratorList.slice(0, 4).map((c, i) => (
                            <UserAvatar
                              key={c.uid || i}
                              user={getCollabUser(c)}
                              size={(isDesktop || isTablet) ? 26 : 24}
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
                        <Text
                          style={[
                            styles.collabCountText,
                            (isDesktop || isTablet) && styles.collabCountTextDesktop,
                          ]}
                        >
                          {collaboratorList.length}{" "}
                          {isBlend
                            ? (collaboratorList.length === 1 ? "participant" : "participants")
                            : (collaboratorList.length === 1 ? "collaborator" : "collaborators")}
                        </Text>
                      </TouchableOpacity>
                    )}

                    <Text
                      style={[
                        styles.heroMeta,
                        (isDesktop || isTablet) && styles.heroMetaDesktop,
                      ]}
                    >
                      {trackCount} {trackCount === 1 ? "track" : "tracks"}
                      {totalDurationStr ? ` • ${totalDurationStr}` : ""} • Staytup Music
                    </Text>
                  </View>
                </View>

                {/* Playlist Action Bar: Play All, Shuffle, Collab, Link, More Options */}
                <View
                  style={[
                    styles.actionsBar,
                    (isDesktop || isTablet) && styles.actionsBarDesktop,
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.playAllButton,
                      (isDesktop || isTablet) && styles.playAllButtonDesktop,
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
                  {!isListenOnly && (
                    <TouchableOpacity
                      style={[
                        styles.collabActionButton,
                        isCollab && styles.collabActionButtonActive,
                      ]}
                      onPress={openCollabModal}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={isBlend ? "Blend Participants" : "Collaborate"}
                    >
                      <Ionicons
                        name={isBlend ? "flash-outline" : "people-outline"}
                        size={20}
                        color={isCollab ? colors.primary : colors.text}
                      />
                    </TouchableOpacity>
                  )}

                  {/* Import Songs from Link Button */}
                  {!isListenOnly && (
                    <TouchableOpacity
                      style={styles.importActionButton}
                      onPress={openImportModal}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel="Import from link"
                    >
                      <Ionicons name="link-outline" size={20} color={colors.text} />
                    </TouchableOpacity>
                  )}

                  {/* More Options 3-Dot Button */}
                  <TouchableOpacity
                    style={styles.moreActionButton}
                    onPress={openOptionsMenu}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Playlist Options"
                  >
                    <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>

                {/* Tracks Header */}
                <View
                  style={[
                    styles.tracksHeaderRow,
                    (isDesktop || isTablet) && styles.tracksHeaderRowDesktop,
                  ]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={styles.tracksHeaderText}>Tracks</Text>
                    {isLoadingTracks && (
                      <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 10 }} />
                    )}
                  </View>

                  {tracks.length > 0 && (
                    <TouchableOpacity
                      style={styles.bulkToggleHeaderBtn}
                      onPress={() => {
                        setIsBulkMode((prev) => !prev);
                        if (isBulkMode) setSelectedVideoIds(new Set());
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isBulkMode ? "close-circle-outline" : "checkbox-outline"}
                        size={16}
                        color={isBulkMode ? colors.primary : colors.textMuted}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.bulkToggleHeaderText, isBulkMode && { color: colors.primary }]}>
                        {isBulkMode ? "Cancel" : "Select"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Duplicate track clean-up banner */}
                {duplicateTrackCount > 0 && (
                  <View style={styles.duplicateBanner}>
                    <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                      <Ionicons name="alert-circle" size={18} color="#EAB308" style={{ marginRight: 8 }} />
                      <Text style={styles.duplicateBannerText}>
                        {duplicateTrackCount} duplicate {duplicateTrackCount === 1 ? "track" : "tracks"} found
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.cleanDuplicatesBtn}
                      onPress={handleRemoveDuplicates}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.cleanDuplicatesText}>Clean Up</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            }
            renderItem={({ item, index }) => {
              const vid = item.video_id || item.videoId;
              const isSelected = selectedVideoIds.has(vid);
              return (
                <View style={[styles.trackRowWrapper, isSelected && styles.selectedTrackRowWrapper]}>
                  {isBulkMode && (
                    <TouchableOpacity
                      style={styles.bulkCheckRowBtn}
                      onPress={() => toggleSelectTrack(vid)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isSelected ? "checkbox" : "square-outline"}
                        size={22}
                        color={isSelected ? colors.primary : colors.textMuted}
                      />
                    </TouchableOpacity>
                  )}

                  <View style={{ flex: 1 }}>
                    <SongCard
                      track={{
                        ...item,
                        videoId: vid,
                      }}
                      layout="row"
                      showRank={!isBulkMode}
                      rank={index + 1}
                      showPlayButton={false}
                      showDuration={false}
                      isActive={currentTrack?.videoId === vid}
                      onPress={() => {
                        if (isBulkMode) {
                          toggleSelectTrack(vid);
                        } else {
                          handlePlayAll(index);
                        }
                      }}
                      onAddToPlaylist={(t) => {
                        freezeScrollPosition();
                        setAddToPlaylistTrack(t);
                      }}
                    />
                  </View>

                  {!isBulkMode && !isListenOnly && (
                    <TouchableOpacity
                      style={styles.removeTrackBtn}
                      onPress={() => handleRemoveTrack(vid)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="Remove track from playlist"
                    >
                      <Ionicons name="remove-circle-outline" size={22} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
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
                    onPress={openImportModal}
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
          />

          {/* Sticky Bulk Action Bar */}
          {isBulkMode && (
            <View style={[styles.bulkActionBar, (isDesktop || isTablet) && styles.desktopBulkActionBar]}>
              <TouchableOpacity style={styles.bulkActionBtn} onPress={handleSelectAll} activeOpacity={0.75}>
                <Ionicons
                  name={selectedVideoIds.size === tracks.length ? "close-circle-outline" : "checkmark-done-outline"}
                  size={18}
                  color="#FFFFFF"
                />
                <Text style={styles.bulkActionText}>
                  {selectedVideoIds.size === tracks.length ? "Deselect" : "All"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.bulkActionBtn, selectedVideoIds.size === 0 && styles.disabledBulkBtn]}
                onPress={handleBulkDelete}
                disabled={selectedVideoIds.size === 0}
                activeOpacity={0.75}
              >
                <Ionicons name="trash-outline" size={18} color={colors.error} />
                <Text style={[styles.bulkActionText, { color: colors.error }]}>
                  Delete ({selectedVideoIds.size})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.bulkActionBtn, selectedVideoIds.size === 0 && styles.disabledBulkBtn]}
                onPress={handleBulkDownload}
                disabled={selectedVideoIds.size === 0}
                activeOpacity={0.75}
              >
                <Ionicons name="arrow-down-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.bulkActionText}>Save ({selectedVideoIds.size})</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.bulkDoneBtn}
                onPress={() => {
                  setIsBulkMode(false);
                  setSelectedVideoIds(new Set());
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.bulkDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Add to Playlist Modal */}
        <AddToPlaylistModal
          visible={!!addToPlaylistTrack}
          onClose={() => {
            setAddToPlaylistTrack(null);
            restoreScrollPosition();
          }}
          track={addToPlaylistTrack}
        />

        {/* Rename / Edit Playlist Modal */}
        <CreatePlaylistModal
          visible={showRenameModal}
          onClose={closeRenameModal}
          onSubmit={handleRenamePlaylist}
          initialName={playlistData?.name}
          initialCover={playlistData?.cover_url || playlistData?.preview_artwork || ""}
          mode="edit"
        />

        {/* Import Playlist from Link Modal */}
        <ImportPlaylistLinkModal
          visible={showImportModal}
          onClose={closeImportModal}
          onSuccess={handleImportSuccess}
          playlistName={playlistData?.name || "Playlist"}
        />

        {/* Playlist Options Modal */}
        <Modal
          visible={showOptionsMenu}
          transparent={true}
          animationType="fade"
          onRequestClose={closeOptionsMenu}
        >
          <TouchableOpacity
            style={styles.optionsModalOverlay}
            activeOpacity={1}
            onPress={closeOptionsMenu}
          >
            <View
              style={[
                styles.optionsModalCard,
                (isDesktop || isTablet) && styles.optionsModalCardDesktop,
              ]}
              onStartShouldSetResponder={() => true}
            >
              {!(isDesktop || isTablet) && <View style={styles.dragHandle} />}

              {/* Header inside options */}
              <View style={styles.optionsHeaderRow}>
                {artwork ? (
                  <Image source={{ uri: getHighResArtwork(artwork) || artwork }} style={styles.optionsThumb} />
                ) : (
                  <View style={[styles.optionsThumb, styles.optionsThumbFallback]}>
                    <Ionicons name="musical-notes" size={20} color={colors.primary} />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.optionsTitle} numberOfLines={1}>
                    {playlistData?.name || "Playlist"}
                  </Text>
                  <Text style={styles.optionsSub}>
                    {trackCount} {trackCount === 1 ? "track" : "tracks"} • Staytup
                  </Text>
                </View>
              </View>

              <View style={styles.optionsDivider} />

              {/* Action Rows */}
              <TouchableOpacity
                style={styles.optionsRow}
                onPress={() => {
                  closeOptionsMenu();
                  setTimeout(() => openRenameModal(), 150);
                }}
                activeOpacity={0.75}
              >
                <Ionicons name="pencil-outline" size={20} color={colors.text} style={styles.optionsRowIcon} />
                <Text style={styles.optionsRowText}>Edit Details</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionsRow}
                onPress={() => {
                  closeOptionsMenu();
                  setTimeout(() => openCollabModal(), 150);
                }}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={isBlend ? "flash-outline" : "people-outline"}
                  size={20}
                  color={isBlend ? "#8B5CF6" : colors.text}
                  style={styles.optionsRowIcon}
                />
                <Text style={styles.optionsRowText}>
                  {isBlend ? "View Blend Participants" : "Collaborate with Friends"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionsRow}
                onPress={() => {
                  closeOptionsMenu();
                  setIsBulkMode(true);
                }}
                activeOpacity={0.75}
              >
                <Ionicons name="list-outline" size={20} color={colors.text} style={styles.optionsRowIcon} />
                <Text style={styles.optionsRowText}>Bulk Edit Tracks</Text>
              </TouchableOpacity>

              {duplicateTrackCount > 0 && (
                <TouchableOpacity
                  style={styles.optionsRow}
                  onPress={() => {
                    closeOptionsMenu();
                    handleRemoveDuplicates();
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons name="copy-outline" size={20} color="#EAB308" style={styles.optionsRowIcon} />
                  <Text style={[styles.optionsRowText, { color: "#EAB308" }]}>
                    Clean Up {duplicateTrackCount} Duplicate {duplicateTrackCount === 1 ? "Track" : "Tracks"}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.optionsRow}
                onPress={() => {
                  closeOptionsMenu();
                  handleExportPlaylist();
                }}
                activeOpacity={0.75}
              >
                <Ionicons name="download-outline" size={20} color={colors.text} style={styles.optionsRowIcon} />
                <Text style={styles.optionsRowText}>Export Playlist Backup (.json)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionsRow}
                onPress={() => {
                  closeOptionsMenu();
                  setTimeout(() => openImportModal(), 150);
                }}
                activeOpacity={0.75}
              >
                <Ionicons name="link-outline" size={20} color={colors.text} style={styles.optionsRowIcon} />
                <Text style={styles.optionsRowText}>Import Songs from Link</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.optionsRow, styles.optionsRowDestructive]}
                onPress={() => {
                  closeOptionsMenu();
                  setTimeout(() => openDeleteModal(), 150);
                }}
                activeOpacity={0.75}
              >
                <Ionicons name="trash-outline" size={20} color={colors.error} style={styles.optionsRowIcon} />
                <Text style={[styles.optionsRowText, { color: colors.error }]}>Delete Playlist</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionsCancelBtn}
                onPress={closeOptionsMenu}
                activeOpacity={0.8}
              >
                <Text style={styles.optionsCancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Delete Playlist Confirmation Modal */}
        <Modal
          visible={showDeleteModal}
          transparent={true}
          animationType="slide"
          onRequestClose={closeDeleteModal}
        >
          <View style={styles.deleteModalOverlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={closeDeleteModal}
            />
            <View style={styles.deleteModalContent} onStartShouldSetResponder={() => true}>
              <View style={styles.dragHandle} />
              <View style={styles.deleteAvatarWrap}>
                <View style={styles.deleteIconBox}>
                  <Ionicons name="trash" size={30} color="#E53935" />
                </View>
              </View>
              <Text style={styles.deleteModalTitle}>
                Delete {playlistData?.name || "Playlist"}?
              </Text>
              <Text style={styles.deleteModalSub}>
                Are you sure you want to delete "{playlistData?.name || "this playlist"}"? This action cannot be undone.
              </Text>
              <View style={styles.deleteModalActions}>
                <TouchableOpacity
                  style={styles.deleteModalConfirmBtn}
                  onPress={() => {
                    closeDeleteModal();
                    doDelete();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.deleteModalConfirmBtnText}>Delete Playlist</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteModalCancelBtn}
                  onPress={closeDeleteModal}
                  activeOpacity={0.8}
                >
                  <Text style={styles.deleteModalCancelBtnText}>Cancel</Text>
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
                <View style={styles.deleteModalContent} onStartShouldSetResponder={() => true}>
                  <View style={styles.dragHandle} />
                  <View style={styles.deleteAvatarWrap}>
                    <View style={styles.deleteIconBox}>
                      <Ionicons name="trash" size={30} color="#E53935" />
                    </View>
                  </View>
                  <Text style={styles.deleteModalTitle}>
                    Delete {playlistData?.name || "Collab Playlist"}?
                  </Text>
                  <Text style={styles.deleteModalSub}>
                    Are you sure you want to delete "{playlistData?.name}"? All collaborators will lose access and this action cannot be undone.
                  </Text>
                  <View style={styles.deleteModalActions}>
                    <TouchableOpacity
                      style={styles.deleteModalConfirmBtn}
                      onPress={() => {
                        setShowCollabDeleteModal(false);
                        handleStopCollab();
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.deleteModalConfirmBtnText}>Delete Playlist</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.deleteModalCancelBtn}
                      onPress={() => setShowCollabDeleteModal(false)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.deleteModalCancelBtnText}>Cancel</Text>
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
    paddingHorizontal: 32,
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
    paddingHorizontal: 32,
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
    alignItems: "flex-end",
    paddingVertical: 24,
    gap: 32,
    marginBottom: 20,
  },
  heroArtwork: {
    width: 170,
    height: 170,
    borderRadius: 12,
    backgroundColor: "#121212",
    marginBottom: 16,
    overflow: "hidden",
  },
  heroArtworkDesktop: {
    width: 220,
    height: 220,
    borderRadius: 10,
    marginBottom: 0,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.65,
    shadowRadius: 28,
    elevation: 16,
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
  heroInfoDesktop: {
    alignItems: "flex-start",
    justifyContent: "flex-end",
    flex: 1,
    paddingBottom: 4,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  badgeRowDesktop: {
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  playlistBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(29, 185, 84, 0.18)",
    borderRadius: 14,
  },
  playlistBadgeDesktop: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: "transparent",
    borderRadius: 0,
  },
  playlistBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    letterSpacing: 1,
  },
  playlistBadgeTextDesktop: {
    fontSize: 12,
    letterSpacing: 1.2,
    color: "#FFFFFF",
    fontFamily: fonts.bold,
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
  blendBadge: {
    borderColor: "rgba(139, 92, 246, 0.4)",
    backgroundColor: "rgba(139, 92, 246, 0.12)",
  },
  blendBadgeDesktop: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    paddingHorizontal: 16,
  },
  heroTitleRowDesktop: {
    justifyContent: "flex-start",
    alignSelf: "flex-start",
    paddingHorizontal: 0,
    marginBottom: 10,
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.text,
    textAlign: "center",
  },
  heroTitleDesktop: {
    fontSize: 38,
    lineHeight: 44,
    textAlign: "left",
    letterSpacing: -0.5,
    fontFamily: fonts.bold,
  },
  heroDesc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  heroDescDesktop: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "left",
    paddingHorizontal: 0,
    alignSelf: "flex-start",
    marginBottom: 10,
    maxWidth: 720,
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
  collabAvatarsRowDesktop: {
    alignSelf: "flex-start",
    marginBottom: 10,
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
  collabCountTextDesktop: {
    fontSize: 12.5,
    color: "#D1D1D6",
  },
  heroMeta: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
  },
  heroMetaDesktop: {
    textAlign: "left",
    alignSelf: "flex-start",
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.65)",
  },
  actionsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 24,
  },
  actionsBarDesktop: {
    justifyContent: "flex-start",
    alignSelf: "flex-start",
    width: "100%",
    gap: 16,
    marginBottom: 28,
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
  playAllButtonDesktop: {
    paddingVertical: 13,
    paddingHorizontal: 28,
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
  moreActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
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
  tracksHeaderRowDesktop: {
    paddingLeft: 0,
    marginBottom: 12,
  },
  optionsModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  optionsModalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#161618",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  optionsModalCardDesktop: {
    borderRadius: 20,
    alignSelf: "center",
    marginVertical: "auto",
    paddingVertical: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 32,
    elevation: 24,
  },
  optionsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  optionsThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#222222",
  },
  optionsThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#222222",
  },
  optionsTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
  },
  optionsSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 2,
  },
  optionsDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginVertical: 12,
  },
  optionsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 12,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  optionsRowDestructive: {
    marginTop: 4,
  },
  optionsRowIcon: {
    marginRight: 14,
  },
  optionsRowText: {
    fontFamily: fonts.medium,
    fontSize: 14.5,
    color: "#FFFFFF",
  },
  optionsCancelBtn: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  optionsCancelText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#AAAAAA",
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
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  deleteModalBackdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
    alignItems: "center",
    zIndex: 999,
  },
  deleteModalContent: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#161616",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === "web" ? 32 : 44,
    alignItems: "center",
    borderTopWidth: 1,
    borderLeftWidth: Platform.OS === "web" ? 1 : 0,
    borderRightWidth: Platform.OS === "web" ? 1 : 0,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  deleteAvatarWrap: {
    marginBottom: 14,
  },
  deleteIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(229, 57, 53, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(229, 57, 53, 0.25)",
  },
  deleteModalTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
  },
  deleteModalSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 340,
    marginBottom: 24,
  },
  deleteModalActions: {
    width: "100%",
    gap: 10,
  },
  deleteModalConfirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E53935",
    height: 46,
    borderRadius: 23,
    width: "100%",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  deleteModalConfirmBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  deleteModalCancelBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    height: 46,
    borderRadius: 23,
    width: "100%",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  deleteModalCancelBtnText: {
    fontFamily: fonts.semiBold,
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
  bulkToggleHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  bulkToggleHeaderText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.textSecondary,
  },
  duplicateBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(234, 179, 8, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(234, 179, 8, 0.35)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 10,
  },
  duplicateBannerText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#EAB308",
    flex: 1,
  },
  cleanDuplicatesBtn: {
    backgroundColor: "#EAB308",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  cleanDuplicatesText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: "#000000",
  },
  selectedTrackRowWrapper: {
    backgroundColor: "rgba(29, 185, 84, 0.08)",
    borderRadius: 8,
  },
  bulkCheckRowBtn: {
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  bulkActionBar: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 20 : 30,
    left: 16,
    right: 16,
    backgroundColor: "#181818",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
    gap: 8,
  },
  desktopBulkActionBar: {
    maxWidth: 600,
    left: "50%",
    transform: [{ translateX: -300 }],
    bottom: 30,
  },
  bulkActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  bulkActionText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: "#FFFFFF",
  },
  disabledBulkBtn: {
    opacity: 0.4,
  },
  bulkDoneBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    marginLeft: "auto",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  bulkDoneText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: "#000000",
  },
});
