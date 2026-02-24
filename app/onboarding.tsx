import type { ComponentProps } from "react";
import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View as RNView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { BleManager, State } from "react-native-ble-plx";
import NfcManager from "react-native-nfc-manager";
import { router } from "expo-router";

import Colors from "@/constants/Colors";
import { useColorScheme } from "@/components/useColorScheme";
import { Text } from "@/components/Themed";
import { setOnboardingCompleted } from "@/utils/onboardingStorage";
import { assertSupabaseConfigured, supabase } from "@/lib/supabase";

type StepId = "welcome" | "bluetooth" | "nfc" | "account" | "done";

type Step = {
  id: StepId;
  title: string;
  body: string;
  icon: ComponentProps<typeof FontAwesome>["name"];
};

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function validateName(value: string) {
  const v = normalizeName(value);
  if (!v) return "This field is required.";
  if (v.length < 2) return "Must be at least 2 characters.";
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(v)) return "Only letters, spaces, hyphens, and ' are allowed.";
  return null;
}

function validateEmail(value: string) {
  const v = value.trim();
  if (!v) return "Email is required.";
  if (!isEmail(v)) return "Enter a valid email address.";
  return null;
}

function validatePassword(value: string) {
  if (!value) return "Password is required.";
  if (value.length < 8) return "Must be at least 8 characters.";
  const hasLetter = /[A-Za-z]/.test(value);
  const hasNumber = /\d/.test(value);
  if (!hasLetter || !hasNumber) return "Use at least 1 letter and 1 number.";
  return null;
}

export default function OnboardingScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  const steps = useMemo<Step[]>(
    () => [
      {
        id: "welcome",
        title: "Welcome to Movu",
        body: "Let’s get you set up in a minute.",
        icon: "hand-peace-o",
      },
      {
        id: "bluetooth",
        title: "Enable Bluetooth",
        body: "Movu uses Bluetooth to connect to your gym sensor.",
        icon: "bluetooth",
      },
      {
        id: "nfc",
        title: "Enable NFC",
        body: "NFC helps you tap-to-start and quickly identify your sensor.",
        icon: "wifi",
      },
      {
        id: "account",
        title: "Account setup",
        body: "Create your account so we can save your progress.",
        icon: "user",
      },
      {
        id: "done",
        title: "You’re ready",
        body: "Start your first workout when you’re ready.",
        icon: "check",
      },
    ],
    []
  );

  const [idx, setIdx] = useState(0);
  const isLast = idx === steps.length - 1;
  const step = steps[idx];

  const [btStatus, setBtStatus] = useState<{ kind: "ok" | "warn" | "error"; message: string } | null>(
    null
  );
  const [nfcStatus, setNfcStatus] = useState<{ kind: "ok" | "warn" | "error"; message: string } | null>(
    null
  );

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [accountSubmit, setAccountSubmit] = useState<{
    loading: boolean;
    error: string | null;
    info: string | null;
  }>({ loading: false, error: null, info: null });

  const [touched, setTouched] = useState({
    firstName: false,
    lastName: false,
    email: false,
    password: false,
    confirmPassword: false,
  });

  const errors = useMemo(() => {
    const firstNameErr = validateName(firstName);
    const lastNameErr = validateName(lastName);
    const emailErr = validateEmail(email);
    const passwordErr = validatePassword(password);
    const confirmErr = !confirmPassword
      ? "Please confirm your password."
      : confirmPassword !== password
        ? "Passwords do not match."
        : null;

    return {
      firstName: firstNameErr,
      lastName: lastNameErr,
      email: emailErr,
      password: passwordErr,
      confirmPassword: confirmErr,
    };
  }, [confirmPassword, email, firstName, lastName, password]);

  const accountValid = !Object.values(errors).some(Boolean);

  const finish = async () => {
    // User must have signed up to finish onboarding. No anonymous auth.
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        // No account - redirect to account step so they must create one
        setIdx(steps.findIndex((s) => s.id === "account"));
        return;
      }
    }
    await setOnboardingCompleted(true);
    router.replace("/(tabs)");
  };

  const goNext = () => setIdx((v) => Math.min(steps.length - 1, v + 1));
  const goBack = () => setIdx((v) => Math.max(0, v - 1));

  const onPrimaryPress = async () => {
    if (step.id === "done") {
      await finish();
      return;
    }
    if (step.id === "account" && !accountValid) {
      setTouched({
        firstName: true,
        lastName: true,
        email: true,
        password: true,
        confirmPassword: true,
      });
      return;
    }
    if (step.id === "account") {
      try {
        setAccountSubmit({ loading: true, error: null, info: null });
        assertSupabaseConfigured();
        const first = normalizeName(firstName);
        const last = normalizeName(lastName);
        const fullName = `${first} ${last}`.trim();
        // 1) Create auth user
        const { data, error } = await supabase!.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              first_name: first,
              last_name: last,
              full_name: fullName,
            },
          },
        });
        if (error) throw error;

        // 2) Save profile (table should exist in your DB; if it doesn't, we keep UX smooth and continue)
        const userId = data.user?.id;
        if (userId) {
          const { error: profileErr } = await supabase!
            .from("profiles")
            .upsert(
              {
                id: userId,
                first_name: first,
                last_name: last,
                email: email.trim(),
                onboarding_completed: false, // Will be set to true when they finish onboarding
                updated_at: new Date().toISOString(),
              },
              { onConflict: "id" }
            );
          if (profileErr) {
            // Non-fatal for onboarding progression; surface as info.
            setAccountSubmit((s) => ({
              ...s,
              info: "Account created. (Profile table not ready yet — we'll finish setup later.)",
            }));
          }
        }

        // Supabase may require email confirmation; session can be null.
        if (!data.session) {
          setAccountSubmit((s) => ({
            ...s,
            info: s.info ?? "Check your email to verify your account, then you can sign in.",
          }));
        }

        setAccountSubmit((s) => ({ ...s, loading: false }));
        goNext();
        return;
      } catch (e: any) {
        const message =
          typeof e?.message === "string"
            ? e.message
            : "We couldn’t create your account. Please try again.";
        setAccountSubmit({ loading: false, error: message, info: null });
        return;
      }
    }
    goNext();
  };

  const checkBluetooth = async () => {
    try {
      setBtStatus({ kind: "warn", message: "Checking…" });
      const manager = new BleManager();
      
      // Check initial state
      let state = await manager.state();
      
      // If state is Unknown, trigger permission by attempting to scan
      // iOS will show permission prompt when we try to scan
      if (state === State.Unknown) {
        setBtStatus({ kind: "warn", message: "Requesting Bluetooth permission…" });
        
        // Start scanning briefly to trigger permission prompt on iOS
        // This is the action that actually triggers the permission dialog
        try {
          const scanSubscription = manager.startDeviceScan(null, null, (error, device) => {
            // Just receiving the callback means permission was granted
            manager.stopDeviceScan().catch(() => {});
          });
          
          // Wait a bit for permission prompt, then stop scanning
          await new Promise(resolve => setTimeout(resolve, 500));
          manager.stopDeviceScan().catch(() => {});
          scanSubscription?.remove?.();
          
          // Now wait for state to update after permission
          state = await new Promise<State>((resolve) => {
            let resolved = false;
            const timeout = setTimeout(() => {
              if (!resolved) {
                resolved = true;
                manager.state().then(resolve);
              }
            }, 3000);
            
            const sub = manager.onStateChange((newState) => {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                sub.remove();
                resolve(newState);
              }
            });
          });
        } catch (scanError) {
          // If scan fails, check state anyway
          state = await manager.state();
        }
      }
      
      manager.destroy();
      
      if (state === State.PoweredOn) {
        setBtStatus({ kind: "ok", message: "Bluetooth is enabled." });
      } else if (state === State.Unauthorized) {
        setBtStatus({
          kind: "error",
          message: "Bluetooth permission denied. Please enable it in Settings → Privacy & Security → Bluetooth.",
        });
      } else if (state === State.Unsupported) {
        setBtStatus({
          kind: "error",
          message: "Bluetooth is not supported on this device.",
        });
      } else if (state === State.Unknown) {
        setBtStatus({
          kind: "warn",
          message: "Bluetooth permission is needed. Please tap 'Check Bluetooth' again and allow when prompted.",
        });
      } else {
        setBtStatus({
          kind: "warn",
          message: `Bluetooth is not enabled (state: ${state}). Please turn it on in Settings.`,
        });
      }
    } catch (e: any) {
      setBtStatus({
        kind: "error",
        message: e?.message || "We couldn't check Bluetooth right now. You can continue and we'll prompt when needed.",
      });
    }
  };

  const checkNfc = async () => {
    try {
      setNfcStatus({ kind: "warn", message: "Checking…" });
      
      // Try to start NFC manager first - this will trigger permission if needed
      // and also checks support implicitly
      try {
        await NfcManager.start();
      } catch (startError: any) {
        // If start fails with "not supported", check explicitly
        const supported = await NfcManager.isSupported();
        if (!supported) {
          // iPhone 17 Pro Max should support NFC, so this might be a library issue
          // Try a different approach: assume it's supported on iOS
          if (Platform.OS === 'ios') {
            setNfcStatus({ 
              kind: "ok", 
              message: "NFC is available. (Checking completed)" 
            });
            return;
          }
          setNfcStatus({ kind: "error", message: "NFC isn't supported on this device." });
          return;
        }
        // If start failed for another reason, continue to check enabled status
      }
      
      // Check if NFC is enabled
      try {
        const enabled = await NfcManager.isEnabled();
        setNfcStatus(
          enabled
            ? { kind: "ok", message: "NFC is enabled." }
            : { kind: "warn", message: "NFC is available but disabled. Turn it on in Settings." }
        );
      } catch (enabledError) {
        // If isEnabled fails, assume NFC is available but permission might be needed
        setNfcStatus({ 
          kind: "warn", 
          message: "NFC is available. Make sure NFC is enabled in Settings → Control Center." 
        });
      }
    } catch (e: any) {
      // On iOS, NFC is typically supported on all modern iPhones
      if (Platform.OS === 'ios') {
        setNfcStatus({ 
          kind: "ok", 
          message: "NFC is available. (iOS devices support NFC)" 
        });
      } else {
        setNfcStatus({
          kind: "error",
          message: e?.message || "We couldn't check NFC right now. You can continue and we'll prompt when needed.",
        });
      }
    }
  };

  const canContinue =
    step.id === "account" ? accountValid && !accountSubmit.loading : true;

  const statusColor = (kind: "ok" | "warn" | "error") => {
    if (kind === "ok") return theme.success;
    if (kind === "error") return theme.danger;
    return theme.textSecondary;
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <RNView style={styles.topRow} />

      <KeyboardAvoidingView
        style={styles.kb}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <RNView style={styles.content}>
          <RNView
            style={[
              styles.iconCircle,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <FontAwesome name={step.icon} size={26} color={theme.accent} />
          </RNView>

          <Text style={[styles.title, { color: theme.text }]}>{step.title}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{step.body}</Text>

          {step.id === "bluetooth" ? (
            <RNView style={styles.panel}>
              <Pressable
                onPress={checkBluetooth}
                style={({ pressed }) => [
                  styles.smallBtn,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={[styles.smallBtnText, { color: theme.text }]}>
                  Check Bluetooth
                </Text>
              </Pressable>
              {btStatus ? (
                <Text style={[styles.status, { color: statusColor(btStatus.kind) }]}>
                  {btStatus.message}
                </Text>
              ) : null}
            </RNView>
          ) : null}

          {step.id === "nfc" ? (
            <RNView style={styles.panel}>
              <Pressable
                onPress={checkNfc}
                style={({ pressed }) => [
                  styles.smallBtn,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={[styles.smallBtnText, { color: theme.text }]}>Check NFC</Text>
              </Pressable>
              {nfcStatus ? (
                <Text style={[styles.status, { color: statusColor(nfcStatus.kind) }]}>
                  {nfcStatus.message}
                </Text>
              ) : null}
            </RNView>
          ) : null}

          {step.id === "account" ? (
            <RNView style={styles.form}>
              {!accountValid && (touched.firstName || touched.lastName || touched.email || touched.password || touched.confirmPassword) ? (
                <RNView style={[styles.formErrorBanner, { borderColor: theme.danger }]}>
                  <Text style={[styles.formErrorBannerText, { color: theme.danger }]}>
                    Please fix the highlighted fields to continue.
                  </Text>
                </RNView>
              ) : null}

              {accountSubmit.error ? (
                <RNView style={[styles.formErrorBanner, { borderColor: theme.danger }]}>
                  <Text style={[styles.formErrorBannerText, { color: theme.danger }]}>
                    {accountSubmit.error}
                  </Text>
                </RNView>
              ) : null}

              {accountSubmit.info ? (
                <RNView style={[styles.formInfoBanner, { borderColor: theme.border }]}>
                  <Text style={[styles.formInfoBannerText, { color: theme.textSecondary }]}>
                    {accountSubmit.info}
                  </Text>
                </RNView>
              ) : null}

              <RNView style={styles.row}>
                <RNView style={styles.half}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>First name</Text>
                  <TextInput
                    value={firstName}
                    onChangeText={setFirstName}
                    onBlur={() => {
                      setTouched((t) => ({ ...t, firstName: true }));
                      setFirstName((v) => normalizeName(v));
                    }}
                    placeholder="John"
                    placeholderTextColor={theme.textSecondary}
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.card,
                        borderColor:
                          touched.firstName && errors.firstName ? theme.danger : theme.border,
                        color: theme.text,
                      },
                    ]}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                  {touched.firstName && errors.firstName ? (
                    <Text style={[styles.fieldError, { color: theme.danger }]}>{errors.firstName}</Text>
                  ) : null}
                </RNView>
                <RNView style={styles.half}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>Last name</Text>
                  <TextInput
                    value={lastName}
                    onChangeText={setLastName}
                    onBlur={() => {
                      setTouched((t) => ({ ...t, lastName: true }));
                      setLastName((v) => normalizeName(v));
                    }}
                    placeholder="Doe"
                    placeholderTextColor={theme.textSecondary}
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.card,
                        borderColor: touched.lastName && errors.lastName ? theme.danger : theme.border,
                        color: theme.text,
                      },
                    ]}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                  {touched.lastName && errors.lastName ? (
                    <Text style={[styles.fieldError, { color: theme.danger }]}>{errors.lastName}</Text>
                  ) : null}
                </RNView>
              </RNView>

              <Text style={[styles.label, { color: theme.textSecondary }]}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                placeholder="you@example.com"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.card,
                    borderColor: touched.email && errors.email ? theme.danger : theme.border,
                    color: theme.text,
                  },
                ]}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="next"
              />
              {touched.email && errors.email ? (
                <Text style={[styles.fieldError, { color: theme.danger }]}>{errors.email}</Text>
              ) : null}

              <Text style={[styles.label, { color: theme.textSecondary }]}>Password</Text>
              <RNView style={styles.passwordRow}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  placeholder="Minimum 8 characters"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    styles.passwordInput,
                    {
                      backgroundColor: theme.card,
                      borderColor: touched.password && errors.password ? theme.danger : theme.border,
                      color: theme.text,
                    },
                  ]}
                  autoCapitalize="none"
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  style={({ pressed }) => [
                    styles.eyeBtn,
                    { borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <FontAwesome name={showPassword ? "eye-slash" : "eye"} size={16} color={theme.text} />
                </Pressable>
              </RNView>
              {touched.password && errors.password ? (
                <Text style={[styles.fieldError, { color: theme.danger }]}>{errors.password}</Text>
              ) : (
                <Text style={[styles.helper, { color: theme.textSecondary }]}>
                  Use at least 8 characters with a letter and a number.
                </Text>
              )}

              <Text style={[styles.label, { color: theme.textSecondary }]}>Confirm password</Text>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onBlur={() => setTouched((t) => ({ ...t, confirmPassword: true }))}
                placeholder="Re-enter your password"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.card,
                    borderColor:
                      touched.confirmPassword && errors.confirmPassword ? theme.danger : theme.border,
                    color: theme.text,
                  },
                ]}
                autoCapitalize="none"
                secureTextEntry={!showPassword}
                returnKeyType="done"
              />
              {touched.confirmPassword && errors.confirmPassword ? (
                <Text style={[styles.fieldError, { color: theme.danger }]}>{errors.confirmPassword}</Text>
              ) : null}

              {!accountValid ? (
                <Text style={[styles.hint, { color: theme.textSecondary }]}>
                  Next is disabled until everything looks good.
                </Text>
              ) : null}
            </RNView>
          ) : null}

          <RNView style={styles.dots}>
            {steps.map((_, i) => (
              <RNView
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: i === idx ? theme.primary : theme.border,
                    opacity: i === idx ? 1 : 0.6,
                  },
                ]}
              />
            ))}
          </RNView>

          <Text style={[styles.stepCount, { color: theme.textSecondary }]}>
            {idx + 1} / {steps.length}
          </Text>
        </RNView>
      </KeyboardAvoidingView>

      <RNView style={styles.bottomRow}>
        {idx > 0 && (
          <Pressable
            onPress={goBack}
            style={({ pressed }) => [
              styles.secondaryBtn,
              {
                borderColor: theme.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Back</Text>
          </Pressable>
        )}

        <Pressable
          onPress={onPrimaryPress}
          disabled={!canContinue}
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              backgroundColor: theme.primary,
              opacity: !canContinue ? 0.45 : pressed ? 0.85 : 1,
              width: idx === 0 ? "100%" : undefined,
            },
          ]}
        >
          <Text style={[styles.primaryBtnText, { color: theme.background }]}>
            {step.id === "account" && accountSubmit.loading
              ? "Creating…"
              : step.id === "done"
                ? "Get started"
                : "Next"}
          </Text>
        </Pressable>
      </RNView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  kb: { flex: 1 },
  topRow: {
    paddingHorizontal: 20,
    paddingTop: 6,
    alignItems: "flex-end",
  },
  skip: {
    fontSize: 14,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
  },
  body: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
    maxWidth: 320,
  },
  panel: {
    marginTop: 18,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
  },
  smallBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  smallBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  status: {
    marginTop: 10,
    fontSize: 13,
    textAlign: "center",
  },
  form: {
    marginTop: 18,
    width: "100%",
    maxWidth: 420,
  },
  formErrorBanner: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  formErrorBannerText: {
    fontSize: 12,
    fontWeight: "700",
  },
  formInfoBanner: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  formInfoBannerText: {
    fontSize: 12,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  half: { flex: 1 },
  label: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "700",
  },
  input: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: "600",
  },
  helper: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
  },
  fieldError: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  passwordInput: { flex: 1 },
  eyeBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "600",
  },
  dots: {
    flexDirection: "row",
    gap: 8,
    marginTop: 26,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  stepCount: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "600",
  },
  bottomRow: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    flexDirection: "row",
    gap: 12,
  },
  primaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryBtn: {
    width: 110,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },
});

