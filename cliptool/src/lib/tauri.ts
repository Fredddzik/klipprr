// src/lib/tauri.ts

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function getTauriInvoke(): InvokeFn | null {
  // Tauri v2 injects __TAURI__ on window in desktop builds
  const w = window as any;
  if (w && w.__TAURI__ && typeof w.__TAURI__.invoke === "function") {
    return w.__TAURI__.invoke.bind(w.__TAURI__);
  }
  return null;
}

export async function tauriInvoke<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T | null> {
  if (typeof window === "undefined") return null;

  const invoke = getTauriInvoke();
  if (!invoke) {
    // Browser / non-Tauri environment
    return null;
  }

  try {
    return await invoke<T>(command, args);
  } catch (err) {
    console.error("[tauriInvoke] invoke failed:", err);
    return null;
  }
}