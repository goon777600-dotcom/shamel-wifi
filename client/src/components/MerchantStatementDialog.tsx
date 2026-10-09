import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  formatMerchantDate,
  formatMerchantMoney,
  merchantWhatsAppMessage,
  printMerchantStatement,
  type MerchantContactInfo,
  type MerchantTransactionRow,
} from "@/lib/merchantStatement";
import { whatsappUrl } from "@/lib/whatsapp";
import { ArrowDownLeft, ArrowUpRight, FileSpreadsheet, MessageCircle, Printer, Store } from "lucide-react";

interface MerchantStatementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  merchant: MerchantContactInfo;
  transactions: MerchantTransactionRow[];
  totalCredit: number; // إجمالي المسحوب (له)
  totalDebit: number;  // إجمالي الحوالات (عليه)
  netBalance: number;  // الصافي
  currencyCode?: string;
}

export function MerchantStatementDialog({
  open,
  onOpenChange,
  merchant,
  transactions,
  totalCredit,
  totalDebit,
  netBalance,
  currencyCode = "YER",
}: MerchantStatementDialogProps) {
  function handlePrint() {
    printMerchantStatement({
      merchant,
      transactions,
      totalCredit,
      totalDebit,
      netBalance,
      currencyCode,
      networkName: "الشامل لخدمات الإنترنت",
      location: "يافع الصعيد",
      phone: "777600474",
    });
  }

  const lastInvoice = transactions.filter(t => t.direction === "credit").pop()?.invoiceNumber;
  const lastTransfer = transactions.filter(t => t.direction === "debit").pop()?.invoiceNumber;

  const whatsappText = merchantWhatsAppMessage(merchant.name, {
    totalCredit,
    totalDebit,
    netBalance,
    currencyCode,
    lastInvoice,
    lastTransfer,
  });

  const whatsappHref = whatsappUrl(merchant.phone, whatsappText);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-violet-700">
                <Store className="h-5 w-5" />
              </span>
              <div>
                <DialogTitle className="text-lg font-black text-[#083f4c]">
                  كشف حساب تاجر — {merchant.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  كشف مسطر تسلسلي يوضح البضاعة المسحوبة ومبالغ الحوالات والتسعير مع إمكانية التصدير إلى PDF.
                </DialogDescription>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={handlePrint}
                className="bg-[#0a6372] hover:bg-[#084e5a] font-bold text-xs"
              >
                <Printer className="ml-1.5 h-3.5 w-3.5" />
                طباعة / تصدير PDF
              </Button>
              {whatsappHref ? (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="border-[#25D366] text-[#15803d] hover:bg-[#effcf3] font-bold text-xs"
                >
                  <a href={whatsappHref} target="_blank" rel="noreferrer">
                    <MessageCircle className="ml-1.5 h-3.5 w-3.5" />
                    واتساب
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Summary Cards */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-center">
              <p className="text-xs font-bold text-amber-800">إجمالي البضاعة المسحوبة (له)</p>
              <p className="mt-1 text-lg font-black text-amber-900">
                {formatMerchantMoney(totalCredit, currencyCode)}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-center">
              <p className="text-xs font-bold text-emerald-800">إجمالي الحوالات والمسدد (عليه)</p>
              <p className="mt-1 text-lg font-black text-emerald-900">
                {formatMerchantMoney(totalDebit, currencyCode)}
              </p>
            </div>
            <div className="rounded-xl border border-[#bcd9d2] bg-[#f0fdfa] p-3.5 text-center">
              <p className="text-xs font-bold text-[#083f4c]">الرصيد الصافي المتبقي</p>
              <p
                className="mt-1 text-lg font-black"
                style={{
                  color: netBalance > 0 ? "#b45309" : netBalance < 0 ? "#08735d" : "#083f4c",
                }}
              >
                {formatMerchantMoney(Math.abs(netBalance), currencyCode)}{" "}
                <span className="text-xs font-bold">
                  {netBalance > 0 ? "(له)" : netBalance < 0 ? "(عليه)" : "(خالص)"}
                </span>
              </p>
            </div>
          </div>

          {/* Transactions Ledger Table */}
          <div className="overflow-hidden rounded-2xl border border-[#dce8e5]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-right text-xs">
                <thead className="bg-[#f8fcfb] text-slate-600 font-bold">
                  <tr className="border-b border-[#e8f0ee]">
                    <th className="px-3 py-2.5 text-center" style={{ width: "35px" }}>#</th>
                    <th className="px-3 py-2.5" style={{ width: "90px" }}>التاريخ</th>
                    <th className="px-3 py-2.5 text-center" style={{ width: "110px" }}>نوع القيد</th>
                    <th className="px-3 py-2.5 text-center" style={{ width: "90px" }}>رقم الفاتورة</th>
                    <th className="px-3 py-2.5">التفاصيل والتسعير</th>
                    <th className="px-3 py-2.5 text-left" style={{ width: "100px" }}>المسحوب (له)</th>
                    <th className="px-3 py-2.5 text-left" style={{ width: "100px" }}>الحوالة (عليه)</th>
                    <th className="px-3 py-2.5 text-left" style={{ width: "105px" }}>الرصيد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf3f1]">
                  {transactions.length ? (
                    transactions.map((tx, idx) => {
                      const isCredit = tx.direction === "credit";
                      return (
                        <tr key={tx.id} className="hover:bg-[#fbfdfc] transition-colors">
                          <td className="px-3 py-2.5 text-center text-slate-400 font-bold">{idx + 1}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">
                            {formatMerchantDate(tx.transactionDate)}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                isCredit
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {isCredit ? (
                                <ArrowDownLeft className="h-3 w-3 text-amber-700" />
                              ) : (
                                <ArrowUpRight className="h-3 w-3 text-emerald-700" />
                              )}
                              {isCredit ? "له (بضاعة)" : "عليه (حوالة)"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center font-bold text-[#0a6372]">
                            {tx.invoiceNumber ? `#${tx.invoiceNumber}` : "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-extrabold text-[#083f4c]">
                              {tx.details || (isCredit ? "سحب بضاعة" : "مبلغ حوالة")}
                            </p>
                            {tx.notes ? (
                              <p className="text-[10px] text-slate-500 mt-0.5">ملاحظات: {tx.notes}</p>
                            ) : null}
                            {tx.cashAccountName ? (
                              <p className="text-[10px] text-sky-700 mt-0.5">عبر: {tx.cashAccountName}</p>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 text-left font-bold text-amber-800">
                            {isCredit ? formatMerchantMoney(tx.amount, tx.currencyCode) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-left font-bold text-emerald-700">
                            {!isCredit ? formatMerchantMoney(tx.amount, tx.currencyCode) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-left font-black text-[#083f4c] bg-slate-50/50">
                            {tx.runningBalance !== undefined
                              ? formatMerchantMoney(tx.runningBalance, tx.currencyCode)
                              : "—"}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-slate-500">
                        لا توجد حركات مسجلة لهذا التاجر حتى الآن.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
