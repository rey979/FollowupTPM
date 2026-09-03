import sys
import os

# Ensure current and parent dirs are in sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)

if current_dir not in sys.path:
    sys.path.append(current_dir)
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

try:
    from app import app, db
    with app.app_context():
        db.create_all()
except Exception as err:
    print("Vercel DB Init Notice:", err)

# Export app for Vercel Serverless Function
app = app
