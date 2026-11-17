import Link from "next/link";

export default function Home() {
    return (
        <div className="flex flex-col w-full">

            {/* Hero Section - Compact */}
            <section className="relative pt-24 pb-20 px-6 max-w-6xl mx-auto w-full flex flex-col items-center text-center">
                {/* Subtle Navy Glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-150px h-75 bg-[#101827] rounded-full blur-[100px] opacity-70 -z-10 pointer-events-none" />

                <p className="text-[#2563EB] font-semibold tracking-wide text-xs uppercase mb-4">
                    Precision Auto Repair & Roadside
                </p>
                <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-6 max-w-2xl leading-tight">
                    Your Car. Our Priority. <br />
                    <span className="text-gray-400">Wherever You Need Us.</span>
                </h1>
                <p className="text-gray-400 max-w-xl mb-8">
                    Professional automotive care at our workshop, at your doorstep, or wherever the road leaves you stranded.
                </p>
                <div className="flex gap-4">
                    <Link href="/dashboard" className="bg-[#2563EB] hover:bg-blue-700 text-white px-6 py-3 rounded-md font-bold text-sm transition-all">
                        Book a Service →
                    </Link>
                    <Link href="/emergency" className="bg-[#101827] border border-[#222733] hover:border-gray-500 text-white px-6 py-3 rounded-md font-bold text-sm transition-all">
                        Emergency Help
                    </Link>
                </div>
            </section>

            {/* Three Core Services */}
            <section className="max-w-6xl mx-auto px-6 py-16 w-full">
                <h2 className="text-2xl font-bold mb-8 text-white border-l-4 border-[#2563EB] pl-4">How Can We Help You?</h2>

                <div className="grid md:grid-cols-3 gap-6">
                    {/* Workshop */}
                    <div className="bg-[#101827] border border-[#1e293b] p-6 rounded-xl hover:border-[#2563EB] transition-all">
                        <h3 className="text-lg font-bold text-white mb-2">01 — Workshop</h3>
                        <p className="text-gray-400 text-sm mb-6">Engine repair, oil changes, brakes, and routine maintenance at our facility.</p>
                        <Link href="/dashboard" className="text-[#2563EB] text-sm font-bold hover:underline">Book Appointment →</Link>
                    </div>

                    {/* Home Service */}
                    <div className="bg-[#101827] border border-[#1e293b] p-6 rounded-xl hover:border-[#2563EB] transition-all">
                        <h3 className="text-lg font-bold text-white mb-2">02 — Home Service</h3>
                        <p className="text-gray-400 text-sm mb-6">Mobile mechanic visits, battery replacement, and minor repairs at your home.</p>
                        <Link href="/dashboard" className="text-[#2563EB] text-sm font-bold hover:underline">Book Home Visit →</Link>
                    </div>

                    {/* Roadside */}
                    <div className="bg-[#101827] border border-[#1e293b] p-6 rounded-xl hover:border-[#2563EB] transition-all">
                        <h3 className="text-lg font-bold text-white mb-2">03 — Roadside</h3>
                        <p className="text-gray-400 text-sm mb-6">Towing, jump-starts, flat tyres, fuel assistance, and emergency repairs.</p>
                        <Link href="/emergency" className="text-[#2563EB] text-sm font-bold hover:underline">Get Help Now →</Link>
                    </div>
                </div>
            </section>
        </div>
    );
}