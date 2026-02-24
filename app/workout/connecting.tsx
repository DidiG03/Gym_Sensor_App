import { useEffect } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View as RNView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import Colors from "@/constants/Colors";
import { useColorScheme } from "@/components/useColorScheme";
import { Text } from "@/components/Themed";
import { useBleConnection } from "@/contexts/BleConnectionContext";
import { useBleConnectToSensor } from "@/hooks/useBleConnectToSensor";

export default function ConnectingScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];
  const { machine, sensorName, sensorMac } = useLocalSearchParams<{
    machine?: string;
    sensorName?: string;
    sensorMac?: string;
  }>();
  const { setPreConnected } = useBleConnection();
  const { device, status, error, connect, manager } = useBleConnectToSensor(
    sensorName ?? "IMU-STACK",
    sensorMac
  );

  useEffect(() => {
    connect();
  }, [connect]);

  useEffect(() => {
    if (status === "connected" && device && manager && machine && machine.trim()) {
      setPreConnected(
        device,
        manager,
        machine,
        sensorName ?? "IMU-STACK",
        sensorMac ?? ""
      );
      router.replace({
        pathname: "/workout/ble",
        params: {
          machine,
          sensorName: sensorName ?? "",
          sensorMac: sensorMac ?? "",
        },
      });
    }
  }, [status, device, manager, machine, sensorName, sensorMac, setPreConnected]);

  const machineLabel = machine ?? "Machine";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <RNView style={styles.content}>
        <RNView
          style={[
            styles.iconCircle,
            {
              backgroundColor: theme.card,
              borderColor:
                status === "connected"
                  ? theme.success
                  : status === "error"
                    ? theme.danger
                    : theme.border,
            },
          ]}
        >
          {status === "scanning" || status === "connecting" ? (
            <ActivityIndicator size="large" color={theme.accent} />
          ) : status === "error" ? (
            <FontAwesome name="exclamation-circle" size={48} color={theme.danger} />
          ) : (
            <FontAwesome name="bluetooth" size={48} color={theme.accent} />
          )}
        </RNView>

        <Text style={[styles.title, { color: theme.text }]}>
          {status === "connected"
            ? "Connected!"
            : status === "error"
              ? "Connection failed"
              : "Connecting to sensor"}
        </Text>

        <Text
          style={[
            styles.subtitle,
            {
              color:
                status === "error" ? theme.danger : theme.textSecondary,
            },
          ]}
        >
          {status === "scanning"
            ? `Searching for ${machineLabel} sensor…`
            : status === "connecting"
              ? "Connecting…"
              : status === "error"
                ? error ?? "Something went wrong"
                : `Preparing ${machineLabel}…`}
        </Text>

        {status === "error" && (
          <Pressable
            onPress={() => connect()}
            style={({ pressed }) => [
              styles.retryBtn,
              {
                backgroundColor: theme.primary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.retryBtnText, { color: theme.background }]}>
              Try again
            </Text>
          </Pressable>
        )}
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
    width: 100,
    height: 100,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 22,
  },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  retryBtnText: {
    fontSize: 16,
    fontWeight: "700",
  },
});
