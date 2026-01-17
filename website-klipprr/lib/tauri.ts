export async function tauriInvoke(
  command: string,
  args?: Record<string, any>
) {
  if (typeof window === "undefined") return null;

  // @ts-ignore
  const w = window as any;

  if (!w.__TAURI__ || !w.__TAURI__.invoke) {
    return null; // Not running inside Tauri
  }

  return await w.__TAURI__.invoke(command, args);
}