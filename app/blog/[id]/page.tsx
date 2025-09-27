"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { API_BASE_URL } from "../../utils/api";
import Header from "../../components/header";
import LogoSection from "../../components/LogoSection";
import Navbar from "../../components/Navbar";
import MobileTopBar from "../../components/HomePageTop";
import Footer from "../../components/Footer";
import { Checkbox } from "@mui/material";

// ---- Frontend key helper ----
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (FRONTEND_KEY) headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};

// ------------------------------------------

type BlogPost = {
  id: string | number;
  blog_id?: string | number;
  title: string;
  slug: string;
  thumbnail?: string | null;
  metaDescription?: string;
  description?: string;
  author?: string;
  category?: string;
  status?: string;
  created_at?: string | null;
  updated_at?: string | null;
  publishDate?: string | null;
  content: string;
};

type CommentItem = {
  id: string | number;
  name: string;
  date: string;
  message: string;
  website?: string;
  blog_id?: string | number | null;
  blog_slug?: string | null;
};

// ---- Validation caps ----
const MAX_NAME = 30;
const MAX_EMAIL = 50;
const MAX_COMMENT = 175;

export default function BlogPage() {
  const params = useParams<{ id: string }>();
  const blogIdOrSlug = params?.id;

  const [loading, setLoading] = useState(true);
  const [article, setArticle] = useState<BlogPost | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState<boolean>(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);

  // Comment form
  const [form, setForm] = useState({
    name: "",
    email: "",
    website: "",
    comment: "",
    remember: false,
  });
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // --- Comments horizontal scroll helpers ---
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const updateScrollAffordance = () => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, clientWidth, scrollWidth } = el;
    const atStart = scrollLeft <= 0;
    const atEnd = scrollLeft + clientWidth >= scrollWidth - 1;
    setCanScroll({ left: !atStart, right: !atEnd });
  };

  const scrollByCards = (dir: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const firstCard = el.querySelector<HTMLElement>("[data-comment-card]");
    const delta = firstCard ? firstCard.offsetWidth + 24 : el.clientWidth * 0.9;
    el.scrollBy({ left: dir * delta, behavior: "smooth" });
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollAffordance();

    const onScroll = () => updateScrollAffordance();
    el.addEventListener("scroll", onScroll, { passive: true });

    const ro = new ResizeObserver(() => updateScrollAffordance());
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [comments.length]);

  // ----- Load specific blog by ID first; on 404, try slug -----
  useEffect(() => {
    if (!blogIdOrSlug) return;

    let alive = true;

    (async () => {
      setLoading(true);
      setLoadError(null);

      const tryFetch = async (query: string) => {
        const url = `${API_BASE_URL}/api/show-specific-blog/?${query}&all=1`;
        const res = await fetch(url, withFrontendKey());
        return { res, url };
      };

      try {
        // 1) Try as blog_id (what your route expects)
        let { res, url } = await tryFetch(
          `blog_id=${encodeURIComponent(blogIdOrSlug)}`
        );

        if (res.status === 404) {
          // 2) Retry as slug (in case your path segment is actually the slug)
          ({ res, url } = await tryFetch(`slug=${encodeURIComponent(blogIdOrSlug)}`));
        }

        if (typeof window !== "undefined" && !res.ok) {
          let body = "";
          try {
            body = await res.text();
          } catch {}
          // eslint-disable-next-line no-console
          console.error("show-specific-blog", res.status, url, body || "(no body)");
        }

        if (res.status === 401 || res.status === 403) {
          throw new Error(
            "Unauthorized. Check X-Frontend-Key / CORS config on backend and NEXT_PUBLIC_FRONTEND_KEY on frontend."
          );
        }

        if (res.status === 404) {
          throw new Error(
            "Blog not found or unpublished (even with all=1). Check the ID/slug or publish state."
          );
        }

        if (!res.ok) {
          throw new Error(`Fetch failed: HTTP ${res.status}`);
        }

        const data = (await res.json()) as BlogPost;

        if (alive) {
          const normalized: BlogPost = {
            ...data,
            id: (data as any).blog_id ?? data.id,
          };
          setArticle(normalized);
        }
      } catch (e: any) {
        if (alive) {
          setLoadError(e?.message || "Failed to load blog");
          setArticle(null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [blogIdOrSlug]);

  // ----- Remember me: hydrate on mount -----
  useEffect(() => {
    try {
      const cached = localStorage.getItem("blog_comment_profile");
      if (cached) {
        const p = JSON.parse(cached);
        setForm((s) => ({
          ...s,
          name: p.name || "",
          email: p.email || "",
          website: p.website || "",
          remember: true,
        }));
      }
    } catch {
      /* no-op */
    }
  }, []);

  // ----- Fetch comments whenever the active article changes -----
  useEffect(() => {
    if (!article?.id) return;
    let alive = true;

    const normalize = (raw: any): CommentItem | null => {
      if (!raw) return null;
      const id =
        raw.id ??
        raw._id ??
        `${raw.name || "anon"}-${raw.created || raw.date || Date.now()}`;
      const name = raw.name || raw.author || "Anonymous";
      const date = raw.date || raw.created || raw.timestamp || new Date().toISOString();
      const message = raw.message || raw.comment || raw.content || "";
      const website = raw.website || raw.url || undefined;
      const blog_id = raw.blog_id ?? null;
      const blog_slug = raw.blog_slug ?? null;
      if (!message) return null;
      return { id, name, date, message, website, blog_id, blog_slug };
    };

    (async () => {
      setCommentsLoading(true);
      setCommentsError(null);
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/show-all-comments/?blog_id=${encodeURIComponent(
            String(article.id)
          )}`,
          withFrontendKey()
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list: CommentItem[] = (Array.isArray(data) ? data : [])
          .map(normalize)
          .filter(Boolean) as CommentItem[];
        setComments(list);
      } catch (e: any) {
        setCommentsError(e?.message || "Failed to load comments");
      } finally {
        if (alive) setCommentsLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [article]);

  const publishedAt =
    (article?.publishDate as string) ||
    (article?.created_at as string) ||
    (article?.updated_at as string) ||
    "";

  // ---- Client-side validation ----
  const validateForm = () => {
    const name = form.name.trim();
    const email = form.email.trim();
    const comment = form.comment.trim();

    if (!name || !email || !comment) {
      return "Please fill the required fields.";
    }
    if (name.length > MAX_NAME) {
      return `Name must be ${MAX_NAME} characters or fewer.`;
    }
    if (email.length > MAX_EMAIL) {
      return `Email must be ${MAX_EMAIL} characters or fewer.`;
    }
    if (comment.length > MAX_COMMENT) {
      return `Comment must be ${MAX_COMMENT} characters or fewer.`;
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitMsg(null);

    const validationError = validateForm();
    if (validationError) {
      setSubmitMsg(validationError);
      return;
    }

    try {
      if (form.remember) {
        localStorage.setItem(
          "blog_comment_profile",
          JSON.stringify({
            name: form.name.trim(),
            email: form.email.trim(),
            website: form.website.trim(),
          })
        );
      } else {
        localStorage.removeItem("blog_comment_profile");
      }
    } catch {
      /* non-blocking */
    }

    const optimistic: CommentItem = {
      id: `tmp-${Date.now()}`,
      name: form.name.trim(),
      date: new Date().toISOString(),
      message: form.comment.trim(),
      website: form.website.trim() || undefined,
      blog_id: article?.id ?? null,
      blog_slug: (article as any)?.slug ?? null,
    };

    setComments((prev) => [optimistic, ...prev]);
    setSubmitting(true);

    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        website: form.website.trim() || undefined,
        message: form.comment.trim(),
        blog_id: article?.id ?? undefined,
        blog_slug: (article as any)?.slug ?? undefined,
      };

      const res = await fetch(
        `${API_BASE_URL}/api/save-comments/`,
        withFrontendKey({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      );

      if (!res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
        throw new Error(`Save failed: HTTP ${res.status}`);
      }

      const saved = await res.json().catch(() => null);
      if (saved) {
        const normalized = {
          id: saved.id ?? optimistic.id,
          name: saved.name ?? optimistic.name,
          date: saved.date ?? saved.created ?? optimistic.date,
          message: saved.message ?? saved.comment ?? optimistic.message,
          website: saved.website ?? optimistic.website,
          blog_id: saved.blog_id ?? optimistic.blog_id,
          blog_slug: saved.blog_slug ?? optimistic.blog_slug,
        } as CommentItem;

        setComments((prev) => {
          const withoutOptimistic = prev.filter((c) => c.id !== optimistic.id);
          return [normalized, ...withoutOptimistic];
        });
      }

      setSubmitMsg("Thanks for the comment. It will appear after moderation.");
      setForm((s) => ({ ...s, comment: "" }));
    } catch (err: any) {
      setSubmitMsg(err?.message || "Failed to submit comment.");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (d: string) => {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-sm text-gray-600">Loading…</div>
    );
  }

  // Show errors explicitly (no silent 404s)
  if (loadError && !article) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-sm text-red-600 space-y-3">
        <div>{loadError}</div>
        <div className="text-gray-700">
          Checked both:
          <pre className="mt-2 p-3 bg-gray-50 border rounded overflow-auto text-gray-800">
{`${API_BASE_URL}/api/show-specific-blog/?blog_id=${String(blogIdOrSlug)}&all=1
${API_BASE_URL}/api/show-specific-blog/?slug=${String(blogIdOrSlug)}&all=1`}
          </pre>
          <ul className="list-disc pl-5 mt-2 text-gray-700">
            <li>Verify the value exists as either <code>blog_id</code> or <code>slug</code> in DB.</li>
            <li>If you still get 404, ensure the permission key isn’t causing a masked error and that the API route is reachable.</li>
          </ul>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-sm text-gray-600">
        No article found.
      </div>
    );
  }

  return (
    <div
      className="flex flex-col bg-white"
      style={{ fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif" }}
    >
      {!FRONTEND_KEY && process.env.NODE_ENV !== "production" && (
        <div className="bg-yellow-50 border-b border-yellow-200 text-yellow-900 text-sm px-4 py-2">
          Warning: NEXT_PUBLIC_FRONTEND_KEY is empty; backend may reject requests if FrontendOnlyPermission is enabled.
        </div>
      )}

      <Header />
      <LogoSection />
      <Navbar />
      <MobileTopBar />

      <div className="max-w-7xl bg-white mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Article Title */}
        <h1
          className="font-bold mb-2 text-black leading-tight"
          style={{ fontSize: "2.25rem" }}
        >
          {article.title}
        </h1>

        {/* Author */}
        {article.author && (
          <p className="text-sm text-black mb-4">Written by: {article.author}</p>
        )}

        {/* Blog Image */}
        {article.thumbnail && (
          <img
            src={article.thumbnail}
            alt={article.title}
            className="w-full md:w-2/3 lg:w-1/2 h-auto rounded mb-6 bg-white mx-auto block"
          />
        )}

        {/* Blog Content (HTML) */}
        <div
          className="prose max-w-none mb-6 prose-img:rounded prose-img:max-w-full prose-img:h-auto text-black text-lg sm:text-xl leading-loose tracking-wide"
          style={{ lineHeight: "2em" }}
          dangerouslySetInnerHTML={{ __html: article.content || "" }}
        />

        {/* Published Date */}
        {(article.publishDate || article.created_at || article.updated_at) && (
          <p className="text-sm text-gray-500">
            Published at:{" "}
            {article.publishDate || article.created_at || article.updated_at}
          </p>
        )}
      </div>

      {/* ---- Comment Box (above footer) ---- */}
      <section className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pb-8 mb-5">
        <div className="w-full rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">
            Leave a Reply
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Your email address will not be published. Required fields are marked{" "}
            <span className="text-red-500">*</span>
          </p>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="mb-3">
                <label className="block text-sm font-medium text-black mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={MAX_NAME}
                  value={form.name}
                  aria-invalid={form.name.trim().length > MAX_NAME}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, name: e.target.value }))
                  }
                  placeholder="Name"
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-[#891F1A] text-black"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {form.name.trim().length}/{MAX_NAME}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  maxLength={MAX_EMAIL}
                  value={form.email}
                  aria-invalid={form.email.trim().length > MAX_EMAIL}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, email: e.target.value }))
                  }
                  placeholder="Email"
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-[#891F1A] text-black"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {form.email.trim().length}/{MAX_EMAIL}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-1">
                  Website
                </label>
                <input
                  type="url"
                  value={form.website}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, website: e.target.value }))
                  }
                  placeholder="Website"
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-[#891F1A] text-black"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-800 mb-1">
                Add Comment <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={6}
                maxLength={MAX_COMMENT}
                value={form.comment}
                aria-invalid={form.comment.trim().length > MAX_COMMENT}
                onChange={(e) =>
                  setForm((s) => ({ ...s, comment: e.target.value }))
                }
                placeholder="Add Comment"
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-[#891F1A] text-black resize-none"
              />
              <div className="mt-1 flex justify-between text-xs text-gray-500">
                <span>{form.comment.trim().length}/{MAX_COMMENT}</span>
                <span>Keep it concise.</span>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <Checkbox
                checked={form.remember}
                onChange={(e) =>
                  setForm((s) => ({ ...s, remember: e.target.checked }))
                }
                sx={{
                  color: "#891F1A",
                  "&.Mui-checked": { color: "#891F1A" },
                }}
              />
              <label htmlFor="remember" className="text-sm text-gray-700">
                Save my name, email and website in this browser for the next time I
                comment.
              </label>
            </div>

            {submitMsg && (
              <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded px-3 py-2 mb-2">
                {submitMsg}
              </p>
            )}

            <div>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-md px-5 py-2.5 text-white bg-[#891F1A] font-medium hover:opacity-90 active:opacity-80 focus:outline-none focus:ring-2 focus:ring-[#891F1A] disabled:opacity-60"
              >
                {submitting ? "Posting…" : "Post Comment"}
              </button>
            </div>
          </form>
        </div>
      </section>
      {/* ---- /Comment Box ---- */}

      {/* ---- Comment Cards ---- */}
      <section className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pb-12 mb-30 ">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h3 className="text-lg sm:text-xl font-semibold text-gray-900">
            {commentsLoading
              ? "Loading comments…"
              : `${comments.length} Comment${comments.length !== 1 ? "s" : ""}`}
          </h3>

          {/* Arrows shown only when > 3 comments */}
          {comments.length > 3 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => scrollByCards(-1)}
                disabled={!canScroll.left}
                aria-label="Scroll comments left"
                className={`inline-flex h-9 w-9 items-center justify-center rounded border text-sm transition
                  ${
                    canScroll.left
                      ? "bg-white border-gray-300 hover:bg-gray-50 text-gray-800"
                      : "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
                title="Scroll left"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => scrollByCards(1)}
                disabled={!canScroll.right}
                aria-label="Scroll comments right"
                className={`inline-flex h-9 w-9 items-center justify-center rounded border text-sm transition
                  ${
                    canScroll.right
                      ? "bg-white border-gray-300 hover:bg-gray-50 text-gray-800"
                      : "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
                title="Scroll right"
              >
                ›
              </button>
            </div>
          )}
        </div>

        {/* If >3, render horizontal scroller; else keep grid */}
        {comments.length > 3 ? (
          <div
            ref={scrollRef}
            className="overflow-x-auto overscroll-x-contain pb-2 -mx-2 px-2"
          >
            <div
              className="flex gap-6 snap-x snap-mandatory"
              style={{ scrollBehavior: "smooth" }}
            >
              {comments.map((c) => (
                <article
                  key={c.id}
                  data-comment-card
                  className="snap-start shrink-0 w-[320px] sm:w-[360px] rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
                  aria-label={`Comment by ${c.name}`}
                >
                  <div className="flex items-center gap-4 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {c.name}
                      </p>
                      <p className="text-xs text-gray-500">{formatDate(c.date)}</p>
                    </div>
                  </div>

                  <p className="text-gray-800 text-sm leading-6 max-h-[150px] overflow-y-auto">
                    {c.message}
                  </p>

                  {c.website && (
                    <a
                      className="mt-3 inline-block text-sm underline underline-offset-4 text-gray-700 hover:text-gray-900 break-all"
                      href={c.website}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {c.website}
                    </a>
                  )}
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-h-[100px]">
            {comments.map((c) => (
              <article
                key={c.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
                aria-label={`Comment by ${c.name}`}
              >
                <div className="flex items-center gap-4 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {c.name}
                    </p>
                    <p className="text-xs text-gray-500">{formatDate(c.date)}</p>
                  </div>
                </div>

                <p className="text-gray-800 text-sm leading-6">{c.message}</p>

                {c.website && (
                  <a
                    className="mt-3 inline-block text-sm underline underline-offset-4 text-gray-700 hover:text-gray-900 break-all"
                    href={c.website}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {c.website}
                  </a>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      {/* ---- /Comment Cards ---- */}

      <Footer />
    </div>
  );
}
