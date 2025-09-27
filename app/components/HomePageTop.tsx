'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import LoginModal from '../components/LoginModal';
import { API_BASE_URL } from '../utils/api';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import SafeImage, { SafeImg } from './SafeImage';

/** FRONTEND KEY helper (adds header X-Frontend-Key) — keep headers minimal to avoid CORS preflight */
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || '').trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set('X-Frontend-Key', FRONTEND_KEY);
  return {
    ...init,
    headers,
    cache: 'no-store',
    credentials: 'omit',
    mode: 'cors',
  };
};

/* ---------- Logo helpers (mobile header) ---------- */
const LOCAL_LOGO_WHITE = '/images/logowhite.png';
const normalizeLogoUrl = (u?: string) => {
  const v = (u || '').trim();
  if (!v) return LOCAL_LOGO_WHITE;
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  if (v.startsWith('/')) return `${API_BASE_URL}${v}`;
  if (v.startsWith('media/') || v.startsWith('uploads/')) return `${API_BASE_URL}/${v}`;
  return LOCAL_LOGO_WHITE;
};

/* ===================== API TYPES — align with backend ===================== */
type ID = string | number;

interface ImageDTO {
  url: string;
  alt_text?: string;
}

interface ProductRaw {
  id: ID;
  name: string;
  images: ImageDTO[];
  url: string;
}
interface SubcategoryRaw {
  id: ID;
  name: string;
  images: ImageDTO[];
  url: string;
  products: ProductRaw[];
}
interface CategoryRaw {
  id: ID;
  name: string;
  images: ImageDTO[];
  url: string;
  subcategories: SubcategoryRaw[];
}

/** Flattened lookup shapes */
type Cat = { id: ID; name: string; url: string; images: ImageDTO[] };
type Sub = { id: ID; name: string; url: string; images: ImageDTO[]; catId: ID; catName: string };
type Prod = {
  id: ID;
  name: string;
  url: string;
  images: ImageDTO[];
  catId: ID;
  catName: string;
  subId: ID;
  subName: string;
};

export default function MobileTopBar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<'signin' | 'signup'>('signin');

  // Firebase user (truthy when Firebase auth succeeded)
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);

  // Pseudo session for backend-only success (no Firebase session)
  const [pseudoLoggedIn, setPseudoLoggedIn] = useState<boolean>(false);
  const [pseudoName, setPseudoName] = useState<string>('');

  // Unified display name
  const [username, setUsername] = useState<string>('');

  // Modal input refs (provided to LoginModal)
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // ======= Search =======
  const [navData, setNavData] = useState<CategoryRaw[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const scrollerRef = useRef<HTMLDivElement>(null);
  const ITEMS_PER_LOAD = 20;
  const [loadedCount, setLoadedCount] = useState(ITEMS_PER_LOAD);

  const searchWrapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showSearch, setShowSearch] = useState(false);

  // ======= Mobile Logo (ShowLogo API) =======
  const [mobileLogoUrl, setMobileLogoUrl] = useState<string>(LOCAL_LOGO_WHITE);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/show-logo/?_=${Date.now()}`,
          withFrontendKey()
        );
        const json = res.ok ? await res.json() : null;
        const url = normalizeLogoUrl(json?.logo?.url);
        if (!cancelled) setMobileLogoUrl(url);
      } catch {
        if (!cancelled) setMobileLogoUrl(LOCAL_LOGO_WHITE);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounce typing
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Fetch nav items — live fetch exactly once; no cache; bust intermediaries with a timestamp param
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `${API_BASE_URL}/api/show_nav_items/?_=${Date.now()}`; // ✅ cache-buster
        const res = await fetch(url, withFrontendKey());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: CategoryRaw[] = await res.json();
        if (!cancelled) setNavData(Array.isArray(json) ? json : []);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load items');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Sidebar open/close side-effects
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };

    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    } else {
      document.body.style.overflow = 'auto';
    }

    return () => {
      document.body.style.overflow = 'auto';
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMenuOpen]);

  // Close search dropdown on outside click or Esc (inside sidebar)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setShowSearch(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowSearch(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  // Infinite-ish loading reset on new query
  useEffect(() => setLoadedCount(ITEMS_PER_LOAD), [debouncedQuery]);

  useEffect(() => {
    function onScroll() {
      const el = scrollerRef.current;
      if (!el) return;
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
      if (nearBottom) {
        setLoadedCount((c) => c + ITEMS_PER_LOAD);
      }
    }
    const el = scrollerRef.current;
    if (el) el.addEventListener('scroll', onScroll);
    return () => {
      if (el) el.removeEventListener('scroll', onScroll);
    };
  }, []);

  const toggleCategory = (name: string) => {
    setExpandedCategory(prev => (prev === name ? null : name));
  };

  // Slugify
  const slugify = useCallback(
    (str: string) => str.toLowerCase().trim().replace(/\s+/g, '-'),
    []
  );

  const openModal = (mode: 'signin' | 'signup') => {
    setModalMode(mode);
    setIsModalVisible(true);
  };

  const closeModal = () => setIsModalVisible(false);
  const toggleModalMode = () => setModalMode(prev => (prev === 'signin' ? 'signup' : 'signin'));

  /* ---------- Auth state: Firebase + pseudo ---------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setFirebaseUser(u);

      if (u) {
        // Clear pseudo session if any
        if (pseudoLoggedIn) {
          setPseudoLoggedIn(false);
          setPseudoName('');
          try {
            localStorage.removeItem('pseudo_session');
          } catch {}
        }

        // Determine display name
        let displayName: string | null = u.displayName || null;

        // Firestore
        if (!displayName) {
          try {
            const snap = await getDoc(doc(db, 'users', u.uid));
            if (snap.exists()) {
              displayName = (snap.data() as any).username || null;
            }
          } catch { /* ignore */ }
        }

        // Backend fallback
        if (!displayName) {
          try {
            const res = await fetch(`${API_BASE_URL}/api/show-user/?_=${Date.now()}`, withFrontendKey());
            const data = await res.json();
            const found = data?.users?.find((x: any) => x.user_id === u.uid);
            displayName = found?.name || found?.username || found?.first_name || null;
          } catch { /* ignore */ }
        }

        if (!displayName) displayName = u.email?.split('@')[0] || 'User';
        setUsername(displayName);
      } else {
        // No Firebase session: try restore pseudo
        setUsername('');
        try {
          const raw = localStorage.getItem('pseudo_session');
          if (raw) {
            const obj = JSON.parse(raw) as { name: string };
            if (obj?.name) {
              setPseudoLoggedIn(true);
              setPseudoName(obj.name);
              setUsername(obj.name);
            }
          }
        } catch { /* ignore */ }
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pseudoLoggedIn]);

  // Sync after modal success: poll for Firebase, else infer backend-only success and set pseudo
  const syncAfterModalClose = async () => {
    // small poll window for Firebase
    for (let i = 0; i < 20; i++) {
      if (auth.currentUser) return; // onAuthStateChanged will set username
      await new Promise((r) => setTimeout(r, 50));
    }

    // Still no Firebase; try backend directory
    const idInput = (emailRef.current?.value || '').trim();
    const typedName = (nameRef.current?.value || '').trim();
    if (!idInput && !typedName) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/show-user/?_=${Date.now()}`, withFrontendKey());
      const data = await res.json();
      const lower = idInput.toLowerCase();

      const found = (data?.users || []).find((u: any) => {
        const uname = String(u.username || u.first_name || u.name || '').toLowerCase().trim();
        const email = String(u.email || '').toLowerCase().trim();
        return (
          (!!email && email === lower) ||
          (!!uname && (uname === lower || uname === typedName.toLowerCase()))
        );
      });

      if (found) {
        const niceName =
          found.name ||
          found.username ||
          found.first_name ||
          (found.email ? String(found.email).split('@')[0] : 'User');

        setPseudoLoggedIn(true);
        setPseudoName(niceName);
        setUsername(niceName);
        try {
          localStorage.setItem('pseudo_session', JSON.stringify({ name: niceName }));
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  };

  const handleLogout = async () => {
    try {
      // Clear pseudo first
      setPseudoLoggedIn(false);
      setPseudoName('');
      setUsername('');
      try {
        localStorage.removeItem('pseudo_session');
      } catch {}

      await signOut(auth);
    } catch {
      /* ignore */
    }
  };

  /* =============================== Derivations =============================== */

  const { cats, subs, prods } = useMemo(() => {
    const cats: Cat[] = [];
    const subs: Sub[] = [];
    const prods: Prod[] = [];
    navData.forEach((cat) => {
      cats.push({ id: cat.id, name: cat.name, url: cat.url, images: cat.images || [] });
      cat.subcategories?.forEach((sub) => {
        subs.push({
          id: sub.id,
          name: sub.name,
          url: sub.url,
          images: sub.images || [],
          catId: cat.id,
          catName: cat.name,
        });
        sub.products?.forEach((p) => {
          prods.push({
            id: p.id,
            name: p.name,
            url: p.url,
            images: p.images || [],
            catId: cat.id,
            catName: cat.name,
            subId: sub.id,
            subName: sub.name,
          });
        });
      });
    });
    return { cats, subs, prods };
  }, [navData]);

  const quickBadges = useMemo<string[]>(
    () => (navData || []).map((c) => c.name),
    [navData]
  );

  /* ============================== Fuzzy Search =============================== */

  const norm = (s: string) =>
    s.toLowerCase().normalize('NFKD').replace(/\p{Diacritic}/gu, '');

  function editDistance(a: string, b: string) {
    const al = a.length;
    const bl = b.length;
    const INF = al + bl;
    const da: Record<string, number> = {};
    const d = Array.from({ length: al + 2 }, () => Array(bl + 2).fill(0));
    d[0][0] = INF;
    for (let i = 0; i <= al; i++) {
      d[i + 1][1] = i;
      d[i + 1][0] = INF;
    }
    for (let j = 0; j <= bl; j++) {
      d[1][j + 1] = j;
      d[0][j + 1] = INF;
    }
    for (let i = 1; i <= al; i++) {
      let db = 0;
      for (let j = 1; j <= bl; j++) {
        const i1 = da[b[j - 1]] || 0;
        const j1 = db;
        let cost = 1;
        if (a[i - 1] === b[j - 1]) {
          cost = 0;
          db = j;
        }
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
    const A = norm(a);
    const B = norm(b);
    if (!A || !B) return 0;
    if (B.includes(A)) {
      return Math.min(1, 0.8 + Math.max(0, (A.length / B.length) * 0.2));
    }
    const dist = editDistance(A, B);
    const maxLen = Math.max(A.length, B.length);
    return 1 - dist / Math.max(1, maxLen);
  };

  type Scored<T> = { item: T; score: number };

  function topMatches<T extends { name: string }>(
    arr: T[],
    q: string,
    minScore = 0.45,
    limit = 50
  ): Scored<T>[] {
    const Q = q.trim();
    if (!Q) return [];
    const Qn = norm(Q);
    const results: Scored<T>[] = [];
    for (const it of arr) {
      const s = similarity(Qn, it.name);
      if (s >= minScore) results.push({ item: it, score: s });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  function detectIntent(q: string) {
    const cm = topMatches(cats, q, 0.55, 5);
    const sm = topMatches(subs, q, 0.5, 5);
    const pm = topMatches(prods, q, 0.5, 5);

    const bestCat = cm[0];
    const bestSub = sm[0];
    const bestProd = pm[0];

    const includesBoost = (name: string) => (norm(name).includes(norm(q)) ? 0.05 : 0);

    const catScore = bestCat ? bestCat.score + includesBoost(bestCat.item.name) : 0;
    const subScore = bestSub ? bestSub.score + includesBoost(bestSub.item.name) : 0;
    const prodScore = bestProd ? bestProd.score + includesBoost(bestProd.item.name) : 0;

    if (bestCat && catScore >= subScore && catScore >= prodScore && catScore >= 0.58) {
      return { type: 'category' as const, target: bestCat.item, suggestions: cm.slice(1, 4) };
    }
    if (bestSub && subScore >= prodScore && subScore >= 0.55) {
      return { type: 'subcategory' as const, target: bestSub.item, suggestions: sm.slice(1, 4) };
    }
    if (bestProd && prodScore >= 0.55) {
      return { type: 'product' as const, target: bestProd.item, suggestions: pm.slice(1, 4) };
    }
    return { type: 'broad' as const, target: null, suggestions: [...cm, ...sm, ...pm].slice(0, 3) };
  }

  const intent = useMemo(() => detectIntent(debouncedQuery), [debouncedQuery, cats, subs, prods]);

  type ViewItem =
    | { kind: 'header'; key: string; text: string }
    | { kind: 'chips'; key: string; chips: { text: string }[] }
    | { kind: 'product'; key: string; prod: Prod };

  const viewItems = useMemo<ViewItem[]>(() => {
    if (!debouncedQuery) return [];

    const items: ViewItem[] = [];

    if (intent.type === 'category' && intent.target) {
      const cat = intent.target as Cat;
      items.push({ kind: 'header', key: `cat-${cat.id}`, text: cat.name });
      const subOfCat = subs.filter((s) => s.catId === cat.id);
      if (subOfCat.length) {
        items.push({
          kind: 'chips',
          key: `chips-cat-${cat.id}`,
          chips: subOfCat.map((s) => ({ text: s.name })),
        });
      }
      const prodsInCat = prods.filter((p) => p.catId === cat.id);
      prodsInCat.forEach((p) => items.push({ kind: 'product', key: `p-${p.id}`, prod: p }));
      return items;
    }

    if (intent.type === 'subcategory' && intent.target) {
      const sub = intent.target as Sub;
      items.push({ kind: 'header', key: `cat-${sub.catId}`, text: sub.catName });
      const siblings = subs.filter((s) => s.catId === sub.catId);
      if (siblings.length) {
        items.push({
          kind: 'chips',
          key: `chips-sub-${sub.id}`,
          chips: siblings.map((s) => ({ text: s.name })),
        });
      }
      const subProds = prods.filter((p) => p.subId === sub.id);
      subProds.forEach((p) => items.push({ kind: 'product', key: `p-${p.id}`, prod: p }));
      const catRemainder = prods.filter((p) => p.catId === sub.catId && p.subId !== sub.id);
      catRemainder.forEach((p) => items.push({ kind: 'product', key: `p2-${p.id}`, prod: p }));
      return items;
    }

    if (intent.type === 'product' && intent.target) {
      const prodHit = intent.target as Prod;
      items.push({ kind: 'header', key: `cat-${prodHit.catId}`, text: prodHit.catName });
      const siblings = subs.filter((s) => s.catId === prodHit.catId);
      if (siblings.length) {
        items.push({
          kind: 'chips',
          key: `chips-prod-${prodHit.id}`,
          chips: siblings.map((s) => ({ text: s.name })),
        });
      }
      const subProds = prods.filter((p) => p.subId === prodHit.subId);
      const sortedSubProds = [prodHit, ...subProds.filter((p) => p.id !== prodHit.id)];
      sortedSubProds.forEach((p) => items.push({ kind: 'product', key: `p-${p.id}`, prod: p }));
      const catRemainder = prods.filter((p) => p.catId === prodHit.catId && p.subId !== prodHit.subId);
      catRemainder.forEach((p) => items.push({ kind: 'product', key: `p2-${p.id}`, prod: p }));
      return items;
    }

    // Broad fallback
    const scored = topMatches(prods, debouncedQuery, 0.45, 200);
    const grouped = new Map<ID, { catName: string; items: Prod[] }>();
    for (const { item } of scored) {
      if (!grouped.has(item.catId)) grouped.set(item.catId, { catName: item.catName, items: [] });
      grouped.get(item.catId)!.items.push(item);
    }
    for (const [catId, group] of grouped.entries()) {
      items.push({ kind: 'header', key: `cat-${String(catId)}`, text: group.catName });
      const subOfCat = subs.filter((s) => s.catId === catId);
      if (subOfCat.length) {
        items.push({
          kind: 'chips',
          key: `chips-broad-${String(catId)}`,
          chips: subOfCat.map((s) => ({ text: s.name })),
        });
      }
      group.items.forEach((p) => items.push({ kind: 'product', key: `p-${p.id}`, prod: p }));
    }
    return items;
  }, [debouncedQuery, intent, prods, subs]);

  const didYouMean = useMemo(() => {
    if (!debouncedQuery) return [];
    if ((intent as any).type === 'broad') {
      return (intent as any).suggestions.map((s: any) => s.item.name);
    }
    const extras = (intent as any).suggestions?.map((s: any) => s.item.name).filter((n: string) => !!n) || [];
    return extras.slice(0, 3);
  }, [intent, debouncedQuery]);

  const visibleItems = useMemo(() => {
    const list: ViewItem[] = [];
    let count = 0;
    for (const it of viewItems) {
      if (it.kind === 'product') {
        count++;
        if (count > loadedCount) break;
      }
      list.push(it);
    }
    return list;
  }, [viewItems, loadedCount]);

  const onChipClick = (text: string) => {
    setSearchQuery(text);
    setShowSearch(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const safeUrl = (url: string | undefined, fallback: string) => (url && url.trim().length > 0 ? url : fallback);

  return (
    // Force Poppins regardless of global config
    <div style={{ fontFamily: 'var(--font-poppins), Arial, Helvetica, sans-serif' }}>
      {/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between p-4 bg-[#891F1A] text-white fixed top-0 left-0 right-0 z-30">
        <button onClick={() => setIsMenuOpen(true)} aria-label="Open menu" className="font-medium">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex-1 flex justify-center">
          <SafeImage
            src={mobileLogoUrl}
            alt="Printshop logo"
            width={100}
            height={32}
            loading="lazy"
            className="h-8 w-auto object-contain"
            onError={(e: any) => {
              // SafeImage forwards to <img>, keep a robust fallback
              try { e.currentTarget.src = LOCAL_LOGO_WHITE; } catch {}
            }}
          />
        </div>
        <div className="text-sm font-medium">+971-123-456-789</div>
      </div>

      {/* Overlay */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        className={`fixed top-0 right-0 h-full bg-white text-black z-50 transition-transform duration-300 ease-in-out shadow-2xl w-3/5 max-w-xs transform ${
          isMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label="Mobile menu"
      >
        <div className="flex flex-col h-full overflow-y-auto">
          <button onClick={() => setIsMenuOpen(false)} className="self-end p-4 font-medium" aria-label="Close menu">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Search */}
          <div className="px-4 mb-3" ref={searchWrapRef}>
            <div
              className="relative"
              onClick={() => {
                setShowSearch(true);
                searchInputRef.current?.focus();
              }}
            >
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setShowSearch(true)}
                placeholder={loading ? 'Loading items…' : 'Type to explore...'}
                className="w-full py-2 pl-10 pr-4 border rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 text-black font-normal"
                aria-label="Search"
                disabled={loading}
              />
              <svg className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* DROPDOWN PANEL */}
            {showSearch && (
              <div
                className="mt-2 w-full bg-white rounded-lg border border-gray-200 shadow-lg z-50"
                role="listbox"
                aria-label="Search suggestions"
              >
                <p className="px-3 pt-2 text-[11px] text-gray-500 font-light">
                  {loading && 'Fetching catalog…'}
                  {!loading && !error && quickBadges.length > 0 && 'Quick categories:'}
                  {!loading && !error && quickBadges.length === 0 && 'No categories found.'}
                  {error && <span className="text-red-600 font-normal">{error}</span>}
                </p>

                {quickBadges.length > 0 && (
                  <div className="px-3 pb-2 pt-1 flex flex-wrap gap-2 border-b border-gray-100">
                    {quickBadges.slice(0, 10).map((b) => (
                      <button
                        key={b}
                        type="button"
                        className="text-[11px] rounded-full px-2.5 py-1 transition text-white bg-[#8B1C1C] hover:bg-[#6f1414] font-medium"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onChipClick(b);
                        }}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                )}

                {debouncedQuery && didYouMean.length > 0 && (
                  <div className="px-3 py-2 text-[11px] text-gray-600 border-b border-gray-100">
                    <span className="font-light">Did you mean: </span>
                    {didYouMean.map((s, i) => (
                      <button
                        key={s + i}
                        className="underline decoration-dotted mr-2 hover:text-[#8B1C1C] font-medium"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSearchQuery(s);
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                {debouncedQuery ? (
                  <div ref={scrollerRef} className="max-h-72 overflow-y-auto">
                    {visibleItems.length ? (
                      <ul className="divide-y divide-gray-100">
                        {visibleItems.map((it) => {
                          if (it.kind === 'header') {
                            return (
                              <li key={it.key} className="py-1 bg-white text-black sticky top-0 z-10">
                                <h3 className="px-3 py-1 text-[11px] font-medium uppercase text-red-700">
                                  {it.text}
                                </h3>
                              </li>
                            );
                          }
                          if (it.kind === 'chips') {
                            return (
                              <li key={it.key} className="px-3 py-2 bg-white text-black">
                                <div className="flex flex-wrap gap-2">
                                  {it.chips.map((c, idx) => (
                                    <button
                                      key={c.text + idx}
                                      className="text-[11px] rounded-full px-2.5 py-1 bg-gray-100 hover:bg-gray-200 font-medium"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        onChipClick(c.text);
                                      }}
                                    >
                                      {c.text}
                                    </button>
                                  ))}
                                </div>
                              </li>
                            );
                          }
                          const p = it.prod;
                          const imgObj = p.images?.[0];
                          const img = imgObj?.url || '/images/default.jpg';
                          const alt = imgObj?.alt_text || p.name || 'Product';
                          return (
                            <li key={it.key}>
                              <Link
                                href={safeUrl(p.url, `/home/${slugify(p.catName)}/${slugify(p.subName)}/products/${p.id}`)}
                                className="block px-3 py-3 hover:bg-gray-50"
                                onClick={() => setIsMenuOpen(false)}
                              >
                                <div className="flex items-center gap-3">
                                  <SafeImg
                                    src={img}
                                    alt={alt}
                                    className="w-12 h-12 rounded-md object-cover shrink-0"
                                    width={48}
                                    height={48}
                                    onError={(e) => {
                                      const t = e.target as HTMLImageElement;
                                      (t as any).onerror = null;
                                      t.src = '/images/default.jpg';
                                    }}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <span className="block font-medium text-sm text-gray-900 truncate">
                                      {p.name}
                                    </span>
                                    <small className="text-[11px] text-gray-600 font-light">
                                      {p.subName} • <span className="text-gray-500">{p.catName}</span>
                                    </small>
                                  </div>
                                </div>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="px-3 py-5 text-sm text-gray-500 font-normal">
                        No matches for “{searchQuery}”. Try another keyword.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="px-3 py-3 text-[11px] text-gray-500 font-light">
                    Start typing a <strong className="font-bold text-red-700">Category</strong>,
                    <strong className="font-bold text-red-700"> Subcategory</strong>, or a
                    <strong className="font-bold text-red-700"> Product</strong>.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Categories */}
          <nav className="border-b border-gray-300 pb-4 px-4" aria-label="Mobile categories">
            <h2 className="text-base font-semibold mb-2">Categories</h2>
            <ul className="space-y-2">
              {navData.map((cat) => {
                // Prefer backend-provided slug if present
                const catSlug = cat.url || slugify(cat.name);
                const catUrl = `/home/${catSlug}`;
                return (
                  <li key={String(cat.id)}>
                    <div className="flex justify-between items-center">
                      <Link
                        href={catUrl}
                        className="font-medium hover:text-red-700"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        {cat.name}
                      </Link>
                      {cat.subcategories?.length > 0 && (
                        <button
                          onClick={() => toggleCategory(cat.name)}
                          aria-label="Toggle subcategories"
                          className="font-medium"
                        >
                          <svg
                            className={`w-4 h-4 transition-transform ${expandedCategory === cat.name ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      )}
                    </div>
                    {expandedCategory === cat.name && (
                      <ul className="mt-1 pl-4 space-y-1 text-sm text-gray-700">
                        {cat.subcategories?.map((sub) => {
                          const subSlug = sub.url || slugify(sub.name);
                          const subUrl = `/home/${catSlug}/${subSlug}`;
                          return (
                            <li key={String(sub.id)}>
                              <Link
                                href={subUrl}
                                className="hover:underline font-medium"
                                onClick={() => setIsMenuOpen(false)}
                              >
                                {sub.name}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Info and Actions */}
          <section className="flex flex-col space-y-3 px-4 py-4 text-sm">
            <p className="font-normal">
              <span className="font-medium">Email:</span> hi@printshop.com
            </p>
            <Link href="/home" className="hover:text-gray-700 font-medium" onClick={() => setIsMenuOpen(false)}>Home</Link>
            <Link href="/about" className="hover:text-gray-700 font-medium" onClick={() => setIsMenuOpen(false)}>About</Link>
            <Link href="/checkout2" className="hover:text-gray-700 font-medium" onClick={() => setIsMenuOpen(false)}>Cart</Link>
            <Link href="/orders" className="hover:text-gray-700 font-medium" onClick={() => setIsMenuOpen(false)}>My Orders</Link>
            <Link href="/blog" className="hover:text-gray-700 font-medium" onClick={() => setIsMenuOpen(false)}>Blog</Link>
            <Link href="/contact" className="hover:text-gray-700 font-medium" onClick={() => setIsMenuOpen(false)}>Contact</Link>
            <small className="font-light">UAE</small>

            <div className="login-signup">
              {!(firebaseUser || pseudoLoggedIn) ? (
                <button onClick={() => openModal('signin')} className="flex items-center py-1.5 w/full font-medium">
                  <SafeImage
                    src="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/icons/person.svg"
                    alt="Login"
                    width={20}
                    height={20}
                    loading="lazy"
                    className="mr-2"
                  />
                  <span className="text-sm text-black">Login</span>
                </button>
              ) : (
                <div className="flex items-center py-1.5 justify-between">
                  <div className="flex items-center">
                    <SafeImage
                      src="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/icons/person.svg"
                      alt="User"
                      width={20}
                      height={20}
                      loading="lazy"
                      className="mr-2"
                    />
                    <span className="text-sm text-black font-normal">{username || pseudoName || 'User'}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="ml-3 text-xs px-3 py-1 rounded-full bg-[#8B1C1C] text-white font-medium hover:bg-[#6f1414]"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      </aside>

      {/* Auth Modal */}
      <LoginModal
        isVisible={isModalVisible}
        mode={modalMode}
        nameRef={nameRef}
        emailRef={emailRef}
        passwordRef={passwordRef}
        onClose={() => setIsModalVisible(false)}
        onAuth={async () => {
          await syncAfterModalClose();
        }}
        toggleMode={toggleModalMode}
      />
    </div>
  );
}
