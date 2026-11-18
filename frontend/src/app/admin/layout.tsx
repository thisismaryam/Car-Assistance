"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) {
            router.push("/login");
            return;
        }

        fetch("http://localhost:8000/auth/me", { headers: { Authorization: `Bearer ${token}` } })
            .then(res => res.json())
            .then(data => {
                if (data.role !== "admin") {
                    router.push("/dashboard"); // Kick non-admins out
                } else {
                    setIsAdmin(true);
                }
            })
            .catch(() => router.push("/login"));
    }, [router]);

    if (!isAdmin) return <div className="p-20 text-center text-gray-500">Verifying Admin Access...</div>;

    const links = [
        { name: "Overview", href: "/admin" },
        { name: "Bookings", href: "/admin/bookings" },
        { name: "Mechanics", href: "/admin/mechanics" },
        { name: "Services", href: "/admin/services" },
        { name: "Roadside Alerts", href: "/admin/roadside" },
    ];

    return (
        <div className="flex min-h-[calc(100vh-64px)]">
            {/* Admin Sidebar */}
            <aside className="w-64 border-r border-[#151D2A] bg-[#090D14] p-6 hidden md:block">
                <div className="flex items-center gap-2 mb-8">
                    <span className="bg-red-500/20 text-red-500 text-xs font-bold px-2 py-1 rounded">ADMIN</span>
                    <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Operations</h2>
                </div>

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
                    <button
                        onClick={() => { localStorage.removeItem("token"); router.push("/"); }}
                        className="mt-8 text-left px-4 py-2.5 text-sm font-medium text-red-400 hover:text-red-300 transition-colors"
                    >
                        Logout
                    </button>
                </nav>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 bg-[#090D14]">
                {children}
            </div>
        </div>
    );
}