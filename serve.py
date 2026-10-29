"""
Meridian Ghana Ltd - HRMS Production Server Runner (Windows / On-Premise)
Uses Waitress (multi-threaded production WSGI server)
"""

import os
import sys
import socket
import logging
from waitress import serve
from app import app

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("hrms_server")

def get_lan_ips():
    """Retrieve host IPs on the hotel local network."""
    ips = []
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127."):
                ips.append(ip)
    except Exception:
        pass
    return ips

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    threads = int(os.environ.get("WAITRESS_THREADS", 8))
    lan_ips = get_lan_ips()
    hostname = socket.gethostname()

    print("=" * 65)
    print("  MERIDIAN GHANA LTD — HOTEL HRMS & OPERATIONS SYSTEM")
    print("  Production Server (Waitress WSGI)")
    print("=" * 65)
    print(f"  * Hostname       : {hostname}")
    print(f"  * Local Access   : http://localhost:{port}")
    if lan_ips:
        for ip in lan_ips:
            print(f"  * Network Access : http://{ip}:{port}")
    print(f"  * Concurrency    : {threads} worker threads")
    print("=" * 65)
    print("  Server is active and listening for requests.")
    print("  Press Ctrl+C to stop.\n")

    # Start Waitress server listening on all network interfaces
    serve(
        app,
        host="0.0.0.0",
        port=port,
        threads=threads,
        channel_timeout=120,
        cleanup_interval=30,
        ident="Meridian-HRMS/1.0",
    )
