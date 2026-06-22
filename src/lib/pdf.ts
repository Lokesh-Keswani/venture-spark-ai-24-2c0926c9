import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import type { Slide } from "@/lib/pitch.functions";
import type { RoadmapPlan } from "@/lib/roadmap.functions";
import type { DeepAnalysis } from "@/lib/analyze.functions";

type Section = { title: string; subtitle?: string; bullets?: string[]; body?: string };

function renderSections(doc: jsPDF, header: string, sections: Section[]) {
  const M = 56;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // Cover
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  const wrappedHeader = doc.splitTextToSize(header, W - M * 2);
  doc.text(wrappedHeader, M, 120);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text(new Date().toLocaleDateString(), M, 150);
  doc.setTextColor(20);

  sections.forEach((s) => {
    doc.addPage();
    let y = M + 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    const title = doc.splitTextToSize(s.title, W - M * 2);
    doc.text(title, M, y);
    y += title.length * 22 + 6;
    if (s.subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.setTextColor(110);
      const sub = doc.splitTextToSize(s.subtitle, W - M * 2);
      doc.text(sub, M, y);
      y += sub.length * 16 + 6;
      doc.setTextColor(20);
    }
    if (s.body) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      const body = doc.splitTextToSize(s.body, W - M * 2);
      doc.text(body, M, y);
      y += body.length * 14 + 10;
    }
    if (s.bullets?.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      s.bullets.forEach((b) => {
        const wrapped = doc.splitTextToSize(`• ${b}`, W - M * 2);
        if (y + wrapped.length * 14 > H - M) {
          doc.addPage();
          y = M;
        }
        doc.text(wrapped, M, y);
        y += wrapped.length * 14 + 4;
      });
    }
  });
}

export async function exportPitchPdf(title: string, slides: Slide[]): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  renderSections(
    doc,
    title,
    slides.map((s) => ({
      title: s.title,
      subtitle: s.subtitle,
      body: s.body,
      bullets: s.bullets,
    })),
  );
  return doc.output("blob");
}

export async function exportRoadmapPdf(name: string, plan: RoadmapPlan): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const sections: Section[] = [
    { title: "MVP Plan", body: plan.mvp?.summary, bullets: plan.mvp?.milestones?.map((m) => `${m.title} — ${m.detail}`) },
    { title: "30-Day Roadmap", bullets: plan.thirty_day?.map((m) => `${m.title} — ${m.detail}`) },
    { title: "90-Day Roadmap", bullets: plan.ninety_day?.map((m) => `${m.title} — ${m.detail}`) },
    { title: "1-Year Growth", bullets: plan.one_year?.map((m) => `${m.title} — ${m.detail}`) },
    { title: "Product Milestones", bullets: plan.product_milestones },
    { title: "Marketing Milestones", bullets: plan.marketing_milestones },
    { title: "Technical Milestones", bullets: plan.technical_milestones },
    { title: "Hiring Recommendations", bullets: plan.hiring_recommendations },
  ];
  renderSections(doc, `${name} — Execution Roadmap`, sections);
  return doc.output("blob");
}

export async function exportReportPdf(name: string, a: DeepAnalysis): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const sections: Section[] = [
    { title: "Executive Summary", subtitle: `Overall score: ${a.overall_score}/100`, body: a.summary },
    {
      title: "Market Analysis",
      subtitle: `Score: ${a.market_analysis?.score}/100`,
      body: `${a.market_analysis?.market_size}\n\n${a.market_analysis?.growth_potential}`,
      bullets: [...(a.market_analysis?.industry_trends ?? []), ...(a.market_analysis?.risks ?? []).map((r) => `Risk: ${r}`)],
    },
    {
      title: "Competitor Analysis",
      subtitle: `Score: ${a.competitor_analysis?.score}/100`,
      bullets: [
        ...(a.competitor_analysis?.competitors ?? []).map(
          (c) => `${c.name} (${c.type}) — ${c.description}. Strength: ${c.strength}. Weakness: ${c.weakness}`,
        ),
        ...(a.competitor_analysis?.competitive_advantages ?? []).map((x) => `Advantage: ${x}`),
        ...(a.competitor_analysis?.market_gaps ?? []).map((x) => `Gap: ${x}`),
      ],
    },
    {
      title: "Business Validation",
      subtitle: `PMF score: ${a.business_validation?.product_market_fit_score}/100`,
      body: `${a.business_validation?.problem_statement}\n\n${a.business_validation?.solution_validation}`,
      bullets: a.business_validation?.target_customers,
    },
    {
      title: "Revenue Model",
      subtitle: `Score: ${a.revenue_model?.score}/100`,
      bullets: [
        ...(a.revenue_model?.revenue_streams ?? []).map((x) => `Stream: ${x}`),
        ...(a.revenue_model?.pricing_recommendations ?? []).map((x) => `Pricing: ${x}`),
        ...(a.revenue_model?.growth_opportunities ?? []).map((x) => `Growth: ${x}`),
      ],
    },
    {
      title: "Risk Analysis",
      bullets: [
        ...(a.risk_analysis?.technical_risks ?? []).map((x) => `Technical: ${x}`),
        ...(a.risk_analysis?.business_risks ?? []).map((x) => `Business: ${x}`),
        ...(a.risk_analysis?.market_risks ?? []).map((x) => `Market: ${x}`),
      ],
    },
    { title: "Recommended Next Steps", bullets: a.next_steps },
  ];
  renderSections(doc, `${name} — Startup Report`, sections);
  return doc.output("blob");
}

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
