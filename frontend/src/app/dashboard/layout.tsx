"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    const links = [
        { name: "Workshop Service", href: "/dashboard" },
        { name: "Home Service", href: "/dashboard/home-service" },
        { name: "My Garage", href: "/dashboard/vehicles" },
        { name: "My Bookings", href: "/dashboard/bookings" },
    ];

    return (
        <div className="flex min-h-[calc(100vh-64px)]">
            {/* Sidebar */}
            <aside className="w-64 border-r border-[#151D2A] bg-[#090D14] p-6 hidden md:block">
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-6">Customer Portal</h2>
                <nav className="flex flex-col gap-2">
                    {links.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={`px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${pathname === link.href
                                ? "bg-[#2563EB]/10 text-[#2563EB]"
                                : "text-gray-400 hover:text-white hover:bg-[#151D2A]"
                                }`}
                        >
                            {link.name}
                        </Link>
                    ))}
                </nav>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 bg-[#090D14]">
                {children}
            </div>
        </div>
    );
}