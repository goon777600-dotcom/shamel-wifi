import { EmptyState, PageHeader, SectionCard, StatusBadge, arabicDate, money } from "@/components/accounting/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { exportExpenseCategoryOperationsToExcel } from "@/lib/individualSubscriptionsExport";
import { printExpenseCategoryStatement } from "@/lib/expenseCategoryStatement";
import { AlertTriangle, CalendarDays, Download, ExternalLink, FileText, Fuel, Package, Paperclip, Pencil, Plus, Printer, ReceiptText, Search, UsersRound, Wifi, Wrench } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

type ExpenseForm = { contactId: string; movementCategoryId: string; cashAccountId: string; expenseDate: string; currencyCode: "YER" | "SAR" | "USD"; exchangeRateToBase: string; amount: string; description: string; supplierName: string; supplierInvoiceNumber: string; notes: string; allowCashOverdraft: boolean; cashOverrideReason: string };
type AttachmentForm = { fileName: string; mimeType: "image/jpeg" | "image/png" | "application/pdf"; dataBase64: string };
const blankExpense = (categoryId?: number, cashAccountId = ""): ExpenseForm => ({ contactId: "", movementCategoryId: categoryId ? String(categoryId) : "", cashAccountId, expenseDate: new Date().toISOString().slice(0, 10), currencyCode: "YER", exchangeRateToBase: "1", amount: "", description: "", supplierName: "", supplierInvoiceNumber: "", notes: "", allowCashOverdraft: false, cashOverrideReason: "" });

export default function ExpensesPage() {
  const expensesQuery = trpc.accounting.expenses.useQuery();
  const contactsQuery = trpc.accounting.contacts.useQuery();
  const setupQuery = trpc.accounting.setup.useQuery();
  const cashQuery = trpc.accounting.cashSummary.useQuery();
  const utils = trpc.useUtils();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [summaryMonth, setSummaryMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [detailsCategoryId, setDetailsCategoryId] = useState<number | null>(null);
  const [form, setForm] = useState<ExpenseForm>(blankExpense());
  const [attachment, setAttachment] = useState<AttachmentForm | null>(null);
  const expenseCategories = setupQuery.data?.movementCategories.filter(category => category.kind === "expense") ?? [];
  const selectedCategory = expenseCategories.find(category => category.id === Number(form.movementCategoryId));
  const isExternalPurchase = Boolean(selectedCategory && (selectedCategory.name.includes("شراء أصل") || selectedCategory.name.includes("معدات") || selectedCategory.name.includes("كهرباء")));
  const supportsSupplierDetails = isExternalPurchase || Boolean(selectedCategory?.name.includes("شراء خدمة الإنترنت"));

  const refresh = async () => Promise.all([utils.accounting.expenses.invalidate(), utils.accounting.cashSummary.invalidate(), utils.accounting.dashboard.invalidate(), utils.accounting.financialReport.invalidate()]);
  const createMutation = trpc.accounting.createExpense.useMutation({ onSuccess: async result => { await refresh(); toast.success(`تم تسجيل المصروف ${result.expenseNumber}`); closeDialog(); }, onError: error => toast.error(error.message) });
  const updateMutation = trpc.accounting.updateExpense.useMutation({ onSuccess: async result => { await refresh(); toast.success(`تم تعديل المصروف ${result.expenseNumber}`); closeDialog(); }, onError: error => toast.error(error.message) });
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const filtered = useMemo(() => (expensesQuery.data ?? []).filter(row => `${row.expense.expenseNumber} ${row.expense.description} ${row.categoryName ?? ""}`.toLowerCase().includes(search.toLowerCase())), [expensesQuery.data, search]);
  const monthlyCategoryTotals = useMemo(() => {
    const totals = new Map<number, ExpenseCategoryTotal>();
    for (const category of expenseCategories) totals.set(category.id, { id: category.id, name: category.name, amounts: { YER: 0, SAR: 0, USD: 0 }, count: 0 });
    for (const row of expensesQuery.data ?? []) {
      if (new Date(row.expense.expenseDate).toISOString().slice(0, 7) !== summaryMonth || !row.expense.movementCategoryId) continue;
      const item = totals.get(row.expense.movementCategoryId) ?? { id: row.expense.movementCategoryId, name: row.categoryName ?? "غير مصنف", amounts: { YER: 0, SAR: 0, USD: 0 }, count: 0 };
      item.amounts[row.expense.currencyCode as ExpenseForm["currencyCode"]] += Math.round(Number(row.expense.amount) * 100);
      item.count += 1;
      totals.set(row.expense.movementCategoryId, item);
    }
    return [...totals.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ar"));
  }, [expenseCategories, expensesQuery.data, summaryMonth]);
  const detailsCategory = monthlyCategoryTotals.find(category => category.id === detailsCategoryId) ?? null;
  const categoryExpenseRows = useMemo(() => (expensesQuery.data ?? []).filter(row => row.expense.movementCategoryId === detailsCategoryId && new Date(row.expense.expenseDate).toISOString().slice(0, 7) === summaryMonth), [detailsCategoryId, expensesQuery.data, summaryMonth]);

  function closeDialog() { setDialogOpen(false); setEditingExpenseId(null); setAttachment(null); }
  function openCreate() { setForm(blankExpense(expenseCategories[0]?.id, cashQuery.data?.accounts[0] ? String(cashQuery.data.accounts[0].id) : "")); setAttachment(null); setEditingExpenseId(null); setDialogOpen(true); }
  function openEdit(row: NonNullable<typeof expensesQuery.data>[number]) {
    setForm({ contactId: row.expense.contactId ? String(row.expense.contactId) : "", movementCategoryId: String(row.expense.movementCategoryId ?? ""), cashAccountId: row.expense.cashAccountId ? String(row.expense.cashAccountId) : "", expenseDate: new Date(row.expense.expenseDate).toISOString().slice(0, 10), currencyCode: row.expense.currencyCode as ExpenseForm["currencyCode"], exchangeRateToBase: row.expense.exchangeRateToBase, amount: row.expense.amount, description: row.expense.description, supplierName: row.expense.supplierName ?? "", supplierInvoiceNumber: row.expense.supplierInvoiceNumber ?? "", notes: row.expense.notes ?? "", allowCashOverdraft: row.expense.allowCashOverdraft, cashOverrideReason: row.expense.cashOverrideReason ?? "" });
    setAttachment(null); setEditingExpenseId(row.expense.id); setDialogOpen(true);
  }
  function exportCategoryDetails() {
    if (!detailsCategory) return;
    const count = exportExpenseCategoryOperationsToExcel(detailsCategory.name, summaryMonth, categoryExpenseRows.map(row => ({ ...row.expense, status: row.expense.allowCashOverdraft ? "تجاوز موثق" : row.expense.status })));
    toast.success(`تم تصدير ${count} عملية إلى Excel`);
  }
  function printCategoryDetails() {
    if (!detailsCategory) return;
    const opened = printExpenseCategoryStatement({ categoryName: detailsCategory.name, month: summaryMonth, operations: categoryExpenseRows.map(row => ({ ...row.expense, status: row.expense.allowCashOverdraft ? "تجاوز موثق" : row.expense.status })) });
    if (!opened) toast.error("اسمح للمتصفح بفتح نافذة الطباعة ثم أعد المحاولة");
  }
  function selectCategory(value: string) { setForm(current => ({ ...current, movementCategoryId: value, supplierName: "", supplierInvoiceNumber: "" })); setAttachment(null); }
  function readAttachment(file?: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("يجب أن يكون ملف الفاتورة أقل من 5 ميغابايت");
    if (!(["image/jpeg", "image/png", "application/pdf"] as string[]).includes(file.type)) return toast.error("اختر صورة JPG أو PNG أو ملف PDF فقط");
    const reader = new FileReader();
    reader.onload = () => setAttachment({ fileName: file.name, mimeType: file.type as AttachmentForm["mimeType"], dataBase64: String(reader.result).split(",")[1] ?? "" });
    reader.readAsDataURL(file);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.movementCategoryId || !form.cashAccountId) return toast.error("اختر تصنيف المصروف والحساب الدافع لحفظ دقة التقارير");
    if (isExternalPurchase && (!form.supplierName.trim() || !form.supplierInvoiceNumber.trim())) return toast.error("أدخل اسم المحل أو التاجر ورقم فاتورته لعملية الشراء الخارجية");
    if (form.allowCashOverdraft && form.cashOverrideReason.trim().length < 2) return toast.error("اكتب سبب تجاوز الصندوق بوضوح");
    const shared = { contactId: form.contactId ? Number(form.contactId) : undefined, movementCategoryId: Number(form.movementCategoryId), cashAccountId: Number(form.cashAccountId), expenseDate: new Date(`${form.expenseDate}T12:00:00`), amount: form.amount, description: form.description, supplierName: supportsSupplierDetails ? form.supplierName || undefined : undefined, supplierInvoiceNumber: supportsSupplierDetails ? form.supplierInvoiceNumber || undefined : undefined, notes: form.notes || undefined, allowCashOverdraft: form.allowCashOverdraft, cashOverrideReason: form.allowCashOverdraft ? form.cashOverrideReason : undefined };
    if (editingExpenseId) updateMutation.mutate({ expenseId: editingExpenseId, ...shared });
    else createMutation.mutate({ ...shared, currencyCode: form.currencyCode, exchangeRateToBase: form.exchangeRateToBase, attachment: isExternalPurchase ? attachment ?? undefined : undefined });
  }

  return <div>
    <PageHeader title="المصروفات والخرجيات" description="سجّل شراء الإنترنت والبترول والصيانة والأصول من الصندوق أو البنك الذي دفع فعلياً. خيار التجاوز يوثق الرصيد السالب وسببه في الحساب المحدد." action={<Button onClick={openCreate} className="h-11 bg-[#0a6372] px-5 font-bold hover:bg-[#084e5a]"><Plus className="ml-2 h-4 w-4" />تسجيل مصروف</Button>} />
    <SectionCard title="إجمالي المصروفات حسب التصنيف" subtitle="اختر الشهر لترى مباشرة كم صرفت في كل صنف. لا تُجمع العملات المختلفة معاً حتى تبقى الحسابات دقيقة." className="mb-6">
      <div className="flex flex-col gap-4 border-b border-[#e8f0ee] p-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="flex items-center gap-2 font-extrabold text-[#083f4c]"><CalendarDays className="h-4 w-4 text-[#0a6372]" />ملخص الشهر</p><p className="mt-1 text-xs text-slate-500">كل مربع يمثل تصنيف مصروف واحداً ويعرض إجمالي عملياته.</p></div><div className="w-full sm:w-52"><Label className="mb-2 block text-xs font-bold text-[#083f4c]">الشهر</Label><Input type="month" value={summaryMonth} onChange={event => setSummaryMonth(event.target.value)} className="h-10 bg-white" /></div></div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">{monthlyCategoryTotals.map(category => <ExpenseCategorySummaryCard key={category.id} category={category} onOpenDetails={() => setDetailsCategoryId(category.id)} />)}</div>
    </SectionCard>
    <SectionCard title="سجل المصروفات" subtitle="كل صف قابل للتعديل. العمليات المتجاوزة للحساب مميزة بالتحذير ولا تُخفى من التقارير.">
      <div className="border-b border-[#e8f0ee] p-4"><div className="relative max-w-md"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={event => setSearch(event.target.value)} className="h-11 bg-[#fbfdfc] pr-10" placeholder="ابحث برقم المصروف أو البيان أو التصنيف" /></div></div>
      {expensesQuery.isLoading ? <ListSkeleton /> : filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-right"><thead className="bg-[#f8fcfb] text-xs text-slate-500"><tr><th className="px-5 py-3">رقم القيد</th><th className="px-5 py-3">البيان</th><th className="px-5 py-3">التصنيف</th><th className="px-5 py-3">فاتورة المورد</th><th className="px-5 py-3">التاريخ</th><th className="px-5 py-3">المبلغ</th><th className="px-5 py-3">الصندوق</th><th className="px-5 py-3">إجراء</th></tr></thead><tbody className="divide-y divide-[#edf3f1]">{filtered.map(row => <tr key={row.expense.id} className={row.expense.allowCashOverdraft ? "bg-rose-50/40 hover:bg-rose-50" : "hover:bg-[#fbfefd]"}><td className="px-5 py-4 font-extrabold text-[#0a6372]">{row.expense.expenseNumber}</td><td className="px-5 py-4 font-bold text-[#083f4c]">{row.expense.description}</td><td className="px-5 py-4"><span className="rounded-full bg-[#fff1f2] px-2.5 py-1 text-xs font-bold text-[#b9404a]">{row.categoryName ?? "غير مصنف"}</span></td><td className="px-5 py-4 text-sm text-slate-600">{row.expense.supplierInvoiceNumber ? <div><p className="font-bold text-[#083f4c]">{row.expense.supplierInvoiceNumber}</p><p className="mt-1 text-xs text-slate-500">{row.expense.supplierName}</p></div> : "—"}</td><td className="px-5 py-4 text-sm text-slate-500">{arabicDate(row.expense.expenseDate)}</td><td className="px-5 py-4 font-extrabold text-[#b9404a]">{money(row.expense.amount, row.expense.currencyCode)}</td><td className="px-5 py-4">{row.expense.allowCashOverdraft ? <span title={row.expense.cashOverrideReason ?? ""} className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700"><AlertTriangle className="h-3.5 w-3.5" />تجاوز موثق</span> : <StatusBadge status={row.expense.status} />}</td><td className="px-5 py-4"><Button variant="outline" size="sm" onClick={() => openEdit(row)} className="border-[#0a6372] text-[#0a6372]"><Pencil className="ml-1 h-3.5 w-3.5" />تعديل</Button>{row.expense.attachmentUrl ? <a href={row.expense.attachmentUrl} target="_blank" rel="noreferrer" className="mr-3 inline-flex items-center gap-1 text-xs font-bold text-[#0a6372] hover:underline"><Paperclip className="h-3.5 w-3.5" />مرفق<ExternalLink className="h-3 w-3" /></a> : null}</td></tr>)}</tbody></table></div> : <EmptyState title="لا توجد مصروفات بعد" description="سجّل أول مصروف نقدي مثل شراء خدمة الإنترنت أو البترول أو الصيانة." />}
    </SectionCard>
    <Dialog open={dialogOpen} onOpenChange={open => { if (!open) closeDialog(); }}><DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editingExpenseId ? "تعديل المصروف" : "تسجيل مصروف"}</DialogTitle><DialogDescription>{editingExpenseId ? "تعديل المبلغ أو التصنيف أو الحساب الدافع يعيد ضبط الرصيد بدقة." : "يخصم المصروف من الصندوق أو البنك المختار، أو يسجل كتجاوز موثق عند تفعيل الخيار أدناه."}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-5 py-2"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="بيان المصروف"><Input required value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="مثال: اشتراك Starlink" /></Field><Field label="قيمة المصروف"><Input required inputMode="decimal" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} placeholder="0.00" /></Field><Field label="تاريخ الصرف"><Input required type="date" value={form.expenseDate} onChange={event => setForm({ ...form, expenseDate: event.target.value })} /></Field><Field label="الحساب الدافع"><select required value={form.cashAccountId} onChange={event => setForm({ ...form, cashAccountId: event.target.value })} className="form-select"><option value="" disabled>اختر صندوقاً أو بنكاً</option>{(cashQuery.data?.accounts ?? []).map(account => <option key={account.id} value={account.id}>{account.type === "bank" ? "بنك: " : "صندوق: "}{account.name}</option>)}</select></Field><Field label="تصنيف المصروف"><select required value={form.movementCategoryId} onChange={event => selectCategory(event.target.value)} className="form-select"><option value="">اختر التصنيف</option>{expenseCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field><Field label="الجهة أو المستلم"><select value={form.contactId} onChange={event => setForm({ ...form, contactId: event.target.value })} className="form-select"><option value="">غير محدد</option>{(contactsQuery.data ?? []).filter(contact => contact.type === "supplier" || contact.type === "employee" || contact.type === "other").map(contact => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></Field><Field label="العملة"><select disabled={Boolean(editingExpenseId)} value={form.currencyCode} onChange={event => { const currencyCode = event.target.value as ExpenseForm["currencyCode"]; setForm({ ...form, currencyCode, exchangeRateToBase: currencyCode === "YER" ? "1" : form.exchangeRateToBase }); }} className="form-select disabled:opacity-60"><option value="YER">ريال يمني</option><option value="SAR">ريال سعودي</option><option value="USD">دولار أمريكي</option></select></Field></div>
      {supportsSupplierDetails ? <div className="space-y-4 rounded-2xl border border-[#e7d1a2] bg-[#fffaf0] p-4"><div className="flex items-center gap-2 text-[#875f13]"><FileText className="h-5 w-5" /><div><p className="font-extrabold">بيانات فاتورة المورد</p><p className="mt-1 text-xs">مطلوبة للأصول والمعدات، واختيارية لشراء Starlink أو Fiber أو خدمة الإنترنت.</p></div></div><div className="grid gap-4 sm:grid-cols-2"><Field label="اسم المحل أو المزود"><Input required={isExternalPurchase} value={form.supplierName} onChange={event => setForm({ ...form, supplierName: event.target.value })} placeholder="مثال: مزود الإنترنت" /></Field><Field label="رقم فاتورة المورد"><Input required={isExternalPurchase} value={form.supplierInvoiceNumber} onChange={event => setForm({ ...form, supplierInvoiceNumber: event.target.value })} placeholder="مثال: 4587" /></Field></div>{!editingExpenseId && isExternalPurchase ? <Field label="إرفاق صورة أو PDF للفاتورة (اختياري)"><Input type="file" accept="image/jpeg,image/png,application/pdf" onChange={event => readAttachment(event.target.files?.[0])} />{attachment ? <p className="mt-2 flex items-center gap-1 text-xs font-bold text-[#08735d]"><Paperclip className="h-3.5 w-3.5" />{attachment.fileName}</p> : null}</Field> : null}</div> : null}
      {!editingExpenseId ? <Field label="سعر الصرف إلى الريال اليمني"><Input required inputMode="decimal" value={form.exchangeRateToBase} onChange={event => setForm({ ...form, exchangeRateToBase: event.target.value })} /></Field> : null}
      <div className={`rounded-2xl border p-4 ${form.allowCashOverdraft ? "border-rose-300 bg-rose-50" : "border-[#dce8e5] bg-[#fbfdfc]"}`}><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={form.allowCashOverdraft} onChange={event => setForm({ ...form, allowCashOverdraft: event.target.checked, cashOverrideReason: event.target.checked ? form.cashOverrideReason : "" })} className="mt-1 h-4 w-4 accent-[#b9404a]" /><span><span className="flex items-center gap-1 font-extrabold text-[#083f4c]"><AlertTriangle className="h-4 w-4 text-rose-600" />تجاوز رصيد الحساب عند عدم كفايته</span><span className="mt-1 block text-xs leading-5 text-slate-600">يسمح بحفظ المصروف، ويظهر رصيد الحساب المختار سالباً بدلاً من إخفاء النقص. يجب كتابة السبب ويُحفظ في سجل التدقيق.</span></span></label>{form.allowCashOverdraft ? <div className="mt-3"><Label className="font-bold text-rose-800">سبب تجاوز رصيد الحساب</Label><Textarea required value={form.cashOverrideReason} onChange={event => setForm({ ...form, cashOverrideReason: event.target.value })} className="mt-2 border-rose-200 bg-white" placeholder="مثال: سددت للمورد من خارج الحساب وسأسوي الرصيد لاحقاً" /></div> : null}</div>
      <Field label="ملاحظات"><Textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="تفاصيل إضافية عن المصروف" /></Field><DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={closeDialog}>إلغاء</Button><Button type="submit" disabled={isSaving || !setupQuery.data} className="bg-[#0a6372] hover:bg-[#084e5a]">{isSaving ? "جارٍ الحفظ..." : editingExpenseId ? "حفظ تعديل المصروف" : "اعتماد المصروف"}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={Boolean(detailsCategory)} onOpenChange={open => { if (!open) setDetailsCategoryId(null); }}><DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>تفاصيل مصروفات {detailsCategory?.name}</DialogTitle><DialogDescription>عمليات هذا التصنيف في الشهر المختار. يمكنك تعديل العملية أو طباعتها أو تصدير التفاصيل.</DialogDescription></DialogHeader>{categoryExpenseRows.length ? <><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" size="sm" onClick={printCategoryDetails} className="border-[#b4882d] text-[#875f13]"><Printer className="ml-1 h-3.5 w-3.5" />طباعة / حفظ PDF</Button><Button type="button" variant="outline" size="sm" onClick={exportCategoryDetails} className="border-[#0a6372] text-[#0a6372]"><Download className="ml-1 h-3.5 w-3.5" />تصدير Excel</Button></div><div className="overflow-x-auto rounded-xl border border-[#e8f0ee]"><table className="w-full min-w-[720px] text-right text-sm"><thead className="bg-[#f8fcfb] text-xs text-slate-500"><tr><th className="px-4 py-3">رقم القيد</th><th className="px-4 py-3">البيان</th><th className="px-4 py-3">التاريخ</th><th className="px-4 py-3">المبلغ</th><th className="px-4 py-3">الحالة</th><th className="px-4 py-3">إجراء</th></tr></thead><tbody className="divide-y divide-[#edf3f1]">{categoryExpenseRows.map(row => <tr key={row.expense.id}><td className="px-4 py-3 font-extrabold text-[#0a6372]">{row.expense.expenseNumber}</td><td className="px-4 py-3 font-bold text-[#083f4c]">{row.expense.description}</td><td className="px-4 py-3 text-slate-500">{arabicDate(row.expense.expenseDate)}</td><td className="px-4 py-3 font-extrabold text-[#b9404a]">{money(row.expense.amount, row.expense.currencyCode)}</td><td className="px-4 py-3">{row.expense.allowCashOverdraft ? <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-bold text-rose-700">تجاوز موثق</span> : <StatusBadge status={row.expense.status} />}</td><td className="px-4 py-3"><Button type="button" variant="outline" size="sm" onClick={() => { setDetailsCategoryId(null); openEdit(row); }} className="border-[#0a6372] text-[#0a6372]"><Pencil className="ml-1 h-3.5 w-3.5" />تعديل</Button></td></tr>)}</tbody></table></div></> : <EmptyState title="لا توجد عمليات في هذا الشهر" description="لا توجد مصروفات مسجلة لهذا التصنيف في الشهر المختار." />}</DialogContent></Dialog>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label className="font-bold text-[#083f4c]">{label}</Label>{children}</div>; }
function ListSkeleton() { return <div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}</div>; }

type ExpenseCategoryTotal = { id: number; name: string; amounts: Record<ExpenseForm["currencyCode"], number>; count: number };

function ExpenseCategorySummaryCard({ category, onOpenDetails }: { category: ExpenseCategoryTotal; onOpenDetails: () => void }) {
  const visual = getExpenseCategoryVisual(category.name);
  const Icon = visual.icon;
  const totals = (["YER", "SAR", "USD"] as const).filter(currency => category.amounts[currency] !== 0);
  return <button type="button" onClick={onOpenDetails} className={`relative w-full overflow-hidden rounded-2xl border p-4 text-right shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a6372] focus-visible:ring-offset-2 ${visual.card}`} aria-label={`عرض تفاصيل ${category.name}`}>
    <div className={`absolute inset-y-0 right-0 w-1 ${visual.bar}`} />
    <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${visual.iconWrap}`}><Icon className="h-5 w-5" /></span><p className="truncate font-extrabold text-[#083f4c]">{category.name}</p></div><span className="shrink-0 rounded-full bg-white/80 px-2 py-1 text-xs font-bold text-slate-500">{category.count} عملية</span></div>
    <div className="mt-4 space-y-1.5 pr-13">{totals.length ? totals.map(currency => <p key={currency} className={`text-lg font-black ${visual.amount}`}>{money(category.amounts[currency] / 100, currency)}</p>) : <p className="text-sm font-bold text-slate-400">لا يوجد صرف في هذا الشهر</p>}</div>
  </button>;
}

function getExpenseCategoryVisual(name: string) {
  const normalized = name.replace(/\s+/g, " ").toLowerCase();
  if (normalized.includes("بترول") || normalized.includes("مشاوير")) return { icon: Fuel, card: "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50", bar: "bg-amber-500", iconWrap: "bg-amber-100 text-amber-700", amount: "text-amber-800" };
  if (normalized.includes("إنترنت") || normalized.includes("starlink") || normalized.includes("fiber")) return { icon: Wifi, card: "border-cyan-200 bg-gradient-to-br from-cyan-50 to-sky-50", bar: "bg-cyan-500", iconWrap: "bg-cyan-100 text-cyan-700", amount: "text-cyan-800" };
  if (normalized.includes("صيانة") || normalized.includes("كهرباء")) return { icon: Wrench, card: "border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50", bar: "bg-violet-500", iconWrap: "bg-violet-100 text-violet-700", amount: "text-violet-800" };
  if (normalized.includes("راتب") || normalized.includes("موظف")) return { icon: UsersRound, card: "border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50", bar: "bg-rose-500", iconWrap: "bg-rose-100 text-rose-700", amount: "text-rose-800" };
  if (normalized.includes("أصل") || normalized.includes("معدات") || normalized.includes("بضاعة")) return { icon: Package, card: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50", bar: "bg-emerald-500", iconWrap: "bg-emerald-100 text-emerald-700", amount: "text-emerald-800" };
  return { icon: ReceiptText, card: "border-slate-200 bg-gradient-to-br from-slate-50 to-white", bar: "bg-slate-400", iconWrap: "bg-slate-100 text-slate-600", amount: "text-[#083f4c]" };
}
