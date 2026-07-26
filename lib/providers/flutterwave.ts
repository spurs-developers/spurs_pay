import type {
  PaymentProvider, PaymentMethod, ChargeInput, ChargeResult, MethodInput,
  TransferInstructions, UssdInstructions, NormalizedWebhook, VirtualAccountInput, VirtualAccountResult,
  Bank,
} from "./types";
import { USSD_BANKS } from "./ussd-banks";

interface FlutterwaveConfig {
  FLUTTERWAVE_SECRET_KEY?: string;
  FLUTTERWAVE_WEBHOOK_SECRET?: string;
}

// Real provider adapter. Only runs when PAY_PROVIDER=flutterwave AND keys are set.
// The rest of Spurs Pay doesn't change when you switch to this — that's the point.
export class FlutterwaveProvider implements PaymentProvider {
  readonly name = "flutterwave";
  readonly supportedMethods: PaymentMethod[] = ["card", "bank_transfer", "ussd"];
  private secret: string;
  private webhookSecret: string;

  constructor(cfg: FlutterwaveConfig = {}) {
    this.secret = cfg.FLUTTERWAVE_SECRET_KEY ?? process.env.FLUTTERWAVE_SECRET_KEY ?? "";
    this.webhookSecret = cfg.FLUTTERWAVE_WEBHOOK_SECRET ?? process.env.FLUTTERWAVE_WEBHOOK_SECRET ?? "";
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    if (!this.secret) throw new Error("Flutterwave is not configured (missing secret key).");

    // Flutterwave card charge (type=card). Kept minimal; production needs the
    // encryption + 3-DS auth steps per their docs.
    const res = await fetch("https://api.flutterwave.com/v3/charges?type=card", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tx_ref: input.reference,
        amount: input.amount / 100,
        currency: input.currency,
        email: input.customerEmail,
        card_number: input.card.number,
        cvv: input.card.cvv,
        expiry_month: input.card.expMonth,
        expiry_year: input.card.expYear,
      }),
    });
    const body = await res.json().catch(() => ({}));
    const status = body?.data?.status === "successful" ? "successful" : "failed";
    return { status, providerReference: String(body?.data?.id ?? ""), message: body?.message };
  }

  async createVirtualAccount(input: VirtualAccountInput): Promise<VirtualAccountResult> {
    if (!this.secret) throw new Error("Flutterwave is not configured (missing secret key).");

    const [firstName, ...rest] = (input.firstName ?? input.customerName ?? "Spurs User").trim().split(/\s+/);
    const lastName = input.lastName ?? (rest.join(" ") || "User");
    const payload = {
      email: input.customerEmail ?? `${input.reference}@spurs.local`,
      tx_ref: input.reference,
      phonenumber: input.phoneNumber ?? process.env.FLUTTERWAVE_VA_PHONENUMBER ?? "",
      is_permanent: true,
      firstname: firstName || "Spurs",
      lastname: lastName || "User",
      narration: input.narration ?? `SPURS ${input.reference}`,
      ...(input.bankCode ? { bank_code: input.bankCode } : {}),
      ...(input.bvn ? { bvn: input.bvn } : {}),
    };

    const res = await fetch("https://api.flutterwave.com/v3/virtual-account-numbers", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.status !== "success") {
      throw new Error(body?.message ?? "Flutterwave virtual account creation failed");
    }

    const data = body?.data ?? {};
    return {
      bankName: data.bank_name ?? "Flutterwave Bank",
      accountNumber: String(data.account_number ?? ""),
      accountName: data.note ?? `${firstName || "Spurs"} ${lastName || "User"}`.trim(),
      providerRef: String(data.flw_ref ?? data.order_ref ?? input.reference),
    };
  }

  async createTransfer(input: MethodInput): Promise<TransferInstructions> {
  if (!this.secret) throw new Error("Flutterwave is not configured (missing secret key).");

  const email = input.customerEmail ?? `${input.reference}@spurs.local`;
  const [localPart] = email.split("@");
  const [firstName, ...rest] = localPart.split(/[._-]/);

  const res = await fetch("https://api.flutterwave.com/v3/virtual-account-numbers", {
    method: "POST",
    headers: { Authorization: `Bearer ${this.secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      amount: input.amount / 100,
      currency: input.currency,
      tx_ref: input.reference, // Spurs reference — already unique per payment
      phonenumber: process.env.FLUTTERWAVE_VA_PHONENUMBER ?? "08100000000",
      firstname: firstName || "Spurs",
      lastname: rest.join(" ") || "Customer",
      narration: `Spurs Pay ${input.reference}`,
      is_permanent: false, // explicit: one-off, tied to this single payment
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.status !== "success") {
    throw new Error(body?.message ?? `Flutterwave virtual account creation failed (${res.status})`);
  }

  const data = body?.data ?? {};
  if (!data.account_number || !data.bank_name) {
    throw new Error("Flutterwave did not return a virtual account for this payment");
  }

  // expiry_date is almost always "N/A" for temporary accounts — Flutterwave
  // doesn't enforce a hard deadline here, so we impose our own collection window.
  const expiresAt =
    data.expiry_date && data.expiry_date !== "N/A"
      ? new Date(data.expiry_date).toISOString()
      : new Date(Date.now() + 30 * 60_000).toISOString();

  return {
    method: "bank_transfer",
    bankName: data.bank_name,
    accountNumber: data.account_number,
    accountName: "SPURS PAY", // no discrete name field from this endpoint — `note` is a sentence, not a label
    amount: input.amount,
    currency: input.currency,
    expiresAt,
  };
}

  async listUssdBanks(): Promise<Bank[]> {
    return USSD_BANKS;
  }

  async createUssd(input: MethodInput & { bankCode: string }): Promise<UssdInstructions> {
    if (!this.secret) throw new Error("Flutterwave is not configured (missing secret key).");
    const bank = USSD_BANKS.find((b) => b.code === input.bankCode);
    if (!bank) throw new Error("Unsupported bank for USSD");
    const res = await fetch("https://api.flutterwave.com/v3/charges?type=ussd", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.secret}`, "Content-Type": "application/json" },
      // body: JSON.stringify({ tx_ref: input.reference, amount: input.amount / 100, currency: input.currency, email: input.customerEmail }),
    body: JSON.stringify({
        tx_ref: input.reference,
        amount: input.amount / 100,
        currency: input.currency,
        email: input.customerEmail,
        account_bank: input.bankCode, // the USSD dial prefix Flutterwave returns is bank-specific
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.status !== "success") {
      throw new Error(body?.message ?? `Flutterwave USSD charge failed (${res.status})`);
    }

    const a = body?.data?.meta?.authorization ?? body?.meta?.authorization ?? {};
    const note: string = a.note ?? "";
    const code = note.match(/\*\d[\d*]*#/)?.[0] ?? note; // pull the dial string out of the note
    if (!code) throw new Error("Flutterwave did not return a USSD code for this bank");

    return { method: "ussd", code, bankName: bank.name };
  }

  verifyWebhook(rawBody: string, headers: Headers): { valid: boolean; event?: NormalizedWebhook } {
    const expected = this.webhookSecret;
    const signature = headers.get("verif-hash") ?? "";
    if (!expected || signature !== expected) return { valid: false };

    const body = JSON.parse(rawBody || "{}");
    return {
      valid: true,
      event: {
        reference: body?.data?.tx_ref,
        providerReference: String(body?.data?.id ?? ""),
        status: body?.data?.status === "successful" ? "successful" : "failed",
      },
    };
  }
}
