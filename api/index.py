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
    from app import app
except ImportError:
    try:
        from Canva.app import app
    except ImportError:
        import app as app_module
        app = app_module.app

# Export app for Vercel Serverless Function
app = app
