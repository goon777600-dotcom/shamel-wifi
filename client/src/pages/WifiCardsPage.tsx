import { PageHeader, SectionCard, arabicDate } from "@/components/accounting/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  FileSpreadsheet,
  Layers,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Router as RouterIcon,
  Search,
  ShoppingCart,
  Tag,
  Ticket,
  Trash2,
  Wifi,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function WifiCardsPage() {
  const utils = trpc.useUtils();

  const profilesQuery = trpc.wifiCards.profiles.useQuery();
  const routersQuery = trpc.wifiCards.routers.useQuery();
  const batchesQuery = trpc.wifiCards.batches.useQuery();

  const [selectedBatchId, setSelectedBatchId] = useState<number | undefined>(undefined);
  const [selectedProfileId, setSelectedProfileId] = useState<number | undefined>(undefined);
  const [selectedStatus, setSelectedStatus] = useState<"available" | "sold" | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");

  const cardsQuery = trpc.wifiCards.cards.useQuery({
    batchId: selectedBatchId,
    profileId: selectedProfileId,
    status: selectedStatus,
    search: searchQuery || undefined,
    limit: 200,
  });

  // Modal states
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);

  // Generate form state
  const [genProfileId, setGenProfileId] = useState<string>("");
  const [genQuantity, setGenQuantity] = useState<number>(50);
  const [genCodeFormat, setGenCodeFormat] = useState<"username_only" | "username_password">("username_only");
  const [genCodeLength, setGenCodeLength] = useState<number>(6);
  const [genCodeType, setGenCodeType] = useState<"numbers" | "alphanumeric">("numbers");
  const [genPrefix, setGenPrefix] = useState<string>("");
  const [genNotes, setGenNotes] = useState<string>("");

  // New Profile form state
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfilePrice, setNewProfilePrice] = useState("");
  const [newProfileTime, setNewProfileTime] = useState("");
  const [newProfileData, setNewProfileData] = useState("");
  const [newProfileRouterName, setNewProfileRouterName] = useState("");

  // Print selection
  const [printBatchId, setPrintBatchId] = useState<number | undefined>(undefined);

  // Mutations
  const generateMutation = trpc.wifiCards.generateCards.useMutation({
    onSuccess: result => {
      utils.wifiCards.batches.invalidate();
      utils.wifiCards.cards.invalidate();
      setGenerateDialogOpen(false);
      toast.success(
        `تم توليد ${result.batch.quantity} كرت بنجاح! ${result.syncResult.message}`
      );
      // Auto open print dialog for this newly generated batch
      setPrintBatchId(result.batch.id);
      setPrintDialogOpen(true);
    },
    onError: err => toast.error(err.message),
  });

  const saveProfileMutation = trpc.wifiCards.saveProfile.useMutation({
    onSuccess: () => {
      utils.wifiCards.profiles.invalidate();
      setProfileDialogOpen(false);
      setNewProfileName("");
      setNewProfilePrice("");
      setNewProfileTime("");
      setNewProfileData("");
      setNewProfileRouterName("");
      toast.success("تم حفظ باقة الكروت بنجاح!");
    },
    onError: err => toast.error(err.message),
  });

  const syncBatchMutation = trpc.wifiCards.syncBatch.useMutation({
    onSuccess: res => {
      utils.wifiCards.batches.invalidate();
      utils.wifiCards.cards.invalidate();
      toast.success(res.message);
    },
    onError: err => toast.error(err.message),
  });

  const sellCardMutation = trpc.wifiCards.sellCard.useMutation({
    onSuccess: () => {
      utils.wifiCards.cards.invalidate();
      utils.wifiCards.batches.invalidate();
      toast.success("تم تسجيل بيع الكرت وإيداع المبلغ في الصندوق!");
    },
    onError: err => toast.error(err.message),
  });

  const deleteBatchMutation = trpc.wifiCards.deleteBatch.useMutation({
    onSuccess: () => {
      utils.wifiCards.batches.invalidate();
      utils.wifiCards.cards.invalidate();
      toast.success("تم حذف دفعة الكروت");
    },
    onError: err => toast.error(err.message),
  });

  const deleteCardMutation = trpc.wifiCards.deleteCard.useMutation({
    onSuccess: () => {
      utils.wifiCards.cards.invalidate();
      toast.success("تم حذف الكرت");
    },
    onError: err => toast.error(err.message),
  });

  // Calculate summaries
  const totalAvailable = useMemo(() => {
    return batchesQuery.data?.reduce((acc, b) => acc + b.availableCount, 0) || 0;
  }, [batchesQuery.data]);

  const totalSold = useMemo(() => {
    return batchesQuery.data?.reduce((acc, b) => acc + b.soldCount, 0) || 0;
  }, [batchesQuery.data]);

  const defaultRouter = routersQuery.data?.[0];

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!genProfileId) {
      toast.error("يرجى اختيار باقة الكرت");
      return;
    }
    generateMutation.mutate({
      profileId: Number(genProfileId),
      quantity: Number(genQuantity),
      codeFormat: genCodeFormat,
      codeLength: Number(genCodeLength),
      codeType: genCodeType,
      prefix: genPrefix,
      notes: genNotes,
    });
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    saveProfileMutation.mutate({
      name: newProfileName,
      price: newProfilePrice,
      currencyCode: "YER",
      timeLimit: newProfileTime || undefined,
      dataLimitLabel: newProfileData || undefined,
      routerProfileName: newProfileRouterName || undefined,
    });
  };

  // Cards for print preview
  const cardsToPrint = useMemo(() => {
    if (!printBatchId) return cardsQuery.data?.cards || [];
    return cardsQuery.data?.cards.filter(c => c.batchId === printBatchId) || [];
  }, [cardsQuery.data?.cards, printBatchId]);

  const exportExcel = () => {
    const list = cardsToPrint;
    if (list.length === 0) {
      toast.error("لا توجد كروت للتصدير");
      return;
    }

    const headers = ["الرقم", "رمز الدخول", "كلمة المرور", "الباقة", "السعر", "الحالة", "الدفعة"];
    const rows = list.map((c, idx) => [
      idx + 1,
      c.username,
      c.password,
      c.profileName,
      `${c.price} ${c.currencyCode}`,
      c.status === "available" ? "متاح" : "مباع",
      c.batchId,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `wifi_cards_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("تم تصدير ملف الكروت بنجاح!");
  };

  const copyCodes = () => {
    const codes = cardsToPrint.map(c => c.username).join("\n");
    navigator.clipboard.writeText(codes);
    toast.success(`تم نسخ ${cardsToPrint.length} رمز إلى الحافظة!`);
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="كروت الواي فاي (الميكروتك)"
          description="توليد كروت شبكة الشامل وإدارتها وطباعتها ومزامنتها مباشرة مع اليوزرمانجر أو الهوتسبوت."
        />
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/mikrotik-settings">
            <Button variant="outline" className="border-[#bcd9d2] text-[#0a6372] hover:bg-[#eff8f5]">
              <RouterIcon className="ml-2 h-4 w-4" />
              إعدادات الميكروتك
            </Button>
          </Link>

          <Button
            onClick={() => {
              if (profilesQuery.data && profilesQuery.data.length > 0 && !genProfileId) {
                setGenProfileId(profilesQuery.data[0].id.toString());
              }
              setGenerateDialogOpen(true);
            }}
            className="bg-[#0a6372] font-bold text-white hover:bg-[#084e5a] shadow-md shadow-[#0a6372]/20"
          >
            <Plus className="ml-2 h-4 w-4" />
            توليد كروت جديدة
          </Button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#dce8e5] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">الكروت المتاحة للبيع</span>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <Ticket className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-emerald-600">
            {new Intl.NumberFormat("ar-YE").format(totalAvailable)} كرت
          </p>
          <p className="mt-1 text-xs text-slate-500">جاهزة للبيع للزبائن والمحلات</p>
        </div>

        <div className="rounded-2xl border border-[#dce8e5] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">الكروت المباعة</span>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
              <ShoppingCart className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-[#083f4c]">
            {new Intl.NumberFormat("ar-YE").format(totalSold)} كرت
          </p>
          <p className="mt-1 text-xs text-slate-500">مسجلة في الصندوق المحاسبي</p>
        </div>

        <div className="rounded-2xl border border-[#dce8e5] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">دفعات الكروت</span>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600">
              <Layers className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-[#083f4c]">
            {batchesQuery.data?.length || 0} دفعة
          </p>
          <p className="mt-1 text-xs text-slate-500">إجمالي الدفعات المولدة</p>
        </div>

        <div className="rounded-2xl border border-[#dce8e5] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">ربط الميكروتك</span>
            <span
              className={`grid h-10 w-10 place-items-center rounded-xl ${
                defaultRouter?.status === "online"
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-amber-50 text-amber-600"
              }`}
            >
              <RouterIcon className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                defaultRouter?.status === "online" ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            <p className="font-bold text-[#083f4c]">
              {defaultRouter?.status === "online" ? "متصل بالراوتر" : "الموجّه 3.3.3.3"}
            </p>
          </div>
          <p className="mt-1 text-xs text-slate-500 font-mono">
            {defaultRouter ? `${defaultRouter.host}:${defaultRouter.apiPort}` : "3.3.3.3:8728"}
          </p>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="cards" className="w-full">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#dce8e5] pb-3">
          <TabsList className="bg-slate-100 p-1">
            <TabsTrigger value="cards" className="font-bold">
              <Ticket className="ml-1.5 h-4 w-4" />
              كروت الواي فاي ({cardsQuery.data?.total || 0})
            </TabsTrigger>
            <TabsTrigger value="batches" className="font-bold">
              <Layers className="ml-1.5 h-4 w-4" />
              الدفعات المولدّة ({batchesQuery.data?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="profiles" className="font-bold">
              <Tag className="ml-1.5 h-4 w-4" />
              باقات الكروت ({profilesQuery.data?.length || 0})
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPrintBatchId(undefined);
                setPrintDialogOpen(true);
              }}
              className="border-[#bcd9d2] text-[#0a6372] hover:bg-[#eff8f5]"
            >
              <Printer className="ml-1.5 h-4 w-4" />
              معاينة وطباعة الكروت
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportExcel}
              className="border-[#bcd9d2] text-[#0a6372] hover:bg-[#eff8f5]"
            >
              <FileSpreadsheet className="ml-1.5 h-4 w-4" />
              تصدير كشف للموزعين
            </Button>
          </div>
        </div>

        {/* Tab 1: Cards Table */}
        <TabsContent value="cards" className="mt-4 space-y-4">
          {/* Filters Bar */}
          <div className="grid gap-3 rounded-2xl border border-[#dce8e5] bg-white p-4 sm:grid-cols-4">
            <div>
              <Label className="text-xs font-bold text-slate-600">بحث بالرمز أو الرقم</Label>
              <div className="relative mt-1">
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="ابحث عن رمز كرت..."
                  className="pl-8 font-mono"
                />
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-600">الباقة</Label>
              <Select
                value={selectedProfileId?.toString() || "all"}
                onValueChange={v => setSelectedProfileId(v === "all" ? undefined : Number(v))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="جميع الباقات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الباقات</SelectItem>
                  {profilesQuery.data?.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-600">الدفعة</Label>
              <Select
                value={selectedBatchId?.toString() || "all"}
                onValueChange={v => setSelectedBatchId(v === "all" ? undefined : Number(v))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="جميع الدفعات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الدفعات</SelectItem>
                  {batchesQuery.data?.map(b => (
                    <SelectItem key={b.id} value={b.id.toString()}>
                      {b.batchNumber} ({b.quantity} كرت)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-600">الحالة</Label>
              <Select
                value={selectedStatus || "all"}
                onValueChange={(v: any) => setSelectedStatus(v === "all" ? undefined : v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="الكل" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="available">متاح للبيع</SelectItem>
                  <SelectItem value="sold">تم البيع</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Cards List Table */}
          <div className="overflow-hidden rounded-2xl border border-[#dce8e5] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="border-b border-[#e8f0ee] bg-[#f7fbfa] text-xs font-bold text-[#083f4c]">
                  <tr>
                    <th className="p-3.5">#</th>
                    <th className="p-3.5">رمز الكرت (الدخول)</th>
                    <th className="p-3.5">كلمة السر</th>
                    <th className="p-3.5">الباقة</th>
                    <th className="p-3.5">السعر</th>
                    <th className="p-3.5">المزامنة مع الراوتر</th>
                    <th className="p-3.5">الحالة</th>
                    <th className="p-3.5 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf3f1]">
                  {cardsQuery.isLoading ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">
                        جارٍ تحميل الكروت...
                      </td>
                    </tr>
                  ) : cardsQuery.data?.cards.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500">
                        لا توجد كروت مطابقة. اضغط &quot;توليد كروت جديدة&quot; للبدء.
                      </td>
                    </tr>
                  ) : (
                    cardsQuery.data?.cards.map((card, idx) => (
                      <tr key={card.id} className="hover:bg-[#fafdfc]">
                        <td className="p-3.5 font-mono text-xs text-slate-400">{idx + 1}</td>
                        <td className="p-3.5 font-mono font-extrabold text-[#083f4c] text-base">
                          {card.username}
                        </td>
                        <td className="p-3.5 font-mono text-slate-600">
                          {card.password === card.username ? (
                            <span className="text-xs text-slate-400">نفس الرمز</span>
                          ) : (
                            card.password
                          )}
                        </td>
                        <td className="p-3.5 font-medium text-slate-700">{card.profileName}</td>
                        <td className="p-3.5 font-bold text-[#0a6372]">
                          {new Intl.NumberFormat("ar-YE").format(Number(card.price))} {card.currencyCode}
                        </td>
                        <td className="p-3.5">
                          {card.syncedToRouter ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              متزامن مع الميكروتك
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                              محلي (غير متزامن)
                            </span>
                          )}
                        </td>
                        <td className="p-3.5">
                          {card.status === "available" ? (
                            <span className="inline-block text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md">
                              متاح للبيع
                            </span>
                          ) : (
                            <span className="inline-block text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-md">
                              تم البيع ({card.soldAt ? arabicDate(card.soldAt) : ""})
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {card.status === "available" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => sellCardMutation.mutate({ cardId: card.id })}
                                disabled={sellCardMutation.isPending}
                                className="h-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs font-bold"
                              >
                                <ShoppingCart className="ml-1 h-3.5 w-3.5" />
                                بيع كرت
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (window.confirm("هل أنت متأكد من حذف هذا الكرت؟")) {
                                  deleteCardMutation.mutate({ cardId: card.id });
                                }
                              }}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Batches Tab */}
        <TabsContent value="batches" className="mt-4 space-y-4">
          <div className="overflow-hidden rounded-2xl border border-[#dce8e5] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="border-b border-[#e8f0ee] bg-[#f7fbfa] text-xs font-bold text-[#083f4c]">
                  <tr>
                    <th className="p-3.5">رقم الدفعة</th>
                    <th className="p-3.5">تاريخ التوليد</th>
                    <th className="p-3.5">الباقة</th>
                    <th className="p-3.5">الكمية</th>
                    <th className="p-3.5">المتاح</th>
                    <th className="p-3.5">المباع</th>
                    <th className="p-3.5">الإجمالي</th>
                    <th className="p-3.5">المزامنة</th>
                    <th className="p-3.5 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf3f1]">
                  {batchesQuery.data?.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-500">
                        لم يتم توليد أي دفعة كروت بعد.
                      </td>
                    </tr>
                  ) : (
                    batchesQuery.data?.map(batch => (
                      <tr key={batch.id} className="hover:bg-[#fafdfc]">
                        <td className="p-3.5 font-mono font-bold text-[#083f4c] text-xs">
                          {batch.batchNumber}
                        </td>
                        <td className="p-3.5 text-slate-600 text-xs">
                          {arabicDate(batch.createdAt)}
                        </td>
                        <td className="p-3.5 font-medium">{batch.profileName}</td>
                        <td className="p-3.5 font-bold">{batch.quantity} كرت</td>
                        <td className="p-3.5 font-bold text-emerald-600">
                          {batch.availableCount} كرت
                        </td>
                        <td className="p-3.5 font-bold text-slate-500">
                          {batch.soldCount} كرت
                        </td>
                        <td className="p-3.5 font-bold text-[#0a6372]">
                          {new Intl.NumberFormat("ar-YE").format(Number(batch.totalAmount))}{" "}
                          {batch.currencyCode}
                        </td>
                        <td className="p-3.5">
                          {batch.status === "synced" ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="h-3 w-3" /> متزامنة
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => syncBatchMutation.mutate({ batchId: batch.id })}
                              disabled={syncBatchMutation.isPending}
                              className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                            >
                              <RefreshCw
                                className={`ml-1 h-3 w-3 ${
                                  syncBatchMutation.isPending ? "animate-spin" : ""
                                }`}
                              />
                              مزامنة للميكروتك
                            </Button>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setPrintBatchId(batch.id);
                                setPrintDialogOpen(true);
                              }}
                              className="h-8 border-[#bcd9d2] text-[#0a6372] hover:bg-[#eff8f5] text-xs"
                            >
                              <Printer className="ml-1 h-3.5 w-3.5" />
                              طباعة الدفعة
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `هل أنت متأكد من حذف الدفعة ${batch.batchNumber} وجميع كروتها؟`
                                  )
                                ) {
                                  deleteBatchMutation.mutate({ batchId: batch.id });
                                }
                              }}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Profiles Tab */}
        <TabsContent value="profiles" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => setProfileDialogOpen(true)}
              className="bg-[#0a6372] text-white font-bold hover:bg-[#084e5a]"
            >
              <Plus className="ml-2 h-4 w-4" />
              إضافة باقة جديدة
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {profilesQuery.data?.map(p => (
              <div
                key={p.id}
                className="rounded-2xl border border-[#dce8e5] bg-white p-5 shadow-sm hover:border-[#0a6372] transition-colors"
              >
                <div className="flex items-start justify-between">
                  <h3 className="font-extrabold text-[#083f4c] text-lg">{p.name}</h3>
                  <span className="font-extrabold text-xl text-[#0a6372]">
                    {new Intl.NumberFormat("ar-YE").format(Number(p.price))} {p.currencyCode}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-xs text-slate-600">
                  {p.timeLimit && (
                    <p className="flex items-center gap-2">
                      <span className="font-bold text-slate-700">الصلاحية:</span> {p.timeLimit}
                    </p>
                  )}
                  {p.dataLimitLabel && (
                    <p className="flex items-center gap-2">
                      <span className="font-bold text-slate-700">الرصيد:</span> {p.dataLimitLabel}
                    </p>
                  )}
                  {p.routerProfileName && (
                    <p className="flex items-center gap-2 font-mono">
                      <span className="font-bold text-slate-700">بروفايل الميكروتك:</span>{" "}
                      {p.routerProfileName}
                    </p>
                  )}
                </div>

                <div className="mt-5 pt-3 border-t border-[#edf3f1] flex justify-between items-center">
                  <span className="text-xs text-slate-400">باقة مفعّلة</span>
                  <Button
                    size="sm"
                    onClick={() => {
                      setGenProfileId(p.id.toString());
                      setGenerateDialogOpen(true);
                    }}
                    className="bg-[#0a6372] font-bold text-white text-xs h-8 hover:bg-[#084e5a]"
                  >
                    توليد كروت من هذه الباقة
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* ---------------------------------------------------- */}
      {/* Dialog: Generate Cards */}
      {/* ---------------------------------------------------- */}
      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent className="max-w-lg sm:max-w-xl text-right">
          <DialogHeader className="text-right">
            <DialogTitle className="text-xl font-extrabold text-[#083f4c]">
              توليد كروت واي فاي جديدة
            </DialogTitle>
            <DialogDescription>
              توليد دفعة كروت جديدة وتخزينها في قاعدة البيانات ومزامنتها مباشرة مع الميكروتك.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleGenerate} className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-bold text-[#083f4c]">باقة الكرت</Label>
              <Select value={genProfileId} onValueChange={setGenProfileId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="اختر الباقة..." />
                </SelectTrigger>
                <SelectContent>
                  {profilesQuery.data?.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name} - ({p.price} {p.currencyCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs font-bold text-[#083f4c]">كمية الكروت</Label>
                <Select
                  value={genQuantity.toString()}
                  onValueChange={v => setGenQuantity(Number(v))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 كروت</SelectItem>
                    <SelectItem value="25">25 كرت</SelectItem>
                    <SelectItem value="50">50 كرت (موصى به)</SelectItem>
                    <SelectItem value="100">100 كرت</SelectItem>
                    <SelectItem value="200">200 كرت</SelectItem>
                    <SelectItem value="500">500 كرت</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold text-[#083f4c]">طريقة تسجيل الدخول</Label>
                <Select value={genCodeFormat} onValueChange={(v: any) => setGenCodeFormat(v)}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="username_only">
                      رمز موحد (دخول برمز واحد - الأسهل للزبائن)
                    </SelectItem>
                    <SelectItem value="username_password">
                      اسم مستخدم + كلمة مرور منفصلة
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label className="text-xs font-bold text-[#083f4c]">طول الرمز</Label>
                <Select
                  value={genCodeLength.toString()}
                  onValueChange={v => setGenCodeLength(Number(v))}
                >
                  <SelectTrigger className="mt-1.5 font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">4 خانات</SelectItem>
                    <SelectItem value="6">6 خانات (الأكثر شيوعاً)</SelectItem>
                    <SelectItem value="8">8 خانات</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold text-[#083f4c]">نوع الرمز</Label>
                <Select value={genCodeType} onValueChange={(v: any) => setGenCodeType(v)}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="numbers">أرقام فقط (سهل الإدخال)</SelectItem>
                    <SelectItem value="alphanumeric">أرقام وحروف</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold text-[#083f4c]">بادئة الكرت (اختياري)</Label>
                <Input
                  value={genPrefix}
                  onChange={e => setGenPrefix(e.target.value)}
                  placeholder="مثال: SH-"
                  className="mt-1.5 font-mono uppercase"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-[#083f4c]">ملاحظات على الدفعة</Label>
              <Input
                value={genNotes}
                onChange={e => setGenNotes(e.target.value)}
                placeholder="مثال: دفعة بقالة الصعيد / خاصة بشهر رمضان"
                className="mt-1.5"
              />
            </div>

            {/* Router status reminder */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
              <p className="flex items-center gap-1.5 font-bold text-[#083f4c]">
                <RouterIcon className="h-4 w-4 text-[#0a6372]" />
                الموجّه المستهدف: {defaultRouter?.name || "الموجّه الافتراضي (3.3.3.3)"}
              </p>
              <p className="mt-1 leading-5">
                سيتم رفع الكروت تلقائياً إلى الميكروتك (User Manager / Hotspot). في حال كان الراوتر
                غير متصل الآن، سيتم حفظ الكروت في النظام مع إمكانية المزامنة لاحقاً بضغطة زر.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="submit"
                disabled={generateMutation.isPending}
                className="w-full sm:w-auto bg-[#0a6372] font-bold text-white hover:bg-[#084e5a]"
              >
                {generateMutation.isPending ? "جارٍ توليد الكروت..." : "توليد الكروت فوراً"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------------- */}
      {/* Dialog: Printable Cards View */}
      {/* ---------------------------------------------------- */}
      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto text-right print:p-0 print:max-w-none">
          <DialogHeader className="print:hidden text-right">
            <DialogTitle className="text-xl font-extrabold text-[#083f4c]">
              معاينة وطباعة كروت الواي فاي
            </DialogTitle>
            <DialogDescription>
              نماذج كروت الشامل الجاهزة للطباعة على ورق A4 والقص للبيع للزبائن والموزعين.
            </DialogDescription>
          </DialogHeader>

          {/* Action Toolbar for Print Modal */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 print:hidden">
            <div className="text-xs text-slate-500">
              عدد الكروت المعروضة: <b>{cardsToPrint.length} كرت</b>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={copyCodes}
                className="border-slate-300 text-slate-700"
              >
                <Copy className="ml-1.5 h-3.5 w-3.5" />
                نسخ الرموز
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={exportExcel}
                className="border-slate-300 text-slate-700"
              >
                <FileSpreadsheet className="ml-1.5 h-3.5 w-3.5" />
                تصدير Excel للمحلات
              </Button>
              <Button
                size="sm"
                onClick={() => window.print()}
                className="bg-[#0a6372] font-bold text-white hover:bg-[#084e5a]"
              >
                <Printer className="ml-1.5 h-4 w-4" />
                طباعة الكروت الآن
              </Button>
            </div>
          </div>

          {/* Printable Cards Grid (Styles tuned for screen + print) */}
          <div className="cards-print-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-2">
            {cardsToPrint.map((card, idx) => (
              <div
                key={card.id || idx}
                className="wifi-voucher-card relative rounded-xl border-2 border-dashed border-[#0a6372]/40 bg-white p-3 text-center shadow-xs flex flex-col justify-between"
                style={{ pageBreakInside: "avoid" }}
              >
                {/* Header */}
                <div className="border-b border-[#0a6372]/20 pb-1.5">
                  <h4 className="text-xs font-black text-[#083f4c]">الشامل لخدمات الإنترنت</h4>
                  <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500 mt-0.5">
                    <Phone className="h-2.5 w-2.5 text-[#0a6372]" />
                    <span>777600474</span>
                    <span className="mx-0.5">·</span>
                    <span>يافع الصعيد</span>
                  </div>
                </div>

                {/* Price & Package */}
                <div className="my-2">
                  <span className="inline-block bg-[#0a6372] text-white px-3 py-0.5 rounded-full text-xs font-extrabold shadow-xs">
                    {new Intl.NumberFormat("ar-YE").format(Number(card.price))} ريال
                  </span>
                  <p className="text-[11px] font-bold text-slate-700 mt-1">{card.profileName}</p>
                </div>

                {/* Voucher Code Box */}
                <div className="rounded-lg border border-slate-300 bg-slate-50 py-1.5 px-2 my-1">
                  <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                    رمز تسجيل الدخول
                  </p>
                  <p className="font-mono text-lg font-black text-[#083f4c] tracking-widest my-0.5">
                    {card.username}
                  </p>
                  {card.password !== card.username && (
                    <p className="text-[10px] text-slate-600 font-mono">
                      كلمة السر: <b>{card.password}</b>
                    </p>
                  )}
                </div>

                {/* Footer instructions */}
                <div className="pt-1 text-[9px] text-slate-500 border-t border-slate-100">
                  <p>اتصل بالواي فاي ثم افتح المتصفح وأدخل الرمز</p>
                </div>
              </div>
            ))}
          </div>

          <style>{`
            @media print {
              body * {
                visibility: hidden;
              }
              .cards-print-grid, .cards-print-grid * {
                visibility: visible;
              }
              .cards-print-grid {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                display: grid !important;
                grid-template-columns: repeat(4, 1fr) !important;
                gap: 8px !important;
                padding: 10px !important;
              }
              .wifi-voucher-card {
                border: 1px dashed #333 !important;
                box-shadow: none !important;
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
            }
          `}</style>
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------------- */}
      {/* Dialog: Create Profile */}
      {/* ---------------------------------------------------- */}
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="max-w-md text-right">
          <DialogHeader className="text-right">
            <DialogTitle className="text-lg font-extrabold text-[#083f4c]">
              إضافة باقة كروت جديدة
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveProfile} className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-bold text-[#083f4c]">اسم الباقة</Label>
              <Input
                value={newProfileName}
                onChange={e => setNewProfileName(e.target.value)}
                placeholder="مثال: كرت 300 ريال - 6 ساعات"
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs font-bold text-[#083f4c]">السعر (بالريال اليمني)</Label>
              <Input
                type="number"
                value={newProfilePrice}
                onChange={e => setNewProfilePrice(e.target.value)}
                placeholder="300"
                required
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-[#083f4c]">الصلاحية (الوقت)</Label>
                <Input
                  value={newProfileTime}
                  onChange={e => setNewProfileTime(e.target.value)}
                  placeholder="مثال: 6h أو 24h"
                  className="mt-1 font-mono"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-[#083f4c]">الرصيد (البيانات)</Label>
                <Input
                  value={newProfileData}
                  onChange={e => setNewProfileData(e.target.value)}
                  placeholder="مثال: 1 جيجابايت"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-[#083f4c]">اسم البروفايل في الميكروتك (اختياري)</Label>
              <Input
                value={newProfileRouterName}
                onChange={e => setNewProfileRouterName(e.target.value)}
                placeholder="مثال: profile-300"
                className="mt-1 font-mono"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="submit"
                disabled={saveProfileMutation.isPending}
                className="bg-[#0a6372] font-bold text-white hover:bg-[#084e5a]"
              >
                {saveProfileMutation.isPending ? "جارٍ الحفظ..." : "حفظ الباقة"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
