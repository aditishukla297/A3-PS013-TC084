"""Linking a timeline event to an investigation must survive the round trip.

The browser builds the event reference and the server rebuilds the same object
from its own copy of the event, then demands an exact match. Nothing in either
language enforces that the two builders agree, so these tests do.

Run from the backend directory:
    python -m unittest discover -s tests -v
"""
from pathlib import Path
import json
import re
import sys
import unittest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi import HTTPException  # noqa: E402

import app.investigations as investigations  # noqa: E402

INVESTIGATIONS_JSX = (
    BACKEND_DIR.parent / "frontend" / "src" / "Investigations.jsx"
)

# One parsed event, shaped the way the timeline really emits it: the log text
# lives in raw_log, and there is no `message` key at all.
TIMELINE_EVENT = {
    "device_id": "demo-device-01",
    "batch_id": "55744112-1362-41af-9bdb-9fcbcdba61a6",
    "timestamp": "2026-11-01T07:26:34+00:00",
    "received_at": "2026-11-01T07:26:35.101204+00:00",
    "event_type": "failed_login",
    "username": "analyst",
    "raw_log": "Nov 01 07:26:34 demo-server sshd: Failed password for analyst",
    "severity": "medium",
}


def browser_event_reference(event):
    """The reference eventRef() in Investigations.jsx builds for an event."""
    return json.dumps({
        "device_id": event.get("device_id") or "",
        "batch_id": event.get("batch_id") or "",
        "timestamp": (event.get("timestamp") or event.get("event_timestamp")
                      or event.get("received_at") or ""),
        "event_type": event.get("event_type") or event.get("type") or "",
        "username": event.get("username") or "",
        "message": str(event.get("message") or event.get("raw_line")
                       or event.get("raw_log") or "")[:100],
    })


class StubTimelineMixin:
    def validate(self, reference, events):
        """Validate a reference against a timeline we control."""
        import app.main as main

        real = main.get_timeline_for_user
        main.get_timeline_for_user = lambda user_id, **kwargs: {
            "total": len(events), "events": events,
        }
        try:
            investigations.validate_event_reference(reference, 1)
        finally:
            main.get_timeline_for_user = real


class EventReferenceRoundTrip(StubTimelineMixin, unittest.TestCase):
    def test_reference_from_the_browser_is_accepted(self):
        """The exact object the UI sends has to match what the server rebuilds."""
        self.validate(browser_event_reference(TIMELINE_EVENT), [TIMELINE_EVENT])

    def test_blank_message_is_rejected(self):
        """Pins why the round trip broke: an empty message is not a match.

        The UI used to fall back only to `message` and `raw_line`, neither of
        which the timeline carries, so every link was refused as foreign.
        """
        reference = json.loads(browser_event_reference(TIMELINE_EVENT))
        reference["message"] = ""
        with self.assertRaises(HTTPException) as caught:
            self.validate(json.dumps(reference), [TIMELINE_EVENT])
        self.assertEqual(caught.exception.status_code, 422)

    def test_another_accounts_event_is_still_refused(self):
        """Isolation holds: a reference with no match in this timeline fails."""
        with self.assertRaises(HTTPException) as caught:
            self.validate(browser_event_reference(TIMELINE_EVENT), [])
        self.assertEqual(caught.exception.status_code, 422)


class BrowserAndServerAgree(unittest.TestCase):
    """Read the real eventRef() so the copy above cannot drift from it."""

    def setUp(self):
        source = INVESTIGATIONS_JSX.read_text(encoding="utf-8")
        match = re.search(
            r"const eventRef = e => JSON\.stringify\(\{(.+?)\}\);", source, re.S
        )
        self.assertIsNotNone(match, "eventRef() not found in Investigations.jsx")
        self.body = match.group(1)

    def test_same_fields_on_both_sides(self):
        fields = re.findall(r"(\w+):", self.body)
        self.assertEqual(
            sorted(fields),
            sorted(("device_id", "batch_id", "timestamp",
                    "event_type", "username", "message")),
        )

    def test_same_fallbacks_on_both_sides(self):
        """Every key the server reads for a field, the browser reads too."""
        expected = {
            "device_id": ["device_id"],
            "batch_id": ["batch_id"],
            "timestamp": ["timestamp", "event_timestamp", "received_at"],
            "event_type": ["event_type", "type"],
            "username": ["username"],
            "message": ["message", "raw_line", "raw_log"],
        }
        for field, keys in expected.items():
            with self.subTest(field=field):
                written = re.search(rf"\b{field}: (.+?)(?:, \w+:|$)", self.body)
                self.assertIsNotNone(written, f"{field} missing from eventRef()")
                read = re.findall(r"e\.(\w+)", written.group(1))
                self.assertEqual(read, keys)


if __name__ == "__main__":
    unittest.main()
