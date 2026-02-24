import React, { createContext, useCallback, useContext, useState } from "react";
import type { BleManager, Device } from "react-native-ble-plx";

type BleConnectionState = {
  device: Device | null;
  manager: BleManager | null;
  machine: string | null;
  sensorName: string | null;
  sensorMac: string | null;
};

type BleConnectionContextValue = BleConnectionState & {
  setPreConnected: (device: Device, manager: BleManager, machine: string, sensorName: string, sensorMac: string) => void;
  clearPreConnected: () => void;
};

const initialState: BleConnectionState = {
  device: null,
  manager: null,
  machine: null,
  sensorName: null,
  sensorMac: null,
};

const BleConnectionContext = createContext<BleConnectionContextValue | null>(null);

export function BleConnectionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BleConnectionState>(initialState);

  const setPreConnected = useCallback(
    (device: Device, manager: BleManager, machine: string, sensorName: string, sensorMac: string) => {
      setState({ device, manager, machine, sensorName, sensorMac });
    },
    []
  );

  const clearPreConnected = useCallback(() => {
    setState(initialState);
  }, []);

  const value: BleConnectionContextValue = {
    ...state,
    setPreConnected,
    clearPreConnected,
  };

  return (
    <BleConnectionContext.Provider value={value}>
      {children}
    </BleConnectionContext.Provider>
  );
}

export function useBleConnection() {
  const ctx = useContext(BleConnectionContext);
  if (!ctx) throw new Error("useBleConnection must be used within BleConnectionProvider");
  return ctx;
}
