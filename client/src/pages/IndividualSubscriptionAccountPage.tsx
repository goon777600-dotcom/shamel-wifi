import { Button } from "@/components/ui/button";
import { IndividualSubscriptionFinancePanel } from "@/components/IndividualSubscriptionFinancePanel";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatCustomerPhone, parseCustomerPhone, type PhoneCountryCode } from "@/lib/customerPhone";
import { trpc } from "@/lib/trpc";
import { individualSubscriptionWhatsAppMessage, whatsappUrl } from "@/lib/whatsapp";
import { IndividualSubscriptionStatementDialog } from "@/components/IndividualSubscriptionStatementDialog";
import { IndividualSubscriptionMessageDialog, type MessagePresetKey } from "@/components/IndividualSubscriptionMessageDialog";
import { ArrowRight, FileText, MessageCircle, Pencil, Printer, Smartphone, UserRound, Wifi } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";
import { accountStatusLabel, statusClasses, subscriptionStatusLabel } from "./IndividualSubscriptionsPage";

type AccountStatus = "active" | "suspended" | "closed";
type SubscriptionStatus = "active" | "suspended" | "cancelled";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label className="font-bold text-[#083f4c]">{label}</Label>{children}</div>;
}

function openWhatsApp(url: string | null) {
  if (!url) {
    toast.error("أضف رقم جوال صالحاً مع رمز اليمن أو السعودية أولاً");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function IndividualSubscriptionAccountPage() {
  const params = useParams<{ accountId: string }>();
  const accountId = Number(params.accountId);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const detailQuery = trpc.accounting.individualSubscriptionAccountDetail.useQuery({ accountId }, { enabled: Number.isInteger(accountId) && accountId > 0 });
  const whatsappSettingsQuery = trpc.accounting.whatsappSettings.useQuery();
  const [accountEditOpen, setAccountEditOpen] = useState(false);
  const [subscriptionEditOpen, setSubscriptionEditOpen] = useState(false);
  const [accountForm, setAccountForm] = useState({ name: "", phone: "", country: "YE" as PhoneCountryCode, status: "active" as AccountStatus, notes: "" });
  const [subscriptionForm, setSubscriptionForm] = useState({ id: 0, name: "", status: "active" as SubscriptionStatus, notes: "" });

  useEffect(() => {
    const account = detailQuery.data?.account;
    if (!account) return;
    const parsed = parseCustomerPhone(account.phone);
    setAccountForm({ name: account.name, phone: parsed.localNumber, country: parsed.country, status: account.status, notes: account.notes ?? "" });
  }, [detailQuery.data?.account]);

  const updateAccountMutation = trpc.accounting.updateIndividualSubscriptionAccount.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.accounting.individualSubscriptionAccountDetail.invalidate({ accountId }), utils.accounting.individualSubscriptionAccounts.invalidate()]);
      toast.success("تم تحديث حساب الاشتراك");
      setAccountEditOpen(false);
    },
    onError: error => toast.error(error.message),
  });
  const updateSubscriptionMutation = trpc.accounting.updateIndividualSubscription.useMutation({
    onSuccess: async () => {
      await utils.accounting.individualSubscriptionAccountDetail.invalidate({ accountId });
      toast.success("تم تعديل بيانات الاشتراك");
      setSubscriptionEditOpen(false);
    },
    onError: error => toast.error(error.message),
  });

  const [statementOpen, setStatementOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageContext, setMessageContext] = useState<any>(null);

  const account = detailQuery.data?.account;
  const subscriptions = detailQuery.data?.subscriptions ?? [];
  const charges = detailQuery.data?.charges ?? [];
  const payments = detailQuery.data?.payments ?? [];
  const adjustments = detailQuery.data?.adjustments ?? [];
  const outstandingByCurrency = detailQuery.data?.outstandingByCurrency ?? [];
  const topWhatsappUrl = account ? whatsappUrl(account.phone, individualSubscriptionWhatsAppMessage(account.name, "account_viewed", undefined, whatsappSettingsQuery.data?.whatsappTemplate)) : null;

  function handleOpenMessageDialog(preset: MessagePresetKey = "reminder") {
    const primaryCurrency = (outstandingByCurrency[0]?.currencyCode || "YER") as "YER" | "SAR" | "USD";
    const primaryOutstanding = outstandingByCurrency[0]?.amount || "0.00";
    const totalChargesSum = charges.reduce((acc, c) => acc + Number(c.amount || 0), 0).toFixed(2);
    const totalPaidSum = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0).toFixed(2);
    const totalDiscountSum = adjustments.reduce((acc, a) => acc + Number(a.amount || 0), 0).toFixed(2);

    setMessageContext({
      action: preset,
      description: subscriptions[0]?.name || "اشتراك إنترنت",
      amount: charges[0]?.amount || "0.00",
      currencyCode: primaryCurrency,
      dueAmount: primaryOutstanding,
      totalCharges: totalChargesSum,
      totalPaid: totalPaidSum,
      totalDiscount: totalDiscountSum,
    });
    setMessageOpen(true);
  }

  function saveAccount(event: FormEvent) {
    event.preventDefault();
    if (!account) return;
    const phone = formatCustomerPhone(accountForm.phone, accountForm.country);
    updateAccountMutation.mutate({ id: account.id, name: accountForm.name, phone: phone || undefined, status: accountForm.status, notes: accountForm.notes || undefined });
  }

  function saveSubscription(event: FormEvent) {
    event.preventDefault();
    if (!subscriptionForm.id) return;
    updateSubscriptionMutation.mutate({ id: subscriptionForm.id, name: subscriptionForm.name, status: subscriptionForm.status, notes: subscriptionForm.notes || undefined });
  }


  if (detailQuery.isLoading) return <div className="space-y-4"><Skeleton className="h-44 w-full rounded-3xl" />{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20 w-full rounded-2xl" />)}</div>;
  if (!account) return <section className="rounded-3xl border border-[#dce8e5] bg-white p-8 text-center"><h1 className="font-extrabold text-[#083f4c]">تعذر العثور على الحساب</h1><p className="mt-2 text-sm text-slate-500">قد يكون الرابط غير صحيح أو أن الحساب لم يعد موجوداً.</p><Button onClick={() => setLocation("/individual-subscriptions")} variant="outline" className="mt-5 border-[#0a6372] text-[#0a6372]">العودة لاشتراكات الأفراد</Button></section>;

  return (
    <div className="space-y-6" dir="rtl">
      <Button onClick={() => setLocation("/individual-subscriptions")} variant="ghost" className="-mr-2 text-[#0a6372] hover:bg-[#eff8f5]"><ArrowRight className="ml-2 h-4 w-4" />العودة إلى اشتراكات الأفراد</Button>
      <section className="overflow-hidden rounded-3xl border border-[#cfe3dd] bg-white shadow-sm">
        <div className="bg-gradient-to-l from-[#083f4c] to-[#0a6372] p-5 text-white sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex min-w-0 items-center gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 text-[#f4d98e]"><UserRound className="h-6 w-6" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-2xl font-extrabold">{account.name}</h1><span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${statusClasses(account.status as AccountStatus)}`}>{accountStatusLabel[account.status as AccountStatus]}</span></div><p className="mt-2 flex items-center gap-1.5 text-sm text-slate-200"><Smartphone className="h-4 w-4" />{account.phone || "لا يوجد رقم واتساب مسجل"}</p></div></div><div className="flex flex-wrap gap-2"><Button onClick={() => setStatementOpen(true)} className="bg-white/15 text-white hover:bg-white/25 border border-white/20"><Printer className="ml-1.5 h-4 w-4" />كشف حساب مفصل (PDF)</Button><Button onClick={() => handleOpenMessageDialog("reminder")} className="bg-[#e9c66d] text-[#083f4c] hover:bg-[#f2d982]"><MessageCircle className="ml-1.5 h-4 w-4" />مراسلة المشترك</Button><Button onClick={() => setAccountEditOpen(true)} variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"><Pencil className="ml-1.5 h-4 w-4" />تعديل بيانات العميل</Button></div></div></div>
        <div className="grid gap-3 p-5 sm:grid-cols-3"><div className="rounded-2xl bg-[#f7fcfa] p-4"><p className="text-xs font-bold text-slate-500">عدد سجلات الاشتراك</p><p className="mt-2 text-2xl font-extrabold text-[#083f4c]">{subscriptions.length}</p></div><div className="rounded-2xl bg-[#f7fcfa] p-4"><p className="text-xs font-bold text-slate-500">الحالة الحالية</p><p className="mt-2 font-extrabold text-[#08735d]">{accountStatusLabel[account.status as AccountStatus]}</p></div><div className="rounded-2xl bg-[#f7fcfa] p-4"><p className="text-xs font-bold text-slate-500">ملاحظات الحساب</p><p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-700">{account.notes || "لا توجد ملاحظات"}</p></div></div>
      </section>

      <IndividualSubscriptionFinancePanel account={{ id: account.id, name: account.name, phone: account.phone, status: account.status as AccountStatus }} subscriptions={subscriptions} charges={charges} payments={payments} adjustments={adjustments} outstandingByCurrency={outstandingByCurrency} />

      <section className="overflow-hidden rounded-3xl border border-[#dce8e5] bg-white shadow-sm"><div className="border-b border-[#e8f0ee] p-4"><h2 className="font-extrabold text-[#083f4c]">سجل الاشتراكات</h2><p className="mt-1 text-sm text-slate-500">للمراجعة فقط؛ المبالغ وسندات القبض تُسجل من الحساب المالي أعلاه.</p></div>{subscriptions.length ? <div className="divide-y divide-[#edf3f1]">{subscriptions.map(subscription => <article key={subscription.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="flex min-w-0 items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eff8f5] text-[#0a6372]"><Wifi className="h-5 w-5" /></span><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold text-[#083f4c]">{subscription.name}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusClasses(subscription.status)}`}>{subscriptionStatusLabel[subscription.status]}</span></div><p className="mt-1 text-sm text-slate-500">{subscription.notes || "لا توجد ملاحظات"}</p></div></div><Button size="sm" variant="outline" disabled={account.status === "closed"} onClick={() => { setSubscriptionForm({ id: subscription.id, name: subscription.name, status: subscription.status, notes: subscription.notes ?? "" }); setSubscriptionEditOpen(true); }} className="border-[#0a6372] text-[#0a6372] hover:bg-[#eff8f5]"><Pencil className="ml-1.5 h-4 w-4" />تعديل</Button></article>)}</div> : <div className="p-8 text-center"><Wifi className="mx-auto h-8 w-8 text-[#c39a39]" /><h3 className="mt-3 font-extrabold text-[#083f4c]">لا يوجد اشتراك مسجل</h3><p className="mt-2 text-sm text-slate-500">يمكن إضافة مبلغ الاشتراك مباشرة من الحساب المالي.</p></div>}</section>

      <Dialog open={accountEditOpen} onOpenChange={setAccountEditOpen}><DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>تعديل حساب الاشتراك</DialogTitle><DialogDescription>لا يؤثر هذا التعديل في العملاء التجاريين أو الفواتير أو الصندوق.</DialogDescription></DialogHeader><form onSubmit={saveAccount} className="space-y-4 py-2"><div className="grid gap-4 sm:grid-cols-2"><Field label="اسم المشترك"><Input required value={accountForm.name} onChange={event => setAccountForm(current => ({ ...current, name: event.target.value }))} /></Field><Field label="حالة الحساب"><select value={accountForm.status} onChange={event => setAccountForm(current => ({ ...current, status: event.target.value as AccountStatus }))} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#0a6372]"><option value="active">نشط</option><option value="suspended">موقوف</option><option value="closed">مغلق</option></select></Field><Field label="رمز الدولة"><select value={accountForm.country} onChange={event => setAccountForm(current => ({ ...current, country: event.target.value as PhoneCountryCode }))} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#0a6372]"><option value="YE">اليمن +967</option><option value="SA">السعودية +966</option></select></Field><Field label="رقم جوال / واتساب"><Input value={accountForm.phone} onChange={event => setAccountForm(current => ({ ...current, phone: event.target.value.replace(/\D/g, "") }))} inputMode="tel" placeholder="777000000 أو 5XXXXXXXX" /></Field></div><Field label="ملاحظات"><Textarea value={accountForm.notes} onChange={event => setAccountForm(current => ({ ...current, notes: event.target.value }))} /></Field><DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={() => setAccountEditOpen(false)}>إلغاء</Button><Button type="submit" disabled={updateAccountMutation.isPending} className="bg-[#0a6372] hover:bg-[#084e5a]">{updateAccountMutation.isPending ? "جارٍ الحفظ..." : "حفظ التعديل"}</Button></DialogFooter></form></DialogContent></Dialog>
      <Dialog open={subscriptionEditOpen} onOpenChange={setSubscriptionEditOpen}><DialogContent dir="rtl" className="sm:max-w-xl"><DialogHeader><DialogTitle>تعديل الاشتراك</DialogTitle><DialogDescription>تعديل اسم الاشتراك أو حالته أو ملاحظاته لا يغير أي مبلغ أو سند قبض.</DialogDescription></DialogHeader><form onSubmit={saveSubscription} className="space-y-4 py-2"><div className="grid gap-4 sm:grid-cols-2"><Field label="اسم الاشتراك"><Input required value={subscriptionForm.name} onChange={event => setSubscriptionForm(current => ({ ...current, name: event.target.value }))} /></Field><Field label="حالة الاشتراك"><select value={subscriptionForm.status} onChange={event => setSubscriptionForm(current => ({ ...current, status: event.target.value as SubscriptionStatus }))} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#0a6372]"><option value="active">فعّال</option><option value="suspended">موقوف</option><option value="cancelled">ملغي</option></select></Field></div><Field label="ملاحظات"><Textarea value={subscriptionForm.notes} onChange={event => setSubscriptionForm(current => ({ ...current, notes: event.target.value }))} placeholder="اختياري" /></Field><DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={() => setSubscriptionEditOpen(false)}>إلغاء</Button><Button type="submit" disabled={updateSubscriptionMutation.isPending} className="bg-[#0a6372] hover:bg-[#084e5a]">{updateSubscriptionMutation.isPending ? "جارٍ الحفظ..." : "حفظ التعديل"}</Button></DialogFooter></form></DialogContent></Dialog>

      <IndividualSubscriptionStatementDialog
        open={statementOpen}
        onOpenChange={setStatementOpen}
        account={{ id: account.id, name: account.name, phone: account.phone, status: account.status, notes: account.notes }}
        subscriptions={subscriptions}
        charges={charges}
        payments={payments}
        adjustments={adjustments}
        outstandingByCurrency={outstandingByCurrency}
        whatsappTemplate={whatsappSettingsQuery.data?.whatsappTemplate}
      />

      <IndividualSubscriptionMessageDialog
        open={messageOpen}
        onOpenChange={setMessageOpen}
        account={{ id: account.id, name: account.name, phone: account.phone }}
        contextDetails={messageContext}
        whatsappTemplate={whatsappSettingsQuery.data?.whatsappTemplate}
      />
    </div>
  );
}
