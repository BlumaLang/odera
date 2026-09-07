import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Dimensions,
  Platform,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { api } from "../api/client";
import { useUser } from "../context/UserContext";
import { useResponsive } from "../context/ResponsiveContext";
import { DEFAULT_ARTIST_IMAGES } from "../theme/artistImages";

const { width } = Dimensions.get("window");

const MUSIC_LANGUAGES = [
  { id: "Hindi", label: "Hindi", defaultArtists: ["Arijit Singh", "Shreya Ghoshal", "Anuv Jain", "Pritam", "Atif Aslam", "Mohit Chauhan"] },
  { id: "Punjabi", label: "Punjabi", defaultArtists: ["Diljit Dosanjh", "Karan Aujla", "AP Dhillon", "Sidhu Moose Wala", "Ammy Virk", "Shubh"] },
  { id: "English", label: "English / Pop", defaultArtists: ["Taylor Swift", "The Weeknd", "Drake", "Ed Sheeran", "Billie Eilish", "Bruno Mars"] },
  { id: "Telugu", label: "Telugu", defaultArtists: ["Sid Sriram", "Anirudh Ravichander", "Devi Sri Prasad", "Thaman S", "Armaan Malik"] },
  { id: "Tamil", label: "Tamil", defaultArtists: ["Anirudh Ravichander", "AR Rahman", "Yuvan Shankar Raja", "Harris Jayaraj", "Sid Sriram"] },
  { id: "Bengali", label: "Bengali", defaultArtists: ["Arijit Singh", "Anupam Roy", "Shreya Ghoshal", "Rupam Islam", "Somlata Acharyya"] },
  { id: "Malayalam", label: "Malayalam", defaultArtists: ["Sushin Shyam", "Hesham Abdul Wahab", "KS Harisankar", "Vineeth Sreenivasan"] },
  { id: "Kannada", label: "Kannada", defaultArtists: ["Vijay Prakash", "Sanjith Hegde", "Raghu Dixit", "Charan Raj"] },
  { id: "Marathi", label: "Marathi", defaultArtists: ["Ajay-Atul", "Swapnil Bandodkar", "Adarsh Shinde", "Avadhoot Gupte"] },
  { id: "Gujarati", label: "Gujarati", defaultArtists: ["Aditya Gadhvi", "Kinjal Dave", "Jigardan Gadhavi", "Geeta Rabari"] },
  { id: "Spanish", label: "Spanish / Latin", defaultArtists: ["Bad Bunny", "Rosalía", "J Balvin", "Rauw Alejandro"] },
  { id: "K-Pop", label: "K-Pop", defaultArtists: ["BTS", "BLACKPINK", "NewJeans", "Stray Kids", "TWICE"] },
];

export default function OnboardingScreen() {
  const { completeOnboarding, userProfile } = useUser();
  const { isPhone, isTablet, isDesktop } = useResponsive();

  const [step, setStep] = useState(1); // 1 = Name & Language, 2 = Artists & Related
  const [username, setUsername] = useState(
    userProfile?.username && userProfile.username !== "Staytup Listener" && userProfile.username !== "Music Lover"
      ? userProfile.username
      : ""
  );
  const [selectedLanguages, setSelectedLanguages] = useState(["Hindi", "Punjabi", "English"]);
  
  // Step 2 state
  const [selectedArtists, setSelectedArtists] = useState([]);
  const [availableArtists, setAvailableArtists] = useState([]);
  const [artistSearchQuery, setArtistSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchingArtists, setIsSearchingArtists] = useState(false);
  const searchTimerRef = useRef(null);

  const [lastSelectedArtist, setLastSelectedArtist] = useState(null);
  const [suggestedBy, setSuggestedBy] = useState({});
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [artistImages, setArtistImages] = useState(DEFAULT_ARTIST_IMAGES);
  const [failedImages, setFailedImages] = useState({});

  // Derive initial artists from chosen languages
  useEffect(() => {
    const artistSet = new Set();
    selectedLanguages.forEach((langId) => {
      const langObj = MUSIC_LANGUAGES.find((l) => l.id === langId);
      if (langObj) {
        langObj.defaultArtists.forEach((a) => artistSet.add(a));
      }
    });
    setAvailableArtists(Array.from(artistSet));
  }, [selectedLanguages]);

  // Fetch missing artist photos in batch when available artists expand
  useEffect(() => {
    const missing = availableArtists.filter((a) => !artistImages[a] && !failedImages[a]);
    if (missing.length > 0) {
      api.getBatchArtistImages(missing).then((res) => {
        if (res && res.images && Object.keys(res.images).length > 0) {
          setArtistImages((prev) => ({ ...prev, ...res.images }));
        }
      }).catch((err) => {
        console.warn("Artist images batch error:", err);
      });
    }
  }, [availableArtists]);

  // Live Global Search on YouTube Music + Instant Local Cache
  useEffect(() => {
    const q = artistSearchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setIsSearchingArtists(false);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      return;
    }

    const qLower = q.toLowerCase();

    // 1. Instant local match across availableArtists AND all 82 DEFAULT_ARTIST_IMAGES
    const localMatchNames = new Set();
    availableArtists.forEach((a) => {
      if (a.toLowerCase().includes(qLower)) localMatchNames.add(a);
    });
    Object.keys(DEFAULT_ARTIST_IMAGES).forEach((a) => {
      if (a.toLowerCase().includes(qLower)) localMatchNames.add(a);
    });

    const instantResults = Array.from(localMatchNames).map((name) => ({
      name,
      thumbnail: artistImages[name] || DEFAULT_ARTIST_IMAGES[name] || "",
    }));
    setSearchResults(instantResults);

    // 2. Debounced live YouTube Music search for any artist globally
    setIsSearchingArtists(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    searchTimerRef.current = setTimeout(async () => {
      try {
        const data = await api.searchArtists(q, 10);
        if (data && data.artists && data.artists.length > 0) {
          // Cache thumbnails
          const newImgMap = {};
          data.artists.forEach((art) => {
            if (art.name && art.thumbnail) {
              newImgMap[art.name] = art.thumbnail;
            }
          });
          if (Object.keys(newImgMap).length > 0) {
            setArtistImages((prev) => ({ ...newImgMap, ...prev }));
          }

          // Merge without duplicates
          setSearchResults((prev) => {
            const existingNames = new Set(prev.map((p) => p.name.toLowerCase()));
            const additions = data.artists.filter(
              (art) => art.name && !existingNames.has(art.name.toLowerCase())
            );
            return [...prev, ...additions];
          });
        }
      } catch (err) {
        console.warn("Live artist search error:", err);
      } finally {
        setIsSearchingArtists(false);
      }
    }, 280);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [artistSearchQuery]);

  // Language toggle handler
  const handleToggleLanguage = (langId) => {
    setSelectedLanguages((prev) => {
      if (prev.includes(langId)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter((id) => id !== langId);
      } else {
        return [...prev, langId];
      }
    });
  };

  // Artist selection toggle handler: creates more cards directly after the selected artist
  const handleToggleArtist = async (artistName) => {
    const isCurrentlySelected = selectedArtists.includes(artistName);

    if (isCurrentlySelected) {
      setSelectedArtists((prev) => prev.filter((a) => a !== artistName));
    } else {
      setSelectedArtists((prev) => [...prev, artistName]);
      setLastSelectedArtist(artistName);

      // Ensure artist exists in availableArtists so it stays visible after search clears
      setAvailableArtists((prev) => {
        if (!prev.includes(artistName)) {
          return [artistName, ...prev];
        }
        return prev;
      });

      // Trigger dynamic related artist discovery and insert cards right after
      setIsLoadingRelated(true);
      try {
        const data = await api.getRelatedArtists(artistName);
        if (data && data.related && data.related.length > 0) {
          // 1. Collect thumbnails and candidate artist names
          const newImgMap = {};
          const candidates = [];
          data.related.forEach((r) => {
            const candidateName = typeof r === "string" ? r.trim() : r?.name?.trim();
            const candidateThumb = typeof r === "object" ? r?.thumbnail : null;
            if (candidateName && candidateName.toLowerCase() !== artistName.toLowerCase()) {
              candidates.push(candidateName);
              if (candidateThumb) {
                newImgMap[candidateName] = candidateThumb;
              }
            }
          });

          // 2. Merge thumbnails into artistImages state
          if (Object.keys(newImgMap).length > 0) {
            setArtistImages((prev) => ({ ...newImgMap, ...prev }));
          }

          // 3. Take top 4 related artist candidates
          const toInsert = candidates.slice(0, 4);

          if (toInsert.length > 0) {
            // Track which artist suggested each new card
            setSuggestedBy((prev) => {
              const updated = { ...prev };
              toInsert.forEach((name) => {
                if (!updated[name]) {
                  updated[name] = artistName;
                }
              });
              return updated;
            });

            // Dynamically insert the new artist cards RIGHT AFTER the selected artist card
            setAvailableArtists((prev) => {
              const targetIdx = prev.indexOf(artistName);
              if (targetIdx === -1) {
                return [artistName, ...toInsert, ...prev];
              }

              // Remove toInsert from elsewhere in the list to prevent duplicate cards
              const cleanPrev = prev.filter(
                (a) => !toInsert.includes(a) || a === artistName
              );
              const newTargetIdx = cleanPrev.indexOf(artistName);

              const before = cleanPrev.slice(0, newTargetIdx + 1);
              const after = cleanPrev.slice(newTargetIdx + 1);
              return [...before, ...toInsert, ...after];
            });
          }
        }
      } catch (err) {
        console.warn("Related artists lookup error:", err);
      } finally {
        setIsLoadingRelated(false);
      }
    }
  };

  // Step 1 -> Step 2 validation
  const canGoToStep2 = username.trim().length > 0 && selectedLanguages.length > 0;

  // Final submission
  const handleFinish = async () => {
    if (selectedArtists.length < 3) return;
    setIsFinishing(true);

    // Give a brief moment for visual smoothness then transition immediately
    setTimeout(() => {
      completeOnboarding({
        username: username.trim(),
        languages: selectedLanguages,
        favoriteArtists: selectedArtists,
      });
    }, 600);
  };

  // Show live search results when searching, otherwise show availableArtists
  const displayedArtists = artistSearchQuery.trim()
    ? searchResults.map((r) => r.name)
    : availableArtists;

  return (
    <View style={styles.container}>
      {/* Top Navigation & Step Indicator */}
      <View style={styles.topHeader}>
        {step === 2 ? (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setStep(1)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}

        {/* 2-Step Progress Bars */}
        <View style={styles.stepIndicatorRow}>
          <View style={[styles.stepBar, styles.stepBarActive]} />
          <View style={[styles.stepBar, step === 2 && styles.stepBarActive]} />
        </View>

        <Text style={styles.stepText}>{step}/2</Text>
      </View>

      {step === 1 ? (
        <ScrollView
          style={styles.scrollBody}
          contentContainerStyle={[styles.scrollContent, (isDesktop || isTablet) && styles.desktopContainer]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.mainTitle}>Welcome to Staytup</Text>
          <Text style={styles.subtitle}>
            Enter your name and pick the languages you love listening to.
          </Text>

          {/* User Display Name Input */}
          <View style={styles.inputCard}>
            <View style={[styles.avatarPreview, { overflow: "hidden" }]}>
              {userProfile?.avatar && userProfile.avatar.startsWith("http") ? (
                <Image
                  source={{ uri: userProfile.avatar }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="cover"
                />
              ) : username.trim() ? (
                <Text style={styles.avatarLetter}>
                  {username.trim().charAt(0).toUpperCase()}
                </Text>
              ) : (
                <Ionicons name="person" size={20} color="#000000" />
              )}
            </View>
            <TextInput
              style={styles.textInput}
              placeholder="What should we call you?"
              placeholderTextColor={colors.textMuted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={25}
            />
          </View>

          {/* Languages Section */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Select Languages</Text>
            <Text style={styles.sectionCountBadge}>
              {selectedLanguages.length} selected
            </Text>
          </View>

          <View style={styles.languageGrid}>
            {MUSIC_LANGUAGES.map((lang) => {
              const isSelected = selectedLanguages.includes(lang.id);
              return (
                <TouchableOpacity
                  key={lang.id}
                  style={[
                    styles.langTile,
                    { width: isDesktop ? "23.5%" : isTablet ? "31.2%" : "48.2%" },
                    isSelected && styles.langTileActive,
                  ]}
                  onPress={() => handleToggleLanguage(lang.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.langText, isSelected && styles.langTextActive]}>
                    {lang.label}
                  </Text>
                  {isSelected ? (
                    <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={[styles.scrollContent, (isDesktop || isTablet) && styles.desktopContainer]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.mainTitle}>Choose Artists</Text>
            <Text style={styles.subtitle}>
              Pick 3 or more artists. When you tap an artist, we'll discover similar ones for you!
            </Text>

            {/* Live Search Bar */}
            <View style={styles.searchBarBox}>
              <Ionicons name="search" size={18} color={colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search any artist in the world (e.g. Coldplay, Drake)..."
                placeholderTextColor={colors.textMuted}
                value={artistSearchQuery}
                onChangeText={setArtistSearchQuery}
                autoCorrect={false}
              />
              {isSearchingArtists ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 6 }} />
              ) : artistSearchQuery ? (
                <TouchableOpacity onPress={() => setArtistSearchQuery("")}>
                  <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Live Search Status Feedback */}
            {artistSearchQuery.trim() ? (
              <View style={styles.searchStatusRow}>
                <Ionicons
                  name={isSearchingArtists ? "sync-outline" : "search-outline"}
                  size={13}
                  color={colors.primary}
                />
                <Text style={styles.searchStatusText}>
                  {isSearchingArtists
                    ? `Searching live on YouTube Music for "${artistSearchQuery.trim()}"...`
                    : `Showing ${displayedArtists.length} matching artists`}
                </Text>
              </View>
            ) : null}

            {/* Dynamic Status / Discovery Indicator */}
            {Boolean(lastSelectedArtist && !artistSearchQuery.trim()) ? (
              <View style={styles.feedbackBanner}>
                <Ionicons
                  name={isLoadingRelated ? "sync-circle" : "sparkles"}
                  size={15}
                  color={colors.primary}
                />
                <Text style={styles.feedbackText} numberOfLines={1}>
                  {isLoadingRelated
                    ? `Discovering artists similar to ${lastSelectedArtist}...`
                    : `Added similar artists after ${lastSelectedArtist}`}
                </Text>
              </View>
            ) : null}

            {/* Artist Grid with Responsive Card Widths */}
            <View style={styles.artistsGrid}>
              {displayedArtists.map((artistName) => {
                const isSelected = selectedArtists.includes(artistName);
                const isTargetArtist = lastSelectedArtist === artistName;
                const isSuggested = Boolean(suggestedBy[artistName] && !isSelected);
                const imageUrl = artistImages[artistName];
                const hasFailed = failedImages[artistName];
                const initial = artistName.charAt(0).toUpperCase();

                return (
                  <TouchableOpacity
                    key={artistName}
                    style={[
                      styles.artistCard,
                      { width: isDesktop ? "15.3%" : isTablet ? "23.2%" : "30.5%" },
                      isSelected && styles.artistCardActive,
                      isSuggested && styles.artistCardSuggested,
                    ]}
                    onPress={() => handleToggleArtist(artistName)}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        styles.artistAvatar,
                        isSelected && styles.artistAvatarActive,
                        isSuggested && styles.artistAvatarSuggested,
                      ]}
                    >
                      {imageUrl && !hasFailed ? (
                        <Image
                          source={{ uri: imageUrl }}
                          style={styles.artistPhoto}
                          resizeMode="cover"
                          onError={() => {
                            setFailedImages((prev) => ({ ...prev, [artistName]: true }));
                          }}
                        />
                      ) : (
                        <Text
                          style={[styles.artistInitial, isSelected && styles.artistInitialActive]}
                        >
                          {initial}
                        </Text>
                      )}

                      {/* Selected Checkmark or Loading indicator */}
                      {isSelected ? (
                        <View style={styles.checkBadge}>
                          {isLoadingRelated && isTargetArtist ? (
                            <ActivityIndicator size={10} color="#000000" />
                          ) : (
                            <Ionicons name="checkmark" size={12} color="#000000" />
                          )}
                        </View>
                      ) : null}

                      {/* Dynamic Suggestion Sparkle Badge */}
                      {isSuggested ? (
                        <View style={styles.sparkleBadge}>
                          <Ionicons name="sparkles" size={10} color={colors.primary} />
                        </View>
                      ) : null}
                    </View>

                    <Text
                      style={[styles.artistCardName, isSelected && styles.artistCardNameActive]}
                      numberOfLines={2}
                    >
                      {artistName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Add Custom Artist if searched and not present */}
            {Boolean(artistSearchQuery.trim() && !isSearchingArtists && displayedArtists.length === 0) ? (
              <TouchableOpacity
                style={styles.addCustomArtistBtn}
                onPress={() => {
                  handleToggleArtist(artistSearchQuery.trim());
                  setArtistSearchQuery("");
                }}
              >
                <Ionicons name="add-circle" size={20} color={colors.primary} />
                <Text style={styles.addCustomArtistText}>
                  Add "{artistSearchQuery.trim()}" to favorites
                </Text>
              </TouchableOpacity>
            ) : null}

            <View style={{ height: 110 }} />
          </ScrollView>
        </View>
      )}

      {/* Floating Bottom Action Bar */}
      <View style={styles.bottomActionBar}>
        <View style={[styles.bottomActionBarInner, (isDesktop || isTablet) && styles.desktopBottomBarInner]}>
          {step === 1 ? (
            <TouchableOpacity
              style={[styles.primaryButton, !canGoToStep2 && styles.primaryButtonDisabled]}
              disabled={!canGoToStep2}
              onPress={() => {
                Keyboard.dismiss();
                setStep(2);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Next: Choose Artists</Text>
              <Ionicons name="arrow-forward" size={18} color="#000000" />
            </TouchableOpacity>
          ) : (
            <View style={styles.finishRow}>
              <View style={styles.counterTextContainer}>
                <Text style={styles.counterTitle}>
                  {selectedArtists.length} of 3 selected
                </Text>
                <Text style={styles.counterSub}>
                  {selectedArtists.length >= 3
                    ? "Great taste profile!"
                    : `Pick ${3 - selectedArtists.length} more`}
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  styles.finishButton,
                  selectedArtists.length < 3 && styles.primaryButtonDisabled,
                ]}
                disabled={selectedArtists.length < 3 || isFinishing}
                onPress={handleFinish}
                activeOpacity={0.85}
              >
                {isFinishing ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>Start Listening</Text>
                    <Ionicons name="play" size={16} color="#000000" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "web" ? 14 : 36,
    paddingBottom: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  stepIndicatorRow: {
    flexDirection: "row",
    gap: 8,
    width: 100,
  },
  stepBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceBorder,
  },
  stepBarActive: {
    backgroundColor: colors.primary,
  },
  stepText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.textSecondary,
    width: 36,
    textAlign: "right",
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  mainTitle: {
    fontFamily: fonts.bold,
    fontSize: 26,
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 20,
    marginBottom: 20,
  },
  inputCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 56,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: 24,
  },
  avatarPreview: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarLetter: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#000000",
  },
  textInput: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.text,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
  },
  sectionCountBadge: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.primary,
  },
  languageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  langTile: {
    width: "48.2%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  langTileActive: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceVariant,
  },
  langText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textSecondary,
  },
  langTextActive: {
    fontFamily: fonts.semiBold,
    color: colors.text,
  },

  // Step 2 Styles
  searchBarBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
    marginLeft: 8,
    marginRight: 8,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
  },
  feedbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(29, 185, 84, 0.08)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.22)",
    marginBottom: 16,
    alignSelf: "flex-start",
  },
  feedbackText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.primary,
  },
  artistsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  artistCard: {
    width: "30.5%",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  artistCardActive: {
    backgroundColor: "rgba(29, 185, 84, 0.08)",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  artistCardSuggested: {
    backgroundColor: colors.surfaceVariant,
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.25)",
  },
  artistAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceCard,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginBottom: 8,
  },
  artistAvatarActive: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  artistAvatarSuggested: {
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.4)",
  },
  artistPhoto: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surfaceCard,
  },
  artistInitial: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.textSecondary,
  },
  artistInitialActive: {
    color: colors.primary,
  },
  checkBadge: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.background,
  },
  sparkleBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#181818",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  artistCardName: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 16,
  },
  artistCardNameActive: {
    fontFamily: fonts.semiBold,
    color: colors.text,
  },
  addCustomArtistBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  addCustomArtistText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.primary,
  },

  // Bottom Floating Bar
  bottomActionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === "web" ? 14 : 20,
    backgroundColor: "#000000",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    height: 50,
    borderRadius: 25,
    gap: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.4,
  },
  primaryButtonText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#000000",
  },
  finishRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  counterTextContainer: {
    flex: 1,
    marginRight: 14,
  },
  counterTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.text,
  },
  counterSub: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.primary,
    marginTop: 2,
  },
  finishButton: {
    paddingHorizontal: 24,
    width: "auto",
  },
  bottomActionBarInner: {
    width: "100%",
  },
  desktopContainer: {
    maxWidth: 960,
    alignSelf: "center",
    width: "100%",
    paddingHorizontal: 28,
  },
  desktopBottomBarInner: {
    maxWidth: 960,
    alignSelf: "center",
    width: "100%",
  },
  searchStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  searchStatusText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.primary,
  },
});
