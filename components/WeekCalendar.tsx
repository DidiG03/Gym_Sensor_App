import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, View as RNView } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import Colors from "@/constants/Colors";
import { Text } from "@/components/Themed";
import { useColorScheme } from "@/components/useColorScheme";

type DayData = {
  date: Date;
  dayLabel: string;
  dayNumber: string;
  isToday: boolean;
};

export default function WeekCalendar() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  const weekDays = useMemo(() => {
    const today = new Date();
    const currentDay = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay; // Get Monday of this week
    
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    
    const days: DayData[] = [];
    const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      
      const isToday = 
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();
      
      days.push({
        date,
        dayLabel: dayLabels[i],
        dayNumber: date.getDate().toString(),
        isToday,
      });
    }
    
    return days;
  }, []);

  return (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {weekDays.map((day, index) => {
        const isToday = day.isToday;
        return (
          <RNView key={index} style={styles.dayContainer}>
            <Text style={[styles.dayLabel, { color: theme.textSecondary }]}>
              {day.dayLabel}
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.dateBox,
                {
                  backgroundColor: isToday ? theme.accent : theme.card,
                  borderColor: isToday ? theme.accent : theme.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.dateText,
                  { color: isToday ? "#fff" : theme.text },
                ]}
              >
                {day.dayNumber}
              </Text>
            </Pressable>
          </RNView>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  dayContainer: {
    alignItems: "center",
    gap: 6,
    minWidth: 44,
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  dateBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dateText: {
    fontSize: 16,
    fontWeight: "800",
  },
});
