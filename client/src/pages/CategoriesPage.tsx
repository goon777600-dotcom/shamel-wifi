import { PageHeader, SectionCard } from "@/components/accounting/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { ArrowLeftRight, Banknote, Building2, CarFront, CircleDollarSign, Droplets, Fuel, HeartHandshake, Landmark, Pencil, Plus, ReceiptText, ShoppingBasket, WalletCards, Wrench, Zap } from "lucide-react";
import { FormEvent, ReactNode, useState } from "react";
import { toast } from "sonner";

type AccountKind = "income" | "expense" | "asset" | "liability" | "equity" | "other";
type MovementKind = "sale" | "receipt" | "expense" | "transfer" | "adjustment";
const accountKindLabels: Record<AccountKind, string> = { income: "إيراد", expense: "مصروف", asset: "أصل", liability: "التزام", equity: "رأس مال", other: "أخرى" };
const movementKindLabels: Record<MovementKind, string> = { sale: "مبيعات", receipt: "قبض", expense: "صرف", transfer: "تحويل", adjustment: "تسوية" };

export default function CategoriesPage() {
  const setupQuery = trpc.accounting.setup.useQuery();
  const utils = trpc.useUtils();
  type AccountCategory = NonNullable<typeof setupQuery.data>["accountCategories"][number];
  type MovementCategory = NonNullable<typeof setupQuery.data>["movementCategories"][number];
  const [accountDialog, setAccountDialog] = useState(false);
  const [movementDialog, setMovementDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountCategory | null>(null);
  const [editingMovement, setEditingMovement] = useState<MovementCategory | null>(null);
  const [accountName, setAccountName] = useState("");
  const [accountKind, setAccountKind] = useState<AccountKind>("expense");
  const [accountActive, setAccountActive] = useState(true);
  const [movementName, setMovementName] = useState("");
  const [movementKind, setMovementKind] = useState<MovementKind>("expense");
  const [movementAccountId, setMovementAccountId] = useState("");
  const [movementActive, setMovementActive] = useState(true);
  const refresh = () => utils.accounting.setup.invalidate();
  const createAccount = trpc.accounting.createAccountCategory.useMutation({ onSuccess: async () => { await refresh(); toast.success("تمت إضافة تصنيف الحساب"); setAccountDialog(false); }, onError: error => toast.error(error.message) });
  const updateAccount = trpc.accounting.updateAccountCategory.useMutation({ onSuccess: async () => { await refresh(); toast.success("تم تحديث تصنيف الحساب"); setAccountDialog(false); }, onError: error => toast.error(error.message) });
  const createMovement = trpc.accounting.createMovementCategory.useMutation({ onSuccess: async () => { await refresh(); toast.success("تمت إضافة تصنيف الحركة"); setMovementDialog(false); }, onError: error => toast.error(error.message) });
  const updateMovement = trpc.accounting.updateMovementCategory.useMutation({ onSuccess: async () => { await refresh(); toast.success("تم تحديث تصنيف الحركة"); setMovementDialog(false); }, onError: error => toast.error(error.message) });

  function openAccount(category?: AccountCategory) {
    setEditingAccount(category ?? null);
    setAccountName(category?.name ?? "");
    setAccountKind(category?.kind ?? "expense");
    setAccountActive(category?.isActive ?? true);
    setAccountDialog(true);
  }
  function openMovement(category?: MovementCategory) {
    setEditingMovement(category ?? null);
    setMovementName(category?.name ?? "");
    setMovementKind(category?.kind ?? "expense");
    setMovementAccountId(category?.accountCategoryId ? String(category.accountCategoryId) : "");
    setMovementActive(category?.isActive ?? true);
    setMovementDialog(true);
  }
  function submitAccount(event: FormEvent) {
    event.preventDefault();
    if (editingAccount) updateAccount.mutate({ id: editingAccount.id, name: accountName, isActive: accountActive });
    else createAccount.mutate({ name: accountName, kind: accountKind });
  }
  function submitMovement(event: FormEvent) {
    event.preventDefault();
    if (editingMovement) updateMovement.mutate({ id: editingMovement.id, name: movementName, accountCategoryId: movementAccountId ? Number(movementAccountId) : null, isActive: movementActive });
    else createMovement.mutate({ name: movementName, kind: movementKind, accountCategoryId: movementAccountId ? Number(movementAccountId) : undefined });
  }

  const accounts = setupQuery.data?.accountCategories ?? [];
  const movements = setupQuery.data?.movementCategories ?? [];

  return (
    <div>
      <PageHeader
        title="التصنيفات"
        description="رتب الحسابات والحركات بالطريقة التي تناسب عملك. عند وجود عمليات سابقة يُعطّل التصنيف بدلاً من حذفه لحماية دقة التقارير."
        action={<div className="flex gap-2"><Button variant="outline" onClick={() => openAccount()} className="h-11 border-[#bcd9d2] font-bold text-[#0a6372] hover:bg-[#eff8f5]"><Plus className="ml-2 h-4 w-4" />تصنيف حساب</Button><Button onClick={() => openMovement()} className="h-11 bg-[#0a6372] font-bold hover:bg-[#084e5a]"><Plus className="ml-2 h-4 w-4" />تصنيف حركة</Button></div>}
      />

      <Tabs defaultValue="movements">
        <TabsList className="mb-5 h-auto rounded-xl bg-[#eaf3f1] p-1">
          <TabsTrigger value="movements" className="rounded-lg px-5 py-2.5 data-[state=active]:bg-white data-[state=active]:text-[#0a6372]">تصنيفات الحركات</TabsTrigger>
          <TabsTrigger value="accounts" className="rounded-lg px-5 py-2.5 data-[state=active]:bg-white data-[state=active]:text-[#0a6372]">تصنيفات الحسابات</TabsTrigger>
        </TabsList>
        <TabsContent value="movements">
          <SectionCard title="تصنيفات الحركات" subtitle="تستخدم عند الفواتير وسندات القبض والمصروفات وتحويل العملات.">
            <CategoryTable
              items={movements}
              columns={["التصنيف", "نوع الحركة", "الحساب المرتبط", "الحالة"]}
              onEdit={openMovement}
              render={category => (
                <>
                  <td className="px-5 py-4"><CategoryIdentity name={category.name} kind={category.kind} group="movement" /></td>
                  <td className="px-5 py-4"><span className="rounded-full bg-[#eaf7f2] px-2.5 py-1 text-xs font-bold text-[#08735d]">{movementKindLabels[category.kind]}</span></td>
                  <td className="px-5 py-4 text-sm text-slate-500">{accounts.find(item => item.id === category.accountCategoryId)?.name ?? "—"}</td>
                  <td className="px-5 py-4"><Status active={category.isActive} /></td>
                </>
              )}
            />
          </SectionCard>
        </TabsContent>
        <TabsContent value="accounts">
          <SectionCard title="تصنيفات الحسابات" subtitle="تحدد هل يؤثر التصنيف على الإيرادات والمصروفات أو يمثل أصلاً أو التزاماً.">
            <CategoryTable
              items={accounts}
              columns={["التصنيف", "النوع المحاسبي", "الحالة"]}
              onEdit={openAccount}
              render={category => (
                <>
                  <td className="px-5 py-4"><CategoryIdentity name={category.name} kind={category.kind} group="account" /></td>
                  <td className="px-5 py-4"><span className="rounded-full bg-[#eef5fc] px-2.5 py-1 text-xs font-bold text-[#226b8b]">{accountKindLabels[category.kind]}</span></td>
                  <td className="px-5 py-4"><Status active={category.isActive} /></td>
                </>
              )}
            />
          </SectionCard>
        </TabsContent>
      </Tabs>

      <Dialog open={accountDialog} onOpenChange={setAccountDialog}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>{editingAccount ? "تعديل تصنيف حساب" : "تصنيف حساب جديد"}</DialogTitle><DialogDescription>لا يغير تعديل الاسم أو إيقاف التصنيف سجل العمليات السابقة.</DialogDescription></DialogHeader>
          <form onSubmit={submitAccount} className="space-y-4 py-2">
            <Field label="اسم التصنيف"><Input required value={accountName} onChange={event => setAccountName(event.target.value)} placeholder="مثال: تكلفة اشتراك الإنترنت" /></Field>
            {editingAccount ? <StatusSwitch active={accountActive} onChange={setAccountActive} /> : <Field label="النوع المحاسبي"><select value={accountKind} onChange={event => setAccountKind(event.target.value as AccountKind)} className="form-select">{Object.entries(accountKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>}
            <DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={() => setAccountDialog(false)}>إلغاء</Button><Button type="submit" disabled={createAccount.isPending || updateAccount.isPending} className="bg-[#0a6372] hover:bg-[#084e5a]">حفظ</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={movementDialog} onOpenChange={setMovementDialog}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>{editingMovement ? "تعديل تصنيف حركة" : "تصنيف حركة جديد"}</DialogTitle><DialogDescription>ربط تصنيف الحركة بحساب محدد هو ما يحدد أثره في التقارير المالية.</DialogDescription></DialogHeader>
          <form onSubmit={submitMovement} className="space-y-4 py-2">
            <Field label="اسم التصنيف"><Input required value={movementName} onChange={event => setMovementName(event.target.value)} placeholder="مثال: مشاوير" /></Field>
            {editingMovement ? <div className="rounded-xl bg-[#f8fcfb] p-3 text-sm text-slate-600">نوع الحركة: <b>{movementKindLabels[editingMovement.kind]}</b> (لا يتغير لحماية السجل المالي)</div> : <Field label="نوع الحركة"><select value={movementKind} onChange={event => setMovementKind(event.target.value as MovementKind)} className="form-select">{Object.entries(movementKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>}
            <Field label="الحساب المرتبط"><select value={movementAccountId} onChange={event => setMovementAccountId(event.target.value)} className="form-select"><option value="">دون أثر محاسبي مباشر</option>{accounts.filter(category => category.isActive).map(category => <option key={category.id} value={category.id}>{category.name} — {accountKindLabels[category.kind]}</option>)}</select></Field>
            {editingMovement ? <StatusSwitch active={movementActive} onChange={setMovementActive} /> : null}
            <DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={() => setMovementDialog(false)}>إلغاء</Button><Button type="submit" disabled={createMovement.isPending || updateMovement.isPending} className="bg-[#0a6372] hover:bg-[#084e5a]">حفظ</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryTable<T extends { id: number; isActive: boolean }>({ items, columns, render, onEdit }: { items: T[]; columns: string[]; render: (item: T) => ReactNode; onEdit: (item: T) => void }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-right"><thead className="bg-[#f8fcfb] text-xs text-slate-500"><tr>{columns.map(column => <th key={column} className="px-5 py-3">{column}</th>)}<th className="px-5 py-3">تعديل</th></tr></thead><tbody className="divide-y divide-[#edf3f1]">{items.map(item => <tr key={item.id} className="hover:bg-[#fbfefd]">{render(item)}<td className="px-5 py-4"><Button size="sm" variant="outline" onClick={() => onEdit(item)} className="border-[#bcd9d2] font-bold text-[#0a6372] hover:bg-[#eff8f5]"><Pencil className="ml-1.5 h-4 w-4" />تعديل الاسم</Button></td></tr>)}</tbody></table></div>;
}
function Status({ active }: { active: boolean }) { return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${active ? "bg-[#eaf7f2] text-[#08735d]" : "bg-slate-100 text-slate-500"}`}>{active ? "نشط" : "موقوف"}</span>; }
function StatusSwitch({ active, onChange }: { active: boolean; onChange: (value: boolean) => void }) { return <div className="flex items-center justify-between rounded-xl border border-[#dce8e5] p-3"><div><p className="font-bold text-[#083f4c]">حالة التصنيف</p><p className="mt-1 text-xs text-slate-500">يمكن إيقافه دون حذف السجل السابق.</p></div><Switch checked={active} onCheckedChange={onChange} /></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="space-y-2"><Label className="font-bold text-[#083f4c]">{label}</Label>{children}</div>; }

function CategoryIdentity({ name, kind, group }: { name: string; kind: AccountKind | MovementKind; group: "account" | "movement" }) {
  const normalized = name.toLowerCase();
  const visual = group === "movement"
    ? normalized.includes("بترول") ? { Icon: Fuel, tone: "bg-amber-50 text-amber-700 ring-amber-100" }
      : normalized.includes("مشوار") || normalized.includes("مشاوير") ? { Icon: CarFront, tone: "bg-violet-50 text-violet-700 ring-violet-100" }
      : normalized.includes("صيانة") ? { Icon: Wrench, tone: "bg-orange-50 text-orange-700 ring-orange-100" }
      : normalized.includes("كهرباء") ? { Icon: Zap, tone: "bg-yellow-50 text-yellow-700 ring-yellow-100" }
      : normalized.includes("إيجار") || normalized.includes("ايجار") ? { Icon: Building2, tone: "bg-indigo-50 text-indigo-700 ring-indigo-100" }
      : normalized.includes("صدق") || normalized.includes("مساعد") || normalized.includes("تبرع") || normalized.includes("خير") ? { Icon: HeartHandshake, tone: "bg-teal-50 text-teal-700 ring-teal-100" }
      : normalized.includes("راتب") ? { Icon: WalletCards, tone: "bg-blue-50 text-blue-700 ring-blue-100" }
      : normalized.includes("قبض") ? { Icon: Banknote, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" }
      : normalized.includes("تحويل") ? { Icon: ArrowLeftRight, tone: "bg-sky-50 text-sky-700 ring-sky-100" }
      : normalized.includes("مبيع") || normalized.includes("اشتراك") ? { Icon: ShoppingBasket, tone: "bg-teal-50 text-teal-700 ring-teal-100" }
      : kind === "expense" ? { Icon: ReceiptText, tone: "bg-rose-50 text-rose-700 ring-rose-100" }
      : { Icon: CircleDollarSign, tone: "bg-slate-50 text-slate-700 ring-slate-100" }
    : normalized.includes("إيجار") || normalized.includes("ايجار") ? { Icon: Building2, tone: "bg-indigo-50 text-indigo-700 ring-indigo-100" }
      : normalized.includes("صدق") || normalized.includes("مساعد") || normalized.includes("تبرع") || normalized.includes("خير") ? { Icon: HeartHandshake, tone: "bg-teal-50 text-teal-700 ring-teal-100" }
      : kind === "income" ? { Icon: CircleDollarSign, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" }
      : kind === "expense" ? { Icon: ReceiptText, tone: "bg-rose-50 text-rose-700 ring-rose-100" }
      : kind === "asset" ? { Icon: Landmark, tone: "bg-blue-50 text-blue-700 ring-blue-100" }
      : kind === "liability" ? { Icon: WalletCards, tone: "bg-amber-50 text-amber-700 ring-amber-100" }
      : { Icon: Droplets, tone: "bg-slate-50 text-slate-700 ring-slate-100" };
  return <div className="flex items-center gap-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ${visual.tone}`}><visual.Icon className="h-4 w-4" /></span><span className="font-extrabold text-[#083f4c]">{name}</span></div>;
}
