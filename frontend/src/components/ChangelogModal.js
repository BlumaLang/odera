import React, { useEffect } from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts } from "../theme/colors";
import { APP_VERSION, BUILD_NUMBER, BUILD_DATE } from "../config/version";
import { registerBackAction } from "../services/navigation";

export default function ChangelogModal({ visible, onClose }) {
  useEffect(() => {
    if (visible && onClose) {
      return registerBackAction(() => {
        onClose();
        return true;
      });
    }
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.legalOverlay}>
        <View style={styles.legalContainer}>
          {/* Header matching Privacy Policy, Ad Disclaimer & Terms */}
          <View style={styles.legalHeader}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.legalCloseBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
              accessibilityLabel="Close Changelog"
            >
              <Ionicons name="close" size={24} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
            <Text style={styles.legalTitle}>Changelog</Text>
            <View style={{ width: 32 }} />
          </View>

          {/* Scrollable text body matching Privacy Policy & Ad Disclaimer */}
          <ScrollView
            contentContainerStyle={styles.legalContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.legalBody}>
{`STAYTUP — WHAT'S NEW (CHANGELOG)

Version: v${APP_VERSION} (Build ${BUILD_NUMBER})
Last Updated: ${BUILD_DATE}

1. High-Resolution 500x500 Visuals
Upgraded all artist and album artwork pipelines across the app to deliver high-resolution 500x500 imagery. Miniplayer, song cards, hero headers, and full-screen player artwork now render in sharp, uncompressed quality.

2. Infinite Artist Discography & Fast Pagination
Re-engineered the artist profile experience with official curated top tracks and multi-page search integration. Continuous infinite scrolling loads songs in clean batches of 20 with complete server-side title deduplication.

3. Clean Track Titles & Entity Decoding
Fixed raw HTML entity tags (such as &quot;, &#039;, and &amp;) across all song titles, artist names, and album descriptions for a polished, clean reading experience.

4. Romantic Melodies & Header Controls
Added a dedicated 'Romantic Melodies' feed section highlighting popular Bollywood hits. Moved playlist creation directly to the top navigation header beside your profile icon.

5. Seamless Social Blend Requests
Upgraded the Blend request workflow so sender and receiver statuses update synchronously. When an invite is received, users are notified with clear prompts to accept or manage their blends.

6. Enhanced Playlist Import (YouTube & Spotify)
Paste any valid YouTube or Spotify playlist URL to automatically scan track listings, match them against the Staytup catalog, and import them directly into custom playlists.

7. Collaborative Playlists
Invite friends to build and manage shared playlists together in real-time with synchronized track updates and collaborator attribution.

8. In-Playlist Track Status Indicators
Tracks already saved in your personal library or custom playlists now display distinct visual indicators across search, song cards, and player views.

9. Background Playback & PWA Optimization
Enhanced mobile background playback stability on iOS and Android PWAs, ensuring audio continues playing without muting when screens lock.

10. Rapid Autocomplete & Unified Search
Streamlined search bar styling with quick autocomplete suggestions, category pills matching the Friends tab, and instant search shortcuts.

11. Unique Usernames & Account Management
New accounts receive automated unique handles to prevent identifier collisions during sign-up. Easily switch accounts or log out with a single tap.

12. Architecture & Performance
Optimized Firebase Realtime Database caching and stream pre-resolution to eliminate buffering lag during song transitions.

Contact & Support:
For feedback, bug reports, or feature suggestions, reach out to: info.to.animikh@gmail.com`}
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  legalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
  },
  legalContainer: {
    flex: 1,
    backgroundColor: "#000000",
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  legalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "web" ? 14 : (Platform.OS === "ios" ? 54 : 18),
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
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
    color: "rgba(255, 255, 255, 0.7)",
    lineHeight: 20,
    letterSpacing: 0.1,
  },
});
