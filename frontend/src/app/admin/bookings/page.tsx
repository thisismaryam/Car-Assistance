"use client";

import { useEffect, useState } from "react";

export default function AdminBookingsPage() {
    const [bookings, setBookings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchBookings = () => {
        const token = localStorage.getItem("token");
        fetch("http://localhost:8000/bookings/all", {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                setBookings(data);
                setLoading(false);
            });
    };

    useEffect(() => { fetchBookings(); }, []);

    const updateStatus = async (id: number, newStatus: string) => {
        const token = localStorage.getItem("token");
        await fetch(`http://localhost:8000/bookings/${id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ status: newStatus }),
        });
        fetchBookings();
    };

    if (loading) return <div className="p-20 text-center text-gray-500">Loading Bookings...</div>;

    return (
        <main className="p-6 md:p-12 max-w-6xl mx-auto">
            <div className="mb-8 border-b border-[#151D2A] pb-4">
                <h1 className="text-2xl font-bold text-white">All Bookings</h1>
                <p className="text-sm text-gray-400">Manage incoming customer requests</p>
            </div>

            <div className="bg-[#151D2A] border border-[#1e293b] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-300">
                        <thead className="text-xs uppercase bg-[#090D14] text-gray-400 border-b border-[#1e293b]">
                            <tr>
                                <th className="px-6 py-4">ID / Date</th>
                                <th className="px-6 py-4">Customer</th>
                                <th className="px-6 py-4">Vehicle</th>
                                <th className="px-6 py-4">Service</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bookings.map((b: any) => (
                                <tr key={b.id} className="border-b border-[#1e293b] hover:bg-[#1e293b]/30 transition-colors">
                                    <td className="px-6 py-4">
                                        <p className="font-bold text-white">#{b.id}</p>
                                        <p className="text-xs text-gray-500">{new Date(b.scheduled_at).toLocaleDateString()}</p>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-white">{b.customer?.full_name}</td>
                                    <td className="px-6 py-4">{b.vehicle?.make} {b.vehicle?.model}</td>
                                    <td className="px-6 py-4">{b.service?.name}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${b.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                                                b.status === 'confirmed' ? 'bg-blue-500/10 text-blue-500' :
                                                    'bg-green-500/10 text-green-500'
                                            }`}>
                                            {b.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 flex gap-2">
                                        {b.status === 'pending' && (
                                            <button onClick={() => updateStatus(b.id, 'confirmed')} className="bg-[#2563EB] hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-bold transition-colors">Confirm</button>
                                        )}
                                        {b.status === 'confirmed' && (
                                            <button onClick={() => updateStatus(b.id, 'completed')} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-xs font-bold transition-colors">Complete</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    );
}