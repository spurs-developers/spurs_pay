import { NextRequest, NextResponse } from "next/server";
import { getPayment, attachInstructions } from "@/lib/payments";
import { resolveProvider } from "@/lib/providers";

// Called by the hosted checkout when the customer picks "USSD".
export async function POST(req: NextRequest) {
  const { reference } = await req.json().catch(() => ({}));
  if (!reference) return NextResponse.json({ error: "Missing reference" }, { status: 400 });

  const payment = await getPayment(reference);
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  if (payment.status !== "pending") {
    return NextResponse.json({ error: "Payment already processed" }, { status: 409 });
  }

  const provider = await resolveProvider(payment.mode as "test" | "live");
  if (!provider.createUssd) {
    return NextResponse.json({ error: "USSD is unavailable" }, { status: 400 });
  }

  try {
    const instructions = await provider.createUssd({
      amount: payment.amount,
      currency: payment.currency,
      reference: payment.reference,
      customerEmail: payment.customerEmail ?? undefined,
    });
    await attachInstructions(payment.reference, "ussd", instructions);
    return NextResponse.json({ instructions });
  } catch {
    return NextResponse.json({ error: "Couldn't set up USSD. Try another method." }, { status: 502 });
  }
}
