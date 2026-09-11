import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Platform,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";
import { api } from "../api/client";
import { useUser } from "../context/UserContext";
import { useResponsive } from "../context/ResponsiveContext";
import { getCachedArtist, saveCachedArtist } from "../services/firebase";
import { resolveLocalArtistImage } from "../theme/artistImages";

// Curated starting artists by language with stable identifiers and official names
const MUSIC_LANGUAGES = [
  {
    id: "Hindi",
    label: "Hindi",
    defaultArtists: [
      { id: "459320", name: "Arijit Singh" },
      { id: "455130", name: "Shreya Ghoshal" },
      { id: "456323", name: "Pritam" },
      { id: "455125", name: "Atif Aslam" },
      { id: "1028741", name: "Anuv Jain" },
      { id: "455490", name: "Mohit Chauhan" },
    ],
  },
  {
    id: "Punjabi",
    label: "Punjabi",
    defaultArtists: [
      { id: "468245", name: "Diljit Dosanjh" },
      { id: "464947", name: "Karan Aujla" },
      { id: "885764", name: "AP Dhillon" },
      { id: "468247", name: "Sidhu Moose Wala" },
      { id: "468248", name: "Ammy Virk" },
      { id: "983214", name: "Shubh" },
    ],
  },
  {
    id: "English",
    label: "English / Pop",
    defaultArtists: [
      { id: "565990", name: "Taylor Swift" },
      { id: "455859", name: "The Weeknd" },
      { id: "456863", name: "Drake" },
      { id: "455823", name: "Ed Sheeran" },
      { id: "687254", name: "Billie Eilish" },
      { id: "455822", name: "Bruno Mars" },
    ],
  },
  {
    id: "Telugu",
    label: "Telugu",
    defaultArtists: [
      { id: "464656", name: "Sid Sriram" },
      { id: "456269", name: "Anirudh Ravichander" },
      { id: "456268", name: "Devi Sri Prasad" },
      { id: "456270", name: "Thaman S" },
      { id: "459633", name: "Armaan Malik" },
    ],
  },
  {
    id: "Tamil",
    label: "Tamil",
    defaultArtists: [
      { id: "456269", name: "Anirudh Ravichander" },
      { id: "456262", name: "AR Rahman" },
      { id: "456265", name: "Yuvan Shankar Raja" },
      { id: "456266", name: "Harris Jayaraj" },
      { id: "464656", name: "Sid Sriram" },
    ],
  },
  {
    id: "Bengali",
    label: "Bengali",
    defaultArtists: [
      { id: "459320", name: "Arijit Singh" },
      { id: "465892", name: "Anupam Roy" },
      { id: "455130", name: "Shreya Ghoshal" },
      { id: "467812", name: "Rupam Islam" },
      { id: "469123", name: "Somlata Acharyya" },
    ],
  },
  {
    id: "Malayalam",
    label: "Malayalam",
    defaultArtists: [
      { id: "689123", name: "Sushin Shyam" },
      { id: "789124", name: "Hesham Abdul Wahab" },
      { id: "889125", name: "KS Harisankar" },
      { id: "989126", name: "Vineeth Sreenivasan" },
    ],
  },
  {
    id: "Kannada",
    label: "Kannada",
    defaultArtists: [
      { id: "458921", name: "Vijay Prakash" },
      { id: "558922", name: "Sanjith Hegde" },
      { id: "658923", name: "Raghu Dixit" },
      { id: "758924", name: "Charan Raj" },
    ],
  },
  {
    id: "Marathi",
    label: "Marathi",
    defaultArtists: [
      { id: "457812", name: "Ajay-Atul" },
      { id: "557813", name: "Swapnil Bandodkar" },
      { id: "657814", name: "Adarsh Shinde" },
      { id: "757815", name: "Avadhoot Gupte" },
    ],
  },
  {
    id: "Gujarati",
    label: "Gujarati",
    defaultArtists: [
      { id: "459012", name: "Aditya Gadhvi" },
      { id: "559013", name: "Kinjal Dave" },
      { id: "659014", name: "Jigardan Gadhavi" },
      { id: "759015", name: "Geeta Rabari" },
    ],
  },
  {
    id: "Spanish",
    label: "Spanish / Latin",
    defaultArtists: [
      { id: "658190", name: "Bad Bunny" },
      { id: "758191", name: "Rosalía" },
      { id: "858192", name: "J Balvin" },
      { id: "958193", name: "Rauw Alejandro" },
    ],
  },
  {
    id: "K-Pop",
    label: "K-Pop",
    defaultArtists: [
      { id: "559981", name: "BTS" },
      { id: "659982", name: "BLACKPINK" },
      { id: "759983", name: "NewJeans" },
      { id: "859984", name: "Stray Kids" },
      { id: "959985", name: "TWICE" },
    ],
  },
];

const INITIAL_DISPLAY_LIMIT = 10;
const PAGE_BATCH_SIZE = 8;
const MAX_RECOMMENDATION_POOL = 24;

export default function OnboardingScreen() {
  const { completeOnboarding, userProfile, currentUser } = useUser();
  const { isTablet, isDesktop } = useResponsive();

  const [step, setStep] = useState(1); // 1 = Language Selection, 2 = Artists

  // Resolve permanent username (Animikh / userProfile / displayName)
  const effectiveUsername = useMemo(() => {
    const up = userProfile?.username;
    if (up && up !== "Staytup Listener" && up !== "Music Lover" && !up.startsWith("listener_")) {
      return up;
    }
    const dp = currentUser?.displayName || currentUser?.username;
    if (dp && dp !== "Staytup Listener" && dp !== "Music Lover" && !dp.startsWith("listener_")) {
      return dp;
    }
    return "Animikh";
  }, [userProfile?.username, currentUser?.displayName, currentUser?.username]);

  const [selectedLanguages, setSelectedLanguages] = useState(["Hindi", "Punjabi", "English"]);

  // Step 2: Artists state
  // selectedArtists is an array of normalized artist objects: { id, name, image }
  const [selectedArtists, setSelectedArtists] = useState([]);
  // recommendedPool is an array of normalized artist objects: { id, name, image }
  const [recommendedPool, setRecommendedPool] = useState([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_DISPLAY_LIMIT);

  // Search state
  const [artistSearchQuery, setArtistSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchingArtists, setIsSearchingArtists] = useState(false);
  const searchTimerRef = useRef(null);

  // Recommendation loading state & race condition guard
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const requestVersionRef = useRef(0);
  const [lastSelectedArtistName, setLastSelectedArtistName] = useState(null);

  const [isFinishing, setIsFinishing] = useState(false);
  const [imageMap, setImageMap] = useState({});
  const [failedImages, setFailedImages] = useState({});

  // Fast Set of selected artist IDs and normalized names for zero-overhead filtering
  const selectedArtistIds = useMemo(() => {
    const ids = new Set();
    selectedArtists.forEach((a) => {
      if (a.id) ids.add(String(a.id));
      if (a.name) ids.add(a.name.trim().toLowerCase());
    });
    return ids;
  }, [selectedArtists]);

  // Derive curated starter artists with instant high-res photos whenever chosen languages change
  useEffect(() => {
    const map = new Map();
    selectedLanguages.forEach((langId) => {
      const langObj = MUSIC_LANGUAGES.find((l) => l.id === langId);
      if (langObj) {
        langObj.defaultArtists.forEach((a) => {
          if (!map.has(a.id)) {
            const photo = resolveLocalArtistImage(a.name) || null;
            map.set(a.id, {
              id: String(a.id),
              name: a.name,
              image: photo,
              type: "artist",
            });
          }
        });
      }
    });

    const starters = Array.from(map.values()).slice(0, 18);
    setRecommendedPool(starters);
    setVisibleCount(INITIAL_DISPLAY_LIMIT);
  }, [selectedLanguages]);

  // Image retrieval helper: Local high-res -> DB Cache -> Staytup API
  const resolveArtistPhoto = useCallback(async (artist) => {
    if (!artist) return null;
    const id = artist.id ? String(artist.id) : null;
    const name = artist.name ? artist.name.trim() : "";
    const key = id || name;

    if (imageMap[key]) return imageMap[key];
    if (artist.image) {
      setImageMap((prev) => ({ ...prev, [key]: artist.image, [name]: artist.image }));
      return artist.image;
    }

    const localPhoto = resolveLocalArtistImage(name);
    if (localPhoto) {
      setImageMap((prev) => ({ ...prev, [key]: localPhoto, [name]: localPhoto }));
      return localPhoto;
    }

    // 1. Check Firebase Database Cache
    try {
      const cached = await getCachedArtist(key);
      if (cached && (cached.imageUrl || cached.image)) {
        const url = cached.imageUrl || cached.image;
        setImageMap((prev) => ({ ...prev, [key]: url, [name]: url }));
        return url;
      }
    } catch (_) {}

    // 2. Fetch from Staytup API
    try {
      const res = await api.getArtistImage(name || id);
      if (res && res.image) {
        setImageMap((prev) => ({ ...prev, [key]: res.image, [name]: res.image }));
        saveCachedArtist({ id: id || name, name, imageUrl: res.image }).catch(() => {});
        return res.image;
      }
    } catch (_) {}

    return null;
  }, [imageMap]);

  // Batch resolve visible artist photos
  useEffect(() => {
    const visibleArtists = recommendedPool.slice(0, visibleCount);
    const missing = visibleArtists.filter((a) => {
      const key = a.id || a.name;
      return !imageMap[key] && !failedImages[key];
    });

    if (missing.length === 0) return;

    let isSubscribed = true;
    Promise.allSettled(missing.map((a) => resolveArtistPhoto(a))).then(() => {
      if (!isSubscribed) return;
    });

    return () => {
      isSubscribed = false;
    };
  }, [recommendedPool, visibleCount, imageMap, failedImages, resolveArtistPhoto]);

  // Live Staytup API Artist Search with debouncing
  useEffect(() => {
    const q = artistSearchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setIsSearchingArtists(false);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      return;
    }

    setIsSearchingArtists(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.searchArtists(q, 12);
        const list = res?.results || res?.artists || [];
        const normalized = list.map((a) => ({
          id: String(a.id || a.name),
          name: a.name,
          image: a.image || a.thumbnail || null,
          type: "artist",
        }));

        // Cache images to memory map
        const imgUpdates = {};
        normalized.forEach((a) => {
          if (a.image) {
            imgUpdates[a.id] = a.image;
            imgUpdates[a.name] = a.image;
          }
        });
        if (Object.keys(imgUpdates).length > 0) {
          setImageMap((prev) => ({ ...prev, ...imgUpdates }));
        }

        setSearchResults(normalized);
      } catch (err) {
        console.warn("Artist search error:", err);
        setSearchResults([]);
      } finally {
        setIsSearchingArtists(false);
      }
    }, 240);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [artistSearchQuery]);

  // Language toggle handler
  const handleToggleLanguage = (langId) => {
    setSelectedLanguages((prev) => {
      if (prev.includes(langId)) {
        if (prev.length === 1) return prev; // Retain at least one
        return prev.filter((id) => id !== langId);
      } else {
        return [...prev, langId];
      }
    });
  };

  // Artist selection toggle handler with Progressive Recommendations
  const handleToggleArtist = async (artistInput) => {
    const artist = typeof artistInput === "string"
      ? { id: artistInput.trim().toLowerCase(), name: artistInput.trim(), image: null }
      : artistInput;

    const artistId = String(artist.id || artist.name);
    const artistName = artist.name;
    const isAlreadySelected = selectedArtistIds.has(artistId) || selectedArtistIds.has(artistName.trim().toLowerCase());

    if (isAlreadySelected) {
      // Deselect
      setSelectedArtists((prev) =>
        prev.filter((a) => String(a.id) !== artistId && a.name.trim().toLowerCase() !== artistName.trim().toLowerCase())
      );
      return;
    }

    // 1. Add to selected artists
    const updatedSelected = [...selectedArtists, artist];
    setSelectedArtists(updatedSelected);
    setLastSelectedArtistName(artistName);

    // Save image to RTDB if available
    if (artist.image) {
      saveCachedArtist({ id: artistId, name: artistName, imageUrl: artist.image }).catch(() => {});
    }

    // 2. Fetch progressive recommendations from Staytup API
    const currentVersion = ++requestVersionRef.current;
    setIsLoadingRecommendations(true);

    try {
      const relData = await api.getRelatedArtists(artistId || artistName, 8);
      const incoming = relData?.results || relData?.artists || [];

      // Check race condition: only latest request wins
      if (currentVersion !== requestVersionRef.current) return;

      if (incoming.length > 0) {
        // Collect incoming photos
        const newImgMap = {};
        incoming.forEach((item) => {
          if (item.image) {
            newImgMap[item.id] = item.image;
            newImgMap[item.name] = item.image;
          }
        });
        if (Object.keys(newImgMap).length > 0) {
          setImageMap((prev) => ({ ...prev, ...newImgMap }));
        }

        // Build current exclusion set (all currently selected artists)
        const currentExcludedIds = new Set();
        updatedSelected.forEach((s) => {
          if (s.id) currentExcludedIds.add(String(s.id));
          if (s.name) currentExcludedIds.add(s.name.trim().toLowerCase());
        });

        // Filter incoming recommendations: genuine artists not already selected
        const validRecommendations = incoming.filter((r) => {
          const rId = String(r.id || "");
          const rName = (r.name || "").trim().toLowerCase();
          return !currentExcludedIds.has(rId) && !currentExcludedIds.has(rName);
        });

        if (validRecommendations.length > 0) {
          // Merge progressively: put newly discovered artists at front of recommendation pool
          setRecommendedPool((prev) => {
            const existingIds = new Set();
            const filteredPrev = prev.filter((p) => {
              const pId = String(p.id || "");
              const pName = (p.name || "").trim().toLowerCase();
              if (currentExcludedIds.has(pId) || currentExcludedIds.has(pName)) return false;
              if (existingIds.has(pId) || existingIds.has(pName)) return false;
              if (pId) existingIds.add(pId);
              existingIds.add(pName);
              return true;
            });

            const merged = [...validRecommendations, ...filteredPrev];
            const deduped = [];
            const seen = new Set();
            merged.forEach((item) => {
              const kId = String(item.id || "");
              const kName = (item.name || "").trim().toLowerCase();
              if (currentExcludedIds.has(kId) || currentExcludedIds.has(kName)) return;
              if (seen.has(kId) || seen.has(kName)) return;
              if (kId) seen.add(kId);
              seen.add(kName);
              deduped.push(item);
            });

            return deduped.slice(0, MAX_RECOMMENDATION_POOL);
          });

          // Maintain comfortable view window (10–16 cards initially)
          setVisibleCount((prev) => Math.min(Math.max(prev, INITIAL_DISPLAY_LIMIT), MAX_RECOMMENDATION_POOL));
        }
      }
    } catch (err) {
      console.warn("Progressive recommendation error:", err);
    } finally {
      if (currentVersion === requestVersionRef.current) {
        setIsLoadingRecommendations(false);
      }
    }
  };

  // Filter recommendations: NEVER show selected artists
  const activeRecommendations = useMemo(() => {
    return recommendedPool.filter((a) => {
      const aId = String(a.id || "");
      const aName = (a.name || "").trim().toLowerCase();
      return !selectedArtistIds.has(aId) && !selectedArtistIds.has(aName);
    });
  }, [recommendedPool, selectedArtistIds]);

  // Displayed artists: either search results or active progressive recommendations
  const displayedArtists = useMemo(() => {
    if (artistSearchQuery.trim()) {
      return searchResults.filter((a) => {
        const aId = String(a.id || "");
        const aName = (a.name || "").trim().toLowerCase();
        return !selectedArtistIds.has(aId) && !selectedArtistIds.has(aName);
      });
    }
    return activeRecommendations.slice(0, visibleCount);
  }, [artistSearchQuery, searchResults, activeRecommendations, visibleCount, selectedArtistIds]);

  const hasMoreRecommendations = !artistSearchQuery.trim() && visibleCount < activeRecommendations.length;

  const handleShowMore = () => {
    setVisibleCount((prev) => Math.min(prev + PAGE_BATCH_SIZE, activeRecommendations.length));
  };

  // Dynamic recommendation section title
  const recommendationSectionTitle = useMemo(() => {
    if (artistSearchQuery.trim()) return `Search Results (${displayedArtists.length})`;
    if (selectedArtists.length === 1 && lastSelectedArtistName) {
      return `Because you like ${lastSelectedArtistName}`;
    }
    if (selectedArtists.length > 1) {
      return "More artists for your taste";
    }
    return "Popular & Recommended Artists";
  }, [artistSearchQuery, selectedArtists.length, lastSelectedArtistName, displayedArtists.length]);

  // Step 1 -> Step 2 validation (must select at least 1 language)
  const canGoToStep2 = selectedLanguages.length > 0;

  // Final submission handler
  const handleFinish = async () => {
    if (selectedArtists.length < 3 || isFinishing) return;
    setIsFinishing(true);

    const artistNames = selectedArtists.map((a) => a.name);

    setTimeout(() => {
      completeOnboarding({
        username: effectiveUsername,
        languages: selectedLanguages,
        favoriteArtists: artistNames,
      });
    }, 500);
  };

  return (
    <View style={styles.container}>
      {/* Top Header & 2-Step Progress Indicator */}
      <View style={styles.topHeader}>
        {step === 2 ? (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setStep(1)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}

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
            Pick the languages you love listening to.
          </Text>

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

          <View style={{ height: 110 }} />
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
              Pick 3 or more artists. Staytup personalizes recommendations as you select.
            </Text>

            {/* Compact Selected Artists Chip Bar (When >=1 selected) */}
            {selectedArtists.length > 0 ? (
              <View style={styles.selectedPillsContainer}>
                <View style={styles.selectedPillsHeader}>
                  <Text style={styles.selectedPillsLabel}>
                    Selected Artists ({selectedArtists.length})
                  </Text>
                  <Text style={styles.selectedPillsHint}>Tap chip to remove</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.selectedPillsScroll}
                >
                  {selectedArtists.map((artist) => {
                    const id = String(artist.id || artist.name);
                    const photo = imageMap[id] || imageMap[artist.name] || artist.image;
                    return (
                      <TouchableOpacity
                        key={`pill_${id}`}
                        style={styles.selectedPill}
                        onPress={() => handleToggleArtist(artist)}
                        activeOpacity={0.7}
                      >
                        {photo && !failedImages[id] ? (
                          <Image
                            source={{ uri: photo }}
                            style={styles.selectedPillImg}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.selectedPillAvatarFallback}>
                            <Text style={styles.selectedPillInitial}>
                              {artist.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.selectedPillText} numberOfLines={1}>
                          {artist.name}
                        </Text>
                        <Ionicons name="close" size={14} color="#FFFFFF" style={{ marginLeft: 4 }} />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {/* Staytup Search Bar */}
            <View style={styles.searchBarBox}>
              <Ionicons name="search" size={18} color={colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search any artist in Staytup catalog..."
                placeholderTextColor={colors.textMuted}
                value={artistSearchQuery}
                onChangeText={setArtistSearchQuery}
                autoCorrect={false}
              />
              {isSearchingArtists ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 6 }} />
              ) : artistSearchQuery ? (
                <TouchableOpacity onPress={() => setArtistSearchQuery("")}>
                  <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Dynamic Section Header Row */}
            <View style={styles.recommendationHeaderRow}>
              <Text style={styles.recommendationTitle}>
                {recommendationSectionTitle}
              </Text>
              {isLoadingRecommendations ? (
                <View style={styles.learningBadge}>
                  <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.learningText}>Updating taste...</Text>
                </View>
              ) : null}
            </View>

            {/* Artist Cards Grid */}
            <View style={styles.artistsGrid}>
              {displayedArtists.map((artist) => {
                const id = String(artist.id || artist.name);
                const name = artist.name;
                const isSelected = selectedArtistIds.has(id) || selectedArtistIds.has(name.trim().toLowerCase());
                const photo = imageMap[id] || imageMap[name] || artist.image;
                const hasFailed = failedImages[id] || failedImages[name];
                const initial = name.charAt(0).toUpperCase();

                return (
                  <TouchableOpacity
                    key={`artist_${id}_${name}`}
                    style={[
                      styles.artistCard,
                      { width: isDesktop ? "18.5%" : isTablet ? "23.2%" : "30.5%" },
                      isSelected && styles.artistCardActive,
                    ]}
                    onPress={() => handleToggleArtist(artist)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.artistAvatar, isSelected && styles.artistAvatarActive]}>
                      {photo && !hasFailed ? (
                        <Image
                          source={{ uri: photo }}
                          style={styles.artistPhoto}
                          resizeMode="cover"
                          onError={() => {
                            setFailedImages((prev) => ({ ...prev, [id]: true, [name]: true }));
                          }}
                        />
                      ) : (
                        <View style={styles.avatarFallback}>
                          <Text style={styles.artistInitial}>
                            {initial}
                          </Text>
                        </View>
                      )}

                      {/* Clear modern selection indicator */}
                      {isSelected ? (
                        <View style={styles.checkBadge}>
                          <Ionicons name="checkmark" size={12} color="#000000" />
                        </View>
                      ) : null}
                    </View>

                    <Text
                      style={[styles.artistCardName, isSelected && styles.artistCardNameActive]}
                      numberOfLines={2}
                    >
                      {name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Skeletons while recommendations are loading initially */}
            {isLoadingRecommendations && displayedArtists.length === 0 ? (
              <View style={styles.artistsGrid}>
                {[1, 2, 3, 4, 5, 6].map((k) => (
                  <View
                    key={`skeleton_${k}`}
                    style={[
                      styles.artistCard,
                      styles.skeletonCard,
                      { width: isDesktop ? "18.5%" : isTablet ? "23.2%" : "30.5%" },
                    ]}
                  >
                    <View style={[styles.artistAvatar, styles.skeletonAvatar]} />
                    <View style={styles.skeletonText} />
                  </View>
                ))}
              </View>
            ) : null}

            {/* Clean empty state for search */}
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

            {/* Smart Show More Button */}
            {hasMoreRecommendations ? (
              <TouchableOpacity
                style={styles.showMoreBtn}
                onPress={handleShowMore}
                activeOpacity={0.8}
              >
                <Text style={styles.showMoreBtnText}>
                  Show more artists ({activeRecommendations.length - visibleCount} available)
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.primary} />
              </TouchableOpacity>
            ) : null}

            <View style={{ height: 120 }} />
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
                    ? "Great taste profile ready!"
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
                    <Ionicons name="play" size={15} color="#000000" />
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
    marginBottom: 16,
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

  // Selected Artists Pills
  selectedPillsContainer: {
    marginBottom: 16,
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  selectedPillsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  selectedPillsLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.text,
  },
  selectedPillsHint: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
  },
  selectedPillsScroll: {
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  selectedPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#202020",
    borderRadius: 18,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  selectedPillImg: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginRight: 6,
  },
  selectedPillAvatarFallback: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  selectedPillInitial: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: "#000000",
  },
  selectedPillText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: "#FFFFFF",
    maxWidth: 120,
  },

  // Search
  searchBarBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
    marginLeft: 8,
    marginRight: 8,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
  },

  // Recommendation Section Header
  recommendationHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  recommendationTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
    letterSpacing: -0.2,
  },
  learningBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  learningText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.primary,
  },

  // Grid & Cards
  artistsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  artistCard: {
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
  artistPhoto: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceCard,
  },
  avatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#222222",
    alignItems: "center",
    justifyContent: "center",
  },
  artistInitial: {
    fontFamily: fonts.bold,
    fontSize: 20,
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

  // Skeleton
  skeletonCard: {
    opacity: 0.5,
  },
  skeletonAvatar: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  skeletonText: {
    width: 50,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  // Show more button
  showMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    marginTop: 14,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  showMoreBtnText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.primary,
  },

  // Custom Artist
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
});
