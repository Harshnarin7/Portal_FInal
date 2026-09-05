"""Transactional email via AWS SES (SAE notifications, etc.)."""

import logging
import os
from html import escape

logger = logging.getLogger(__name__)


def send_email(to_addresses: list[str], subject: str, html_body: str) -> bool:
    """Send one HTML email. Never raises — logs and returns False on failure."""
    recipients = [a for a in (to_addresses or []) if a]
    if not recipients:
        logger.warning("SES send skipped: no recipient addresses")
        return False

    sender = (os.environ.get("SES_SENDER_EMAIL") or "").strip()
    if not sender:
        logger.error(
            "SES send skipped: SES_SENDER_EMAIL is not set. "
            "Verify a sender identity in the SES console and set the env var."
        )
        return False

    try:
        import boto3
        from botocore.config import Config
        from botocore.exceptions import ClientError, BotoCoreError

        ses_config = Config(
            connect_timeout=5,
            read_timeout=15,
            retries={"mode": "standard", "total_max_attempts": 3},
        )
        ses_client = boto3.client(
            "ses",
            region_name=os.environ.get("AWS_REGION", "ap-south-1"),
            config=ses_config,
        )
        ses_client.send_email(
            Source=sender,
            Destination={"ToAddresses": recipients},
            Message={
                "Subject": {"Data": subject},
                "Body": {"Html": {"Data": html_body}},
            },
        )
        return True
    except ClientError as exc:
        code = (exc.response or {}).get("Error", {}).get("Code", "unknown")
        logger.exception("SES send_email failed (code=%s)", code)
        return False
    except (BotoCoreError, Exception):
        logger.exception("SES send_email failed")
        return False


def _cell(value) -> str:
    if value is None or value == "":
        return "—"
    return escape(str(value))


def build_sae_notification_html(record, site_display, severity_label, portal_url) -> str:
    """Self-contained HTML for the SAE-created notification. No PII beyond
    enrollment id / reporter name — SAEReport does not store mother/baby UID."""
    rows = [
        ("Site", site_display),
        ("Enrollment ID", getattr(record, "enrollment_id", None)),
        ("Report Type", getattr(record, "report_type", None)),
        ("Diagnosis", getattr(record, "diagnosis", None)),
        ("Onset Date", getattr(record, "onset_datetime", None)),
        ("Severity", severity_label),
        ("Causality", getattr(record, "causality", None)),
        ("Outcome", getattr(record, "outcome", None)),
        ("Reporter Name", getattr(record, "reporter_name", None)),
    ]
    table_rows = "".join(
        f'<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;'
        f'color:#64748b;font-size:13px;width:38%;vertical-align:top;">{escape(label)}</td>'
        f'<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;'
        f'color:#0f172a;font-size:13px;font-weight:600;">{_cell(value)}</td></tr>'
        for label, value in rows
    )
    safe_url = escape(portal_url or "", quote=True)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Serious adverse event reported</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:#b45309;padding:18px 24px;color:#fff;">
              <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.9;">PORTAL Trial</div>
              <div style="font-size:20px;font-weight:700;margin-top:4px;">Serious adverse event reported</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                {table_rows}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;text-align:center;">
              <a href="{safe_url}"
                 style="display:inline-block;background:#0f4c81;color:#ffffff;text-decoration:none;
                        font-weight:700;font-size:14px;padding:12px 22px;border-radius:6px;">
                View full report in PORTAL
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 20px 24px;color:#94a3b8;font-size:11px;line-height:1.5;">
              This is an automated notification from the PORTAL Trial data system. Do not reply to this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
