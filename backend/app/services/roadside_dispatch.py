import asyncio
import json
import logging
from typing import Any
from fastapi import WebSocket

logger = logging.getLogger("roadside_dispatch")


class RoadsideDispatchManager:
    def __init__(self):
        # Admin connections listening for new incidents and status updates
        self.admin_connections: list[WebSocket] = []
        # Customer connections keyed by roadside request ID
        self.customer_connections: dict[int, list[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect_admin(self, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            self.admin_connections.append(websocket)
        logger.info(f"Admin WebSocket connected. Total admins: {len(self.admin_connections)}")

    async def disconnect_admin(self, websocket: WebSocket):
        async with self._lock:
            if websocket in self.admin_connections:
                self.admin_connections.remove(websocket)
        logger.info(f"Admin WebSocket disconnected. Total admins: {len(self.admin_connections)}")

    async def connect_customer(self, request_id: int, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            if request_id not in self.customer_connections:
                self.customer_connections[request_id] = []
            self.customer_connections[request_id].append(websocket)
        logger.info(f"Customer connected for request #{request_id}")

    async def disconnect_customer(self, request_id: int, websocket: WebSocket):
        async with self._lock:
            if request_id in self.customer_connections:
                if websocket in self.customer_connections[request_id]:
                    self.customer_connections[request_id].remove(websocket)
                if not self.customer_connections[request_id]:
                    del self.customer_connections[request_id]
        logger.info(f"Customer disconnected for request #{request_id}")

    async def broadcast_to_admins(self, event_type: str, data: dict[str, Any]):
        """Stream real-time incident notifications to the dedicated admin queue."""
        payload = json.dumps({"event": event_type, "data": data}, default=str)
        async with self._lock:
            active_conns = list(self.admin_connections)

        for conn in active_conns:
            try:
                await conn.send_text(payload)
            except Exception as e:
                logger.warning(f"Failed to send to admin socket: {e}")
                await self.disconnect_admin(conn)

    async def notify_customer(self, request_id: int, event_type: str, data: dict[str, Any]):
        """Stream real-time status and provider updates to customer tracking screen."""
        payload = json.dumps({"event": event_type, "request_id": request_id, "data": data}, default=str)
        async with self._lock:
            conns = list(self.customer_connections.get(request_id, []))

        for conn in conns:
            try:
                await conn.send_text(payload)
            except Exception as e:
                logger.warning(f"Failed to send to customer socket for #{request_id}: {e}")
                await self.disconnect_customer(request_id, conn)


dispatch_manager = RoadsideDispatchManager()
