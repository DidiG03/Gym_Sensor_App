import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

const KEY = "onboardingCompleted:v1";

// Fallback: if native persistence isn't available in the current binary, we still
// allow onboarding to complete for this app session (prevents redirect loops).
let inMemoryCompleted: boolean | null = null;

function getPaths() {
  // IMPORTANT: compute lazily. In some environments `documentDirectory/cacheDirectory`
  // can be empty during module initialization, but available later.
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

async function readLocalCompleted(): Promise<boolean> {
  if (Platform.OS === "web") return (await getWebItem(KEY)) === "1";
  if (!hasNativePersistence()) return false;

  const raw = await readNative();
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { completed?: boolean } | null;
    return !!parsed?.completed;
  } catch {
    // Backwards/edge: allow raw "1"/"0"
    return raw.trim() === "1";
  }
}

async function writeLocalCompleted(completed: boolean): Promise<void> {
  if (Platform.OS === "web") {
    await setWebItem(KEY, completed ? "1" : "0");
    return;
  }
  if (!hasNativePersistence()) return;
  await writeNative(JSON.stringify({ completed, updatedAt: Date.now() }));
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
  // First check in-memory cache
  if (inMemoryCompleted !== null) return inMemoryCompleted;

  // Prefer local storage first. If it's completed locally, treat onboarding as done
  // even if the DB is misconfigured or blocked by RLS (avoids showing onboarding forever).
  const localCompleted = await readLocalCompleted();
  if (localCompleted) {
    inMemoryCompleted = true;
    // Reconcile DB in background (non-blocking)
    void bestEffortSyncDbCompleted(true);
    return true;
  }

  // Check database if user is logged in
  try {
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        // Check profile in database
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("id", user.id)
          .single();

        if (!error && profile?.onboarding_completed) {
          inMemoryCompleted = true;
          // Write-through so subsequent boots don't need DB to skip onboarding.
          await writeLocalCompleted(true);
          return true;
        }
        if (!error && profile && profile.onboarding_completed === false) {
          inMemoryCompleted = false;
          return false;
        }
      }
    }
  } catch {
    // If database check fails, fall back to local storage
  }

  // Fall back to local storage (already read above)
  inMemoryCompleted = localCompleted;
  return localCompleted;
}

export async function setOnboardingCompleted(completed = true): Promise<void> {
  inMemoryCompleted = completed;

  // Save to database if user is logged in
  try {
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        // Update profile in database
        const { error } = await supabase
          .from("profiles")
          .upsert(
            {
              id: user.id,
              onboarding_completed: completed,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );

        // If successful, we can return early
        if (!error) {
          // Also save locally as backup
          await writeLocalCompleted(completed);
          return;
        }
      }
    }
  } catch {
    // If database save fails, continue to local storage fallback
  }

  // Fall back to local storage
  await writeLocalCompleted(completed);
}

export async function clearOnboardingCompleted(): Promise<void> {
  inMemoryCompleted = false;

  // Clear from database if user is logged in
  try {
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        // Update profile in database
        const { error } = await supabase
          .from("profiles")
          .upsert(
            {
              id: user.id,
              onboarding_completed: false,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );

        // If successful, we can return early
        if (!error) {
          // Also clear locally
          await writeLocalCompleted(false);
          return;
        }
      }
    }
  } catch {
    // If database update fails, continue to local storage fallback
  }

  // Fall back to local storage
  await writeLocalCompleted(false);
}

