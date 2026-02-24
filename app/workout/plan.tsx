import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View as RNView,
  Modal,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import Colors from "@/constants/Colors";
import { Text, View } from "@/components/Themed";
import { useColorScheme } from "@/components/useColorScheme";
import { supabase } from "@/lib/supabase";
import {
  addPlanExercise as dbAddPlanExercise,
  getPlanExercises,
  removePlanExercise as dbRemovePlanExercise,
  updatePlanExercise as dbUpdatePlanExercise,
} from "@/utils/planStorage";

const EXERCISES = [
  "Bench Press",
  "Squat Rack",
  "Leg Press",
  "Cable Machine",
  "Lat Pulldown",
  "Shoulder Press",
  "Leg Curl",
  "Leg Extension",
  "Chest Fly",
  "Row Machine",
  "Bicep Curl",
  "Tricep Extension",
];

type PlannedExercise = {
  id: string;
  name: string;
  sets: number;
  reps: number;
};

export default function Plan() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  const [exercises, setExercises] = useState<PlannedExercise[]>([]);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const ensureUser = useCallback(async (): Promise<string | null> => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  }, []);

  const loadPlan = useCallback(async () => {
    try {
      setLoading(true);
      const uid = await ensureUser();
      setUserId(uid);
      if (uid) {
        const loaded = await getPlanExercises(uid);
        setExercises(
          loaded.map((e) => ({ id: e.id, name: e.name, sets: e.sets, reps: e.reps }))
        );
      } else {
        setExercises([]);
      }
    } finally {
      setLoading(false);
    }
  }, [ensureUser]);

  useFocusEffect(
    useCallback(() => {
      loadPlan();
    }, [loadPlan])
  );

  const addExercise = async (name: string) => {
    const newEx: PlannedExercise = {
      id: `temp-${Date.now()}`,
      name,
      sets: 3,
      reps: 10,
    };
    setExercises((prev) => [...prev, newEx]);
    setAddModalVisible(false);

    let uid = userId ?? (await ensureUser());
    setUserId(uid);

    if (!uid) return;

    const saved = await dbAddPlanExercise(uid, {
      name,
      sets: 3,
      reps: 10,
    });
    if (saved) {
      setExercises((prev) =>
        prev.map((e) => (e.id === newEx.id ? { ...saved } : e))
      );
    } else {
      setExercises((prev) => prev.filter((e) => e.id !== newEx.id));
    }
  };

  const removeExercise = async (id: string) => {
    const prev = exercises;
    setExercises((p) => p.filter((e) => e.id !== id));
    if (userId && !id.startsWith("temp-")) {
      const ok = await dbRemovePlanExercise(userId, id);
      if (!ok) setExercises(prev);
    }
  };

  const bumpSets = async (id: string, delta: number) => {
    let nextSets: number | null = null;
    setExercises((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        nextSets = Math.max(1, Math.min(20, e.sets + delta));
        return { ...e, sets: nextSets };
      })
    );
    if (userId && !id.startsWith("temp-") && nextSets != null) {
      await dbUpdatePlanExercise(userId, id, { sets: nextSets });
    }
  };

  const bumpReps = async (id: string, delta: number) => {
    let nextReps: number | null = null;
    setExercises((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        nextReps = Math.max(1, Math.min(50, e.reps + delta));
        return { ...e, reps: nextReps };
      })
    );
    if (userId && !id.startsWith("temp-") && nextReps != null) {
      await dbUpdatePlanExercise(userId, id, { reps: nextReps });
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <RNView style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Plan Workout</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Add exercises and set your target sets and reps for each.
        </Text>
      </RNView>

      {loading ? (
        <RNView style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading your plan…
          </Text>
        </RNView>
      ) : (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {exercises.map((ex) => (
          <View
            key={ex.id}
            style={[styles.exerciseCard, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <RNView style={styles.exerciseHeader}>
              <Text style={[styles.exerciseName, { color: theme.text }]}>{ex.name}</Text>
              <Pressable
                onPress={() => removeExercise(ex.id)}
                style={({ pressed }) => [
                  styles.removeBtn,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <FontAwesome name="trash-o" size={18} color={theme.danger} />
              </Pressable>
            </RNView>
            <RNView style={styles.controlsRow}>
              <RNView style={styles.controlGroup}>
                <Text style={[styles.controlLabel, { color: theme.textSecondary }]}>Sets</Text>
                <RNView style={styles.stepper}>
                  <Pressable
                    onPress={() => bumpSets(ex.id, -1)}
                    style={({ pressed }) => [
                      styles.stepBtn,
                      { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={[styles.stepBtnText, { color: theme.text }]}>−</Text>
                  </Pressable>
                  <Text style={[styles.value, { color: theme.text }]}>{ex.sets}</Text>
                  <Pressable
                    onPress={() => bumpSets(ex.id, 1)}
                    style={({ pressed }) => [
                      styles.stepBtn,
                      { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={[styles.stepBtnText, { color: theme.text }]}>+</Text>
                  </Pressable>
                </RNView>
              </RNView>
              <RNView style={styles.controlGroup}>
                <Text style={[styles.controlLabel, { color: theme.textSecondary }]}>Reps</Text>
                <RNView style={styles.stepper}>
                  <Pressable
                    onPress={() => bumpReps(ex.id, -1)}
                    style={({ pressed }) => [
                      styles.stepBtn,
                      { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={[styles.stepBtnText, { color: theme.text }]}>−</Text>
                  </Pressable>
                  <Text style={[styles.value, { color: theme.text }]}>{ex.reps}</Text>
                  <Pressable
                    onPress={() => bumpReps(ex.id, 1)}
                    style={({ pressed }) => [
                      styles.stepBtn,
                      { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={[styles.stepBtnText, { color: theme.text }]}>+</Text>
                  </Pressable>
                </RNView>
              </RNView>
            </RNView>
          </View>
        ))}

        <Pressable
          onPress={() => setAddModalVisible(true)}
          style={({ pressed }) => [
            styles.addBtn,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <FontAwesome name="plus" size={18} color={theme.accent} />
          <Text style={[styles.addBtnText, { color: theme.accent }]}>Add Exercise</Text>
        </Pressable>
      </ScrollView>
      )}

      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setAddModalVisible(false)}
        >
          <RNView
            style={[styles.modalContent, { backgroundColor: theme.background }]}
            onStartShouldSetResponder={() => true}
          >
            <RNView style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Choose Exercise</Text>
              <Pressable onPress={() => setAddModalVisible(false)}>
                <FontAwesome name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </RNView>
            <FlatList
              data={EXERCISES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => addExercise(item)}
                  style={({ pressed }) => [
                    styles.modalItem,
                    { borderBottomColor: theme.border, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[styles.modalItemText, { color: theme.text }]}>{item}</Text>
                  <FontAwesome name="chevron-right" size={14} color={theme.textSecondary} />
                </Pressable>
              )}
              style={styles.modalList}
            />
          </RNView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "600",
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
    gap: 12,
  },
  exerciseCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  exerciseHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: "700",
  },
  removeBtn: {
    padding: 4,
  },
  controlsRow: {
    flexDirection: "row",
    gap: 24,
  },
  controlGroup: {
    flex: 1,
    gap: 6,
  },
  controlLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnText: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: -1,
  },
  value: {
    minWidth: 28,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "800",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  addBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  modalList: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalItemText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
