import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Stack, router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Switch, View as RNView } from "react-native";

import Colors from "@/constants/Colors";
import { useColorScheme } from "@/components/useColorScheme";
import { useAppColorScheme } from "@/components/ColorSchemeProvider";
import { Text } from "@/components/Themed";
import { clearOnboardingCompleted } from "@/utils/onboardingStorage";

function Row({
  title,
  icon,
  onPress,
  rightText,
  destructive,
  isLast,
}: {
  title: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  onPress?: () => void;
  rightText?: string;
  destructive?: boolean;
  isLast?: boolean;
}) {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        { opacity: pressed ? 0.65 : 1 },
        isLast ? null : { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <RNView style={styles.rowLeft}>
        <RNView style={[styles.iconBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <FontAwesome name={icon} size={16} color={theme.text} />
        </RNView>
        <Text style={[styles.rowTitle, { color: destructive ? theme.danger : theme.text }]}>{title}</Text>
      </RNView>
      <RNView style={styles.rowRight}>
        {rightText ? (
          <Text style={[styles.rightText, { color: theme.textSecondary }]}>{rightText}</Text>
        ) : null}
        {onPress ? <FontAwesome name="angle-right" size={18} color={theme.textSecondary} /> : null}
      </RNView>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  return (
    <RNView style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{title}</Text>
      <RNView style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>{children}</RNView>
    </RNView>
  );
}

export default function SettingsIndex() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];
  const { isDark, setScheme } = useAppColorScheme();

  const resetOnboarding = async () => {
    await clearOnboardingCompleted();
    router.replace("/onboarding");
  };

  return (
    <>
      <Stack.Screen options={{ title: "Settings" }} />

      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.content}
      >
        <Section title="ACCOUNT">
          <Row
            title="Personal Details"
            icon="user"
            onPress={() => router.push("/settings/personal")}
          />
          <Row title="Password" icon="lock" onPress={() => router.push("/settings/password")} isLast />
        </Section>

        <Section title="PREFERENCES">
          <RNView style={styles.row}>
            <RNView style={styles.rowLeft}>
              <RNView style={[styles.iconBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <FontAwesome name="moon-o" size={16} color={theme.text} />
              </RNView>
              <Text style={[styles.rowTitle, { color: theme.text }]}>Dark Mode</Text>
            </RNView>
            <RNView style={styles.switchWrap}>
              <Switch
                value={isDark}
                onValueChange={(v) => setScheme(v ? "dark" : "light")}
                trackColor={{ false: theme.border, true: theme.accent }}
                thumbColor={theme.primary}
                ios_backgroundColor={theme.border}
                style={styles.switch}
              />
            </RNView>
          </RNView>
        </Section>

        {__DEV__ ? (
          <Section title="DEVELOPER">
            <Row title="Reset onboarding (TBRIP)" icon="refresh" onPress={resetOnboarding} isLast />
          </Section>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 18,
  },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    height: 52,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  switchWrap: {
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  switch: {
    alignSelf: "center",
  },
  rightText: {
    fontSize: 13,
    fontWeight: "600",
  },
});

