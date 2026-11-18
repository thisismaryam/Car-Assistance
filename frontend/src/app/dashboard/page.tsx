"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Contact = { email: string; phone: string };

const STATUS_STYLES: Record<string, string> = {
    pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    confirmed: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    assigned: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    in_progress: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    cancelled: "bg-red-500/15 text-red-400 border-red-500/30",
};

function statusLabel(s: string) {
    return (s || "").replace(/_/g, " ");
}

export default function MyBookingsPage() {
    const [bookings, setBookings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [contact, setContact] = useState<Contact | null>(null);
    const [form, setForm] = useState<Contact>({ email: "", phone: "" });
    const [filter, setFilter] = useState<"all" | "upcoming" | "past" | "cancelled">("all");
    const [hasToken, setHasToken] = useState(false);
    const [forceForm, setForceForm] = useState(false); // logged-in staff can still look up by email

    // Load bookings: remembered guest contact first, then logged-in token, else show the form.
    const loadByContact = async (c: Contact) => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch("http://localhost:8000/bookings/lookup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(c),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(
                    res.status === 429
                        ? "Too many attempts. Please wait a minute and try again."
                        : data.detail || "No bookings found for these details."
                );
            }
            const data = await res.json();
            setBookings(Array.isArray(data) ? data : []);
            setContact(c);
            try {
                localStorage.setItem("guest_contact", JSON.stringify(c));
            } catch { }
        } catch (err: any) {
            setContact(null);
            setBookings([]);
            setError(err.message || "Could not load bookings.");
            try {
                localStorage.removeItem("guest_contact");
            } catch { }
        } finally {
            setLoading(false);
        }
    };

    const loadByToken = async (token: string) => {
        try {
            const res = await fetch("http://localhost:8000/bookings/my", {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = res.ok ? await res.json() : [];
            setBookings(Array.isArray(data) ? data : []);
        } catch {
            setBookings([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let saved: Contact | null = null;
        try {
            const raw = localStorage.getItem("guest_contact");
            if (raw) saved = JSON.parse(raw);
        } catch { }

        if (saved?.email && saved?.phone) {
            setForm(saved);
            loadByContact(saved);
            return;
        }

        const token = localStorage.getItem("token");
        setHasToken(!!token);
        if (token) {
            loadByToken(token);
            return;
        }

        setLoading(false); // nothing saved: show the lookup form
    }, []);

    const switchUser = () => {
        try {
            localStorage.removeItem("guest_contact");
        } catch { }
        setContact(null);
        setBookings([]);
        setError("");
        setForm({ email: "", phone: "" });
        const token = localStorage.getItem("token");
        if (token) {
            setLoading(true);
            loadByToken(token);
        }
    };

    const now = Date.now();
    const isUpcoming = (b: any) =>
        new Date(b.scheduled_at).getTime() >= now && b.status !== "cancelled" && b.status !== "completed";

    const visible = bookings.filter((b) => {
        if (filter === "upcoming") return isUpcoming(b);
        if (filter === "past") return !isUpcoming(b) && b.status !== "cancelled";
        if (filter === "cancelled") return b.status === "cancelled";
        return true;
    });

    const counts = {
        all: bookings.length,
        upcoming: bookings.filter(isUpcoming).length,
        past: bookings.filter((b) => !isUpcoming(b) && b.status !== "cancelled").length,
        cancelled: bookings.filter((b) => b.status === "cancelled").length,
    };

    const showForm = !loading && !contact && (forceForm || (bookings.length === 0 && !hasToken));

    return (
        <main className="p-6 md:p-12 max-w-5xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">My Bookings</h1>
                    <p className="text-xs text-gray-400 mt-1">
                        {contact
                            ? `Showing all bookings for ${contact.email}`
                            : "Review your scheduled appointments and verified details"}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {contact && (
                        <button
                            onClick={switchUser}
                            className="text-xs text-gray-400 hover:text-white underline"
                        >
                            Not you?
                        </button>
                    )}
                    {!contact && hasToken && !forceForm && (
                        <button
                            onClick={() => setForceForm(true)}
                            className="text-xs text-gray-400 hover:text-white underline"
                        >
                            Look up by email
                        </button>
                    )}
                    <Link
                        href="/dashboard"
                        className="bg-[#2563EB] hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all"
                    >
                        + Book New Service
                    </Link>
                </div>
            </div>

            {loading ? (
                <div className="p-12 text-center text-xs text-gray-500">Loading your bookings...</div>
            ) : showForm ? (
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (form.email.trim() && form.phone.trim()) {
                            loadByContact({ email: form.email.trim().toLowerCase(), phone: form.phone.trim() });
                        }
                    }}
                    className="bg-[#151D2A] border border-[#1e293b] rounded-xl p-6 max-w-md"
                >
                    <h2 className="text-base font-bold text-white mb-1">Find your bookings</h2>
                    <p className="text-xs text-gray-400 mb-4">
                        Enter the email and phone number you used when booking.
                    </p>
                    {error && (
                        <div className="p-3 text-xs mb-4 rounded-md bg-red-500/10 text-red-400 border border-red-500/30">
                            {error}
                        </div>
                    )}
                    <label className="block text-[11px] text-gray-400 mb-1">Email</label>
                    <input
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="tariq@example.com"
                        className="w-full p-2.5 mb-3 bg-[#090D14] border border-[#1e293b] rounded text-white text-xs outline-none focus:border-[#2563EB]"
                    />
                    <label className="block text-[11px] text-gray-400 mb-1">Phone</label>
                    <input
                        type="tel"
                        required
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="+92 300 1234567"
                        className="w-full p-2.5 mb-4 bg-[#090D14] border border-[#1e293b] rounded text-white text-xs outline-none focus:border-[#2563EB]"
                    />
                    <button
                        type="submit"
                        className="w-full h-10 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold transition-colors"
                    >
                        Show my bookings
                    </button>
                </form>
            ) : bookings.length === 0 ? (
                <div className="p-12 text-center bg-[#151D2A] border border-[#1e293b] rounded-xl">
                    <p className="text-gray-400 text-sm mb-4">You have no bookings yet.</p>
                    <Link href="/dashboard" className="text-xs text-[#2563EB] font-bold hover:underline">
                        Schedule your first service →
                    </Link>
                </div>
            ) : (
                <>
                    {/* Filter tabs */}
                    <div className="flex flex-wrap gap-2 mb-4">
                        {(["all", "upcoming", "past", "cancelled"] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors capitalize ${filter === f
                                    ? "bg-[#2563EB]/20 border-[#2563EB] text-white"
                                    : "border-[#1e293b] text-gray-400 hover:text-white"
                                    }`}
                            >
                                {f} ({counts[f]})
                            </button>
                        ))}
                    </div>

                    <div className="bg-[#151D2A] border border-[#1e293b] rounded-xl overflow-x-auto shadow-xl">
                        <table className="w-full text-left text-sm text-gray-300">
                            <thead className="bg-[#090D14] text-gray-400 border-b border-[#1e293b] text-xs uppercase">
                                <tr>
                                    <th className="px-6 py-4">Ref #</th>
                                    <th className="px-6 py-4">Scheduled (UTC)</th>
                                    <th className="px-6 py-4">Service</th>
                                    <th className="px-6 py-4">Vehicle</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-right">Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-xs text-gray-500">
                                            No bookings in this view.
                                        </td>
                                    </tr>
                                )}
                                {visible.map((b: any) => {
                                    const d = new Date(b.scheduled_at);
                                    return (
                                        <tr
                                            key={b.id}
                                            className="border-b border-[#1e293b] hover:bg-[#090D14]/50 transition-colors"
                                        >
                                            <td className="px-6 py-4 font-mono font-bold text-white text-xs">#{b.id}</td>
                                            <td className="px-6 py-4 text-xs">
                                                {d.toLocaleDateString(undefined, {
                                                    month: "short",
                                                    day: "numeric",
                                                    year: "numeric",
                                                    timeZone: "UTC",
                                                })}
                                                <span className="block text-[11px] text-gray-500 font-mono">
                                                    {d.toLocaleTimeString(undefined, {
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                        timeZone: "UTC",
                                                    })}{" "}
                                                    UTC
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-white font-medium text-xs">
                                                {b.service?.name}
                                                <span className="block text-[10px] text-gray-400">
                                                    Rs. {b.service?.base_price} · {b.service?.service_type}
                                                </span>
                                                {b.address && (
                                                    <span className="block text-[10px] text-gray-500 max-w-45 truncate" title={b.address}>
                                                        {b.address}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-xs">
                                                {b.vehicle ? `${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model}` : "Vehicle"}
                                                {b.vehicle?.registration && (
                                                    <span className="block text-[10px] font-mono text-gray-400">
                                                        {b.vehicle.registration}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span
                                                    className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase border ${STATUS_STYLES[b.status] || STATUS_STYLES.pending
                                                        }`}
                                                >
                                                    {statusLabel(b.status)}
                                                </span>
                                                {b.mechanic?.full_name && (
                                                    <span className="block text-[10px] text-gray-500 mt-1">
                                                        Mechanic: {b.mechanic.full_name}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <Link
                                                    href={`/dashboard/bookings/${b.id}`}
                                                    className="text-xs font-bold text-[#2563EB] hover:text-blue-400 hover:underline transition-colors"
                                                >
                                                    View Record →
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </main>
    );
}