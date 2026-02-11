import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View as RNView } from "react-native";

import Colors from "@/constants/Colors";
import { useColorScheme } from "@/components/useColorScheme";
import { Text } from "@/components/Themed";
import { assertSupabaseConfigured, supabase } from "@/lib/supabase";

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export default function PersonalDetailsScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  const [touched, setTouched] = useState({ first: false, last: false, email: false });
  const [submit, setSubmit] = useState<{ loading: boolean; error: string | null; ok: string | null }>({
    loading: false,
    error: null,
    ok: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!supabase) return;
        const { data } = await supabase.auth.getUser();
        const user = data.user;
        if (!user) return;
        const meta: any = user.user_metadata ?? {};
        const fn = typeof meta.first_name === "string" ? meta.first_name : "";
        const ln = typeof meta.last_name === "string" ? meta.last_name : "";
        const em = typeof user.email === "string" ? user.email : "";
        if (!cancelled) {
          setFirstName(fn);
          setLastName(ln);
          setEmail(em);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const errors = useMemo(() => {
    const first = normalizeName(firstName);
    const last = normalizeName(lastName);
    return {
      first: !first ? "First name is required." : null,
      last: !last ? "Last name is required." : null,
      email: !email.trim() ? "Email is required." : !isEmail(email) ? "Enter a valid email." : null,
    };
  }, [email, firstName, lastName]);

  const valid = !Object.values(errors).some(Boolean);

  const save = async () => {
    setSubmit({ loading: true, error: null, ok: null });
    try {
      assertSupabaseConfigured();
      const first = normalizeName(firstName);
      const last = normalizeName(lastName);
      const nextEmail = email.trim();

      const { data: userData } = await supabase!.auth.getUser();
      const currentEmail = userData.user?.email ?? "";

      const { error } = await supabase!.auth.updateUser({
        email: nextEmail !== currentEmail ? nextEmail : undefined,
        data: {
          first_name: first,
          last_name: last,
          full_name: `${first} ${last}`.trim(),
        },
      });
      if (error) throw error;

      const userId = userData.user?.id;
      if (userId) {
        await supabase!
          .from("profiles")
          .upsert(
            {
              id: userId,
              first_name: first,
              last_name: last,
              email: nextEmail,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );
      }

      setSubmit({
        loading: false,
        error: null,
        ok: nextEmail !== currentEmail ? "Saved. Check your email to confirm the change." : "Saved.",
      });
    } catch (e: any) {
      setSubmit({
        loading: false,
        error: typeof e?.message === "string" ? e.message : "Could not save changes.",
        ok: null,
      });
    }
  };

  const canSave = valid && !submit.loading;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Personal Details",
        }}
      />

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
            <Text style={[styles.label, { color: theme.textSecondary }]}>First name</Text>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              onBlur={() => {
                setTouched((t) => ({ ...t, first: true }));
                setFirstName((v) => normalizeName(v));
              }}
              placeholder="First name"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                { color: theme.text, borderColor: touched.first && errors.first ? theme.danger : theme.border },
              ]}
            />
            {touched.first && errors.first ? (
              <Text style={[styles.error, { color: theme.danger }]}>{errors.first}</Text>
            ) : null}
          </RNView>

          <RNView style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Last name</Text>
            <TextInput
              value={lastName}
              onChangeText={setLastName}
              onBlur={() => {
                setTouched((t) => ({ ...t, last: true }));
                setLastName((v) => normalizeName(v));
              }}
              placeholder="Last name"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                { color: theme.text, borderColor: touched.last && errors.last ? theme.danger : theme.border },
              ]}
            />
            {touched.last && errors.last ? (
              <Text style={[styles.error, { color: theme.danger }]}>{errors.last}</Text>
            ) : null}
          </RNView>

          <RNView style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              placeholder="Email"
              placeholderTextColor={theme.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              style={[
                styles.input,
                { color: theme.text, borderColor: touched.email && errors.email ? theme.danger : theme.border },
              ]}
            />
            {touched.email && errors.email ? (
              <Text style={[styles.error, { color: theme.danger }]}>{errors.email}</Text>
            ) : null}
          </RNView>
        </RNView>

        <Pressable
          onPress={() => {
            if (!valid) {
              setTouched({ first: true, last: true, email: true });
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
  error: { fontSize: 12, fontWeight: "700" },
  saveBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: { fontSize: 15, fontWeight: "800" },
});

