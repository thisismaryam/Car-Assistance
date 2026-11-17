"use client";
import { useEffect, useState } from "react";

export default function MyVehiclesPage() {
    const [vehicles, setVehicles] = useState([]);

    useEffect(() => {
        const token = localStorage.getItem("token");
        fetch("http://localhost:8000/vehicles/my-vehicles", {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => setVehicles(data));
    }, []);

    return (
        <main className="p-6 md:p-12 max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold text-white mb-6">My Garage</h1>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {vehicles.map((v: any) => (
                    <div key={v.id} className="bg-[#151D2A] border border-[#1e293b] p-6 rounded-xl">
                        <h3 className="text-lg font-bold text-white">{v.year} {v.make} {v.model}</h3>
                        <p className="text-gray-400 font-mono text-sm mt-1">{v.registration}</p>
                    </div>
                ))}
            </div>
        </main>
    );
}