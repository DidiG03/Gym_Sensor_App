import { useCallback, useEffect, useRef, useState } from "react";
import { BleManager, Device, State } from "react-native-ble-plx";

const SERVICE_UUID_LC = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";

export type ConnectStatus = "idle" | "scanning" | "connecting" | "connected" | "error";

export function useBleConnectToSensor(sensorName: string, sensorMac?: string | null) {
  const [status, setStatus] = useState<ConnectStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [manager, setManager] = useState<BleManager | null>(null);
  const managerRef = useRef<BleManager | null>(null);
  const connectInFlightRef = useRef(false);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const targetName = sensorName?.trim() || "IMU-STACK";
  const targetMac = sensorMac?.trim() || undefined;

  const connect = useCallback(async () => {
    if (connectInFlightRef.current) return;

    let cancelled = false;
    connectInFlightRef.current = true;
    setError(null);
    setDevice(null);
    setStatus("scanning");

    if (!managerRef.current) {
      try {
        const m = new BleManager();
        managerRef.current = m;
        setManager(m);
      } catch (e: any) {
        setStatus("error");
        setError(e?.message ?? "Failed to init BLE");
        connectInFlightRef.current = false;
        return;
      }
    }

    const manager = managerRef.current;

    const cleanup = () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
      manager.stopDeviceScan().catch(() => {});
    };

    try {
      let state = await manager.state();
      if (state === State.Unknown) {
        manager.startDeviceScan(null, null, () => {});
        await new Promise((r) => setTimeout(r, 2000));
        await manager.stopDeviceScan();
        await new Promise((r) => setTimeout(r, 300));
        state = await manager.state();
      }

      if (state !== State.PoweredOn && state !== State.Unknown) {
        state = await new Promise<State>((resolve) => {
          const t = setTimeout(() => resolve(state), 5000);
          manager.onStateChange((s) => {
            if (s === State.PoweredOn) {
              clearTimeout(t);
              resolve(s);
            }
          });
        });
      }

      if (cancelled) return;
      if (state === State.Unsupported || state === State.Unauthorized) {
        setStatus("error");
        setError("Bluetooth not available");
        connectInFlightRef.current = false;
        return;
      }
      if (state !== State.PoweredOn) {
        setStatus("error");
        setError("Bluetooth not powered on");
        connectInFlightRef.current = false;
        return;
      }

      await manager.stopDeviceScan();
      await new Promise((r) => setTimeout(r, 200));

      setStatus("scanning");

      await new Promise<void>((resolve, reject) => {
        const subscription = manager.startDeviceScan(null, null, async (err, d) => {
          if (cancelled) return;
          if (connectInFlightRef.current === false) return;
          if (err) {
            cleanup();
            setStatus("error");
            setError(err.message ?? "Scan error");
            resolve();
            return;
          }

          const deviceName = d?.name || d?.localName || "";
          const deviceId = d?.id ?? "";
          const matchesMac =
            targetMac &&
            (deviceId === targetMac || deviceId?.toLowerCase() === targetMac.toLowerCase());
          const matchesName =
            !targetMac &&
            (deviceName === targetName ||
              deviceName?.toLowerCase() === targetName.toLowerCase());
          const matches = d && (matchesMac || matchesName);

          if (matches) {
            connectInFlightRef.current = false;
            cleanup();
            try {
              subscription?.remove?.();
            } catch {}
            manager.stopDeviceScan();

            setStatus("connecting");
            try {
              const connected = await d!.connect();
              await connected.discoverAllServicesAndCharacteristics();
              const services = await connected.services();
              const hasService = services.some(
                (s) => s.uuid.toLowerCase() === SERVICE_UUID_LC
              );
              if (!hasService) {
                await connected.cancelConnection();
                setStatus("error");
                setError("Device missing expected service");
                resolve();
                return;
              }
              if (cancelled) {
                await connected.cancelConnection();
                resolve();
                return;
              }
              setDevice(connected);
              setStatus("connected");
            } catch (e: any) {
              setStatus("error");
              setError(e?.message ?? "Connection failed");
            }
            resolve();
          }
        });

        scanTimeoutRef.current = setTimeout(() => {
          if (connectInFlightRef.current) {
            connectInFlightRef.current = false;
            cleanup();
            try {
              subscription?.remove?.();
            } catch {}
            manager.stopDeviceScan();
            setStatus("error");
            setError("Sensor not found. Make sure it's on and nearby.");
          }
          resolve();
        }, 30000);
      });
    } catch (e: any) {
      setStatus("error");
      setError(e?.message ?? "Connection failed");
    } finally {
      connectInFlightRef.current = false;
    }
  }, [targetName, targetMac]);

  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
      managerRef.current?.stopDeviceScan().catch(() => {});
    };
  }, []);

  return { device, status, error, connect, manager };
}
