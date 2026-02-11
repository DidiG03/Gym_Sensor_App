import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform, useColorScheme as useSystemColorScheme } from "react-native";

export type AppColorScheme = "light" | "dark";

type Ctx = {
  scheme: AppColorScheme;
  setScheme: (scheme: AppColorScheme) => void;
  toggleScheme: () => void;
  isDark: boolean;
};

const ColorSchemeContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "movu:colorScheme:v1";

async function loadWeb(): Promise<AppColorScheme | null> {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    return raw === "dark" || raw === "light" ? raw : null;
  } catch {
    return null;
  }
}

async function saveWeb(value: AppColorScheme) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // ignore
  }
}

export function ColorSchemeProvider({ children }: { children: React.ReactNode }) {
  const system = useSystemColorScheme();
  const systemScheme: AppColorScheme = system === "dark" ? "dark" : "light";

  const [scheme, setSchemeState] = useState<AppColorScheme>(systemScheme);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (Platform.OS !== "web") return;
      const saved = await loadWeb();
      if (!cancelled && saved) setSchemeState(saved);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // If user hasn't overridden on web, keep following system.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    // If there's no saved override, update to system changes.
    loadWeb().then((saved) => {
      if (!saved) setSchemeState(systemScheme);
    });
  }, [systemScheme]);

  const setScheme = useCallback((next: AppColorScheme) => {
    setSchemeState(next);
    if (Platform.OS === "web") void saveWeb(next);
  }, []);

  const toggleScheme = useCallback(() => {
    setSchemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      if (Platform.OS === "web") void saveWeb(next);
      return next;
    });
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      scheme,
      setScheme,
      toggleScheme,
      isDark: scheme === "dark",
    }),
    [scheme, setScheme, toggleScheme]
  );

  return <ColorSchemeContext.Provider value={value}>{children}</ColorSchemeContext.Provider>;
}

export function useAppColorScheme() {
  const ctx = useContext(ColorSchemeContext);
  if (!ctx) {
    throw new Error("useAppColorScheme must be used within ColorSchemeProvider");
  }
  return ctx;
}

