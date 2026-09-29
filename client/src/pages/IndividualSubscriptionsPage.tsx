import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatCustomerPhone, type PhoneCountryCode } from "@/lib/customerPhone";
import { exportIndividualSubscriptionsToExcel, filterIndividualSubscriptionAccounts, type IndividualSubscriptionAccountExportStatus, type IndividualSubscriptionExportAccount, type IndividualSubscriptionExportStatus } from "@/lib/individualSubscriptionsExport";
import { trpc } from "@/lib/trpc";
import { individualSubscriptionWhatsAppMessage, whatsappUrl } from "@/lib/whatsapp";
import { CheckCircle2, CircleAlert, Download, MessageCircle, Plus, Search, Smartphone, UserRound, WalletCards, Wifi } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type AccountStatus = "active" | "suspended" | "closed";
type SubscriptionStatus = "active" | "suspended" | "cancelled";
type AccountForm = {
  name: string;
  phone: string;
  country: PhoneCountryCode;
  status: AccountStatus;
  notes: string;
  addInitialSubscription: boolean;
  subscriptionName: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionNotes: string;
};

const blankForm: AccountForm = {
  name: "",
  phone: "",
  country: "YE",
  status: "active",
  notes: "",
  addInitialSubscription: true,
  subscriptionName: "اشتراك إنترنت",
  subscriptionStatus: "active",
  subscriptionNotes: "",
};

const accountStatusLabel: Record<AccountStatus, string> = { active: "نشط", suspended: "موقوف", closed: "مغلق" };
const subscriptionStatusLabel: Record<SubscriptionStatus, string> = { active: "فعّال", suspended: "موقوف", cancelled: "ملغي" };

function statusClasses(status: AccountStatus | SubscriptionStatus) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "suspended") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label className="font-bold text-[#083f4c]">{label}</Label>{children}</div>;
}

export default function IndividualSubscriptionsPage() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const accountsQuery = trpc.accounting.individualSubscriptionAccounts.useQuery();
  const cashQuery = trpc.accounting.individualSubscriptionCash.useQuery();
  const whatsappSettingsQuery = trpc.accounting.whatsappSettings.useQuery();
  const [search, setSearch] = useState("");
  const [accountStatusFilter, setAccountStatusFilter] = useState<"all" | IndividualSubscriptionAccountExportStatus>("all");
  const [subscriptionStatusFilter, setSubscriptionStatusFilter] = useState<"all" | IndividualSubscriptionExportStatus | "without_subscription">("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AccountForm>(blankForm);
  const [recentMessage, setRecentMessage] = useState<{ name: string; phone: string | null; action: "account_opened" | "subscription_added"; subscription?: { name?: string; status?: SubscriptionStatus } } | null>(null);

  const createMutation = trpc.accounting.createIndividualSubscriptionAccount.useMutation({
    onSuccess: async (result) => {
      const phone = formatCustomerPhone(form.phone, form.country) || null;
      setRecentMessage({
        name: form.name.trim(),
        phone,
        action: "account_opened",
        subscription: form.addInitialSubscription ? { name: form.subscriptionName.trim() || "اشتراك إنترنت", status: form.subscriptionStatus } : undefined,
      });
      await utils.accounting.individualSubscriptionAccounts.invalidate();
      toast.success("تم فتح حساب الاشتراك الفردي");
      setOpen(false);
      setForm(blankForm);
      setLocation(`/individual-subscriptions/${result.id}`);
    },
    onError: error => toast.error(error.message),
  });

  const allAccounts = (accountsQuery.data ?? []) as IndividualSubscriptionExportAccount[];
  const filteredAccounts = useMemo(
    () => filterIndividualSubscriptionAccounts(allAccounts, { search, accountStatus: accountStatusFilter, subscriptionStatus: subscriptionStatusFilter }),
    [allAccounts, search, accountStatusFilter, subscriptionStatusFilter],
  );

  function exportAccounts() {
    if (!allAccounts.length) {
      toast.error("لا توجد حسابات اشتراكات لتصديرها حالياً");
      return;
    }
    const rowCount = exportIndividualSubscriptionsToExcel(allAccounts);
    toast.success(`تم تنزيل ملف Excel يضم ${rowCount} سجلاً من اشتراكات الأفراد`);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const phone = formatCustomerPhone(form.phone, form.country);
    createMutation.mutate({
      name: form.name,
      phone: phone || undefined,
      status: form.status,
      notes: form.notes || undefined,
      initialSubscription: form.addInitialSubscription
        ? { name: form.subscriptionName || undefined, status: form.subscriptionStatus, notes: form.subscriptionNotes || undefined }
        : undefined,
    });
  }

  const recentUrl = recentMessage
    ? whatsappUrl(recentMessage.phone, individualSubscriptionWhatsAppMessage(recentMessage.name, recentMessage.action, recentMessage.subscription, whatsappSettingsQuery.data?.whatsappTemplate))
    : null;

  return (
    <div className="space-y-6" dir="rtl">
      <section className="relative overflow-hidden rounded-3xl bg-[#083f4c] px-5 py-6 text-white shadow-lg shadow-[#083f4c]/15 sm:px-7 sm:py-8">
        <div className="absolute -left-10 -top-10 h-44 w-44 rounded-full bg-[#e9c66d]/15 blur-2xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-[#f4d98e]"><WalletCards className="h-3.5 w-3.5" />قسم وصندوق مستقلان عن المحاسبة العامة</div>
            <h1 className="text-2xl font-extrabold sm:text-3xl">اشتراكات الأفراد</h1>
            <p className="mt-3 leading-7 text-slate-200">افتح حساب اشتراك للعميل الفردي وسجّل خدماته ومبالغه وسداداته ببساطة. كل قبض يدخل صندوق اشتراكات الأفراد فقط، ولا يختلط بالعملاء التجاريين أو الصندوق العام.</p>
          </div>
          <Button onClick={() => setOpen(true)} className="h-11 bg-[#e9c66d] px-5 font-extrabold text-[#083f4c] hover:bg-[#f2d982]"><Plus className="ml-2 h-4 w-4" />فتح حساب اشتراك</Button>
        </div>
      </section>

      <section className="rounded-3xl border border-[#bcd9d2] bg-[#f4fbf8] p-4 shadow-sm sm:p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#0a6372] text-white"><WalletCards className="h-5 w-5" /></span><div><h2 className="font-extrabold text-[#083f4c]">صندوق اشتراكات الأفراد</h2><p className="mt-1 text-sm leading-6 text-slate-600">رصيد مستقل داخل هذا القسم. لا يدخل ضمن الصندوق الرئيسي ولا يؤثر فيه.</p></div></div><div className="flex flex-wrap gap-2">{cashQuery.data?.balances.map(balance => <span key={balance.currencyCode} className="rounded-xl border border-[#cfe3dd] bg-white px-3 py-2 text-sm font-extrabold text-[#083f4c]">{balance.balance} {balance.currencyCode === "YER" ? "ر.ي" : balance.currencyCode === "SAR" ? "ر.س" : "$"}</span>)}</div></div></section>

      {recentMessage ? <section className="flex flex-col gap-3 rounded-2xl border border-[#bcd9d2] bg-[#f0faf6] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#08735d]" /><div><p className="font-extrabold text-[#083f4c]">تم حفظ حساب {recentMessage.name}</p><p className="mt-1 text-sm text-slate-600">يمكنك فتح واتساب يدوياً لإرسال رسالة تأكيد الحساب أو الاشتراك.</p></div></div>
        <Button disabled={!recentUrl} onClick={() => { if (recentUrl) window.open(recentUrl, "_blank", "noopener,noreferrer"); }} className="bg-[#08735d] hover:bg-[#075d4b]"><MessageCircle className="ml-2 h-4 w-4" />رسالة واتساب</Button>
      </section> : null}

      <section className="overflow-hidden rounded-3xl border border-[#dce8e5] bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[#e8f0ee] p-4">
          <div><h2 className="font-extrabold text-[#083f4c]">حسابات الاشتراك الفردية</h2><p className="mt-1 text-sm text-slate-500">لا تظهر هنا البقالات أو أي حسابات مالية أخرى.</p></div>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"><div className="grid gap-2 sm:grid-cols-3 lg:min-w-[680px]"><div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={event => setSearch(event.target.value)} className="h-10 border-[#dce8e5] bg-[#fbfdfc] pr-9" placeholder="ابحث بالاسم أو الجوال أو الخدمة" /></div><select aria-label="تصفية حالة الحساب" value={accountStatusFilter} onChange={event => setAccountStatusFilter(event.target.value as typeof accountStatusFilter)} className="h-10 rounded-xl border border-[#dce8e5] bg-white px-3 text-sm font-medium text-[#083f4c] outline-none focus:ring-2 focus:ring-[#0a6372]"><option value="all">كل حالات الحساب</option><option value="active">الحسابات النشطة</option><option value="suspended">الحسابات الموقوفة</option><option value="closed">الحسابات المغلقة</option></select><select aria-label="تصفية حالة الاشتراك" value={subscriptionStatusFilter} onChange={event => setSubscriptionStatusFilter(event.target.value as typeof subscriptionStatusFilter)} className="h-10 rounded-xl border border-[#dce8e5] bg-white px-3 text-sm font-medium text-[#083f4c] outline-none focus:ring-2 focus:ring-[#0a6372]"><option value="all">كل حالات الاشتراك</option><option value="active">يوجد اشتراك فعّال</option><option value="suspended">يوجد اشتراك موقوف</option><option value="cancelled">يوجد اشتراك ملغي</option><option value="without_subscription">دون اشتراك مسجل</option></select></div><Button variant="outline" disabled={!allAccounts.length} onClick={exportAccounts} className="h-10 border-[#08735d] text-[#08735d] hover:bg-[#eff8f5]"><Download className="ml-2 h-4 w-4" />تصدير كامل Excel</Button></div>
          <p className="text-xs text-slate-500">تظهر {filteredAccounts.length} من أصل {allAccounts.length} حساب. ملف Excel يشمل كل الحسابات وسجلات خدماتها، وليس النتائج المصفاة فقط.</p>
        </div>
        {accountsQuery.isLoading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div> : filteredAccounts.length ? <div className="divide-y divide-[#edf3f1]">{filteredAccounts.map(account => <button type="button" key={account.id} onClick={() => setLocation(`/individual-subscriptions/${account.id}`)} className="flex w-full flex-col gap-3 p-4 text-right transition-colors hover:bg-[#fbfefd] sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eff8f5] text-[#0a6372]"><UserRound className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate font-extrabold text-[#083f4c]">{account.name}</p><p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span className="flex items-center gap-1"><Smartphone className="h-3.5 w-3.5" />{account.phone || "لا يوجد رقم واتساب"}</span><span>· {account.subscriptions.length} سجل اشتراك</span></p></div></div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusClasses(account.status)}`}>{accountStatusLabel[account.status]}</span>{account.outstandingByCurrency?.map(row => <span key={row.currencyCode} className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 ring-1 ring-rose-200">متبقي {row.amount} {row.currencyCode === "YER" ? "ر.ي" : row.currencyCode === "SAR" ? "ر.س" : "$"}</span>)}{account.subscriptions.slice(0, 2).map(subscription => <span key={subscription.id} className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusClasses(subscription.status)}`}>{subscriptionStatusLabel[subscription.status]}</span>)}<span className="text-xs text-slate-400">الحساب #{account.id}</span></div></button>)}</div> : <div className="p-10 text-center"><CircleAlert className="mx-auto h-7 w-7 text-[#c39a39]" /><h3 className="mt-3 font-extrabold text-[#083f4c]">{allAccounts.length ? "لا توجد حسابات تطابق التصفية" : "لا توجد حسابات اشتراك بعد"}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{allAccounts.length ? "غيّر البحث أو مرشحات الحالة للوصول إلى الحساب المطلوب." : "ابدأ بفتح حساب مستقل لمشترك فردي. لن ينشئ ذلك عميلاً تجارياً ولن يؤثر في الصندوق أو الفواتير."}</p>{allAccounts.length ? <Button onClick={() => { setSearch(""); setAccountStatusFilter("all"); setSubscriptionStatusFilter("all"); }} variant="outline" className="mt-5 border-[#0a6372] text-[#0a6372] hover:bg-[#eff8f5]">إعادة ضبط التصفية</Button> : <Button onClick={() => setOpen(true)} variant="outline" className="mt-5 border-[#0a6372] text-[#0a6372] hover:bg-[#eff8f5]"><Plus className="ml-2 h-4 w-4" />فتح أول حساب</Button>}</div>}
      </section>

      <Dialog open={open} onOpenChange={nextOpen => { setOpen(nextOpen); if (!nextOpen) setForm(blankForm); }}>
        <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>فتح حساب اشتراك فردي</DialogTitle><DialogDescription>هذا الحساب مستقل تماماً عن العملاء والفواتير والصندوق. لا توجد مدة باقة أو تواريخ إلزامية.</DialogDescription></DialogHeader>
          <form onSubmit={submit} className="space-y-5 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="اسم المشترك"><Input required value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="مثال: أحمد محمد" /></Field>
              <Field label="حالة الحساب"><select value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value as AccountStatus }))} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#0a6372]"><option value="active">نشط</option><option value="suspended">موقوف</option><option value="closed">مغلق</option></select></Field>
              <Field label="رمز الدولة"><select value={form.country} onChange={event => setForm(current => ({ ...current, country: event.target.value as PhoneCountryCode }))} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[#0a6372]"><option value="YE">اليمن +967</option><option value="SA">السعودية +966</option></select></Field>
              <Field label="رقم جوال / واتساب"><div className="space-y-1"><Input value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value.replace(/\D/g, "") }))} placeholder="777000000 أو 5XXXXXXXX" inputMode="tel" /><p className="text-xs text-slate-500">يحفظ الرقم برمز الدولة المحدد ويستخدم في زر واتساب.</p></div></Field>
            </div>
            <Field label="ملاحظات الحساب"><Textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="اختياري" /></Field>
            <div className="rounded-2xl border border-[#cfe3dd] bg-[#f7fcfa] p-4">
              <label className="flex cursor-pointer items-center justify-between gap-3"><div><p className="font-extrabold text-[#083f4c]">إضافة اشتراك أولي الآن</p><p className="mt-1 text-xs leading-5 text-slate-500">سجل خدمة بسيط من دون سعر أو مدة أو تاريخ بداية وانتهاء.</p></div><input type="checkbox" checked={form.addInitialSubscription} onChange={event => setForm(current => ({ ...current, addInitialSubscription: event.target.checked }))} className="h-4 w-4 accent-[#0a6372]" /></label>
              {form.addInitialSubscription ? <div className="mt-4 grid gap-4 border-t border-[#dce8e5] pt-4 sm:grid-cols-2"><Field label="اسم الخدمة أو الاشتراك"><Input value={form.subscriptionName} onChange={event => setForm(current => ({ ...current, subscriptionName: event.target.value }))} placeholder="اشتراك إنترنت" /></Field><Field label="حالة الاشتراك"><select value={form.subscriptionStatus} onChange={event => setForm(current => ({ ...current, subscriptionStatus: event.target.value as SubscriptionStatus }))} className="h-10 w-full rounded-xl border border-input bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#0a6372]"><option value="active">فعّال</option><option value="suspended">موقوف</option><option value="cancelled">ملغي</option></select></Field><div className="sm:col-span-2"><Field label="ملاحظات الاشتراك"><Textarea value={form.subscriptionNotes} onChange={event => setForm(current => ({ ...current, subscriptionNotes: event.target.value }))} placeholder="اختياري" /></Field></div></div> : null}
            </div>
            <DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button type="submit" disabled={createMutation.isPending} className="bg-[#0a6372] hover:bg-[#084e5a]">{createMutation.isPending ? "جارٍ الحفظ..." : "حفظ وفتح الحساب"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { accountStatusLabel, statusClasses, subscriptionStatusLabel };
