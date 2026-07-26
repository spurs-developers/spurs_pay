// app/pay/[reference]/page.tsx
import { notFound } from "next/navigation";
// import { ShieldCheck } from "lucide-react";
import { getPayment } from "@/lib/payments";
import { getMerchant } from "@/lib/merchants";
import { formatAmount } from "@/lib/format";
import { resolveProvider } from "@/lib/providers";
import CopyText from "@/components/CopyText";
import CheckoutForm from "./CheckoutForm";

// Hosted, Spurs-branded checkout. Nothing here reveals the underlying processor.
export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const payment = await getPayment(reference);
  if (!payment) notFound();

  const merchant = await getMerchant(payment.merchantId);
  const amountLabel = formatAmount(payment.amount, payment.currency);
  // Offer only methods the processor supports AND the merchant has enabled.
  const allowed = new Set(
    (merchant?.allowedMethods ?? "card,bank_transfer,ussd,wallet").split(","),
  );
  const provider = await resolveProvider();
  const methods = provider.supportedMethods.filter((m) => allowed.has(m));
  const done = payment.status !== "pending";

  return (
    <main className="flex-1 bg-neutral-100 px-4 py-8 sm:grid sm:place-items-center sm:py-14 dark:bg-neutral-950">
      <div className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5 sm:grid sm:grid-cols-[380px_1fr]">
        {/* Ticket-stub seam — desktop only, where there's an actual panel boundary to punch. */}
        <div className="pointer-events-none absolute inset-y-0 left-[380px] hidden w-px border-l border-dashed border-neutral-200 sm:block" />
        <div className="pointer-events-none absolute left-[380px] top-0 hidden h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-100 sm:block dark:bg-neutral-950" />
        <div className="pointer-events-none absolute bottom-0 left-[380px] hidden h-6 w-6 -translate-x-1/2 translate-y-1/2 rounded-full bg-neutral-100 sm:block dark:bg-neutral-950" />

        {/* Brand / summary rail */}
        <div className="relative overflow-hidden bg-slate-950 px-6 py-8 text-white sm:px-7 sm:py-10">
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl"
            aria-hidden
          />
          <span className="relative inline-flex items-center gap-2 text-sm font-semibold text-white">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-indigo-500 text-xs">S</span>
            Spurs Pay
          </span>

          <p className="relative mt-8 text-sm text-slate-400">
            {merchant?.businessName ? `You're paying` : "Complete your payment"}
          </p>
          {merchant?.businessName && (
            <p className="relative text-lg font-medium text-white">{merchant.businessName}</p>
          )}
          <p className="relative mt-3 font-mono text-4xl font-semibold tracking-tight text-white sm:text-[2.75rem]">
            {amountLabel}
          </p>
          {payment.description && (
            <p className="relative mt-2 text-sm text-slate-400">{payment.description}</p>
          )}

          <div className="relative mt-8 border-t border-dashed border-white/10 pt-5 sm:mt-10 sm:pt-6">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Reference</span>
              <CopyText value={payment.reference} className="text-slate-300 hover:text-white" />
            </div>
            <div className="mt-4 hidden items-start gap-2 text-xs text-slate-500 sm:flex">
              {/* <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-400" /> */}
              <span>Your card and bank details are encrypted end-to-end. Spurs Pay never shares them with {merchant?.businessName ?? "the merchant"}.</span>
            </div>
          </div>
        </div>

        {/* Payment interaction */}
        <div className="px-6 py-8 sm:px-8 sm:py-10">
          {done ? (
            <StatusScreen status={payment.status as "successful" | "failed"} />
          ) : methods.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-10 text-center">
              <p className="text-sm font-medium text-neutral-900">No payment method is available</p>
              <p className="mt-1 max-w-xs text-sm text-neutral-500">
                {merchant?.businessName ?? "This merchant"} hasn&apos;t enabled a way to pay yet. Please contact them directly.
              </p>
            </div>
          ) : (
            <CheckoutForm reference={payment.reference} amountLabel={amountLabel} methods={methods} />
          )}
        </div>
      </div>

      <p className="mt-5 text-center text-xs text-neutral-400 sm:hidden">Secured by Spurs Pay</p>
    </main>
  );
}

function StatusScreen({ status }: { status: "successful" | "failed" }) {
  const ok = status === "successful";
  return (
    <div className="flex h-full flex-col items-center justify-center py-10 text-center">
      <div
        className={`grid h-14 w-14 place-items-center rounded-full text-2xl ${
          ok ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
        }`}
      >
        {ok ? "✓" : "✕"}
      </div>
      <p className="mt-4 font-medium text-neutral-900">
        {ok ? "Payment completed" : "Payment failed"}
      </p>
      <p className="mt-1 max-w-xs text-sm text-neutral-500">
        This payment has already been processed. You can close this window.
      </p>
    </div>
  );
}