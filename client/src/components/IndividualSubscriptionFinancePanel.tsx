import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { individualSubscriptionFinancialWhatsAppMessage, whatsappUrl } from "@/lib/whatsapp";
import { BadgeMinus, CheckCircle2, CircleDollarSign, MessageCircle, Pencil, Plus, ReceiptText } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

type Account = { id: number; name: string; phone: string | null; status: "active" | "suspended" | "closed" };
type Subscription = { id: number; name: string; status: "active" | "suspended" | "cancelled" };
type Charge = { id: number; subscriptionId: number | null; description: string; currencyCode: string; amount: string; paidAmount: string; discountAmount: string; status: "unpaid" | "partial" | "paid" | "cancelled"; chargedAt: Date; notes: string | null };
type Payment = { id: number; chargeId: number; currencyCode: string; amount: string; paymentDate: Date; notes: string | null };
type Adjustment = { id: number; chargeId: number; currencyCode: string; amount: string; adjustmentDate: Date; notes: string | null };
type Outstanding = { currencyCode: string; amount: string };

const currencyLabel: Record<"YER" | "SAR" | "USD", string> = { YER: "ر.ي", SAR: "ر.س", USD: "$" };
const chargeStatusLabel: Record<Charge["status"], string> = { unpaid: "آجل", partial: "مدفوع جزئياً", paid: "مغلق", cancelled: "ملغي" };
const chargeStatusClass: Record<Charge["status"], string> = { unpaid: "bg-rose-50 text-rose-700 ring-rose-200", partial: "bg-amber-50 text-amber-700 ring-amber-200", paid: "bg-emerald-50 text-emerald-700 ring-emerald-200", cancelled: "bg-slate-100 text-slate-600 ring-slate-200" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label className="font-bold text-[#083f4c]">{label}</Label>{children}</div>;
}

function openWhatsApp(url: string | null) {
  if (!url) return toast.error("أضف رقم واتساب صالحاً للحساب أولاً");
  window.open(url, "_blank", "noopener,noreferrer");
}

function chargeRemaining(charge: Charge) {
  return Math.max(0, Number(charge.amount) - Number(charge.paidAmount) - Number(charge.discountAmount));
}

export function IndividualSubscriptionFinancePanel({ account, subscriptions, charges, payments, adjustments = [], outstandingByCurrency }: { account: Account; subscriptions: Subscription[]; charges: Charge[]; payments: Payment[]; adjustments?: Adjustment[]; outstandingByCurrency: Outstanding[] }) {
  const utils = trpc.useUtils();
  const whatsappSettingsQuery = trpc.accounting.whatsappSettings.useQuery();
  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeEditOpen, setChargeEditOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountEditOpen, setDiscountEditOpen] = useState(false);
  const [chargeForm, setChargeForm] = useState({ subscriptionId: "", description: "اشتراك إنترنت", currencyCode: "YER" as "YER" | "SAR" | "USD", amount: "", notes: "" });
  const [chargeEditForm, setChargeEditForm] = useState({ id: 0, description: "", amount: "", chargedAt: "", notes: "" });
  const [paymentForm, setPaymentForm] = useState({ chargeId: "", amount: "", notes: "" });
  const [discountForm, setDiscountForm] = useState({ chargeId: "", amount: "", notes: "" });
  const [discountEditForm, setDiscountEditForm] = useState({ id: 0, amount: "", adjustmentDate: "", notes: "" });
  const [recentMessage, setRecentMessage] = useState<{ action: "charge_added" | "payment_received"; description: string; amount: string; currencyCode: "YER" | "SAR" | "USD"; dueAmount?: string } | null>(null);

  const refresh = async () => utils.accounting.individualSubscriptionAccountDetail.invalidate({ accountId: account.id });
  const createChargeMutation = trpc.accounting.createIndividualSubscriptionCharge.useMutation({
    onSuccess: async result => {
      setRecentMessage({ action: "charge_added", description: chargeForm.description.trim() || "اشتراك إنترنت", amount: result.amount, currencyCode: result.currencyCode, dueAmount: result.amount });
      await refresh();
      toast.success("تمت إضافة عملية مبلغ الاشتراك");
      setChargeOpen(false);
      setChargeForm({ subscriptionId: "", description: "اشتراك إنترنت", currencyCode: "YER", amount: "", notes: "" });
    },
    onError: error => toast.error(error.message),
  });
  const updateChargeMutation = trpc.accounting.updateIndividualSubscriptionCharge.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("تم تعديل عملية مبلغ الاشتراك");
      setChargeEditOpen(false);
    },
    onError: error => toast.error(error.message),
  });
  const paymentMutation = trpc.accounting.recordIndividualSubscriptionPayment.useMutation({
    onSuccess: async result => {
      const charge = charges.find(item => item.id === Number(paymentForm.chargeId));
      const dueAmount = charge ? (chargeRemaining(charge) - Number(result.amount)).toFixed(2) : undefined;
      setRecentMessage({ action: "payment_received", description: charge?.description ?? "اشتراك إنترنت", amount: result.amount, currencyCode: result.currencyCode as "YER" | "SAR" | "USD", dueAmount });
      await refresh();
      toast.success("تم إنشاء سند القبض وإيداع المبلغ في صندوق اشتراكات الأفراد");
      setPaymentOpen(false);
      setPaymentForm({ chargeId: "", amount: "", notes: "" });
    },
    onError: error => toast.error(error.message),
  });
  const discountMutation = trpc.accounting.createIndividualSubscriptionDiscount.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("تم تسجيل عملية الخصم. لم يتغير صندوق اشتراكات الأفراد");
      setDiscountOpen(false);
      setDiscountForm({ chargeId: "", amount: "", notes: "" });
    },
    onError: error => toast.error(error.message),
  });
  const updateDiscountMutation = trpc.accounting.updateIndividualSubscriptionDiscount.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("تم تعديل عملية الخصم. لم يتغير صندوق اشتراكات الأفراد");
      setDiscountEditOpen(false);
    },
    onError: error => toast.error(error.message),
  });

  const openCharges = useMemo(() => charges.filter(charge => (charge.status === "unpaid" || charge.status === "partial") && chargeRemaining(charge) > 0), [charges]);
  const recentWhatsappUrl = recentMessage ? whatsappUrl(account.phone, individualSubscriptionFinancialWhatsAppMessage(account.name, recentMessage.action, recentMessage, whatsappSettingsQuery.data?.whatsappTemplate)) : null;

  function submitCharge(event: FormEvent) {
    event.preventDefault();
    createChargeMutation.mutate({ accountId: account.id, subscriptionId: chargeForm.subscriptionId ? Number(chargeForm.subscriptionId) : undefined, description: chargeForm.description, currencyCode: chargeForm.currencyCode, amount: chargeForm.amount, initialPaidAmount: "0", chargedAt: new Date(), notes: chargeForm.notes || undefined });
  }
  function submitChargeEdit(event: FormEvent) {
    event.preventDefault();
    if (!chargeEditForm.id) return;
    updateChargeMutation.mutate({ accountId: account.id, chargeId: chargeEditForm.id, description: chargeEditForm.description, amount: chargeEditForm.amount, chargedAt: new Date(chargeEditForm.chargedAt), notes: chargeEditForm.notes || undefined });
  }
  function submitPayment(event: FormEvent) {
    event.preventDefault();
    if (!paymentForm.chargeId) return;
    paymentMutation.mutate({ accountId: account.id, chargeId: Number(paymentForm.chargeId), amount: paymentForm.amount, paymentDate: new Date(), notes: paymentForm.notes || undefined });
  }
  function submitDiscount(event: FormEvent) {
    event.preventDefault();
    if (!discountForm.chargeId) return;
    discountMutation.mutate({ accountId: account.id, chargeId: Number(discountForm.chargeId), amount: discountForm.amount, adjustmentDate: new Date(), notes: discountForm.notes || undefined });
  }
  function submitDiscountEdit(event: FormEvent) {
    event.preventDefault();
    if (!discountEditForm.id) return;
    updateDiscountMutation.mutate({ accountId: account.id, adjustmentId: discountEditForm.id, amount: discountEditForm.amount, adjustmentDate: new Date(discountEditForm.adjustmentDate), notes: discountEditForm.notes || undefined });
  }
  function beginChargeEdit(charge: Charge) {
    setChargeEditForm({ id: charge.id, description: charge.description, amount: charge.amount, chargedAt: new Date(charge.chargedAt).toISOString().slice(0, 10), notes: charge.notes ?? "" });
    setChargeEditOpen(true);
  }
  function beginReceipt(charge: Charge) {
    setPaymentForm({ chargeId: String(charge.id), amount: chargeRemaining(charge).toFixed(2), notes: "" });
    setPaymentOpen(true);
  }
  function beginDiscount(charge: Charge) {
    setDiscountForm({ chargeId: String(charge.id), amount: chargeRemaining(charge).toFixed(2), notes: "" });
    setDiscountOpen(true);
  }
  function beginDiscountEdit(adjustment: Adjustment) {
    setDiscountEditForm({ id: adjustment.id, amount: adjustment.amount, adjustmentDate: new Date(adjustment.adjustmentDate).toISOString().slice(0, 10), notes: adjustment.notes ?? "" });
    setDiscountEditOpen(true);
  }

  return <section className="overflow-hidden rounded-3xl border border-[#bcd9d2] bg-white shadow-sm">
    <div className="border-b border-[#dce8e5] bg-[#f4fbf8] p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#0a6372] text-white"><ReceiptText className="h-5 w-5" /></span><div><h2 className="font-extrabold text-[#083f4c]">عمليات الحساب</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">المبلغ الآجل يبقى على الحساب. سند القبض فقط يودع المال في صندوق اشتراكات الأفراد. الخصم يقلل المتبقي ولا يغير الصندوق.</p></div></div><div className="flex flex-wrap gap-2"><Button disabled={account.status === "closed"} onClick={() => setChargeOpen(true)} className="bg-[#0a6372] hover:bg-[#084e5a]"><Plus className="ml-2 h-4 w-4" />إضافة مبلغ</Button><Button disabled={account.status === "closed" || !openCharges.length} onClick={() => beginReceipt(openCharges[0])} className="bg-[#08735d] hover:bg-[#075d4b]"><ReceiptText className="ml-2 h-4 w-4" />سند قبض</Button></div></div>
      <div className="mt-4 max-w-md rounded-2xl border border-[#d6e8e3] bg-white p-3"><p className="text-xs font-bold text-slate-500">المتبقي على الحساب</p><div className="mt-2 flex flex-wrap gap-2">{outstandingByCurrency.length ? outstandingByCurrency.map(row => <span key={row.currencyCode} className="rounded-lg bg-rose-50 px-2 py-1 text-sm font-extrabold text-rose-700">{row.amount} {currencyLabel[row.currencyCode as keyof typeof currencyLabel] ?? row.currencyCode}</span>) : <span className="text-sm font-bold text-[#08735d]">لا توجد مديونية</span>}</div></div>
    </div>

    {recentMessage ? <div className="flex flex-col gap-3 border-b border-[#dce8e5] bg-[#f0faf6] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-[#08735d]" /><div><p className="font-extrabold text-[#083f4c]">{recentMessage.action === "payment_received" ? "تم إنشاء سند القبض" : "تمت إضافة عملية المبلغ"}</p><p className="mt-1 text-sm text-slate-600">الرسالة لا تُرسل تلقائياً؛ افتح واتساب وراجعها قبل الإرسال.</p></div></div><Button onClick={() => openWhatsApp(recentWhatsappUrl)} className="bg-[#08735d] hover:bg-[#075d4b]"><MessageCircle className="ml-2 h-4 w-4" />إرسال واتساب</Button></div> : null}

    <div className="divide-y divide-[#edf3f1]">{charges.length ? charges.map(charge => { const remaining = chargeRemaining(charge); const currency = currencyLabel[charge.currencyCode as keyof typeof currencyLabel] ?? charge.currencyCode; const isOpen = (charge.status === "unpaid" || charge.status === "partial") && remaining > 0; return <article key={charge.id} className="flex flex-col gap-4 p-4 sm:px-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="flex min-w-0 items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eff8f5] text-[#0a6372]"><ReceiptText className="h-5 w-5" /></span><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold text-[#083f4c]">{charge.description}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${chargeStatusClass[charge.status]}`}>{chargeStatusLabel[charge.status]}</span></div><p className="mt-1 text-sm text-slate-600">المبلغ: <b>{charge.amount} {currency}</b> · المقبوض: <b>{charge.paidAmount} {currency}</b> · الخصم: <b>{charge.discountAmount} {currency}</b> · المتبقي: <b>{remaining.toFixed(2)} {currency}</b></p><p className="mt-1 text-xs text-slate-400">سجل في {new Date(charge.chargedAt).toLocaleDateString("ar-YE")}{charge.notes ? ` · ${charge.notes}` : ""}</p></div></div><Button size="sm" variant="outline" disabled={account.status === "closed"} onClick={() => beginChargeEdit(charge)} className="border-[#0a6372] text-[#0a6372] hover:bg-[#eff8f5]"><Pencil className="ml-1.5 h-4 w-4" />تعديل العملية</Button></div>{isOpen ? <div className="flex flex-wrap gap-2 border-t border-[#edf3f1] pt-3"><Button size="sm" onClick={() => beginReceipt(charge)} className="bg-[#08735d] hover:bg-[#075d4b]"><ReceiptText className="ml-1.5 h-4 w-4" />سند قبض</Button><Button size="sm" variant="outline" onClick={() => beginDiscount(charge)} className="border-amber-500 text-amber-700 hover:bg-amber-50"><BadgeMinus className="ml-1.5 h-4 w-4" />عملية خصم</Button></div> : null}</article>; }) : <div className="p-8 text-center"><CircleDollarSign className="mx-auto h-8 w-8 text-[#c39a39]" /><h3 className="mt-3 font-extrabold text-[#083f4c]">لا توجد عمليات بعد</h3><p className="mt-2 text-sm text-slate-500">أضف مبلغ الاشتراك أولاً، ثم سجّل سند القبض عند استلام المال.</p></div>}</div>

    {payments.length ? <div className="border-t border-emerald-100 bg-emerald-50/50 p-4"><h3 className="flex items-center gap-2 font-extrabold text-emerald-800"><CheckCircle2 className="h-5 w-5" />المبالغ المقبوضة — سندات القبض</h3><div className="mt-3 space-y-2">{payments.slice(0, 5).map(payment => <div key={payment.id} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm"><span className="font-extrabold text-emerald-800">مقبوض · سند #{payment.id} — {payment.amount} {currencyLabel[payment.currencyCode as keyof typeof currencyLabel] ?? payment.currencyCode}</span><span className="text-xs text-emerald-700">{new Date(payment.paymentDate).toLocaleDateString("ar-YE")}{payment.notes ? ` · ${payment.notes}` : ""}</span></div>)}</div></div> : null}
    {adjustments.length ? <div className="border-t border-amber-200 bg-amber-50/60 p-4"><h3 className="flex items-center gap-2 font-extrabold text-amber-800"><BadgeMinus className="h-5 w-5" />عمليات الخصم</h3><div className="mt-3 space-y-2">{adjustments.slice(0, 5).map(adjustment => <div key={adjustment.id} className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"><div><span className="font-extrabold text-amber-800">خصم · {adjustment.amount} {currencyLabel[adjustment.currencyCode as keyof typeof currencyLabel] ?? adjustment.currencyCode}</span><span className="mr-2 text-xs text-amber-700">{new Date(adjustment.adjustmentDate).toLocaleDateString("ar-YE")}{adjustment.notes ? ` · ${adjustment.notes}` : ""}</span></div><Button size="sm" variant="outline" disabled={account.status === "closed"} onClick={() => beginDiscountEdit(adjustment)} className="border-amber-500 bg-white text-amber-800 hover:bg-amber-100"><Pencil className="ml-1.5 h-3.5 w-3.5" />تعديل الخصم</Button></div>)}</div></div> : null}

    <Dialog open={chargeOpen} onOpenChange={setChargeOpen}><DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>إضافة مبلغ اشتراك</DialogTitle><DialogDescription>سجل مبلغاً آجلاً، مثل 183000. لا يدخل الصندوق إلا عند تسجيل سند قبض.</DialogDescription></DialogHeader><form onSubmit={submitCharge} className="space-y-4 py-2"><div className="grid gap-4 sm:grid-cols-2"><Field label="الاشتراك المرتبط"><select value={chargeForm.subscriptionId} onChange={event => { const item = subscriptions.find(subscription => subscription.id === Number(event.target.value)); setChargeForm(current => ({ ...current, subscriptionId: event.target.value, description: item?.name ?? current.description })); }} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#0a6372]"><option value="">بدون ربط إضافي</option>{subscriptions.map(subscription => <option key={subscription.id} value={subscription.id}>{subscription.name}</option>)}</select></Field><Field label="وصف العملية"><Input required value={chargeForm.description} onChange={event => setChargeForm(current => ({ ...current, description: event.target.value }))} placeholder="اشتراك إنترنت" /></Field><Field label="العملة"><select value={chargeForm.currencyCode} onChange={event => setChargeForm(current => ({ ...current, currencyCode: event.target.value as typeof current.currencyCode }))} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#0a6372]"><option value="YER">ريال يمني</option><option value="SAR">ريال سعودي</option><option value="USD">دولار أمريكي</option></select></Field><Field label="المبلغ"><Input required inputMode="decimal" value={chargeForm.amount} onChange={event => setChargeForm(current => ({ ...current, amount: event.target.value }))} placeholder="183000" /></Field></div><Field label="ملاحظات"><Textarea value={chargeForm.notes} onChange={event => setChargeForm(current => ({ ...current, notes: event.target.value }))} placeholder="اختياري" /></Field><DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={() => setChargeOpen(false)}>إلغاء</Button><Button type="submit" disabled={createChargeMutation.isPending} className="bg-[#0a6372] hover:bg-[#084e5a]">{createChargeMutation.isPending ? "جارٍ الحفظ..." : "حفظ العملية"}</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={chargeEditOpen} onOpenChange={setChargeEditOpen}><DialogContent dir="rtl" className="sm:max-w-xl"><DialogHeader><DialogTitle>تعديل عملية المبلغ</DialogTitle><DialogDescription>يمكن تعديل المبلغ والوصف والتاريخ، بشرط ألا يصبح المبلغ أقل من المقبوض أو الخصم المسجل.</DialogDescription></DialogHeader><form onSubmit={submitChargeEdit} className="space-y-4 py-2"><div className="grid gap-4 sm:grid-cols-2"><Field label="وصف العملية"><Input required value={chargeEditForm.description} onChange={event => setChargeEditForm(current => ({ ...current, description: event.target.value }))} /></Field><Field label="المبلغ"><Input required inputMode="decimal" value={chargeEditForm.amount} onChange={event => setChargeEditForm(current => ({ ...current, amount: event.target.value }))} /></Field><Field label="تاريخ العملية"><Input required type="date" value={chargeEditForm.chargedAt} onChange={event => setChargeEditForm(current => ({ ...current, chargedAt: event.target.value }))} /></Field></div><Field label="ملاحظات"><Textarea value={chargeEditForm.notes} onChange={event => setChargeEditForm(current => ({ ...current, notes: event.target.value }))} placeholder="اختياري" /></Field><DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={() => setChargeEditOpen(false)}>إلغاء</Button><Button type="submit" disabled={updateChargeMutation.isPending} className="bg-[#0a6372] hover:bg-[#084e5a]">{updateChargeMutation.isPending ? "جارٍ الحفظ..." : "حفظ التعديل"}</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}><DialogContent dir="rtl" className="sm:max-w-xl"><DialogHeader><DialogTitle>سند قبض اشتراك فردي</DialogTitle><DialogDescription>يسجل قبض العميل ويودع المبلغ في صندوق اشتراكات الأفراد فقط، ولا يغير الصندوق الرئيسي.</DialogDescription></DialogHeader><form onSubmit={submitPayment} className="space-y-4 py-2"><div className="grid gap-4 sm:grid-cols-2"><Field label="عملية المبلغ"><select required value={paymentForm.chargeId} onChange={event => { const charge = openCharges.find(item => item.id === Number(event.target.value)); setPaymentForm(current => ({ ...current, chargeId: event.target.value, amount: charge ? chargeRemaining(charge).toFixed(2) : current.amount })); }} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#0a6372]"><option value="">اختر مبلغاً مستحقاً</option>{openCharges.map(charge => <option key={charge.id} value={charge.id}>{charge.description} — المتبقي {chargeRemaining(charge).toFixed(2)} {currencyLabel[charge.currencyCode as keyof typeof currencyLabel] ?? charge.currencyCode}</option>)}</select></Field><Field label="المبلغ المقبوض"><Input required inputMode="decimal" value={paymentForm.amount} onChange={event => setPaymentForm(current => ({ ...current, amount: event.target.value }))} placeholder="183000" /></Field></div><Field label="ملاحظات"><Textarea value={paymentForm.notes} onChange={event => setPaymentForm(current => ({ ...current, notes: event.target.value }))} placeholder="اختياري" /></Field><DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={() => setPaymentOpen(false)}>إلغاء</Button><Button type="submit" disabled={paymentMutation.isPending} className="bg-[#08735d] hover:bg-[#075d4b]">{paymentMutation.isPending ? "جارٍ الحفظ..." : "حفظ سند القبض"}</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={discountOpen} onOpenChange={setDiscountOpen}><DialogContent dir="rtl" className="sm:max-w-xl"><DialogHeader><DialogTitle>عملية خصم</DialogTitle><DialogDescription>الخصم يقلل المتبقي على العميل فقط. لا يضيف ولا يخصم أي مبلغ من صندوق اشتراكات الأفراد.</DialogDescription></DialogHeader><form onSubmit={submitDiscount} className="space-y-4 py-2"><div className="grid gap-4 sm:grid-cols-2"><Field label="عملية المبلغ"><select required value={discountForm.chargeId} onChange={event => { const charge = openCharges.find(item => item.id === Number(event.target.value)); setDiscountForm(current => ({ ...current, chargeId: event.target.value, amount: charge ? chargeRemaining(charge).toFixed(2) : current.amount })); }} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#0a6372]"><option value="">اختر مبلغاً مستحقاً</option>{openCharges.map(charge => <option key={charge.id} value={charge.id}>{charge.description} — المتبقي {chargeRemaining(charge).toFixed(2)} {currencyLabel[charge.currencyCode as keyof typeof currencyLabel] ?? charge.currencyCode}</option>)}</select></Field><Field label="مبلغ الخصم"><Input required inputMode="decimal" value={discountForm.amount} onChange={event => setDiscountForm(current => ({ ...current, amount: event.target.value }))} placeholder="3000" /></Field></div><Field label="سبب الخصم"><Textarea value={discountForm.notes} onChange={event => setDiscountForm(current => ({ ...current, notes: event.target.value }))} placeholder="اختياري" /></Field><DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={() => setDiscountOpen(false)}>إلغاء</Button><Button type="submit" disabled={discountMutation.isPending} className="bg-amber-600 hover:bg-amber-700">{discountMutation.isPending ? "جارٍ الحفظ..." : "حفظ الخصم"}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={discountEditOpen} onOpenChange={setDiscountEditOpen}><DialogContent dir="rtl" className="sm:max-w-xl"><DialogHeader><DialogTitle>تعديل عملية الخصم</DialogTitle><DialogDescription>يمكن تعديل مبلغ الخصم وتاريخه وسببه. لا يؤثر هذا التعديل في صندوق اشتراكات الأفراد.</DialogDescription></DialogHeader><form onSubmit={submitDiscountEdit} className="space-y-4 py-2"><div className="grid gap-4 sm:grid-cols-2"><Field label="مبلغ الخصم"><Input required inputMode="decimal" value={discountEditForm.amount} onChange={event => setDiscountEditForm(current => ({ ...current, amount: event.target.value }))} /></Field><Field label="تاريخ الخصم"><Input required type="date" value={discountEditForm.adjustmentDate} onChange={event => setDiscountEditForm(current => ({ ...current, adjustmentDate: event.target.value }))} /></Field></div><Field label="سبب الخصم"><Textarea value={discountEditForm.notes} onChange={event => setDiscountEditForm(current => ({ ...current, notes: event.target.value }))} placeholder="اختياري" /></Field><DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={() => setDiscountEditOpen(false)}>إلغاء</Button><Button type="submit" disabled={updateDiscountMutation.isPending} className="bg-amber-600 hover:bg-amber-700">{updateDiscountMutation.isPending ? "جارٍ الحفظ..." : "حفظ تعديل الخصم"}</Button></DialogFooter></form></DialogContent></Dialog>
  </section>;
}
