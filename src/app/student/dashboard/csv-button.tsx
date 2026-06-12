"use client";

// ─────────────────────────────────────────────────────────────────────────
// src/app/student/dashboard/csv-button.tsx
//
// Client-side CSV generation for the student's own round history.
// Only rendered when isGameOver (parent gates the render).
// ─────────────────────────────────────────────────────────────────────────

type CsvRow = {
  round: number;
  description: string;
  status: string;
  teacherNote: string;
};

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCsv(rows: CsvRow[]): string {
  const header = ["Round", "Your Photo Description", "Status", "Teacher Note"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        String(r.round),
        escapeCsv(r.description),
        r.status,
        escapeCsv(r.teacherNote),
      ].join(","),
    );
  }
  return lines.join("\n");
}

export function StudentDashboardCsvButton({
  studentName,
  csvRows,
}: {
  studentName: string;
  csvRows: CsvRow[];
}) {
  const download = () => {
    const csv = buildCsv(csvRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = studentName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
    a.href = url;
    a.download = `${safeName}_spotlight.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={download}
      style={{
        background: "transparent",
        color: "#D98A2B",
        border: `1px solid #D98A2B`,
        borderRadius: 8,
        padding: "8px 16px",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "'Outfit',sans-serif",
      }}
    >
      Download your class spreadsheet
    </button>
  );
}
