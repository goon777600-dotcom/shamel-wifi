import net from "net";
import tls from "tls";
import crypto from "crypto";

export interface RouterosConfig {
  host: string;
  port?: number;
  user: string;
  password?: string;
  useTls?: boolean;
  timeoutMs?: number;
}

export interface RouterInfo {
  identity: string;
  version: string;
  boardName: string;
  uptime: string;
  cpuLoad?: string;
  freeMemoryMb?: number;
  totalMemoryMb?: number;
}

export interface UserManagerProfile {
  id?: string;
  name: string;
  validity?: string;
  price?: string;
  owner?: string;
}

export interface HotspotProfile {
  id?: string;
  name: string;
  sharedUsers?: string;
  rateLimit?: string;
}

export interface CardGenerationItem {
  username: string;
  password?: string;
  profileName?: string;
  timeLimit?: string;
  dataLimitBytes?: number;
  comment?: string;
  price?: number;
}

export class RouterosClient {
  private socket: net.Socket | tls.TLSSocket | null = null;
  private connected = false;
  private buffer = Buffer.alloc(0);
  private currentSentence: string[] = [];
  private sentenceQueue: string[][] = [];
  private pendingResolves: Array<(sentences: string[][]) => void> = [];
  private pendingRejects: Array<(error: Error) => void> = [];
  private isProcessing = false;

  constructor(private config: RouterosConfig) {}

  /**
   * Connect and authenticate to MikroTik RouterOS
   */
  async connect(): Promise<void> {
    const port = this.config.port || (this.config.useTls ? 8729 : 8728);
    const timeout = this.config.timeoutMs || 8000;

    await new Promise<void>((resolve, reject) => {
      let isSettled = false;

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          this.destroy();
          reject(
            new Error(
              `تعذر الاتصال بالميكروتك: انتهت مهلة الاتصال (${timeout / 1000} ثوانٍ) على ${this.config.host}:${port}. تأكد من صحة العنوان وتشغيل الجهاز.`
            )
          );
        }
      }, timeout);

      const onError = (err: any) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          this.destroy();
          if (err.code === "ECONNREFUSED") {
            reject(
              new Error(
                `تم رفض الاتصال (ECONNREFUSED) بالموجّه ${this.config.host} على المنفذ ${port}.\n` +
                  `السبب الأكثر شيوعاً: خدمة API غير مفعلة في الميكروتك.\n` +
                  `الحل: افتح WinBox ثم Terminal ونفّذ الأمر:\n/ip service enable api\nأو فعّل خدمة api من قائمة IP -> Services.`
              )
            );
          } else if (err.code === "ETIMEDOUT" || err.code === "EHOSTUNREACH") {
            reject(
              new Error(
                `لا يمكن الوصول إلى الموجّه ${this.config.host} (${err.code}). تأكد من أن جهازك متصل بنفس شبكة الميكروتك أو أن الآي بي صحيح.`
              )
            );
          } else {
            reject(new Error(`فشل الاتصال بالموجّه (${err.code || err.message}): ${err.message}`));
          }
        }
      };

      try {
        if (this.config.useTls) {
          this.socket = tls.connect(
            {
              host: this.config.host,
              port,
              rejectUnauthorized: false,
              timeout,
            },
            () => {
              if (!isSettled) {
                isSettled = true;
                clearTimeout(timer);
                this.connected = true;
                this.setupDataHandler();
                resolve();
              }
            }
          );
        } else {
          this.socket = net.connect(
            {
              host: this.config.host,
              port,
              timeout,
            },
            () => {
              if (!isSettled) {
                isSettled = true;
                clearTimeout(timer);
                this.connected = true;
                this.setupDataHandler();
                resolve();
              }
            }
          );
        }

        this.socket.on("error", onError);
      } catch (err: any) {
        onError(err);
      }
    });

    // Login process
    await this.login();
  }

  private setupDataHandler(): void {
    if (!this.socket) return;

    this.socket.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.processBuffer();
    });

    this.socket.on("close", () => {
      this.connected = false;
      const reject = this.pendingRejects.shift();
      if (reject) {
        reject(new Error("تم قطع الاتصال بالموجّه بشكل غير متوقع."));
      }
    });
  }

  private processBuffer(): void {
    while (this.buffer.length > 0) {
      const lenResult = this.decodeLength(this.buffer);
      if (lenResult === null) break;

      const { length, offset } = lenResult;
      if (this.buffer.length < offset + length) {
        // Incomplete word, wait for more data
        break;
      }

      if (length === 0) {
        // End of sentence
        this.sentenceQueue.push(this.currentSentence);
        this.currentSentence = [];
        this.buffer = this.buffer.subarray(offset);

        // Check if last sentence ends a command (!done, !trap)
        const lastSentence = this.sentenceQueue[this.sentenceQueue.length - 1];
        const sentenceType = lastSentence?.[0];
        if (sentenceType === "!done" || sentenceType === "!trap" || sentenceType === "!fatal") {
          const sentences = this.sentenceQueue;
          this.sentenceQueue = [];

          if (sentenceType === "!trap" || sentenceType === "!fatal") {
            const trapMsg = this.extractAttribute(lastSentence, "message") || "خطأ غير محدد من الميكروتك";
            const reject = this.pendingRejects.shift();
            this.pendingResolves.shift();
            if (reject) reject(new Error(trapMsg));
          } else {
            const resolve = this.pendingResolves.shift();
            this.pendingRejects.shift();
            if (resolve) resolve(sentences);
          }
        }
      } else {
        const wordBuf = this.buffer.subarray(offset, offset + length);
        const word = wordBuf.toString("utf8");
        this.currentSentence.push(word);
        this.buffer = this.buffer.subarray(offset + length);
      }
    }
  }

  private decodeLength(buf: Buffer): { length: number; offset: number } | null {
    if (buf.length === 0) return null;
    const b1 = buf[0];

    if ((b1 & 0x80) === 0) {
      return { length: b1, offset: 1 };
    } else if ((b1 & 0xc0) === 0x80) {
      if (buf.length < 2) return null;
      return { length: ((b1 & 0x3f) << 8) | buf[1], offset: 2 };
    } else if ((b1 & 0xe0) === 0xc0) {
      if (buf.length < 3) return null;
      return { length: ((b1 & 0x1f) << 16) | (buf[1] << 8) | buf[2], offset: 3 };
    } else if ((b1 & 0xf0) === 0xe0) {
      if (buf.length < 4) return null;
      return { length: ((b1 & 0x0f) << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3], offset: 4 };
    } else if (b1 === 0xf0) {
      if (buf.length < 5) return null;
      return { length: (buf[1] << 24) | (buf[2] << 16) | (buf[3] << 8) | buf[4], offset: 5 };
    }
    return null;
  }

  private encodeLength(len: number): Buffer {
    if (len < 0x80) {
      return Buffer.from([len]);
    } else if (len < 0x4000) {
      return Buffer.from([(len >> 8) | 0x80, len & 0xff]);
    } else if (len < 0x200000) {
      return Buffer.from([(len >> 16) | 0xc0, (len >> 8) & 0xff, len & 0xff]);
    } else if (len < 0x10000000) {
      return Buffer.from([(len >> 24) | 0xe0, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
    } else {
      return Buffer.from([0xf0, (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
    }
  }

  private sendSentence(words: string[]): Promise<string[][]> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        return reject(new Error("الموجّه غير متصل حالياً"));
      }

      this.pendingResolves.push(resolve);
      this.pendingRejects.push(reject);

      const buffers: Buffer[] = [];
      for (const word of words) {
        const wordBuf = Buffer.from(word, "utf8");
        buffers.push(this.encodeLength(wordBuf.length));
        buffers.push(wordBuf);
      }
      buffers.push(Buffer.from([0])); // End of sentence

      this.socket.write(Buffer.concat(buffers));
    });
  }

  private async login(): Promise<void> {
    const user = this.config.user;
    const password = this.config.password || "";

    // Step 1: Attempt modern login (post-RouterOS 6.43)
    try {
      const resp = await this.sendSentence(["/login", `=name=${user}`, `=password=${password}`]);
      const doneSentence = resp.find(s => s[0] === "!done");
      const retChallenge = this.extractAttribute(doneSentence, "ret");

      if (!retChallenge) {
        // Logged in successfully directly!
        return;
      }

      // Step 2: Legacy MD5 challenge response (RouterOS < 6.43 or specific challenge response)
      const challengeBuf = Buffer.from(retChallenge, "hex");
      const md5 = crypto.createHash("md5");
      md5.update(Buffer.from([0]));
      md5.update(Buffer.from(password, "utf8"));
      md5.update(challengeBuf);
      const hexHash = md5.digest("hex");

      await this.sendSentence(["/login", `=name=${user}`, `=response=00${hexHash}`]);
    } catch (err: any) {
      throw new Error(`فشل تسجيل الدخول إلى الميكروتك: ${err.message}. تحقق من اسم المستخدم وكلمة المرور.`);
    }
  }

  private extractAttribute(sentence: string[] | undefined, name: string): string | undefined {
    if (!sentence) return undefined;
    const prefix = `=${name}=`;
    for (const word of sentence) {
      if (word.startsWith(prefix)) {
        return word.slice(prefix.length);
      }
    }
    return undefined;
  }

  private parseRecords(sentences: string[][]): Record<string, string>[] {
    const records: Record<string, string>[] = [];
    for (const s of sentences) {
      if (s[0] === "!re") {
        const item: Record<string, string> = {};
        for (let i = 1; i < s.length; i++) {
          const w = s[i];
          if (w.startsWith("=")) {
            const eqIdx = w.indexOf("=", 1);
            if (eqIdx !== -1) {
              const k = w.slice(1, eqIdx);
              const v = w.slice(eqIdx + 1);
              item[k] = v;
            }
          }
        }
        records.push(item);
      }
    }
    return records;
  }

  /**
   * Execute arbitrary RouterOS command and return attributes
   */
  async runCommand(command: string, params: Record<string, string> = {}): Promise<Record<string, string>[]> {
    const words = [command];
    for (const [k, v] of Object.entries(params)) {
      words.push(`=${k}=${v}`);
    }
    const resp = await this.sendSentence(words);
    return this.parseRecords(resp);
  }

  /**
   * Fetch router identity and resource statistics
   */
  async getSystemInfo(): Promise<RouterInfo> {
    const idResp = await this.runCommand("/system/identity/print");
    const resResp = await this.runCommand("/system/resource/print");

    const identity = idResp[0]?.["name"] || "MikroTik";
    const res = resResp[0] || {};

    const freeBytes = parseInt(res["free-memory"] || "0", 10);
    const totalBytes = parseInt(res["total-memory"] || "0", 10);

    return {
      identity,
      version: res["version"] || "Unknown",
      boardName: res["board-name"] || res["platform"] || "RouterBOARD",
      uptime: res["uptime"] || "Unknown",
      cpuLoad: res["cpu-load"] ? `${res["cpu-load"]}%` : undefined,
      freeMemoryMb: freeBytes ? Math.round(freeBytes / (1024 * 1024)) : undefined,
      totalMemoryMb: totalBytes ? Math.round(totalBytes / (1024 * 1024)) : undefined,
    };
  }

  /**
   * Get User Manager profiles (RouterOS v6 or v7)
   */
  async getUserManagerProfiles(): Promise<{ mode: "v6" | "v7"; profiles: UserManagerProfile[] }> {
    // Try v6 first (/tool/user-manager/profile/print)
    try {
      const records = await this.runCommand("/tool/user-manager/profile/print");
      const profiles = records.map(r => ({
        id: r[".id"],
        name: r["name"] || "",
        validity: r["validity"],
        price: r["price"],
        owner: r["owner"],
      }));
      return { mode: "v6", profiles };
    } catch {
      // Try v7 (/user-manager/profile/print)
      try {
        const records = await this.runCommand("/user-manager/profile/print");
        const profiles = records.map(r => ({
          id: r[".id"],
          name: r["name"] || "",
          validity: r["validity"],
          price: r["price"],
          owner: r["owner"],
        }));
        return { mode: "v7", profiles };
      } catch (err: any) {
        throw new Error("لم يتم العثور على حزمة User Manager في الميكروتك (أو غير مثبتة)");
      }
    }
  }

  /**
   * Get Hotspot User Profiles (/ip/hotspot/user/profile/print)
   */
  async getHotspotProfiles(): Promise<HotspotProfile[]> {
    const records = await this.runCommand("/ip/hotspot/user/profile/print");
    return records.map(r => ({
      id: r[".id"],
      name: r["name"] || "",
      sharedUsers: r["shared-users"],
      rateLimit: r["rate-limit"],
    }));
  }

  /**
   * Add a single card to User Manager (v6 or v7)
   */
  async addUserManagerCard(
    mode: "v6" | "v7",
    card: CardGenerationItem,
    customer: string = "admin"
  ): Promise<{ success: boolean; message?: string }> {
    const password = card.password !== undefined ? card.password : card.username;

    if (mode === "v6") {
      // v6: /tool/user-manager/user/add
      const params: Record<string, string> = {
        customer,
        username: card.username,
        password,
        "shared-users": "1",
      };
      if (card.comment) params["comment"] = card.comment;

      await this.runCommand("/tool/user-manager/user/add", params);

      // If a profile is specified, activate it
      if (card.profileName) {
        try {
          await this.runCommand("/tool/user-manager/user/create-and-activate-profile", {
            customer,
            numbers: card.username,
            profile: card.profileName,
          });
        } catch (e: any) {
          // Fallback or record error
          console.warn("Could not activate profile for user:", e.message);
        }
      }
      return { success: true };
    } else {
      // v7: /user-manager/user/add
      const params: Record<string, string> = {
        name: card.username,
        password,
      };
      if (card.profileName) params["group"] = card.profileName;
      if (card.comment) params["comment"] = card.comment;

      await this.runCommand("/user-manager/user/add", params);
      return { success: true };
    }
  }

  /**
   * Add a single card to Hotspot Users (/ip/hotspot/user/add)
   */
  async addHotspotCard(card: CardGenerationItem): Promise<{ success: boolean; message?: string }> {
    const password = card.password !== undefined ? card.password : card.username;
    const params: Record<string, string> = {
      name: card.username,
      password,
    };

    if (card.profileName) params["profile"] = card.profileName;
    if (card.timeLimit) params["limit-uptime"] = card.timeLimit;
    if (card.dataLimitBytes) params["limit-bytes-total"] = card.dataLimitBytes.toString();
    if (card.comment) params["comment"] = card.comment;

    await this.runCommand("/ip/hotspot/user/add", params);
    return { success: true };
  }

  /**
   * Check if User Manager is available
   */
  async checkUserManagerAvailable(): Promise<{ available: boolean; mode?: "v6" | "v7" }> {
    try {
      await this.runCommand("/tool/user-manager/user/print", { count: "1" });
      return { available: true, mode: "v6" };
    } catch {
      try {
        await this.runCommand("/user-manager/user/print", { count: "1" });
        return { available: true, mode: "v7" };
      } catch {
        return { available: false };
      }
    }
  }

  /**
   * Gracefully close connection
   */
  destroy(): void {
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch {}
      this.socket = null;
    }
    this.connected = false;
  }
}
