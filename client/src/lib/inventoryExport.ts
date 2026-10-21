export function exportToCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  // UTF-8 BOM for Arabic support in Microsoft Excel
  const BOM = "\uFEFF";
  const csvContent =
    BOM +
    [
      headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(","),
      ...rows.map(row =>
        row
          .map(cell => {
            const val = cell === null || cell === undefined ? "" : String(cell);
            return `"${val.replace(/"/g, '""')}"`;
          })
          .join(",")
      ),
    ].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
