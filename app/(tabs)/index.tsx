import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View as RNView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { Text, View } from "@/components/Themed";
import SlideToConfirm from "@/components/SlideToConfirm";
import WeekCalendar from "@/components/WeekCalendar";
import Colors from "@/constants/Colors";
import { useColorScheme } from "@/components/useColorScheme";
import { getTimeGreeting } from "@/utils/greeting";
import { supabase } from "@/lib/supabase";
import { router } from "expo-router";

export default function TabOneScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  const [userFirstName, setUserFirstName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!supabase) return;
        const { data } = await supabase.auth.getUser();
        const meta: any = data.user?.user_metadata ?? {};
        const first =
          typeof meta.first_name === "string" && meta.first_name.trim()
            ? meta.first_name.trim()
            : null;
        const full =
          typeof meta.full_name === "string" && meta.full_name.trim()
            ? meta.full_name.trim()
            : null;
        const derived = first ?? (full ? full.split(" ")[0] : null);
        if (!cancelled) setUserFirstName(derived);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const greetingText = useMemo(() => {
    const base = getTimeGreeting(now);
    return userFirstName ? `${base}, ${userFirstName}` : base;
  }, [now, userFirstName]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <RNView style={styles.header}>
        <Text style={[styles.greeting, { color: theme.text }]}>{greetingText}</Text>
        <Text style={[styles.subGreeting, { color: theme.textSecondary }]}>
          Ready to move?
        </Text>
      </RNView>
      <WeekCalendar />

      <RNView style={[styles.planCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.planCardTitle, { color: theme.text }]}>TODAY'S ACTIVITIES</Text>
        <Pressable
          style={({ pressed }) => [
            styles.planButton,
            { backgroundColor: theme.border, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => router.push("/workout/plan")}
        >
          <FontAwesome name="calendar" size={16} color={theme.text} />
          <Text style={[styles.planButtonText, { color: theme.text }]}>PLAN</Text>
        </Pressable>
      </RNView>

      <View style={styles.container}>
        <Text style={styles.title}>Movu</Text>
      </View>

      <RNView style={styles.bottom}>
        <SlideToConfirm label="Slide to start" onComplete={() => router.push("/workout/nfc")} />
      </RNView>
    </SafeAreaView>
  );  
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 0,
    alignItems: "flex-start",
  },
  greeting: {
    fontSize: 20,
    fontWeight: "700",
  },
  subGreeting: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "500",
  },
  planCard: {
    marginHorizontal: 20,
    marginTop: 8,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  planCardTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  planButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  planButtonText: {
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  bottom: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    alignItems: "center",
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: '80%',
  },
});
