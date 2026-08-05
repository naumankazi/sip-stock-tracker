import { useColorScheme } from "react-native";

const light = {
  surface: "#F9F8F6",
  onSurface: "#1A1A1A",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#1A1A1A",
  surfaceTertiary: "#F0EFEA",
  onSurfaceTertiary: "#4A4A4A",
  surfaceInverse: "#1A1A1A",
  onSurfaceInverse: "#F9F8F6",
  brand: "#3B5945",
  brandPrimary: "#3B5945",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#5A7A66",
  brandTertiary: "#E8EFEA",
  onBrandTertiary: "#2E4536",
  success: "#285C4D",
  warning: "#D97706",
  error: "#C94A4A",
  info: "#4A4A4A",
  border: "#E5E3DB",
  borderStrong: "#D1CEC3",
  divider: "#E5E3DB",
  mutedText: "#6B6B6B",
};

const dark: typeof light = {
  surface: "#121212",
  onSurface: "#F0F0F0",
  surfaceSecondary: "#1E1E1E",
  onSurfaceSecondary: "#F0F0F0",
  surfaceTertiary: "#2A2A2A",
  onSurfaceTertiary: "#B0B0B0",
  surfaceInverse: "#F0F0F0",
  onSurfaceInverse: "#121212",
  brand: "#4D735A",
  brandPrimary: "#4D735A",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#6A8F78",
  brandTertiary: "#233328",
  onBrandTertiary: "#A2C2AE",
  success: "#367A66",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#9CA3AF",
  border: "#2C2C2C",
  borderStrong: "#444444",
  divider: "#2C2C2C",
  mutedText: "#8A8A8A",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };
export const font = { sm: 12, base: 14, lg: 16, xl: 20, xxl: 24, xxxl: 32 };

export type ThemeColors = typeof light;

export function useThemeColors(): ThemeColors {
  const scheme = useColorScheme();
  return scheme === "dark" ? dark : light;
}

export function formatINR(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return "₹" + rounded.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
