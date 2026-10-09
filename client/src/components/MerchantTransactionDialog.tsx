import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { whatsappUrl } from "@/lib/whatsapp";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, MessageCircle, Package, Send, Store, Wallet } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

export type MerchantTransactionMode = "credit" | "debit" | null; // credit = له, debit = عليه

interface MerchantTransactionDialogProps {
  merchant: { id: number; name: string; phone?: string | null };
  mode: MerchantTransactionMode;
  onClose: () => void;
  onSuccess: () => void;
}

export function MerchantTransactionDialog({
  merchant,
  mode,
  onClose,
  onSuccess,
}: MerchantTransactionDialogProps) {
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"YER" | "SAR" | "USD">("YER");
  const [rate, setRate] = useState("1");
  const [details, setDetails] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cashAccountId, setCashAccountId] = useState("");
  const [deductFromCash, setDeductFromCash] = useState(true);
  const [notes, setNotes] = useState("");
  const [savedSuccessData, setSavedSuccessData] = useState<{
    txId: number;
    amount: string;
    invoiceNumber: string;
    details: string;
    direction: "credit" | "debit";
  } | null>(null);

  const utils = trpc.useUtils();
  const cashQuery = trpc.accounting.cashSummary.useQuery();

  useEffect(() => {
    if (mode === "credit" || mode === "debit") {
      setDirection(mode);
      setSavedSuccessData(null);
    }
  }, [mode]);

  useEffect(() => {
    if (direction === "debit" && !cashAccountId && cashQuery.data?.accounts[0]) {
      setCashAccountId(String(cashQuery.data.accounts[0].id));
    }
  }, [direction, cashAccountId, cashQuery.data?.accounts]);

  const createMutation = trpc.accounting.createMerchantTransaction.useMutation({
    onSuccess: async result => {
      await Promise.all([
        utils.accounting.contactStatement.invalidate({ contactId: merchant.id }),
        utils.accounting.merchantTransactions.invalidate({ contactId: merchant.id }),
        utils.accounting.cashSummary.invalidate(),
        utils.accounting.dashboard.invalidate(),
      ]);

      const savedData = {
        txId: result.id,
        amount,
        invoiceNumber,
        details,
        direction,
      };
      setSavedSuccessData(savedData);

      toast.success(
        direction === "credit"
          ? "تم تسجيل بضاعة مسحوبة (له) بنجاح"
          : "تم تسجيل مبلغ الحوالة (عليه) بنجاح",
      );
      onSuccess();
    },
    onError: error => {
      toast.error(error.message);
    },
  });

  function resetForm() {
    setInvoiceNumber("");
    setAmount("");
    setDetails("");
    setNotes("");
    setDate(new Date().toISOString().slice(0, 10));
    setSavedSuccessData(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!amount || Number(amount) <= 0) {
      toast.error("يرجى إدخال مبلغ صحيح أكبر من الصفر");
      return;
    }

    createMutation.mutate({
      contactId: merchant.id,
      direction,
      transactionType: direction === "credit" ? "purchase" : "transfer",
      invoiceNumber: invoiceNumber.trim() || undefined,
      transferAmount: direction === "debit" ? amount.trim() : undefined,
      amount: amount.trim(),
      currencyCode: currency,
      exchangeRateToBase: currency === "YER" ? "1" : rate,
      details: details.trim() || undefined,
      transactionDate: new Date(`${date}T12:00:00`),
      cashAccountId: direction === "debit" && cashAccountId ? Number(cashAccountId) : undefined,
      deductFromCash: direction === "debit" && deductFromCash,
      notes: notes.trim() || undefined,
    });
  }

  const isCredit = direction === "credit";
  const isOpen = mode !== null;

  // Build WhatsApp preview message
  const whatsappMsg = savedSuccessData
    ? [
        `السلام عليكم ورحمة الله وبركاته،`,
        `التاجر الكريم: *${merchant.name}*،`,
        savedSuccessData.direction === "credit"
          ? `تم قيد فاتورة بضاعة مسحوبة لحسابكم بمبلغ: *${Number(savedSuccessData.amount).toLocaleString()} ${currency === "YER" ? "ر.ي" : currency}*`
          : `تم تحويل مبلغ وسداده لحسابكم (حوالة) بمبلغ: *${Number(savedSuccessData.amount).toLocaleString()} ${currency === "YER" ? "ر.ي" : currency}*`,
        savedSuccessData.invoiceNumber ? `▪️ رقم الفاتورة / الإشعار: #${savedSuccessData.invoiceNumber}` : "",
        savedSuccessData.details ? `▪️ التفاصيل والتسعير: ${savedSuccessData.details}` : "",
        `شاكرين ومقدرين تعاملكم الطيب،`,
        `الشامل لخدمات الإنترنت`,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const whatsappHref = whatsappUrl(merchant.phone, whatsappMsg);

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) handleClose(); }}>
      <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-violet-700">
              <Store className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle className="text-lg font-black text-[#083f4c]">
                حركة تاجر — {merchant.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                سجّل ما سحبته من بضاعة أو الحوالات المسددة للتاجر مع التسعير والتفاصيل.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {savedSuccessData ? (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-[#083f4c]">تم تسجيل العملية بنجاح!</h3>
              <p className="mt-1 text-sm text-slate-600">
                {savedSuccessData.direction === "credit" ? "تم قيد بضاعة مسحوبة (له)" : "تم قيد مبلغ الحوالة (عليه)"} بمبلغ{" "}
                <b className="text-[#0a6372]">{Number(savedSuccessData.amount).toLocaleString()} {currency}</b>
              </p>
            </div>

            {whatsappHref ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-right">
                <p className="text-xs font-bold text-emerald-800">إشعار التاجر عبر واتساب:</p>
                <p className="mt-1 whitespace-pre-line text-xs text-slate-700">{whatsappMsg}</p>
                <div className="mt-3 flex justify-end">
                  <Button
                    asChild
                    size="sm"
                    className="bg-[#25D366] text-white hover:bg-[#1faa52]"
                  >
                    <a href={whatsappHref} target="_blank" rel="noreferrer">
                      <MessageCircle className="ml-1.5 h-4 w-4" />
                      إرسال الإشعار لواتساب التاجر
                    </a>
                  </Button>
                </div>
              </div>
            ) : null}

            <DialogFooter className="mt-4 gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleClose}>
                إغلاق
              </Button>
              <Button
                onClick={() => {
                  resetForm();
                }}
                className="bg-[#0a6372] hover:bg-[#084e5a]"
              >
                إضافة حركة أخرى لهذا التاجر
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {/* Direction Selector: له vs عليه */}
            <div className="space-y-1.5">
              <Label className="text-xs font-black text-[#083f4c]">نوع القيد مع التاجر:</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDirection("credit")}
                  className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-extrabold transition-all ${
                    direction === "credit"
                      ? "border-amber-500 bg-amber-50 text-amber-900 shadow-sm ring-2 ring-amber-400"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <ArrowDownLeft className="h-4 w-4 text-amber-600" />
                  <span>له (بضاعة مسحوبة)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDirection("debit")}
                  className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-extrabold transition-all ${
                    direction === "debit"
                      ? "border-emerald-600 bg-emerald-50 text-emerald-900 shadow-sm ring-2 ring-emerald-400"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                  <span>عليه (مبلغ حوالة / سداد)</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                {direction === "credit"
                  ? "• (له): عندما تسحب بضاعة أو كروت أو أجهزة من التاجر ويكون مستحقاً له."
                  : "• (عليه): عندما ترسل حوالة أو تسدد دفعة للتاجر لتخفيض حسابه."}
              </p>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              {/* رقم الفاتورة */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#083f4c]">رقم الفاتورة</Label>
                <Input
                  value={invoiceNumber}
                  onChange={event => setInvoiceNumber(event.target.value)}
                  placeholder="مثال: 1045 أو INV-202"
                  className="h-10"
                />
                <p className="text-[10px] text-slate-400">رقم فاتورة التاجر أو رقم سند الحوالة</p>
              </div>

              {/* مبلغ الحوالة أو مبلغ الفاتورة */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#083f4c]">
                  {isCredit ? "مبلغ الفاتورة / البضاعة" : "مبلغ الحوالة"}
                </Label>
                <Input
                  required
                  inputMode="decimal"
                  value={amount}
                  onChange={event => setAmount(event.target.value)}
                  placeholder="0.00"
                  autoFocus
                  className="h-10 text-base font-extrabold text-[#083f4c]"
                />
              </div>

              {/* العملة */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#083f4c]">العملة</Label>
                <select
                  value={currency}
                  onChange={event => {
                    const c = event.target.value as "YER" | "SAR" | "USD";
                    setCurrency(c);
                    if (c === "YER") setRate("1");
                  }}
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#0a6372]"
                >
                  <option value="YER">ريال يمني (YER)</option>
                  <option value="SAR">ريال سعودي (SAR)</option>
                  <option value="USD">دولار أمريكي (USD)</option>
                </select>
              </div>

              {/* التاريخ */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#083f4c]">تاريخ الحركة</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={event => setDate(event.target.value)}
                  className="h-10"
                />
              </div>
            </div>

            {/* إذا كانت العملة أجنبية: سعر الصرف */}
            {currency !== "YER" ? (
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#083f4c]">سعر الصرف إلى الريال اليمني</Label>
                <Input
                  inputMode="decimal"
                  value={rate}
                  onChange={event => setRate(event.target.value)}
                  placeholder="سعر الصرف"
                  className="h-10"
                />
              </div>
            ) : null}

            {/* التفاصيل والتسعير */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-[#083f4c]">
                  التفاصيل والتسعير <span className="text-slate-400 font-normal">(عشان تعرف كم سعرت من التاجر)</span>
                </Label>
              </div>
              <Textarea
                rows={3}
                value={details}
                onChange={event => setDetails(event.target.value)}
                placeholder={
                  isCredit
                    ? "اكتب تفاصيل البضاعة وأسعار القطع المسحوبة، مثلاً: 10 راوترات توتو لينك بسعر 5000 للواحد، 3 بكرات كيبل كات6 بسعر 4000..."
                    : "اكتب تفاصيل الحوالة، مثلاً: حوالة عبر بنك القطيبي / الكريمي لسداد فاتورة رقم 1045..."
                }
                className="text-sm leading-relaxed"
              />
              <p className="text-[11px] text-slate-500">
                هذه التفاصيل ستظهر في كشف حساب التاجر لتراجع كم سعر هذا التاجر في أي وقت.
              </p>
            </div>

            {/* إذا كانت الحركة "عليه" (سداد/حوالة): الصندوق أو البنك المدفوع منه */}
            {!isCredit ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#083f4c]">
                  <Wallet className="h-4 w-4 text-[#0a6372]" />
                  <span>طريقة سداد الحوالة (اختياري):</span>
                </div>
                <div className="space-y-2">
                  <select
                    value={cashAccountId}
                    onChange={event => setCashAccountId(event.target.value)}
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#0a6372]"
                  >
                    <option value="">بدون تحديد صندوق (قيد محاسبي على الحساب فقط)</option>
                    {(cashQuery.data?.accounts ?? []).map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.type === "bank" ? "بنك: " : "صندوق: "} {acc.name}
                      </option>
                    ))}
                  </select>

                  {cashAccountId ? (
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={deductFromCash}
                        onChange={event => setDeductFromCash(event.target.checked)}
                        className="h-4 w-4 accent-[#0a6372]"
                      />
                      <span>خصم مبلغ الحوالة فعلياً من رصيد هذا الصندوق/البنك</span>
                    </label>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* ملاحظات إضافية */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[#083f4c]">ملاحظات إضافية (اختياري)</Label>
              <Input
                value={notes}
                onChange={event => setNotes(event.target.value)}
                placeholder="أي ملاحظة أو رقم سند مرجعي آخر"
                className="h-9 text-xs"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className={
                  isCredit
                    ? "bg-[#b45309] hover:bg-[#92400e]"
                    : "bg-[#08735d] hover:bg-[#065f4c]"
                }
              >
                {createMutation.isPending
                  ? "جارٍ الحفظ..."
                  : isCredit
                  ? "قيد بضاعة مسحوبة (له)"
                  : "قيد مبلغ الحوالة (عليه)"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
