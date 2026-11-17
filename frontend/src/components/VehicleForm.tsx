"use client";
import { useState } from "react";

export default function VehicleForm({ onVehicleAdded }: { onVehicleAdded: () => void }) {
    const [make, setMake] = useState("");
    const [model, setModel] = useState("");
    const [year, setYear] = useState("");
    const [registration, setRegistration] = useState("");
    const [loading, setLoading] = useState(false);

    // A small sample list. In a real app, this would be an API call to a massive car database.
    const carMakes = ["Toyota", "Honda", "Ford", "Suzuki", "Kia", "Hyundai", "Nissan", "BMW", "Mercedes"];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const token = localStorage.getItem("token");

        try {
            const res = await fetch("http://localhost:8000/vehicles", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ make, model, year: parseInt(year), registration }),
            });

            if (res.ok) {
                onVehicleAdded(); // Refresh the parent page
                setMake(""); setModel(""); setYear(""); setRegistration("");
            } else {
                alert("Failed to add vehicle.");
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="bg-[#14171F] p-4 rounded-lg border border-[#222733] mb-6 flex flex-col gap-3">
            <h3 className="text-white font-bold text-sm">Add a New Vehicle</h3>
            <div className="grid grid-cols-2 gap-3">
                <input
                    list="car-makes"
                    placeholder="Make (e.g. Toyota)"
                    value={make} onChange={(e) => setMake(e.target.value)}
                    className="p-2 bg-[#0B0D10] border border-[#222733] rounded text-white text-sm outline-none focus:border-[#2E64FE]"
                    required
                />
                <datalist id="car-makes">
                    {carMakes.map((m) => <option key={m} value={m} />)}
                </datalist>

                <input
                    placeholder="Model (e.g. Corolla)"
                    value={model} onChange={(e) => setModel(e.target.value)}
                    className="p-2 bg-[#0B0D10] border border-[#222733] rounded text-white text-sm outline-none focus:border-[#2E64FE]"
                    required
                />
                <input
                    type="number"
                    placeholder="Year"
                    value={year} onChange={(e) => setYear(e.target.value)}
                    className="p-2 bg-[#0B0D10] border border-[#222733] rounded text-white text-sm outline-none focus:border-[#2E64FE]"
                    required
                />
                <input
                    placeholder="Registration (ABC-123)"
                    value={registration} onChange={(e) => setRegistration(e.target.value)}
                    className="p-2 bg-[#0B0D10] border border-[#222733] rounded text-white text-sm outline-none focus:border-[#2E64FE]"
                    required
                />
            </div>
            <button type="submit" disabled={loading} className="bg-[#2E64FE] text-white py-2 rounded text-sm font-bold mt-2 hover:bg-[#1D4ED8]">
                {loading ? "Adding..." : "Save Vehicle"}
            </button>
        </form>
    );
}