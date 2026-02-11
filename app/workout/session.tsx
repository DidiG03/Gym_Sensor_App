import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutAnimation, Modal, Pressable, StyleSheet, UIManager, View as RNView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { BleManager, Device, State } from "react-native-ble-plx";
import { decode as atob } from "base-64";

import Colors from "@/constants/Colors";
import { Text } from "@/components/Themed";
import { useColorScheme } from "@/components/useColorScheme";
import SlideToConfirm from "@/components/SlideToConfirm";
import { saveWorkout } from "@/utils/workoutStorage";
import { supabase } from "@/lib/supabase";

const SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
const CHAR_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";
const LIVE_CHAR_UUID = "6E400004-B5A3-F393-E0A9-E50E24DCCA9E";
const SERVICE_UUID_LC = SERVICE_UUID.toLowerCase();
const CHAR_UUID_LC = CHAR_UUID.toLowerCase();
const LIVE_CHAR_UUID_LC = LIVE_CHAR_UUID.toLowerCase();

export default function Session() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];
  const params = useLocalSearchParams<{ sets?: string; reps?: string; machine?: string }>();

  const sets = useMemo(() => {
    const parsed = params.sets ? parseInt(params.sets, 10) : 3;
    return isNaN(parsed) || parsed < 1 ? 3 : Math.min(20, parsed);
  }, [params.sets]);

  const reps = useMemo(() => {
    const parsed = params.reps ? parseInt(params.reps, 10) : 10;
    return isNaN(parsed) || parsed < 1 ? 10 : Math.min(50, parsed);
  }, [params.reps]);

  const machineName = params.machine || "Machine";

  // Enable LayoutAnimation on Android
  if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }

  const setBars = useMemo(() => Array.from({ length: sets }, (_, i) => i + 1), [sets]);

  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [setRepsCompleted, setSetRepsCompleted] = useState<number[]>(Array(sets).fill(0));
  const [setRestTimes, setSetRestTimes] = useState<number[]>(Array(sets).fill(0));
  const [showRestDrawer, setShowRestDrawer] = useState(false);
  const [restTimer, setRestTimer] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [sensorStatus, setSensorStatus] = useState<"idle" | "scanning" | "connecting" | "connected" | "error">("idle");
  const [sensorReps, setSensorReps] = useState(0);
  const [bleLastText, setBleLastText] = useState<string | null>(null);
  const [bleNotifyCount, setBleNotifyCount] = useState(0);
  const [bleLastAtMs, setBleLastAtMs] = useState<number | null>(null);
  const [bleLastError, setBleLastError] = useState<string | null>(null);
  const [bleLiveLastText, setBleLiveLastText] = useState<string | null>(null);
  const [bleLiveCount, setBleLiveCount] = useState(0);
  const [bleLiveLastAtMs, setBleLiveLastAtMs] = useState<number | null>(null);
  const restTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restStartTimeRef = useRef<number>(Date.now());
  const sessionStartTimeRef = useRef<number>(Date.now());
  
  // BLE Manager and device refs
  const bleManagerRef = useRef<BleManager | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const stateSubscriptionRef = useRef<any>(null);
  const scanSubscriptionRef = useRef<any>(null);
  const characteristicSubscriptionRef = useRef<any>(null);
  const lastSensorRepRef = useRef<number>(0);
  const currentRepsRef = useRef<number>(0);
  const showRestDrawerRef = useRef<boolean>(false);
  const connectInFlightRef = useRef(false);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get current user ID
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!supabase) return;
        const { data } = await supabase.auth.getUser();
        if (!cancelled && data.user?.id) {
          setUserId(data.user.id);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentReps = setRepsCompleted[currentSetIndex] || 0;
  const isSetComplete = currentReps >= reps;
  const isAllSetsComplete = setRepsCompleted.every((r) => r >= reps);
  const isLastSet = currentSetIndex >= sets - 1;

  // Update refs for BLE callback
  currentRepsRef.current = currentReps;
  showRestDrawerRef.current = showRestDrawer;

  // BLE Sensor connection and monitoring
  useEffect(() => {
    if (__DEV__) {
      console.log("[BLE] Effect running, showRestDrawer:", showRestDrawer, "isAllSetsComplete:", isAllSetsComplete);
    }

    if (showRestDrawer || isAllSetsComplete) {
      // Clean up any active connections when pausing
      connectInFlightRef.current = false;
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
      if (readPollIntervalRef.current) {
        clearInterval(readPollIntervalRef.current);
        readPollIntervalRef.current = null;
      }
      if (deviceRef.current) {
        if (__DEV__) {
          console.log("[BLE] Pausing - disconnecting device");
        }
        deviceRef.current.cancelConnection().catch(() => {});
        deviceRef.current = null;
      }
      if (bleManagerRef.current) {
        bleManagerRef.current.stopDeviceScan().catch(() => {});
      }
      setSensorStatus("idle");
      return; // Don't scan during rest or when complete
    }

    let cancelled = false;
    
    // Only initialize BLE if not already initialized
    // Note: iOS may show CoreBluetooth warnings about restore identifier - these are harmless
    if (!bleManagerRef.current) {
      try {
        if (__DEV__) {
          console.log("[BLE] Creating new BleManager instance");
        }
        bleManagerRef.current = new BleManager();
      } catch (error) {
        if (__DEV__) {
          console.log("[BLE] Failed to create BleManager:", error);
        }
        // If BLE is not available, silently fail and continue with manual mode
        setSensorStatus("idle");
        return;
      }
    } else {
      if (__DEV__) {
        console.log("[BLE] Reusing existing BleManager instance");
      }
    }
    
    const manager = bleManagerRef.current;
    if (!manager) {
      setSensorStatus("idle");
      return;
    }

    const run = async () => {
      try {
        // Wait for BLE to initialize - state might be "Unknown" initially
        let state = await manager.state();
        if (__DEV__) {
          console.log("[BLE] Initial state:", state);
        }
        
        // If state is Unknown, trigger permission by starting a scan
        // iOS will show permission prompt when we try to scan
        if (state === State.Unknown) {
          if (__DEV__) {
            console.log("[BLE] State is Unknown - triggering permission by starting scan...");
          }
          setSensorStatus("scanning");
          
          try {
            // Start scanning briefly to trigger permission prompt on iOS
            // Use a simple callback that doesn't interfere with later scans
            manager.startDeviceScan(null, null, (error, device) => {
              // Just receiving callback means permission was granted
              // Don't log every device to avoid spam
            });
            
            // Wait a bit for permission prompt (iOS needs time to show prompt)
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Stop the permission scan and ensure it's fully stopped
            try {
              await manager.stopDeviceScan();
              // Give it a moment to fully stop
              await new Promise(resolve => setTimeout(resolve, 300));
            } catch (e) {
              // Ignore cleanup errors
            }
            
            // Now wait for state to update after permission
            state = await new Promise<State>((resolve) => {
              let resolved = false;
              const timeout = setTimeout(() => {
                if (!resolved) {
                  resolved = true;
                  manager.state().then((s) => {
                    if (__DEV__) {
                      console.log("[BLE] Permission timeout, final state:", s);
                    }
                    resolve(s);
                  });
                }
              }, 3000);
              
              // Subscribe to state changes
              stateSubscriptionRef.current = manager.onStateChange((newState) => {
                if (__DEV__) {
                  console.log("[BLE] State changed to:", newState);
                }
                if (!resolved && (newState === State.PoweredOn || newState === State.Unauthorized || newState === State.Unsupported)) {
                  resolved = true;
                  clearTimeout(timeout);
                  if (stateSubscriptionRef.current) {
                    stateSubscriptionRef.current.remove();
                    stateSubscriptionRef.current = null;
                  }
                  resolve(newState);
                }
              });
            });
          } catch (scanError) {
            if (__DEV__) {
              console.log("[BLE] Scan error while requesting permission:", scanError);
            }
            // If scan fails, check state anyway
            state = await manager.state();
          }
        }
        
        // Wait for BLE state to become PoweredOn
        if (state !== State.PoweredOn && state !== State.Unknown) {
          if (__DEV__) {
            console.log("[BLE] Current state is", state, "- waiting for PoweredOn...");
          }
          setSensorStatus("scanning");
          
          // Wait for state to become PoweredOn (with timeout)
          state = await new Promise<State>((resolve) => {
            let resolved = false;
            const timeout = setTimeout(() => {
              if (!resolved) {
                resolved = true;
                if (__DEV__) {
                  console.log("[BLE] State change timeout after 5s, current state:", state);
                }
                resolve(state);
              }
            }, 5000);
            
            // Subscribe to state changes
            stateSubscriptionRef.current = manager.onStateChange((newState) => {
              if (__DEV__) {
                console.log("[BLE] State changed to:", newState);
              }
              if (newState === State.PoweredOn && !resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve(newState);
              } else if (newState === State.Unsupported || newState === State.Unauthorized) {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  resolve(newState);
                }
              }
            });
          });
        }
        
        if (cancelled) return;

        // Check if Bluetooth is supported and authorized
        if (state === State.Unsupported) {
          if (__DEV__) {
            console.log("[BLE] Bluetooth is not supported on this device");
          }
          setSensorStatus("idle");
          return;
        }

        if (state === State.Unauthorized) {
          if (__DEV__) {
            console.log("[BLE] Bluetooth permission not granted");
          }
          setSensorStatus("idle");
          return;
        }

        if (state !== State.PoweredOn) {
          if (__DEV__) {
            console.log("[BLE] Bluetooth not powered on, state:", state);
          }
          setSensorStatus("idle");
          return;
        }

        // Ensure we're not already scanning before starting
        await manager.stopDeviceScan().catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 200));
        
        setSensorStatus("scanning");
        if (__DEV__) {
          console.log("[BLE] Bluetooth is PoweredOn, starting scan for IMU-STACK device...");
        }

        // State subscription is already set up above, just make sure it's active for future changes
        if (!stateSubscriptionRef.current) {
          stateSubscriptionRef.current = manager.onStateChange((state) => {
            if (cancelled) return;
            if (__DEV__) {
              console.log("[BLE] State changed to:", state);
            }
            if (state !== State.PoweredOn) {
              setSensorStatus("idle");
              return;
            }
          });
        }

        // Start scanning for device
        // Try scanning by service UUID first, but also accept all devices in case UUID isn't in scan response
        try {
          // Scan all devices (some BLE devices don't advertise service UUID in scan response)
          scanSubscriptionRef.current = manager.startDeviceScan(null, null, async (error, device) => {
            if (cancelled) return;
            if (connectInFlightRef.current || deviceRef.current) return;

            if (error) {
              if (__DEV__) {
                console.log("[BLE] Scan error:", error);
              }
              // Non-critical errors, just stop scanning
              if (!cancelled && scanSubscriptionRef.current) {
                manager.stopDeviceScan().catch(() => {});
                setSensorStatus("idle");
              }
              return;
            }

            // Log all devices found (even with null names) for debugging
            if (__DEV__) {
              const deviceName = device?.name || device?.localName || "(no name)";
              const serviceUUIDs = device?.serviceUUIDs || [];
              console.log("[BLE] Found device:", deviceName, device?.id, serviceUUIDs.length > 0 ? `services: ${serviceUUIDs.join(", ")}` : "no services in scan");
            }

            // Check both name and localName for device matching
            const deviceName = device?.name || device?.localName || "";
            
            // Try to match by name first
            if (device && deviceName === "IMU-STACK") {
                connectInFlightRef.current = true;
                if (__DEV__) {
                  console.log("[BLE] ✅ IMU-STACK device found by name!", {
                    id: device.id,
                    name: deviceName,
                    serviceUUIDs: device.serviceUUIDs
                  });
                }
                if (scanTimeoutRef.current) {
                  clearTimeout(scanTimeoutRef.current);
                  scanTimeoutRef.current = null;
                }
                manager.stopDeviceScan().catch(() => {});
                try {
                  scanSubscriptionRef.current?.remove?.();
                } catch {
                  // ignore
                }
                scanSubscriptionRef.current = null;
                if (cancelled) return;

                setSensorStatus("connecting");

                try {
                  if (__DEV__) {
                    console.log("[BLE] Attempting to connect...");
                  }
                  const connectedDevice = await device.connect();
                  await connectedDevice.discoverAllServicesAndCharacteristics();
                  
                  // Verify it has the correct service after connection
                  const services = await connectedDevice.services();
                  const hasCorrectService = services.some(s => s.uuid.toLowerCase() === SERVICE_UUID_LC);
                  
                  if (!hasCorrectService) {
                    if (__DEV__) {
                      console.log("[BLE] ⚠️ Device doesn't have expected service, disconnecting...");
                    }
                    await connectedDevice.cancelConnection();
                    connectInFlightRef.current = false;
                    return;
                  }
                  
                  deviceRef.current = connectedDevice;

                  if (cancelled) {
                    await connectedDevice.cancelConnection().catch(() => {});
                    return;
                  }

                  // List all services and characteristics for debugging
                  if (__DEV__) {
                    const services = await connectedDevice.services();
                    console.log("[BLE] Services found:", services.length);
                    for (const service of services) {
                      console.log(`[BLE] Service: ${service.uuid}`);
                      const characteristics = await service.characteristics();
                      console.log(`[BLE] Characteristics: ${characteristics.length}`);
                      for (const char of characteristics) {
                        console.log(`[BLE] Characteristic: ${char.uuid}`, {
                          isNotifiable: char.isNotifiable,
                          isReadable: char.isReadable,
                          isWritableWithResponse: char.isWritableWithResponse,
                        });
                      }
                    }
                  }

                  setBleLastError(null);
                  setSensorStatus("connected");
                  if (__DEV__) {
                    console.log(`[BLE] Starting monitor on service ${SERVICE_UUID}, char ${CHAR_UUID}`);
                  }

                  // Find the exact characteristic UUIDs to subscribe to (REPS + optional LIVE)
                  const targetService =
                    services.find((s) => s.uuid.toLowerCase() === SERVICE_UUID_LC) ?? null;
                  const targetServiceUuid = targetService?.uuid ?? SERVICE_UUID;
                  let repsCharUuid = CHAR_UUID;
                  let liveCharUuid: string | null = null;
                  try {
                    if (targetService) {
                      const chars = await targetService.characteristics();
                      const repsChar = chars.find((c) => c.uuid.toLowerCase() === CHAR_UUID_LC) ?? null;
                      const liveChar = chars.find((c) => c.uuid.toLowerCase() === LIVE_CHAR_UUID_LC) ?? null;

                      if (repsChar?.uuid) repsCharUuid = repsChar.uuid;
                      if (liveChar?.uuid) liveCharUuid = liveChar.uuid;

                      if (__DEV__) {
                        console.log("[BLE] Using characteristics:", {
                          service: targetServiceUuid,
                          repsChar: repsCharUuid,
                          liveChar: liveCharUuid,
                          repsNotifiable: repsChar?.isNotifiable,
                          repsReadable: repsChar?.isReadable,
                          liveNotifiable: liveChar?.isNotifiable,
                          liveReadable: liveChar?.isReadable,
                        });
                      }
                    }
                  } catch (e) {
                    if (__DEV__) console.log("[BLE] Failed selecting characteristic:", e);
                  }

                  // Monitor REPS characteristic
                  characteristicSubscriptionRef.current = connectedDevice.monitorCharacteristicForService(
                    targetServiceUuid,
                    repsCharUuid,
                    (err, characteristic) => {
                      if (cancelled) return;

                      if (err) {
                        if (__DEV__) {
                          console.log("[BLE] Characteristic error:", err);
                        }
                        setBleLastError(typeof (err as any)?.message === "string" ? (err as any).message : "Characteristic error");
                        // Error monitoring, disconnect and reset
                        if (!cancelled) {
                          setSensorStatus("idle");
                          connectedDevice.cancelConnection().catch(() => {});
                          deviceRef.current = null;
                        }
                        return;
                      }

                      if (__DEV__ && characteristic?.value) {
                        console.log("[BLE] Characteristic update received:", characteristic.value);
                      }

                      if (!characteristic?.value) {
                        if (__DEV__) {
                          console.log("[BLE] Characteristic value is null/empty");
                        }
                        return;
                      }

                      try {
                        // Decode the characteristic value
                        const text = atob(characteristic.value); // e.g. "REPS:12\n" or just "12"
                        setBleLastText(text);
                        setBleNotifyCount((c) => c + 1);
                        setBleLastAtMs(Date.now());
                        
                        if (__DEV__) {
                          console.log("[BLE] Decoded text:", text);
                        }
                        
                        // Try multiple formats the sensor might use
                        let newReps: number | null = null;
                        
                        // Format 1: "REPS:12" or "REPS:12\n"
                        const matchReps = text.match(/REPS[:\s]*(\d+)/i);
                        if (matchReps) {
                          newReps = parseInt(matchReps[1], 10);
                          if (__DEV__) {
                            console.log("[BLE] Matched REPS format, value:", newReps);
                          }
                        } else {
                          // Format 2: Just a number "12" or "12\n"
                          const matchNumber = text.match(/(\d+)/);
                          if (matchNumber) {
                            newReps = parseInt(matchNumber[1], 10);
                            if (__DEV__) {
                              console.log("[BLE] Matched number format, value:", newReps);
                            }
                          }
                        }

                        if (newReps !== null && !isNaN(newReps)) {
                          setSensorReps(newReps);

                          // Check if this is a new rep (increment from sensor value)
                          // Use refs to get latest values in callback
                          const currentRepsNow = currentRepsRef.current;
                          const inRestPeriod = showRestDrawerRef.current;
                          
                          // If sensor sends cumulative count, we should increment when it increases
                          // If sensor sends per-rep count (1, 2, 3...), we should increment each time
                          const sensorRepDelta = newReps - lastSensorRepRef.current;
                          
                          if (__DEV__) {
                            console.log("[BLE] Rep processing:", {
                              newReps,
                              lastRep: lastSensorRepRef.current,
                              delta: sensorRepDelta,
                              currentReps: currentRepsNow,
                              targetReps: reps,
                              inRestPeriod,
                            });
                          }
                          
                          // Increment rep if:
                          // 1. Sensor value increased (delta > 0)
                          // 2. We haven't exceeded target reps for current set
                          // 3. We're not in rest period
                          if (sensorRepDelta > 0 && currentRepsNow < reps && !inRestPeriod) {
                            // If sensor sends cumulative count, increment based on delta
                            // If sensor sends each rep individually (always 1), delta will be 1
                            const repsToAdd = Math.min(sensorRepDelta, reps - currentRepsNow);
                            if (__DEV__) {
                              console.log("[BLE] Incrementing reps:", repsToAdd);
                            }
                            for (let i = 0; i < repsToAdd; i++) {
                              incrementRep();
                            }
                            lastSensorRepRef.current = newReps;
                          } else if (newReps > 0 && lastSensorRepRef.current === 0 && currentRepsNow < reps && !inRestPeriod) {
                            // First rep detection - increment once
                            if (__DEV__) {
                              console.log("[BLE] First rep detected, incrementing");
                            }
                            incrementRep();
                            lastSensorRepRef.current = newReps;
                          }
                        } else {
                          if (__DEV__) {
                            console.log("[BLE] Could not parse rep value from text:", text);
                          }
                        }
                      } catch (parseError) {
                        // Log parsing errors for debugging
                        if (__DEV__) {
                          console.log("[BLE] Parse error:", parseError, "Raw value:", characteristic.value);
                        }
                        setBleLastError("Parse error decoding BLE value");
                      }
                    }
                  );
                  if (__DEV__) {
                    console.log("[BLE] Monitor subscription started");
                  }

                  // Monitor LIVE characteristic (if present). This is optional, but useful for confirming a continuous stream.
                  if (liveCharUuid) {
                    try {
                      connectedDevice.monitorCharacteristicForService(
                        targetServiceUuid,
                        liveCharUuid,
                        (err, characteristic) => {
                          if (cancelled) return;
                          if (err) {
                            if (__DEV__) console.log("[BLE] LIVE characteristic error:", err);
                            return;
                          }
                          if (!characteristic?.value) return;
                          try {
                            const text = atob(characteristic.value);
                            setBleLiveLastText(text);
                            setBleLiveCount((c) => c + 1);
                            setBleLiveLastAtMs(Date.now());
                          } catch {
                            // ignore
                          }
                        }
                      );
                      if (__DEV__) console.log("[BLE] LIVE monitor subscription started");
                    } catch (e) {
                      if (__DEV__) console.log("[BLE] LIVE monitor failed to start:", e);
                    }
                  }

                  // One-time read (helps confirm we can access the characteristic even if notify is quiet)
                  try {
                    const initial = await connectedDevice.readCharacteristicForService(
                      targetServiceUuid,
                      repsCharUuid
                    );
                    if (initial?.value) {
                      const t = atob(initial.value);
                      setBleLastText(t);
                      setBleLastAtMs(Date.now());
                      if (__DEV__) console.log("[BLE] Initial read decoded:", t);
                    }
                  } catch (e: any) {
                    if (__DEV__) console.log("[BLE] Initial read failed:", e);
                  }

                  // Fallback: if notifications never arrive, poll-read periodically (dev safety net)
                  if (readPollIntervalRef.current) {
                    clearInterval(readPollIntervalRef.current);
                    readPollIntervalRef.current = null;
                  }
                  readPollIntervalRef.current = setInterval(async () => {
                    try {
                      if (cancelled) return;
                      if (!deviceRef.current) return;
                      const c = await deviceRef.current.readCharacteristicForService(
                        targetServiceUuid,
                        repsCharUuid
                      );
                      if (!c?.value) return;
                      const t = atob(c.value);
                      setBleLastText(t);
                      setBleLastAtMs(Date.now());
                      // Do NOT increment notify count here (separate from notify)
                      const matchReps = t.match(/REPS[:\s]*(\d+)/i);
                      const matchNumber = t.match(/(\d+)/);
                      const parsed =
                        matchReps?.[1] ? parseInt(matchReps[1], 10) : matchNumber?.[1] ? parseInt(matchNumber[1], 10) : NaN;
                      if (!Number.isFinite(parsed)) return;
                      setSensorReps(parsed);
                      const currentRepsNow = currentRepsRef.current;
                      const inRestPeriod = showRestDrawerRef.current;
                      const delta = parsed - lastSensorRepRef.current;
                      if (delta > 0 && currentRepsNow < reps && !inRestPeriod) {
                        const repsToAdd = Math.min(delta, reps - currentRepsNow);
                        for (let i = 0; i < repsToAdd; i++) incrementRep();
                        lastSensorRepRef.current = parsed;
                      } else if (parsed > 0 && lastSensorRepRef.current === 0 && currentRepsNow < reps && !inRestPeriod) {
                        incrementRep();
                        lastSensorRepRef.current = parsed;
                      }
                    } catch {
                      // ignore
                    }
                  }, 750);
                } catch (connectError: any) {
                  if (__DEV__) {
                    console.log("[BLE] Connection error:", connectError);
                  }
                  setBleLastError(typeof connectError?.message === "string" ? connectError.message : "Connection error");
                  if (!cancelled) {
                    setSensorStatus("idle");
                  }
                  connectInFlightRef.current = false;
              }
            }
          });

          // Stop scan after 30 seconds if no device found
          scanTimeoutRef.current = setTimeout(() => {
            if (!cancelled) {
              manager.stopDeviceScan().catch(() => {});
              if (__DEV__) {
                console.log("[BLE] ⚠️ Scan timeout - IMU-STACK device not found after 30s.");
              }
              setSensorStatus((prev) => (prev === "scanning" ? "idle" : prev));
            }
          }, 30000);
        } catch (scanError) {
          if (__DEV__) {
            console.log("[BLE] Failed to start scan:", scanError);
          }
          if (!cancelled) {
            setSensorStatus("idle");
          }
        }
      } catch (error: any) {
        if (__DEV__) {
          console.log("[BLE] Error in run:", error);
        }
        if (!cancelled) {
          setSensorStatus("idle");
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      lastSensorRepRef.current = 0;
      connectInFlightRef.current = false;
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
      if (readPollIntervalRef.current) {
        clearInterval(readPollIntervalRef.current);
        readPollIntervalRef.current = null;
      }

      // Clean up subscriptions
      try {
        if (characteristicSubscriptionRef.current) {
          characteristicSubscriptionRef.current.remove?.();
          characteristicSubscriptionRef.current = null;
        }
        if (scanSubscriptionRef.current) {
          scanSubscriptionRef.current.remove?.();
          scanSubscriptionRef.current = null;
        }
        if (stateSubscriptionRef.current) {
          stateSubscriptionRef.current.remove?.();
          stateSubscriptionRef.current = null;
        }
      } catch {
        // Ignore cleanup errors
      }

      // Disconnect and cleanup
      if (deviceRef.current) {
        deviceRef.current.cancelConnection().catch(() => {});
        deviceRef.current = null;
      }

      if (bleManagerRef.current) {
        try {
          bleManagerRef.current.stopDeviceScan().catch(() => {});
        } catch {
          // Ignore stop scan errors
        }
        // Don't destroy the manager, just stop scanning
        // The manager will be reused or cleaned up on unmount
      }
    };
  }, [showRestDrawer, isAllSetsComplete]);

  // Cleanup BLE manager on unmount
  useEffect(() => {
    return () => {
      if (bleManagerRef.current) {
        try {
          bleManagerRef.current.stopDeviceScan().catch(() => {});
          bleManagerRef.current.destroy();
        } catch {
          // Ignore cleanup errors
        }
        bleManagerRef.current = null;
      }
      if (deviceRef.current) {
        deviceRef.current.cancelConnection().catch(() => {});
        deviceRef.current = null;
      }
    };
  }, []);

  // Format timer as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Navigate to history when all sets are complete
  useEffect(() => {
    if (isAllSetsComplete && userId) {
      // Save workout data
      const duration = Math.floor((Date.now() - sessionStartTimeRef.current) / 1000);
      saveWorkout(
        {
          machineName,
          sets,
          reps,
          setRepsCompleted: [...setRepsCompleted],
          setRestTimes: [...setRestTimes],
          duration,
        },
        userId
      ).then(() => {
        // Small delay to show completion state
        setTimeout(() => {
          router.replace("/(tabs)/two");
        }, 500);
      });
    }
  }, [isAllSetsComplete, machineName, sets, reps, userId, setRepsCompleted, setRestTimes]);

  // Start/stop rest timer
  useEffect(() => {
    if (showRestDrawer) {
      restStartTimeRef.current = Date.now();
      setRestTimer(0);
      restTimerIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - restStartTimeRef.current) / 1000);
        setRestTimer(elapsed);
      }, 1000);
    } else {
      if (restTimerIntervalRef.current) {
        clearInterval(restTimerIntervalRef.current);
        restTimerIntervalRef.current = null;
      }
    }

    return () => {
      if (restTimerIntervalRef.current) {
        clearInterval(restTimerIntervalRef.current);
      }
    };
  }, [showRestDrawer]);

  const incrementRep = () => {
    if (isAllSetsComplete) return;

    // Configure smooth animation
    LayoutAnimation.configureNext({
      duration: 300,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.spring,
        springDamping: 0.7,
      },
    });

    setSetRepsCompleted((prev) => {
      const next = [...prev];
      if (next[currentSetIndex] < reps) {
        next[currentSetIndex] = next[currentSetIndex] + 1;
      }
      return next;
    });

    // Show rest drawer if set is complete and not last set
    if (currentReps + 1 >= reps && currentSetIndex < sets - 1) {
      setShowRestDrawer(true);
      // Reset sensor rep counter for next set
      lastSensorRepRef.current = 0;
      setSensorReps(0);
    }
  };

  const continueToNextSet = () => {
    // Save the rest time for the completed set
    setSetRestTimes((prev) => {
      const next = [...prev];
      next[currentSetIndex] = restTimer;
      return next;
    });
    setShowRestDrawer(false);
    setCurrentSetIndex((prev) => prev + 1);
    // Reset sensor rep counter for next set
    lastSensorRepRef.current = 0;
    setSensorReps(0);
    currentRepsRef.current = 0;
  };

  // Update rest drawer ref when it changes
  useEffect(() => {
    showRestDrawerRef.current = showRestDrawer;
  }, [showRestDrawer]);

  // Update current reps ref when it changes
  useEffect(() => {
    currentRepsRef.current = currentReps;
  }, [currentReps]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <RNView style={styles.top}>
        <RNView style={styles.setsContainer}>
          {setBars.map((setNum, index) => {
            const completedReps = setRepsCompleted[index] || 0;
            const isComplete = completedReps >= reps;
            // Rest time is stored for the set that just completed
            const restTime = setRestTimes[index] || 0;
            const showRestTime = isComplete && restTime > 0;

            return (
              <RNView key={setNum} style={styles.setBarWrapper}>
                <Text style={[styles.setRepsLabel, { color: theme.textSecondary }]}>
                  {completedReps} / {reps}
                </Text>
                <RNView
                  style={[
                    styles.setBarContainer,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <RNView
                    style={[
                      styles.setBarFill,
                      {
                        width: `${Math.min(100, (completedReps / reps) * 100)}%`,
                        backgroundColor: theme.success,
                      },
                    ]}
                  />
                </RNView>
                {showRestTime ? (
                  <Text style={[styles.restTimeLabel, { color: theme.textSecondary }]}>
                    Rest: {formatTime(restTime)}
                  </Text>
                ) : (
                  <RNView style={styles.restTimePlaceholder} />
                )}
              </RNView>
            );
          })}
        </RNView>
      </RNView>
      <RNView style={styles.container}>
        <Text style={[styles.machineName, { color: theme.textSecondary }]}>{machineName}</Text>
        {sensorStatus === "connected" && (
          <RNView style={styles.sensorStatusRow}>
            <Text style={[styles.sensorStatus, { color: theme.success }]}>
              Sensor Connected
            </Text>
            {sensorReps > 0 && (
              <Text style={[styles.sensorReps, { color: theme.textSecondary }]}>
                Sensor: {sensorReps}
              </Text>
            )}
          </RNView>
        )}
        {sensorStatus === "scanning" && (
          <Text style={[styles.sensorStatus, { color: theme.textSecondary }]}>
            Scanning for sensor...
          </Text>
        )}
        {sensorStatus === "connecting" && (
          <Text style={[styles.sensorStatus, { color: theme.textSecondary }]}>
            Connecting...
          </Text>
        )}
        {sensorStatus === "idle" && (
          <Text style={[styles.sensorStatus, { color: theme.textSecondary }]}>
            BLE: Ready (not scanning)
          </Text>
        )}
        {sensorStatus === "error" && (
          <Text style={[styles.sensorStatus, { color: theme.danger }]}>
            BLE: Error
          </Text>
        )}

        {/* Dev-only BLE debug */}
        {__DEV__ ? (
          <RNView style={{ marginTop: 6, alignItems: "center", gap: 4 }}>
            <Text style={[styles.sensorStatus, { color: theme.textSecondary }]}>
              Notifies: {bleNotifyCount}
              {bleLastAtMs ? ` · last ${Math.round((Date.now() - bleLastAtMs) / 1000)}s ago` : ""}
            </Text>
            {bleLastText ? (
              <Text style={[styles.sensorStatus, { color: theme.textSecondary }]}>
                Last: {bleLastText.trim()}
              </Text>
            ) : null}
            <Text style={[styles.sensorStatus, { color: theme.textSecondary }]}>
              LIVE: {bleLiveCount}
              {bleLiveLastAtMs ? ` · last ${Math.round((Date.now() - bleLiveLastAtMs) / 1000)}s ago` : ""}
            </Text>
            {bleLiveLastText ? (
              <Text style={[styles.sensorStatus, { color: theme.textSecondary }]}>
                LiveLast: {bleLiveLastText.trim()}
              </Text>
            ) : null}
            {bleLastError ? (
              <Text style={[styles.sensorStatus, { color: theme.danger }]}>
                {bleLastError}
              </Text>
            ) : null}
          </RNView>
        ) : null}

        <RNView style={styles.repCounter}>
          <Text style={[styles.repNumber, { color: theme.text }]}>{currentReps}</Text>
        </RNView>
        <Pressable
          onPress={incrementRep}
          disabled={isAllSetsComplete}
          style={({ pressed }) => [
            styles.incrementButton,
            {
              backgroundColor: isAllSetsComplete ? theme.card : theme.accent,
              opacity: pressed ? 0.85 : isAllSetsComplete ? 0.5 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.incrementButtonText,
              { color: isAllSetsComplete ? theme.textSecondary : "#fff" },
            ]}
          >
            {isAllSetsComplete ? "Complete" : "+1 Rep"}
          </Text>
        </Pressable>
      </RNView>
      <RNView style={styles.bottom}>
        <SlideToConfirm
          label="End Session Early"
          onComplete={() => router.push("/workout/summary")}
          variant="danger"
        />
      </RNView>

      <Modal
        visible={showRestDrawer}
        transparent
        animationType="slide"
        onRequestClose={() => {}} // Prevent closing on Android back button
      >
        <RNView style={styles.modalOverlay}>
          <RNView style={[styles.drawer, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <RNView style={styles.drawerHandle} />
            <Text style={[styles.drawerTitle, { color: theme.text }]}>Rest Period</Text>
            <Text style={[styles.drawerSubtitle, { color: theme.textSecondary }]}>
              Set {currentSetIndex + 1} Complete
            </Text>
            
            <RNView style={styles.timerContainer}>
              <Text style={[styles.timerText, { color: theme.accent }]}>{formatTime(restTimer)}</Text>
            </RNView>

            <Pressable
              onPress={continueToNextSet}
              style={({ pressed }) => [
                styles.continueButton,
                {
                  backgroundColor: theme.primary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[styles.continueButtonText, { color: theme.background }]}>Continue</Text>
      </Pressable>
          </RNView>
        </RNView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  top: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  setsContainer: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
  },
  setBarWrapper: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  setRepsLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  setBarContainer: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    overflow: "hidden",
  },
  setBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  restTimeLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 4,
    minHeight: 14,
  },
  restTimePlaceholder: {
    height: 14,
    marginTop: 4,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  machineName: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  repCounter: {
    alignItems: "center",
    justifyContent: "center",
  },
  repNumber: {
    fontSize: 72,
    fontWeight: "800",
    letterSpacing: -2,
  },
  incrementButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    minWidth: 140,
    alignItems: "center",
    justifyContent: "center",
  },
  incrementButtonText: {
    fontSize: 16,
    fontWeight: "800",
  },
  bottom: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  drawer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingTop: 12,
    paddingBottom: 34,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  drawerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#9CA3AF",
    marginBottom: 20,
  },
  drawerTitle: {
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 6,
  },
  drawerSubtitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 32,
  },
  timerContainer: {
    marginBottom: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  timerText: {
    fontSize: 48,
    fontWeight: "800",
    letterSpacing: 2,
  },
  continueButton: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: "800",
  },
  sensorStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: -8,
  },
  sensorStatus: {
    fontSize: 12,
    fontWeight: "600",
  },
  sensorReps: {
    fontSize: 11,
    fontWeight: "500",
  },
});