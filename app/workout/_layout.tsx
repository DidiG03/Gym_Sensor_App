import { Stack } from "expo-router";

export default function WorkoutLayout() {
  return (
    <Stack screenOptions={{ headerTitleAlign: "center" }}>
      <Stack.Screen name="nfc" options={{ title: "NFC" }} />
      <Stack.Screen name="ble" options={{ title: "BLE" }} />
      <Stack.Screen name="session" options={{ title: "Session" }} />
      <Stack.Screen name="summary" options={{ title: "Summary" }} />
    </Stack>
  );
}