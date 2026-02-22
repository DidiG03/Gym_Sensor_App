import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View as RNView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import Colors from "@/constants/Colors";
import { Text, View } from "@/components/Themed";
import { useColorScheme } from "@/components/useColorScheme";

const MACHINES = [
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

export default function Ble() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];
  const { machine: machineParam } = useLocalSearchParams<{ machine?: string }>();

  const [selectedMachine, setSelectedMachine] = useState(MACHINES[0]);

  useEffect(() => {
    if (machineParam && MACHINES.includes(machineParam)) {
      setSelectedMachine(machineParam);
    }
  }, [machineParam]);
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState(10);

  const summary = useMemo(
    () => `${sets} set${sets === 1 ? "" : "s"} · ${reps} rep${reps === 1 ? "" : "s"}`,
    [sets, reps]
  );

  const bumpSets = (delta: number) => {
    setSets((v) => {
      const next = Math.max(1, Math.min(20, v + delta));
      return next;
    });
  };

  const bumpReps = (delta: number) => {
    setReps((v) => {
      const next = Math.max(1, Math.min(50, v + delta));
      return next;
    });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <RNView style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Confirm</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Choose your target reps and sets, then start your session.
        </Text>
      </RNView>

      <RNView style={styles.content}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <RNView style={styles.machineSelectorContainer}>
            <Text style={[styles.machineLabel, { color: theme.textSecondary }]}>Machine</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.machineScrollContent}
              style={styles.machineScroll}
            >
              {MACHINES.map((machine) => {
                const isSelected = machine === selectedMachine;
                return (
                  <Pressable
                    key={machine}
                    onPress={() => setSelectedMachine(machine)}
                    style={({ pressed }) => [
                      styles.machineChip,
                      {
                        backgroundColor: isSelected ? theme.primary : theme.background,
                        borderColor: isSelected ? theme.primary : theme.border,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.machineChipText,
                        { color: isSelected ? theme.background : theme.text },
                      ]}
                    >
                      {machine}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </RNView>

          <RNView style={[styles.divider, { backgroundColor: theme.border }]} />

          <RNView style={styles.row}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Sets</Text>
            <RNView style={styles.controls}>
              <Pressable
                onPress={() => bumpSets(-1)}
                style={({ pressed }) => [
                  styles.stepBtn,
                  { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.stepBtnText, { color: theme.text }]}>−</Text>
              </Pressable>
              <Text style={[styles.value, { color: theme.text }]}>{sets}</Text>
              <Pressable
                onPress={() => bumpSets(1)}
                style={({ pressed }) => [
                  styles.stepBtn,
                  { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.stepBtnText, { color: theme.text }]}>+</Text>
              </Pressable>
            </RNView>
          </RNView>

          <RNView style={[styles.divider, { backgroundColor: theme.border }]} />

          <RNView style={styles.row}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Reps</Text>
            <RNView style={styles.controls}>
              <Pressable
                onPress={() => bumpReps(-1)}
                style={({ pressed }) => [
                  styles.stepBtn,
                  { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.stepBtnText, { color: theme.text }]}>−</Text>
              </Pressable>
              <Text style={[styles.value, { color: theme.text }]}>{reps}</Text>
              <Pressable
                onPress={() => bumpReps(1)}
                style={({ pressed }) => [
                  styles.stepBtn,
                  { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.stepBtnText, { color: theme.text }]}>+</Text>
              </Pressable>
            </RNView>
          </RNView>
        </View>

        <Text style={[styles.summary, { color: theme.textSecondary }]}>{summary}</Text>
      </RNView>

      <RNView style={styles.bottom}>
        <Pressable
          onPress={() => router.push({ pathname: "/workout/session", params: { sets: sets.toString(), reps: reps.toString(), machine: selectedMachine } })}
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              backgroundColor: theme.primary,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[styles.primaryBtnText, { color: theme.background }]}>Start Session</Text>
        </Pressable>
      </RNView>
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
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    alignItems: "center",
    gap: 12,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 6,
    overflow: "hidden",
  },
  machineSelectorContainer: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  machineLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  machineScroll: {
    maxHeight: 50,
  },
  machineScrollContent: {
    gap: 8,
    paddingRight: 14,
  },
  machineChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  machineChipText: {
    fontSize: 13,
    fontWeight: "700",
  },
  row: {
    paddingHorizontal: 14,
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
  divider: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
    opacity: 0.9,
  },
  summary: {
    fontSize: 13,
    fontWeight: "700",
  },
  bottom: {
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  primaryBtn: {
    width: "100%",
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "800",
  },
});