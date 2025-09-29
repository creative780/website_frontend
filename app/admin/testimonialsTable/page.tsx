// Front_End/app/admin/testimonialsTable/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../../utils/api";

// Frontend key helper (same contract as main page)
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};

type Row = {
  name: string;
  role: string;
  date?: string; // ISO or display
  status?: "Published" | "Draft" | string;
};

export default function TestimonialsTablePage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/show-testimonials/?all=1&_=${Date.now()}`,
          withFrontendKey({ method: "GET", cache: "no-store", signal: controller.signal })
        );
        if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
        const data = await res.json();

        // Normalize incoming payload
        const list: any[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
          ? data.results
          : data?.data || [];

        const mapped: Row[] = list.map((t: any) => ({
          name: t.name ?? "",
          role: t.role ?? "",
          date: t.date ?? t.created_at ?? t.updated_at ?? "",
          status: t.status ?? (t.published ? "Published" : "Draft"),
        }));

        // Sort newest first by parsed date fallback
        mapped.sort((a, b) => (parseWhenPossible(b.date) - parseWhenPossible(a.date)));

        setRows(mapped);
        setError(null);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setError("Failed to load testimonials.");
        setRows([]);
      }
    })();

    return () => controller.abort();
  }, []);

  const content = useMemo(() => rows, [rows]);

  return (
    <div className="overflow-auto rounded-2xl shadow-lg border border-gray-200 max-h-[500px] bg-white">
      <div className="bg-white p-4 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-[#891F1A]">Uploaded Testimonials</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-auto text-sm">
          <thead className="text-white bg-[#891F1A] sticky top-0 z-10">
            <tr>
              <th className="p-3 text-left">Customer</th>
              <th className="p-3 text-left">Designation</th>
              <th className="p-3 text-center">Date</th>
              <th className="p-3 text-center">Status</th>
            </tr>
          </thead>

          <tbody className="text-gray-700 divide-y divide-gray-100">
            {content === null && (
              <tr>
                <td className="p-3 text-center" colSpan={4}>
                  Loading…
                </td>
              </tr>
            )}

            {content !== null && content.length === 0 && (
              <tr>
                <td className="p-3 text-center" colSpan={4}>
                  {error || "No testimonials found."}
                </td>
              </tr>
            )}

            {content?.map((item, idx) => (
              <tr className="hover:bg-gray-50 transition" key={idx}>
                <td className="p-3">{item.name || "-"}</td>
                <td className="p-3">{item.role || "-"}</td>
                <td className="p-3 text-center">{formatDate(item.date) || "-"}</td>
                <td className="p-3 text-center">
                  <StatusBadge status={item.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* Helpers */

function parseWhenPossible(raw?: string): number {
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? 0 : t;
}

function formatDate(raw?: string) {
  if (!raw) return "";
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return raw; // already a friendly string
  const d = new Date(t);
  try {
    return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function StatusBadge({ status }: { status?: string }) {
  const v = (status || "Draft").toLowerCase();
  const isPub = v === "published";
  const cls = isPub
    ? "bg-green-100 text-green-700 border-green-200"
    : "bg-yellow-100 text-yellow-700 border-yellow-200";
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold border ${cls}`}>
      {isPub ? "Published" : "Draft"}
    </span>
  );
}
