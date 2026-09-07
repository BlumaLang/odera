import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Dimensions,
  StatusBar,
  Alert,
  Linking,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { api, getApiBaseUrl, setApiBaseUrl } from "../api/client";
import { useUser } from "../context/UserContext";
import { useAudio } from "../context/AudioContext";
import { useResponsive } from "../context/ResponsiveContext";
import { DEFAULT_ARTIST_IMAGES, resolveLocalArtistImage } from "../theme/artistImages";
import ArtistModal from "../components/ArtistModal";
import SongCard from "../components/SongCard";

const globalArtistPhotoCache = {};

const AVATAR_OPTIONS = [
  { id: "initial", label: "Monogram", icon: null },
  { id: "headset", label: "Audiophile", icon: "headset" },
  { id: "flame", label: "Energy", icon: "flame" },
  { id: "sparkles", label: "Magic", icon: "sparkles" },
  { id: "musical-notes", label: "Melody", icon: "musical-notes" },
  { id: "diamond", label: "VIP", icon: "diamond" },
  { id: "disc", label: "Vinyl", icon: "disc" },
  { id: "heart", label: "Heart", icon: "heart" },
  { id: "star", label: "Rockstar", icon: "star" },
];

const COLOR_OPTIONS = [
  { id: "#1DB954", label: "Emerald", color: "#1DB954" },
  { id: "#8C52FF", label: "Amethyst", color: "#8C52FF" },
  { id: "#2EBDD7", label: "Cyan", color: "#2EBDD7" },
  { id: "#FFA500", label: "Amber", color: "#FFA500" },
  { id: "#E8115B", label: "Rose", color: "#E8115B" },
];

function getArtistInitials(name) {
  if (!name || typeof name !== "string") return "AR";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ArtistAvatar({ name, photoUrl, size = 80 }) {
  const [hasError, setHasError] = useState(false);
  const initials = getArtistInitials(name);

  if (photoUrl && !hasError) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#222222",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.12)",
      }}
    >
      <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.35, color: colors.primary }}>
        {initials}
      </Text>
    </View>
  );
}

export default function ProfileScreen({ visible, onClose }) {
  const { isDesktop, isTablet, isPhone } = useResponsive();
  const {
    userProfile,
    isPremium,
    premiumPlan,
    updateProfile,
    resetOnboarding,
    activatePremium,
    cancelPremium,
    logoutUser,
  } = useUser();
  const { playTrack, currentTrack } = useAudio();

  // Profile and listening statistics
  const [historyData, setHistoryData] = useState(null);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Artist photo dictionary
  const [artistPhotos, setArtistPhotos] = useState({});

  // Customize Profile Modal
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [tempUsername, setTempUsername] = useState("");
  const [tempAvatar, setTempAvatar] = useState("initial");
  const [tempColor, setTempColor] = useState(colors.primary);

  // Artist Discography Modal
  const [selectedArtistForModal, setSelectedArtistForModal] = useState(null);

  // Referral Modal
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [referralCount, setReferralCount] = useState(0);

  // Official Channels Modal
  const [showChannelsModal, setShowChannelsModal] = useState(false);

  // Legal Modals
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showDisclaimerModal, setShowDisclaimerModal] = useState(false);

  // Settings state
  const [audioQuality, setAudioQuality] = useState("Lossless (320 kbps)");
  const [customUrl, setCustomUrl] = useState(getApiBaseUrl());
  const [backendStatus, setBackendStatus] = useState(null);
  const [isTestingServer, setIsTestingServer] = useState(false);
  const [serverSaveMsg, setServerSaveMsg] = useState(null);
  const [showAdvancedServer, setShowAdvancedServer] = useState(false);

  const username = userProfile?.username || "Staytup Listener";
  const userInitial = (username[0] || "A").toUpperCase();
  const currentAvatar = userProfile?.avatar || "initial";
  const currentAvatarColor = userProfile?.avatarColor || colors.primary;

  const avatarOptions = useMemo(() => {
    const list = [...AVATAR_OPTIONS];
    if (userProfile?.avatar && userProfile.avatar.startsWith("http")) {
      list.unshift({
        id: userProfile.avatar,
        label: "Google Photo",
        isPhoto: true,
        photoUrl: userProfile.avatar,
      });
    }
    return list;
  }, [userProfile?.avatar]);

  const favoriteArtists = useMemo(() => {
    const list = userProfile?.favoriteArtists || userProfile?.favorite_artists || [];
    return list.map((a) => (typeof a === "string" ? a.trim() : (a?.name || "").trim())).filter(Boolean);
  }, [userProfile]);
  const languages = userProfile?.languages || [];

  // Load listening stats and health
  const loadProfileData = useCallback(async () => {
    if (!visible) return;
    setIsLoading(true);
    try {
      const [histRes, favsRes, healthRes] = await Promise.allSettled([
        api.getUserHistory(),
        api.getFavorites(),
        api.getHealth(),
      ]);

      if (histRes.status === "fulfilled") {
        setHistoryData(histRes.value);
      }
      if (favsRes.status === "fulfilled") {
        setFavoritesCount(favsRes.value?.favorites?.length || 0);
      }
      if (healthRes.status === "fulfilled") {
        setBackendStatus(healthRes.value);
      } else {
        setBackendStatus(null);
      }
    } catch (err) {
      console.warn("Profile data load error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [visible]);

  // Load and resolve artist photos with high priority (using in-memory cache)
  const resolveArtistPhotos = useCallback(async () => {
    if (!visible || favoriteArtists.length === 0) return;

    const resolved = { ...globalArtistPhotoCache };
    const missing = [];

    for (const artistName of favoriteArtists) {
      if (resolved[artistName]) continue;

      // Check local bundle
      const local = resolveLocalArtistImage(artistName);
      if (local) {
        resolved[artistName] = local;
        globalArtistPhotoCache[artistName] = local;
      } else {
        missing.push(artistName);
      }
    }

    setArtistPhotos((prev) => ({ ...prev, ...resolved }));

    // 2. Fetch missing from backend batch API
    if (missing.length > 0) {
      try {
        const res = await api.getBatchArtistImages(missing);
        if (res?.images) {
          Object.assign(globalArtistPhotoCache, res.images);
          setArtistPhotos((prev) => ({ ...prev, ...res.images }));
        }
      } catch (err) {
        console.warn("Batch artist image fetch failed:", err);
      }
    }
  }, [visible, favoriteArtists]);

  useEffect(() => {
    loadProfileData();
    resolveArtistPhotos();
  }, [loadProfileData, resolveArtistPhotos]);

  const listeningHours = useMemo(() => {
    if (historyData?.stats?.total_listening_hours !== undefined && historyData.stats.total_listening_hours > 0) {
      return historyData.stats.total_listening_hours.toFixed(1);
    }
    if (historyData?.stats?.total_time_minutes) {
      return (historyData.stats.total_time_minutes / 60).toFixed(1);
    }
    const raw = historyData?.recent || [];
    const sec = raw.reduce((sum, item) => sum + (Number(item.duration_seconds) || 180), 0);
    return (sec / 3600).toFixed(1);
  }, [historyData]);

  if (!visible) return null;

  const stats = historyData?.stats || {
    total_plays: 0,
    unique_artists: 0,
    unique_tracks: 0,
  };

  const handleOpenLink = (url) => {
    if (!url) return;
    Linking.openURL(url).catch((err) => {
      console.warn("Could not open URL:", err);
      if (Platform.OS === "web") {
        window.open(url, "_blank");
      }
    });
  };

  const handleOpenEditModal = () => {
    setTempUsername(username);
    setTempAvatar(currentAvatar);
    setTempColor(currentAvatarColor);
    setShowEditProfileModal(true);
  };

  const handleSaveProfile = async () => {
    const trimmed = tempUsername.trim();
    if (!trimmed) return;
    await updateProfile({
      username: trimmed,
      avatar: tempAvatar,
      avatarColor: tempColor,
    });
    setShowEditProfileModal(false);
  };

  const handleRetune = () => {
    const confirmRetune = () => {
      onClose();
      resetOnboarding();
    };

    if (Platform.OS === "web") {
      if (window.confirm("Retune your music taste? You can re-select languages and favorite artists.")) {
        confirmRetune();
      }
    } else {
      Alert.alert(
        "Retune Music Taste",
        "Re-select your preferred languages and favorite artists for a fresh feed. Listening history is preserved.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Retune", onPress: confirmRetune },
        ]
      );
    }
  };

  const handleSaveApiUrl = async () => {
    const trimmed = customUrl.trim();
    if (!trimmed) return;
    setApiBaseUrl(trimmed);
    setIsTestingServer(true);
    setServerSaveMsg(null);
    try {
      const health = await api.getHealth();
      setBackendStatus(health);
      setServerSaveMsg({ success: true, text: "Connected successfully! Server is online." });
      if (Platform.OS !== "web") {
        Alert.alert("API URL Updated", `Backend target set to: ${trimmed}`);
      }
    } catch (err) {
      setBackendStatus(null);
      setServerSaveMsg({ success: false, text: "Could not reach server at this address." });
    } finally {
      setIsTestingServer(false);
    }
  };

  const handleCheckHealth = async () => {
    setIsTestingServer(true);
    setServerSaveMsg(null);
    try {
      const health = await api.getHealth();
      setBackendStatus(health);
      setServerSaveMsg({ success: true, text: "Server connection verified!" });
    } catch (err) {
      setBackendStatus(null);
      setServerSaveMsg({ success: false, text: "Server is unreachable" });
    } finally {
      setIsTestingServer(false);
    }
  };

  const handleShareProfile = async () => {
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: `${username}'s Staytup Profile`,
          text: `Check out ${username}'s music profile on Staytup!`,
          url: window.location.href,
        });
      } else {
        await Share.share({
          title: `${username}'s Staytup Profile`,
          message: `Check out ${username}'s music profile on Staytup! https://staytup.in`,
        });
      }
    } catch (_) {}
  };

  // Render full profile page content in a clean, flat, unified vertical flow
  const renderAllContent = () => {
    return (
      <>
        {/* Profile Header (Flat, Pure Black, No Card Borders) */}
        <View style={[styles.profileHeader, (isDesktop || isTablet) && styles.profileHeaderDesktop]}>
          <TouchableOpacity
            style={styles.avatarWrap}
            onPress={handleOpenEditModal}
            activeOpacity={0.85}
          >
            <View style={[styles.avatarCircle, { backgroundColor: currentAvatarColor, overflow: "hidden" }]}>
              {currentAvatar && currentAvatar.startsWith("http") ? (
                <Image
                  source={{ uri: currentAvatar }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="cover"
                />
              ) : currentAvatar !== "initial" ? (
                <Ionicons name={currentAvatar} size={isDesktop ? 46 : 40} color="#000000" />
              ) : (
                <Text style={[styles.avatarInitialText, isDesktop && { fontSize: 40 }]}>{userInitial}</Text>
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.profileHeaderRight}>
            <TouchableOpacity
              style={styles.nameRow}
              onPress={handleOpenEditModal}
              activeOpacity={0.7}
            >
              <Text style={styles.usernameText} numberOfLines={1}>
                {username}
              </Text>
              <Ionicons name="checkmark-circle" size={17} color="rgba(255,255,255,0.4)" />
              <Ionicons name="pencil" size={14} color="rgba(255,255,255,0.4)" style={{ marginLeft: 2 }} />
            </TouchableOpacity>

            <View style={styles.badgeRow}>
              {isPremium ? (
                <View style={styles.premiumPill}>
                  <Ionicons name="diamond" size={11} color="#000000" style={{ marginRight: 4 }} />
                  <Text style={styles.premiumPillText}>PREMIUM</Text>
                </View>
              ) : (
                <View style={styles.freePill}>
                  <Text style={styles.freePillText}>FREE</Text>
                </View>
              )}

              <View style={styles.listeningHoursPill}>
                <Ionicons name="time" size={12} color="rgba(255,255,255,0.5)" style={{ marginRight: 4 }} />
                <Text style={styles.listeningHoursText}>
                  {listeningHours}h Listened
                </Text>
              </View>
            </View>

            {/* Clean Stream Metrics */}
            <View style={styles.metricsRow}>
              <Text style={styles.metricsText}>
                <Text style={styles.metricsBold}>{stats.total_plays || 0}</Text> Streams
              </Text>
              <Text style={styles.metricsDot}>•</Text>
              <Text style={styles.metricsText}>
                <Text style={styles.metricsBold}>{favoritesCount}</Text> Liked Songs
              </Text>
            </View>
          </View>
        </View>

        {/* Referral */}
        <TouchableOpacity
          style={styles.qrCodeBtn}
          onPress={() => setShowReferralModal(true)}
          activeOpacity={0.85}
        >
          <View style={[styles.qrCodeIconWrap, { backgroundColor: "rgba(255,255,255,0.06)" }]}>
            <Ionicons name="gift-outline" size={22} color="rgba(255,255,255,0.7)" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.qrCodeTitle}>Invite Friends</Text>
            <Text style={styles.qrCodeSub}>Share your referral link, earn rewards</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
        </TouchableOpacity>

        {/* Official Channels & Developer */}
        <TouchableOpacity
          style={styles.qrCodeBtn}
          onPress={() => setShowChannelsModal(true)}
          activeOpacity={0.85}
        >
          <View style={[styles.qrCodeIconWrap, { backgroundColor: "rgba(255,255,255,0.06)" }]}>
            <Ionicons name="globe-outline" size={22} color="rgba(255,255,255,0.7)" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.qrCodeTitle}>Official Channels & Developer</Text>
            <Text style={styles.qrCodeSub}>Instagram, Email & More</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
        </TouchableOpacity>

        {/* Terms of Service */}
        <TouchableOpacity
          style={styles.qrCodeBtn}
          onPress={() => setShowTermsModal(true)}
          activeOpacity={0.85}
        >
          <View style={[styles.qrCodeIconWrap, { backgroundColor: "rgba(255,255,255,0.06)" }]}>
            <Ionicons name="document-text-outline" size={22} color="rgba(255,255,255,0.5)" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.qrCodeTitle}>Terms of Service</Text>
            <Text style={styles.qrCodeSub}>Usage terms & conditions</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
        </TouchableOpacity>

        {/* Privacy Policy */}
        <TouchableOpacity
          style={styles.qrCodeBtn}
          onPress={() => setShowPrivacyModal(true)}
          activeOpacity={0.85}
        >
          <View style={[styles.qrCodeIconWrap, { backgroundColor: "rgba(255,255,255,0.06)" }]}>
            <Ionicons name="shield-checkmark-outline" size={22} color="rgba(255,255,255,0.5)" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.qrCodeTitle}>Privacy Policy</Text>
            <Text style={styles.qrCodeSub}>How we handle your data</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
        </TouchableOpacity>

        {/* Ad Disclaimer */}
        <TouchableOpacity
          style={styles.qrCodeBtn}
          onPress={() => setShowDisclaimerModal(true)}
          activeOpacity={0.85}
        >
          <View style={[styles.qrCodeIconWrap, { backgroundColor: "rgba(255,255,255,0.06)" }]}>
            <Ionicons name="alert-circle-outline" size={22} color="rgba(255,255,255,0.5)" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.qrCodeTitle}>Ad Disclaimer</Text>
            <Text style={styles.qrCodeSub}>Third-party ad content notice</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
        </TouchableOpacity>

        {/* Switch Account / Log Out */}
        <TouchableOpacity
          style={styles.logoutCardBtn}
          onPress={() => {
            onClose();
            logoutUser();
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="log-out-outline" size={18} color="#FF5252" style={{ marginRight: 8 }} />
          <Text style={styles.logoutCardBtnText}>Switch Account / Log Out</Text>
        </TouchableOpacity>
      </>
    );
  };

  return (
    <>
      <Modal
        animationType="fade"
        transparent={false}
        visible={visible}
        onRequestClose={onClose}
        statusBarTranslucent={true}
      >
        <View style={styles.container}>
          <StatusBar translucent backgroundColor="#000000" barStyle="light-content" />

          {/* Clean Flat Top Bar */}
          <View style={[styles.topBar, (isDesktop || isTablet) && styles.desktopTopBar]}>
            <TouchableOpacity
              style={styles.circleBtn}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>

            <Text style={styles.topBarTitle}>Profile</Text>

            <TouchableOpacity
              style={styles.circleBtn}
              onPress={handleShareProfile}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.75}
            >
              <Ionicons name="share-social-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Unified Continuous Scroll Content */}
          <ScrollView
            style={styles.scrollContainer}
            contentContainerStyle={[
              styles.scrollContent,
              (isDesktop || isTablet) && styles.desktopScrollContent,
            ]}
            showsVerticalScrollIndicator={false}
          >
            {renderAllContent()}

            <View style={styles.footerVersion}>
              <Text style={styles.versionText}>Staytup Music • v2.4.0</Text>
              <Text style={styles.versionSub}>High-Fidelity Personalized Music Streaming</Text>
            </View>

            <View style={{ height: 60 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Customize Profile Modal (Bottom Sheet Style) */}
      <Modal
        visible={showEditProfileModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditProfileModal(false)}
      >
        <TouchableOpacity
          style={styles.editModalOverlay}
          activeOpacity={1}
          onPress={() => setShowEditProfileModal(false)}
        >
          <View style={styles.editModalBox} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandleArea}>
              <View style={styles.sheetHandle} />
            </View>

            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>Customize Profile</Text>
            </View>

            {/* Display Name Input */}
            <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
            <TextInput
              style={styles.nameInput}
              value={tempUsername}
              onChangeText={setTempUsername}
              placeholder="Enter your name"
              placeholderTextColor="#777777"
              maxLength={30}
            />

            {/* Avatar Icon Picker */}
            <Text style={styles.fieldLabel}>AVATAR ICON</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0 }}
              contentContainerStyle={styles.avatarPickerRow}
            >
              {avatarOptions.map((item) => {
                const isSelected = tempAvatar === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.avatarOptionCard, isSelected && styles.avatarOptionCardActive]}
                    onPress={() => setTempAvatar(item.id)}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        styles.avatarOptionIconWrap,
                        isSelected && { backgroundColor: tempColor },
                        { overflow: "hidden" },
                      ]}
                    >
                      {item.isPhoto ? (
                        <Image
                          source={{ uri: item.photoUrl }}
                          style={{ width: "100%", height: "100%" }}
                          resizeMode="cover"
                        />
                      ) : item.icon ? (
                        <Ionicons
                          name={item.icon}
                          size={20}
                          color={isSelected ? "#000000" : "#FFFFFF"}
                        />
                      ) : (
                        <Text
                          style={[
                            styles.avatarOptionMonogram,
                            isSelected && { color: "#000000" },
                          ]}
                        >
                          {userInitial}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.avatarOptionLabel,
                        isSelected && styles.avatarOptionLabelActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Accent Color Picker */}
            <Text style={styles.fieldLabel}>THEME ACCENT</Text>
            <View style={styles.colorPickerRow}>
              {COLOR_OPTIONS.map((c) => {
                const isSelected = tempColor === c.color;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: c.color },
                      isSelected && styles.colorCircleActive,
                    ]}
                    onPress={() => setTempColor(c.color)}
                    activeOpacity={0.8}
                  >
                    {isSelected && <Ionicons name="checkmark" size={16} color="#000000" />}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Modal Buttons */}
            <View style={styles.editModalBtnRow}>
              <TouchableOpacity
                style={styles.editCancelBtn}
                onPress={() => setShowEditProfileModal(false)}
              >
                <Text style={styles.editCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.editSaveBtn, { backgroundColor: tempColor }]}
                onPress={handleSaveProfile}
              >
                <Text style={styles.editSaveText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Artist Profile & Discography Modal */}
      <ArtistModal
        visible={!!selectedArtistForModal}
        onClose={() => setSelectedArtistForModal(null)}
        artistName={selectedArtistForModal}
        initialPhoto={selectedArtistForModal ? artistPhotos[selectedArtistForModal] : null}
      />

      {/* Referral Full Page Modal */}
      <Modal
        visible={showReferralModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowReferralModal(false)}
      >
        <View style={styles.legalOverlay}>
          <View style={styles.legalContainer}>
            <View style={styles.legalHeader}>
              <TouchableOpacity onPress={() => setShowReferralModal(false)} style={styles.legalCloseBtn}>
                <Ionicons name="close" size={24} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
              <Text style={styles.legalTitle}>Invite Friends</Text>
              <View style={{ width: 32 }} />
            </View>
            <ScrollView contentContainerStyle={styles.legalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.referralHero}>
                <View style={styles.referralIconCircle}>
                  <Ionicons name="gift-outline" size={48} color={colors.primary} />
                </View>
                <Text style={styles.referralHeroTitle}>Share Staytup</Text>
                <Text style={styles.referralHeroSub}>
                  Invite your friends to Staytup. When they sign up using your link, you both earn rewards.
                </Text>
              </View>

              <View style={styles.referralStatsRow}>
                <View style={styles.referralStatCard}>
                  <Text style={styles.referralStatNum}>{referralCount}</Text>
                  <Text style={styles.referralStatLabel}>Friends Invited</Text>
                </View>
                <View style={styles.referralStatCard}>
                  <Text style={styles.referralStatNum}>{referralCount * 10}</Text>
                  <Text style={styles.referralStatLabel}>Points Earned</Text>
                </View>
              </View>

              {/* Referral Code */}
              <View style={styles.referralCodeSection}>
                <Text style={styles.referralCodeLabel}>Your Referral Code</Text>
                <View style={styles.referralCodeRow}>
                  <View style={styles.referralCodeBox}>
                    <Text style={styles.referralCodeText}>
                      {(userProfile?.username || "user").replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.referralCopyBtn}
                    onPress={() => {
                      const code = (userProfile?.username || "user").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
                      if (Platform.OS === "web" && navigator.clipboard) {
                        navigator.clipboard.writeText(code).catch(() => {});
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="copy-outline" size={16} color={colors.primary} />
                    <Text style={styles.referralCopyText}>Copy</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.referralCodeHint}>Share this code with friends to earn rewards</Text>
              </View>

              <TouchableOpacity
                style={styles.whatsappShareBtn}
                onPress={() => {
                  const url = `https://staytup.in/qr-login?ref=${userProfile?.username || "user"}`;
                  const msg = `Check out Staytup - the best Indian music streaming app! Use my link to sign up: ${url}`;
                  if (Platform.OS === "web") {
                    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
                  }
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" style={{ marginRight: 10 }} />
                <Text style={styles.whatsappShareText}>Share on WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.genericShareBtn}
                onPress={() => {
                  const url = `https://staytup.in/qr-login?ref=${userProfile?.username || "user"}`;
                  if (Platform.OS === "web" && navigator.share) {
                    navigator.share({ title: "Join Staytup", url, message: `Use my link: ${url}` }).catch(() => {});
                  } else {
                    Share.share({ title: "Join Staytup", message: url }).catch(() => {});
                  }
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="share-outline" size={18} color={colors.primary} style={{ marginRight: 10 }} />
                <Text style={styles.genericShareText}>Share Link</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Official Channels Bottom Sheet */}
      <Modal
        visible={showChannelsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowChannelsModal(false)}
      >
        <TouchableOpacity
          style={styles.bottomSheetOverlay}
          activeOpacity={1}
          onPress={() => setShowChannelsModal(false)}
        >
          <View style={styles.bottomSheetBox} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandleArea}>
              <View style={styles.sheetHandle} />
            </View>
            <Text style={styles.bottomSheetTitle}>Official Channels</Text>

            <TouchableOpacity
              style={styles.bottomSheetItem}
              onPress={() => {
                setShowChannelsModal(false);
                handleOpenLink("https://instagram.com/staytup.india");
              }}
              activeOpacity={0.7}
            >
              <View style={styles.bottomSheetIconWrap}>
                <Ionicons name="logo-instagram" size={20} color="rgba(255,255,255,0.7)" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bottomSheetItemTitle}>Staytup India</Text>
                <Text style={styles.bottomSheetItemSub}>@staytup.india</Text>
              </View>
              <Ionicons name="open-outline" size={18} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomSheetItem}
              onPress={() => {
                setShowChannelsModal(false);
                handleOpenLink("https://instagram.com/animikh.04");
              }}
              activeOpacity={0.7}
            >
              <View style={styles.bottomSheetIconWrap}>
                <Ionicons name="logo-instagram" size={20} color="rgba(255,255,255,0.7)" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bottomSheetItemTitle}>Developer</Text>
                <Text style={styles.bottomSheetItemSub}>@animikh.04</Text>
              </View>
              <Ionicons name="open-outline" size={18} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomSheetItem}
              onPress={() => {
                setShowChannelsModal(false);
                handleOpenLink("mailto:info.to.animikh@gmail.com");
              }}
              activeOpacity={0.7}
            >
              <View style={styles.bottomSheetIconWrap}>
                <Ionicons name="mail-outline" size={20} color="rgba(255,255,255,0.7)" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bottomSheetItemTitle}>Email Developer</Text>
                <Text style={styles.bottomSheetItemSub}>info.to.animikh@gmail.com</Text>
              </View>
              <Ionicons name="open-outline" size={18} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Terms of Service Modal */}
      <Modal visible={showTermsModal} transparent animationType="slide" onRequestClose={() => setShowTermsModal(false)}>
        <View style={styles.legalOverlay}>
          <View style={styles.legalContainer}>
            <View style={styles.legalHeader}>
              <TouchableOpacity onPress={() => setShowTermsModal(false)} style={styles.legalCloseBtn}>
                <Ionicons name="close" size={24} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
              <Text style={styles.legalTitle}>Terms of Service</Text>
              <View style={{ width: 32 }} />
            </View>
            <ScrollView contentContainerStyle={styles.legalContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.legalBody}>
{`STAYTUP — TERMS OF SERVICE\n\nLast Updated: September 2025\n\n1. Acceptance of Terms\nBy accessing or using Staytup ("the App"), you agree to be bound by these Terms of Service. If you do not agree, do not use the App.\n\n2. Description of Service\nStaytup is a music discovery and streaming application that aggregates publicly available music content from YouTube and other public sources. We do not host, store, or distribute any copyrighted audio files.\n\n3. User Conduct\nYou agree not to:\n- Use the App for any unlawful purpose\n- Attempt to reverse-engineer or exploit the App\n- Use automated tools to access the App\n- Interfere with the App's servers or infrastructure\n\n4. Intellectual Property\nAll trademarks, logos, and branding associated with Staytup are the property of their respective owners. Music content is sourced from publicly available platforms.\n\n5. Third-Party Content\nThe App streams content from YouTube. Your use of such content is subject to YouTube's Terms of Service. Staytup is not affiliated with YouTube or Google.\n\n6. Limitation of Liability\nStaytup is provided "as is" without warranties of any kind. We are not liable for any damages arising from your use of the App.\n\n7. Modifications\nWe reserve the right to modify these Terms at any time. Continued use of the App after changes constitutes acceptance of the new Terms.\n\n8. Contact\nFor questions about these Terms, contact: info.to.animikh@gmail.com`}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Privacy Policy Modal */}
      <Modal visible={showPrivacyModal} transparent animationType="slide" onRequestClose={() => setShowPrivacyModal(false)}>
        <View style={styles.legalOverlay}>
          <View style={styles.legalContainer}>
            <View style={styles.legalHeader}>
              <TouchableOpacity onPress={() => setShowPrivacyModal(false)} style={styles.legalCloseBtn}>
                <Ionicons name="close" size={24} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
              <Text style={styles.legalTitle}>Privacy Policy</Text>
              <View style={{ width: 32 }} />
            </View>
            <ScrollView contentContainerStyle={styles.legalContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.legalBody}>
{`STAYTUP — PRIVACY POLICY\n\nLast Updated: September 2025\n\n1. Information We Collect\n- Account Information: When you sign in with Google, we receive your name, email, and profile photo.\n- Usage Data: We collect listening history, search queries, and app interaction data to personalize your experience.\n- Device Information: We may collect device type, browser, and operating system for optimization.\n\n2. How We Use Information\n- To provide and improve the App\n- To personalize your music recommendations\n- To track listening statistics for your profile\n- To communicate updates (if you opt in)\n\n3. Data Storage\nYour data is stored securely in Firebase (Google Cloud). We do not sell, trade, or share your personal data with third parties for marketing purposes.\n\n4. Third-Party Services\n- Firebase Authentication & Database (Google)\n- YouTube API (for content streaming)\n- Analytics services for app improvement\n\n5. Data Retention\nYour account data and listening history are retained as long as your account is active. You may delete your account at any time.\n\n6. Your Rights\n- Access your data\n- Request deletion of your data\n- Opt out of personalized recommendations\n\n7. Children's Privacy\nThe App is not intended for users under 13 years of age.\n\n8. Changes to This Policy\nWe may update this Privacy Policy periodically. Material changes will be communicated through the App.\n\n9. Contact\nFor privacy-related inquiries: info.to.animikh@gmail.com`}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Ad Disclaimer Modal */}
      <Modal visible={showDisclaimerModal} transparent animationType="slide" onRequestClose={() => setShowDisclaimerModal(false)}>
        <View style={styles.legalOverlay}>
          <View style={styles.legalContainer}>
            <View style={styles.legalHeader}>
              <TouchableOpacity onPress={() => setShowDisclaimerModal(false)} style={styles.legalCloseBtn}>
                <Ionicons name="close" size={24} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
              <Text style={styles.legalTitle}>Ad Disclaimer</Text>
              <View style={{ width: 32 }} />
            </View>
            <ScrollView contentContainerStyle={styles.legalContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.legalBody}>
{`STAYTUP — AD DISCLAIMER\n\nLast Updated: September 2025\n\n1. Advertising Content\nStaytup may display advertisements provided by third-party ad networks including Google AdSense. These ads help keep the App free for all users.\n\n2. Ad Responsibility\nThe advertisements shown in Staytup are served by third-party ad networks. Staytup does not create, endorse, or take responsibility for the content of any advertisements displayed.\n\n3. Ad Tracking\nThird-party advertisers may use cookies and similar technologies to serve ads based on your prior visits to this and other websites. You may opt out of personalized advertising through your browser settings or platform-specific ad preferences.\n\n4. No Endorsement\nThe presence of any advertisement in Staytup does not constitute an endorsement of the advertised product, service, or company by Staytup or its developers.\n\n5. Ad-Free Experience\nPremium subscribers may enjoy an ad-free experience. Ad removal is subject to the current Premium subscription terms.\n\n6. Content Accuracy\nAd content, including pricing, availability, and promotions, is determined solely by the advertisers and may change without notice. Staytup is not responsible for the accuracy of ad content.\n\n7. Contact\nFor ad-related concerns: info.to.animikh@gmail.com`}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
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
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  desktopTopBar: {
    width: "100%",
    paddingHorizontal: 32,
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  topBarTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  editProfilePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
  },
  editProfilePillText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: "#000000",
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: "#000000",
  },
  desktopScrollContent: {
    width: "100%",
    paddingHorizontal: 32,
    paddingTop: 20,
  },

  // Flat Profile Header (Pure Black, No Card Borders)
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    paddingVertical: 18,
    marginBottom: 28,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  profileHeaderDesktop: {
    gap: 24,
    paddingVertical: 22,
  },
  avatarWrap: {
    position: "relative",
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitialText: {
    fontFamily: fonts.bold,
    fontSize: 36,
    color: "#000000",
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#000000",
  },
  profileHeaderRight: {
    flex: 1,
    alignItems: "flex-start",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  usernameText: {
    fontFamily: fonts.bold,
    fontSize: 24,
    color: "#FFFFFF",
    letterSpacing: -0.4,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  listeningHoursPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(29, 185, 84, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.35)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  listeningHoursText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    letterSpacing: 0.3,
  },
  verifiedTagPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  verifiedTagText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: "#DDDDDD",
  },
  premiumPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  premiumPillText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: "#000000",
    letterSpacing: 0.4,
  },
  freePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  freePillText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: "#AAAAAA",
    letterSpacing: 0.3,
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  metricsText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  metricsBold: {
    fontFamily: fonts.bold,
    color: "#FFFFFF",
  },
  metricsDot: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 12,
  },
  sectionWrap: {
    marginBottom: 26,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: "#FFFFFF",
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  actionLinkText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
  artistCardsScroll: {
    gap: 14,
    paddingVertical: 6,
  },
  artistProfileCard: {
    alignItems: "center",
    width: 90,
  },
  artistAvatarContainer: {
    width: 84,
    height: 84,
    borderRadius: 42,
    position: "relative",
    marginBottom: 8,
  },
  artistVerifiedBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#0D0D0D",
  },
  artistCardName: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: "#FFFFFF",
    textAlign: "center",
    width: "100%",
  },
  artistCardSub: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.primary,
    marginTop: 1,
  },
  emptyBox: {
    padding: 24,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyBoxText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  retuneMiniBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 16,
    marginTop: 4,
  },
  retuneMiniBtnText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: "#000000",
  },
  languagesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  langPill: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  langPillText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#FFFFFF",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionSubCount: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  recentList: {
    gap: 4,
    marginTop: 6,
  },
  emptyRecentBox: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderStyle: "dashed",
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  emptyRecentTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
    marginTop: 10,
    marginBottom: 4,
  },
  emptyRecentSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  versionBadge: {
    backgroundColor: "rgba(29, 185, 84, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.4)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  versionBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    letterSpacing: 0.5,
  },
  aboutAppDesc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.7)",
    lineHeight: 20,
    marginVertical: 10,
  },
  aboutFeaturesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  aboutFeatureItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  aboutFeatureText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: "#FFFFFF",
  },
  devProfileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    padding: 14,
    borderRadius: 14,
    gap: 14,
    marginVertical: 12,
  },
  devAvatarBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#2EBDD7",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  devAvatarInitial: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: "#000000",
  },
  devVerifiedDot: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: "#121212",
    alignItems: "center",
    justifyContent: "center",
  },
  devName: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
  },
  creatorPill: {
    backgroundColor: "rgba(46, 189, 215, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  creatorPillText: {
    fontFamily: fonts.bold,
    fontSize: 9,
    color: "#2EBDD7",
    letterSpacing: 0.8,
  },
  devRole: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  devContactHeading: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: 6,
    marginBottom: 8,
  },
  devSocialRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 12,
    marginBottom: 8,
  },
  devSocialIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  devSocialLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#FFFFFF",
  },
  devSocialHandle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  verifiedOfficialPill: {
    backgroundColor: "rgba(29, 185, 84, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  verifiedOfficialText: {
    fontFamily: fonts.bold,
    fontSize: 9,
    color: colors.primary,
    letterSpacing: 0.8,
  },
  settingsSectionCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginBottom: 20,
  },
  settingsCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  settingsCardTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#FFFFFF",
  },
  settingsCardDesc: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
    marginBottom: 14,
  },
  qualityList: {
    gap: 10,
  },
  qualityRowItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  qualityRowItemActive: {
    backgroundColor: "rgba(29, 185, 84, 0.1)",
    borderColor: colors.primary,
  },
  qualityRowTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: "#FFFFFF",
    marginBottom: 2,
  },
  qualityRowTitleActive: {
    color: colors.primary,
  },
  qualityRowSub: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  radioCircleActive: {
    borderColor: colors.primary,
  },
  radioInnerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  planDetailsBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 14,
    borderRadius: 12,
    marginBottom: 14,
  },
  planNameText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#FFFFFF",
    marginBottom: 2,
  },
  planSubText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  activePlanBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  activePlanBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: "#000000",
  },
  upgradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
  },
  upgradeBtnText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: "#000000",
  },
  cancelPlanBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  cancelPlanBtnText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textMuted,
  },
  retuneCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginBottom: 20,
  },
  retuneIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  retuneTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#FFFFFF",
    marginBottom: 2,
  },
  retuneDesc: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  accordionBody: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  serverSettingsDesc: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
    marginBottom: 10,
  },
  urlInputRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  urlInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    fontFamily: fonts.regular,
    color: "#FFFFFF",
    fontSize: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
  },
  saveUrlButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 65,
  },
  saveUrlText: {
    fontFamily: fonts.bold,
    color: "#000000",
    fontSize: 13,
  },
  statusAlertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    marginBottom: 12,
  },
  statusAlertSuccess: {
    backgroundColor: "rgba(29, 185, 84, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.3)",
  },
  statusAlertError: {
    backgroundColor: "rgba(232, 17, 91, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(232, 17, 91, 0.3)",
  },
  statusAlertText: {
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  diagCard: {
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  diagRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
  },
  diagDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginVertical: 4,
  },
  diagLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  diagBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  diagDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  diagValue: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
  },
  footerVersion: {
    alignItems: "center",
    paddingVertical: 18,
  },
  versionText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textMuted,
  },
  versionSub: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: "#555555",
    marginTop: 2,
  },
  directConnectSection: {
    marginTop: 20,
    marginBottom: 10,
    gap: 10,
  },
  directConnectHeading: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  directCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0A0A0A",
    borderRadius: 14,
    padding: 14,
    gap: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  directCardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  directCardTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
    marginBottom: 2,
  },
  directCardSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  editModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  editModalBox: {
    width: "100%",
    maxWidth: 580,
    backgroundColor: "#0D0D0D",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 40 : 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.12)",
  },
  sheetHandleArea: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    marginBottom: 4,
  },
  sheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  editModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  editModalTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: "#FFFFFF",
  },
  fieldLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  nameInput: {
    height: 46,
    backgroundColor: "#000000",
    borderRadius: 10,
    paddingHorizontal: 14,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: 18,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
  },
  avatarPickerRow: {
    gap: 10,
    paddingBottom: 4,
    marginBottom: 18,
  },
  avatarOptionCard: {
    alignItems: "center",
    padding: 6,
    borderRadius: 12,
    width: 68,
  },
  avatarOptionCardActive: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  avatarOptionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  avatarOptionMonogram: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: "#FFFFFF",
  },
  avatarOptionLabel: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.textMuted,
    textAlign: "center",
  },
  avatarOptionLabelActive: {
    color: "#FFFFFF",
    fontFamily: fonts.semiBold,
  },
  colorPickerRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  colorCircleActive: {
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
  },
  editModalBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  editCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  editCancelText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textSecondary,
  },
  editSaveBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  editSaveText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
  },
  logoutCardBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 82, 82, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 82, 82, 0.25)",
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 20,
    marginBottom: 10,
  },
  logoutCardBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FF5252",
    letterSpacing: 0.2,
  },
  qrCodeBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0A0A0A",
    borderRadius: 14,
    padding: 14,
    gap: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 20,
  },
  qrCodeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  qrCodeTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
    marginBottom: 2,
  },
  qrCodeSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  qrFullscreen: {
    flex: 1,
    backgroundColor: "#000000",
  },
  qrFullscreenHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  qrCloseArea: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  qrFullscreenTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: "#FFFFFF",
  },
  qrFullscreenBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  qrFullscreenSub: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  qrFullscreenCodeWrap: {
    width: 260,
    height: 260,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#000000",
    borderWidth: 2,
    borderColor: colors.textMuted,
    marginBottom: 16,
  },
  qrFullscreenCode: {
    width: "100%",
    height: "100%",
  },
  qrFullscreenUrl: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 28,
    letterSpacing: 1,
  },
  qrPollStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 20,
  },
  qrPollDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  qrPollText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
  },
  qrPinContainer: {
    backgroundColor: "#111111",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
    marginTop: 4,
    marginBottom: 20,
  },
  qrPinHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 6,
  },
  qrPinHeaderTitle: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  qrPinBoxesRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  qrPinDigitBox: {
    width: 48,
    height: 52,
    borderRadius: 8,
    backgroundColor: "#181818",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  qrPinDigitText: {
    fontFamily: fonts.bold,
    fontSize: 24,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  qrPinInstructionText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    lineHeight: 16,
  },
  qrSuccessBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(29, 185, 84, 0.15)",
    borderColor: "#1DB954",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 10,
  },
  qrSuccessText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#1DB954",
  },
  qrShareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    width: "100%",
  },
  qrShareBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
  },
  qrStepsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    gap: 8,
  },
  qrStepItem: {
    alignItems: "center",
    width: 72,
  },
  qrStepNum: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  qrStepNumText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.primary,
  },
  qrStepLabel: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 13,
  },
  // Referral styles
  referralHero: {
    alignItems: "center",
    paddingVertical: 24,
    marginBottom: 20,
  },
  referralIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(29, 185, 84, 0.12)",
    borderWidth: 2,
    borderColor: "rgba(29, 185, 84, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  referralHeroTitle: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: "#FFFFFF",
    marginBottom: 8,
  },
  referralHeroSub: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  referralStatsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  referralStatCard: {
    flex: 1,
    backgroundColor: "#0A0A0A",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  referralStatNum: {
    fontFamily: fonts.bold,
    fontSize: 28,
    color: "#FFFFFF",
    marginBottom: 4,
  },
  referralStatLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  referralCodeSection: {
    marginBottom: 20,
  },
  referralCodeLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    marginBottom: 8,
  },
  referralCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  referralCodeBox: {
    flex: 1,
    backgroundColor: "#0A0A0A",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.3)",
  },
  referralCodeText: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.primary,
    letterSpacing: 3,
  },
  referralCopyBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(29, 185, 84, 0.12)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.25)",
  },
  referralCopyText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
  referralCodeHint: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
  },
  whatsappShareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#25D366",
    height: 50,
    borderRadius: 25,
    marginBottom: 12,
  },
  whatsappShareText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#FFFFFF",
  },
  genericShareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    height: 50,
    borderRadius: 25,
  },
  genericShareText: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: "#FFFFFF",
  },
  // Bottom sheet styles
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  bottomSheetBox: {
    backgroundColor: "#0D0D0D",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.1)",
  },
  bottomSheetTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 16,
  },
  bottomSheetItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0A0A0A",
    borderRadius: 14,
    padding: 14,
    gap: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 10,
  },
  bottomSheetIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomSheetItemTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  bottomSheetItemSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  // Legal modal styles
  legalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
  },
  legalContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  legalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  legalCloseBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  legalTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: "#FFFFFF",
  },
  legalContent: {
    padding: 20,
    paddingBottom: 40,
  },
  legalBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    lineHeight: 20,
    letterSpacing: 0.1,
  },
});
