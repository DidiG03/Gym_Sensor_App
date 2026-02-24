/**
 * Maps NFC machine IDs (from movo://machine?id=xxx) to Bluetooth sensor identifiers.
 * Use this for tap-to-connect: when user scans an NFC tag, we look up which BLE device to connect to.
 *
 * Match by:
 * - name: BLE device name (e.g. "IMU-STACK", "Movu-Bench-1")
 * - mac: Device MAC address (Android) or UUID (iOS) - use when multiple sensors share a name
 */

export type SensorIdentifier = {
  name?: string;
  mac?: string;
};

/** Extract raw machine id from movo://machine?id=xxx URI */
export function extractMachineIdFromUri(uri: string): string | null {
  try {
    if (!uri || typeof uri !== "string") return null;
    const match = uri.match(/movo:\/\/[^?\s]+(\?[^#\s]*)?/i);
    const toParse = match ? match[0] : uri.trim();
    if (!toParse.toLowerCase().startsWith("movo://")) return null;
    const url = new URL(toParse.replace(/^movo:\/\//i, "https://x/"));
    const id = url.searchParams.get("id");
    return id?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Mock dictionary: machine id -> BLE sensor identifier.
 * Replace with your real sensor IDs (names/MACs) for each gym machine.
 */
const MACHINE_TO_SENSOR: Record<string, SensorIdentifier> = {
  bench_press: { name: "IMU-STACK" },
  bench_press_1: { name: "IMU-STACK" },
  squat_rack: { name: "IMU-STACK" },
  squat_rack_1: { name: "IMU-STACK" },
  leg_press: { name: "IMU-STACK" },
  leg_press_1: { name: "IMU-STACK" },
  cable_machine: { name: "IMU-STACK" },
  cable_machine_1: { name: "IMU-STACK" },
  lat_pulldown: { name: "IMU-STACK" },
  lat_pulldown_1: { name: "IMU-STACK" },
  shoulder_press: { name: "IMU-STACK" },
  shoulder_press_1: { name: "IMU-STACK" },
  leg_curl: { name: "IMU-STACK" },
  leg_curl_1: { name: "IMU-STACK" },
  leg_extension: { name: "IMU-STACK" },
  leg_extension_1: { name: "IMU-STACK" },
  chest_fly: { name: "IMU-STACK" },
  chest_fly_1: { name: "IMU-STACK" },
  row_machine: { name: "IMU-STACK" },
  row_machine_1: { name: "IMU-STACK" },
  bicep_curl: { name: "IMU-STACK" },
  bicep_curl_1: { name: "IMU-STACK" },
  tricep_extension: { name: "IMU-STACK" },
  tricep_extension_1: { name: "IMU-STACK" },
  // Example with MAC (Android): bench_press_1: { name: "IMU-STACK", mac: "AA:BB:CC:DD:EE:FF" }
  // Example with device UUID (iOS): bench_press_1: { name: "IMU-STACK", mac: "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" }
};

/** Get BLE sensor identifier for a machine id. Returns null if unknown. */
export function getSensorForMachineId(machineId: string): SensorIdentifier | null {
  const id = machineId.toLowerCase().trim();
  const direct = MACHINE_TO_SENSOR[id];
  if (direct) return direct;
  const base = id.replace(/_?\d+$/, "");
  return MACHINE_TO_SENSOR[base] ?? null;
}

/** Machine id -> display name for UI */
const MACHINE_DISPLAY_NAMES: Record<string, string> = {
  bench_press: "Bench Press", bench_press_1: "Bench Press",
  squat_rack: "Squat Rack", squat_rack_1: "Squat Rack",
  leg_press: "Leg Press", leg_press_1: "Leg Press",
  cable_machine: "Cable Machine", cable_machine_1: "Cable Machine",
  lat_pulldown: "Lat Pulldown", lat_pulldown_1: "Lat Pulldown",
  shoulder_press: "Shoulder Press", shoulder_press_1: "Shoulder Press",
  leg_curl: "Leg Curl", leg_curl_1: "Leg Curl",
  leg_extension: "Leg Extension", leg_extension_1: "Leg Extension",
  chest_fly: "Chest Fly", chest_fly_1: "Chest Fly",
  row_machine: "Row Machine", row_machine_1: "Row Machine",
  bicep_curl: "Bicep Curl", bicep_curl_1: "Bicep Curl",
  tricep_extension: "Tricep Extension", tricep_extension_1: "Tricep Extension",
};

export function getMachineDisplayName(machineId: string): string | null {
  const id = machineId.toLowerCase().trim();
  return MACHINE_DISPLAY_NAMES[id] ?? MACHINE_DISPLAY_NAMES[id.replace(/_?\d+$/, "")] ?? null;
}
