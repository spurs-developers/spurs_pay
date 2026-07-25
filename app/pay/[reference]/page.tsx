import { notFound } from "next/navigation";
import { getPayment } from "@/lib/payments";
import { getMerchant } from "@/lib/merchants";
import { formatAmount } from "@/lib/format";
import { resolveProvider } from "@/lib/providers";
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
    <main className="flex-1 grid place-items-center bg-neutral-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <span className="inline-flex items-center gap-1.5 font-semibold text-indigo-600">
            <span className="h-5 w-5 rounded-md bg-indigo-600 text-white grid place-items-center text-xs">
              S
            </span>
            Spurs Pay
          </span>
        </div>

        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 overflow-hidden">
          <div className="px-6 pt-6 pb-5 border-b border-neutral-100">
            <p className="text-sm text-neutral-500">
              {merchant?.businessName
                ? `Pay ${merchant.businessName}`
                : "Complete your payment"}
            </p>
            <p className="text-3xl font-semibold text-neutral-900 mt-1">
              {amountLabel}
            </p>
            {payment.description && (
              <p className="text-sm text-neutral-500 mt-1">
                {payment.description}
              </p>
            )}
          </div>

          <div className="px-6 py-6">
            {done ? (
              <div className="text-center py-4">
                <p
                  className={`font-medium ${payment.status === "successful" ? "text-emerald-600" : "text-red-600"}`}
                >
                  {payment.status === "successful"
                    ? "Payment completed"
                    : "Payment failed"}
                </p>
                <p className="text-sm text-neutral-500 mt-1">
                  This payment has already been processed.
                </p>
              </div>
            ) : (
              <CheckoutForm
                reference={payment.reference}
                amountLabel={amountLabel}
                methods={methods}
              />
            )}
          </div>
        </div>

        <p className="text-center text-xs text-neutral-400 mt-4">
          Secured by Spurs Pay
        </p>
      </div>
    </main>
  );
}
