"""Ask NOVA why (Phase 3): server-side item resolution, the explain pipeline and its cache.

- ``content`` — the 9 bundled v3 content JSON files (``content/v3/<gameId>.json``).
- ``items`` — ``items_for(...)``: the explainable items of one game's data (v3 or variation).
- ``schemas`` — request / response DTOs, the LLM JSON schema and the output validators.
- ``pipeline`` — ``run_explain(...)`` (``spec/agent.md`` → Composition 3).
- ``fake`` — the deterministic demo explanation (registered with the demo provider).
"""
