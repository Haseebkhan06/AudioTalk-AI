
"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface TranscriptChatProps {
  transcript: string;
  summary?: string | string[];
  actions?: string[];
}

const API_URL = "http://127.0.0.1:8001/api/chat";

const QUICK_PROMPTS = [
  "Summarize this audio",
  "What are the action items?",
  "What are the main topics?",
  "What decisions were made?",
];

const INITIAL_MESSAGE: ChatMessage = {
  role: "assistant",
  text: "Hi! I'm AudioTalk AI. I've analyzed your transcript and I'm ready to help. Ask me about topics, decisions, action items, deadlines or anything discussed in the recording.",
};

export default function TranscriptChat({
  transcript,
  summary,
  actions,
}: TranscriptChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    INITIAL_MESSAGE,
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset chat whenever a new transcript is loaded
  useEffect(() => {
    setMessages([INITIAL_MESSAGE]);
    setInput("");
    setError("");
  }, [transcript]);

  // Automatically scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  const hasTranscript = useMemo(
    () => transcript.trim().length > 0,
    [transcript]
  );

  // Send message to Gemini through FastAPI
  const sendMessage = async (customMessage?: string) => {
    const question = (customMessage ?? input).trim();

    if (!question || loading || !hasTranscript) return;

    const userMessage: ChatMessage = {
      role: "user",
      text: question,
    };

    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const history = messages
        .filter((message) => message.role !== "assistant" || message !== INITIAL_MESSAGE)
        .map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          text: message.text,
        }));

      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcript,
          message: question,
          history,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Something went wrong. Please try again."
        );
      }

      const assistantMessage: ChatMessage = {
        role: "assistant",
        text: data.answer || "I couldn't generate an answer. Please try again.",
      };

      setMessages((previous) => [
        ...previous,
        assistantMessage,
      ]);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Unable to connect to AudioTalk AI.";

      setError(errorMessage);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  // Clear conversation
  const clearChat = () => {
    setMessages([INITIAL_MESSAGE]);
    setInput("");
    setError("");
  };

  // Handle Enter key
  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  // Minimized chatbot button
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full bg-purple-600 px-5 py-4 text-white shadow-xl transition hover:bg-purple-700"
      >
        <span className="text-xl">✦</span>
        <span className="font-semibold">Ask this audio</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex h-[min(720px,85vh)] w-[min(470px,calc(100vw-32px))] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#111323] shadow-2xl">

      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#191c32] px-5 py-4">

        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-600 text-2xl text-white">
            ✦
          </div>

          <div>
            <h2 className="text-lg font-bold text-white">
              AudioTalk AI
            </h2>
            <p className="text-sm text-emerald-400">
              AI-powered transcript assistant
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={clearChat}
            className="text-sm text-slate-400 transition hover:text-white"
          >
            Clear
          </button>

          <button
            onClick={() => setIsOpen(false)}
            className="text-xl text-slate-400 transition hover:text-white"
            aria-label="Minimize chatbot"
          >
            −
          </button>
        </div>
      </div>

      {/* CHAT MESSAGES */}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">

        <div className="rounded-2xl bg-purple-950/50 p-4 text-sm leading-6 text-slate-300">
          Ask questions about this recording. AudioTalk AI uses your transcript and recent chat history to answer.
        </div>

        {!hasTranscript && (
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-yellow-300">
            Please analyze an audio file before asking questions.
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${
              message.role === "user"
                ? "justify-end"
                : "justify-start"
            }`}
          >
            <div
              className={`max-w-[95%] rounded-2xl px-4 py-3 ${
                message.role === "user"
                  ? "rounded-br-md bg-purple-600 text-white"
                  : "rounded-bl-md border border-white/10 bg-[#202333] text-slate-200"
              }`}
            >
              {message.role === "assistant" ? (
                <div className="text-sm leading-7 text-slate-200
                  [&_p]:mb-3
                  [&_p:last-child]:mb-0
                  [&_strong]:font-bold
                  [&_strong]:text-white
                  [&_ul]:mb-3
                  [&_ul]:list-disc
                  [&_ul]:space-y-1
                  [&_ul]:pl-5
                  [&_ol]:mb-3
                  [&_ol]:list-decimal
                  [&_ol]:space-y-1
                  [&_ol]:pl-5
                  [&_li]:pl-1
                  [&_h1]:mb-2
                  [&_h1]:mt-4
                  [&_h1]:text-lg
                  [&_h1]:font-bold
                  [&_h1]:text-white
                  [&_h2]:mb-2
                  [&_h2]:mt-4
                  [&_h2]:text-base
                  [&_h2]:font-bold
                  [&_h2]:text-white
                  [&_h3]:mb-2
                  [&_h3]:mt-3
                  [&_h3]:text-sm
                  [&_h3]:font-bold
                  [&_h3]:text-white
                  [&_blockquote]:my-3
                  [&_blockquote]:border-l-2
                  [&_blockquote]:border-purple-500
                  [&_blockquote]:pl-3
                  [&_blockquote]:text-slate-400
                  [&_code]:rounded
                  [&_code]:bg-black/30
                  [&_code]:px-1
                  [&_code]:py-0.5
                  [&_code]:text-purple-300
                  [&_pre]:my-3
                  [&_pre]:overflow-x-auto
                  [&_pre]:rounded-lg
                  [&_pre]:bg-black/40
                  [&_pre]:p-3
                  [&_pre_code]:bg-transparent
                  [&_pre_code]:p-0
                  [&_a]:text-purple-300
                  [&_a]:underline
                  [&_hr]:my-4
                  [&_hr]:border-white/10">

                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ children, href }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {message.text}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-6">
                  {message.text}
                </p>
              )}
            </div>
          </div>
        ))}

        {/* LOADING INDICATOR */}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-white/10 bg-[#202333] px-4 py-3 text-sm text-slate-400">
              <span className="animate-pulse">
                AudioTalkCue AI is thinking...
              </span>
            </div>
          </div>
        )}

        {/* ERROR MESSAGE */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
            <button
              onClick={() => sendMessage(messages[messages.length - 1]?.text)}
              disabled={loading}
              className="ml-2 underline hover:text-white"
            >
              Retry
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* SUGGESTED QUESTIONS */}
      <div className="border-t border-white/10 px-5 pb-3 pt-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Suggested questions
        </p>

        <div className="flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => sendMessage(prompt)}
              disabled={loading || !hasTranscript}
              className="rounded-full border border-purple-400/20 bg-purple-500/5 px-3 py-2 text-xs text-slate-300 transition hover:border-purple-400/50 hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* MESSAGE INPUT */}
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#090b16] p-2">

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about this recording..."
            disabled={loading || !hasTranscript}
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-slate-500 disabled:opacity-50"
          />

          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading || !hasTranscript}
            className="rounded-xl bg-purple-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "..." : "Send"}
          </button>
        </div>

        <p className="mt-3 text-center text-xs text-slate-500">
          Powered by Gemini. Answers are AI-generated and should be verified.
        </p>
      </div>
    </div>
  );
}
