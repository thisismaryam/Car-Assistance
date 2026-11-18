"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function HomeServicePage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [services, setServices] = useState<any[]>([]);

    // Wizard State
    const [step, setStep] = useState(1);
    const [selectedVehicle, setSelectedVehicle] = useState("");
    const [selectedService, setSelectedService] = useState("");
    const [selectedDay, setSelectedDay] = useState("");
    const [slots, setSlots] = useState<any[]>([]);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [date, setDate] = useState("");
    const [address, setAddress] = useState("");
    const [notes, setNotes] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const [confirmedBooking, setConfirmedBooking] = useState<any | null>(null);

    // Add Vehicle Form State
    const [showAddCar, setShowAddCar] = useState(false);
    const [newCar, setNewCar] = useState({ make: "", model: "", year: "", registration: "" });

    const fetchSlots = (dayStr: string, sId: string) => {
        if (!sId || !dayStr) return;
        setLoadingSlots(true);
        fetch(`http://localhost:8000/bookings/availability?service_id=${sId}&date=${dayStr}`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data && Array.isArray(data.slots)) {
                    setSlots(data.slots);
                } else {
                    setSlots([]);
                }
            })
            .catch(() => setSlots([]))
            .finally(() => setLoadingSlots(false));
    };

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (step === 3 && selectedService) {
            const todayStr = selectedDay || new Date().toISOString().split("T")[0];
            if (!selectedDay) setSelectedDay(todayStr);
            fetchSlots(todayStr, selectedService);
        }
    }, [step, selectedDay, selectedService]);

    const fetchData = () => {
        const token = localStorage.getItem("token");
        if (!token) { router.push("/login"); return; }
        const headers = { Authorization: `Bearer ${token}` };

        Promise.all([
            fetch("http://localhost:8000/auth/me", { headers }).then((res) => res.json()),
            fetch("http://localhost:8000/vehicles/my-vehicles", { headers }).then((res) => res.json()),
            fetch("http://localhost:8000/services?service_type=home").then((res) => res.json()),
        ]).then(([userData, vehicleData, serviceData]) => {
            setUser(userData);
            setVehicles(Array.isArray(vehicleData) ? vehicleData : []);
            // Enforce ONLY home services
            const homeServices = Array.isArray(serviceData)
                ? serviceData.filter((s: any) => s.service_type === "home")
                : [];
            setServices(homeServices);

            if (Array.isArray(vehicleData) && vehicleData.length > 0 && !selectedVehicle) {
                setSelectedVehicle(vehicleData[0].id.toString());
            }
            if (homeServices.length > 0 && !selectedService) {
                setSelectedService(homeServices[0].id.toString());
            }
        });
    };

    useEffect(() => {
        if (typeof window === "undefined") return;
        fetchData();
    }, [router]);

    const handleAddCar = async (e: React.FormEvent) => {
        e.preventDefault();
        const token = localStorage.getItem("token");
        const res = await fetch("http://localhost:8000/vehicles", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ ...newCar, year: parseInt(newCar.year) }),
        });
        if (res.ok) {
            const added = await res.json();
            setShowAddCar(false);
            setNewCar({ make: "", model: "", year: "", registration: "" });
            fetchData();
            setSelectedVehicle(added.id.toString());
        }
    };

    const handleBook = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage("");

        if (!address.trim()) {
            setMessage("Error: Home Address is required for home services.");
            return;
        }

        setLoading(true);
        const token = localStorage.getItem("token");

        try {
            const res = await fetch("http://localhost:8000/bookings", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    vehicle_id: parseInt(selectedVehicle),
                    service_id: parseInt(selectedService),
                    scheduled_at: new Date(date).toISOString(),
                    address: address.trim(),
                    notes: notes.trim() || null,
                }),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.detail || "Failed to book home service");
            }

            const confirmed = await res.json();
            // FEATURE 6: Never generate success response or redirection link until backend database creation is fully confirmed
            if (!confirmed || typeof confirmed.id !== "number") {
                throw new Error("Server error: confirmed booking record was not returned.");
            }

            setConfirmedBooking(confirmed);
            setMessage("");
            setStep(1);
            setAddress("");
            setNotes("");
            setDate("");
        } catch (err: any) {
            setMessage(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    if (!user) return <div className="p-20 text-center text-gray-500">Loading...</div>;

    const selectedVehicleData = vehicles.find((v: any) => v.id.toString() === selectedVehicle);
    const selectedServiceData = services.find((s: any) => s.id.toString() === selectedService);

    return (
        <main className="p-6 md:p-12 max-w-4xl mx-auto min-h-screen">
            {/* Header */}
            <div className="flex justify-between items-center mb-8 border-b border-[#151D2A] pb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-bold text-white">Home Service Booking</h1>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-[#2563EB]/15 text-[#2563EB] border border-[#2563EB]/30">Doorstep Mechanics</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">We come directly to your driveway or parking space</p>
                </div>
                <button
                    onClick={() => { localStorage.removeItem("token"); router.push("/"); }}
                    className="text-xs border border-[#1e293b] px-3.5 py-1.5 rounded-md hover:border-red-500 hover:text-red-500 transition-colors text-gray-300"
                >
                    Logout
                </button>
            </div>

            {/* Booking Wizard Container */}
            <div className="bg-[#151D2A] border border-[#1e293b] rounded-xl p-6 md:p-8 shadow-xl">
                {/* FEATURE 6: Confirmed Home Service Booking Direct View */}
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
                                <span className="text-gray-400">Home Service</span>
                                <span className="text-white font-semibold">{confirmedBooking.service?.name}</span>
                            </div>
                            <div className="flex justify-between py-1.5 border-b border-[#151D2A]">
                                <span className="text-gray-400">Vehicle</span>
                                <span className="text-white font-semibold">
                                    {confirmedBooking.vehicle?.year} {confirmedBooking.vehicle?.make} {confirmedBooking.vehicle?.model}
                                </span>
                            </div>
                            <div className="flex justify-between py-1.5 border-b border-[#151D2A]">
                                <span className="text-gray-400">Scheduled Time</span>
                                <span className="text-white font-mono">
                                    {new Date(confirmedBooking.scheduled_at).toLocaleString()}
                                </span>
                            </div>
                            {confirmedBooking.address && (
                                <div className="flex justify-between py-1.5 border-b border-[#151D2A]">
                                    <span className="text-gray-400">Driveway Address</span>
                                    <span className="text-white font-medium text-right max-w-xs truncate">{confirmedBooking.address}</span>
                                </div>
                            )}
                            <div className="flex justify-between py-1.5">
                                <span className="text-gray-400">Assigned Technician</span>
                                <span className="text-emerald-400 font-bold">
                                    {confirmedBooking.mechanic ? `✓ ${confirmedBooking.mechanic.full_name}` : "Auto-Dispatching..."}
                                </span>
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
                        {/* Step Progress Bar - Clean & Professional */}
                <div className="mb-8">
                    <div className="flex items-center justify-between text-xs font-semibold mb-2">
                        <span className={step >= 1 ? "text-[#2563EB]" : "text-gray-500"}>1. Vehicle</span>
                        <span className={step >= 2 ? "text-[#2563EB]" : "text-gray-500"}>2. Home Service</span>
                        <span className={step >= 3 ? "text-[#2563EB]" : "text-gray-500"}>3. Address & Confirm</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`flex-1 h-1 rounded-full transition-colors ${step >= 1 ? "bg-[#2563EB]" : "bg-[#1e293b]"}`} />
                        <div className={`flex-1 h-1 rounded-full transition-colors ${step >= 2 ? "bg-[#2563EB]" : "bg-[#1e293b]"}`} />
                        <div className={`flex-1 h-1 rounded-full transition-colors ${step >= 3 ? "bg-[#2563EB]" : "bg-[#1e293b]"}`} />
                    </div>
                </div>

                {message && (
                    <div className={`p-3 text-xs mb-6 rounded-md ${message.includes('Error') ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'}`}>
                        {message}
                    </div>
                )}

                {/* STEP 1: SELECT VEHICLE */}
                {step === 1 && (
                    <div>
                        <h2 className="text-base font-bold text-white mb-2">Step 1: Select your vehicle</h2>
                        <p className="text-xs text-gray-400 mb-4">Choose which vehicle needs doorstep mechanic service.</p>

                        {vehicles.length === 0 && !showAddCar ? (
                            <div className="text-center p-6 bg-[#090D14] rounded-lg border border-[#1e293b]">
                                <p className="text-gray-400 mb-4 text-xs">You don't have any vehicles registered.</p>
                                <button onClick={() => setShowAddCar(true)} className="bg-[#2563EB] hover:bg-blue-700 text-white px-5 py-2 rounded-md text-xs font-bold transition-colors">
                                    + Add a Vehicle
                                </button>
                            </div>
                        ) : showAddCar ? (
                            <form onSubmit={handleAddCar} className="bg-[#090D14] p-4 rounded-lg border border-[#1e293b] mb-4 flex flex-col gap-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <input placeholder="Make (e.g. Toyota)" value={newCar.make} onChange={e => setNewCar({ ...newCar, make: e.target.value })} className="p-2 bg-[#151D2A] border border-[#1e293b] rounded text-white text-xs outline-none focus:border-[#2563EB]" required />
                                    <input placeholder="Model (e.g. Corolla)" value={newCar.model} onChange={e => setNewCar({ ...newCar, model: e.target.value })} className="p-2 bg-[#151D2A] border border-[#1e293b] rounded text-white text-xs outline-none focus:border-[#2563EB]" required />
                                    <input type="number" placeholder="Year" value={newCar.year} onChange={e => setNewCar({ ...newCar, year: e.target.value })} className="p-2 bg-[#151D2A] border border-[#1e293b] rounded text-white text-xs outline-none focus:border-[#2563EB]" required />
                                    <input placeholder="Reg (ABC-123)" value={newCar.registration} onChange={e => setNewCar({ ...newCar, registration: e.target.value })} className="p-2 bg-[#151D2A] border border-[#1e293b] rounded text-white text-xs outline-none focus:border-[#2563EB]" required />
                                </div>
                                <div className="flex gap-2 mt-2">
                                    <button type="submit" className="bg-[#2563EB] hover:bg-blue-700 text-white px-4 py-2 rounded text-xs font-bold flex-1 transition-colors">Save Vehicle</button>
                                    <button type="button" onClick={() => setShowAddCar(false)} className="border border-[#1e293b] text-gray-400 px-4 py-2 rounded text-xs hover:text-white">Cancel</button>
                                </div>
                            </form>
                        ) : (
                            <div className="grid gap-3">
                                {vehicles.map((v: any) => {
                                    const isSelected = selectedVehicle === v.id.toString();
                                    return (
                                        <div
                                            key={v.id}
                                            onClick={() => setSelectedVehicle(v.id.toString())}
                                            className={`p-4 rounded-lg border cursor-pointer transition-all ${
                                                isSelected
                                                    ? 'border-[#2563EB] bg-[#2563EB]/15'
                                                    : 'border-[#1e293b] bg-[#090D14] hover:bg-[#1e293b] hover:border-gray-600'
                                            }`}
                                        >
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <h3 className="font-bold text-white text-sm">{v.year} {v.make} {v.model}</h3>
                                                    <p className="text-xs text-gray-400 font-mono mt-0.5">{v.registration}</p>
                                                </div>
                                                <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isSelected ? 'border-[#2563EB] bg-[#2563EB]' : 'border-gray-600'}`}>
                                                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                                <button onClick={() => setShowAddCar(true)} className="text-left text-xs text-[#2563EB] font-bold mt-1 hover:underline">+ Add another vehicle</button>
                            </div>
                        )}

                        {vehicles.length > 0 && !showAddCar && (
                            <div className="flex justify-end mt-6">
                                <button
                                    onClick={() => setStep(2)}
                                    className="h-10 px-6 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold transition-colors flex items-center justify-center shadow-md shadow-blue-900/20"
                                >
                                    Continue to Home Service →
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* STEP 2: SELECT HOME SERVICE */}
                {step === 2 && (
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h2 className="text-base font-bold text-white">Step 2: Select Home Service</h2>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-[#2563EB]/15 text-[#2563EB] border border-[#2563EB]/30">Doorstep</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-4">Select the service to be performed at your doorstep.</p>

                        {services.length === 0 ? (
                            <p className="text-xs text-gray-400 p-4 bg-[#090D14] rounded border border-[#1e293b]">No home services available. Make sure services are seeded.</p>
                        ) : (
                            <div className="grid gap-3 mb-6">
                                {services.map((s: any) => {
                                    const isSelected = selectedService === s.id.toString();
                                    return (
                                        <div
                                            key={s.id}
                                            onClick={() => setSelectedService(s.id.toString())}
                                            className={`p-4 rounded-lg border cursor-pointer transition-all ${
                                                isSelected
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
                                                    <span className="text-sm font-black text-white">${s.base_price}</span>
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
                                onClick={() => setStep(1)}
                                className="h-10 px-5 rounded-lg border border-[#1e293b] text-gray-300 hover:text-white hover:bg-[#1e293b] text-xs font-semibold transition-colors flex items-center justify-center"
                            >
                                Back
                            </button>
                            <button
                                onClick={() => setStep(3)}
                                disabled={!selectedService}
                                className="h-10 px-6 rounded-lg bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-colors flex items-center justify-center flex-1 shadow-md shadow-blue-900/20"
                            >
                                Continue to Address & Time →
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 3: HOME ADDRESS & CONFIRM */}
                {step === 3 && (
                    <form onSubmit={handleBook}>
                        <h2 className="text-base font-bold text-white mb-2">Step 3: Location, Date & Confirmation</h2>
                        <p className="text-xs text-gray-400 mb-6">Provide your full address so our mechanic arrives on schedule.</p>

                        {/* HOME ADDRESS INPUT */}
                        <div className="mb-4">
                            <label className="block text-xs font-medium text-gray-300 mb-1.5">
                                Home / On-Site Address <span className="text-red-400">*</span>
                            </label>
                            <textarea
                                value={address}
                                onChange={e => setAddress(e.target.value)}
                                rows={2}
                                placeholder="House / Flat No., Street, Sector, City (e.g., House 42, St 14, F-8/2, Islamabad)"
                                className="w-full p-2.5 bg-[#090D14] border border-[#1e293b] rounded-lg text-white text-xs outline-none focus:border-[#2563EB]"
                                required
                            />
                        </div>

                        {/* DATE PICKER */}
                        <div className="mb-4">
                            <label className="block text-xs font-medium text-gray-300 mb-1.5">
                                Select Appointment Date <span className="text-red-400">*</span>
                            </label>
                            <input
                                type="date"
                                value={selectedDay}
                                min={new Date().toISOString().split("T")[0]}
                                onChange={e => {
                                    setSelectedDay(e.target.value);
                                    setDate("");
                                }}
                                className="w-full p-2.5 bg-[#090D14] border border-[#1e293b] rounded-lg text-white text-xs outline-none focus:border-[#2563EB]"
                                required
                            />
                        </div>

                        {/* REAL-TIME MECHANIC SLOTS GRID */}
                        <div className="mb-6">
                            <label className="block text-xs font-medium text-gray-300 mb-1.5">
                                Select Available Doorstep Slot (Mechanic duty & travel buffer verified) <span className="text-red-400">*</span>
                            </label>

                            {loadingSlots ? (
                                <p className="text-xs text-gray-400 py-3 bg-[#090D14] p-3 rounded-lg border border-[#1e293b]">Checking mechanic rosters & travel buffers...</p>
                            ) : slots.length === 0 ? (
                                <p className="text-xs text-gray-400 py-3 bg-[#090D14] p-3 rounded-lg border border-[#1e293b]">Select an appointment date above to view mechanic slots.</p>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1 bg-[#090D14] rounded-lg border border-[#1e293b]">
                                    {slots.map((s: any, idx: number) => {
                                        const startTimeStr = new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
                                        const endTimeStr = new Date(s.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
                                        const isSelected = date === s.start_time;

                                        if (!s.is_available) {
                                            return (
                                                <div
                                                    key={idx}
                                                    className="p-2 rounded border border-[#1e293b]/60 bg-[#101827]/40 text-gray-500 opacity-60 text-center cursor-not-allowed"
                                                    title={s.reason}
                                                >
                                                    <p className="text-[11px] font-mono">{startTimeStr} - {endTimeStr}</p>
                                                    <span className="text-[9px] text-red-400/80 uppercase font-bold block mt-0.5">
                                                        {s.reason.includes("lead time") ? "< 2h lead" : s.reason.includes("past") ? "Past" : "Booked"}
                                                    </span>
                                                </div>
                                            );
                                        }

                                        return (
                                            <button
                                                type="button"
                                                key={idx}
                                                onClick={() => setDate(s.start_time)}
                                                className={`p-2 rounded border text-center transition-all ${
                                                    isSelected
                                                        ? "border-[#2563EB] bg-[#2563EB]/20 text-white"
                                                        : "border-[#1e293b] bg-[#151D2A] hover:bg-[#1e293b] text-gray-300"
                                                }`}
                                            >
                                                <p className="text-[11px] font-mono font-bold">{startTimeStr} - {endTimeStr} UTC</p>
                                                <span className="text-[9px] text-[#2563EB] font-semibold block mt-0.5">
                                                    {s.remaining_capacity} mechanic{s.remaining_capacity > 1 ? "s" : ""} free
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* ADDITIONAL NOTES */}
                        <div className="mb-6">
                            <label className="block text-xs font-medium text-gray-300 mb-1.5">Special Instructions (Optional)</label>
                            <input
                                type="text"
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Gate code, parking instructions, or specific car symptoms"
                                className="w-full p-2.5 bg-[#090D14] border border-[#1e293b] rounded-lg text-white text-xs outline-none focus:border-[#2563EB]"
                            />
                        </div>

                        {/* SUMMARY CARD */}
                        <div className="bg-[#090D14] p-4 rounded-lg border border-[#1e293b] mb-6 text-xs">
                            <p className="text-gray-400 mb-2 font-medium">Home Service Summary:</p>
                            <div className="flex justify-between items-center py-1 border-b border-[#151D2A]">
                                <span className="text-gray-400">Vehicle</span>
                                <span className="text-white font-semibold">{selectedVehicleData?.year} {selectedVehicleData?.make} {selectedVehicleData?.model} ({selectedVehicleData?.registration})</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-[#151D2A]">
                                <span className="text-gray-400">Service</span>
                                <span className="text-white font-semibold">{selectedServiceData?.name}</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-[#151D2A]">
                                <span className="text-gray-400">Selected Slot</span>
                                <span className="text-white font-mono">{date ? new Date(date).toUTCString() : "Please choose a slot above"}</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-[#151D2A]">
                                <span className="text-gray-400">Base Price</span>
                                <span className="text-[#2563EB] font-bold">${selectedServiceData?.base_price}</span>
                            </div>
                            {address && (
                                <div className="flex justify-between items-start py-1">
                                    <span className="text-gray-400">Dispatch Location</span>
                                    <span className="text-white text-right max-w-xs truncate">{address}</span>
                                </div>
                            )}
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
                                disabled={loading || !date}
                                className="h-10 px-6 rounded-lg bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-colors flex items-center justify-center flex-1 shadow-md shadow-blue-900/20"
                            >
                                {loading ? "Confirming..." : "Confirm Doorstep Booking"}
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

