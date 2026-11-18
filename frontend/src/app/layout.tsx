import { Inter } from "next/font/google";
import { Suspense } from "react";
import SiteChrome from "../components/SiteChrome";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={`${inter.className} min-h-screen flex flex-col`}>
                <Suspense fallback={<div className="grow" />}>
                    <SiteChrome>{children}</SiteChrome>
                </Suspense>
            </body>
        </html>
    );
}
