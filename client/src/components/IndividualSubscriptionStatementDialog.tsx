import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildStatementLedger,
  formatMoney,
  printIndividualSubscriptionStatement,
  type IndividualSubscriptionAccountInfo,
  type IndividualSubscriptionAdjustment,
  type IndividualSubscriptionCharge,
  type IndividualSubscriptionItem,
  type IndividualSubscriptionOutstanding,
  type IndividualSubscriptionPayment,
} from "@/lib/individualSubscriptionStatement";
import { individualSubscriptionStatementWhatsAppMessage, whatsappUrl } from "@/lib/whatsapp";
import { Download, FileText, MessageCircle, Printer, X } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: IndividualSubscriptionAccountInfo;
  subscriptions?: IndividualSubscriptionItem[];
  charges: IndividualSubscriptionCharge[];
  payments: IndividualSubscriptionPayment[];
  adjustments?: IndividualSubscriptionAdjustment[];
  outstandingByCurrency?: IndividualSubscriptionOutstanding[];
  whatsappTemplate?: string | null;
}

export function IndividualSubscriptionStatementDialog({
  open,
  onOpenChange,
  account,
  subscriptions,
  charges,
  payments,
  adjustments,
  outstandingByCurrency,
  whatsappTemplate,
}: Props) {
  const ledger = useMemo(
    () =>
      buildStatementLedger({
        charges,
        payments,
        adjustments,
      }),
    [charges, payments, adjustments]
  );

  function handlePrintPdf() {
    const success = printIndividualSubscriptionStatement({
      account,
      subscriptions,
      charges,
      payments,
      adjustments,
      outstandingByCurrency,
    });
    if (!success) {
      toast.error("يرجى السماح للمتصفح بفتح النوافذ المنبثقة للطباعة وحفظ ملف الـ PDF");
    }
  }

  function handleSendWhatsapp() {
    const summary = {
      totalCharges: ledger.totalDebit.toFixed(2),
      totalPaid: ledger.totalCredit.toFixed(2),
      totalDiscount: ledger.totalDiscount.toFixed(2),
      dueAmount: ledger.finalBalance.toFixed(2),
      currencyCode: ledger.primaryCurrency,
    };
    const msg = individualSubscriptionStatementWhatsAppMessage(
      account.name,
      summary,
      whatsappTemplate
    );
    const url = whatsappUrl(account.phone, msg);
    if (!url) {
      toast.error("أضف رقم هاتف صحيح للمشترك أولاً");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[92vh] max-w-4xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="border-b border-slate-100 pb-4 text-right">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-xl font-black text-[#083f4c]">
                <FileText className="h-6 w-6 text-[#0a6372]" />
                كشف حساب مفصل — {account.name}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs text-slate-500">
                معاينة كشف الحساب التفصيلي مع الرصيد التراكمي وجاهزية الطباعة وتصدير PDF.
              </DialogDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={handlePrintPdf}
                className="bg-[#0a6372] font-bold text-white hover:bg-[#084e5a]"
              >
                <Printer className="ml-1.5 h-4 w-4" />
                طباعة / تصدير PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleSendWhatsapp}
                className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
              >
                <MessageCircle className="ml-1.5 h-4 w-4" />
                إرسال الملخص عبر واتساب
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Financial Summary Cards */}
        <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 text-center">
            <span className="text-xs font-bold text-rose-700">إجمالي الاشتراكات (المطلوب)</span>
            <p className="mt-1.5 text-base font-extrabold text-rose-800">
              {formatMoney(ledger.totalDebit, ledger.primaryCurrency)}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-center">
            <span className="text-xs font-bold text-emerald-700">إجمالي المسدد (سندات القبض)</span>
            <p className="mt-1.5 text-base font-extrabold text-emerald-800">
              {formatMoney(ledger.totalCredit, ledger.primaryCurrency)}
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-center">
            <span className="text-xs font-bold text-amber-700">إجمالي الخصومات</span>
            <p className="mt-1.5 text-base font-extrabold text-amber-800">
              {formatMoney(ledger.totalDiscount, ledger.primaryCurrency)}
            </p>
          </div>
          <div className="rounded-xl border border-[#cfe3dd] bg-[#f7fbfa] p-3 text-center">
            <span className="text-xs font-bold text-[#0a6372]">الرصيد المتبقي المستحق</span>
            <p className="mt-1.5 text-base font-black text-[#083f4c]">
              {formatMoney(ledger.finalBalance, ledger.primaryCurrency)}
            </p>
          </div>
        </div>

        {/* Movements Table */}
        <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
          <table className="w-full min-w-[700px] text-right text-xs">
            <thead className="bg-[#f8fafc] text-slate-600">
              <tr>
                <th className="px-3 py-2.5 font-bold">#</th>
                <th className="px-3 py-2.5 font-bold">التاريخ</th>
                <th className="px-3 py-2.5 font-bold">رقم القيد</th>
                <th className="px-3 py-2.5 font-bold">البيان</th>
                <th className="px-3 py-2.5 font-bold text-left">المبلغ (عليه)</th>
                <th className="px-3 py-2.5 font-bold text-left">المسدد (له)</th>
                <th className="px-3 py-2.5 font-bold text-left">الخصم</th>
                <th className="px-3 py-2.5 font-bold text-left">الرصيد المتبقي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledger.movements.length ? (
                ledger.movements.map((m, idx) => (
                  <tr key={m.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 text-center font-bold text-slate-400">{idx + 1}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{m.dateStr}</td>
                    <td className="px-3 py-2.5 font-bold text-[#0a6372]">{m.reference}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-bold text-[#083f4c]">{m.description}</span>
                      {m.notes && <span className="mr-1 text-slate-400">({m.notes})</span>}
                    </td>
                    <td className="px-3 py-2.5 text-left font-bold text-rose-700">
                      {m.debit > 0 ? formatMoney(m.debit, m.currencyCode) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-left font-bold text-emerald-700">
                      {m.credit > 0 ? formatMoney(m.credit, m.currencyCode) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-left font-bold text-amber-700">
                      {m.discount > 0 ? formatMoney(m.discount, m.currencyCode) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-left font-extrabold text-[#083f4c] bg-slate-50/50">
                      {formatMoney(m.runningBalance, m.currencyCode)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    لا توجد عمليات مسجلة على هذا الحساب.
                  </td>
                </tr>
              )}
            </tbody>
            {ledger.movements.length > 0 && (
              <tfoot className="border-t-2 border-[#cfe3dd] bg-[#f8fafc] font-extrabold">
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-right text-slate-700">
                    الإجمالي العام:
                  </td>
                  <td className="px-3 py-3 text-left text-rose-700">
                    {formatMoney(ledger.totalDebit, ledger.primaryCurrency)}
                  </td>
                  <td className="px-3 py-3 text-left text-emerald-700">
                    {formatMoney(ledger.totalCredit, ledger.primaryCurrency)}
                  </td>
                  <td className="px-3 py-3 text-left text-amber-700">
                    {formatMoney(ledger.totalDiscount, ledger.primaryCurrency)}
                  </td>
                  <td className="px-3 py-3 text-left text-base text-[#083f4c]">
                    {formatMoney(ledger.finalBalance, ledger.primaryCurrency)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <DialogFooter className="mt-4 gap-2 border-t border-slate-100 pt-3 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
          <Button
            type="button"
            onClick={handlePrintPdf}
            className="bg-[#0a6372] font-bold text-white hover:bg-[#084e5a]"
          >
            <Printer className="ml-1.5 h-4 w-4" />
            طباعة / حفظ PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
