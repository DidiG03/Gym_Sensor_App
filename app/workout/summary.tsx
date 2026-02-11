import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";

export default function Summary() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Summary</Text>
      <Pressable onPress={() => router.replace("/(tabs)")} style={{ padding: 14, borderRadius: 12, backgroundColor: "#111" }}>
        <Text style={{ color: "#fff", fontWeight: "600" }}>Back to Tabs</Text>
      </Pressable>
    </View>
  );
}