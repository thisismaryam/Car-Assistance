"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function BookingDetailsPage() {
    const params = useParams();
    const bookingId = params?.id;

    const [booking, setBooking] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [cancelling, setCancelling] = useState(false);
    const [actionMsg, setActionMsg] = useState("");

    const fetchBookingDetails = async () => {
        if (!bookingId) return;
        setLoading(true);
        setError(null);

        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        const headers: Record<string, string> = {};
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        try {
            let res: Response;
            if (token) {
                res = await fetch(`http://localhost:8000/bookings/${bookingId}`, { headers });
            } else {
                let contact: any = null;
                try {
                    contact = JSON.parse(sessionStorage.getItem("guest_contact") || "null");
                } catch { }
                if (!contact?.email || !contact?.phone) {
                    throw new Error("Please look up your bookings with your email and phone first.");
                }
                res = await fetch(`http://localhost:8000/bookings/${bookingId}/view`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(contact),
                });
            }

            if (!res.ok) {
                if (res.status === 404) {
                    throw new Error("Booking not found or reference ID is invalid.");
                }
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || "Failed to load booking details");
            }

            const data = await res.json();
            setBooking(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBookingDetails();
    }, [bookingId]);

    const handleCancelBooking = async () => {
        if (!booking) return;
        if (!confirm("Are you sure you want to cancel this booking?")) {
            return;
        }

        setCancelling(true);
        setActionMsg("");
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        try {
            const res = await fetch(`http://localhost:8000/bookings/${booking.id}/cancel`, {
                method: "PATCH",
                headers,
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || "Failed to cancel booking");
            }

            const updated = await res.json();
            setBooking(updated);
            setActionMsg("Booking has been cancelled.");
        } catch (err: any) {
            setActionMsg(`Error: ${err.message}`);
        } finally {
            setCancelling(false);
        }
    };

    if (loading) {
        return (
            <main className="p-6 md:p-12 max-w-4xl mx-auto">
                <div className="flex items-center gap-3 text-gray-400 text-sm mb-6">
                    <span className="w-4 h-4 border-2 border-t-[#2563EB] border-gray-600 rounded-full animate-spin"></span>
                    <span>Loading booking record #{bookingId}...</span>
                </div>
            </main>
        );
    }

    if (error || !booking) {
        return (
            <main className="p-6 md:p-12 max-w-4xl mx-auto">
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-8 text-center">
                    <h2 className="text-lg font-bold text-red-400 mb-2">Unable to Load Booking</h2>
                    <p className="text-sm text-gray-300 mb-6">{error || "Record could not be retrieved from database."}</p>
                    <Link
                        href="/dashboard"
                        className="inline-block bg-[#151D2A] border border-[#1e293b] hover:border-gray-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                    >
                        ← Back to Booking Portal
                    </Link>
                </div>
            </main>
        );
    }

    const isCancelled = booking.status === "cancelled";
    const isCompleted = booking.status === "completed";
    const statusColor =
        booking.status === "confirmed"
            ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
            : booking.status === "assigned"
            ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
            : booking.status === "in_progress"
            ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
            : booking.status === "completed"
            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
            : booking.status === "cancelled"
            ? "bg-red-500/15 text-red-400 border-red-500/30"
            : "bg-amber-500/15 text-amber-400 border-amber-500/30";

    const scheduledDate = new Date(booking.scheduled_at);

    return (
        <main className="p-6 md:p-12 max-w-4xl mx-auto">
            {/* Breadcrumb Navigation */}
            <div className="flex items-center justify-between mb-6">
                <Link
                    href="/dashboard"
                    className="text-xs text-[#2563EB] hover:underline flex items-center gap-1 font-semibold"
                >
                    ← Back to Booking Portal
                </Link>
                <span className="text-xs text-gray-500 font-mono">
                    Ref ID: #{booking.id}
                </span>
            </div>

            {/* Header Card */}
            <div className="bg-[#151D2A] border border-[#1e293b] rounded-xl p-6 md:p-8 mb-6 shadow-xl">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#101827] pb-6 mb-6">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-black text-white">Booking #{booking.id}</h1>
                            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${statusColor}`}>
                                {booking.status}
                            </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            Booked for {booking.customer?.full_name} ({booking.customer?.email}) · Created on {new Date(booking.created_at).toLocaleString()}
                        </p>
                    </div>

                    {!isCancelled && !isCompleted && (
                        <button
                            onClick={handleCancelBooking}
                            disabled={cancelling}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-4 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                        >
                            {cancelling ? "Cancelling..." : "Cancel Booking"}
                        </button>
                    )}
                </div>

                {actionMsg && (
                    <div className="p-3 text-xs mb-6 rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/30">
                        {actionMsg}
                    </div>
                )}

                {/* Clean 3-Card Details Grid (Workshop bay & staff card removed) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Service Information */}
                    <div className="bg-[#090D14] border border-[#1e293b] rounded-lg p-5 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Service</h3>
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#2563EB]/15 text-[#2563EB] border border-[#2563EB]/30">
                                    {booking.service?.service_type?.toUpperCase()}
                                </span>
                            </div>
                            <p className="text-base font-bold text-white mb-1">{booking.service?.name}</p>
                            <p className="text-xs text-gray-400 mb-4">{booking.service?.description}</p>
                        </div>
                        <div className="flex justify-between items-center text-xs border-t border-[#1e293b] pt-3 text-gray-300">
                            <span>Rate: <strong className="text-emerald-400 font-bold">Rs. {booking.service?.base_price}</strong></span>
                            <span>{booking.service?.duration_minutes} min</span>
                        </div>
                    </div>

                    {/* Vehicle Information */}
                    <div className="bg-[#090D14] border border-[#1e293b] rounded-lg p-5 flex flex-col justify-between">
                        <div>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Vehicle Details</h3>
                            <p className="text-base font-bold text-white mb-1">
                                {booking.vehicle?.year} {booking.vehicle?.make} {booking.vehicle?.model}
                            </p>
                            <p className="text-xs text-gray-400 font-mono mb-2">
                                Plate: <span className="text-white font-bold">{booking.vehicle?.registration}</span>
                            </p>
                        </div>
                        {booking.vehicle?.notes && (
                            <p className="text-xs text-gray-500 italic border-t border-[#1e293b] pt-3">
                                Notes: {booking.vehicle.notes}
                            </p>
                        )}
                    </div>

                    {/* Schedule Information */}
                    <div className="bg-[#090D14] border border-[#1e293b] rounded-lg p-5 flex flex-col justify-between">
                        <div>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Appointment Time</h3>
                            <p className="text-sm font-bold text-white mb-1">
                                📅 {scheduledDate.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
                            </p>
                            <p className="text-base font-bold text-[#2563EB]">
                                ⏰ {scheduledDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                            </p>
                        </div>
                        <p className="text-[11px] text-gray-500 font-mono border-t border-[#1e293b] pt-3">
                            UTC: {scheduledDate.toUTCString()}
                        </p>
                    </div>
                </div>

                {/* Service Address for Home Services */}
                {booking.address && (
                    <div className="mt-6 bg-[#090D14] border border-[#1e293b] rounded-lg p-4">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Service Address</h4>
                        <p className="text-xs text-white">{booking.address}</p>
                    </div>
                )}

                {/* Additional Customer Notes */}
                {booking.notes && (
                    <div className="mt-4 bg-[#090D14] border border-[#1e293b] rounded-lg p-4">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Notes</h4>
                        <p className="text-xs text-gray-300">{booking.notes}</p>
                    </div>
                )}
            </div>

            {/* Help / Emergency link */}
            <div className="flex justify-between items-center text-xs text-gray-500">
                <span>Need 24/7 emergency roadside towing or jump-start?</span>
                <Link href="/emergency" className="text-red-400 font-bold hover:underline">
                    Roadside Assistance →
                </Link>
            </div>
        </main>
    );
}
