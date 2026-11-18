"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Message {
    role: "user" | "assistant";
    content: string;
    branch?: string;
    booking_id?: number;
    booking_link?: string;
}

const QUICK_PROMPTS = [
    "What workshop services do you offer and their prices?",
    "Check availability for Oil change tomorrow",
    "How does 24/7 emergency roadside towing work?",
    "Book an Oil Change for my car",
];

function renderMessageContent(content: string) {
    // Basic markdown link and bold parser: [text](url) and **bold**
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts = [];
    let lastIdx = 0;
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
        if (match.index > lastIdx) {
            parts.push(content.slice(lastIdx, match.index));
        }
        const linkText = match[1];
        const linkUrl = match[2];
        parts.push(
            <Link
                key={match.index}
                href={linkUrl}
                className="text-[#38bdf8] underline font-bold hover:text-white transition-colors"
            >
                {linkText}
            </Link>
        );
        lastIdx = linkRegex.lastIndex;
    }

    if (lastIdx < content.length) {
        parts.push(content.slice(lastIdx));
    }

    return (
        <span className="whitespace-pre-line">
            {parts.map((p, i) => (
                typeof p === "string" ? (
                    <span key={i} dangerouslySetInnerHTML={{
                        __html: p.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
                    }} />
                ) : p
            ))}
        </span>
    );
}

export default function ChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            role: "assistant",
            content: "Hello! I am your Car Assistance AI. I can give you live pricing, verify real-time bay availability, look up approved policies, and schedule verified bookings for your garage.",
        },
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen]);

    const handleSend = async (queryText?: string) => {
        const textToSend = (queryText || input).trim();
        if (!textToSend || loading) return;

        const newMessages: Message[] = [...messages, { role: "user", content: textToSend }];
        setMessages(newMessages);
        setInput("");
        setLoading(true);

        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        try {
            const res = await fetch("http://localhost:8000/api/chat", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    message: textToSend,
                    history: newMessages.slice(-6).map((m) => ({
                        role: m.role,
                        content: m.content,
                    })),
                }),
            });

            if (!res.ok) {
                throw new Error("Chat service unavailable");
            }

            const data = await res.json();
            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: data.reply,
                    branch: data.branch,
                    booking_id: data.booking_id,
                    booking_link: data.booking_link,
                },
            ]);
        } catch {
            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: "Sorry, I am having trouble connecting right now. For emergencies, please call +92 300 0000000.",
                },
            ]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed bottom-5 right-5 z-50">
            {/* Chat Box Window */}
            {isOpen && (
                <div className="w-[340px] sm:w-[400px] h-[520px] bg-[#090D14] border border-[#1e293b] rounded-2xl shadow-2xl flex flex-col overflow-hidden mb-3 animate-in fade-in slide-in-from-bottom-2">
                    {/* Header */}
                    <div className="bg-[#151D2A] border-b border-[#1e293b] px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-[#2563EB] flex items-center justify-center text-white text-xs font-black shadow-sm">
                                CA
                            </div>
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <h3 className="text-xs font-bold text-white">Car Assistance AI</h3>
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                </div>
                                <p className="text-[10px] text-gray-400">RAG Knowledge · Live Tools · Real Bookings</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="text-gray-400 hover:text-white text-xs p-1 rounded hover:bg-[#1e293b] transition-colors"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Messages Body */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
                        {messages.map((m, idx) => {
                            const isUser = m.role === "user";
                            return (
                                <div
                                    key={idx}
                                    className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                                >
                                    <div
                                        className={`max-w-[85%] px-3.5 py-2.5 rounded-xl leading-relaxed ${
                                            isUser
                                                ? "bg-[#2563EB] text-white rounded-br-xs font-medium"
                                                : "bg-[#151D2A] text-[#E8EDF5] border border-[#1e293b] rounded-bl-xs"
                                        }`}
                                    >
                                        {renderMessageContent(m.content)}

                                        {/* Direct Booking Button if booking was created */}
                                        {m.booking_link && (
                                            <div className="mt-3 pt-2.5 border-t border-[#1e293b]">
                                                <Link
                                                    href={m.booking_link}
                                                    onClick={() => setIsOpen(false)}
                                                    className="inline-block w-full text-center bg-[#2563EB] hover:bg-blue-600 text-white font-bold py-1.5 px-3 rounded-lg text-[11px] transition-colors shadow-sm"
                                                >
                                                    View Verified Booking #{m.booking_id} →
                                                </Link>
                                            </div>
                                        )}
                                    </div>

                                    {/* Operational Branch Tag */}
                                    {m.branch && (
                                        <span className="text-[9px] text-gray-500 mt-0.5 px-1 font-mono uppercase">
                                            {m.branch === "grounded_rag" ? "📘 Grounded RAG" : m.branch === "live_backend_tool" ? "⚡ Live Backend Tool" : "🛡️ Core Booking Flow"}
                                        </span>
                                    )}
                                </div>
                            );
                        })}

                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-[#151D2A] text-gray-400 border border-[#1e293b] px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 bg-[#2563EB] rounded-full animate-bounce"></span>
                                    <span className="w-1.5 h-1.5 bg-[#2563EB] rounded-full animate-bounce [animation-delay:0.2s]"></span>
                                    <span className="w-1.5 h-1.5 bg-[#2563EB] rounded-full animate-bounce [animation-delay:0.4s]"></span>
                                    <span className="text-[11px] ml-1">Executing backend tool / retrieval...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Quick suggestion pills */}
                    {messages.length <= 2 && (
                        <div className="px-3 py-2 bg-[#090D14] border-t border-[#1e293b]/50 flex flex-wrap gap-1.5">
                            {QUICK_PROMPTS.map((prompt, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSend(prompt)}
                                    className="text-[10px] bg-[#151D2A] hover:bg-[#1e293b] text-gray-300 border border-[#1e293b] px-2 py-1 rounded-md transition-colors text-left"
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Input Bar */}
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleSend();
                        }}
                        className="p-2.5 bg-[#151D2A] border-t border-[#1e293b] flex items-center gap-2"
                    >
                        <input
                            type="text"
                            placeholder="Ask prices, check slots, or book a service..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={loading}
                            className="flex-1 bg-[#090D14] text-white text-xs px-3 py-2 rounded-lg border border-[#1e293b] focus:outline-none focus:border-[#2563EB] transition-colors"
                        />
                        <button
                            type="submit"
                            disabled={loading || !input.trim()}
                            className="bg-[#2563EB] hover:bg-blue-600 disabled:opacity-40 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center"
                        >
                            Send
                        </button>
                    </form>
                </div>
            )}

            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="bg-[#2563EB] hover:bg-blue-600 text-white p-3.5 rounded-full shadow-2xl flex items-center gap-2 border border-blue-400/30 transition-all hover:scale-105"
                title="Car Assistance AI Assistant"
            >
                <div className="w-5 h-5 flex items-center justify-center font-black text-xs">
                    💬
                </div>
                {!isOpen && (
                    <span className="text-xs font-bold pr-1 hidden sm:inline">
                        AI Assistant
                    </span>
                )}
            </button>
        </div>
    );
}
