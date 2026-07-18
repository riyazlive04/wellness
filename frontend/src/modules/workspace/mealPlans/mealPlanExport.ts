import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import {
  DAY_LABELS, MEAL_SLOTS, SLOT_LABELS, cardsByDay, dayDate,
  type MealPlan, type MealSlot,
} from '../api/mealPlans';
import { drawBrandedFooters, drawBrandedHeader, resolvePdfBrand } from '../pdf/pdfBrand';

/**
 * Meal-plan exports. The PDF is the artefact clients actually receive over
 * WhatsApp, so it is laid out day-by-day for reading on a phone rather than as
 * a 7-column grid that would be unreadable at that width.
 */

function fileStem(plan: MealPlan, clientName: string): string {
  const safe = clientName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return `meal-plan-${safe || 'client'}-week-${plan.week_number}`;
}

/** Slots actually used by this plan, in canonical order. */
function usedSlots(plan: MealPlan): MealSlot[] {
  const present = new Set((plan.cards ?? []).map((c) => c.meal_type));
  return MEAL_SLOTS.filter((s) => present.has(s));
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export async function exportMealPlanPdf(plan: MealPlan, clientName: string): Promise<void> {
  const brand = await resolvePdfBrand();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;

  const days = cardsByDay(plan.cards);
  const dayCount = days.size || 1;

  // ── Branded masthead ──────────────────────────────────────────────
  let y = drawBrandedHeader(doc, brand, {
    margin,
    title: `Meal plan · Week ${plan.week_number}`,
    subtitle: clientName,
    meta: `${fmtDate(plan.start_date)} - ${fmtDate(plan.end_date)}  ·  ${Math.round(plan.total_kcal / dayCount)} kcal/day avg`,
  });

  // ── One table per day ─────────────────────────────────────────────
  for (let day = 1; day <= 7; day++) {
    const cards = days.get(day) ?? [];
    if (!cards.length) continue;

    const dayKcal = cards.reduce((s, c) => s + (c.kcal ?? 0), 0);
    const date = dayDate(plan.start_date, day);
    const heading = `${DAY_LABELS[day - 1]} · ${date.toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'short',
    })}`;

    // Keep a day's heading with at least part of its table.
    if (y > doc.internal.pageSize.getHeight() - 140) {
      doc.addPage();
      y = 60;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text(heading, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(140);
    doc.text(`${dayKcal} kcal`, pageW - margin, y, { align: 'right' });

    autoTable(doc, {
      startY: y + 10,
      margin: { left: margin, right: margin, bottom: margin },
      head: [['When', 'Meal', 'Details', 'kcal']],
      body: cards.map((c) => [
        SLOT_LABELS[c.meal_type],
        [c.meal_name, c.quantity ? `(${c.quantity}${c.unit ? ` ${c.unit}` : ''})` : ''].filter(Boolean).join(' '),
        [c.description, c.ingredients].filter(Boolean).join(' - ') || '',
        String(c.kcal ?? 0),
      ]),
      theme: 'plain',
      headStyles: {
        fontStyle: 'normal', fontSize: 7, textColor: 140,
        cellPadding: { top: 5, right: 6, bottom: 5, left: 0 },
        lineWidth: { bottom: 0.4 }, lineColor: 200,
      },
      bodyStyles: {
        fontSize: 9, textColor: 40,
        cellPadding: { top: 6, right: 6, bottom: 6, left: 0 },
        lineWidth: { bottom: 0.4 }, lineColor: 232,
        valign: 'top',
      },
      columnStyles: {
        0: { cellWidth: 86, textColor: 110, fontSize: 8 },
        1: { cellWidth: 130 },
        2: { cellWidth: 'auto', textColor: 90, fontSize: 8 },
        3: { cellWidth: 40, halign: 'right', textColor: 110 },
      },
    });

    // autoTable stashes the final Y on the doc — typed loosely by the lib.
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 26;
  }

  drawBrandedFooters(doc, brand, margin);
  doc.save(`${fileStem(plan, clientName)}.pdf`);
}

export function exportMealPlanExcel(plan: MealPlan, clientName: string): void {
  const wb = XLSX.utils.book_new();
  const slots = usedSlots(plan);
  const days = cardsByDay(plan.cards);

  // Sheet 1 — the grid: rows = slots, columns = days. Matches how a
  // nutritionist reads a week at a glance.
  const grid: string[][] = [
    ['', ...DAY_LABELS.map((d, i) => `${d} (${dayDate(plan.start_date, i + 1).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})`)],
  ];
  for (const slot of slots) {
    const row = [SLOT_LABELS[slot]];
    for (let day = 1; day <= 7; day++) {
      const card = (days.get(day) ?? []).find((c) => c.meal_type === slot);
      row.push(card ? `${card.meal_name}${card.kcal ? ` (${card.kcal} kcal)` : ''}` : '');
    }
    grid.push(row);
  }
  grid.push(['']);
  grid.push([
    'Total kcal',
    ...Array.from({ length: 7 }, (_, i) =>
      String((days.get(i + 1) ?? []).reduce((s, c) => s + (c.kcal ?? 0), 0)),
    ),
  ]);

  const ws = XLSX.utils.aoa_to_sheet(grid);
  ws['!cols'] = [{ wch: 18 }, ...Array.from({ length: 7 }, () => ({ wch: 28 }))];
  XLSX.utils.book_append_sheet(wb, ws, 'Week grid');

  // Sheet 2 — flat rows, for anyone who wants to filter or re-import.
  const flat = [
    ['Day', 'Date', 'Slot', 'Meal', 'Quantity', 'kcal', 'Description', 'Ingredients'],
    ...(plan.cards ?? [])
      .slice()
      .sort((a, b) => a.day_number - b.day_number || MEAL_SLOTS.indexOf(a.meal_type) - MEAL_SLOTS.indexOf(b.meal_type))
      .map((c) => [
        String(c.day_number),
        dayDate(plan.start_date, c.day_number).toLocaleDateString('en-IN'),
        SLOT_LABELS[c.meal_type],
        c.meal_name,
        [c.quantity, c.unit].filter(Boolean).join(' '),
        String(c.kcal ?? 0),
        c.description ?? '',
        c.ingredients ?? '',
      ]),
  ];
  const wsFlat = XLSX.utils.aoa_to_sheet(flat);
  wsFlat['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 28 }, { wch: 12 }, { wch: 8 }, { wch: 40 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsFlat, 'All meals');

  XLSX.writeFile(wb, `${fileStem(plan, clientName)}.xlsx`);
}
