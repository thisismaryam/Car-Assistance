import json
import logging
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, date as py_date, timedelta, timezone
from typing import Any
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from app.core.config import settings
from app.models.booking import Booking
from app.models.user import User
from app.models.vehicle import Vehicle
from app.services.ai.rag import rag_retriever
from app.services.ai.tools import (
    get_live_services_tool,
    check_live_availability_tool,
    get_user_garage_tool,
    validate_booking_intent_tool,
    execute_confirmed_booking_core,
)

logger = logging.getLogger(__name__)

# Model configuration
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "openai/gpt-oss-120b"

# Expert automotive system prompt
SYSTEM_PROMPT = """You are an expert automotive assistant for the Car Assistance platform.

Operational Rules:
1. Act as an expert automotive technician and diagnostic specialist.
2. Recommend specific services offered by Car Assistance based on the user's problem:
   - "car won't start" / dead battery -> Recommend "Jump-Start" (Roadside) or "Home Battery Replacement" (Home Service).
   - flat tyre / puncture -> Recommend "Flat Tyre Assistance" (Roadside) or "Tyre Fitting".
   - engine overheating / steam / smoke -> Advise pulling over safely immediately and recommend "Emergency Towing" (Roadside) or "Engine Diagnostics" (Workshop).
   - squeaking or grinding brakes -> Recommend "Brake Inspection & Pad Replacement" (Workshop).
   - routine servicing / oil -> Recommend "Full Synthetic Oil Change" (Workshop/Home) or "Standard Vehicle Service".
3. Quote all prices in Pakistani Rupees (PKR / Rs.).
4. Keep answers concise, practical, and strictly under 3 sentences.
5. Never use generic greetings like "Hello, how can I help?" if the user asks a direct question. Address their problem immediately.
6. If the user wants to book an appointment, let them know they can schedule directly via the dashboard or tell you their vehicle and desired date."""

# Intent classification keywords for booking flow and fallback
BOOKING_TRIGGER_WORDS = [
    "book", "reserve", "schedule", "appointment", "fix my car", "set up a visit", "confirm booking", "yes, please book"
]
BOOKING_REJECTION_RESPONSES = {
    "no", "no thanks", "no thank you", "cancel", "cancel it", "cancel this",
    "cancel booking", "cancel the booking", "stop", "not now", "do not proceed",
    "dont proceed", "no cancel",
}
BOOKING_CONFIRMATION_RESPONSES = {
    "yes", "yes please", "yes please confirm", "yes confirm", "confirm",
    "yes please book it", "confirm booking", "i confirm", "confirmed",
    "proceed", "go ahead", "do it", "sure",
}
BOOKING_PROPOSAL_MARKER = "would you like me to confirm and execute this booking now"
BOOKING_DETAILS_MARKER = "to continue this booking, please provide"
PRICING_TRIGGER_WORDS = ["price", "cost", "how much", "rate", "fee", "rates", "pricing", "services list", "what services"]
# "Tell me about the appointment I made" is a LOOKUP of an existing booking, not a new booking.
CREATE_BOOKING_VERB = re.compile(r"\b(book|reserve|schedule)\b", re.I)
LOOKUP_PATTERNS = [
    re.compile(r"\b(my|our)\b.{0,40}\b(appointment|booking|reservation)s?\b", re.I),
    re.compile(r"\b(appointment|booking|reservation)s?\b.{0,30}\b(i|we)\s+(made|booked|have|did)\b", re.I),
    re.compile(r"\b(status|details?|check|find|look\s*up|show)\b.{0,30}\b(appointment|booking|reservation)s?\b", re.I),
    re.compile(r"\bbooking\s*#?\d+\b", re.I),
]
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"\+?\d[\d\s\-()]{5,}\d")
LOOKUP_ASK_MARKER = "email address and the phone number"
MAX_LOOKUP_FAILURES = 5          # per email, per window
LOOKUP_WINDOW_SECONDS = 15 * 60
_lookup_failures: dict[str, list[float]] = {}


def _phone_key(phone: str | None) -> str:
    """Digits only, last 10 - same rule as POST /bookings/lookup."""
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    return digits[-10:]


AVAILABILITY_TRIGGER_WORDS = ["available", "availability", "slots", "open slots", "can i come", "time slot", "bay open"]


class AIAssistantOrchestrator:
    """
    FEATURE 5: AI Assistant with Real Groq LLM and Backend Tools.
    - Primary: Real-time LLM inference via Groq API (openai/gpt-oss-120b) with expert automotive system prompt.
    - Booking Operations: Validates authentication, ownership, capacity, and explicit confirmation before DB execution.
    - Fallback: Deterministic rule-based engine (Grounded RAG and live tools) if Groq is unavailable or key is missing.
    """

    def call_groq_api(self, message: str, history: list[dict[str, str]]) -> str | None:
        """
        Executes a real HTTP request to the Groq Chat Completions API.
        Returns the assistant's reply string, or None if the request fails or key is missing.
        """
        api_key = (settings.GROQ_API_KEY or "").strip()
        if not api_key:
            logger.warning("GROQ_API_KEY is not configured. Falling back to rule-based engine.")
            return None

        # Build message history for the LLM
        messages: list[dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]

        # Include recent history (up to last 6 messages)
        for h in history[-6:]:
            role = h.get("role")
            content = h.get("content", "").strip()
            if role in ["user", "assistant"] and content:
                messages.append({"role": role, "content": content})

        # Add current user message
        messages.append({"role": "user", "content": message.strip()})

        payload = {
            "model": GROQ_MODEL,
            "messages": messages,
            "temperature": 0.4,
            "max_tokens": 250,
        }

        req = urllib.request.Request(
            GROQ_API_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "CarAssistance/1.0",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=12) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                reply = res_data["choices"][0]["message"]["content"].strip()
                return reply
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            logger.error("Groq API HTTP error %d: %s. Using rule-based fallback.", e.code, err_body)
            return None
        except Exception as e:
            logger.error("Groq API connection error: %s. Using rule-based fallback.", e)
            return None

    def classify_intent(self, message: str, history: list[dict[str, str]]) -> str:
        msg = message.lower().strip()

        if history:
            last_assistant_msg = next((m.get("content", "") for m in reversed(history) if m.get("role") == "assistant"), "")
            normalized_msg = re.sub(r"[^\w\s]", " ", msg)
            normalized_msg = " ".join(normalized_msg.split())
            last_assistant_lower = last_assistant_msg.lower()
            has_booking_prompt = (
                BOOKING_PROPOSAL_MARKER in last_assistant_lower
                or BOOKING_DETAILS_MARKER in last_assistant_lower
            )
            if has_booking_prompt:
                is_rejection = normalized_msg in BOOKING_REJECTION_RESPONSES or bool(
                    re.fullmatch(
                        r"(?:no|cancel)(?:\b.*)?",
                        normalized_msg,
                    )
                )
                if is_rejection:
                    return "BOOKING_REJECTION"
            if BOOKING_PROPOSAL_MARKER in last_assistant_lower:
                if normalized_msg in BOOKING_CONFIRMATION_RESPONSES:
                    return "BOOKING_CONFIRMATION"
            if BOOKING_DETAILS_MARKER in last_assistant_lower:
                return "BOOKING_FLOW"

        # Follow-up to "please share your email and phone": the reply carries the email
        if history:
            last_assistant = next((m.get("content", "") for m in reversed(history) if m.get("role") == "assistant"), "")
            if LOOKUP_ASK_MARKER in last_assistant and EMAIL_RE.search(message):
                return "BOOKING_LOOKUP"

        # Asking about an existing booking (unless they clearly want to create one)
        if not CREATE_BOOKING_VERB.search(msg) and any(p.search(msg) for p in LOOKUP_PATTERNS):
            return "BOOKING_LOOKUP"

        # Check booking triggers
        if any(w in msg for w in BOOKING_TRIGGER_WORDS):
            return "BOOKING_FLOW"

        # Check pricing and availability triggers (Direct Backend Tools)
        if any(w in msg for w in AVAILABILITY_TRIGGER_WORDS):
            return "LIVE_AVAILABILITY"

        if any(w in msg for w in PRICING_TRIGGER_WORDS):
            return "LIVE_PRICING"

        # Otherwise knowledge query -> Grounded RAG
        return "GROUNDED_KNOWLEDGE"

    def _execute_rule_based_fallback(
        self,
        intent: str,
        db: Session,
        message: str,
    ) -> dict[str, Any]:
        """Existing deterministic rule-based fallback when Groq API is not available."""
        if intent == "LIVE_PRICING":
            svc_type = None
            msg_lower = message.lower()
            if "home" in msg_lower or "doorstep" in msg_lower:
                svc_type = "home"
            elif "roadside" in msg_lower or "tow" in msg_lower or "emergency" in msg_lower:
                svc_type = "roadside"
            elif "workshop" in msg_lower or "bay" in msg_lower:
                svc_type = "workshop"

            services = get_live_services_tool(db, service_type_str=svc_type)
            if not services:
                return {
                    "branch": "live_backend_tool",
                    "reply": "No active services matched your request. Please check back shortly or visit our Services page.",
                    "booking_id": None,
                    "booking_link": None,
                }

            lines = ["Here are our live active services and official rates directly from our system:"]
            for s in services:
                lines.append(f"• **{s['name']}** ({s['category'].title()}): **Rs. {s['base_price']:.2f}** ({s['duration_minutes']} mins) — {s['description']}")
            lines.append("\nYou can book any of these directly through me or via your Customer Dashboard!")

            return {
                "branch": "live_backend_tool",
                "reply": "\n".join(lines),
                "booking_id": None,
                "booking_link": None,
            }

        elif intent == "LIVE_AVAILABILITY":
            date_match = re.search(r"\b\d{4}-\d{2}-\d{2}\b", message)
            if date_match:
                target_date_str = date_match.group(0)
            elif "tomorrow" in message.lower():
                target_date_str = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
            else:
                target_date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

            service_query = "Oil"
            for s_name in ["Oil", "Brake", "Diagnostics", "AC", "Alignment", "Battery", "Tyre"]:
                if s_name.lower() in message.lower():
                    service_query = s_name
                    break

            avail_data = check_live_availability_tool(db, service_identifier=service_query, target_date_str=target_date_str)
            if "error" in avail_data:
                return {
                    "branch": "live_backend_tool",
                    "reply": f"Could not compute availability: {avail_data['error']}",
                    "booking_id": None,
                    "booking_link": None,
                }

            s_name = avail_data["service_name"]
            avail_count = avail_data["available_slots_count"]
            total_count = avail_data["total_slots"]
            dt_str = avail_data["date"]

            if avail_count == 0:
                reply = (
                    f"For **{s_name}** on **{dt_str}**, all {total_count} slots are currently fully booked or restricted "
                    f"by the 2-hour preparation lead time rule. Would you like to check tomorrow or another upcoming date?"
                )
            else:
                slot_times = [datetime.fromisoformat(s["start_time"]).strftime("%H:%M UTC") for s in avail_data["available_slots"][:5]]
                reply = (
                    f"For **{s_name}** on **{dt_str}**, there are **{avail_count} open slots** available!\n"
                    f"Next available times: **{', '.join(slot_times)}**.\n"
                    f"Would you like me to book one of these slots for your vehicle?"
                )

            return {
                "branch": "live_backend_tool",
                "reply": reply,
                "booking_id": None,
                "booking_link": None,
            }

        # Default knowledge retrieval via RAG
        rag_answer = rag_retriever.answer_knowledge_query(message)
        return {
            "branch": "grounded_rag",
            "reply": rag_answer,
            "booking_id": None,
            "booking_link": None,
        }

    # ------------------------------------------------------------------
    # Look up existing bookings (guests identify with email + phone, like the website)
    # ------------------------------------------------------------------
    def _handle_booking_lookup(self, db: Session, message: str, history: list[dict[str, str]],
                               current_user: User | None) -> dict[str, Any]:
        def reply(text: str) -> dict[str, Any]:
            return {"branch": "booking_lookup", "reply": text, "booking_id": None, "booking_link": None}

        user = current_user
        if user is None:
            # the details may have been given across several messages
            user_texts = [m.get("content", "") for m in history[-6:] if m.get("role") == "user"]
            text = " ".join(user_texts + [message])
            email_m = EMAIL_RE.search(text)
            email = email_m.group(0).lower() if email_m else None
            phone_candidates = [
                _phone_key(m.group(0)) for m in PHONE_RE.finditer(EMAIL_RE.sub(" ", text))
            ]
            phone = next((p for p in phone_candidates if len(p) >= 7), None)

            if not email or not phone:
                return reply(
                    "I can look up your booking. Please share the email address and the phone number "
                    "you used when booking, for example: my email is name@gmail.com and my phone is 0300 1234567."
                )

            now = time.time()
            recent = [t for t in _lookup_failures.get(email, []) if now - t < LOOKUP_WINDOW_SECONDS]
            if len(recent) >= MAX_LOOKUP_FAILURES:
                return reply("Too many unsuccessful attempts. Please wait a few minutes and try again.")

            candidate = db.query(User).filter(func.lower(User.email) == email).first()
            if not candidate or _phone_key(candidate.phone) != phone:
                recent.append(now)
                _lookup_failures[email] = recent
                return reply(
                    "I couldn't find bookings for those details. Please check the email and phone number "
                    "you used when booking."
                )
            _lookup_failures.pop(email, None)
            user = candidate

        bookings = (
            db.query(Booking)
            .options(joinedload(Booking.vehicle), joinedload(Booking.service))
            .filter(Booking.customer_id == user.id)
            .order_by(Booking.scheduled_at.desc())
            .limit(5)
            .all()
        )
        if not bookings:
            return reply("I don't see any bookings under those details yet. You can book from the "
                         "[Workshop](/dashboard/workshop) or [At-home service](/dashboard/home-service) pages.")

        lines = []
        for b in bookings:
            when = b.scheduled_at.strftime("%b %d, %Y %I:%M %p UTC")
            v = f"{b.vehicle.year} {b.vehicle.make} {b.vehicle.model}" if b.vehicle else "vehicle"
            status = b.status.value if hasattr(b.status, "value") else str(b.status)
            lines.append(f"• #{b.id}: {b.service.name} for {v}, {when}, {status}")
        return reply(
            f"Hi {user.full_name}, here are your latest bookings:\n\n" + "\n".join(lines) +
            "\n\nSee full details in [My bookings](/dashboard/bookings)."
        )

    def process_message(
        self,
        db: Session,
        message: str,
        history: list[dict[str, str]],
        current_user: User | None
    ) -> dict[str, Any]:
        intent = self.classify_intent(message, history)

        if intent == "BOOKING_REJECTION":
            return {
                "branch": "conversational_booking",
                "reply": "Understood. I cleared the booking draft; no booking was made.",
                "booking_id": None,
                "booking_link": None,
            }

        if intent == "BOOKING_LOOKUP":
            return self._handle_booking_lookup(db, message, history, current_user)

        # ---------------------------------------------------------
        # 1. CORE BOOKING EXECUTION FLOWS (Preserved to maintain booking capabilities)
        # ---------------------------------------------------------
        if intent in ["BOOKING_CONFIRMATION", "BOOKING_FLOW"]:
            # Customers book as guests (no account), so send them to the booking forms
            # instead of a login. The conversational flow below needs a saved garage,
            # which only logged-in accounts have.
            if not current_user:
                return {
                    "branch": "conversational_booking",
                    "reply": (
                        "You can book without creating an account. Pick the service type and fill in your details:\n\n"
                        "• [Workshop appointment](/dashboard/workshop)\n"
                        "• [At-home service](/dashboard/home-service)\n\n"
                        "You will get a confirmation email, and you can view your booking anytime in "
                        "[My bookings](/dashboard/bookings) with your email and phone number."
                    ),
                    "booking_id": None,
                    "booking_link": None,
                }

            # Check garage vehicles
            user_vehicles = db.query(Vehicle).filter(Vehicle.owner_id == current_user.id).all()
            if not user_vehicles:
                return {
                    "branch": "conversational_booking",
                    "reply": (
                        "You don't have any registered vehicles in your garage. "
                        "Please use the [booking form](/dashboard/workshop) to add your vehicle details while booking."
                    ),
                    "booking_id": None,
                    "booking_link": None,
                }

            all_services = get_live_services_tool(db)
            user_messages = [m.get("content", "") for m in history if m.get("role") == "user"] + [message]
            latest_booking_request = max(
                (i for i, text in enumerate(user_messages)
                 if any(word in text.lower() for word in BOOKING_TRIGGER_WORDS)),
                default=0,
            )
            booking_messages = user_messages[latest_booking_request:]

            matched_services = []
            selected_vehicle = None
            ambiguous_vehicles = False
            requested_date = None
            requested_time = None
            address = None
            for user_text in booking_messages:
                text_lower = user_text.lower()
                exact_service_matches = [
                    service for service in all_services
                    if service["name"].lower() in text_lower
                ]
                service_matches = exact_service_matches or [
                    service for service in all_services
                    if any(
                        token in text_lower
                        for token in service["name"].lower().split()
                        if len(token) > 3 and token not in {"change", "service", "replacement", "assistance"}
                    )
                ]
                if service_matches:
                    matched_services = service_matches

                vehicle_matches = [
                    vehicle for vehicle in user_vehicles
                    if vehicle.registration.lower() in text_lower
                    or (
                        vehicle.make.lower() in text_lower
                        and vehicle.model.lower() in text_lower
                    )
                    or (
                        vehicle.model.lower() in text_lower
                        and sum(v.model.lower() == vehicle.model.lower() for v in user_vehicles) == 1
                    )
                ]
                if vehicle_matches:
                    ambiguous_vehicles = len(vehicle_matches) > 1
                    selected_vehicle = vehicle_matches[0] if not ambiguous_vehicles else None

                date_match = re.search(r"\b\d{4}-\d{2}-\d{2}\b", user_text)
                if date_match:
                    try:
                        requested_date = datetime.strptime(date_match.group(0), "%Y-%m-%d").date()
                    except ValueError:
                        requested_date = None
                elif re.search(r"\btoday\b", text_lower):
                    requested_date = datetime.now(timezone.utc).date()
                elif re.search(r"\btomorrow\b", text_lower):
                    requested_date = datetime.now(timezone.utc).date() + timedelta(days=1)

                time_match = re.search(
                    r"\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b"
                    r"|\b(\d{1,2}):(\d{2})\s*(am|pm)?\b",
                    text_lower,
                )
                if time_match:
                    hour = int(time_match.group(1) or time_match.group(4))
                    minute = int(time_match.group(2) or time_match.group(5) or 0)
                    meridiem = time_match.group(3) or time_match.group(6)
                    if meridiem:
                        hour = hour % 12 + (12 if meridiem == "pm" else 0)
                    if 0 <= hour <= 23 and 0 <= minute <= 59:
                        requested_time = (hour, minute)

                address_match = re.search(r"(?:address|location)\s*(?:is|:)\s*(.+)", user_text, re.I)
                if address_match:
                    address = address_match.group(1).strip()

            matched_service = matched_services[0] if len(matched_services) == 1 else None
            slot_candidate = None
            if requested_date is not None and requested_time is not None:
                slot_candidate = datetime(
                    requested_date.year, requested_date.month, requested_date.day,
                    requested_time[0], requested_time[1], tzinfo=timezone.utc,
                )

            missing = []
            if ambiguous_vehicles:
                missing.append("Please name just one vehicle from your garage.")
            elif selected_vehicle is None:
                vehicle_list = ", ".join(
                    f"{v.year} {v.make} {v.model} ({v.registration})" for v in user_vehicles
                )
                missing.append(f"Which vehicle would you like to book for? Your vehicles: {vehicle_list}.")
            if len(matched_services) > 1:
                choices = ", ".join(s["name"] for s in matched_services)
                missing.append(f"Which service would you like? Please choose one: {choices}.")
            elif matched_service is None:
                choices = ", ".join(s["name"] for s in all_services)
                missing.append(f"Which service would you like to book? Available services: {choices}.")
            if requested_date is None and requested_time is None:
                missing.append("What date and time would you prefer?")
            elif requested_date is None:
                missing.append("What date would you prefer?")
            elif requested_time is None:
                missing.append("What time would you prefer?")
            if matched_service and matched_service["category"] == "home" and not address:
                missing.append("Please provide the service address (for example, 'Address: 123 Main Street').")
            if missing:
                return {
                    "branch": "conversational_booking",
                    "reply": "To continue this booking, please provide:\n" + "\n".join(f"• {item}" for item in missing),
                    "booking_id": None,
                    "booking_link": None,
                }

            is_confirmation = intent == "BOOKING_CONFIRMATION"

            val_result = validate_booking_intent_tool(
                db=db,
                current_user=current_user,
                vehicle_query=selected_vehicle.id,
                service_query=matched_service["id"],
                scheduled_at=slot_candidate,
                address=address,
            )

            if not val_result["valid"]:
                return {
                    "branch": "conversational_booking",
                    "reply": val_result["message"],
                    "booking_id": None,
                    "booking_link": None,
                }

            if not is_confirmation:
                v_desc = val_result["vehicle"]["display"]
                s_name = val_result["service"]["name"]
                s_price = val_result["service"]["price"]
                s_type = val_result["service"]["type"].title()
                sched_display = slot_candidate.strftime("%Y-%m-%d %H:%M UTC")

                summary_text = (
                    f"I have verified your vehicle and capacity. Here is your appointment summary for review:\n\n"
                    f"• **Vehicle**: {v_desc}\n"
                    f"• **Service**: {s_name} ({s_type}) — **Rs. {s_price:.2f}**\n"
                    f"• **Scheduled Time**: **{sched_display}**\n"
                )
                if address:
                    summary_text += f"• **Location**: {address}\n"

                summary_text += (
                    f"\n**Would you like me to confirm and execute this booking now?**\n"
                    f"(Please reply **'Confirm'** or **'Yes'** to proceed)."
                )

                return {
                    "branch": "conversational_booking",
                    "reply": summary_text,
                    "booking_id": None,
                    "booking_link": None,
                }

            # EXPLICIT CONFIRMATION RECEIVED: Execute via Core Service Layer
            try:
                booking = execute_confirmed_booking_core(
                    db=db,
                    current_user=current_user,
                    vehicle_id=val_result["vehicle"]["id"],
                    service_id=val_result["service"]["id"],
                    scheduled_at=slot_candidate,
                    address=address,
                    notes="Booked via Car Assistance AI Assistant (Conversational Flow)"
                )
            except Exception as e:
                return {
                    "branch": "conversational_booking",
                    "reply": f"Booking execution error: {str(e)}. Please retry or use the booking wizard in your dashboard.",
                    "booking_id": None,
                    "booking_link": None,
                }

            booking_link = f"/dashboard/bookings/{booking.id}"
            sched_str = booking.scheduled_at.strftime('%Y-%m-%d %H:%M UTC')
            reply = (
                f"🎉 **Booking #{booking.id} Confirmed!**\n\n"
                f"Your appointment for **{booking.service.name}** on **{booking.vehicle.year} {booking.vehicle.make} {booking.vehicle.model}** "
                f"has been successfully scheduled in our database for **{sched_str}**.\n\n"
                f"🔗 [**View Your Verified Booking Details**]({booking_link})"
            )

            return {
                "branch": "conversational_booking",
                "reply": reply,
                "booking_id": booking.id,
                "booking_link": booking_link,
            }

        # ---------------------------------------------------------
        # 2. REAL GROQ LLM INFERENCE (Primary for Advice, Diagnostics, FAQs, Inquiries)
        # ---------------------------------------------------------
        llm_reply = self.call_groq_api(message=message, history=history)
        if llm_reply:
            return {
                "branch": "groq_llm",
                "reply": llm_reply,
                "booking_id": None,
                "booking_link": None,
            }

        # ---------------------------------------------------------
        # 3. RULE-BASED FALLBACK (ONLY if Groq API fails or key is missing)
        # ---------------------------------------------------------
        return self._execute_rule_based_fallback(intent=intent, db=db, message=message)


assistant_orchestrator = AIAssistantOrchestrator()


assistant_orchestrator = AIAssistantOrchestrator()
