import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    padding: 48,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: "#1a1a1a",
    lineHeight: 1.5,
  },
  // Header
  header: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    borderBottomStyle: "solid",
  },
  brand: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  brandSub: { fontSize: 8, color: "#9ca3af", letterSpacing: 1.5 },
  // Category / version
  catName: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 20, marginBottom: 4 },
  versionLine: { fontSize: 9, color: "#6b7280", marginBottom: 14 },
  // Scores row
  scoresRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  scoreBox: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#f9fafb",
    borderWidth: 0.5,
    borderColor: "#e5e7eb",
    borderStyle: "solid",
    borderRadius: 4,
    alignItems: "center",
  },
  scoreVal: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#111827" },
  scoreLabel: { fontSize: 7, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.8 },
  // Verdict badge
  verdictRow: { marginBottom: 20 },
  verdict: { fontSize: 8.5, color: "#374151" },
  // Content
  h1: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 18, marginBottom: 6, color: "#111827" },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 4, color: "#111827" },
  h3: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 3, color: "#374151" },
  body: { fontSize: 9.5, color: "#374151", marginBottom: 3 },
  bullet: { fontSize: 9.5, color: "#374151", marginBottom: 2, paddingLeft: 10 },
  sep: { borderBottomWidth: 0.5, borderBottomColor: "#d1d5db", borderBottomStyle: "solid", marginVertical: 10 },
  spacer: { height: 4 },
  // Table
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#f3f4f6", borderBottomStyle: "solid", paddingVertical: 3 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#d1d5db", borderBottomStyle: "solid", paddingVertical: 3, backgroundColor: "#f9fafb" },
  tableCell: { flex: 1, fontSize: 8.5, color: "#374151", paddingHorizontal: 3 },
  tableCellBold: { flex: 1, fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#111827", paddingHorizontal: 3 },
  // Footer
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    borderTopWidth: 0.5,
    borderTopColor: "#e5e7eb",
    borderTopStyle: "solid",
    paddingTop: 7,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7.5, color: "#9ca3af" },
});

// ─── Line parser ──────────────────────────────────────────────────────────────

interface ParsedLine {
  type: "h1" | "h2" | "h3" | "separator" | "table" | "bullet" | "body" | "empty";
  text: string;
  cells?: string[];
  isTableHeader?: boolean;
}

function parseLines(text: string): ParsedLine[] {
  const lines = text.split("\n");
  const result: ParsedLine[] = [];
  let prevWasTable = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (!line.trim()) {
      result.push({ type: "empty", text: "" });
      prevWasTable = false;
      continue;
    }
    if (/^#{3}\s/.test(line)) {
      result.push({ type: "h3", text: line.replace(/^#{3}\s*/, "") });
      prevWasTable = false;
      continue;
    }
    if (/^#{2}\s/.test(line)) {
      result.push({ type: "h2", text: line.replace(/^#{2}\s*/, "") });
      prevWasTable = false;
      continue;
    }
    if (/^#\s/.test(line)) {
      result.push({ type: "h1", text: line.replace(/^#\s*/, "") });
      prevWasTable = false;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      result.push({ type: "separator", text: "" });
      prevWasTable = false;
      continue;
    }
    // Table row (starts or ends with |)
    if (/^\s*\|/.test(line) || /\|\s*$/.test(line)) {
      const cells = line.split("|").map((c) => c.trim()).filter((c) => c.length > 0);
      // Skip separator rows like |---|---|
      if (cells.every((c) => /^[-: ]+$/.test(c))) continue;
      const isTableHeader = !prevWasTable;
      result.push({ type: "table", text: line, cells, isTableHeader });
      prevWasTable = true;
      continue;
    }
    // Bullet
    if (/^[-*•]\s/.test(line.trim())) {
      result.push({ type: "bullet", text: line.trim().replace(/^[-*•]\s*/, "• ") });
      prevWasTable = false;
      continue;
    }
    // Bold marker cleanup
    const clean = line.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
    result.push({ type: "body", text: clean });
    prevWasTable = false;
  }
  return result;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface FormulaPDFProps {
  categoryName: string;
  versionLabel: string;
  formulaText: string;
  date: string;
  qaScore?: string | null;
  fdaScore?: string | null;
  qaVerdict?: string | null;
  manufacturerName?: string;
}

// ─── PDF Document ─────────────────────────────────────────────────────────────

export function FormulaPDF({
  categoryName,
  versionLabel,
  formulaText,
  date,
  qaScore,
  fdaScore,
  qaVerdict,
  manufacturerName,
}: FormulaPDFProps) {
  const lines = parseLines(formulaText);

  return (
    <Document
      title={`${categoryName} — Formula Brief`}
      author="DOVIVE"
      subject="Confidential Formula Brief"
    >
      <Page size="A4" style={s.page}>
        {/* ── Header ── */}
        <View style={s.header}>
          <Text style={s.brand}>DOVIVE</Text>
          <Text style={s.brandSub}>SUPPLEMENT INTELLIGENCE · CONFIDENTIAL</Text>
        </View>

        {/* ── Category & version ── */}
        <Text style={s.catName}>{categoryName}</Text>
        <Text style={s.versionLine}>
          {versionLabel}  ·  {date}
          {manufacturerName ? `  ·  Prepared for ${manufacturerName}` : ""}
        </Text>

        {/* ── Scores ── */}
        {(qaScore || fdaScore) && (
          <View style={s.scoresRow}>
            {qaScore && (
              <View style={s.scoreBox}>
                <Text style={s.scoreVal}>{qaScore}/10</Text>
                <Text style={s.scoreLabel}>QA Score</Text>
              </View>
            )}
            {fdaScore && (
              <View style={s.scoreBox}>
                <Text style={s.scoreVal}>{fdaScore}/100</Text>
                <Text style={s.scoreLabel}>FDA Compliance</Text>
              </View>
            )}
          </View>
        )}

        {qaVerdict && (
          <View style={s.verdictRow}>
            <Text style={s.verdict}>QA Verdict: {qaVerdict}</Text>
          </View>
        )}

        <View style={s.sep} />

        {/* ── Formula content ── */}
        {lines.map((line, i) => {
          switch (line.type) {
            case "h1":
              return <Text key={i} style={s.h1}>{line.text}</Text>;
            case "h2":
              return <Text key={i} style={s.h2}>{line.text}</Text>;
            case "h3":
              return <Text key={i} style={s.h3}>{line.text}</Text>;
            case "separator":
              return <View key={i} style={s.sep} />;
            case "empty":
              return <View key={i} style={s.spacer} />;
            case "bullet":
              return <Text key={i} style={s.bullet}>{line.text}</Text>;
            case "table":
              return (
                <View key={i} style={line.isTableHeader ? s.tableHeader : s.tableRow}>
                  {(line.cells ?? []).map((cell, ci) => (
                    <Text key={ci} style={line.isTableHeader ? s.tableCellBold : s.tableCell}>
                      {cell}
                    </Text>
                  ))}
                </View>
              );
            default:
              return line.text ? <Text key={i} style={s.body}>{line.text}</Text> : null;
          }
        })}

        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>DOVIVE · Confidential Formula Brief</Text>
          <Text style={s.footerText}>{categoryName} · {versionLabel}</Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
