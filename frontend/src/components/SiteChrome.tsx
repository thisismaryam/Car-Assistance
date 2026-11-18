"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ChatWidget from "./ChatWidget";

export default function SiteChrome({ children }: { children: React.ReactNode }) {
    const isAdminRoute = usePathname()?.startsWith("/admin");

    return (
        <>
            {!isAdminRoute && (
                <nav className="site-nav">
                    <div className="site-nav-inner">
                        <Link href="/" className="site-brand">
                            <span className="brand-mark">CA</span>
                            <span>CAR ASSISTANCE</span>
                        </Link>

                        <div className="site-nav-links">
                            <Link href="/services">Services</Link>
                            <Link href="/emergency">Roadside support</Link>
                            <Link href="/dashboard/bookings">My bookings</Link>
                        </div>

                        <div className="site-nav-actions">
                            <Link href="/login" className="site-nav-login hidden sm:inline-flex">
                                Staff sign in
                            </Link>
                            <Link href="/dashboard" className="site-nav-cta">
                                Book a service
                            </Link>
                        </div>
                    </div>
                </nav>
            )}

            <div className="grow">
                {children}
            </div>

            {!isAdminRoute && (
                <footer className="site-footer">
                    <div className="site-footer-inner">
                        <Link href="/" className="site-brand">
                            <span className="brand-mark">CA</span>
                            <span>CAR ASSISTANCE</span>
                        </Link>
                        <p>Professional care for every mile. © 2026 Car Assistance.</p>
                        <div className="flex gap-5">
                            <Link href="/services" className="hover:text-white">Services</Link>
                            <Link href="/emergency" className="hover:text-white">Roadside help</Link>
                        </div>
                    </div>
                </footer>
            )}

            {!isAdminRoute && <ChatWidget />}
        </>
    );
}
