"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [services, setServices] = useState<any[]>([]);

    // Wizard State
    const [step, setStep] = useState(1);
    const [selectedVehicle, setSelectedVehicle] = useState("");
    const [selectedService, setSelectedService] = useState("");
    const [date, setDate] = useState("");
    const [message, setMessage] = useState("");

    // Add Vehicle Form State
    const [showAddCar, setShowAddCar] = useState(false);
    const [newCar, setNewCar] = useState({ make: "", model: "", year: "", registration: "" });

    const fetchData = () => {
        const token = localStorage.getItem("token");
        if (!token) { router.push("/login"); return; }
        const headers = { Authorization: `Bearer ${token}` };

        Promise.all([
            fetch("http://localhost:8000/auth/me", { headers }).then((res) => res.json()),
            fetch("http://localhost:8000/vehicles/my-vehicles", { headers }).then((res) => res.json()),
            fetch("http://localhost:8000/services?service_type=workshop").then((res) => res.json()),
        ]).then(([userData, vehicleData, serviceData]) => {
            setUser(userData);
            setVehicles(Array.isArray(vehicleData) ? vehicleData : []);
            // Enforce ONLY workshop services
            const workshopServices = Array.isArray(serviceData)
                ? serviceData.filter((s: any) => s.service_type === "workshop")
                : [];
            setServices(workshopServices);

            if (Array.isArray(vehicleData) && vehicleData.length > 0 && !selectedVehicle) {
                setSelectedVehicle(vehicleData[0].id.toString());
            }
            if (workshopServices.length > 0 && !selectedService) {
                setSelectedService(workshopServices[0].id.toString());
            }
        });
    };

    useEffect(() => {
        // Prevent running on the server during pre-render
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
            fetchData(); // Refresh list
            setSelectedVehicle(added.id.toString());
        }
    };

    const handleBook = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage("");
        const token = localStorage.getItem("token");

        try {
            const res = await fetch("http://localhost:8000/bookings", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    vehicle_id: parseInt(selectedVehicle),
                    service_id: parseInt(selectedService),
                    scheduled_at: new Date(date).toISOString(),
                }),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.detail || "Failed to book");
            }
            setMessage("Booking confirmed successfully!");
            setStep(1); // Reset wizard
        } catch (err: any) {
            setMessage(`Error: ${err.message}`);
        }
    };

    if (!user) return <div className="p-20 text-center text-gray-500">Loading...</div>;

    const selectedVehicleData = vehicles.find((v: any) => v.id.toString() === selectedVehicle);

    return (
        <main className="p-6 md:p-12 max-w-4xl mx-auto min-h-screen">
            {/* Header */}
            <div className="flex justify-between items-center mb-8 border-b border-[#101827] pb-4">
                <div>
                    <h1 className="text-xl font-bold text-white">Welcome, {user.full_name}</h1>
                    <p className="text-sm text-gray-400">Manage your bookings</p>
                </div>
                <button onClick={() => { localStorage.removeItem("token"); router.push("/"); }} className="text-sm border border-[#1e293b] px-4 py-2 rounded-md hover:border-red-500 hover:text-red-500 transition-colors">
                    Logout
                </button>
            </div>

            {/* Booking Wizard Container */}
            <div className="bg-[#151D2A] border border-[#1e293b] rounded-xl p-6 md:p-8 shadow-xl">

                {/* Step Progress Bar - Clean & Professional */}
                <div className="mb-8">
                    <div className="flex items-center justify-between text-xs font-semibold mb-2">
                        <span className={step >= 1 ? "text-[#2563EB]" : "text-gray-500"}>1. Vehicle</span>
                        <span className={step >= 2 ? "text-[#2563EB]" : "text-gray-500"}>2. Workshop Service</span>
                        <span className={step >= 3 ? "text-[#2563EB]" : "text-gray-500"}>3. Date & Confirm</span>
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
                        <p className="text-xs text-gray-400 mb-4">Choose which vehicle from your garage needs service.</p>

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
                                    Continue to Service →
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* STEP 2: SELECT WORKSHOP SERVICE */}
                {step === 2 && (
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h2 className="text-base font-bold text-white">Step 2: Select Workshop Service</h2>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-[#2563EB]/15 text-[#2563EB] border border-[#2563EB]/30">Workshop Bay</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-4">Choose a dedicated workshop bay service for your vehicle.</p>

                        {services.length === 0 ? (
                            <p className="text-xs text-gray-400 p-4 bg-[#090D14] rounded border border-[#1e293b]">No workshop services available at the moment.</p>
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
                                Continue to Date & Time →
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 3: DATE & CONFIRM */}
                {step === 3 && (
                    <form onSubmit={handleBook}>
                        <h2 className="text-base font-bold text-white mb-2">Step 3: Schedule Date & Confirm</h2>
                        <p className="text-xs text-gray-400 mb-6">Select your preferred workshop arrival slot.</p>

                        <div className="mb-6">
                            <label className="block text-xs font-medium text-gray-300 mb-1.5">Select Date and Time <span className="text-red-400">*</span></label>
                            <input
                                type="datetime-local"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="w-full p-2.5 bg-[#090D14] border border-[#1e293b] rounded-lg text-white text-xs outline-none focus:border-[#2563EB]"
                                required
                            />
                        </div>

                        <div className="bg-[#090D14] p-4 rounded-lg border border-[#1e293b] mb-6 text-xs">
                            <p className="text-gray-400 mb-2 font-medium">Workshop Booking Summary:</p>
                            <div className="flex justify-between items-center py-1 border-b border-[#151D2A]">
                                <span className="text-gray-400">Vehicle</span>
                                <span className="text-white font-semibold">{selectedVehicleData?.year} {selectedVehicleData?.make} {selectedVehicleData?.model}</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-[#151D2A]">
                                <span className="text-gray-400">Service</span>
                                <span className="text-white font-semibold">{services.find((s: any) => s.id.toString() === selectedService)?.name}</span>
                            </div>
                            <div className="flex justify-between items-center py-1">
                                <span className="text-gray-400">Base Price</span>
                                <span className="text-[#2563EB] font-bold">${services.find((s: any) => s.id.toString() === selectedService)?.base_price}</span>
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
                                className="h-10 px-6 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold transition-colors flex items-center justify-center flex-1 shadow-md shadow-blue-900/20"
                            >
                                Confirm Booking
                            </button>
                        </div>
                    </form>
                )}

            </div>
        </main>
    );
}