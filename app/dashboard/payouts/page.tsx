import { Landmark, Send, Wallet, ArrowUpRight } from "lucide-react";
import { requireMerchant } from "@/lib/auth";
import { getBalance, listRecipients, listPayouts, recipientsFor, listBanks } from "@/lib/transfers";
import { formatAmount } from "@/lib/format";
import { Card, StatCard, PageHeader } from "@/components/pay-ui";
import { createRecipientAction, createPayoutAction } from "../actions";
import { getMode } from "@/lib/mode";

const STATUS: Record<string, string> = {
  successful: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireMerchant();
  const { ok, error } = await searchParams;
  const mode = await getMode()

  const [balance, recipients, payouts, banks] = await Promise.all([
    getBalance(user.sub, "NGN", mode),
    listRecipients(user.sub),
    listPayouts(user.sub, 50, mode),
    listBanks(mode),
  ]);
  const byId = await recipientsFor(payouts);

  return (
    <div>
      <PageHeader title="Payouts" subtitle="Send your balance to a bank account." />

      {ok && <Banner tone="ok">{ok}</Banner>}
      {error && <Banner tone="err">{error}</Banner>}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Available to pay out"
          value={formatAmount(balance.available, balance.currency)}
          accent="text-emerald-600 dark:text-emerald-400"
          icon={<Wallet size={20} />}
        />
        <StatCard label="Collected" value={formatAmount(balance.collected, balance.currency)} hint="Net of refunds" />
        <StatCard label="Paid out" value={formatAmount(balance.paidOut, balance.currency)} hint="Sent or in flight" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Send money */}
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-medium"><Send size={16} className="text-neutral-500" /> Send a payout</h2>
          {recipients.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">Add a bank account first, then you can pay out to it.</p>
          ) : (
            <form action={createPayoutAction} className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-neutral-500">Recipient</span>
                <select name="recipientId" required className="h-10 w-full rounded-lg border border-neutral-300 bg-transparent px-3 text-sm outline-none focus:border-indigo-500 dark:border-neutral-700">
                  {recipients.map((r) => (
                    <option key={r.id} value={r.id}>{r.name} — {r.bankName} ••{r.accountNumber.slice(-4)}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-neutral-500">Amount (₦)</span>
                  <input name="amount" inputMode="decimal" required placeholder="0.00" className="h-10 w-full rounded-lg border border-neutral-300 bg-transparent px-3 text-sm outline-none focus:border-indigo-500 dark:border-neutral-700" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-neutral-500">Narration</span>
                  <input name="narration" placeholder="Weekly settlement" className="h-10 w-full rounded-lg border border-neutral-300 bg-transparent px-3 text-sm outline-none focus:border-indigo-500 dark:border-neutral-700" />
                </label>
              </div>
              <button className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700">
                <Send size={15} /> Send payout
              </button>
              <p className="text-xs text-neutral-500">Max {formatAmount(balance.available, balance.currency)} available.</p>
            </form>
          )}
        </Card>

        {/* Add recipient */}
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-medium"><Landmark size={16} className="text-neutral-500" /> Add a bank account</h2>
          <p className="mt-1 text-sm text-neutral-500">We confirm the account name with the bank before saving.</p>
          <form action={createRecipientAction} className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Bank</span>
              <select name="bankCode" required className="h-10 w-full rounded-lg border border-neutral-300 bg-transparent px-3 text-sm outline-none focus:border-indigo-500 dark:border-neutral-700">
                {banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-neutral-500">Account number</span>
                <input name="accountNumber" inputMode="numeric" required maxLength={10} placeholder="0123456789" className="h-10 w-full rounded-lg border border-neutral-300 bg-transparent px-3 font-mono text-sm outline-none focus:border-indigo-500 dark:border-neutral-700" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-neutral-500">Label (optional)</span>
                <input name="name" placeholder="Ops payouts" className="h-10 w-full rounded-lg border border-neutral-300 bg-transparent px-3 text-sm outline-none focus:border-indigo-500 dark:border-neutral-700" />
              </label>
            </div>
            <button className="h-10 w-full rounded-lg border border-neutral-300 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800">
              Save recipient
            </button>
          </form>

          {recipients.length > 0 && (
            <ul className="mt-4 divide-y divide-neutral-100 border-t border-neutral-100 pt-2 text-sm dark:divide-neutral-800 dark:border-neutral-800">
              {recipients.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-neutral-500">{r.bankName} · {r.accountNumber} · {r.accountName}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* History */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">Payout history</h2>
        <Card>
          {payouts.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-12 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-neutral-100 text-neutral-400 dark:bg-neutral-800"><ArrowUpRight size={22} /></span>
              <p className="mt-3 text-sm font-medium">No payouts yet</p>
              <p className="mt-1 max-w-xs text-sm text-neutral-500">Money you send to a bank account shows up here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {payouts.map((p) => {
                const r = byId.get(p.recipientId);
                return (
                  <li key={p.reference} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800"><ArrowUpRight size={16} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{r ? `${r.name} · ${r.bankName}` : "Payout"}</div>
                      <div className="truncate text-xs text-neutral-500">
                        {p.narration ?? p.reference} · {new Date(p.createdAt).toLocaleString()}
                        {p.failureReason ? ` · ${p.failureReason}` : ""}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS[p.status] ?? "bg-neutral-500/10 text-neutral-500"}`}>{p.status}</span>
                    <div className="w-24 shrink-0 text-right text-sm font-semibold">-{formatAmount(p.amount, p.currency)}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Banner({ tone, children }: { tone: "ok" | "err"; children: React.ReactNode }) {
  const cls = tone === "ok"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300";
  return <div className={`mb-4 rounded-lg border px-4 py-2.5 text-sm ${cls}`}>{children}</div>;
}
