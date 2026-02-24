import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, LayoutAnimation, Modal, Pressable, StyleSheet, UIManager, View as RNView, Platform } from "react-native";
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
import { useBleConnection } from "@/contexts/BleConnectionContext";
import { useBleConnectToSensor } from "@/hooks/useBleConnectToSensor";

const SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
const CHAR_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";
const LIVE_CHAR_UUID = "6E400004-B5A3-F393-E0A9-E50E24DCCA9E";
const SERVICE_UUID_LC = SERVICE_UUID.toLowerCase();
const CHAR_UUID_LC = CHAR_UUID.toLowerCase();
const LIVE_CHAR_UUID_LC = LIVE_CHAR_UUID.toLowerCase();

export default function Session() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];
  const params = useLocalSearchParams<{
    sets?: string;
    reps?: string;
    machine?: string;
    sensorName?: string;
    sensorMac?: string;
  }>();

  const targetSensorName = params.sensorName?.trim() || "IMU-STACK";
  const targetSensorMac = params.sensorMac?.trim() || undefined;

  const sets = useMemo(() => {
    const parsed = params.sets ? parseInt(params.sets, 10) : 3;
    return isNaN(parsed) || parsed < 1 ? 3 : Math.min(20, parsed);
  }, [params.sets]);

  const reps = useMemo(() => {
    const parsed = params.reps ? parseInt(params.reps, 10) : 10;
    return isNaN(parsed) || parsed < 1 ? 10 : Math.min(50, parsed);
  }, [params.reps]);

  const machineName = params.machine || "Machine";
  const { device: preConnectedDevice, manager: preConnectedManager, clearPreConnected } = useBleConnection();
  const {
    device: retryDevice,
    status: retryStatus,
    error: retryError,
    connect: retryConnect,
    manager: retryManager,
  } = useBleConnectToSensor(targetSensorName, targetSensorMac);

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
  const [sensorStatus, setSensorStatus] = useState<"idle" | "need_scan" | "scanning" | "connecting" | "connected" | "error">("idle");
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
  const hadDeviceRef = useRef(false);

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

    // Use pre-connected device from NFC flow (connecting screen)
    if (preConnectedDevice && preConnectedManager) {
      hadDeviceRef.current = true;
      clearPreConnected();
      bleManagerRef.current = preConnectedManager;
      deviceRef.current = preConnectedDevice;
      setBleLastError(null);
      setSensorStatus("connected");
      let setupCancelled = false;
      (async () => {
        try {
          const services = await preConnectedDevice.services();
          const targetService =
            services.find((s) => s.uuid.toLowerCase() === SERVICE_UUID_LC) ?? null;
          const targetServiceUuid = targetService?.uuid ?? SERVICE_UUID;
          let repsCharUuid = CHAR_UUID;
          let liveCharUuid: string | null = null;
          if (targetService) {
            const chars = await targetService.characteristics();
            const repsChar = chars.find((c) => c.uuid.toLowerCase() === CHAR_UUID_LC) ?? null;
            const liveChar = chars.find((c) => c.uuid.toLowerCase() === LIVE_CHAR_UUID_LC) ?? null;
            if (repsChar?.uuid) repsCharUuid = repsChar.uuid;
            if (liveChar?.uuid) liveCharUuid = liveChar.uuid;
          }
          if (setupCancelled) return;
          characteristicSubscriptionRef.current = preConnectedDevice.monitorCharacteristicForService(
            targetServiceUuid,
            repsCharUuid,
            (err, characteristic) => {
              if (setupCancelled) return;
              if (err) {
                setBleLastError(typeof (err as any)?.message === "string" ? (err as any).message : "Characteristic error");
                if (!setupCancelled) {
                  setSensorStatus("idle");
                  preConnectedDevice.cancelConnection().catch(() => {});
                  deviceRef.current = null;
                }
                return;
              }
              if (!characteristic?.value) return;
              try {
                const text = atob(characteristic.value);
                setBleLastText(text);
                setBleNotifyCount((c) => c + 1);
                setBleLastAtMs(Date.now());
                let newReps: number | null = null;
                const matchReps = text.match(/REPS[:\s]*(\d+)/i);
                if (matchReps) {
                  newReps = parseInt(matchReps[1], 10);
                } else {
                  const matchNumber = text.match(/(\d+)/);
                  if (matchNumber) newReps = parseInt(matchNumber[1], 10);
                }
                if (newReps !== null && !isNaN(newReps)) {
                  setSensorReps(newReps);
                  const currentRepsNow = currentRepsRef.current;
                  const inRestPeriod = showRestDrawerRef.current;
                  const sensorRepDelta = newReps - lastSensorRepRef.current;
                  if (sensorRepDelta > 0 && currentRepsNow < reps && !inRestPeriod) {
                    const repsToAdd = Math.min(sensorRepDelta, reps - currentRepsNow);
                    for (let i = 0; i < repsToAdd; i++) incrementRep();
                    lastSensorRepRef.current = newReps;
                  } else if (newReps > 0 && lastSensorRepRef.current === 0 && currentRepsNow < reps && !inRestPeriod) {
                    incrementRep();
                    lastSensorRepRef.current = newReps;
                  }
                }
              } catch {
                setBleLastError("Parse error decoding BLE value");
              }
            }
          );
          if (liveCharUuid) {
            preConnectedDevice.monitorCharacteristicForService(
              targetServiceUuid,
              liveCharUuid,
              (err, characteristic) => {
                if (setupCancelled || err || !characteristic?.value) return;
                try {
                  const text = atob(characteristic.value);
                  setBleLiveLastText(text);
                  setBleLiveCount((c) => c + 1);
                  setBleLiveLastAtMs(Date.now());
                } catch {}
              }
            );
          }
          try {
            const initial = await preConnectedDevice.readCharacteristicForService(targetServiceUuid, repsCharUuid);
            if (initial?.value) {
              setBleLastText(atob(initial.value));
              setBleLastAtMs(Date.now());
            }
          } catch {}
          readPollIntervalRef.current = setInterval(async () => {
            try {
              if (setupCancelled || !deviceRef.current) return;
              const c = await preConnectedDevice.readCharacteristicForService(targetServiceUuid, repsCharUuid);
              if (!c?.value) return;
              const t = atob(c.value);
              setBleLastText(t);
              setBleLastAtMs(Date.now());
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
            } catch {}
          }, 750);
        } catch (e: any) {
          setSensorStatus("idle");
          setBleLastError(e?.message ?? "Setup failed");
          preConnectedDevice.cancelConnection().catch(() => {});
          deviceRef.current = null;
        }
      })();
      return () => {
        setupCancelled = true;
        if (readPollIntervalRef.current) {
          clearInterval(readPollIntervalRef.current);
          readPollIntervalRef.current = null;
        }
        try {
          characteristicSubscriptionRef.current?.remove?.();
        } catch {}
        characteristicSubscriptionRef.current = null;
        if (deviceRef.current) {
          deviceRef.current.cancelConnection().catch(() => {});
          deviceRef.current = null;
        }
      };
    }

    // No pre-connected device: require NFC scan or show retry if we had one and lost it
    setSensorStatus(hadDeviceRef.current ? "error" : "need_scan");
    return;
  }, [
    showRestDrawer,
    isAllSetsComplete,
    preConnectedDevice,
    preConnectedManager,
    clearPreConnected,
    reps,
  ]);

  // Retry flow: when sensorStatus is "error" and retry succeeds (retryDevice set), set up monitoring
  useEffect(() => {
    if (sensorStatus !== "error") return;
    if (!retryDevice || !retryManager) return;
    hadDeviceRef.current = true;
    deviceRef.current = retryDevice;
    bleManagerRef.current = retryManager;
    setBleLastError(null);
    setSensorStatus("connected");
    let setupCancelled = false;
    (async () => {
      try {
        const services = await retryDevice.services();
        const targetService =
          services.find((s) => s.uuid.toLowerCase() === SERVICE_UUID_LC) ?? null;
        const targetServiceUuid = targetService?.uuid ?? SERVICE_UUID;
        let repsCharUuid = CHAR_UUID;
        let liveCharUuid: string | null = null;
        if (targetService) {
          const chars = await targetService.characteristics();
          const repsChar = chars.find((c) => c.uuid.toLowerCase() === CHAR_UUID_LC) ?? null;
          const liveChar = chars.find((c) => c.uuid.toLowerCase() === LIVE_CHAR_UUID_LC) ?? null;
          if (repsChar?.uuid) repsCharUuid = repsChar.uuid;
          if (liveChar?.uuid) liveCharUuid = liveChar.uuid;
        }
        if (setupCancelled) return;
        characteristicSubscriptionRef.current = retryDevice.monitorCharacteristicForService(
          targetServiceUuid,
          repsCharUuid,
          (err, characteristic) => {
            if (setupCancelled) return;
            if (err) {
              setBleLastError(typeof (err as any)?.message === "string" ? (err as any).message : "Characteristic error");
              setSensorStatus("error");
              retryDevice.cancelConnection().catch(() => {});
              deviceRef.current = null;
              return;
            }
            if (!characteristic?.value) return;
            try {
              const text = atob(characteristic.value);
              setBleLastText(text);
              setBleNotifyCount((c) => c + 1);
              setBleLastAtMs(Date.now());
              let newReps: number | null = null;
              const matchReps = text.match(/REPS[:\s]*(\d+)/i);
              if (matchReps) newReps = parseInt(matchReps[1], 10);
              else {
                const matchNumber = text.match(/(\d+)/);
                if (matchNumber) newReps = parseInt(matchNumber[1], 10);
              }
              if (newReps !== null && !isNaN(newReps)) {
                setSensorReps(newReps);
                const currentRepsNow = currentRepsRef.current;
                const inRestPeriod = showRestDrawerRef.current;
                const sensorRepDelta = newReps - lastSensorRepRef.current;
                if (sensorRepDelta > 0 && currentRepsNow < reps && !inRestPeriod) {
                  const repsToAdd = Math.min(sensorRepDelta, reps - currentRepsNow);
                  for (let i = 0; i < repsToAdd; i++) incrementRep();
                  lastSensorRepRef.current = newReps;
                } else if (newReps > 0 && lastSensorRepRef.current === 0 && currentRepsNow < reps && !inRestPeriod) {
                  incrementRep();
                  lastSensorRepRef.current = newReps;
                }
              }
            } catch {
              setBleLastError("Parse error decoding BLE value");
            }
          }
        );
        if (liveCharUuid) {
          retryDevice.monitorCharacteristicForService(
            targetServiceUuid,
            liveCharUuid,
            (err, characteristic) => {
              if (setupCancelled || err || !characteristic?.value) return;
              try {
                const text = atob(characteristic.value);
                setBleLiveLastText(text);
                setBleLiveCount((c) => c + 1);
                setBleLiveLastAtMs(Date.now());
              } catch {}
            }
          );
        }
        try {
          const initial = await retryDevice.readCharacteristicForService(targetServiceUuid, repsCharUuid);
          if (initial?.value) {
            setBleLastText(atob(initial.value));
            setBleLastAtMs(Date.now());
          }
        } catch {}
        readPollIntervalRef.current = setInterval(async () => {
          try {
            if (setupCancelled || !deviceRef.current) return;
            const c = await retryDevice.readCharacteristicForService(targetServiceUuid, repsCharUuid);
            if (!c?.value) return;
            const t = atob(c.value);
            setBleLastText(t);
            setBleLastAtMs(Date.now());
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
          } catch {}
        }, 750);
      } catch (e: any) {
        setSensorStatus("error");
        setBleLastError(e?.message ?? "Setup failed");
        retryDevice.cancelConnection().catch(() => {});
        deviceRef.current = null;
      }
    })();
    return () => {
      setupCancelled = true;
      if (readPollIntervalRef.current) {
        clearInterval(readPollIntervalRef.current);
        readPollIntervalRef.current = null;
      }
      try {
        characteristicSubscriptionRef.current?.remove?.();
      } catch {}
      characteristicSubscriptionRef.current = null;
    };
  }, [sensorStatus, retryDevice, retryManager, reps]);

  // Cleanup BLE manager on unmount - MOVED UP (old fallback scan removed)
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

  if (sensorStatus === "need_scan") {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <RNView style={styles.retryContainer}>
          <Text style={[styles.retryTitle, { color: theme.text }]}>Scan NFC first</Text>
          <Text style={[styles.retrySubtitle, { color: theme.textSecondary }]}>
            Tap the NFC tag on the machine to connect to its sensor, then start your session.
          </Text>
          <Pressable
            onPress={() => router.replace("/workout/nfc")}
            style={({ pressed }) => [
              styles.retryButton,
              { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.retryButtonText, { color: theme.background }]}>Scan NFC</Text>
          </Pressable>
        </RNView>
      </SafeAreaView>
    );
  }

  if (sensorStatus === "error") {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <RNView style={styles.retryContainer}>
          <Text style={[styles.retryTitle, { color: theme.text }]}>Connection lost</Text>
          <Text style={[styles.retrySubtitle, { color: theme.textSecondary }]}>
            {bleLastError || retryError || "The sensor disconnected. Make sure it's on and nearby."}
          </Text>
          {(retryStatus === "scanning" || retryStatus === "connecting") ? (
            <RNView style={styles.retryButton}>
              <ActivityIndicator size="small" color={theme.background} />
              <Text style={[styles.retryButtonText, { color: theme.background }]}>
                {retryStatus === "scanning" ? "Searching…" : "Connecting…"}
              </Text>
            </RNView>
          ) : (
            <Pressable
              onPress={() => retryConnect()}
              style={({ pressed }) => [
                styles.retryButton,
                { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={[styles.retryButtonText, { color: theme.background }]}>Retry</Text>
            </Pressable>
          )}
        </RNView>
      </SafeAreaView>
    );
  }

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
            Resting
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
  retryContainer: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  retryTitle: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  retrySubtitle: {
    fontSize: 15,
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 22,
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
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