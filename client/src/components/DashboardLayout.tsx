import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { lockApplication } from "@/lib/appLock";
import {
  BadgeDollarSign,
  ChartNoAxesCombined,
  FileText,
  Landmark,
  LayoutDashboard,
  LockKeyhole,
  PanelRight,
  ReceiptText,
  Router,
  Settings2,
  Tags,
  Ticket,
  UsersRound,
  Wifi,
  WalletCards,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const menuItems = [
  { icon: LayoutDashboard, label: "نظرة عامة", path: "/" },
  { icon: Ticket, label: "كروت الواي فاي", path: "/wifi-cards" },
  { icon: Router, label: "ربط الميكروتك", path: "/mikrotik-settings" },
  { icon: UsersRound, label: "العملاء والحسابات", path: "/contacts" },
  { icon: FileText, label: "فواتير المبيعات", path: "/invoices" },
  { icon: ReceiptText, label: "سندات القبض", path: "/receipts" },
  { icon: WalletCards, label: "المصروفات", path: "/expenses" },
  { icon: Landmark, label: "الصندوق والعملات", path: "/cash" },
  { icon: Wifi, label: "اشتراكات الأفراد", path: "/individual-subscriptions" },
  { icon: Router, label: "الباقات القديمة", path: "/subscriptions" },
  { icon: ChartNoAxesCombined, label: "التقارير", path: "/reports" },
  { icon: Tags, label: "التصنيفات", path: "/categories" },
  { icon: Settings2, label: "الإعدادات", path: "/settings" },
];

const logoUrl = "/api/app/app-icon.svg";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f5f7f6] p-5 text-center">
        <div className="w-full max-w-md rounded-3xl border border-[#dce8e5] bg-white p-8 shadow-xl shadow-[#0b4c5a]/10">
          <img src={logoUrl} alt="الشامل لخدمات الإنترنت" className="mx-auto mb-6 h-20 w-auto object-contain" />
          <h1 className="text-2xl font-bold text-[#083f4c]">لوحة حسابات الشامل</h1>
          <p className="mt-3 leading-7 text-slate-500">هذه اللوحة مخصصة لمالك شبكة الشامل لخدمات الإنترنت فقط.</p>
          <Button onClick={() => window.location.reload()} className="mt-7 h-12 w-full bg-[#0a6372] text-base hover:bg-[#084e5a]">
            إعادة تحميل حساب المالك
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#f5f7f6] text-right">
      <SidebarProvider defaultOpen>
        <Sidebar side="right" collapsible="icon" className="border-l border-[#dce8e5]">
          <SidebarHeader className="p-4">
            <div className="flex items-center gap-3 px-1">
              <img src={logoUrl} alt="الشامل لخدمات الإنترنت" className="h-11 w-11 rounded-xl border border-[#e0c98d]/40 bg-white object-contain p-1" />
              <div className="min-w-0 text-right group-data-[collapsible=icon]:hidden">
                <p className="truncate text-sm font-extrabold text-[#083f4c]">الشامل للإنترنت</p>
                <p className="mt-0.5 text-xs text-slate-500">لوحة الحسابات الخاصة</p>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="px-3 py-2">
            <SidebarNavigation />
          </SidebarContent>

          <SidebarFooter className="p-3">
            <div className="rounded-2xl border border-[#dce8e5] bg-white/70 p-2 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex w-full items-center gap-3 rounded-xl p-1.5 text-right transition-colors hover:bg-[#eff7f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a6372] group-data-[collapsible=icon]:justify-center">
                    <Avatar className="h-9 w-9 shrink-0 border border-[#c9e0da]">
                      <AvatarFallback className="bg-[#0a6372] text-xs font-bold text-white">{user.name?.charAt(0).toUpperCase() ?? "م"}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                      <p className="truncate text-sm font-bold text-[#083f4c]">{user.name || "المالك"}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">مدير النظام</p>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48 text-right">
                  <DropdownMenuItem className="cursor-pointer" onClick={async () => { try { await lockApplication(); } catch { toast.error("تعذر قفل التطبيق"); } }}>
                    <LockKeyhole className="ml-2 h-4 w-4" />
                    قفل التطبيق
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="bg-[#f5f7f6]">
          <TopBar />
          <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

function SidebarNavigation() {
  const [location, setLocation] = useLocation();
  return (
    <SidebarMenu>
      <p className="mb-2 px-2 text-[11px] font-bold tracking-wide text-slate-400 group-data-[collapsible=icon]:hidden">إدارة الحسابات</p>
      {menuItems.map(item => {
        const active = location === item.path;
        return (
          <SidebarMenuItem key={item.path}>
            <SidebarMenuButton
              isActive={active}
              tooltip={item.label}
              onClick={() => setLocation(item.path)}
              className="h-11 text-right font-medium data-[active=true]:bg-[#0a6372] data-[active=true]:text-white data-[active=true]:hover:bg-[#0a6372]"
            >
              <item.icon className={active ? "text-[#e9c66d]" : "text-[#39727b]"} />
              <span>{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function TopBar() {
  const [location] = useLocation();
  const active = menuItems.find(item => item.path === location) ?? menuItems[0];
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#dce8e5] bg-[#f5f7f6]/90 px-4 backdrop-blur sm:px-6" dir="rtl">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="h-10 w-10 rounded-xl border border-[#dce8e5] bg-white text-[#083f4c] hover:bg-[#eff7f5]" />
        <div>
          <p className="text-sm font-extrabold text-[#083f4c]">{active.label}</p>
          <p className="hidden text-xs text-slate-500 sm:block">الشامل لخدمات الإنترنت</p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-[#d7e7e3] bg-white px-3 py-1.5 text-xs font-bold text-[#0a6372]">
        <BadgeDollarSign className="h-4 w-4 text-[#c39a39]" />
        صندوق متعدد العملات
      </div>
    </header>
  );
}
