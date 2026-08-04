#!/bin/bash

# ============================================================
# attendance.sh
#
# Usage:
#   ./attendance.sh <DEVICE_IP> [PORT] [json|csv]
#
# Examples:
#   ./attendance.sh 192.168.1.120
#   ./attendance.sh 192.168.1.120 4370 json
#   ./attendance.sh 192.168.1.120 4370 csv
# ============================================================
set -e
IP=${1}
if [ -z "$IP" ]; then
    echo "Usage:"
    echo "./attendance.sh <DEVICE_IP> [PORT] [json|csv]"
    exit 1
fi

PORT=${2:-4370}
FORMAT=${3:-json}

echo "========================================="
echo " ZKTeco Attendance Test"
echo "========================================="

echo "Device : $IP"
echo "Port   : $PORT"
echo "Format : $FORMAT"
echo

echo "[1/4] Checking Python..."

if ! command -v python3 >/dev/null 2>&1; then
    echo "Python3 not found."
    exit 1
fi

echo "OK"

echo "[2/4] Installing pyzk if needed..."

python3 - <<'PY'
import sys
import subprocess

try:
    import zk
except ImportError:
    print("Installing pyzk...")
    subprocess.check_call([
        sys.executable,
        "-m",
        "pip",
        "install",
        "--quiet",
        "pyzk"
    ])
PY

echo "OK"

echo "[3/4] Connecting..."

python3 - "$IP" "$PORT" "$FORMAT" <<'PY'

import sys
import json
import csv
from zk import ZK

ip=sys.argv[1]
port=int(sys.argv[2])
fmt=sys.argv[3]

zk=ZK(
    ip,
    port=port,
    timeout=100,
    password=0,
    force_udp=True,
    ommit_ping=True
)

try:

    conn=zk.connect()

    conn.disable_device()

    print("")
    print("=========================================")
    print("DEVICE")
    print("=========================================")

    try:
        print("Name      :",conn.get_device_name())
    except:
        pass

    try:
        print("Firmware  :",conn.get_firmware_version())
    except:
        pass

    try:
        print("Platform  :",conn.get_platform())
    except:
        pass

    try:
        print("Serial    :",conn.get_serialnumber())
    except:
        pass

    users=conn.get_users()

    attendance=conn.get_attendance()

    print("")
    print("Users      :",len(users))
    print("Attendance :",len(attendance))
    print("")

    if fmt=="csv":

        writer=csv.writer(sys.stdout)

        writer.writerow([
            "user_id",
            "uid",
            "timestamp",
            "status",
            "punch"
        ])

        for a in attendance:

            writer.writerow([
                a.user_id,
                getattr(a,"uid",""),
                str(a.timestamp),
                a.status,
                a.punch
            ])

    else:

        output=[]

        for a in attendance:

            output.append({
                "user_id":a.user_id,
                "uid":getattr(a,"uid",""),
                "timestamp":str(a.timestamp),
                "status":a.status,
                "punch":a.punch
            })

        print(json.dumps(output,indent=4))

    conn.enable_device()
    conn.disconnect()

except Exception as e:
    print("")
    print("ERROR")
    print(e)
    sys.exit(1)

PY

echo
echo "[4/4] Finished."