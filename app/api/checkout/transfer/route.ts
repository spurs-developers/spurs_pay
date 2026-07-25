import { NextRequest, NextResponse } from "next/server";
import { getPayment, attachInstructions } from "@/lib/payments";
import { resolveProvider } from "@/lib/providers";

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

  const provider = await resolveProvider();
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
