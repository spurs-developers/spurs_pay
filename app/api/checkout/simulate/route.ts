import { NextRequest, NextResponse } from "next/server";
import { getPayment, settlePayment, publicPayment } from "@/lib/payments";
import { getMerchant } from "@/lib/merchants";
import { notifyMerchant } from "@/lib/webhooks";
import { resolveProvider } from "@/lib/providers";

// Sandbox-only helper: stands in for the async settlement (bank transfer / USSD)
// that a real processor confirms via webhook. Disabled unless PAY_PROVIDER=sandbox.
export async function POST(req: NextRequest) {
  const provider = await resolveProvider();
  if (provider.name !== "sandbox") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const { reference } = await req.json().catch(() => ({}));
  if (!reference) return NextResponse.json({ error: "Missing reference" }, { status: 400 });

  const payment = await getPayment(reference);
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  if (payment.status !== "pending") {
    return NextResponse.json({ data: publicPayment(payment) });
  }

  const settled = await settlePayment(reference, {
    status: "successful",
    provider: provider.name,
    providerReference: "sbx_sim_" + Date.now().toString(36),
  });

  const merchant = await getMerchant(payment.merchantId);
  if (merchant && settled) void notifyMerchant(merchant, settled);

  return NextResponse.json({ data: settled ? publicPayment(settled) : null });
}
