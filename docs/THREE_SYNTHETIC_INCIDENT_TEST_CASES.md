# TracePoint — Three Synthetic Incident Test Cases

Purpose: provide repeatable, non-production test data for the hackathon demonstration. All IP addresses use documentation-only ranges (for example `192.0.2.0/24`); usernames, hosts, and events are synthetic.

## TC-01 — SSH authentication burst followed by a success

**Input:** Three failed SSH password attempts followed by a successful login. The attempts share the same documentation-only source address.

**Expected results:**
- Four records appear in the timeline in timestamp order.
- The event types are `failed_login`, `failed_login`, `failed_login`, `successful_login`.
- The usernames are extracted as `root`, `admin`, `root`, and `admin`.
- Linux syslog timestamps are marked as inferred from the configured source timezone and receipt time.
- The original raw lines remain available, and the ingested batch can be verified in Evidence using its recorded SHA-256 hash.

**Analyst interpretation:** This sequence is suspicious and warrants review, but it is not by itself proof of a successful compromise.

## TC-02 — Windows failed logins, account lockout, then success

**Input:** Synthetic Windows Security Event JSON with Event IDs 4625, 4625, 4740, and 4624 at one-minute intervals.

**Expected results:**
- The event types appear as `failed_login`, `failed_login`, `account_lockout`, `successful_login`.
- The username `analyst` is extracted from each record.
- Embedded ISO-8601 UTC timestamps are normalized to UTC.
- Records parse as complete and retain the original JSON lines.

**Analyst interpretation:** A lockout followed by a successful login is a lead for investigation, not an automatic conclusion of malicious activity.

## TC-03 — Cross-timezone correlation with a malformed record

**Input:** A macOS-style timestamp at `2026-10-19 10:30:00 +0530`, a Windows event at `2026-10-19T05:00:00Z`, and one deliberately malformed Windows JSON line.

**Expected results:**
- The India-local and UTC timestamps normalize to the same instant, `2026-10-19T05:00:00+00:00`.
- The malformed record is not silently discarded: the original raw line is retained.
- The malformed record is marked `partial`, has no parsed timestamp, and includes an `Invalid JSON log` warning and a positive parsing-gap count.

**Analyst interpretation:** The known UTC instant can be correlated safely; the malformed record should remain visible as incomplete evidence rather than being assigned a guessed timestamp.

## Automated test command

From the repository's `backend/` directory, run:

```bash
python -m unittest discover -s tests -v
```

The tests call the real `app.parser.parse_log` function and do not post data to the live website or write to production evidence storage.

## Manual end-to-end demonstration checklist

For each case, use the Log Ingestion Lab to ingest the corresponding synthetic scenario. Confirm the returned batch ID and SHA-256 hash, inspect the parsed events, open the Timeline, and run Evidence → Verify. Do not use real credentials, real customer logs, or production incident data for these demonstrations.

Record the actual test output and observed pass/fail result in the final technical report. Do not label a case “passed” until it has been run against the current build.
