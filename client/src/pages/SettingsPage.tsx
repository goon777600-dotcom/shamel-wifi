import { PageHeader, SectionCard, arabicDate } from "@/components/accounting/ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { BadgeCheck, Clock3, DatabaseBackup, Download, DownloadCloud, LockKeyhole, MapPin, PauseCircle, Phone, PlayCircle, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const logoUrl = "/api/app/app-icon.svg";

export default function SettingsPage() {
  const backupsQuery = trpc.accounting.backups.useQuery();
  const scheduleQuery = trpc.accounting.backupSchedule.useQuery();
  const whatsappSettingsQuery = trpc.accounting.whatsappSettings.useQuery();
  const utils = trpc.useUtils();
  const [latestManualBackup, setLatestManualBackup] = useState<{ fileName: string; url: string } | null>(null);
  const [whatsappTemplate, setWhatsappTemplate] = useState("");
  useEffect(() => {
    if (whatsappSettingsQuery.data?.whatsappTemplate) setWhatsappTemplate(whatsappSettingsQuery.data.whatsappTemplate);
  }, [whatsappSettingsQuery.data?.whatsappTemplate]);
  const backupMutation = trpc.accounting.createBackup.useMutation({
    onSuccess: async result => {
      await utils.accounting.backups.invalidate();
      setLatestManualBackup({ fileName: result.fileName, url: result.url });
      toast.success(`تم إنشاء النسخة الاحتياطية ${result.fileName}`);
    },
    onError: error => toast.error(error.message),
  });
  const restoreMutation = trpc.accounting.restoreBackup.useMutation({
    onSuccess: async result => {
      await Promise.all([utils.accounting.backups.invalidate(), utils.accounting.dashboard.invalidate(), utils.accounting.contacts.invalidate(), utils.accounting.invoices.invalidate(), utils.accounting.receipts.invalidate(), utils.accounting.expenses.invalidate(), utils.accounting.cashSummary.invalidate(), utils.accounting.servicePackages.invalidate(), utils.accounting.subscriptions.invalidate()]);
      toast.success(`تمت استعادة بيانات النسخة ${result.fileName}`);
      window.location.assign("/");
    },
    onError: error => toast.error(error.message),
  });
  const enableScheduleMutation = trpc.accounting.enableDailyBackup.useMutation({
    onSuccess: async () => {
      await utils.accounting.backupSchedule.invalidate();
      toast.success("تم تفعيل النسخة اليومية. ستعمل الساعة 1:00 فجراً بتوقيت اليمن.");
    },
    onError: error => toast.error(error.message),
  });
  const pauseScheduleMutation = trpc.accounting.pauseDailyBackup.useMutation({
    onSuccess: async () => {
      await utils.accounting.backupSchedule.invalidate();
      toast.success("تم إيقاف النسخة اليومية.");
    },
    onError: error => toast.error(error.message),
  });
  const saveWhatsappTemplateMutation = trpc.accounting.updateWhatsAppSettings.useMutation({
    onSuccess: async () => {
      await utils.accounting.whatsappSettings.invalidate();
      toast.success("تم حفظ قالب رسالة واتساب.");
    },
    onError: error => toast.error(error.message),
  });
  return (
    <div>
      <PageHeader title="إعدادات النظام" description="ملخص هوية الشامل ونطاق الوصول المعتمد للنسخة الأولى من لوحة الحسابات." />
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="هوية المنشأة" subtitle="ستظهر هذه البيانات في نماذج الفواتير وسندات القبض عند اعتماد تصميم الطباعة النهائي.">
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
            <img src={logoUrl} alt="الشامل لخدمات الإنترنت" className="h-24 w-36 rounded-2xl border border-[#e1c98f]/40 bg-[#fbfdfc] object-contain p-2" />
            <div className="space-y-3">
              <h2 className="text-xl font-extrabold text-[#083f4c]">الشامل لخدمات الإنترنت</h2>
              <p className="flex items-center gap-2 text-sm text-slate-600"><Phone className="h-4 w-4 text-[#0a6372]" />777600474</p>
              <p className="flex items-center gap-2 text-sm text-slate-600"><MapPin className="h-4 w-4 text-[#0a6372]" />يافع الصعيد</p>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="الوصول والحماية" subtitle="يُحصر التحكم المالي في حساب المالك فقط.">
          <div className="space-y-3 p-5">
            <Info icon={LockKeyhole} title="مالك واحد للنظام" description="لا توجد حسابات دخول للموظفين أو العملاء في النسخة الحالية." />
            <Info icon={ShieldCheck} title="إجراءات مالية محمية" description="الفواتير والقبض والمصروفات لا تتاح إلا للمستخدم الإداري." />
            <Info icon={BadgeCheck} title="سجل مراجعة" description="تسجل العمليات المالية والإضافات والتعديلات في سجل داخلي للمراجعة." />
          </div>
        </SectionCard>
      </div>

      <section className="mt-6">
        <SectionCard title="قالب رسالة واتساب" subtitle="اكتب التحية أو اسم المحل كما تريد. ستُستخدم الرسالة نفسها عند فتح واتساب من الفاتورة أو سند القبض أو حساب العميل.">
          <div className="space-y-4 p-5">
            <Textarea value={whatsappTemplate} onChange={event => setWhatsappTemplate(event.target.value)} maxLength={2000} rows={7} dir="rtl" className="resize-y border-[#bcd9d2] bg-[#fbfdfc] leading-7 focus-visible:ring-[#0a6372]" placeholder="مرحباً {{customer_name}}&#10;{{shop_name}}&#10;{{message_body}}" />
            <div className="rounded-xl bg-[#f7fbfa] p-4 text-xs leading-6 text-slate-600"><b className="text-[#083f4c]">المتغيرات المتاحة:</b> <code>{"{{greeting}}"}</code> للتحية، <code>{"{{customer_name}}"}</code> لاسم العميل، <code>{"{{shop_name}}"}</code> لاسم المحل، <code>{"{{message_body}}"}</code> لتفاصيل العملية، <code>{"{{document_number}}"}</code> لرقم المستند، <code>{"{{amount}}"}</code> للمبلغ، <code>{"{{currency}}"}</code> للعملة، و<code>{"{{due_amount}}"}</code> للمتبقي.</div>
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">عدد الأحرف: {whatsappTemplate.length} / 2000</p><Button onClick={() => saveWhatsappTemplateMutation.mutate({ whatsappTemplate })} disabled={saveWhatsappTemplateMutation.isPending || whatsappTemplate.trim().length < 10} className="bg-[#0a6372] font-bold hover:bg-[#084e5a]">{saveWhatsappTemplateMutation.isPending ? "جارٍ الحفظ..." : "حفظ قالب واتساب"}</Button></div>
          </div>
        </SectionCard>
      </section>

      <section className="mt-6">
        <SectionCard title="النسخ الاحتياطي للبيانات" subtitle="تُحفظ النسخ اليدوية والوقائية دائماً، وتبقى النسخ التلقائية لمدة 90 يوماً. أنشئ نسخة يدوية قبل أي إدخال تاريخي كبير ثم حمّلها إلى جهازك.">
          <div className="grid gap-4 border-b border-[#e8f0ee] bg-[#f7fbfa] p-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#eaf7f2] text-[#0a6372]"><Clock3 className="h-5 w-5" /></span><div><p className="font-extrabold text-[#083f4c]">نسخة تلقائية يومية</p><p className="mt-1 text-sm leading-6 text-slate-600">موعدها 1:00 فجراً بتوقيت اليمن. {scheduleQuery.data?.isEnabled ? "الحماية التلقائية مفعّلة." : "تحتاج إلى التفعيل بعد نشر الموقع."}</p>{scheduleQuery.data?.lastSuccessAt ? <p className="mt-1 text-xs text-[#0a6372]">آخر نسخة ناجحة: {arabicDate(scheduleQuery.data.lastSuccessAt)}</p> : null}</div></div>
            {scheduleQuery.data?.isEnabled ? <Button variant="outline" onClick={() => pauseScheduleMutation.mutate()} disabled={pauseScheduleMutation.isPending} className="border-[#e5c5c8] text-[#a53e47] hover:bg-[#fff1f2]"><PauseCircle className="ml-2 h-4 w-4" />إيقاف النسخة اليومية</Button> : <Button onClick={() => enableScheduleMutation.mutate()} disabled={enableScheduleMutation.isPending} className="bg-[#0a6372] font-bold hover:bg-[#084e5a]"><PlayCircle className="ml-2 h-4 w-4" />تفعيل النسخة اليومية</Button>}
          </div>
          <div className="flex flex-col gap-4 border-b border-[#e8f0ee] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#eaf7f2] text-[#0a6372]"><DatabaseBackup className="h-5 w-5" /></span><p className="max-w-xl text-sm leading-6 text-slate-600">تتضمن النسخة العملاء والفواتير والبنود وسندات القبض والمصروفات وحركات الصندوق والتصنيفات وسجل المراجعة.</p></div>
            <div className="flex flex-wrap gap-2"><Button onClick={() => backupMutation.mutate()} disabled={backupMutation.isPending} className="h-11 shrink-0 bg-[#0a6372] font-bold hover:bg-[#084e5a]">{backupMutation.isPending ? "جارٍ إنشاء النسخة..." : "إنشاء نسخة يدوية"}</Button>{latestManualBackup ? <Button asChild variant="outline" className="h-11 border-[#bcd9d2] text-[#0a6372]"><a href={latestManualBackup.url} target="_blank" rel="noreferrer"><DownloadCloud className="ml-2 h-4 w-4" />تنزيل النسخة الجديدة</a></Button> : null}</div>
          </div>
          {backupsQuery.isLoading ? <div className="space-y-3 p-5">{Array.from({ length: 2 }).map((_, index) => <Skeleton className="h-14 w-full" key={index} />)}</div> : backupsQuery.data?.length ? <div className="divide-y divide-[#edf3f1]">{backupsQuery.data.map(backup => <div key={backup.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-[#083f4c]">{backup.fileName}</p><p className="mt-1 text-xs text-slate-500"><span className="font-bold text-[#0a6372]">{backupSourceLabel(backup.source)}</span> · {arabicDate(backup.createdAt)} · {new Intl.NumberFormat("ar-YE").format(backup.sizeBytes)} بايت</p></div><div className="flex flex-wrap gap-2"><Button asChild size="sm" variant="outline" className="w-fit border-[#bcd9d2] text-[#0a6372] hover:bg-[#eff8f5]"><a href={backup.storageUrl} target="_blank" rel="noreferrer"><Download className="ml-2 h-4 w-4" />تنزيل</a></Button><Button size="sm" variant="outline" disabled={restoreMutation.isPending} onClick={() => { if (window.confirm(`ستُستبدل البيانات الحالية بالنسخة ${backup.fileName}. هل تريد المتابعة؟`)) restoreMutation.mutate({ snapshotId: backup.id }); }} className="border-[#e5c5c8] text-[#a53e47] hover:bg-[#fff1f2]"><RotateCcw className="ml-2 h-4 w-4" />استعادة</Button></div></div>)}</div> : <div className="p-8 text-center text-sm text-slate-500">لم تُنشأ أي نسخة احتياطية بعد.</div>}
        </SectionCard>
      </section>
    </div>
  );
}

function Info({ icon: Icon, title, description }: { icon: typeof LockKeyhole; title: string; description: string }) {
  return <div className="flex gap-3 rounded-2xl border border-[#dce8e5] bg-[#fbfdfc] p-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eaf7f2] text-[#0a6372]"><Icon className="h-5 w-5" /></span><div><p className="font-extrabold text-[#083f4c]">{title}</p><p className="mt-1 text-sm leading-6 text-slate-500">{description}</p></div></div>;
}
function backupSourceLabel(source: "manual" | "automatic" | "protective") { return source === "manual" ? "نسخة يدوية" : source === "automatic" ? "نسخة تلقائية" : "نسخة وقائية"; }
