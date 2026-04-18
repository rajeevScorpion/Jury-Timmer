import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import StudentReportPrintable from "@/components/StudentReportPrintable";
import type { JurySession, StudentRecord } from "@/types/session";

function pdfFilenameFor(session: JurySession, record: StudentRecord): string {
  const datePart = record.created_at.slice(0, 10);
  const nameSlug = record.student_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `jury-${nameSlug || "student"}-${datePart}.pdf`;
}

async function raf(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

export async function exportStudentPdf(session: JurySession, record: StudentRecord): Promise<void> {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.top = "-10000px";
  host.style.left = "0";
  host.style.zIndex = "-1";
  host.style.pointerEvents = "none";
  document.body.appendChild(host);

  let root: Root | null = null;
  try {
    root = createRoot(host);
    root.render(createElement(StudentReportPrintable, { session, record }));
    await raf();
    await raf();

    const node = host.firstElementChild as HTMLElement | null;
    if (!node) throw new Error("Printable did not render.");

    const canvas = await html2canvas(node, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 24;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;
    const ratio = canvas.height / canvas.width;
    const drawWidth = usableWidth;
    const drawHeightFull = drawWidth * ratio;

    if (drawHeightFull <= usableHeight) {
      pdf.addImage(imgData, "PNG", margin, margin, drawWidth, drawHeightFull);
    } else {
      const pxPerPt = canvas.width / drawWidth;
      const pageSlicePx = usableHeight * pxPerPt;
      const pages = Math.ceil(canvas.height / pageSlicePx);
      for (let i = 0; i < pages; i++) {
        const sliceHeightPx = Math.min(pageSlicePx, canvas.height - i * pageSlicePx);
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceHeightPx;
        const ctx = sliceCanvas.getContext("2d");
        if (!ctx) throw new Error("Failed to get 2d context");
        ctx.drawImage(
          canvas,
          0,
          i * pageSlicePx,
          canvas.width,
          sliceHeightPx,
          0,
          0,
          canvas.width,
          sliceHeightPx,
        );
        const sliceData = sliceCanvas.toDataURL("image/png");
        if (i > 0) pdf.addPage();
        pdf.addImage(sliceData, "PNG", margin, margin, drawWidth, (sliceHeightPx / pxPerPt));
      }
    }

    pdf.save(pdfFilenameFor(session, record));
  } finally {
    if (root) root.unmount();
    host.remove();
  }
}
