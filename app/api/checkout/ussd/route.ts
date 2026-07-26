import { NextRequest, NextResponse } from "next/server";
import { getPayment, attachInstructions, paymentInstructions } from "@/lib/payments";
import { resolveProvider } from "@/lib/providers";

// GET /api/checkout/ussd?reference=... → banks the customer can dial USSD from
export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("reference");
  if (!reference) return NextResponse.json({ error: "Missing reference" }, { status: 400 });

  const payment = await getPayment(reference);
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  const provider = await resolveProvider(payment.mode as "test" | "live");
  if (!provider.listUssdBanks) return NextResponse.json({ banks: [] });
  return NextResponse.json({ banks: await provider.listUssdBanks() });
}

// POST /api/checkout/ussd { reference, bankCode? } → dial code for the chosen bank
export async function POST(req: NextRequest) {
  const { reference, bankCode } = await req.json().catch(() => ({}));
  if (!reference) {
    return NextResponse.json({ error: "Missing reference" }, { status: 400 });
  }

  const payment = await getPayment(reference);
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  if (payment.status !== "pending") {
    return NextResponse.json({ error: "Payment already processed" }, { status: 409 });
  }

  // Already set up for this reference (panel remounted) — reuse it rather than
  // asking for a bank again or calling the provider a second time.
  const existing = paymentInstructions(payment);
  if (payment.method === "ussd" && existing?.method === "ussd") {
    return NextResponse.json({ instructions: existing });
  }

  if (!bankCode) {
    return NextResponse.json({ error: "Missing bank" }, { status: 400 });
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
      bankCode,
    });
    await attachInstructions(payment.reference, "ussd", instructions);
    return NextResponse.json({ instructions });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't set up USSD. Try another method." },
      { status: 502 },
    );
  }
}