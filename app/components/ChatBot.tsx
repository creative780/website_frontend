"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Minus, MessageCircle, ChevronRight } from "lucide-react";

// util
const cls = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

const nowTime = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// IMPORTANT: Make sure this really points to Django (e.g., "http://127.0.0.1:8000")
import { API_BASE_URL } from "../utils/api";

type Msg = { id: number; type: "bot" | "user"; text: string; time: string };

// ---- Frontend key helpers ----
const FRONTEND_KEY = (process.env.NEXT_PUBLIC_FRONTEND_KEY || "").trim();
const withFrontendKey = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers || {});
  if (!FRONTEND_KEY) {
    console.warn(
      "NEXT_PUBLIC_FRONTEND_KEY is empty; requests may be forbidden."
    );
  }
  headers.set("X-Frontend-Key", FRONTEND_KEY);
  return { ...init, headers };
};

// Shared fetch helpers (strict JSON + CORS)
const readAsJsonOrThrow = async (res: Response) => {
  const contentType = res.headers.get("content-type") || "";
  const bodyText = await res.text();

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(bodyText);
    } catch {}
  }
  try {
    return JSON.parse(bodyText);
  } catch {
    const snippet = bodyText.slice(0, 300).replace(/\s+/g, " ");
    throw new Error(
      `Expected JSON but got ${res.status} ${res.statusText}. Content-Type="${contentType}". First chars: "${snippet}"`
    );
  }
};

const fetchJSON = async (url: string, init?: RequestInit) => {
  if (!API_BASE_URL || API_BASE_URL.startsWith("/") || API_BASE_URL === "") {
    throw new Error(
      `API_BASE_URL appears invalid ("${API_BASE_URL}"). It must be an absolute URL to your Django server.`
    );
  }
  const baseInit: RequestInit = {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    mode: "cors",
    ...init,
  };
  const finalInit = withFrontendKey(baseInit);
  const res = await fetch(url, finalInit);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} from ${url}`);
  }
  return readAsJsonOrThrow(res);
};

// Reduced motion
const useReducedMotion = () => {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reducedMotion;
};

// Header
const ChatHeader = ({
  botName,
  onClose,
  ariaCloseLabel,
}: {
  botName: string;
  onClose: () => void;
  ariaCloseLabel: string;
}) => (
  <header className="p-5 flex items-center justify-between bg-gradient-to-r from-[#891F1A] to-[#a52a24] rounded-t-[28px] md:rounded-t-3xl">
    <div className="flex items-center space-x-4">
      <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg">
        <MessageCircle className="w-6 h-6 text-[#891F1A]" />
      </div>
      <div>
        <h3 className="text-white font-bold text-lg">{botName}</h3>
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse" />
          <span className="text-white/90 text-sm font-normal">Online</span>
        </div>
      </div>
    </div>
    <button
      onClick={onClose}
      aria-label={ariaCloseLabel}
      className="text-white/80 hover:text-white hover:bg-white/20 rounded-full w-10 h-10 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-white/30"
    >
      <Minus className="w-5 h-5" />
    </button>
  </header>
);

// Empty State
const EmptyState = () => (
  <div className="flex flex-col items-center justify-center h-full text-center p-8">
    <div className="w-16 h-16 bg-gradient-to-r from-[#891F1A] to-[#a52a24] rounded-full flex items-center justify-center mb-4 shadow-lg">
      <MessageCircle className="w-8 h-8 text-white" />
    </div>
    <h3 className="text-lg font-semibold text-gray-800 mb-2">
      Welcome to CreativeAI
    </h3>
    <p className="text-sm text-gray-600 max-w-xs">
      Start a conversation by typing a message below or selecting a quick
      prompt.
    </p>
  </div>
);

// Message
const MessageBubble = ({
  message,
  isUser,
  showTime,
}: {
  message: Msg;
  isUser: boolean;
  showTime: boolean;
}) => (
  <article className={cls("flex", isUser ? "justify-end" : "justify-start")}>
    <div
      className={cls(
        "flex flex-col max-w-[85%] md:max-w-[80%]",
        isUser ? "items-end" : "items-start"
      )}
    >
      <div
        className={cls(
          "px-4 py-3 rounded-2xl text-sm leading-relaxed break-words",
          isUser
            ? "bg-[#891F1A] text-white rounded-br-md"
            : "bg-white/60 backdrop-blur border border-white/40 text-gray-900 rounded-bl-md"
        )}
      >
        {!isUser && (
          <div className="w-2 h-2 bg-[#891F1A] rounded-full mb-2 opacity-60" />
        )}
        <p className="whitespace-pre-line">{message.text}</p>
      </div>
      {showTime && (
        <small className="text-xs text-gray-600 font-light mt-1 px-1">
          {message.time}
        </small>
      )}
    </div>
  </article>
);

// Prompt chips
const PromptChips = ({
  prompts,
  onSelectPrompt,
  reducedMotion,
}: {
  prompts: string[];
  onSelectPrompt: (prompt: string) => void;
  reducedMotion: boolean;
}) => {
  const [showMore, setShowMore] = useState(false);
  const displayPrompts = showMore ? prompts : prompts.slice(0, 2);

  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-2 mb-2">
        {displayPrompts.map((p, i) => (
          <button
            key={`${p}-${i}`}
            onClick={() => onSelectPrompt(p)}
            className={cls(
              "inline-flex items-center px-4 py-2.5 text-xs font-medium",
              "bg-white/50 backdrop-blur border border-white/40 text-gray-800 rounded-full",
              !reducedMotion &&
                "transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#891F1A]/30"
            )}
          >
            {p}
          </button>
        ))}
      </div>
      {prompts.length > 2 && (
        <button
          onClick={() => setShowMore(!showMore)}
          className={cls(
            "text-xs text-[#891F1A] hover:text-[#a52a24] font-medium flex items-center gap-1",
            !reducedMotion &&
              "transition-colors focus:outline-none focus:underline"
          )}
        >
          {showMore ? "Show Less" : "+ More"}
          <ChevronRight
            className={cls(
              "w-3 h-3",
              showMore && "rotate-90",
              !reducedMotion && "transition-transform"
            )}
          />
        </button>
      )}
    </div>
  );
};

// Chat input — IMPORTANT: onSend(value) gets the current text
type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: (value: string) => void; // <-- pass the text up
  onKeyDown: (e: React.KeyboardEvent) => void;
  placeholder: string;
  inputRef: React.RefObject<HTMLInputElement>;
  reducedMotion: boolean;
};

const ChatInput = ({
  value,
  onChange,
  onSend,
  onKeyDown,
  placeholder,
  inputRef,
  reducedMotion,
}: ChatInputProps) => {
  const canSend = value.trim().length > 0;

  return (
    <div
      className={cls(
        "flex items-center space-x-3 p-3 rounded-full shadow-sm",
        "bg-white/50 backdrop-blur border border-white/40"
      )}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-gray-500 px-2 font-normal text-gray-900"
      />
      <button
        type="button"
        onClick={() => onSend(value)} // <-- click sends current value
        disabled={!canSend}
        className={cls(
          "rounded-full p-3 font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#891F1A]/30",
          canSend
            ? "bg-[#891F1A] text-white hover:bg-[#a52a24] shadow-md"
            : "bg-gray-300/60 text-gray-500 cursor-not-allowed",
          !reducedMotion &&
            canSend &&
            "transition-all hover:scale-105 active:scale-95"
        )}
        aria-label="Send message"
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
};

export function ChatBot() {
  // Visual config
  const botName = "CreativeAI";
  const ariaOpenChat = "Open chat";
  const ariaCloseChat = "Close chat";
  const inputPlaceholder = "Type a message…";

  // State
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [prompts, setPrompts] = useState<string[]>([
    "I want to buy some expensive products.",
    "Show me some premium categories.",
    "What are your top recommendations?",
    "Help me find luxury items.",
  ]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const reducedMotion = useReducedMotion();

  // Greeting bubble (optional)
  const [showHi, setShowHi] = useState(false);
  const [animateIcon, setAnimateIcon] = useState(false);
  const [hiText] = useState("Hi 👋");

  const selectPrompt = (p: string) => {
    setInputValue(p);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // Load prompts from Django (optional)
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchJSON(`${API_BASE_URL}/api/bot-prompts/`, {
          method: "GET",
        });
        const loaded = Array.isArray(data)
          ? data
          : Array.isArray(data?.prompts)
          ? data.prompts
          : null;
        if (loaded && loaded.length) setPrompts(loaded);
      } catch (e) {
        console.warn("Failed to load bot prompts:", (e as Error)?.message);
      }
    })();
  }, []);

  // Scroll helpers
  const checkIfAtBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        messagesContainerRef.current;
      isAtBottomRef.current = scrollTop + clientHeight >= scrollHeight - 10;
    }
  }, []);

  const scrollToBottom = useCallback(
    (force = false) => {
      if (force || isAtBottomRef.current) {
        messagesEndRef.current?.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
        });
      }
    },
    [reducedMotion]
  );

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener("scroll", checkIfAtBottom);
      return () => container.removeEventListener("scroll", checkIfAtBottom);
    }
  }, [checkIfAtBottom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen]);

  useEffect(() => {
    if (!reducedMotion) {
      setAnimateIcon(true);
      setShowHi(true);
      const hiTimer = setTimeout(() => setShowHi(false), 2600);
      const animTimer = setTimeout(() => setAnimateIcon(false), 1800);
      return () => {
        clearTimeout(hiTimer);
        clearTimeout(animTimer);
      };
    }
  }, [reducedMotion]);

  // ESC to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen]);

  // Helpers
  const addMessage = (type: "bot" | "user", text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), type, text, time: nowTime() },
    ]);
  };

  // Real API send; clicking button or pressing Enter both call this with text
  const handleSend = async (raw?: string) => {
    const text = (raw ?? inputValue).trim();
    if (!text || isSending) return;

    addMessage("user", text);
    setInputValue("");
    setIsSending(true);

    try {
      // 1) Send user message (returns/echoes conversation_id)
      const userData = await fetchJSON(`${API_BASE_URL}/api/user-response/`, {
        method: "POST",
        body: JSON.stringify({
          message: text,
          conversation_id: conversationId || undefined,
        }),
      });

      const newConvId =
        userData?.conversation_id ??
        userData?.data?.conversation_id ??
        conversationId ??
        null;

      if (newConvId && newConvId !== conversationId)
        setConversationId(newConvId);

      // 2) Get bot reply (include message to avoid 400s server-side)
      const botData = await fetchJSON(`${API_BASE_URL}/api/bot-response/`, {
        method: "POST",
        body: JSON.stringify({
          message: text,
          conversation_id: newConvId || conversationId || undefined,
        }),
      });

      const botMsg: string =
        typeof botData?.bot_text === "string"
          ? botData.bot_text
          : typeof botData?.message === "string"
          ? botData.message
          : typeof botData?.data?.message === "string"
          ? botData.data.message
          : "";

      addMessage(
        "bot",
        botMsg.trim().length
          ? botMsg
          : "Empty bot response. Ensure /api/bot-response/ returns { bot_text: string } or { message: string }."
      );
    } catch (err: any) {
      console.error("Chat API error:", err);
      addMessage(
        "bot",
        `Connection issue: ${
          err?.message || "Unknown error"
        }. Check API_BASE_URL and that /api/user-response/ & /api/bot-response/ accept JSON with { message, conversation_id }.`
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(inputValue); // pass the current value explicitly
    }
  };

  // Group messages by time
  const groupedMessages = messages.map((msg, index) => {
    const prevMsg = messages[index - 1];
    const showTime =
      !prevMsg ||
      new Date(`1970-01-01 ${msg.time}`).getTime() -
        new Date(`1970-01-01 ${prevMsg.time}`).getTime() >
        300000; // 5 minutes
    return { ...msg, showTime };
  });

  return (
    <div
      style={{
        fontFamily: "var(--font-poppins), Arial, Helvetica, sans-serif",
      }}
    >
      {/* Launcher — fixed bottom-left (no dragging) */}
      <div className="fixed z-50 bottom-6 left-6">
        <div className="relative">
          {showHi && !reducedMotion && (
            <div
              className={cls(
                "absolute px-5 py-1.5 text-sm font-semibold bg-white/60 backdrop-blur",
                "text-gray-800 border border-white/40 shadow-md rounded-lg",
                "transition-all transform scale-100 opacity-100",
                "animate-[fadeInOut_2.6s_ease-in-out_forwards]",
                "left-[5.25rem] bottom-2 origin-bottom-left"
              )}
            >
              <small className="font-light">{hiText}</small>
            </div>
          )}
          <button
            onClick={() => setIsOpen((v) => !v)}
            className={cls(
              "relative w-16 h-16 rounded-full shadow-xl bg-gradient-to-r from-[#891F1A] to-[#a52a24] text-white",
              "hover:shadow-2xl hover:ring-4 hover:ring-[#891F1A]/20 transition-all duration-300"
            )}
            aria-label={isOpen ? ariaCloseChat : ariaOpenChat}
          >
            {!reducedMotion && animateIcon && (
              <span className="pointer-events-none absolute inset-0 rounded-full ring-8 ring-[#891F1A]/20 animate-ping" />
            )}
            <MessageCircle className="w-6 h-6 absolute inset-0 m-auto" />
          </button>
        </div>
      </div>

      {/* Panel (glass, transparent, blurred) */}
      {isOpen && (
        <div
          className={cls(
            "fixed z-50 flex flex-col",
            "bg-white/30 backdrop-blur-xl backdrop-saturate-150",
            "border border-white/40",
            "bottom-0 left-0 right-0 h-[100dvh] md:h-[550px] safe-area-inset",
            "md:right-auto md:w-[440px] md:rounded-3xl md:shadow-[0_20px_60px_rgba(0,0,0,0.15)]",
            !reducedMotion && "transition-all duration-300",
            "md:bottom-24 md:left-6"
          )}
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-header"
        >
          <ChatHeader
            botName={botName}
            onClose={() => setIsOpen(false)}
            ariaCloseLabel={ariaCloseChat}
          />

          {/* Messages area */}
          <main
            ref={messagesContainerRef}
            className={cls("flex-1 overflow-y-auto", "bg-transparent")}
            aria-live="polite"
            aria-label="Chat messages"
          >
            {messages.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="p-5 space-y-4">
                {groupedMessages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    isUser={m.type === "user"}
                    showTime={m.showTime}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </main>

          {/* Footer */}
          <footer
            className={cls(
              "bg-white/30 backdrop-blur-xl",
              "border-t border-white/40 p-5 rounded-b-[28px] md:rounded-b-3xl"
            )}
          >
            <PromptChips
              prompts={prompts}
              onSelectPrompt={selectPrompt}
              reducedMotion={reducedMotion}
            />
            <ChatInput
              value={inputValue}
              onChange={setInputValue}
              onSend={(val) => handleSend(val)} // click sends the value
              onKeyDown={handleInputKeyDown}
              placeholder={inputPlaceholder}
              inputRef={inputRef}
              reducedMotion={reducedMotion}
            />
          </footer>
        </div>
      )}
    </div>
  );
}
