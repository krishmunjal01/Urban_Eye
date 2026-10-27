"""
URBRAIN Pothole Detection & Database Log Viewer
Run:
    python view_logs.py
"""

import os
import sqlite3
import subprocess
import sys

def main():
    print("=" * 75)
    print("          URBAN EYE - POTHOLE DETECTION & DATABASE LOGS")
    print("=" * 75)

    # 1. Check local edge DB
    edge_db = "edge_detections.db"
    if os.path.exists(edge_db):
        print(f"\n[EDGE DATABASE] File: {edge_db}")
        with sqlite3.connect(edge_db) as conn:
            rows = conn.execute("SELECT id, bus_id, label, confidence, snapshot_path, synced_to_cloud, timestamp FROM edge_pothole_logs ORDER BY id ASC").fetchall()
            print(f"Total Logged Potholes: {len(rows)}")
            print("-" * 75)
            print(f"{'ID':<4} | {'BUS':<8} | {'LABEL':<10} | {'CONF':<6} | {'SYNCED':<8} | {'SNAPSHOT FILE':<28} | {'TIMESTAMP'}")
            print("-" * 75)
            for r in rows:
                sync_str = "[OK] Yes" if r[5] == 1 else "[WAIT] No"
                print(f"{r[0]:<4} | {r[1]:<8} | {r[2]:<10} | {r[3]}%   | {sync_str:<8} | {r[4]:<28} | {r[6][:19]}")
            print("-" * 75)

    # 2. Check central backend DB
    central_db = "urban_eye.db"
    if os.path.exists(central_db):
        print(f"\n[CENTRAL DATABASE] File: {central_db}")
        with sqlite3.connect(central_db) as conn:
            rows = conn.execute("SELECT event_id, bus_id, defect_type, confidence, severity, status, created_at FROM pothole_detections ORDER BY id ASC").fetchall()
            print(f"Total Central Records: {len(rows)}")
            print("-" * 75)
            print(f"{'EVENT ID':<12} | {'BUS':<8} | {'TYPE':<10} | {'CONF':<6} | {'SEVERITY':<8} | {'STATUS':<10} | {'TIMESTAMP'}")
            print("-" * 75)
            for r in rows:
                print(f"{r[0]:<12} | {r[1]:<8} | {r[2]:<10} | {r[3]}%   | {r[4]:<8} | {r[5]:<10} | {r[6][:19]}")
            print("-" * 75)

    # 3. Check captures directory
    captures_dir = "captures"
    if os.path.exists(captures_dir):
        files = [f for f in os.listdir(captures_dir) if f.endswith(".jpg")]
        print(f"\n[CAPTURED PHOTOS] Folder: {os.path.abspath(captures_dir)}")
        print(f"Total Snapshot Images: {len(files)}")
        for f in files[-5:]:
            size_kb = round(os.path.getsize(os.path.join(captures_dir, f)) / 1024, 1)
            print(f"  - {f} ({size_kb} KB)")
        if len(files) > 5:
            print(f"  ... and {len(files) - 5} earlier images.")

    print("\n" + "=" * 75)
    print(" QUICK WAYS TO SHOW EVALUATORS:")
    print(" 1. In browser: Open http://localhost:8000/docs -> GET /api/db/potholes")
    print(" 2. Open photos folder in Windows: explorer captures")
    print("=" * 75 + "\n")

if __name__ == "__main__":
    main()
