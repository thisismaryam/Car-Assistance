"use client";

import { useEffect, useRef, useState } from "react";

interface Message {
    role: "user" | "assistant";
    content: string;
}

const QUICK_PROMPTS = [
    "What workshop services do you offer?",
    "How does home battery replacement work?",
    "I need emergency roadside towing",
    "What is the daily booking limit?",
];

export default function ChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            role: "assistant",
            content: "Hello! I am Car Assistance AI. Ask me anything about workshop services, doorstep home mechanics, or roadside assistance.",
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

        try {
            const res = await fetch("http://localhost:8000/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
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
            setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
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
                <div className="w-[340px] sm:w-[380px] h-[500px] bg-[#090D14] border border-[#1e293b] rounded-2xl shadow-2xl flex flex-col overflow-hidden mb-3 animate-in fade-in slide-in-from-bottom-2">
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
                                <p className="text-[10px] text-gray-400">Workshop · Home · Roadside</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="text-gray-400 hover:text-white text-xs p-1 rounded-md transition-colors"
                            aria-label="Close chat"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Messages Body */}
                    <div className="flex-1 overflow-y-auto p-3.5 space-y-3 text-xs bg-[#090D14]">
                        {messages.map((m, idx) => {
                            const isUser = m.role === "user";
                            return (
                                <div
                                    key={idx}
                                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                                >
                                    <div
                                        className={`max-w-[82%] px-3.5 py-2.5 rounded-xl leading-relaxed ${
                                            isUser
                                                ? "bg-[#2563EB] text-white rounded-br-xs font-medium"
                                                : "bg-[#151D2A] text-[#E8EDF5] border border-[#1e293b] rounded-bl-xs"
                                        }`}
                                    >
                                        {m.content}
                                    </div>
                                </div>
                            );
                        })}

                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-[#151D2A] text-gray-400 border border-[#1e293b] px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 bg-[#2563EB] rounded-full animate-bounce"></span>
                                    <span className="w-1.5 h-1.5 bg-[#2563EB] rounded-full animate-bounce [animation-delay:0.2s]"></span>
                                    <span className="w-1.5 h-1.5 bg-[#2563EB] rounded-full animate-bounce [animation-delay:0.4s]"></span>
                                    <span className="text-[11px] ml-1">Thinking...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Quick suggestion pills (only when conversation is short) */}
                    {messages.length <= 2 && (
                        <div className="px-3 py-2 bg-[#090D14] border-t border-[#1e293b]/50 flex flex-wrap gap-1.5">
                            {QUICK_PROMPTS.slice(0, 3).map((prompt, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSend(prompt)}
                                    className="text-[10px] bg-[#151D2A] hover:bg-[#1e293b] text-gray-300 border border-[#1e293b] px-2 py-1 rounded-md transition-colors"
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
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask about workshop, home or emergency..."
                            className="flex-1 bg-[#090D14] border border-[#1e293b] rounded-lg px-3 py-2 text-xs text-[#E8EDF5] placeholder-gray-500 outline-none focus:border-[#2563EB] transition-colors"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || loading}
                            className="bg-[#2563EB] hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors"
                        >
                            Send
                        </button>
                    </form>
                </div>
            )}

            {/* Floating Action Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-12 h-12 rounded-full bg-[#2563EB] hover:bg-blue-700 text-white flex items-center justify-center shadow-lg shadow-blue-900/40 hover:scale-105 active:scale-95 transition-all focus:outline-none"
                aria-label="Toggle Car Assistance AI Chat"
            >
                {isOpen ? (
                    <span className="text-sm font-bold">✕</span>
                ) : (
                    <div className="flex flex-col items-center justify-center leading-none">
                        <span className="text-[15px]">💬</span>
                    </div>
                )}
            </button>
        </div>
    );
}

