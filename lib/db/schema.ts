// Spurs Pay control plane — a dedicated `pay` schema in the shared Spurs Neon.
// Merchants ARE Spurs users (id = the accounts `sub`), so pay ↔ baas ↔ accounts
// all reference the same user via spurs.users.
import { pgSchema, text, uuid, integer, jsonb, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";

// Declaration of the shared user table (owned by baas). Pay upserts id/name/email
// on merchant SSO login so its FKs resolve; other columns are managed elsewhere.
const spurs = pgSchema("spurs");
export const spursUsers = spurs.table("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email"),
});

export const pay = pgSchema("pay");

/** A merchant = a Spurs user who accepts payments. */
export const merchants = pay.table("merchants", {
  id: text("id").primaryKey().references(() => spursUsers.id, { onDelete: "cascade" }),
  businessName: text("business_name").notNull(),
  email: text("email"),
  webhookUrl: text("webhook_url"),
  webhookSecret: text("webhook_secret").notNull(),
  // Payment methods this merchant accepts (subset of what the provider supports).
  allowedMethods: text("allowed_methods").notNull().default("card,bank_transfer,ussd,wallet"),
  // Reference affixes — merchant-branded prefixes/suffixes on generated references.
  paymentPrefix: text("payment_prefix").notNull().default("spy_"),
  paymentSuffix: text("payment_suffix").notNull().default(""),
  invoicePrefix: text("invoice_prefix").notNull().default("INV-"),
  invoiceSuffix: text("invoice_suffix").notNull().default(""),
  transactionPrefix: text("transaction_prefix").notNull().default("spo_"),
  transactionSuffix: text("transaction_suffix").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const PAYMENT_METHODS = ["card", "bank_transfer", "ussd", "wallet"] as const;

/** Merchant API keys — how a merchant's app authenticates to Spurs Pay. */
export const apiKeys = pay.table("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mode: text("mode").notNull().default("test"),      // test | live
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull(),
  revoked: boolean("revoked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

/** A payment. `provider` / `providerReference` are internal — never exposed. */
export const payments = pay.table(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    reference: text("reference").notNull(),           // Spurs Pay reference (public)
    mode: text("mode").notNull().default("test"),     // test | live — test never moves real money
    amount: integer("amount").notNull(),              // minor units (kobo/cents)
    currency: text("currency").notNull().default("NGN"),
    status: text("status").notNull().default("pending"), // pending | successful | failed | refunded | partially_refunded
    customerEmail: text("customer_email"),
    description: text("description"),
    callbackUrl: text("callback_url"),
    method: text("method"),                            // card | bank_transfer | ussd (chosen at checkout)
    instructions: jsonb("instructions"),               // method-specific display info (bank details, ussd code)
    refundedAmount: integer("refunded_amount").notNull().default(0), // minor units refunded so far
    metadata: jsonb("metadata").notNull().default({}),
    provider: text("provider"),                       // internal — hidden from API
    providerReference: text("provider_reference"),    // internal — hidden from API
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("payments_reference_idx").on(t.reference), index("payments_merchant_idx").on(t.merchantId)],
);

/** A refund against a payment (records; in sandbox there's no real processor call). */
export const refunds = pay.table(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    paymentReference: text("payment_reference").notNull(),
    amount: integer("amount").notNull(), // minor units
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("refunds_payment_idx").on(t.paymentReference)],
);

/** A merchant invoice. Paid through a hosted Spurs Pay checkout. */
export const invoices = pay.table(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    number: text("number").notNull(),                 // INV-0001
    customerEmail: text("customer_email").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("NGN"),
    description: text("description"),
    status: text("status").notNull().default("open"), // open | paid | void
    payReference: text("pay_reference"),              // linked payment reference
    dueDate: timestamp("due_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [index("invoices_merchant_idx").on(t.merchantId), uniqueIndex("invoices_number_idx").on(t.merchantId, t.number)],
);

/** A dedicated virtual account (NUBAN) that collects bank transfers for a merchant. */
export const virtualAccounts = pay.table(
  "virtual_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    bankName: text("bank_name").notNull(),
    accountNumber: text("account_number").notNull(),
    accountName: text("account_name").notNull(),
    currency: text("currency").notNull().default("NGN"),
    provider: text("provider"),
    providerRef: text("provider_ref"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("vaccounts_merchant_idx").on(t.merchantId)],
);

/** An issued virtual card a merchant can spend from. Full PAN is never stored. */
export const issuedCards = pay.table(
  "issued_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    brand: text("brand").notNull().default("Spurs"),
    last4: text("last4").notNull(),
    expMonth: text("exp_month").notNull(),
    expYear: text("exp_year").notNull(),
    balance: integer("balance").notNull().default(0),
    currency: text("currency").notNull().default("NGN"),
    frozen: boolean("frozen").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("cards_merchant_idx").on(t.merchantId)],
);

/** A saved bank account a merchant can pay out to. */
export const recipients = pay.table(
  "recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),                      // merchant's own label
    bankName: text("bank_name").notNull(),
    bankCode: text("bank_code").notNull(),
    accountNumber: text("account_number").notNull(),
    accountName: text("account_name").notNull(),       // resolved from the bank
    currency: text("currency").notNull().default("NGN"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("recipients_merchant_idx").on(t.merchantId)],
);

/** Money leaving the platform: a payout to a recipient's bank account. */
export const payouts = pay.table(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id").notNull().references(() => recipients.id, { onDelete: "restrict" }),
    reference: text("reference").notNull(),            // spo_… (public)
    mode: text("mode").notNull().default("test"),      // test | live (matches the merchant's balance)
    amount: integer("amount").notNull(),               // minor units
    currency: text("currency").notNull().default("NGN"),
    status: text("status").notNull().default("pending"), // pending | successful | failed
    narration: text("narration"),
    failureReason: text("failure_reason"),
    provider: text("provider"),                        // internal — hidden from API
    providerReference: text("provider_reference"),     // internal — hidden from API
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("payouts_reference_idx").on(t.reference), index("payouts_merchant_idx").on(t.merchantId)],
);

export type Recipient = typeof recipients.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
/** Idempotency keys: a client's `Idempotency-Key` → the payment it created. */
export const idempotencyKeys = pay.table(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    reference: text("reference").notNull(),           // the payment reference produced
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("idempotency_merchant_key_idx").on(t.merchantId, t.key)],
);

/** A card token. The PAN is NEVER stored — only the last 4 and expiry. */
export const cardTokens = pay.table(
  "card_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull(),                   // tok_… (public handle)
    merchantId: text("merchant_id").references(() => merchants.id, { onDelete: "cascade" }),
    mode: text("mode").notNull().default("test"),
    brand: text("brand").notNull(),                   // Visa | Mastercard | …
    last4: text("last4").notNull(),
    expMonth: text("exp_month").notNull(),
    expYear: text("exp_year").notNull(),
    providerToken: text("provider_token"),            // internal — the processor's token
    used: boolean("used").notNull().default(false),   // single-use unless vaulted
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("card_tokens_token_idx").on(t.token)],
);

/** A webhook delivery — one per emitted event, with an event ID, attempt count
 * and backoff schedule so deliveries are logged, retried and can be redelivered. */
export const webhookDeliveries = pay.table(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),               // evt_… (stable, sent to the merchant)
    event: text("event").notNull(),                    // payment.successful | payment.refunded | …
    paymentReference: text("payment_reference"),
    url: text("url").notNull(),
    payload: text("payload").notNull(),                // the exact signed body
    signature: text("signature").notNull(),
    status: text("status").notNull().default("pending"), // pending | delivered | failed
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(6),
    lastStatusCode: integer("last_status_code"),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("webhook_deliveries_event_idx").on(t.eventId),
    index("webhook_deliveries_merchant_idx").on(t.merchantId),
    index("webhook_deliveries_due_idx").on(t.status, t.nextAttemptAt),
  ],
);

export type Merchant = typeof merchants.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Refund = typeof refunds.$inferSelect;
export type CardToken = typeof cardTokens.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type VirtualAccount = typeof virtualAccounts.$inferSelect;
export type IssuedCard = typeof issuedCards.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
