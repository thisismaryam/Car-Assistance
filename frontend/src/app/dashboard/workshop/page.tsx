"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Service = {
    id: number;
    name: string;
    description: string;
    service_type: string;
    base_price: number;
    duration_minutes: number;
};

type AvailabilitySlot = {
    start_time: string;
    end_time: string;
    is_available: boolean;
    reason: string;
};

type BookingConfirmation = {
    id: number;
};

const todayUtc = () => new Date().toISOString().slice(0, 10);

export default function WorkshopBookingPage() {
    const [services, setServices] = useState<Service[]>([]);
    const [servicesLoading, setServicesLoading] = useState(true);
    const [servicesError, setServicesError] = useState("");
    const [selectedService, setSelectedService] = useState("");
    const [selectedDay, setSelectedDay] = useState(todayUtc);
    const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [availabilityError, setAvailabilityError] = useState("");
    const [selectedTime, setSelectedTime] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [confirmedBooking, setConfirmedBooking] = useState<BookingConfirmation | null>(null);
    const [customer, setCustomer] = useState({
        name: "",
        email: "",
        phone: "",
        make: "",
        model: "",
        year: "",
        registration: "",
        notes: "",
    });

    useEffect(() => {
        const loadServices = async () => {
            setServicesLoading(true);
            setServicesError("");
            try {
                const response = await fetch("http://localhost:8000/services?service_type=workshop");
                const data = await response.json().catch(() => null);
                if (!response.ok) {
                    throw new Error(data?.detail || "Workshop services are temporarily unavailable.");
                }
                if (!Array.isArray(data)) {
                    throw new Error("The workshop services response was invalid.");
                }

                const workshopServices = data.filter(
                    (service: Service) => service.service_type === "workshop",
                );
                setServices(workshopServices);
                if (workshopServices.length > 0) {
                    setSelectedService(String(workshopServices[0].id));
                }
            } catch (loadError) {
                setServicesError(
                    loadError instanceof Error
                        ? loadError.message
                        : "Workshop services are temporarily unavailable.",
                );
            } finally {
                setServicesLoading(false);
            }
        };

        void loadServices();
    }, []);

    useEffect(() => {
        if (!selectedService || !selectedDay) return;

        const controller = new AbortController();
        const loadAvailability = async () => {
            setLoadingSlots(true);
            setAvailabilityError("");
            setSlots([]);
            setSelectedTime("");

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
            } catch (loadError) {
                if (controller.signal.aborted) return;
                setAvailabilityError(
                    loadError instanceof Error
                        ? loadError.message
                        : "Could not load appointment times.",
                );
            } finally {
                if (!controller.signal.aborted) setLoadingSlots(false);
            }
        };

        void loadAvailability();
        return () => controller.abort();
    }, [selectedDay, selectedService]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");

        if (!selectedService || !selectedTime) {
            setError("Please choose a workshop service and an available appointment time.");
            return;
        }

        setSubmitting(true);
        const headers: Record<string, string> = { "Content-Type": "application/json" };

        try {
            const payload = {
                customer_name: customer.name.trim(),
                customer_email: customer.email.trim().toLowerCase(),
                customer_phone: customer.phone.trim(),
                vehicle_make: customer.make.trim(),
                vehicle_model: customer.model.trim(),
                vehicle_year: Number(customer.year),
                vehicle_registration: customer.registration.trim().toUpperCase(),
                service_id: Number(selectedService),
                scheduled_at: new Date(selectedTime).toISOString(),
                notes: customer.notes.trim() || undefined,
            };
            const response = await fetch("http://localhost:8000/bookings", {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.detail || "Failed to confirm your workshop booking.");
            }
            if (!data || typeof data.id !== "number") {
                throw new Error("The booking was not confirmed. Please try again.");
            }

            try {
                sessionStorage.setItem(
                    "guest_contact",
                    JSON.stringify({ email: payload.customer_email, phone: payload.customer_phone }),
                );
            } catch { }
            setConfirmedBooking({ id: data.id });
        } catch (submitError) {
            setError(
                submitError instanceof Error
                    ? submitError.message
                    : "Failed to confirm your workshop booking.",
            );
        } finally {
            setSubmitting(false);
        }
    };

    const selectedServiceData = services.find(
        (service) => String(service.id) === selectedService,
    );

    return (
        <main className="p-6 md:p-12 max-w-4xl mx-auto">
            <div className="mb-8 border-b border-[#101827] pb-4">
                <Link href="/services" className="text-xs text-[#8DA6B8] hover:underline">
                    ← Browse services
                </Link>
                <h1 className="text-2xl font-bold text-white mt-3">Book a Workshop Service</h1>
                <p className="text-xs text-gray-400 mt-1">
                    Choose a service and available time, then enter your contact and vehicle details.
                </p>
            </div>

            {confirmedBooking ? (
                <section className="bg-[#151D2A] border border-[#1e293b] rounded-xl p-8 text-center">
                    <div className="text-emerald-400 text-2xl mb-3">✓</div>
                    <h2 className="text-xl font-bold text-white">Workshop Booking Confirmed</h2>
                    <p className="text-sm text-gray-400 mt-2 mb-6">
                        Your reference number is <span className="font-mono text-white">#{confirmedBooking.id}</span>.
                    </p>
                    <Link
                        href={`/dashboard/bookings/${confirmedBooking.id}`}
                        className="inline-block bg-[#2563EB] hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold"
                    >
                        View Booking →
                    </Link>
                </section>
            ) : (
                <form
                    onSubmit={handleSubmit}
                    className="bg-[#151D2A] border border-[#1e293b] rounded-xl p-6 md:p-8 space-y-7"
                >
                    {error && (
                        <div role="alert" className="p-3 text-xs rounded-md bg-red-500/10 text-red-300 border border-red-500/30">
                            {error}
                        </div>
                    )}

                    <section>
                        <h2 className="text-base font-bold text-white mb-4">Service and appointment</h2>
                        {servicesLoading ? (
                            <p className="text-xs text-gray-400">Loading workshop services...</p>
                        ) : servicesError ? (
                            <p role="alert" className="text-xs text-red-300">{servicesError}</p>
                        ) : services.length === 0 ? (
                            <p className="text-xs text-gray-400">No workshop services are available right now.</p>
                        ) : (
                            <>
                                <label htmlFor="workshop-service" className="block text-xs text-gray-300 mb-1.5">
                                    Service
                                </label>
                                <select
                                    id="workshop-service"
                                    value={selectedService}
                                    onChange={(event) => {
                                        setSelectedService(event.target.value);
                                        setSelectedTime("");
                                    }}
                                    className="w-full p-2.5 mb-4 bg-[#090D14] border border-[#1e293b] rounded-lg text-white text-xs outline-none focus:border-[#2563EB]"
                                    required
                                >
                                    {services.map((service) => (
                                        <option key={service.id} value={String(service.id)}>
                                            {service.name} — Rs. {service.base_price}
                                        </option>
                                    ))}
                                </select>
                                {selectedServiceData && (
                                    <p className="text-xs text-gray-400 mb-4">
                                        {selectedServiceData.description} · {selectedServiceData.duration_minutes} min
                                    </p>
                                )}

                                <label htmlFor="workshop-date" className="block text-xs text-gray-300 mb-1.5">
                                    Appointment date (UTC)
                                </label>
                                <input
                                    id="workshop-date"
                                    type="date"
                                    value={selectedDay}
                                    min={todayUtc()}
                                    onChange={(event) => {
                                        const day = event.target.value;
                                        setSelectedDay(day);
                                        setSelectedTime("");
                                        if (!day) {
                                            setSlots([]);
                                            setLoadingSlots(false);
                                            setAvailabilityError("");
                                        }
                                    }}
                                    className="w-full p-2.5 bg-[#090D14] border border-[#1e293b] rounded-lg text-white text-xs outline-none focus:border-[#2563EB]"
                                    required
                                />

                                <div className="mt-4">
                                    <p className="block text-xs text-gray-300 mb-2">Available appointment times (UTC)</p>
                                    {loadingSlots ? (
                                        <p className="text-xs text-gray-400">Checking appointment availability...</p>
                                    ) : availabilityError ? (
                                        <p role="alert" className="text-xs text-red-300">{availabilityError}</p>
                                    ) : slots.filter((slot) => slot.is_available).length === 0 ? (
                                        <p className="text-xs text-gray-400">
                                            No appointment times are available for this date.
                                        </p>
                                    ) : (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                            {slots.filter((slot) => slot.is_available).map((slot) => {
                                                const start = new Date(slot.start_time);
                                                const end = new Date(slot.end_time);
                                                const startLabel = start.toLocaleTimeString([], {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    timeZone: "UTC",
                                                });
                                                const endLabel = end.toLocaleTimeString([], {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    timeZone: "UTC",
                                                });
                                                const isSelected = selectedTime === slot.start_time;
                                                return (
                                                    <button
                                                        key={slot.start_time}
                                                        type="button"
                                                        aria-pressed={isSelected}
                                                        onClick={() => setSelectedTime(slot.start_time)}
                                                        className={`p-2.5 rounded border text-center text-xs transition-all ${
                                                            isSelected
                                                                ? "border-[#2563EB] bg-[#2563EB]/20 text-white font-bold"
                                                                : "border-[#1e293b] bg-[#090D14] text-gray-300 hover:bg-[#1e293b]"
                                                        }`}
                                                    >
                                                        {startLabel} – {endLabel}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </section>

                    <section>
                        <h2 className="text-base font-bold text-white mb-4">Contact and vehicle details</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <label className="text-[11px] text-gray-400">
                                Full name
                                <input
                                    type="text"
                                    autoComplete="name"
                                    value={customer.name}
                                    onChange={(event) => setCustomer({ ...customer, name: event.target.value })}
                                    className="w-full mt-1 p-2.5 bg-[#090D14] border border-[#1e293b] rounded text-white text-xs outline-none focus:border-[#2563EB]"
                                    required
                                />
                            </label>
                            <label className="text-[11px] text-gray-400">
                                Email
                                <input
                                    type="email"
                                    autoComplete="email"
                                    value={customer.email}
                                    onChange={(event) => setCustomer({ ...customer, email: event.target.value })}
                                    className="w-full mt-1 p-2.5 bg-[#090D14] border border-[#1e293b] rounded text-white text-xs outline-none focus:border-[#2563EB]"
                                    required
                                />
                            </label>
                            <label className="text-[11px] text-gray-400">
                                Phone
                                <input
                                    type="tel"
                                    autoComplete="tel"
                                    value={customer.phone}
                                    onChange={(event) => setCustomer({ ...customer, phone: event.target.value })}
                                    className="w-full mt-1 p-2.5 bg-[#090D14] border border-[#1e293b] rounded text-white text-xs outline-none focus:border-[#2563EB]"
                                    required
                                />
                            </label>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                            <label className="text-[11px] text-gray-400">
                                Make
                                <input
                                    value={customer.make}
                                    onChange={(event) => setCustomer({ ...customer, make: event.target.value })}
                                    className="w-full mt-1 p-2.5 bg-[#090D14] border border-[#1e293b] rounded text-white text-xs outline-none focus:border-[#2563EB]"
                                    required
                                />
                            </label>
                            <label className="text-[11px] text-gray-400">
                                Model
                                <input
                                    value={customer.model}
                                    onChange={(event) => setCustomer({ ...customer, model: event.target.value })}
                                    className="w-full mt-1 p-2.5 bg-[#090D14] border border-[#1e293b] rounded text-white text-xs outline-none focus:border-[#2563EB]"
                                    required
                                />
                            </label>
                            <label className="text-[11px] text-gray-400">
                                Year
                                <input
                                    type="number"
                                    min="1980"
                                    max="2030"
                                    value={customer.year}
                                    onChange={(event) => setCustomer({ ...customer, year: event.target.value })}
                                    className="w-full mt-1 p-2.5 bg-[#090D14] border border-[#1e293b] rounded text-white text-xs outline-none focus:border-[#2563EB]"
                                    required
                                />
                            </label>
                            <label className="text-[11px] text-gray-400">
                                Plate / registration
                                <input
                                    value={customer.registration}
                                    onChange={(event) => setCustomer({ ...customer, registration: event.target.value })}
                                    className="w-full mt-1 p-2.5 bg-[#090D14] border border-[#1e293b] rounded text-white text-xs outline-none focus:border-[#2563EB]"
                                    required
                                />
                            </label>
                        </div>
                        <label className="block text-[11px] text-gray-400 mt-4">
                            Notes (optional)
                            <textarea
                                value={customer.notes}
                                onChange={(event) => setCustomer({ ...customer, notes: event.target.value })}
                                rows={3}
                                className="w-full mt-1 p-2.5 bg-[#090D14] border border-[#1e293b] rounded text-white text-xs outline-none focus:border-[#2563EB]"
                            />
                        </label>
                    </section>

                    <button
                        type="submit"
                        disabled={submitting || services.length === 0 || !selectedTime}
                        className="w-full h-11 rounded-lg bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-colors"
                    >
                        {submitting ? "Confirming booking..." : "Book Workshop Service"}
                    </button>
                </form>
            )}
        </main>
    );
}
