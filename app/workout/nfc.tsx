import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View as RNView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import NfcManager, { NfcTech, Ndef } from "react-native-nfc-manager";
import { router } from "expo-router";

import Colors from "@/constants/Colors";
import { useColorScheme } from "@/components/useColorScheme";
import { Text } from "@/components/Themed";
import {
  extractMachineIdFromUri,
  getMachineDisplayName,
  getSensorForMachineId,
} from "@/utils/nfcSensorMap";

type ScanState = "idle" | "loading" | "success" | "error";

function extractUriFromTag(tag: {
  ndefMessage?: Array<{
    tnf?: number;
    type?: string | number[];
    payload?: number[];
  }>;
}): string | null {
  const records = tag?.ndefMessage;
  if (!Array.isArray(records) || records.length === 0) return null;

  for (const record of records) {
    try {
      if (record.tnf === 0x03 && typeof record.type === "string") {
        return record.type;
      }
      if (record.tnf === 0x01 && record.payload && record.payload.length > 0) {
        const typeStr =
          Array.isArray(record.type) ? String.fromCharCode(...record.type) : record.type;
        const payload =
          record.payload instanceof Uint8Array
            ? record.payload
            : new Uint8Array(record.payload);
        if (typeStr === "U" || (Array.isArray(record.type) && record.type[0] === 0x55)) {
          const uri = Ndef.uri.decodePayload(payload);
          if (uri) return uri;
        }
        if (typeStr === "T" || (Array.isArray(record.type) && record.type[0] === 0x54)) {
          try {
            const text = Ndef.text.decodePayload(payload);
            if (text && text.includes("movo://")) return text;
          } catch {
            // skip
          }
        }
      }
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

  const [scanState, setScanState] = useState<ScanState>("idle");
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
          setStatus(
            supported
              ? 'Tap "Scan NFC tag" to start, then hold phone near the machine'
              : "NFC is not supported on this device"
          );
        }
        if (supported) await NfcManager.start();
      } catch (e: any) {
        if (mounted) {
          setNfcSupported(false);
          setScanState("error");
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
      setScanState("error");
      setStatus("NFC is not supported on this device");
      return;
    }
    if (nfcSupported === null) {
      setStatus("Still checking NFC support…");
      return;
    }

    setScanState("loading");
    setStatus("Hold your phone near the machine tag now…");
    setScannedMachine(null);

    try {
      await NfcManager.requestTechnology(NfcTech.Ndef, {
        alertMessage: "Hold your phone near the machine tag",
        invalidateAfterFirstRead: true,
      });
      const tag = await NfcManager.getTag();
      const uri = extractUriFromTag(tag ?? {});

      if (!uri) {
        setScanState("error");
        setStatus("No machine URL found on tag");
        return;
      }

      const machineId = extractMachineIdFromUri(uri);
      if (!machineId) {
        setScanState("error");
        setStatus(`Unknown tag format: ${uri}`);
        return;
      }

      const sensor = getSensorForMachineId(machineId);
      const displayName = getMachineDisplayName(machineId) ?? machineId;

      if (!sensor || (!sensor.name && !sensor.mac)) {
        setScanState("error");
        setStatus(`Machine "${machineId}" has no sensor mapped`);
        return;
      }

      setScannedMachine(displayName);
      setScanState("success");
      setStatus(`Found ${displayName} — connecting…`);

      router.push({
        pathname: "/workout/connecting",
        params: {
          machine: displayName,
          sensorName: sensor.name ?? "",
          sensorMac: sensor.mac ?? "",
        },
      });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setScanState("error");
      if (
        msg.includes("cancelled") ||
        msg.includes("User") ||
        msg.includes("Session")
      ) {
        setStatus("Scan cancelled");
      } else {
        setStatus("Error: " + msg);
      }
    } finally {
      setScanState((s) => (s === "loading" ? "idle" : s));
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
            {
              backgroundColor: theme.card,
              borderColor:
                scanState === "success"
                  ? theme.success
                  : scanState === "error"
                    ? theme.danger
                    : theme.border,
            },
          ]}
        >
          {scanState === "loading" ? (
            <ActivityIndicator size="large" color={theme.accent} />
          ) : (
            <FontAwesome
              name={
                scanState === "success"
                  ? "check"
                  : scanState === "error"
                    ? "exclamation-circle"
                    : "wifi"
              }
              size={40}
              color={
                scanState === "success"
                  ? theme.success
                  : scanState === "error"
                    ? theme.danger
                    : theme.accent
              }
            />
          )}
        </RNView>

        <Text style={[styles.title, { color: theme.text }]}>Tap to connect</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Scan the NFC tag on the machine to automatically connect to its Bluetooth sensor.
        </Text>

        <Pressable
          onPress={scanNfc}
          disabled={scanState === "loading" || !nfcSupported}
          style={({ pressed }) => [
            styles.scanBtn,
            {
              backgroundColor:
                scanState === "loading" ? theme.border : theme.primary,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[styles.scanBtnText, { color: theme.background }]}>
            {scanState === "loading" ? "Scanning…" : "Scan NFC tag"}
          </Text>
        </Pressable>

        <Text
          style={[
            styles.status,
            {
              color:
                scanState === "error"
                  ? theme.danger
                  : scanState === "success"
                    ? theme.success
                    : theme.textSecondary,
            },
          ]}
        >
          {status}
        </Text>

        {scannedMachine && scanState === "success" && (
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
            {scannedMachine
              ? "Continue with " + scannedMachine
              : "Continue without scanning"}
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
