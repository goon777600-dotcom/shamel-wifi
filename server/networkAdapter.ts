/**
 * عقد تكامل شبكي مع موجّه MikroTik ومزودات الشبكة.
 */
import { getDefaultRouter } from "./wifiCards";
import { RouterosClient } from "./mikrotik/routerosClient";

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
 * محول آمن افتراضي في حال عدم وجود موجّه مفعّل.
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

/**
 * محول MikroTik الفعلي لتنفيذ الأوامر على الميكروتك (User Manager أو Hotspot)
 */
export class MikrotikNetworkAdapter implements NetworkDeviceAdapter {
  readonly provider = "mikrotik";

  async execute(command: NetworkSubscriberCommand): Promise<NetworkCommandResult> {
    const router = await getDefaultRouter();
    if (!router || router.status !== "online") {
      return {
        accepted: false,
        message: `تعذر تنفيذ إجراء ${command.action}: موجّه MikroTik غير متصل أو غير مهيأ.`,
      };
    }

    const client = new RouterosClient({
      host: router.host,
      port: router.apiPort,
      user: router.username,
      password: router.password || "",
      useTls: router.useTls,
      timeoutMs: 5000,
    });

    try {
      await client.connect();

      if (command.action === "suspend" || command.action === "disable") {
        // Disable user in User Manager or Hotspot
        if (router.mode === "usermanager_v6") {
          await client.runCommand("/tool/user-manager/user/set", {
            numbers: command.customerName,
            disabled: "yes",
          });
        } else if (router.mode === "usermanager_v7") {
          await client.runCommand("/user-manager/user/set", {
            numbers: command.customerName,
            disabled: "yes",
          });
        } else {
          await client.runCommand("/ip/hotspot/user/set", {
            numbers: command.customerName,
            disabled: "yes",
          });
        }
      } else if (command.action === "activate") {
        if (router.mode === "usermanager_v6") {
          await client.runCommand("/tool/user-manager/user/set", {
            numbers: command.customerName,
            disabled: "no",
          });
        } else if (router.mode === "usermanager_v7") {
          await client.runCommand("/user-manager/user/set", {
            numbers: command.customerName,
            disabled: "no",
          });
        } else {
          await client.runCommand("/ip/hotspot/user/set", {
            numbers: command.customerName,
            disabled: "no",
          });
        }
      }

      client.destroy();
      return {
        accepted: true,
        message: `تم تنفيذ إجراء ${command.action} بنجاح على الميكروتك للمشترك ${command.customerName}`,
      };
    } catch (err: any) {
      client.destroy();
      return {
        accepted: false,
        message: `فشل تنفيذ الإجراء على الميكروتك: ${err.message}`,
      };
    }
  }
}
