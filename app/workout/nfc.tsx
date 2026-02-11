import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";

export default function Nfc() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>NFC Scan</Text>
      <Pressable onPress={() => router.push("/workout/ble")} style={{ padding: 14, borderRadius: 12, backgroundColor: "#111" }}>
        <Text style={{ color: "#fff", fontWeight: "600" }}>Continue</Text>
      </Pressable>
    </View>
  );
}