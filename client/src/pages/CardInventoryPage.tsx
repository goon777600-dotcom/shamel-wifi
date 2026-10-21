import { EmptyState, PageHeader, SectionCard, StatCard, arabicDate, money } from "@/components/accounting/ui";
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
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  FileText,
  Landmark,
  Layers,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Tag,
  Ticket,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

export default function CardInventoryPage() {
  const utils = trpc.useUtils();

  // Queries
  const summaryQuery = trpc.cardInventory.summary.useQuery();
  const contactsQuery = trpc.accounting.contacts.useQuery();
  const cashQuery = trpc.accounting.cashSummary.useQuery();
  const [selectedProfileFilter, setSelectedProfileFilter] = useState<number | undefined>(undefined);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");

  const movementsQuery = trpc.cardInventory.movements.useQuery({
    profileId: selectedProfileFilter,
    movementType: selectedTypeFilter,
    limit: 150,
  });

  // Modal Dialogs
  const [supplyDialogOpen, setSupplyDialogOpen] = useState(false);
  const [sellDialogOpen, setSellDialogOpen] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [newContactDialogOpen, setNewContactDialogOpen] = useState(false);
  const [viewInvoiceId, setViewInvoiceId] = useState<number | null>(null);

  // Forms State
  // 1. Supply Printed Stock Form
  const [supplyProfileId, setSupplyProfileId] = useState<string>("");
  const [supplyQuantity, setSupplyQuantity] = useState<string>("1000");
  const [supplyNotes, setSupplyNotes] = useState<string>("");
  const [supplyDate, setSupplyDate] = useState<string>(new Date().toISOString().slice(0, 10));

  // 2. Sell Cards Form
  const [sellContactId, setSellContactId] = useState<string>("");
  const [sellProfileId, setSellProfileId] = useState<string>("");
  const [sellQuantity, setSellQuantity] = useState<string>("50");
  const [sellCustomPrice, setSellCustomPrice] = useState<string>("");
  const [sellPaymentType, setSellPaymentType] = useState<"cash" | "credit">("credit");
  const [sellCashAccountId, setSellCashAccountId] = useState<string>("");
  const [sellDiscount, setSellDiscount] = useState<string>("0");
  const [sellNotes, setSellNotes] = useState<string>("");
  const [sellDate, setSellDate] = useState<string>(new Date().toISOString().slice(0, 10));

  // 3. Adjust Stock Form
  const [adjustProfileId, setAdjustProfileId] = useState<string>("");
  const [adjustNewStock, setAdjustNewStock] = useState<string>("");
  const [adjustReason, setAdjustReason] = useState<"adjustment" | "damaged">("adjustment");
  const [adjustNotes, setAdjustNotes] = useState<string>("");

  // 4. New/Edit Profile Form
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profilePrice, setProfilePrice] = useState("");
  const [profileTimeLimit, setProfileTimeLimit] = useState("");
  const [profileDataLimit, setProfileDataLimit] = useState("");
  const [profileNotes, setProfileNotes] = useState("");
  const [profileInitialStock, setProfileInitialStock] = useState("0");

  // 5. Quick New Grocery/Contact Form
  const [quickContactName, setQuickContactName] = useState("");
  const [quickContactPhone, setQuickContactPhone] = useState("");
  const [quickContactType, setQuickContactType] = useState<"grocery" | "customer">("grocery");

  // Invoice Document Query
  const invoiceDocQuery = trpc.accounting.invoiceDocument.useQuery(
    { invoiceId: viewInvoiceId ?? 0 },
    { enabled: viewInvoiceId !== null }
  );

  // Mutations
  const addStockMutation = trpc.cardInventory.addPrintedStock.useMutation({
    onSuccess: res => {
      utils.cardInventory.summary.invalidate();
      utils.cardInventory.movements.invalidate();
      setSupplyDialogOpen(false);
      toast.success(
        `تم بنجاح توريد ${res.movement.quantity} كرت إلى المخزن! الرصيد الحالي: ${res.newStock} كرت.`
      );
    },
    onError: err => toast.error(err.message),
  });

  const sellCardsMutation = trpc.cardInventory.sellCards.useMutation({
    onSuccess: res => {
      utils.cardInventory.summary.invalidate();
      utils.cardInventory.movements.invalidate();
      utils.accounting.invoices.invalidate();
      utils.accounting.openInvoices.invalidate();
      utils.accounting.cashSummary.invalidate();
      utils.accounting.dashboard.invalidate();
      setSellDialogOpen(false);
      toast.success(
        `تم إصدار الفاتورة ${res.invoiceNumber} وصرف ${res.movement.quantity} كرت! المتبقي بالمخزن: ${res.newStock} كرت.`
      );
      // Auto open invoice preview
      setViewInvoiceId(res.invoiceId);
    },
    onError: err => toast.error(err.message),
  });

  const adjustStockMutation = trpc.cardInventory.adjustStock.useMutation({
    onSuccess: res => {
      utils.cardInventory.summary.invalidate();
      utils.cardInventory.movements.invalidate();
      setAdjustDialogOpen(false);
      toast.success(`تم تحديث رصيد المخزن إلى ${res.newStock} كرت.`);
    },
    onError: err => toast.error(err.message),
  });

  const saveProfileMutation = trpc.cardInventory.saveProfile.useMutation({
    onSuccess: () => {
      utils.cardInventory.summary.invalidate();
      setProfileDialogOpen(false);
      toast.success("تم حفظ فئة الكروت بنجاح");
    },
    onError: err => toast.error(err.message),
  });

  const createContactMutation = trpc.accounting.createContact.useMutation({
    onSuccess: newContact => {
      utils.accounting.contacts.invalidate();
      setSellContactId(String(newContact.id));
      setNewContactDialogOpen(false);
      setQuickContactName("");
      setQuickContactPhone("");
      toast.success("تمت إضافة جهة الاتصال بنجاح واختيارها في الفاتورة.");
    },
    onError: err => toast.error(err.message),
  });

  // Selected profile helper for sell modal
  const selectedSellProfile = useMemo(() => {
    if (!sellProfileId) return null;
    return (summaryQuery.data?.profiles ?? []).find(p => p.id === Number(sellProfileId));
  }, [sellProfileId, summaryQuery.data?.profiles]);

  // Calculated sell preview
  const sellQuantityNum = Number(sellQuantity || 0);
  const sellUnitPriceNum = Number(sellCustomPrice || selectedSellProfile?.price || 0);
  const sellDiscountNum = Number(sellDiscount || 0);
  const sellTotalPreview = Math.max(0, sellQuantityNum * sellUnitPriceNum - sellDiscountNum);

  // Filtered movements
  const filteredMovements = useMemo(() => {
    return (movementsQuery.data ?? []).filter(m => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        m.movementNumber.toLowerCase().includes(q) ||
        (m.contactName && m.contactName.toLowerCase().includes(q)) ||
        (m.invoiceNumber && m.invoiceNumber.toLowerCase().includes(q)) ||
        (m.notes && m.notes.toLowerCase().includes(q))
      );
    });
  }, [movementsQuery.data, searchQuery]);

  // Handlers to open dialogs with preset
  function openSupplyDialog(profileId?: number) {
    if (profileId) {
      setSupplyProfileId(String(profileId));
    } else if (summaryQuery.data?.profiles?.[0]) {
      setSupplyProfileId(String(summaryQuery.data.profiles[0].id));
    }
    setSupplyQuantity("1000");
    setSupplyNotes("");
    setSupplyDate(new Date().toISOString().slice(0, 10));
    setSupplyDialogOpen(true);
  }

  function openSellDialog(profileId?: number) {
    const targetProfile = profileId
      ? (summaryQuery.data?.profiles ?? []).find(p => p.id === profileId)
      : summaryQuery.data?.profiles?.[0];

    if (targetProfile) {
      setSellProfileId(String(targetProfile.id));
      setSellCustomPrice(String(targetProfile.price));
    }
    setSellQuantity("50");
    setSellDiscount("0");
    setSellNotes("");
    setSellDate(new Date().toISOString().slice(0, 10));

    // Default cash account to first cash account
    if (cashQuery.data?.accounts?.[0]) {
      setSellCashAccountId(String(cashQuery.data.accounts[0].id));
    }

    setSellDialogOpen(true);
  }

  function openAdjustDialog(profile: any) {
    setAdjustProfileId(String(profile.id));
    setAdjustNewStock(String(profile.currentStock || 0));
    setAdjustReason("adjustment");
    setAdjustNotes("");
    setAdjustDialogOpen(true);
  }

  function openNewProfileDialog() {
    setEditingProfileId(null);
    setProfileName("");
    setProfilePrice("");
    setProfileTimeLimit("");
    setProfileDataLimit("");
    setProfileNotes("");
    setProfileInitialStock("0");
    setProfileDialogOpen(true);
  }

  function openEditProfileDialog(profile: any) {
    setEditingProfileId(profile.id);
    setProfileName(profile.name);
    setProfilePrice(String(profile.price));
    setProfileTimeLimit(profile.timeLimit || "");
    setProfileDataLimit(profile.dataLimitLabel || "");
    setProfileNotes(profile.notes || "");
    setProfileInitialStock(String(profile.currentStock || 0));
    setProfileDialogOpen(true);
  }

  // Form Submissions
  function handleSupplySubmit(e: FormEvent) {
    e.preventDefault();
    if (!supplyProfileId) {
      toast.error("يرجى اختيار فئة الكرت");
      return;
    }
    const q = Number(supplyQuantity);
    if (!q || q <= 0) {
      toast.error("يرجى إدخال كمية صحيحة أكبر من 0");
      return;
    }
    addStockMutation.mutate({
      profileId: Number(supplyProfileId),
      quantity: q,
      notes: supplyNotes || undefined,
      movementDate: new Date(`${supplyDate}T12:00:00`),
    });
  }

  function handleSellSubmit(e: FormEvent) {
    e.preventDefault();
    if (!sellContactId) {
      toast.error("يرجى اختيار البقالة أو العميل المستلم للكروت");
      return;
    }
    if (!sellProfileId) {
      toast.error("يرجى اختيار فئة الكرت");
      return;
    }
    const q = Number(sellQuantity);
    if (!q || q <= 0) {
      toast.error("يرجى إدخال كمية صالحة");
      return;
    }
    if (sellPaymentType === "cash" && !sellCashAccountId) {
      toast.error("يرجى اختيار الصندوق المستلم للمبلغ النقدي");
      return;
    }

    sellCardsMutation.mutate({
      profileId: Number(sellProfileId),
      contactId: Number(sellContactId),
      quantity: q,
      unitPrice: sellCustomPrice || undefined,
      paymentType: sellPaymentType,
      cashAccountId: sellPaymentType === "cash" ? Number(sellCashAccountId) : undefined,
      discountAmount: sellDiscount || "0",
      notes: sellNotes || undefined,
      issueDate: new Date(`${sellDate}T12:00:00`),
    });
  }

  function handleAdjustSubmit(e: FormEvent) {
    e.preventDefault();
    if (!adjustProfileId) return;
    const stock = Number(adjustNewStock);
    if (isNaN(stock) || stock < 0) {
      toast.error("يرجى إدخال رصيد صحيح (صفر أو أكثر)");
      return;
    }
    adjustStockMutation.mutate({
      profileId: Number(adjustProfileId),
      newStock: stock,
      reason: adjustReason,
      notes: adjustNotes || undefined,
    });
  }

  function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profileName.trim() || !profilePrice.trim()) {
      toast.error("يرجى إدخال اسم الفئة والسعر");
      return;
    }
    saveProfileMutation.mutate({
      id: editingProfileId || undefined,
      name: profileName,
      price: profilePrice,
      currencyCode: "YER",
      timeLimit: profileTimeLimit || undefined,
      dataLimitLabel: profileDataLimit || undefined,
      notes: profileNotes || undefined,
      initialStock: editingProfileId ? undefined : Number(profileInitialStock || 0),
    });
  }

  function handleQuickContactSubmit(e: FormEvent) {
    e.preventDefault();
    if (!quickContactName.trim()) {
      toast.error("يرجى إدخال اسم البقالة أو العميل");
      return;
    }
    createContactMutation.mutate({
      name: quickContactName.trim(),
      type: quickContactType,
      phone: quickContactPhone.trim() || undefined,
    });
  }

  const summary = summaryQuery.data;

  return (
    <div className="space-y-7">
      {/* Page Header with Action Buttons */}
      <PageHeader
        title="مخزن ومبيعات الكروت"
        description="تسجيل كميات الكروت المطبوعة يدوياً وتوزيعها على البقالات والعملاء بالفواتير الرسمية (نقداً تدخل الصندوق، أو آجلاً كمديونية دون التأثير على الصندوق) بدون الحاجة لربط الميكروتيك."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => openSupplyDialog()}
              className="h-11 bg-[#0a6372] px-5 font-bold hover:bg-[#084e5a] text-white shadow-sm"
            >
              <ArrowDownLeft className="ml-2 h-4 w-4" />
              توريد كروت مطبوعة
            </Button>
            <Button
              onClick={() => openSellDialog()}
              className="h-11 bg-[#b4882d] px-5 font-bold hover:bg-[#967123] text-white shadow-sm"
            >
              <ShoppingCart className="ml-2 h-4 w-4" />
              بيع كروت لبقالة أو عميل
            </Button>
            <Button
              variant="outline"
              onClick={openNewProfileDialog}
              className="h-11 border-[#bcd9d2] text-[#0a6372] hover:bg-[#eff8f5] font-bold"
            >
              <Plus className="ml-1 h-4 w-4" />
              إضافة فئة
            </Button>
          </div>
        }
      />

      {/* Top Statistics Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="إجمالي الكروت المتوفرة في المخزن"
          value={summaryQuery.isLoading ? "..." : `${(summary?.totalAvailableStock ?? 0).toLocaleString("ar-YE")} كرت`}
          caption="الرصيد الجاهز للبيع في درجك"
          icon={Ticket}
          tone="teal"
        />
        <StatCard
          label="القيمة التقديرية للمخزون"
          value={summaryQuery.isLoading ? "..." : money(summary?.totalStockValue ?? 0, "YER")}
          caption="قيمة الكروت المتوفرة بسعر البيع"
          icon={Landmark}
          tone="gold"
        />
        <StatCard
          label="مبيعات اليوم من الكروت"
          value={summaryQuery.isLoading ? "..." : `${(summary?.todaySalesCount ?? 0).toLocaleString("ar-YE")} كرت`}
          caption={`إيراد اليوم: ${money(summary?.todaySalesRevenue ?? 0, "YER")}`}
          icon={TrendingUp}
          tone="blue"
        />
        <StatCard
          label="فئات الكروت النشطة"
          value={summaryQuery.isLoading ? "..." : `${summary?.profilesCount ?? 0} فئات`}
          caption="فئات الكروت المسجلة بالنظام"
          icon={Boxes}
          tone="teal"
        />
      </div>

      {/* Section 1: Card Profiles & Stock Grid */}
      <SectionCard
        title="أرصدة فئات الكروت المطبوعة"
        subtitle="متابعة الرصيد المتبقي من كل فئة وإجراء عمليات التوريد أو البيع بضغطة زر واحدة."
      >
        <div className="p-5">
          {summaryQuery.isLoading ? (
            <div className="py-12 text-center text-slate-400">جارٍ تحميل أرصدة الفئات...</div>
          ) : !summary?.profiles?.length ? (
            <div className="text-center py-6">
              <EmptyState
                title="لا توجد فئات كروت مضافة بعد"
                description="أضف فئات الكروت (مثل كرت أبو 500، كرت أبو 1000) للبدء في توريدها وصرفها."
              />
              <Button onClick={openNewProfileDialog} className="mt-4 bg-[#0a6372] hover:bg-[#084e5a]">
                <Plus className="ml-2 h-4 w-4" /> إضافة أول فئة كروت
              </Button>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {summary.profiles.map(profile => {
                const stock = Number(profile.currentStock || 0);
                const isLowStock = stock <= 20;
                const isOutOfStock = stock === 0;

                return (
                  <div
                    key={profile.id}
                    className="relative overflow-hidden rounded-2xl border border-[#dce8e5] bg-[#fbfdfc] p-5 shadow-sm transition-all hover:border-[#0a6372]/40 hover:shadow-md"
                  >
                    {/* Header: Name and Price */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="inline-block rounded-lg bg-[#eff7f5] px-2.5 py-1 text-xs font-extrabold text-[#0a6372]">
                          فئة {money(profile.price, profile.currencyCode)}
                        </span>
                        <h3 className="mt-2 text-lg font-extrabold text-[#083f4c]">{profile.name}</h3>
                        {(profile.timeLimit || profile.dataLimitLabel) && (
                          <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                            {profile.timeLimit && <span>⏱️ {profile.timeLimit}</span>}
                            {profile.dataLimitLabel && <span>🌐 {profile.dataLimitLabel}</span>}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditProfileDialog(profile)}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-[#0a6372]"
                        title="تعديل الفئة"
                      >
                        <Tag className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Stock Counter */}
                    <div className="my-5 rounded-xl border border-[#e8f0ee] bg-white p-4 text-center">
                      <p className="text-xs font-bold text-slate-400">الرصيد المتبقي في المخزن</p>
                      <p
                        className={`mt-1 text-3xl font-black ${
                          isOutOfStock
                            ? "text-[#b9404a]"
                            : isLowStock
                            ? "text-[#b4882d]"
                            : "text-[#083f4c]"
                        }`}
                      >
                        {stock.toLocaleString("ar-YE")}
                        <span className="mr-1.5 text-sm font-bold text-slate-400">كرت</span>
                      </p>
                      {isOutOfStock ? (
                        <p className="mt-1 text-xs font-bold text-[#b9404a]">⚠️ نفد الرصيد، يرجى التوريد</p>
                      ) : isLowStock ? (
                        <p className="mt-1 text-xs font-bold text-[#b4882d]">⚠️ الرصيد منخفض</p>
                      ) : null}
                    </div>

                    {/* Statistics Badges */}
                    <div className="mb-4 grid grid-cols-2 gap-2 text-center text-xs">
                      <div className="rounded-lg bg-[#eff8f5] p-2">
                        <span className="text-slate-400">إجمالي المطبوع:</span>
                        <p className="font-extrabold text-[#0a6372]">
                          {(profile.totalPrinted || 0).toLocaleString("ar-YE")} كرت
                        </p>
                      </div>
                      <div className="rounded-lg bg-[#fffaf0] p-2">
                        <span className="text-slate-400">إجمالي المباع:</span>
                        <p className="font-extrabold text-[#967123]">
                          {(profile.totalSold || 0).toLocaleString("ar-YE")} كرت
                        </p>
                      </div>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#edf3f1]">
                      <Button
                        size="sm"
                        onClick={() => openSupplyDialog(profile.id)}
                        className="bg-[#0a6372] text-xs font-bold hover:bg-[#084e5a] text-white"
                      >
                        <ArrowDownLeft className="ml-1 h-3.5 w-3.5" />
                        توريد مطبوع
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => openSellDialog(profile.id)}
                        disabled={isOutOfStock}
                        className="bg-[#b4882d] text-xs font-bold hover:bg-[#967123] text-white"
                      >
                        <ShoppingCart className="ml-1 h-3.5 w-3.5" />
                        بيع وصرف
                      </Button>
                    </div>

                    <div className="mt-2 text-center">
                      <button
                        type="button"
                        onClick={() => openAdjustDialog(profile)}
                        className="text-[11px] text-slate-400 hover:text-slate-600 underline"
                      >
                        تسوية جردية للرصيد
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SectionCard>

      {/* Section 2: Movements Log & History */}
      <SectionCard
        title="سجل حركات مخزون الكروت"
        subtitle="جميع عمليات التوريد المطبوعة والمبيعات الصادرة للبقالات والعملاء موثقة بدقة مع الفواتير."
      >
        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e8f0ee] p-4">
          <div className="relative w-full max-w-xs">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-10 bg-[#fbfdfc] pr-9 text-xs"
              placeholder="ابحث برقم الحركة، العميل، أو الفاتورة..."
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedTypeFilter || ""}
              onChange={e => setSelectedTypeFilter(e.target.value || undefined)}
              className="h-10 rounded-xl border border-[#dce8e5] bg-[#fbfdfc] px-3 text-xs font-bold text-[#083f4c]"
            >
              <option value="">جميع أنواع الحركات</option>
              <option value="print_supply">📥 توريد مطبوع جديد فقط</option>
              <option value="sale_invoice">📤 مبيعات وصرف فقط</option>
              <option value="adjustment">⚙️ تسوية جردية</option>
            </select>

            <select
              value={selectedProfileFilter ? String(selectedProfileFilter) : ""}
              onChange={e => setSelectedProfileFilter(e.target.value ? Number(e.target.value) : undefined)}
              className="h-10 rounded-xl border border-[#dce8e5] bg-[#fbfdfc] px-3 text-xs font-bold text-[#083f4c]"
            >
              <option value="">جميع فئات الكروت</option>
              {(summary?.profiles ?? []).map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Movements Table */}
        {movementsQuery.isLoading ? (
          <div className="p-8 text-center text-slate-400">جارٍ تحميل الحركات...</div>
        ) : !filteredMovements.length ? (
          <EmptyState
            title="لا توجد حركات مسجلة"
            description="عندما تقوم بتوريد كروت مطبوعة أو بيع كروت للبقالات ستظهر تفاصيلها هنا."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-right">
              <thead className="bg-[#f8fcfb] text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-3">رقم الحركة</th>
                  <th className="px-5 py-3">التاريخ</th>
                  <th className="px-5 py-3">النوع</th>
                  <th className="px-5 py-3">البيان / العميل</th>
                  <th className="px-5 py-3">الكمية</th>
                  <th className="px-5 py-3">الإجمالي</th>
                  <th className="px-5 py-3">طريقة الدفع</th>
                  <th className="px-5 py-3">رقم الفاتورة</th>
                  <th className="px-5 py-3">الرصيد بعدها</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf3f1]">
                {filteredMovements.map(m => {
                  const isSupply = m.movementType === "print_supply";
                  const isSale = m.movementType === "sale_invoice";

                  return (
                    <tr key={m.id} className="hover:bg-[#fbfefd]">
                      <td className="px-5 py-4 font-extrabold text-[#0a6372] text-xs">
                        {m.movementNumber}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500">
                        {arabicDate(m.movementDate)}
                      </td>
                      <td className="px-5 py-4">
                        {isSupply ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#eff8f5] px-2.5 py-1 text-xs font-extrabold text-[#0a6372]">
                            <ArrowDownLeft className="h-3 w-3" /> توريد مطبوع
                          </span>
                        ) : isSale ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#fffaf0] px-2.5 py-1 text-xs font-extrabold text-[#967123]">
                            <ArrowUpRight className="h-3 w-3" /> مبيعات وصرف
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                            تسوية
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-bold text-[#083f4c] text-sm">
                          {m.contactName ? m.contactName : m.notes || "—"}
                        </p>
                        {m.contactName && m.notes && (
                          <p className="text-xs text-slate-400">{m.notes}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`font-black text-sm ${
                            isSupply ? "text-[#08735d]" : "text-[#b9404a]"
                          }`}
                        >
                          {isSupply ? `+${m.quantity}` : `-${m.quantity}`} كرت
                        </span>
                      </td>
                      <td className="px-5 py-4 font-bold text-[#083f4c] text-sm">
                        {Number(m.totalAmount) > 0 ? money(m.totalAmount, "YER") : "—"}
                      </td>
                      <td className="px-5 py-4">
                        {m.paymentType === "cash" ? (
                          <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-extrabold text-emerald-700">
                            💵 كاش (بالصندوق)
                          </span>
                        ) : m.paymentType === "credit" ? (
                          <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-extrabold text-amber-700">
                            📋 آجل (دين)
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs font-extrabold text-[#0a6372]">
                        {m.invoiceNumber ? m.invoiceNumber : "—"}
                      </td>
                      <td className="px-5 py-4 text-xs font-bold text-slate-500">
                        {m.balanceAfter} كرت
                      </td>
                      <td className="px-5 py-4">
                        {m.invoiceId && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setViewInvoiceId(m.invoiceId)}
                            className="h-8 border-[#bcd9d2] text-[#0a6372] hover:bg-[#eff8f5] text-xs font-bold"
                          >
                            <FileText className="ml-1 h-3.5 w-3.5" />
                            الفاتورة
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ======================================================== */}
      {/* MODAL 1: Supply Printed Cards Batch                      */}
      {/* ======================================================== */}
      <Dialog open={supplyDialogOpen} onOpenChange={setSupplyDialogOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-extrabold text-[#083f4c]">
              <ArrowDownLeft className="h-5 w-5 text-[#0a6372]" />
              توريد كروت مطبوعة للمخزن
            </DialogTitle>
            <DialogDescription>
              تسجيل كمية كروت مطبوعة جاهزة في المخزن لزيادة الرصيد المتاح للبيع.
            </DialogDescription>
          </DialogHeader>

          {/* Important Accounting Clarification Alert */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-xs text-emerald-900 leading-relaxed">
            <p className="font-extrabold flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              أمان ومحاسبة دقيقة 100%:
            </p>
            هذه العملية تزيد رصيد الكروت المطبوعة فقط، و<strong>لا تؤثر إطلاقاً على الصندوق المالي الرئيسي</strong> حتى يتم بيعها فعلياً.
          </div>

          <form onSubmit={handleSupplySubmit} className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label className="font-bold text-[#083f4c]">فئة الكروت المطبوعة</Label>
              <select
                required
                value={supplyProfileId}
                onChange={e => setSupplyProfileId(e.target.value)}
                className="w-full rounded-xl border border-[#dce8e5] bg-[#fbfdfc] px-3 py-2.5 text-sm font-bold text-[#083f4c]"
              >
                <option value="" disabled>اختر الفئة</option>
                {(summary?.profiles ?? []).map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — (الرصيد الحالي: {p.currentStock} كرت)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="font-bold text-[#083f4c]">الكمية المطبوعة (عدد الكروت)</Label>
                <Input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={supplyQuantity}
                  onChange={e => setSupplyQuantity(e.target.value)}
                  className="font-extrabold text-base"
                  placeholder="مثال: 1000"
                />
              </div>

              <div className="space-y-2">
                <Label className="font-bold text-[#083f4c]">تاريخ التوريد / الطباعة</Label>
                <Input
                  required
                  type="date"
                  value={supplyDate}
                  onChange={e => setSupplyDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-[#083f4c]">ملاحظات أو رقم الدفعة (اختياري)</Label>
              <Input
                value={supplyNotes}
                onChange={e => setSupplyNotes(e.target.value)}
                placeholder="مثال: طباعة مطبعة الأمل - دفعة رقم 1"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={() => setSupplyDialogOpen(false)}>
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={addStockMutation.isPending}
                className="bg-[#0a6372] hover:bg-[#084e5a] text-white font-bold"
              >
                {addStockMutation.isPending ? "جارٍ الحفظ..." : "تأكيد إضافة الكروت للمخزن"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* MODAL 2: Sell & Distribute Cards to Grocery/Client       */}
      {/* ======================================================== */}
      <Dialog open={sellDialogOpen} onOpenChange={setSellDialogOpen}>
        <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-extrabold text-[#083f4c]">
              <ShoppingCart className="h-5 w-5 text-[#b4882d]" />
              بيع وصرف كروت لبقالة أو عميل
            </DialogTitle>
            <DialogDescription>
              يتم خصم الكروت تلقائياً من المخزن، وإصدار فاتورة مبيعات معتمدة (نقدية أو آجلة).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSellSubmit} className="space-y-4 py-2">
            {/* Contact Selector with Quick Add */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-bold text-[#083f4c]">البقالة أو العميل المستلم</Label>
                <button
                  type="button"
                  onClick={() => setNewContactDialogOpen(true)}
                  className="flex items-center gap-1 text-xs font-bold text-[#0a6372] hover:underline"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  + إضافة بقالة جديدة
                </button>
              </div>
              <select
                required
                value={sellContactId}
                onChange={e => setSellContactId(e.target.value)}
                className="w-full rounded-xl border border-[#dce8e5] bg-[#fbfdfc] px-3 py-2.5 text-sm font-bold text-[#083f4c]"
              >
                <option value="">اختر البقالة أو العميل من القائمة</option>
                {(contactsQuery.data ?? [])
                  .filter(c => c.type === "grocery" || c.type === "customer")
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ""} — {c.type === "grocery" ? "بقالة" : "عميل"}
                    </option>
                  ))}
              </select>
            </div>

            {/* Profile & Current Stock Display */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="font-bold text-[#083f4c]">فئة الكرت</Label>
                <select
                  required
                  value={sellProfileId}
                  onChange={e => {
                    setSellProfileId(e.target.value);
                    const p = (summary?.profiles ?? []).find(x => x.id === Number(e.target.value));
                    if (p) setSellCustomPrice(String(p.price));
                  }}
                  className="w-full rounded-xl border border-[#dce8e5] bg-[#fbfdfc] px-3 py-2 text-sm font-bold text-[#083f4c]"
                >
                  <option value="" disabled>اختر الفئة</option>
                  {(summary?.profiles ?? []).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({money(p.price, p.currencyCode)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label className="font-bold text-[#083f4c]">الرصيد المتاح بالمخزن</Label>
                <div className="rounded-xl border border-[#dce8e5] bg-[#f8fcfb] px-3 py-2 text-sm font-extrabold text-[#0a6372]">
                  {selectedSellProfile
                    ? `${selectedSellProfile.currentStock} كرت متوفر`
                    : "—"}
                </div>
              </div>
            </div>

            {/* Quantity and Unit Price */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="font-bold text-[#083f4c]">الكمية المطلوبة (عدد الكروت)</Label>
                <Input
                  required
                  type="number"
                  min="1"
                  max={selectedSellProfile?.currentStock || 10000}
                  step="1"
                  value={sellQuantity}
                  onChange={e => setSellQuantity(e.target.value)}
                  className="font-extrabold text-base"
                />
              </div>

              <div className="space-y-2">
                <Label className="font-bold text-[#083f4c]">سعر بيع الكرت (ر.ي)</Label>
                <Input
                  required
                  type="number"
                  step="any"
                  value={sellCustomPrice}
                  onChange={e => setSellCustomPrice(e.target.value)}
                  placeholder="سعر الكرت"
                />
              </div>
            </div>

            {/* Payment Method Selector (Cash vs Credit) */}
            <div className="space-y-2">
              <Label className="font-bold text-[#083f4c]">طريقة الدفع ونوع الفاتورة</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSellPaymentType("cash")}
                  className={`flex flex-col items-center justify-center rounded-2xl border p-4 text-center transition-all ${
                    sellPaymentType === "cash"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-950 font-extrabold ring-2 ring-emerald-500/20"
                      : "border-[#dce8e5] bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Coins className="h-6 w-6 text-emerald-600 mb-1" />
                  <span className="text-sm font-black">💵 نقداً (كاش فوراً)</span>
                  <span className="mt-1 text-[11px] text-slate-500 font-normal">
                    يدخل المبلغ فوراً في الصندوق الرئيسي
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSellPaymentType("credit")}
                  className={`flex flex-col items-center justify-center rounded-2xl border p-4 text-center transition-all ${
                    sellPaymentType === "credit"
                      ? "border-amber-500 bg-amber-50 text-amber-950 font-extrabold ring-2 ring-amber-500/20"
                      : "border-[#dce8e5] bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <FileText className="h-6 w-6 text-amber-600 mb-1" />
                  <span className="text-sm font-black">📋 آجل (دين / عهدة)</span>
                  <span className="mt-1 text-[11px] text-slate-500 font-normal">
                    لا يتأثر الصندوق، وتُسجّل مديونية على البقالة
                  </span>
                </button>
              </div>
            </div>

            {/* Cash Account Selector (If Cash) */}
            {sellPaymentType === "cash" && (
              <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
                <Label className="font-bold text-emerald-950">الصندوق أو الحساب المستلم للمبلغ</Label>
                <select
                  required
                  value={sellCashAccountId}
                  onChange={e => setSellCashAccountId(e.target.value)}
                  className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-bold text-[#083f4c]"
                >
                  <option value="" disabled>اختر الصندوق</option>
                  {(cashQuery.data?.accounts ?? []).map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.type === "bank" ? "بنك: " : "صندوق: "} {acc.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Date and Discount */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="font-bold text-[#083f4c]">تاريخ الفاتورة</Label>
                <Input
                  required
                  type="date"
                  value={sellDate}
                  onChange={e => setSellDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label className="font-bold text-[#083f4c]">خصم إجمالي (اختياري)</Label>
                <Input
                  type="number"
                  min="0"
                  value={sellDiscount}
                  onChange={e => setSellDiscount(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Calculated Total Display */}
            <div className="rounded-2xl border border-[#dce8e5] bg-[#fbfdfc] p-4 text-center">
              <span className="text-xs font-bold text-slate-400">إجمالي قيمة الفاتورة</span>
              <p className="mt-1 text-2xl font-black text-[#083f4c]">
                {money(sellTotalPreview, "YER")}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                ({sellQuantityNum} كرت × {sellUnitPriceNum} ر.ي)
              </p>
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-[#083f4c]">ملاحظات الفاتورة</Label>
              <Input
                value={sellNotes}
                onChange={e => setSellNotes(e.target.value)}
                placeholder="ملاحظات اختيارية تظهر في الفاتورة"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={() => setSellDialogOpen(false)}>
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={sellCardsMutation.isPending || (selectedSellProfile?.currentStock ?? 0) < sellQuantityNum}
                className="bg-[#b4882d] hover:bg-[#967123] text-white font-bold"
              >
                {sellCardsMutation.isPending ? "جارٍ إصدار الفاتورة..." : "اعتماد وصرف الكروت"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* MODAL 3: Stock Adjustment                                */}
      {/* ======================================================== */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold text-[#083f4c]">
              تسوية جردية لرصيد الكروت
            </DialogTitle>
            <DialogDescription>
              تعديل الرصيد الفعلي الموجود في المخزن يدوياً عند وجود فروقات جرد أو تلف.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAdjustSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="font-bold text-[#083f4c]">الرصيد الفعلي الجديد</Label>
              <Input
                required
                type="number"
                min="0"
                value={adjustNewStock}
                onChange={e => setAdjustNewStock(e.target.value)}
                placeholder="أدخل عدد الكروت الفعلي"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-[#083f4c]">سبب التسوية</Label>
              <select
                value={adjustReason}
                onChange={e => setAdjustReason(e.target.value as any)}
                className="w-full rounded-xl border border-[#dce8e5] bg-[#fbfdfc] px-3 py-2 text-sm font-bold text-[#083f4c]"
              >
                <option value="adjustment">تسوية جردية (فارق عد)</option>
                <option value="damaged">كروت تالفة أو ملغية</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-[#083f4c]">ملاحظات وبيان التسوية</Label>
              <Input
                value={adjustNotes}
                onChange={e => setAdjustNotes(e.target.value)}
                placeholder="سبب التعديل بالتفصيل"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={() => setAdjustDialogOpen(false)}>
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={adjustStockMutation.isPending}
                className="bg-[#0a6372] hover:bg-[#084e5a] text-white font-bold"
              >
                {adjustStockMutation.isPending ? "جارٍ التعديل..." : "حفظ الرصيد الجديد"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* MODAL 4: Create or Edit Card Profile                     */}
      {/* ======================================================== */}
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold text-[#083f4c]">
              {editingProfileId ? "تعديل فئة الكروت" : "إضافة فئة كروت جديدة"}
            </DialogTitle>
            <DialogDescription>
              تحديد اسم الفئة والسعر الرسمي (مثل: فئة 500 ريال، فئة 1000 ريال).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleProfileSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="font-bold text-[#083f4c]">اسم الفئة</Label>
              <Input
                required
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                placeholder="مثال: كرت 500 ريال - 24 ساعة"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="font-bold text-[#083f4c]">سعر الكرت (ر.ي)</Label>
                <Input
                  required
                  type="number"
                  step="any"
                  value={profilePrice}
                  onChange={e => setProfilePrice(e.target.value)}
                  placeholder="500"
                />
              </div>

              {!editingProfileId && (
                <div className="space-y-2">
                  <Label className="font-bold text-[#083f4c]">الرصيد الابتدائي (كرت)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={profileInitialStock}
                    onChange={e => setProfileInitialStock(e.target.value)}
                    placeholder="0"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="font-bold text-[#083f4c]">مدة الصلاحية</Label>
                <Input
                  value={profileTimeLimit}
                  onChange={e => setProfileTimeLimit(e.target.value)}
                  placeholder="مثال: 24 ساعة"
                />
              </div>

              <div className="space-y-2">
                <Label className="font-bold text-[#083f4c]">حجم الرصيد</Label>
                <Input
                  value={profileDataLimit}
                  onChange={e => setProfileDataLimit(e.target.value)}
                  placeholder="مثال: 1.5 جيجابايت"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-[#083f4c]">ملاحظات</Label>
              <Input
                value={profileNotes}
                onChange={e => setProfileNotes(e.target.value)}
                placeholder="ملاحظات اختيارية"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={() => setProfileDialogOpen(false)}>
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={saveProfileMutation.isPending}
                className="bg-[#0a6372] hover:bg-[#084e5a] text-white font-bold"
              >
                {saveProfileMutation.isPending ? "جارٍ الحفظ..." : "حفظ الفئة"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* MODAL 5: Quick Add Contact/Grocery                      */}
      {/* ======================================================== */}
      <Dialog open={newContactDialogOpen} onOpenChange={setNewContactDialogOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold text-[#083f4c]">
              إضافة بقالة أو عميل جديد بسرعة
            </DialogTitle>
            <DialogDescription>
              أدخل اسم البقالة لتسجيل الكروت والفواتير عليها فوراً.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleQuickContactSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="font-bold text-[#083f4c]">اسم البقالة / العميل</Label>
              <Input
                required
                value={quickContactName}
                onChange={e => setQuickContactName(e.target.value)}
                placeholder="مثال: بقالة الأمل"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="font-bold text-[#083f4c]">نوع الحساب</Label>
                <select
                  value={quickContactType}
                  onChange={e => setQuickContactType(e.target.value as any)}
                  className="w-full rounded-xl border border-[#dce8e5] bg-[#fbfdfc] px-3 py-2 text-sm font-bold text-[#083f4c]"
                >
                  <option value="grocery">بقالة / نقطة بيع</option>
                  <option value="customer">عميل عادي</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label className="font-bold text-[#083f4c]">رقم الهاتف (اختياري)</Label>
                <Input
                  value={quickContactPhone}
                  onChange={e => setQuickContactPhone(e.target.value)}
                  placeholder="77xxxxxxx"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={() => setNewContactDialogOpen(false)}>
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={createContactMutation.isPending}
                className="bg-[#0a6372] hover:bg-[#084e5a] text-white font-bold"
              >
                {createContactMutation.isPending ? "جارٍ الإضافة..." : "إضافة واختيار"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* MODAL 6: View / Print Invoice Document                   */}
      {/* ======================================================== */}
      <Dialog open={viewInvoiceId !== null} onOpenChange={open => !open && setViewInvoiceId(null)}>
        <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold text-[#083f4c]">
              تفاصيل فاتورة مبيعات الكروت
            </DialogTitle>
          </DialogHeader>

          {invoiceDocQuery.isLoading ? (
            <div className="p-8 text-center text-slate-400">جارٍ تحميل الفاتورة...</div>
          ) : invoiceDocQuery.data ? (
            (() => {
              const inv = invoiceDocQuery.data.invoice;
              const contact = invoiceDocQuery.data.contact;
              const items = invoiceDocQuery.data.items;
              return (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[#dce8e5] bg-[#fbfdfc] p-5">
                    <div className="flex items-center justify-between border-b border-[#edf3f1] pb-3 mb-3">
                      <div>
                        <h4 className="text-xl font-extrabold text-[#0a6372]">
                          فاتورة رقم {inv.invoiceNumber}
                        </h4>
                        <p className="text-xs text-slate-500">
                          تاريخ الإصدار: {arabicDate(inv.issueDate)}
                        </p>
                      </div>
                      <span
                        className={`rounded-xl px-3 py-1 text-xs font-extrabold ${
                          inv.type === "cash"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {inv.type === "cash" ? "فاتورة نقدية (مسددة)" : "فاتورة آجلة (دين)"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-slate-400">اسم العميل:</span>
                        <p className="font-extrabold text-sm text-[#083f4c] mt-0.5">
                          {contact.name}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">الحساب المستلم:</span>
                        <p className="font-bold text-sm text-[#083f4c] mt-0.5">
                          {inv.type === "cash"
                            ? inv.cashAccountName || "صندوق الشبكة الرئيسي"
                            : "— لا يوجد (آجل على الحساب)"}
                        </p>
                      </div>
                    </div>

                    {/* Items */}
                    <div className="mt-4 rounded-xl border border-[#edf3f1] bg-white p-3">
                      <table className="w-full text-right text-xs">
                        <thead>
                          <tr className="text-slate-400 border-b border-[#edf3f1]">
                            <th className="pb-2">البيان</th>
                            <th className="pb-2">الكمية</th>
                            <th className="pb-2">سعر الكرت</th>
                            <th className="pb-2">الإجمالي</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#edf3f1]">
                          {items.map((item, idx) => (
                            <tr key={idx}>
                              <td className="py-2.5 font-bold text-[#083f4c]">{item.description}</td>
                              <td className="py-2.5">{item.quantity}</td>
                              <td className="py-2.5">{money(item.unitPrice, inv.currencyCode)}</td>
                              <td className="py-2.5 font-bold text-[#083f4c]">
                                {money(item.totalAmount, inv.currencyCode)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="mt-3 flex justify-between border-t border-[#edf3f1] pt-3 text-sm">
                        <span className="font-bold text-slate-500">إجمالي الفاتورة:</span>
                        <span className="font-black text-[#083f4c] text-base">
                          {money(inv.totalAmount, inv.currencyCode)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => window.print()}
                      className="border-[#bcd9d2] text-[#0a6372] hover:bg-[#eff8f5]"
                    >
                      <Printer className="ml-1 h-4 w-4" />
                      طباعة الفاتورة
                    </Button>
                    <Button onClick={() => setViewInvoiceId(null)}>إغلاق</Button>
                  </div>
                </div>
              );
            })()
          ) : (
            <p className="p-8 text-center text-sm text-slate-500">تعذر تحميل بيانات الفاتورة.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
