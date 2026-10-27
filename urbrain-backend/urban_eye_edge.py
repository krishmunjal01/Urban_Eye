"""
URBAN EYE - Edge AI Node Streamer
-----------------------------------
Run this script on the laptop connected to the smartphone camera.
It runs the YOLO11 model, serves an ultra-low latency 30 FPS MJPEG video stream
for Krish's dashboard, and emits detection events to the central backend.

Requirements:
    pip install flask opencv-python ultralytics requests

Usage:
    python urban_eye_edge.py
"""

import os
import cv2
import time
import socket
import threading
import requests
from flask import Flask, Response

# Optional CORS support if installed
try:
    from flask_cors import CORS
except ImportError:
    CORS = None

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────
# Backend URL (Render Cloud or Localhost)
BACKEND_URL = os.environ.get("URBAN_EYE_BACKEND", "https://sih-2026-pqbo.onrender.com")

# Model path (checks for custom best.pt first, then default yolo11n.pt)
MODEL_PATH = "best.pt" if os.path.exists("best.pt") else "yolo11n.pt"

# Camera Index (0 = default webcam / DroidCam, 1 = external USB phone)
CAMERA_INDEX = int(os.environ.get("CAMERA_INDEX", 0))

# Minimum confidence to fire a verified hazard event to the city twin
HAZARD_CONF_THRESHOLD = 70

# Minimum seconds between hazard alert POSTs (prevents alert spamming)
ALERT_COOLDOWN_SEC = 5.0

# ─────────────────────────────────────────────────────────────────────────────
# FLASK APP SETUP
# ─────────────────────────────────────────────────────────────────────────────
app = Flask(__name__)
if CORS:
    CORS(app)

# Global thread-safe frame buffer
latest_frame = None
latest_annotated_frame = None
frame_lock = threading.Lock()
last_alert_time = 0

def get_local_ip():
    """Detect local LAN IPv4 address to show in terminal."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

# ─────────────────────────────────────────────────────────────────────────────
# YOLO INFERENCE & CAPTURE WORKER THREAD
# ─────────────────────────────────────────────────────────────────────────────
def yolo_worker():
    global latest_frame, latest_annotated_frame, last_alert_time

    print(f"\n[AI Node] Loading YOLO model: {MODEL_PATH} ...")
    try:
        from ultralytics import YOLO
        model = YOLO(MODEL_PATH)
        print(f"[AI Node] Model loaded successfully: {model.names}")
    except Exception as e:
        print(f"[AI Node] Error loading YOLO: {e}")
        print("[AI Node] Running in passthrough camera mode (no ML inference).")
        model = None

    print(f"[AI Node] Opening camera index {CAMERA_INDEX} ...")
    cap = cv2.VideoCapture(CAMERA_INDEX)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    cap.set(cv2.CAP_PROP_FPS, 30)

    if not cap.isOpened():
        print(f"[AI Node] Warning: Camera index {CAMERA_INDEX} failed. Trying camera index 1...")
        cap = cv2.VideoCapture(1)

    if not cap.isOpened():
        print("[AI Node] ERROR: Could not open any camera! Please connect your phone via USB or DroidCam.")
        return

    print("[AI Node] Camera stream online! Running 30 FPS inference loop...")

    while True:
        success, frame = cap.read()
        if not success:
            time.sleep(0.05)
            continue

        annotated = frame.copy()
        detections = []

        if model is not None:
            try:
                results = model(frame, conf=0.45, verbose=False)[0]
                annotated = results.plot()

                # Extract detections for telemetry & event triggers
                h, w = frame.shape[:2]
                for box in results.boxes:
                    cls_id = int(box.cls[0])
                    label = model.names[cls_id]
                    conf = int(box.conf[0] * 100)
                    x1, y1, x2, y2 = box.xyxy[0].tolist()

                    detections.append({
                        "label": label,
                        "confidence": conf,
                        "x": (x1 / w) * 100,
                        "y": (y1 / h) * 100,
                        "w": ((x2 - x1) / w) * 100,
                        "h": ((y2 - y1) / h) * 100,
                        "color": "#ef4444" if "pothole" in label.lower() else "#3b82f6"
                    })

                    # If high-confidence hazard detected, fire event to cloud backend
                    now = time.time()
                    is_hazard = any(k in label.lower() for k in ["pothole", "crack", "hazard", "debris", "hole"])
                    if is_hazard and conf >= HAZARD_CONF_THRESHOLD and (now - last_alert_time) > ALERT_COOLDOWN_SEC:
                        last_alert_time = now
                        threading.Thread(target=fire_hazard_event, args=(label, conf), daemon=True).start()

                # Post 10Hz bounding boxes to dashboard WebSocket bridge if detections exist
                if detections:
                    threading.Thread(target=post_detections, args=(detections,), daemon=True).start()

            except Exception as e:
                print(f"[AI Node] Inference exception: {e}")
                annotated = frame

        # Update global shared frame buffer
        with frame_lock:
            latest_annotated_frame = annotated

        # Maintain ~30 FPS
        time.sleep(0.01)

def fire_hazard_event(label: str, confidence: int):
    """Notify backend correlation engine of a verified road defect."""
    url = f"{BACKEND_URL}/api/events"
    payload = {
        "busId": "BUS-001",
        "type": "POTHOLE",
        "latitude": 30.7333,
        "longitude": 76.7794,
        "confidence": confidence,
        "severity": "HIGH"
    }
    try:
        print(f"\n[ALERT] 🚨 Firing Hazard Event: {label} ({confidence}%) -> {url}")
        res = requests.post(url, json=payload, timeout=2.0)
        print(f"[ALERT] Response: {res.status_code}")
    except Exception as e:
        print(f"[ALERT] Failed to post event to {url}: {e}")

def post_detections(detections: list):
    """Send live bounding boxes to dashboard."""
    url = f"{BACKEND_URL}/api/detections"
    payload = {
        "busId": "BUS-001",
        "detections": detections
    }
    try:
        requests.post(url, json=payload, timeout=0.8)
    except Exception:
        pass

# ─────────────────────────────────────────────────────────────────────────────
# HTTP MJPEG VIDEO STREAM ENDPOINT
# ─────────────────────────────────────────────────────────────────────────────
def generate_mjpeg_stream():
    """Generator function that yields JPEG frames as multipart HTTP stream."""
    while True:
        with frame_lock:
            if latest_annotated_frame is None:
                frame_to_send = None
            else:
                frame_to_send = latest_annotated_frame.copy()

        if frame_to_send is None:
            time.sleep(0.05)
            continue

        # Encode to JPEG
        ret, jpeg = cv2.imencode('.jpg', frame_to_send, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if not ret:
            time.sleep(0.01)
            continue

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')

        # Limit to ~30 FPS
        time.sleep(0.033)

@app.route('/')
def index():
    return {
        "status": "online",
        "service": "URBAN EYE Edge AI Streamer",
        "stream_url": "/video_feed",
        "model": MODEL_PATH,
        "backend": BACKEND_URL
    }

@app.route('/video_feed')
def video_feed():
    """Endpoint consumed directly by Krish's dashboard."""
    resp = Response(generate_mjpeg_stream(), mimetype='multipart/x-mixed-replace; boundary=frame')
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp

# ─────────────────────────────────────────────────────────────────────────────
# MAIN ENTRYPOINT
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    local_ip = get_local_ip()

    print("=" * 70)
    print(" 👁️  URBAN EYE — MOBILE EDGE AI NODE (YOLO11)")
    print("=" * 70)
    print(f" • Local IP Address:  {local_ip}")
    print(f" • Stream URL:        http://{local_ip}:5000/video_feed")
    print(f" • Target Backend:    {BACKEND_URL}")
    print(f" • Model File:        {MODEL_PATH}")
    print("=" * 70)
    print(f"\n👉 Tell Krish to paste this URL in his dashboard Settings:")
    print(f"   http://{local_ip}:5000/video_feed\n")
    print("=" * 70)

    # Start camera worker thread
    worker = threading.Thread(target=yolo_worker, daemon=True)
    worker.start()

    # Start Flask MJPEG server on port 5000
    app.run(host='0.0.0.0', port=5000, threaded=True, debug=False)
