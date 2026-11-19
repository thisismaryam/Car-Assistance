"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type AvailabilitySlot = {
    start_time: string;
    end_time: string;
    is_available: boolean;
    reason: string;
};

export default function HomeServicePage() {
    const router = useRouter();

    // Guest Customer & Vehicle State (Step 1)
    const [guest, setGuest] = useState({
        customer_name: "",
        customer_email: "",
        customer_phone: "",
        vehicle_make: "",
        vehicle_model: "",
        vehicle_year: "",
        vehicle_registration: "",
    });

    // Services & Booking State (Steps 2 & 3)
    const [services, setServices] = useState<any[]>([]);
    const [step, setStep] = useState(1);
    const [selectedService, setSelectedService] = useState("");
    const [selectedDay, setSelectedDay] = useState(
        () => new Date().toISOString().split("T")[0],
    );
    const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [availabilityError, setAvailabilityError] = useState("");
    const [date, setDate] = useState("");
    const [address, setAddress] = useState("");
    const [notes, setNotes] = useState("");
    const [message, setMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [confirmedBooking, setConfirmedBooking] = useState<any | null>(null);

    // Fetch home services (public catalog)
    useEffect(() => {
        fetch("http://localhost:8000/services?service_type=home")
            .then((res) => (res.ok ? res.json() : []))
            .then((serviceData) => {
                const homeServices = Array.isArray(serviceData)
                    ? serviceData.filter((s: any) => s.service_type === "home")
                    : [];
                setServices(homeServices);
                if (homeServices.length > 0 && !selectedService) {
                    setSelectedService(homeServices[0].id.toString());
                }
            })
            .catch(() => setServices([]));
    }, []);

    useEffect(() => {
        if (step !== 3 || !selectedService || !selectedDay) return;

        const controller = new AbortController();
        const loadSlots = async () => {
            setLoadingSlots(true);
            setSlots([]);
            setAvailabilityError("");

            try {
                const params = new URLSearchParams({
                    service_id: selectedService,
                    date: selectedDay,
                });
                const response = await fetch(
                    `http://localhost:8000/bookings/availability?${params}`,
                    { signal: controller.signal },
                );
                const data = await response.json().catch(() => null);

                if (!response.ok) {
                    throw new Error(data?.detail || "Could not load appointment times.");
                }
                if (!data || !Array.isArray(data.slots)) {
                    throw new Error("The availability response was invalid. Please try again.");
                }

                setSlots(data.slots);
            } catch (error) {
                if (controller.signal.aborted) return;
                setAvailabilityError(
                    error instanceof Error ? error.message : "Could not load appointment times.",
                );
            } finally {
                if (!controller.signal.aborted) setLoadingSlots(false);
            }
        };

        void loadSlots();
        return () => controller.abort();
    }, [step, selectedDay, selectedService]);

    const handleStep1Submit = (e: React.FormEvent) => {
        e.preventDefault();
        setMessage("");

        if (
            !guest.customer_name.trim() ||
            !guest.customer_email.trim() ||
            !guest.customer_phone.trim() ||
            !guest.vehicle_make.trim() ||
            !guest.vehicle_model.trim() ||
            !guest.vehicle_year ||
            !guest.vehicle_registration.trim()
        ) {
            setMessage("Error: Please fill in all customer and vehicle details.");
            return;
        }

        setStep(2);
    };

    const handleBook = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage("");
        setSubmitting(true);

        const headers: Record<string, string> = { "Content-Type": "application/json" };

        try {
            const payload = {
                customer_name: guest.customer_name.trim(),
                customer_email: guest.customer_email.trim().toLowerCase(),
                customer_phone: guest.customer_phone.trim(),
                vehicle_make: guest.vehicle_make.trim(),
                vehicle_model: guest.vehicle_model.trim(),
                vehicle_year: parseInt(guest.vehicle_year),
                vehicle_registration: guest.vehicle_registration.trim().toUpperCase(),
                service_id: parseInt(selectedService),
                scheduled_at: new Date(date).toISOString(),
                address: address.trim(),
                notes: notes.trim() || undefined,
            };

            const res = await fetch("http://localhost:8000/bookings", {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.detail || "Failed to confirm doorstep booking");
            }

            const confirmed = await res.json();
            if (!confirmed || typeof confirmed.id !== "number") {
                throw new Error("Server error: database confirmation record was not returned.");
            }
            try {
                sessionStorage.setItem(
                    "guest_contact",
                    JSON.stringify({ email: payload.customer_email, phone: payload.customer_phone })
                );
            } catch { }

            setConfirmedBooking(confirmed);
            setMessage("");
        } catch (err: any) {
            setMessage(`Error: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    const selectedServiceData = services.find((s: any) => s.id.toString() === selectedService);

    return (
        <main className="p-6 md:p-12 max-w-4xl mx-auto min-h-screen">
            {/* Header */}
            <div className="mb-8 border-b border-[#101827] pb-4">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/30">
                        Doorstep Service
                    </span>
                    <span className="text-xs text-gray-400">Within 25 km service radius</span>
                </div>
                <h1 className="text-2xl font-bold text-white">Home & Office Mobile Service</h1>
                <p className="text-xs text-gray-400 mt-1">
                    Certified mechanic dispatches directly to your location with all tools and OEM parts.
                </p>
            </div>

            {/* Container */}
            <div className="bg-[#151D2A] border border-[#1e293b] rounded-xl p-6 md:p-8 shadow-xl">
                {confirmedBooking ? (
                    <div className="py-6 text-center">
                        <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                            ✓
                        </div>
                        <h2 className="text-xl font-bold text-white mb-1">Doorstep Booking Confirmed!</h2>
                        <p className="text-xs text-gray-400 mb-6">
                            Verified reference ID: <span className="font-mono text-white font-bold">#{confirmedBooking.id}</span>
                        </p>

                        <div className="bg-[#090D14] border border-[#1e293b] rounded-xl p-5 max-w-md mx-auto mb-6 text-left text-xs">
                            <div className="flex justify-between py-1.5 border-b border-[#151D2A]">
                                <span className="text-gray-400">Customer</span>
                                <span className="text-white font-semibold">{confirmedBooking.customer?.full_name}</span>
                            </div>
                            <div className="flex justify-between py-1.5 border-b border-[#151D2A]">
                                <span className="text-gray-400">Service</span>
                                <span className="text-white font-semibold">{confirmedBooking.service?.name}</span>
                            </div>
                            <div className="flex justify-between py-1.5 border-b border-[#151D2A]">
                                <span className="text-gray-400">Vehicle</span>
                                <span className="text-white font-semibold">
                                    {confirmedBooking.vehicle?.year} {confirmedBooking.vehicle?.make} {confirmedBooking.vehicle?.model} ({confirmedBooking.vehicle?.registration})
                                </span>
                            </div>
                            <div className="flex justify-between py-1.5 border-b border-[#151D2A]">
                                <span className="text-gray-400">Address</span>
                                <span className="text-white font-medium">{confirmedBooking.address}</span>
                            </div>
                            <div className="flex justify-between py-1.5 border-b border-[#151D2A]">
                                <span className="text-gray-400">Scheduled Time</span>
                                <span className="text-white font-mono">
                                    {new Date(confirmedBooking.scheduled_at).toUTCString()}
                                </span>
                            </div>
                            <div className="flex justify-between py-1.5">
                                <span className="text-gray-400">Total Rate</span>
                                <span className="text-emerald-400 font-bold">Rs. {confirmedBooking.service?.base_price}</span>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row justify-center gap-3 max-w-md mx-auto">
                            <Link
                                href={`/dashboard/bookings/${confirmedBooking.id}`}
                                className="bg-[#2563EB] hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold transition-all shadow-md shadow-blue-900/30 flex-1 text-center"
                            >
                                View Verified Booking Record →
                            </Link>
                            <button
                                onClick={() => {
                                    setConfirmedBooking(null);
                                    setStep(1);
                                    setDate("");
                                    setAddress("");
                                }}
                                className="border border-[#1e293b] hover:border-gray-500 text-gray-300 px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors text-center"
                            >
                                Book Another Service
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Step Progress Bar */}
                        <div className="mb-8">
                            <div className="flex items-center justify-between text-xs font-semibold mb-2">
                                <span className={step >= 1 ? "text-[#2563EB]" : "text-gray-500"}>1. Customer & Vehicle</span>
                                <span className={step >= 2 ? "text-[#2563EB]" : "text-gray-500"}>2. Doorstep Service</span>
                                <span className={step >= 3 ? "text-[#2563EB]" : "text-gray-500"}>3. Address & Time</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className={`flex-1 h-1 rounded-full transition-colors ${step >= 1 ? "bg-[#2563EB]" : "bg-[#1e293b]"}`} />
                                <div className={`flex-1 h-1 rounded-full transition-colors ${step >= 2 ? "bg-[#2563EB]" : "bg-[#1e293b]"}`} />
                                <div className={`flex-1 h-1 rounded-full transition-colors ${step >= 3 ? "bg-[#2563EB]" : "bg-[#1e293b]"}`} />
                            </div>
                        </div>

                        {message && (
                            <div className={`p-3 text-xs mb-6 rounded-md ${message.includes("Error") ? "bg-red-500/10 text-red-400 border border-red-500/30" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"}`}>
                                {message}
                            </div>
                        )}

                        {/* STEP 1: CUSTOMER & VEHICLE */}
                        {step === 1 && (
                            <form onSubmit={handleStep1Submit} className="space-y-6">
                                <div>
                                    <h2 className="text-base font-bold text-white mb-1">Step 1: Your Details & Vehicle</h2>
                                    <p className="text-xs text-gray-400 mb-4">No account required. Enter your contact details and car specs for booking confirmation.</p>
                                </div>

                                <div className="bg-[#090D14] border border-[#1e293b] rounded-lg p-5">
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">1. Contact Information</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-[11px] text-gray-400 mb-1">Full Name <span className="text-red-400">*</span></label>
                                            <input
                                                type="text"
                                                placeholder="e.g. Tariq Khan"
                                                value={guest.customer_name}
                                                onChange={(e) => setGuest({ ...guest, customer_name: e.target.value })}
                                                className="w-full p-2.5 bg-[#151D2A] border border-[#1e293b] rounded text-white text-xs outline-none focus:border-[#2563EB]"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-gray-400 mb-1">Email Address <span className="text-red-400">*</span></label>
                                            <input
                                                type="email"
                                                placeholder="tariq@example.com"
                                                value={guest.customer_email}
                                                onChange={(e) => setGuest({ ...guest, customer_email: e.target.value })}
                                                className="w-full p-2.5 bg-[#151D2A] border border-[#1e293b] rounded text-white text-xs outline-none focus:border-[#2563EB]"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-gray-400 mb-1">Phone Number <span className="text-red-400">*</span></label>
                                            <input
                                                type="tel"
                                                placeholder="+92 300 1234567"
                                                value={guest.customer_phone}
                                                onChange={(e) => setGuest({ ...guest, customer_phone: e.target.value })}
                                                className="w-full p-2.5 bg-[#151D2A] border border-[#1e293b] rounded text-white text-xs outline-none focus:border-[#2563EB]"
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-[#090D14] border border-[#1e293b] rounded-lg p-5">
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">2. Vehicle Specifications</h3>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <div>
                                            <label className="block text-[11px] text-gray-400 mb-1">Make <span className="text-red-400">*</span></label>
                                            <input
                                                type="text"
                                                placeholder="e.g. Honda"
                                                value={guest.vehicle_make}
                                                onChange={(e) => setGuest({ ...guest, vehicle_make: e.target.value })}
                                                className="w-full p-2.5 bg-[#151D2A] border border-[#1e293b] rounded text-white text-xs outline-none focus:border-[#2563EB]"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-gray-400 mb-1">Model <span className="text-red-400">*</span></label>
                                            <input
                                                type="text"
                                                placeholder="e.g. Civic"
                                                value={guest.vehicle_model}
                                                onChange={(e) => setGuest({ ...guest, vehicle_model: e.target.value })}
                                                className="w-full p-2.5 bg-[#151D2A] border border-[#1e293b] rounded text-white text-xs outline-none focus:border-[#2563EB]"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-gray-400 mb-1">Year <span className="text-red-400">*</span></label>
                                            <input
                                                type="number"
                                                placeholder="e.g. 2022"
                                                min="1980"
                                                max="2030"
                                                value={guest.vehicle_year}
                                                onChange={(e) => setGuest({ ...guest, vehicle_year: e.target.value })}
                                                className="w-full p-2.5 bg-[#151D2A] border border-[#1e293b] rounded text-white text-xs outline-none focus:border-[#2563EB]"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-gray-400 mb-1">Plate / Reg <span className="text-red-400">*</span></label>
                                            <input
                                                type="text"
                                                placeholder="e.g. ICT-9988"
                                                value={guest.vehicle_registration}
                                                onChange={(e) => setGuest({ ...guest, vehicle_registration: e.target.value })}
                                                className="w-full p-2.5 bg-[#151D2A] border border-[#1e293b] rounded text-white text-xs outline-none focus:border-[#2563EB]"
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end pt-2">
                                    <button
                                        type="submit"
                                        className="h-10 px-6 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold transition-colors flex items-center justify-center shadow-md shadow-blue-900/20"
                                    >
                                        Continue to Doorstep Service →
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* STEP 2: SELECT DOORSTEP SERVICE */}
                        {step === 2 && (
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <h2 className="text-base font-bold text-white">Step 2: Select Doorstep Service</h2>
                                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/30">Home Service</span>
                                </div>
                                <p className="text-xs text-gray-400 mb-4">Select the service to be performed at your doorstep.</p>

                                {services.length === 0 ? (
                                    <p className="text-xs text-gray-400 p-4 bg-[#090D14] rounded border border-[#1e293b]">No home services available currently.</p>
                                ) : (
                                    <div className="grid gap-3 mb-6">
                                        {services.map((s: any) => {
                                            const isSelected = selectedService === s.id.toString();
                                            return (
                                                <div
                                                    key={s.id}
                                                    onClick={() => {
                                                        const serviceId = s.id.toString();
                                                        if (serviceId !== selectedService) setDate("");
                                                        setSelectedService(serviceId);
                                                    }}
                                                    className={`p-4 rounded-lg border cursor-pointer transition-all ${isSelected
                                                            ? "border-[#2563EB] bg-[#2563EB]/15"
                                                            : "border-[#1e293b] bg-[#090D14] hover:bg-[#1e293b] hover:border-gray-600"
                                                        }`}
                                                >
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <h3 className="font-bold text-white text-sm">{s.name}</h3>
                                                            <p className="text-xs text-gray-400 mt-1 max-w-lg">{s.description}</p>
                                                        </div>
                                                        <div className="text-right ml-4">
                                                            <span className="text-sm font-black text-white">Rs. {s.base_price}</span>
                                                            <p className="text-[11px] text-gray-500">{s.duration_minutes} min</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                <div className="flex items-center gap-3 mt-6">
                                    <button
                                        type="button"
                                        onClick={() => setStep(1)}
                                        className="h-10 px-5 rounded-lg border border-[#1e293b] text-gray-300 hover:text-white hover:bg-[#1e293b] text-xs font-semibold transition-colors flex items-center justify-center"
                                    >
                                        Back
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setStep(3)}
                                        disabled={!selectedService}
                                        className="h-10 px-6 rounded-lg bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-colors flex items-center justify-center flex-1 shadow-md shadow-blue-900/20"
                                    >
                                        Continue to Address & Time →
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* STEP 3: ADDRESS & TIME */}
                        {step === 3 && (
                            <form onSubmit={handleBook}>
                                <h2 className="text-base font-bold text-white mb-2">Step 3: Location, Date & Confirmation</h2>
                                <p className="text-xs text-gray-400 mb-6">Provide your full location so our mobile technician arrives on schedule.</p>

                                <div className="mb-4">
                                    <label className="block text-xs font-medium text-gray-300 mb-1.5">
                                        Home / On-Site Address <span className="text-red-400">*</span>
                                    </label>
                                    <textarea
                                        value={address}
                                        onChange={(e) => setAddress(e.target.value)}
                                        rows={2}
                                        placeholder="House / Flat No., Street, Sector, City (e.g., House 42, St 14, F-8/2, Islamabad)"
                                        className="w-full p-2.5 bg-[#090D14] border border-[#1e293b] rounded-lg text-white text-xs outline-none focus:border-[#2563EB]"
                                        required
                                    />
                                </div>

                                <div className="mb-4">
                                    <label className="block text-xs font-medium text-gray-300 mb-1.5">
                                        Select Appointment Date (UTC) <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        value={selectedDay}
                                        min={new Date().toISOString().split("T")[0]}
                                        onChange={(e) => {
                                            const day = e.target.value;
                                            setSelectedDay(day);
                                            setDate("");
                                            if (!day) {
                                                setSlots([]);
                                                setLoadingSlots(false);
                                                setAvailabilityError("");
                                            }
                                        }}
                                        className="w-full p-2.5 bg-[#090D14] border border-[#1e293b] rounded-lg text-white text-xs outline-none focus:border-[#2563EB]"
                                        required
                                    />
                                </div>

                                {/* Clean Slots Grid (No capacity text) */}
                                <div className="mb-6">
                                    <label className="block text-xs font-medium text-gray-300 mb-1.5">
                                        Select Available Time Slot (UTC) <span className="text-red-400">*</span>
                                    </label>

                                    {loadingSlots ? (
                                        <p className="text-xs text-gray-400 py-3 bg-[#090D14] p-3 rounded-lg border border-[#1e293b]">Checking technician availability...</p>
                                    ) : availabilityError ? (
                                        <p role="alert" className="text-xs text-red-300 py-3 bg-red-950/30 p-3 rounded-lg border border-red-900/50">
                                            {availabilityError}
                                        </p>
                                    ) : slots.length === 0 ? (
                                        <p className="text-xs text-gray-400 py-3 bg-[#090D14] p-3 rounded-lg border border-[#1e293b]">
                                            No appointment times are available for this date.
                                        </p>
                                    ) : (
                                        <div>
                                            {!slots.some((slot) => slot.is_available) && (
                                                <p className="text-xs text-amber-200/80 mb-2">
                                                    No bookable times are available on this date. Unavailable times are shown for reference.
                                                </p>
                                            )}
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto p-1 bg-[#090D14] rounded-lg border border-[#1e293b]">
                                                {slots.map((s, idx) => {
                                                    const start = new Date(s.start_time);
                                                    const end = new Date(s.end_time);
                                                    const startTimeStr = start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
                                                    const endTimeStr = end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
                                                    const isSelected = date === s.start_time;
                                                    const reason = s.reason.toLowerCase();

                                                    if (!s.is_available) {
                                                        return (
                                                            <div
                                                                key={idx}
                                                                className="p-2.5 rounded border border-[#1e293b]/60 bg-[#101827]/40 text-gray-500 opacity-60 text-center cursor-not-allowed"
                                                                title={s.reason}
                                                            >
                                                                <p className="text-xs font-mono">{startTimeStr} - {endTimeStr} UTC</p>
                                                                <span className="text-[9px] text-red-400/80 uppercase font-bold block mt-0.5">
                                                                    {reason.includes("lead time") ? "Lead time" : reason.includes("past") ? "Past" : reason.includes("booked") ? "Booked" : "Unavailable"}
                                                                </span>
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <button
                                                            type="button"
                                                            key={idx}
                                                            onClick={() => setDate(s.start_time)}
                                                            className={`p-2.5 rounded border text-center transition-all ${isSelected
                                                                ? "border-[#2563EB] bg-[#2563EB]/20 text-white font-bold"
                                                                : "border-[#1e293b] bg-[#151D2A] hover:bg-[#1e293b] text-gray-300"
                                                            }`}
                                                        >
                                                            <p className="text-xs font-mono font-medium">{startTimeStr} - {endTimeStr} UTC</p>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-[#090D14] p-4 rounded-lg border border-[#1e293b] mb-6 text-xs">
                                    <p className="text-gray-400 mb-2 font-medium">Doorstep Booking Summary:</p>
                                    <div className="flex justify-between items-center py-1 border-b border-[#151D2A]">
                                        <span className="text-gray-400">Customer</span>
                                        <span className="text-white font-semibold">{guest.customer_name} ({guest.customer_phone})</span>
                                    </div>
                                    <div className="flex justify-between items-center py-1 border-b border-[#151D2A]">
                                        <span className="text-gray-400">Email</span>
                                        <span className="text-white font-mono">{guest.customer_email}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-1 border-b border-[#151D2A]">
                                        <span className="text-gray-400">Vehicle</span>
                                        <span className="text-white font-semibold">
                                            {guest.vehicle_year} {guest.vehicle_make} {guest.vehicle_model} ({guest.vehicle_registration})
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center py-1 border-b border-[#151D2A]">
                                        <span className="text-gray-400">Location</span>
                                        <span className="text-white font-medium">{address || "Please enter address above"}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-1 border-b border-[#151D2A]">
                                        <span className="text-gray-400">Service</span>
                                        <span className="text-white font-semibold">{selectedServiceData?.name}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-1 border-b border-[#151D2A]">
                                        <span className="text-gray-400">Slot</span>
                                        <span className="text-white font-mono">{date ? new Date(date).toUTCString() : "Please choose a slot"}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-1">
                                        <span className="text-gray-400">Base Price</span>
                                        <span className="text-emerald-400 font-bold text-sm">Rs. {selectedServiceData?.base_price}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setStep(2)}
                                        className="h-10 px-5 rounded-lg border border-[#1e293b] text-gray-300 hover:text-white hover:bg-[#1e293b] text-xs font-semibold transition-colors flex items-center justify-center"
                                    >
                                        Back
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={!date || !address.trim() || submitting}
                                        className="h-10 px-6 rounded-lg bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-colors flex items-center justify-center flex-1 shadow-md shadow-blue-900/20"
                                    >
                                        {submitting ? "Confirming Doorstep Service..." : "Confirm Doorstep Service"}
                                    </button>
                                </div>
                            </form>
                        )}
                    </>
                )}
            </div>
        </main>
    );
}
