"""Live key + model check: one minimal real OpenRouter call per model slug, plain HTTP.

    cd api && uv run python -m glitch_api.tools.check_model            # primary + fallbacks
    cd api && uv run python -m glitch_api.tools.check_model vendor/slug # just that slug

Prints ``MODEL OK <slug>`` per working slug (stdout) or ``<ERROR_TYPE> <slug>: <hint>``
(stderr). Exit 0 only when every checked slug works. The key is read from the repo-root
``.env`` via Settings and is never printed.

Error types: MISSING_KEY, AUTH, CREDITS, MODEL_NOT_FOUND, NO_SCHEMA_SUPPORT,
RATE_LIMITED, TIMEOUT, NETWORK, PROVIDER_ERROR, BAD_RESPONSE.
"""

from __future__ import annotations

import sys
from collections.abc import Sequence
from typing import Any

import httpx

from glitch_api.config import Settings, get_settings

MISSING_KEY_MESSAGE = "GLITCH_OPENROUTER_API_KEY missing — add it to .env"

_CHECK_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"ok": {"type": "boolean"}},
    "required": ["ok"],
    "additionalProperties": False,
}


class CheckFailure(Exception):
    def __init__(self, kind: str, hint: str) -> None:
        super().__init__(f"{kind}: {hint}")
        self.kind = kind
        self.hint = hint


def _error_text(resp: httpx.Response) -> str:
    try:
        payload = resp.json()
    except ValueError:
        return ""
    err = payload.get("error") if isinstance(payload, dict) else None
    if isinstance(err, dict):
        return str(err.get("message", ""))[:200]
    return ""


def _classify(status: int, detail: str) -> CheckFailure:
    low = detail.lower()
    if status in (401, 403):
        return CheckFailure("AUTH", "OpenRouter key rejected — check GLITCH_OPENROUTER_API_KEY in .env")
    if status == 402:
        return CheckFailure("CREDITS", "OpenRouter account has insufficient credits")
    if status == 404 and ("endpoint" in low or "parameter" in low or "support" in low):
        return CheckFailure(
            "NO_SCHEMA_SUPPORT",
            "no provider for this model supports json_schema — pick another slug or set "
            "GLITCH_OPENROUTER_RESPONSE_FORMAT=json_object",
        )
    if status == 404 or "not a valid model" in low or "model not found" in low:
        return CheckFailure("MODEL_NOT_FOUND", "model slug not found — check GLITCH_OPENROUTER_MODEL")
    if status == 429:
        return CheckFailure("RATE_LIMITED", "OpenRouter rate limit hit — wait and retry")
    if status == 408:
        return CheckFailure("TIMEOUT", "OpenRouter timed out")
    return CheckFailure("PROVIDER_ERROR", f"HTTP {status} {detail}".strip())


def check_one(client: httpx.Client, settings: Settings, slug: str) -> str:
    """One real chat completion. Returns the model OpenRouter actually used."""
    assert settings.openrouter_api_key is not None
    body: dict[str, Any] = {
        "model": slug,
        "messages": [{"role": "user", "content": 'Reply with the JSON object {"ok": true} and nothing else.'}],
        "max_tokens": 50,
        "temperature": 0,
        "provider": {"require_parameters": True},
    }
    if settings.openrouter_response_format == "json_schema":
        body["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "check", "strict": True, "schema": _CHECK_SCHEMA},
        }
    else:
        body["response_format"] = {"type": "json_object"}

    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key.get_secret_value()}",
        "HTTP-Referer": settings.app_url,
        "X-Title": "GLITCH",
    }
    url = settings.openrouter_base_url.rstrip("/") + "/chat/completions"
    try:
        resp = client.post(url, json=body, headers=headers)
    except httpx.TimeoutException as exc:
        raise CheckFailure("TIMEOUT", f"no answer within {settings.llm_timeout_s:g}s") from exc
    except httpx.HTTPError as exc:
        raise CheckFailure("NETWORK", f"could not reach OpenRouter ({type(exc).__name__})") from exc

    if resp.status_code != 200:
        raise _classify(resp.status_code, _error_text(resp))
    try:
        payload = resp.json()
    except ValueError as exc:
        raise CheckFailure("BAD_RESPONSE", "OpenRouter returned non-JSON") from exc
    if not isinstance(payload, dict):
        raise CheckFailure("BAD_RESPONSE", "OpenRouter returned an unexpected body")
    if "error" in payload:
        err = payload["error"] if isinstance(payload["error"], dict) else {}
        code = err.get("code")
        raise _classify(code if isinstance(code, int) else 502, str(err.get("message", ""))[:200])
    choices = payload.get("choices") or []
    if not choices or not isinstance(choices[0], dict):
        raise CheckFailure("BAD_RESPONSE", "OpenRouter returned no choices")
    return str(payload.get("model") or slug)


def main(
    argv: Sequence[str] | None = None,
    *,
    settings: Settings | None = None,
    transport: httpx.BaseTransport | None = None,
) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    settings = settings or get_settings()
    if not settings.has_openrouter_key:
        print(MISSING_KEY_MESSAGE, file=sys.stderr)
        return 2

    slugs = args or [settings.openrouter_model, *settings.fallback_model_list]
    failures = 0
    with httpx.Client(timeout=max(settings.llm_timeout_s, 15.0), transport=transport) as client:
        for slug in slugs:
            try:
                used = check_one(client, settings, slug)
            except CheckFailure as exc:
                failures += 1
                print(f"{exc.kind} {slug}: {exc.hint}", file=sys.stderr)
                continue
            suffix = "" if used == slug else f" (served by {used})"
            print(f"MODEL OK {slug}{suffix}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
