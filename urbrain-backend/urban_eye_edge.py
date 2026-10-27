"""
URBAN EYE - Edge AI Node Streamer (Plug & Play Zero-Config Edition)
------------------------------------------------------------------
Just send this file to Rishi. He drops it in his sih_26 folder and runs:
    python urban_eye_edge.py

Features:
  1. Auto-installs any missing Python dependencies on launch.
  2. Auto-finds Rishi's trained 'urban_eye_pothole_v1.pt' model anywhere in his repo.
  3. Auto-detects phone / DroidCam camera index (prefers phone over laptop webcam).
  4. Auto-detects the exact Mobile Hotspot / Wi-Fi IP address.
  5. Serves low-latency 30 FPS annotated MJPEG video for Krish's dashboard.
"""

import os
import sys
import subprocess

# ─────────────────────────────────────────────────────────────────────────────
# 1. AUTO-DEPENDENCY VERIFIER & INSTALLER
# ─────────────────────────────────────────────────────────────────────────────
def ensure_dependencies():
    """Auto-installs required packages if missing, so Rishi never hits ImportError."""
    required_packages = {
        "flask": "flask",
        "flask_cors": "flask-cors",
        "cv2": "opencv-python",
        "ultralytics": "ultralytics",
        "requests": "requests"
    }
    missing = []
    for module_name, pip_name in required_packages.items():
        try:
            __import__(module_name)
        except ImportError:
            missing.append(pip_name)

    if missing:
        print("\n" + "=" * 70)
        print(f" [URBAN EYE] Installing missing packages: {', '.join(missing)} ...")
        print("=" * 70)
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", *missing])
            print(" [URBAN EYE] Dependencies installed successfully!\n")
        except Exception as e:
            print(f" [URBAN EYE] Warning: Automatic install error: {e}")

ensure_dependencies()

# Core imports after dependency check
import time
import socket
import threading
import requests
import cv2
from flask import Flask, Response

try:
    from flask_cors import CORS
except ImportError:
    CORS = None

# ─────────────────────────────────────────────────────────────────────────────
# 2. INTELLIGENT MODEL RESOLUTION
# ─────────────────────────────────────────────────────────────────────────────
def resolve_model_path():
    """
    Auto-detects Rishi's trained pothole model.
    Prioritizes urban_eye_pothole_v1.pt, then recursively scans repo folders.
    """
    env_path = os.environ.get("MODEL_PATH")
    if env_path and os.path.exists(env_path):
        return env_path, "Manual Environment Override"

    # 1. Known relative candidate paths
    candidates = [
        os.path.join("models", "urban_eye_pothole_v1.pt"),
        "urban_eye_pothole_v1.pt",
        os.path.join("..", "models", "urban_eye_pothole_v1.pt"),
        os.path.join("models", "urban_eye_pothole_pilot.pt"),
        "urban_eye_pothole_pilot.pt",
        "best.pt",
        os.path.join("models", "best.pt"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c, "Trained Pothole Model"

    # 2. Recursive scan for his exact file in current and parent directory
    for root_dir in [".", ".."]:
        if os.path.exists(root_dir):
            for root, _, files in os.walk(root_dir):
                if "urban_eye_pothole_v1.pt" in files:
                    return os.path.join(root, "urban_eye_pothole_v1.pt"), "Auto-Discovered Pothole Model"

    # 3. Fallback base YOLO model
    if os.path.exists("yolo11n.pt"):
        return "yolo11n.pt", "YOLO11n Base Fallback"

    return "yolo11n.pt", "Default YOLO11n"

MODEL_PATH, MODEL_DESC = resolve_model_path()

# Backend URL (Render Cloud or Localhost)
BACKEND_URL = os.environ.get("URBAN_EYE_BACKEND", "https://sih-2026-pqbo.onrender.com")

# Hazard confidence threshold and cooldown (seconds)
HAZARD_CONF_THRESHOLD = 70
ALERT_COOLDOWN_SEC = 5.0

# ─────────────────────────────────────────────────────────────────────────────
# 3. SMART CAMERA AUTO-SELECTOR (DROIDCAM / PHONE vs LAPTOP WEBCAM)
# ─────────────────────────────────────────────────────────────────────────────
def auto_detect_camera():
    """
    Auto-probes cameras. On laptops, Index 0 is the built-in webcam.
    External phones / DroidCam / Iriun appear as Index 1 or Index 2.
    This function automatically prioritizes the phone camera!
    """
    if "CAMERA_INDEX" in os.environ:
        idx = int(os.environ["CAMERA_INDEX"])
        return idx, f"Manual Override (Index {idx})"

    # Probe 1 (DroidCam/Phone), then 2 (USB Phone), then 0 (Default Laptop Webcam)
    for probe_idx in [1, 2, 0]:
        cap = cv2.VideoCapture(probe_idx)
        if cap.isOpened():
            ret, _ = cap.read()
            cap.release()
            if ret:
                desc = "Phone / DroidCam (Auto-Detected)" if probe_idx in [1, 2] else "Laptop Webcam (Default)"
                return probe_idx, desc

    return 0, "Default Index 0"

CAMERA_INDEX, CAMERA_DESC = auto_detect_camera()

# ─────────────────────────────────────────────────────────────────────────────
# 4. ROBUST HOTSPOT / LAN IP DETECTOR
# ─────────────────────────────────────────────────────────────────────────────
def get_hotspot_ip():
    """
    Detects the exact LAN IPv4 address on Mobile Hotspot / Wi-Fi.
    Prioritizes Android hotspot (192.168.43.x), iPhone (172.20.10.x), and standard Wi-Fi.
    """
    candidate_ips = []

    # Method 1: Connect UDP socket towards standard gateway
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        candidate_ips.append(s.getsockname()[0])
        s.close()
    except Exception:
        pass

    # Method 2: Inspect all host network interfaces
    try:
        _, _, host_ips = socket.gethostbyname_ex(socket.gethostname())
        for ip in host_ips:
            if not ip.startswith("127.") and not ip.startswith("169.254."):
                candidate_ips.append(ip)
    except Exception:
        pass

    # Filter out VirtualBox / VMware host-only adapters (usually 192.168.56.x)
    clean_ips = [ip for ip in candidate_ips if not ip.startswith("192.168.56.")]

    # Prioritize mobile hotspots
    for ip in clean_ips:
        if ip.startswith("192.168.43.") or ip.startswith("172.20.10."):
            return ip
    for ip in clean_ips:
        if ip.startswith("192.168."):
            return ip
    for ip in clean_ips:
        if ip.startswith("10.") or ip.startswith("172."):
            return ip

    return clean_ips[0] if clean_ips else "127.0.0.1"

# ─────────────────────────────────────────────────────────────────────────────
# 5. FLASK MJPEG SERVER SETUP
# ─────────────────────────────────────────────────────────────────────────────
app = Flask(__name__)
if CORS:
    CORS(app)

latest_annotated_frame = None
frame_lock = threading.Lock()
last_alert_time = 0

# ─────────────────────────────────────────────────────────────────────────────
# 6. YOLO INFERENCE & VIDEO CAPTURE WORKER
# ─────────────────────────────────────────────────────────────────────────────
def yolo_worker():
    global latest_annotated_frame, last_alert_time

    print(f"\n[AI Node] Initializing model: {MODEL_PATH} ({MODEL_DESC}) ...")
    model = None
    try:
        from ultralytics import YOLO
        model = YOLO(MODEL_PATH)
        print(f"[AI Node] Model loaded successfully! Classes: {model.names}")
    except Exception as e:
        print(f"[AI Node] Notice: YOLO failed to load ({e}). Running in passthrough camera mode.")

    print(f"[AI Node] Connecting to {CAMERA_DESC} [Index: {CAMERA_INDEX}] ...")
    cap = cv2.VideoCapture(CAMERA_INDEX)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    cap.set(cv2.CAP_PROP_FPS, 30)

    # Failover to other camera indices if selected index fails
    if not cap.isOpened():
        print(f"[AI Node] Camera index {CAMERA_INDEX} failed. Probing alternatives...")
        for alt_idx in [0, 1, 2]:
            if alt_idx != CAMERA_INDEX:
                cap = cv2.VideoCapture(alt_idx)
                if cap.isOpened():
                    print(f"[AI Node] Connected to camera index {alt_idx}!")
                    break

    if not cap.isOpened():
        print("[AI Node] ❌ ERROR: No camera detected. Connect your phone via DroidCam or USB and restart.")
        return

    print("[AI Node] ✅ Camera stream online! Running 30 FPS inference loop...\n")

    while True:
        success, frame = cap.read()
        if not success:
            time.sleep(0.04)
            continue

        annotated = frame.copy()
        detections = []

        if model is not None:
            try:
                results = model(frame, conf=0.40, verbose=False)[0]
                annotated = results.plot()

                h, w = frame.shape[:2]
                for box in results.boxes:
                    cls_id = int(box.cls[0])
                    label = model.names[cls_id]
                    conf = int(box.conf[0] * 100)
                    x1, y1, x2, y2 = box.xyxy[0].tolist()

                    is_hazard = any(k in label.lower() for k in [
                        "pothole", "crack", "hazard", "debris", "hole", "d40", "d00", "d10", "d20", "damage"
                    ])

                    detections.append({
                        "label": label,
                        "confidence": conf,
                        "x": (x1 / w) * 100,
                        "y": (y1 / h) * 100,
                        "w": ((x2 - x1) / w) * 100,
                        "h": ((y2 - y1) / h) * 100,
                        "color": "#ef4444" if is_hazard else "#3b82f6"
                    })

                    # If high-confidence hazard detected, fire event to cloud backend
                    now = time.time()
                    if is_hazard and conf >= HAZARD_CONF_THRESHOLD and (now - last_alert_time) > ALERT_COOLDOWN_SEC:
                        last_alert_time = now
                        threading.Thread(target=fire_hazard_event, args=(label, conf), daemon=True).start()

                # Post 10Hz bounding box telemetry
                if detections:
                    threading.Thread(target=post_detections, args=(detections,), daemon=True).start()

            except Exception:
                annotated = frame

        with frame_lock:
            latest_annotated_frame = annotated

        # Maintain ~30 FPS
        time.sleep(0.015)

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
        print(f"[ALERT] 🚨 Verified Defect: {label} ({confidence}%) -> Cloud City Twin")
        requests.post(url, json=payload, timeout=2.0)
    except Exception:
        pass

def post_detections(detections: list):
    """Send live bounding boxes to dashboard WebSocket bridge."""
    try:
        requests.post(f"{BACKEND_URL}/api/detections", json={"busId": "BUS-001", "detections": detections}, timeout=0.8)
    except Exception:
        pass

# ─────────────────────────────────────────────────────────────────────────────
# 7. HTTP STREAM & HEALTH CHECK ROUTES
# ─────────────────────────────────────────────────────────────────────────────
def generate_mjpeg_stream():
    """Yields JPEG frames as multipart HTTP stream."""
    while True:
        with frame_lock:
            frame_to_send = None if latest_annotated_frame is None else latest_annotated_frame.copy()

        if frame_to_send is None:
            time.sleep(0.04)
            continue

        ret, jpeg = cv2.imencode('.jpg', frame_to_send, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if not ret:
            time.sleep(0.01)
            continue

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')

        time.sleep(0.033)

@app.route('/')
def index():
    """Health check endpoint pinged by Krish's dashboard test button."""
    resp = Response(
        '{"status":"online","service":"URBAN EYE Edge Streamer"}',
        mimetype='application/json'
    )
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp

@app.route('/video_feed')
def video_feed():
    """MJPEG stream endpoint consumed by Krish's dashboard."""
    resp = Response(generate_mjpeg_stream(), mimetype='multipart/x-mixed-replace; boundary=frame')
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp

# ─────────────────────────────────────────────────────────────────────────────
# 8. MAIN ENTRYPOINT
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    local_ip = get_hotspot_ip()
    stream_url = f"http://{local_ip}:5000/video_feed"

    print("\n" + "█" * 72)
    print(" 👁️   URBAN EYE — MOBILE EDGE AI NODE (PLUG & PLAY)")
    print("█" * 72)
    print(f"  • Hotspot IP:       {local_ip}")
    print(f"  • Stream URL:       {stream_url}")
    print(f"  • Model File:       {MODEL_PATH} ({MODEL_DESC})")
    print(f"  • Camera Source:    {CAMERA_DESC}")
    print("█" * 72)
    print("\n👉 TELL KRISH TO PASTE THIS URL IN HIS DASHBOARD SETTINGS:")
    print(f"\n   >>>  {stream_url}  <<<\n")
    print("█" * 72 + "\n")

    # Start camera capture & inference thread
    worker = threading.Thread(target=yolo_worker, daemon=True)
    worker.start()

    # Start Flask MJPEG server on all network interfaces
    app.run(host='0.0.0.0', port=5000, threaded=True, debug=False)
