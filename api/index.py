import sys
import os

# Add parent directory to path so app.py can be imported
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app

# Export app for Vercel Serverless Function
app = app
