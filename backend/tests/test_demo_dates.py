"""Demo scenarios must be dated from the clock, not from the fixture text.

Run from the backend directory:
    python -m unittest discover -s tests -v
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
import sys
import unittest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import app.main as main  # noqa: E402
from app.parser import parse_log  # noqa: E402

IST = ZoneInfo("Asia/Kolkata")


class FrozenClockMixin:
    def render_at(self, moment, scenario):
        """Render a scenario as if the clock read `moment`."""
        real = main.datetime

        class Frozen(real):
            @classmethod
            def now(cls, tz=None):
                return moment.astimezone(tz) if tz else moment.replace(tzinfo=None)

        main.datetime = Frozen
        try:
            return main._render_demo_lines(scenario)
        finally:
            main.datetime = real


class DemoScenarioDatingTests(FrozenClockMixin, unittest.TestCase):
    def test_newest_line_sits_at_the_current_moment(self):
        scenario = main.DEMO_SCENARIOS["incident_01_ssh_bruteforce"]
        now = datetime(2027, 3, 8, 7, 15, 45, tzinfo=IST)

        lines = self.render_at(now, scenario)

        self.assertTrue(lines[-1].startswith("Mar 08 07:15:45"))

    def test_date_follows_the_clock_rather_than_the_fixture(self):
        scenario = main.DEMO_SCENARIOS["ssh_failures"]

        for now, expected in (
            (datetime(2026, 11, 1, 18, 42, 9, tzinfo=IST), "Nov 01"),
            (datetime(2026, 12, 25, 23, 59, 30, tzinfo=IST), "Dec 25"),
            (datetime(2028, 2, 29, 14, 0, 0, tzinfo=IST), "Feb 29"),
        ):
            with self.subTest(now=now):
                for line in self.render_at(now, scenario):
                    self.assertTrue(line.startswith(expected), line)

    def test_gaps_between_lines_are_preserved(self):
        scenario = main.DEMO_SCENARIOS["incident_01_ssh_bruteforce"]
        now = datetime(2026, 11, 1, 18, 42, 9, tzinfo=IST)

        events = [
            parse_log(
                line=line,
                device_id="demo-device-01",
                batch_id="test",
                log_type=scenario["log_type"],
                received_at=now.isoformat(),
                source_timezone="Asia/Kolkata",
            )
            for line in self.render_at(now, scenario)
        ]
        times = [datetime.fromisoformat(event["timestamp"]) for event in events]

        # The fixture burst runs 10:15:20 -> 10:24:00, so 8m40s end to end.
        self.assertEqual(timedelta(minutes=8, seconds=40), times[-1] - times[0])
        self.assertEqual(times, sorted(times))

    def test_cross_timezone_scenarios_share_one_instant(self):
        now = datetime(2026, 11, 1, 18, 42, 9, tzinfo=IST)
        instants = set()

        for key in ("tz_india", "tz_london", "tz_new_york", "tz_linux_new_york"):
            scenario = main.DEMO_SCENARIOS[key]
            for line in self.render_at(now, scenario):
                event = parse_log(
                    line=line,
                    device_id="demo-device-01",
                    batch_id="test",
                    log_type=scenario["log_type"],
                    received_at=now.isoformat(),
                    source_timezone=scenario.get("source_timezone", "Asia/Kolkata"),
                )
                instants.add(event["timestamp_utc"])

        self.assertEqual(1, len(instants), instants)

    def test_no_scenario_renders_into_the_future(self):
        now = datetime(2026, 11, 1, 18, 42, 9, tzinfo=IST)

        for key, scenario in main.DEMO_SCENARIOS.items():
            for line in self.render_at(now, scenario):
                event = parse_log(
                    line=line,
                    device_id="demo-device-01",
                    batch_id="test",
                    log_type=scenario["log_type"],
                    received_at=now.isoformat(),
                    source_timezone=scenario.get("source_timezone", "Asia/Kolkata"),
                )
                if not event["timestamp_utc"]:
                    continue
                with self.subTest(scenario=key):
                    self.assertLessEqual(
                        datetime.fromisoformat(event["timestamp_utc"]),
                        now.astimezone(timezone.utc),
                    )
                    self.assertFalse(event["timestamp_conflict"])

    def test_fixtures_still_carry_their_reference_year(self):
        """The literal dates are a reference point, so keep them in step."""
        self.assertEqual(2026, main.DEMO_FIXTURE_YEAR)


if __name__ == "__main__":
    unittest.main()
