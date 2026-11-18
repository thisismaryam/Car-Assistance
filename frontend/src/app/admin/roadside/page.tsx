"use client";

import { useEffect, useState, useCallback, useRef } from "react";

const LIFECYCLE_STEPS = [
    { key: "requested", label: "Requested" },
    { key: "accepted", label: "Accepted" },
    { key: "assigned", label: "Assigned" },
    { key: "en route", label: "En Route" },
    { key: "arrived", label: "Arrived" },
    { key: "resolved", label: "Resolved" },
    { key: "cancelled", label: "Cancelled" },
];

export default function AdminRoadsidePage() {
    const [requests, setRequests] = useState<any[]>([]);
    const [mechanics, setMechanics] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<number | null>(null);
    const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
    const [wsConnected, setWsConnected] = useState(false);

    // Assignment Modal State
    const [assigningIncident, setAssigningIncident] = useState<any | null>(null);
    const [selectedMechanicId, setSelectedMechanicId] = useState<string>("");
    const [assignNotes, setAssignNotes] = useState("");
    const [assigning, setAssigning] = useState(false);
    const [assignError, setAssignError] = useState("");

    const wsRef = useRef<WebSocket | null>(null);

    const fetchRoadside = useCallback(() => {
        if (typeof window === "undefined") return;
        const token = localStorage.getItem("token");
        if (!token) return;

        fetch("http://localhost:8000/roadside/all", {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.ok ? res.json() : [])
            .then(data => {
                if (Array.isArray(data)) {
                    setRequests(data);
                }
                setLoading(false);
                setLastRefreshed(new Date());
            })
            .catch(() => {
                setLoading(false);
            });
    }, []);

    const fetchMechanics = useCallback(() => {
        if (typeof window === "undefined") return;
        const token = localStorage.getItem("token");
        if (!token) return;

        fetch("http://localhost:8000/admin/mechanics/", {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.ok ? res.json() : [])
            .then(data => {
                if (Array.isArray(data)) {
                    setMechanics(data);
                }
            })
            .catch(() => {});
    }, []);

    // Setup WebSocket connection with auto-reconnect fallback
    useEffect(() => {
        if (typeof window === "undefined") return;
        fetchRoadside();
        fetchMechanics();

        let socket: WebSocket | null = null;
        let reconnectTimeout: any = null;

        const connectWS = () => {
            try {
                socket = new WebSocket("ws://localhost:8000/roadside/ws/admin");
                wsRef.current = socket;

                socket.onopen = () => {
                    setWsConnected(true);
                };

                socket.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);
                        if (msg.event === "new_incident" && msg.data) {
                            setRequests(prev => [msg.data, ...prev.filter(r => r.id !== msg.data.id)]);
                            setLastRefreshed(new Date());
                        } else if ((msg.event === "incident_assigned" || msg.event === "incident_status_updated") && msg.data) {
                            setRequests(prev => prev.map(r => r.id === msg.data.id ? msg.data : r));
                            setLastRefreshed(new Date());
                        }
                    } catch {
                        // ignore malformed ws messages
                    }
                };

                socket.onclose = () => {
                    setWsConnected(false);
                    reconnectTimeout = setTimeout(connectWS, 4000);
                };

                socket.onerror = () => {
                    setWsConnected(false);
                    socket?.close();
                };
            } catch {
                setWsConnected(false);
            }
        };

        connectWS();

        // 10s fallback polling
        const interval = setInterval(fetchRoadside, 10000);

        return () => {
            clearInterval(interval);
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            if (socket) socket.close();
        };
    }, [fetchRoadside, fetchMechanics]);

    const updateStatus = async (id: number, newStatus: string) => {
        const token = localStorage.getItem("token");
        setUpdatingId(id);
        try {
            const res = await fetch(`http://localhost:8000/roadside/${id}/status`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) {
                const updated = await res.json();
                setRequests(prev => prev.map(r => r.id === id ? updated : r));
            }
        } finally {
            setUpdatingId(null);
        }
    };

    const handleAssignProvider = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assigningIncident || !selectedMechanicId) return;
        const token = localStorage.getItem("token");
        setAssigning(true);
        setAssignError("");

        try {
            const res = await fetch(`http://localhost:8000/roadside/${assigningIncident.id}/assign`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    mechanic_id: parseInt(selectedMechanicId),
                    notes: assignNotes.trim() || null,
                }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || "Failed to assign provider");
            }

            const updated = await res.json();
            setRequests(prev => prev.map(r => r.id === assigningIncident.id ? updated : r));
            setAssigningIncident(null);
            setSelectedMechanicId("");
            setAssignNotes("");
        } catch (err: any) {
            setAssignError(err.message);
        } finally {
            setAssigning(false);
        }
    };

    if (loading) return <div className="p-20 text-center text-gray-500 text-xs">Loading Emergency Dispatch Board...</div>;

    const requestedCount = requests.filter(r => ["requested", "pending"].includes(r.status?.toLowerCase())).length;
    const acceptedCount = requests.filter(r => r.status?.toLowerCase() === "accepted").length;
    const assignedCount = requests.filter(r => r.status?.toLowerCase() === "assigned").length;
    const enRouteCount = requests.filter(r => ["en route", "en_route", "dispatched"].includes(r.status?.toLowerCase())).length;
    const resolvedCount = requests.filter(r => r.status?.toLowerCase() === "resolved").length;

    return (
        <main className="p-6 md:p-12 max-w-7xl mx-auto">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 border-b border-[#151D2A] pb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                        <h1 className="text-xl font-bold text-white uppercase tracking-wide">Emergency Roadside Dispatch Board</h1>
                        {requestedCount > 0 && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">
                                {requestedCount} NEW REQUESTS
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Live incident queue with real-time WebSocket push stream</p>
                </div>

                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-[11px] font-mono">
                        <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`}></span>
                        <span className={wsConnected ? "text-emerald-400" : "text-amber-400"}>
                            {wsConnected ? "Live WebSocket Sync" : "Syncing (10s Polling)"}
                        </span>
                    </span>
                    <button
                        onClick={fetchRoadside}
                        className="text-xs border border-[#1e293b] hover:border-gray-500 text-gray-300 px-3 py-1.5 rounded-md transition-colors"
                    >
                        ↻ Refresh
                    </button>
                </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                <div className="bg-[#151D2A] border border-[#1e293b] p-3.5 rounded-xl">
                    <p className="text-[11px] text-gray-400">Total Logged</p>
                    <p className="text-lg font-bold text-white mt-0.5">{requests.length}</p>
                </div>
                <div className="bg-red-950/20 border border-red-500/40 p-3.5 rounded-xl">
                    <p className="text-[11px] text-red-400 font-bold uppercase">Requested</p>
                    <p className="text-lg font-black text-red-400 mt-0.5">{requestedCount}</p>
                </div>
                <div className="bg-blue-950/20 border border-blue-500/40 p-3.5 rounded-xl">
                    <p className="text-[11px] text-blue-400 font-bold uppercase">Assigned Units</p>
                    <p className="text-lg font-black text-blue-400 mt-0.5">{assignedCount}</p>
                </div>
                <div className="bg-yellow-950/20 border border-yellow-500/40 p-3.5 rounded-xl">
                    <p className="text-[11px] text-yellow-400 font-bold uppercase">En Route</p>
                    <p className="text-lg font-black text-yellow-400 mt-0.5">{enRouteCount}</p>
                </div>
                <div className="bg-emerald-950/20 border border-emerald-500/40 p-3.5 rounded-xl">
                    <p className="text-[11px] text-emerald-400 font-bold uppercase">Resolved</p>
                    <p className="text-lg font-black text-emerald-400 mt-0.5">{resolvedCount}</p>
                </div>
            </div>

            {/* Incident Table */}
            <div className="bg-[#151D2A] border border-[#1e293b] rounded-xl overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-gray-300">
                        <thead className="text-[11px] uppercase bg-[#090D14] text-gray-400 border-b border-[#1e293b]">
                            <tr>
                                <th className="px-5 py-3.5">ID / Time</th>
                                <th className="px-5 py-3.5">Customer & Phone</th>
                                <th className="px-5 py-3.5">Vehicle</th>
                                <th className="px-5 py-3.5">Emergency Issue</th>
                                <th className="px-5 py-3.5">Location</th>
                                <th className="px-5 py-3.5">Assigned Provider</th>
                                <th className="px-5 py-3.5">Status</th>
                                <th className="px-5 py-3.5 text-right">Dispatch Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                                        No active roadside alerts logged in system.
                                    </td>
                                </tr>
                            ) : (
                                requests.map((r) => {
                                    const isUpdating = updatingId === r.id;
                                    const statusKey = (r.status || "").toLowerCase();
                                    const isRequested = statusKey === "requested" || statusKey === "pending";
                                    const isAccepted = statusKey === "accepted";
                                    const isAssigned = statusKey === "assigned";
                                    const isEnRoute = statusKey === "en route" || statusKey === "en_route";
                                    const isArrived = statusKey === "arrived";
                                    const isResolved = statusKey === "resolved";
                                    const isCancelled = statusKey === "cancelled";

                                    const rowBgClass = isRequested
                                        ? "bg-red-500/10 border-l-4 border-l-red-500 hover:bg-red-500/15"
                                        : isAccepted
                                        ? "bg-blue-500/10 border-l-4 border-l-blue-500 hover:bg-blue-500/15"
                                        : isAssigned
                                        ? "bg-purple-500/10 border-l-4 border-l-purple-500 hover:bg-purple-500/15"
                                        : isEnRoute
                                        ? "bg-yellow-500/10 border-l-4 border-l-yellow-500 hover:bg-yellow-500/15"
                                        : isArrived
                                        ? "bg-amber-500/10 border-l-4 border-l-amber-500 hover:bg-amber-500/15"
                                        : isResolved
                                        ? "bg-emerald-500/10 border-l-4 border-l-emerald-500 hover:bg-emerald-500/15"
                                        : "bg-[#090D14]/40 hover:bg-[#1e293b]/30";

                                    return (
                                        <tr key={r.id} className={`border-b border-[#1e293b] transition-colors ${rowBgClass}`}>
                                            <td className="px-5 py-3.5 whitespace-nowrap">
                                                <p className="font-mono font-bold text-white">#CA-EMERG-{r.id}</p>
                                                <p className="text-[11px] text-gray-400">{new Date(r.created_at).toLocaleTimeString()}</p>
                                            </td>

                                            <td className="px-5 py-3.5">
                                                <p className="font-bold text-white">{r.user?.full_name || `User ${r.user_id}`}</p>
                                                <p className="text-[11px] text-gray-300 font-mono mt-0.5">
                                                    {r.user?.phone ? (
                                                        <a href={`tel:${r.user.phone}`} className="hover:text-[#2563EB] transition-colors">
                                                            📞 {r.user.phone}
                                                        </a>
                                                    ) : "—"}
                                                </p>
                                            </td>

                                            <td className="px-5 py-3.5">
                                                {r.vehicle ? (
                                                    <div>
                                                        <p className="text-white font-medium">{r.vehicle.year} {r.vehicle.make} {r.vehicle.model}</p>
                                                        <p className="text-[11px] text-gray-400 font-mono">{r.vehicle.registration}</p>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 italic">Unregistered / Rental</span>
                                                )}
                                            </td>

                                            <td className="px-5 py-3.5">
                                                <span className="font-semibold text-white block">{r.issue_type}</span>
                                                {r.notes && (
                                                    <p className="text-[11px] text-gray-400 max-w-xs truncate mt-0.5" title={r.notes}>
                                                        Note: {r.notes}
                                                    </p>
                                                )}
                                            </td>

                                            <td className="px-5 py-3.5 max-w-xs">
                                                <p className="font-mono text-gray-200 truncate" title={r.location}>{r.location}</p>
                                            </td>

                                            <td className="px-5 py-3.5 whitespace-nowrap">
                                                {r.assigned_mechanic ? (
                                                    <div>
                                                        <p className="text-emerald-400 font-bold">✓ {r.assigned_mechanic.full_name}</p>
                                                        <p className="text-[10px] text-gray-400 font-mono">{r.assigned_mechanic.phone}</p>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => {
                                                            setAssigningIncident(r);
                                                            setSelectedMechanicId("");
                                                            setAssignNotes("");
                                                            setAssignError("");
                                                        }}
                                                        className="bg-[#2563EB]/20 hover:bg-[#2563EB]/30 text-[#2563EB] border border-[#2563EB]/40 px-2.5 py-1 rounded text-[11px] font-bold transition-colors"
                                                    >
                                                        + Assign Provider
                                                    </button>
                                                )}
                                            </td>

                                            <td className="px-5 py-3.5 whitespace-nowrap">
                                                <span className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider ${
                                                    isRequested
                                                        ? 'bg-red-500/25 text-red-300 border border-red-500/50 animate-pulse'
                                                        : isAccepted
                                                        ? 'bg-blue-500/25 text-blue-300 border border-blue-500/50'
                                                        : isAssigned
                                                        ? 'bg-purple-500/25 text-purple-300 border border-purple-500/50'
                                                        : isEnRoute
                                                        ? 'bg-yellow-500/25 text-yellow-300 border border-yellow-500/50'
                                                        : isArrived
                                                        ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50'
                                                        : isResolved
                                                        ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50'
                                                        : 'bg-gray-500/25 text-gray-300 border border-gray-500/50'
                                                }`}>
                                                    {r.status}
                                                </span>
                                            </td>

                                            <td className="px-5 py-3.5 text-right whitespace-nowrap">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {isRequested && (
                                                        <button
                                                            disabled={isUpdating}
                                                            onClick={() => updateStatus(r.id, 'accepted')}
                                                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-2.5 py-1 rounded text-[11px] font-bold transition-colors"
                                                        >
                                                            Accept ✓
                                                        </button>
                                                    )}

                                                    {(isAccepted || isRequested) && (
                                                        <button
                                                            onClick={() => {
                                                                setAssigningIncident(r);
                                                                setSelectedMechanicId("");
                                                                setAssignNotes("");
                                                                setAssignError("");
                                                            }}
                                                            className="bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1 rounded text-[11px] font-bold transition-colors"
                                                        >
                                                            Assign 🔧
                                                        </button>
                                                    )}

                                                    {isAssigned && (
                                                        <button
                                                            disabled={isUpdating}
                                                            onClick={() => updateStatus(r.id, 'en route')}
                                                            className="bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-black px-2.5 py-1 rounded text-[11px] font-black transition-colors"
                                                        >
                                                            En Route ⚡
                                                        </button>
                                                    )}

                                                    {isEnRoute && (
                                                        <button
                                                            disabled={isUpdating}
                                                            onClick={() => updateStatus(r.id, 'arrived')}
                                                            className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black px-2.5 py-1 rounded text-[11px] font-bold transition-colors"
                                                        >
                                                            Mark Arrived 📍
                                                        </button>
                                                    )}

                                                    {isArrived && (
                                                        <button
                                                            disabled={isUpdating}
                                                            onClick={() => updateStatus(r.id, 'resolved')}
                                                            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-2.5 py-1 rounded text-[11px] font-bold transition-colors"
                                                        >
                                                            Resolve ✓
                                                        </button>
                                                    )}

                                                    {!isResolved && !isCancelled && (
                                                        <button
                                                            disabled={isUpdating}
                                                            onClick={() => updateStatus(r.id, 'cancelled')}
                                                            className="border border-[#1e293b] hover:border-red-500 text-gray-400 hover:text-red-400 px-2 py-1 rounded text-[11px] transition-colors"
                                                        >
                                                            Cancel
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Provider Assignment Modal */}
            {assigningIncident && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-[#151D2A] border border-[#1e293b] rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in fade-in">
                        <div className="flex justify-between items-center mb-4 border-b border-[#101827] pb-3">
                            <div>
                                <h3 className="text-sm font-bold text-white">Assign Roadside Provider</h3>
                                <p className="text-[11px] text-gray-400">Incident #CA-EMERG-{assigningIncident.id} · {assigningIncident.issue_type}</p>
                            </div>
                            <button
                                onClick={() => setAssigningIncident(null)}
                                className="text-gray-400 hover:text-white text-sm"
                            >
                                ✕
                            </button>
                        </div>

                        {assignError && (
                            <div className="p-2.5 text-xs mb-4 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30">
                                {assignError}
                            </div>
                        )}

                        <form onSubmit={handleAssignProvider} className="space-y-4 text-xs">
                            <div>
                                <label className="block text-gray-300 font-semibold mb-1">Select Technician or Tow Provider *</label>
                                {mechanics.length === 0 ? (
                                    <p className="text-gray-400 italic py-2">No active mechanics found.</p>
                                ) : (
                                    <select
                                        value={selectedMechanicId}
                                        onChange={(e) => setSelectedMechanicId(e.target.value)}
                                        className="w-full bg-[#090D14] border border-[#1e293b] text-white p-2.5 rounded-lg outline-none focus:border-[#2563EB]"
                                        required
                                    >
                                        <option value="">-- Choose available technician --</option>
                                        {mechanics.map((m: any) => (
                                            <option key={m.id} value={m.id}>
                                                {m.full_name} ({m.phone}) - {m.role}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            <div>
                                <label className="block text-gray-300 font-semibold mb-1">Dispatch / Towing Provider Notes</label>
                                <textarea
                                    value={assignNotes}
                                    onChange={(e) => setAssignNotes(e.target.value)}
                                    placeholder="e.g. Dispatched flatbed unit #4, estimated arrival 20 mins"
                                    rows={2}
                                    className="w-full bg-[#090D14] border border-[#1e293b] text-white p-2.5 rounded-lg outline-none focus:border-[#2563EB]"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-[#101827]">
                                <button
                                    type="button"
                                    onClick={() => setAssigningIncident(null)}
                                    className="px-4 py-2 border border-[#1e293b] text-gray-300 hover:text-white rounded-lg text-xs"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={assigning || !selectedMechanicId}
                                    className="px-5 py-2 bg-[#2563EB] hover:bg-blue-600 disabled:opacity-50 text-white font-bold rounded-lg text-xs shadow-md shadow-blue-900/30"
                                >
                                    {assigning ? "Assigning..." : "Confirm Provider Assignment"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </main>
    );
}
