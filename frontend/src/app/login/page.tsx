"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
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

            try {
                const meRes = await fetch("http://localhost:8000/auth/me", {
                    headers: { Authorization: `Bearer ${data.access_token}` },
                });
                if (meRes.ok) {
                    const me = await meRes.json();
                    if (me.role === "admin" || me.role === "mechanic") {
                        router.push("/admin");
                        return;
                    }
                }
            } catch { }
            router.push("/admin");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unable to sign in. Please try again.");
        }
    };

    return (
        <main className="auth-shell">
            <div className="auth-card">
                <div className="brand-mark mx-auto mb-7">CA</div>
                <p className="eyebrow justify-center">Operations access</p>
                <h1 className="mt-4 mb-2 text-center font-serif text-3xl font-normal text-white">Welcome back.</h1>
                <p className="mb-8 text-center text-xs leading-6 text-gray-400">
                    Staff access for administrators and mechanics.
                </p>

                {error && <p className="mb-4 border border-red-500/20 bg-red-500/10 py-2.5 text-center text-xs text-red-400" role="alert">{error}</p>}

                <form onSubmit={handleLogin} className="flex flex-col gap-4">
                    <div>
                        <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Staff email</label>
                        <input
                            type="email"
                            placeholder="staff@carassistance.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full border border-[#1e293b] bg-[#090D14] p-3.5 text-sm text-white placeholder:text-gray-600 focus:border-[#8DA6B8] focus:outline-none"
                            required
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Password</label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full border border-[#1e293b] bg-[#090D14] p-3.5 text-sm text-white placeholder:text-gray-600 focus:border-[#8DA6B8] focus:outline-none"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="button-steel mt-3 w-full"
                    >
                        Sign in to operations
                    </button>
                </form>
                <div className="mt-7 border-t border-[#1e293b] pt-5 text-center">
                    <Link href="/" className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 hover:text-white">
                        ← Return to main site
                    </Link>
                </div>
            </div>
        </main>
    );
}