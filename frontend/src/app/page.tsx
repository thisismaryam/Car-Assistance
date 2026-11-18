import Link from "next/link";

const services = [
    {
        number: "01 / IN THE WORKSHOP",
        title: "Precision, in person.",
        description: "Scheduled maintenance and expert repairs, carried out by technicians who know your vehicle.",
        link: "Book a workshop visit",
        href: "/dashboard",
    },
    {
        number: "02 / AT YOUR DOOR",
        title: "Care that comes to you.",
        description: "A qualified mobile mechanic, equipped for routine servicing and everyday repairs at your location.",
        link: "Arrange a home visit",
        href: "/dashboard/home-service",
    },
    {
        number: "03 / WHEN IT MATTERS",
        title: "Help along the way.",
        description: "Roadside support for breakdowns, flat tyres, battery issues, and the unexpected.",
        link: "Request roadside help",
        href: "/emergency",
    },
];

export default function Home() {
    return (
        <div>
            <section className="home-hero">
                <div className="home-hero-content">
                    <p className="home-eyebrow">Automotive care, without compromise</p>
                    <h1 className="home-title">
                        Confidence for
                        <br />
                        every <em>journey.</em>
                    </h1>
                    <p className="home-description">
                        Thoughtful vehicle care, delivered by trusted professionals —
                        at our workshop, at your door, or wherever the road takes you.
                    </p>
                    <div className="home-actions">
                        <Link href="/dashboard" className="button-steel">
                            Book a service <span aria-hidden="true">&nbsp;↗</span>
                        </Link>
                        <Link href="/emergency" className="button-outline">
                            Roadside assistance
                        </Link>
                    </div>
                </div>
                <p className="home-caption">Precision care. Considered service. Every mile.</p>
            </section>

            <section className="home-services" aria-labelledby="service-options">
                <div className="home-section-heading">
                    <div>
                        <p className="eyebrow">The right care, in the right place</p>
                        <h2 id="service-options" className="home-section-title">
                            Service, made personal.
                        </h2>
                    </div>
                    <p className="home-section-note">
                        Choose the support that fits your day. Our team brings the same
                        attention to detail to every appointment.
                    </p>
                </div>
                <div className="home-service-grid">
                    {services.map((service) => (
                        <article key={service.number} className="home-service-card">
                            <p className="home-service-number">{service.number}</p>
                            <h3 className="home-service-title">{service.title}</h3>
                            <p className="home-service-copy">{service.description}</p>
                            <Link href={service.href} className="home-service-link">
                                {service.link} <span aria-hidden="true">↗</span>
                            </Link>
                        </article>
                    ))}
                </div>
            </section>
        </div>
    );
}
