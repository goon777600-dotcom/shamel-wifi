import { EmptyState, PageHeader, SectionCard, StatusBadge, arabicDate, money } from "@/components/accounting/ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { HandCoins, Plus, Printer, ReceiptText, Search } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

type ReceiptForm = { contactId: string; movementCategoryId: string; cashAccountId: string; receiptDate: string; currencyCode: "YER" | "SAR" | "USD"; exchangeRateToBase: string; notes: string; allocations: Record<number, string> };
const blankReceipt = (categoryId?: number, cashAccountId = ""): ReceiptForm => ({ contactId: "", movementCategoryId: categoryId ? String(categoryId) : "", cashAccountId, receiptDate: new Date().toISOString().slice(0, 10), currencyCode: "YER", exchangeRateToBase: "1", notes: "", allocations: {} });

export default function ReceiptsPage() {
  const receiptsQuery = trpc.accounting.receipts.useQuery();
  const contactsQuery = trpc.accounting.contacts.useQuery();
  const setupQuery = trpc.accounting.setup.useQuery();
  const cashQuery = trpc.accounting.cashSummary.useQuery();
  const utils = trpc.useUtils();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [documentId, setDocumentId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<ReceiptForm>(blankReceipt());
  const documentQuery = trpc.accounting.receiptDocument.useQuery({ receiptId: documentId ?? 0 }, { enabled: documentId !== null });
  const openInvoicesQuery = trpc.accounting.openInvoices.useQuery({ contactId: form.contactId ? Number(form.contactId) : undefined }, { enabled: Boolean(form.contactId) });
  const receiptCategories = setupQuery.data?.movementCategories.filter(category => category.kind === "receipt") ?? [];
  const visibleOpenInvoices = (openInvoicesQuery.data ?? []).filter(invoice => invoice.currencyCode === form.currencyCode);
  const totalAmount = Object.values(form.allocations).reduce((sum, amount) => sum + Number(amount || 0), 0);
  const receiptMutation = trpc.accounting.createReceipt.useMutation({
    onSuccess: async result => {
      await Promise.all([utils.accounting.receipts.invalidate(), utils.accounting.invoices.invalidate(), utils.accounting.openInvoices.invalidate(), utils.accounting.dashboard.invalidate(), utils.accounting.cashSummary.invalidate()]);
      toast.success(`تم اعتماد سند القبض ${result.receiptNumber}`);
      setDialogOpen(false);
    },
    onError: error => toast.error(error.message),
  });
  const filtered = useMemo(() => (receiptsQuery.data ?? []).filter(row => `${row.receipt.receiptNumber} ${row.contactName}`.toLowerCase().includes(search.toLowerCase())), [receiptsQuery.data, search]);

  function openDialog() { setForm(blankReceipt(receiptCategories[0]?.id, cashQuery.data?.accounts[0] ? String(cashQuery.data.accounts[0].id) : "")); setDialogOpen(true); }
  function updateAllocation(invoiceId: number, amount: string) { setForm(current => ({ ...current, allocations: { ...current.allocations, [invoiceId]: amount } })); }
  function submit(event: FormEvent) {
    event.preventDefault();
    const allocations = Object.entries(form.allocations).filter(([, amount]) => Number(amount) > 0).map(([invoiceId, amount]) => ({ invoiceId: Number(invoiceId), amount }));
    if (!form.contactId || !allocations.length || !form.cashAccountId) { toast.error("اختر العميل والحساب المستلم وأدخل مبلغاً لفاتورة آجلة واحدة على الأقل"); return; }
    receiptMutation.mutate({ contactId: Number(form.contactId), movementCategoryId: form.movementCategoryId ? Number(form.movementCategoryId) : undefined, cashAccountId: Number(form.cashAccountId), receiptDate: new Date(`${form.receiptDate}T12:00:00`), currencyCode: form.currencyCode, exchangeRateToBase: form.exchangeRateToBase, amount: totalAmount.toFixed(2), notes: form.notes || undefined, allocations });
  }

  return (
    <div>
      <PageHeader title="سندات القبض" description="سجّل المبلغ عند استلامه فعلياً من العميل، واختر الصندوق أو البنك الذي استلم فيه. يسدد السند الفواتير الآجلة دون أن يعد إيراداً جديداً." action={<Button onClick={openDialog} className="h-11 bg-[#0a6372] px-5 font-bold hover:bg-[#084e5a]"><Plus className="ml-2 h-4 w-4" />سند قبض جديد</Button>} />
      <SectionCard title="سجل سندات القبض" subtitle="لا يعد سند القبض إيراداً جديداً، وإنما يحول مديونية سابقة إلى رصيد فعلي في الحساب المحدد.">
        <div className="border-b border-[#e8f0ee] p-4"><div className="relative max-w-md"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={event => setSearch(event.target.value)} className="h-11 bg-[#fbfdfc] pr-10" placeholder="ابحث برقم السند أو العميل" /></div></div>
        {receiptsQuery.isLoading ? <ListSkeleton /> : filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-right"><thead className="bg-[#f8fcfb] text-xs text-slate-500"><tr><th className="px-5 py-3">رقم السند</th><th className="px-5 py-3">العميل</th><th className="px-5 py-3">الحساب المستلم</th><th className="px-5 py-3">التاريخ</th><th className="px-5 py-3">المبلغ المقبوض</th><th className="px-5 py-3">العملة</th><th className="px-5 py-3">الحالة</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-[#edf3f1]">{filtered.map(row => <tr key={row.receipt.id} className="hover:bg-[#fbfefd]"><td className="px-5 py-4 font-extrabold text-[#0a6372]">{row.receipt.receiptNumber}</td><td className="px-5 py-4 font-bold text-[#083f4c]">{row.contactName}</td><td className="px-5 py-4 text-sm font-bold text-[#083f4c]">{row.cashAccountName ?? "صندوق الشبكة الرئيسي"}</td><td className="px-5 py-4 text-sm text-slate-500">{arabicDate(row.receipt.receiptDate)}</td><td className="px-5 py-4 font-extrabold text-[#08735d]">{money(row.receipt.amount, row.receipt.currencyCode)}</td><td className="px-5 py-4 text-sm text-slate-600">{row.receipt.currencyCode}</td><td className="px-5 py-4"><StatusBadge status={row.receipt.status} /></td><td className="px-5 py-4"><Button size="sm" variant="outline" onClick={() => setDocumentId(row.receipt.id)} className="border-[#bcd9d2] text-[#0a6372] hover:bg-[#eff8f5]"><Printer className="ml-1 h-4 w-4" />طباعة</Button></td></tr>)}</tbody></table></div> : <EmptyState title="لا توجد سندات قبض بعد" description="أصدر فاتورة آجلة ثم استلم المبلغ وسجله هنا في الصندوق أو البنك الذي استلم فيه." />}
      </SectionCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>سند قبض جديد</DialogTitle><DialogDescription>اختر فواتير العميل الآجلة وأدخل المبلغ المقبوض على كل فاتورة. مجموع التوزيع هو مبلغ السند الذي سيدخل الصندوق.</DialogDescription></DialogHeader>
          <form onSubmit={submit} className="space-y-5 py-2">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="العميل"><select required value={form.contactId} onChange={event => setForm({ ...form, contactId: event.target.value, allocations: {} })} className="form-select"><option value="">اختر العميل</option>{(contactsQuery.data ?? []).filter(contact => contact.type === "customer" || contact.type === "grocery").map(contact => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></Field>
              <Field label="الحساب المستلم"><select required value={form.cashAccountId} onChange={event => setForm({ ...form, cashAccountId: event.target.value })} className="form-select"><option value="" disabled>اختر صندوقاً أو بنكاً</option>{(cashQuery.data?.accounts ?? []).map(account => <option key={account.id} value={account.id}>{account.type === "bank" ? "بنك: " : "صندوق: "}{account.name}</option>)}</select></Field>
              <Field label="تاريخ القبض"><Input required type="date" value={form.receiptDate} onChange={event => setForm({ ...form, receiptDate: event.target.value })} /></Field>
              <Field label="العملة"><select value={form.currencyCode} onChange={event => { const currencyCode = event.target.value as ReceiptForm["currencyCode"]; setForm({ ...form, currencyCode, exchangeRateToBase: currencyCode === "YER" ? "1" : form.exchangeRateToBase, allocations: {} }); }} className="form-select"><option value="YER">ريال يمني</option><option value="SAR">ريال سعودي</option><option value="USD">دولار أمريكي</option></select></Field>
              <Field label="سعر الصرف إلى ر.ي"><Input required inputMode="decimal" value={form.exchangeRateToBase} onChange={event => setForm({ ...form, exchangeRateToBase: event.target.value })} /></Field>
            </div>
            <Field label="تصنيف الحركة"><select value={form.movementCategoryId} onChange={event => setForm({ ...form, movementCategoryId: event.target.value })} className="form-select"><option value="">سند قبض عام</option>{receiptCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
            <div className="rounded-2xl border border-[#dce8e5] bg-[#fbfdfc] p-4"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-extrabold text-[#083f4c]">الفواتير الآجلة غير المسددة</h3><p className="mt-1 text-xs text-slate-500">تظهر فواتير العميل المحدد وبالعملة نفسها فقط.</p></div><span className="rounded-xl bg-[#eaf7f2] px-3 py-2 text-sm font-extrabold text-[#08735d]">إجمالي السند: {money(totalAmount, form.currencyCode)}</span></div>{!form.contactId ? <div className="rounded-xl border border-dashed border-[#c5dbd5] p-8 text-center text-sm text-slate-500">اختر العميل لعرض فواتيره الآجلة.</div> : openInvoicesQuery.isLoading ? <ListSkeleton /> : visibleOpenInvoices.length ? <div className="space-y-3">{visibleOpenInvoices.map(invoice => { const amount = form.allocations[invoice.id] ?? ""; return <div key={invoice.id} className="grid items-center gap-3 rounded-xl border border-[#dce8e5] bg-white p-3 sm:grid-cols-[auto_1fr_150px]"><Checkbox checked={Boolean(amount)} onCheckedChange={checked => updateAllocation(invoice.id, checked ? invoice.dueAmount : "")} /><div><p className="font-extrabold text-[#083f4c]">{invoice.invoiceNumber}</p><p className="mt-1 text-xs text-slate-500">{arabicDate(invoice.issueDate)} · المتبقي: {money(invoice.dueAmount, invoice.currencyCode)}</p></div><Input disabled={!amount} required={Boolean(amount)} inputMode="decimal" value={amount} onChange={event => updateAllocation(invoice.id, event.target.value)} placeholder="مبلغ القبض" /></div>; })}</div> : <div className="rounded-xl border border-dashed border-[#c5dbd5] p-8 text-center text-sm text-slate-500">لا توجد فواتير آجلة غير مسددة بهذه العملة.</div>}</div>
            <Field label="ملاحظات"><Textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="أي توضيح عن الاستلام" /></Field>
            <DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button><Button type="submit" disabled={receiptMutation.isPending || totalAmount <= 0} className="bg-[#0a6372] hover:bg-[#084e5a]">{receiptMutation.isPending ? "جارٍ اعتماد السند..." : "اعتماد سند القبض"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={documentId !== null} onOpenChange={open => { if (!open) setDocumentId(null); }}><DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">{documentQuery.isLoading ? <ListSkeleton /> : documentQuery.data ? <ReceiptDocument data={documentQuery.data} /> : <p className="p-8 text-center text-sm text-slate-500">تعذر تحميل سند القبض.</p>}</DialogContent></Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label className="font-bold text-[#083f4c]">{label}</Label>{children}</div>; }
function ListSkeleton() { return <div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}</div>; }
function ReceiptDocument({ data }: { data: any }) { return <div className="space-y-5 py-2"><div className="flex items-start justify-between border-b-2 border-[#0a6372] pb-4"><div className="flex items-center gap-3"><img src="/api/app/app-icon.svg" alt="شعار الشامل" className="h-14 w-20 rounded-lg border border-[#e5d3a3] object-contain p-1" /><div><p className="text-xl font-extrabold text-[#083f4c]">الشامل لخدمات الإنترنت</p><p className="mt-1 text-sm text-slate-500">يافع الصعيد · 777600474</p></div></div><div className="text-left"><p className="font-extrabold text-[#0a6372]">سند قبض</p><p className="mt-1 text-sm text-slate-500">{data.receipt.receiptNumber}</p></div></div><div className="grid gap-3 rounded-xl bg-[#f8fcfb] p-4 sm:grid-cols-3"><div><p className="text-xs text-slate-500">استلمنا من</p><p className="mt-1 font-extrabold text-[#083f4c]">{data.contact.name}</p><p className="mt-1 text-sm text-slate-500">{data.contact.phone || "—"}</p></div><div><p className="text-xs text-slate-500">تاريخ القبض</p><p className="mt-1 font-bold text-[#083f4c]">{arabicDate(data.receipt.receiptDate)}</p></div><div><p className="text-xs text-slate-500">الحساب المستلم</p><p className="mt-1 font-bold text-[#083f4c]">{data.receipt.cashAccountName ?? "صندوق الشبكة الرئيسي"}</p></div></div><div className="rounded-xl border border-[#dce8e5] p-4"><p className="text-sm text-slate-500">المبلغ المقبوض</p><p className="mt-2 text-2xl font-extrabold text-[#08735d]">{money(data.receipt.amount, data.receipt.currencyCode)}</p></div><div className="rounded-xl border border-[#dce8e5]"><h3 className="border-b border-[#e8f0ee] px-4 py-3 font-extrabold text-[#083f4c]">الفواتير المسددة بهذا السند</h3>{data.allocations.length ? <div className="divide-y divide-[#edf3f1]">{data.allocations.map((item: any) => <div key={item.allocation.id} className="flex items-center justify-between px-4 py-3"><span className="font-bold text-[#083f4c]">{item.invoiceNumber}</span><span className="font-extrabold text-[#08735d]">{money(item.allocation.amount, data.receipt.currencyCode)}</span></div>)}</div> : <p className="p-4 text-sm text-slate-500">لا توجد فواتير مرتبطة.</p>}</div><p className="text-center text-xs text-slate-500">هذا السند يثبت استلام المبلغ وإضافته إلى الحساب المبين أعلاه.</p><DialogFooter><Button type="button" onClick={() => window.print()} className="bg-[#0a6372] hover:bg-[#084e5a]"><Printer className="ml-2 h-4 w-4" />طباعة السند</Button></DialogFooter></div>; }
