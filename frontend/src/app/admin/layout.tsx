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
        { name: "Roadside", href: "/admin/roadside" },
    ];

    return (
        <div className="portal-layout">
            <aside className="portal-sidebar">
                <div className="mb-8">
                    <span className="eyebrow">Operations desk</span>
                </div>
                <nav className="portal-nav">
                    {links.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={`portal-nav-link ${pathname === link.href ? "portal-nav-link-active" : ""}`}
                        >
                            {link.name}
                        </Link>
                    ))}
                </nav>
                <button
                    onClick={() => { localStorage.removeItem("token"); router.push("/"); }}
                    className="mt-8 w-full border-t border-[#1e293b] pt-5 text-left text-xs text-gray-400 transition-colors hover:text-white"
                >
                    Sign out
                </button>
            </aside>

            <nav className="portal-mobile-nav" aria-label="Operations navigation">
                {links.map((link) => (
                    <Link
                        key={link.href}
                        href={link.href}
                        className={`portal-nav-link ${pathname === link.href ? "portal-nav-link-active" : ""}`}
                    >
                        {link.name}
                    </Link>
                ))}
                <button
                    onClick={() => { localStorage.removeItem("token"); router.push("/"); }}
                    className="portal-nav-link"
                >
                    Sign out
                </button>
            </nav>

            <div className="portal-main">
                {children}
            </div>
        </div>
    );
}