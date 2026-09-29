import { EmptyState, PageHeader, SectionCard, StatCard, arabicDate, money } from "@/components/accounting/ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ArrowDownToLine, BellRing, ChartNoAxesCombined, CircleDollarSign, FileText, HandCoins, Plus, Store, UsersRound, WalletCards } from "lucide-react";
import { Link } from "wouter";

const movementLabels: Record<string, string> = {
  opening_balance: "رصيد افتتاحي",
  cash_invoice: "فاتورة نقدية",
  receipt: "سند قبض",
  expense: "مصروف",
  transfer_in: "تحويل وارد",
  transfer_out: "تحويل صادر",
  adjustment: "تسوية صندوق",
};

export default function AccountingDashboard() {
  const summary = trpc.accounting.dashboard.useQuery();

  if (summary.isLoading) {
    return <DashboardSkeleton />;
  }

  const data = summary.data;
  return (
    <div>
      <PageHeader
        title="نظرة عامة على الحسابات"
        description="تابع الربح والخسارة والديون وأرصدة الصناديق والبنوك من مكان واحد. تُعرض أرقام الربح الموحدة بالريال اليمني حسب أسعار الصرف المسجلة مع العمليات."
        action={
          <Button asChild className="h-11 bg-[#0a6372] px-5 font-bold hover:bg-[#084e5a]">
            <Link href="/invoices"><Plus className="ml-2 h-4 w-4" />إصدار فاتورة</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="صافي الربح" value={money(data?.netProfit, data?.baseCurrency)} caption="الإيرادات ناقص المصروفات التشغيلية" icon={ChartNoAxesCombined} tone={Number(data?.netProfit ?? 0) >= 0 ? "teal" : "rose"} />
        <StatCard label="إجمالي الإيرادات" value={money(data?.totalRevenue, data?.baseCurrency)} caption="يشمل الفواتير النقدية والآجلة" icon={CircleDollarSign} tone="blue" />
        <StatCard label="المصروفات التشغيلية" value={money(data?.totalExpenses, data?.baseCurrency)} caption="لا يشمل تحويل العملات أو الأصول" icon={ArrowDownToLine} tone="rose" />
        <StatCard label="الديون المستحقة" value={money(data?.totalDebt, data?.baseCurrency)} caption={`${data?.activeContacts ?? 0} حساباً نشطاً في النظام`} icon={HandCoins} tone="gold" />
        <StatCard label="الحسابات النشطة" value={new Intl.NumberFormat("ar-YE").format(data?.activeContacts ?? 0)} caption="عملاء وبقالات وموردون وموظفون" icon={UsersRound} tone="teal" />
        <StatCard label="مبيعات البقالات" value={money(data?.grocerySales, data?.baseCurrency)} caption={`${data?.groceryTransactionCount ?? 0} فاتورة لدى ${data?.groceryContactCount ?? 0} بقالة`} icon={Store} tone="gold" />
      </div>

      <section className="mt-6">
        <SectionCard title="تنبيهات تحتاج مراجعة" subtitle="تظهر هنا التنبيهات المرتبطة بالمديونيات؛ لا تؤثر الفاتورة الآجلة على الصندوق قبل تسجيل سند قبض.">
          {data?.openCreditInvoiceCount ? <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#fff7df] text-[#9c711a]"><BellRing className="h-5 w-5" /></span><div><p className="font-extrabold text-[#083f4c]">يوجد {data.openCreditInvoiceCount} فاتورة آجلة غير مسددة</p><p className="mt-1 text-sm text-slate-500">موزعة على {data.debtContactCount} حسابات. إجمالي المديونيات: {money(data.totalDebt, data.baseCurrency)}.</p></div></div><Button asChild variant="outline" className="border-[#d8c078] text-[#8b681e] hover:bg-[#fffaf0]"><Link href="/invoices">مراجعة الفواتير الآجلة</Link></Button></div> : <div className="flex items-center gap-3 p-5 text-sm text-[#08735d]"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eaf7f2]"><BellRing className="h-5 w-5" /></span>لا توجد فواتير آجلة مستحقة حالياً.</div>}
        </SectionCard>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="إجمالي أرصدة الصناديق والبنوك" subtitle="هذه الإجماليات تجمع أرصدة كل الصناديق والبنوك حسب العملة. لا تدخل الفواتير الآجلة هنا إلا بعد تسجيل سند قبض، ولا تؤثر التحويلات الداخلية على الربح.">
          <div className="grid gap-3 p-5 sm:grid-cols-3">
            {data?.cashBalances.map(balance => (
              <div key={balance.code} className="rounded-2xl border border-[#dce8e5] bg-[#f8fcfb] p-4">
                <div className="flex items-center justify-between">
                  <p className="font-extrabold text-[#083f4c]">{balance.nameAr}</p>
                  <span className="rounded-lg bg-white px-2 py-1 text-xs font-extrabold text-[#0a6372] shadow-sm">{balance.code}</span>
                </div>
                <p className="mt-4 text-xl font-extrabold text-[#083f4c]">{money(balance.balance, balance.code)}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 border-t border-[#e8f0ee] px-5 py-4">
            <Button asChild variant="outline" className="border-[#bcd9d2] text-[#0a6372] hover:bg-[#eff8f5]"><Link href="/cash">عرض الصناديق والبنوك</Link></Button>
            <Button asChild variant="ghost" className="text-[#0a6372] hover:bg-[#eff8f5]"><Link href="/cash">إضافة رصيد افتتاحي</Link></Button>
          </div>
        </SectionCard>

        <SectionCard title="اختصارات سريعة" subtitle="سجل عملياتك من الهاتف أو الكمبيوتر بنفس الخطوات المحاسبية.">
          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-1">
            <Shortcut href="/receipts" title="تسجيل سند قبض" description="استلام مبلغ آجل في الصندوق أو البنك الصحيح" icon={FileText} tone="teal" />
            <Shortcut href="/expenses" title="تسجيل مصروف" description="خصم مصروف من الصندوق أو البنك الدافع" icon={WalletCards} tone="rose" />
            <Shortcut href="/contacts" title="إضافة عميل أو بقالة" description="فتح حساب جديد دون حد ائتماني" icon={HandCoins} tone="gold" />
          </div>
        </SectionCard>
      </div>

      <section className="mt-6">
        <SectionCard title="آخر حركات الصناديق والبنوك" subtitle="راجع المقبوضات والمدفوعات والتحويلات مع الحساب الذي تأثر بكل حركة.">
          {data?.recentCashMovements.length ? (
            <div className="divide-y divide-[#edf3f1]">
              {data.recentCashMovements.map(movement => (
                <div key={movement.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`grid h-10 w-10 place-items-center rounded-xl ${movement.direction === "in" ? "bg-[#eaf7f2] text-[#08735d]" : "bg-[#fff1f2] text-[#b9404a]"}`}>
                      {movement.direction === "in" ? <CircleDollarSign className="h-5 w-5" /> : <ArrowDownToLine className="h-5 w-5" />}
                    </span>
                    <div>
                      <p className="font-bold text-[#083f4c]">{movement.description || movementLabels[movement.type]}</p>
                      <p className="mt-1 text-xs text-slate-500">{movementLabels[movement.type]} · {movement.cashAccountName ?? "صندوق الشبكة الرئيسي"} · {arabicDate(movement.occurredAt)}</p>
                    </div>
                  </div>
                  <p className={`font-extrabold ${movement.direction === "in" ? "text-[#08735d]" : "text-[#b9404a]"}`}>{movement.direction === "in" ? "+" : "−"}{money(movement.amount, movement.currencyCode)}</p>
                </div>
              ))}
            </div>
          ) : <EmptyState title="لا توجد حركة بعد" description="ابدأ بتحديد الرصيد الافتتاحي أو إصدار فاتورة نقدية أو تسجيل سند قبض في الصندوق أو البنك المناسب." actionHref="/cash" actionLabel="فتح الصناديق والبنوك" />}
        </SectionCard>
      </section>
    </div>
  );
}

function Shortcut({ href, title, description, icon: Icon, tone }: { href: string; title: string; description: string; icon: typeof FileText; tone: "teal" | "rose" | "gold" }) {
  const toneClass = { teal: "bg-[#eaf7f2] text-[#08735d]", rose: "bg-[#fff1f2] text-[#b9404a]", gold: "bg-[#fff7df] text-[#9c711a]" }[tone];
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-2xl border border-[#dce8e5] p-3 transition-all hover:-translate-y-0.5 hover:border-[#9acbc0] hover:shadow-md hover:shadow-[#0a6372]/5">
      <span className={`grid h-10 w-10 place-items-center rounded-xl ${toneClass}`}><Icon className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1"><span className="block font-extrabold text-[#083f4c]">{title}</span><span className="mt-1 block truncate text-xs text-slate-500">{description}</span></span>
    </Link>
  );
}

function DashboardSkeleton() {
  return <div className="space-y-6"><Skeleton className="h-24 w-full rounded-2xl" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-36 rounded-2xl" />)}</div><Skeleton className="h-80 w-full rounded-2xl" /></div>;
}
