import { useState, useMemo } from "react";
import { useParams, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { money, arabicDate } from "@/components/accounting/ui";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Receipt,
  Printer,
  RefreshCw,
  Phone,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  AlertCircle,
  Building2,
  TrendingUp,
  ReceiptText,
} from "lucide-react";

export default function PublicStatementPage() {
  const params = useParams<{ token?: string }>();
  const searchString = useSearch();

  // Extract token from either route params (/statement/:token) or query string (?token=...)
  const token = useMemo(() => {
    if (params.token) return params.token;
    const urlParams = new URLSearchParams(searchString);
    return urlParams.get("token") || "";
  }, [params.token, searchString]);

  const [activeFilter, setActiveFilter] = useState<"all" | "invoices" | "receipts">("all");

  const query = trpc.accounting.publicContactStatement.useQuery(
    { token },
    {
      enabled: Boolean(token),
      refetchOnWindowFocus: true,
      retry: 1,
    }
  );

  const data = query.data;

  // Build unified chronological ledger
  const unifiedLedger = useMemo(() => {
    if (!data) return [];

    const list: Array<{
      id: string;
      date: string;
      type: "invoice" | "receipt" | "merchant_credit" | "merchant_debit" | "expense";
      typeLabel: string;
      reference: string;
      notes: string;
      debit: number; // مدين (عليه)
      credit: number; // دائن (له / سدده)
    }> = [];

    // Invoices
    (data.invoices || []).forEach(inv => {
      const isCredit = inv.type === "credit";
      list.push({
        id: `inv-${inv.id}`,
        date: inv.issueDate,
        type: "invoice",
        typeLabel: isCredit ? "فاتورة آجلة" : "فاتورة نقدية",
        reference: inv.invoiceNumber,
        notes: inv.notes || (isCredit ? "مبيعات آجلة" : "مبيعات نقدية"),
        debit: Number(inv.totalAmount || 0),
        credit: isCredit ? 0 : Number(inv.totalAmount || 0), // if cash, immediately paid
      });
    });

    // Receipts
    (data.receipts || []).forEach(rec => {
      list.push({
        id: `rec-${rec.id}`,
        date: rec.receiptDate,
        type: "receipt",
        typeLabel: "سند قبض / سداد",
        reference: rec.receiptNumber,
        notes: rec.notes || "سداد دفعة من الحساب",
        debit: 0,
        credit: Number(rec.amount || 0),
      });
    });

    // Merchant Transactions (if any)
    (data.merchantTransactions || []).forEach(tx => {
      const isCredit = tx.direction === "credit"; // له (مشتريات بضاعة)
      list.push({
        id: `mtx-${tx.id}`,
        date: tx.transactionDate,
        type: isCredit ? "merchant_credit" : "merchant_debit",
        typeLabel: isCredit ? "فاتورة مشتريات" : "حوالة / سداد تاجر",
        reference: tx.referenceNumber || `TX-${tx.id}`,
        notes: tx.notes || (isCredit ? "قيد مشتريات" : "سداد / حوالة"),
        debit: isCredit ? 0 : Number(tx.amount || 0),
        credit: isCredit ? Number(tx.amount || 0) : 0,
      });
    });

    // Sort ascending by date for accurate running balance
    list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = 0;
    return list.map(item => {
      // Net running balance: debit increases what they owe, credit decreases it
      running += item.debit - item.credit;
      return {
        ...item,
        balanceAfter: running,
      };
    }).reverse(); // Display most recent first
  }, [data]);

  const filteredLedger = useMemo(() => {
    if (activeFilter === "invoices") {
      return unifiedLedger.filter(i => i.type === "invoice" || i.type === "merchant_credit");
    }
    if (activeFilter === "receipts") {
      return unifiedLedger.filter(i => i.type === "receipt" || i.type === "merchant_debit");
    }
    return unifiedLedger;
  }, [unifiedLedger, activeFilter]);

  // Overall financial totals
  const totals = useMemo(() => {
    if (!data) return { totalDebit: 0, totalCredit: 0, netBalance: 0 };
    let debit = 0;
    let credit = 0;

    (data.invoices || []).forEach(inv => {
      debit += Number(inv.totalAmount || 0);
      if (inv.type !== "credit") {
        credit += Number(inv.totalAmount || 0);
      }
    });

    (data.receipts || []).forEach(rec => {
      credit += Number(rec.amount || 0);
    });

    if (data.merchantTotals) {
      credit += Number(data.merchantTotals.totalCredit || 0);
      debit += Number(data.merchantTotals.totalDebit || 0);
    }

    return {
      totalDebit: debit,
      totalCredit: credit,
      netBalance: debit - credit,
    };
  }, [data]);

  // Loading state
  if (query.isLoading) {
    return (
      <div className="min-h-screen bg-[#f3f7f6] flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-3xl p-8 shadow-xl max-w-md w-full text-center space-y-4 border border-[#e1ece8]">
          <div className="w-16 h-16 rounded-2xl bg-[#eff8f5] text-[#0a6372] flex items-center justify-center mx-auto animate-pulse">
            <RefreshCw className="h-8 w-8 animate-spin" />
          </div>
          <h2 className="text-xl font-extrabold text-[#083f4c]">شبكة الشامل للواي فاي</h2>
          <p className="text-sm text-slate-500">جارٍ جلب وتحديث كشف الحساب من السيرفر...</p>
        </div>
      </div>
    );
  }

  // Error state or invalid token
  if (query.isError || !data || !token) {
    return (
      <div className="min-h-screen bg-[#f3f7f6] flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-3xl p-8 shadow-xl max-w-md w-full text-center space-y-5 border border-rose-200">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-extrabold text-slate-800">رابط كشف الحساب غير صالح</h2>
          <p className="text-sm leading-6 text-slate-600">
            عذراً، هذا الرابط غير صحيح أو قد تم إيقافه أو تجديده من قبل إدارة الشبكة.
            يرجى طلب رابط جديد من مسؤول شبكة الشامل للواي فاي.
          </p>
          <div className="pt-2 text-xs font-bold text-slate-500 flex items-center justify-center gap-1.5">
            <Phone className="h-4 w-4 text-[#0a6372]" />
            <span>خدمة العملاء: 777600474</span>
          </div>
        </div>
      </div>
    );
  }

  const { contact } = data;
  const isMerchant = contact.type === "supplier";
  const typeLabel =
    contact.type === "grocery"
      ? "بقالة"
      : contact.type === "customer"
      ? "عميل"
      : contact.type === "supplier"
      ? "تاجر / مورد"
      : "حساب معتمد";

  return (
    <div className="min-h-screen bg-[#f1f6f5] py-4 sm:py-8 px-3 sm:px-6 print:bg-white print:p-0" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">

        {/* Top Header Card */}
        <div className="rounded-3xl bg-white p-5 sm:p-6 shadow-sm border border-[#e1ece8] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <img
              src="/api/app/app-icon.svg"
              alt="شعار الشبكة"
              className="h-14 w-14 rounded-2xl border border-[#d4e5e0] bg-[#f8fbfb] p-1.5 object-contain shadow-sm"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-[#eaf7f2] px-2 py-0.5 text-[11px] font-bold text-[#08735d]">
                  كشف حساب عميل
                </span>
                <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  للعرض فقط (آمن)
                </span>
              </div>
              <h1 className="mt-1 text-xl sm:text-2xl font-black text-[#083f4c]">شبكة الشامل للواي فاي</h1>
              <p className="text-xs text-slate-500">الإدارة العامة • هاتف: 777600474</p>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden self-end sm:self-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              className="h-10 rounded-xl border-[#bcd9d2] text-[#0a6372] hover:bg-[#eff8f5] font-bold"
            >
              <RefreshCw className={`ml-1.5 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
              تحديث
            </Button>
            <Button
              size="sm"
              onClick={() => window.print()}
              className="h-10 rounded-xl bg-[#0a6372] hover:bg-[#084e5a] text-white font-bold shadow-sm"
            >
              <Printer className="ml-1.5 h-4 w-4" />
              طباعة / PDF
            </Button>
          </div>
        </div>

        {/* Client Identity & Primary Balance Card */}
        <div className="rounded-3xl bg-white p-5 sm:p-6 shadow-sm border border-[#e1ece8] space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#edf3f1] pb-4 gap-3">
            <div>
              <span className="text-xs font-bold text-slate-400">اسم الحساب / البقالة:</span>
              <h2 className="text-2xl font-black text-[#083f4c] mt-0.5">{contact.name}</h2>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-600">{typeLabel}</span>
                {contact.phone ? (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3 text-slate-400" />
                    {contact.phone}
                  </span>
                ) : null}
                {contact.address ? <span>• {contact.address}</span> : null}
              </div>
            </div>

            <div className="text-left">
              <span className="text-[11px] font-bold text-slate-400">تاريخ الكشف:</span>
              <p className="text-xs font-bold text-slate-600 mt-0.5">
                {new Date().toLocaleDateString("ar-YE", { year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>
          </div>

          {/* Large Highlighted Balance Block */}
          <div
            className={`rounded-2xl p-5 border text-center sm:text-right flex flex-col sm:flex-row items-center justify-between gap-4 ${
              totals.netBalance > 0
                ? "bg-amber-50/70 border-amber-200 text-amber-950"
                : totals.netBalance < 0
                ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                : "bg-slate-50 border-slate-200 text-slate-800"
            }`}
          >
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                {totals.netBalance > 0
                  ? "المبلغ المتبقي والمستحق عليك (مدين)"
                  : totals.netBalance < 0
                  ? "الرصيد الدائن لك (فائض / لك)"
                  : "الحساب متزن وخالص تماماً"}
              </p>
              <div className="text-3xl sm:text-4xl font-black">
                {money(Math.abs(totals.netBalance), "YER")}
              </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-6 border-t sm:border-t-0 sm:border-r border-slate-200/80 pt-3 sm:pt-0 sm:pr-6 text-xs">
              <div className="text-center">
                <span className="text-slate-400 font-bold block mb-0.5">إجمالي المبيعات</span>
                <span className="font-extrabold text-slate-700 text-sm sm:text-base">
                  {money(totals.totalDebit, "YER")}
                </span>
              </div>
              <div className="text-center">
                <span className="text-slate-400 font-bold block mb-0.5">إجمالي السدادات</span>
                <span className="font-extrabold text-emerald-700 text-sm sm:text-base">
                  {money(totals.totalCredit, "YER")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={() => setActiveFilter("all")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeFilter === "all"
                ? "bg-[#0a6372] text-white shadow-sm"
                : "bg-white text-slate-600 border border-[#dce8e5] hover:bg-[#eff8f5]"
            }`}
          >
            جميع الحركات ({unifiedLedger.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("invoices")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeFilter === "invoices"
                ? "bg-[#0a6372] text-white shadow-sm"
                : "bg-white text-slate-600 border border-[#dce8e5] hover:bg-[#eff8f5]"
            }`}
          >
            الفواتير والمشتريات
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("receipts")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeFilter === "receipts"
                ? "bg-[#0a6372] text-white shadow-sm"
                : "bg-white text-slate-600 border border-[#dce8e5] hover:bg-[#eff8f5]"
            }`}
          >
            السندات والدفعات
          </button>
        </div>

        {/* Detailed Transactions Ledger */}
        <div className="rounded-3xl bg-white shadow-sm border border-[#e1ece8] overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-[#edf3f1] flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-[#083f4c] text-base sm:text-lg">سجل العمليات والحركات</h3>
              <p className="text-xs text-slate-500 mt-0.5">تفاصيل الفواتير والسندات مرتبة من الأحدث إلى الأقدم</p>
            </div>
            <span className="text-xs font-bold text-slate-500 bg-[#f1f6f5] px-2.5 py-1 rounded-lg">
              {filteredLedger.length} عملية
            </span>
          </div>

          {filteredLedger.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <FileText className="h-10 w-10 mx-auto text-slate-300" />
              <p className="text-sm font-bold">لا توجد حركات مسجلة حالياً ضمن هذا التصنيف</p>
            </div>
          ) : (
            <div className="divide-y divide-[#edf3f1]">
              {filteredLedger.map(item => {
                const isDebit = item.debit > 0;
                return (
                  <div key={item.id} className="p-4 sm:p-5 hover:bg-[#fafdfc] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          isDebit
                            ? "bg-amber-100/60 text-amber-800"
                            : "bg-emerald-100/60 text-emerald-800"
                        }`}
                      >
                        {isDebit ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownLeft className="h-5 w-5" />}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-[#083f4c] text-sm sm:text-base">
                            {item.reference}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                              isDebit
                                ? "bg-amber-50 text-amber-900 border border-amber-200/60"
                                : "bg-emerald-50 text-emerald-900 border border-emerald-200/60"
                            }`}
                          >
                            {item.typeLabel}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">{item.notes}</p>
                        <p className="text-[11px] text-slate-400 font-medium">
                          {arabicDate(item.date)}
                        </p>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 font-bold block sm:hidden">المبلغ:</span>
                        <span
                          className={`text-base font-black ${
                            isDebit ? "text-amber-800" : "text-emerald-700"
                          }`}
                        >
                          {isDebit ? `+ ${money(item.debit, "YER")}` : `- ${money(item.credit, "YER")}`}
                        </span>
                      </div>
                      <div className="text-left sm:text-right mt-0.5">
                        <span className="text-[11px] text-slate-400 font-bold">
                          الرصيد: {money(item.balanceAfter, "YER")}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Note */}
        <div className="p-4 text-center text-xs text-slate-400 space-y-1 print:border-t print:pt-4">
          <p>هذا الكشف صادر آلياً من نظام شبكة الشامل للواي فاي المحاسبي • محدث لحظياً</p>
          <p>لأي استفسار أو مراجعة يرجى التواصل مع إدارة الشبكة على الرقم: 777600474</p>
        </div>

      </div>
    </div>
  );
}
