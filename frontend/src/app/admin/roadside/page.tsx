"use client";

import { useEffect, useState, useCallback } from "react";

export default function AdminRoadsidePage() {
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<number | null>(null);
    const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

    const fetchRoadside = useCallback(() => {
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

    if (loading) return <div className="p-20 text-center text-gray-500 text-xs">Loading Roadside Alerts...</div>;

    const pendingCount = requests.filter(r => r.status === "pending").length;
    const dispatchedCount = requests.filter(r => r.status === "dispatched").length;

    return (
        <main className="p-6 md:p-12 max-w-7xl mx-auto">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 border-b border-[#151D2A] pb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-bold text-white">Roadside Emergency Alerts</h1>
                        {pendingCount > 0 && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">
                                {pendingCount} PENDING
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Real-time incident dispatch queue & tracking</p>
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-[11px] text-gray-500 font-mono">
                        Auto-refresh (5s) · {lastRefreshed.toLocaleTimeString()}
                    </span>
                    <button
                        onClick={fetchRoadside}
                        className="text-xs border border-[#1e293b] hover:border-gray-500 text-gray-300 px-3 py-1.5 rounded-md transition-colors"
                    >
                        ↻ Refresh
                    </button>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-[#151D2A] border border-[#1e293b] p-4 rounded-xl">
                    <p className="text-xs text-gray-400">Total Alerts</p>
                    <p className="text-xl font-bold text-white mt-1">{requests.length}</p>
                </div>
                <div className="bg-[#151D2A] border border-[#1e293b] p-4 rounded-xl">
                    <p className="text-xs text-red-400 font-medium">Pending Dispatch</p>
                    <p className="text-xl font-bold text-red-400 mt-1">{pendingCount}</p>
                </div>
                <div className="bg-[#151D2A] border border-[#1e293b] p-4 rounded-xl">
                    <p className="text-xs text-[#2563EB] font-medium">En Route / Dispatched</p>
                    <p className="text-xl font-bold text-[#2563EB] mt-1">{dispatchedCount}</p>
                </div>
                <div className="bg-[#151D2A] border border-[#1e293b] p-4 rounded-xl">
                    <p className="text-xs text-emerald-400 font-medium">Resolved Today</p>
                    <p className="text-xl font-bold text-emerald-400 mt-1">
                        {requests.filter(r => r.status === "resolved").length}
                    </p>
                </div>
            </div>

            {/* Incident Alerts Table */}
            <div className="bg-[#151D2A] border border-[#1e293b] rounded-xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-gray-300">
                        <thead className="text-[11px] uppercase bg-[#090D14] text-gray-400 border-b border-[#1e293b]">
                            <tr>
                                <th className="px-5 py-3.5">ID / Time</th>
                                <th className="px-5 py-3.5">Customer & Phone</th>
                                <th className="px-5 py-3.5">Vehicle</th>
                                <th className="px-5 py-3.5">Issue</th>
                                <th className="px-5 py-3.5">Location</th>
                                <th className="px-5 py-3.5">Status</th>
                                <th className="px-5 py-3.5 text-right">Actions</th>
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
                                    return (
                                        <tr key={r.id} className="border-b border-[#1e293b] hover:bg-[#1e293b]/30 transition-colors">
                                            {/* ID & Date */}
                                            <td className="px-5 py-3.5 whitespace-nowrap">
                                                <p className="font-mono font-bold text-white">#{r.id}</p>
                                                <p className="text-[11px] text-gray-500">{new Date(r.created_at).toLocaleString()}</p>
                                            </td>

                                            {/* Customer */}
                                            <td className="px-5 py-3.5">
                                                <p className="font-bold text-white">{r.user?.full_name || `User ${r.user_id}`}</p>
                                                <p className="text-[11px] text-gray-400 font-mono">
                                                    {r.user?.phone ? (
                                                        <a href={`tel:${r.user.phone}`} className="hover:text-[#2563EB] transition-colors">
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
                                                    <span className="text-gray-500 italic">Unregistered / Rental</span>
                                                )}
                                            </td>

                                            {/* Issue */}
                                            <td className="px-5 py-3.5">
                                                <span className="font-semibold text-white block">{r.issue_type}</span>
                                                {r.notes && (
                                                    <p className="text-[11px] text-gray-400 max-w-xs truncate" title={r.notes}>
                                                        Note: {r.notes}
                                                    </p>
                                                )}
                                            </td>

                                            {/* Location */}
                                            <td className="px-5 py-3.5 max-w-xs">
                                                <p className="font-mono text-gray-200 truncate" title={r.location}>{r.location}</p>
                                            </td>

                                            {/* Status Badge */}
                                            <td className="px-5 py-3.5 whitespace-nowrap">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                                    r.status === 'pending'
                                                        ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                                        : r.status === 'dispatched'
                                                            ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                                            : r.status === 'resolved'
                                                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                                                : 'bg-gray-500/15 text-gray-400 border border-gray-500/30'
                                                }`}>
                                                    {r.status}
                                                </span>
                                            </td>

                                            {/* Actions */}
                                            <td className="px-5 py-3.5 text-right whitespace-nowrap">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {r.status === 'pending' && (
                                                        <button
                                                            disabled={isUpdating}
                                                            onClick={() => updateStatus(r.id, 'dispatched')}
                                                            className="bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 text-white px-2.5 py-1 rounded text-[11px] font-bold transition-colors"
                                                        >
                                                            Dispatch Unit
                                                        </button>
                                                    )}
                                                    {r.status === 'dispatched' && (
                                                        <button
                                                            disabled={isUpdating}
                                                            onClick={() => updateStatus(r.id, 'resolved')}
                                                            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-2.5 py-1 rounded text-[11px] font-bold transition-colors"
                                                        >
                                                            Resolve
                                                        </button>
                                                    )}
                                                    {r.status !== 'cancelled' && r.status !== 'resolved' && (
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

