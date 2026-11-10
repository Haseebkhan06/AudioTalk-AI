
"use client";

import TranscriptChat from "./TranscriptChat";
import { useEffect, useMemo, useRef, useState } from "react";

interface Chunk {
  chunk_index: number;
  start_seconds: number;
  end_seconds: number;
  transcript: string;
}

interface TranscriptionResult {
  success: boolean;
  filename: string;
  duration_seconds: number;
  total_chunks: number;
  transcript: string;
  chunks: Chunk[];
}

interface SentimentResult {
  label: string;
  positivePercent: number;
  negativePercent: number;
  neutralPercent: number;
  explanation: string;
}

type Tab =
  | "Overview"
  | "Summary"
  | "Sentiment"
  | "Tag Cloud"
  | "Entities"
  | "Actions"
  | "Search";

const tabs: Tab[] = [
  "Overview",
  "Summary",
  "Sentiment",
  "Tag Cloud",
  "Entities",
  "Actions",
  "Search",
];

const stopWords = new Set([
  "know", "knows", "knew", "knowing",
  "think", "thinks", "thought", "thinking",
  "said", "say", "says", "saying",
  "want", "wants", "wanted", "wanting",
  "go", "goes", "going", "went",
  "get", "gets", "getting", "got",
  "make", "makes", "making", "made",
  "like", "likes", "liked", "liking",
  "see", "sees", "seeing", "seen",
  "tell", "tells", "telling", "told",
  "come", "comes", "coming", "came",
  "take", "takes", "taking", "took",
  "really", "just", "also", "well",
  "the", "and", "for", "that", "this", "with", "you", "your",
  "are", "was", "were", "have", "has", "had", "from", "they",
  "them", "their", "there", "then", "than", "but", "not", "can",
  "will", "would", "could", "should", "into", "about", "what",
  "when", "where", "which", "who", "how", "why", "its", "it's",
  "his", "her", "our", "out", "all", "also", "just", "like",
  "been", "being", "get", "got", "one", "two", "some", "any",
  "more", "very", "really", "because", "these", "those", "now",
  "here", "said", "say", "says", "a", "an", "of", "to", "in",
  "on", "at", "is", "it", "as", "by", "or", "if", "be", "do",
  "did", "so", "we", "i", "he", "she", "me", "my", "no", "yes",
  "up", "down", "over", "after",
]);

const actionWords = [
  "need to", "have to", "must", "should", "will",
  "todo", "action item", "deadline", "follow up",
  "send", "call", "complete", "prepare", "schedule",
  "discuss", "review", "finish", "create", "submit",
];

export default function Home() {
  const [sentiment, setSentiment] = useState<SentimentResult | null>(null);
  const [sentimentLoading, setSentimentLoading] = useState(false);
  const [sentimentError, setSentimentError] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("en-IN");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [expandedChunks, setExpandedChunks] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);

  // Gemini AI sentiment analysis
  useEffect(() => {
    if (!result?.transcript?.trim()) {
      setSentiment(null);
      setSentimentError("");
      setSentimentLoading(false);
      return;
    }

    const controller = new AbortController();

    const analyzeSentiment = async () => {
      setSentimentLoading(true);
      setSentimentError("");
      setSentiment(null);

      try {
        const response = await fetch(
          "http://127.0.0.1:8001/api/sentiment",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              transcript: result.transcript,
            }),
            signal: controller.signal,
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.detail || "Sentiment analysis failed."
          );
        }

        setSentiment({
          label: data.label,
          positivePercent: Number(data.positivePercent),
          negativePercent: Number(data.negativePercent),
          neutralPercent: Number(data.neutralPercent),
          explanation: data.explanation,
        });
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setSentimentError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSentimentLoading(false);
        }
      }
    };

    analyzeSentiment();

    return () => controller.abort();
  }, [result]);

  const selectFile = (selectedFile?: File) => {
    if (!selectedFile) return;

    const allowed = [".mp3", ".wav", ".m4a", ".mp4"];
    const extension = selectedFile.name
      .substring(selectedFile.name.lastIndexOf("."))
      .toLowerCase();

    if (!allowed.includes(extension)) {
      setError("Please upload an MP3, WAV, M4A or MP4 file.");
      return;
    }

    setFile(selectedFile);
    setResult(null);
    setSentiment(null);
    setSentimentError("");
    setError("");
    setActiveTab("Overview");
    setExpandedChunks([]);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select an audio file first.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setSentiment(null);
    setSentimentError("");

    const formData = new FormData();
    formData.append("audio_file", file);
    formData.append("language_code", language);

    try {
      const response = await fetch(
        "http://127.0.0.1:8001/api/transcribe",
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Transcription failed.");
      }

      setResult(data);
      setActiveTab("Overview");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60);
    return `${minutes}:${String(remaining).padStart(2, "0")}`;
  };

  // Word calculation
  const words = useMemo(() => {
    if (!result?.transcript.trim()) return [];
    return result.transcript.trim().split(/\s+/);
  }, [result]);

  // Sentence calculation
  const sentences = useMemo(() => {
    if (!result?.transcript.trim()) return [];

    return result.transcript
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [result]);

  // Extractive summary
  const summarySentences = useMemo(() => {
    if (sentences.length <= 3) return sentences;

    const frequency: Record<string, number> = {};

    const tokenized = sentences.map((sentence) =>
      sentence.toLowerCase().match(/[a-zA-Z]{3,}/g) || []
    );

    tokenized.flat().forEach((word) => {
      if (!stopWords.has(word)) {
        frequency[word] = (frequency[word] || 0) + 1;
      }
    });

    const ranked = sentences.map((sentence, index) => {
      const sentenceWords = tokenized[index].filter(
        (word) => !stopWords.has(word)
      );

      const score = sentenceWords.reduce(
        (total, word) => total + (frequency[word] || 0),
        0
      );

      return {
        sentence,
        index,
        score: score / Math.sqrt(Math.max(sentenceWords.length, 1)),
      };
    });

    const count = Math.min(
      5,
      Math.max(3, Math.ceil(sentences.length * 0.25))
    );

    return ranked
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .sort((a, b) => a.index - b.index)
      .map((item) => item.sentence);
  }, [sentences]);

  // Keyword calculation
  const keywords = useMemo(() => {
    const text = result?.transcript.toLowerCase() || "";
    const tokens = text.match(/\b[a-zA-Z]{3,}\b/g) || [];
    const counts: Record<string, number> = {};

    tokens.forEach((word) => {
      if (!stopWords.has(word)) {
        counts[word] = (counts[word] || 0) + 1;
      }
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);
  }, [result]);

  // Entity detection
  const entities = useMemo(() => {
    const text = result?.transcript || "";

    const emails = text.match(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
    ) || [];

    const dates = text.match(
      /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*\d{4})?)\b/gi
    ) || [];

    const capitalized = text.match(
      /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g
    ) || [];

    const names = [...new Set(
      capitalized.filter(
        (name) => !["I", "The", "This", "That", "We", "It"].includes(name)
      )
    )];

    return {
      emails: [...new Set(emails)],
      dates: [...new Set(dates)],
      names,
    };
  }, [result]);

  // Action item detection
  const actions = useMemo(() => {
    return sentences.filter((sentence) => {
      const lower = sentence.toLowerCase();
      return actionWords.some((word) => lower.includes(word));
    });
  }, [sentences]);

  // Transcript search
  const filteredSentences = useMemo(() => {
    if (!searchQuery.trim()) return [];

    return sentences.filter((sentence) =>
      sentence.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [sentences, searchQuery]);

  const copyTranscript = async () => {
    if (!result) return;

    try {
      await navigator.clipboard.writeText(result.transcript);
      alert("Transcript copied!");
    } catch {
      setError("Could not copy transcript.");
    }
  };

  const downloadTranscript = () => {
    if (!result) return;

    const blob = new Blob([result.transcript], {
      type: "text/plain;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${result.filename.replace(/\.[^/.]+$/, "")}-transcript.txt`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  };

  const toggleChunk = (index: number) => {
    setExpandedChunks((current) =>
      current.includes(index)
        ? current.filter((item) => item !== index)
        : [...current, index]
    );
  };

  const StatCard = ({
    label,
    value,
    color = "text-white",
  }: {
    label: string;
    value: string | number;
    color?: string;
  }) => (
    <div className="rounded-2xl border border-white/10 bg-[#121525] p-5">
      <p className="text-sm text-gray-400">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );

  const SectionTitle = ({
    title,
    description,
  }: {
    title: string;
    description: string;
  }) => (
    <div className="mb-7">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-2 text-sm text-gray-400">{description}</p>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#090b14] text-white">
      {/* Navbar */}
      <nav className="border-b border-white/10 px-6 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-xl font-bold">
              A
            </div>
            <span className="text-xl font-bold tracking-wide">
              AudioTalk AI
            </span>
          </div>

          <span className="rounded-full border border-green-500/30 bg-green-500/10 px-4 py-2 text-xs text-green-400">
            ● Gnani AI Connected
          </span>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-6 py-12">
        {/* Heading */}
        <div className="mb-12 text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-violet-400">
            Audio Intelligence Platform
          </p>

          <h1 className="text-4xl font-bold md:text-6xl">
            Your audio,
            <span className="block text-violet-400">understood.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-gray-400">
            Transform speech into searchable text and useful insights.
          </p>
        </div>

        {/* Upload */}
        <section className="rounded-3xl border border-white/10 bg-[#121525] p-6 shadow-2xl md:p-10">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              selectFile(e.dataTransfer.files[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition ${
              dragging
                ? "border-violet-400 bg-violet-500/10"
                : "border-white/20 hover:border-violet-500 hover:bg-white/[0.02]"
            }`}
          >
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600/20 text-3xl">
              🎧
            </div>

            <h2 className="text-xl font-semibold">
              Drop your audio here
            </h2>

            <p className="mt-2 text-sm text-gray-400">
              or click to browse your files
            </p>

            <p className="mt-5 text-xs text-gray-500">
              MP3 · WAV · M4A · MP4
            </p>

            <input
              ref={inputRef}
              type="file"
              accept=".mp3,.wav,.m4a,.mp4"
              className="hidden"
              onChange={(e) => selectFile(e.target.files?.[0])}
            />
          </div>

          {file && (
            <div className="mt-6 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-3 overflow-hidden">
                <span className="text-2xl">🎵</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  setResult(null);
                  setSentiment(null);
                  setSentimentError("");
                  setError("");
                }}
                className="ml-3 text-sm text-red-400 hover:text-red-300"
              >
                Remove
              </button>
            </div>
          )}

          <div className="mt-7">
            <label className="mb-2 block text-sm text-gray-300">
              Audio language
            </label>

            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#090b14] px-4 py-3 text-sm outline-none focus:border-violet-500"
            >
              <option value="en-IN">🇮🇳 English (India)</option>
              <option value="hi-IN">🇮🇳 Hindi</option>
              <option value="te-IN">🇮🇳 Telugu</option>
              <option value="ta-IN">🇮🇳 Tamil</option>
              <option value="kn-IN">🇮🇳 Kannada</option>
              <option value="ml-IN">🇮🇳 Malayalam</option>
              <option value="mr-IN">🇮🇳 Marathi</option>
              <option value="bn-IN">🇮🇳 Bengali</option>
              <option value="gu-IN">🇮🇳 Gujarati</option>
              <option value="pa-IN">🇮🇳 Punjabi</option>
            </select>
          </div>

          <button
            onClick={handleUpload}
            disabled={!file || loading}
            className="mt-7 w-full rounded-xl bg-violet-600 py-4 font-semibold transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Processing audio..." : "✨ Analyze Audio"}
          </button>

          {loading && (
            <p className="mt-4 text-center text-sm text-violet-300">
              Gnani AI is processing your audio. Please wait...
            </p>
          )}

          {error && (
            <p className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
              {error}
            </p>
          )}
        </section>

        {/* Analysis Dashboard */}
        {result && (
          <section className="mt-10 space-y-6">
            {/* Dashboard heading */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-widest text-violet-400">
                  Analysis results
                </p>
                <h2 className="mt-2 text-2xl font-bold">
                  {result.filename}
                </h2>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={copyTranscript}
                  className="rounded-lg border border-violet-500/40 px-4 py-2 text-sm text-violet-300 hover:bg-violet-500/10"
                >
                  Copy transcript
                </button>

                <button
                  onClick={downloadTranscript}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500"
                >
                  ↓ Download TXT
                </button>
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Characters" value={result.transcript.length} />
              <StatCard label="Words" value={words.length} />
              <StatCard label="Sentences" value={sentences.length} />
              <StatCard
                label="Duration"
                value={formatTime(result.duration_seconds)}
                color="text-violet-400"
              />
            </div>

            {/* Navigation tabs */}
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#121525] p-2">
              <div className="flex min-w-max gap-2">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-xl px-5 py-3 text-sm font-medium transition ${
                      activeTab === tab
                        ? "bg-violet-600 text-white"
                        : "text-gray-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Overview */}
            {activeTab === "Overview" && (
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-[#121525] p-7">
                  <SectionTitle
                    title="Audio Overview"
                    description="A quick summary of your transcription."
                  />

                  <div className="grid grid-cols-2 gap-5">
                    <StatCard label="Characters" value={result.transcript.length} />
                    <StatCard label="Words" value={words.length} />
                    <StatCard label="Sentences" value={sentences.length} />
                    <StatCard label="Audio chunks" value={result.total_chunks} />
                  </div>

                  <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm text-gray-400">Speakers</p>
                    <p className="mt-1 font-semibold text-yellow-300">
                      Not available
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Speaker identification is not provided by the current backend.
                    </p>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-[#121525] p-7">
                  <SectionTitle
                    title="Transcript Preview"
                    description="Your recognized speech."
                  />

                  <p className="max-h-80 overflow-y-auto whitespace-pre-wrap text-sm leading-8 text-gray-300">
                    {result.transcript || "No speech detected."}
                  </p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-[#121525] p-7 md:col-span-2">
                  <SectionTitle
                    title="Quick Insights"
                    description="AI-powered insights from your transcript."
                  />

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-xl bg-green-500/10 p-5">
                      <p className="text-sm text-green-300">
                        Sentiment estimate
                      </p>
                      <p className="mt-2 text-2xl font-bold text-green-400">
                        {sentiment?.label ||
                          (sentimentLoading ? "Analyzing..." : "Unavailable")}
                      </p>
                    </div>

                    <div className="rounded-xl bg-violet-500/10 p-5">
                      <p className="text-sm text-violet-300">Top keyword</p>
                      <p className="mt-2 text-2xl font-bold text-violet-400">
                        {keywords[0]?.[0] || "N/A"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-yellow-500/10 p-5">
                      <p className="text-sm text-yellow-300">
                        Possible action items
                      </p>
                      <p className="mt-2 text-2xl font-bold text-yellow-400">
                        {actions.length}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Summary */}
            {activeTab === "Summary" && (
              <div className="rounded-3xl border border-white/10 bg-[#121525] p-7">
                <SectionTitle
                  title="Transcript Summary"
                  description="Key sentences selected from your transcript using local text analysis."
                />

                {summarySentences.length > 0 ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-5">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-violet-300">
                        Key takeaways
                      </p>
                      <ul className="list-disc space-y-3 pl-5 text-sm leading-7 text-gray-200">
                        {summarySentences.map((sentence, index) => (
                          <li key={`${index}-${sentence}`}>{sentence}</li>
                        ))}
                      </ul>
                    </div>

                    <p className="text-xs text-gray-500">
                      This is an extractive summary, not an AI-generated interpretation.
                      It runs in your browser and does not use additional API credits.
                    </p>
                  </div>
                ) : (
                  <p className="rounded-xl bg-white/[0.03] p-5 text-sm text-gray-400">
                    No transcript is available to summarize.
                  </p>
                )}
              </div>
            )}

            {/* Sentiment */}
            {activeTab === "Sentiment" && (
              <div className="rounded-3xl border border-white/10 bg-[#121525] p-7">
                <SectionTitle
                  title="AI Sentiment Analysis"
                  description="Gemini-powered analysis of the emotional tone and meaning of your conversation."
                />

                {sentimentLoading && (
                  <div className="rounded-2xl bg-white/[0.03] p-10 text-center">
                    <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-violet-500/20 border-t-violet-500" />
                    <p className="font-medium text-violet-300">
                      Gemini is analyzing your transcript...
                    </p>
                    <p className="mt-2 text-sm text-gray-500">
                      Please wait while we understand the conversation.
                    </p>
                  </div>
                )}

                {sentimentError && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-400">
                    {sentimentError}
                  </div>
                )}

                {sentiment && !sentimentLoading && (
                  <>
                    <div className="mb-8 rounded-2xl bg-white/[0.03] p-6 text-center">
                      <p className="text-sm text-gray-400">
                        Overall estimated sentiment
                      </p>

                      <p className="mt-3 text-4xl font-bold text-violet-400">
                        {sentiment.label}
                      </p>

                      <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-gray-300">
                        {sentiment.explanation}
                      </p>
                    </div>

                    {[
                      {
                        name: "Positive",
                        percent: sentiment.positivePercent,
                        color: "bg-green-500",
                      },
                      {
                        name: "Negative",
                        percent: sentiment.negativePercent,
                        color: "bg-red-500",
                      },
                      {
                        name: "Neutral",
                        percent: sentiment.neutralPercent,
                        color: "bg-violet-500",
                      },
                    ].map((item) => (
                      <div key={item.name} className="mb-6">
                        <div className="mb-2 flex justify-between text-sm">
                          <span>{item.name}</span>
                          <span className="text-gray-400">
                            {item.percent}%
                          </span>
                        </div>

                        <div className="h-3 overflow-hidden rounded-full bg-white/10">
                          <div
                            className={`h-full rounded-full ${item.color} transition-all duration-700`}
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(0, item.percent)
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {!sentiment &&
                  !sentimentLoading &&
                  !sentimentError && (
                    <p className="rounded-xl bg-white/[0.03] p-5 text-sm text-gray-400">
                      Upload audio to analyze its sentiment.
                    </p>
                  )}
              </div>
            )}

            {/* Tag Cloud */}
            {activeTab === "Tag Cloud" && (
              <div className="rounded-3xl border border-white/10 bg-[#121525] p-7">
                <SectionTitle
                  title="Tag Cloud"
                  description="Frequently occurring words in your transcript."
                />

                {keywords.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-center gap-4 py-8">
                    {keywords.map(([word, count], index) => (
                      <span
                        key={word}
                        className={`rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-2 font-semibold text-violet-300 ${
                          index < 3 ? "text-2xl" : index < 10 ? "text-lg" : "text-sm"
                        }`}
                      >
                        {word}
                        <span className="ml-2 text-xs text-gray-500">
                          {count}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400">No keywords found.</p>
                )}
              </div>
            )}

            {/* Entities */}
            {activeTab === "Entities" && (
              <div className="rounded-3xl border border-white/10 bg-[#121525] p-7">
                <SectionTitle
                  title="Entity Detection"
                  description="Possible names, dates and email addresses identified using text patterns."
                />

                {[
                  { title: "Possible names / places", items: entities.names },
                  { title: "Dates", items: entities.dates },
                  { title: "Email addresses", items: entities.emails },
                ].map((group) => (
                  <div key={group.title} className="mb-7">
                    <h3 className="mb-3 font-semibold text-violet-300">
                      {group.title}
                    </h3>

                    {group.items.length > 0 ? (
                      <div className="flex flex-wrap gap-3">
                        {group.items.map((item) => (
                          <span
                            key={item}
                            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">
                        No matches detected.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            {activeTab === "Actions" && (
              <div className="rounded-3xl border border-white/10 bg-[#121525] p-7">
                <SectionTitle
                  title="Action Items"
                  description="Sentences containing common task and action-related phrases. Review these suggestions manually."
                />

                {actions.length > 0 ? (
                  <div className="space-y-4">
                    {actions.map((action, index) => (
                      <div
                        key={`${index}-${action}`}
                        className="flex gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-5"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600/20 text-sm font-bold text-violet-300">
                          {index + 1}
                        </span>
                        <p className="text-sm leading-7 text-gray-300">
                          {action}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl bg-white/[0.03] p-5 text-gray-400">
                    No obvious action-related sentences found.
                  </p>
                )}
              </div>
            )}

            {/* Search */}
            {activeTab === "Search" && (
              <div className="rounded-3xl border border-white/10 bg-[#121525] p-7">
                <SectionTitle
                  title="Transcript Search"
                  description="Find words or phrases inside your transcript."
                />

                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for a word or phrase..."
                  className="w-full rounded-xl border border-white/10 bg-[#090b14] px-5 py-4 text-sm outline-none focus:border-violet-500"
                />

                {searchQuery.trim() && (
                  <p className="mt-4 text-sm text-gray-400">
                    {filteredSentences.length} matching sentences found.
                  </p>
                )}

                <div className="mt-6 space-y-3">
                  {searchQuery.trim() &&
                    filteredSentences.map((sentence, index) => (
                      <div
                        key={`${index}-${sentence}`}
                        className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-gray-300"
                      >
                        {sentence}
                      </div>
                    ))}

                  {searchQuery.trim() && filteredSentences.length === 0 && (
                    <p className="text-sm text-gray-500">
                      No matching sentences found.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Expandable chunks */}
            <div className="rounded-3xl border border-white/10 bg-[#121525] p-7">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">Transcription Segments</h2>
                  <p className="mt-1 text-sm text-gray-400">
                    {result.total_chunks} audio chunks detected
                  </p>
                </div>

                <button
                  onClick={() =>
                    setExpandedChunks(
                      expandedChunks.length === result.chunks.length
                        ? []
                        : result.chunks.map((chunk) => chunk.chunk_index)
                    )
                  }
                  className="text-sm text-violet-300 hover:text-violet-200"
                >
                  {expandedChunks.length === result.chunks.length
                    ? "Collapse all"
                    : "Expand all"}
                </button>
              </div>

              <div className="space-y-3">
                {result.chunks.map((chunk) => {
                  const expanded = expandedChunks.includes(chunk.chunk_index);

                  return (
                    <div
                      key={chunk.chunk_index}
                      className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
                    >
                      <button
                        onClick={() => toggleChunk(chunk.chunk_index)}
                        className="flex w-full items-center justify-between gap-3 p-5 text-left hover:bg-white/[0.04]"
                      >
                        <div>
                          <p className="font-semibold text-violet-300">
                            Segment {chunk.chunk_index}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {formatTime(chunk.start_seconds)} –{" "}
                            {formatTime(chunk.end_seconds)}
                          </p>
                        </div>

                        <span className="text-xl text-violet-300">
                          {expanded ? "−" : "+"}
                        </span>
                      </button>

                      {expanded && (
                        <div className="border-t border-white/10 p-5">
                          <p className="text-sm leading-7 text-gray-300">
                            {chunk.transcript || "No speech detected."}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Transcript Chat */}
        {result && (
          <TranscriptChat
            transcript={result.transcript}
            summary={summarySentences}
            actions={actions}
          />
        )}

        <footer className="mt-16 text-center text-xs text-gray-600">
          AudioTalk · Powered by Gnani AI
        </footer>
      </div>
    </main>
  );
}
