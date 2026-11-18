"use client";

import { useEffect, useState, useCallback } from "react";

export default function AdminBookingsPage() {
    const [bookings, setBookings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState("");
    const [assigningBooking, setAssigningBooking] = useState<any | null>(null);
    const [availableMechanics, setAvailableMechanics] = useState<any[]>([]);
    const [selectedMechanicId, setSelectedMechanicId] = useState<string>("");
    const [loadingMechs, setLoadingMechs] = useState(false);

    const fetchBookings = useCallback(() => {
        if (typeof window === "undefined") return;
        const token = localStorage.getItem("token");
        if (!token) return;

        fetch("http://localhost:8000/bookings/all", {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.ok ? res.json() : [])
            .then(data => {
                setBookings(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchBookings();
    }, [fetchBookings]);

    const updateStatus = async (id: number, newStatus: string) => {
        const token = localStorage.getItem("token");
        setMessage("");
        try {
            const res = await fetch(`http://localhost:8000/bookings/${id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) {
                fetchBookings();
                setMessage(`Booking #${id} status updated to ${newStatus}.`);
            }
        } catch (err: any) {
            setMessage(`Error updating status: ${err.message}`);
        }
    };

    const openAssignModal = async (booking: any) => {
        setAssigningBooking(booking);
        setSelectedMechanicId(booking.mechanic_id ? booking.mechanic_id.toString() : "");
        setLoadingMechs(true);
        const token = localStorage.getItem("token");

        try {
            const res = await fetch(`http://localhost:8000/admin/mechanics/available-for-booking/${booking.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAvailableMechanics(Array.isArray(data) ? data : []);
            }
        } catch {
            setAvailableMechanics([]);
        } finally {
            setLoadingMechs(false);
        }
    };

    const handleAssignMechanic = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assigningBooking || !selectedMechanicId) return;
        const token = localStorage.getItem("token");
        setMessage("");

        try {
            const res = await fetch(`http://localhost:8000/bookings/${assigningBooking.id}/assign`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ mechanic_id: parseInt(selectedMechanicId) })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Failed to assign mechanic");
            }

            setAssigningBooking(null);
            fetchBookings();
            setMessage(`Mechanic assigned to booking #${assigningBooking.id} successfully!`);
        } catch (err: any) {
            setMessage(`Assignment Conflict: ${err.message}`);
        }
    };

    if (loading) return <div className="p-20 text-center text-gray-500 text-xs">Loading Bookings...</div>;

    return (
        <main className="p-6 md:p-12 max-w-7xl mx-auto min-h-screen">
            <div className="mb-8 border-b border-[#151D2A] pb-4 flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold text-white">All Service Bookings</h1>
                    <p className="text-xs text-gray-400 mt-1">Manage workshop appointments, home visits, and mechanic assignments</p>
                </div>
                <button
                    onClick={fetchBookings}
                    className="text-xs border border-[#1e293b] hover:border-gray-500 text-gray-300 px-3 py-1.5 rounded-md transition-colors"
                >
                    ↻ Refresh
                </button>
            </div>

            {message && (
                <div className={`p-3 text-xs mb-6 rounded-md ${message.includes("Error") || message.includes("Conflict") ? "bg-red-500/10 text-red-400 border border-red-500/30" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"}`}>
                    {message}
                </div>
            )}

            <div className="bg-[#151D2A] border border-[#1e293b] rounded-xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-gray-300">
                        <thead className="text-[11px] uppercase bg-[#090D14] text-gray-400 border-b border-[#1e293b]">
                            <tr>
                                <th className="px-5 py-3.5">ID / Date</th>
                                <th className="px-5 py-3.5">Customer</th>
                                <th className="px-5 py-3.5">Vehicle</th>
                                <th className="px-5 py-3.5">Service & Type</th>
                                <th className="px-5 py-3.5">Assigned Mechanic</th>
                                <th className="px-5 py-3.5">Status</th>
                                <th className="px-5 py-3.5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bookings.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                                        No bookings found.
                                    </td>
                                </tr>
                            ) : (
                                bookings.map((b: any) => (
                                    <tr key={b.id} className="border-b border-[#1e293b] hover:bg-[#1e293b]/30 transition-colors">
                                        <td className="px-5 py-3.5 whitespace-nowrap">
                                            <p className="font-mono font-bold text-white">#{b.id}</p>
                                            <p className="text-[11px] text-gray-400">{new Date(b.scheduled_at).toLocaleString()}</p>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <p className="font-bold text-white">{b.customer?.full_name}</p>
                                            <p className="text-[11px] text-gray-500 font-mono">{b.customer?.phone}</p>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <p className="text-white font-medium">{b.vehicle?.year} {b.vehicle?.make} {b.vehicle?.model}</p>
                                            <p className="text-[11px] text-gray-500 font-mono">{b.vehicle?.registration}</p>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className="font-semibold text-white block">{b.service?.name}</span>
                                            <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${b.service?.service_type === "home" ? "bg-purple-500/15 text-purple-300" : "bg-blue-500/15 text-blue-300"}`}>
                                                {b.service?.service_type}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {b.mechanic ? (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-white font-medium text-xs">🔧 {b.mechanic.full_name}</span>
                                                    <button
                                                        onClick={() => openAssignModal(b)}
                                                        className="text-[10px] text-[#2563EB] hover:text-blue-400 font-bold"
                                                        title="Reassign Mechanic"
                                                    >
                                                        Change
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => openAssignModal(b)}
                                                    className="text-[10px] bg-[#090D14] hover:bg-[#1e293b] text-[#2563EB] border border-[#2563EB]/40 px-2 py-1 rounded font-bold transition-colors"
                                                >
                                                    + Assign Mechanic
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5 whitespace-nowrap">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                                b.status === 'pending' ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30' :
                                                b.status === 'assigned' ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30' :
                                                b.status === 'confirmed' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' :
                                                b.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                                                'bg-gray-500/15 text-gray-400 border border-gray-500/30'
                                            }`}>
                                                {b.status}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {b.status === 'pending' && (
                                                    <button onClick={() => updateStatus(b.id, 'confirmed')} className="bg-[#2563EB] hover:bg-blue-700 text-white px-2.5 py-1 rounded text-[11px] font-bold transition-colors">Confirm</button>
                                                )}
                                                {(b.status === 'confirmed' || b.status === 'assigned') && (
                                                    <button onClick={() => updateStatus(b.id, 'completed')} className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded text-[11px] font-bold transition-colors">Complete</button>
                                                )}
                                                {b.status !== 'cancelled' && b.status !== 'completed' && (
                                                    <button onClick={() => updateStatus(b.id, 'cancelled')} className="border border-[#1e293b] hover:border-red-500 text-gray-400 hover:text-red-400 px-2 py-1 rounded text-[11px] transition-colors">Cancel</button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ASSIGN MECHANIC MODAL */}
            {assigningBooking && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-[#151D2A] border border-[#1e293b] rounded-xl max-w-md w-full p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-4 border-b border-[#1e293b] pb-3">
                            <div>
                                <h2 className="text-sm font-bold text-white">Assign Mechanic to Booking #{assigningBooking.id}</h2>
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                    {assigningBooking.service?.name} · {new Date(assigningBooking.scheduled_at).toLocaleString()}
                                </p>
                            </div>
                            <button onClick={() => setAssigningBooking(null)} className="text-gray-400 hover:text-white text-xs">✕</button>
                        </div>

                        {loadingMechs ? (
                            <p className="text-xs text-gray-400 py-6 text-center">Checking conflict-free mechanics on duty...</p>
                        ) : availableMechanics.length === 0 ? (
                            <div className="p-4 bg-[#090D14] border border-[#1e293b] rounded-lg text-xs text-yellow-400 mb-4">
                                No eligible mechanics are free for this slot (all on-duty mechanics are either off-duty, on break, or booked with overlapping service + travel buffer).
                            </div>
                        ) : (
                            <form onSubmit={handleAssignMechanic} className="space-y-4">
                                <div>
                                    <label className="block text-xs text-gray-300 mb-1.5">Select Available Mechanic (Duty & Travel verified):</label>
                                    <select
                                        value={selectedMechanicId}
                                        onChange={e => setSelectedMechanicId(e.target.value)}
                                        className="w-full p-2.5 bg-[#090D14] border border-[#1e293b] rounded-lg text-xs text-white outline-none focus:border-[#2563EB]"
                                        required
                                    >
                                        <option value="">-- Choose verified mechanic --</option>
                                        {availableMechanics.map(m => (
                                            <option key={m.id} value={m.id}>
                                                {m.full_name} ({m.phone})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setAssigningBooking(null)}
                                        className="border border-[#1e293b] text-gray-400 px-4 py-2 rounded text-xs hover:text-white"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={!selectedMechanicId}
                                        className="bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded text-xs flex-1 transition-colors"
                                    >
                                        Confirm Assignment
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </main>
    );
}
