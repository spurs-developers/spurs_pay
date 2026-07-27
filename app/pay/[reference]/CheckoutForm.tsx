// app/pay/[reference]/CheckoutForm.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CreditCard,
  Landmark,
  Hash,
  Lock,
  Copy,
  Check,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import type {
  PaymentMethod,
  Instructions,
  TransferInstructions,
  UssdInstructions,
} from "@/lib/providers/types";

interface Props {
  reference: string;
  amountLabel: string;
  methods: PaymentMethod[];
  businessName?: string | null;
  customerEmail?: string | null;
  description?: string | null;
}

const METHOD_META: Record<
  PaymentMethod,
  { label: string; icon: typeof CreditCard }
> = {
  card: { label: "Card", icon: CreditCard },
  bank_transfer: { label: "Bank transfer", icon: Landmark },
  ussd: { label: "USSD", icon: Hash },
};

const HEADINGS: Record<PaymentMethod, string> = {
  card: "Enter your card details to pay",
  bank_transfer: "Complete your bank transfer",
  ussd: "Dial the USSD code to pay",
};

export default function CheckoutForm({
  reference,
  amountLabel,
  methods,
  businessName,
  customerEmail,
  description,
}: Props) {
  const [active, setActive] = useState<PaymentMethod>(methods[0]);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6 text-center dark:bg-neutral-950">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-600">
          ✓
        </div>
        <p className="mt-5 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Payment successful
        </p>
        <p className="mt-1.5 text-sm text-neutral-500">
          {amountLabel} paid. You can close this window.
        </p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-white dark:bg-neutral-950">
      {/* Top bar — who's being paid, and how much */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4 lg:px-8 dark:border-neutral-900">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
            S
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {businessName ?? "Spurs Pay"}
            </p>
            <p className="truncate text-xs text-neutral-500">
              {customerEmail ?? description ?? "Secure checkout"}
            </p>
          </div>
        </div>
        <div className="shrink-0 rounded-full bg-neutral-100 px-3.5 py-1.5 text-sm dark:bg-neutral-900">
          <span className="text-neutral-500">Pay </span>
          <span className="font-semibold text-neutral-900 dark:text-neutral-100">
            {amountLabel}
          </span>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Method rail — horizontal pills on mobile, vertical list on desktop */}
        <aside className="flex shrink-0 flex-col gap-1 border-b border-neutral-200 bg-neutral-50 px-4 py-3 lg:w-60 lg:border-b-0 lg:border-r lg:py-6 xl:w-64 dark:border-neutral-800 dark:bg-neutral-900/40">
          <span className="hidden px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400 lg:block">
            Pay with
          </span>
          <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
            {methods.map((m) => {
              const { label, icon: Icon } = METHOD_META[m];
              const isActive = active === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setActive(m)}
                  aria-pressed={isActive}
                  className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors lg:w-full ${
                    isActive
                      ? "bg-white text-indigo-600 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-700"
                      : "text-neutral-500 hover:bg-white/70 hover:text-neutral-800 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-200"
                  }`}
                >
                  <Icon
                    size={16}
                    className={
                      isActive ? "text-indigo-600" : "text-neutral-400"
                    }
                  />
                  {label}
                  {isActive && (
                    <ChevronRight
                      size={14}
                      className="ml-auto hidden text-indigo-400 lg:block"
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Active method's form */}
        <main className="flex flex-1 items-center justify-center px-5 py-10 lg:px-10">
          <div className="w-full max-w-md">
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
              {HEADINGS[active]}
            </h1>

            <div className="mt-6">
              {active === "card" && (
                <CardPanel
                  reference={reference}
                  amountLabel={amountLabel}
                  onDone={() => setDone(true)}
                />
              )}
              {active === "bank_transfer" && (
                <AsyncPanel
                  kind="bank_transfer"
                  reference={reference}
                  onDone={() => setDone(true)}
                />
              )}
              {active === "ussd" && (
                <AsyncPanel
                  kind="ussd"
                  reference={reference}
                  onDone={() => setDone(true)}
                />
              )}
            </div>

            <div className="mt-8 flex items-center justify-center gap-1.5 text-xs text-neutral-400">
              <ShieldCheck size={13} /> Secured by Spurs Pay
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ----------------------------- Card ----------------------------- */

function formatCardNumber(v: string) {
  return v
    .replace(/\D/g, "")
    .slice(0, 19)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

function formatExpiry(v: string) {
  const digits = v.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2
    ? `${digits.slice(0, 2)} / ${digits.slice(2)}`
    : digits;
}

function CardPanel({
  reference,
  amountLabel,
  onDone,
}: {
  reference: string;
  amountLabel: string;
  onDone: () => void;
}) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState({
    number: "",
    expiry: "",
    cvv: "",
    name: "",
  });
  const set = <K extends keyof typeof card>(k: K, v: string) =>
    setCard((c) => ({ ...c, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    setError(null);
    const [expMonth, expYear] = card.expiry.split("/").map((s) => s.trim());
    try {
      const res = await fetch("/api/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference,
          card: {
            number: card.number.replace(/\s+/g, ""),
            expMonth,
            expYear,
            cvv: card.cvv,
            name: card.name,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) return fail(json.error ?? "Payment failed.");
      if (json.data?.status === "successful") {
        onDone();
        if (json.redirectUrl)
          setTimeout(() => (window.location.href = json.redirectUrl), 1200);
      } else fail("Your card was declined.");
    } catch {
      fail("Something went wrong. Please try again.");
    }
    function fail(msg: string) {
      setProcessing(false);
      setError(msg);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Card number">
        <input
          inputMode="numeric"
          autoComplete="cc-number"
          required
          placeholder="0000 0000 0000 0000"
          value={card.number}
          onChange={(e) => set("number", formatCardNumber(e.target.value))}
          className="fld font-mono"
          disabled={processing}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Expiry">
          <input
            required
            placeholder="MM / YY"
            autoComplete="cc-exp"
            value={card.expiry}
            onChange={(e) => set("expiry", formatExpiry(e.target.value))}
            className="fld font-mono"
            disabled={processing}
          />
        </Field>
        <Field label="CVV" hint="3–4 digits">
          <input
            required
            inputMode="numeric"
            placeholder="123"
            autoComplete="cc-csc"
            maxLength={4}
            value={card.cvv}
            onChange={(e) =>
              set("cvv", e.target.value.replace(/\D/g, "").slice(0, 4))
            }
            className="fld font-mono"
            disabled={processing}
          />
        </Field>
      </div>
      <Field label="Cardholder name">
        <input
          placeholder="Name on card"
          autoComplete="cc-name"
          value={card.name}
          onChange={(e) => set("name", e.target.value)}
          className="fld"
          disabled={processing}
        />
      </Field>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600 dark:bg-red-500/10">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={processing}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
      >
        {processing ? (
          "Processing…"
        ) : (
          <>
            <Lock size={14} /> Pay {amountLabel}
          </>
        )}
      </button>
    </form>
  );
}

/* -------------------- Bank transfer / USSD -------------------- */

import type { Bank } from "@/lib/providers/types";
import { truncateText } from "@/lib/format";

function AsyncPanel({
  kind,
  reference,
  onDone,
}: {
  kind: "bank_transfer" | "ussd";
  reference: string;
  onDone: () => void;
}) {
  const [instructions, setInstructions] = useState<Instructions | null>(null);
  const [banks, setBanks] = useState<Bank[] | null>(null); // ussd only
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const endpoint =
    kind === "bank_transfer" ? "/api/checkout/transfer" : "/api/checkout/ussd";

  // Bootstrap: bank_transfer auto-creates instructions immediately. USSD first
  // checks whether a bank was already picked (resume), and if not, loads the
  // bank list so the customer can choose one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (kind === "bank_transfer") {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference }),
          });
          const json = await res.json();
          if (cancelled) return;
          if (!res.ok) setError(json.error ?? "Couldn't set up this method.");
          else setInstructions(json.instructions);
        } else {
          const statusRes = await fetch(
            `/api/checkout/status?reference=${encodeURIComponent(reference)}`,
          );
          const statusJson = await statusRes.json();
          if (cancelled) return;
          if (statusJson.method === "ussd" && statusJson.instructions) {
            setInstructions(statusJson.instructions);
          } else {
            const banksRes = await fetch(
              `/api/checkout/ussd?reference=${encodeURIComponent(reference)}`,
            );
            const banksJson = await banksRes.json();
            if (cancelled) return;
            if (!banksRes.ok)
              setError(banksJson.error ?? "Couldn't load banks.");
            else setBanks(banksJson.banks ?? []);
          }
        }
      } catch {
        if (!cancelled) setError("Couldn't set up this method.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, kind, reference]);

  async function chooseBank(bankCode: string) {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, bankCode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Couldn't set up USSD.");
        return;
      }
      setInstructions(json.instructions);
    } catch {
      setError("Couldn't set up USSD.");
    } finally {
      setCreating(false);
    }
  }

  const poll = useCallback(async () => {
    const res = await fetch(
      `/api/checkout/status?reference=${encodeURIComponent(reference)}`,
    );
    const json = await res.json();
    if (json.status === "successful") onDone();
  }, [reference, onDone]);

  useEffect(() => {
    if (!instructions) return;
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, [instructions, poll]);

  async function iHavePaid() {
    setConfirming(true);
    await fetch("/api/checkout/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference }),
    }).catch(() => {});
    await poll();
    setConfirming(false);
  }

  if (loading) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-neutral-500">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-indigo-600" />
        Setting up…
      </div>
    );
  }
  if (error)
    return (
      <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600 dark:bg-red-500/10">
        {error}
      </p>
    );

  // USSD: no bank chosen yet — show the picker instead of instructions.
  if (kind === "ussd" && !instructions) {
    return (
      <div className="space-y-2">
        <p className="mb-1 text-xs font-medium text-neutral-500">
          Choose your bank
        </p>
        {(banks ?? []).map((b) => (
          <button
            key={b.code}
            type="button"
            disabled={creating}
            onClick={() => chooseBank(b.code)}
            className="flex h-11 w-full items-center justify-between rounded-xl border border-neutral-200 px-4 text-sm font-medium transition hover:bg-neutral-50 disabled:opacity-60 dark:border-neutral-800 dark:hover:bg-neutral-900"
          >
            {b.name}
            {creating && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-indigo-600" />
            )}
          </button>
        ))}
        {(banks ?? []).length === 0 && (
          <p className="text-sm text-neutral-500">
            No banks available for USSD right now.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {instructions?.method === "bank_transfer" ? (
        <TransferDetails t={instructions} />
      ) : instructions?.method === "ussd" ? (
        <UssdDetails u={instructions} />
      ) : null}

      <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
        We&apos;re waiting for your payment to arrive. This page updates
        automatically once it clears — no need to refresh.
      </div>

      <button
        onClick={iHavePaid}
        disabled={confirming}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
      >
        {confirming ? "Checking…" : "I've made this payment"}
      </button>
    </div>
  );
}

function TransferDetails({ t }: { t: TransferInstructions }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Transfer to this account
        </span>
        <ExpiryCountdown expiresAt={t.expiresAt} />
      </div>
      <div className="mt-2.5 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
        <Row label="Bank" value={t.bankName} maxChars={15} />
        <Row label="Account number" value={t.accountNumber} copy />
        <Row label="Account name" value={t.accountName} />
      </div>
    </div>
  );
}

function UssdDetails({ u }: { u: UssdInstructions }) {
  return (
    <div>
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        Dial this on your phone
      </span>
      <div className="mt-2.5 rounded-xl border border-neutral-200 p-6 text-center dark:border-neutral-800">
        <p className="font-mono text-3xl font-semibold tracking-wide text-neutral-900 dark:text-neutral-100">
          {u.code}
        </p>
        <p className="mt-1.5 text-xs text-neutral-400">{u.bankName}</p>
      </div>
    </div>
  );
}

/** Live "expires in mm:ss" — same pattern Paystack/Flutterwave show on transfer instructions. */
function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Date.parse(expiresAt) - Date.now()),
  );
  useEffect(() => {
    const id = setInterval(
      () => setRemaining(Math.max(0, Date.parse(expiresAt) - Date.now())),
      1000,
    );
    return () => clearInterval(id);
  }, [expiresAt]);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const low = remaining < 5 * 60_000;
  return (
    <span
      className={`font-mono text-xs font-medium ${low ? "text-red-500" : "text-neutral-400"}`}
    >
      Expires {mins}:{String(secs).padStart(2, "0")}
    </span>
  );
}

function Row({
  label,
  value,
  copy,
  maxChars=0,
}: {
  label: string;
  value: string;
  copy?: boolean;
  maxChars?: number;
}) {
  const [copied, setCopied] = useState(false);
  const display = maxChars ? truncateText(value, maxChars) : value;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-neutral-100 px-4 py-3 first:border-t-0 dark:border-neutral-800">
      <span className="text-xs text-neutral-500">{label}</span>
      <span
        className="flex min-w-0 items-center gap-2 font-mono text-sm font-medium text-neutral-900 dark:text-neutral-100"
        title={value}
      >
        <span className="truncate">{display}</span>
        {copy && (
          <button
            onClick={() => {
              navigator.clipboard?.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="shrink-0 text-neutral-400 hover:text-indigo-600"
            aria-label="Copy account number"
          >
            {copied ? (
              <Check size={14} className="text-emerald-500" />
            ) : (
              <Copy size={14} />
            )}
          </button>
        )}
      </span>
    </div>
  );
}
/* ------------------------------ shared ------------------------------ */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-xs font-medium text-neutral-600 dark:text-neutral-400">
        {label}
        {hint && <span className="font-normal text-neutral-400">{hint}</span>}
      </span>
      {children}
      <style jsx>{`
        .fld {
          height: 3rem;
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid #d4d4d4;
          padding: 0 1rem;
          font-size: 0.9rem;
          outline: none;
          transition:
            border-color 0.15s,
            box-shadow 0.15s;
          background: transparent;
        }
        .fld:focus {
          border-color: #4f46e5;
          box-shadow: 0 0 0 3px rgb(79 70 229 / 0.12);
        }
        .fld:disabled {
          opacity: 0.6;
        }
      `}</style>
    </label>
  );
}
