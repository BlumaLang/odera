import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Platform,
  Image,
  Modal,
  Animated,
  Easing,
  StatusBar,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import SongCard from "../components/SongCard";
import AddToPlaylistModal from "../components/AddToPlaylistModal";
import ArtistModal from "../components/ArtistModal";
import PlaylistModal from "../components/PlaylistModal";
import CreatePlaylistModal from "../components/CreatePlaylistModal";
import AlbumModal from "../components/AlbumModal";
import { colors, fonts } from "../theme/colors";
import { api } from "../api/client";
import { useAudioPlayback, fisherYatesShuffle } from "../context/AudioContext";
import { useUser } from "../context/UserContext";
import { useResponsive } from "../context/ResponsiveContext";
import { auth, getRecentlyPlayed, subscribeRecentlyPlayed, removeRecentlyPlayed, subscribePublicPlaylists } from "../services/firebase";
import { getHighResArtwork, decodeHtml } from "../utils/imageUtils";
import {
  getDownloadedTracks,
  getOfflineStorageFormatted,
  clearAllDownloads,
  removeDownloadedTrack,
  downloadTrack,
} from "../services/offlineStorage";

function LibrarySkeleton({ type }) {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.6,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  if (type === "playlists" || type === "folders") {
    return (
      <View style={styles.skeletonWrap}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={styles.skeletonPlaylistRow}>
            <Animated.View style={[styles.skeletonPlaylistThumb, { opacity: pulseAnim }]} />
            <View style={styles.skeletonPlaylistInfo}>
              <Animated.View style={[styles.skeletonLine, { width: 140 + (i % 3) * 30, height: 14, opacity: pulseAnim }]} />
              <Animated.View style={[styles.skeletonLine, { width: 90 + (i % 2) * 20, height: 11, marginTop: 6, opacity: pulseAnim }]} />
            </View>
            <Animated.View style={[styles.skeletonChevron, { opacity: pulseAnim }]} />
          </View>
        ))}
      </View>
    );
  }

  if (type === "artists") {
    return (
      <View style={styles.skeletonWrap}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={styles.skeletonPlaylistRow}>
            <Animated.View style={[styles.skeletonPlaylistThumb, { borderRadius: 26, opacity: pulseAnim }]} />
            <View style={styles.skeletonPlaylistInfo}>
              <Animated.View style={[styles.skeletonLine, { width: 120 + (i % 3) * 20, height: 14, opacity: pulseAnim }]} />
              <Animated.View style={[styles.skeletonLine, { width: 60, height: 10, marginTop: 6, opacity: pulseAnim }]} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.skeletonWrap}>
      <View style={styles.skeletonHistoryHeader}>
        <View>
          <Animated.View style={[styles.skeletonLine, { width: 130, height: 16, opacity: pulseAnim }]} />
          <Animated.View style={[styles.skeletonLine, { width: 70, height: 11, marginTop: 4, opacity: pulseAnim }]} />
        </View>
        <View style={styles.skeletonHistoryButtons}>
          <Animated.View style={[styles.skeletonPillBtn, { opacity: pulseAnim }]} />
          <Animated.View style={[styles.skeletonCircleBtn, { opacity: pulseAnim }]} />
        </View>
      </View>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={styles.skeletonSongRow}>
          <Animated.View style={[styles.skeletonSongThumb, { opacity: pulseAnim }]} />
          <View style={styles.skeletonSongInfo}>
            <Animated.View style={[styles.skeletonLine, { width: 150 + (i % 3) * 25, height: 13, opacity: pulseAnim }]} />
            <Animated.View style={[styles.skeletonLine, { width: 100 + (i % 2) * 15, height: 10, marginTop: 5, opacity: pulseAnim }]} />
          </View>
          <Animated.View style={[styles.skeletonDots, { opacity: pulseAnim }]} />
        </View>
      ))}
    </View>
  );
}

const FOLDER_COLORS = ["#1DB954", "#8B5CF6", "#3B82F6", "#EC4899", "#F59E0B", "#10B981", "#6366F1"];

export default function LibraryScreen() {
  const navigation = useNavigation();
  const { isDesktop, isTablet } = useResponsive();
  const {
    currentUser,
    userProfile,
    openProfile,
    likedSongs,
    playlists: rtdbPlaylists,
    collabPlaylists,
    setPlaylists,
    setCollabPlaylists,
    recentlyPlayed: rtdbRecentlyPlayed,
    createPlaylist,
    deletePlaylist,
    removeTrackFromPlaylist,
    savedAlbums = [],
    toggleSaveAlbum,
    isAlbumSaved,
    playlistFolders = [],
    createFolder,
    deleteFolder,
    addPlaylistToFolder,
    removePlaylistFromFolder,
  } = useUser();

  const [activeTab, setActiveTab] = useState("playlists");
  // "playlists" | "favorites" | "albums" | "artists" | "history" | "recent_added" | "downloaded" | "folders"
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [sortBy, setSortBy] = useState("recent_added"); // "recent_added" | "alpha_asc" | "alpha_desc" | "track_count"
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFolder, setActiveFolder] = useState(null);
  const [folderSelectPlaylist, setFolderSelectPlaylist] = useState(null);
  const [folderToDelete, setFolderToDelete] = useState(null);
  const [libraryToast, setLibraryToast] = useState("");

  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);
  const [importJsonText, setImportJsonText] = useState("");
  const [importLoading, setImportLoading] = useState(false);

  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState(null);
  const [selectedArtistForModal, setSelectedArtistForModal] = useState(null);
  const [selectedAlbumForModal, setSelectedAlbumForModal] = useState(null);
  const [localRecentlyPlayed, setLocalRecentlyPlayed] = useState([]);
  const [downloadedTracks, setDownloadedTracks] = useState([]);
  const [publicPlaylists, setPublicPlaylists] = useState([]);
  const [playlistSubFilter, setPlaylistSubFilter] = useState("all"); // "all" | "my" | "public" | "collab"
  const [contextLoaded, setContextLoaded] = useState(false);
  const [tabLoading, setTabLoading] = useState(true);

  const { currentTrack, playTrack, setShuffle } = useAudioPlayback();

  useEffect(() => {
    if (rtdbPlaylists !== undefined || likedSongs !== undefined) {
      setContextLoaded(true);
    }
  }, [rtdbPlaylists, likedSongs]);

  // Subscribe to public playlists from RTDB & API
  useEffect(() => {
    let isMounted = true;
    api.getPublicPlaylists().then((res) => {
      if (isMounted && Array.isArray(res) && res.length > 0) {
        setPublicPlaylists(res.map((p) => ({ ...p, isPublic: true, is_public: true })));
      }
    }).catch(() => {});

    const unsub = subscribePublicPlaylists((list) => {
      if (!isMounted) return;
      if (Array.isArray(list) && list.length > 0) {
        setPublicPlaylists((prev) => {
          const map = new Map();
          for (const item of [...list, ...prev]) {
            if (item.id && !map.has(item.id)) map.set(item.id, item);
          }
          return Array.from(map.values());
        });
      }
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!contextLoaded) return;
    setTabLoading(true);
    const timer = setTimeout(() => setTabLoading(false), 200);
    return () => clearTimeout(timer);
  }, [activeTab, contextLoaded]);

  // Subscribe to listening history from Firebase RTDB
  useEffect(() => {
    const uid = currentUser?.uid || auth.currentUser?.uid || "guest";
    getRecentlyPlayed(uid).then((items) => {
      if (Array.isArray(items) && items.length > 0) {
        setLocalRecentlyPlayed(items);
      }
    }).catch(() => {});

    const unsub = subscribeRecentlyPlayed(uid, (items) => {
      if (Array.isArray(items)) {
        setLocalRecentlyPlayed(items);
      }
    });

    return () => unsub();
  }, [currentUser]);

  // Load and subscribe to downloaded offline songs
  useEffect(() => {
    setDownloadedTracks(getDownloadedTracks());
    const onDownloadsChanged = () => {
      setDownloadedTracks(getDownloadedTracks());
    };
    if (typeof window !== "undefined") {
      window.addEventListener("staytup-downloads-changed", onDownloadsChanged);
      return () => window.removeEventListener("staytup-downloads-changed", onDownloadsChanged);
    }
  }, []);

  // Merge regular and collab playlists
  const rawPlaylists = useMemo(() => {
    const seen = new Set();
    const collabOriginalIds = new Set();
    const collabNames = new Set();
    const result = [];

    for (const cp of collabPlaylists || []) {
      const id = String(cp.id || cp.collabId || "");
      if (id && !seen.has(id)) {
        seen.add(id);
        if (cp.originalPlaylistId) collabOriginalIds.add(String(cp.originalPlaylistId));
        if (cp.name) collabNames.add(String(cp.name).trim().toLowerCase());
        result.push({ ...cp, isCollab: true });
      }
    }

    for (const p of rtdbPlaylists || []) {
      const id = String(p.id || p.collabId || "");
      const nameKey = String(p.name || "").trim().toLowerCase();
      if (id && !seen.has(id) && !collabOriginalIds.has(id) && (!nameKey || !collabNames.has(nameKey))) {
        seen.add(id);
        result.push(p);
      }
    }

    for (const pub of publicPlaylists || []) {
      const id = String(pub.id || pub.collabId || "");
      if (id && !seen.has(id)) {
        seen.add(id);
        result.push({ ...pub, isPublic: true, is_public: true });
      }
    }

    return result;
  }, [rtdbPlaylists, collabPlaylists, publicPlaylists]);

  // Filtered & Sorted Playlists
  const playlists = useMemo(() => {
    let list = [...rawPlaylists];

    if (playlistSubFilter === "my") {
      list = list.filter((p) => !p.isPublic && !p.isCollab);
    } else if (playlistSubFilter === "public") {
      list = list.filter((p) => p.isPublic && !p.isCollab);
    } else if (playlistSubFilter === "collab") {
      list = list.filter((p) => p.isCollab);
    }

    if (activeFolder) {
      const idSet = new Set(activeFolder.playlistIds || []);
      list = list.filter((p) => idSet.has(String(p.id || p.collabId)));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q))
      );
    }

    if (sortBy === "alpha_asc") {
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (sortBy === "alpha_desc") {
      list.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
    } else if (sortBy === "track_count") {
      list.sort(
        (a, b) =>
          (b.tracks?.length || b.track_count || 0) -
          (a.tracks?.length || a.track_count || 0)
      );
    }

    return list;
  }, [rawPlaylists, activeFolder, searchQuery, sortBy]);

  // Liked Songs
  const favorites = useMemo(() => {
    let list = [...(likedSongs || [])];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (s) =>
          (s.title && s.title.toLowerCase().includes(q)) ||
          (s.artist && s.artist.toLowerCase().includes(q)) ||
          (s.album && s.album.toLowerCase().includes(q))
      );
    }
    if (sortBy === "alpha_asc") {
      list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    } else if (sortBy === "alpha_desc") {
      list.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
    }
    return list;
  }, [likedSongs, searchQuery, sortBy]);

  // Saved Albums
  const albums = useMemo(() => {
    let list = [...(savedAlbums || [])];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (al) =>
          (al.title && al.title.toLowerCase().includes(q)) ||
          (al.name && al.name.toLowerCase().includes(q)) ||
          (al.artist && al.artist.toLowerCase().includes(q))
      );
    }
    if (sortBy === "alpha_asc") {
      list.sort((a, b) => (a.title || a.name || "").localeCompare(b.title || b.name || ""));
    } else if (sortBy === "alpha_desc") {
      list.sort((a, b) => (b.title || b.name || "").localeCompare(a.title || a.name || ""));
    }
    return list;
  }, [savedAlbums, searchQuery, sortBy]);

  // Followed Artists
  const followedArtists = useMemo(() => {
    const raw = userProfile?.favoriteArtists || [];
    let list = raw.map((item) => {
      const name = typeof item === "string" ? item : item?.name || "";
      const avatar = typeof item === "object" ? item?.image || item?.avatar || "" : "";
      return { name, avatar };
    }).filter((a) => a.name);

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [userProfile?.favoriteArtists, searchQuery]);

  // History
  const rawHistory = localRecentlyPlayed.length > 0 ? localRecentlyPlayed : (rtdbRecentlyPlayed || []);
  const mergedHistory = useMemo(() => {
    const map = new Map();
    for (const item of rawHistory) {
      const id = item.video_id || item.videoId;
      if (!id) continue;
      if (!map.has(id)) {
        map.set(id, {
          ...item,
          videoId: id,
          video_id: id,
          play_count: item.play_count || 1,
          last_played: item.playedAt || item.played_at || item.timestamp || 0,
        });
      } else {
        const existing = map.get(id);
        existing.play_count = (existing.play_count || 1) + 1;
        const itemTime = item.playedAt || item.played_at || item.timestamp;
        if (itemTime && (!existing.last_played || itemTime > existing.last_played)) {
          existing.last_played = itemTime;
        }
      }
    }
    let list = Array.from(map.values()).sort((a, b) => {
      return new Date(b.last_played || 0).getTime() - new Date(a.last_played || 0).getTime();
    });

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (item) =>
          (item.title && item.title.toLowerCase().includes(q)) ||
          (item.artist && item.artist.toLowerCase().includes(q))
      );
    }
    return list;
  }, [rawHistory, searchQuery]);

  // Recently Added Tracks (Across Liked Songs and Playlists)
  const recentlyAddedTracks = useMemo(() => {
    const list = [...(likedSongs || [])];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return list.filter(
        (s) =>
          (s.title && s.title.toLowerCase().includes(q)) ||
          (s.artist && s.artist.toLowerCase().includes(q))
      );
    }
    return list;
  }, [likedSongs, searchQuery]);

  // Filtered Downloaded Songs
  const filteredDownloaded = useMemo(() => {
    let list = [...downloadedTracks];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (t) =>
          (t.title && t.title.toLowerCase().includes(q)) ||
          (t.artist && t.artist.toLowerCase().includes(q))
      );
    }
    return list;
  }, [downloadedTracks, searchQuery]);

  // Filtered Folders
  const folders = useMemo(() => {
    let list = [...(playlistFolders || [])];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((f) => f.name && f.name.toLowerCase().includes(q));
    }
    return list;
  }, [playlistFolders, searchQuery]);

  const removeFromHistory = useCallback(
    async (track) => {
      const uid = currentUser?.uid || auth.currentUser?.uid || "guest";
      const vid = track.video_id || track.videoId;
      if (!vid) return;
      setLocalRecentlyPlayed((prev) => prev.filter((t) => (t.video_id || t.videoId) !== vid));
      try {
        await removeRecentlyPlayed(uid, vid);
      } catch (err) {
        console.warn("Failed to remove from history:", err);
      }
    },
    [currentUser]
  );

  const openPlaylist = (playlist) => {
    setSelectedPlaylist(playlist);
  };

  const handleCreatePlaylist = async (name, coverUrl = "") => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    try {
      const res = await createPlaylist(trimmed, "", [], coverUrl);
      if (res) {
        setShowCreateModal(false);
        openPlaylist(res);
      }
    } catch (err) {
      console.warn("Failed to create playlist:", err);
    }
  };

  const handleCreateFolder = async () => {
    const trimmed = (newFolderName || "").trim();
    if (!trimmed) return;
    try {
      await createFolder(trimmed, newFolderColor);
      setNewFolderName("");
      setShowFolderModal(false);
    } catch (err) {
      console.warn("Failed to create folder:", err);
    }
  };

  const handleImportBackup = async () => {
    if (!importJsonText.trim()) return;
    setImportLoading(true);
    try {
      const parsed = JSON.parse(importJsonText.trim());
      const name = parsed.name || "Restored Playlist";
      const tracks = parsed.tracks || [];
      const description = parsed.description || "Restored from backup";
      const coverUrl = parsed.cover_url || "";

      const res = await createPlaylist(name, description, tracks, coverUrl);
      if (res) {
        setImportJsonText("");
        setShowImportModal(false);
        openPlaylist(res);
      }
    } catch (err) {
      setLibraryToast("Invalid JSON playlist backup. Please verify your file contents.");
    } finally {
      setImportLoading(false);
    }
  };

  const handleDeletePlaylist = async (playlistId) => {
    try {
      if (deletePlaylist) await deletePlaylist(playlistId);
      setSelectedPlaylist(null);
    } catch (err) {
      console.warn("Failed to delete playlist:", err);
    }
  };

  const handleRemoveTrack = async (playlistId, videoId) => {
    try {
      await removeTrackFromPlaylist(playlistId, videoId);
      setSelectedPlaylist((prev) => {
        if (!prev) return null;
        const updatedTracks = (prev.tracks || []).filter(
          (t) => (t.video_id || t.videoId) !== videoId
        );
        return { ...prev, tracks: updatedTracks, track_count: updatedTracks.length };
      });
    } catch (err) {
      console.warn("Failed to remove track:", err);
    }
  };

  const handlePlayWholePlaylist = (tracks, startIndex = 0) => {
    if (!tracks || tracks.length === 0) return;
    const formatted = tracks.map((t) => ({
      ...t,
      videoId: t.video_id || t.videoId,
    }));
    playTrack(formatted[startIndex], formatted, startIndex);
  };

  const handleShufflePlaylist = (tracks) => {
    if (!tracks || tracks.length === 0) return;
    const formatted = tracks.map((t) => ({
      ...t,
      videoId: t.video_id || t.videoId,
    }));
    const shuffled = fisherYatesShuffle(formatted);
    if (setShuffle) setShuffle(true);
    playTrack(shuffled[0], shuffled, 0);
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="#000000" barStyle="light-content" />

      {/* Header Profile Row */}
      <View style={styles.header}>
        <View style={[styles.headerInner, (isDesktop || isTablet) && styles.desktopHeaderInner]}>
          <View style={styles.profileRow}>
            <Text style={styles.profileName}>Your Library</Text>

            <View style={styles.headerRightGroup}>
              {/* + Create Options Dropdown */}
              <TouchableOpacity
                style={styles.headerAddBtn}
                onPress={() => setShowCreateMenu(true)}
                activeOpacity={0.75}
                accessibilityLabel="Create"
              >
                <Ionicons name="add" size={20} color="#FFFFFF" />
              </TouchableOpacity>

              {/* User Avatar */}
              <TouchableOpacity
                style={[
                  styles.avatarContainer,
                  userProfile?.avatarColor && { backgroundColor: userProfile.avatarColor },
                ]}
                onPress={() => openProfile && openProfile()}
                activeOpacity={0.75}
              >
                {(() => {
                  const av = userProfile?.avatar;
                  if (av && av.startsWith("memoji_")) {
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
                    const src = memojiMap[av];
                    if (src) return <Image source={src} style={styles.avatarImage} resizeMode="cover" />;
                  }
                  if (av && av.startsWith("http") && !av.includes("googleusercontent.com")) {
                    return <Image source={{ uri: av }} style={styles.avatarImage} resizeMode="cover" />;
                  }
                  return <Text style={styles.avatarText}>{(userProfile?.username?.[0] || "U").toUpperCase()}</Text>;
                })()}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      <View style={[styles.libraryInner, (isDesktop || isTablet) && styles.desktopLibraryInner]}>
        {/* Navigation Tabs Bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
          style={styles.tabsRowContainer}
        >
          <TouchableOpacity
            style={[styles.tabButton, activeTab === "playlists" && styles.activeTabButton]}
            onPress={() => {
              setActiveTab("playlists");
              setActiveFolder(null);
            }}
          >
            <Text style={[styles.tabText, activeTab === "playlists" && styles.activeTabText]}>
              Playlists ({rawPlaylists.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === "favorites" && styles.activeTabButton]}
            onPress={() => {
              setActiveTab("favorites");
              setActiveFolder(null);
            }}
          >
            <Text style={[styles.tabText, activeTab === "favorites" && styles.activeTabText]}>
              Liked Songs ({likedSongs?.length || 0})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === "albums" && styles.activeTabButton]}
            onPress={() => {
              setActiveTab("albums");
              setActiveFolder(null);
            }}
          >
            <Text style={[styles.tabText, activeTab === "albums" && styles.activeTabText]}>
              Albums ({savedAlbums.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === "artists" && styles.activeTabButton]}
            onPress={() => {
              setActiveTab("artists");
              setActiveFolder(null);
            }}
          >
            <Text style={[styles.tabText, activeTab === "artists" && styles.activeTabText]}>
              Artists ({followedArtists.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === "history" && styles.activeTabButton]}
            onPress={() => {
              setActiveTab("history");
              setActiveFolder(null);
            }}
          >
            <Text style={[styles.tabText, activeTab === "history" && styles.activeTabText]}>
              Recently Played
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === "recent_added" && styles.activeTabButton]}
            onPress={() => {
              setActiveTab("recent_added");
              setActiveFolder(null);
            }}
          >
            <Text style={[styles.tabText, activeTab === "recent_added" && styles.activeTabText]}>
              Recently Added
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === "downloaded" && styles.activeTabButton]}
            onPress={() => {
              setActiveTab("downloaded");
              setActiveFolder(null);
            }}
          >
            <Text style={[styles.tabText, activeTab === "downloaded" && styles.activeTabText]}>
              Downloaded ({downloadedTracks.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === "folders" && styles.activeTabButton]}
            onPress={() => {
              setActiveTab("folders");
              setActiveFolder(null);
            }}
          >
            <Text style={[styles.tabText, activeTab === "folders" && styles.activeTabText]}>
              Folders ({playlistFolders.length})
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Search & Sort Toolbar */}
        <View style={styles.toolbarRow}>
          <View style={styles.searchBarWrap}>
            <Ionicons name="search" size={15} color={colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={`Search ${
                activeTab === "favorites"
                  ? "liked songs"
                  : activeTab === "playlists"
                  ? "playlists"
                  : activeTab === "albums"
                  ? "albums"
                  : activeTab === "artists"
                  ? "artists"
                  : activeTab === "downloaded"
                  ? "downloaded songs"
                  : activeTab === "folders"
                  ? "folders"
                  : "library"
              }...`}
              placeholderTextColor="rgba(255, 255, 255, 0.4)"
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")} style={styles.clearSearchBtn}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.sortBtn}
            onPress={() => setShowSortModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="swap-vertical" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={styles.sortBtnText}>
              {sortBy === "recent_added"
                ? "Recent"
                : sortBy === "alpha_asc"
                ? "A - Z"
                : sortBy === "alpha_desc"
                ? "Z - A"
                : sortBy === "track_count"
                ? "Tracks"
                : "Sort"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Active Folder Breadcrumb */}
        {activeFolder && (
          <View style={styles.folderBreadcrumb}>
            <TouchableOpacity
              style={styles.breadcrumbBackBtn}
              onPress={() => setActiveFolder(null)}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={16} color={colors.primary} />
              <Text style={styles.breadcrumbBackText}>All Playlists</Text>
            </TouchableOpacity>
            <Text style={styles.breadcrumbDivider}>/</Text>
            <View style={[styles.breadcrumbBadge, { backgroundColor: activeFolder.color || "#1DB954" }]}>
              <Ionicons name="folder" size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.breadcrumbBadgeText}>{activeFolder.name}</Text>
            </View>
            <TouchableOpacity
              style={styles.folderBreadcrumbDeleteBtn}
              onPress={() => setFolderToDelete(activeFolder)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
              accessibilityLabel="Delete folder"
            >
              <Ionicons name="trash-outline" size={14} color="#FF453A" />
            </TouchableOpacity>
          </View>
        )}

        {/* Tab Content */}
        <View style={{ flex: 1, justifyContent: "flex-start" }}>
          {tabLoading ? (
            <LibrarySkeleton type={activeTab} />
          ) : activeTab === "playlists" ? (
            /* Playlists List */
            <>
              {/* Playlist Sub-filter Pills */}
              <View style={styles.subFilterRowContainer}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.subFilterContent}
                >
                  {[
                    { key: "all", label: "All" },
                    { key: "my", label: "My Playlists" },
                    { key: "public", label: "Public" },
                    { key: "collab", label: "Collab" },
                  ].map((f) => {
                    const isActive = playlistSubFilter === f.key;
                    return (
                      <TouchableOpacity
                        key={f.key}
                        onPress={() => setPlaylistSubFilter(f.key)}
                        activeOpacity={0.75}
                        style={[
                          styles.subFilterPill,
                          isActive && styles.subFilterPillActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.subFilterText,
                            isActive && styles.subFilterTextActive,
                          ]}
                        >
                          {f.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
              <FlatList
                data={playlists}
                keyExtractor={(item, index) => `${item.id || item.collabId || "pl"}_${index}`}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const playlistCover =
                    item.cover_url ||
                    item.preview_artwork ||
                    item.tracks?.[0]?.artwork_url ||
                    item.tracks?.[0]?.thumbnail ||
                    "";
                  const trackCount = Array.isArray(item.tracks) ? item.tracks.length : item.track_count || 0;

                  return (
                    <TouchableOpacity
                      style={styles.playlistCardRow}
                      onPress={() => openPlaylist(item)}
                      activeOpacity={0.7}
                    >
                      {playlistCover ? (
                        <Image
                          source={{ uri: getHighResArtwork(playlistCover) || playlistCover }}
                          style={styles.playlistRowThumb}
                        />
                      ) : (
                        <View style={[styles.playlistRowThumb, styles.playlistRowThumbFallback]}>
                          <Ionicons name="musical-notes" size={24} color={colors.primary} />
                        </View>
                      )}
                      <View style={styles.playlistRowInfo}>
                        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
                          <Text style={styles.playlistRowTitle} numberOfLines={1}>
                            {item.name}
                          </Text>
                          {item.isBlend ||
                          item.type === "blend" ||
                          String(item.name || "").startsWith("Blend:") ? (
                            <View style={[styles.collabBadgePill, { borderColor: "rgba(139, 92, 246, 0.4)", backgroundColor: "rgba(139, 92, 246, 0.12)" }]}>
                              <Ionicons name="flash" size={10} color="#8B5CF6" style={{ marginRight: 3 }} />
                              <Text style={[styles.collabBadgeText, { color: "#8B5CF6" }]}>Blend</Text>
                            </View>
                          ) : item.isCollab ? (
                            <View style={styles.collabBadgePill}>
                              <Ionicons name="people" size={10} color="#1DB954" style={{ marginRight: 3 }} />
                              <Text style={styles.collabBadgeText}>Collab</Text>
                            </View>
                          ) : item.isPublic ? (
                            <View style={[styles.collabBadgePill, { borderColor: "rgba(59, 130, 246, 0.4)", backgroundColor: "rgba(59, 130, 246, 0.12)" }]}>
                              <Ionicons name="globe-outline" size={10} color="#3B82F6" style={{ marginRight: 3 }} />
                              <Text style={[styles.collabBadgeText, { color: "#3B82F6" }]}>Public</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.playlistRowCount}>
                          {item.isPublic && !item.isCollab ? "Public • " : ""}
                          {trackCount} {trackCount === 1 ? "track" : "tracks"}
                          {item.description ? ` • ${item.description}` : ""}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <TouchableOpacity
                          style={styles.folderRowActionBtn}
                          onPress={(e) => {
                            e?.stopPropagation?.();
                            setFolderSelectPlaylist(item);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          activeOpacity={0.7}
                          accessibilityLabel="Organize into folder"
                        >
                          <Ionicons
                            name={(playlistFolders || []).some((f) => Array.isArray(f.playlistIds) && f.playlistIds.includes(item.id)) ? "folder" : "folder-outline"}
                            size={18}
                            color={(playlistFolders || []).some((f) => Array.isArray(f.playlistIds) && f.playlistIds.includes(item.id)) ? "#1DB954" : colors.textMuted}
                          />
                        </TouchableOpacity>
                        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name="folder-open-outline" size={44} color={colors.textMuted} />
                    <Text style={styles.emptyText}>No playlists found</Text>
                    <Text style={styles.emptySub}>
                      {searchQuery ? "Try a different search query" : "Tap '+' at the top right to create your first playlist!"}
                    </Text>
                  </View>
                }
                ListFooterComponent={<View style={{ height: isDesktop || isTablet ? 24 : 140 }} />}
              />
            </>
          ) : activeTab === "favorites" ? (
            /* Liked Songs List */
            <FlatList
              data={favorites}
              keyExtractor={(item, index) => `${item.video_id || item.videoId}_${index}`}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <View style={styles.playlistsListHeader}>
                  <View>
                    <Text style={[styles.sectionHeader, { marginBottom: 2 }]}>Liked Songs</Text>
                    <Text style={styles.sectionSubHeader}>
                      {favorites.length} {favorites.length === 1 ? "song" : "songs"}
                    </Text>
                  </View>
                  {favorites.length > 0 && (
                    <View style={styles.headerButtonsRow}>
                      <TouchableOpacity
                        style={styles.playAllSmallBtn}
                        onPress={() => handlePlayWholePlaylist(favorites, 0)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="play" size={16} color="#000000" style={{ marginRight: 4 }} />
                        <Text style={styles.playAllSmallBtnText}>Play All</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.shuffleSmallBtn}
                        onPress={() => handleShufflePlaylist(favorites)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="shuffle" size={18} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              }
              renderItem={({ item, index }) => (
                <SongCard
                  track={{ ...item, videoId: item.video_id || item.videoId }}
                  layout="row"
                  showRank={false}
                  showDuration={false}
                  style={{ paddingHorizontal: 0 }}
                  isActive={currentTrack?.videoId === (item.video_id || item.videoId)}
                  onAddToPlaylist={(t) => setAddToPlaylistTrack(t)}
                  onPress={() =>
                    playTrack(
                      { ...item, videoId: item.video_id || item.videoId },
                      favorites.map((f) => ({ ...f, videoId: f.video_id || f.videoId })),
                      index
                    )
                  }
                />
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="heart-outline" size={44} color={colors.textMuted} />
                  <Text style={styles.emptyText}>No liked songs found</Text>
                  <Text style={styles.emptySub}>
                    Tap the heart icon on any song to save it to your library!
                  </Text>
                </View>
              }
              ListFooterComponent={<View style={{ height: isDesktop || isTablet ? 24 : 140 }} />}
            />
          ) : activeTab === "albums" ? (
            /* Saved Albums List */
            <FlatList
              data={albums}
              keyExtractor={(item, index) => `${item.id || item.album_id}_${index}`}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const cover = item.image || item.artwork_url || "";
                return (
                  <TouchableOpacity
                    style={styles.playlistCardRow}
                    onPress={() => setSelectedAlbumForModal(item)}
                    activeOpacity={0.7}
                  >
                    {cover ? (
                      <Image source={{ uri: getHighResArtwork(cover) || cover }} style={styles.playlistRowThumb} />
                    ) : (
                      <View style={[styles.playlistRowThumb, styles.playlistRowThumbFallback]}>
                        <Ionicons name="disc" size={24} color={colors.primary} />
                      </View>
                    )}
                    <View style={styles.playlistRowInfo}>
                      <Text style={styles.playlistRowTitle} numberOfLines={1}>
                        {item.title || item.name}
                      </Text>
                      <Text style={styles.playlistRowCount} numberOfLines={1}>
                        {item.artist || "Various Artists"}{item.year ? ` • ${item.year}` : ""}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="disc-outline" size={44} color={colors.textMuted} />
                  <Text style={styles.emptyText}>No saved albums</Text>
                  <Text style={styles.emptySub}>
                    Explore search or artist profiles and save albums to your library!
                  </Text>
                </View>
              }
              ListFooterComponent={<View style={{ height: isDesktop || isTablet ? 24 : 140 }} />}
            />
          ) : activeTab === "artists" ? (
            /* Followed Artists List */
            <FlatList
              data={followedArtists}
              keyExtractor={(item, index) => `${item.name}_${index}`}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.playlistCardRow}
                  onPress={() => setSelectedArtistForModal(item.name)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.playlistRowThumb, { borderRadius: 24, backgroundColor: colors.surface }]}>
                    <Ionicons name="person" size={22} color={colors.primary} />
                  </View>
                  <View style={styles.playlistRowInfo}>
                    <Text style={styles.playlistRowTitle} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.playlistRowCount}>Artist</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="people-outline" size={44} color={colors.textMuted} />
                  <Text style={styles.emptyText}>No followed artists</Text>
                  <Text style={styles.emptySub}>
                    Follow your favorite artists to stay tuned with their latest releases.
                  </Text>
                </View>
              }
              ListFooterComponent={<View style={{ height: isDesktop || isTablet ? 24 : 140 }} />}
            />
          ) : activeTab === "history" ? (
            /* Listening History List */
            <FlatList
              data={mergedHistory}
              keyExtractor={(item, index) => `${item.video_id || item.videoId}_${index}`}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <View style={styles.playlistsListHeader}>
                  <View>
                    <Text style={[styles.sectionHeader, { marginBottom: 2 }]}>Recently Played</Text>
                    <Text style={styles.sectionSubHeader}>
                      {mergedHistory.length} {mergedHistory.length === 1 ? "track" : "tracks"}
                    </Text>
                  </View>
                  {mergedHistory.length > 0 && (
                    <View style={styles.headerButtonsRow}>
                      <TouchableOpacity
                        style={styles.playAllSmallBtn}
                        onPress={() =>
                          handlePlayWholePlaylist(
                            mergedHistory.map((h) => ({ ...h, videoId: h.video_id || h.videoId })),
                            0
                          )
                        }
                        activeOpacity={0.8}
                      >
                        <Ionicons name="play" size={16} color="#000000" style={{ marginRight: 4 }} />
                        <Text style={styles.playAllSmallBtnText}>Play All</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.shuffleSmallBtn}
                        onPress={() =>
                          handleShufflePlaylist(
                            mergedHistory.map((h) => ({ ...h, videoId: h.video_id || h.videoId }))
                          )
                        }
                        activeOpacity={0.8}
                      >
                        <Ionicons name="shuffle" size={18} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              }
              renderItem={({ item, index }) => (
                <SongCard
                  track={{
                    ...item,
                    videoId: item.video_id || item.videoId,
                  }}
                  layout="row"
                  showRank={false}
                  showPlayButton={false}
                  showDuration={false}
                  style={{ paddingHorizontal: 0 }}
                  isActive={currentTrack?.videoId === (item.video_id || item.videoId)}
                  onAddToPlaylist={(t) => setAddToPlaylistTrack(t)}
                  onRemove={() => removeFromHistory(item)}
                  onPress={() =>
                    playTrack(
                      { ...item, videoId: item.video_id || item.videoId },
                      mergedHistory.map((h) => ({ ...h, videoId: h.video_id || h.videoId })),
                      index
                    )
                  }
                />
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="time-outline" size={44} color={colors.textMuted} />
                  <Text style={styles.emptyText}>No listening history</Text>
                  <Text style={styles.emptySub}>
                    Tracks you play will appear here and shape your daily feed.
                  </Text>
                </View>
              }
              ListFooterComponent={<View style={{ height: isDesktop || isTablet ? 24 : 140 }} />}
            />
          ) : activeTab === "recent_added" ? (
            /* Recently Added List */
            <FlatList
              data={recentlyAddedTracks}
              keyExtractor={(item, index) => `${item.video_id || item.videoId}_${index}`}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <View style={styles.playlistsListHeader}>
                  <View>
                    <Text style={[styles.sectionHeader, { marginBottom: 2 }]}>Recently Added</Text>
                    <Text style={styles.sectionSubHeader}>
                      {recentlyAddedTracks.length} {recentlyAddedTracks.length === 1 ? "track" : "tracks"}
                    </Text>
                  </View>
                  {recentlyAddedTracks.length > 0 && (
                    <View style={styles.headerButtonsRow}>
                      <TouchableOpacity
                        style={styles.playAllSmallBtn}
                        onPress={() => handlePlayWholePlaylist(recentlyAddedTracks, 0)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="play" size={16} color="#000000" style={{ marginRight: 4 }} />
                        <Text style={styles.playAllSmallBtnText}>Play All</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              }
              renderItem={({ item, index }) => (
                <SongCard
                  track={{ ...item, videoId: item.video_id || item.videoId }}
                  layout="row"
                  showRank={false}
                  showDuration={false}
                  style={{ paddingHorizontal: 0 }}
                  isActive={currentTrack?.videoId === (item.video_id || item.videoId)}
                  onAddToPlaylist={(t) => setAddToPlaylistTrack(t)}
                  onPress={() =>
                    playTrack(
                      { ...item, videoId: item.video_id || item.videoId },
                      recentlyAddedTracks.map((r) => ({ ...r, videoId: r.video_id || r.videoId })),
                      index
                    )
                  }
                />
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="calendar-outline" size={44} color={colors.textMuted} />
                  <Text style={styles.emptyText}>No recently added tracks</Text>
                </View>
              }
              ListFooterComponent={<View style={{ height: isDesktop || isTablet ? 24 : 140 }} />}
            />
          ) : activeTab === "downloaded" ? (
            /* Downloaded Offline Songs List */
            <FlatList
              data={filteredDownloaded}
              keyExtractor={(item, index) => `${item.videoId || item.video_id}_${index}`}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <View style={styles.downloadedHeaderCard}>
                  <View style={styles.downloadedMetaRow}>
                    <View>
                      <Text style={styles.downloadedTitle}>Offline Downloads</Text>
                      <Text style={styles.downloadedSubtitle}>
                        {downloadedTracks.length} tracks • {getOfflineStorageFormatted()} storage used
                      </Text>
                    </View>
                    {downloadedTracks.length > 0 && (
                      <TouchableOpacity
                        style={styles.clearDownloadsBtn}
                        onPress={() => clearAllDownloads()}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.error} style={{ marginRight: 4 }} />
                        <Text style={styles.clearDownloadsText}>Clear All</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {downloadedTracks.length > 0 && (
                    <View style={[styles.headerButtonsRow, { marginTop: 12 }]}>
                      <TouchableOpacity
                        style={styles.playAllSmallBtn}
                        onPress={() => handlePlayWholePlaylist(downloadedTracks, 0)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="play" size={16} color="#000000" style={{ marginRight: 4 }} />
                        <Text style={styles.playAllSmallBtnText}>Play All Offline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.shuffleSmallBtn}
                        onPress={() => handleShufflePlaylist(downloadedTracks)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="shuffle" size={18} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              }
              renderItem={({ item, index }) => (
                <SongCard
                  track={{ ...item, videoId: item.videoId || item.video_id }}
                  layout="row"
                  showRank={false}
                  showDuration={false}
                  style={{ paddingHorizontal: 0 }}
                  isActive={currentTrack?.videoId === (item.videoId || item.video_id)}
                  onAddToPlaylist={(t) => setAddToPlaylistTrack(t)}
                  onPress={() =>
                    playTrack(
                      { ...item, videoId: item.videoId || item.video_id },
                      downloadedTracks.map((d) => ({ ...d, videoId: d.videoId || d.video_id })),
                      index
                    )
                  }
                />
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="cloud-offline-outline" size={44} color={colors.textMuted} />
                  <Text style={styles.emptyText}>No downloaded songs</Text>
                  <Text style={styles.emptySub}>
                    Download any song or album to listen offline without internet connectivity!
                  </Text>
                </View>
              }
              ListFooterComponent={<View style={{ height: isDesktop || isTablet ? 24 : 140 }} />}
            />
          ) : (
            /* Folders List */
            <FlatList
              data={folders}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const count = item.playlistIds?.length || 0;
                return (
                  <TouchableOpacity
                    style={styles.playlistCardRow}
                    onPress={() => {
                      setActiveFolder(item);
                      setActiveTab("playlists");
                    }}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.playlistRowThumb,
                        { backgroundColor: item.color || "#1DB954", alignItems: "center", justifyContent: "center" },
                      ]}
                    >
                      <Ionicons name="folder" size={24} color="#FFFFFF" />
                    </View>
                    <View style={styles.playlistRowInfo}>
                      <Text style={styles.playlistRowTitle} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.playlistRowCount}>
                        {count} {count === 1 ? "playlist" : "playlists"}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.folderDeleteBtn}
                      onPress={() => setFolderToDelete(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="folder-outline" size={44} color={colors.textMuted} />
                  <Text style={styles.emptyText}>No folders created yet</Text>
                  <Text style={styles.emptySub}>
                    Create folders to organize your playlists into custom groups.
                  </Text>
                </View>
              }
              ListFooterComponent={<View style={{ height: isDesktop || isTablet ? 24 : 140 }} />}
            />
          )}
        </View>
      </View>

      {/* Header + Dropdown Modal */}
      <Modal visible={showCreateMenu} transparent={true} animationType="fade" onRequestClose={() => setShowCreateMenu(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowCreateMenu(false)}>
          <View style={[styles.createMenuCard, (isDesktop || isTablet) && styles.desktopCreateMenuCard]}>
            <Text style={styles.createMenuTitle}>Create / Add</Text>
            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                setShowCreateMenu(false);
                setShowCreateModal(true);
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="musical-notes-outline" size={20} color={colors.primary} style={styles.menuRowIcon} />
              <View>
                <Text style={styles.menuRowTitle}>New Playlist</Text>
                <Text style={styles.menuRowSub}>Create a custom playlist</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                setShowCreateMenu(false);
                setShowFolderModal(true);
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="folder-outline" size={20} color="#3B82F6" style={styles.menuRowIcon} />
              <View>
                <Text style={styles.menuRowTitle}>New Folder</Text>
                <Text style={styles.menuRowSub}>Group playlists together</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                setShowCreateMenu(false);
                setShowImportModal(true);
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="cloud-upload-outline" size={20} color="#EAB308" style={styles.menuRowIcon} />
              <View>
                <Text style={styles.menuRowTitle}>Import / Restore Backup</Text>
                <Text style={styles.menuRowSub}>Restore playlist from .json</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Create Folder Modal */}
      <Modal visible={showFolderModal} transparent={true} animationType="fade" onRequestClose={() => setShowFolderModal(false)}>
        <View style={styles.menuOverlay}>
          <View style={styles.folderModalCard}>
            <Text style={styles.folderModalTitle}>New Playlist Folder</Text>
            <TextInput
              style={styles.folderInput}
              placeholder="Folder name"
              placeholderTextColor="rgba(255, 255, 255, 0.4)"
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus={true}
            />

            <Text style={styles.colorLabel}>Select Color:</Text>
            <View style={styles.colorPickerRow}>
              {FOLDER_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorCircle,
                    { backgroundColor: c },
                    newFolderColor === c && styles.selectedColorCircle,
                  ]}
                  onPress={() => setNewFolderColor(c)}
                  activeOpacity={0.8}
                />
              ))}
            </View>

            <View style={styles.folderModalButtons}>
              <TouchableOpacity
                style={styles.folderCancelBtn}
                onPress={() => setShowFolderModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.folderCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.folderCreateBtn, !newFolderName.trim() && { opacity: 0.5 }]}
                onPress={handleCreateFolder}
                disabled={!newFolderName.trim()}
                activeOpacity={0.8}
              >
                <Text style={styles.folderCreateText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Organize / Add to Folder Modal */}
      <Modal visible={Boolean(folderSelectPlaylist)} transparent={true} animationType="fade" onRequestClose={() => setFolderSelectPlaylist(null)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setFolderSelectPlaylist(null)}>
          <View style={styles.folderSelectCard} onStartShouldSetResponder={() => true}>
            <View style={styles.folderSelectHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.folderModalTitle}>Add to Folder</Text>
                <Text style={styles.folderSelectSub} numberOfLines={1}>{folderSelectPlaylist?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setFolderSelectPlaylist(null)} style={styles.folderCloseBtn}>
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {(!playlistFolders || playlistFolders.length === 0) ? (
                <View style={styles.folderEmptyPicker}>
                  <Ionicons name="folder-open-outline" size={38} color={colors.textMuted} />
                  <Text style={styles.folderEmptyPickerText}>No folders created yet</Text>
                  <Text style={styles.folderEmptyPickerSub}>Create a folder to organize your playlists.</Text>
                </View>
              ) : (
                playlistFolders.map((f) => {
                  const isInFolder = Array.isArray(f.playlistIds) && f.playlistIds.includes(folderSelectPlaylist?.id);
                  return (
                    <TouchableOpacity
                      key={f.id}
                      style={[styles.folderPickerRow, isInFolder && styles.folderPickerRowActive]}
                      onPress={async () => {
                        if (!folderSelectPlaylist) return;
                        if (isInFolder) {
                          await removePlaylistFromFolder?.(f.id, folderSelectPlaylist.id);
                        } else {
                          await addPlaylistToFolder?.(f.id, folderSelectPlaylist.id);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.folderPickerIcon, { backgroundColor: f.color || "#1DB954" }]}>
                        <Ionicons name="folder" size={16} color="#FFFFFF" />
                      </View>
                      <View style={{ flex: 1, marginHorizontal: 12 }}>
                        <Text style={styles.folderPickerName} numberOfLines={1}>{f.name}</Text>
                        <Text style={styles.folderPickerCount}>
                          {(f.playlistIds || []).length} {(f.playlistIds || []).length === 1 ? "playlist" : "playlists"}
                        </Text>
                      </View>
                      <Ionicons
                        name={isInFolder ? "checkmark-circle" : "ellipse-outline"}
                        size={22}
                        color={isInFolder ? "#1DB954" : "rgba(255, 255, 255, 0.3)"}
                      />
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.folderCreateInlineBtn}
              onPress={() => {
                setNewFolderName("");
                setNewFolderColor(FOLDER_COLORS[0]);
                setShowFolderModal(true);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle-outline" size={20} color="#1DB954" style={{ marginRight: 6 }} />
              <Text style={styles.folderCreateInlineText}>Create New Folder</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.folderDoneBtn}
              onPress={() => setFolderSelectPlaylist(null)}
              activeOpacity={0.8}
            >
              <Text style={styles.folderDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Delete Folder Confirmation Modal */}
      <Modal visible={Boolean(folderToDelete)} transparent={true} animationType="fade" onRequestClose={() => setFolderToDelete(null)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setFolderToDelete(null)}>
          <View style={styles.folderDeleteConfirmCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.folderModalTitle}>Delete Folder?</Text>
            <Text style={styles.folderDeleteConfirmSub}>
              Are you sure you want to delete "{folderToDelete?.name}"? Your playlists will not be deleted.
            </Text>
            <View style={styles.folderModalButtons}>
              <TouchableOpacity
                style={styles.folderCancelBtn}
                onPress={() => setFolderToDelete(null)}
                activeOpacity={0.7}
              >
                <Text style={styles.folderCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.folderCreateBtn, { backgroundColor: "#FF453A" }]}
                onPress={async () => {
                  if (folderToDelete) {
                    await deleteFolder?.(folderToDelete.id);
                    if (activeFolder?.id === folderToDelete.id) {
                      setActiveFolder(null);
                    }
                    setFolderToDelete(null);
                  }
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.folderCreateText, { color: "#FFFFFF" }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Toast Notice Banner */}
      {Boolean(libraryToast) && (
        <View style={styles.libraryToastBanner}>
          <Ionicons name="information-circle" size={18} color="#1DB954" style={{ marginRight: 8 }} />
          <Text style={styles.libraryToastText}>{libraryToast}</Text>
          <TouchableOpacity onPress={() => setLibraryToast("")} style={{ marginLeft: 12 }}>
            <Ionicons name="close" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* Sort Options Modal */}
      <Modal visible={showSortModal} transparent={true} animationType="fade" onRequestClose={() => setShowSortModal(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowSortModal(false)}>
          <View style={styles.sortModalCard}>
            <Text style={styles.sortModalTitle}>Sort By</Text>
            <View style={styles.menuDivider} />

            {[
              { id: "recent_added", label: "Recently Added" },
              { id: "alpha_asc", label: "Alphabetical (A - Z)" },
              { id: "alpha_desc", label: "Alphabetical (Z - A)" },
              { id: "track_count", label: "Track Count" },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={styles.sortRow}
                onPress={() => {
                  setSortBy(opt.id);
                  setShowSortModal(false);
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.sortRowText, sortBy === opt.id && { color: colors.primary, fontFamily: fonts.bold }]}>
                  {opt.label}
                </Text>
                {sortBy === opt.id && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Import / Restore Playlist Backup Modal */}
      <Modal visible={showImportModal} transparent={true} animationType="fade" onRequestClose={() => setShowImportModal(false)}>
        <View style={styles.menuOverlay}>
          <View style={styles.importModalCard}>
            <Text style={styles.folderModalTitle}>Restore Playlist Backup</Text>
            <Text style={styles.importModalSub}>
              Paste your exported Staytup playlist JSON backup below to restore all tracks:
            </Text>
            <TextInput
              style={styles.importJsonInput}
              placeholder='Paste JSON here: {"name": "My Playlist", "tracks": [...]}'
              placeholderTextColor="rgba(255, 255, 255, 0.3)"
              multiline={true}
              numberOfLines={6}
              value={importJsonText}
              onChangeText={setImportJsonText}
            />

            <View style={styles.folderModalButtons}>
              <TouchableOpacity
                style={styles.folderCancelBtn}
                onPress={() => setShowImportModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.folderCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.folderCreateBtn, (!importJsonText.trim() || importLoading) && { opacity: 0.5 }]}
                onPress={handleImportBackup}
                disabled={!importJsonText.trim() || importLoading}
                activeOpacity={0.8}
              >
                {importLoading ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={styles.folderCreateText}>Restore</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modals */}
      <CreatePlaylistModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreatePlaylist}
        existingPlaylists={rawPlaylists}
      />

      <AddToPlaylistModal
        visible={!!addToPlaylistTrack}
        onClose={() => setAddToPlaylistTrack(null)}
        track={addToPlaylistTrack}
        onSuccess={() => {}}
      />

      <ArtistModal
        visible={!!selectedArtistForModal}
        onClose={() => setSelectedArtistForModal(null)}
        artistName={selectedArtistForModal}
      />

      <AlbumModal
        visible={!!selectedAlbumForModal}
        onClose={() => setSelectedAlbumForModal(null)}
        album={selectedAlbumForModal}
      />

      <PlaylistModal
        visible={!!selectedPlaylist}
        playlist={selectedPlaylist}
        onClose={() => setSelectedPlaylist(null)}
        onDeletePlaylist={(playlistId) => handleDeletePlaylist(playlistId)}
        onTrackRemoved={(playlistId, videoId) => handleRemoveTrack(playlistId, videoId)}
        onPlaylistUpdated={(updated) => {
          if (!updated) return;
          const uId = updated.id || updated.collabId;
          const matches = (p) => p.id === uId || p.collabId === uId;
          if (setPlaylists) {
            setPlaylists((prev) => (prev || []).map((p) => (matches(p) ? { ...p, ...updated } : p)));
          }
          if (setCollabPlaylists) {
            setCollabPlaylists((prev) => (prev || []).map((p) => (matches(p) ? { ...p, ...updated } : p)));
          }
          setSelectedPlaylist((prev) => (prev && matches(prev) ? { ...prev, ...updated } : prev));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    userSelect: "none",
  },
  libraryInner: {
    flex: 1,
    width: "100%",
  },
  desktopLibraryInner: {
    maxWidth: 960,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 16,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "web" ? 12 : 14,
    paddingBottom: 8,
    backgroundColor: "#000000",
  },
  headerInner: {
    width: "100%",
  },
  desktopHeaderInner: {
    maxWidth: 960,
    width: "100%",
    alignSelf: "center",
  },
  profileRow: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerRightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerAddBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  avatarContainer: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
  },
  profileName: {
    fontFamily: fonts.bold,
    fontSize: 26,
    color: "#FFFFFF",
    letterSpacing: -0.4,
  },
  tabsRowContainer: {
    flexGrow: 0,
    flexShrink: 0,
    height: 48,
  },
  tabsRow: {
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 8,
  },
  tabButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  activeTabButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.textSecondary,
  },
  activeTabText: {
    color: "#000000",
    fontFamily: fonts.bold,
  },
  toolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginVertical: 10,
    gap: 10,
  },
  searchBarWrap: {
    flex: 1,
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 20,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: "100%",
    color: "#FFFFFF",
    fontFamily: fonts.medium,
    fontSize: 13,
    outlineStyle: "none",
  },
  clearSearchBtn: {
    padding: 4,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  sortBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: "#FFFFFF",
  },
  folderBreadcrumb: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 6,
  },
  breadcrumbBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  breadcrumbBackText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
  breadcrumbDivider: {
    color: colors.textMuted,
    fontSize: 14,
  },
  breadcrumbBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  breadcrumbBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: "#FFFFFF",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  playlistCardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  playlistRowThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  playlistRowThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  playlistRowInfo: {
    flex: 1,
    marginLeft: 14,
  },
  playlistRowTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: "#FFFFFF",
    marginBottom: 3,
  },
  playlistRowCount: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  collabBadgePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.35)",
    backgroundColor: "rgba(29, 185, 84, 0.12)",
    marginLeft: 8,
  },
  collabBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.primary,
  },
  folderDeleteBtn: {
    padding: 8,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  downloadedHeaderCard: {
    backgroundColor: "rgba(29, 185, 84, 0.08)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.2)",
  },
  downloadedMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  downloadedTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
  },
  downloadedSubtitle: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  clearDownloadsBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "rgba(235, 67, 53, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(235, 67, 53, 0.25)",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  clearDownloadsText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.error,
  },
  playlistsListHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingTop: 4,
  },
  sectionHeader: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: "#FFFFFF",
  },
  sectionSubHeader: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
  headerButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  playAllSmallBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  playAllSmallBtnText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: "#000000",
  },
  shuffleSmallBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
  },
  emptySub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    maxWidth: 280,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  createMenuCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#181818",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  desktopCreateMenuCard: {
    maxWidth: 420,
  },
  createMenuTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
    marginBottom: 8,
  },
  menuDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginBottom: 8,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 14,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  menuRowIcon: {
    width: 24,
    textAlign: "center",
  },
  menuRowTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  menuRowSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  folderModalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#181818",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  folderModalTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: "#FFFFFF",
    marginBottom: 14,
  },
  folderInput: {
    height: 44,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 10,
    paddingHorizontal: 12,
    color: "#FFFFFF",
    fontFamily: fonts.medium,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    marginBottom: 16,
    outlineStyle: "none",
  },
  colorLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 8,
  },
  colorPickerRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  colorCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  selectedColorCircle: {
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
  },
  folderModalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  folderCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  folderCancelText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textMuted,
  },
  folderCreateBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  folderCreateText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
  },
  sortModalCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#181818",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  sortModalTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
    marginBottom: 8,
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 8,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  sortRowText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textSecondary,
  },
  importModalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#181818",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  importModalSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 12,
  },
  importJsonInput: {
    height: 120,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 10,
    padding: 12,
    color: "#FFFFFF",
    fontFamily: fonts.regular,
    fontSize: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    textAlignVertical: "top",
    marginBottom: 16,
    outlineStyle: "none",
  },
  skeletonWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  skeletonPlaylistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  skeletonPlaylistThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  skeletonPlaylistInfo: {
    flex: 1,
    marginLeft: 14,
  },
  skeletonLine: {
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  skeletonChevron: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  skeletonHistoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  skeletonHistoryButtons: {
    flexDirection: "row",
    gap: 8,
  },
  skeletonPillBtn: {
    width: 76,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  skeletonCircleBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  skeletonSongRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  skeletonSongThumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  skeletonSongInfo: {
    flex: 1,
    marginLeft: 12,
  },
  skeletonDots: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  folderRowActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  folderBreadcrumbDeleteBtn: {
    padding: 6,
    marginLeft: 10,
    borderRadius: 8,
    backgroundColor: "rgba(255, 69, 58, 0.12)",
  },
  folderSelectCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#16161A",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  folderSelectHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  folderSelectSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  folderCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  folderEmptyPicker: {
    alignItems: "center",
    paddingVertical: 24,
  },
  folderEmptyPickerText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
    marginTop: 8,
  },
  folderEmptyPickerSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: "center",
  },
  folderPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  folderPickerRowActive: {
    backgroundColor: "rgba(29, 185, 84, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.25)",
  },
  folderPickerIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  folderPickerName: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  folderPickerCount: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: colors.textMuted,
    marginTop: 1,
  },
  folderCreateInlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  folderCreateInlineText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: "#1DB954",
  },
  folderDoneBtn: {
    backgroundColor: "#1DB954",
    borderRadius: 20,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  folderDoneBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
  },
  folderDeleteConfirmCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#16161A",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  folderDeleteConfirmSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginVertical: 14,
    lineHeight: 19,
  },
  libraryToastBanner: {
    position: "absolute",
    bottom: 90,
    left: 20,
    right: 20,
    backgroundColor: "#1E1E22",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 999,
  },
  libraryToastText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#FFFFFF",
  },
  subFilterRowContainer: {
    paddingBottom: 10,
  },
  subFilterContent: {
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  subFilterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer", transition: "all 0.15s ease" } : {}),
  },
  subFilterPillActive: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
  },
  subFilterText: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.textSecondary,
    letterSpacing: 0.1,
  },
  subFilterTextActive: {
    fontFamily: fonts.bold,
    color: "#000000",
  },
});
