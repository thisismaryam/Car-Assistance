"use client";

import { useEffect, useState, useCallback } from "react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function AdminMechanicsPage() {
    const [mechanics, setMechanics] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showBreakModal, setShowBreakModal] = useState(false);
    const [selectedMechanicId, setSelectedMechanicId] = useState<number | null>(null);
    const [message, setMessage] = useState("");

    // New mechanic form
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");

    // Break form
    const [breakStart, setBreakStart] = useState("");
    const [breakEnd, setBreakEnd] = useState("");
    const [breakReason, setBreakReason] = useState("Lunch / Scheduled Break");

    const fetchMechanics = useCallback(() => {
        if (typeof window === "undefined") return;
        const token = localStorage.getItem("token");
        if (!token) return;

        fetch("http://localhost:8000/admin/mechanics", {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.ok ? res.json() : [])
            .then(data => {
                setMechanics(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchMechanics();
    }, [fetchMechanics]);

    const handleCreateMechanic = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage("");
        const token = localStorage.getItem("token");

        try {
            const res = await fetch("http://localhost:8000/admin/mechanics", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    full_name: fullName,
                    email,
                    phone,
                    password
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Failed to create mechanic account");
            }

            setShowAddModal(false);
            setFullName("");
            setEmail("");
            setPhone("");
            setPassword("");
            fetchMechanics();
            setMessage("Mechanic account created with standard Mon-Sat 09:00-18:00 schedule!");
        } catch (err: any) {
            setMessage(`Error: ${err.message}`);
        }
    };

    const handleAddBreak = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedMechanicId) return;
        setMessage("");
        const token = localStorage.getItem("token");

        try {
            const res = await fetch(`http://localhost:8000/admin/mechanics/${selectedMechanicId}/time-off`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    start_time: new Date(breakStart).toISOString(),
                    end_time: new Date(breakEnd).toISOString(),
                    reason: breakReason
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Failed to log break");
            }

            setShowBreakModal(false);
            setBreakStart("");
            setBreakEnd("");
            fetchMechanics();
            setMessage("Mechanic break logged successfully! Home service availability automatically updated.");
        } catch (err: any) {
            setMessage(`Error: ${err.message}`);
        }
    };

    const handleDeleteTimeOff = async (mechanicId: number, timeOffId: number) => {
        const token = localStorage.getItem("token");
        await fetch(`http://localhost:8000/admin/mechanics/${mechanicId}/time-off/${timeOffId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
        });
        fetchMechanics();
    };

    if (loading) return <div className="p-20 text-center text-gray-500 text-xs">Loading Mechanics...</div>;

    return (
        <main className="p-6 md:p-12 max-w-6xl mx-auto min-h-screen">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 border-b border-[#151D2A] pb-4">
                <div>
                    <h1 className="text-xl font-bold text-white">Mechanic Roster & Shift Schedules</h1>
                    <p className="text-xs text-gray-400 mt-1">Manage duty hours, break periods, and assignment eligibility</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-md shadow-blue-900/20"
                >
                    + Add Mechanic
                </button>
            </div>

            {message && (
                <div className={`p-3 text-xs mb-6 rounded-md ${message.includes("Error") ? "bg-red-500/10 text-red-400 border border-red-500/30" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"}`}>
                    {message}
                </div>
            )}

            {/* Mechanics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {mechanics.length === 0 ? (
                    <div className="col-span-2 text-center p-12 bg-[#151D2A] border border-[#1e293b] rounded-xl text-gray-500 text-xs">
                        No mechanics registered yet. Click &quot;+ Add Mechanic&quot; to create a mechanic profile.
                    </div>
                ) : (
                    mechanics.map((m) => {
                        return (
                            <div key={m.id} className="bg-[#151D2A] border border-[#1e293b] rounded-xl p-5 shadow-lg flex flex-col justify-between">
                                <div>
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h3 className="text-sm font-bold text-white">{m.full_name}</h3>
                                            <p className="text-xs text-gray-400 font-mono mt-0.5">{m.email} · {m.phone}</p>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${m.is_active ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-gray-500/15 text-gray-400"}`}>
                                            {m.is_active ? "Active Duty" : "Inactive"}
                                        </span>
                                    </div>

                                    {/* Working Days */}
                                    <div className="mb-4">
                                        <p className="text-[11px] font-medium text-gray-400 mb-1.5">Scheduled Working Days (09:00 - 18:00 UTC):</p>
                                        <div className="flex gap-1.5">
                                            {DAYS.map((d, idx) => {
                                                const isWorking = m.schedules?.some((s: any) => s.day_of_week === idx && s.is_active);
                                                return (
                                                    <span
                                                        key={d}
                                                        className={`text-[10px] font-bold px-2 py-1 rounded ${
                                                            isWorking
                                                                ? "bg-[#2563EB]/20 text-[#2563EB] border border-[#2563EB]/40"
                                                                : "bg-[#090D14] text-gray-600 border border-[#1e293b]"
                                                        }`}
                                                    >
                                                        {d}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Breaks / Time Off */}
                                    <div className="bg-[#090D14] p-3 rounded-lg border border-[#1e293b] mb-4">
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="text-[11px] font-semibold text-gray-300">Upcoming Breaks & Time-Off:</span>
                                            <button
                                                onClick={() => { setSelectedMechanicId(m.id); setShowBreakModal(true); }}
                                                className="text-[10px] text-[#2563EB] hover:text-blue-400 font-bold"
                                            >
                                                + Log Break
                                            </button>
                                        </div>
                                        {m.time_offs && m.time_offs.length > 0 ? (
                                            <div className="space-y-1.5 max-h-28 overflow-y-auto">
                                                {m.time_offs.map((t: any) => (
                                                    <div key={t.id} className="flex justify-between items-center text-[11px] py-1 border-b border-[#151D2A] last:border-0">
                                                        <div>
                                                            <span className="text-gray-300 font-medium">{t.reason}</span>
                                                            <p className="text-[10px] text-gray-500">
                                                                {new Date(t.start_time).toLocaleString()} → {new Date(t.end_time).toLocaleTimeString()}
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => handleDeleteTimeOff(m.id, t.id)}
                                                            className="text-gray-500 hover:text-red-400 text-xs px-1"
                                                            title="Delete Break"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-[11px] text-gray-500 italic">No scheduled breaks logged.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* ADD MECHANIC MODAL */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-[#151D2A] border border-[#1e293b] rounded-xl max-w-md w-full p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-4 border-b border-[#1e293b] pb-3">
                            <h2 className="text-sm font-bold text-white">Create Mechanic Profile</h2>
                            <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white text-xs">✕</button>
                        </div>
                        <form onSubmit={handleCreateMechanic} className="space-y-3">
                            <div>
                                <label className="block text-xs text-gray-300 mb-1">Full Name</label>
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={e => setFullName(e.target.value)}
                                    placeholder="e.g. Tariq Mahmood"
                                    className="w-full p-2 bg-[#090D14] border border-[#1e293b] rounded text-xs text-white outline-none focus:border-[#2563EB]"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-300 mb-1">Email Address</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="mechanic@carassistance.com"
                                    className="w-full p-2 bg-[#090D14] border border-[#1e293b] rounded text-xs text-white outline-none focus:border-[#2563EB]"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-300 mb-1">Phone Number</label>
                                <input
                                    type="text"
                                    value={phone}
                                    onChange={e => setPhone(e.target.value)}
                                    placeholder="+92 300 1234567"
                                    className="w-full p-2 bg-[#090D14] border border-[#1e293b] rounded text-xs text-white outline-none focus:border-[#2563EB]"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-300 mb-1">Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Min 6 characters"
                                    className="w-full p-2 bg-[#090D14] border border-[#1e293b] rounded text-xs text-white outline-none focus:border-[#2563EB]"
                                    required
                                />
                            </div>
                            <div className="flex gap-2 pt-3">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="border border-[#1e293b] text-gray-400 px-4 py-2 rounded text-xs hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="bg-[#2563EB] hover:bg-blue-700 text-white font-bold px-4 py-2 rounded text-xs flex-1 transition-colors"
                                >
                                    Save Mechanic
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* LOG BREAK MODAL */}
            {showBreakModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-[#151D2A] border border-[#1e293b] rounded-xl max-w-md w-full p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-4 border-b border-[#1e293b] pb-3">
                            <h2 className="text-sm font-bold text-white">Log Unavailable Window / Break</h2>
                            <button onClick={() => setShowBreakModal(false)} className="text-gray-400 hover:text-white text-xs">✕</button>
                        </div>
                        <form onSubmit={handleAddBreak} className="space-y-3">
                            <div>
                                <label className="block text-xs text-gray-300 mb-1">Start Date & Time</label>
                                <input
                                    type="datetime-local"
                                    value={breakStart}
                                    onChange={e => setBreakStart(e.target.value)}
                                    className="w-full p-2 bg-[#090D14] border border-[#1e293b] rounded text-xs text-white outline-none focus:border-[#2563EB]"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-300 mb-1">End Date & Time</label>
                                <input
                                    type="datetime-local"
                                    value={breakEnd}
                                    onChange={e => setBreakEnd(e.target.value)}
                                    className="w-full p-2 bg-[#090D14] border border-[#1e293b] rounded text-xs text-white outline-none focus:border-[#2563EB]"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-300 mb-1">Reason</label>
                                <input
                                    type="text"
                                    value={breakReason}
                                    onChange={e => setBreakReason(e.target.value)}
                                    placeholder="e.g. Lunch, Tool maintenance, Personal emergency"
                                    className="w-full p-2 bg-[#090D14] border border-[#1e293b] rounded text-xs text-white outline-none focus:border-[#2563EB]"
                                    required
                                />
                            </div>
                            <div className="flex gap-2 pt-3">
                                <button
                                    type="button"
                                    onClick={() => setShowBreakModal(false)}
                                    className="border border-[#1e293b] text-gray-400 px-4 py-2 rounded text-xs hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="bg-[#2563EB] hover:bg-blue-700 text-white font-bold px-4 py-2 rounded text-xs flex-1 transition-colors"
                                >
                                    Record Break Period
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </main>
    );
}

