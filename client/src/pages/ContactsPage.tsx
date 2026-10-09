import { EmptyState, PageHeader, SectionCard, arabicDate } from "@/components/accounting/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { formatCustomerPhone, parseCustomerPhone, type PhoneCountryCode } from "@/lib/customerPhone";
import { contactTypeLabel, type ContactType } from "@/lib/contactTypes";
import { buildContactFormPayload } from "@/lib/contactForm";
import { invoiceWhatsAppMessage, receiptWhatsAppMessage, whatsappUrl } from "@/lib/whatsapp";
import { ArrowDownLeft, ArrowUpRight, Building2, BriefcaseBusiness, FilePlus2, FileText, HandCoins, Landmark, Pencil, Plus, Search, Store, Truck, UserRound, UsersRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { MerchantTransactionDialog, type MerchantTransactionMode } from "@/components/MerchantTransactionDialog";

type ContactForm = { name: string; type: ContactType; phone: string; address: string; notes: string };
export type ClientActionMode = "cash" | "credit" | "receipt" | null;

const blankForm: ContactForm = { name: "", type: "customer", phone: "", address: "", notes: "" };

const contactTypeVisuals: Record<ContactType, { icon: typeof UserRound; iconClass: string; badgeClass: string }> = {
  customer: { icon: UserRound, iconClass: "bg-sky-50 text-sky-700", badgeClass: "bg-sky-50 text-sky-700 ring-sky-200" },
  grocery: { icon: Store, iconClass: "bg-amber-50 text-amber-700", badgeClass: "bg-amber-50 text-amber-700 ring-amber-200" },
  supplier: { icon: Truck, iconClass: "bg-violet-50 text-violet-700", badgeClass: "bg-violet-50 text-violet-700 ring-violet-200" },
  employee: { icon: BriefcaseBusiness, iconClass: "bg-rose-50 text-rose-700", badgeClass: "bg-rose-50 text-rose-700 ring-rose-200" },
  other: { icon: Landmark, iconClass: "bg-slate-100 text-slate-700", badgeClass: "bg-slate-100 text-slate-700 ring-slate-200" },
};

export default function ContactsPage() {
  const contactsQuery = trpc.accounting.contacts.useQuery();
  const utils = trpc.useUtils();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [statementContactId, setStatementContactId] = useState<number | null>(null);
  const [statementEditOpen, setStatementEditOpen] = useState(false);
  const [clientActionMode, setClientActionMode] = useState<ClientActionMode>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ContactType>("all");
  const [form, setForm] = useState<ContactForm>(blankForm);
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountryCode>("YE");
  const [quickMerchant, setQuickMerchant] = useState<{ id: number; name: string; phone?: string | null } | null>(null);
  const [quickMerchantMode, setQuickMerchantMode] = useState<MerchantTransactionMode>(null);
  const statementQuery = trpc.accounting.contactStatement.useQuery({ contactId: statementContactId ?? 0 }, { enabled: statementContactId !== null });

  const createMutation = trpc.accounting.createContact.useMutation({
    onSuccess: async () => {
      await utils.accounting.contacts.invalidate();
      toast.success("تم فتح الحساب بنجاح");
      closeDialog();
    },
    onError: error => toast.error(error.message),
  });
  const updateMutation = trpc.accounting.updateContact.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.accounting.contacts.invalidate(), utils.accounting.contactStatement.invalidate()]);
      toast.success("تم تحديث بيانات الحساب");
      if (statementEditOpen) {
        setStatementEditOpen(false);
        setEditingId(null);
        setForm(blankForm);
      } else closeDialog();
    },
    onError: error => toast.error(error.message),
  });

  const filtered = useMemo(() => (contactsQuery.data ?? []).filter(contact => {
    const matchesSearch = `${contact.name} ${contact.phone ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || contact.type === typeFilter;
    return matchesSearch && matchesType;
  }), [contactsQuery.data, search, typeFilter]);

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(blankForm);
    setPhoneCountry("YE");
  }

  function openCreate() {
    setEditingId(null);
    setForm(blankForm);
    setPhoneCountry("YE");
    setDialogOpen(true);
  }

  function openEdit(contact: NonNullable<typeof contactsQuery.data>[number]) {
    const parsedPhone = parseCustomerPhone(contact.phone);
    setEditingId(contact.id);
    setPhoneCountry(parsedPhone.country);
    setForm({ name: contact.name, type: contact.type, phone: parsedPhone.localNumber, address: contact.address ?? "", notes: contact.notes ?? "" });
    setDialogOpen(true);
  }

  function openStatementEdit(contact: NonNullable<typeof contactsQuery.data>[number]) {
    const parsedPhone = parseCustomerPhone(contact.phone);
    setEditingId(contact.id);
    setPhoneCountry(parsedPhone.country);
    setForm({ name: contact.name, type: contact.type, phone: parsedPhone.localNumber, address: contact.address ?? "", notes: contact.notes ?? "" });
    setStatementEditOpen(true);
  }

  function closeStatementEdit() {
    setStatementEditOpen(false);
    setEditingId(null);
    setForm(blankForm);
    setPhoneCountry("YE");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const normalizedForm = buildContactFormPayload(form, phoneCountry);
    if (editingId) {
      const original = contactsQuery.data?.find(contact => contact.id === editingId);
      updateMutation.mutate({ id: editingId, ...normalizedForm, isActive: original?.isActive ?? true });
    } else {
      createMutation.mutate(normalizedForm);
    }
  }

  const statementTotals = (statementQuery.data?.invoices ?? []).reduce<Record<string, number>>((totals, invoice) => {
    totals[invoice.currencyCode] = (totals[invoice.currencyCode] ?? 0) + Number(invoice.dueAmount);
    return totals;
  }, {});

  return (
    <div>
      <PageHeader
        title="العملاء والحسابات"
        description="افتح حساباً لكل عميل أو بقالة أو مورد أو موظف. هذه سجلات محاسبية داخلية، ولا تمنح أصحابها صلاحية للدخول إلى الموقع."
        action={<Button onClick={openCreate} className="h-11 bg-[#0a6372] px-5 font-bold hover:bg-[#084e5a]"><Plus className="ml-2 h-4 w-4" />فتح حساب جديد</Button>}
      />

      <SectionCard title="دليل الحسابات" subtitle="ابحث عن العميل ثم افتح فواتيره وسنداته من الأقسام المالية، ويمكنك تعديل نوع الحساب من زر التعديل.">
        <div className="flex flex-col gap-3 border-b border-[#e8f0ee] p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث بالاسم أو رقم الجوال" className="h-11 border-[#dce8e5] bg-[#fbfdfc] pr-10" />
          </div>
          <select value={typeFilter} onChange={event => setTypeFilter(event.target.value as "all" | ContactType)} className="h-11 rounded-xl border border-[#dce8e5] bg-white px-3 text-sm font-medium text-[#083f4c] outline-none focus:ring-2 focus:ring-[#0a6372]">
            <option value="all">كل أنواع الحسابات</option>
            {Object.entries(contactTypeLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </div>

        {contactsQuery.isLoading ? <ContactsSkeleton /> : filtered.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-right">
              <thead className="bg-[#f8fcfb] text-xs text-slate-500">
                <tr><th className="px-5 py-3 font-bold">الحساب</th><th className="px-5 py-3 font-bold">النوع</th><th className="px-5 py-3 font-bold">التواصل</th><th className="px-5 py-3 font-bold">العنوان</th><th className="px-5 py-3 font-bold">تاريخ الإنشاء</th><th className="px-5 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-[#edf3f1]">
                {filtered.map(contact => {
                  const visual = contactTypeVisuals[contact.type];
                  const TypeIcon = visual.icon;
                  return <tr key={contact.id} className="transition-colors hover:bg-[#fbfefd]">
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><span className={`grid h-9 w-9 place-items-center rounded-xl ${visual.iconClass}`}><TypeIcon className="h-4 w-4" /></span><div><Link href={`/contacts/${contact.id}`} className="font-extrabold text-[#083f4c] underline-offset-4 hover:text-[#0a6372] hover:underline">{contact.name}</Link><p className="mt-1 text-xs text-slate-400">افتح الحساب #{contact.id}</p></div></div></td>
                    <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${visual.badgeClass}`}>{contactTypeLabel[contact.type]}</span></td>
                    <td className="px-5 py-4 text-sm text-slate-600">{contact.phone || "—"}</td>
                    <td className="max-w-52 truncate px-5 py-4 text-sm text-slate-600">{contact.address || "—"}</td>
                    <td className="px-5 py-4 text-sm text-slate-500">{arabicDate(contact.createdAt)}</td>
                    <td className="px-5 py-4"><div className="flex items-center gap-1">{contact.type === "supplier" ? <Button variant="outline" size="sm" onClick={() => { setQuickMerchant(contact); setQuickMerchantMode("credit"); }} className="h-9 border-amber-300 text-amber-800 hover:bg-amber-50 font-bold"><Store className="ml-1 h-3.5 w-3.5 text-amber-600" />حركة تاجر</Button> : null}<Button variant="ghost" size="sm" onClick={() => setStatementContactId(contact.id)} className="h-9 text-[#0a6372] hover:bg-[#eff8f5]"><FileText className="ml-1 h-4 w-4" />كشف الحساب</Button><Button variant="ghost" size="icon" onClick={() => openEdit(contact)} className="h-9 w-9 rounded-lg text-[#0a6372] hover:bg-[#eff8f5]"><Pencil className="h-4 w-4" /><span className="sr-only">تعديل الحساب</span></Button></div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="لا توجد حسابات مطابقة" description="ابدأ بإضافة عميل أو بقالة لتسجيل الفواتير وسندات القبض باسمه." />}
      </SectionCard>

      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{editingId ? "تعديل الحساب" : "فتح حساب جديد"}</DialogTitle><DialogDescription>تُستخدم هذه البيانات في الفواتير وسندات القبض والكشوفات المالية.</DialogDescription></DialogHeader>
          <form onSubmit={submit} className="space-y-4 pt-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="اسم الحساب أو العميل"><Input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="مثال: بقالة النور" /></Field>
              <PhoneCountrySelect country={phoneCountry} onChange={setPhoneCountry} />
              <Field label="نوع الحساب"><select value={form.type} onChange={event => setForm({ ...form, type: event.target.value as ContactType })} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring">{Object.entries(contactTypeLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field>
              <Field label="رقم جوال العميل / واتساب"><div className="space-y-1"><Input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value.replace(/[^\d+]/g, "") })} placeholder="777000000 أو 5XXXXXXXX" inputMode="tel" /><p className="text-xs text-slate-500">يُحفظ الرقم برمز الدولة المختار ويستخدمه واتساب تلقائياً.</p></div></Field>
              <Field label="العنوان"><Input value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} placeholder="اختياري" /></Field>
            </div>
            <Field label="ملاحظات"><Textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="أي ملاحظة خاصة بالحساب" /></Field>
            <DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={closeDialog}>إلغاء</Button><Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="bg-[#0a6372] hover:bg-[#084e5a]">{createMutation.isPending || updateMutation.isPending ? "جارٍ الحفظ..." : "حفظ الحساب"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={statementContactId !== null} onOpenChange={open => { if (!open) setStatementContactId(null); }}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><DialogTitle>كشف حساب {statementQuery.data?.contact.name ?? "العميل"}</DialogTitle><DialogDescription className="mt-1">يعرض الفواتير وسندات القبض المسجلة. الرصيد المتبقي هو المديونية التي لم تدخل الصندوق بعد.</DialogDescription></div><Button size="sm" variant="outline" onClick={() => { if (statementQuery.data?.contact) openStatementEdit(statementQuery.data.contact); }} className="w-fit border-[#bcd9d2] text-[#0a6372] hover:bg-[#eff8f5]"><Pencil className="ml-1.5 h-4 w-4" />تعديل بيانات العميل</Button></div></DialogHeader>
          {statementQuery.isLoading ? <ContactsSkeleton /> : statementQuery.data ? <div className="space-y-5 py-2"><div className="rounded-2xl border border-[#bcd9d2] bg-[#f4fbf8] p-4"><div className="mb-3"><h3 className="font-extrabold text-[#083f4c]">معاملات {statementQuery.data.contact.name}</h3><p className="mt-1 text-sm text-slate-600">{statementQuery.data.contact.type === "supplier" ? "سجّل بضاعة مسحوبة أو مبلغ حوالة للتاجر مباشرة من هنا." : "سجّل كل معاملة لهذا العميل من داخل حسابه دون الرجوع إلى صفحات أخرى."}</p></div><div className="flex flex-wrap gap-2">{statementQuery.data.contact.type === "supplier" ? (<><Button size="sm" onClick={() => { setQuickMerchant(statementQuery.data!.contact); setQuickMerchantMode("credit"); }} className="bg-[#b45309] hover:bg-[#92400e] font-bold"><ArrowDownLeft className="ml-1.5 h-4 w-4" />سحب بضاعة (له)</Button><Button size="sm" onClick={() => { setQuickMerchant(statementQuery.data!.contact); setQuickMerchantMode("debit"); }} className="bg-[#08735d] hover:bg-[#065f4c] font-bold"><ArrowUpRight className="ml-1.5 h-4 w-4" />مبلغ حوالة (عليه)</Button></>) : null}<Button size="sm" onClick={() => setClientActionMode("receipt")} className="bg-[#08735d] hover:bg-[#075d4b]"><HandCoins className="ml-1.5 h-4 w-4" />إضافة سند قبض</Button><Button size="sm" onClick={() => setClientActionMode("credit")} className="bg-[#9c711a] hover:bg-[#805c14]"><FilePlus2 className="ml-1.5 h-4 w-4" />فاتورة آجلة</Button><Button size="sm" variant="outline" onClick={() => setClientActionMode("cash")} className="border-[#0a6372] text-[#0a6372] hover:bg-[#eff8f5]"><FilePlus2 className="ml-1.5 h-4 w-4" />فاتورة نقدية</Button></div></div><div className="grid gap-3 sm:grid-cols-3">{["YER", "SAR", "USD"].map(currency => <div key={currency} className="rounded-xl border border-[#dce8e5] bg-[#fbfdfc] p-3"><p className="text-xs text-slate-500">المتبقي {currency}</p><p className="mt-1 font-extrabold text-[#9c711a]">{new Intl.NumberFormat("ar-YE", { minimumFractionDigits: 2 }).format(statementTotals[currency] ?? 0)}</p></div>)}</div><div className="rounded-2xl border border-[#dce8e5]"><h3 className="border-b border-[#e8f0ee] px-4 py-3 font-extrabold text-[#083f4c]">الفواتير</h3><div className="divide-y divide-[#edf3f1]">{statementQuery.data.invoices.length ? statementQuery.data.invoices.map(invoice => <div key={invoice.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-[#083f4c]">{invoice.invoiceNumber} <span className="text-xs font-medium text-slate-500">· {arabicDate(invoice.issueDate)}</span></p><p className="mt-1 text-xs text-slate-500">{invoice.type === "credit" ? "فاتورة آجلة" : "فاتورة نقدية"}</p></div><p className="font-extrabold text-[#9c711a]">المتبقي: {invoice.dueAmount} {invoice.currencyCode}</p></div>) : <p className="p-5 text-center text-sm text-slate-500">لا توجد فواتير لهذا الحساب.</p>}</div></div><div className="rounded-2xl border border-[#dce8e5]"><h3 className="border-b border-[#e8f0ee] px-4 py-3 font-extrabold text-[#083f4c]">سندات القبض</h3><div className="divide-y divide-[#edf3f1]">{statementQuery.data.receipts.length ? statementQuery.data.receipts.map(receipt => <div key={receipt.id} className="flex items-center justify-between px-4 py-3"><div><p className="font-bold text-[#083f4c]">{receipt.receiptNumber}</p><p className="mt-1 text-xs text-slate-500">{arabicDate(receipt.receiptDate)}</p></div><p className="font-extrabold text-[#08735d]">{receipt.amount} {receipt.currencyCode}</p></div>) : <p className="p-5 text-center text-sm text-slate-500">لا توجد سندات قبض لهذا الحساب.</p>}</div></div></div> : <EmptyState title="تعذر تحميل كشف الحساب" description="حاول فتح الكشف مرة أخرى." />}
        </DialogContent>
      </Dialog>
      <Dialog open={statementEditOpen} onOpenChange={open => { if (!open) closeStatementEdit(); }}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>تعديل بيانات {statementQuery.data?.contact.name ?? "العميل"}</DialogTitle><DialogDescription>يُحفظ التعديل داخل نفس كشف الحساب، ثم تتحدث بياناته فوراً.</DialogDescription></DialogHeader>
          <form onSubmit={submit} className="space-y-4 pt-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="اسم الحساب أو العميل"><Input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field>
              <PhoneCountrySelect country={phoneCountry} onChange={setPhoneCountry} />
              <Field label="نوع الحساب"><select value={form.type} onChange={event => setForm({ ...form, type: event.target.value as ContactType })} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring">{Object.entries(contactTypeLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field>
              <Field label="رقم جوال العميل / واتساب"><div className="space-y-1"><Input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value.replace(/[^\d+]/g, "") })} placeholder="777000000 أو 5XXXXXXXX" inputMode="tel" /><p className="text-xs text-slate-500">يُحفظ الرقم برمز الدولة المختار ويستخدمه واتساب تلقائياً.</p></div></Field>
              <Field label="العنوان"><Input value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} /></Field>
            </div>
            <Field label="ملاحظات"><Textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></Field>
            <DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={closeStatementEdit}>إلغاء</Button><Button type="submit" disabled={updateMutation.isPending} className="bg-[#0a6372] hover:bg-[#084e5a]">{updateMutation.isPending ? "جارٍ الحفظ..." : "حفظ التعديل"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {statementQuery.data ? <ClientTransactionDialog contact={statementQuery.data.contact} mode={clientActionMode} onClose={() => setClientActionMode(null)} onSuccess={() => { setClientActionMode(null); utils.accounting.contactStatement.invalidate({ contactId: statementQuery.data!.contact.id }); }} /> : null}
      <MerchantTransactionDialog
        merchant={quickMerchant ?? { id: 0, name: "" }}
        mode={quickMerchantMode}
        onClose={() => {
          setQuickMerchant(null);
          setQuickMerchantMode(null);
        }}
        onSuccess={() => {
          setQuickMerchant(null);
          setQuickMerchantMode(null);
          utils.accounting.contacts.invalidate();
          if (statementContactId) {
            utils.accounting.contactStatement.invalidate({ contactId: statementContactId });
          }
        }}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label className="font-bold text-[#083f4c]">{label}</Label>{children}</div>; }
function PhoneCountrySelect({ country, onChange }: { country: PhoneCountryCode; onChange: (country: PhoneCountryCode) => void }) { return <Field label="رمز الدولة"><select value={country} onChange={event => onChange(event.target.value as PhoneCountryCode)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="YE">اليمن +967</option><option value="SA">السعودية +966</option></select></Field>; }
function ContactsSkeleton() { return <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}</div>; }

export function ClientTransactionDialog({ contact, mode, onClose, onSuccess }: { contact: { id: number; name: string; phone?: string | null }; mode: ClientActionMode; onClose: () => void; onSuccess: () => void }) {
  const setupQuery = trpc.accounting.setup.useQuery();
  const cashQuery = trpc.accounting.cashSummary.useQuery();
  const whatsappSettingsQuery = trpc.accounting.whatsappSettings.useQuery();
  const utils = trpc.useUtils();
  const saleCategories = setupQuery.data?.movementCategories.filter(category => category.kind === "sale") ?? [];
  const receiptCategories = setupQuery.data?.movementCategories.filter(category => category.kind === "receipt") ?? [];
  const [invoice, setInvoice] = useState({ categoryId: "", cashAccountId: "", date: new Date().toISOString().slice(0, 10), currency: "YER" as "YER" | "SAR" | "USD", rate: "1", description: "اشتراك إنترنت — شهر واحد", amount: "", notes: "" });
  const [receipt, setReceipt] = useState({ categoryId: "", cashAccountId: "", date: new Date().toISOString().slice(0, 10), currency: "YER" as "YER" | "SAR" | "USD", rate: "1", notes: "", allocations: {} as Record<number, string> });
  const openInvoicesQuery = trpc.accounting.openInvoices.useQuery({ contactId: contact.id }, { enabled: mode === "receipt" });
  const createInvoice = trpc.accounting.createInvoice.useMutation({ onSuccess: async result => { await Promise.all([utils.accounting.invoices.invalidate(), utils.accounting.dashboard.invalidate(), utils.accounting.cashSummary.invalidate()]); const url = whatsappUrl(contact.phone, invoiceWhatsAppMessage(contact.name, { invoiceNumber: result.invoiceNumber, type: mode === "credit" ? "credit" : "cash", totalAmount: invoice.amount, dueAmount: mode === "credit" ? invoice.amount : "0.00", currencyCode: invoice.currency }, whatsappSettingsQuery.data?.whatsappTemplate)); toast.success("تم إصدار الفاتورة داخل حساب العميل", url ? { duration: 15000, action: { label: "واتساب", onClick: () => window.open(url, "_blank", "noopener,noreferrer") } } : { description: "أضف رقم واتساب للحساب ليظهر زر الإرسال بعد العملية." }); onSuccess(); }, onError: error => toast.error(error.message) });
  const createReceipt = trpc.accounting.createReceipt.useMutation({ onSuccess: async result => { await Promise.all([utils.accounting.receipts.invalidate(), utils.accounting.invoices.invalidate(), utils.accounting.openInvoices.invalidate(), utils.accounting.dashboard.invalidate(), utils.accounting.cashSummary.invalidate()]); const url = whatsappUrl(contact.phone, receiptWhatsAppMessage(contact.name, { receiptNumber: result.receiptNumber, amount: receiptTotal.toFixed(2), currencyCode: receipt.currency }, whatsappSettingsQuery.data?.whatsappTemplate)); toast.success("تم حفظ سند القبض داخل حساب العميل", url ? { duration: 15000, action: { label: "واتساب", onClick: () => window.open(url, "_blank", "noopener,noreferrer") } } : { description: "أضف رقم واتساب للحساب ليظهر زر الإرسال بعد العملية." }); onSuccess(); }, onError: error => toast.error(error.message) });
  useEffect(() => { if ((mode === "cash" || mode === "credit") && !invoice.categoryId && saleCategories[0]?.id) setInvoice(current => ({ ...current, categoryId: String(saleCategories[0]!.id) })); if (mode === "cash" && !invoice.cashAccountId && cashQuery.data?.accounts[0]?.id) setInvoice(current => ({ ...current, cashAccountId: String(cashQuery.data!.accounts[0]!.id) })); if (mode === "receipt" && !receipt.categoryId && receiptCategories[0]?.id) setReceipt(current => ({ ...current, categoryId: String(receiptCategories[0]!.id) })); if (mode === "receipt" && !receipt.cashAccountId && cashQuery.data?.accounts[0]?.id) setReceipt(current => ({ ...current, cashAccountId: String(cashQuery.data!.accounts[0]!.id) })); }, [mode, invoice.categoryId, invoice.cashAccountId, receipt.categoryId, receipt.cashAccountId, saleCategories[0]?.id, receiptCategories[0]?.id, cashQuery.data?.accounts[0]?.id]);
  const selectedInvoices = (openInvoicesQuery.data ?? []).filter(item => item.currencyCode === receipt.currency);
  const receiptTotal = Object.values(receipt.allocations).reduce((sum, amount) => sum + Number(amount || 0), 0);
  const isInvoice = mode === "cash" || mode === "credit";
  function submitInvoice(event: FormEvent) { event.preventDefault(); if (!invoice.categoryId || !invoice.amount || (mode === "cash" && !invoice.cashAccountId)) { toast.error("أدخل تصنيف المبيعات والمبلغ والحساب المستلم للفاتورة النقدية"); return; } createInvoice.mutate({ contactId: contact.id, movementCategoryId: Number(invoice.categoryId), type: mode === "credit" ? "credit" : "cash", issueDate: new Date(`${invoice.date}T12:00:00`), currencyCode: invoice.currency, exchangeRateToBase: invoice.rate, cashAccountId: mode === "cash" ? Number(invoice.cashAccountId) : undefined, discountAmount: "0", notes: invoice.notes || undefined, items: [{ description: invoice.description || "اشتراك إنترنت", quantity: "1", unitPrice: invoice.amount }] }); }
  function submitReceipt(event: FormEvent) { event.preventDefault(); const allocations = Object.entries(receipt.allocations).filter(([, amount]) => Number(amount) > 0).map(([invoiceId, amount]) => ({ invoiceId: Number(invoiceId), amount })); if (!allocations.length || !receipt.cashAccountId) { toast.error("حدد فاتورة آجلة واحدة على الأقل والحساب المستلم"); return; } createReceipt.mutate({ contactId: contact.id, movementCategoryId: receipt.categoryId ? Number(receipt.categoryId) : undefined, cashAccountId: Number(receipt.cashAccountId), receiptDate: new Date(`${receipt.date}T12:00:00`), currencyCode: receipt.currency, exchangeRateToBase: receipt.rate, amount: receiptTotal.toFixed(2), notes: receipt.notes || undefined, allocations }); }
  const accountOptions = (cashQuery.data?.accounts ?? []).map(account => <option key={account.id} value={account.id}>{account.type === "bank" ? "بنك: " : "صندوق: "}{account.name}</option>);
  return <Dialog open={mode !== null} onOpenChange={open => { if (!open) onClose(); }}><DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{mode === "receipt" ? "سند قبض" : mode === "credit" ? "فاتورة آجلة" : "فاتورة نقدية"} — {contact.name}</DialogTitle><DialogDescription>{mode === "credit" ? "هذه العملية ستُسجل مباشرة على حساب العميل المفتوح دون دخول صندوق أو بنك." : "اختر الحساب الذي استلمت فيه المبلغ فعلياً لتُسجل العملية بدقة."}</DialogDescription></DialogHeader>{isInvoice ? <form onSubmit={submitInvoice} className="space-y-4 py-2"><div className="grid gap-4 sm:grid-cols-2"><Field label="التاريخ"><Input type="date" value={invoice.date} onChange={event => setInvoice({ ...invoice, date: event.target.value })} /></Field><Field label="تصنيف المبيعات"><select value={invoice.categoryId} onChange={event => setInvoice({ ...invoice, categoryId: event.target.value })} className="form-select"><option value="">اختر التصنيف</option>{saleCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>{mode === "cash" ? <Field label="الحساب المستلم"><select required value={invoice.cashAccountId} onChange={event => setInvoice({ ...invoice, cashAccountId: event.target.value })} className="form-select"><option value="" disabled>اختر صندوقاً أو بنكاً</option>{accountOptions}</select></Field> : null}<Field label="العملة"><select value={invoice.currency} onChange={event => { const currency = event.target.value as typeof invoice.currency; setInvoice({ ...invoice, currency, rate: currency === "YER" ? "1" : invoice.rate }); }} className="form-select"><option value="YER">ريال يمني</option><option value="SAR">ريال سعودي</option><option value="USD">دولار أمريكي</option></select></Field><Field label="سعر الصرف"><Input inputMode="decimal" value={invoice.rate} onChange={event => setInvoice({ ...invoice, rate: event.target.value })} /></Field><Field label="بيان الفاتورة"><Input value={invoice.description} onChange={event => setInvoice({ ...invoice, description: event.target.value })} /></Field><Field label="المبلغ"><Input required inputMode="decimal" value={invoice.amount} onChange={event => setInvoice({ ...invoice, amount: event.target.value })} /></Field></div><Field label="ملاحظات"><Textarea value={invoice.notes} onChange={event => setInvoice({ ...invoice, notes: event.target.value })} /></Field><DialogFooter><Button type="button" variant="outline" onClick={onClose}>إلغاء</Button><Button type="submit" disabled={createInvoice.isPending} className="bg-[#0a6372] hover:bg-[#084e5a]">{createInvoice.isPending ? "جارٍ الحفظ..." : "اعتماد الفاتورة"}</Button></DialogFooter></form> : <form onSubmit={submitReceipt} className="space-y-4 py-2"><div className="grid gap-4 sm:grid-cols-2"><Field label="تاريخ القبض"><Input type="date" value={receipt.date} onChange={event => setReceipt({ ...receipt, date: event.target.value })} /></Field><Field label="الحساب المستلم"><select required value={receipt.cashAccountId} onChange={event => setReceipt({ ...receipt, cashAccountId: event.target.value })} className="form-select"><option value="" disabled>اختر صندوقاً أو بنكاً</option>{accountOptions}</select></Field><Field label="تصنيف الحركة"><select value={receipt.categoryId} onChange={event => setReceipt({ ...receipt, categoryId: event.target.value })} className="form-select"><option value="">سند قبض عام</option>{receiptCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field><Field label="العملة"><select value={receipt.currency} onChange={event => { const currency = event.target.value as typeof receipt.currency; setReceipt({ ...receipt, currency, rate: currency === "YER" ? "1" : receipt.rate, allocations: {} }); }} className="form-select"><option value="YER">ريال يمني</option><option value="SAR">ريال سعودي</option><option value="USD">دولار أمريكي</option></select></Field><Field label="سعر الصرف"><Input inputMode="decimal" value={receipt.rate} onChange={event => setReceipt({ ...receipt, rate: event.target.value })} /></Field></div><div className="rounded-2xl border border-[#dce8e5] bg-[#fbfdfc] p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-extrabold text-[#083f4c]">الفواتير الآجلة</h3><span className="font-extrabold text-[#08735d]">الإجمالي: {receiptTotal} {receipt.currency}</span></div>{openInvoicesQuery.isLoading ? <ContactsSkeleton /> : selectedInvoices.length ? <div className="space-y-2">{selectedInvoices.map(invoice => { const amount = receipt.allocations[invoice.id] ?? ""; return <div key={invoice.id} className="grid gap-3 rounded-xl border border-[#dce8e5] bg-white p-3 sm:grid-cols-[1fr_150px]"><div><p className="font-bold text-[#083f4c]">{invoice.invoiceNumber}</p><p className="mt-1 text-xs text-slate-500">المتبقي: {invoice.dueAmount} {invoice.currencyCode}</p></div><Input inputMode="decimal" value={amount} onChange={event => setReceipt({ ...receipt, allocations: { ...receipt.allocations, [invoice.id]: event.target.value } })} placeholder="مبلغ القبض" /></div>; })}</div> : <p className="text-sm text-slate-500">لا توجد فواتير آجلة مفتوحة بهذه العملة لهذا العميل.</p>}</div><Field label="ملاحظات"><Textarea value={receipt.notes} onChange={event => setReceipt({ ...receipt, notes: event.target.value })} /></Field><DialogFooter><Button type="button" variant="outline" onClick={onClose}>إلغاء</Button><Button type="submit" disabled={createReceipt.isPending || receiptTotal <= 0} className="bg-[#08735d] hover:bg-[#075d4b]">{createReceipt.isPending ? "جارٍ الحفظ..." : "اعتماد سند القبض"}</Button></DialogFooter></form>}</DialogContent></Dialog>;
}
