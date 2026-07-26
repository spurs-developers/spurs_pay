import { NextRequest, NextResponse } from "next/server";
import { getPayment, attachInstructions, paymentInstructions } from "@/lib/payments";
import { resolveProvider } from "@/lib/providers";
import { getMerchant } from "@/lib/merchants";
import { enabledMethods } from "@/lib/checkout-methods";

// Called by the hosted checkout when the customer picks "Bank transfer".
// Returns the account to send money to; the payment stays pending until it lands.
export async function POST(req: NextRequest) {
  const { reference } = await req.json().catch(() => ({}));
  if (!reference) return NextResponse.json({ error: "Missing reference" }, { status: 400 });

  const payment = await getPayment(reference);
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  if (payment.status !== "pending") {
    return NextResponse.json({ error: "Payment already processed" }, { status: 409 });
  }

  // Already set up (e.g. the panel remounted, or the customer switched methods
  // and back). Reuse it instead of asking the provider to create a second
  // virtual account against the same reference — Flutterwave's tx_ref is
  // unique, so a second call would just fail.
  const existing = paymentInstructions(payment);
  if (payment.method === "bank_transfer" && existing?.method === "bank_transfer") {
    return NextResponse.json({ instructions: existing });
  }

  const merchant = await getMerchant(payment.merchantId);
  const allowed = await enabledMethods(merchant, payment.mode as "test" | "live");
  if (!allowed.includes("bank_transfer")) {
    return NextResponse.json({ error: "Bank transfer isn't enabled for this payment" }, { status: 400 });
  }

  const provider = await resolveProvider(payment.mode as "test" | "live");
  if (!provider.createTransfer) {
    return NextResponse.json({ error: "Bank transfer is unavailable" }, { status: 400 });
  }

  try {
    const instructions = await provider.createTransfer({
      amount: payment.amount,
      currency: payment.currency,
      reference: payment.reference,
      customerEmail: payment.customerEmail ?? undefined,
    });
    await attachInstructions(payment.reference, "bank_transfer", instructions);
    return NextResponse.json({ instructions });
  } catch {
    return NextResponse.json({ error: "Couldn't set up a bank transfer. Try another method." }, { status: 502 });
  }
}