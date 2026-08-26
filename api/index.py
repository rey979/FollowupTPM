import sys
import os

# Add root directory and Canva folder to sys.path so app.py can be found in any structure
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
canva_dir = os.path.join(root_dir, "Canva")

sys.path.append(root_dir)
sys.path.append(canva_dir)

try:
    from app import app
except ImportError:
    try:
        from Canva.app import app
    except ImportError:
        import app as app_module
        app = app_module.app

# Export WSGI app for Vercel
app = app
