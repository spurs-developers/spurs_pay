import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authKey, authMerchant, unauthorized } from "@/lib/api/auth";
import { createRecipient, listRecipients } from "@/lib/transfers";

const CreateSchema = z.object({
  bankCode: z.string().min(1),
  accountNumber: z.string().regex(/^\d{10}$/, "accountNumber must be 10 digits"),
  name: z.string().max(100).optional(),
});

// GET /api/v1/recipients → your saved payout destinations
export async function GET(req: NextRequest) {
  const merchantId = await authMerchant(req);
  if (!merchantId) return unauthorized();
  return NextResponse.json({ data: await listRecipients(merchantId) });
}

// POST /api/v1/recipients { bankCode, accountNumber, name? }
export async function POST(req: NextRequest) {
  const auth = await authKey(req);
  if (!auth) return unauthorized();

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    return NextResponse.json({ data: await createRecipient(auth.merchantId, parsed.data, auth.mode) }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
