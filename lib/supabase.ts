import Constants from "expo-constants";
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

function getExtra(): Extra {
  // Expo config can come from different places depending on environment (Expo Go, Dev Client, EAS, web).
  // We try a few sources, then fall back to reading `app.json` (Metro bundler).
  const fromExpoConfig =
    (Constants.expoConfig as { extra?: Extra } | null | undefined)?.extra ?? null;
  const fromExpoGoConfig = (Constants as any)?.expoGoConfig?.extra ?? null;
  const fromManifest2 = (Constants as any)?.manifest2?.extra ?? null;
  const fromManifest = (Constants as any)?.manifest?.extra ?? null;

  const fromAppJson = (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const appJson = require("../app.json") as { expo?: { extra?: Extra } } | undefined;
      return appJson?.expo?.extra ?? null;
    } catch {
      return null;
    }
  })();

  return (fromExpoConfig ?? fromExpoGoConfig ?? fromManifest2 ?? fromManifest ?? fromAppJson ?? {}) as Extra;
}

const { supabaseUrl, supabaseAnonKey } = getExtra();

// Minimal storage adapter so auth sessions persist without AsyncStorage/SecureStore
// (works with your current custom dev client).
function getAuthPaths() {
  const rawBase = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? "";
  const base = rawBase ? (rawBase.endsWith("/") ? rawBase : `${rawBase}/`) : "";
  const dir = `${base}movu`;
  const file = `${dir}/supabase-auth.json`;
  return { base, dir, file };
}

async function ensureDir() {
  const { base, dir } = getAuthPaths();
  if (!base) return;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // ignore
  }
}

async function readAll(): Promise<Record<string, string>> {
  const { base, file } = getAuthPaths();
  if (!base) return {};
  try {
    const info = await FileSystem.getInfoAsync(file);
    if (!info.exists) return {};
    const raw = await FileSystem.readAsStringAsync(file);
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeAll(next: Record<string, string>) {
  const { base, file } = getAuthPaths();
  if (!base) return;
  await ensureDir();
  await FileSystem.writeAsStringAsync(file, JSON.stringify(next));
}

const storage = {
  async getItem(key: string) {
    if (Platform.OS === "web") {
      try {
        return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      } catch {
        return null;
      }
    }
    const all = await readAll();
    return all[key] ?? null;
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === "web") {
      try {
        if (typeof window !== "undefined") window.localStorage.setItem(key, value);
      } catch {
        // ignore
      }
      return;
    }
    const all = await readAll();
    all[key] = value;
    await writeAll(all);
  },
  async removeItem(key: string) {
    if (Platform.OS === "web") {
      try {
        if (typeof window !== "undefined") window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
      return;
    }
    const all = await readAll();
    delete all[key];
    await writeAll(all);
  },
};

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          storage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: Platform.OS === "web",
        },
      })
    : null;

export function assertSupabaseConfigured() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set expo.extra.supabaseUrl and expo.extra.supabaseAnonKey in app.json, then restart the dev server (prefer `npx expo start -c`)."
    );
  }
}

