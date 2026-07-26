// app/pay/[reference]/CheckoutForm.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, Landmark, Hash, Lock, Copy, Check } from "lucide-react";
import type { PaymentMethod, Instructions, TransferInstructions, UssdInstructions } from "@/lib/providers/types";

interface Props {
  reference: string;
  amountLabel: string;
  methods: PaymentMethod[];
}

const METHOD_META: Record<PaymentMethod, { label: string; icon: typeof CreditCard }> = {
  card: { label: "Card", icon: CreditCard },
  bank_transfer: { label: "Bank transfer", icon: Landmark },
  ussd: { label: "USSD", icon: Hash },
};

export default function CheckoutForm({ reference, amountLabel, methods }: Props) {
  const [active, setActive] = useState<PaymentMethod>(methods?.[0]);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-10 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-600">✓</div>
        <p className="mt-4 font-medium text-neutral-900">Payment successful</p>
        <p className="mt-1 text-sm text-neutral-500">{amountLabel} paid. You can close this window.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {methods.length > 1 && (
        <div className="mb-6 flex gap-1 border-b border-neutral-100">
          {methods.map((m) => {
            const { label, icon: Icon } = METHOD_META[m];
            const isActive = active === m;
            return (
              <button
                key={m}
                onClick={() => setActive(m)}
                className={`flex items-center gap-1.5 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-neutral-400 hover:text-neutral-600"
                }`}
              >
                <Icon size={15} /> {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1">
        {active === "card" && <CardPanel reference={reference} amountLabel={amountLabel} onDone={() => setDone(true)} />}
        {active === "bank_transfer" && <AsyncPanel kind="bank_transfer" reference={reference} onDone={() => setDone(true)} />}
        {active === "ussd" && <AsyncPanel kind="ussd" reference={reference} onDone={() => setDone(true)} />}
      </div>
    </div>
  );
}

/* ----------------------------- Card ----------------------------- */

function formatCardNumber(v: string) {
  return v.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(v: string) {
  const digits = v.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)} / ${digits.slice(2)}` : digits;
}

function CardPanel({ reference, amountLabel, onDone }: { reference: string; amountLabel: string; onDone: () => void }) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "", name: "" });
  const set = <K extends keyof typeof card>(k: K, v: string) => setCard((c) => ({ ...c, [k]: v }));

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
          card: { number: card.number.replace(/\s+/g, ""), expMonth, expYear, cvv: card.cvv, name: card.name },
        }),
      });
      const json = await res.json();
      if (!res.ok) return fail(json.error ?? "Payment failed.");
      if (json.data?.status === "successful") {
        onDone();
        if (json.redirectUrl) setTimeout(() => (window.location.href = json.redirectUrl), 1200);
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
    <form onSubmit={submit} className="flex h-full flex-col">
      <div className="flex-1 space-y-4">
        <Field label="Card number">
          <input
            inputMode="numeric" autoComplete="cc-number" required placeholder="0000 0000 0000 0000"
            value={card.number} onChange={(e) => set("number", formatCardNumber(e.target.value))}
            className="fld font-mono" disabled={processing}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Expiry">
            <input
              required placeholder="MM / YY" autoComplete="cc-exp" value={card.expiry}
              onChange={(e) => set("expiry", formatExpiry(e.target.value))} className="fld font-mono" disabled={processing}
            />
          </Field>
          <Field label="CVV">
            <input
              required inputMode="numeric" placeholder="123" autoComplete="cc-csc" maxLength={4} value={card.cvv}
              onChange={(e) => set("cvv", e.target.value.replace(/\D/g, "").slice(0, 4))} className="fld font-mono" disabled={processing}
            />
          </Field>
        </div>
        <Field label="Cardholder name">
          <input
            placeholder="Name on card" autoComplete="cc-name" value={card.name}
            onChange={(e) => set("name", e.target.value)} className="fld" disabled={processing}
          />
        </Field>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      </div>

      <PayFooter processing={processing} amountLabel={amountLabel} />
    </form>
  );
}

/* -------------------- Bank transfer / USSD -------------------- */

function AsyncPanel({ kind, reference, onDone }: { kind: "bank_transfer" | "ussd"; reference: string; onDone: () => void }) {
  const [instructions, setInstructions] = useState<Instructions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const endpoint = kind === "bank_transfer" ? "/api/checkout/transfer" : "/api/checkout/ussd";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(json.error ?? "Couldn't set up this method.");
        else setInstructions(json.instructions);
      } catch {
        if (!cancelled) setError("Couldn't set up this method.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, reference]);

  // Poll for settlement (a real processor confirms via webhook).
  const poll = useCallback(async () => {
    const res = await fetch(`/api/checkout/status?reference=${encodeURIComponent(reference)}`);
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
    // In sandbox there's no real bank feed, so trigger the simulated settlement.
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
      <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-neutral-500">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-indigo-600" />
        Setting up…
      </div>
    );
  }
  if (error) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4">
        {instructions?.method === "bank_transfer" ? (
          <TransferDetails t={instructions} />
        ) : instructions?.method === "ussd" ? (
          <UssdDetails u={instructions} />
        ) : null}

        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
          We&apos;re waiting for your payment to arrive. This page updates automatically once it clears — no need to refresh.
        </div>
      </div>

      <div className="mt-6 border-t border-neutral-100 pt-5 sm:sticky sm:bottom-0 sm:static">
        <button
          onClick={iHavePaid}
          disabled={confirming}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
        >
          {confirming ? "Checking…" : "I've made this payment"}
        </button>
      </div>
    </div>
  );
}

function TransferDetails({ t }: { t: TransferInstructions }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Transfer to this account</span>
        <ExpiryCountdown expiresAt={t.expiresAt} />
      </div>
      <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200">
        <Row label="Bank" value={t.bankName} />
        <Row label="Account number" value={t.accountNumber} copy />
        <Row label="Account name" value={t.accountName} />
      </div>
    </div>
  );
}

function UssdDetails({ u }: { u: UssdInstructions }) {
  return (
    <div>
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Dial this on your phone</span>
      <div className="mt-2 rounded-xl border border-neutral-200 p-6 text-center">
        <p className="font-mono text-3xl font-semibold tracking-wide text-neutral-900">{u.code}</p>
        <p className="mt-1.5 text-xs text-neutral-400">{u.bankName}</p>
      </div>
    </div>
  );
}

/** Live "expires in mm:ss" — the same pattern Paystack/Flutterwave show on transfer instructions. */
function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Date.parse(expiresAt) - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setRemaining(Math.max(0, Date.parse(expiresAt) - Date.now())), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const low = remaining < 5 * 60_000;
  return (
    <span className={`font-mono text-xs font-medium ${low ? "text-red-500" : "text-neutral-400"}`}>
      Expires {mins}:{String(secs).padStart(2, "0")}
    </span>
  );
}

function Row({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 first:border-t-0">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="flex items-center gap-2 font-mono text-sm font-medium text-neutral-900">
        {value}
        {copy && (
          <button
            onClick={() => {
              navigator.clipboard?.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="text-neutral-400 hover:text-indigo-600"
            aria-label="Copy account number"
          >
            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          </button>
        )}
      </span>
    </div>
  );
}

/* ------------------------------ shared ------------------------------ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-neutral-600">{label}</span>
      {children}
      <style jsx>{`
        .fld {
          height: 2.75rem;
          width: 100%;
          border-radius: 0.65rem;
          border: 1px solid #d4d4d4;
          padding: 0 0.85rem;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.15s;
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

function PayFooter({ processing, amountLabel }: { processing: boolean; amountLabel: string }) {
  return (
    <div className="-mx-6 mt-6 border-t border-neutral-100 bg-white/95 px-6 pb-1 pt-5 backdrop-blur sm:mx-0 sm:sticky sm:bottom-0 sm:static sm:px-0">
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
      <p className="mt-3 text-center text-[11px] text-neutral-400 sm:hidden">Secured by Spurs Pay</p>
    </div>
  );
}