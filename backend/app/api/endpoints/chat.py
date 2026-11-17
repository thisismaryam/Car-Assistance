import json
import os
import urllib.error
import urllib.request
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

SYSTEM_PROMPT = (
    "You are the Car Assistance AI. You can answer questions about our "
    "workshop services, home services, and roadside emergencies. Keep answers short and helpful."
)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    reply: str


def call_groq(api_key: str, message: str, history: list[ChatMessage]) -> str:
    url = "https://api.groq.com/openai/v1/chat/completions"
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in history[-6:]:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": message})

    payload = {
        "model": "llama-3.1-8b-instant",
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 300,
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "CarAssistance/1.0",
        },
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"].strip()


def call_gemini(api_key: str, message: str, history: list[ChatMessage]) -> str:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    contents = []

    # Include system instructions in prompt structure
    contents.append({
        "role": "user",
        "parts": [{"text": f"SYSTEM INSTRUCTION: {SYSTEM_PROMPT}\n\nUnderstood?"}]
    })
    contents.append({
        "role": "model",
        "parts": [{"text": "Understood. I am Car Assistance AI ready to help."}]
    })

    for msg in history[-6:]:
        role = "user" if msg.role == "user" else "model"
        contents.append({"role": role, "parts": [{"text": msg.content}]})

    contents.append({"role": "user", "parts": [{"text": message}]})

    payload = {"contents": contents}

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()


def fallback_kb_response(query: str) -> str:
    q = query.lower()

    if any(k in q for k in ["oil", "lube", "filter"]):
        return (
            "We offer Workshop Oil & Filter Change ($29.99, 45 min) and "
            "Home Oil Change right at your driveway ($49.99, 60 min). "
            "You can book either through your customer dashboard."
        )
    if any(k in q for k in ["brake", "pad", "rotor"]):
        return (
            "Our Brake Pad Replacement service ($119.99, 90 min) includes "
            "front or rear OEM pads with full rotor inspection at our workshop bay."
        )
    if any(k in q for k in ["battery", "dead battery", "jump"]):
        return (
            "For battery issues: we provide on-site Home Battery Replacement ($79.99) "
            "and 24/7 Roadside Jump-Start & Fuel Delivery ($29.99). "
            "Visit /emergency for immediate roadside dispatch."
        )
    if any(k in q for k in ["tow", "towing", "stuck", "breakdown", "emergency", "roadside"]):
        return (
            "For roadside emergencies, we offer 24/7 Flatbed Towing ($69.99) and "
            "rapid roadside assistance. Visit the Roadside tab (/emergency) to submit "
            "your GPS location or call our dispatch at +92-300-0000000."
        )
    if any(k in q for k in ["home", "doorstep", "driveway"]):
        return (
            "Our Home Services include Home Oil Change ($49.99), Home Battery "
            "Replacement ($79.99), and Home Tyre Change ($39.99). "
            "Book via the Home Service tab in your dashboard."
        )
    if any(k in q for k in ["ac", "air condition", "cooling", "heat"]):
        return (
            "Our AC System Service ($89.99, 75 min) includes refrigerant recharge, "
            "leak testing, and cabin air filter replacement at our workshop."
        )
    if any(k in q for k in ["tyre", "tire", "alignment", "wheel"]):
        return (
            "We offer Workshop Wheel Alignment & Balancing ($59.99) as well as "
            "Home Tyre Change ($39.99) at your location."
        )
    if any(k in q for k in ["price", "cost", "fee", "rate", "services"]):
        return (
            "We offer 10 comprehensive services across Workshop (Oil $29.99, Brakes $119.99, "
            "Diagnostics $49.99, AC $89.99, Alignment $59.99), Home (Oil $49.99, Battery $79.99, "
            "Tyres $39.99), and Roadside Towing & Jump-start ($29.99 - $69.99)."
        )

    return (
        "Hello! I am your Car Assistance AI. I can assist you with Workshop bookings, "
        "doorstep Home Services, and 24/7 Roadside Assistance. "
        "How can I help with your vehicle today?"
    )


@router.post("/", response_model=ChatResponse)
@router.post("", response_model=ChatResponse)
def chat_endpoint(payload: ChatRequest):
    groq_key = os.getenv("GROQ_API_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")

    if groq_key:
        try:
            reply = call_groq(groq_key, payload.message, payload.history)
            return ChatResponse(reply=reply)
        except Exception:
            pass

    if gemini_key:
        try:
            reply = call_gemini(gemini_key, payload.message, payload.history)
            return ChatResponse(reply=reply)
        except Exception:
            pass

    # High quality fallback answering user query accurately
    reply = fallback_kb_response(payload.message)
    return ChatResponse(reply=reply)

