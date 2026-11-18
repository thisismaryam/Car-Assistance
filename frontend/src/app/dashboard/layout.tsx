"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    const links = [
        { name: "Workshop", href: "/dashboard/workshop" },
        { name: "At-home service", href: "/dashboard/home-service" },
        { name: "My bookings", href: "/dashboard/bookings" },
    ];

    return (
        <div className="portal-layout">
            <aside className="portal-sidebar">
                <p className="eyebrow mb-8">Your account</p>
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
            </aside>

            <nav className="portal-mobile-nav" aria-label="Customer navigation">
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

            <div className="portal-main">
                {children}
            </div>
        </div>
    );
}