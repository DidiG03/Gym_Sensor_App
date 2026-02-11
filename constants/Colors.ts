// App palette
// Background: #0E0F12
// Card surface: #171A1F
// Primary (CTA / slider): #FFFFFF
// Accent (status / success): #4ADE80
// Secondary accent: #3B82F6
// Text primary: #FFFFFF
// Text secondary: #9CA3AF

const darkPalette = {
  background: "#0E0F12",
  card: "#171A1F",
  primary: "#FFFFFF",
  success: "#4ADE80",
  danger: "#EF4444",
  accent: "#3B82F6",
  text: "#FFFFFF",
  textSecondary: "#9CA3AF",
  border: "#23262D",
};

const lightPalette = {
  background: "#FFFFFF",
  card: "#F3F4F6",
  primary: "#0E0F12",
  success: "#4ADE80",
  danger: "#EF4444",
  accent: "#3B82F6",
  text: "#0E0F12",
  textSecondary: "#6B7280",
  border: "#E5E7EB",
};

export default {
  // Keep light/dark aligned to enforce a consistent brand look regardless of OS mode.
  light: {
    ...lightPalette,
    tint: lightPalette.accent,
    tabIconDefault: lightPalette.textSecondary,
    tabIconSelected: lightPalette.accent,
  },
  dark: {
    ...darkPalette,
    tint: darkPalette.accent,
    tabIconDefault: darkPalette.textSecondary,
    tabIconSelected: darkPalette.accent,
  },
};
