"""
Official Approved Documentation for Car Assistance.
All knowledge-based queries to the AI Assistant must be strictly grounded in this documentation.
"""

APPROVED_DOCUMENTS = [
    {
        "id": "workshop_policies",
        "title": "Workshop Facility & Bay Operating Guidelines",
        "category": "workshop",
        "content": (
            "Car Assistance operates a state-of-the-art central workshop facility located at 100 Auto Care Way. "
            "Our workshop business hours are Monday through Saturday from 09:00 to 18:00 UTC (closed Sundays). "
            "The facility is equipped with 3 dedicated service bays operating concurrently, meaning each hourly time slot "
            "has a strict maximum capacity of 3 vehicles. All workshop appointments require a minimum 2-hour advance preparation lead time "
            "to ensure bays, diagnostic tools, and OEM parts are staged. We service all major automotive brands across passenger cars, "
            "SUVs, hatchbacks, and light commercial vehicles. Customers can wait in our lounge with complimentary Wi-Fi or drop off their vehicle."
        ),
    },
    {
        "id": "home_service_policies",
        "title": "Doorstep Home Service Policies & Coverage",
        "category": "home_service",
        "content": (
            "Car Assistance Doorstep Home Service brings certified mobile technicians directly to customer residences or workplaces. "
            "Operating hours are Monday through Saturday from 09:00 to 18:00 UTC. Coverage extends to a 25 km service radius. "
            "Each home service booking requires an accurate physical address and a flat driveway, garage, or legal off-street parking area. "
            "Home capacity is determined entirely by active certified mechanic duty schedules. A mandatory 30-minute travel buffer "
            "is automatically reserved before and after every home service appointment to ensure technicians arrive punctually. "
            "Eligible home services include synthetic oil changes, battery replacements, and multi-wheel tire changes. "
            "Heavy mechanical overhauls and laser wheel alignment must be conducted at the central workshop bay."
        ),
    },
    {
        "id": "roadside_assistance_policies",
        "title": "Emergency Roadside Assistance & Dispatch Protocol",
        "category": "roadside",
        "content": (
            "Roadside assistance operates 24 hours a day, 7 days a week, 365 days a year across all regional roadways. "
            "Average response dispatch time is 25 minutes. Core emergency services include 24/7 Flatbed Towing (Rs. 69.99, covering up to 30 km) "
            "and Rapid Jump-Start & Emergency Fuel Delivery (Rs. 29.99, including up to 5 liters of fuel). Flat tyre mounting, lockout assistance, "
            "and overheating diagnosis are also provided. Emergency requests must be submitted directly through the /emergency portal with live GPS coordinates, "
            "or phoned in to our priority dispatch switchboard at +92 300 0000000. All dispatch incidents are assigned unique tracking IDs (#CA-EMERG-{id}) "
            "with real-time mechanic assignment and live progress streaming."
        ),
    },
    {
        "id": "booking_rules_and_limits",
        "title": "Customer Booking Rules, Limits & Vehicle Validation",
        "category": "booking_rules",
        "content": (
            "Customers may schedule appointments through their dashboard or conversational AI assistant under strict validation rules: "
            "1. Authentication: Customers must have an authenticated account to schedule appointments and access their garage. "
            "2. Vehicle Ownership: Appointments can only be booked for vehicles registered to the authenticated customer's garage. Unregistered vehicles cannot be booked. "
            "3. Conflict Prevention: A vehicle cannot have two overlapping bookings scheduled during the same time window. "
            "4. Daily Limit: A customer is permitted a maximum of 5 active bookings per calendar day across all services. "
            "5. Capacity Allocation: Both pending and confirmed bookings hold reservation capacity. When a booking is cancelled, capacity is instantly restored in real-time. "
            "6. Explicit Confirmation: The AI assistant will never execute a booking until presenting an itemized summary (vehicle, service, price, scheduled time, location) "
            "and receiving explicit affirmative confirmation from the customer."
        ),
    },
    {
        "id": "cancellation_and_warranty",
        "title": "Cancellation Policy, Invoicing & Service Guarantee",
        "category": "billing_and_warranty",
        "content": (
            "Customers can cancel any pending or confirmed booking at any time with zero penalty through their customer dashboard or AI assistant. "
            "Upon cancellation, the reserved bay or mechanic schedule is released back to the general availability pool immediately. "
            "All repairs and parts supplied by Car Assistance include a 12-month or 15,000 km warranty. Transparent pricing is guaranteed: "
            "customers only pay the stated service price with no hidden workshop or convenience surcharges."
        ),
    },
]
