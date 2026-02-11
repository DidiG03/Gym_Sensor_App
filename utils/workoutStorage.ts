import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

const FILE_NAME = "workouts.json";

export type Workout = {
  id: string;
  userId: string; // User ID from Supabase auth
  machineName: string;
  sets: number;
  reps: number;
  completedAt: string; // ISO date string
  setRepsCompleted: number[];
  setRestTimes: number[];
  duration?: number; // Duration in seconds
};

async function getFilePath(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  const base = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!base) return null;
  const dir = `${base}movu/`;
  const file = `${dir}${FILE_NAME}`;
  return file;
}

async function ensureDir(dir: string) {
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch {
    // ignore
  }
}

async function readWorkouts(): Promise<Workout[]> {
  if (Platform.OS === "web") {
    try {
      const stored = typeof window !== "undefined" ? window.localStorage.getItem("workouts") : null;
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  const filePath = await getFilePath();
  if (!filePath) return [];

  try {
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) return [];
    const content = await FileSystem.readAsStringAsync(filePath);
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function writeWorkouts(workouts: Workout[]): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("workouts", JSON.stringify(workouts));
      }
    } catch {
      // ignore
    }
    return;
  }

  const filePath = await getFilePath();
  if (!filePath) return;

  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  await ensureDir(dir);
  await FileSystem.writeAsStringAsync(filePath, JSON.stringify(workouts));
}

export async function getWorkouts(userId: string): Promise<Workout[]> {
  const workouts = await readWorkouts();
  // Filter by user ID and sort by date, most recent first
  return workouts
    .filter((w) => w.userId === userId)
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
}

export async function saveWorkout(
  workout: Omit<Workout, "id" | "completedAt" | "userId">,
  userId: string
): Promise<void> {
  const workouts = await readWorkouts();
  const newWorkout: Workout = {
    ...workout,
    userId,
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    completedAt: new Date().toISOString(),
  };
  workouts.push(newWorkout);
  await writeWorkouts(workouts);
}
