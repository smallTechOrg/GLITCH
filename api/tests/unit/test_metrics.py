from glitch_api.metrics import get_metrics, reset_metrics


def test_metrics_snapshot_counts_llm_calls_tokens_and_caps() -> None:
    m = get_metrics()
    m.record_request()
    m.record_llm_call(outcome="ok", prompt_tokens=120, completion_tokens=80)
    m.record_llm_call(outcome="timeout")
    m.record_cap_rejection("device")
    m.record_cache(hit=True)
    m.record_cache(hit=False)
    m.record_cache(hit=False)

    snap = m.snapshot()

    assert snap["requests_total"] == 1
    assert snap["llm_calls_total"] == 2
    assert snap["llm_calls_by_outcome"]["ok"] == 1
    assert snap["llm_calls_by_outcome"]["timeout"] == 1
    assert snap["prompt_tokens_total"] == 120
    assert snap["completion_tokens_total"] == 80
    assert snap["cap_rejections"] == {"device": 1, "global": 0}
    assert snap["cache_hits"] == 1 and snap["cache_misses"] == 2
    assert abs(snap["cache_hit_rate"] - 1 / 3) < 1e-9
    assert snap["since"].endswith("Z")


def test_metrics_cache_hit_rate_is_zero_when_no_cache_traffic_and_reset_clears() -> None:
    m = get_metrics()
    m.record_request()
    assert m.snapshot()["cache_hit_rate"] == 0.0

    reset_metrics()

    assert get_metrics() is not m
    assert get_metrics().snapshot()["requests_total"] == 0
