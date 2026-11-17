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
            router.push("/dashboard");
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <main className="flex min-h-[80vh] flex-col items-center justify-center p-6">
            <div className="w-full max-w-md bg-[#1a1c1e] border border-gray-800 p-8 rounded-xl shadow-2xl">
                <h1 className="text-3xl font-bold mb-2 text-white text-center">Welcome Back</h1>
                <p className="text-gray-400 text-center mb-8">Log in to manage your bookings</p>

                {error && <p className="text-red-500 mb-4 text-center bg-red-500/10 py-2 rounded">{error}</p>}

                <form onSubmit={handleLogin} className="flex flex-col gap-5">
                    <input
                        type="email"
                        placeholder="Email Address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="p-3.5 rounded-md bg-[#17191B] text-white border border-gray-700 focus:outline-none focus:border-[#F07835] transition-colors"
                        required
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="p-3.5 rounded-md bg-[#17191B] text-white border border-gray-700 focus:outline-none focus:border-[#F07835] transition-colors"
                        required
                    />
                    <button
                        type="submit"
                        className="bg-[#F07835] hover:bg-orange-600 text-white font-bold py-3.5 rounded-md mt-2 transition-colors"
                    >
                        Log In
                    </button>
                </form>
                <p className="text-center text-gray-500 mt-6 text-sm">
                    Don't have an account? <span className="text-[#F07835] cursor-pointer hover:underline">Register here</span>
                </p>
            </div>
        </main>
    );
}