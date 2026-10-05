import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearAppLockToken, rememberAppLockToken, requestAppLock } from "@/lib/appLock";
import { KeyRound, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";

const logoUrl = "/api/app/app-icon.svg";

export default function AppLockGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"checking" | "locked" | "unlocked">("checking");

  async function confirmUnlockedSession() {
    const result = await requestAppLock("/api/app-lock/status");
    if (!result.unlocked) {
      clearAppLockToken();
      throw new Error("تعذر تثبيت جلسة القفل. أغلق التطبيق وافتحه من الرابط نفسه ثم حاول مرة أخرى.");
    }
    setStatus("unlocked");
  }

  useEffect(() => {
    requestAppLock("/api/app-lock/status")
      .then(result => setStatus(result.unlocked ? "unlocked" : "locked"))
      .catch(() => setStatus("locked"));
    const lock = () => setStatus("locked");
    window.addEventListener("shamel-app-locked", lock);
    return () => window.removeEventListener("shamel-app-locked", lock);
  }, []);

  if (status === "unlocked") return <>{children}</>;
  if (status === "checking") return <div dir="rtl" className="grid min-h-screen place-items-center bg-[#f5f7f6]"><Loader2 className="h-7 w-7 animate-spin text-[#0a6372]" /></div>;
  return <AppLockScreen onUnlocked={async token => {
    rememberAppLockToken(token);
    await confirmUnlockedSession();
  }} />;
}

function AppLockScreen({ onUnlocked }: { onUnlocked: (token?: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!password) return;
    setIsSubmitting(true);
    try {
      const result = await requestAppLock("/api/app-lock/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      setPassword("");
      await onUnlocked(result.token);
      toast.success("تم فتح التطبيق بأمان");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر فتح التطبيق");
    } finally {
      setIsSubmitting(false);
    }
  }

  return <main dir="rtl" className="relative grid min-h-screen place-items-center overflow-hidden bg-[#edf6f4] px-5 py-8 text-right"><div className="absolute -right-20 top-0 h-64 w-64 rounded-full bg-[#e9c66d]/20 blur-3xl" /><div className="relative w-full max-w-md rounded-[2rem] border border-[#d5e7e2] bg-white p-7 shadow-2xl shadow-[#083f4c]/10 sm:p-9"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-[#e3c877]/40 bg-[#083f4c] p-2 shadow-lg shadow-[#083f4c]/20"><img src={logoUrl} alt="الشامل لخدمات الإنترنت" className="h-full w-full object-contain" /></div><div className="mt-6 text-center"><p className="flex items-center justify-center gap-2 text-xs font-bold text-[#b28a2f]"><ShieldCheck className="h-4 w-4" />تطبيق خاص ومحمي</p><h1 className="mt-2 text-2xl font-extrabold text-[#083f4c]">الشامل لخدمات الإنترنت</h1><p className="mt-3 text-sm leading-6 text-slate-500">أدخل كلمة مرور التطبيق لفتح لوحة الحسابات الخاصة بك.</p></div><form onSubmit={submit} className="mt-7 space-y-4"><div className="space-y-2"><Label htmlFor="app-lock-password" className="font-bold text-[#083f4c]">كلمة مرور التطبيق</Label><div className="relative"><KeyRound className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#39727b]" /><Input id="app-lock-password" autoFocus autoComplete="current-password" type="password" value={password} onChange={event => setPassword(event.target.value)} className="h-12 border-[#cfe3dd] pr-10 text-left" dir="ltr" /></div></div><Button type="submit" disabled={!password || isSubmitting} className="h-12 w-full bg-[#0a6372] text-base font-extrabold hover:bg-[#084e5a]">{isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <><LockKeyhole className="ml-2 h-4 w-4" />فتح التطبيق</>}</Button></form><details className="mt-5 rounded-xl bg-[#f5faf8] p-3 text-sm text-slate-600"><summary className="cursor-pointer font-bold text-[#0a6372]">إضافته كتطبيق على الجوال</summary><p className="mt-2 leading-6">على الآيفون افتح الرابط بسفاري ثم اضغط مشاركة واختر «إضافة إلى الشاشة الرئيسية». وعلى أندرويد افتحه بكروم ثم من القائمة اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</p></details><p className="mt-4 text-center text-xs leading-5 text-slate-400">يبقى الدخول الأساسي للمالك محمياً أيضاً، ولا تُحفظ كلمة المرور في الهاتف أو المتصفح.</p></div></main>;
}
