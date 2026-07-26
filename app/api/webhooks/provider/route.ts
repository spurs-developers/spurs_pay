import { NextRequest, NextResponse } from "next/server";
import { getPayment, settlePayment } from "@/lib/payments";
import { getMerchant } from "@/lib/merchants";
import { notifyMerchant } from "@/lib/webhooks";
import { resolveProvider } from "@/lib/providers";

// Inbound webhook FROM the underlying processor. We verify it, normalize it,
// settle the payment, then emit our own Spurs-signed event to the merchant.
// The merchant never sees this endpoint or the processor's payload.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const provider = await resolveProvider("live");
  const { valid, event } = provider.verifyWebhook(raw, req.headers);
  if (!valid || !event?.reference) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payment = await getPayment(event.reference);
  if (!payment) return NextResponse.json({ received: true }); // ack unknown refs

  // Ignore duplicates / already-final payments.
  if (payment.status === "pending") {
    const settled = await settlePayment(payment.reference, {
      status: event.status,
      provider: provider.name,
      providerReference: event.providerReference ?? "",
    });
    const merchant = await getMerchant(payment.merchantId);
    if (merchant && settled) void notifyMerchant(merchant, settled);
  }

  return NextResponse.json({ received: true });
}
