"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminLoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        const formData = new URLSearchParams();
        formData.append("username", email);
        formData.append("password", password);

        try {
            const res = await fetch("http://localhost:8000/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: formData,
            });

            if (!res.ok) throw new Error("Invalid email or password");

            const data = await res.json();
            localStorage.setItem("token", data.access_token);
            router.push("/admin"); // Go to admin dashboard
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-[#0B0D10]">
            <div className="w-full max-w-sm bg-[#14171F] border border-[#222733] p-8 rounded-xl shadow-2xl relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-[#2E64FE] rounded-t-xl" />

                <h1 className="text-2xl font-bold mb-2 text-white text-center">Admin Portal</h1>
                <p className="text-[#9CA3AF] text-sm text-center mb-8">Staff access only</p>

                {error && <p className="text-red-500 mb-4 text-sm text-center bg-red-500/10 py-2 rounded">{error}</p>}

                <form onSubmit={handleLogin} className="flex flex-col gap-4">
                    <input type="email" placeholder="Admin Email" value={email} onChange={(e) => setEmail(e.target.value)} className="p-3 text-sm rounded-md bg-[#0B0D10] text-white border border-[#222733] focus:border-[#2E64FE] outline-none" required />
                    <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="p-3 text-sm rounded-md bg-[#0B0D10] text-white border border-[#222733] focus:border-[#2E64FE] outline-none" required />
                    <button type="submit" className="bg-[#2E64FE] hover:bg-[#1D4ED8] text-white font-bold py-3 rounded-md mt-2 text-sm transition-colors">
                        Authenticate
                    </button>
                </form>

                <p className="text-center text-[#9CA3AF] mt-6 text-xs">
                    <Link href="/login" className="hover:text-white transition-colors">Return to Customer Login</Link>
                </p>
            </div>
        </main>
    );
}