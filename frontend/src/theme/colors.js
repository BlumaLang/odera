// Spotify-grade clean & clear theme with Poppins typography
export const colors = {
  // Pure Pure Black Dark Palette
  background: "#000000",
  surface: "#0e0e0e",
  surfaceVariant: "#181818",
  surfaceCard: "#141414",
  surfaceBorder: "#222222",
  surfaceHover: "#1c1c1c",
  
  // Spotify Signature Green Accents
  primary: "#1DB954",
  primaryLight: "#1ED760",
  primaryDark: "#169C46",
  
  // Secondary vibrant accents for mood cards & tags
  accentCyan: "#2EBDD7",
  accentOrange: "#F59B23",
  accentPurple: "#8C52FF",
  accentPink: "#E91429",
  accentBlue: "#1E3264",
  accentIndigo: "#503750",
  
  // Typography Colors
  text: "#FFFFFF",
  textSecondary: "#B3B3B3",
  textMuted: "#727272",
  
  // Player & UI
  playerBg: "#000000",
  progressBarBg: "#4D4D4D",
  progressBarFill: "#1DB954",
  
  success: "#1DB954",
  error: "#E91429",
};

export const fonts = {
  regular: "Poppins_400Regular",
  medium: "Poppins_500Medium",
  semiBold: "Poppins_600SemiBold",
  bold: "Poppins_700Bold",
  extraBold: "Poppins_800ExtraBold",
};

export const typography = {
  header: {
    fontFamily: fonts.bold,
    fontSize: 24,
    color: colors.text,
    letterSpacing: -0.5,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.text,
    letterSpacing: -0.3,
  },
  cardTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.text,
  },
  cardSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  meta: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.textMuted,
  },
};
