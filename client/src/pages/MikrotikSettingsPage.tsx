import { PageHeader, SectionCard } from "@/components/accounting/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Cpu,
  HardDrive,
  Info,
  Network,
  RefreshCw,
  Router as RouterIcon,
  Server,
  ShieldAlert,
  Terminal,
  Wifi,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function MikrotikSettingsPage() {
  const routersQuery = trpc.wifiCards.routers.useQuery();
  const profilesQuery = trpc.wifiCards.profiles.useQuery();
  const utils = trpc.useUtils();

  const [routerId, setRouterId] = useState<number | undefined>(undefined);
  const [name, setName] = useState("موجّه الشامل الرئيسي");
  const [host, setHost] = useState("3.3.3.3");
  const [apiPort, setApiPort] = useState(8728);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"usermanager_v6" | "usermanager_v7" | "hotspot">("usermanager_v6");
  const [customer, setCustomer] = useState("admin");

  const [testResult, setTestResult] = useState<any>(null);

  // Profile Mapping states
  const [profileMappings, setProfileMappings] = useState<Record<number, string>>({});
  const [availableRouterProfiles, setAvailableRouterProfiles] = useState<string[]>([]);
  const [isFetchingProfiles, setIsFetchingProfiles] = useState(false);

  // Populate profile mappings from DB
  useEffect(() => {
    if (profilesQuery.data) {
      const initialMap: Record<number, string> = {};
      for (const p of profilesQuery.data) {
        initialMap[p.id] = p.routerProfileName || "";
      }
      setProfileMappings(initialMap);
    }
  }, [profilesQuery.data]);

  // Populate form with first/default router if exists
  useEffect(() => {
    if (routersQuery.data && routersQuery.data.length > 0) {
      const r = routersQuery.data.find(x => x.isDefault) || routersQuery.data[0];
      setRouterId(r.id);
      setName(r.name);
      setHost(r.host);
      setApiPort(r.apiPort);
      setUsername(r.username);
      setPassword(r.password || "");
      setMode(r.mode as any);
      setCustomer(r.customer || "admin");
    }
  }, [routersQuery.data]);

  const saveMutation = trpc.wifiCards.saveRouter.useMutation({
    onSuccess: async saved => {
      await utils.wifiCards.routers.invalidate();
      setRouterId(saved.id);
      toast.success("تم حفظ إعدادات الموجّه بنجاح!");
    },
    onError: err => toast.error(err.message),
  });

  const testMutation = trpc.wifiCards.testRouterConnection.useMutation({
    onSuccess: result => {
      setTestResult(result);
      if (result.ok) {
        toast.success(result.message);
        utils.wifiCards.routers.invalidate();
        const detected = [
          ...(result.userManagerProfiles || []),
          ...(result.hotspotProfiles || []),
        ].filter(Boolean);
        if (detected.length > 0) {
          setAvailableRouterProfiles(Array.from(new Set(detected)));
        }
      } else {
        toast.error("فشل الاتصال بالميكروتك: " + result.message);
      }
    },
    onError: err => {
      setTestResult({ ok: false, message: err.message });
      toast.error(err.message);
    },
  });

  const updateMappingsMutation = trpc.wifiCards.batchUpdateProfileMappings.useMutation({
    onSuccess: res => {
      utils.wifiCards.profiles.invalidate();
      toast.success(res.message);
    },
    onError: err => toast.error(err.message),
  });

  const handleFetchProfiles = async () => {
    setIsFetchingProfiles(true);
    try {
      const data = await utils.wifiCards.fetchRouterProfiles.fetch({ routerId });
      if (data.ok) {
        const names = data.profiles.map(p => p.name).filter(Boolean);
        setAvailableRouterProfiles(Array.from(new Set(names)));
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
    } catch (err: any) {
      toast.error(err.message || "تعذر جلب البروفايلات من الميكروتك");
    } finally {
      setIsFetchingProfiles(false);
    }
  };

  const handleSaveMappings = () => {
    if (!profilesQuery.data || profilesQuery.data.length === 0) return;
    const mappings = profilesQuery.data.map(p => ({
      profileId: p.id,
      routerProfileName: (profileMappings[p.id] || "").trim(),
    }));
    updateMappingsMutation.mutate({ mappings });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      id: routerId,
      name,
      host,
      apiPort: Number(apiPort),
      username,
      password,
      mode,
      customer,
      isDefault: true,
    });
  };

  const handleTest = () => {
    testMutation.mutate({
      id: routerId,
      host,
      port: Number(apiPort),
      username,
      password,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("تم نسخ الأمر إلى الحافظة!");
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="ربط وإعدادات الميكروتك (MikroTik)"
        description="إعداد الاتصال بموجّه الميكروتك وخدمة اليوزرمانجر (User Manager) أو الهوتسبوت لتوليد وإدارة كروت الشبكة."
      />

      {/* Quick Status Banner */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex items-center gap-4 rounded-2xl border border-[#dce8e5] bg-white p-4 shadow-sm">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#eaf7f2] text-[#0a6372]">
            <Server className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">حالة الموجّه</p>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`inline-block h-3 w-3 rounded-full ${
                  testResult?.ok || routersQuery.data?.[0]?.status === "online"
                    ? "bg-emerald-500"
                    : "bg-amber-500 animate-pulse"
                }`}
              />
              <span className="font-bold text-[#083f4c]">
                {testResult?.ok || routersQuery.data?.[0]?.status === "online"
                  ? "متصل وجاهز"
                  : "يحتاج اختبار / ضبط"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-[#dce8e5] bg-white p-4 shadow-sm">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#eaf7f2] text-[#0a6372]">
            <Network className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">العنوان الحالي</p>
            <p className="mt-1 font-bold text-[#083f4c] font-mono">
              {host}:{apiPort}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-[#dce8e5] bg-white p-4 shadow-sm">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#eaf7f2] text-[#0a6372]">
            <Wifi className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">نمط توليد الكروت</p>
            <p className="mt-1 font-bold text-[#083f4c]">
              {mode === "usermanager_v6"
                ? "يوزرمانجر RouterOS v6"
                : mode === "usermanager_v7"
                ? "يوزرمانجر RouterOS v7"
                : "هوتسبوت مباشر (Hotspot)"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Settings Form */}
        <SectionCard
          title="بيانات الاتصال بالموجّه"
          subtitle="أدخل بيانات الدخول إلى الميكروتك (نفس البيانات المسجلة في WinBox)."
        >
          <form onSubmit={handleSave} className="space-y-4 p-5">
            <div>
              <Label className="text-xs font-bold text-[#083f4c]">اسم الموجّه التعريفي</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="مثال: موجّه الشامل الرئيسي"
                className="mt-1.5"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs font-bold text-[#083f4c]">عنوان الموجّه (IP / Host)</Label>
                <Input
                  value={host}
                  onChange={e => setHost(e.target.value)}
                  placeholder="3.3.3.3 أو 172.16.0.1"
                  className="mt-1.5 font-mono"
                  required
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  عنوان الراوتر في شبكتك (مثل 3.3.3.3 أو 172.16.0.1 أو DDNS)
                </p>
              </div>

              <div>
                <Label className="text-xs font-bold text-[#083f4c]">منفذ الـ API (Port)</Label>
                <Input
                  type="number"
                  value={apiPort}
                  onChange={e => setApiPort(Number(e.target.value))}
                  placeholder="8728"
                  className="mt-1.5 font-mono"
                  required
                />
                <p className="mt-1 text-[11px] text-slate-500">المنفذ الافتراضي في ميكروتك هو 8728</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs font-bold text-[#083f4c]">اسم المستخدم (Username)</Label>
                <Input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="admin"
                  className="mt-1.5 font-mono"
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-[#083f4c]">كلمة المرور (Password)</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="اتركها فارغة إذا لم توجد كلمة سر"
                  className="mt-1.5 font-mono"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs font-bold text-[#083f4c]">نمط الربط والتوليد</Label>
                <Select value={mode} onValueChange={(v: any) => setMode(v)}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usermanager_v6">
                      اليوزرمانجر (RouterOS v6.x) - مستحسن لنسخة 6.48
                    </SelectItem>
                    <SelectItem value="usermanager_v7">
                      اليوزرمانجر (RouterOS v7.x)
                    </SelectItem>
                    <SelectItem value="hotspot">
                      مستخدمي الهوتسبوت المباشر (/ip hotspot user)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-slate-500">
                  اختر نمط اليوزرمانجر أو الهوتسبوت المباشر الذي تستخدمه في شبكتك.
                </p>
              </div>

              <div>
                <Label className="text-xs font-bold text-[#083f4c]">اسم المالك في اليوزرمانجر (Customer)</Label>
                <Input
                  value={customer}
                  onChange={e => setCustomer(e.target.value)}
                  placeholder="admin"
                  className="mt-1.5 font-mono"
                />
                <p className="mt-1 text-[11px] text-slate-500">الافتراضي هو admin في يوزرمانجر v6</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleTest}
                disabled={testMutation.isPending}
                className="border-[#0a6372] text-[#0a6372] hover:bg-[#eff8f5]"
              >
                <RefreshCw
                  className={`ml-2 h-4 w-4 ${testMutation.isPending ? "animate-spin" : ""}`}
                />
                {testMutation.isPending ? "جارٍ اختبار الاتصال..." : "اختبار وفحص الاتصال"}
              </Button>

              <Button
                type="submit"
                disabled={saveMutation.isPending}
                className="bg-[#0a6372] font-bold hover:bg-[#084e5a]"
              >
                {saveMutation.isPending ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
              </Button>
            </div>
          </form>
        </SectionCard>

        {/* Live Diagnostics & Help */}
        <div className="space-y-6">
          {/* Test Results Card */}
          <SectionCard
            title="نتيجة فحص الاتصال"
            subtitle="معلومات جهاز الميكروتك والتشخيص المباشر للحالة."
          >
            <div className="p-5 space-y-4">
              {testResult ? (
                testResult.ok ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-extrabold text-emerald-900">
                          {testResult.message}
                        </h4>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-emerald-800">
                          <p>
                            <b>اسم الجهاز:</b> {testResult.identity}
                          </p>
                          <p>
                            <b>إصدار RouterOS:</b> {testResult.version}
                          </p>
                          <p>
                            <b>موديل اللوحة:</b> {testResult.boardName}
                          </p>
                          <p>
                            <b>مدة التشغيل:</b> {testResult.uptime}
                          </p>
                          {testResult.cpuLoad && (
                            <p>
                              <b>حمولة المعالج:</b> {testResult.cpuLoad}
                            </p>
                          )}
                          {testResult.freeMemoryMb && (
                            <p>
                              <b>الذاكرة المتاحة:</b> {testResult.freeMemoryMb} MB
                            </p>
                          )}
                        </div>

                        {testResult.userManagerProfiles?.length > 0 && (
                          <div className="mt-3 text-xs">
                            <span className="font-bold">بروفايلات اليوزرمانجر المكتشفة: </span>
                            <span className="font-mono text-emerald-700">
                              {testResult.userManagerProfiles.join(", ")}
                            </span>
                          </div>
                        )}
                        {testResult.hotspotProfiles?.length > 0 && (
                          <div className="mt-2 text-xs">
                            <span className="font-bold">بروفايلات الهوتسبوت المكتشفة: </span>
                            <span className="font-mono text-emerald-700">
                              {testResult.hotspotProfiles.join(", ")}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
                    <div className="flex items-start gap-3">
                      <ShieldAlert className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
                      <div className="space-y-2">
                        <h4 className="font-extrabold text-rose-900">فشل الاتصال بالميكروتك</h4>
                        <p className="text-xs leading-5 text-rose-700 whitespace-pre-line">
                          {testResult.message}
                        </p>
                        {testResult.diagnosticHint && (
                          <div className="mt-3 rounded-xl bg-white/80 p-3 text-xs text-slate-700 border border-rose-200">
                            <p className="font-bold text-[#083f4c] mb-1">طريقة الحل السريع:</p>
                            <p className="whitespace-pre-line leading-6">
                              {testResult.diagnosticHint}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <div className="rounded-2xl border border-[#dce8e5] bg-[#fbfdfc] p-6 text-center text-slate-500 text-sm">
                  <RouterIcon className="mx-auto h-10 w-10 text-slate-400 mb-2" />
                  <p>اضغط على زر <b>&quot;اختبار وفحص الاتصال&quot;</b> لفحص الربط مع الميكروتك مباشرة.</p>
                </div>
              )}

              {/* Quick WinBox Terminal Command Box */}
              <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
                <div className="flex items-start gap-3">
                  <Terminal className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
                  <div className="space-y-2 text-xs">
                    <h5 className="font-bold text-amber-900">
                      إذا كان الاتصال يُرفض (Port 8728 Closed):
                    </h5>
                    <p className="text-amber-800 leading-5">
                      في الميكروتك، تكون خدمة API مغلقة افتراضياً. لتفعيلها فوراً افتح برنامج WinBox
                      ثم اضغط <b>New Terminal</b> ونفّذ الأمر التالي:
                    </p>
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-900 px-3 py-2 text-emerald-400 font-mono text-[11px] dir-ltr text-left">
                      <code>/ip service enable api</code>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard("/ip service enable api")}
                        className="h-7 w-7 p-0 text-slate-300 hover:text-white hover:bg-slate-800"
                        title="نسخ الأمر"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="text-slate-600 text-[11px]">
                      أو من قائمة WinBox: اذهب إلى <b>IP</b> ثم <b>Services</b> ثم اضغط على <b>api</b> واضغط زر الصح الأخضر (Enable).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Profile Mapping Section */}
      <SectionCard
        title="ربط بروفايلات الباقات مع الميكروتك (Profile Mapping)"
        subtitle="حدد لكل باقة (مثلاً كرت 200 ريال) اسم البروفايل المطابق لها في الميكروتك. عند قيام الزبون أو الكاشير بشراء كرت أبو 200، يقوم الميكروتك بإنشاء كرت مباشر باسم مستخدم فقط بدون كلمة سر وتطبيق هذا البروفايل فوراً."
      >
        <div className="p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#f3f9f7] p-4 rounded-xl border border-[#d6ede4]">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#0a6372] text-white">
                <Wifi className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-bold text-[#083f4c] text-sm">
                  البروفايلات المتوفرة في جهاز الميكروتك
                </h4>
                <p className="text-xs text-slate-600">
                  {availableRouterProfiles.length > 0
                    ? `تم اكتشاف البروفايلات التالية: ${availableRouterProfiles.join(", ")}`
                    : "اضغط زر جلب البروفايلات لاكتشاف الأسماء المسجلة داخل راوتر الميكروتك تلقائياً."}
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleFetchProfiles}
              disabled={isFetchingProfiles}
              className="border-[#0a6372] text-[#0a6372] hover:bg-[#eff8f5]"
            >
              <RefreshCw
                className={`ml-2 h-3.5 w-3.5 ${isFetchingProfiles ? "animate-spin" : ""}`}
              />
              {isFetchingProfiles ? "جارٍ الجلب..." : "جلب البروفايلات من الميكروتك"}
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#dce8e5]">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#f8faf9] text-[#083f4c] font-bold border-b border-[#dce8e5]">
                <tr>
                  <th className="py-3 px-4">اسم الباقة في النظام</th>
                  <th className="py-3 px-4">السعر</th>
                  <th className="py-3 px-4">الصلاحية والبيانات</th>
                  <th className="py-3 px-4">اسم البروفايل في الميكروتك (Profile Name)</th>
                  <th className="py-3 px-4">طريقة الدخول</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef4f1]">
                {profilesQuery.data && profilesQuery.data.length > 0 ? (
                  profilesQuery.data.map(profile => (
                    <tr key={profile.id} className="hover:bg-[#fbfdfc]">
                      <td className="py-3.5 px-4 font-bold text-[#083f4c]">
                        {profile.name}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-700">
                        {Number(profile.price).toLocaleString()} {profile.currencyCode}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {profile.timeLimit || "-"} {profile.dataLimitLabel ? `| ${profile.dataLimitLabel}` : ""}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2 max-w-xs">
                          <Input
                            list={`profiles-list-${profile.id}`}
                            value={profileMappings[profile.id] ?? ""}
                            onChange={e =>
                              setProfileMappings(prev => ({
                                ...prev,
                                [profile.id]: e.target.value,
                              }))
                            }
                            placeholder={
                              profile.name.includes("200")
                                ? "200"
                                : profile.name.includes("500")
                                ? "500"
                                : profile.name.includes("1000")
                                ? "1000"
                                : "مثال: 200 أو u200"
                            }
                            className="font-mono text-xs h-8 bg-white"
                          />
                          <datalist id={`profiles-list-${profile.id}`}>
                            {availableRouterProfiles.map(pName => (
                              <option key={pName} value={pName} />
                            ))}
                          </datalist>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-800 border border-teal-200">
                          اسم المستخدم فقط (بدون كلمة سر)
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      لا توجد باقات كروت مسجلة في النظام بعد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p className="text-xs text-slate-500">
              💡 <b>ملاحظة:</b> يمكنك كتابة اسم البروفايل يدوياً تماماً كما هو مسجل في WinBox (مثال: <code className="bg-slate-100 px-1 py-0.5 rounded text-[#0a6372]">200</code> أو <code className="bg-slate-100 px-1 py-0.5 rounded text-[#0a6372]">profile-200</code>).
            </p>

            <Button
              type="button"
              onClick={handleSaveMappings}
              disabled={updateMappingsMutation.isPending}
              className="bg-[#0a6372] text-white font-bold hover:bg-[#084e5a]"
            >
              {updateMappingsMutation.isPending ? "جارٍ الحفظ..." : "حفظ ربط البروفايلات"}
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
