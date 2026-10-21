import json

import httpx

from glitch_api.tools.check_model import MISSING_KEY_MESSAGE, main

SECRET = "sk-or-v1-DO-NOT-LEAK-0123456789"


def _transport(handler):
    return httpx.MockTransport(handler)


def test_check_model_missing_key_prints_actionable_message_and_exits_nonzero(make_settings, capsys) -> None:
    code = main([], settings=make_settings())

    out = capsys.readouterr()
    assert code != 0
    assert MISSING_KEY_MESSAGE in out.err
    assert MISSING_KEY_MESSAGE == "GLITCH_OPENROUTER_API_KEY missing — add it to .env"


def test_check_model_ok_prints_model_ok_for_primary_and_fallbacks(make_settings, capsys) -> None:
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        seen.append({"body": body, "auth": request.headers["authorization"], "url": str(request.url)})
        return httpx.Response(200, json={"model": body["model"], "choices": [{"message": {"content": '{"ok": true}'}}],
                                         "usage": {"prompt_tokens": 9, "completion_tokens": 3}})

    s = make_settings(openrouter_api_key=SECRET, openrouter_model="a/primary", openrouter_fallback_models="b/fallback")
    code = main([], settings=s, transport=_transport(handler))

    out = capsys.readouterr()
    assert code == 0
    assert "MODEL OK a/primary" in out.out
    assert "MODEL OK b/fallback" in out.out
    assert SECRET not in out.out + out.err
    assert [c["body"]["model"] for c in seen] == ["a/primary", "b/fallback"]
    assert seen[0]["url"] == "https://openrouter.ai/api/v1/chat/completions"
    assert seen[0]["auth"] == f"Bearer {SECRET}"
    assert seen[0]["body"]["response_format"]["type"] == "json_schema"
    assert seen[0]["body"]["provider"] == {"require_parameters": True}


def test_check_model_explicit_slug_argument_checks_only_that_slug(make_settings, capsys) -> None:
    models: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        models.append(body["model"])
        return httpx.Response(200, json={"model": body["model"], "choices": [{"message": {"content": "{}"}}]})

    code = main(["c/only"], settings=make_settings(openrouter_api_key=SECRET), transport=_transport(handler))

    assert code == 0
    assert models == ["c/only"]


def test_check_model_auth_failure_reports_type_without_key(make_settings, capsys) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": {"message": "No auth credentials found", "code": 401}})

    code = main([], settings=make_settings(openrouter_api_key=SECRET, openrouter_fallback_models=""),
                transport=_transport(handler))

    out = capsys.readouterr()
    assert code != 0
    assert "AUTH" in out.err
    assert "GLITCH_OPENROUTER_API_KEY" in out.err
    assert SECRET not in out.out + out.err


def test_check_model_unknown_slug_reports_model_not_found(make_settings, capsys) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": {"message": "bad/slug is not a valid model ID", "code": 400}})

    code = main(["bad/slug"], settings=make_settings(openrouter_api_key=SECRET), transport=_transport(handler))

    out = capsys.readouterr()
    assert code != 0
    assert "MODEL_NOT_FOUND bad/slug" in out.err


def test_check_model_timeout_and_rate_limit_are_typed(make_settings, capsys) -> None:
    def timeout_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    def limited_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"error": {"message": "Rate limit exceeded"}})

    s = make_settings(openrouter_api_key=SECRET)
    assert main(["x/y"], settings=s, transport=_transport(timeout_handler)) != 0
    assert main(["x/y"], settings=s, transport=_transport(limited_handler)) != 0

    err = capsys.readouterr().err
    assert "TIMEOUT x/y" in err
    assert "RATE_LIMITED x/y" in err


def test_check_model_200_with_error_body_is_a_provider_error(make_settings, capsys) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"error": {"message": "upstream exploded", "code": 502}})

    code = main(["x/y"], settings=make_settings(openrouter_api_key=SECRET), transport=_transport(handler))

    assert code != 0
    assert "PROVIDER_ERROR x/y" in capsys.readouterr().err
