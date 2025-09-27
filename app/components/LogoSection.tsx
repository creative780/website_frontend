"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Toastify from "toastify-js";
import "toastify-js/src/toastify.css";
import { signOut, onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import LoginModal from "./LoginModal";
import Link from "next/link";
import { API_BASE_URL } from "../utils/api";
import { SafeImg } from "./SafeImage";

/** FRONTEND KEY helper (adds header X-Frontend-Key) */
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};

/* ===================== Logo helpers ===================== */
const LOCAL_LOGO_FALLBACK = "/images/logo.png"; // fallback if API returns nothing

type ShowLogoPayload = { logo?: { url?: string } };

const normalizeLogoUrl = (u?: string): string => {
  const v = (u || "").trim();
  if (!v) return LOCAL_LOGO_FALLBACK;
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  if (v.startsWith("/")) return `${API_BASE_URL}${v}`;
  // handle "media/..." or "uploads/..." just in case
  if (v.startsWith("media/") || v.startsWith("uploads/")) return `${API_BASE_URL}/${v}`;
  return v;
};

const cacheBust = (u: string) => (u ? `${u}${u.includes("?") ? "&" : "?"}v=${Date.now()}` : u);

/* ===================== Existing types & helpers (unchanged) ===================== */
type ID = string | number;
type ImgObj = { url?: string; alt_text?: string } | null | undefined;

interface ProductRaw { id: ID; name: string; images: ImgObj[]; url: string; }
interface SubcategoryRaw { id: ID; name: string; images: ImgObj[]; url: string; products: ProductRaw[]; }
interface CategoryRaw { id: ID; name: string; images: ImgObj[]; url: string; subcategories: SubcategoryRaw[]; }

type Cat = { id: ID; name: string; url: string; images: ImgObj[] };
type Sub = { id: ID; name: string; url: string; images: ImgObj[]; catId: ID; catName: string; catUrl: string; };
type Prod = { id: ID; name: string; url: string; images: ImgObj[]; catId: ID; catName: string; catUrl: string; subId: ID; subName: string; subUrl: string; };

const PLACEHOLDER_IMG = "https://i.ibb.co/ynT1dLc/image-not-found.png";
function getFirstImageUrl(images: ImgObj[]): string {
  if (!images || !images.length) return PLACEHOLDER_IMG;
  const first = images[0] || {};
  const raw = (first.url || "").trim();
  if (!raw) return PLACEHOLDER_IMG;
  if (/^https?:\/\//i.test(raw) || raw.startsWith("//") || raw.startsWith("/")) return raw;
  if (raw.startsWith("media/") || raw.startsWith("uploads/")) {
    return `${API_BASE_URL}/${raw.replace(/^\/+/, "")}`;
  }
  return raw;
}

// Paths
const buildCategoryHref = (catSlug: string) => `/home/${catSlug}`;
const buildSubHref = (catSlug: string, subSlug: string) => `/home/${catSlug}/${subSlug}`;
const buildProductHref = (catSlug: string, subSlug: string, productId: ID) => `/home/${catSlug}/${subSlug}/products/${productId}`;

// Fuzzy helpers (unchanged)
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/\p{Diacritic}/gu, "");
function editDistance(a: string, b: string) {
  const al = a.length, bl = b.length, INF = al + bl;
  const da: Record<string, number> = {};
  const d = Array.from({ length: al + 2 }, () => Array(bl + 2).fill(0));
  d[0][0] = INF;
  for (let i = 0; i <= al; i++) { d[i + 1][1] = i; d[i + 1][0] = INF; }
  for (let j = 0; j <= bl; j++) { d[1][j + 1] = j; d[0][j + 1] = INF; }
  for (let i = 1; i <= al; i++) {
    let db = 0;
    for (let j = 1; j <= bl; j++) {
      const i1 = da[b[j - 1]] || 0;
      const j1 = db;
      let cost = 1;
      if (a[i - 1] === b[j - 1]) { cost = 0; db = j; }
      d[i + 1][j + 1] = Math.min(
        d[i][j] + cost,
        d[i + 1][j] + 1,
        d[i][j + 1] + 1,
        d[i1][j1] + (i - i1 - 1) + 1 + (j - j1 - 1)
      );
    }
    da[a[i - 1]] = i;
  }
  return d[al + 1][bl + 1];
}
const similarity = (a: string, b: string) => {
  const A = norm(a); const B = norm(b);
  if (!A || !B) return 0;
  if (B.includes(A)) return Math.min(1, 0.8 + Math.max(0, (A.length / B.length) * 0.2));
  const dist = editDistance(A, B);
  const maxLen = Math.max(A.length, B.length);
  return 1 - dist / Math.max(1, maxLen);
};
type Scored<T> = { item: T; score: number };
function topMatches<T extends { name: string }>(arr: T[], q: string, minScore = 0.45, limit = 50): Scored<T>[] {
  const Q = q.trim(); if (!Q) return [];
  const results: Scored<T>[] = [];
  for (const it of arr) {
    const s = similarity(Q, it.name);
    if (s >= minScore) results.push({ item: it, score: s });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/* ============================== Component =============================== */
export default function LogoSection() {
  // NEW: dynamic logo state
  const [logoUrl, setLogoUrl] = useState<string>(LOCAL_LOGO_FALLBACK);

  // fetch current logo from Show API on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/show-logo/?_=${Date.now()}`, withFrontendKey({ cache: "no-store" }));
        const json: ShowLogoPayload = res.ok ? await res.json() : {};
        const normalized = normalizeLogoUrl(json?.logo?.url);
        if (!cancelled) setLogoUrl(cacheBust(normalized));
      } catch {
        if (!cancelled) setLogoUrl(LOCAL_LOGO_FALLBACK);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const [isVisible, setIsVisible] = useState(false);
  const [mode, setMode] = useState<"signup" | "signin">("signin");
  const [user, setUser] = useState<User | null>(null);
  const [pseudoLoggedIn, setPseudoLoggedIn] = useState<boolean>(false);
  const [pseudoName, setPseudoName] = useState<string>("");
  const [username, setUsername] = useState<string | null>(null);

  const [navData, setNavData] = useState<CategoryRaw[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        if (pseudoLoggedIn) {
          setPseudoLoggedIn(false); setPseudoName("");
          try { localStorage.removeItem("pseudo_session"); } catch {}
        }
        let displayName: string | null = null;
        try {
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          if (userDoc.exists()) displayName = (userDoc.data() as any)?.username || null;
        } catch {}
        try {
          if (!displayName) {
            const res = await fetch(`${API_BASE_URL}/api/show-user/`, withFrontendKey());
            const data = await res.json();
            const found = data?.users?.find((u: any) => u.user_id === firebaseUser.uid);
            displayName = found?.name || found?.username || null;
          }
        } catch {}
        if (!displayName) displayName = firebaseUser.email?.split("@")[0] || "User";
        setUsername(displayName);
      } else {
        setUser(null); setUsername(null);
        try {
          const raw = localStorage.getItem("pseudo_session");
          if (raw) {
            const obj = JSON.parse(raw) as { name: string };
            if (obj?.name) { setPseudoLoggedIn(true); setPseudoName(obj.name); setUsername(obj.name); }
          }
        } catch {}
      }
    });
    return () => unsubscribe();
  }, [pseudoLoggedIn]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("pseudo_session");
      if (raw) {
        const obj = JSON.parse(raw) as { name: string };
        if (obj?.name) { setPseudoLoggedIn(true); setPseudoName(obj.name); setUsername(obj.name); }
      }
    } catch {}
  }, []);

  // Load nav items
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      setLoading(true); setError(null);
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/show_nav_items/?_=${Date.now()}`,
          withFrontendKey({ signal: controller.signal, cache: "no-store" })
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: CategoryRaw[] = await res.json();
        if (!cancelled) setNavData(json || []);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load items");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) setShowSearch(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") { setShowSearch(false); setUserMenuOpen(false); }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => { document.removeEventListener("mousedown", handleClickOutside); document.removeEventListener("keydown", handleEsc); };
  }, []);

  const openModal = (m: "signup" | "signin") => { setMode(m); setIsVisible(true); };

  const syncAfterModalClose = async () => {
    for (let i = 0; i < 20; i++) { if (auth.currentUser) return; await new Promise((r) => setTimeout(r, 50)); }
    const idInput = (emailRef.current?.value || "").trim();
    const typedName = (nameRef.current?.value || "").trim();
    if (!idInput && !typedName) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/show-user/`, withFrontendKey());
      const data = await res.json();
      const lower = idInput.toLowerCase();
      const found = (data?.users || []).find((u: any) => {
        const uname = String(u.username || u.first_name || u.name || "").toLowerCase().trim();
        const email = String(u.email || "").toLowerCase().trim();
        return (!!email && email === lower) || (!!uname && (uname === lower || uname === typedName.toLowerCase()));
      });
      if (found) {
        const niceName = found.name || found.username || found.first_name || (found.email ? String(found.email).split("@")[0] : "User");
        setPseudoLoggedIn(true); setPseudoName(niceName); setUsername(niceName);
        try { localStorage.setItem("pseudo_session", JSON.stringify({ name: niceName })); } catch {}
        Toastify({ text: `Welcome ${niceName}!`, duration: 2200, gravity: "top", position: "right", backgroundColor: "linear-gradient(to right, #00b09b, #96c93d)" }).showToast();
      }
    } catch { /* ignore */ }
  };

  const closeModal = () => { setIsVisible(false); void syncAfterModalClose(); };
  const toggleMode = () => setMode((p) => (p === "signin" ? "signup" : "signin"));

  const handleLogout = async () => {
    try {
      setPseudoLoggedIn(false); setPseudoName(""); setUsername(null);
      try { localStorage.removeItem("pseudo_session"); } catch {}
      await signOut(auth);
      Toastify({ text: "Logged out successfully!", duration: 3000, gravity: "top", position: "right", backgroundColor: "linear-gradient(to right, #ff5f6d, #ffc371)" }).showToast();
    } catch { alert("Error during logout."); }
  };

  const quickBadges = useMemo<string[]>(() => (navData || []).map((c) => c.name), [navData]);

  const { cats, subs, prods } = useMemo(() => {
    const cats: Cat[] = [], subs: Sub[] = [], prods: Prod[] = [];
    navData.forEach((cat) => {
      const catUrl = cat.url || String(cat.id);
      cats.push({ id: cat.id, name: cat.name, url: catUrl, images: cat.images || [] });
      cat.subcategories?.forEach((sub) => {
        const subUrl = sub.url || String(sub.id);
        const subFlat: Sub = { id: sub.id, name: sub.name, url: subUrl, images: sub.images || [], catId: cat.id, catName: cat.name, catUrl };
        subs.push(subFlat);
        sub.products?.forEach((p) => {
          prods.push({ id: p.id, name: p.name, url: p.url, images: p.images || [], catId: cat.id, catName: cat.name, catUrl, subId: sub.id, subName: sub.name, subUrl });
        });
      });
    });
    return { cats, subs, prods };
  }, [navData]);

  function detectIntent(q: string) {
    const cm = topMatches(cats, q, 0.55, 5);
    const sm = topMatches(subs, q, 0.5, 5);
    const pm = topMatches(prods, q, 0.5, 5);
    const bestCat = cm[0]; const bestSub = sm[0]; const bestProd = pm[0];
    const includesBoost = (name: string) => (norm(name).includes(norm(q)) ? 0.05 : 0);
    const catScore = bestCat ? bestCat.score + includesBoost(bestCat.item.name) : 0;
    const subScore = bestSub ? bestSub.score + includesBoost(bestSub.item.name) : 0;
    const prodScore = bestProd ? bestProd.score + includesBoost(bestProd.item.name) : 0;
    if (catScore >= subScore && catScore >= prodScore && catScore >= 0.58) return { type: "category" as const, target: bestCat!.item, suggestions: cm.slice(1, 4) };
    if (subScore >= prodScore && subScore >= 0.55) return { type: "subcategory" as const, target: bestSub!.item, suggestions: sm.slice(1, 4) };
    if (bestProd && prodScore >= 0.55) return { type: "product" as const, target: bestProd!.item, suggestions: pm.slice(1, 4) };
    return { type: "broad" as const, target: null, suggestions: [...cm, ...sm, ...pm].slice(0, 3) };
  }

  const intent = useMemo(() => detectIntent(debouncedQuery), [debouncedQuery, cats, subs, prods]);

  type ViewItem =
    | { kind: "header"; key: string; text: string; href?: string }
    | { kind: "chips"; key: string; chips: { text: string; href: string }[] }
    | { kind: "product"; key: string; prod: Prod; href: string; img: string };

  const ITEMS_PER_LOAD = 20;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [loadedCount, setLoadedCount] = useState(ITEMS_PER_LOAD);
  useEffect(() => setLoadedCount(ITEMS_PER_LOAD), [debouncedQuery]);
  useEffect(() => {
    function onScroll() {
      const el = scrollerRef.current; if (!el) return;
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
      if (nearBottom) setLoadedCount((c) => c + ITEMS_PER_LOAD);
    }
    const el = scrollerRef.current;
    if (el) el.addEventListener("scroll", onScroll);
    return () => { if (el) el.removeEventListener("scroll", onScroll); };
  }, []);

  function pushProductsDedup(list: ViewItem[], seen: Set<ID>, items: Prod[], keyPrefix: string) {
    for (const p of items) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const href = buildProductHref(p.catUrl, p.subUrl, p.id);
      const img = getFirstImageUrl(p.images);
      list.push({ kind: "product", key: `${keyPrefix}-${p.id}`, prod: p, href, img });
    }
  }

  const viewItems = useMemo<ViewItem[]>(() => {
    if (!debouncedQuery) return [];
    const items: ViewItem[] = [];
    const seen = new Set<ID>();

    if (intent.type === "category" && intent.target) {
      const cat = intent.target as Cat;
      items.push({ kind: "header", key: `cat-${cat.id}`, text: cat.name, href: buildCategoryHref(cat.url) });
      const subOfCat = subs.filter((s) => s.catId === cat.id);
      if (subOfCat.length) {
        items.push({ kind: "chips", key: `chips-cat-${cat.id}`, chips: subOfCat.map((s) => ({ text: s.name, href: buildSubHref(s.catUrl, s.url) })) });
      }
      const prodsInCat = prods.filter((p) => p.catId === cat.id);
      pushProductsDedup(items, seen, prodsInCat, "pc");
      return items;
    }

    if (intent.type === "subcategory" && intent.target) {
      const sub = intent.target as Sub;
      items.push({ kind: "header", key: `cat-${sub.catId}`, text: sub.catName, href: buildCategoryHref(sub.catUrl) });
      const siblings = subs.filter((s) => s.catId === sub.catId);
      if (siblings.length) {
        items.push({ kind: "chips", key: `chips-sub-${sub.id}`, chips: siblings.map((s) => ({ text: s.name, href: buildSubHref(s.catUrl, s.url) })) });
      }
      const subProds = prods.filter((p) => p.subId === sub.id);
      pushProductsDedup(items, seen, subProds, "ps");
      const catRemainder = prods.filter((p) => p.catId === sub.catId && p.subId !== sub.id);
      pushProductsDedup(items, seen, catRemainder, "pr");
      return items;
    }

    if (intent.type === "product" && intent.target) {
      const hit = intent.target as Prod;
      items.push({ kind: "header", key: `cat-${hit.catId}`, text: hit.catName, href: buildCategoryHref(hit.catUrl) });
      const siblings = subs.filter((s) => s.catId === hit.catId);
      if (siblings.length) {
        items.push({ kind: "chips", key: `chips-prod-${hit.id}`, chips: siblings.map((s) => ({ text: s.name, href: buildSubHref(s.catUrl, s.url) })) });
      }
      const subProds = prods.filter((p) => p.subId === hit.subId);
      const sortedSubProds = [hit, ...subProds.filter((p) => p.id !== hit.id)];
      pushProductsDedup(items, seen, sortedSubProds, "pp");
      const catRemainder = prods.filter((p) => p.catId === hit.catId && p.subId !== hit.subId);
      pushProductsDedup(items, seen, catRemainder, "pr");
      return items;
    }

    // Broad fallback
    const scored = topMatches(prods, debouncedQuery, 0.45, 200);
    const grouped = new Map<ID, { catName: string; catUrl: string; items: Prod[] }>();
    for (const { item } of scored) {
      if (!grouped.has(item.catId)) grouped.set(item.catId, { catName: item.catName, catUrl: item.catUrl, items: [] });
      grouped.get(item.catId)!.items.push(item);
    }
    for (const [catId, group] of grouped.entries()) {
      items.push({ kind: "header", key: `cat-${String(catId)}`, text: group.catName, href: buildCategoryHref(group.catUrl) });
      const subOfCat = subs.filter((s) => s.catId === catId);
      if (subOfCat.length) {
        items.push({ kind: "chips", key: `chips-broad-${String(catId)}`, chips: subOfCat.map((s) => ({ text: s.name, href: buildSubHref(s.catUrl, s.url) })) });
      }
      pushProductsDedup(items, seen, group.items, `pb-${String(catId)}`);
    }
    return items;
  }, [debouncedQuery, intent, prods, subs]);

  const didYouMean = useMemo(() => {
    if (!debouncedQuery) return [];
    if (intent.type === "broad") return intent.suggestions.map((s) => s.item.name);
    const extras = intent.suggestions?.map((s: any) => s.item.name).filter(Boolean) || [];
    return extras.slice(0, 3);
  }, [intent, debouncedQuery]);

  const visibleItems = useMemo(() => {
    const list: any[] = []; let count = 0;
    for (const it of viewItems) {
      if ((it as any).kind === "product") { count++; if (count > ITEMS_PER_LOAD) break; }
      list.push(it);
    }
    return list;
  }, [viewItems, ITEMS_PER_LOAD]);

  /* ============================== Render =============================== */
  return (
    <>
      <div
        style={{ fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif" }}
        className="flex-col sm:flex-col lg:flex-row bg-white gap-8 items-center justify-center sm:px-6 lg:px-7 w-full py-4 hidden md:flex"
      >
        <div className="flex flex-row flex-wrap w-full lg:w-[80%] gap-8 items-center">
          <Link href="/home">
            <SafeImg
              src={logoUrl}
              alt="Site logo"
              className="w-28 sm:w-40 lg:w-[221px] h-auto cursor-pointer"
              width={221}
              height={60}
              loading="eager"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                img.onerror = null;
                img.src = LOCAL_LOGO_FALLBACK;
              }}
            />
          </Link>

          {/* SEARCH WRAPPER */}
          <div ref={searchWrapRef} className="relative flex-1 min-w-[220px]">
            <div
              className="flex items-center bg-[#F3F3F3] px-3 sm:px-4 py-2 rounded-md gap-3 min-w-0 focus-within:ring-2 focus-within:ring-[#8B1C1C]"
              onClick={() => {
                setShowSearch(true);
                searchInputRef.current?.focus();
              }}
            >
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setShowSearch(true)}
                placeholder={loading ? "Loading items…" : "Type to explore..."}
                className="flex-1 bg-transparent outline-none text-sm lg:text-base text-[#0E0E0E] placeholder:text-[#0E0E0E] placeholder:opacity-70 font-normal"
                aria-label="Search"
                disabled={loading}
              />

              <button
                type="button"
                className="shrink-0 font-medium"
                aria-label="Search"
              >
                <img
                  src="https://img.icons8.com/?size=100&id=Y6AAeSVIcpWt&format=png&color=000000"
                  alt="Search icon"
                  width={20}
                  height={20}
                  className="w-5 h-5"
                />
              </button>
            </div>

            {/* DROPDOWN */}
            {showSearch && (
              <div
                className="absolute left-0 right-0 mt-2 w-full bg-white rounded-xl border border-gray-200 shadow-lg z-50"
                role="listbox"
                aria-label="Search suggestions"
              >
                {/* Status / badges header */}
                <div className="px-4 pt-3 text-xs text-gray-500 font-light">
                  {loading && "Fetching catalog…"}
                  {!loading && !error && quickBadges.length > 0 && "Quick categories:"}
                  {!loading && !error && quickBadges.length === 0 && "No categories found."}
                  {error && <span className="text-red-600">{error}</span>}
                </div>

                {/* Category badges */}
                {quickBadges.length > 0 && (
                  <div className="px-4 pb-3 pt-2 flex flex-wrap gap-2 border-b border-gray-100">
                    {navData.slice(0, 12).map((c) => (
                      <Link
                        key={c.id}
                        href={buildCategoryHref(c.url)}
                        className="text-xs sm:text-sm rounded-full px-3 py-1 transition text-white bg-[#8B1C1C] hover:bg-[#6f1414] font-medium"
                      >
                        {c.name}
                      </Link>
                    ))}
                  </div>
                )}

                {/* Did you mean */}
                {debouncedQuery && didYouMean.length > 0 && (
                  <div className="px-4 py-2 text-xs text-gray-600 border-b border-gray-100">
                    <span className="font-normal">Did you mean: </span>
                    {didYouMean.map((s, i) => (
                      <button
                        key={s + i}
                        className="underline decoration-dotted mr-2 hover:text-[#8B1C1C] font-normal"
                        onClick={() => setSearchQuery(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                {/* Product/Results list */}
                {debouncedQuery ? (
                  <div ref={scrollerRef} className="max-h-96 overflow-y-auto">
                    {visibleItems.length ? (
                      <ul className="divide-y divide-gray-100">
                        {visibleItems.map((it: any) => {
                          if (it.kind === "header") {
                            const content = (
                              <div className="px-4 py-1 text-xs font-semibold tracking-wide uppercase text-red-700">
                                {it.text}
                              </div>
                            );
                            return (
                              <li key={it.key} className="py-2 bg-white text-black top-0 z-10">
                                {it.href ? <Link href={it.href}>{content}</Link> : content}
                              </li>
                            );
                          }

                          if (it.kind === "chips") {
                            return (
                              <li key={it.key} className="px-4 py-2 bg-white text-black">
                                <div className="flex flex-wrap gap-2">
                                  {it.chips.map((c: any, idx: number) => (
                                    <Link
                                      key={c.text + idx}
                                      href={c.href}
                                      className="text-xs rounded-full px-3 py-1 bg-gray-100 hover:bg-gray-200 font-medium"
                                    >
                                      {c.text}
                                    </Link>
                                  ))}
                                </div>
                              </li>
                            );
                          }

                          // product row
                          return (
                            <li key={it.key}>
                              <Link
                                href={it.href}
                                className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
                              >
                                <SafeImg
                                  src={it.img}
                                  alt={it.prod.name}
                                  className="w-14 h-14 rounded-md object-cover shrink-0"
                                  width={56}
                                  height={56}
                                  loading="lazy"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.onerror = null;
                                    target.src = PLACEHOLDER_IMG;
                                  }}
                                />
                                <div className="min-w-0 flex-1">
                                  <span className="block font-medium text-sm sm:text-base text-gray-900 truncate">
                                    {it.prod.name}
                                  </span>
                                  <p className="text-xs sm:text-sm text-gray-600 font-normal line-clamp-2">
                                    {it.prod.subName} •{" "}
                                    <span className="text-gray-500 font-normal">{it.prod.catName}</span>
                                  </p>
                                </div>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div className="px-4 py-6 text-sm text-gray-500 font-normal">
                        No matches for “{searchQuery}”. Try another keyword.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-4 py-4 text-xs text-gray-500 font-light">
                    Start typing a <span className="font-semibold text-red-700">Category</span>,
                    <span className="font-semibold text-red-700"> Subcategory</span>, or a
                    <span className="font-semibold text-red-700"> Product</span>. Results adapt to
                    what you’re looking for.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right-side links */}
        <div className="flex flex-row gap-8 px-1 pt-2 sm:pt-0 flex-wrap sm:flex-nowrap items-center justify-center sm:justify-start">
          {!(user || pseudoLoggedIn) ? (
            <button
              onClick={() => openModal("signin")}
              className="cursor-pointer flex items-center gap-2 bg-[#8B1C1C] hover:bg-[#6f1414] text-white text-xs font-medium px-10 py-1.5 rounded-full transition-all duration-200 shadow-sm hover:shadow-md"
            >
              <img
                src="https://img.icons8.com/?size=100&id=ii6Lr4KivOiE&format=png&color=FFFFFF"
                alt="Cart"
                width={20}
                height={20}
                className="-ml-5 w-5 h-5 left-3"
              />
              <span className="-ml-1 whitespace-nowrap text-sm font-medium text-white">Cart</span>
            </button>
          ) : (
            <Link
              href="/checkout2"
              className="cursor-pointer flex items-center gap-2 bg-[#8B1C1C] hover:bg-[#6f1414] text-white text-xs font-medium px-10 py-1.5 rounded-full transition-all duration-200 shadow-sm hover:shadow-md"
            >
              <img
                src="https://img.icons8.com/?size=100&id=ii6Lr4KivOiE&format=png&color=FFFFFF"
                alt="Cart"
                width={20}
                height={20}
                className="-ml-5 w-5 h-5 left-3"
              />
              <span className="-ml-1 whitespace-nowrap text-sm font-medium text-white">Cart</span>
            </Link>
          )}

          <Link
            href="/blog"
            className="cursor-pointer flex items/items-center gap-2 bg-[#8B1C1C] hover:bg-[#6f1414] text-white text-xs font-medium px-10 py-1.5 rounded-full transition-all duration-200 shadow-sm hover:shadow-md -ml-5"
          >
            <img
              src="https://img.icons8.com/?size=100&id=WX84CKOI9WcJ&format=png&color=FFFFFF"
              alt="Blog"
              width={20}
              height={20}
              className="-ml-5 w-5 h-5 left-3"
            />
            <span className="-ml-1 whitespace-nowrap text-sm font-medium text-white">Blog</span>
          </Link>

          <Link href="/contact">
            <div className="flex gap-3 items-center flex-nowrap">
              <img
                src="https://img.icons8.com/?size=100&id=Ib9FADThtmSf&format=png&color=000000"
                alt="Help Centre icon"
                width={20}
                height={20}
                className="-ml-5 w-5 h-5 left-3"
              />
              <span className="-ml-1 whitespace-nowrap text-sm font-medium text-black">
                Contact
              </span>
            </div>
          </Link>

          <div className="flex gap-2 items-center">
            <img
              src="https://img.icons8.com/?size=100&id=s7eHaFDy5Rqu&format=png&color=000000"
              alt="UAE icon"
              width={21}
              height={21}
              className="w-[21px] h-[21px]"
            />
            <span className="-ml-1 whitespace-nowrap text-sm font-medium text-black">
              <a href="/about">About</a>
            </span>
          </div>

          <div className="login-signup flex items-center gap-4">
            {!(user || pseudoLoggedIn) ? (
              <button
                onClick={() => openModal("signin")}
                className="admin-link focus:outline-none"
                aria-label="Open login modal"
              >
                <div className="flex items-center admin-panel">
                  <img
                    src="https://img.icons8.com/?size=100&id=4kuCnjaqo47m&format=png&color=000000"
                    alt="Login"
                    width={20}
                    height={20}
                    className="mr-1"
                  />
                  <span className="-ml-1 whitespace-nowrap text-sm font-medium text-black">Login</span>
                </div>
              </button>
            ) : (
              // ================= USER MENU (new) =================
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-gray-100 transition"
                >
                  <img
                    src="https://img.icons8.com/?size=100&id=2oz92AdXqQrC&format=png&color=000000"
                    alt="User Profile"
                    width={20}
                    height={20}
                    className="ml-2"
                  />
                  <span className="-ml-1 whitespace-nowrap text-sm font-medium text-black">
                    {username || pseudoName || "User"}
                  </span>
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`w-4 h-4 transition-transform ${userMenuOpen ? "rotate-180" : ""}`}
                  >
                    <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.217l3.71-3.0a.75.75 0 111.04 1.08l-4.24 3.43a.75.75 0 01-.98 0L5.21 8.29a.75.75 0 01.02-1.08z" />
                  </svg>
                </button>

                {userMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden"
                  >
                    <Link
                      href="/orders"
                      role="menuitem"
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-800"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <img
                        src="https://img.icons8.com/?size=100&id=12239&format=png&color=8B1C1C"
                        alt=""
                        width={18}
                        height={18}
                      />
                      My Orders
                    </Link>

                    <Link
                      href="/personal-profile"
                      role="menuitem"
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-800"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <img
                        src="https://img.icons8.com/?size=100&id=108376&format=png&color=8B1C1C"
                        alt=""
                        width={18}
                        height={18}
                      />
                      View Profile
                    </Link>

                    <button
                      role="menuitem"
                      onClick={async () => {
                        setUserMenuOpen(false);
                        await handleLogout();
                      }}
                      className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-800"
                    >
                      <img
                        src="https://img.icons8.com/?size=100&id=NF9Ee0wdJRR1&format=png&color=8B1C1C"
                        alt=""
                        width={18}
                        height={18}
                      />
                      Logout
                    </button>
                  </div>
                )}
              </div>
              // ================= END USER MENU =================
            )}
          </div>
        </div>
      </div>

      <LoginModal
        isVisible={isVisible}
        mode={mode}
        nameRef={nameRef}
        emailRef={emailRef}
        passwordRef={passwordRef}
        onClose={closeModal}
        onAuth={async () => {
          await syncAfterModalClose();
        }}
        toggleMode={toggleMode}
      />
    </>
  );
}
