"use client";

import { useEffect, useState, useCallback } from "react";

export default function AdminRoadsidePage() {
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<number | null>(null);
    const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

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

    useEffect(() => {
        if (typeof window === "undefined") return;
        fetchRoadside();
        // Poll every 5 seconds so new alerts show up immediately
        const interval = setInterval(fetchRoadside, 5000);
        return () => clearInterval(interval);
    }, [fetchRoadside]);

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
                fetchRoadside();
            }
        } finally {
            setUpdatingId(null);
        }
    };

    if (loading) return <div className="p-20 text-center text-gray-500 text-xs">Loading Emergency Dispatch Board...</div>;

    const pendingCount = requests.filter(r => r.status?.toLowerCase() === "pending").length;
    const enRouteCount = requests.filter(r => ["en route", "dispatched", "in_progress"].includes(r.status?.toLowerCase())).length;
    const resolvedCount = requests.filter(r => r.status?.toLowerCase() === "resolved").length;

    return (
        <main className="p-6 md:p-12 max-w-7xl mx-auto">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 border-b border-[#151D2A] pb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                        <h1 className="text-xl font-bold text-white uppercase tracking-wide">Emergency Roadside Dispatch Board</h1>
                        {pendingCount > 0 && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">
                                {pendingCount} PENDING ACTION
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Live active incident response command center</p>
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-[11px] text-gray-400 font-mono">
                        Live Sync (5s) · {lastRefreshed.toLocaleTimeString()}
                    </span>
                    <button
                        onClick={fetchRoadside}
                        className="text-xs border border-[#1e293b] hover:border-gray-500 text-gray-300 px-3 py-1.5 rounded-md transition-colors"
                    >
                        ↻ Refresh
                    </button>
                </div>
            </div>

            {/* Emergency Dispatch Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-[#151D2A] border border-[#1e293b] p-4 rounded-xl">
                    <p className="text-xs text-gray-400">Total Incidents</p>
                    <p className="text-xl font-bold text-white mt-1">{requests.length}</p>
                </div>
                <div className="bg-red-950/20 border border-red-500/40 p-4 rounded-xl">
                    <p className="text-xs text-red-400 font-bold uppercase">Pending Dispatch</p>
                    <p className="text-xl font-black text-red-400 mt-1">{pendingCount}</p>
                </div>
                <div className="bg-yellow-950/20 border border-yellow-500/40 p-4 rounded-xl">
                    <p className="text-xs text-yellow-400 font-bold uppercase">En Route Units</p>
                    <p className="text-xl font-black text-yellow-400 mt-1">{enRouteCount}</p>
                </div>
                <div className="bg-emerald-950/20 border border-emerald-500/40 p-4 rounded-xl">
                    <p className="text-xs text-emerald-400 font-bold uppercase">Resolved Today</p>
                    <p className="text-xl font-black text-emerald-400 mt-1">{resolvedCount}</p>
                </div>
            </div>

            {/* Dispatch Board Table */}
            <div className="bg-[#151D2A] border border-[#1e293b] rounded-xl overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-gray-300">
                        <thead className="text-[11px] uppercase bg-[#090D14] text-gray-400 border-b border-[#1e293b]">
                            <tr>
                                <th className="px-5 py-3.5">Incident ID / Time</th>
                                <th className="px-5 py-3.5">Customer & Phone</th>
                                <th className="px-5 py-3.5">Vehicle</th>
                                <th className="px-5 py-3.5">Breakdown Issue</th>
                                <th className="px-5 py-3.5">Live Location</th>
                                <th className="px-5 py-3.5">Dispatch Status</th>
                                <th className="px-5 py-3.5 text-right">Dispatch Control</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                                        No roadside assistance alerts logged yet.
                                    </td>
                                </tr>
                            ) : (
                                requests.map((r) => {
                                    const isUpdating = updatingId === r.id;
                                    const statusKey = (r.status || "").toLowerCase();
                                    const isPending = statusKey === "pending";
                                    const isEnRoute = statusKey === "en route" || statusKey === "dispatched" || statusKey === "in_progress";
                                    const isResolved = statusKey === "resolved";

                                    // Real Emergency Dispatch Board Row Styling:
                                    // Red for Pending, Yellow for En Route, Green for Resolved
                                    const rowBgClass = isPending
                                        ? "bg-red-500/10 border-l-4 border-l-red-500 hover:bg-red-500/15"
                                        : isEnRoute
                                            ? "bg-yellow-500/10 border-l-4 border-l-yellow-500 hover:bg-yellow-500/15"
                                            : isResolved
                                                ? "bg-emerald-500/10 border-l-4 border-l-emerald-500 hover:bg-emerald-500/15"
                                                : "bg-[#090D14]/40 hover:bg-[#1e293b]/30";

                                    return (
                                        <tr key={r.id} className={`border-b border-[#1e293b] transition-colors ${rowBgClass}`}>
                                            {/* ID & Date */}
                                            <td className="px-5 py-3.5 whitespace-nowrap">
                                                <p className="font-mono font-bold text-white">#{r.id}</p>
                                                <p className="text-[11px] text-gray-400">{new Date(r.created_at).toLocaleString()}</p>
                                            </td>

                                            {/* Customer */}
                                            <td className="px-5 py-3.5">
                                                <p className="font-bold text-white">{r.user?.full_name || `User ${r.user_id}`}</p>
                                                <p className="text-[11px] text-gray-300 font-mono mt-0.5">
                                                    {r.user?.phone ? (
                                                        <a href={`tel:${r.user.phone}`} className="hover:text-[#2563EB] transition-colors inline-flex items-center gap-1">
                                                            📞 {r.user.phone}
                                                        </a>
                                                    ) : (
                                                        "—"
                                                    )}
                                                </p>
                                            </td>

                                            {/* Vehicle */}
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

                                            {/* Issue */}
                                            <td className="px-5 py-3.5">
                                                <span className="font-semibold text-white block">{r.issue_type}</span>
                                                {r.notes && (
                                                    <p className="text-[11px] text-gray-400 max-w-xs truncate mt-0.5" title={r.notes}>
                                                        Note: {r.notes}
                                                    </p>
                                                )}
                                            </td>

                                            {/* Location */}
                                            <td className="px-5 py-3.5 max-w-xs">
                                                <p className="font-mono text-gray-200 truncate" title={r.location}>{r.location}</p>
                                            </td>

                                            {/* Dispatch Status Badge */}
                                            <td className="px-5 py-3.5 whitespace-nowrap">
                                                <span className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider ${
                                                    isPending
                                                        ? 'bg-red-500/25 text-red-300 border border-red-500/50 animate-pulse'
                                                        : isEnRoute
                                                            ? 'bg-yellow-500/25 text-yellow-300 border border-yellow-500/50'
                                                            : isResolved
                                                                ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50'
                                                                : 'bg-gray-500/25 text-gray-300 border border-gray-500/50'
                                                }`}>
                                                    {isPending ? "🚨 Pending" : isEnRoute ? "⚡ En Route" : isResolved ? "✓ Resolved" : r.status}
                                                </span>
                                            </td>

                                            {/* Actions / Dispatch Unit */}
                                            <td className="px-5 py-3.5 text-right whitespace-nowrap">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {isPending && (
                                                        <button
                                                            disabled={isUpdating}
                                                            onClick={() => updateStatus(r.id, 'en route')}
                                                            className="bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-black px-3 py-1.5 rounded text-[11px] font-black transition-colors shadow-md shadow-yellow-950/40"
                                                        >
                                                            Dispatch Unit ⚡
                                                        </button>
                                                    )}
                                                    {isEnRoute && (
                                                        <button
                                                            disabled={isUpdating}
                                                            onClick={() => updateStatus(r.id, 'resolved')}
                                                            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded text-[11px] font-bold transition-colors shadow-md shadow-emerald-950/40"
                                                        >
                                                            Mark Resolved ✓
                                                        </button>
                                                    )}
                                                    {!isResolved && statusKey !== 'cancelled' && (
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
        </main>
    );
}

