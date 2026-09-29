import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookie } from "cookie";
import { z } from "zod";
import {
  createAccountCategory,
  createBackupSnapshot,
  createCashAccount,
  createContact,
  createCurrencyTransfer,
  createExpense,
  createInvoice,
  createMovementCategory,
  createOpeningBalance,
  createReceipt,
  createServicePackage,
  createSubscription,
  createIndividualSubscriptionAccount,
  createIndividualSubscriptionCharge,
  createIndividualSubscriptionDiscount,
  addIndividualSubscription,
  getCashSummary,
  getContactStatement,
  getDashboardSummary,
  getFinancialReport,
  getInvoiceDocument,
  getIndividualSubscriptionAccountDetail,
  getIndividualSubscriptionCashSummary,
  getReceiptDocument,
  getSetup,
  getWhatsAppSettings,
  listBackupSnapshots,
  listContacts,
  listExpenses,
  listInvoices,
  listIndividualSubscriptionAccounts,
  listOpenInvoices,
  listReceipts,
  listServicePackages,
  listSubscriptions,
  restoreBackupSnapshot,
  recordIndividualSubscriptionPayment,
  updateAccountCategory,
  updateContact,
  updateExpense,
  updateIndividualSubscriptionAccount,
  updateIndividualSubscription,
  updateIndividualSubscriptionCharge,
  updateIndividualSubscriptionDiscount,
  updateInvoice,
  updateReceipt,
  updateIndividualSubscriptionStatus,
  updateMovementCategory,
  updateServicePackage,
  updateSubscriptionStatus,
  updateWhatsAppSettings,
} from "./accounting";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { createHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";
import { DAILY_BACKUP_CRON, DAILY_BACKUP_TIME_LABEL, getDailyBackupSchedule, saveDailyBackupSchedule, setDailyBackupEnabled } from "./dailyBackup";

export const CONTACT_TYPES = ["customer", "grocery", "supplier", "employee", "other"] as const;
const contactTypeSchema = z.enum(CONTACT_TYPES);
const currencyCodeSchema = z.enum(["YER", "SAR", "USD"]);
const decimalSchema = (maxDecimals: number, label: string) => z.string().max(16, `${label} كبير جداً`).regex(new RegExp(`^\\d+(?:\\.\\d{1,${maxDecimals}})?$`), `أدخل ${label} صحيحاً`);
const moneySchema = decimalSchema(2, "مبلغاً من منزلتين عشريتين كحد أقصى").refine(value => Number.isFinite(Number(value)) && Number(value) > 0, "يجب أن يكون المبلغ أكبر من صفر");
const nonNegativeMoneySchema = decimalSchema(2, "مبلغاً من منزلتين عشريتين كحد أقصى").refine(value => Number.isFinite(Number(value)) && Number(value) >= 0, "أدخل مبلغاً صحيحاً");
const rateSchema = decimalSchema(6, "سعر صرف").refine(value => Number.isFinite(Number(value)) && Number(value) > 0, "يجب أن يكون سعر الصرف أكبر من صفر");
const quantitySchema = decimalSchema(3, "كمية").refine(value => Number.isFinite(Number(value)) && Number(value) > 0, "يجب أن تكون الكمية أكبر من صفر");
const dateSchema = z.coerce.date();
const expenseAttachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  dataBase64: z.string().min(1).max(7_000_000, "ملف الفاتورة كبير جداً بعد التحويل؛ الحد الفعلي للملف 5 ميغابايت"),
});
const individualSubscriptionAccountStatusSchema = z.enum(["active", "suspended", "closed"]);
const individualSubscriptionStatusSchema = z.enum(["active", "suspended", "cancelled"]);

function getSessionToken(headers: { cookie?: string; authorization?: string }) {
  const cookieToken = parseCookie(headers.cookie ?? "")[COOKIE_NAME];
  if (cookieToken) return cookieToken;
  const authorization = headers.authorization?.trim() ?? "";
  return authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  accounting: router({
    setup: adminProcedure.query(() => getSetup()),
    dashboard: adminProcedure.query(() => getDashboardSummary()),
    financialReport: adminProcedure
      .input(z.object({ startDate: dateSchema, endDate: dateSchema, reportingCurrency: currencyCodeSchema, reportingExchangeRateToBase: rateSchema }))
      .query(({ input }) => getFinancialReport(input.startDate, input.endDate, input.reportingCurrency, input.reportingExchangeRateToBase)),
    backups: adminProcedure.query(() => listBackupSnapshots()),
    createBackup: adminProcedure.mutation(({ ctx }) => createBackupSnapshot(ctx.user.id)),
    restoreBackup: adminProcedure.input(z.object({ snapshotId: z.number().int().positive() })).mutation(({ ctx, input }) => restoreBackupSnapshot(ctx.user.id, input.snapshotId)),
    backupSchedule: adminProcedure.query(({ ctx }) => getDailyBackupSchedule(ctx.user.id)),
    enableDailyBackup: adminProcedure.mutation(async ({ ctx }) => {
      const existing = await getDailyBackupSchedule(ctx.user.id);
      const sessionToken = getSessionToken(ctx.req.headers);
      let taskUid = existing?.cronTaskUid ?? null;
      let nextExecutionAt: string | null | undefined;
      if (taskUid) {
        nextExecutionAt = (await updateHeartbeatJob(taskUid, { cron: DAILY_BACKUP_CRON, path: "/api/scheduled/daily-backup", method: "POST", description: `نسخة احتياطية تلقائية يومية الساعة ${DAILY_BACKUP_TIME_LABEL}`, enable: true }, sessionToken)).nextExecutionAt;
      } else {
        const job = await createHeartbeatJob({ name: "al-shamel-daily-accounting-backup", cron: DAILY_BACKUP_CRON, path: "/api/scheduled/daily-backup", method: "POST", description: `نسخة احتياطية تلقائية يومية الساعة ${DAILY_BACKUP_TIME_LABEL}` }, sessionToken);
        taskUid = job.taskUid;
        nextExecutionAt = job.nextExecutionAt;
      }
      const schedule = await saveDailyBackupSchedule({ ownerUserId: ctx.user.id, cronTaskUid: taskUid, isEnabled: true });
      return { schedule, nextExecutionAt };
    }),
    pauseDailyBackup: adminProcedure.mutation(async ({ ctx }) => {
      const schedule = await getDailyBackupSchedule(ctx.user.id);
      if (!schedule?.cronTaskUid) throw new Error("النسخ اليومية غير مفعّلة بعد");
      const sessionToken = getSessionToken(ctx.req.headers);
      await updateHeartbeatJob(schedule.cronTaskUid, { enable: false }, sessionToken);
      return setDailyBackupEnabled(ctx.user.id, false);
    }),
    whatsappSettings: adminProcedure.query(({ ctx }) => getWhatsAppSettings(ctx.user.id)),
    updateWhatsAppSettings: adminProcedure.input(z.object({ whatsappTemplate: z.string().trim().min(10).max(2000) })).mutation(({ ctx, input }) => updateWhatsAppSettings(ctx.user.id, input.whatsappTemplate)),
    contacts: adminProcedure
      .input(z.object({ type: contactTypeSchema.optional() }).optional())
      .query(({ input }) => listContacts(input?.type)),
    createContact: adminProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(200),
          type: contactTypeSchema,
          phone: z.string().trim().max(32).optional(),
          address: z.string().trim().max(300).optional(),
          notes: z.string().trim().max(3000).optional(),
        }),
      )
      .mutation(({ ctx, input }) => createContact(ctx.user.id, input)),
    updateContact: adminProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          name: z.string().trim().min(2).max(200),
          type: contactTypeSchema,
          phone: z.string().trim().max(32).optional(),
          address: z.string().trim().max(300).optional(),
          notes: z.string().trim().max(3000).optional(),
          isActive: z.boolean(),
        }),
      )
      .mutation(({ ctx, input }) => updateContact(ctx.user.id, input)),
    servicePackages: adminProcedure.query(() => listServicePackages()),
    createServicePackage: adminProcedure
      .input(z.object({ name: z.string().trim().min(2).max(160), description: z.string().trim().max(3000).optional(), durationDays: z.number().int().min(1).max(3650), price: moneySchema, currencyCode: currencyCodeSchema }))
      .mutation(({ ctx, input }) => createServicePackage(ctx.user.id, input)),
    updateServicePackage: adminProcedure
      .input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(2).max(160), description: z.string().trim().max(3000).optional(), durationDays: z.number().int().min(1).max(3650), price: moneySchema, currencyCode: currencyCodeSchema, isActive: z.boolean() }))
      .mutation(({ ctx, input }) => updateServicePackage(ctx.user.id, input)),
    subscriptions: adminProcedure.query(() => listSubscriptions()),
    createSubscription: adminProcedure
      .input(z.object({ contactId: z.number().int().positive(), packageId: z.number().int().positive(), startDate: dateSchema, notes: z.string().trim().max(3000).optional() }))
      .mutation(({ ctx, input }) => createSubscription(ctx.user.id, input)),
    updateSubscriptionStatus: adminProcedure
      .input(z.object({ id: z.number().int().positive(), status: z.enum(["active", "expiring", "expired", "suspended"]), notes: z.string().trim().max(3000).optional() }))
      .mutation(({ ctx, input }) => updateSubscriptionStatus(ctx.user.id, input)),
    individualSubscriptionAccounts: adminProcedure.query(() => listIndividualSubscriptionAccounts()),
    individualSubscriptionAccountDetail: adminProcedure
      .input(z.object({ accountId: z.number().int().positive() }))
      .query(({ input }) => getIndividualSubscriptionAccountDetail(input.accountId)),
    createIndividualSubscriptionAccount: adminProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(200),
          phone: z.string().trim().max(32).optional(),
          status: individualSubscriptionAccountStatusSchema.default("active"),
          notes: z.string().trim().max(3000).optional(),
          initialSubscription: z
            .object({
              name: z.string().trim().min(2).max(200).optional(),
              status: individualSubscriptionStatusSchema.default("active"),
              notes: z.string().trim().max(3000).optional(),
            })
            .optional(),
        }),
      )
      .mutation(({ ctx, input }) => createIndividualSubscriptionAccount(ctx.user.id, input)),
    updateIndividualSubscriptionAccount: adminProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          name: z.string().trim().min(2).max(200),
          phone: z.string().trim().max(32).optional(),
          status: individualSubscriptionAccountStatusSchema,
          notes: z.string().trim().max(3000).optional(),
        }),
      )
      .mutation(({ ctx, input }) => updateIndividualSubscriptionAccount(ctx.user.id, input)),
    addIndividualSubscription: adminProcedure
      .input(
        z.object({
          accountId: z.number().int().positive(),
          name: z.string().trim().min(2).max(200).optional(),
          status: individualSubscriptionStatusSchema.default("active"),
          notes: z.string().trim().max(3000).optional(),
        }),
      )
      .mutation(({ ctx, input }) => addIndividualSubscription(ctx.user.id, input)),
    updateIndividualSubscriptionStatus: adminProcedure
      .input(z.object({ id: z.number().int().positive(), status: individualSubscriptionStatusSchema, notes: z.string().trim().max(3000).optional() }))
      .mutation(({ ctx, input }) => updateIndividualSubscriptionStatus(ctx.user.id, input)),
    updateIndividualSubscription: adminProcedure
      .input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(2).max(200), status: individualSubscriptionStatusSchema, notes: z.string().trim().max(3000).optional() }))
      .mutation(({ ctx, input }) => updateIndividualSubscription(ctx.user.id, input)),
    individualSubscriptionCash: adminProcedure.query(() => getIndividualSubscriptionCashSummary()),
    createIndividualSubscriptionCharge: adminProcedure
      .input(
        z.object({
          accountId: z.number().int().positive(),
          subscriptionId: z.number().int().positive().optional(),
          description: z.string().trim().min(2).max(200).optional(),
          currencyCode: currencyCodeSchema,
          amount: moneySchema,
          initialPaidAmount: nonNegativeMoneySchema.default("0"),
          chargedAt: dateSchema,
          notes: z.string().trim().max(3000).optional(),
        }),
      )
      .mutation(({ ctx, input }) => createIndividualSubscriptionCharge(ctx.user.id, input)),
    updateIndividualSubscriptionCharge: adminProcedure
      .input(
        z.object({
          accountId: z.number().int().positive(),
          chargeId: z.number().int().positive(),
          description: z.string().trim().min(2).max(200),
          amount: moneySchema,
          chargedAt: dateSchema,
          notes: z.string().trim().max(3000).optional(),
        }),
      )
      .mutation(({ ctx, input }) => updateIndividualSubscriptionCharge(ctx.user.id, input)),
    createIndividualSubscriptionDiscount: adminProcedure
      .input(
        z.object({
          accountId: z.number().int().positive(),
          chargeId: z.number().int().positive(),
          amount: moneySchema,
          adjustmentDate: dateSchema,
          notes: z.string().trim().max(3000).optional(),
        }),
      )
      .mutation(({ ctx, input }) => createIndividualSubscriptionDiscount(ctx.user.id, input)),
    updateIndividualSubscriptionDiscount: adminProcedure
      .input(
        z.object({
          accountId: z.number().int().positive(),
          adjustmentId: z.number().int().positive(),
          amount: moneySchema,
          adjustmentDate: dateSchema,
          notes: z.string().trim().max(3000).optional(),
        }),
      )
      .mutation(({ ctx, input }) => updateIndividualSubscriptionDiscount(ctx.user.id, input)),
    recordIndividualSubscriptionPayment: adminProcedure
      .input(
        z.object({
          accountId: z.number().int().positive(),
          chargeId: z.number().int().positive(),
          amount: moneySchema,
          paymentDate: dateSchema,
          notes: z.string().trim().max(3000).optional(),
        }),
      )
      .mutation(({ ctx, input }) => recordIndividualSubscriptionPayment(ctx.user.id, input)),
    createAccountCategory: adminProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(120),
          kind: z.enum(["income", "expense", "asset", "liability", "equity", "other"]),
        }),
      )
      .mutation(({ ctx, input }) => createAccountCategory(ctx.user.id, input)),
    updateAccountCategory: adminProcedure
      .input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(2).max(120), isActive: z.boolean() }))
      .mutation(({ ctx, input }) => updateAccountCategory(ctx.user.id, input)),
    createMovementCategory: adminProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(120),
          kind: z.enum(["sale", "receipt", "expense", "transfer", "adjustment"]),
          accountCategoryId: z.number().int().positive().optional(),
        }),
      )
      .mutation(({ ctx, input }) => createMovementCategory(ctx.user.id, input)),
    updateMovementCategory: adminProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          name: z.string().trim().min(2).max(120),
          accountCategoryId: z.number().int().positive().nullable(),
          isActive: z.boolean(),
        }),
      )
      .mutation(({ ctx, input }) => updateMovementCategory(ctx.user.id, input)),
    invoices: adminProcedure.query(() => listInvoices()),
    invoiceDocument: adminProcedure.input(z.object({ invoiceId: z.number().int().positive() })).query(({ input }) => getInvoiceDocument(input.invoiceId)),
    openInvoices: adminProcedure
      .input(z.object({ contactId: z.number().int().positive().optional() }).optional())
      .query(({ input }) => listOpenInvoices(input?.contactId)),
    createInvoice: adminProcedure
      .input(
        z.object({
          contactId: z.number().int().positive(),
          movementCategoryId: z.number().int().positive().optional(),
          type: z.enum(["cash", "credit"]),
          issueDate: dateSchema,
          currencyCode: currencyCodeSchema,
          exchangeRateToBase: rateSchema,
          cashAccountId: z.number().int().positive().optional(),
          discountAmount: nonNegativeMoneySchema.default("0"),
          notes: z.string().trim().max(3000).optional(),
          items: z
            .array(
              z.object({
                description: z.string().trim().min(2).max(300),
                quantity: quantitySchema,
                unitPrice: moneySchema,
              }),
            )
            .min(1),
        }),
      )
      .mutation(({ ctx, input }) => createInvoice(ctx.user.id, input)),
    updateInvoice: adminProcedure
      .input(
        z.object({
          contactId: z.number().int().positive(),
          invoiceId: z.number().int().positive(),
          issueDate: dateSchema,
          description: z.string().trim().min(2).max(300),
          amount: moneySchema,
          cashAccountId: z.number().int().positive().optional(),
          notes: z.string().trim().max(3000).optional(),
        }),
      )
      .mutation(({ ctx, input }) => updateInvoice(ctx.user.id, input)),
    receipts: adminProcedure.query(() => listReceipts()),
    receiptDocument: adminProcedure.input(z.object({ receiptId: z.number().int().positive() })).query(({ input }) => getReceiptDocument(input.receiptId)),
    createReceipt: adminProcedure
      .input(
        z.object({
          contactId: z.number().int().positive(),
          movementCategoryId: z.number().int().positive().optional(),
          receiptDate: dateSchema,
          currencyCode: currencyCodeSchema,
          exchangeRateToBase: rateSchema,
          amount: moneySchema,
          cashAccountId: z.number().int().positive().optional(),
          notes: z.string().trim().max(3000).optional(),
          allocations: z.array(z.object({ invoiceId: z.number().int().positive(), amount: moneySchema })).min(1),
        }),
      )
      .mutation(({ ctx, input }) => createReceipt(ctx.user.id, input)),
    updateReceipt: adminProcedure
      .input(
        z.object({
          contactId: z.number().int().positive(),
          receiptId: z.number().int().positive(),
          receiptDate: dateSchema,
          amount: moneySchema,
          cashAccountId: z.number().int().positive().optional(),
          notes: z.string().trim().max(3000).optional(),
          allocations: z.array(z.object({ invoiceId: z.number().int().positive(), amount: moneySchema })).min(1),
        }),
      )
      .mutation(({ ctx, input }) => updateReceipt(ctx.user.id, input)),
    expenses: adminProcedure.query(() => listExpenses()),
    createExpense: adminProcedure
      .input(
        z.object({
          contactId: z.number().int().positive().optional(),
          movementCategoryId: z.number().int().positive(),
          expenseDate: dateSchema,
          currencyCode: currencyCodeSchema,
          exchangeRateToBase: rateSchema,
          amount: moneySchema,
          cashAccountId: z.number().int().positive().optional(),
          description: z.string().trim().min(2).max(300),
          supplierName: z.string().trim().min(2).max(200).optional(),
          supplierInvoiceNumber: z.string().trim().min(1).max(120).optional(),
          attachment: expenseAttachmentSchema.optional(),
          notes: z.string().trim().max(3000).optional(),
          allowCashOverdraft: z.boolean().optional(),
          cashOverrideReason: z.string().trim().min(2).max(500).optional(),
        }),
      )
      .mutation(({ ctx, input }) => createExpense(ctx.user.id, input)),
    updateExpense: adminProcedure
      .input(
        z.object({
          expenseId: z.number().int().positive(),
          contactId: z.number().int().positive().optional(),
          movementCategoryId: z.number().int().positive(),
          expenseDate: dateSchema,
          amount: moneySchema,
          cashAccountId: z.number().int().positive().optional(),
          description: z.string().trim().min(2).max(300),
          supplierName: z.string().trim().min(2).max(200).optional(),
          supplierInvoiceNumber: z.string().trim().min(1).max(120).optional(),
          notes: z.string().trim().max(3000).optional(),
          allowCashOverdraft: z.boolean().optional(),
          cashOverrideReason: z.string().trim().min(2).max(500).optional(),
        }),
      )
      .mutation(({ ctx, input }) => updateExpense(ctx.user.id, input)),
    createOpeningBalance: adminProcedure
      .input(
        z.object({
          currencyCode: currencyCodeSchema,
          amount: moneySchema,
          cashAccountId: z.number().int().positive().optional(),
          occurredAt: dateSchema,
          notes: z.string().trim().max(3000).optional(),
        }),
      )
      .mutation(({ ctx, input }) => createOpeningBalance(ctx.user.id, input)),
    createCurrencyTransfer: adminProcedure
      .input(
        z.object({
          transferDate: dateSchema,
          fromCashAccountId: z.number().int().positive().optional(),
          fromCurrencyCode: currencyCodeSchema,
          fromAmount: moneySchema,
          toCashAccountId: z.number().int().positive().optional(),
          toCurrencyCode: currencyCodeSchema,
          toAmount: moneySchema,
          notes: z.string().trim().max(3000).optional(),
        }),
      )
      .mutation(({ ctx, input }) => createCurrencyTransfer(ctx.user.id, input)),
    createCashAccount: adminProcedure
      .input(z.object({ name: z.string().trim().min(2).max(120), type: z.enum(["cash", "bank"]), notes: z.string().trim().max(1000).optional() }))
      .mutation(({ ctx, input }) => createCashAccount(ctx.user.id, input)),
    cashSummary: adminProcedure.query(() => getCashSummary()),
    contactStatement: adminProcedure
      .input(z.object({ contactId: z.number().int().positive() }))
      .query(({ input }) => getContactStatement(input.contactId)),
  }),
});

export type AppRouter = typeof appRouter;
