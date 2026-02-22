import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

const KEY = "onboardingCompleted:v1";

let inMemoryCompleted: boolean | null = null;

function getPaths() {
  const rawBase = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? "";
  const base = rawBase ? (rawBase.endsWith("/") ? rawBase : `${rawBase}/`) : "";
  const dir = `${base}movu`;
  const file = `${dir}/onboarding.json`;
  return { base, dir, file };
}

function hasNativePersistence() {
  const { base } = getPaths();
  return !!base;
}

async function getWebItem(key: string) {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

async function setWebItem(key: string, value: string) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

async function ensureDir() {
  const { base, dir } = getPaths();
  if (!base) return;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch {
    // ignore
  }
}

async function readNative(): Promise<string | null> {
  const { base, file } = getPaths();
  if (!base) return null;
  try {
    const info = await FileSystem.getInfoAsync(file);
    if (!info.exists) return null;
    return await FileSystem.readAsStringAsync(file);
  } catch {
    return null;
  }
}

async function writeNative(value: string): Promise<void> {
  const { base, file } = getPaths();
  if (!base) return;
  await ensureDir();
  await FileSystem.writeAsStringAsync(file, value);
}

/** Read from all backends; any "1" = completed. AsyncStorage is primary (most reliable). */
async function readLocalCompleted(): Promise<boolean> {
  if (Platform.OS === "web") return (await getWebItem(KEY)) === "1";

  // 1) AsyncStorage (most reliable across iOS/Android/simulator)
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    // continue
  }

  // 2) SecureStore
  try {
    const v = await SecureStore.getItemAsync(KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    // continue
  }

  // 3) FileSystem
  if (hasNativePersistence()) {
    try {
      const raw = await readNative();
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { completed?: boolean } | null;
          if (parsed?.completed) return true;
        } catch {
          if (raw.trim() === "1") return true;
        }
      }
    } catch {
      // ignore
    }
  }

  return false;
}

/** Write to ALL backends so at least one persists. */
async function writeLocalCompleted(completed: boolean): Promise<void> {
  const val = completed ? "1" : "0";
  if (Platform.OS === "web") {
    await setWebItem(KEY, val);
    return;
  }

  const writePromises: Promise<void>[] = [];

  // AsyncStorage
  writePromises.push(
    (completed ? AsyncStorage.setItem(KEY, val) : AsyncStorage.removeItem(KEY)).catch(() => {})
  );

  // SecureStore
  writePromises.push(
    (completed ? SecureStore.setItemAsync(KEY, val) : SecureStore.deleteItemAsync(KEY)).catch(
      () => {}
    )
  );

  // FileSystem
  if (hasNativePersistence()) {
    writePromises.push(
      ensureDir()
        .then(() => writeNative(JSON.stringify({ completed, updatedAt: Date.now() })))
        .catch(() => {})
    );
  }

  await Promise.all(writePromises);
}

async function bestEffortSyncDbCompleted(completed: boolean): Promise<void> {
  try {
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return;
    await supabase
      .from("profiles")
      .upsert(
        { id: user.id, onboarding_completed: completed, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );
  } catch {
    // ignore
  }
}

export async function getOnboardingCompleted(): Promise<boolean> {
  if (inMemoryCompleted !== null) return inMemoryCompleted;

  const localCompleted = await readLocalCompleted();
  inMemoryCompleted = localCompleted;
  if (localCompleted) void bestEffortSyncDbCompleted(true);
  return localCompleted;
}

export async function setOnboardingCompleted(completed = true): Promise<void> {
  inMemoryCompleted = completed;

  // ALWAYS write locally first
  await writeLocalCompleted(completed);

  try {
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        await supabase
          .from("profiles")
          .upsert(
            {
              id: user.id,
              onboarding_completed: completed,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );
      }
    }
  } catch {
    // ignore
  }
}

export async function clearOnboardingCompleted(): Promise<void> {
  inMemoryCompleted = false;

  await writeLocalCompleted(false);

  try {
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        await supabase
          .from("profiles")
          .upsert(
            {
              id: user.id,
              onboarding_completed: false,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );
      }
    }
  } catch {
    // ignore
  }
}
