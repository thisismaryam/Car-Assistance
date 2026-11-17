export default function EmergencyPage() {
    return (
        <main className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
            <h1 className="text-5xl font-extrabold text-white mb-6">
                NEED HELP <span className="text-[#2E64FE]">RIGHT NOW?</span>
            </h1>
            <p className="text-xl text-[#9CA3AF] mb-10 max-w-2xl">
                Our emergency dispatch team is ready 24/7. Call us immediately for roadside assistance.
            </p>
            <a
                href="tel:+923000000000"
                className="bg-[#2E64FE] hover:bg-[#1D4ED8] text-white text-xl font-bold px-10 py-5 rounded-xl shadow-[0_0_20px_rgba(46,100,254,0.4)] transition-all flex items-center gap-3"
            >
                <span>📞</span> CALL DISPATCH NOW
            </a>
        </main>
    );
}