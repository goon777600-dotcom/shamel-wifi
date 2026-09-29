export type IndividualSubscriptionExportStatus = "active" | "suspended" | "cancelled";
export type IndividualSubscriptionAccountExportStatus = "active" | "suspended" | "closed";

export type IndividualSubscriptionExportAccount = {
  id: number;
  name: string;
  phone: string | null;
  status: IndividualSubscriptionAccountExportStatus;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  outstandingByCurrency?: Array<{ currencyCode: string; amount: string }>;
  subscriptions: Array<{
    id: number;
    name: string;
    status: IndividualSubscriptionExportStatus;
    notes: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
  }>;
};

export type IndividualSubscriptionFilters = {
  search: string;
  accountStatus: "all" | IndividualSubscriptionAccountExportStatus;
  subscriptionStatus: "all" | IndividualSubscriptionExportStatus | "without_subscription";
};

type ExportValue = string | number | null;
type ExportRow = Record<string, ExportValue>;

const encoder = new TextEncoder();
const accountStatusLabel: Record<IndividualSubscriptionAccountExportStatus, string> = { active: "نشط", suspended: "موقوف", closed: "مغلق" };
const subscriptionStatusLabel: Record<IndividualSubscriptionExportStatus, string> = { active: "فعّال", suspended: "موقوف", cancelled: "ملغي" };

function arabicDate(value: Date | string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ar-YE");
}

function xmlEscape(value: ExportValue) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function columnName(index: number) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value: number) {
  const result = new Uint8Array(2);
  new DataView(result.buffer).setUint16(0, value, true);
  return result;
}

function uint32(value: number) {
  const result = new Uint8Array(4);
  new DataView(result.buffer).setUint32(0, value, true);
  return result;
}

function joinBytes(parts: Uint8Array[]) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function createZip(entries: Array<{ name: string; content: string }>) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.content);
    const checksum = crc32(data);
    const localHeader = joinBytes([uint32(0x04034b50), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0), uint32(checksum), uint32(data.length), uint32(data.length), uint16(name.length), uint16(0), name, data]);
    localParts.push(localHeader);
    centralParts.push(joinBytes([uint32(0x02014b50), uint16(20), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0), uint32(checksum), uint32(data.length), uint32(data.length), uint16(name.length), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(offset), name]));
    offset += localHeader.length;
  }
  const centralDirectory = joinBytes(centralParts);
  const end = joinBytes([uint32(0x06054b50), uint16(0), uint16(0), uint16(entries.length), uint16(entries.length), uint32(centralDirectory.length), uint32(offset), uint16(0)]);
  return joinBytes([...localParts, centralDirectory, end]);
}

export function filterIndividualSubscriptionAccounts(
  accounts: IndividualSubscriptionExportAccount[],
  filters: IndividualSubscriptionFilters,
) {
  const term = filters.search.trim().toLowerCase();
  return accounts.filter(account => {
    const matchesSearch = !term || `${account.name} ${account.phone ?? ""} ${account.subscriptions.map(subscription => subscription.name).join(" ")}`.toLowerCase().includes(term);
    const matchesAccountStatus = filters.accountStatus === "all" || account.status === filters.accountStatus;
    const matchesSubscriptionStatus =
      filters.subscriptionStatus === "all" ||
      (filters.subscriptionStatus === "without_subscription" ? account.subscriptions.length === 0 : account.subscriptions.some(subscription => subscription.status === filters.subscriptionStatus));
    return matchesSearch && matchesAccountStatus && matchesSubscriptionStatus;
  });
}

export function buildIndividualSubscriptionExportRows(accounts: IndividualSubscriptionExportAccount[]) {
  return accounts.flatMap<ExportRow>(account => {
    const base = {
      "رقم الحساب": account.id,
      "اسم المشترك": account.name,
      "رقم واتساب": account.phone ?? "",
      "حالة الحساب": accountStatusLabel[account.status],
      "ملاحظات الحساب": account.notes ?? "",
      "تاريخ فتح الحساب": arabicDate(account.createdAt),
      "آخر تحديث للحساب": arabicDate(account.updatedAt),
    };
    if (!account.subscriptions.length) return [{ ...base, "رقم سجل الاشتراك": null, "اسم الخدمة أو الاشتراك": "", "حالة الاشتراك": "لا يوجد اشتراك", "ملاحظات الاشتراك": "", "تاريخ إضافة الاشتراك": "", "آخر تحديث للاشتراك": "" }];
    return account.subscriptions.map(subscription => ({
      ...base,
      "رقم سجل الاشتراك": subscription.id,
      "اسم الخدمة أو الاشتراك": subscription.name,
      "حالة الاشتراك": subscriptionStatusLabel[subscription.status],
      "ملاحظات الاشتراك": subscription.notes ?? "",
      "تاريخ إضافة الاشتراك": arabicDate(subscription.createdAt),
      "آخر تحديث للاشتراك": arabicDate(subscription.updatedAt),
    }));
  });
}

function createWorksheetXml(rows: ExportRow[], headers = ["رقم الحساب", "اسم المشترك", "رقم واتساب", "حالة الحساب", "ملاحظات الحساب", "تاريخ فتح الحساب", "آخر تحديث للحساب", "رقم سجل الاشتراك", "اسم الخدمة أو الاشتراك", "حالة الاشتراك", "ملاحظات الاشتراك", "تاريخ إضافة الاشتراك", "آخر تحديث للاشتراك"], widths = [12, 24, 20, 14, 30, 17, 17, 15, 26, 16, 30, 18, 18]) {
  const records: Array<ExportValue[]> = [headers, ...rows.map(row => headers.map(header => row[header] ?? ""))];
  const sheetRows = records.map((record, rowIndex) => `<row r="${rowIndex + 1}">${record.map((value, columnIndex) => `<c r="${columnName(columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`).join("")}</row>`).join("");
  const columns = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews><cols>${columns}</cols><sheetData>${sheetRows}</sheetData></worksheet>`;
}

function createSingleSheetXlsx(sheetName: string, rows: ExportRow[], headers: string[], widths: number[]) {
  const files = [
    { name: "[Content_Types].xml", content: "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/></Types>" },
    { name: "_rels/.rels", content: "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>" },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>" },
    { name: "xl/worksheets/sheet1.xml", content: createWorksheetXml(rows, headers, widths) },
  ];
  return createZip(files);
}

function downloadXlsx(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function createIndividualSubscriptionsXlsx(accounts: IndividualSubscriptionExportAccount[]) {
  const rows = buildIndividualSubscriptionExportRows(accounts);
  const headers = ["رقم الحساب", "اسم المشترك", "رقم واتساب", "حالة الحساب", "ملاحظات الحساب", "تاريخ فتح الحساب", "آخر تحديث للحساب", "رقم سجل الاشتراك", "اسم الخدمة أو الاشتراك", "حالة الاشتراك", "ملاحظات الاشتراك", "تاريخ إضافة الاشتراك", "آخر تحديث للاشتراك"];
  return { bytes: createSingleSheetXlsx("اشتراكات الأفراد", rows, headers, [12, 24, 20, 14, 30, 17, 17, 15, 26, 16, 30, 18, 18]), rowCount: rows.length };
}

export function exportIndividualSubscriptionsToExcel(accounts: IndividualSubscriptionExportAccount[]) {
  const { bytes, rowCount } = createIndividualSubscriptionsXlsx(accounts);
  downloadXlsx(bytes, `اشتراكات-الأفراد-${new Date().toISOString().slice(0, 10)}.xlsx`);
  return rowCount;
}

export type ExpenseCategoryExportOperation = {
  expenseNumber: string;
  description: string;
  expenseDate: Date | string;
  amount: string;
  currencyCode: string;
  status: string;
  supplierName?: string | null;
  supplierInvoiceNumber?: string | null;
  notes?: string | null;
  cashOverrideReason?: string | null;
};

export function createExpenseCategoryOperationsXlsx(categoryName: string, operations: ExpenseCategoryExportOperation[]) {
  const headers = ["رقم القيد", "التصنيف", "البيان", "التاريخ", "المبلغ", "العملة", "الحالة", "المورد أو المستلم", "رقم فاتورة المورد", "ملاحظات", "سبب تجاوز الصندوق"];
  const rows: ExportRow[] = operations.map(operation => ({
    "رقم القيد": operation.expenseNumber,
    "التصنيف": categoryName,
    "البيان": operation.description,
    "التاريخ": arabicDate(operation.expenseDate),
    "المبلغ": operation.amount,
    "العملة": operation.currencyCode,
    "الحالة": operation.status,
    "المورد أو المستلم": operation.supplierName ?? "",
    "رقم فاتورة المورد": operation.supplierInvoiceNumber ?? "",
    "ملاحظات": operation.notes ?? "",
    "سبب تجاوز الصندوق": operation.cashOverrideReason ?? "",
  }));
  return { bytes: createSingleSheetXlsx("تفاصيل المصروفات", rows, headers, [15, 22, 34, 16, 16, 12, 16, 24, 20, 34, 34]), rowCount: rows.length };
}

export function exportExpenseCategoryOperationsToExcel(categoryName: string, month: string, operations: ExpenseCategoryExportOperation[]) {
  const { bytes, rowCount } = createExpenseCategoryOperationsXlsx(categoryName, operations);
  downloadXlsx(bytes, `مصروفات-${categoryName}-${month}.xlsx`);
  return rowCount;
}
