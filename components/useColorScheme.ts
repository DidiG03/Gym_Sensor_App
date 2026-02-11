import { useAppColorScheme } from "@/components/ColorSchemeProvider";

export function useColorScheme() {
  // Returns the app override (light/dark) so UI can be switched via Settings.
  return useAppColorScheme().scheme;
}
