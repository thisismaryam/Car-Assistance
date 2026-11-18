"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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

const LIFECYCLE_STAGES = [
    { key: "requested", label: "1. Requested" },
    { key: "accepted", label: "2. Accepted" },
    { key: "assigned", label: "3. Provider Assigned" },
    { key: "en route", label: "4. En Route" },
    { key: "arrived", label: "5. Arrived On-Site" },
    { key: "resolved", label: "6. Resolved" },
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
    const [activeIncident, setActiveIncident] = useState<any | null>(null);
    const [errorMsg, setErrorMsg] = useState<string>("");
    const [wsConnected, setWsConnected] = useState<boolean>(false);
    const [cancelling, setCancelling] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);

    // Fetch active user and vehicles, and check for any existing active roadside incident
    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) return;

        const headers = { Authorization: `Bearer ${token}` };
        Promise.all([
            fetch("http://localhost:8000/auth/me", { headers }).then(r => r.ok ? r.json() : null),
            fetch("http://localhost:8000/vehicles/my-vehicles", { headers }).then(r => r.ok ? r.json() : []),
            fetch("http://localhost:8000/roadside/my", { headers }).then(r => r.ok ? r.json() : []),
        ]).then(([userData, vehicleData, roadsideData]) => {
            if (userData) setUser(userData);
            if (Array.isArray(vehicleData)) {
                setVehicles(vehicleData);
                if (vehicleData.length > 0) {
                    setSelectedVehicle(vehicleData[0].id.toString());
                }
            }
            if (Array.isArray(roadsideData) && roadsideData.length > 0) {
                // Find most recent active incident that is not resolved or cancelled
                const active = roadsideData.find(r => !["resolved", "cancelled"].includes(r.status?.toLowerCase()));
                if (active) {
                    setActiveIncident(active);
                }
            }
        }).catch(() => {});
    }, []);

    // Setup live WebSocket push stream for the active incident
    useEffect(() => {
        if (!activeIncident?.id) return;
        const incidentId = activeIncident.id;
        let socket: WebSocket | null = null;
        let reconnectTimer: any = null;

        const connectCustomerWS = () => {
            try {
                socket = new WebSocket(`ws://localhost:8000/roadside/ws/customer/${incidentId}`);
                wsRef.current = socket;

                socket.onopen = () => {
                    setWsConnected(true);
                };

                socket.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);
                        if (msg.data && msg.data.id === incidentId) {
                            setActiveIncident(msg.data);
                        }
                    } catch {
                        // ignore malformed ws messages
                    }
                };

                socket.onclose = () => {
                    setWsConnected(false);
                    reconnectTimer = setTimeout(connectCustomerWS, 4000);
                };

                socket.onerror = () => {
                    setWsConnected(false);
                    socket?.close();
                };
            } catch {
                setWsConnected(false);
            }
        };

        connectCustomerWS();

        // 5-second polling fallback
        const pollInterval = setInterval(() => {
            const token = localStorage.getItem("token");
            if (!token) return;
            fetch(`http://localhost:8000/roadside/${incidentId}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (data) setActiveIncident(data);
                })
                .catch(() => {});
        }, 5000);

        return () => {
            clearInterval(pollInterval);
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (socket) socket.close();
        };
    }, [activeIncident?.id]);

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
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || "Failed to submit roadside request");
            }

            const data = await res.json();
            setActiveIncident(data);
        } catch (err: any) {
            setErrorMsg(err.message || "An error occurred submitting request.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancelIncident = async () => {
        if (!activeIncident) return;
        if (!confirm("Are you sure you want to cancel this emergency roadside request?")) return;
        const token = localStorage.getItem("token");
        setCancelling(true);

        try {
            const res = await fetch(`http://localhost:8000/roadside/${activeIncident.id}/status`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ status: "cancelled", notes: "Cancelled by customer" }),
            });
            if (res.ok) {
                const updated = await res.json();
                setActiveIncident(updated);
            }
        } finally {
            setCancelling(false);
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

            {/* LIVE REAL-TIME INCIDENT TRACKING INTERFACE */}
            {activeIncident ? (
                <div className="bg-[#151D2A] border border-[#2563EB]/40 rounded-xl p-6 md:p-8 shadow-2xl">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#101827] pb-4 mb-6">
                        <div>
                            <div className="flex items-center gap-3">
                                <span className="w-3 h-3 rounded-full bg-red-500 animate-ping"></span>
                                <h2 className="text-lg font-bold text-white">Active Dispatch Stream</h2>
                                <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 font-bold">
                                    #CA-EMERG-{activeIncident.id}
                                </span>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">
                                Logged at {new Date(activeIncident.created_at).toLocaleString()}
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1.5 text-[11px] font-mono">
                                <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`}></span>
                                <span className={wsConnected ? "text-emerald-400" : "text-amber-400"}>
                                    {wsConnected ? "Live Socket Connected" : "Connecting..."}
                                </span>
                            </span>
                        </div>
                    </div>

                    {/* 7-Step Lifecycle Timeline */}
                    <div className="mb-8 bg-[#090D14] p-5 rounded-xl border border-[#1e293b]">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Dispatch Lifecycle Status</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-xs">
                            {LIFECYCLE_STAGES.map((stage) => {
                                const currentStatus = (activeIncident.status || "").toLowerCase();
                                const isCurrent = currentStatus === stage.key || (stage.key === "requested" && currentStatus === "pending") || (stage.key === "en route" && currentStatus === "en_route");
                                const isPassed =
                                    (stage.key === "requested") ||
                                    (stage.key === "accepted" && ["accepted", "assigned", "en route", "en_route", "arrived", "resolved"].includes(currentStatus)) ||
                                    (stage.key === "assigned" && ["assigned", "en route", "en_route", "arrived", "resolved"].includes(currentStatus)) ||
                                    (stage.key === "en route" && ["en route", "en_route", "arrived", "resolved"].includes(currentStatus)) ||
                                    (stage.key === "arrived" && ["arrived", "resolved"].includes(currentStatus)) ||
                                    (stage.key === "resolved" && currentStatus === "resolved");

                                return (
                                    <div
                                        key={stage.key}
                                        className={`p-2 rounded-lg border text-[11px] font-bold transition-all ${
                                            isCurrent
                                                ? "bg-[#2563EB]/20 border-[#2563EB] text-white shadow-md shadow-blue-900/30 animate-pulse"
                                                : isPassed
                                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                                : "bg-[#151D2A]/40 border-[#1e293b] text-gray-500"
                                        }`}
                                    >
                                        <p className="truncate">{stage.label}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Assigned Provider Card */}
                    {activeIncident.assigned_mechanic ? (
                        <div className="mb-6 bg-emerald-950/20 border border-emerald-500/40 p-4 rounded-xl flex items-center justify-between">
                            <div>
                                <span className="text-[10px] text-emerald-400 uppercase font-black tracking-wider block">Assigned Response Provider</span>
                                <p className="text-sm font-bold text-white mt-0.5">✓ {activeIncident.assigned_mechanic.full_name}</p>
                                <p className="text-xs text-gray-400 font-mono mt-0.5">Certified Roadside Technician</p>
                            </div>
                            <a
                                href={`tel:${activeIncident.assigned_mechanic.phone}`}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5"
                            >
                                📞 Call Provider
                            </a>
                        </div>
                    ) : (
                        <div className="mb-6 bg-yellow-950/20 border border-yellow-500/40 p-4 rounded-xl flex items-center justify-between">
                            <div>
                                <span className="text-[10px] text-yellow-400 uppercase font-black tracking-wider block">Controller Queued</span>
                                <p className="text-xs text-gray-300 mt-0.5">Operations team is assigning the closest mobile unit / flatbed...</p>
                            </div>
                            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-ping"></span>
                        </div>
                    )}

                    {/* Incident Details Summary */}
                    <div className="bg-[#090D14] p-4 rounded-lg border border-[#1e293b] text-xs space-y-2 mb-6">
                        <div className="flex justify-between py-1 border-b border-[#151D2A]">
                            <span className="text-gray-400">Current Status</span>
                            <span className="px-2 py-0.5 rounded font-bold uppercase bg-[#2563EB]/20 text-blue-300 border border-[#2563EB]/30">
                                {activeIncident.status}
                            </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-[#151D2A]">
                            <span className="text-gray-400">Reported Issue</span>
                            <span className="text-white font-semibold">{activeIncident.issue_type}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-[#151D2A]">
                            <span className="text-gray-400">Live GPS Coordinates</span>
                            <span className="text-white font-mono text-right max-w-xs truncate">{activeIncident.location}</span>
                        </div>
                        {activeIncident.vehicle && (
                            <div className="flex justify-between py-1">
                                <span className="text-gray-400">Vehicle</span>
                                <span className="text-white">{activeIncident.vehicle.year} {activeIncident.vehicle.make} {activeIncident.vehicle.model} ({activeIncident.vehicle.registration})</span>
                            </div>
                        )}
                        {activeIncident.notes && (
                            <div className="flex justify-between py-1 border-t border-[#151D2A]">
                                <span className="text-gray-400">Notes</span>
                                <span className="text-gray-300">{activeIncident.notes}</span>
                            </div>
                        )}
                    </div>

                    {/* Action Controls */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        {activeIncident.status !== "resolved" && activeIncident.status !== "cancelled" && (
                            <button
                                onClick={handleCancelIncident}
                                disabled={cancelling}
                                className="border border-[#1e293b] hover:border-red-500 text-gray-400 hover:text-red-400 text-xs font-bold py-2.5 px-4 rounded-lg transition-colors flex-1"
                            >
                                {cancelling ? "Cancelling..." : "Cancel Emergency Request"}
                            </button>
                        )}
                        <button
                            onClick={() => { setActiveIncident(null); setLocation(""); setNotes(""); }}
                            className="bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold py-2.5 px-4 rounded-lg transition-colors flex-1"
                        >
                            Log New Emergency Alert
                        </button>
                    </div>
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
                                    className="w-full bg-[#090D14] border border-[#1e293b] text-white p-2.5 rounded-lg text-xs outline-none focus:border-[#2563EB]"
                                >
                                    {vehicles.map((v) => (
                                        <option key={v.id} value={v.id}>
                                            {v.year} {v.make} {v.model} ({v.registration})
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <p className="text-xs text-gray-400 p-2.5 bg-[#090D14] rounded-lg border border-[#1e293b]">
                                    {user ? "No registered vehicles found in your garage (will submit as unregistered)." : "Log in to link your registered garage vehicle."}
                                </p>
                            )}
                        </div>

                        {/* 2. SELECT EMERGENCY ISSUE */}
                        <div>
                            <label className="block text-xs font-medium text-gray-300 mb-2">
                                Emergency Breakdown Issue <span className="text-red-400">*</span>
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {ISSUE_OPTIONS.map((opt) => {
                                    const isSelected = issueType === opt.id;
                                    return (
                                        <button
                                            type="button"
                                            key={opt.id}
                                            onClick={() => setIssueType(opt.id)}
                                            className={`p-3 rounded-lg border text-left transition-all ${
                                                isSelected
                                                    ? "bg-[#2563EB]/15 border-[#2563EB] text-white"
                                                    : "bg-[#090D14] border-[#1e293b] hover:border-gray-600 text-gray-300"
                                            }`}
                                        >
                                            <p className="text-xs font-bold text-white">{opt.label}</p>
                                            <p className="text-[11px] text-gray-400 mt-0.5">{opt.desc}</p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 3. LOCATION & GPS */}
                        <div>
                            <div className="flex justify-between items-center mb-1.5">
                                <label className="text-xs font-medium text-gray-300">
                                    Current Location / GPS Coordinates <span className="text-red-400">*</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={handleGetLocation}
                                    disabled={locating}
                                    className="text-xs font-bold text-[#2563EB] hover:underline inline-flex items-center gap-1"
                                >
                                    <span>📍</span> {locating ? "Detecting GPS..." : "Detect GPS Location"}
                                </button>
                            </div>
                            <input
                                type="text"
                                placeholder="e.g. GPS: 31.5204, 74.3587 or Main Boulevard, near Shell Pump"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                className="w-full bg-[#090D14] border border-[#1e293b] text-white p-2.5 rounded-lg text-xs outline-none focus:border-[#2563EB]"
                                required
                            />
                        </div>

                        {/* 4. NOTES */}
                        <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1.5">
                                Landmark or Breakdown Details (Optional)
                            </label>
                            <textarea
                                placeholder="e.g. Car is parked on the shoulder with hazard lights on. Left front tyre damaged."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={3}
                                className="w-full bg-[#090D14] border border-[#1e293b] text-white p-2.5 rounded-lg text-xs outline-none focus:border-[#2563EB]"
                            />
                        </div>

                        {/* SUBMIT BUTTON */}
                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider py-3.5 rounded-lg transition-colors shadow-lg shadow-red-950/50 flex items-center justify-center gap-2"
                        >
                            <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
                            {submitting ? "Dispatching Rapid Alert..." : "Dispatch Immediate Emergency Assistance"}
                        </button>
                    </form>
                </div>
            )}
        </main>
    );
}
