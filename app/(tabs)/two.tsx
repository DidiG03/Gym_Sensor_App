import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, View as RNView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import Colors from "@/constants/Colors";
import { Text } from "@/components/Themed";
import { useColorScheme } from "@/components/useColorScheme";
import { getWorkouts, type Workout } from "@/utils/workoutStorage";
import { supabase } from "@/lib/supabase";

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export default function TabTwoScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user ID
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!supabase) return;
        const { data } = await supabase.auth.getUser();
        if (!cancelled && data.user?.id) {
          setUserId(data.user.id);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadWorkouts = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      const data = await getWorkouts(userId);
      setWorkouts(data);
    } catch (error) {
      console.error("Failed to load workouts:", error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadWorkouts();
    }, [userId])
  );

  const renderWorkout = ({ item }: { item: Workout }) => {
    const totalReps = item.setRepsCompleted.reduce((sum, reps) => sum + reps, 0);
    const totalRestTime = item.setRestTimes.reduce((sum, time) => sum + time, 0);

    return (
      <RNView style={[styles.workoutCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <RNView style={styles.workoutHeader}>
          <Text style={[styles.machineName, { color: theme.text }]}>{item.machineName}</Text>
          <Text style={[styles.timeAgo, { color: theme.textSecondary }]}>{formatDate(item.completedAt)}</Text>
        </RNView>
        <RNView style={styles.workoutStats}>
          <Text style={[styles.statText, { color: theme.textSecondary }]}>
            {item.sets} sets · {item.reps} reps · {totalReps} total reps
          </Text>
          {item.duration && (
            <Text style={[styles.statText, { color: theme.textSecondary }]}>
              Duration: {formatDuration(item.duration)}
            </Text>
          )}
        </RNView>
      </RNView>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <RNView style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>History</Text>
      </RNView>

      {loading ? (
        <RNView style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Loading...</Text>
        </RNView>
      ) : workouts.length === 0 ? (
        <RNView style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No workouts yet</Text>
          <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
            Complete a workout to see it here
          </Text>
        </RNView>
      ) : (
        <FlatList
          data={workouts}
          renderItem={renderWorkout}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  workoutCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  workoutHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  machineName: {
    fontSize: 18,
    fontWeight: "800",
    flex: 1,
  },
  timeAgo: {
    fontSize: 13,
    fontWeight: "600",
  },
  workoutStats: {
    gap: 4,
  },
  statText: {
    fontSize: 14,
    fontWeight: "600",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "700",
  },
  emptySubtext: {
    fontSize: 14,
    fontWeight: "600",
  },
});
