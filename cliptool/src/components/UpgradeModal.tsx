"use client";

import { useState } from "react";
import { open as openExternal } from "@tauri-apps/plugin-shell";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  onUpgraded?: () => void;
  reason?: "feature_locked" | "clip_limit_reached" | null;
  /** When true, show "Enter activation code" so logged-in user can redeem a beta code in-app. */
  isLoggedIn?: boolean;
  /** Redeem an activation code (uses current session). Returns error message or undefined on success. */
  onRedeemCode?: (code: string) => Promise<{ error?: string }>;
}

const LOGIN_URL =
  "https://klipprr.com/login?redirect=" +
  encodeURIComponent("clipagent://auth-callback");
const UPGRADE_URL = "https://klipprr.com/#pricing";

export default function UpgradeModal({
  open,
  onClose,
  reason = null,
  isLoggedIn = false,
  onRedeemCode,
}: UpgradeModalProps) {
  const [launched, setLaunched] = useState(false);
  const [activationCode, setActivationCode] = useState("");
  const [redeemStatus, setRedeemStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [redeemLoading, setRedeemLoading] = useState(false);

  const handleOpenLogin = async () => {
    try {
      await openExternal(LOGIN_URL);
      setLaunched(true);
    } catch (err) {
      console.error("[UpgradeModal] Failed to open browser:", err);
    }
  };

  const handleOpenUpgrade = async () => {
    try {
      await openExternal(UPGRADE_URL);
    } catch (err) {
      console.error("[UpgradeModal] Failed to open browser:", err);
    }
  };

  const handleRedeem = async () => {
    const code = activationCode.trim();
    if (!code || !onRedeemCode) return;
    setRedeemStatus(null);
    setRedeemLoading(true);
    try {
      const result = await onRedeemCode(code);
      if (result.error) {
        setRedeemStatus({ type: "err", msg: result.error });
      } else {
        setRedeemStatus({ type: "ok", msg: "Code redeemed. Pro is now active." });
        setActivationCode("");
        onClose();
      }
    } finally {
      setRedeemLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-gray-400 hover:text-white"
          aria-label="Close"
        >
          ✕
        </button>

        <h2 className="mb-4 text-xl font-semibold text-white">
          {reason === "clip_limit_reached" ? "Monthly clip limit reached" : "Upgrade to Pro"}
        </h2>
        {reason === "clip_limit_reached" && (
          <p className="mb-4 text-sm text-amber-300">
            You used all clips for this month on your current plan. Upgrade for more clips.
          </p>
        )}

        <div className="mb-4 grid grid-cols-1 gap-3 text-xs text-gray-300">
          <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-3">
            <div className="font-semibold text-white">Free</div>
            <div>10 clips / month · 720p · watermark</div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="relative rounded-xl border border-violet-500/80 bg-gray-900/90 p-4 shadow-[0_0_20px_rgba(139,92,246,0.22)]">
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-900">
                Most Popular
              </span>
              <h3 className="text-base font-semibold uppercase text-white">Pro</h3>
              <p className="mt-1 text-[11px] text-zinc-400">Best for creators publishing consistently</p>
              <p className="mt-3 text-zinc-500 line-through">$12</p>
              <p className="text-3xl font-bold text-white">
                $10 <span className="text-lg font-normal text-zinc-400">/ month</span>
              </p>
              <p className="mt-1 text-xs text-zinc-400">Billed yearly ($120/year)</p>
              <span className="mt-2 inline-block rounded-md bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                2 months free
              </span>
              <ul className="mt-3 space-y-1.5 text-xs text-zinc-300">
                <li>✓ Up to 4K clips</li>
                <li>✓ Can rename clips</li>
                <li>✓ Can choose export path</li>
                <li>✓ 120 clips per month</li>
                <li>✓ No watermark</li>
              </ul>
            </div>

            <div className="rounded-xl border border-emerald-500/70 bg-gray-900/90 p-4 shadow-[0_0_18px_rgba(16,185,129,0.2)]">
              <h3 className="text-base font-semibold uppercase text-white">Max</h3>
              <p className="mt-1 text-[11px] text-zinc-400">For power users with high clipping volume</p>
              <p className="mt-3 text-zinc-500 line-through">$39</p>
              <p className="text-3xl font-bold text-white">
                $33 <span className="text-lg font-normal text-zinc-400">/ month</span>
              </p>
              <p className="mt-1 text-xs text-zinc-400">Billed yearly ($396/year)</p>
              <span className="mt-2 inline-block rounded-md bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                2 months free
              </span>
              <ul className="mt-3 space-y-1.5 text-xs text-zinc-300">
                <li>✓ Everything in Pro</li>
                <li>✓ Up to 8K (if source supports it)</li>
                <li>✓ 500 clips per month</li>
                <li>✓ No watermark</li>
                <li>✓ Priority support</li>
              </ul>
            </div>
          </div>
        </div>

        {!isLoggedIn ? (
          <>
            <p className="mb-4 text-sm text-gray-400">
              Sign in to unlock Pro features. If you have a beta code, sign in first, then open this again to enter it.
            </p>
            <button
              onClick={handleOpenLogin}
              className="w-full rounded-lg bg-yellow-500 py-2 font-semibold text-black hover:brightness-110"
            >
              Sign in to unlock Pro
            </button>
            {launched && (
              <p className="mt-4 text-xs text-gray-400">
                Finish signing in in your browser, then return to the app. We&apos;ll log you in automatically.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-gray-400">
              Upgrade in the browser to pay for Pro, or enter a beta code below.
            </p>
            <button
              onClick={handleOpenUpgrade}
              className="w-full rounded-lg bg-yellow-500 py-2 font-semibold text-black hover:brightness-110"
            >
              Upgrade for more clips
            </button>
            <p className="mt-3 text-xs text-gray-500 mb-4">or</p>
            {onRedeemCode && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-400">
                  Enter Beta Code
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={activationCode}
                    onChange={(e) => {
                      setActivationCode(e.target.value);
                      setRedeemStatus(null);
                    }}
                    placeholder="e.g. BETA-CLIP-001"
                    className="flex-1 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none"
                    disabled={redeemLoading}
                  />
                  <button
                    onClick={handleRedeem}
                    disabled={!activationCode.trim() || redeemLoading}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {redeemLoading ? "…" : "Redeem"}
                  </button>
                </div>
                {redeemStatus && (
                  <p
                    className={`text-xs ${redeemStatus.type === "ok" ? "text-green-400" : "text-red-400"}`}
                  >
                    {redeemStatus.msg}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full text-sm text-gray-400 hover:text-gray-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
