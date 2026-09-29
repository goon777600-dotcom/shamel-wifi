import { EmptyState, PageHeader, SectionCard, StatCard, money } from "@/components/accounting/ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowDownToLine, ChartNoAxesCombined, CircleDollarSign, Fuel, HandCoins, ReceiptText, Router, WalletCards, Wrench } from "lucide-react";
import { useMemo, useState } from "react";

function monthBounds(value: string) {
  const [year, month] = value.split("-").map(Number);
  return { startDate: new Date(year, month - 1, 1, 0, 0, 0), endDate: new Date(year, month, 0, 23, 59, 59) };
}

export default function ReportsPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [reportingCurrency, setReportingCurrency] = useState<"YER" | "SAR" | "USD">("YER");
  const [reportingExchangeRateToBase, setReportingExchangeRateToBase] = useState("1");
  const bounds = useMemo(() => monthBounds(month), [month]);
  const reportQuery = trpc.accounting.financialReport.useQuery({ ...bounds, reportingCurrency, reportingExchangeRateToBase });
  const report = reportQuery.data;
  return (
    <div>
      <PageHeader title="التقارير المالية" description="اختر الشهر وعملة التقرير. تبقى أسعار صرف العمليات محفوظة كما أدخلتها، ثم يحول النظام الإجمالي إلى العملة التي تحددها أنت بسعر التقرير الحالي." action={<div className="flex flex-wrap gap-2 rounded-xl border border-[#dce8e5] bg-white p-1"><input aria-label="شهر التقرير" type="month" value={month} onChange={event => setMonth(event.target.value)} className="h-9 rounded-lg bg-transparent px-3 text-sm font-bold text-[#083f4c] outline-none" /><select value={reportingCurrency} onChange={event => { const currency = event.target.value as "YER" | "SAR" | "USD"; setReportingCurrency(currency); if (currency === "YER") setReportingExchangeRateToBase("1"); }} className="h-9 rounded-lg border-r border-[#e2ece9] bg-transparent px-2 text-sm font-bold text-[#083f4c] outline-none"><option value="YER">تقرير بالريال اليمني</option><option value="SAR">تقرير بالريال السعودي</option><option value="USD">تقرير بالدولار</option></select><input aria-label="سعر صرف التقرير" inputMode="decimal" value={reportingExchangeRateToBase} onChange={event => setReportingExchangeRateToBase(event.target.value)} className="h-9 w-24 rounded-lg border-r border-[#e2ece9] bg-transparent px-2 text-sm font-bold text-[#083f4c] outline-none" title="سعر العملة المختارة مقابل الريال اليمني" /></div>} />
      {reportQuery.isLoading ? <ReportsSkeleton /> : report ? <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="صافي الربح أو الخسارة" value={money(report.netProfit, report.reportingCurrency)} caption="الإيرادات ناقص المصروفات التشغيلية" icon={ChartNoAxesCombined} tone={Number(report.netProfit) >= 0 ? "teal" : "rose"} />
          <StatCard label="إجمالي المبيعات" value={money(report.revenue, report.reportingCurrency)} caption={`${report.salesInvoiceCount} فاتورة خلال الفترة`} icon={CircleDollarSign} tone="blue" />
          <StatCard label="المبالغ المحصلة" value={money(report.collections, report.reportingCurrency)} caption={`${report.receiptCount} سند قبض وفواتير نقدية`} icon={ReceiptText} tone="teal" />
            <StatCard label="ديون العملاء حتى نهاية الشهر" value={money(report.outstandingDebt, report.reportingCurrency)} caption="رصيد فواتير آجلة غير مسددة" icon={HandCoins} tone="gold" />
          </div>
          <section className="mt-6"><SectionCard title="ملخص مصاريف الشبكة" subtitle="إجماليات سريعة حسب التصنيف خلال الشهر المحدد؛ الأصول تظهر للمراجعة ولا تُخصم من صافي الربح التشغيلي."><div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="شراء الإنترنت" value={money(report.expenseHighlights.internet, report.reportingCurrency)} caption="Starlink أو Fiber أو مزود الإنترنت" icon={Router} tone="blue" /><StatCard label="البترول والمشاوير" value={money(report.expenseHighlights.fuel, report.reportingCurrency)} caption="مصاريف التنقل والتشغيل" icon={Fuel} tone="gold" /><StatCard label="صيانة الشبكة" value={money(report.expenseHighlights.networkMaintenance, report.reportingCurrency)} caption="إصلاح وأعمال الشبكة" icon={Wrench} tone="rose" /><StatCard label="تكلفة الأصول" value={money(report.expenseHighlights.assets, report.reportingCurrency)} caption="معدات وأجهزة ومواد كهرباء" icon={WalletCards} tone="teal" /></div></SectionCard></section>
        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
          <SectionCard title="المصروفات حسب التصنيف" subtitle={`سُجلت ${report.expenseCount} عملية صرف خلال الشهر المحدد.`}>
            {report.expenseBreakdown.length ? <div className="p-5">{report.expenseBreakdown.map((item, index) => { const biggest = Number(report.expenseBreakdown[0]?.amount ?? 1); const width = Math.max(8, (Number(item.amount) / biggest) * 100); return <div key={item.name} className="mb-5 last:mb-0"><div className="mb-2 flex items-center justify-between gap-4"><span className="font-bold text-[#083f4c]">{item.name}</span><span className="text-sm font-extrabold text-[#b9404a]">{money(item.amount, report.reportingCurrency)}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-[#f2f5f4]"><div className="h-full rounded-full bg-[#c99635]" style={{ width: `${width}%` }} /></div></div>; })}</div> : <EmptyState title="لا توجد مصروفات تشغيلية" description="لن يظهر هنا إلا المصروف المرتبط بتصنيف حساب من نوع مصروف." />}
          </SectionCard>
          <SectionCard title="حركة الصندوق خلال الشهر" subtitle="هذا التقرير يوضح النقدية الداخلة والخارجة فعلياً، ويعرض العملات منفصلة دون خلط.">
            <div className="divide-y divide-[#edf3f1]">{report.cashFlowByCurrency.map(currency => <div key={currency.code} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4"><div><p className="font-extrabold text-[#083f4c]">{currency.nameAr}</p><p className="mt-1 text-xs text-slate-500">داخل: {money(currency.incoming, currency.code)} · خارج: {money(currency.outgoing, currency.code)}</p></div><p className={`self-center font-extrabold ${Number(currency.net) >= 0 ? "text-[#08735d]" : "text-[#b9404a]"}`}>{Number(currency.net) >= 0 ? "+" : ""}{money(currency.net, currency.code)}</p></div>)}</div>
          </SectionCard>
        </div>
          <section className="mt-6"><SectionCard title="كيف تقرأ هذا التقرير؟" subtitle="الربح يختلف عن رصيد الصندوق. الفاتورة الآجلة تدخل في المبيعات والربح، لكنها لا تزيد النقدية إلا عند تسجيل سند قبض."><div className="grid gap-4 p-5 sm:grid-cols-3"><Insight icon={CircleDollarSign} title="المبيعات" text="تُسجل عند إصدار الفاتورة، سواء كانت نقدية أو آجلة." /><Insight icon={ArrowDownToLine} title="المصروفات" text="تظهر عند تسجيل المصروف النقدي وتصنيفه كمصروف تشغيلي." /><Insight icon={WalletCards} title="النقدية" text="تتغير فقط مع الفاتورة النقدية أو سند القبض أو الصرف أو التحويل." /></div></SectionCard></section>
          <section className="mt-6"><SectionCard title="تفاصيل شراء الإنترنت" subtitle="كل عمليات Starlink أو Fiber أو مزود الإنترنت خلال الشهر المحدد.">{report.expenseDetails.filter(item => item.categoryName.includes("شراء خدمة الإنترنت")).length ? <div className="divide-y divide-[#edf3f1]">{report.expenseDetails.filter(item => item.categoryName.includes("شراء خدمة الإنترنت")).map(item => <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-extrabold text-[#083f4c]">{item.expenseNumber} · {item.description}</p><p className="mt-1 text-xs text-slate-500">{new Date(item.expenseDate).toLocaleDateString("ar-YE")} · {item.categoryName}</p>{item.allowCashOverdraft ? <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700"><AlertTriangle className="h-3.5 w-3.5" />تجاوز صندوق: {item.cashOverrideReason ?? "مسجل"}</p> : null}</div><p className="font-extrabold text-[#b9404a]">{money(item.amount, report.reportingCurrency)}</p></div>)}</div> : <EmptyState title="لا توجد مصروفات شراء إنترنت في هذا الشهر" description="اختر تصنيف «شراء خدمة الإنترنت» عند تسجيل Starlink أو Fiber أو مزود الإنترنت." />}</SectionCard></section>
      </> : <EmptyState title="تعذر إنشاء التقرير" description="حاول تحديث الفترة أو افتح الصفحة مرة أخرى." />}
    </div>
  );
}

function Insight({ icon: Icon, title, text }: { icon: typeof CircleDollarSign; title: string; text: string }) { return <div className="rounded-2xl border border-[#dce8e5] bg-[#fbfdfc] p-4"><Icon className="h-5 w-5 text-[#0a6372]" /><h3 className="mt-3 font-extrabold text-[#083f4c]">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-500">{text}</p></div>; }
function ReportsSkeleton() { return <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-36 rounded-2xl" />)}</div><div className="grid gap-6 xl:grid-cols-2"><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div></div>; }
