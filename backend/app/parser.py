
import re
from datetime import datetime

def parse_log(line, device_id, batch_id, log_type):
    """Convert one raw log line into a structured event."""

    event = {
        "device_id": device_id,
        "batch_id": batch_id,
        "log_type": log_type,
        "raw_log": line,
        "timestamp": None,
        "event_type": "unknown",
        "severity": "info",
        "username": None,
    }

    # Example: Oct 19 10:15:20
    match = re.match(
        r"^([A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})",
        line,
    )

    if match:
        event["timestamp"] = match.group(1)

    # Identify authentication events
    if "Failed password" in line:
        event["event_type"] = "failed_login"
        event["severity"] = "warning"

    elif "Accepted password" in line:
        event["event_type"] = "successful_login"
        event["severity"] = "info"

    elif "Invalid user" in line:
        event["event_type"] = "invalid_user"
        event["severity"] = "warning"

    elif "authentication failure" in line.lower():
        event["event_type"] = "authentication_failure"
        event["severity"] = "warning"

    # Extract username from common SSH messages
    username_match = re.search(
        r"(?:for|user)\s+(?:invalid user\s+)?([a-zA-Z0-9_.-]+)",
        line,
    )

    if username_match:
        event["username"] = username_match.group(1)

    return event
