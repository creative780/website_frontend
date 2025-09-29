"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { auth, googleProvider } from "../lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  fetchSignInMethodsForEmail,
  sendEmailVerification,
  sendPasswordResetEmail,
  reload,
  signOut,
  User,
} from "firebase/auth";
import { setDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { toast } from "react-toastify";
import { API_BASE_URL } from "../utils/api";
import { SafeImg } from "./SafeImage";

type AuthMode = "signup" | "signin";

type LoginModalProps = {
  isVisible: boolean;
  mode: AuthMode;
  nameRef: React.RefObject<HTMLInputElement>;
  emailRef: React.RefObject<HTMLInputElement>;
  passwordRef: React.RefObject<HTMLInputElement>;
  onClose: () => void;
  onAuth: () => Promise<void>;
  toggleMode: () => void;
};

/* ──────────────────────────────────────────────────────────
   Frontend key helper
   ────────────────────────────────────────────────────────── */
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};

/* ──────────────────────────────────────────────────────────
   Local icon assets (avoid third-party hosts -> better perf)
   Place small 20px PNG/SVGs in /public/icons
   ────────────────────────────────────────────────────────── */
const ICONS = {
  user: "/icons/user.png",
  email: "/icons/email.png",
  lock: "/icons/lock.png",
};

/* ──────────────────────────────────────────────────────────
   Validators
   ────────────────────────────────────────────────────────── */
const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const isLikelyUsername = (v: string) => {
  const s = v.trim();
  return s.length > 0 && !isValidEmail(s);
};

/* Redirect after Firebase-hosted verification page */
const VERIFICATION_CONTINUE_URL =
  (process.env.NEXT_PUBLIC_EMAIL_VERIFY_CONTINUE_URL || "").trim() ||
  (typeof window !== "undefined" ? window.location.origin : "https://app.click2print.store");

/* Humanize Firebase errors */
const humanizeFirebaseError = (err: any): string => {
  const msg = String(err?.message || err?.code || "Auth error").toLowerCase();
  if (msg.includes("email-already-in-use")) return "Email already in use. Please sign in.";
  if (msg.includes("invalid-email")) return "Invalid email address.";
  if (msg.includes("weak-password")) return "Password is too weak. Use a stronger one.";
  if (msg.includes("wrong-password")) return "Incorrect password.";
  if (msg.includes("user-not-found")) return "No account found for that email.";
  if (msg.includes("too-many-requests")) return "Too many attempts. Please try again later.";
  return "Authentication error. Please try again.";
};

const LoginModal: React.FC<LoginModalProps> = ({
  isVisible,
  mode,
  nameRef,
  emailRef,
  passwordRef,
  onClose,
  onAuth,
  toggleMode,
}) => {
  const isSignup = mode === "signup";

  // Controlled inputs
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  // ✅ Privacy Policy acceptance (required for signup)
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);

  // Username uniqueness (signup)
  const [nameUnique, setNameUnique] = useState<boolean | null>(null);
  const [nameCheckLoading, setNameCheckLoading] = useState(false);
  const nameDebounceTimer = useRef<number | null>(null);
  const nameAbortRef = useRef<AbortController | null>(null);

  // Email uniqueness (signup)
  const [emailUnique, setEmailUnique] = useState<boolean | null>(null);
  const [emailCheckLoading, setEmailCheckLoading] = useState(false);
  const emailDebounceTimer = useRef<number | null>(null);
  const emailAbortRef = useRef<AbortController | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Verification gate
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [verifEmail, setVerifEmail] = useState<string>("");

  // a11y: focus trap + initial focus + ESC close + body scroll lock
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isVisible) return;
    // lock scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // focus first control
    firstInputRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", handleKey);
    };
  }, [isVisible, onClose]);

  // Reset policy checkbox when switching modes
  useEffect(() => {
    setAcceptedPolicy(false);
  }, [mode]);

  // Keep external refs in sync
  useEffect(() => {
    if (nameRef.current) nameRef.current.value = name;
    if (emailRef.current) emailRef.current.value = identifier;
    if (passwordRef.current) passwordRef.current.value = password;
  }, [name, identifier, password, nameRef, emailRef, passwordRef]);

  // Debounced username check (backend) with abort safety
  useEffect(() => {
    if (!isSignup) {
      setNameUnique(null);
      setNameCheckLoading(false);
      nameAbortRef.current?.abort();
      return;
    }
    if (!name.trim()) {
      setNameUnique(null);
      setNameCheckLoading(false);
      nameAbortRef.current?.abort();
      return;
    }
    if (nameDebounceTimer.current) window.clearTimeout(nameDebounceTimer.current);
    setNameCheckLoading(true);

    nameDebounceTimer.current = window.setTimeout(async () => {
      try {
        nameAbortRef.current?.abort();
        const controller = new AbortController();
        nameAbortRef.current = controller;
        const res = await fetch(`${API_BASE_URL}/api/show-user/`, withFrontendKey({ signal: controller.signal }));
        const data = await res.json();
        const exists = (data?.users || []).some(
          (u: any) =>
            (u.username || u.first_name || "").toLowerCase().trim() ===
            name.toLowerCase().trim()
        );
        setNameUnique(!exists);
      } catch {
        setNameUnique(null);
      } finally {
        setNameCheckLoading(false);
      }
    }, 300);

    return () => {
      if (nameDebounceTimer.current) window.clearTimeout(nameDebounceTimer.current);
    };
  }, [name, isSignup]);

  // Debounced email check during SIGNUP (backend + Firebase) with abort safety
  useEffect(() => {
    if (!isSignup) {
      setEmailUnique(null);
      setEmailCheckLoading(false);
      emailAbortRef.current?.abort();
      return;
    }
    const email = identifier.trim();
    if (!email || !isValidEmail(email)) {
      setEmailUnique(null);
      setEmailCheckLoading(false);
      emailAbortRef.current?.abort();
      return;
    }

    if (emailDebounceTimer.current) window.clearTimeout(emailDebounceTimer.current);
    setEmailCheckLoading(true);

    emailDebounceTimer.current = window.setTimeout(async () => {
      try {
        emailAbortRef.current?.abort();
        const controller = new AbortController();
        emailAbortRef.current = controller;

        // Backend duplicate?
        const res = await fetch(`${API_BASE_URL}/api/show-user/`, withFrontendKey({ signal: controller.signal }));
        const data = await res.json();
        const existsInBackend = (data?.users || []).some(
          (u: any) => (u.email || "").trim().toLowerCase() === email.toLowerCase()
        );

        // Firebase duplicate?
        let existsInFirebase = false;
        try {
          const methods = await fetchSignInMethodsForEmail(auth, email);
          existsInFirebase = (methods || []).length > 0;
        } catch {
          /* ignore */
        }

        setEmailUnique(!(existsInBackend || existsInFirebase));
      } catch {
        setEmailUnique(null);
      } finally {
        setEmailCheckLoading(false);
      }
    }, 350);

    return () => {
      if (emailDebounceTimer.current) window.clearTimeout(emailDebounceTimer.current);
    };
  }, [identifier, isSignup]);

  // Gating
  const canSubmit = useMemo(() => {
    if (isSignup) {
      const base = name.trim().length > 0 && isValidEmail(identifier) && password.length > 0;
      const nameOk = nameUnique === null ? true : nameUnique === true;
      const emailOk = emailUnique === null ? true : emailUnique === true;
      return base && nameOk && emailOk && acceptedPolicy;
    }
    const hasId = isValidEmail(identifier) || isLikelyUsername(identifier);
    return hasId && password.length > 0;
  }, [isSignup, name, identifier, password, nameUnique, emailUnique, acceptedPolicy]);

  // --------- Backend / Firestore write-through (NO PASSWORDS SENT) ----------
  const saveUserToBackend = async ({
    user_id,
    email,
    username,
    name,
    is_verified,
  }: {
    user_id: string;
    email: string;
    username: string;
    name: string;
    is_verified: boolean;
  }) => {
    const response = await fetch(
      `${API_BASE_URL}/api/save-user/`,
      withFrontendKey({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id, email, username, name, is_verified }),
      })
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data?.error || "Backend save failed";
      if (String(msg).toLowerCase().includes("unique")) return; // ignore uniqueness race
      throw new Error(msg);
    }
  };

  const updateUserInBackend = async ({
    user_id,
    email,
    username,
    name,
    is_verified,
  }: {
    user_id: string;
    email?: string;
    username?: string;
    name?: string;
    is_verified?: boolean;
  }) => {
    const body: any = { user_id };
    if (email !== undefined) body.email = email;
    if (username !== undefined) body.username = username;
    if (name !== undefined) body.name = name;
    if (is_verified !== undefined) body.is_verified = is_verified;

    const response = await fetch(
      `${API_BASE_URL}/api/edit-user/`,
      withFrontendKey({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "Backend update failed");
    }
  };

  const saveUserToFirestore = async ({
    user_id,
    name,
    email,
  }: {
    user_id: string;
    name: string;
    email: string;
  }) => {
    try {
      await setDoc(doc(db, "users", user_id), {
        username: name,
        email,
        createdAt: new Date(),
      });
    } catch (err) {
      // Non-fatal
      // eslint-disable-next-line no-console
      console.error("Firestore save error:", err);
    }
  };

  // Google sign-in (enforce verified email)
  const handleGoogleLogin = async () => {
    try {
      setIsSubmitting(true);
      const result = await signInWithPopup(auth, googleProvider);
      const gname = result.user.displayName || "Google User";
      const gemail = result.user.email || "";
      const user_id = result.user.uid;

      await reload(result.user);
      if (!result.user.emailVerified) {
        try {
          await sendEmailVerification(result.user, { url: VERIFICATION_CONTINUE_URL });
        } catch {}
        await signOut(auth);
        toast.info("We sent a verification email to your Google account. Verify and try again.");
        setAwaitingVerification(true);
        setVerifEmail(gemail);
        return;
      }

      await saveUserToBackend({
        user_id,
        email: gemail,
        username: gname || gemail || user_id,
        name: gname,
        is_verified: true,
      });
      await saveUserToFirestore({ user_id, name: gname, email: gemail });

      toast.success(`Welcome ${gname}!`);
      await onAuth();
      onClose();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Google sign-in error:", error);
      toast.error(humanizeFirebaseError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resolveEmailForIdentifier = async (idRaw: string) => {
    const id = idRaw.trim();
    if (isValidEmail(id)) return id;
    // username -> email via backend
    try {
      const usersRes = await fetch(`${API_BASE_URL}/api/show-user/`, withFrontendKey());
      const usersData = await usersRes.json();
      const matched = (usersData?.users || []).find(
        (u: any) =>
          (u.username || u.first_name || "").toLowerCase().trim() === id.toLowerCase()
      );
      return matched?.email || "";
    } catch {
      return "";
    }
  };

  // Resend + recheck verification
  const resendVerification = async () => {
    const user = auth.currentUser;
    if (!user) {
      toast.error("No user session to verify.");
      return;
    }
    try {
      await sendEmailVerification(user, { url: VERIFICATION_CONTINUE_URL });
      toast.success(`Verification email sent to ${user.email}.`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      toast.error("Failed to send verification email.");
    }
  };

  const finalizeSignupAfterVerification = async (user: User, username: string) => {
    try {
      await saveUserToFirestore({ user_id: user.uid, name: username, email: user.email || "" });
    } catch {}
    try {
      await saveUserToBackend({
        user_id: user.uid,
        email: user.email || "",
        username: username || user.email || user.uid,
        name: username,
        is_verified: true,
      });
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (!msg.toLowerCase().includes("unique")) throw e;
    }
    await onAuth();
    onClose();
  };

  const recheckVerification = async () => {
    const user = auth.currentUser;
    if (!user) {
      toast.error("No user session.");
      return;
    }
    try {
      await reload(user);
      if (user.emailVerified) {
        toast.success("Email verified. You’re good to go.");
        setAwaitingVerification(false);
        await finalizeSignupAfterVerification(user, name);
      } else {
        toast.info("Still not verified. Check your inbox or resend.");
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      toast.error("Could not refresh verification state.");
    }
  };

  // Forgot password (from modal)
  const handleForgotPassword = async () => {
    const id = identifier.trim();
    const email = isValidEmail(id) ? id : await resolveEmailForIdentifier(id);
    if (!email) {
      toast.error("Enter your email or username first.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success(`Password reset link sent to ${email}`);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error(e);
      toast.error(humanizeFirebaseError(e));
    }
  };

  const handleAuth = async () => {
    if (isSignup) {
      if (!name.trim()) return toast.error("Username is required.");
      if (!isValidEmail(identifier)) return toast.error("Enter a valid email.");
      if (!password) return toast.error("Password is required.");
      if (!acceptedPolicy) return toast.error("You must accept the Privacy & Policy to sign up.");
      if (emailUnique === false) return toast.error("Email already exists. Please sign in.");
      if (nameUnique === false) return toast.error("Username is taken.");
    } else {
      if (!(isValidEmail(identifier) || isLikelyUsername(identifier)))
        return toast.error("Enter your email or username.");
      if (!password) return toast.error("Password is required.");
    }

    try {
      setIsSubmitting(true);

      if (isSignup) {
        const email = identifier.trim();

        // Firebase must succeed
        let createdUser: User | null = null;
        try {
          const result = await createUserWithEmailAndPassword(auth, email, password);
          createdUser = result.user;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("Firebase signup failed:", e);
          toast.error(humanizeFirebaseError(e));
          return;
        }

        // Send verification and gate
        try {
          await sendEmailVerification(createdUser, { url: VERIFICATION_CONTINUE_URL });
          toast.success(`Verification email sent to ${createdUser.email}. Check your inbox.`);
          setAwaitingVerification(true);
          setVerifEmail(createdUser.email || email);
          return; // Wait until verified; persist after verification
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("sendEmailVerification error:", e);
          toast.error("Failed to send verification email. Try again later.");
          return;
        }
      } else {
        // SIGN IN — block unverified
        const email = await resolveEmailForIdentifier(identifier);
        if (!email) {
          toast.error("No email found for that identifier.");
          return;
        }

        try {
          const result = await signInWithEmailAndPassword(auth, email, password);
          await reload(result.user);
          if (!result.user.emailVerified) {
            try {
              await sendEmailVerification(result.user, { url: VERIFICATION_CONTINUE_URL });
            } catch {}
            await signOut(auth);
            toast.info("Please verify your email to continue. We’ve sent you a verification link.");
            setAwaitingVerification(true);
            setVerifEmail(email);
            return;
          }

          // Verified → ensure backend record
          try {
            await updateUserInBackend({
              user_id: result.user.uid,
              email,
              username: result.user.displayName || email || result.user.uid,
              name: result.user.displayName || "",
              is_verified: true,
            });
          } catch {
            try {
              await saveUserToBackend({
                user_id: result.user.uid,
                email,
                username: result.user.displayName || email || result.user.uid,
                name: result.user.displayName || "",
                is_verified: true,
              });
            } catch {}
          }

          toast.success(`Signed in as ${result.user.displayName || result.user.email}`);
          await onAuth();
          onClose();
        } catch (e: any) {
          const code = String(e?.code || "").toLowerCase();
          if (code.includes("user-not-found")) {
            toast.error("No Firebase account found for this email. Please sign up first.");
          } else if (code.includes("wrong-password")) {
            toast.error("Incorrect password.");
          } else if (code.includes("too-many-requests")) {
            toast.error("Too many attempts. Please try again later.");
          } else {
            toast.error(humanizeFirebaseError(e));
          }
          return;
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Auth error:", error);
      toast.error(isSignup ? "Sign-up failed." : "Sign-in failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = useCallback(
    (active: boolean) =>
      `w-full p-3 border rounded-md focus:outline-none focus:ring-2 mb-2 ${
        active
          ? "text-white placeholder-white border-white bg-transparent md:text-black md:placeholder-gray-500 md:border-gray-300 md:bg-white"
          : "text-black placeholder-gray-500 border-gray-300 bg-white"
      }`,
    []
  );

  if (!isVisible) return null;

  return (
    <div
      id="authModal"
      style={{ fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif" }}
      className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center px-4"
      onClick={(e) => {
        if ((e.target as HTMLElement).id === "authModal") onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-heading"
      aria-describedby="auth-desc"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-[860px] rounded-[20px] overflow-hidden bg-white flex flex-col md:flex-row shadow-[0_0_30px_rgba(0,0,0,0.2)]"
      >
        {/* Left Panel */}
        <section
          className="hidden md:flex md:flex-1 bg-[#891f1a] text-white p-10 flex-col justify-center items-center text-center"
          aria-label="Mode switch panel"
        >
          <h2 id="auth-heading" className="text-[26px] font-semibold mb-5">
            {isSignup ? "Welcome Back!" : "Hello, Friend!"}
          </h2>
          <p id="auth-desc" className="text-sm font-normal mb-5">
            {isSignup
              ? "To keep connected with us please login with your personal info"
              : "Enter your personal details and start your journey with us"}
          </p>
          <button
            type="button"
            onClick={toggleMode}
            className="bg-white text-black font-medium px-6 py-3 rounded-full text-base"
          >
            {isSignup ? "SIGN IN" : "SIGN UP"}
          </button>
        </section>

        {/* Right Panel */}
        <section
          className={`md:flex-1 p-6 md:p-10 flex flex-col justify-center items-center text-center w-full ${
            isSignup ? "bg-[#891f1a] text-white md:bg-white md:text-black" : "bg-white text-black"
          }`}
          aria-label={isSignup ? "Create account" : "Sign in"}
        >
          <h3 className="text-[22px] md:text-[26px] font-semibold mb-4 md:mb-5">
            {isSignup ? (
              <>
                Create Account{" "}
                <SafeImg src={ICONS.user} alt="" className="inline-block w-5 h-5 align-middle" loading="lazy" />
              </>
            ) : (
              <>
                Sign In{" "}
                <SafeImg src={ICONS.lock} alt="" className="inline-block w-7 h-7 align-middle" loading="lazy" />
              </>
            )}
          </h3>

          <p className="text-sm font-normal mb-4 md:mb-5">
            {isSignup ? "or use your email for registration" : "or use your account"}
          </p>

          <form
            className="w-full max-w-[520px]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!isSubmitting && canSubmit) void handleAuth();
            }}
            noValidate
          >
            {isSignup && (
              <div className="w-full">
                <div className="relative w-full">
                  <SafeImg
                    src={ICONS.user}
                    alt=""
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none"
                    loading="lazy"
                  />
                  <input
                    ref={(el) => {
                      if (!firstInputRef.current) firstInputRef.current = el!;
                      if (nameRef) (nameRef as any).current = el;
                    }}
                    type="text"
                    placeholder="Username"
                    className={`${inputClass(isSignup)} pl-10`}
                    aria-label="Username"
                    required
                    aria-required="true"
                    aria-invalid={nameUnique === false}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="username"
                  />
                </div>
                {name ? (
                  <div className="w-full text-left text-xs mb-2" role="status" aria-live="polite">
                    {nameCheckLoading ? (
                      <span className="opacity-70">Checking availability…</span>
                    ) : nameUnique === false ? (
                      <span className="text-red-600">Username is taken</span>
                    ) : nameUnique === true ? (
                      <span className="text-green-600">Username available</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}

            <div className="relative w-full">
              <SafeImg
                src={ICONS.email}
                alt=""
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none"
                loading="lazy"
              />
              <input
                ref={(el) => {
                  if (!isSignup && !firstInputRef.current) firstInputRef.current = el!;
                  if (emailRef) (emailRef as any).current = el;
                }}
                type={isSignup ? "email" : "text"}
                placeholder={isSignup ? "Email" : "Email or Username"}
                className={`${inputClass(isSignup)} pl-10`}
                aria-label={isSignup ? "Email" : "Email or Username"}
                autoComplete={isSignup ? "email" : "username"}
                required
                aria-required="true"
                aria-invalid={
                  isSignup ? (identifier.length > 0 && !isValidEmail(identifier)) || emailUnique === false : false
                }
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                inputMode={isSignup ? "email" : "text"}
              />
            </div>
            {isSignup && identifier ? (
              <div className="w-full text-left text-xs mb-2" role="status" aria-live="polite">
                {!isValidEmail(identifier) ? (
                  <span className="text-red-600">Enter a valid email</span>
                ) : emailCheckLoading ? (
                  <span className="opacity-70">Checking email…</span>
                ) : emailUnique === false ? (
                  <span className="text-red-600">Email already in use</span>
                ) : emailUnique === true ? (
                  <span className="text-green-600">Email available</span>
                ) : null}
              </div>
            ) : null}

            <div className="relative w-full">
              <SafeImg
                src={ICONS.lock}
                alt=""
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none"
                loading="lazy"
              />
              <input
                ref={passwordRef}
                type="password"
                placeholder="Password"
                className={`${inputClass(isSignup)} pl-10 mb-2`}
                aria-label="Password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                required
                aria-required="true"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
              />
            </div>

            {/* 🔗 Forgot password inline helper */}
            {!isSignup && (
              <div className="w-full text-right -mt-1 mb-3">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs text-[#891F1A] underline hover:text-red-600"
                >
                  Forget Password
                </button>
              </div>
            )}

            {/* ✅ Privacy Policy consent */}
            {isSignup && (
              <div className="w-full mt-2 mb-4 text-left">
                <label className="relative inline-flex items-start gap-3 cursor-pointer select-none">
                  <input
                    id="accept-privacy"
                    type="checkbox"
                    checked={acceptedPolicy}
                    onChange={(e) => setAcceptedPolicy(e.target.checked)}
                    className="absolute left-0 top-0 h-5 w-5 opacity-0 z-10 cursor-pointer"
                    aria-required="true"
                    aria-invalid={!acceptedPolicy}
                  />
                  <span
                    className={`relative inline-flex h-5 w-5 items-center justify-center border border-[#891F1A] rounded-[2px] ${
                      acceptedPolicy ? "bg-[#891F1A]" : "bg-white"
                    }`}
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 16 16" className={`h-3 w-3 ${acceptedPolicy ? "opacity-100" : "opacity-0"}`}>
                      <path d="M3 8.5l3 3 7-7" fill="none" stroke="white" strokeWidth="2" />
                    </svg>
                  </span>
                  <span className="text-xs md:text-sm leading-5 text-black-500">
                    I verify that I accept{" "}
                    <a
                      href="/privacy-policy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-bold text-[#891F1A] hover:text-red-600"
                    >
                      Privacy &amp; Policy
                    </a>
                  </span>
                </label>
              </div>
            )}

            {!isSignup && (
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isSubmitting}
                className="cursor-pointer flex items-center justify-center gap-2 w-full px-4 py-3 mb-4 border border-gray-300 rounded-full hover:bg-gray-100 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Sign in with Google"
              >
                <SafeImg
                  src="/images/google.svg"
                  alt=""
                  className="w-5 h-5"
                  loading="lazy"
                  width={20}
                  height={20}
                />
                <span className="text-sm font-normal text-black">Sign in with Google</span>
              </button>
            )}

            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              aria-disabled={!canSubmit || isSubmitting}
              className={`${
                !canSubmit || isSubmitting ? "opacity-50 cursor-not-allowed" : ""
              } bg-[#ff5858] hover:bg-[#e94b4b] transition text-white font-medium px-6 py-3 rounded-full text-base mb-3 w-full`}
              title={
                !canSubmit
                  ? isSignup
                    ? !acceptedPolicy
                      ? "Please accept the Privacy & Policy to continue"
                      : "Enter a unique username, a valid unique email, and a password"
                    : "Enter your email/username plus password"
                  : ""
              }
            >
              {isSubmitting ? (isSignup ? "CREATING..." : "SIGNING IN...") : isSignup ? "SIGN UP" : "SIGN IN"}
            </button>
          </form>

          <button
            type="button"
            onClick={toggleMode}
            className="bg-white text-black font-medium px-6 py-3 rounded-full text-sm md:text-base block md:hidden"
          >
            {isSignup ? "Already have an account? SIGN IN" : "Don't have an account? SIGN UP"}
          </button>

          {/* Verification Gate */}
          {awaitingVerification && (
            <div
              className="mt-4 w-full max-w-[520px] text-left text-sm border rounded-lg p-3 bg-[#891F1A] text-white border-amber-200"
              role="status"
              aria-live="polite"
            >
              <div className="font-semibold mb-1">Verify your email</div>
              <div className="mb-2">
                We sent a verification link to <span className="font-medium">{verifEmail || identifier}</span>. Open it,
                then click “I’ve verified” below.
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={resendVerification} className="px-3 py-2 border rounded-md hover:bg-white">
                  Resend
                </button>
                <button
                  type="button"
                  onClick={recheckVerification}
                  className="px-3 py-2 bg-white text-[#891F1A] rounded-md border border-white"
                >
                  I’ve verified, recheck
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default LoginModal;
