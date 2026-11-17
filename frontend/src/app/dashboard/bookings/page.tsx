"use client";
import { useEffect, useState } from "react";

export default function MyBookingsPage() {
    const [bookings, setBookings] = useState([]);

    useEffect(() => {
        const token = localStorage.getItem("token");
        fetch("http://localhost:8000/bookings/my", {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => setBookings(data));
    }, []);

    return (
        <main className="p-6 md:p-12 max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold text-white mb-6">My Bookings</h1>

            {bookings.length === 0 ? (
                <p className="text-gray-400">You have no bookings yet.</p>
            ) : (
                <div className="bg-[#151D2A] border border-[#1e293b] rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-300">
                        <thead className="bg-[#090D14] text-gray-400 border-b border-[#1e293b]">
                            <tr>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Service</th>
                                <th className="px-6 py-4">Vehicle</th>
                                <th className="px-6 py-4">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bookings.map((b: any) => (
                                <tr key={b.id} className="border-b border-[#1e293b]">
                                    <td className="px-6 py-4">{new Date(b.scheduled_at).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 text-white font-medium">{b.service?.name}</td>
                                    <td className="px-6 py-4">{b.vehicle?.make} {b.vehicle?.model}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${b.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                                            b.status === 'confirmed' ? 'bg-blue-500/10 text-blue-500' :
                                                'bg-green-500/10 text-green-500'
                                            }`}>
                                            {b.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </main>
    );
}