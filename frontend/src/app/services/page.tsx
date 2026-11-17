"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ServicesPage() {
    const [services, setServices] = useState([]);

    useEffect(() => {
        fetch("http://localhost:8000/services")
            .then((res) => res.json())
            .then((data) => setServices(data));
    }, []);

    return (
        <main className="max-w-6xl mx-auto px-6 py-16 w-full">
            <h1 className="text-3xl font-bold mb-2 text-white">Our Services</h1>
            <p className="text-gray-400 mb-10">Select from our range of professional automotive services.</p>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {services.map((s: any) => (
                    <div key={s.id} className="bg-[#151D2A] border border-[#1e293b] p-6 rounded-xl hover:border-[#2563EB] transition-all flex flex-col justify-between">
                        <div>
                            <h3 className="text-lg font-bold mb-2 text-white">{s.name}</h3>
                            <p className="text-gray-400 text-sm mb-6">{s.description}</p>
                        </div>

                        <div className="flex justify-between items-center mt-4 border-t border-[#1e293b] pt-4">
                            <span className="text-[#2563EB] font-bold">{s.base_price} PKR</span>
                            <Link href="/dashboard" className="text-xs font-bold bg-[#2563EB] text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors">
                                Book Now
                            </Link>
                        </div>
                    </div>
                ))}
            </div>
        </main>
    );
}