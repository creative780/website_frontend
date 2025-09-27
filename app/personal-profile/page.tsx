"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";

// Layout components
import { ChatBot } from "../components/ChatBot";
import Footer from "../components/Footer";
import Header from "../components/header";
import LogoSection from "../components/LogoSection";
import Navbar from "../components/Navbar";

// Firebase (Auth + Firestore)
import { auth, db } from "../lib/firebase";
import {
  onAuthStateChanged,
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateEmail,
  updatePassword,
  updateProfile,
  reload,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

// Local-only avatar storage key
const picKey = (uid?: string) => (uid ? `profile_picture_${uid}` : "profile_picture");

// Emirates ID helpers
const EMIRATES_ID_REGEX = /^784-\d{4}-\d{7}-\d$/;
const formatEmiratesId = (raw: string) => {
  const digits = raw.replace(/\D/g, "").slice(0, 15);
  const g1 = digits.slice(0, 3);
  const g2 = digits.slice(3, 7);
  const g3 = digits.slice(7, 14);
  const g4 = digits.slice(14, 15);
  let out = g1;
  if (g2) out += "-" + g2;
  if (g3) out += "-" + g3;
  if (g4) out += "-" + g4;
  return out;
};

// Small UI helpers
const SectionCard: React.FC<React.PropsWithChildren<{ title: string; subtitle?: string }>> = ({
  title,
  subtitle,
  children,
}) => (
  <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
    <div className="mb-4">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      {subtitle ? <p className="text-sm text-gray-500 mt-1">{subtitle}</p> : null}
    </div>
    {children}
  </div>
);

const Label: React.FC<React.PropsWithChildren<{ htmlFor?: string }>> = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1">
    {children}
  </label>
);

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function InputBase({ className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#891f1a]/70 ${className}`}
        {...props}
      />
    );
  }
);

const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost" }
> = ({ variant = "primary", className = "", ...props }) => {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition focus:outline-none";
  const styles =
    variant === "primary"
      ? "bg-[#ff5858] text-white hover:bg-[#e94b4b]"
      : variant === "outline"
      ? "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
      : "text-gray-700 hover:bg-gray-100";
  return <button className={`${base} ${styles} ${className}`} {...props} />;
};

export default function PersonalProfile() {
  const router = useRouter();

  // 🔐 AUTH GATE
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = onAuthStateChanged(auth, (u) => {
        const ok = !!u;
        setIsAuthed(ok);
        if (!ok) {
          toast.warn("Please sign in to access your profile.");
          router.replace("/home"); // or "/home?login=1"
        }
      });
    } catch {
      setIsAuthed(false);
      router.replace("/home");
    }
    return () => {
      try {
        unsub();
      } catch {}
    };
  }, [router]);

  // Auth state
  const [uid, setUid] = useState<string | null>(null);
  const [currentEmail, setCurrentEmail] = useState<string>("");
  const [emailVerified, setEmailVerified] = useState<boolean>(false);
  const [displayName, setDisplayName] = useState<string>("");

  // Editable profile fields (stored in Firestore)
  const [email, setEmail] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const [emiratesId, setEmiratesId] = useState<string>("");

  // Emirates ID error state
  const [emiratesError, setEmiratesError] = useState<string>("");

  // Reauth / security
  const [passwordGate, setPasswordGate] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>("");

  // Local-only profile image
  const [profilePic, setProfilePic] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAuthedMemo = useMemo(() => isAuthed === true, [isAuthed]);

  // ---------- Firestore helpers ----------
  const userRef = useCallback((id: string) => doc(db, "users", id), []);

  const upsertUser = useCallback(
    async (id: string, data: Record<string, any>) => {
      // Merge = true → idempotent create/update
      await setDoc(userRef(id), { ...data, updated_at: serverTimestamp() }, { merge: true });
    },
    [userRef]
  );

  const readUser = useCallback(
    async (id: string) => {
      const snap = await getDoc(userRef(id));
      return snap.exists() ? snap.data() : null;
    },
    [userRef]
  );

  // ---------- Bootstrap after auth ----------
  useEffect(() => {
    if (!isAuthedMemo) return;

    const u = auth.currentUser;
    if (!u) {
      setUid(null);
      return;
    }
    setUid(u.uid);
    setCurrentEmail(u.email || "");
    setEmailVerified(!!u.emailVerified);
    setDisplayName(u.displayName || "");
    setEmail(u.email || "");

    // Load profile pic from localStorage
    try {
      const cached = localStorage.getItem(picKey(u.uid));
      if (cached) setProfilePic(cached);
    } catch {}

    (async () => {
      // 1) Upsert base user doc
      try {
        await upsertUser(u.uid, {
          user_id: u.uid,
          email: u.email || "",
          name: u.displayName || "",
          username: u.displayName || u.email || u.uid,
          is_verified: !!u.emailVerified,
          created_at: serverTimestamp(),
        });
      } catch (e: any) {
        toast.error(e?.message || "Failed to initialize your profile in Firestore");
      }

      // 2) Read extended profile fields
      try {
        const me = await readUser(u.uid);
        if (me) {
          setPhone(me.phone_number || me.phone || "");
          setAddress(me.address || "");
          const eid = me.emirates_id || me.emiratesId || "";
          setEmiratesId(eid ? formatEmiratesId(String(eid)) : "");
          if (!displayName && (me.username || me.first_name))
            setDisplayName(me.username || me.first_name || "");
        }
      } catch (e: any) {
        toast.warn(e?.message || "Could not load your saved profile");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthedMemo]);

  // ---------- Reauth (provider-aware) ----------
  const reauthSmart = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) throw new Error("Not authenticated");
    const hasPasswordProvider = (u.providerData || []).some((p) => p.providerId === "password");
    if (hasPasswordProvider) {
      if (!u.email) throw new Error("No email on file");
      if (!passwordGate) throw new Error("Password is required for this action");
      const cred = EmailAuthProvider.credential(u.email, passwordGate);
      return reauthenticateWithCredential(u, cred);
    }
    const hasGoogle = (u.providerData || []).some((p) => p.providerId === "google.com");
    if (hasGoogle) {
      const provider = new GoogleAuthProvider();
      return reauthenticateWithPopup(u, provider);
    }
    throw new Error("Reauthentication method not available. Sign out and sign in again.");
  }, [passwordGate]);

  // ---------- Status refresh ----------
  const refreshStatus = async () => {
    try {
      const u = auth.currentUser;
      if (!u) throw new Error("Not authenticated");
      await reload(u);
      setCurrentEmail(u.email || "");
      setEmailVerified(!!u.emailVerified);
      toast.success("Status refreshed.");
    } catch (e: any) {
      toast.error(e?.message || "Failed to refresh");
    }
  };

  // ---------- Save actions ----------
  const saveName = async () => {
    try {
      await reauthSmart();
      const u = auth.currentUser;
      if (!u) throw new Error("No auth user");

      await updateProfile(u, { displayName });
      await reload(u);

      await upsertUser(u.uid, {
        name: displayName || "",
        username: displayName || u.email || u.uid,
        is_verified: !!u.emailVerified,
      });

      toast.success("Name updated");
    } catch (e: any) {
      const msg =
        e?.code === "auth/user-mismatch"
          ? "Reauth failed: account provider mismatch."
          : e?.code === "auth/invalid-credential"
          ? "Reauth failed: invalid credentials."
          : e?.message || "Failed to update name";
      toast.error(msg);
    }
  };

  const saveEmail = async () => {
    try {
      await reauthSmart();
      const u = auth.currentUser;
      if (!u) throw new Error("No auth user");

      await updateEmail(u, email.trim());
      await sendEmailVerification(u, {
        url: typeof window !== "undefined" ? window.location.origin : undefined,
      });
      await reload(u);
      setCurrentEmail(u.email || email);
      setEmailVerified(!!u.emailVerified);

      await upsertUser(u.uid, {
        email: email.trim(),
        is_verified: !!u.emailVerified,
      });

      toast.success("Email updated. Verification link sent.");
    } catch (e: any) {
      const msg =
        e?.code === "auth/requires-recent-login"
          ? "Please reauthenticate to change your email."
          : e?.message || "Failed to update email";
      toast.error(msg);
    }
  };

  const validateEmiratesId = (value: string) => {
    if (!value) {
      setEmiratesError("");
      return true; // optional
    }
    if (!EMIRATES_ID_REGEX.test(value)) {
      setEmiratesError("Invalid Emirates ID. Required format: 784-YYYY-NNNNNNN-C");
      return false;
    }
    setEmiratesError("");
    return true;
  };

  const saveContact = async () => {
    if (!validateEmiratesId(emiratesId)) {
      toast.error("Fix Emirates ID format first.");
      return;
    }
    try {
      const u = auth.currentUser;
      if (!u) throw new Error("No auth user");

      const payload: any = {
        phone_number: phone,
        address,
        is_verified: !!u.emailVerified,
      };
      if (emiratesId) payload.emirates_id = emiratesId;

      // upsert (no reauth required for these fields)
      await upsertUser(u.uid, payload);

      toast.success("Contact info updated");
    } catch (e: any) {
      toast.error(e?.message || "Failed to update contact info");
    }
  };

  const savePassword = async () => {
    if (!newPassword) return toast.error("Enter a new password");
    if (newPassword !== confirmNewPassword) return toast.error("Passwords do not match");
    try {
      await reauthSmart();
      const u = auth.currentUser;
      if (!u) throw new Error("No auth user");
      await updatePassword(u, newPassword);
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordGate("");
      toast.success("Password updated");
    } catch (e: any) {
      const msg =
        e?.code === "auth/weak-password"
          ? "Weak password (min 6 chars)."
          : e?.message || "Failed to update password";
      toast.error(msg);
    }
  };

  const forgotPassword = async () => {
    try {
      const mail = auth.currentUser?.email || email || currentEmail;
      if (!mail) return toast.error("No email found for your account");
      await sendPasswordResetEmail(auth, mail);
      toast.success(`Password reset link sent to ${mail}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to send reset email");
    }
  };

  const resendVerification = async () => {
    try {
      const u = auth.currentUser;
      if (!u) return toast.error("Not signed in");
      await sendEmailVerification(u, {
        url: typeof window !== "undefined" ? window.location.origin : undefined,
      });
      toast.success(`Verification email sent to ${u.email}`);
    } catch (e: any) {
      toast.error(e?.message || "Could not send verification");
    }
  };

  // Local-only avatar
  const onSelectPic = async (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setProfilePic(dataUrl);
      try {
        const key = picKey(uid || undefined);
        localStorage.setItem(key, dataUrl);
        toast.success("Profile picture saved locally");
      } catch {
        toast.error("Could not save image to local storage");
      }
    };
    reader.readAsDataURL(file);
  };

  const GateHint = (
    <p className="text-xs text-gray-500 mt-2">
      These changes require your current sign-in to be re-verified.
      <button onClick={forgotPassword} className="ml-1 underline text-[#891f1a]">
        Forgot password
      </button>
      .
    </p>
  );

  const emiratesOk = !emiratesError && (!emiratesId || EMIRATES_ID_REGEX.test(emiratesId));

  if (isAuthed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xl text-gray-600">
        Checking sign-in…
      </div>
    );
  }
  if (isAuthed === false) return null;

  return (
    <>
      {/* Top Components */}
      <Header />
      <LogoSection />
      <Navbar />

      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
          {/* Header block */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">Personal Profile</h1>
              <p className="text-sm text-gray-600 mt-1">
                Manage your identity, contact details, and security preferences.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={refreshStatus}>
                Refresh status
              </Button>
              {!emailVerified ? (
                <Button variant="outline" onClick={resendVerification}>
                  Send verification link
                </Button>
              ) : (
                <span className="inline-flex items-center gap-1 text-sm text-green-700">
                  <span className="h-2 w-2 rounded-full bg-green-600" /> Email verified
                </span>
              )}
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left column: Avatar */}
            <div className="lg:col-span-1">
              <SectionCard title="Profile Picture" subtitle="Stored locally in your browser">
                <div className="flex items-center gap-4">
                  <div className="relative h-24 w-24 overflow-hidden rounded-full border border-gray-200 bg-gray-100">
                    {profilePic ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profilePic} alt="Profile" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-gray-400">
                        No Image
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => onSelectPic(e.currentTarget.files?.[0])}
                    />
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                      Upload
                    </Button>
                    {profilePic ? (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setProfilePic(null);
                          try {
                            localStorage.removeItem(picKey(uid || undefined));
                          } catch {}
                        }}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  This image does not sync to the server. Clearing browser storage will remove it.
                </p>
              </SectionCard>
            </div>

            {/* Right column: Forms */}
            <div className="lg:col-span-2 space-y-6">
              <SectionCard title="Identity">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="displayName">Name</Label>
                    <Input
                      id="displayName"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      type="email"
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="gate">Current password (only if your account uses password)</Label>
                    <Input
                      id="gate"
                      value={passwordGate}
                      onChange={(e) => setPasswordGate(e.target.value)}
                      type="password"
                      placeholder="••••••••"
                    />
                    {GateHint}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button onClick={saveName}>Save Name</Button>
                  <Button variant="outline" onClick={saveEmail}>
                    Save Email
                  </Button>
                </div>
              </SectionCard>

              <SectionCard title="Contact">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="phone">Phone number</Label>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      inputMode="tel"
                      placeholder="03xx-xxxxxxx"
                    />
                  </div>
                  <div>
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Street, City, Country"
                    />
                  </div>

                  {/* Emirates ID */}
                  <div className="md:col-span-2">
                    <Label htmlFor="emiratesId">Emirates ID (Required format: 784-YYYY-NNNNNNN-C)</Label>
                    <Input
                      id="emiratesId"
                      value={emiratesId}
                      onChange={(e) => {
                        const formatted = formatEmiratesId(e.target.value);
                        setEmiratesId(formatted);
                        if (formatted && !EMIRATES_ID_REGEX.test(formatted)) {
                          setEmiratesError("Invalid Emirates ID. Required format: 784-YYYY-NNNNNNN-C");
                        } else {
                          setEmiratesError("");
                        }
                      }}
                      onBlur={(e) => validateEmiratesId(e.target.value)}
                      placeholder="784-YYYY-NNNNNNN-C"
                      inputMode="numeric"
                    />
                    {emiratesError ? (
                      <p className="text-xs text-red-600 mt-1">{emiratesError}</p>
                    ) : (
                      <p className="text-xs text-gray-500 mt-1">Only this format is acceptable.</p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <Button onClick={saveContact} disabled={!emiratesOk && !!emiratesId}>
                    Save Contact
                  </Button>
                </div>
              </SectionCard>

              <SectionCard title="Security" subtitle="Update your password (Firebase only)">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="current-pass">Current password (if applicable)</Label>
                    <Input
                      id="current-pass"
                      value={passwordGate}
                      onChange={(e) => setPasswordGate(e.target.value)}
                      type="password"
                      placeholder="••••••••"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-pass">New password</Label>
                    <Input
                      id="new-pass"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      type="password"
                      placeholder="At least 6 characters"
                    />
                  </div>
                  <div>
                    <Label htmlFor="confirm-pass">Confirm new password</Label>
                    <Input
                      id="confirm-pass"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      type="password"
                      placeholder="Repeat new password"
                    />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button onClick={savePassword}>Update Password</Button>
                  <Button variant="outline" onClick={forgotPassword}>
                    Forgot password? Send reset link
                  </Button>
                </div>
              </SectionCard>

              <SectionCard title="Account Status">
                <div className="flex flex-col gap-2 text-sm text-gray-700">
                  <div className="flex items-center gap-2">
                    <span className="w-28 text-gray-500">User ID</span>
                    <span className="font-mono text-xs break-all">{uid}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-28 text-gray-500">Current Email</span>
                    <span>{currentEmail}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-28 text-gray-500">Verified</span>
                    <span className={emailVerified ? "text-green-700" : "text-amber-700"}>
                      {emailVerified ? "Yes" : "No"}
                    </span>
                  </div>
                </div>
              </SectionCard>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Components */}
      <Footer />
      <ChatBot />
    </>
  );
}
