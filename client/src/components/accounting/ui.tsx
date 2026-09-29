import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft, Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ReactNode } from "react";
import { Link } from "wouter";

const currencyLabels: Record<string, string> = { YER: "ر.ي", SAR: "ر.س", USD: "$" };

export function money(value: string | number | null | undefined, currencyCode = "YER") {
  const numberValue = Number(value ?? 0);
  const formatted = new Intl.NumberFormat("ar-YE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(numberValue);
  return `${formatted} ${currencyLabels[currencyCode] ?? currencyCode}`;
}

export function arabicDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-YE", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

export function PageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <section className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-2 text-xs font-extrabold tracking-wider text-[#b4882d]">الشامل لخدمات الإنترنت</p>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#083f4c] sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">{description}</p>
      </div>
      {action}
    </section>
  );
}

export function StatCard({ label, value, caption, icon: Icon, tone = "teal" }: { label: string; value: string; caption: string; icon: LucideIcon; tone?: "teal" | "gold" | "rose" | "blue" }) {
  const tones = {
    teal: "border-[#cbe3dc] bg-[#eff8f5] text-[#0a6372]",
    gold: "border-[#ead8a8] bg-[#fffaf0] text-[#9d6f16]",
    rose: "border-[#f0d3d5] bg-[#fff7f7] text-[#b9404a]",
    blue: "border-[#cddfec] bg-[#f4f9fc] text-[#236e90]",
  };
  return (
    <article className="rounded-2xl border border-[#dce8e5] bg-white p-4 shadow-sm shadow-[#0a6372]/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-500">{label}</p>
          <p className="mt-2 truncate text-xl font-extrabold tracking-tight text-[#083f4c]">{value}</p>
        </div>
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl border", tones[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-xs text-slate-400">{caption}</p>
    </article>
  );
}

export function SectionCard({ title, subtitle, children, className }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-[#dce8e5] bg-white shadow-sm shadow-[#0a6372]/5", className)}>
      <div className="border-b border-[#e8f0ee] px-5 py-4">
        <h2 className="font-extrabold text-[#083f4c]">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs leading-6 text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ title, description, actionHref, actionLabel }: { title: string; description: string; actionHref?: string; actionLabel?: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#eff8f5] text-[#0a6372]"><Inbox className="h-6 w-6" /></span>
      <h3 className="mt-4 font-extrabold text-[#083f4c]">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">{description}</p>
      {actionHref && actionLabel ? (
        <Button asChild variant="outline" className="mt-4 border-[#bcd9d2] text-[#0a6372] hover:bg-[#eff8f5]">
          <Link href={actionHref}>{actionLabel}<ArrowLeft className="mr-2 h-4 w-4" /></Link>
        </Button>
      ) : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, { label: string; className: string }> = {
    cash: { label: "نقدية", className: "bg-[#eaf7f2] text-[#08735d]" },
    credit: { label: "آجلة", className: "bg-[#fff7df] text-[#9c711a]" },
    issued: { label: "غير مسددة", className: "bg-[#fff7df] text-[#9c711a]" },
    partially_paid: { label: "مسددة جزئياً", className: "bg-[#eaf3fa] text-[#226b8b]" },
    paid: { label: "مسددة", className: "bg-[#eaf7f2] text-[#08735d]" },
    active: { label: "نشطة", className: "bg-[#eaf7f2] text-[#08735d]" },
    cancelled: { label: "ملغاة", className: "bg-[#fff1f2] text-[#b9404a]" },
  };
  const item = labels[status] ?? { label: status, className: "bg-slate-100 text-slate-600" };
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-extrabold", item.className)}>{item.label}</span>;
}
