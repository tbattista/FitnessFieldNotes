"""
Encrypt the user's Garmin Personal API key at rest (Fernet / AES-128 + HMAC).

The encryption secret is GARMIN_KEY_ENCRYPTION_SECRET. If that isn't set, it is
derived from FIREBASE_PRIVATE_KEY so the feature works without extra config.
Changing either secret makes stored keys unreadable; the user then reconnects.
"""

import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken

_LABEL = b"ffn-garmin-personal-api-key-v1|"


class SecretBoxError(Exception):
    pass


def _fernet() -> Fernet:
    secret = os.getenv("GARMIN_KEY_ENCRYPTION_SECRET") or os.getenv("FIREBASE_PRIVATE_KEY")
    if not secret:
        raise SecretBoxError("Key storage isn't configured on the server (GARMIN_KEY_ENCRYPTION_SECRET).")
    key = base64.urlsafe_b64encode(hashlib.sha256(_LABEL + secret.encode("utf-8")).digest())
    return Fernet(key)


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken:
        raise SecretBoxError("The saved Garmin key can't be read (server secret changed). Reconnect Garmin.")
