"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) {
            router.push("/login");
            return;
        }

        const headers = { Authorization: `Bearer ${token}` };

        fetch("http://localhost:8000/auth/me", { headers })
            .then((res) => {
                if (!res.ok) throw new Error("Unauthorized");
                return res.json();
            })
            .then((userData) => {
                if (userData.role !== "admin") {
                    router.push("/dashboard");
                    return;
                }
                setUser(userData);
                return fetch("http://localhost:8000/bookings/all", { headers });
            })
            .then((res) => res?.json())
            .then((bookingsData) => {
                if (bookingsData) setBookings(bookingsData);
                setLoading(false);
            })
            .catch(() => {
                localStorage.removeItem("token");
                router.push("/login");
            });
    }, [router]);

    const updateStatus = async (bookingId: number, newStatus: string) => {
        const token = localStorage.getItem("token");
        try {
            const res = await fetch(`http://localhost:8000/bookings/${bookingId}/status`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ status: newStatus }),
            });

            if (res.ok) {
                setBookings((prev: any) =>
                    prev.map((b: any) => (b.id === bookingId ? { ...b, status: newStatus } : b))
                );
            }
        } catch (error) {
            console.error("Failed to update status", error);
        }
    };

    if (loading) return <div className="p-20 text-center text-gray-500">Loading Admin Panel...</div>;
    if (!user) return null;

    return (
        <main className="p-6 md:p-12 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-10 border-b border-gray-800 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        Admin Operations
                        <span className="bg-red-500/20 text-red-500 text-xs px-3 py-1 rounded-full border border-red-500/30">ADMIN ONLY</span>
                    </h1>
                    <p className="text-gray-400 mt-1">Manage all incoming service requests</p>
                </div>
                <button
                    onClick={() => { localStorage.removeItem("token"); router.push("/"); }}
                    className="border border-gray-600 hover:border-red-500 hover:text-red-500 px-4 py-2 rounded-md transition-colors text-sm font-bold"
                >
                    Logout
                </button>
            </div>

            <div className="bg-[#1a1c1e] border border-gray-800 rounded-xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-300">
                        <thead className="text-xs uppercase bg-[#17191B] text-gray-400 border-b border-gray-800">
                            <tr>
                                <th className="px-6 py-4">Booking ID</th>
                                <th className="px-6 py-4">Date & Time</th>
                                <th className="px-6 py-4">Customer</th>
                                <th className="px-6 py-4">Vehicle</th>
                                <th className="px-6 py-4">Service</th>
                                <th className="px-6 py-4">Status / Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bookings.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-10 text-center text-gray-500">No bookings found.</td>
                                </tr>
                            ) : (
                                bookings.map((b: any) => (
                                    <tr key={b.id} className="border-b border-gray-800 hover:bg-[#202325] transition-colors">
                                        <td className="px-6 py-4 font-mono text-[#F07835]">#{b.id}</td>
                                        <td className="px-6 py-4">{new Date(b.scheduled_at).toLocaleString()}</td>
                                        <td className="px-6 py-4 font-bold text-white">
                                            {b.customer?.full_name || `User ${b.customer_id}`}
                                        </td>
                                        <td className="px-6 py-4">
                                            {b.vehicle ? `${b.vehicle.make} ${b.vehicle.model}` : `Car ${b.vehicle_id}`}
                                        </td>
                                        <td className="px-6 py-4 text-gray-300">
                                            {b.service?.name || `Service ${b.service_id}`}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${b.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                                                        b.status === 'confirmed' ? 'bg-blue-500/10 text-blue-500' :
                                                            'bg-green-500/10 text-green-500'
                                                    }`}>
                                                    {b.status.toUpperCase()}
                                                </span>

                                                {b.status === 'pending' && (
                                                    <button
                                                        onClick={() => updateStatus(b.id, 'confirmed')}
                                                        className="text-xs bg-[#F07835] hover:bg-orange-600 text-white px-3 py-1 rounded-md transition-colors font-bold"
                                                    >
                                                        Confirm
                                                    </button>
                                                )}

                                                {b.status === 'confirmed' && (
                                                    <button
                                                        onClick={() => updateStatus(b.id, 'completed')}
                                                        className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-md transition-colors font-bold"
                                                    >
                                                        Complete
                                                    </button>
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
        </main>
    );
}