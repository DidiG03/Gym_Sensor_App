import { Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View as RNView } from "react-native";

import Colors from "@/constants/Colors";
import { useColorScheme } from "@/components/useColorScheme";
import { Text } from "@/components/Themed";
import { assertSupabaseConfigured, supabase } from "@/lib/supabase";

function validateNewPassword(value: string) {
  if (!value) return "New password is required.";
  if (value.length < 8) return "Must be at least 8 characters.";
  const hasLetter = /[A-Za-z]/.test(value);
  const hasNumber = /\d/.test(value);
  if (!hasLetter || !hasNumber) return "Use at least 1 letter and 1 number.";
  return null;
}

export default function PasswordScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState({ old: false, next: false, confirm: false });

  const [submit, setSubmit] = useState<{ loading: boolean; error: string | null; ok: string | null }>({
    loading: false,
    error: null,
    ok: null,
  });

  const errors = useMemo(() => {
    const nextErr = validateNewPassword(newPassword);
    const confirmErr = !confirm ? "Please confirm your new password." : confirm !== newPassword ? "Passwords do not match." : null;
    return {
      old: !oldPassword ? "Old password is required." : null,
      next: nextErr,
      confirm: confirmErr,
    };
  }, [confirm, newPassword, oldPassword]);

  const valid = !Object.values(errors).some(Boolean);
  const canSave = valid && !submit.loading;

  const save = async () => {
    setSubmit({ loading: true, error: null, ok: null });
    try {
      assertSupabaseConfigured();
      const { data } = await supabase!.auth.getUser();
      const email = data.user?.email;
      if (!email) throw new Error("You must be signed in to change your password.");

      // Verify old password (reauth)
      const { error: reauthErr } = await supabase!.auth.signInWithPassword({
        email,
        password: oldPassword,
      });
      if (reauthErr) throw reauthErr;

      const { error: updateErr } = await supabase!.auth.updateUser({ password: newPassword });
      if (updateErr) throw updateErr;

      setOldPassword("");
      setNewPassword("");
      setConfirm("");
      setTouched({ old: false, next: false, confirm: false });
      setSubmit({ loading: false, error: null, ok: "Password updated." });
    } catch (e: any) {
      setSubmit({
        loading: false,
        error: typeof e?.message === "string" ? e.message : "Could not update password.",
        ok: null,
      });
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Password" }} />

      <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={styles.content}>
        {submit.error ? (
          <RNView style={[styles.banner, { borderColor: theme.danger }]}>
            <Text style={[styles.bannerText, { color: theme.danger }]}>{submit.error}</Text>
          </RNView>
        ) : null}
        {submit.ok ? (
          <RNView style={[styles.banner, { borderColor: theme.border }]}>
            <Text style={[styles.bannerText, { color: theme.textSecondary }]}>{submit.ok}</Text>
          </RNView>
        ) : null}

        <RNView style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <RNView style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Old password</Text>
            <TextInput
              value={oldPassword}
              onChangeText={setOldPassword}
              onBlur={() => setTouched((t) => ({ ...t, old: true }))}
              placeholder="Old password"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              autoCapitalize="none"
              style={[
                styles.input,
                { color: theme.text, borderColor: touched.old && errors.old ? theme.danger : theme.border },
              ]}
            />
            {touched.old && errors.old ? <Text style={[styles.error, { color: theme.danger }]}>{errors.old}</Text> : null}
          </RNView>

          <RNView style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>New password</Text>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              onBlur={() => setTouched((t) => ({ ...t, next: true }))}
              placeholder="New password"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              autoCapitalize="none"
              style={[
                styles.input,
                { color: theme.text, borderColor: touched.next && errors.next ? theme.danger : theme.border },
              ]}
            />
            {touched.next && errors.next ? (
              <Text style={[styles.error, { color: theme.danger }]}>{errors.next}</Text>
            ) : (
              <Text style={[styles.helper, { color: theme.textSecondary }]}>
                Use at least 8 characters with a letter and a number.
              </Text>
            )}
          </RNView>

          <RNView style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Confirm new password</Text>
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
              placeholder="Confirm new password"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              autoCapitalize="none"
              style={[
                styles.input,
                { color: theme.text, borderColor: touched.confirm && errors.confirm ? theme.danger : theme.border },
              ]}
            />
            {touched.confirm && errors.confirm ? (
              <Text style={[styles.error, { color: theme.danger }]}>{errors.confirm}</Text>
            ) : null}
          </RNView>
        </RNView>

        <Pressable
          onPress={() => {
            if (!valid) {
              setTouched({ old: true, next: true, confirm: true });
              return;
            }
            save();
          }}
          disabled={!canSave}
          style={({ pressed }) => [
            styles.saveBtn,
            {
              backgroundColor: theme.primary,
              opacity: !canSave ? 0.45 : pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[styles.saveBtnText, { color: theme.background }]}>
            {submit.loading ? "Saving…" : "Save"}
          </Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 14,
  },
  banner: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  bannerText: {
    fontSize: 12,
    fontWeight: "700",
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 14,
  },
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: "800", letterSpacing: 0.3 },
  input: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: "600",
    backgroundColor: "transparent",
  },
  helper: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
  },
  error: { fontSize: 12, fontWeight: "700" },
  saveBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: { fontSize: 15, fontWeight: "800" },
});

