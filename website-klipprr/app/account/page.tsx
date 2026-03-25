"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type LicenseRow = {
  plan: string | null;
  expires_at: string | null;
  active?: boolean | null;
};

type SubscriptionSummary = {
  active: boolean;
  status?: string;
  plan?: string;
  next_billing_at?: string | null;
  amount_minor?: number | null;
  currency?: string | null;
  interval?: string | null;
  cancel_at_period_end?: boolean;
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function normalizePlan(plan: string | null | undefined): "free" | "pro" | "max" {
  const p = (plan ?? "").toString().trim().toLowerCase();
  if (p === "max") return "max";
  if (p === "pro") return "pro";
  return "free";
}

function planLabel(plan: "free" | "pro" | "max") {
  if (plan === "max") return "Max";
  if (plan === "pro") return "Pro";
  return "Free";
}

function formatMoney(minor: number | null | undefined, currency: string | null | undefined): string | null {
  if (typeof minor !== "number" || !currency) return null;
  const major = minor / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export default function AccountPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [license, setLicense] = useState<LicenseRow | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [subSummary, setSubSummary] = useState<SubscriptionSummary | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      setLicense(null);
      return;
    }

    setLicenseLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("licenses")
          .select("plan, expires_at, active")
          .eq("user_id", session.user.id)
          .eq("active", true)
          .maybeSingle();

        if (error) {
          console.error("[Account] license load failed", error);
          setLicense(null);
          return;
        }

        setLicense((data as LicenseRow | null) ?? null);
      } catch (e) {
        console.error("[Account] license load failed (exception)", e);
        setLicense(null);
      } finally {
        setLicenseLoading(false);
      }
    })();
  }, [session?.user?.id]);

  const plan = useMemo(() => normalizePlan(license?.plan), [license?.plan]);
  const exp = useMemo(() => formatDate(license?.expires_at ?? null), [license?.expires_at]);
  const nextBilling = useMemo(
    () => formatDate(subSummary?.next_billing_at ?? null),
    [subSummary?.next_billing_at]
  );
  const nextAmount = useMemo(
    () => formatMoney(subSummary?.amount_minor, subSummary?.currency),
    [subSummary?.amount_minor, subSummary?.currency]
  );

  useEffect(() => {
    if (!session?.access_token) {
      setSubSummary(null);
      return;
    }
    setSubLoading(true);
    fetch("/api/stripe/subscription", {
      method: "GET",
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (res) => {
        const raw = await res.text();
        const json = raw ? (JSON.parse(raw) as SubscriptionSummary) : null;
        if (!res.ok) {
          console.error("[Account] subscription summary failed", json);
          setSubSummary(null);
          return;
        }
        setSubSummary(json);
      })
      .catch((e) => {
        console.error("[Account] subscription summary error", e);
        setSubSummary(null);
      })
      .finally(() => setSubLoading(false));
  }, [session?.access_token]);

  const openBillingPortal = async () => {
    if (!session?.access_token) return;
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const raw = await res.text();
      const json = raw ? (JSON.parse(raw) as { url?: string; error?: string }) : null;
      if (!res.ok || !json?.url) {
        alert(json?.error || `Could not open billing portal (HTTP ${res.status})`);
        return;
      }
      window.location.href = json.url;
    } catch (e) {
      console.error("[Account] open portal failed", e);
      alert("Could not open billing portal. Please try again.");
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 px-6">
        <p className="text-zinc-400">Loading…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 px-6 py-10">
        <header className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.png" alt="Klipprr" width={36} height={36} className="rounded-xl" />
            <span className="text-lg font-semibold text-white">Klipprr</span>
          </Link>
          <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition">
            Sign in
          </Link>
        </header>

        <main className="mx-auto mt-16 max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl">
          <h1 className="text-2xl font-semibold text-white">Account</h1>
          <p className="mt-2 text-sm text-zinc-400">You’re signed out. Sign in to view your account.</p>
          <Link
            href="/login"
            className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition"
          >
            Sign in
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 px-6 py-10">
      <header className="mx-auto flex max-w-4xl items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo.png" alt="Klipprr" width={36} height={36} className="rounded-xl" />
          <span className="text-lg font-semibold text-white">Klipprr</span>
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/download" className="text-sm text-zinc-400 hover:text-white transition">
            Download
          </Link>
          <Link href="/upgrade" className="text-sm text-zinc-400 hover:text-white transition">
            Upgrade
          </Link>
        </nav>
      </header>

      <main className="mx-auto mt-12 max-w-4xl">
        <h1 className="text-3xl font-bold text-white">Account</h1>
        <p className="mt-2 text-zinc-400">Manage your Klipprr subscription and account session.</p>

        <section className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
              Signed in
            </h2>
            <p className="mt-2 text-lg text-white">{session.user.email}</p>
            <p className="mt-1 text-sm text-zinc-500">Supabase account</p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
              Plan
            </h2>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                  plan === "max"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : plan === "pro"
                      ? "bg-violet-500/20 text-violet-300"
                      : "bg-zinc-700 text-zinc-200"
                }`}
              >
                {planLabel(plan)}
              </span>
              {(licenseLoading || subLoading) && <span className="text-xs text-zinc-500">Refreshing…</span>}
            </div>
            <p className="mt-3 text-sm text-zinc-400">
              {plan === "free"
                ? "You’re on the Free plan."
                : nextBilling && nextAmount
                  ? `Next charge ${nextAmount} on ${nextBilling}.`
                  : exp
                    ? `Renews/ends on ${exp}.`
                    : "Active subscription."}
            </p>
            {plan !== "free" && subSummary?.cancel_at_period_end && (
              <p className="mt-2 text-sm text-amber-300">
                Cancellation scheduled. You’ll keep access until the end of the current period.
              </p>
            )}
            <Link
              href="/#pricing"
              className="mt-5 inline-flex w-full items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 py-2.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-800 transition"
            >
              Change plan
            </Link>
            <button
              type="button"
              onClick={openBillingPortal}
              disabled={portalLoading || plan === "free"}
              className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60 transition"
            >
              {portalLoading ? "Opening…" : "Manage billing (cancel, invoices, payment method)"}
            </button>
          </div>

          <div className="md:col-span-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
              Session
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              If you’re on a shared computer, sign out when you’re done.
            </p>
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/login";
              }}
              className="mt-5 inline-flex w-full items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-800 transition"
            >
              Sign out
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

