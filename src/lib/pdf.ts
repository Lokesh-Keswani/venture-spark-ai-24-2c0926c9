// Premium PDF export system for VentureIQ AI
// Uses jsPDF vector primitives for crisp, presentation-ready output.
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import type { Slide } from "@/lib/pitch.functions";
import type { RoadmapPlan, Milestone } from "@/lib/roadmap.functions";
import type { DeepAnalysis } from "@/lib/analyze.functions";
import type { InvestorReadiness } from "@/lib/investor.functions";

/* ============================================================
 * Theme — Calm Pinkish (matches the app)
 * ============================================================ */
const T = {
  bg: [255, 251, 252] as RGB,
  surface: [255, 255, 255] as RGB,
  ink: [38, 24, 35] as RGB,
  inkSoft: [120, 100, 112] as RGB,
  inkMuted: [165, 148, 158] as RGB,
  border: [241, 224, 232] as RGB,
  primary: [219, 95, 138] as RGB, // rose
  primarySoft: [253, 232, 240] as RGB,
  primaryDeep: [157, 47, 88] as RGB,
  accent: [255, 199, 215] as RGB,
  ok: [86, 168, 122] as RGB,
  okSoft: [225, 244, 232] as RGB,
  warn: [205, 90, 90] as RGB,
  warnSoft: [253, 230, 230] as RGB,
};
type RGB = [number, number, number];

/* ============================================================
 * Doc primitives
 * ============================================================ */
type Orient = "portrait" | "landscape";

function makeDoc(orientation: Orient = "portrait") {
  return new jsPDF({ unit: "pt", format: "letter", orientation });
}

function setFill(doc: jsPDF, c: RGB) {
  doc.setFillColor(c[0], c[1], c[2]);
}
function setStroke(doc: jsPDF, c: RGB) {
  doc.setDrawColor(c[0], c[1], c[2]);
}
function setText(doc: jsPDF, c: RGB) {
  doc.setTextColor(c[0], c[1], c[2]);
}

function pageSize(doc: jsPDF) {
  return { W: doc.internal.pageSize.getWidth(), H: doc.internal.pageSize.getHeight() };
}

function paintBackground(doc: jsPDF) {
  const { W, H } = pageSize(doc);
  setFill(doc, T.bg);
  doc.rect(0, 0, W, H, "F");
}

/* ============================================================
 * Chrome — header / footer on every content page
 * ============================================================ */
type DocMeta = { brand: string; project: string; section?: string; totalPages?: number };

function drawHeader(doc: jsPDF, meta: DocMeta) {
  const { W } = pageSize(doc);
  // subtle top band
  setFill(doc, T.primarySoft);
  doc.rect(0, 0, W, 28, "F");
  setFill(doc, T.primary);
  doc.rect(0, 28, W, 2, "F");

  setText(doc, T.primaryDeep);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(meta.brand.toUpperCase(), 48, 18);

  setText(doc, T.inkSoft);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const right = `${meta.project}${meta.section ? "  ·  " + meta.section : ""}`;
  const tw = doc.getTextWidth(right);
  doc.text(right, W - 48 - tw, 18);
}

function drawFooter(doc: jsPDF, page: number, total?: number) {
  const { W, H } = pageSize(doc);
  setStroke(doc, T.border);
  doc.setLineWidth(0.5);
  doc.line(48, H - 36, W - 48, H - 36);
  setText(doc, T.inkMuted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Generated ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`, 48, H - 22);
  const label = total ? `${page} / ${total}` : `${page}`;
  const tw = doc.getTextWidth(label);
  doc.text(label, W - 48 - tw, H - 22);
}

/* ============================================================
 * Cursor + auto-pagination
 * ============================================================ */
class Cursor {
  doc: jsPDF;
  meta: DocMeta;
  margin = 56;
  top = 60; // below header
  bottom = 56; // above footer
  y: number;
  page = 1;
  constructor(doc: jsPDF, meta: DocMeta) {
    this.doc = doc;
    this.meta = meta;
    this.y = this.top;
    paintBackground(doc);
    drawHeader(doc, meta);
  }
  get W() {
    return pageSize(this.doc).W;
  }
  get H() {
    return pageSize(this.doc).H;
  }
  get contentW() {
    return this.W - this.margin * 2;
  }
  ensure(needed: number) {
    if (this.y + needed > this.H - this.bottom) this.newPage();
  }
  newPage() {
    drawFooter(this.doc, this.page);
    this.doc.addPage();
    this.page += 1;
    paintBackground(this.doc);
    drawHeader(this.doc, this.meta);
    this.y = this.top;
  }
  finish() {
    drawFooter(this.doc, this.page);
  }
}

/* ============================================================
 * Reusable typography & shapes
 * ============================================================ */
function eyebrow(c: Cursor, label: string) {
  c.ensure(20);
  setText(c.doc, T.primaryDeep);
  c.doc.setFont("helvetica", "bold");
  c.doc.setFontSize(8.5);
  c.doc.text(label.toUpperCase(), c.margin, c.y);
  c.y += 14;
}

function h1(c: Cursor, text: string) {
  c.ensure(40);
  setText(c.doc, T.ink);
  c.doc.setFont("helvetica", "bold");
  c.doc.setFontSize(24);
  const lines = c.doc.splitTextToSize(text, c.contentW);
  c.doc.text(lines, c.margin, c.y + 18);
  c.y += lines.length * 26 + 6;
}

function h2(c: Cursor, text: string) {
  c.ensure(34);
  setText(c.doc, T.ink);
  c.doc.setFont("helvetica", "bold");
  c.doc.setFontSize(15);
  const lines = c.doc.splitTextToSize(text, c.contentW);
  c.doc.text(lines, c.margin, c.y + 14);
  // underline accent
  setFill(c.doc, T.primary);
  c.doc.rect(c.margin, c.y + 18, 28, 2, "F");
  c.y += lines.length * 18 + 16;
}

function h3(c: Cursor, text: string) {
  c.ensure(24);
  setText(c.doc, T.primaryDeep);
  c.doc.setFont("helvetica", "bold");
  c.doc.setFontSize(11);
  c.doc.text(text.toUpperCase(), c.margin, c.y + 10);
  c.y += 18;
}

function paragraph(c: Cursor, text: string, color: RGB = T.ink) {
  if (!text) return;
  setText(c.doc, color);
  c.doc.setFont("helvetica", "normal");
  c.doc.setFontSize(10.5);
  const lines = c.doc.splitTextToSize(text, c.contentW);
  for (const line of lines) {
    c.ensure(15);
    c.doc.text(line, c.margin, c.y + 10);
    c.y += 14;
  }
  c.y += 4;
}

function bulletList(
  c: Cursor,
  items: string[] | undefined,
  tone: "neutral" | "ok" | "warn" = "neutral",
) {
  if (!items?.length) return;
  const dot = tone === "ok" ? T.ok : tone === "warn" ? T.warn : T.primary;
  c.doc.setFont("helvetica", "normal");
  c.doc.setFontSize(10.5);
  setText(c.doc, T.ink);
  for (const item of items) {
    const lines = c.doc.splitTextToSize(item, c.contentW - 18);
    const block = lines.length * 14 + 6;
    c.ensure(block);
    setFill(c.doc, dot);
    c.doc.circle(c.margin + 4, c.y + 6, 2.2, "F");
    setText(c.doc, T.ink);
    c.doc.text(lines, c.margin + 14, c.y + 10);
    c.y += block;
  }
  c.y += 4;
}

function roundedCard(
  c: Cursor,
  height: number,
  draw: (x: number, y: number, w: number, h: number) => void,
  pad = 14,
) {
  c.ensure(height + 10);
  const x = c.margin;
  const w = c.contentW;
  setFill(c.doc, T.surface);
  setStroke(c.doc, T.border);
  c.doc.setLineWidth(0.6);
  c.doc.roundedRect(x, c.y, w, height, 10, 10, "FD");
  draw(x + pad, c.y + pad, w - pad * 2, height - pad * 2);
  c.y += height + 12;
}

/* ============================================================
 * Score donut (vector)
 * ============================================================ */
function drawDonut(doc: jsPDF, cx: number, cy: number, r: number, pct: number, color: RGB) {
  // base ring
  setStroke(doc, T.primarySoft);
  doc.setLineWidth(8);
  doc.circle(cx, cy, r, "S");
  // arc via polyline
  const p = Math.max(0, Math.min(100, pct));
  const steps = Math.max(8, Math.round((p / 100) * 64));
  setStroke(doc, color);
  doc.setLineWidth(8);
  doc.setLineCap("round");
  let prevX = cx + r * Math.cos(-Math.PI / 2);
  let prevY = cy + r * Math.sin(-Math.PI / 2);
  for (let i = 1; i <= steps; i++) {
    const t = (i / 64) * Math.PI * 2 - Math.PI / 2;
    const x = cx + r * Math.cos(t);
    const y = cy + r * Math.sin(t);
    doc.line(prevX, prevY, x, y);
    prevX = x;
    prevY = y;
  }
  // center text
  setText(doc, T.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  const label = String(Math.round(p));
  const tw = doc.getTextWidth(label);
  doc.text(label, cx - tw / 2, cy + 4);
  setText(doc, T.inkMuted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const sub = "/ 100";
  const sw = doc.getTextWidth(sub);
  doc.text(sub, cx - sw / 2, cy + 16);
}

/* ============================================================
 * Cover page
 * ============================================================ */
function drawCover(
  doc: jsPDF,
  opts: { brand: string; documentType: string; title: string; subtitle?: string; accent?: string },
) {
  const { W, H } = pageSize(doc);
  // background
  setFill(doc, T.bg);
  doc.rect(0, 0, W, H, "F");

  // decorative side band
  setFill(doc, T.primary);
  doc.rect(0, 0, 14, H, "F");
  setFill(doc, T.accent);
  doc.rect(14, 0, 6, H, "F");

  // soft top-right blob
  setFill(doc, T.primarySoft);
  doc.circle(W - 40, 80, 140, "F");
  setFill(doc, T.accent);
  doc.circle(W - 90, 40, 60, "F");

  // brand
  setText(doc, T.primaryDeep);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(opts.brand.toUpperCase(), 56, 90);

  // document type
  setText(doc, T.inkSoft);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(opts.documentType.toUpperCase(), 56, 110);

  // title
  setText(doc, T.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(40);
  const titleLines = doc.splitTextToSize(opts.title, W - 110);
  doc.text(titleLines, 56, H / 2 - 40);

  // subtitle
  if (opts.subtitle) {
    setText(doc, T.inkSoft);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(13);
    const subLines = doc.splitTextToSize(opts.subtitle, W - 110);
    doc.text(subLines, 56, H / 2 - 40 + titleLines.length * 44 + 18);
  }

  // bottom rule + date
  setStroke(doc, T.primary);
  doc.setLineWidth(1.2);
  doc.line(56, H - 110, W - 56, H - 110);
  setText(doc, T.inkSoft);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }),
    56,
    H - 88,
  );
  if (opts.accent) {
    const aw = doc.getTextWidth(opts.accent);
    doc.text(opts.accent, W - 56 - aw, H - 88);
  }
  setText(doc, T.inkMuted);
  doc.setFontSize(8);
  doc.text("CONFIDENTIAL · PREPARED BY VENTUREIQ AI", 56, H - 64);
}

/* ============================================================
 * Table of contents
 * ============================================================ */
function drawTOC(c: Cursor, items: string[]) {
  h1(c, "Table of contents");
  c.y += 6;
  c.doc.setFont("helvetica", "normal");
  c.doc.setFontSize(11);
  items.forEach((item, i) => {
    c.ensure(22);
    const num = String(i + 1).padStart(2, "0");
    setText(c.doc, T.primary);
    c.doc.setFont("helvetica", "bold");
    c.doc.text(num, c.margin, c.y + 12);
    setText(c.doc, T.ink);
    c.doc.setFont("helvetica", "normal");
    c.doc.text(item, c.margin + 28, c.y + 12);
    setStroke(c.doc, T.border);
    c.doc.setLineWidth(0.4);
    c.doc.line(c.margin, c.y + 20, c.margin + c.contentW, c.y + 20);
    c.y += 24;
  });
  c.y += 8;
}

/* ============================================================
 * Pretty competitor table
 * ============================================================ */
function competitorTable(
  c: Cursor,
  rows: { name: string; type: string; description: string; strength: string; weakness: string }[],
) {
  if (!rows?.length) return;
  const colW = [110, 60, c.contentW - 110 - 60];
  const headerH = 22;

  // header
  c.ensure(headerH + 4);
  setFill(c.doc, T.primary);
  c.doc.roundedRect(c.margin, c.y, c.contentW, headerH, 6, 6, "F");
  setText(c.doc, [255, 255, 255]);
  c.doc.setFont("helvetica", "bold");
  c.doc.setFontSize(9.5);
  c.doc.text("COMPETITOR", c.margin + 12, c.y + 14);
  c.doc.text("TYPE", c.margin + 12 + colW[0], c.y + 14);
  c.doc.text("PROFILE", c.margin + 12 + colW[0] + colW[1], c.y + 14);
  c.y += headerH + 6;

  rows.forEach((r, i) => {
    const profile = `${r.description}\n\nStrength: ${r.strength}\nWeakness: ${r.weakness}`;
    c.doc.setFont("helvetica", "normal");
    c.doc.setFontSize(9.5);
    const profileLines = c.doc.splitTextToSize(profile, colW[2] - 24);
    const nameLines = c.doc.splitTextToSize(r.name, colW[0] - 24);
    const rowH = Math.max(54, profileLines.length * 12 + 18, nameLines.length * 14 + 16);
    c.ensure(rowH + 6);

    if (i % 2 === 0) {
      setFill(c.doc, T.primarySoft);
      c.doc.roundedRect(c.margin, c.y, c.contentW, rowH, 4, 4, "F");
    }

    setText(c.doc, T.ink);
    c.doc.setFont("helvetica", "bold");
    c.doc.setFontSize(11);
    c.doc.text(nameLines, c.margin + 12, c.y + 16);

    // type pill
    const isDirect = r.type === "direct";
    const pillColor = isDirect ? T.primary : T.inkMuted;
    setFill(c.doc, pillColor);
    const pillX = c.margin + colW[0] + 12;
    c.doc.roundedRect(pillX, c.y + 8, 56, 16, 8, 8, "F");
    setText(c.doc, [255, 255, 255]);
    c.doc.setFont("helvetica", "bold");
    c.doc.setFontSize(8);
    const tw = c.doc.getTextWidth(r.type.toUpperCase());
    c.doc.text(r.type.toUpperCase(), pillX + 28 - tw / 2, c.y + 19);

    setText(c.doc, T.ink);
    c.doc.setFont("helvetica", "normal");
    c.doc.setFontSize(9.5);
    c.doc.text(profileLines, c.margin + colW[0] + colW[1] + 12, c.y + 16);

    c.y += rowH + 4;
  });
  c.y += 6;
}

/* ============================================================
 * STARTUP ANALYSIS REPORT
 * ============================================================ */
export async function exportReportPdf(name: string, a: DeepAnalysis): Promise<Blob> {
  const doc = makeDoc("portrait");

  drawCover(doc, {
    brand: "VentureIQ AI",
    documentType: "Startup Analysis Report",
    title: name,
    subtitle: a.summary?.split(". ").slice(0, 1).join(". ") + ".",
    accent: `Score ${a.overall_score}/100`,
  });

  doc.addPage();
  const c = new Cursor(doc, { brand: "VentureIQ AI", project: name, section: "Analysis" });

  // Table of contents
  drawTOC(c, [
    "Executive Summary",
    "Success Score Breakdown",
    "Market Opportunity",
    "Competitive Landscape",
    "Business Validation",
    "Revenue Model",
    "Risk Analysis",
    "Recommended Next Steps",
  ]);

  // Executive summary
  c.newPage();
  eyebrow(c, "01 · Executive Summary");
  h1(c, "The opportunity at a glance");
  paragraph(c, a.summary ?? "", T.ink);

  // Success score breakdown
  c.newPage();
  eyebrow(c, "02 · Success Score");
  h1(c, "Startup success score");
  roundedCard(c, 170, (x, y, w, h) => {
    drawDonut(doc, x + 80, y + h / 2, 60, a.overall_score ?? 0, T.primary);
    setText(doc, T.inkSoft);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    const blurb =
      "Composite score across market opportunity, competitive position, business validation, and revenue model.";
    doc.text(doc.splitTextToSize(blurb, w - 180), x + 170, y + 24);

    // sub-scores
    const subs = [
      { label: "Market", v: a.market_analysis?.score },
      { label: "Competition", v: a.competitor_analysis?.score },
      { label: "PMF", v: a.business_validation?.product_market_fit_score },
      { label: "Revenue", v: a.revenue_model?.score },
    ];
    const baseY = y + h - 56;
    const colW = (w - 180) / 4;
    subs.forEach((s, i) => {
      const cx = x + 170 + colW * i;
      setText(doc, T.inkSoft);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text(s.label.toUpperCase(), cx, baseY);
      setText(doc, T.ink);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text(`${s.v ?? "—"}`, cx, baseY + 22);
      // mini bar
      setFill(doc, T.primarySoft);
      doc.roundedRect(cx, baseY + 28, colW - 12, 4, 2, 2, "F");
      setFill(doc, T.primary);
      const pw = Math.max(0, Math.min(1, (s.v ?? 0) / 100)) * (colW - 12);
      if (pw > 0) doc.roundedRect(cx, baseY + 28, pw, 4, 2, 2, "F");
    });
  });

  // Market
  c.newPage();
  eyebrow(c, "03 · Market Opportunity");
  h1(c, "Market opportunity");
  h3(c, "Market size");
  paragraph(c, a.market_analysis?.market_size ?? "");
  h3(c, "Growth potential");
  paragraph(c, a.market_analysis?.growth_potential ?? "");
  h3(c, "Industry trends");
  bulletList(c, a.market_analysis?.industry_trends, "neutral");
  h3(c, "Market risks");
  bulletList(c, a.market_analysis?.risks, "warn");

  // Competitors
  c.newPage();
  eyebrow(c, "04 · Competitive Landscape");
  h1(c, "Competitive landscape");
  competitorTable(c, a.competitor_analysis?.competitors ?? []);
  h3(c, "Your competitive advantages");
  bulletList(c, a.competitor_analysis?.competitive_advantages, "ok");
  h3(c, "Market gaps to exploit");
  bulletList(c, a.competitor_analysis?.market_gaps, "ok");

  // Validation
  c.newPage();
  eyebrow(c, "05 · Business Validation");
  h1(c, "Business validation");
  h3(c, "Problem statement");
  paragraph(c, a.business_validation?.problem_statement ?? "");
  h3(c, "Solution validation");
  paragraph(c, a.business_validation?.solution_validation ?? "");
  h3(c, "Target customers");
  bulletList(c, a.business_validation?.target_customers, "neutral");

  // Revenue
  c.newPage();
  eyebrow(c, "06 · Revenue Model");
  h1(c, "Revenue model");
  h3(c, "Revenue streams");
  bulletList(c, a.revenue_model?.revenue_streams, "neutral");
  h3(c, "Pricing recommendations");
  bulletList(c, a.revenue_model?.pricing_recommendations, "neutral");
  h3(c, "Growth opportunities");
  bulletList(c, a.revenue_model?.growth_opportunities, "ok");

  // Risks
  c.newPage();
  eyebrow(c, "07 · Risk Analysis");
  h1(c, "Risk analysis");
  h3(c, "Technical risks");
  bulletList(c, a.risk_analysis?.technical_risks, "warn");
  h3(c, "Business risks");
  bulletList(c, a.risk_analysis?.business_risks, "warn");
  h3(c, "Market risks");
  bulletList(c, a.risk_analysis?.market_risks, "warn");

  // Next steps
  c.newPage();
  eyebrow(c, "08 · Next Steps");
  h1(c, "Recommended next steps");
  bulletList(c, a.next_steps, "ok");

  c.finish();
  return doc.output("blob");
}

/* ============================================================
 * ROADMAP REPORT
 * ============================================================ */
function phaseBlock(c: Cursor, label: string, milestones: Milestone[] | undefined) {
  if (!milestones?.length) return;
  h3(c, label);
  milestones.forEach((m, i) => {
    const titleLines = c.doc.splitTextToSize(m.title, c.contentW - 50);
    const detailLines = c.doc.splitTextToSize(m.detail, c.contentW - 50);
    const blockH = Math.max(46, 22 + titleLines.length * 14 + detailLines.length * 12 + 14);
    c.ensure(blockH + 6);
    // timeline dot + line
    setFill(c.doc, T.primary);
    c.doc.circle(c.margin + 10, c.y + 14, 5, "F");
    setStroke(c.doc, T.accent);
    c.doc.setLineWidth(1.2);
    c.doc.line(c.margin + 10, c.y + 22, c.margin + 10, c.y + blockH);
    // numbered chip
    setText(c.doc, [255, 255, 255]);
    c.doc.setFont("helvetica", "bold");
    c.doc.setFontSize(7);
    const num = String(i + 1);
    const nw = c.doc.getTextWidth(num);
    c.doc.text(num, c.margin + 10 - nw / 2, c.y + 16);
    // card
    setFill(c.doc, T.surface);
    setStroke(c.doc, T.border);
    c.doc.setLineWidth(0.5);
    c.doc.roundedRect(c.margin + 28, c.y, c.contentW - 28, blockH - 8, 8, 8, "FD");
    setText(c.doc, T.ink);
    c.doc.setFont("helvetica", "bold");
    c.doc.setFontSize(11);
    c.doc.text(titleLines, c.margin + 42, c.y + 16);
    setText(c.doc, T.inkSoft);
    c.doc.setFont("helvetica", "normal");
    c.doc.setFontSize(9.5);
    c.doc.text(detailLines, c.margin + 42, c.y + 16 + titleLines.length * 14 + 4);
    c.y += blockH;
  });
  c.y += 6;
}

export async function exportRoadmapPdf(name: string, plan: RoadmapPlan): Promise<Blob> {
  const doc = makeDoc("portrait");
  drawCover(doc, {
    brand: "VentureIQ AI",
    documentType: "Execution Roadmap",
    title: `${name}`,
    subtitle: plan.mvp?.summary,
    accent: "12-month plan",
  });

  doc.addPage();
  const c = new Cursor(doc, { brand: "VentureIQ AI", project: name, section: "Roadmap" });

  drawTOC(c, [
    "MVP Plan",
    "30-Day Roadmap",
    "90-Day Roadmap",
    "1-Year Growth Plan",
    "Product Milestones",
    "Marketing Milestones",
    "Technical Milestones",
    "Hiring Recommendations",
  ]);

  c.newPage();
  eyebrow(c, "01 · MVP");
  h1(c, "MVP plan");
  paragraph(c, plan.mvp?.summary ?? "");
  phaseBlock(c, "Milestones", plan.mvp?.milestones);

  c.newPage();
  eyebrow(c, "02 · 30 days");
  h1(c, "First 30 days");
  phaseBlock(c, "Sprint plan", plan.thirty_day);

  c.newPage();
  eyebrow(c, "03 · 90 days");
  h1(c, "Next 90 days");
  phaseBlock(c, "Sprint plan", plan.ninety_day);

  c.newPage();
  eyebrow(c, "04 · 1 year");
  h1(c, "One-year growth plan");
  phaseBlock(c, "Quarterly milestones", plan.one_year);

  c.newPage();
  eyebrow(c, "05 · Functions");
  h1(c, "Cross-functional milestones");
  h3(c, "Product");
  bulletList(c, plan.product_milestones, "ok");
  h3(c, "Marketing");
  bulletList(c, plan.marketing_milestones, "neutral");
  h3(c, "Technical");
  bulletList(c, plan.technical_milestones, "neutral");

  c.newPage();
  eyebrow(c, "06 · Team");
  h1(c, "Hiring recommendations");
  bulletList(c, plan.hiring_recommendations, "ok");

  c.finish();
  return doc.output("blob");
}

/* ============================================================
 * PITCH DECK — landscape, slide-per-page
 * Safe-area layout: decorations are clipped to corners that never
 * intersect the text content box.
 * ============================================================ */
const SLIDE = {
  padX: 64,
  topSafe: 72, // content starts below decorative band
  bottomSafe: 64, // content must end above footer
  decoTop: 56, // max y a top decoration may reach
};

function drawSlideChrome(doc: jsPDF, title: string, page: number, total: number) {
  const { W, H } = pageSize(doc);
  // base
  setFill(doc, T.bg);
  doc.rect(0, 0, W, H, "F");

  // top decorative band — confined to top 48pt so it never overlaps text
  setFill(doc, T.primarySoft);
  doc.rect(0, 0, W, 36, "F");
  setFill(doc, T.primary);
  doc.rect(0, 36, W, 2, "F");
  // tiny accent dot in band (decorative, in chrome area only)
  setFill(doc, T.accent);
  doc.circle(W - 28, 18, 10, "F");

  // bottom-left subtle accent square in footer chrome only
  setFill(doc, T.primarySoft);
  doc.rect(0, H - 6, W, 6, "F");

  // brand top-left
  setText(doc, T.primaryDeep);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("VENTUREIQ AI", 48, 22);

  // footer
  setStroke(doc, T.border);
  doc.setLineWidth(0.5);
  doc.line(48, H - 32, W - 48, H - 32);
  setText(doc, T.inkMuted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const ftitle = doc.splitTextToSize(title || "", W - 160)[0] ?? "";
  doc.text(ftitle, 48, H - 18);
  const label = `${page} / ${total}`;
  const tw = doc.getTextWidth(label);
  doc.text(label, W - 48 - tw, H - 18);
}

function drawPitchCover(doc: jsPDF, title: string, subtitle?: string) {
  const { W, H } = pageSize(doc);
  setFill(doc, T.primaryDeep);
  doc.rect(0, 0, W, H, "F");

  // Decorations confined to right strip (W*0.62..W) so they never
  // cross the text column on the left.
  setFill(doc, T.primary);
  doc.circle(W + 60, -40, 200, "F");
  setFill(doc, T.accent);
  doc.circle(W - 60, H + 40, 160, "F");

  // Text column — left 58% of width
  const colX = 64;
  const colW = W * 0.58 - 64;

  setText(doc, [255, 255, 255]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("VENTUREIQ AI · PITCH DECK", colX, 72);

  // dynamic title sizing
  doc.setFont("helvetica", "bold");
  let titleSize = 48;
  let titleLines = doc.splitTextToSize(title || "Pitch Deck", colW);
  while ((titleSize > 26) && (titleLines.length > 3 || titleSize * 0.6 * (titleLines[0]?.length ?? 0) > colW * 1.4)) {
    titleSize -= 4;
    doc.setFontSize(titleSize);
    titleLines = doc.splitTextToSize(title || "Pitch Deck", colW);
    if (titleLines.length <= 3) break;
  }
  doc.setFontSize(titleSize);
  setText(doc, [255, 255, 255]);
  const lh = titleSize * 1.1;
  const blockH = titleLines.length * lh;
  const titleY = (H - blockH) / 2;
  doc.text(titleLines, colX, titleY);

  if (subtitle) {
    setText(doc, T.accent);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(14);
    const subLines = doc.splitTextToSize(subtitle, colW);
    const subY = titleY + blockH + 18;
    if (subY + subLines.length * 18 < H - 80) {
      doc.text(subLines.slice(0, 3), colX, subY);
    }
  }

  setText(doc, T.accent);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }),
    colX,
    H - 48,
  );
}

function drawPitchClosing(doc: jsPDF, title: string) {
  const { W, H } = pageSize(doc);
  setFill(doc, T.primaryDeep);
  doc.rect(0, 0, W, H, "F");
  // background circle in lower region only — text sits ABOVE it
  setFill(doc, T.primary);
  doc.circle(W / 2, H + 80, 260, "F");

  setText(doc, [255, 255, 255]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(56);
  const text = "Thank you.";
  const tw = doc.getTextWidth(text);
  doc.text(text, W / 2 - tw / 2, H / 2 - 10);

  setText(doc, T.accent);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  const tLines = doc.splitTextToSize(title || "", W - 200);
  const sub = tLines[0] ?? "";
  const sw = doc.getTextWidth(sub);
  doc.text(sub, W / 2 - sw / 2, H / 2 + 20);
}

// Measure the total vertical height a slide's body would take at given sizes.
function measureSlide(
  doc: jsPDF,
  slide: Slide,
  W: number,
  opts: { titleSize: number; subSize: number; bodySize: number; bulletSize: number },
) {
  const contentW = W - SLIDE.padX * 2;
  let h = 0;
  // eyebrow
  h += 22;
  // title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(opts.titleSize);
  const titleLines = doc.splitTextToSize(slide.title ?? "", contentW);
  h += titleLines.length * (opts.titleSize * 1.12) + 6;
  // subtitle
  if (slide.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(opts.subSize);
    const subLines = doc.splitTextToSize(slide.subtitle, contentW);
    h += subLines.length * (opts.subSize * 1.3) + 8;
  }
  // divider
  h += 18;
  // body
  if (slide.body) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(opts.bodySize);
    const bodyLines = doc.splitTextToSize(slide.body, contentW);
    h += bodyLines.length * (opts.bodySize * 1.38) + 10;
  }
  // bullets
  if (slide.bullets?.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(opts.bulletSize);
    for (const b of slide.bullets) {
      const lines = doc.splitTextToSize(b, contentW - 24);
      h += lines.length * (opts.bulletSize * 1.38) + 6;
    }
  }
  return { h, titleLines };
}

function drawSlide(doc: jsPDF, slide: Slide, deckTitle: string, idx: number, total: number) {
  drawSlideChrome(doc, deckTitle, idx, total);
  const { W, H } = pageSize(doc);
  const padX = SLIDE.padX;
  const contentW = W - padX * 2;
  const availableH = H - SLIDE.topSafe - SLIDE.bottomSafe;

  // Auto-fit: pick the largest typography that fits the safe content box.
  const scales = [
    { titleSize: 34, subSize: 15, bodySize: 13, bulletSize: 13 },
    { titleSize: 30, subSize: 14, bodySize: 12.5, bulletSize: 12.5 },
    { titleSize: 26, subSize: 13, bodySize: 12, bulletSize: 12 },
    { titleSize: 22, subSize: 12, bodySize: 11, bulletSize: 11 },
    { titleSize: 19, subSize: 11, bodySize: 10.5, bulletSize: 10.5 },
  ];
  let chosen = scales[scales.length - 1];
  for (const s of scales) {
    const { h } = measureSlide(doc, slide, W, s);
    if (h <= availableH) {
      chosen = s;
      break;
    }
  }

  let y = SLIDE.topSafe;

  // kind eyebrow
  setText(doc, T.primaryDeep);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text((slide.kind ?? "").replace(/_/g, " ").toUpperCase(), padX, y);
  y += 18;

  // title
  setText(doc, T.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(chosen.titleSize);
  const titleLines = doc.splitTextToSize(slide.title ?? "", contentW);
  const titleLh = chosen.titleSize * 1.12;
  doc.text(titleLines, padX, y + chosen.titleSize * 0.85);
  y += titleLines.length * titleLh + 4;

  // subtitle
  if (slide.subtitle) {
    setText(doc, T.inkSoft);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(chosen.subSize);
    const subLines = doc.splitTextToSize(slide.subtitle, contentW);
    const subLh = chosen.subSize * 1.3;
    doc.text(subLines, padX, y + chosen.subSize);
    y += subLines.length * subLh + 6;
  }

  // divider
  setFill(doc, T.primary);
  doc.rect(padX, y + 2, 36, 2.5, "F");
  y += 16;

  // body
  if (slide.body) {
    setText(doc, T.ink);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(chosen.bodySize);
    const bodyLines = doc.splitTextToSize(slide.body, contentW);
    const lh = chosen.bodySize * 1.38;
    doc.text(bodyLines, padX, y + chosen.bodySize);
    y += bodyLines.length * lh + 8;
  }

  // bullets — clipped to safe bottom so text never collides with footer
  if (slide.bullets?.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(chosen.bulletSize);
    const lh = chosen.bulletSize * 1.38;
    const maxY = H - SLIDE.bottomSafe;
    for (const b of slide.bullets) {
      const lines = doc.splitTextToSize(b, contentW - 24);
      const block = lines.length * lh + 6;
      if (y + block > maxY) break;
      setFill(doc, T.primary);
      doc.circle(padX + 6, y + chosen.bulletSize * 0.6, 2.6, "F");
      setText(doc, T.ink);
      doc.text(lines, padX + 18, y + chosen.bulletSize * 0.85);
      y += block;
    }
  }
}

export async function exportPitchPdf(title: string, slides: Slide[]): Promise<Blob> {
  const doc = makeDoc("landscape");
  const total = (slides?.length ?? 0) + 2;

  drawPitchCover(doc, title || "Pitch Deck", slides?.[0]?.subtitle);

  (slides ?? []).forEach((s, i) => {
    doc.addPage();
    drawSlide(doc, s, title, i + 2, total);
  });

  doc.addPage();
  drawPitchClosing(doc, title);

  return doc.output("blob");
}

/* ============================================================
 * Storage + download helpers
 * ============================================================ */
export async function uploadExport(
  userId: string,
  kind: "pitch" | "roadmap" | "report",
  filename: string,
  blob: Blob,
): Promise<string> {
  const path = `${userId}/${kind}/${Date.now()}-${filename}`;
  const { error } = await supabase.storage.from("exports").upload(path, blob, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
