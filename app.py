from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime
import os

# =========================
# LOAD ENVIRONMENT
# =========================

env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

app = Flask(__name__)
CORS(app)  # Enable Cross-Origin Resource Sharing for all devices & mobile networks

# =========================
# CONFIGURATION
# =========================

app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "default-tpm-key-2026")
db_url = os.getenv("DATABASE_URL")

# Format PostgreSQL database URL if provided by Render / Railway / Supabase / Neon DB
if db_url:
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
else:
    if os.getenv("VERCEL") or os.environ.get("VERCEL_ENV"):
        db_url = "sqlite:////tmp/tpm_database.db"
    else:
        db_url = "sqlite:///tpm_database.db"

app.config["SQLALCHEMY_DATABASE_URI"] = db_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)

# =========================
# DATABASE MODEL (TPM TEMUAN)
# =========================

class Finding(db.Model):
    __tablename__ = "tpm_findings"
    
    id = db.Column(db.String(50), primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    nama = db.Column(db.String(100), nullable=False)
    machine = db.Column(db.String(100), nullable=False)
    problem = db.Column(db.Text, nullable=False)
    tgl_temuan = db.Column(db.String(20), nullable=False)
    ilustrasi = db.Column(db.Text, nullable=True)
    plan_perbaikan = db.Column(db.String(20), nullable=True)
    part_butuh = db.Column(db.String(200), nullable=True)
    type_part = db.Column(db.String(100), nullable=True)
    countermeasure = db.Column(db.Text, nullable=True)
    tgl_countermeasure = db.Column(db.String(20), nullable=True)
    status = db.Column(db.String(30), default="On progress")

    def to_dict(self):
        return {
            "id": self.id,
            "createdAt": self.created_at.isoformat() if self.created_at else "",
            "nama": self.nama,
            "machine": self.machine,
            "problem": self.problem,
            "tgl_temuan": self.tgl_temuan,
            "ilustrasi": self.ilustrasi or "",
            "plan_perbaikan": self.plan_perbaikan or "",
            "part_butuh": self.part_butuh or "",
            "type_part": self.type_part or "",
            "countermeasure": self.countermeasure or "",
            "tgl_countermeasure": self.tgl_countermeasure or "",
            "status": self.status or "On progress"
        }

# Create Database Tables Automatically
with app.app_context():
    db.create_all()

# =========================
# ROUTES & REST API
# =========================

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/api/findings", methods=["GET"])
def get_findings():
    findings = Finding.query.order_by(Finding.created_at.desc()).all()
    return jsonify([f.to_dict() for f in findings])

@app.route("/api/findings", methods=["POST"])
def create_finding():
    data = request.json or {}
    finding_id = data.get("id") or f"TPM-{int(datetime.utcnow().timestamp())}"
    
    finding = Finding(
        id=finding_id,
        nama=data.get("nama", ""),
        machine=data.get("machine", ""),
        problem=data.get("problem", ""),
        tgl_temuan=data.get("tgl_temuan", ""),
        ilustrasi=data.get("ilustrasi", ""),
        plan_perbaikan=data.get("plan_perbaikan", ""),
        part_butuh=data.get("part_butuh", ""),
        type_part=data.get("type_part", ""),
        countermeasure=data.get("countermeasure", ""),
        tgl_countermeasure=data.get("tgl_countermeasure", ""),
        status=data.get("status", "On progress")
    )
    db.session.add(finding)
    db.session.commit()
    return jsonify({"success": True, "finding": finding.to_dict()}), 201

@app.route("/api/findings/<finding_id>/status", methods=["PUT"])
def update_status(finding_id):
    finding = Finding.query.get(finding_id)
    if not finding:
        return jsonify({"error": "Not found"}), 404
    
    data = request.json or {}
    finding.status = data.get("status", finding.status)
    db.session.commit()
    return jsonify({"success": True, "finding": finding.to_dict()})

@app.route("/api/findings/<finding_id>", methods=["DELETE"])
def delete_finding(finding_id):
    finding = Finding.query.get(finding_id)
    if not finding:
        return jsonify({"error": "Not found"}), 404
    
    db.session.delete(finding)
    db.session.commit()
    return jsonify({"success": True})

@app.route("/api/seed", methods=["POST"])
def seed_data():
    sample_media1 = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMjAwIiB2aWV3Qm94PSIwIDAgNDAwIDIwMCI+PHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiMxZTI5M2IiLz48dGV4dCB4PSI5MCUiIHk9IjQ1JSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI2VmNDQ0NCIgZm9udC1zaXplPSIyMCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSJib2xkIj7imKAgS2Vib2NvcmFuIFNwaW5kbGU8L3RleHQ+PHRleHQgeD0iNTAlIiB5PSI2NSUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM5NGEzYjgiIGZvbnQtc2l6ZT0iMTQiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIj5UZW11YW4gQWJub3JtYWxpdHkgT2xpIExpbmUgMTwvdGV4dD48L3N2Zz4='
    sample_media2 = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMjAwIiB2aWV3Qm94PSIwIDAgNDAwIDIwMCI+PHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiMwZjE3MmEiLz48dGV4dCB4PSI1MCUiIHk9IjQ1JSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI2Y1OWUwYiIgZm9udC1zaXplPSIyMCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSJib2xkIj7imqEgTGlnaHQgQ3VydGFpbiBFcnJvcjwvdGV4dD48dGV4dCB4PSI1MCUiIHk9IjY1JSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI2E4YjJkMSIgZm9udC1zaXplPSIxNCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiPlNlbnNvciBPdmVyaGVhdCBTdGFtcGluZzwvdGV4dD48L3N2Zz4='
    
    sample_items = [
        {
            "id": "TPM-882101",
            "nama": "Budi Santoso",
            "machine": "CNC Milling Mazak 01",
            "problem": "Kebocoran Oli Spindle Utama & Bunyi Abnormal pada Axis Z saat kecepatan tinggi.",
            "tgl_temuan": "2026-08-01",
            "ilustrasi": sample_media1,
            "plan_perbaikan": "2026-08-03",
            "part_butuh": "Seal Ring Spindle NBR & Bearing NSK 6208",
            "type_part": "Mechanical / Hydraulic",
            "countermeasure": "Penggantian Seal Ring Spindle & Refill Oli Hydraulic ISO VG 46.",
            "tgl_countermeasure": "2026-08-03",
            "status": "Close"
        },
        {
            "id": "TPM-882102",
            "nama": "Ahmad Hidayat",
            "machine": "Stamping Press Aida 200T",
            "problem": "Sensor Safety Light Curtain sering Error Tripping saat temperatur tinggi.",
            "tgl_temuan": "2026-08-04",
            "ilustrasi": sample_media2,
            "plan_perbaikan": "2026-08-08",
            "part_butuh": "Photoelectric Sensor Receiver Omron F3SJ",
            "type_part": "Electrical / Automation",
            "countermeasure": "Pembersihan Lensa Sensor & Penguncian Ulang Kabel Signal.",
            "tgl_countermeasure": "2026-08-06",
            "status": "On progress"
        },
        {
            "id": "TPM-882103",
            "nama": "Rian Pratama",
            "machine": "Robot Welding Yaskawa L1",
            "problem": "Nozzle Welding Torch cepat aus dan akumulasi Spatter tinggi.",
            "tgl_temuan": "2026-08-05",
            "ilustrasi": "",
            "plan_perbaikan": "2026-08-06",
            "part_butuh": "Copper Nozzle 16mm & Anti Spatter Spray",
            "type_part": "Consumable Welding",
            "countermeasure": "Penggantian Nozzle Copper Baru & Aplikasi Auto Anti-Spatter Injector.",
            "tgl_countermeasure": "2026-08-06",
            "status": "Close"
        },
        {
            "id": "TPM-882104",
            "nama": "Eko Wijaya",
            "machine": "Compressor Air Atlas Copco",
            "problem": "Tekanan Udara Drop dari 7.5 Bar menjadi 5.8 Bar saat Line Assembly Full Operation.",
            "tgl_temuan": "2026-08-07",
            "ilustrasi": "",
            "plan_perbaikan": "2026-08-10",
            "part_butuh": "Air Filter Element & Intake Valve Maintenance Kit",
            "type_part": "Pneumatic System",
            "countermeasure": "Inspeksi kebocoran pipa utama & pembersihan air filter.",
            "tgl_countermeasure": "",
            "status": "On progress"
        }
    ]

    for item in sample_items:
        if not Finding.query.get(item["id"]):
            f = Finding(**item)
            db.session.add(f)
    db.session.commit()
    return jsonify({"success": True, "count": len(sample_items)})

@app.route("/api/findings/all", methods=["DELETE"])
def clear_all():
    Finding.query.delete()
    db.session.commit()
    return jsonify({"success": True})

# =========================
# RUN SERVER (LOCAL & PRODUCTION)
# =========================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)