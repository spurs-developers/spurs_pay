// app/pay/[reference]/page.tsx
import { notFound } from "next/navigation";
import { getPayment } from "@/lib/payments";
import { getMerchant } from "@/lib/merchants";
import { formatAmount } from "@/lib/format";
import { enabledMethods } from "@/lib/checkout-methods";
import CheckoutForm from "./CheckoutForm";

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
  const methods = await enabledMethods(merchant, payment.mode as "test" | "live");

  if (payment.status !== "pending") {
    return <StatusScreen status={payment.status as "successful" | "failed"} />;
  }

  if (methods.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6 text-center dark:bg-neutral-950">
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">No payment method is available</p>
        <p className="mt-1 max-w-xs text-sm text-neutral-500">
          {merchant?.businessName ?? "This merchant"} hasn&apos;t enabled a way to pay yet. Please contact them directly.
        </p>
      </main>
    );
  }

  return (
    <CheckoutForm
      reference={payment.reference}
      amountLabel={amountLabel}
      methods={methods}
      businessName={merchant?.businessName}
      customerEmail={payment.customerEmail}
      description={payment.description}
    />
  );
}

function StatusScreen({ status }: { status: "successful" | "failed" }) {
  const ok = status === "successful";
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6 text-center dark:bg-neutral-950">
      <div className={`grid h-16 w-16 place-items-center rounded-full text-2xl ${ok ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"}`}>
        {ok ? "✓" : "✕"}
      </div>
      <p className="mt-5 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
        {ok ? "Payment successful" : "Payment failed"}
      </p>
      <p className="mt-1.5 text-sm text-neutral-500">This payment has already been processed. You can close this window.</p>
    </main>
  );
}