"""
URBRAIN Persistent Database Module
-----------------------------------
Zero-dependency, thread-safe SQLite persistence for:
1. Live Pothole & Road Defect Detections (with edge evidence photos)
2. Cross-Bus Verification Audit Logs
3. Bus Telemetry History
4. Corridor Structural Degradation Time-series
5. Emergency Crew Dispatch Records
"""

import os
import sqlite3
import json
import csv
import io
from datetime import datetime
from typing import Dict, List, Optional, Any

DB_PATH = os.path.join(os.path.dirname(__file__), "urban_eye.db")


def get_db_connection():
    """Returns a SQLite connection with dict-like row access and WAL mode for high concurrency."""
    conn = sqlite3.connect(DB_PATH, timeout=10.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def init_db():
    """Initializes tables and seeds initial baseline records if empty."""
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # 1. Pothole / Hazard Detections Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pothole_detections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id VARCHAR(50) UNIQUE NOT NULL,
                bus_id VARCHAR(30) NOT NULL,
                defect_type VARCHAR(30) NOT NULL,
                confidence INTEGER NOT NULL,
                severity VARCHAR(20) NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                image_url TEXT,
                status VARCHAR(20) DEFAULT 'PENDING',
                verifying_buses TEXT,
                created_at TEXT NOT NULL,
                verified_at TEXT
            )
        """)

        # 2. Bus Telemetry Breadcrumbs
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bus_telemetry_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bus_id VARCHAR(30) NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                speed REAL NOT NULL,
                heading REAL NOT NULL,
                route VARCHAR(60) NOT NULL,
                timestamp TEXT NOT NULL
            )
        """)

        # 3. Corridor Health Logs (Temporal degradation tracking)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS corridor_health_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                segment_id VARCHAR(30) NOT NULL,
                corridor_name VARCHAR(100) NOT NULL,
                health_score REAL NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        # 4. Dispatch Audit Records (Prescriptive AI actions)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS dispatch_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id VARCHAR(50) NOT NULL,
                corridor VARCHAR(100) NOT NULL,
                status VARCHAR(30) NOT NULL,
                eta_minutes INTEGER NOT NULL,
                dispatched_at TEXT NOT NULL
            )
        """)

        # Seed initial historical verified events if database is newly created
        cursor.execute("SELECT COUNT(*) as count FROM pothole_detections")
        row = cursor.fetchone()
        if row["count"] == 0:
            now = datetime.now().isoformat()
            initial_seeds = [
                (
                    "EVT-001", "BUS-001", "Pothole", 94, "HIGH",
                    30.746242, 76.786140, "/pothole1.jpeg", "VERIFIED",
                    json.dumps(["BUS-001", "BUS-002", "BUS-003"]), now, now
                ),
                (
                    "EVT-002", "BUS-005", "Crack", 88, "MEDIUM",
                    30.733711, 76.779808, "/crack.jpeg", "VERIFIED",
                    json.dumps(["BUS-005", "BUS-008"]), now, now
                ),
                (
                    "EVT-003", "BUS-009", "Pothole", 91, "HIGH",
                    30.741143, 76.792146, "/pothole2.jpeg", "VERIFIED",
                    json.dumps(["BUS-009", "BUS-010", "BUS-012"]), now, now
                )
            ]
            cursor.executemany("""
                INSERT INTO pothole_detections 
                (event_id, bus_id, defect_type, confidence, severity, latitude, longitude, image_url, status, verifying_buses, created_at, verified_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, initial_seeds)

            # Seed baseline corridor health
            corridor_seeds = [
                ("SEG-001", "Madhya Marg Corridor", 100.0, now),
                ("SEG-002", "Dakshin Marg Corridor", 80.0, now),
                ("SEG-003", "Jan Marg Corridor", 60.0, now),
                ("SEG-004", "Vidya Path Corridor", 95.0, now),
            ]
            cursor.executemany("""
                INSERT INTO corridor_health_logs (segment_id, corridor_name, health_score, updated_at)
                VALUES (?, ?, ?, ?)
            """, corridor_seeds)

        conn.commit()
    print(f"[DATABASE] [OK] SQLite Initialized at {DB_PATH}")


def save_pothole_detection(
    event_id: str,
    bus_id: str,
    defect_type: str,
    confidence: int,
    severity: str,
    latitude: float,
    longitude: float,
    image_url: Optional[str] = None,
    status: str = "PENDING",
    verifying_buses: Optional[List[str]] = None,
    created_at: Optional[str] = None
) -> dict:
    """Inserts a new pothole / road defect record into the database."""
    now = created_at or datetime.now().isoformat()
    buses_json = json.dumps(verifying_buses or [bus_id])

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO pothole_detections
            (event_id, bus_id, defect_type, confidence, severity, latitude, longitude, image_url, status, verifying_buses, created_at, verified_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            event_id, bus_id, defect_type, confidence, severity,
            latitude, longitude, image_url, status, buses_json,
            now, now if status == "VERIFIED" else None
        ))
        conn.commit()

    return {
        "event_id": event_id,
        "bus_id": bus_id,
        "defect_type": defect_type,
        "confidence": confidence,
        "severity": severity,
        "latitude": latitude,
        "longitude": longitude,
        "image_url": image_url,
        "status": status,
        "verifying_buses": verifying_buses or [bus_id],
        "created_at": now
    }


def update_pothole_verification(event_id: str, verifying_buses: List[str], status: str = "VERIFIED") -> bool:
    """Updates an event when cross-verified by 2+ buses."""
    now = datetime.now().isoformat()
    buses_json = json.dumps(verifying_buses)

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE pothole_detections
            SET status = ?, verifying_buses = ?, verified_at = ?
            WHERE event_id = ?
        """, (status, buses_json, now, event_id))
        conn.commit()
        return cursor.rowcount > 0


def log_corridor_health(segment_id: str, corridor_name: str, health_score: float):
    """Appends a new corridor health state into the time-series table."""
    now = datetime.now().isoformat()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO corridor_health_logs (segment_id, corridor_name, health_score, updated_at)
            VALUES (?, ?, ?, ?)
        """, (segment_id, corridor_name, health_score, now))
        conn.commit()


def log_crew_dispatch(event_id: str, corridor: str, status: str = "DISPATCHED", eta_minutes: int = 12) -> int:
    """Records a crew dispatch action triggered from the 3D dashboard or AI Action Center."""
    now = datetime.now().isoformat()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO dispatch_logs (event_id, corridor, status, eta_minutes, dispatched_at)
            VALUES (?, ?, ?, ?, ?)
        """, (event_id, corridor, status, eta_minutes, now))
        conn.commit()
        return cursor.lastrowid


def log_bus_telemetry(bus_id: str, latitude: float, longitude: float, speed: float, heading: float, route: str):
    """Logs bus telemetry breadcrumb."""
    now = datetime.now().isoformat()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO bus_telemetry_logs (bus_id, latitude, longitude, speed, heading, route, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (bus_id, latitude, longitude, speed, heading, route, now))
        conn.commit()


def get_all_potholes(status: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
    """Retrieves road defect records, optionally filtered by status."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        if status:
            cursor.execute("""
                SELECT * FROM pothole_detections
                WHERE status = ?
                ORDER BY id DESC LIMIT ?
            """, (status.upper(), limit))
        else:
            cursor.execute("""
                SELECT * FROM pothole_detections
                ORDER BY id DESC LIMIT ?
            """, (limit,))
        rows = cursor.fetchall()

    results = []
    for r in rows:
        results.append({
            "id": r["id"],
            "eventId": r["event_id"],
            "busId": r["bus_id"],
            "type": r["defect_type"],
            "confidence": r["confidence"],
            "severity": r["severity"],
            "latitude": r["latitude"],
            "longitude": r["longitude"],
            "imageUrl": r["image_url"],
            "status": r["status"],
            "verifyingBuses": json.loads(r["verifying_buses"]) if r["verifying_buses"] else [],
            "createdAt": r["created_at"],
            "verifiedAt": r["verified_at"]
        })
    return results


def get_db_stats() -> Dict[str, Any]:
    """Returns real-time database summary statistics for judges."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as total FROM pothole_detections")
        total = cursor.fetchone()["total"]

        cursor.execute("SELECT COUNT(*) as verified FROM pothole_detections WHERE status = 'VERIFIED'")
        verified = cursor.fetchone()["verified"]

        cursor.execute("SELECT COUNT(*) as pending FROM pothole_detections WHERE status = 'PENDING'")
        pending = cursor.fetchone()["pending"]

        cursor.execute("SELECT COUNT(*) as dispatches FROM dispatch_logs")
        dispatches = cursor.fetchone()["dispatches"]

        cursor.execute("SELECT COUNT(*) as telemetry_count FROM bus_telemetry_logs")
        telemetry_count = cursor.fetchone()["telemetry_count"]

    size_bytes = os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0

    return {
        "engine": "SQLite 3 (WAL mode)",
        "database_file": os.path.basename(DB_PATH),
        "database_size_kb": round(size_bytes / 1024, 2),
        "total_potholes_logged": total,
        "verified_incidents": verified,
        "pending_verification": pending,
        "crews_dispatched": dispatches,
        "telemetry_points_recorded": telemetry_count,
        "last_sync": datetime.now().isoformat()
    }


def export_potholes_csv() -> str:
    """Exports all pothole detection records as CSV text for immediate judge inspection."""
    potholes = get_all_potholes(limit=1000)
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "Event ID", "Bus ID", "Defect Type", "Confidence (%)",
        "Severity", "Latitude", "Longitude", "Status",
        "Verifying Buses", "Created At", "Verified At", "Image URL"
    ])

    for p in potholes:
        writer.writerow([
            p["eventId"],
            p["busId"],
            p["type"],
            p["confidence"],
            p["severity"],
            p["latitude"],
            p["longitude"],
            p["status"],
            "; ".join(p["verifyingBuses"]),
            p["createdAt"],
            p["verifiedAt"] or "",
            p["imageUrl"] or ""
        ])

    return output.getvalue()
