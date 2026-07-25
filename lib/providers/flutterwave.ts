import type {
  PaymentProvider, PaymentMethod, ChargeInput, ChargeResult, MethodInput,
  TransferInstructions, UssdInstructions, NormalizedWebhook,
} from "./types";

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

  async createTransfer(input: MethodInput): Promise<TransferInstructions> {
    if (!this.secret) throw new Error("Flutterwave is not configured (missing secret key).");
    // FLW: POST /v3/charges?type=bank_transfer → returns a dynamic virtual account
    // in body.meta.authorization. Kept minimal.
    const res = await fetch("https://api.flutterwave.com/v3/charges?type=bank_transfer", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tx_ref: input.reference, amount: input.amount / 100, currency: input.currency, email: input.customerEmail }),
    });
    const body = await res.json().catch(() => ({}));
    const a = body?.meta?.authorization ?? {};
    return {
      method: "bank_transfer",
      bankName: a.transfer_bank ?? "Bank",
      accountNumber: a.transfer_account ?? "",
      accountName: a.transfer_note ?? "SPURS PAY",
      amount: input.amount,
      currency: input.currency,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    };
  }

  async createUssd(input: MethodInput): Promise<UssdInstructions> {
    if (!this.secret) throw new Error("Flutterwave is not configured (missing secret key).");
    const res = await fetch("https://api.flutterwave.com/v3/charges?type=ussd", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tx_ref: input.reference, amount: input.amount / 100, currency: input.currency, email: input.customerEmail }),
    });
    const body = await res.json().catch(() => ({}));
    return { method: "ussd", code: body?.meta?.authorization?.note ?? "", bankName: "Bank" };
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
