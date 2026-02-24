import FontAwesome from "@expo/vector-icons/FontAwesome";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack, router, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import "react-native-reanimated";

import { useColorScheme } from "@/components/useColorScheme";
import { ColorSchemeProvider } from "@/components/ColorSchemeProvider";
import { getOnboardingCompleted } from "@/utils/onboardingStorage";
import { supabase } from "@/lib/supabase";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  initialRouteName: "index",
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...FontAwesome.font,
  });

  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    (async () => {
      const completed = await getOnboardingCompleted();
      if (!cancelled) setOnboardingCompleted(completed);
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  useEffect(() => {
    if (loaded && onboardingCompleted !== null) SplashScreen.hideAsync();
  }, [loaded, onboardingCompleted]);

  if (!loaded || onboardingCompleted === null) return null;

  return (
    <ColorSchemeProvider>
      <RootLayoutNav onboardingCompleted={onboardingCompleted} />
    </ColorSchemeProvider>
  );
}

function RootLayoutNav({ onboardingCompleted }: { onboardingCompleted: boolean }) {
  const colorScheme = useColorScheme();
  const segments = useSegments();
  const [stickyCompleted, setStickyCompleted] = useState(onboardingCompleted);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const isOnboardingRoute = segments[0] === "onboarding";

      // Important: onboardingCompleted is loaded once at app boot.
      // Always re-check the persisted flag on navigation changes to avoid loops.
      const completedNow = await getOnboardingCompleted();
      if (cancelled) return;

      if (completedNow) setStickyCompleted(true);
      const effectiveCompleted = stickyCompleted || completedNow;

      if (!effectiveCompleted && !isOnboardingRoute) {
        router.replace("/onboarding");
        return;
      }

      if (effectiveCompleted && isOnboardingRoute) {
        router.replace("/(tabs)");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onboardingCompleted, segments, stickyCompleted]);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="workout" />
      </Stack>
    </ThemeProvider>
  );
}
