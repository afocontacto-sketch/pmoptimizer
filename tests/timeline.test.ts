import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import TimelineChart from "../src/components/charts/TimelineChart";
import { clipEntryToDay, dayBounds, timelineRows } from "../src/data/workOrders";
import type { TimeEntry } from "../src/data/workOrders";

const local = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();
const iso = (ms: number) => new Date(ms).toISOString();
const entry = (over: Partial<TimeEntry>): TimeEntry => ({
  id: "TE-1", orderId: "61000001", orderType: "COR", wbs: "W", operationOrder: 10, operationName: "Diagnóstico",
  employeeId: "EMP-001", employeeName: "Camila", start: iso(local(10, 8)), end: iso(local(10, 10)), hourlyRate: 1000, ...over,
});

describe("línea de tiempo (E3.5)", () => {
  test("dayBounds valida la fecha y devuelve el día local", () => {
    expect(dayBounds("no-fecha")).toBeNull();
    const bounds = dayBounds("2026-11-10");
    expect(bounds?.start).toBe(local(10, 0));
    expect(bounds?.end).toBe(local(11, 0));
  });

  test("clipEntryToDay recorta entradas que cruzan medianoche", () => {
    const crossing = entry({ start: iso(local(9, 22)), end: iso(local(10, 2)) });
    expect(clipEntryToDay(crossing, "2026-11-10", local(10, 12))).toEqual({ startMs: local(10, 0), endMs: local(10, 2), open: false });
    expect(clipEntryToDay(crossing, "2026-11-09", local(10, 12))).toEqual({ startMs: local(9, 22), endMs: local(10, 0), open: false });
    expect(clipEntryToDay(crossing, "2026-11-12", local(12, 12))).toBeNull();
  });

  test("la entrada abierta crece con now", () => {
    const open = entry({ end: null });
    expect(clipEntryToDay(open, "2026-11-10", local(10, 9))?.endMs).toBe(local(10, 9));
    expect(clipEntryToDay(open, "2026-11-10", local(10, 9, 30))).toMatchObject({ endMs: local(10, 9, 30), open: true });
  });

  test("timelineRows: con actividad o asignados ese día, ordenados; día sin datos = vacío", () => {
    const entries = [entry({}), entry({ id: "TE-2", employeeId: "EMP-004", employeeName: "Álvaro" })];
    const orders = [
      { dueDate: "2026-11-10", status: "Asignada" as const, assignees: [{ employeeId: "EMP-009", name: "Zoe" }] },
      { dueDate: "2026-11-10", status: "Cerrada" as const, assignees: [{ employeeId: "EMP-010", name: "Cerrado" }] },
    ];
    expect(timelineRows("2026-11-10", entries, orders, local(10, 12)).map((row) => row.name)).toEqual(["Álvaro", "Camila", "Zoe"]);
    expect(timelineRows("2026-11-20", entries, orders, local(20, 12))).toEqual([]);
  });

  test("TimelineChart dibuja una barra por entrada visible en la ventana y marca la abierta", () => {
    const entries = [entry({}), entry({ id: "TE-2", operationOrder: 20, start: iso(local(10, 11)), end: null }), entry({ id: "TE-3", start: iso(local(10, 1)), end: iso(local(10, 2)) })];
    const rows = [{ employeeId: "EMP-001", name: "Camila" }];
    const html = (fullDay: boolean) => renderToStaticMarkup(createElement(TimelineChart, {
      date: "2026-11-10", rows, entries, now: local(10, 12), colorBy: "type", fullDay,
    }));
    expect((html(false).match(/data-testid="timeline-bar"/g) ?? []).length).toBe(2);
    expect((html(true).match(/data-testid="timeline-bar"/g) ?? []).length).toBe(3);
    expect(html(false)).toContain("En curso");
    expect(html(false)).toContain("Preventivo");
  });
});
