import React from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { APP_VERSION, BUILD_NUMBER, BUILD_DATE } from "../config/version";

const CHANGELOG_ITEMS = [
  {
    id: "romantic_melodies_library_refinements",
    icon: "heart",
    title: "Romantic Melodies & Library Top Header Controls",
    desc: "Added dedicated 'Romantic Melodies' section with rich Bollywood hits right on the home feed. Moved the create playlist button to the top header right before your profile icon and removed redundant list banner cards.",
  },
  {
    id: "listening_friends_pills",
    icon: "pulse",
    title: "Horizontal Listening Now Friends & Artist Profiles",
    desc: "Active listening friends now appear as sleek horizontal scrolling pill cards on the Following tab. Tapping followed artists opens their full artist modal.",
  },
  {
    id: "blend_collab_unwrapped",
    icon: "infinite",
    title: "Clean Direct Blend & Collab Rows",
    desc: "Removed bulky card boxes across Blend and Collab playlists for clean borderless rows. Blend playlists now require explicit creation confirmation in the modal.",
  },
  {
    id: "header_search_shortcuts",
    icon: "search",
    title: "Top Header Search Shortcuts & Ultra-Fast Search",
    desc: "Moved search circle button directly to the top header beside your profile icon in Friends and Search. Enjoy instantaneous local search and frictionless discovery.",
  },
  {
    id: "unique_usernames_flow",
    icon: "person-add",
    title: "Seamless Multi-User Registration",
    desc: "Users sharing names now receive unique handles automatically without PIN collision or sign-up blockages.",
  },
  {
    id: "simplified_ia",
    icon: "layers",
    title: "Streamlined Architecture & Clean Header",
    desc: "Simplified the top navigation to 'All | Following'. Removed clutter and duplicate Blend tabs so you can focus on pure music discovery.",
  },
  {
    id: "daily_mix_promoted",
    icon: "disc",
    title: "Daily Mix Promoted to Prime Spotlight",
    desc: "Daily Mix 1, 2, and 3 are now featured right below Fresh New Releases, making personalized daily auto-mixes accessible immediately above the fold.",
  },
  {
    id: "compact_online_friends",
    icon: "radio",
    title: "Compact Online Friends on Following",
    desc: "The Following tab now opens with a sleek, compact list of active friends showing live listening status and instant one-tap listen along controls.",
  },
  {
    id: "collab_add_fix",
    icon: "add-circle",
    title: "Add Songs to Collab Playlists",
    desc: "Collaborative playlists now appear in the 'Add to Playlist' modal. Easily add or remove tracks from any collab playlist directly from song cards.",
  },
  {
    id: "following_redesign",
    icon: "people-circle",
    title: "Following Tab Redesign",
    desc: "See what your friends are listening to in real-time at the top of the Following tab, with quick Blend Radar access and followed artists content below.",
  },
  {
    id: "ui_cleanup",
    icon: "sparkles",
    title: "UI Polish & Cleanup",
    desc: "Removed Vibes feature, cleaned up the Blend section, scrollable pill tabs on Friends screen, and various layout improvements across the app.",
  },
  {
    id: "playlist_import",
    icon: "link",
    title: "Import Playlist from YouTube Link",
    desc: "Paste any YouTube playlist link inside your playlist to automatically scan song titles, match them with high-quality Staytup catalog tracks, and import them seamlessly.",
  },
  {
    id: "collab_playlists",
    icon: "people",
    title: "Collaborative Playlists",
    desc: "Collaborate on playlists with your friends in real-time. Add tracks together, share invite links, and curate synchronized music collections.",
  },
  {
    id: "playlist_indicators",
    icon: "checkmark-circle",
    title: "In-Playlist Green Checkmarks",
    desc: "Songs already saved in any of your playlists now display a prominent green checkmark badge across Search, Song Cards, and Player views.",
  },
  {
    id: "pwa_bg",
    icon: "volume-high",
    title: "Background Playback on Mobile PWA",
    desc: "Fixed audio muting on iOS and Android when tracks auto-advance with the screen locked or in background. Playback now transitions seamlessly and audibly.",
  },
  {
    id: "search_ui",
    icon: "search",
    title: "Refined Search & Clear Controls",
    desc: "Unified rounded-pill search input, consistent font sizing and placeholder styling matching the Friends page, with a pure black background theme.",
  },
  {
    id: "artist_cache",
    icon: "image",
    title: "Instant Artist Visuals",
    desc: "High-resolution artist portraits are now cached in Firebase Realtime Database for instant load times with zero flickering.",
  },
  {
    id: "referral_db",
    icon: "gift",
    title: "Unique 8-Digit Referral Codes",
    desc: "Generated unique alphanumeric referral codes stored in the database. Invite friends to earn VIP rewards and free access.",
  },
  {
    id: "library_layout",
    icon: "library",
    title: "Expanded Library Width",
    desc: "Wider section layouts for Recently Played, Liked Songs, and Custom Playlists with circular plus controls for quick adding.",
  },
  {
    id: "performance",
    icon: "flash",
    title: "Eager Stream Pre-Resolution",
    desc: "Upcoming tracks in your queue are resolved in advance so skipping and auto-advancing happens with zero delay.",
  },
];

export default function ChangelogModal({ visible, onClose }) {
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Changelog</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Version Hero — Flat, clean, no card box */}
            <View style={styles.heroSection}>
              <View style={styles.versionBadge}>
                <Ionicons name="sparkles" size={13} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.versionBadgeText}>v{APP_VERSION}</Text>
              </View>
              <Text style={styles.heroTitle}>What's New in Staytup</Text>
              <Text style={styles.heroSubtitle}>
                Build {BUILD_NUMBER} • {BUILD_DATE}
              </Text>
            </View>

            {/* Flat Changelog List — No cards, no box borders, full width */}
            <View style={styles.flatListContainer}>
              {CHANGELOG_ITEMS.map((item, index) => (
                <View key={item.id} style={styles.flatItemRow}>
                  <View style={styles.iconCircle}>
                    <Ionicons name={item.icon} size={17} color={colors.primary} />
                  </View>
                  <View style={styles.itemContent}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemDesc}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Bottom Action Button */}
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={styles.continueBtn}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.continueBtnText}>Explore What's New</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const { width } = Dimensions.get("window");
const isDesktop = width >= 768;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.96)",
    justifyContent: "center",
    alignItems: "center",
    padding: isDesktop ? 24 : 0,
  },
  container: {
    width: isDesktop ? 540 : "100%",
    height: isDesktop ? "86%" : "100%",
    maxHeight: isDesktop ? 760 : "100%",
    backgroundColor: "#000000",
    borderRadius: isDesktop ? 24 : 0,
    borderWidth: isDesktop ? 1 : 0,
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 54 : 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
    backgroundColor: "#000000",
  },
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollArea: {
    flex: 1,
    width: "100%",
    backgroundColor: "#000000",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    backgroundColor: "#000000",
  },
  heroSection: {
    alignItems: "flex-start",
    marginBottom: 24,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  versionBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(29, 185, 84, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  versionBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.primary,
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: "#FFFFFF",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.4)",
  },
  // Flat layout: No card background, no card borders, full width
  flatListContainer: {
    width: "100%",
  },
  flatItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
    marginTop: 2,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  itemDesc: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: "#9E9E9E",
    lineHeight: 18,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 34 : 18,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
    backgroundColor: "#000000",
  },
  continueBtn: {
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  continueBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
    letterSpacing: -0.2,
  },
});
