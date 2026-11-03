import { useEffect, useState } from 'react';
import type { Device } from '../worker/models';

/** Best-guess inference device, detected on the main thread so the worker is not spawned early. */
export function useDevice(): Device {
  const [device, setDevice] = useState<Device>('wasm');
  useEffect(() => {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return;
    let alive = true;
    gpu
      .requestAdapter()
      .then((adapter) => alive && adapter && setDevice('webgpu'))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return device;
}
