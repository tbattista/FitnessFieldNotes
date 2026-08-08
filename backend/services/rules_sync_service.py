"""
Firestore Rules Sync Service

Keeps the deployed Firestore security rules in sync with the repo's
firestore.rules file. Runs once at app startup: if the deployed ruleset
differs from the local file, publishes the local file via the Firebase
Rules REST API using the same service-account credentials the Admin SDK
already uses.

This makes firestore.rules the source of truth — committing a rules
change and deploying the app is enough; no manual `firebase deploy`
step is required.
"""

import os
import logging
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

RULES_API = "https://firebaserules.googleapis.com/v1"
RELEASE_NAME = "cloud.firestore"
RULES_FILE = Path(__file__).resolve().parents[2] / "firestore.rules"


def _get_access_token():
    """Build a cloud-platform access token from the Firebase env credentials."""
    project_id = os.getenv("FIREBASE_PROJECT_ID")
    private_key = os.getenv("FIREBASE_PRIVATE_KEY")
    client_email = os.getenv("FIREBASE_CLIENT_EMAIL")
    if not all([project_id, private_key, client_email]):
        return None, None

    from google.oauth2 import service_account
    from google.auth.transport.requests import Request

    info = {
        "type": "service_account",
        "project_id": project_id,
        "private_key": private_key.replace("\\n", "\n"),
        "client_email": client_email,
        "token_uri": os.getenv("FIREBASE_TOKEN_URI", "https://oauth2.googleapis.com/token"),
    }
    creds = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    creds.refresh(Request())
    return creds.token, project_id


def _get_deployed_rules(token: str, project_id: str):
    """Return the currently released Firestore rules source, or None."""
    headers = {"Authorization": f"Bearer {token}"}
    release = requests.get(
        f"{RULES_API}/projects/{project_id}/releases/{RELEASE_NAME}",
        headers=headers,
        timeout=15,
    )
    if release.status_code != 200:
        return None
    ruleset_name = release.json().get("rulesetName")
    if not ruleset_name:
        return None
    ruleset = requests.get(f"{RULES_API}/{ruleset_name}", headers=headers, timeout=15)
    if ruleset.status_code != 200:
        return None
    files = ruleset.json().get("source", {}).get("files", [])
    return files[0].get("content") if files else None


def sync_firestore_rules():
    """Publish firestore.rules if it differs from the deployed ruleset.

    Never raises — rules sync must not block app startup.
    """
    try:
        if not RULES_FILE.exists():
            logger.info("Rules sync: no firestore.rules file found, skipping")
            return

        local_rules = RULES_FILE.read_text()

        token, project_id = _get_access_token()
        if not token:
            logger.info("Rules sync: Firebase credentials not configured, skipping")
            return

        deployed = _get_deployed_rules(token, project_id)
        if deployed is not None and deployed.strip() == local_rules.strip():
            logger.info("✅ Rules sync: deployed Firestore rules already up to date")
            return

        headers = {"Authorization": f"Bearer {token}"}
        ruleset_resp = requests.post(
            f"{RULES_API}/projects/{project_id}/rulesets",
            headers=headers,
            json={"source": {"files": [{"name": "firestore.rules", "content": local_rules}]}},
            timeout=30,
        )
        if ruleset_resp.status_code != 200:
            logger.error(f"❌ Rules sync: ruleset creation failed ({ruleset_resp.status_code}): {ruleset_resp.text[:500]}")
            return
        ruleset_name = ruleset_resp.json()["name"]

        release_resp = requests.patch(
            f"{RULES_API}/projects/{project_id}/releases/{RELEASE_NAME}",
            headers=headers,
            json={"release": {"name": f"projects/{project_id}/releases/{RELEASE_NAME}", "rulesetName": ruleset_name}},
            timeout=30,
        )
        if release_resp.status_code != 200:
            logger.error(f"❌ Rules sync: release update failed ({release_resp.status_code}): {release_resp.text[:500]}")
            return

        logger.info(f"✅ Rules sync: published Firestore rules ({ruleset_name})")

    except Exception as e:
        logger.error(f"❌ Rules sync failed (non-fatal): {e}")
