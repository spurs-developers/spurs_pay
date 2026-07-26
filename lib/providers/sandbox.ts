import { randomBytes, randomInt } from "node:crypto";
import type {
  PaymentProvider, PaymentMethod, ChargeInput, ChargeResult, MethodInput,
  TransferInstructions, UssdInstructions, NormalizedWebhook, Bank, TransferInput, TransferResult, VirtualAccountInput, VirtualAccountResult,
} from "./types";
import { USSD_BANKS, USSD_DIAL_PREFIX } from "./ussd-banks";

// Works with zero credentials — simulates a processor so the whole Spurs Pay
// flow runs end-to-end. Test rules:
//   • card number ending 0000 is declined, otherwise approved
//   • bank_transfer / ussd stay pending until "confirmed" on the checkout
export class SandboxProvider implements PaymentProvider {
  readonly name = "sandbox";
  readonly supportedMethods: PaymentMethod[] = ["card", "bank_transfer", "ussd"];

  async charge(input: ChargeInput): Promise<ChargeResult> {
    await new Promise((r) => setTimeout(r, 300)); // pretend network latency
    const digits = input.card.number.replace(/\s+/g, "");
    const declined = digits.endsWith("0000");
    return {
      status: declined ? "failed" : "successful",
      providerReference: "sbx_" + randomBytes(8).toString("hex"),
      message: declined ? "Card declined (test)" : "Approved",
    };
  }

  async createVirtualAccount(input: VirtualAccountInput): Promise<VirtualAccountResult> {
    // A real provider (Flutterwave / PaymentPoint / Moniepoint) returns a
    // partner-bank NUBAN here. In sandbox we mint a stable fake one.
    return {
      bankName: "Spurs Test Bank",
      accountNumber: String(randomInt(1_000_000_000, 9_999_999_999)),
      accountName: `SPURS/${input.customerName.toUpperCase()}`.slice(0, 40),
      providerRef: "sbxva_" + randomBytes(8).toString("hex"),
    };
  }

  async chargeToken(input: MethodInput & { providerToken: string }): Promise<ChargeResult> {
    await new Promise((r) => setTimeout(r, 300));
    const declined = input.providerToken === "sbx_decline";
    return {
      status: declined ? "failed" : "successful",
      providerReference: "sbx_" + randomBytes(8).toString("hex"),
      message: declined ? "Card declined (test)" : "Approved",
    };
  }

  async createTransfer(input: MethodInput): Promise<TransferInstructions> {
    const accountNumber = String(randomInt(1_000_000_000, 9_999_999_999)); // 10-digit NUBAN-like
    return {
      method: "bank_transfer",
      bankName: "Spurs Test Bank",
      accountNumber,
      accountName: "SPURS PAY / COLLECTIONS",
      amount: input.amount,
      currency: input.currency,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), // 30 min
    };
  }

  async listUssdBanks(): Promise<Bank[]> {
    return USSD_BANKS;
  }

  async createUssd(input: MethodInput & { bankCode: string }): Promise<UssdInstructions> {
    const bank = USSD_BANKS.find((b) => b.code === input.bankCode);
    if (!bank) throw new Error("Unsupported bank for USSD");
    const prefix = USSD_DIAL_PREFIX[bank.code] ?? "*000*";
    const majorAmount = Math.round(input.amount / 100); // sandbox is NGN-only
    return { method: "ussd", code: `${prefix}${majorAmount}#`, bankName: bank.name };
  }

  verifyWebhook(): { valid: boolean; event?: NormalizedWebhook } {
    // Sandbox has no real processor callbacks; transfers/USSD are confirmed on-page.
    return { valid: false };
  }

  /* ------------------------- payouts (money out) ------------------------- */

  async listBanks(): Promise<Bank[]> {
    return [
      { name: "Spurs Test Bank", code: "001" },
      { name: "Access Bank", code: "044" },
      { name: "First Bank of Nigeria", code: "011" },
      { name: "Guaranty Trust Bank", code: "058" },
      { name: "United Bank for Africa", code: "033" },
      { name: "Zenith Bank", code: "057" },
      { name: "Kuda Bank", code: "090267" },
      { name: "Opay", code: "999992" },
    ];
  }

  /**
   * Deterministic fake resolution: any 10-digit number resolves to a stable
   * name, so tests are repeatable. Numbers ending in 0000 are "not found".
   */
  async resolveAccount(bankCode: string, accountNumber: string): Promise<{ accountName: string } | null> {
    await new Promise((r) => setTimeout(r, 200));
    if (!/^\d{10}$/.test(accountNumber) || accountNumber.endsWith("0000")) return null;

    const FIRST = ["ADA", "CHIDI", "NGOZI", "EMEKA", "AISHA", "TUNDE", "ZAINAB", "BOLA"];
    const LAST = ["OKAFOR", "ADEYEMI", "IBRAHIM", "OKONKWO", "BALOGUN", "ELUEMUNO"];
    const n = Number(accountNumber);
    return { accountName: `${FIRST[n % FIRST.length]} ${LAST[Math.floor(n / 7) % LAST.length]}` };
  }

  /** Simulated payout. Test rule: an amount ending in 99 fails. */
  async transfer(input: TransferInput): Promise<TransferResult> {
    await new Promise((r) => setTimeout(r, 400));
    const failed = String(input.amount).endsWith("99");
    return {
      status: failed ? "failed" : "successful",
      providerReference: "sbxt_" + randomBytes(8).toString("hex"),
      message: failed ? "Transfer declined by bank (test)" : "Transfer completed",
    };
  }
}
