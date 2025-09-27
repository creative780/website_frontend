"use client";

import { useEffect, useState } from "react";
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
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/show-testimonials/?all=1`,
          withFrontendKey({ method: "GET" })
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
          // Prefer explicit fields if present; otherwise fall back
          date: t.date ?? t.created_at ?? t.updated_at ?? "",
          status: t.status ?? (t.published ? "Published" : "Draft"),
        }));

        if (!cancelled) setRows(mapped);
      } catch (e: any) {
        if (!cancelled) {
          setError("Failed to load testimonials.");
          setRows([]);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep UI structure identical; only the data source changed
  return (
    <div className="overflow-auto rounded-2xl shadow-lg border border-gray-200 max-h-[500px]">
      <div className="bg-white p-4 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-[#891F1A]">
          Uploaded Testimonials
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-auto text-sm bg-white">
          <thead className="text-white bg-[#891F1A] sticky top-0 z-10">
            <tr>
              <th className="p-3 text-left">Customer</th>
              <th className="p-3 text-left">Designation</th>
              <th className="p-3 text-center">Date</th>
              <th className="p-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="text-gray-700 divide-y divide-gray-100">
            {/* Loading state (single row) */}
            {rows === null && (
              <tr>
                <td className="p-3 text-center" colSpan={4}>
                  Loading…
                </td>
              </tr>
            )}

            {/* Error state (single row) */}
            {rows !== null && rows.length === 0 && error && (
              <tr>
                <td className="p-3 text-center" colSpan={4}>
                  {error}
                </td>
              </tr>
            )}

            {/* Data rows */}
            {rows?.map((item, idx) => (
              <tr className="hover:bg-gray-50 transition" key={idx}>
                <td className="p-3">{item.name || "-"}</td>
                <td className="p-3">{item.role || "-"}</td>
                <td className="p-3 text-center">
                  {formatDate(item.date) || "-"}
                </td>
                <td
                  className={`p-3 text-center ${
                    (item.status || "").toLowerCase() === "published"
                      ? "text-green-600"
                      : "text-yellow-600"
                  }`}
                >
                  {item.status || "Draft"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Basic date prettifier (keeps UI unchanged, just nicer text if ISO provided)
function formatDate(raw?: string) {
  if (!raw) return "";
  // If it's already a friendly date, just show it
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}
