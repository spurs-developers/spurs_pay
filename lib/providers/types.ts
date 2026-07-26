// The contract every payment provider implements. Everything above this line
// (API, checkout, webhooks) is Spurs-branded and provider-agnostic — customers
// and merchants never learn which processor actually moved the money.

export type PaymentMethod = "card" | "bank_transfer" | "ussd";

export interface Card {
  number: string;
  expMonth: string;
  expYear: string;
  cvv: string;
  name?: string;
}

/** Common fields for initializing any payment method. */
export interface MethodInput {
  amount: number; // minor units (kobo/cents)
  currency: string;
  reference: string; // Spurs reference
  customerEmail?: string;
}

export interface ChargeInput extends MethodInput {
  card: Card;
}

export interface ChargeResult {
  status: "successful" | "failed";
  providerReference: string;
  message?: string;
}

/** Bank-transfer instructions shown to the customer (they settle asynchronously). */
export interface TransferInstructions {
  method: "bank_transfer";
  bankName: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  currency: string;
  expiresAt: string; // ISO
}

/** USSD instructions shown to the customer. */
export interface UssdInstructions {
  method: "ussd";
  code: string; // e.g. *000*1234#
  bankName: string;
}

export type Instructions = TransferInstructions | UssdInstructions;

export interface NormalizedWebhook {
  providerReference?: string;
  reference?: string;
  status: "successful" | "failed";
}

/** A bank a payout can be sent to. */
export interface Bank {
  name: string;
  code: string;
}

/** Request to open a dedicated virtual account (NUBAN) for a customer. */
export interface VirtualAccountInput {
  /** Who the account is for (a Spurs user id), used as the provider reference. */
  reference: string;
  customerName: string;
  customerEmail?: string;
  currency?: string;
  /** Optional provider-specific fields for real processors. */
  phoneNumber?: string;
  bvn?: string;
  bankCode?: string;
  firstName?: string;
  lastName?: string;
  narration?: string;
}

/** A dedicated account that collects bank transfers for one customer. */
export interface VirtualAccountResult {
  bankName: string;
  accountNumber: string;
  accountName: string;
  /** The processor's own id for the account (internal — never exposed raw). */
  providerRef: string;
}

/** Money going OUT to a bank account. */
export interface TransferInput {
  amount: number; // minor units
  currency: string;
  reference: string; // Spurs payout reference
  bankCode: string;
  accountNumber: string;
  accountName: string;
  narration?: string;
}

export interface TransferResult {
  status: "successful" | "failed" | "pending";
  providerReference: string;
  message?: string;
}

export interface UssdInput extends MethodInput {
  /** The bank code the customer dials USSD from (e.g. "058" for GTBank). */
  bankCode: string;
}

export interface PaymentProvider {
  readonly name: string;
  /** Which methods this provider offers. The checkout only shows these. */
  readonly supportedMethods: PaymentMethod[];
  /** Charge a card synchronously. Runs server-side; provider stays hidden. */
  charge(input: ChargeInput): Promise<ChargeResult>;
  /** Charge a previously-created token (the PAN never reaches this path). */
  chargeToken?(input: MethodInput & { providerToken: string }): Promise<ChargeResult>;
  /** Create bank-transfer instructions. Payment settles later via webhook. */
  createTransfer?(input: MethodInput): Promise<TransferInstructions>;
  /** Create USSD instructions. Payment settles later via webhook. */
  createUssd?(input: UssdInput): Promise<UssdInstructions>;
  /** Verify an inbound provider webhook and normalize it to a Spurs event. */
  verifyWebhook(rawBody: string, headers: Headers): { valid: boolean; event?: NormalizedWebhook };

  /* ------------------------- payouts (money out) ------------------------- */

  /** Banks a payout can be sent to. */
  listBanks?(): Promise<Bank[]>;
  listUssdBanks?(): Promise<Bank[]>;
  /** Look up the account holder's name — always confirm before paying out. */
  resolveAccount?(bankCode: string, accountNumber: string): Promise<{ accountName: string } | null>;
  /** Send money to a bank account. */
  transfer?(input: TransferInput): Promise<TransferResult>;

  /* ------------------- dedicated virtual accounts ------------------- */

  /** Open a dedicated NUBAN a customer can fund by bank transfer. */
  createVirtualAccount?(input: VirtualAccountInput): Promise<VirtualAccountResult>;
}
