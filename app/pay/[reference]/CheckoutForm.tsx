"use client";

import { useCallback, useEffect, useState } from "react";
import type { PaymentMethod, Bank, TransferInstructions, UssdInstructions } from "@/lib/providers/types";

interface Props {
  reference: string;
  amountLabel: string;
  methods: PaymentMethod[];
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  card: "Card",
  bank_transfer: "Bank transfer",
  ussd: "USSD",
};

export default function CheckoutForm({ reference, amountLabel, methods }: Props) {
  const [active, setActive] = useState<PaymentMethod>(methods[0] ?? "card");
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="text-center py-6">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 grid place-items-center text-2xl">✓</div>
        <p className="font-medium text-neutral-900">Payment successful</p>
        <p className="text-sm text-neutral-500 mt-1">{amountLabel} paid. You can close this window.</p>
      </div>
    );
  }

  return (
    <div>
      {methods.length > 1 && (
        <div className="mb-5 grid grid-cols-3 gap-1 rounded-lg bg-neutral-100 p-1">
          {methods.map((m) => (
            <button
              key={m}
              onClick={() => setActive(m)}
              className={`rounded-md py-1.5 text-xs font-medium transition ${
                active === m ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              {METHOD_LABELS[m]}
            </button>
          ))}
        </div>
      )}

      {active === "card" && <CardPanel reference={reference} amountLabel={amountLabel} onDone={() => setDone(true)} />}
      {active === "bank_transfer" && <TransferPanel reference={reference} onDone={() => setDone(true)} />}
      {active === "ussd" && <UssdPanel reference={reference} onDone={() => setDone(true)} />}
    </div>
  );
}

/* ----------------------------- Card ----------------------------- */

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
    <form onSubmit={submit} className="space-y-4">
      <Field label="Card number">
        <input inputMode="numeric" autoComplete="cc-number" required placeholder="0000 0000 0000 0000"
          value={card.number} onChange={(e) => set("number", e.target.value)} className="input" disabled={processing} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Expiry (MM/YY)">
          <input required placeholder="MM/YY" autoComplete="cc-exp" value={card.expiry}
            onChange={(e) => set("expiry", e.target.value)} className="input" disabled={processing} />
        </Field>
        <Field label="CVV">
          <input required inputMode="numeric" placeholder="123" autoComplete="cc-csc" value={card.cvv}
            onChange={(e) => set("cvv", e.target.value)} className="input" disabled={processing} />
        </Field>
      </div>
      <Field label="Cardholder name">
        <input placeholder="Name on card" autoComplete="cc-name" value={card.name}
          onChange={(e) => set("name", e.target.value)} className="input" disabled={processing} />
      </Field>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}

      <button type="submit" disabled={processing}
        className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-2.5 transition">
        {processing ? "Processing…" : `Pay ${amountLabel}`}
      </button>
    </form>
  );
}

/* ------------------------- Bank transfer ------------------------- */

function TransferPanel({ reference, onDone }: { reference: string; onDone: () => void }) {
  const [instructions, setInstructions] = useState<TransferInstructions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/checkout/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(json.error ?? "Couldn't set up a bank transfer.");
        else setInstructions(json.instructions);
      } catch {
        if (!cancelled) setError("Couldn't set up a bank transfer.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reference]);

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
    // No-op outside sandbox — see /api/checkout/simulate. Acts as a manual refresh.
    await fetch("/api/checkout/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference }),
    }).catch(() => {});
    await poll();
    setConfirming(false);
  }

  if (loading) return <p className="py-6 text-center text-sm text-neutral-500">Setting up…</p>;
  if (error) return <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>;
  if (!instructions) return null;

  return (
    <div className="space-y-4">
      <TransferDetails t={instructions} />
      <p className="text-xs text-neutral-500">
        This account was generated just for this payment and expires at{" "}
        {new Date(instructions.expiresAt).toLocaleTimeString()}. We&apos;re waiting for it to arrive — this
        updates automatically once it clears.
      </p>
      <ConfirmButton confirming={confirming} onClick={iHavePaid} />
    </div>
  );
}

function TransferDetails({ t }: { t: TransferInstructions }) {
  return (
    <div className="rounded-lg border border-neutral-200 divide-y divide-neutral-100">
      <Row label="Bank" value={t.bankName} />
      <Row label="Account number" value={t.accountNumber} copy />
      <Row label="Account name" value={t.accountName} />
    </div>
  );
}

/* ----------------------------- USSD ----------------------------- */

function UssdPanel({ reference, onDone }: { reference: string; onDone: () => void }) {
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [bankCode, setBankCode] = useState("");
  const [instructions, setInstructions] = useState<UssdInstructions | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/checkout/ussd?reference=${encodeURIComponent(reference)}`);
        const json = await res.json();
        if (!cancelled) setBanks(json.banks ?? []);
      } catch {
        if (!cancelled) setError("Couldn't load banks for USSD.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reference]);

  async function generate() {
    if (!bankCode) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout/ussd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, bankCode }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "Couldn't generate a USSD code.");
      else setInstructions(json.instructions);
    } catch {
      setError("Couldn't generate a USSD code.");
    } finally {
      setGenerating(false);
    }
  }

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
    await fetch("/api/checkout/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference }),
    }).catch(() => {});
    await poll();
    setConfirming(false);
  }

  if (loading) return <p className="py-6 text-center text-sm text-neutral-500">Loading banks…</p>;

  if (!instructions) {
    return (
      <div className="space-y-4">
        <label className="block">
          <span className="text-xs font-medium text-neutral-600">Choose your bank</span>
          <select value={bankCode} onChange={(e) => setBankCode(e.target.value)} className="input mt-1">
            <option value="">Select a bank…</option>
            {(banks ?? []).map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
        </label>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}
        <button
          onClick={generate}
          disabled={!bankCode || generating}
          className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-2.5 transition"
        >
          {generating ? "Generating…" : "Get USSD code"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <UssdDetails u={instructions} />
      <p className="text-xs text-neutral-500">
        Dial this on the phone linked to your account. We&apos;re waiting for it to clear — this updates
        automatically.
      </p>
      <ConfirmButton confirming={confirming} onClick={iHavePaid} />
    </div>
  );
}

function UssdDetails({ u }: { u: UssdInstructions }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4 text-center">
      <p className="text-xs text-neutral-500">Dial this on your phone</p>
      <p className="mt-1 text-2xl font-semibold tracking-wide text-neutral-900">{u.code}</p>
      <p className="mt-1 text-xs text-neutral-400">{u.bankName}</p>
    </div>
  );
}

/* --------------------------- shared bits --------------------------- */

function ConfirmButton({ confirming, onClick }: { confirming: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={confirming}
      className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-2.5 transition">
      {confirming ? "Checking…" : "I've made this payment"}
    </button>
  );
}

function Row({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="flex items-center gap-2 text-sm font-medium text-neutral-900">
        {value}
        {copy && (
          <button
            onClick={() => {
              navigator.clipboard?.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-neutral-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}