"""
galleon/api/auth.py
JWT authentication, password hashing, Google OAuth, and FastAPI dependencies.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger("galleon.auth")
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from fastapi import Depends, HTTPException, Request, status

# JWT
from jose import JWTError, jwt

# Password hashing
import bcrypt

# Google OAuth
try:
    import httpx
except ImportError:
    httpx = None  # type: ignore

# ── Config ────────────────────────────────────────────────────────────────────

_default_secret = os.urandom(32).hex()
JWT_SECRET = os.getenv("JWT_SECRET") or _default_secret
if not os.getenv("JWT_SECRET"):
    logger.warning("JWT_SECRET not set — using random secret (tokens won't survive restarts)")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:5173/auth/google/callback")

# ── Password hashing ─────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(user_id: str, org_id: str, extra: Optional[Dict[str, Any]] = None) -> str:
    payload = {
        "sub": user_id,
        "org": org_id,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS),
        "iat": datetime.utcnow(),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Dict[str, Any]:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


# ── FastAPI dependencies ──────────────────────────────────────────────────────

def _extract_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


async def get_current_user(request: Request) -> Dict[str, Any]:
    """Dependency: require valid JWT. Returns {user_id, org_id, ...}."""
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authentication token")
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        org_id = payload.get("org")
        if not user_id or not org_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
        return {"user_id": user_id, "org_id": org_id, **payload}
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


async def get_current_user_optional(request: Request) -> Optional[Dict[str, Any]]:
    """Dependency: extract JWT if present, return None otherwise (for public routes)."""
    token = _extract_token(request)
    if not token:
        return None
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        org_id = payload.get("org")
        if not user_id or not org_id:
            return None
        return {"user_id": user_id, "org_id": org_id, **payload}
    except JWTError:
        return None


# ── Google OAuth ──────────────────────────────────────────────────────────────

import secrets
import time as _time

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

# In-memory store for OAuth state tokens (state -> expiry timestamp)
_oauth_states: Dict[str, float] = {}
_OAUTH_STATE_TTL = 600  # 10 minutes


def get_google_auth_url() -> Optional[tuple]:
    """Return (url, state) tuple or None if not configured."""
    if not GOOGLE_CLIENT_ID:
        return None
    state = secrets.token_urlsafe(32)
    _oauth_states[state] = _time.time() + _OAUTH_STATE_TTL
    # Prune expired states
    now = _time.time()
    expired = [k for k, v in _oauth_states.items() if v < now]
    for k in expired:
        _oauth_states.pop(k, None)
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{GOOGLE_AUTH_URL}?{qs}", state


def verify_oauth_state(state: str) -> bool:
    """Verify and consume an OAuth state token."""
    expiry = _oauth_states.pop(state, None)
    if expiry is None:
        return False
    return _time.time() < expiry


async def exchange_google_code(code: str) -> Optional[Dict[str, Any]]:
    """Exchange authorization code for Google user profile."""
    if not httpx or not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return None
    async with httpx.AsyncClient() as client:
        # Exchange code for tokens
        token_resp = await client.post(GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        })
        if token_resp.status_code != 200:
            return None
        tokens = token_resp.json()
        access_token = tokens.get("access_token")
        if not access_token:
            return None
        # Fetch user profile
        profile_resp = await client.get(GOOGLE_USERINFO_URL, headers={
            "Authorization": f"Bearer {access_token}",
        })
        if profile_resp.status_code != 200:
            return None
        profile = profile_resp.json()
        return {
            "google_id": profile.get("id"),
            "email": profile.get("email"),
            "name": profile.get("name"),
            "picture": profile.get("picture"),
        }


# ── Usage / plan limits ──────────────────────────────────────────────────────

PLAN_LIMITS = {
    "free":       {"seats": 1,  "generations_per_seat": 25},
    "pro":        {"seats": 4,  "generations_per_seat": 500},
    "enterprise": {"seats": 20, "generations_per_seat": None},  # unlimited
}


def check_usage_limit(plan: str, seats: int, monthly_usage: int) -> bool:
    """Return True if usage is within limits, False if exceeded."""
    limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])
    gen_per_seat = limits["generations_per_seat"]
    if gen_per_seat is None:
        return True  # unlimited
    max_generations = gen_per_seat * seats
    return monthly_usage < max_generations


def get_usage_info(plan: str, seats: int, monthly_usage: int) -> Dict[str, Any]:
    """Return usage info dict for the frontend."""
    limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])
    gen_per_seat = limits["generations_per_seat"]
    if gen_per_seat is None:
        return {"used": monthly_usage, "limit": None, "remaining": None, "unlimited": True}
    max_gen = gen_per_seat * seats
    return {
        "used": monthly_usage,
        "limit": max_gen,
        "remaining": max(0, max_gen - monthly_usage),
        "unlimited": False,
    }
