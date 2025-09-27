"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LoginModal from "./LoginModal";
import { API_BASE_URL } from "../utils/api";

/* ---------- FRONTEND KEY helper ---------- */
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};

/* ---------- Logo helpers ---------- */
const LOCAL_LOGO_FALLBACK = "/images/logo.png";
const normalizeLogoUrl = (u?: string) => {
  const v = (u || "").trim();
  if (!v) return LOCAL_LOGO_FALLBACK;
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  if (v.startsWith("/")) return `${API_BASE_URL}${v}`;
  if (v.startsWith("media/") || v.startsWith("uploads/")) return `${API_BASE_URL}/${v}`;
  return LOCAL_LOGO_FALLBACK;
};

type TempHeaderProps = {
  user?: unknown | null;
  pseudoLoggedIn?: boolean;
  openModal?: (type: "signin" | "signup") => void;
  username?: string;
  pseudoName?: string;
  handleLogout?: () => void | Promise<void>;
};

const noop = () => {};

export default function TempHeader({
  user = null,
  pseudoLoggedIn = false,
  openModal = noop,
  username,
  pseudoName,
  handleLogout = noop,
}: TempHeaderProps) {
  const router = useRouter();

  // ===== Modal state =====
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const triggerModal = (m: "signin" | "signup" = "signin") => {
    setMode(m);
    setIsModalVisible(true);
    try {
      openModal(m);
    } catch {}
  };

  const closeModal = () => setIsModalVisible(false);
  const toggleMode = () => setMode((p) => (p === "signin" ? "signup" : "signin"));

  // ===== User menu behavior =====
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!userMenuRef.current) return;
      const target = e.target as Node;
      if (!userMenuRef.current.contains(target)) setUserMenuOpen(false);
    }
    if (userMenuOpen) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [userMenuOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setUserMenuOpen(false);
    }
    if (userMenuOpen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [userMenuOpen]);

  const isAuthed = Boolean(user || pseudoLoggedIn);
  const displayName = username || pseudoName || "User";
  const closeMenu = () => setUserMenuOpen(false);
  const onMenuToggleClick = () => setUserMenuOpen((v) => !v);
  const onMenuToggleKeyDown: React.KeyboardEventHandler<HTMLButtonElement> = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setUserMenuOpen((v) => !v);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setUserMenuOpen(true);
    }
  };
  const onLogout = async () => {
    closeMenu();
    try {
      await Promise.resolve(handleLogout());
    } catch {}
  };

  /* -------- Fetch logo from backend (ShowLogo API) -------- */
  const [logoUrl, setLogoUrl] = useState<string>(LOCAL_LOGO_FALLBACK);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/show-logo/?_=${Date.now()}`,
          withFrontendKey({ cache: "no-store" })
        );
        const json = res.ok ? await res.json() : null;
        const url = normalizeLogoUrl(json?.logo?.url);
        if (!cancelled) setLogoUrl(url);
      } catch {
        if (!cancelled) setLogoUrl(LOCAL_LOGO_FALLBACK);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <header
        className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-200 hidden lg:block"
        style={{ fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif" }}
      >
        <div className="mx-auto px-4 sm:px-6 lg:px-6 xl:px-8 max-w-[1200px] xl:max-w-[1360px] 2xl:max-w-[1536px]">
          <div className="flex items-center gap-2 py-2 sm:py-3 lg:py-4">
            {/* Left: Back Button */}
            <div className="flex items-center justify-start -ml-4 sm:-ml-6 lg:-ml-2 xl:-ml-4 shrink-0">
              <button
                onClick={() => router.back()}
                className="inline-flex items-center gap-2 rounded-full px-3 sm:px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition"
                aria-label="Go back"
                type="button"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M12.78 15.22a.75.75 0 01-1.06 0l-5-5a.75.75 0 010-1.06l5-5a.75.75 0 111.06 1.06L8.06 9l4.72 4.72a.75.75 0 010 1.06z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="hidden sm:inline">Back</span>
              </button>
            </div>

            {/* Center: Logo (fetched) */}
            <div className="flex-1 min-w-0 flex items-center justify-center">
              <Link href="/home" className="inline-block" aria-label="Creative Prints Home">
                <img
                  src={logoUrl}
                  alt="Printshop logo"
                  className="h-auto w-10 sm:w-36 lg:w-[180px] xl:w-[180px] 2xl:w-[200px] max-w-full"
                  onError={(e) => {
                    const el = e.currentTarget as HTMLImageElement;
                    el.onerror = null;
                    el.src = LOCAL_LOGO_FALLBACK;
                  }}
                />
              </Link>
            </div>

            {/* Right: Buttons / Links */}
            <div className="flex items-center justify-end shrink-0 min-w-0">
              <div className="flex flex-row gap-1 sm:gap-3 lg:gap-2 xl:gap-3 px-0 lg:flex-wrap xl:flex-nowrap items-center">
                {!isAuthed ? (
                  <button
                    onClick={() => triggerModal("signin")}
                    className="cursor-pointer flex items-center gap-2 bg-[#8B1C1C] hover:bg-[#6f1414] text-white text-xs font-medium px-6 sm:px-8 lg:px-5 xl:px-8 py-1.5 rounded-full transition-all duration-200 shadow-sm hover:shadow-md"
                    type="button"
                    aria-label="Open cart (requires sign in)"
                  >
                    <img
                      src="https://img.icons8.com/?size=100&id=ii6Lr4KivOiE&format=png&color=FFFFFF"
                      alt="Cart"
                      width={20}
                      height={20}
                      className="w-5 h-5"
                    />
                    <span className="whitespace-nowrap text-sm font-medium text-white">Cart</span>
                  </button>
                ) : (
                  <Link
                    href="/checkout2"
                    className="cursor-pointer flex items-center gap-2 bg-[#8B1C1C] hover:bg-[#6f1414] text-white text-xs font-medium px-6 sm:px-8 lg:px-5 xl:px-8 py-1.5 rounded-full transition-all duration-200 shadow-sm hover:shadow-md"
                    aria-label="Open cart"
                  >
                    <img
                      src="https://img.icons8.com/?size=100&id=ii6Lr4KivOiE&format=png&color=FFFFFF"
                      alt="Cart"
                      width={20}
                      height={20}
                      className="w-5 h-5"
                    />
                    <span className="whitespace-nowrap text-sm font-medium text-white">Cart</span>
                  </Link>
                )}

                <Link
                  href="/blog"
                  className="cursor-pointer flex items-center gap-2 bg-[#8B1C1C] hover:bg-[#6f1414] text-white text-xs font-medium px-0 sm:px-5 lg:px-4 xl:px-5 py-1.5 rounded-full transition-all duration-200 shadow-sm hover:shadow-md"
                  aria-label="Blog"
                >
                  <img
                    src="https://img.icons8.com/?size=100&id=WX84CKOI9WcJ&format=png&color=FFFFFF"
                    alt="Blog"
                    width={20}
                    height={20}
                    className="w-5 h-5"
                  />
                  <span className="whitespace-nowrap text-sm font-medium text-white">Blog</span>
                </Link>

                <Link href="/contact" className="flex gap-2 items-center flex-nowrap" aria-label="Contact">
                  <img
                    src="https://img.icons8.com/?size=100&id=Ib9FADThtmSf&format=png&color=000000"
                    alt="Help Centre icon"
                    width={20}
                    height={20}
                    className="w-5 h-5"
                  />
                  <span className="whitespace-nowrap text-sm font-medium text-black">Contact</span>
                </Link>

                <div className="hidden sm:flex gap-2 items-center">
                  <img
                    src="https://img.icons8.com/?size=100&id=s7eHaFDy5Rqu&format=png&color=000000"
                    alt="UAE icon"
                    width={21}
                    height={21}
                    className="w-[21px] h-[21px]"
                  />
                  <span className="whitespace-nowrap text-sm font-medium text-black">
                    <a href="/about">About</a>
                  </span>
                </div>

                <div className="login-signup flex items-center gap-4">
                  {!isAuthed ? (
                    <button
                      onClick={() => triggerModal("signin")}
                      className="admin-link focus:outline-none"
                      aria-label="Open login modal"
                      type="button"
                    >
                      <div className="flex items-center admin-panel">
                        <img
                          src="https://img.icons8.com/?size=100&id=4kuCnjaqo47m&format=png&color=000000"
                          alt="Login"
                          width={20}
                          height={20}
                          className="mr-1"
                        />
                        <span className="whitespace-nowrap text-sm font-medium text-black">Login</span>
                      </div>
                    </button>
                  ) : (
                    // ================= USER MENU =================
                    <div className="relative" ref={userMenuRef}>
                      <button
                        ref={menuButtonRef}
                        onClick={onMenuToggleClick}
                        onKeyDown={onMenuToggleKeyDown}
                        aria-haspopup="menu"
                        aria-expanded={userMenuOpen}
                        aria-controls="user-menu"
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-gray-100 transition"
                        type="button"
                      >
                        <img
                          src="https://img.icons8.com/?size=100&id=2oz92AdXqQrC&format=png&color=000000"
                          alt="User Profile"
                          width={20}
                          height={20}
                          className="ml-2"
                        />
                        <span className="whitespace-nowrap text-sm font-medium text-black">
                          {displayName}
                        </span>
                        <svg
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className={`w-4 h-4 transition-transform ${userMenuOpen ? "rotate-180" : ""}`}
                          aria-hidden="true"
                        >
                          <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.217l3.71-3.0a.75.75 0 111.04 1.08l-4.24 3.43a.75.75 0 01-.98 0L5.21 8.29a.75.75 0 01.02-1.08z" />
                        </svg>
                      </button>

                      {userMenuOpen && (
                        <div
                          id="user-menu"
                          role="menu"
                          className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden"
                        >
                          <Link
                            href="/orders"
                            role="menuitem"
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-800"
                            onClick={closeMenu}
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
                            onClick={closeMenu}
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
                            onClick={onLogout}
                            className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-800"
                            type="button"
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
          </div>
        </div>
      </header>

      {/* ===== Login Modal ===== */}
      <LoginModal
        isVisible={isModalVisible}
        mode={mode}
        nameRef={nameRef}
        emailRef={emailRef}
        passwordRef={passwordRef}
        onClose={closeModal}
        onAuth={async () => {
          closeModal();
        }}
        toggleMode={toggleMode}
      />
    </>
  );
}
