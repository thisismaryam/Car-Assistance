"use client";

import { useEffect, useState } from "react";

export default function AdminServicesPage() {
    const [services, setServices] = useState<any[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [message, setMessage] = useState("");

    // Form state
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [price, setPrice] = useState("");
    const [duration, setDuration] = useState("60");
    const [type, setType] = useState("workshop");

    const fetchServices = () => {
        fetch("http://localhost:8000/services")
            .then(res => res.json())
            .then(data => setServices(data));
    };

    useEffect(() => { fetchServices(); }, []);

    const handleAddService = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage("");
        const token = localStorage.getItem("token");

        try {
            const res = await fetch("http://localhost:8000/services/", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    name,
                    description,
                    service_type: type,
                    base_price: parseFloat(price),
                    duration_minutes: parseInt(duration)
                }),
            });

            if (!res.ok) throw new Error("Failed to add service");

            setShowModal(false);
            setName(""); setDescription(""); setPrice(""); setDuration("60"); setType("workshop");
            fetchServices();
            setMessage("Service added successfully!");
        } catch (err: any) {
            setMessage(`Error: ${err.message}`);
        }
    };

    return (
        <main className="p-6 md:p-12 max-w-5xl mx-auto">
            <div className="flex justify-between items-center mb-8 border-b border-[#151D2A] pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Service Catalogue</h1>
                    <p className="text-sm text-gray-400">Manage the services offered to customers</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="bg-[#2563EB] hover:bg-blue-700 text-white px-5 py-2.5 rounded-md text-sm font-bold transition-all"
                >
                    + Add Service
                </button>
            </div>

            {message && <div className="p-3 mb-6 bg-green-500/10 text-green-500 rounded-md">{message}</div>}

            <div className="bg-[#151D2A] border border-[#1e293b] rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm text-gray-300">
                    <thead className="text-xs uppercase bg-[#090D14] text-gray-400 border-b border-[#1e293b]">
                        <tr>
                            <th className="px-6 py-4">Service Name</th>
                            <th className="px-6 py-4">Type</th>
                            <th className="px-6 py-4">Price (PKR)</th>
                            <th className="px-6 py-4">Duration</th>
                        </tr>
                    </thead>
                    <tbody>
                        {services.map((s: any) => (
                            <tr key={s.id} className="border-b border-[#1e293b] hover:bg-[#1e293b]/30 transition-colors">
                                <td className="px-6 py-4 font-bold text-white">{s.name}</td>
                                <td className="px-6 py-4 capitalize">{s.service_type}</td>
                                <td className="px-6 py-4 text-[#2563EB] font-bold">Rs. {s.base_price}</td>
                                <td className="px-6 py-4">{s.duration_minutes} mins</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Add Service Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-[#151D2A] border border-[#1e293b] rounded-xl p-6 w-full max-w-md shadow-2xl">
                        <h2 className="text-xl font-bold text-white mb-4">Create New Service</h2>
                        <form onSubmit={handleAddService} className="flex flex-col gap-4">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Service Name</label>
                                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Oil Change" className="w-full p-2.5 bg-[#090D14] border border-[#1e293b] rounded-md text-white text-sm" required />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Description</label>
                                <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description" className="w-full p-2.5 bg-[#090D14] border border-[#1e293b] rounded-md text-white text-sm" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Price (PKR)</label>
                                    <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="5000" className="w-full p-2.5 bg-[#090D14] border border-[#1e293b] rounded-md text-white text-sm" required />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Duration (Mins)</label>
                                    <input type="number" value={duration} onChange={e => setDuration(e.target.value)} className="w-full p-2.5 bg-[#090D14] border border-[#1e293b] rounded-md text-white text-sm" required />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Service Type</label>
                                <select value={type} onChange={e => setType(e.target.value)} className="w-full p-2.5 bg-[#090D14] border border-[#1e293b] rounded-md text-white text-sm">
                                    <option value="workshop">Workshop (Customer comes to you)</option>
                                    <option value="home">Home Service (You go to customer)</option>
                                    <option value="roadside">Roadside Emergency</option>
                                </select>
                            </div>
                            <div className="flex gap-3 mt-4">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-md text-sm font-bold border border-[#1e293b] text-gray-400">Cancel</button>
                                <button type="submit" className="flex-1 py-2.5 rounded-md text-sm font-bold bg-[#2563EB] text-white">Save Service</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </main>
    );
}