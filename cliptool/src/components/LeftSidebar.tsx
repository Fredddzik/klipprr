"use client";

interface LeftSidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  email: string | null;
  plan: "Free" | "Pro" | "Max";
  accountLoading: boolean;
  isTauri: boolean;
  updateStatus: "idle" | "checking" | "latest" | "available" | "downloading" | "error";
  updateInfo: { version: string; body?: string } | null;
  onSync: () => void;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
  onLogout: () => void;
  onLogin: () => void;
  onOpenSettings?: () => void;
  usage?: { used: number; limit: number; remaining: number } | null;
}

function initials(email: string | null): string {
  if (!email) return "?";
  const parts = email.replace(/@.*/, "").split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

export default function LeftSidebar({
  collapsed,
  onToggleCollapsed,
  email,
  plan,
  accountLoading,
  isTauri,
  updateStatus,
  updateInfo,
  onSync,
  onCheckForUpdates,
  onInstallUpdate,
  onLogout,
  onLogin,
  onOpenSettings,
  usage,
}: LeftSidebarProps) {
  const isPaid = plan === "Pro" || plan === "Max";

  return (
    <aside
      className={`fixed left-0 top-0 z-40 h-full flex flex-col bg-zinc-950 border-r border-zinc-800 transition-[width] duration-200 ${
        collapsed ? "w-[72px]" : "w-64"
      }`}
    >
      {/* Logo + collapse */}
      <div className="flex items-center justify-between h-14 px-3 border-b border-zinc-800 shrink-0">
        {collapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="w-10 h-10 rounded flex items-center justify-center hover:bg-zinc-800 transition"
            aria-label="Expand sidebar"
          >
            <img src="/logo-transparent.png" alt="" className="h-7 w-7 object-contain" />
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <img src="/logo-transparent.png" alt="" className="h-7 w-7 object-contain" />
              <span className="font-semibold text-white text-base tracking-tight">Klipprr</span>
            </div>
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition"
              aria-label="Collapse sidebar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
              </svg>
            </button>
          </>
        )}
      </div>

      {!collapsed && (
        <>
          <nav className="p-2 space-y-0.5 shrink-0">
            <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-3 py-2">
              Menu
            </div>
            <a
              href="#"
              className="flex items-center gap-3 px-3 py-2 rounded text-zinc-400 hover:bg-zinc-800 hover:text-white transition text-sm"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
              Dashboard
            </a>
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="flex items-center gap-3 w-full px-3 py-2 rounded text-zinc-400 hover:bg-zinc-800 hover:text-white transition text-sm text-left"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Settings
              </button>
            )}
          </nav>

          {isTauri && (
            <div className="px-3 py-2 shrink-0">
              <button
                type="button"
                onClick={onSync}
                className="flex items-center gap-3 w-full px-3 py-2 rounded text-zinc-400 hover:bg-zinc-800 hover:text-white transition text-sm"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Sync
              </button>
              <div className="mt-1 space-y-1">
                {updateStatus === "available" && updateInfo && (
                  <div className="flex flex-col gap-2 px-3 py-2 rounded border border-zinc-700 bg-zinc-900 text-xs">
                    <span className="text-zinc-300">v{updateInfo.version} available</span>
                    <button
                      type="button"
                      onClick={onInstallUpdate}
                      className="w-full px-2 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white font-semibold transition"
                    >
                      Download & install
                    </button>
                  </div>
                )}
                {updateStatus !== "available" && (
                  <button
                    type="button"
                    onClick={onCheckForUpdates}
                    disabled={updateStatus === "checking" || updateStatus === "latest"}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300 transition text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {updateStatus === "checking"
                      ? "Checking…"
                      : updateStatus === "latest"
                        ? "Up to date"
                        : "Check for updates"}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Account section */}
      <div className="mt-auto border-t border-zinc-800 p-3 shrink-0">
        {accountLoading ? (
          <div className={collapsed ? "flex flex-col items-center gap-1" : "flex items-center gap-3"}>
            <div className="w-8 h-8 rounded bg-zinc-800 animate-pulse shrink-0" />
            {!collapsed && <span className="text-xs text-zinc-600">Loading…</span>}
          </div>
        ) : email ? (
          <div className={collapsed ? "flex flex-col items-center gap-1" : "flex flex-col gap-1.5"}>
            <button
              type="button"
              onClick={onToggleCollapsed}
              className={`flex items-center gap-3 w-full rounded transition overflow-hidden ${
                collapsed
                  ? "flex-col p-2 hover:bg-zinc-800"
                  : "p-2 hover:bg-zinc-800 text-left"
              }`}
            >
              <div className="shrink-0 w-8 h-8 rounded bg-zinc-700 flex items-center justify-center font-semibold text-white text-xs">
                {initials(email)}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-zinc-300 truncate">{email}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {isPaid && (
                      <svg className="w-3 h-3 shrink-0 text-amber-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                    )}
                    <span className={`text-[11px] font-medium ${isPaid ? "text-amber-500" : "text-zinc-600"}`}>
                      {plan}
                    </span>
                  </div>
                  {usage && (
                    <div className="mt-0.5 text-[10px] text-zinc-600 font-variant-numeric tabular-nums">
                      {usage.used}/{usage.limit} clips used
                    </div>
                  )}
                </div>
              )}
            </button>
            {collapsed && (
              <span className={`text-[10px] font-medium flex items-center gap-0.5 ${isPaid ? "text-amber-500" : "text-zinc-600"}`}>
                {isPaid && <span>★</span>}
                {plan}
              </span>
            )}
            {!collapsed ? (
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-2 w-full px-3 py-1.5 rounded text-red-500 hover:bg-red-500/10 hover:text-red-400 transition text-xs"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign out
              </button>
            ) : (
              <button
                type="button"
                onClick={onLogout}
                className="mt-1 p-1.5 rounded text-red-600 hover:bg-red-500/10 hover:text-red-500 transition"
                title="Sign out"
                aria-label="Sign out"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            )}
          </div>
        ) : (
          <div className={collapsed ? "flex flex-col items-center" : "space-y-2"}>
            {!collapsed && <span className="text-xs text-zinc-600">Not signed in</span>}
            <button
              type="button"
              onClick={onLogin}
              className="w-full py-2 rounded bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition"
            >
              {collapsed ? "→" : "Sign in"}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
