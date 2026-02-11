export type TimeGreeting = "Good morning" | "Good afternoon" | "Good evening";

export function getTimeGreeting(date: Date = new Date()): TimeGreeting {
  const hour = date.getHours();

  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}
