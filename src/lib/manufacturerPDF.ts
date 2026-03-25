/**
 * manufacturerPDF.ts
 * Generates a print-ready manufacturer brief PDF after P11 + P12 complete.
 * Contains the full QA-reviewed final formula + flavor profile + competitive
 * benchmarking + FDA compliance — everything in one clean document.
 */

export interface ManufacturerBriefData {
  categoryName: string;
  // top-level formula_briefs columns
  formType?: string | null;
  servingsPerContainer?: number | null;
  targetPrice?: number | null;
  positioning?: string | null;
  // ingredients sections
  finalFormulaBrief?: string | null;    // P10 final brief (full text)
  adjustedFormula?: string | null;      // P10 adjusted formula table
  flavorQA?: string | null;             // P10 flavor QA
  qaVerdict?: { score: number | null; verdict: string; summary: string } | null;
  // P11
  p11Score?: number | null;
  p11ValidationResult?: string | null;
  p11OpusValidation?: string | null;   // full validated benchmarking
  // P12
  p12Score?: number | null;
  p12Status?: string | null;
  p12OpusAnalysis?: string | null;     // full FDA compliance analysis
  p12NihFetched?: number | null;
}

// ─── Markdown → HTML helpers ───────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Convert markdown to clean HTML suitable for print PDF */
export function mdToHTML(md: string): string {
  if (!md || typeof md !== "string") return "";
  const lines = md.split("\n");
  const out: string[] = [];
  let tableRows: string[] = [];
  let inTable = false;
  let inList = false;

  const flushTable = () => {
    if (!tableRows.length) return;
    const [header, , ...body] = tableRows;
    const ths = header.split("|").filter(Boolean).map(c =>
      `<th>${renderInline(c.trim())}</th>`
    ).join("");
    const trs = body.map(r =>
      "<tr>" + r.split("|").filter(Boolean).map(c =>
        `<td>${renderInline(c.trim())}</td>`
      ).join("") + "</tr>"
    ).join("");
    out.push(`<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`);
    tableRows = [];
    inTable = false;
  };

  const flushList = () => { if (inList) { out.push("</ul>"); inList = false; } };

  for (const raw of lines) {
    const line = raw;
    const t = line.trim();

    // Table
    if (t.startsWith("|")) {
      if (inList) flushList();
      if (!inTable) inTable = true;
      tableRows.push(t);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Headings
    if (t.startsWith("#### ")) { flushList(); out.push(`<h4>${renderInline(t.slice(5))}</h4>`); continue; }
    if (t.startsWith("### "))  { flushList(); out.push(`<h3>${renderInline(t.slice(4))}</h3>`); continue; }
    if (t.startsWith("## "))   { flushList(); out.push(`<h2>${renderInline(t.slice(3))}</h2>`); continue; }
    if (t.startsWith("# "))    { flushList(); out.push(`<h1>${renderInline(t.slice(2))}</h1>`); continue; }
    if (t === "---")            { flushList(); out.push("<hr>"); continue; }

    // Bullet list
    if (/^[-*] /.test(t)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${renderInline(t.replace(/^[-*] /, ""))}</li>`);
      continue;
    } else { flushList(); }

    // Numbered list
    if (/^\d+\. /.test(t)) {
      out.push(`<p>${renderInline(t)}</p>`);
      continue;
    }

    if (t === "") { out.push("<div style='height:6px'></div>"); continue; }
    out.push(`<p>${renderInline(t)}</p>`);
  }

  if (inTable) flushTable();
  if (inList) out.push("</ul>");
  return out.join("\n");
}

function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

// ─── Score color ───────────────────────────────────────────────────────────────

function scoreColor(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.8) return "#16a34a";
  if (pct >= 0.6) return "#d97706";
  return "#dc2626";
}

function complianceBadgeClass(status: string): string {
  if (status?.includes("REVISIONS")) return "badge-yellow";
  if (status === "COMPLIANT") return "badge-green";
  return "badge-red";
}

// ─── PDF styles ────────────────────────────────────────────────────────────────

const PDF_STYLES = `
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    margin: 0; padding: 36px 48px;
    color: #111827; font-size: 12px; line-height: 1.6;
  }
  .cover { border-bottom: 4px solid #1e40af; padding-bottom: 28px; margin-bottom: 32px; }
  .brand { font-size: 26px; font-weight: 900; color: #1e40af; letter-spacing: 6px; margin-bottom: 4px; }
  .brand-sub { font-size: 10px; color: #6b7280; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 16px; }
  .product-name { font-size: 20px; font-weight: 700; text-transform: capitalize; margin: 8px 0 4px; }
  .gen-date { font-size: 11px; color: #6b7280; margin-bottom: 18px; }
  .scores { display: flex; gap: 14px; flex-wrap: wrap; margin: 18px 0; }
  .score-box {
    border: 1px solid #e5e7eb; border-radius: 8px;
    padding: 10px 18px; text-align: center; min-width: 110px; background: #f9fafb;
  }
  .score-num { font-size: 24px; font-weight: 800; }
  .score-lbl { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
  .specs { display: flex; gap: 10px; flex-wrap: wrap; margin: 14px 0; }
  .spec { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 7px 14px; }
  .spec-lbl { font-size: 9px; color: #6b7280; text-transform: uppercase; font-weight: 600; }
  .spec-val { font-size: 13px; font-weight: 700; color: #1e3a8a; }
  .positioning { font-size: 12px; color: #374151; margin: 12px 0; padding: 10px 14px; background: #f8fafc; border-left: 3px solid #1e40af; border-radius: 0 6px 6px 0; }
  h1 {
    font-size: 16px; font-weight: 700; color: #1e40af;
    border-bottom: 2px solid #1e40af; padding-bottom: 5px;
    margin: 32px 0 14px; page-break-after: avoid;
  }
  h2 { font-size: 13px; font-weight: 700; color: #374151; margin: 18px 0 6px; page-break-after: avoid; }
  h3 { font-size: 12px; font-weight: 600; color: #4b5563; margin: 12px 0 4px; page-break-after: avoid; }
  h4 { font-size: 11px; font-weight: 600; color: #6b7280; margin: 8px 0 3px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; font-size: 11px; page-break-inside: auto; }
  thead tr { background: #1e40af; color: white; }
  th { text-align: left; padding: 7px 10px; font-weight: 600; }
  td { padding: 5px 10px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  tr:nth-child(even) td { background: #f9fafb; }
  ul { padding-left: 18px; margin: 6px 0; }
  li { margin: 2px 0; }
  p { margin: 3px 0; }
  strong { font-weight: 600; }
  em { font-style: italic; }
  code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 10px; font-family: monospace; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 14px 0; }
  .badge {
    display: inline-block; padding: 3px 12px; border-radius: 20px;
    font-size: 11px; font-weight: 700; margin: 6px 0;
  }
  .badge-green { background: #dcfce7; color: #166534; }
  .badge-yellow { background: #fef9c3; color: #854d0e; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .page-break { page-break-after: always; }
  .section { page-break-inside: avoid; }
  .nih-note { font-size: 10px; color: #6b7280; margin-top: 8px; }
  .footer {
    font-size: 9px; color: #9ca3af; text-align: center;
    border-top: 1px solid #e5e7eb; padding-top: 8px; margin-top: 36px;
  }
  @media print {
    body { padding: 20px 30px; }
    .page-break { page-break-after: always; }
    h1, h2, h3 { page-break-after: avoid; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
  }
`;

// ─── Main generator ────────────────────────────────────────────────────────────

export function generateManufacturerPDF(d: ManufacturerBriefData): void {
  const win = window.open("", "_blank");
  if (!win) {
    alert("Please allow pop-ups to download the PDF.");
    return;
  }

  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  // Score colors
  const qaColor   = d.qaVerdict?.score  != null ? scoreColor(d.qaVerdict.score, 10)  : "#6b7280";
  const p11Color  = d.p11Score          != null ? scoreColor(d.p11Score, 10)          : "#6b7280";
  const p12Color  = d.p12Score          != null ? scoreColor(d.p12Score, 100)         : "#6b7280";

  // ── Cover ────────────────────────────────────────────────────────────────────
  const scoresHTML = [
    d.qaVerdict?.score  != null && `<div class="score-box"><div class="score-num" style="color:${qaColor}">${d.qaVerdict.score}/10</div><div class="score-lbl">QA Score</div></div>`,
    d.p11Score          != null && `<div class="score-box"><div class="score-num" style="color:${p11Color}">${d.p11Score}/10</div><div class="score-lbl">Competitiveness</div></div>`,
    d.p12Score          != null && `<div class="score-box"><div class="score-num" style="color:${p12Color}">${d.p12Score}/100</div><div class="score-lbl">FDA Compliance</div></div>`,
  ].filter(Boolean).join("");

  const specsHTML = [
    d.formType            && `<div class="spec"><div class="spec-lbl">Form</div><div class="spec-val">${d.formType}</div></div>`,
    d.servingsPerContainer && `<div class="spec"><div class="spec-lbl">Servings/Container</div><div class="spec-val">${d.servingsPerContainer}</div></div>`,
    d.targetPrice         && `<div class="spec"><div class="spec-lbl">Target MSRP</div><div class="spec-val">$${d.targetPrice}</div></div>`,
    d.p12Status           && `<div class="spec"><div class="spec-lbl">FDA Status</div><div class="spec-val">${d.p12Status}</div></div>`,
  ].filter(Boolean).join("");

  const coverHTML = `
    <div class="cover">
      <div class="brand">DOVIVE</div>
      <div class="brand-sub">Manufacturer Brief — Confidential</div>
      <div class="product-name">${escapeHtml(d.categoryName)}</div>
      <div class="gen-date">Generated ${date} · Scout AI Pipeline P1–P12</div>
      ${scoresHTML ? `<div class="scores">${scoresHTML}</div>` : ""}
      ${specsHTML  ? `<div class="specs">${specsHTML}</div>` : ""}
      ${d.positioning ? `<div class="positioning">${escapeHtml(d.positioning)}</div>` : ""}
      ${d.qaVerdict?.summary ? `<div class="positioning" style="border-left-color:#16a34a; margin-top:8px;"><strong>QA Verdict:</strong> ${d.qaVerdict.verdict} — ${escapeHtml(d.qaVerdict.summary)}</div>` : ""}
    </div>
  `;

  // ── Section 1: Final Formula Brief ───────────────────────────────────────────
  let formulaHTML = `<h1>FINAL FORMULA BRIEF</h1>`;
  if (d.finalFormulaBrief) {
    formulaHTML += mdToHTML(d.finalFormulaBrief);
  } else if (d.adjustedFormula) {
    formulaHTML += `<h2>Adjusted Formula Specification</h2>` + mdToHTML(d.adjustedFormula);
  } else {
    formulaHTML += `<p><em>No final formula brief yet. Run P10 QA first.</em></p>`;
  }
  // If we have both, show adjusted formula table separately
  if (d.finalFormulaBrief && d.adjustedFormula) {
    formulaHTML += `<h2>Adjusted Formula Table</h2>` + mdToHTML(d.adjustedFormula);
  }

  // ── Section 2: Flavor Profile ─────────────────────────────────────────────────
  let flavorHTML = "";
  if (d.flavorQA) {
    flavorHTML = `<div class="page-break"></div><h1>FLAVOR PROFILE</h1>` + mdToHTML(d.flavorQA);
  }

  // ── Section 3: Competitive Benchmarking ──────────────────────────────────────
  let benchHTML = "";
  if (d.p11OpusValidation) {
    benchHTML = `<div class="page-break"></div>
    <h1>COMPETITIVE BENCHMARKING — P11</h1>
    <div class="specs">
      ${d.p11Score        != null ? `<div class="spec"><div class="spec-lbl">Competitiveness Score</div><div class="spec-val" style="color:${p11Color}">${d.p11Score}/10</div></div>` : ""}
      ${d.p11ValidationResult     ? `<div class="spec"><div class="spec-lbl">Validation Result</div><div class="spec-val">${escapeHtml(d.p11ValidationResult)}</div></div>` : ""}
    </div>
    ${mdToHTML(d.p11OpusValidation)}`;
  }

  // ── Section 4: FDA Compliance ────────────────────────────────────────────────
  let fdaHTML = "";
  if (d.p12OpusAnalysis) {
    const badgeClass = d.p12Status ? complianceBadgeClass(d.p12Status) : "badge-yellow";
    fdaHTML = `<div class="page-break"></div>
    <h1>FDA COMPLIANCE — P12</h1>
    <div class="specs">
      ${d.p12Score  != null ? `<div class="spec"><div class="spec-lbl">Compliance Score</div><div class="spec-val" style="color:${p12Color}">${d.p12Score}/100</div></div>` : ""}
      ${d.p12Status         ? `<div class="spec"><div class="spec-lbl">Status</div><div class="spec-val"><span class="badge ${badgeClass}">${escapeHtml(d.p12Status)}</span></div></div>` : ""}
      ${d.p12NihFetched != null ? `<div class="spec"><div class="spec-lbl">NIH ODS Sources</div><div class="spec-val">${d.p12NihFetched} fetched live</div></div>` : ""}
    </div>
    ${mdToHTML(d.p12OpusAnalysis)}`;
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  const footerHTML = `
    <div class="footer">
      DOVIVE Manufacturer Brief · ${escapeHtml(d.categoryName)} · ${date} · Powered by Scout AI Pipeline (P1–P12) · Confidential
    </div>
  `;

  // ── Assemble ──────────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>DOVIVE Manufacturer Brief — ${escapeHtml(d.categoryName)}</title>
  <style>${PDF_STYLES}</style>
</head>
<body>
  ${coverHTML}
  ${formulaHTML}
  ${flavorHTML}
  ${benchHTML}
  ${fdaHTML}
  ${footerHTML}
</body>
</html>`;

  win.document.write(html);
  win.document.close();
  win.onload = () => {
    setTimeout(() => {
      win.focus();
      win.print();
    }, 300);
  };
}
