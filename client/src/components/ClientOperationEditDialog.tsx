import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, FileText, ReceiptText } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export type ClientOperation = { kind: "invoice" | "receipt"; id: number } | null;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label className="font-bold text-[#083f4c]">{label}</Label>{children}</div>;
}

export function ClientOperationEditDialog({ contactId, operation, onClose, onSuccess }: { contactId: number; operation: ClientOperation; onClose: () => void; onSuccess: () => void }) {
  const utils = trpc.useUtils();
  const invoiceQuery = trpc.accounting.invoiceDocument.useQuery({ invoiceId: operation?.kind === "invoice" ? operation.id : 0 }, { enabled: operation?.kind === "invoice" });
  const receiptQuery = trpc.accounting.receiptDocument.useQuery({ receiptId: operation?.kind === "receipt" ? operation.id : 0 }, { enabled: operation?.kind === "receipt" });
  const cashQuery = trpc.accounting.cashSummary.useQuery();
  const openInvoicesQuery = trpc.accounting.openInvoices.useQuery({ contactId }, { enabled: operation?.kind === "receipt" });
  const [invoiceForm, setInvoiceForm] = useState({ date: "", description: "", amount: "", cashAccountId: "", notes: "" });
  const [receiptForm, setReceiptForm] = useState({ date: "", amount: "", cashAccountId: "", notes: "", allocations: {} as Record<number, string> });

  useEffect(() => {
    const document = invoiceQuery.data;
    if (!document) return;
    setInvoiceForm({ date: new Date(document.invoice.issueDate).toISOString().slice(0, 10), description: document.items[0]?.description ?? "فاتورة", amount: document.invoice.totalAmount, cashAccountId: document.invoice.cashAccountId ? String(document.invoice.cashAccountId) : "", notes: document.invoice.notes ?? "" });
  }, [invoiceQuery.data]);
  useEffect(() => {
    const document = receiptQuery.data;
    if (!document) return;
    setReceiptForm({ date: new Date(document.receipt.receiptDate).toISOString().slice(0, 10), amount: document.receipt.amount, cashAccountId: document.receipt.cashAccountId ? String(document.receipt.cashAccountId) : "", notes: document.receipt.notes ?? "", allocations: Object.fromEntries(document.allocations.map(row => [row.allocation.invoiceId, row.allocation.amount])) });
  }, [receiptQuery.data]);

  const updateInvoiceMutation = trpc.accounting.updateInvoice.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.accounting.contactStatement.invalidate({ contactId }), utils.accounting.invoices.invalidate(), utils.accounting.openInvoices.invalidate(), utils.accounting.cashSummary.invalidate(), utils.accounting.dashboard.invalidate()]);
      toast.success("تم تعديل الفاتورة وتحديث رصيد العميل");
      onSuccess();
    },
    onError: error => toast.error(error.message),
  });
  const updateReceiptMutation = trpc.accounting.updateReceipt.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.accounting.contactStatement.invalidate({ contactId }), utils.accounting.receipts.invalidate(), utils.accounting.invoices.invalidate(), utils.accounting.openInvoices.invalidate(), utils.accounting.cashSummary.invalidate(), utils.accounting.dashboard.invalidate()]);
      toast.success("تم تعديل سند القبض وتحديث الصندوق والرصيد");
      onSuccess();
    },
    onError: error => toast.error(error.message),
  });
  const invoiceOptions = useMemo(() => {
    const selected = receiptQuery.data?.allocations.map(row => ({ id: row.allocation.invoiceId, invoiceNumber: row.invoiceNumber, dueAmount: row.allocation.amount, currencyCode: receiptQuery.data!.receipt.currencyCode })) ?? [];
    const open = (openInvoicesQuery.data ?? []).filter(invoice => invoice.currencyCode === receiptQuery.data?.receipt.currencyCode);
    const all = [...selected];
    for (const invoice of open) if (!all.some(row => row.id === invoice.id)) all.push({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, dueAmount: invoice.dueAmount, currencyCode: invoice.currencyCode });
    return all;
  }, [receiptQuery.data, openInvoicesQuery.data]);
  const allocationTotal = Object.values(receiptForm.allocations).reduce((sum, amount) => sum + Number(amount || 0), 0);

  function saveInvoice(event: FormEvent) {
    event.preventDefault();
    if (!operation || operation.kind !== "invoice") return;
    if (invoiceQuery.data?.invoice.type === "cash" && !invoiceForm.cashAccountId) return toast.error("اختر الحساب المستلم للفاتورة النقدية");
    updateInvoiceMutation.mutate({ contactId, invoiceId: operation.id, issueDate: new Date(`${invoiceForm.date}T12:00:00`), description: invoiceForm.description, amount: invoiceForm.amount, cashAccountId: invoiceQuery.data?.invoice.type === "cash" ? Number(invoiceForm.cashAccountId) : undefined, notes: invoiceForm.notes || undefined });
  }
  function saveReceipt(event: FormEvent) {
    event.preventDefault();
    if (!operation || operation.kind !== "receipt") return;
    const allocations = Object.entries(receiptForm.allocations).filter(([, amount]) => Number(amount) > 0).map(([invoiceId, amount]) => ({ invoiceId: Number(invoiceId), amount }));
    if (!receiptForm.cashAccountId) return toast.error("اختر الحساب المستلم لسند القبض");
    updateReceiptMutation.mutate({ contactId, receiptId: operation.id, receiptDate: new Date(`${receiptForm.date}T12:00:00`), amount: receiptForm.amount, cashAccountId: Number(receiptForm.cashAccountId), notes: receiptForm.notes || undefined, allocations });
  }

  const isInvoice = operation?.kind === "invoice";
  const isLoading = isInvoice ? invoiceQuery.isLoading : receiptQuery.isLoading;
  const title = isInvoice ? "تعديل الفاتورة" : "تعديل سند القبض";
  return <Dialog open={operation !== null} onOpenChange={open => { if (!open) onClose(); }}><DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2">{isInvoice ? <FileText className="h-5 w-5 text-[#0a6372]" /> : <ReceiptText className="h-5 w-5 text-[#08735d]" />}{title}</DialogTitle><DialogDescription>{isInvoice ? "يمكن تعديل المبلغ والبيان والتاريخ. لا يمكن تخفيض فاتورة آجلة تحت ما قُبض عليها." : "تعديل المبلغ أو التوزيع أو الحساب المستلم يحدث الأرصدة والفواتير داخل معاملة واحدة."}</DialogDescription></DialogHeader>{isLoading ? <div className="py-10 text-center text-sm text-slate-500">جارٍ تحميل العملية...</div> : isInvoice ? <form onSubmit={saveInvoice} className="space-y-4 py-2"><div className="rounded-xl border border-[#d7e7e2] bg-[#f5fbf9] p-3 text-sm text-[#0a6372]">تعديل الفاتورة النقدية يحدّث الحساب المستلم، أما الآجلة فتحدّث مديونية العميل فقط.</div><div className="grid gap-4 sm:grid-cols-2"><Field label="تاريخ الفاتورة"><Input type="date" required value={invoiceForm.date} onChange={event => setInvoiceForm(current => ({ ...current, date: event.target.value }))} /></Field><Field label="مبلغ الفاتورة"><Input required inputMode="decimal" value={invoiceForm.amount} onChange={event => setInvoiceForm(current => ({ ...current, amount: event.target.value }))} /></Field></div>{invoiceQuery.data?.invoice.type === "cash" ? <Field label="الحساب المستلم"><select required value={invoiceForm.cashAccountId} onChange={event => setInvoiceForm(current => ({ ...current, cashAccountId: event.target.value }))} className="form-select"><option value="" disabled>اختر صندوقاً أو بنكاً</option>{(cashQuery.data?.accounts ?? []).map(account => <option key={account.id} value={account.id}>{account.type === "bank" ? "بنك: " : "صندوق: "}{account.name}</option>)}</select></Field> : null}<Field label="بيان الفاتورة"><Input required value={invoiceForm.description} onChange={event => setInvoiceForm(current => ({ ...current, description: event.target.value }))} /></Field><Field label="ملاحظات"><Textarea value={invoiceForm.notes} onChange={event => setInvoiceForm(current => ({ ...current, notes: event.target.value }))} /></Field><DialogFooter><Button type="button" variant="outline" onClick={onClose}>إلغاء</Button><Button type="submit" disabled={updateInvoiceMutation.isPending} className="bg-[#0a6372] hover:bg-[#084e5a]">{updateInvoiceMutation.isPending ? "جارٍ الحفظ..." : "حفظ تعديل الفاتورة"}</Button></DialogFooter></form> : <form onSubmit={saveReceipt} className="space-y-4 py-2"><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">تعديل سند القبض يحدّث توزيعات الفواتير والحساب المستلم تلقائياً وبشكل متزامن.</div><div className="grid gap-4 sm:grid-cols-2"><Field label="تاريخ القبض"><Input type="date" required value={receiptForm.date} onChange={event => setReceiptForm(current => ({ ...current, date: event.target.value }))} /></Field><Field label="مبلغ السند"><Input required inputMode="decimal" value={receiptForm.amount} onChange={event => setReceiptForm(current => ({ ...current, amount: event.target.value }))} /></Field></div><Field label="الحساب المستلم"><select required value={receiptForm.cashAccountId} onChange={event => setReceiptForm(current => ({ ...current, cashAccountId: event.target.value }))} className="form-select"><option value="" disabled>اختر صندوقاً أو بنكاً</option>{(cashQuery.data?.accounts ?? []).map(account => <option key={account.id} value={account.id}>{account.type === "bank" ? "بنك: " : "صندوق: "}{account.name}</option>)}</select></Field><div className="rounded-2xl border border-[#dce8e5] bg-[#fbfdfc] p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-extrabold text-[#083f4c]">توزيع السند على الفواتير الآجلة</h3><span className={`font-extrabold ${allocationTotal === Number(receiptForm.amount || 0) ? "text-[#08735d]" : "text-rose-700"}`}>الموزع: {allocationTotal.toFixed(2)}</span></div>{invoiceOptions.length ? <div className="space-y-2">{invoiceOptions.map(invoice => <div key={invoice.id} className="grid gap-3 rounded-xl border border-[#dce8e5] bg-white p-3 sm:grid-cols-[1fr_150px]"><div><p className="font-bold text-[#083f4c]">{invoice.invoiceNumber}</p><p className="mt-1 text-xs text-slate-500">المبلغ المرتبط/المتبقي: {invoice.dueAmount} {invoice.currencyCode}</p></div><Input inputMode="decimal" value={receiptForm.allocations[invoice.id] ?? ""} onChange={event => setReceiptForm(current => ({ ...current, allocations: { ...current.allocations, [invoice.id]: event.target.value } }))} placeholder="مبلغ القبض" /></div>)}</div> : <p className="text-sm text-slate-500">لا توجد فواتير قابلة للتوزيع بهذه العملة.</p>}</div><Field label="ملاحظات"><Textarea value={receiptForm.notes} onChange={event => setReceiptForm(current => ({ ...current, notes: event.target.value }))} /></Field><DialogFooter><Button type="button" variant="outline" onClick={onClose}>إلغاء</Button><Button type="submit" disabled={updateReceiptMutation.isPending || allocationTotal !== Number(receiptForm.amount || 0)} className="bg-[#08735d] hover:bg-[#075d4b]">{updateReceiptMutation.isPending ? "جارٍ الحفظ..." : "حفظ تعديل سند القبض"}</Button></DialogFooter></form>}</DialogContent></Dialog>;
}
