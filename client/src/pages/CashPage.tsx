import { EmptyState, PageHeader, SectionCard, arabicDate, money } from "@/components/accounting/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeftRight, Building2, CircleDollarSign, Landmark, Plus, WalletCards } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

type CurrencyCode = "YER" | "SAR" | "USD";
type CashForm = { cashAccountId: string; currencyCode: CurrencyCode; amount: string; occurredAt: string; notes: string };
type TransferForm = { fromCashAccountId: string; fromCurrencyCode: CurrencyCode; fromAmount: string; toCashAccountId: string; toCurrencyCode: CurrencyCode; toAmount: string; transferDate: string; notes: string };
type CashAccountForm = { name: string; type: "cash" | "bank"; notes: string };

const dateToday = () => new Date().toISOString().slice(0, 10);
const blankCash = (cashAccountId = ""): CashForm => ({ cashAccountId, currencyCode: "YER", amount: "", occurredAt: dateToday(), notes: "" });
const blankTransfer = (cashAccountId = ""): TransferForm => ({ fromCashAccountId: cashAccountId, fromCurrencyCode: "YER", fromAmount: "", toCashAccountId: cashAccountId, toCurrencyCode: "YER", toAmount: "", transferDate: dateToday(), notes: "" });
const blankAccount = (): CashAccountForm => ({ name: "", type: "bank", notes: "" });

const movementLabels: Record<string, string> = { opening_balance: "رصيد افتتاحي", cash_invoice: "فاتورة نقدية", receipt: "سند قبض", expense: "مصروف", transfer_in: "تحويل وارد", transfer_out: "تحويل صادر", adjustment: "تسوية" };
const currencyName: Record<CurrencyCode, string> = { YER: "ريال يمني", SAR: "ريال سعودي", USD: "دولار أمريكي" };

export default function CashPage() {
  const cashQuery = trpc.accounting.cashSummary.useQuery();
  const utils = trpc.useUtils();
  const [openingOpen, setOpeningOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [cashForm, setCashForm] = useState<CashForm>(blankCash());
  const [transferForm, setTransferForm] = useState<TransferForm>(blankTransfer());
  const [accountForm, setAccountForm] = useState<CashAccountForm>(blankAccount());
  const accounts = cashQuery.data?.accounts ?? [];
  const defaultAccountId = accounts[0] ? String(accounts[0].id) : "";
  const refreshBalances = async () => { await Promise.all([utils.accounting.cashSummary.invalidate(), utils.accounting.dashboard.invalidate()]); };
  const openingMutation = trpc.accounting.createOpeningBalance.useMutation({ onSuccess: async () => { await refreshBalances(); toast.success("تمت إضافة الرصيد إلى الحساب المحدد"); setOpeningOpen(false); }, onError: error => toast.error(error.message) });
  const transferMutation = trpc.accounting.createCurrencyTransfer.useMutation({ onSuccess: async result => { await refreshBalances(); toast.success(`تم اعتماد التحويل ${result.transferNumber}`); setTransferOpen(false); }, onError: error => toast.error(error.message) });
  const accountMutation = trpc.accounting.createCashAccount.useMutation({ onSuccess: async result => { await refreshBalances(); toast.success(`تم إنشاء حساب ${result.name}`); setAccountOpen(false); }, onError: error => toast.error(error.message) });

  function openOpening() { setCashForm(blankCash(defaultAccountId)); setOpeningOpen(true); }
  function openTransfer() { setTransferForm(blankTransfer(defaultAccountId)); setTransferOpen(true); }
  function openAccount() { setAccountForm(blankAccount()); setAccountOpen(true); }
  function submitOpening(event: FormEvent) { event.preventDefault(); openingMutation.mutate({ cashAccountId: Number(cashForm.cashAccountId), currencyCode: cashForm.currencyCode, amount: cashForm.amount, occurredAt: new Date(`${cashForm.occurredAt}T12:00:00`), notes: cashForm.notes || undefined }); }
  function submitTransfer(event: FormEvent) { event.preventDefault(); transferMutation.mutate({ fromCashAccountId: Number(transferForm.fromCashAccountId), fromCurrencyCode: transferForm.fromCurrencyCode, fromAmount: transferForm.fromAmount, toCashAccountId: Number(transferForm.toCashAccountId), toCurrencyCode: transferForm.toCurrencyCode, toAmount: transferForm.toAmount, transferDate: new Date(`${transferForm.transferDate}T12:00:00`), notes: transferForm.notes || undefined }); }
  function submitAccount(event: FormEvent) { event.preventDefault(); accountMutation.mutate({ name: accountForm.name, type: accountForm.type, notes: accountForm.notes || undefined }); }

  return (
    <div>
      <PageHeader
        title="الصناديق والبنوك"
        description="تابع النقد والبنوك كلٌّ على حدة. التحويل الداخلي ينقل الرصيد فقط ولا يعد إيراداً ولا مصروفاً، وصندوق اشتراكات الأفراد يبقى مستقلاً تماماً."
        action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={openAccount} className="h-11 border-[#bcd9d2] font-bold text-[#0a6372] hover:bg-[#eff8f5]"><Plus className="ml-2 h-4 w-4" />إضافة حساب</Button><Button variant="outline" onClick={openTransfer} disabled={!accounts.length} className="h-11 border-[#bcd9d2] font-bold text-[#0a6372] hover:bg-[#eff8f5]"><ArrowLeftRight className="ml-2 h-4 w-4" />تحويل داخلي</Button><Button onClick={openOpening} disabled={!accounts.length} className="h-11 bg-[#0a6372] font-bold hover:bg-[#084e5a]"><WalletCards className="ml-2 h-4 w-4" />رصيد افتتاحي</Button></div>}
      />
      {cashQuery.isLoading ? <CashSkeleton /> : <>
        <div className="grid gap-4 lg:grid-cols-2">
          {accounts.map(account => <SectionCard key={account.id} title={account.name} subtitle={account.type === "bank" ? "حساب مصرفي مستقل" : "صندوق نقدي مستقل"}>
            <div className="mb-4"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${account.type === "bank" ? "bg-[#eef2ff] text-[#3d4a9f]" : "bg-[#eef8f5] text-[#08735d]"}`}>{account.type === "bank" ? <Landmark className="h-3.5 w-3.5" /> : <WalletCards className="h-3.5 w-3.5" />}{account.type === "bank" ? "بنك" : "صندوق"}</span></div>
            <div className="grid gap-3 sm:grid-cols-3">{account.balances.map(balance => <div key={balance.code} className={`rounded-xl p-4 ${balance.code === "YER" ? "bg-[#eff8f5]" : balance.code === "SAR" ? "bg-[#fff8e6]" : "bg-[#eff5fc]"}`}><p className="text-xs font-bold text-slate-500">{balance.nameAr}</p><p className="mt-2 text-lg font-extrabold text-[#083f4c]">{money(balance.balance, balance.code)}</p></div>)}</div>
          </SectionCard>)}
        </div>
        {!accounts.length && <div className="mt-6"><EmptyState title="لا توجد حسابات نقدية أو مصرفية" description="أضف صندوقاً أو بنكاً أولاً، ثم سجّل رصيده الافتتاحي والحركات المتعلقة به." /></div>}
        <section className="mt-6"><SectionCard title="كشف الحركات الموحد" subtitle="يُظهر الحساب الذي دخلت إليه أو خرجت منه العملية، لتتمكن من مراجعة رصيد كل صندوق أو بنك.">{cashQuery.data?.movements.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-right"><thead className="bg-[#f8fcfb] text-xs text-slate-500"><tr><th className="px-5 py-3">التاريخ</th><th className="px-5 py-3">الحساب</th><th className="px-5 py-3">نوع الحركة</th><th className="px-5 py-3">البيان</th><th className="px-5 py-3">العملة</th><th className="px-5 py-3">دخول</th><th className="px-5 py-3">خروج</th></tr></thead><tbody className="divide-y divide-[#edf3f1]">{cashQuery.data.movements.map(movement => <tr key={movement.id} className="hover:bg-[#fbfefd]"><td className="px-5 py-4 text-sm text-slate-500">{arabicDate(movement.occurredAt)}</td><td className="px-5 py-4"><span className="inline-flex items-center gap-1 font-bold text-[#083f4c]">{movement.cashAccountType === "bank" ? <Building2 className="h-4 w-4 text-[#3d4a9f]" /> : <WalletCards className="h-4 w-4 text-[#08735d]" />}{movement.cashAccountName}</span></td><td className="px-5 py-4"><span className="rounded-full bg-[#eef8f5] px-2.5 py-1 text-xs font-bold text-[#08735d]">{movementLabels[movement.type] ?? movement.type}</span></td><td className="px-5 py-4 font-bold text-[#083f4c]">{movement.description || "—"}</td><td className="px-5 py-4 text-sm text-slate-600">{movement.currencyCode}</td><td className="px-5 py-4 font-extrabold text-[#08735d]">{movement.direction === "in" ? money(movement.amount, movement.currencyCode) : "—"}</td><td className="px-5 py-4 font-extrabold text-[#b9404a]">{movement.direction === "out" ? money(movement.amount, movement.currencyCode) : "—"}</td></tr>)}</tbody></table></div> : <EmptyState title="لا توجد حركات بعد" description="أدخل رصيداً افتتاحياً أو سجّل قبضاً أو مصروفاً أو تحويلاً داخلياً لتظهر الحركات هنا." />}</SectionCard></section>
      </>}

      <Dialog open={accountOpen} onOpenChange={setAccountOpen}><DialogContent dir="rtl"><DialogHeader><DialogTitle>إضافة حساب نقدي أو مصرفي</DialogTitle><DialogDescription>أدخل اسماً واضحاً مثل «بنك الشمول» أو «صندوق الفرع». لا يحتاج النظام إلى رقم حساب أو أي بيانات مصرفية حساسة.</DialogDescription></DialogHeader><form onSubmit={submitAccount} className="space-y-4 py-2"><div className="grid gap-4 sm:grid-cols-2"><Field label="اسم الحساب"><Input required value={accountForm.name} onChange={event => setAccountForm({ ...accountForm, name: event.target.value })} placeholder="مثال: بنك جديد" /></Field><Field label="نوع الحساب"><select value={accountForm.type} onChange={event => setAccountForm({ ...accountForm, type: event.target.value as CashAccountForm["type"] })} className="form-select"><option value="cash">صندوق نقدي</option><option value="bank">حساب مصرفي</option></select></Field></div><Field label="ملاحظات اختيارية"><Textarea value={accountForm.notes} onChange={event => setAccountForm({ ...accountForm, notes: event.target.value })} placeholder="بيان مختصر للحساب" /></Field><DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={() => setAccountOpen(false)}>إلغاء</Button><Button type="submit" disabled={accountMutation.isPending} className="bg-[#0a6372] hover:bg-[#084e5a]">{accountMutation.isPending ? "جارٍ الإنشاء..." : "إنشاء الحساب"}</Button></DialogFooter></form></DialogContent></Dialog>

      <Dialog open={openingOpen} onOpenChange={setOpeningOpen}><DialogContent dir="rtl"><DialogHeader><DialogTitle>إضافة رصيد افتتاحي</DialogTitle><DialogDescription>يُسجل الرصيد الفعلي للحساب الذي تختاره، ويجب استخدامه عند بداية استخدام النظام أو عند توثيق رصيد أولي.</DialogDescription></DialogHeader><form onSubmit={submitOpening} className="space-y-4 py-2"><div className="grid gap-4 sm:grid-cols-2"><Field label="الحساب"><CashAccountSelect accounts={accounts} value={cashForm.cashAccountId} onChange={cashAccountId => setCashForm({ ...cashForm, cashAccountId })} /></Field><Field label="العملة"><CurrencySelect value={cashForm.currencyCode} onChange={currencyCode => setCashForm({ ...cashForm, currencyCode })} /></Field><Field label="المبلغ الموجود"><Input required inputMode="decimal" value={cashForm.amount} onChange={event => setCashForm({ ...cashForm, amount: event.target.value })} placeholder="0.00" /></Field><Field label="التاريخ"><Input required type="date" value={cashForm.occurredAt} onChange={event => setCashForm({ ...cashForm, occurredAt: event.target.value })} /></Field></div><Field label="ملاحظات"><Textarea value={cashForm.notes} onChange={event => setCashForm({ ...cashForm, notes: event.target.value })} placeholder="مثال: رصيد بداية الاستخدام" /></Field><DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={() => setOpeningOpen(false)}>إلغاء</Button><Button type="submit" disabled={openingMutation.isPending} className="bg-[#0a6372] hover:bg-[#084e5a]">{openingMutation.isPending ? "جارٍ الحفظ..." : "إضافة الرصيد"}</Button></DialogFooter></form></DialogContent></Dialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}><DialogContent dir="rtl"><DialogHeader><DialogTitle>تحويل داخلي أو تحويل عملات</DialogTitle><DialogDescription>اختر المصدر والوجهة. نقل المال بين الحسابات أو العملات لا يغيّر الإيراد أو المصروف أو صافي الربح.</DialogDescription></DialogHeader><form onSubmit={submitTransfer} className="space-y-4 py-2"><div className="grid gap-4 sm:grid-cols-2"><Field label="من الحساب"><CashAccountSelect accounts={accounts} value={transferForm.fromCashAccountId} onChange={fromCashAccountId => setTransferForm({ ...transferForm, fromCashAccountId })} /></Field><Field label="من العملة"><CurrencySelect value={transferForm.fromCurrencyCode} onChange={fromCurrencyCode => setTransferForm({ ...transferForm, fromCurrencyCode })} /></Field><Field label="المبلغ المحول"><Input required inputMode="decimal" value={transferForm.fromAmount} onChange={event => setTransferForm({ ...transferForm, fromAmount: event.target.value })} placeholder="0.00" /></Field><Field label="إلى الحساب"><CashAccountSelect accounts={accounts} value={transferForm.toCashAccountId} onChange={toCashAccountId => setTransferForm({ ...transferForm, toCashAccountId })} /></Field><Field label="إلى العملة"><CurrencySelect value={transferForm.toCurrencyCode} onChange={toCurrencyCode => setTransferForm({ ...transferForm, toCurrencyCode })} /></Field><Field label="المبلغ المستلم"><Input required inputMode="decimal" value={transferForm.toAmount} onChange={event => setTransferForm({ ...transferForm, toAmount: event.target.value })} placeholder="0.00" /></Field><Field label="تاريخ التحويل"><Input required type="date" value={transferForm.transferDate} onChange={event => setTransferForm({ ...transferForm, transferDate: event.target.value })} /></Field></div><Field label="ملاحظات"><Textarea value={transferForm.notes} onChange={event => setTransferForm({ ...transferForm, notes: event.target.value })} placeholder="مثال: إيداع من صندوق الشبكة الرئيسي إلى بنك الشمول" /></Field><DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={() => setTransferOpen(false)}>إلغاء</Button><Button type="submit" disabled={transferMutation.isPending} className="bg-[#0a6372] hover:bg-[#084e5a]">{transferMutation.isPending ? "جارٍ التحويل..." : "اعتماد التحويل"}</Button></DialogFooter></form></DialogContent></Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label className="font-bold text-[#083f4c]">{label}</Label>{children}</div>; }
function CurrencySelect({ value, onChange }: { value: CurrencyCode; onChange: (value: CurrencyCode) => void }) { return <select value={value} onChange={event => onChange(event.target.value as CurrencyCode)} className="form-select">{Object.entries(currencyName).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select>; }
function CashAccountSelect({ accounts, value, onChange }: { accounts: Array<{ id: number; name: string; type: "cash" | "bank" }>; value: string; onChange: (value: string) => void }) { return <select required value={value} onChange={event => onChange(event.target.value)} className="form-select"><option value="" disabled>اختر حساباً</option>{accounts.map(account => <option key={account.id} value={String(account.id)}>{account.type === "bank" ? "بنك: " : "صندوق: "}{account.name}</option>)}</select>; }
function CashSkeleton() { return <div className="space-y-6"><div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-44 rounded-2xl" />)}</div><Skeleton className="h-96 rounded-2xl" /></div>; }
