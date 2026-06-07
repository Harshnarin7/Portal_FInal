"""
Security event logging (CloudWatch / DPDP breach-awareness).

Emits structured JSON to the `portal.security` logger for ingestion by
CloudWatch Logs, Datadog, or similar. Configure alerts on:
  - failed_login_spike
  - rate_limit_exceeded
  - bulk_data_access
  - suspicious_path_access
"""

import json
import logging
import os
import time
from collections import defaultdict
from threading import Lock

security_logger = logging.getLogger("portal.security")

# In-memory counters (per process); use Redis in multi-worker production.
_lock = Lock()
_failed_logins_by_ip: dict[str, list[float]] = defaultdict(list)
_request_counts_by_ip: dict[str, int] = defaultdict(int)

FAILED_LOGIN_ALERT_THRESHOLD = int(os.getenv("SECURITY_FAILED_LOGIN_THRESHOLD", "10"))
FAILED_LOGIN_WINDOW_SECONDS = int(os.getenv("SECURITY_FAILED_LOGIN_WINDOW", "900"))
BULK_LIST_THRESHOLD = int(os.getenv("SECURITY_BULK_LIST_THRESHOLD", "100"))


def _configure_security_logger():
    if security_logger.handlers:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    security_logger.addHandler(handler)
    security_logger.setLevel(logging.INFO)


_configure_security_logger()


def log_security_event(event_type: str, **payload):
    record = {
        "event_type": event_type,
        "service": "portal-trial-api",
        "timestamp": time.time(),
        **payload,
    }
    security_logger.info(json.dumps(record, default=str))


def record_failed_login(ip: str, username: str):
    now = time.time()
    with _lock:
        attempts = _failed_logins_by_ip[ip]
        attempts.append(now)
        cutoff = now - FAILED_LOGIN_WINDOW_SECONDS
        _failed_logins_by_ip[ip] = [t for t in attempts if t >= cutoff]
        count = len(_failed_logins_by_ip[ip])

    log_security_event(
        "failed_login",
        ip=ip,
        username=username,
        attempts_in_window=count,
    )
    if count >= FAILED_LOGIN_ALERT_THRESHOLD:
        log_security_event(
            "failed_login_spike",
            severity="high",
            ip=ip,
            attempts_in_window=count,
            message="Possible brute-force attack — review for breach notification (DPDP §8)",
        )


def record_successful_login(username: str, ip: str):
    log_security_event("successful_login", username=username, ip=ip)


def record_rate_limit(ip: str, path: str):
    log_security_event("rate_limit_exceeded", ip=ip, path=path, severity="medium")


def record_bulk_access(
    username: str,
    path: str,
    record_count: int,
    ip: str | None = None,
):
    log_security_event(
        "bulk_data_access",
        username=username,
        path=path,
        record_count=record_count,
        ip=ip,
    )
    if record_count >= BULK_LIST_THRESHOLD:
        log_security_event(
            "bulk_data_access_alert",
            severity="medium",
            username=username,
            path=path,
            record_count=record_count,
            message="Large data export — verify authorized use",
        )


def record_suspicious_request(ip: str, path: str, reason: str):
    log_security_event(
        "suspicious_request",
        severity="medium",
        ip=ip,
        path=path,
        reason=reason,
    )


def increment_request_count(ip: str) -> int:
    with _lock:
        _request_counts_by_ip[ip] += 1
        return _request_counts_by_ip[ip]
