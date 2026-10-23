"""Repeatable acceptance tests for TracePoint's synthetic incident scenarios.

Run from the backend directory:
    python -m unittest discover -s tests -v

These tests exercise the real app.parser.parse_log function without writing to
production evidence storage or requiring a running API server.
"""
from datetime import datetime
from pathlib import Path
import sys
import unittest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.parser import parse_log  # noqa: E402


DEVICE_ID = "synthetic-test-device"
RECEIVED_AT = "2026-10-19T07:00:00+00:00"


class SyntheticIncidentScenarioTests(unittest.TestCase):
    def parse_lines(self, lines, log_type, source_timezone="Asia/Kolkata", received_at=None):
        return [
            parse_log(
                line=line,
                device_id=DEVICE_ID,
                batch_id="synthetic-test-batch",
                log_type=log_type,
                received_at=received_at,
                source_timezone=source_timezone,
            )
            for line in lines
        ]

    def test_01_ssh_failure_burst_followed_by_success(self):
        """Failures and success are extracted and inferred timestamps sort correctly."""
        lines = [
            "Oct 19 10:15:20 linux-server sshd: Failed password for root from 192.0.2.10 port 50231 ssh2",
            "Oct 19 10:20:00 linux-server sshd: Failed password for admin from 192.0.2.10 port 50232 ssh2",
            "Oct 19 10:21:10 linux-server sshd: Failed password for root from 192.0.2.10 port 50233 ssh2",
            "Oct 19 10:24:00 linux-server sshd: Accepted password for admin from 192.0.2.10 port 50234 ssh2",
        ]
        events = self.parse_lines(
            lines, "linux_syslog", source_timezone="Asia/Kolkata", received_at=RECEIVED_AT
        )

        self.assertEqual(
            ["failed_login", "failed_login", "failed_login", "successful_login"],
            [event["event_type"] for event in events],
        )
        self.assertEqual(["root", "admin", "root", "admin"], [e["username"] for e in events])
        self.assertEqual(lines, [event["raw_log"] for event in events])
        self.assertTrue(all(event["timestamp_inferred"] for event in events))
        self.assertTrue(all(event["timestamp_utc"] for event in events))
        times = [datetime.fromisoformat(event["timestamp_utc"]) for event in events]
        self.assertEqual(times, sorted(times))

    def test_02_windows_failed_logins_lockout_then_success(self):
        """Windows event IDs map to expected event types and UTC timestamps."""
        lines = [
            '{"EventID":4625,"TimeCreated":"2026-10-19T10:14:20Z","TargetUserName":"analyst","Message":"An account failed to log on"}',
            '{"EventID":4625,"TimeCreated":"2026-10-19T10:15:20Z","TargetUserName":"analyst","Message":"An account failed to log on"}',
            '{"EventID":4740,"TimeCreated":"2026-10-19T10:16:20Z","TargetUserName":"analyst","Message":"A user account was locked out"}',
            '{"EventID":4624,"TimeCreated":"2026-10-19T10:17:20Z","TargetUserName":"analyst","Message":"An account was successfully logged on"}',
        ]
        events = self.parse_lines(lines, "windows_event")

        self.assertEqual(
            ["failed_login", "failed_login", "account_lockout", "successful_login"],
            [event["event_type"] for event in events],
        )
        self.assertEqual(["analyst"] * 4, [event["username"] for event in events])
        self.assertTrue(all(event["timestamp_source"] == "embedded" for event in events))
        self.assertTrue(all(event["timestamp_utc"] for event in events))
        self.assertTrue(all(event["parse_status"] == "complete" for event in events))

    def test_03_cross_timezone_order_and_malformed_record_gap(self):
        """Equivalent India/UTC instants align, while bad JSON remains visible as a gap."""
        india_line = (
            "2026-10-19 10:30:00.000000+0530 india-host sshd[1234]: "
            "Failed password for admin from 192.0.2.44 port 50300 ssh2"
        )
        utc_line = (
            '{"EventID":4624,"TimeCreated":"2026-10-19T05:00:00Z",'
            '"TargetUserName":"admin","Message":"An account was successfully logged on"}'
        )
        malformed_line = (
            '{"EventID":4625,"TimeCreated":"2026-10-19T05:02:00Z",'
            '"TargetUserName":"admin","Message":"An account failed to log on"'
        )  # Deliberately missing the closing brace for this test case.

        india_event = self.parse_lines([india_line], "macos_unified")[0]
        utc_event = self.parse_lines([utc_line], "windows_event")[0]
        malformed_event = self.parse_lines([malformed_line], "windows_event")[0]

        self.assertEqual(india_event["timestamp_utc"], utc_event["timestamp_utc"])
        self.assertEqual("2026-10-19T05:00:00+00:00", india_event["timestamp_utc"])
        self.assertEqual("2026-10-19T05:00:00+00:00", utc_event["timestamp_utc"])
        self.assertEqual(india_line, india_event["raw_log"])
        self.assertEqual(malformed_line, malformed_event["raw_log"])
        self.assertEqual("partial", malformed_event["parse_status"])
        self.assertIsNone(malformed_event["timestamp"])
        self.assertIn("Invalid JSON log", malformed_event["parse_warnings"])
        self.assertGreater(malformed_event["parse_gap_count"], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
