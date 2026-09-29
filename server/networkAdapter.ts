/**
 * عقد تكامل شبكي مستقبلي.
 * لا تنفذ النسخة الحالية أي اتصال بموجّه أو MikroTik؛ يبقى هذا العقد
 * حاجزاً واضحاً بين بيانات الاشتراكات والاتصال الفعلي بجهاز الشبكة.
 */
export type NetworkSubscriberCommand = {
  subscriptionId: number;
  customerName: string;
  packageName: string;
  action: "activate" | "suspend" | "disable";
  effectiveAt: Date;
};

export type NetworkCommandResult = {
  accepted: boolean;
  externalReference?: string;
  message: string;
};

export interface NetworkDeviceAdapter {
  readonly provider: string;
  execute(command: NetworkSubscriberCommand): Promise<NetworkCommandResult>;
}

/**
 * محول آمن افتراضي يمنع أي طلب من مغادرة النظام قبل تهيئة مزود شبكة فعلي
 * ومراجعة المالك لسياسة التفعيل والفصل.
 */
export class DisabledNetworkAdapter implements NetworkDeviceAdapter {
  readonly provider = "disabled";

  async execute(command: NetworkSubscriberCommand): Promise<NetworkCommandResult> {
    return {
      accepted: false,
      message: `لم يُنفذ إجراء ${command.action} للاشتراك ${command.subscriptionId}: ربط جهاز الشبكة غير مفعّل.`,
    };
  }
}
