import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPayment, settlePayment, publicPayment } from "@/lib/payments";
import { getMerchant } from "@/lib/merchants";
import { getCardToken, markTokenUsed } from "@/lib/tokens";
import { notifyMerchant } from "@/lib/webhooks";
import { resolveProvider } from "@/lib/providers";
import type { ChargeResult } from "@/lib/providers";

// Called by the hosted Spurs checkout when the customer submits their card, or
// by an API caller charging a previously-created token. No merchant key here —
// the payment reference identifies the transaction.
const ChargeSchema = z.object({
  reference: z.string(),
  card: z
    .object({
      number: z.string().min(12).max(23),
      expMonth: z.string().min(1).max(2),
      expYear: z.string().min(2).max(4),
      cvv: z.string().min(3).max(4),
      name: z.string().optional(),
    })
    .optional(),
  token: z.string().startsWith("tok_").optional(),
});

export async function POST(req: NextRequest) {
  const parsed = ChargeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.card && !parsed.data.token)) {
    return NextResponse.json({ error: "Provide a card or a token" }, { status: 400 });
  }

  const payment = await getPayment(parsed.data.reference);
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  if (payment.status !== "pending") {
    return NextResponse.json({ error: "Payment already processed", status: payment.status }, { status: 409 });
  }

  // Mode decides the processor — a test payment can never touch real money.
  const provider = await resolveProvider(payment.mode as "test" | "live");

  let result: ChargeResult;
  try {
    if (parsed.data.token) {
      const token = await getCardToken(parsed.data.token);
      if (!token || token.used || (token.expiresAt && token.expiresAt < new Date())) {
        return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
      }
      if (token.mode !== payment.mode) {
        return NextResponse.json({ error: "Token/payment mode mismatch" }, { status: 400 });
      }
      const chargeToken = provider.chargeToken ?? (async () => ({ status: "failed", providerReference: "" }) as ChargeResult);
      result = await chargeToken.call(provider, {
        amount: payment.amount,
        currency: payment.currency,
        reference: payment.reference,
        customerEmail: payment.customerEmail ?? undefined,
        providerToken: token.providerToken ?? "",
      });
      await markTokenUsed(token.token);
    } else {
      result = await provider.charge({
        amount: payment.amount,
        currency: payment.currency,
        reference: payment.reference,
        customerEmail: payment.customerEmail ?? undefined,
        card: parsed.data.card!,
      });
    }
  } catch {
    return NextResponse.json({ error: "We couldn't process this payment. Please try again." }, { status: 502 });
  }

  const settled = await settlePayment(payment.reference, {
    status: result.status,
    provider: provider.name,
    providerReference: result.providerReference,
    method: "card",
  });

  // Fire the Spurs-signed webhook to the merchant (fire-and-forget).
  const merchant = await getMerchant(payment.merchantId);
  if (merchant && settled) void notifyMerchant(merchant, settled);

  return NextResponse.json({
    data: settled ? publicPayment(settled) : null,
    redirectUrl: payment.callbackUrl ?? null,
  });
}
