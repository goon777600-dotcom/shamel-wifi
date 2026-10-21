import { EmptyState, PageHeader, SectionCard, StatusBadge, arabicDate, money } from "@/components/accounting/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CirclePlus, FileText, Minus, Plus, Printer, Search } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

type InvoiceItemForm = { description: string; quantity: string; unitPrice: string };
type InvoiceForm = { contactId: string; movementCategoryId: string; cashAccountId: string; type: "cash" | "credit"; issueDate: string; currencyCode: "YER" | "SAR" | "USD"; exchangeRateToBase: string; discountAmount: string; notes: string; items: InvoiceItemForm[] };

function invoiceBlank(categoryId?: number, cashAccountId = ""): InvoiceForm {
  return { contactId: "", movementCategoryId: categoryId ? String(categoryId) : "", cashAccountId, type: "cash", issueDate: new Date().toISOString().slice(0, 10), currencyCode: "YER", exchangeRateToBase: "1", discountAmount: "0", notes: "", items: [{ description: "اشتراك إنترنت — شهر واحد", quantity: "1", unitPrice: "" }] };
}

export default function InvoicesPage() {
  const invoicesQuery = trpc.accounting.invoices.useQuery();
  const contactsQuery = trpc.accounting.contacts.useQuery();
  const setupQuery = trpc.accounting.setup.useQuery();
  const cashQuery = trpc.accounting.cashSummary.useQuery();
  const utils = trpc.useUtils();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [documentId, setDocumentId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<InvoiceForm>(invoiceBlank());
  const documentQuery = trpc.accounting.invoiceDocument.useQuery({ invoiceId: documentId ?? 0 }, { enabled: documentId !== null });
  const saleCategories = setupQuery.data?.movementCategories.filter(category => category.kind === "sale") ?? [];
  const createMutation = trpc.accounting.createInvoice.useMutation({
    onSuccess: async result => {
      await Promise.all([utils.accounting.invoices.invalidate(), utils.accounting.dashboard.invalidate(), utils.accounting.cashSummary.invalidate(), utils.accounting.openInvoices.invalidate()]);
      toast.success(`تم إصدار الفاتورة ${result.invoiceNumber}`);
      closeDialog();
    },
    onError: error => toast.error(error.message),
  });

  const filtered = useMemo(() => (invoicesQuery.data ?? []).filter(invoice => `${invoice.invoiceNumber} ${invoice.contactName}`.toLowerCase().includes(search.toLowerCase())), [invoicesQuery.data, search]);
  const subtotal = form.items.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unitPrice || 0)), 0);
  const totalPreview = Math.max(0, subtotal - Number(form.discountAmount || 0));

  function openDialog() {
    setForm(invoiceBlank(saleCategories[0]?.id, cashQuery.data?.accounts[0] ? String(cashQuery.data.accounts[0].id) : ""));
    setDialogOpen(true);
  }
  function closeDialog() { setDialogOpen(false); }
  function updateItem(index: number, patch: Partial<InvoiceItemForm>) { setForm(current => ({ ...current, items: current.items.map((item, position) => position === index ? { ...item, ...patch } : item) })); }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.contactId || !form.movementCategoryId || (form.type === "cash" && !form.cashAccountId)) { toast.error("اختر العميل والتصنيف والحساب المستلم للفاتورة النقدية"); return; }
    createMutation.mutate({
      contactId: Number(form.contactId), movementCategoryId: Number(form.movementCategoryId), type: form.type, issueDate: new Date(`${form.issueDate}T12:00:00`), currencyCode: form.currencyCode,
      exchangeRateToBase: form.exchangeRateToBase, cashAccountId: form.type === "cash" ? Number(form.cashAccountId) : undefined, discountAmount: form.discountAmount, notes: form.notes || undefined, items: form.items,
    });
  }

  return (
    <div>
      <PageHeader title="فواتير المبيعات" description="الفاتورة النقدية تدخل مبلغها فوراً إلى الصندوق أو البنك الذي تختاره، بينما الفاتورة الآجلة ترفع مديونية العميل فقط حتى تسجل سند قبض." action={<Button onClick={openDialog} className="h-11 bg-[#0a6372] px-5 font-bold hover:bg-[#084e5a]"><Plus className="ml-2 h-4 w-4" />إصدار فاتورة</Button>} />
      <SectionCard title="سجل الفواتير" subtitle="تُرقّم الفواتير تلقائياً وتحفظ العملة وسعر الصرف المُدخل وقت إصدارها.">
        <div className="border-b border-[#e8f0ee] p-4"><div className="relative max-w-md"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={event => setSearch(event.target.value)} className="h-11 bg-[#fbfdfc] pr-10" placeholder="ابحث برقم الفاتورة أو العميل" /></div></div>
        {invoicesQuery.isLoading ? <ListSkeleton /> : filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-right"><thead className="bg-[#f8fcfb] text-xs text-slate-500"><tr><th className="px-5 py-3">رقم الفاتورة</th><th className="px-5 py-3">العميل</th><th className="px-5 py-3">التاريخ</th><th className="px-5 py-3">النوع</th><th className="px-5 py-3">الحساب المستلم</th><th className="px-5 py-3">الإجمالي</th><th className="px-5 py-3">المسدد</th><th className="px-5 py-3">المتبقي</th><th className="px-5 py-3">الحالة</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-[#edf3f1]">{filtered.map(invoice => <tr key={invoice.id} className="hover:bg-[#fbfefd]"><td className="px-5 py-4 font-extrabold text-[#0a6372]">{invoice.invoiceNumber}</td><td className="px-5 py-4 font-bold text-[#083f4c]">{invoice.contactName}</td><td className="px-5 py-4 text-sm text-slate-500">{arabicDate(invoice.issueDate)}</td><td className="px-5 py-4"><StatusBadge status={invoice.type} /></td><td className="px-5 py-4 text-sm font-bold text-[#083f4c]">{invoice.type === "cash" ? invoice.cashAccountName ?? "صندوق الشبكة الرئيسي" : "—"}</td><td className="px-5 py-4 font-bold text-[#083f4c]">{money(invoice.totalAmount, invoice.currencyCode)}</td><td className="px-5 py-4 text-sm text-[#08735d]">{money(invoice.paidAmount, invoice.currencyCode)}</td><td className="px-5 py-4 text-sm text-[#9c711a]">{money(invoice.dueAmount, invoice.currencyCode)}</td><td className="px-5 py-4"><StatusBadge status={invoice.status} /></td><td className="px-5 py-4"><Button size="sm" variant="outline" onClick={() => setDocumentId(invoice.id)} className="border-[#bcd9d2] text-[#0a6372] hover:bg-[#eff8f5]"><Printer className="ml-1 h-4 w-4" />طباعة</Button></td></tr>)}</tbody></table></div> : <EmptyState title="لا توجد فواتير بعد" description="أصدر أول فاتورة نقدية أو آجلة لبدء متابعة المبيعات والديون." />}
      </SectionCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>إصدار فاتورة مبيعات</DialogTitle><DialogDescription>الفاتورة النقدية تتطلب اختيار الصندوق أو البنك المستلم؛ أما الآجلة فلا تدخل أي حساب حتى تسجيل سند قبض.</DialogDescription></DialogHeader>
          <form onSubmit={submit} className="space-y-5 py-2">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="الحساب"><select required value={form.contactId} onChange={event => setForm({ ...form, contactId: event.target.value })} className="form-select"><option value="">اختر العميل</option>{(contactsQuery.data ?? []).filter(contact => contact.type === "customer" || contact.type === "grocery").map(contact => <option key={contact.id} value={contact.id}>{contact.name} — {contact.type === "grocery" ? "بقالة" : "عميل"}</option>)}</select></Field>
              <Field label="نوع الفاتورة"><select value={form.type} onChange={event => setForm({ ...form, type: event.target.value as "cash" | "credit" })} className="form-select"><option value="cash">نقدية — تدخل حساباً</option><option value="credit">آجلة — على حساب العميل</option></select></Field>
              <Field label="تاريخ الفاتورة"><Input type="date" required value={form.issueDate} onChange={event => setForm({ ...form, issueDate: event.target.value })} /></Field>
              <Field label="تصنيف المبيعات"><select required value={form.movementCategoryId} onChange={event => setForm({ ...form, movementCategoryId: event.target.value })} className="form-select"><option value="">اختر التصنيف</option>{saleCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
            </div>
            {form.type === "cash" ? <Field label="الحساب المستلم للفاتورة النقدية"><select required value={form.cashAccountId} onChange={event => setForm({ ...form, cashAccountId: event.target.value })} className="form-select"><option value="" disabled>اختر صندوقاً أو بنكاً</option>{(cashQuery.data?.accounts ?? []).map(account => <option key={account.id} value={account.id}>{account.type === "bank" ? "بنك: " : "صندوق: "}{account.name}</option>)}</select></Field> : <div className="rounded-xl border border-[#e7d1a2] bg-[#fffaf0] px-4 py-3 text-sm font-bold text-[#875f13]">الفاتورة الآجلة لا تدخل الصندوق أو البنك عند إصدارها؛ سجّل سند قبض فقط عند استلام المال فعلياً.</div>}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="العملة"><select value={form.currencyCode} onChange={event => { const currencyCode = event.target.value as InvoiceForm["currencyCode"]; setForm({ ...form, currencyCode, exchangeRateToBase: currencyCode === "YER" ? "1" : form.exchangeRateToBase }); }} className="form-select"><option value="YER">ريال يمني</option><option value="SAR">ريال سعودي</option><option value="USD">دولار أمريكي</option></select></Field>
              <Field label="سعر الصرف إلى الريال اليمني"><Input required inputMode="decimal" value={form.exchangeRateToBase} onChange={event => setForm({ ...form, exchangeRateToBase: event.target.value })} /></Field>
              <Field label="الخصم"><Input required inputMode="decimal" value={form.discountAmount} onChange={event => setForm({ ...form, discountAmount: event.target.value })} /></Field>
            </div>
            <div className="rounded-2xl border border-[#dce8e5] bg-[#fbfdfc] p-4"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-extrabold text-[#083f4c]">بنود الفاتورة</h3><p className="mt-1 text-xs text-slate-500">أضف خدمة أو اشتراكاً أو بضاعة ضمن نفس الفاتورة.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, items: [...form.items, { description: "", quantity: "1", unitPrice: "" }] })} className="border-[#bcd9d2] text-[#0a6372]"><CirclePlus className="ml-1 h-4 w-4" />إضافة بند</Button></div><div className="space-y-3">{form.items.map((item, index) => <div key={index} className="grid gap-3 sm:grid-cols-[1fr_110px_140px_36px]"><Input required placeholder="بيان البند" value={item.description} onChange={event => updateItem(index, { description: event.target.value })} /><Input required inputMode="decimal" placeholder="الكمية" value={item.quantity} onChange={event => updateItem(index, { quantity: event.target.value })} /><Input required inputMode="decimal" placeholder="سعر الوحدة" value={item.unitPrice} onChange={event => updateItem(index, { unitPrice: event.target.value })} /><Button type="button" variant="ghost" disabled={form.items.length === 1} onClick={() => setForm({ ...form, items: form.items.filter((_, position) => position !== index) })} className="h-10 w-9 text-[#b9404a] hover:bg-[#fff1f2]"><Minus className="h-4 w-4" /></Button></div>)}</div><div className="mt-4 flex justify-end"><div className="rounded-xl bg-white px-4 py-3 text-left shadow-sm"><p className="text-xs text-slate-500">إجمالي المعاينة</p><p className="mt-1 text-lg font-extrabold text-[#083f4c]">{money(totalPreview, form.currencyCode)}</p></div></div></div>
            <Field label="ملاحظات"><Textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="ملاحظات اختيارية تظهر في تفاصيل الفاتورة" /></Field>
            <DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={closeDialog}>إلغاء</Button><Button type="submit" disabled={createMutation.isPending || !setupQuery.data} className="bg-[#0a6372] hover:bg-[#084e5a]">{createMutation.isPending ? "جارٍ إصدار الفاتورة..." : "اعتماد الفاتورة"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={documentId !== null} onOpenChange={open => { if (!open) setDocumentId(null); }}>
        <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          {documentQuery.isLoading ? <ListSkeleton /> : documentQuery.data ? <InvoiceDocument data={documentQuery.data} /> : <p className="p-8 text-center text-sm text-slate-500">تعذر تحميل الفاتورة.</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label className="font-bold text-[#083f4c]">{label}</Label>{children}</div>; }
function ListSkeleton() { return <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}</div>; }
function InvoiceDocument({ data }: { data: any }) { return <div className="space-y-5 py-2"><div className="flex items-start justify-between border-b-2 border-[#0a6372] pb-4"><div className="flex items-center gap-3"><img src="/api/app/app-icon.svg" alt="شعار الشامل" className="h-14 w-20 rounded-lg border border-[#e5d3a3] object-contain p-1" /><div><p className="text-xl font-extrabold text-[#083f4c]">الشامل لخدمات الإنترنت</p><p className="mt-1 text-sm text-slate-500">يافع الصعيد · 777600474</p></div></div><div className="text-left"><p className="font-extrabold text-[#0a6372]">فاتورة مبيعات</p><p className="mt-1 text-sm text-slate-500">{data.invoice.invoiceNumber}</p></div></div><div className="grid gap-3 rounded-xl bg-[#f8fcfb] p-4 sm:grid-cols-2"><div><p className="text-xs text-slate-500">العميل</p><p className="mt-1 font-extrabold text-[#083f4c]">{data.contact.name}</p><p className="mt-1 text-sm text-slate-500">{data.contact.phone || "—"}</p></div><div><p className="text-xs text-slate-500">التاريخ ونوع الفاتورة</p><p className="mt-1 font-bold text-[#083f4c]">{arabicDate(data.invoice.issueDate)} · {data.invoice.type === "cash" ? "نقدية" : "آجلة"}</p></div></div><table className="w-full text-right text-sm"><thead className="border-y border-[#dce8e5] bg-[#f8fcfb]"><tr><th className="p-3">البيان</th><th className="p-3">الكمية</th><th className="p-3">سعر الوحدة</th><th className="p-3">الإجمالي</th></tr></thead><tbody>{data.items.map((item: any) => <tr key={item.id} className="border-b border-[#edf3f1]"><td className="p-3 font-bold text-[#083f4c]">{item.description}</td><td className="p-3">{item.quantity}</td><td className="p-3">{money(item.unitPrice, data.invoice.currencyCode)}</td><td className="p-3 font-extrabold">{money(item.lineTotal, data.invoice.currencyCode)}</td></tr>)}</tbody></table><div className="mr-auto w-full max-w-xs space-y-2 rounded-xl border border-[#dce8e5] p-4 text-sm"><div className="flex justify-between"><span>الإجمالي</span><b>{money(data.invoice.totalAmount, data.invoice.currencyCode)}</b></div><div className="flex justify-between text-[#08735d]"><span>المسدد</span><b>{money(data.invoice.paidAmount, data.invoice.currencyCode)}</b></div><div className="flex justify-between text-[#9c711a]"><span>المتبقي</span><b>{money(data.invoice.dueAmount, data.invoice.currencyCode)}</b></div></div><p className="text-center text-xs text-slate-500">شكراً لتعاملكم مع الشامل لخدمات الإنترنت</p><DialogFooter><Button type="button" onClick={() => window.print()} className="bg-[#0a6372] hover:bg-[#084e5a]"><Printer className="ml-2 h-4 w-4" />طباعة الفاتورة</Button></DialogFooter></div>; }
