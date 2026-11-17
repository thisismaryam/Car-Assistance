"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const ISSUE_OPTIONS = [
    { id: "Towing Required", label: "Emergency Flatbed Towing", desc: "Vehicle immobile, accident or transmission failure" },
    { id: "Dead Battery / Jump Start", label: "Dead Battery / Jump-Start", desc: "No ignition, clicking sound, or lights left on" },
    { id: "Flat Tyre", label: "Flat Tyre / Puncture", desc: "Tyre flat or damaged, need spare wheel mounted" },
    { id: "Out of Fuel", label: "Emergency Fuel Drop", desc: "Ran out of petrol/diesel on the road (up to 5 L)" },
    { id: "Engine Overheating", label: "Engine Overheating / Steam", desc: "Coolant temperature spike or radiator steam" },
    { id: "Lockout / Key Inside", label: "Key Lockout", desc: "Keys locked inside the vehicle or lost" },
    { id: "Other Breakdown", label: "Other Mechanical Issue", desc: "Unknown noise, stalling, or steering failure" },
];

export default function EmergencyPage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [selectedVehicle, setSelectedVehicle] = useState<string>("");
    const [issueType, setIssueType] = useState<string>(ISSUE_OPTIONS[0].id);
    const [location, setLocation] = useState<string>("");
    const [notes, setNotes] = useState<string>("");
    const [locating, setLocating] = useState<boolean>(false);
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [successData, setSuccessData] = useState<any>(null);
    const [errorMsg, setErrorMsg] = useState<string>("");

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) return;

        const headers = { Authorization: `Bearer ${token}` };
        Promise.all([
            fetch("http://localhost:8000/auth/me", { headers }).then(r => r.ok ? r.json() : null),
            fetch("http://localhost:8000/vehicles/my-vehicles", { headers }).then(r => r.ok ? r.json() : [])
        ]).then(([userData, vehicleData]) => {
            if (userData) setUser(userData);
            if (Array.isArray(vehicleData)) {
                setVehicles(vehicleData);
                if (vehicleData.length > 0) {
                    setSelectedVehicle(vehicleData[0].id.toString());
                }
            }
        }).catch(() => {});
    }, []);

    const handleGetLocation = () => {
        if (!navigator.geolocation) {
            setErrorMsg("Geolocation is not supported by your browser. Please type your location manually.");
            return;
        }

        setLocating(true);
        setErrorMsg("");

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude.toFixed(6);
                const lng = position.coords.longitude.toFixed(6);
                const accuracy = Math.round(position.coords.accuracy);
                setLocation(`GPS: ${lat}, ${lng} (±${accuracy}m accuracy)`);
                setLocating(false);
            },
            (err) => {
                setLocating(false);
                setErrorMsg(`Location error: ${err.message}. Please enter address or landmark manually.`);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg("");

        if (!location.trim()) {
            setErrorMsg("Please provide your current location or click 'Detect GPS Location'.");
            return;
        }

        const token = localStorage.getItem("token");
        if (!token) {
            setErrorMsg("Please log in to submit a dispatch request, or call our 24/7 hotline directly.");
            return;
        }

        setSubmitting(true);

        try {
            const res = await fetch("http://localhost:8000/roadside/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    vehicle_id: selectedVehicle ? parseInt(selectedVehicle) : null,
                    location: location.trim(),
                    issue_type: issueType,
                    notes: notes.trim() || null,
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Failed to submit roadside request");
            }

            const data = await res.json();
            setSuccessData(data);
        } catch (err: any) {
            setErrorMsg(err.message || "An error occurred submitting request.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="p-6 md:p-12 max-w-4xl mx-auto min-h-screen">
            {/* Top Bar / Emergency Hotline */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#151D2A] border border-[#1e293b] p-4 rounded-xl mb-8">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                        <h1 className="text-sm font-bold text-white uppercase tracking-wider">24/7 Roadside Emergency Dispatch</h1>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">Average rapid response time: 25 minutes across metropolitan areas</p>
                </div>
                <a
                    href="tel:+923000000000"
                    className="inline-flex items-center gap-2 bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                >
                    <span>📞</span> Call Hotline: +92 300 0000000
                </a>
            </div>

            {/* Success Confirmation Card */}
            {successData ? (
                <div className="bg-[#151D2A] border border-[#2563EB]/40 rounded-xl p-6 md:p-8 shadow-xl">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-full bg-[#2563EB]/20 border border-[#2563EB] flex items-center justify-center text-[#2563EB] font-bold text-sm">
                            ✓
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-white">Roadside Request Logged & Dispatched</h2>
                            <p className="text-xs text-gray-400 font-mono">Incident ID: #{successData.id}</p>
                        </div>
                    </div>

                    <div className="bg-[#090D14] p-4 rounded-lg border border-[#1e293b] text-xs space-y-2 mb-6">
                        <div className="flex justify-between py-1 border-b border-[#151D2A]">
                            <span className="text-gray-400">Status</span>
                            <span className="px-2 py-0.5 rounded font-bold uppercase bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                                {successData.status}
                            </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-[#151D2A]">
                            <span className="text-gray-400">Issue Reported</span>
                            <span className="text-white font-semibold">{successData.issue_type}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-[#151D2A]">
                            <span className="text-gray-400">Incident Location</span>
                            <span className="text-white font-mono text-right max-w-xs truncate">{successData.location}</span>
                        </div>
                        {successData.vehicle && (
                            <div className="flex justify-between py-1">
                                <span className="text-gray-400">Vehicle</span>
                                <span className="text-white">{successData.vehicle.year} {successData.vehicle.make} {successData.vehicle.model} ({successData.vehicle.registration})</span>
                            </div>
                        )}
                    </div>

                    <p className="text-xs text-gray-300 mb-6">
                        An operations controller is reviewing your alert in the admin dashboard and a service vehicle has been routed. Keep your phone line clear.
                    </p>

                    <button
                        onClick={() => { setSuccessData(null); setLocation(""); setNotes(""); }}
                        className="w-full bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg transition-colors"
                    >
                        Submit Another Emergency Alert
                    </button>
                </div>
            ) : (
                /* Emergency Request Form */
                <div className="bg-[#151D2A] border border-[#1e293b] rounded-xl p-6 md:p-8 shadow-xl">
                    <div className="mb-6 border-b border-[#1e293b] pb-4">
                        <h2 className="text-base font-bold text-white">Request Immediate Roadside Assistance</h2>
                        <p className="text-xs text-gray-400 mt-1">
                            Submit your issue and live coordinates. Our response team receives alerts instantly in the operations control center.
                        </p>
                    </div>

                    {errorMsg && (
                        <div className="p-3 text-xs mb-6 rounded-md bg-red-500/10 text-red-400 border border-red-500/30">
                            {errorMsg}
                        </div>
                    )}

                    {!user && (
                        <div className="p-3.5 mb-6 rounded-md bg-[#090D14] border border-[#1e293b] text-xs flex justify-between items-center">
                            <span className="text-gray-300">Have an account? Log in to automatically attach your vehicle & details.</span>
                            <Link href="/login" className="bg-[#2563EB] hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded transition-colors">
                                Log In
                            </Link>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* 1. SELECT VEHICLE */}
                        <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1.5">
                                Select Vehicle
                            </label>
                            {vehicles.length > 0 ? (
                                <select
                                    value={selectedVehicle}
                                    onChange={(e) => setSelectedVehicle(e.target.value)}
                                    className="w-full p-2.5 bg-[#090D14] border border-[#1e293b] rounded-lg text-white text-xs outline-none focus:border-[#2563EB]"
                                >
                                    {vehicles.map((v) => (
                                        <option key={v.id} value={v.id}>
                                            {v.year} {v.make} {v.model} — {v.registration}
                                        </option>
                                    ))}
                                    <option value="">Vehicle not in garage / driving rental</option>
                                </select>
                            ) : (
                                <p className="text-xs text-gray-400 bg-[#090D14] p-2.5 rounded-lg border border-[#1e293b]">
                                    No registered vehicles found. (Vehicle can be specified in notes below)
                                </p>
                            )}
                        </div>

                        {/* 2. SELECT ISSUE */}
                        <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1.5">
                                Select Breakdown Issue <span className="text-red-400">*</span>
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {ISSUE_OPTIONS.map((opt) => {
                                    const isSelected = issueType === opt.id;
                                    return (
                                        <div
                                            key={opt.id}
                                            onClick={() => setIssueType(opt.id)}
                                            className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                                isSelected
                                                    ? "border-[#2563EB] bg-[#2563EB]/10"
                                                    : "border-[#1e293b] bg-[#090D14] hover:border-gray-600"
                                            }`}
                                        >
                                            <p className="text-xs font-bold text-white">{opt.label}</p>
                                            <p className="text-[11px] text-gray-400 mt-0.5">{opt.desc}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 3. SHARE LOCATION */}
                        <div>
                            <div className="flex justify-between items-center mb-1.5">
                                <label className="text-xs font-medium text-gray-300">
                                    Current Location / Highway Marker <span className="text-red-400">*</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={handleGetLocation}
                                    disabled={locating}
                                    className="text-xs font-bold text-[#2563EB] hover:text-blue-400 flex items-center gap-1 disabled:opacity-50"
                                >
                                    <span>📍</span>
                                    {locating ? "Fetching GPS..." : "Share Live GPS Location"}
                                </button>
                            </div>
                            <input
                                type="text"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="e.g. M-2 Motorway Km 45 southbound or Street Address / GPS coordinates"
                                className="w-full p-2.5 bg-[#090D14] border border-[#1e293b] rounded-lg text-white text-xs outline-none focus:border-[#2563EB]"
                                required
                            />
                        </div>

                        {/* 4. DETAILS / NOTES */}
                        <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1.5">
                                Additional Details (Optional)
                            </label>
                            <input
                                type="text"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Car colour, passengers on board, whether car is blocking traffic"
                                className="w-full p-2.5 bg-[#090D14] border border-[#1e293b] rounded-lg text-white text-xs outline-none focus:border-[#2563EB]"
                            />
                        </div>

                        {/* SUBMIT BUTTON */}
                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold py-3 rounded-lg transition-colors shadow-lg shadow-blue-900/20"
                            >
                                {submitting ? "Transmitting Alert to Ops Center..." : "Dispatch Roadside Unit Now →"}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </main>
    );
}
