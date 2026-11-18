"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Service {
    id: number;
    name: string;
    description: string;
    service_type: string;
    base_price: number;
    duration_minutes?: number;
}

export default function ServicesPage() {
    const [services, setServices] = useState<Service[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        fetch("http://localhost:8000/services")
            .then((res) => {
                if (!res.ok) throw new Error("Services are temporarily unavailable.");
                return res.json();
            })
            .then((data: Service[]) => setServices(Array.isArray(data) ? data : []))
            .catch(() => setError("Services are temporarily unavailable. Please try again in a moment."))
            .finally(() => setLoading(false));
    }, []);

    return (
        <main className="mx-auto w-full max-w-7xl px-6 py-14 md:px-12 md:py-20">
            <header className="mb-12 max-w-3xl border-b border-[#1e293b] pb-9 md:mb-16">
                <p className="eyebrow">Our capabilities</p>
                <h1 className="mt-5 font-serif text-4xl font-normal tracking-tight text-white md:text-6xl">
                    Expert care for the road ahead.
                </h1>
                <p className="mt-5 max-w-xl text-sm leading-7 text-gray-400">
                    From routine maintenance to the unexpected, find thoughtful automotive
                    support designed around your day.
                </p>
            </header>

            {loading ? (
                <p className="py-12 text-sm text-gray-400" role="status">Loading available services…</p>
            ) : error ? (
                <div className="border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300" role="alert">
                    {error}
                </div>
            ) : services.length === 0 ? (
                <div className="border border-[#1e293b] bg-[#151D2A] p-8 text-sm text-gray-400">
                    No services are available right now. Please check back soon.
                </div>
            ) : (
                <div className="grid gap-px border border-[#1e293b] bg-[#1e293b] sm:grid-cols-2 xl:grid-cols-3">
                    {services.map((service, index) => (
                        <article key={service.id} className="flex min-h-64 flex-col justify-between bg-[#101827] p-6 md:p-8">
                            <div>
                                <div className="mb-9 flex items-center justify-between">
                                    <span className="text-[10px] tracking-[0.16em] text-gray-500">
                                        {String(index + 1).padStart(2, "0")} / {service.service_type}
                                    </span>
                                    {service.duration_minutes && (
                                        <span className="text-[10px] text-gray-500">{service.duration_minutes} min</span>
                                    )}
                                </div>
                                <h2 className="font-serif text-2xl font-normal text-white">{service.name}</h2>
                                <p className="mt-3 text-xs leading-6 text-gray-400">{service.description}</p>
                            </div>
                            <div className="mt-8 flex items-end justify-between border-t border-[#1e293b] pt-5">
                                <div>
                                    <p className="text-[9px] uppercase tracking-[0.15em] text-gray-500">Starting from</p>
                                    <p className="mt-1 text-sm font-semibold text-[#8DA6B8]">Rs. {service.base_price}</p>
                                </div>
                                <Link
                                    href={service.service_type === "home" ? "/dashboard/home-service" : "/dashboard"}
                                    className="text-[10px] font-bold uppercase tracking-widest[0.1em] text-white hover:text-[#8DA6B8]"
                                >
                                    Book service ↗
                                </Link>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </main>
    );
}
