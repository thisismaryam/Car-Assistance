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
        <main className="max-w-7xl mx-auto px-6 py-20 w-full">
            <h1 className="text-4xl font-bold mb-4">Our Services</h1>
            <p className="text-gray-400 mb-12 max-w-2xl">Select from our range of professional automotive services.</p>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {services.map((s: any) => (
                    <div key={s.id} className="border border-gray-800 bg-[#1a1c1e] p-6 rounded-xl hover:border-[#F07835] transition-all">
                        <h3 className="text-xl font-bold mb-2">{s.name}</h3>
                        <p className="text-gray-400 mb-6 h-12">{s.description}</p>
                        <div className="flex justify-between items-center mt-4 border-t border-gray-800 pt-4">
                            <span className="text-[#F07835] font-bold">{s.base_price} PKR</span>
                            <Link href="/dashboard" className="text-sm font-bold bg-[#F07835]/10 text-[#F07835] px-4 py-2 rounded hover:bg-[#F07835] hover:text-white transition-colors">
                                Book Now
                            </Link>
                        </div>
                    </div>
                ))}
            </div>
        </main>
    );
}