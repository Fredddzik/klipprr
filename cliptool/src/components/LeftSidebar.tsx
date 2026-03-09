"use client";

interface LeftSidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  email: string | null;
  plan: "Free" | "Pro";
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
}: LeftSidebarProps) {
  const isPro = plan === "Pro";

  return (
    <aside
      className={`fixed left-0 top-0 z-40 h-full flex flex-col bg-zinc-200 border-r border-zinc-300 dark:bg-zinc-900 dark:border-zinc-800 transition-[width] duration-200 ${
        collapsed ? "w-[72px]" : "w-64"
      }`}
    >
      {/* Logo + collapse */}
      <div className="flex items-center justify-between h-14 px-3 border-b border-zinc-300 dark:border-zinc-800 shrink-0">
        {collapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-zinc-300 dark:hover:bg-zinc-800 transition"
            aria-label="Expand sidebar"
          >
            <img src="/logo-transparent.png" alt="" className="h-8 w-8 object-contain" />
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <img src="/logo-transparent.png" alt="" className="h-8 w-8 object-contain" />
              <span className="font-semibold text-zinc-900 dark:text-white text-lg tracking-tight">Klipprr</span>
            </div>
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="p-1.5 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-zinc-300 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition"
              aria-label="Collapse sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
              </svg>
            </button>
          </>
        )}
      </div>

      {!collapsed && (
        <>
          <nav className="p-2 space-y-0.5 shrink-0">
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 py-2">
              Menu
            </div>
            <a
              href="#"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-700 hover:bg-zinc-300 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white transition"
            >
              <svg className="w-5 h-5 shrink-0 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
              Dashboard
            </a>
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-zinc-700 hover:bg-zinc-300 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white transition text-left"
              >
                <svg className="w-5 h-5 shrink-0 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Settings
              </button>
            )}
          </nav>

          {isTauri && (
            <div className="px-3 py-2 shrink-0">
              <button
                type="button"
                onClick={onSync}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-zinc-700 hover:bg-zinc-300 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white transition text-sm"
              >
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Sync
              </button>
              <div className="mt-2 space-y-1">
                {updateStatus === "available" && updateInfo && (
                  <div className="flex flex-col gap-2 px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs">
                    <span>Version {updateInfo.version} available. Download now?</span>
                    <button
                      type="button"
                      onClick={onInstallUpdate}
                      className="w-full px-2 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
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
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-zinc-600 hover:bg-zinc-300 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white transition text-xs disabled:opacity-50"
                  >
                    {updateStatus === "checking"
                      ? "Checking…"
                      : updateStatus === "latest"
                        ? "You're on the newest version"
                        : "Check for updates"}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Profile + plan — Sync above account, then account (icon + email + Pro Plan with crown), then Logout */}
      <div className="mt-auto border-t border-zinc-300 dark:border-zinc-800 p-3 shrink-0">
        {accountLoading ? (
          <div className={collapsed ? "flex flex-col items-center gap-1" : "flex items-center gap-3"}>
            <div className="w-10 h-10 rounded-full bg-zinc-400 dark:bg-zinc-700 animate-pulse shrink-0" />
            {!collapsed && <span className="text-xs text-zinc-500">Loading…</span>}
          </div>
        ) : email ? (
          <div className={collapsed ? "flex flex-col items-center gap-1" : "flex flex-col gap-2"}>
            <button
              type="button"
              onClick={onToggleCollapsed}
              className={`flex items-center gap-3 w-full rounded-xl transition overflow-hidden ${
                collapsed ? "flex-col p-2 bg-zinc-300/80 hover:bg-zinc-300 dark:bg-zinc-800/50 dark:hover:bg-zinc-800" : "p-2 bg-zinc-300/80 hover:bg-zinc-300 dark:bg-zinc-800/50 dark:hover:bg-zinc-800 text-left"
              }`}
            >
              <div
                className={`shrink-0 rounded-full flex items-center justify-center font-semibold text-white bg-violet-600
                  ${collapsed ? "w-10 h-10 text-sm" : "w-10 h-10 text-sm"}`}
              >
                {initials(email)}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-zinc-700 dark:text-zinc-300 truncate">{email}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {isPro && (
                      <svg className="w-4 h-4 shrink-0 text-amber-500 dark:text-amber-400" fill="currentColor" viewBox="0 0 20 20" aria-hidden><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                    )}
                    <span className={`text-xs font-semibold ${isPro ? "text-amber-600 dark:text-amber-400" : "text-zinc-500"}`}>
                      {plan} Plan
                    </span>
                  </div>
                </div>
              )}
            </button>
            {collapsed && (
              <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${isPro ? "text-amber-600 dark:text-amber-400" : "text-zinc-500"}`}>
                {isPro && <span>★</span>}
                {plan}
              </span>
            )}
            {!collapsed ? (
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300 transition text-sm"
              >
                <span>→</span>
                Logout
              </button>
            ) : (
              <button
                type="button"
                onClick={onLogout}
                className="mt-1 p-1.5 rounded-lg text-red-600 hover:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300 transition"
                title="Logout"
                aria-label="Logout"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            )}
          </div>
        ) : (
          <div className={collapsed ? "flex flex-col items-center" : "space-y-2"}>
            {!collapsed && <span className="text-xs text-zinc-500">Not logged in</span>}
            <button
              type="button"
              onClick={onLogin}
              className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm transition"
            >
              {collapsed ? "⋯" : "Login"}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
