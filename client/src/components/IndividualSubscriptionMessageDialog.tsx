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
import {
  individualSubscriptionFinancialWhatsAppMessage,
  individualSubscriptionReminderWhatsAppMessage,
  individualSubscriptionStatementWhatsAppMessage,
  individualSubscriptionWhatsAppMessage,
  whatsappUrl,
} from "@/lib/whatsapp";
import { Check, Copy, MessageCircle, Send, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export type MessagePresetKey =
  | "charge_added"
  | "payment_received"
  | "reminder"
  | "statement_summary"
  | "subscription_created"
  | "custom";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: {
    id: number;
    name: string;
    phone: string | null;
  };
  contextDetails?: {
    action?: MessagePresetKey;
    description?: string;
    amount?: string;
    currencyCode?: string;
    dueAmount?: string;
    subscriptionName?: string;
    totalCharges?: string;
    totalPaid?: string;
    totalDiscount?: string;
  };
  whatsappTemplate?: string | null;
}

export function IndividualSubscriptionMessageDialog({
  open,
  onOpenChange,
  account,
  contextDetails,
  whatsappTemplate,
}: Props) {
  const [selectedPreset, setSelectedPreset] = useState<MessagePresetKey>(
    contextDetails?.action || "reminder"
  );
  const [messageText, setMessageText] = useState("");
  const [phone, setPhone] = useState(account.phone || "");
  const [copied, setCopied] = useState(false);

  // Sync phone when account changes
  useEffect(() => {
    setPhone(account.phone || "");
  }, [account.phone]);

  // Generate message text according to preset
  function generatePresetText(preset: MessagePresetKey): string {
    const currency = contextDetails?.currencyCode || "YER";
    const amount = contextDetails?.amount || "0.00";
    const due = contextDetails?.dueAmount || "0.00";
    const service = contextDetails?.description || contextDetails?.subscriptionName || "اشتراك إنترنت";

    switch (preset) {
      case "charge_added":
        return `عميلنا الكريم ${account.name}،\nتم تسجيل اشتراك (${service}) بمبلغ: ${amount} ${currency}.\nإجمالي الرصيد المستحق على حسابكم: ${due} ${currency}.\nشاكرين لكم حسن التعامل — الشامل لخدمات الإنترنت.`;

      case "payment_received":
        return `عميلنا الكريم ${account.name}،\nتم استلام دفعة بمبلغ: ${amount} ${currency} كسند قبض لحسابكم.\nالرصيد المتبقي: ${due} ${currency}.\nشكراً لثقتكم وتعاملكم معنا — الشامل لخدمات الإنترنت.`;

      case "reminder":
        return `عميلنا الكريم ${account.name}،\nنود إشعاركم بأن الرصيد المتبقي على حساب اشتراككم هو: ${due !== "0.00" ? due : amount} ${currency}.\nيرجى التكرم بالسداد في أقرب وقت. نسعد دائماً بخدمتكم — الشامل لخدمات الإنترنت.`;

      case "statement_summary":
        return `عميلنا الكريم ${account.name}،\nملخص كشف حساب اشتراك الإنترنت:\n- إجمالي الاشتراكات: ${contextDetails?.totalCharges || amount} ${currency}\n- إجمالي المسدد: ${contextDetails?.totalPaid || "0.00"} ${currency}\n- إجمالي الخصومات: ${contextDetails?.totalDiscount || "0.00"} ${currency}\n- الرصيد المتبقي المطلوب: ${due} ${currency}\nالشامل لخدمات الإنترنت — يافع الصعيد.`;

      case "subscription_created":
        return `عميلنا الكريم ${account.name}،\nتم فتح وتفعيل حساب الاشتراك بنجاح (${service}).\nنسعد دائماً بخدمتكم — الشامل لخدمات الإنترنت.`;

      case "custom":
        return `عميلنا الكريم ${account.name}،\nعندك ${due !== "0.00" ? `${due} ${currency}` : ""} مستحق لاشتراك الإنترنت لدى شبكة الشامل.\n\n`;

      default:
        return "";
    }
  }

  // Update text when dialog opens or context/preset changes
  useEffect(() => {
    if (open) {
      const initialKey = contextDetails?.action || "reminder";
      setSelectedPreset(initialKey);
      setMessageText(generatePresetText(initialKey));
    }
  }, [open, contextDetails]);

  function handleSelectPreset(key: MessagePresetKey) {
    setSelectedPreset(key);
    setMessageText(generatePresetText(key));
  }

  function handleCopy() {
    if (!messageText.trim()) return;
    navigator.clipboard.writeText(messageText);
    setCopied(true);
    toast.success("تم نسخ نص الرسالة إلى الحافظة");
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSendWhatsapp() {
    if (!messageText.trim()) {
      toast.error("يرجى كتابة نص الرسالة أولاً");
      return;
    }
    const targetPhone = phone.trim();
    if (!targetPhone) {
      toast.error("يرجى إدخال رقم هاتف المشترك مع الرمز أولاً");
      return;
    }
    const url = whatsappUrl(targetPhone, messageText);
    if (!url) {
      toast.error("رقم الهاتف غير صالح. يرجى التأكد من الرقم والرمز الدولي (مثال: 777000000 أو +967)");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[92vh] max-w-2xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="border-b border-slate-100 pb-3 text-right">
          <DialogTitle className="flex items-center gap-2 text-lg font-black text-[#083f4c]">
            <MessageCircle className="h-5 w-5 text-[#0a6372]" />
            مراسلة المشترك — {account.name}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            اختر نموذج الرسالة المناسب ثم عدّل على الكلام والأرقام بحرية قبل الإرسال.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Preset Choices */}
          <div>
            <Label className="mb-2 block text-xs font-bold text-slate-700">
              اختر نموذج الرسالة:
            </Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={selectedPreset === "charge_added" ? "default" : "outline"}
                onClick={() => handleSelectPreset("charge_added")}
                className={
                  selectedPreset === "charge_added"
                    ? "bg-[#0a6372] text-white"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }
              >
                إضافة اشتراك جديد
              </Button>
              <Button
                type="button"
                size="sm"
                variant={selectedPreset === "payment_received" ? "default" : "outline"}
                onClick={() => handleSelectPreset("payment_received")}
                className={
                  selectedPreset === "payment_received"
                    ? "bg-[#08735d] text-white"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }
              >
                سند قبض / سداد
              </Button>
              <Button
                type="button"
                size="sm"
                variant={selectedPreset === "reminder" ? "default" : "outline"}
                onClick={() => handleSelectPreset("reminder")}
                className={
                  selectedPreset === "reminder"
                    ? "bg-amber-600 text-white"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }
              >
                تذكير بالرصيد المستحق
              </Button>
              <Button
                type="button"
                size="sm"
                variant={selectedPreset === "statement_summary" ? "default" : "outline"}
                onClick={() => handleSelectPreset("statement_summary")}
                className={
                  selectedPreset === "statement_summary"
                    ? "bg-[#083f4c] text-white"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }
              >
                ملخص كشف الحساب
              </Button>
              <Button
                type="button"
                size="sm"
                variant={selectedPreset === "custom" ? "default" : "outline"}
                onClick={() => handleSelectPreset("custom")}
                className={
                  selectedPreset === "custom"
                    ? "bg-slate-800 text-white"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }
              >
                رسالة مخصصة
              </Button>
            </div>
          </div>

          {/* Editable Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-slate-700">
                نص الرسالة (يمكنك تعديل أي كلام أو أرقام هنا):
              </Label>
              <span className="text-[11px] text-slate-400">
                {messageText.length} حرف
              </span>
            </div>
            <Textarea
              rows={6}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="resize-y border-[#bcd9d2] bg-[#fbfdfc] text-sm leading-6 focus-visible:ring-[#0a6372]"
              placeholder="اكتب أو عدّل نص الرسالة..."
            />
          </div>

          {/* Target Phone */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">
              رقم الهاتف المستلم (واتساب):
            </Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="مثال: 777000000 أو 967777000000"
              className="border-[#cfe3dd] text-left"
              dir="ltr"
            />
            <p className="text-[11px] text-slate-400">
              يدعم أرقام اليمن (+967) والسعودية (+966) مباشرة.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-slate-100 pt-3 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleCopy}
            className="border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            {copied ? (
              <>
                <Check className="ml-1.5 h-4 w-4 text-emerald-600" />
                تم النسخ
              </>
            ) : (
              <>
                <Copy className="ml-1.5 h-4 w-4" />
                نسخ النص
              </>
            )}
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              إلغاء
            </Button>
            <Button
              type="button"
              onClick={handleSendWhatsapp}
              className="bg-[#25D366] font-extrabold text-white hover:bg-[#20ba59]"
            >
              <Send className="ml-1.5 h-4 w-4" />
              إرسال عبر واتساب
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
