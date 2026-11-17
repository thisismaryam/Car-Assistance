import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import ChatWidget from "../components/ChatWidget";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Car Assistance | Workshop & Roadside",
    description: "Professional automotive care and emergency assistance.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={`${inter.className} bg-[#080B12] text-[#DCE5F2] min-h-screen flex flex-col`}>

                {/* Sticky Navbar - Compact & Sleek */}
                <nav className="sticky top-0 z-50 bg-[#080B12]/80 backdrop-blur-md border-b border-[#101827]">
                    <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
                            <div className="w-6 h-6 bg-[#2563EB] rounded flex items-center justify-center">
                                <span className="text-white text-xs font-black">CA</span>
                            </div>
                            CAR ASSISTANCE
                        </Link>

                        <div className="hidden md:flex gap-6 text-sm font-medium text-gray-400">
                            <Link href="/services" className="hover:text-white transition-colors">Services</Link>
                            <Link href="/emergency" className="hover:text-white transition-colors">Roadside</Link>
                            <Link href="/dashboard" className="hover:text-white transition-colors">My Account</Link>
                            <Link href="/admin/bookings" className="hover:text-white transition-colors">Admin</Link>
                        </div>

                        <div className="flex items-center gap-3">
                            <Link href="/login" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Log In</Link>
                            <Link href="/dashboard" className="bg-[#2563EB] hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-bold transition-all">
                                Book Now
                            </Link>
                        </div>
                    </div>
                </nav>

                <main className="grow">
                    {children}
                </main>

                <footer className="border-t border-[#101827] py-8 text-center text-gray-500 text-sm bg-[#080B12]">
                    <p>© 2026 Car Assistance. All rights reserved.</p>
                </footer>

                {/* Floating AI Assistant Widget */}
                <ChatWidget />
            </body>
        </html>
    );
}