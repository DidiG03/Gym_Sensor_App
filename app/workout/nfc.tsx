import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View as RNView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import NfcManager, { NfcTech, Ndef } from "react-native-nfc-manager";
import { router } from "expo-router";

import Colors from "@/constants/Colors";
import { useColorScheme } from "@/components/useColorScheme";
import { Text } from "@/components/Themed";

// Map NFC machine IDs (e.g. bench_press_1) to display names matching BLE page
const MACHINE_ID_MAP: Record<string, string> = {
  bench_press: "Bench Press",
  bench_press_1: "Bench Press",
  squat_rack: "Squat Rack",
  squat_rack_1: "Squat Rack",
  leg_press: "Leg Press",
  leg_press_1: "Leg Press",
  cable_machine: "Cable Machine",
  cable_machine_1: "Cable Machine",
  lat_pulldown: "Lat Pulldown",
  lat_pulldown_1: "Lat Pulldown",
  shoulder_press: "Shoulder Press",
  shoulder_press_1: "Shoulder Press",
  leg_curl: "Leg Curl",
  leg_curl_1: "Leg Curl",
  leg_extension: "Leg Extension",
  leg_extension_1: "Leg Extension",
  chest_fly: "Chest Fly",
  chest_fly_1: "Chest Fly",
  row_machine: "Row Machine",
  row_machine_1: "Row Machine",
  bicep_curl: "Bicep Curl",
  bicep_curl_1: "Bicep Curl",
  tricep_extension: "Tricep Extension",
  tricep_extension_1: "Tricep Extension",
};

function parseMachineFromUri(uri: string): string | null {
  try {
    // movo://machine?id=bench_press_1 (may be embedded in longer text)
    if (!uri || typeof uri !== "string") return null;
    const match = uri.match(/movo:\/\/[^?\s]+(\?[^#\s]*)?/i);
    const toParse = match ? match[0] : uri.trim();
    if (!toParse.toLowerCase().startsWith("movo://")) return null;
    const url = new URL(toParse.replace(/^movo:\/\//i, "https://x/"));
    const id = url.searchParams.get("id");
    if (!id) return null;
    const machineName = MACHINE_ID_MAP[id.toLowerCase()] ?? MACHINE_ID_MAP[id.toLowerCase().replace(/_?\d+$/, "")];
    return machineName ?? null;
  } catch {
    return null;
  }
}

function extractUriFromTag(tag: { ndefMessage?: Array<{ tnf?: number; type?: string | number[]; payload?: number[] }> }): string | null {
  const records = tag?.ndefMessage;
  if (!Array.isArray(records) || records.length === 0) return null;

  for (const record of records) {
    try {
      // TNF_ABSOLUTE_URI (0x03): URI is in type field
      if (record.tnf === 0x03 && typeof record.type === "string") {
        return record.type;
      }
      // TNF_WELL_KNOWN + RTD_URI: decode payload
      if (record.tnf === 0x01 && record.payload && record.payload.length > 0) {
        const typeStr = Array.isArray(record.type) ? String.fromCharCode(...record.type) : record.type;
        const payload = record.payload instanceof Uint8Array ? record.payload : new Uint8Array(record.payload);
        if (typeStr === "U" || (Array.isArray(record.type) && record.type[0] === 0x55)) {
          const uri = Ndef.uri.decodePayload(payload);
          if (uri) return uri;
        }
        // Text record: payload may contain movo://
        if (typeStr === "T" || (Array.isArray(record.type) && record.type[0] === 0x54)) {
          try {
            const text = Ndef.text.decodePayload(payload);
            if (text && text.includes("movo://")) return text;
          } catch {
            // skip
          }
        }
      }
      // Fallback: try to find movo:// in raw payload as UTF-8 string
      if (record.payload && record.payload.length > 0) {
        const raw = String.fromCharCode(...record.payload);
        if (raw.includes("movo://")) return raw;
      }
    } catch {
      // skip
    }
  }
  return null;
}

export default function NfcScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState<string>("Checking NFC…");
  const [scannedMachine, setScannedMachine] = useState<string | null>(null);
  const [nfcSupported, setNfcSupported] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const supported = await NfcManager.isSupported();
        if (mounted) {
          setNfcSupported(supported);
          setStatus(supported ? "Tap \"Scan NFC tag\" first, then hold phone near the machine" : "NFC is not supported");
        }
        if (supported) await NfcManager.start();
      } catch (e: any) {
        if (mounted) {
          setNfcSupported(false);
          setStatus("NFC check failed: " + (e?.message ?? "unknown"));
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const scanNfc = useCallback(async () => {
    if (nfcSupported === false) {
      setStatus("NFC is not supported on this device");
      return;
    }
    if (nfcSupported === null) {
      setStatus("Still checking NFC support…");
      return;
    }
    setScanning(true);
    setStatus("Hold your phone near the machine tag now…");
    setScannedMachine(null);
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef, {
        alertMessage: "Hold your iPhone near the machine tag",
        invalidateAfterFirstRead: true,
      });
      const tag = await NfcManager.getTag();
      const uri = extractUriFromTag(tag ?? {});
      const machine = uri ? parseMachineFromUri(uri) : null;
      if (machine) {
        router.push({ pathname: "/workout/ble", params: { machine } });
        return;
      }
      setStatus(uri ? `Unknown machine: ${uri}` : "No machine URL found on tag");
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      if (msg.includes("cancelled") || msg.includes("User") || msg.includes("Session")) {
        setStatus("Scan cancelled");
      } else {
        setStatus("Error: " + msg);
      }
    } finally {
      setScanning(false);
      try {
        await NfcManager.cancelTechnologyRequest();
      } catch {
        // ignore
      }
    }
  }, [nfcSupported]);

  const goToBle = useCallback(() => {
    router.push({
      pathname: "/workout/ble",
      params: scannedMachine ? { machine: scannedMachine } : undefined,
    });
  }, [scannedMachine]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <RNView style={styles.content}>
        <RNView
          style={[
            styles.iconCircle,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <FontAwesome name="wifi" size={40} color={theme.accent} />
        </RNView>
        <Text style={[styles.title, { color: theme.text }]}>Scan machine</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Hold your phone near the NFC tag on the machine to load it automatically.
        </Text>

        <Pressable
          onPress={scanNfc}
          disabled={scanning || !nfcSupported}
          style={({ pressed }) => [
            styles.scanBtn,
            {
              backgroundColor: scanning ? theme.border : theme.primary,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[styles.scanBtnText, { color: theme.background }]}>
            {scanning ? "Scanning…" : "Scan NFC tag"}
          </Text>
        </Pressable>

        <Text style={[styles.status, { color: theme.textSecondary }]}>{status}</Text>

        {scannedMachine && (
          <RNView style={[styles.machineChip, { backgroundColor: theme.success }]}>
            <Text style={[styles.machineChipText, { color: theme.background }]}>
              {scannedMachine}
            </Text>
          </RNView>
        )}
      </RNView>

      <RNView style={styles.bottom}>
        <Pressable
          onPress={goToBle}
          style={({ pressed }) => [
            styles.continueBtn,
            {
              backgroundColor: theme.primary,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[styles.continueBtnText, { color: theme.background }]}>
            {scannedMachine ? "Continue with " + scannedMachine : "Continue without scanning"}
          </Text>
        </Pressable>
      </RNView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 20,
  },
  scanBtn: {
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 12,
  },
  scanBtnText: {
    fontSize: 16,
    fontWeight: "700",
  },
  status: {
    fontSize: 13,
    textAlign: "center",
  },
  machineChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  machineChipText: {
    fontSize: 15,
    fontWeight: "700",
  },
  bottom: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  continueBtn: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: "700",
  },
});
