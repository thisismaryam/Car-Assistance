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
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unable to sign in. Please try again.");
        }
    };

    return (
        <main className="auth-shell">
            <div className="auth-card">
                <div className="brand-mark mx-auto mb-7">CA</div>
                <p className="eyebrow justify-center">Restricted access</p>
                <h1 className="mt-4 mb-2 text-center font-serif text-3xl font-normal text-white">Operations portal.</h1>
                <p className="mb-8 text-center text-xs leading-6 text-gray-400">Sign in to manage service operations.</p>

                {error && <p className="mb-4 border border-red-500/30 bg-red-500/10 py-2 text-center text-sm text-red-400" role="alert">{error}</p>}

                <form onSubmit={handleLogin} className="flex flex-col gap-4">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                        Admin email
                        <input
                            type="email"
                            placeholder="admin@carassistance.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="mt-2 w-full border border-[#222733] bg-[#0B0D10] p-3.5 text-sm text-white placeholder:text-gray-600 outline-none focus:border-[#8DA6B8]"
                            required
                        />
                    </label>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                        Password
                        <input
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="mt-2 w-full border border-[#222733] bg-[#0B0D10] p-3.5 text-sm text-white placeholder:text-gray-600 outline-none focus:border-[#8DA6B8]"
                            required
                        />
                    </label>
                    <button type="submit" className="button-steel mt-3 w-full">
                        Sign in to operations
                    </button>
                </form>

                <div className="mt-7 border-t border-[#1e293b] pt-5 text-center">
                    <Link href="/login" className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 hover:text-white">
                        Return to staff sign in
                    </Link>
                </div>
            </div>
        </main>
    );
}