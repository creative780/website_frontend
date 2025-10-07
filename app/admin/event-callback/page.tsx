"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import AdminAuthGuard from "../components/AdminAuthGaurd";
import { API_BASE_URL } from "../../utils/api";
import AdminSidebar from "../components/AdminSideBar";
import { Checkbox } from "@mui/material";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

/**
 * Admin page: Customer Event Call Back (layout-polished, fixed edit + toasts)
 * - Sidebar + content area in a responsive flex shell
 * - Sticky top bar inside main content
 * - Modal is shared for Add + View/Edit, prefilled freshly from backend on edit
 * - POST /api/save-callback/ for create, POST /api/edit-callback/ for update
 * - Toasts for create, update, delete
 */

// ===== Helpers
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set("X-Frontend-Key", FRONTEND_KEY);
  headers.set("Content-Type", "application/json");
  return { ...init, headers, cache: "no-store" };
};

function ensureDeviceUUID() {
  if (typeof window === "undefined") return "admin-ui";
  const key = "device-uuid";
  let v = localStorage.getItem(key);
  if (!v) {
    v = `admin-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
    try {
      localStorage.setItem(key, v);
    } catch {}
  }
  return v;
}

function toLocalInput(dt: string | undefined | null) {
  if (!dt) return "";
  try {
    const d = new Date(dt);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  } catch {
    return "";
  }
}

function fromLocalInput(value: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function formatDisplay(dt: string) {
  if (!dt) return "";
  try {
    const d = new Date(dt);
    return d.toLocaleString();
  } catch {
    return dt;
  }
}

// ===== Types aligned to backend serializer
export type CallbackRow = {
  id: string;
  device_uuid: string;
  username: string;
  email: string;
  phone_number: string;
  event_type: string;
  event_venue: string;
  approx_guest: number | "";
  status: "pending" | "scheduled" | "contacted" | "completed" | "cancelled";
  event_datetime: string; // ISO or ""
  budget: string;
  preferred_callback: string; // ISO
  theme: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

// ===== Sort logic
type SortKey = "added" | "urgency" | "event_date";

function sortCallbacks(data: CallbackRow[], sort: SortKey) {
  const copy = [...data];
  switch (sort) {
    case "urgency":
      return copy.sort((a, b) => {
        const ta = a.preferred_callback ? new Date(a.preferred_callback).getTime() : Infinity;
        const tb = b.preferred_callback ? new Date(b.preferred_callback).getTime() : Infinity;
        return ta - tb;
      });
    case "event_date":
      return copy.sort((a, b) => {
        const ta = a.event_datetime ? new Date(a.event_datetime).getTime() : Infinity;
        const tb = b.event_datetime ? new Date(b.event_datetime).getTime() : Infinity;
        return ta - tb;
      });
    case "added":
    default:
      return copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
}

// ===== Modal component
type ModalProps = {
  open: boolean;
  onClose: () => void;
  initial?: Partial<CallbackRow> | null; // if present => edit/view
  onSaved: (row: CallbackRow) => void;
};

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "scheduled", label: "Scheduled" },
  { value: "contacted", label: "Contacted" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

function SevenDayWarning({ preferred, eventDT }: { preferred: string; eventDT: string }) {
  if (!preferred || !eventDT) return null;
  const pc = new Date(preferred).getTime();
  const ed = new Date(eventDT).getTime();
  const diff = ed - pc;
  const ok = diff >= 7 * 24 * 60 * 60 * 1000;
  if (ok) return null;
  return (
    <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2 mt-2">
      Preferred call-back must be at least 7 days before the event date/time.
    </p>
  );
}

function CallbackModal({ open, onClose, initial, onSaved }: ModalProps) {
  const isEdit = !!(initial && initial.id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  // form state
  const [username, setUsername] = useState(initial?.username || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [phone, setPhone] = useState(initial?.phone_number || "");
  const [eventType, setEventType] = useState(initial?.event_type || "Other");
  const [preferredCB, setPreferredCB] = useState(toLocalInput(initial?.preferred_callback));
  const [eventDT, setEventDT] = useState(toLocalInput(initial?.event_datetime));
  const [guests, setGuests] = useState(String(initial?.approx_guest ?? ""));
  const [budget, setBudget] = useState(initial?.budget || "");
  const [theme, setTheme] = useState(initial?.theme || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [status, setStatus] = useState<CallbackRow["status"]>(initial?.status || "pending");

  // When opening for EDIT, fetch the freshest data for that id and prefill
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!open) return;
      setError("");
      setSaving(false);
      if (isEdit && initial?.id) {
        try {
          const res = await fetch(
            `${API_BASE_URL}/api/show-specific-callback/?id=${encodeURIComponent(initial.id)}&_=${Date.now()}`,
            withFrontendKey()
          );
          const json = await res.json();
          if (!res.ok) throw new Error(json?.error || "Failed to fetch callback");
          if (cancelled) return;
          setUsername(json.username || "");
          setEmail(json.email || "");
          setPhone(json.phone_number || "");
          setEventType(json.event_type || "Other");
          setPreferredCB(toLocalInput(json.preferred_callback));
          setEventDT(toLocalInput(json.event_datetime));
          setGuests(String(json.approx_guest ?? ""));
          setBudget(json.budget || "");
          setTheme(json.theme || "");
          setNotes(json.notes || "");
          setStatus((json.status || "pending") as any);
        } catch (e: any) {
          setError(e?.message || "Unable to load callback");
        }
      } else {
        // Opening as ADD: reset to clean slate
        setUsername("");
        setEmail("");
        setPhone("");
        setEventType("Other");
        setPreferredCB("");
        setEventDT("");
        setGuests("");
        setBudget("");
        setTheme("");
        setNotes("");
        setStatus("pending");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit, initial?.id]);

  const title = isEdit ? "View / Edit Callback" : "Add Callback";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const device_uuid = ensureDeviceUUID();
    const payload: any = {
      device_uuid,
      username: username.trim(),
      email: email.trim(),
      phone_number: phone.trim(),
      event_type: eventType.trim() || "Other",
      preferred_callback: fromLocalInput(preferredCB),
      event_datetime: eventDT ? fromLocalInput(eventDT) : "",
      approx_guest: guests.trim(),
      budget: budget.trim(),
      theme: theme.trim(),
      notes: notes,
    };

    if (isEdit && initial?.id) {
      payload.id = initial.id;
      payload.status = status; // backend will use this on edit
    }

    try {
      const url = isEdit ? `${API_BASE_URL}/api/edit-callback/` : `${API_BASE_URL}/api/save-callback/`;
      const res = await fetch(url, withFrontendKey({ method: "POST", body: JSON.stringify(payload) }));
      const json = await res.json();
      if (!res.ok) {
        const msg = json?.error || "Failed to save.";
        setError(String(msg));
        setSaving(false);
        toast.error(msg);
        return;
      }
      toast.success(isEdit ? "Callback updated" : "Callback created");
      onSaved(json as CallbackRow);
      onClose();
    } catch (err: any) {
      setError("Network error. Try again.");
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
      role="dialog"
      aria-modal
    >
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-black">{title}</h2>
          <button onClick={onClose} className="p-2 rounded hover:bg-gray-100 text-black" aria-label="Close modal">
            ✕
          </button>
        </div>
        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2 text-black">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white text-black">
          {/* 1 - Customer Name */}
          <div>
            <label className="block text-sm font-medium mb-1">Customer Name</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          {/* 2 - Email */}
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              className="w-full border rounded-lg px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* 3 - Phone Number */}
          <div>
            <label className="block text-sm font-medium mb-1">Phone Number</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>

          {/* 4 - Event types */}
          <div>
            <label className="block text-sm font-medium mb-1">Event Type</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              required
            />
          </div>

          {/* 5 - Preferred Call back time */}
          <div>
            <label className="block text-sm font-medium mb-1">Preferred Call Back Time</label>
            <input
              type="datetime-local"
              className="w-full border rounded-lg px-3 py-2"
              value={preferredCB}
              onChange={(e) => setPreferredCB(e.target.value)}
              required
            />
          </div>

          {/* 6 - Event date/time */}
          <div>
            <label className="block text-sm font-medium mb-1">Event Date/Time</label>
            <input
              type="datetime-local"
              className="w-full border rounded-lg px-3 py-2"
              value={eventDT}
              onChange={(e) => setEventDT(e.target.value)}
            />
          </div>

          {/* 7 - Estimated guests */}
          <div>
            <label className="block text-sm font-medium mb-1">Estimated Guests</label>
            <input
              type="number"
              min={1}
              className="w-full border rounded-lg px-3 py-2"
              value={guests}
              onChange={(e) => setGuests(e.target.value)}
              placeholder="e.g. 120"
            />
          </div>

          {/* 8 - Budget */}
          <div>
            <label className="block text-sm font-medium mb-1">Budget</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="$10k - $15k"
            />
          </div>

          {/* 9 - Theme/style */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Theme / Style</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="Rustic, Minimal, Black-tie…"
            />
          </div>

          {/* 10 - Notes */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* 11 - Status */}
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              className="w-full border rounded-lg px-3 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <SevenDayWarning preferred={fromLocalInput(preferredCB)} eventDT={fromLocalInput(eventDT)} />
          </div>

          <div className="md:col-span-2 flex items-center justify-end gap-2 mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#891F1A] text-white hover:bg-red-800 disabled:opacity-60"
            >
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Callback"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===== Main Page Component
export default function Page() {
  const [rows, setRows] = useState<CallbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [sort, setSort] = useState<SortKey>("added");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CallbackRow | null>(null);

  const deviceUUIDRef = useRef<string>("");
  useEffect(() => {
    deviceUUIDRef.current = ensureDeviceUUID();
  }, []);

  async function fetchAll() {
    setLoading(true);
    setError("");
    try {
      const url = `${API_BASE_URL}/api/show-all-callback/?_=${Date.now()}`;
      const res = await fetch(url, withFrontendKey());
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to fetch");
      setRows(Array.isArray(json) ? json : []);
    } catch (e: any) {
      setError(e?.message || "Network error");
      toast.error(e?.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
  }, []);

  const sorted = useMemo(() => sortCallbacks(rows, sort), [rows, sort]);
  const allChecked = useMemo(() => sorted.length > 0 && sorted.every((r) => selected[r.id]), [sorted, selected]);

  function toggleAll() {
    const next: Record<string, boolean> = {};
    if (!allChecked) {
      for (const r of sorted) next[r.id] = true;
    }
    setSelected(next);
  }

  function toggleOne(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function onAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function onViewEdit(row: CallbackRow) {
    setEditing(row);
    setModalOpen(true);
  }

  async function onDeleteSelected() {
    const ids = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} selected callback(s)?`)) return;

    let okCount = 0;
    let failCount = 0;
    for (const id of ids) {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/delete-callback/`,
          withFrontendKey({ method: "POST", body: JSON.stringify({ id }) })
        );
        if (res.ok) okCount++; else failCount++;
      } catch {
        failCount++;
      }
    }
    setSelected({});
    await fetchAll();
    if (okCount) toast.success(`${okCount} callback${okCount > 1 ? "s" : ""} deleted`);
    if (failCount) toast.error(`${failCount} delete${failCount > 1 ? "s" : ""} failed`);
  }

  function onSaved(row: CallbackRow) {
    setRows((prev) => {
      const idx = prev.findIndex((x) => x.id === row.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = row;
        return copy;
      }
      return [row, ...prev];
    });
    // Ensure we reflect any server-side normalization
    fetchAll();
  }

  return (
    <AdminAuthGuard>
      {/* Shell: sidebar + content */}
      <div className="min-h-screen bg-white text-black flex">
        {/* Sidebar */}
        <div className="shrink-0 border-r bg-white">
          <AdminSidebar />
        </div>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <div className="sticky top-0 z-10 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 max-w-screen-2xl mx-auto">
              <div className="font-bold text-lg">Customer Event Call Back</div>

              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600">Sort by</label>
                <select className="border rounded-lg px-3 py-2" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  <option value="added">Added</option>
                  <option value="urgency">Urgency (Preferred Call Back)</option>
                  <option value="event_date">Event Date</option>
                </select>

                <button onClick={onAdd} className="px-4 py-2 rounded-lg bg-[#891F1A] text-white hover:bg-red-800">
                  Add Callback
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="p-4 max-w-screen-2xl mx-auto w-full">
            <div className="overflow-x-auto rounded-lg border max-h-[640px] overflow-y-auto">
              <table className="min-w-full">
                <thead className="sticky top-0 z-[1]">
                  <tr className="bg-[#891F1A] text-left text-sm text-white">
                    <th className="p-3 border-b w-10">
                      <Checkbox
                        checked={allChecked}
                        indeterminate={!allChecked && Object.values(selected).some(Boolean)}
                        onChange={toggleAll}
                        color="secondary"
                        size="medium"
                        sx={{
                          color: "#FFFFFF",
                          "&.Mui-checked": { color: "#FFFFFF" },
                          marginLeft: "-13px",
                        }}
                        inputProps={{ "aria-label": "Select all" }}
                      />
                    </th>
                    <th className="p-3 border-b">Name</th>
                    <th className="p-3 border-b">Phone</th>
                    <th className="p-3 border-b">Event Type</th>
                    <th className="p-3 border-b">Preferred Call Back</th>
                    <th className="p-3 border-b">View / Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 align-top">
                      <td className="p-3 border-b">
                        <Checkbox
                          checked={!!selected[r.id]}
                          onChange={() => toggleOne(r.id)}
                          color="secondary"
                          size="medium"
                          sx={{
                            color: "#891F1A",
                            "&.Mui-checked": { color: "#891F1A" },
                            marginLeft: "-13px",
                          }}
                          inputProps={{ "aria-label": `Select ${r.username}` }}
                        />
                      </td>
                      <td className="p-3 border-b">
                        <div className="font-medium">{r.username || "—"}</div>
                        <div className="text-xs text-gray-500">Email: {r.email || "none"}</div>
                      </td>
                      <td className="p-3 border-b">{r.phone_number || "—"}</td>
                      <td className="p-3 border-b">{r.event_type || "Other"}</td>
                      <td className="p-3 border-b">{formatDisplay(r.preferred_callback) || "—"}</td>
                      <td className="p-3 border-b">
                        <button className="px-3 py-1.5 rounded-lg border hover:bg-gray-50" onClick={() => onViewEdit(r)}>
                          View / Edit
                        </button>
                      </td>
                    </tr>
                  ))}

                  {!loading && !sorted.length && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-gray-500">
                        No callbacks yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 max-w-screen-2xl mx-auto w-full flex justify-end">
            <button
              className="px-3 py-1.5 rounded border hover:bg-gray-50 disabled:opacity-50"
              disabled={!Object.values(selected).some(Boolean)}
              onClick={onDeleteSelected}
            >
              Delete Selected
            </button>
          </div>
        </main>
      </div>

      {/* Toasts */}
      <ToastContainer position="top-right" autoClose={2500} hideProgressBar={false} newestOnTop closeOnClick rtl={false} pauseOnFocusLoss draggable pauseOnHover theme="colored" />

      {/* Modal */}
      <CallbackModal open={modalOpen} onClose={() => setModalOpen(false)} initial={editing || undefined} onSaved={onSaved} />
    </AdminAuthGuard>
  );
}
