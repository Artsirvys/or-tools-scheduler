#!/usr/bin/env python3
"""
Startup script for the OR-Tools Schedule Solver service
"""
import os
import sys
from app import app

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    
    print(f"Starting OR-Tools Schedule Solver service on port {port}")
    print(f"Debug mode: {debug}")
    print(f"Health check: http://localhost:{port}/health")
    print(f"Solve endpoint: http://localhost:{port}/solve")
    
    app.run(host='0.0.0.0', port=port, debug=debug)
