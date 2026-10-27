import os
import base64
import asyncio
from datetime import datetime
from fastapi import FastAPI, WebSocket, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn
from typing import List, Optional

import database
from engine.correlation import CorrelationEngine

app = FastAPI(title="URBRAIN Ingestion API & Persistent Database")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize persistent SQLite database
database.init_db()

# Ensure local captures directory exists and mount as static route
CAPTURES_DIR = os.path.join(os.path.dirname(__file__), "captures")
os.makedirs(CAPTURES_DIR, exist_ok=True)
app.mount("/captures", StaticFiles(directory=CAPTURES_DIR), name="captures")

# Global Correlation Engine instance
correlation_engine = CorrelationEngine()

@app.get("/")
async def root():
    return {
        "message": "URBRAIN Backend & Persistent Database is Live! 🚀",
        "database": "SQLite (WAL Mode)",
        "endpoints": {
            "swagger_docs": "/docs",
            "potholes_db": "/api/db/potholes",
            "database_stats": "/api/db/stats",
            "export_csv": "/api/db/export/csv"
        }
    }

# Connected detection WebSocket clients (browsers watching the camera panel)
detection_clients: list = []

# --- Pydantic Models for Ingestion ---
class TelemetryData(BaseModel):
    busId: str
    latitude: float
    longitude: float
    speed: float
    heading: float
    route: str
    edgeStatus: str = "ONLINE"
    cameras: int = 4

class EventDetection(BaseModel):
    busId: str
    type: str # "POTHOLE", "HIT_AND_RUN", "CONGESTION"
    latitude: float
    longitude: float
    confidence: int
    severity: str # "LOW", "MEDIUM", "HIGH"
    imageUrl: Optional[str] = None
    imageData: Optional[str] = None # Base64 encoded snapshot from edge camera

class DispatchPayload(BaseModel):
    eventId: str
    corridor: str
    etaMinutes: int = 12

# --- API Endpoints ---

@app.post("/api/telemetry")
async def post_telemetry(data: TelemetryData):
    # This endpoint is hit at 1Hz by the Edge AI on the bus
    correlation_engine.update_bus_telemetry(data.dict())
    return {"status": "success"}

@app.post("/api/events")
async def post_event(data: EventDetection):
    # This endpoint is hit when YOLO detects a pothole/hazard on the phone/camera
    event_dict = data.dict()
    event_dict['timestamp'] = datetime.now().isoformat()

    # If phone/edge sends base64 image bytes, save directly to captures folder
    if data.imageData:
        try:
            ts_str = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"edge_pothole_{data.busId}_{ts_str}.jpg"
            filepath = os.path.join(CAPTURES_DIR, filename)
            # Strip base64 header if present
            clean_b64 = data.imageData.split(",")[-1]
            with open(filepath, "wb") as f:
                f.write(base64.b64decode(clean_b64))
            event_dict['imageUrl'] = f"/captures/{filename}"
            print(f"[EVIDENCE] [SNAPSHOT] Saved: {filename}")
        except Exception as e:
            print(f"[EVIDENCE] Image decode error: {e}")

    correlation_engine.process_new_event(event_dict)
    return {
        "status": "success",
        "message": "Event processed, verified, and committed to database",
        "imageUrl": event_dict.get('imageUrl')
    }

# --- Database Inspection Endpoints for Evaluators & Swagger UI ---

@app.get("/api/db/potholes")
async def get_db_potholes(status: Optional[str] = Query(None, description="Filter by 'PENDING' or 'VERIFIED'")):
    """Returns stored pothole records from SQLite with full audit history."""
    return database.get_all_potholes(status=status, limit=200)

@app.get("/api/db/stats")
async def get_db_statistics():
    """Returns real-time database storage metrics for presentation to judges."""
    return database.get_db_stats()

@app.get("/api/db/export/csv")
async def export_db_csv():
    """One-click CSV download of the entire defect database for audit inspection."""
    csv_data = database.export_potholes_csv()
    return PlainTextResponse(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=urban_eye_potholes.csv"}
    )

@app.post("/api/db/dispatch")
async def post_dispatch(payload: DispatchPayload):
    """Logs crew dispatch into persistent audit table."""
    log_id = database.log_crew_dispatch(
        event_id=payload.eventId,
        corridor=payload.corridor,
        status="DISPATCHED",
        eta_minutes=payload.etaMinutes
    )
    return {"status": "success", "dispatchId": log_id, "eta": f"{payload.etaMinutes} min"}


# --- WebSocket for LIVE bounding-box detections (from friend's YOLO model) ---

class DetectionPayload(BaseModel):
    busId: str
    detections: list  # [{label, confidence, x, y, w, h}]

@app.post("/api/detections")
async def post_detections(data: DetectionPayload):
    """Your friend's Edge AI script POSTs bounding boxes here at ~10Hz.
    We instantly broadcast them to all connected React frontends."""
    payload = {"detections": data.detections, "busId": data.busId}
    dead = []
    for ws in detection_clients:
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        detection_clients.remove(ws)
    return {"status": "ok", "broadcasted_to": len(detection_clients)}

@app.websocket("/ws/detections")
async def detections_ws(websocket: WebSocket):
    """React frontend connects here to receive live YOLO bounding boxes."""
    await websocket.accept()
    detection_clients.append(websocket)
    try:
        while True:
            await websocket.receive_text()  # Keep alive
    except Exception:
        if websocket in detection_clients:
            detection_clients.remove(websocket)

# --- WebSocket Bridge for React Frontend ---

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Stream the global state to the dashboard at 1Hz
            data = {
                "buses": list(correlation_engine.get_all_buses().values()),
                "events": correlation_engine.get_active_events(),
                "segments": correlation_engine.get_road_segments()
            }
            await websocket.send_json(data)
            await asyncio.sleep(1.0)
    except Exception as e:
        print(f"WebSocket closed: {e}")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
