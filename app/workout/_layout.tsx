import { Stack } from "expo-router";

import { BleConnectionProvider } from "@/contexts/BleConnectionContext";

export default function WorkoutLayout() {
  return (
    <BleConnectionProvider>
      <Stack screenOptions={{ headerTitleAlign: "center" }}>
        <Stack.Screen name="nfc" options={{ title: "NFC" }} />
        <Stack.Screen name="connecting" options={{ title: "Connecting", headerShown: false }} />
        <Stack.Screen name="plan" options={{ title: "Plan Workout" }} />
        <Stack.Screen name="ble" options={{ title: "BLE" }} />
        <Stack.Screen name="session" options={{ title: "Session" }} />
        <Stack.Screen name="summary" options={{ title: "Summary" }} />
      </Stack>
    </BleConnectionProvider>
  );
}