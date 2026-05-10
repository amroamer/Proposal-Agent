"""Phase 4 — group → section-key routing for the criterion runner.

Each framework criterion carries a free-text `group` tag. The runner
uses that tag to look up which dossier sections to send the LLM when
evaluating that criterion. This module is the SINGLE source of truth
for that mapping.

  - `["*"]` is the wildcard — send the entire dossier.
  - Any other value is a list of canonical section_keys.
  - Unknown groups fall back to `["*"]` (with a warning logged).

In Phase 5 this in-code mapping becomes a fallback: the criteria table
gets an `evidence_source` JSONB column that overrides this routing per
criterion. Tooling that lists "what would route where" reads from
GROUP_TO_SECTIONS but defers to a per-row override if present.
"""
from __future__ import annotations

import logging

from .section_mapping import SECTION_KEYS

logger = logging.getLogger(__name__)


WILDCARD = "*"

# Default routing — case-insensitive lookup is applied via _normalise.
# Keys are the framework-criterion `group` tag; values are lists of
# canonical section_keys, or [WILDCARD] for whole-proposal evaluation.
GROUP_TO_SECTIONS: dict[str, list[str]] = {
    "Assessment":   [WILDCARD],   # holistic readiness check across full doc
    "Strategy":     ["executive_summary", "value_proposition", "our_perspective"],
    "Methodology":  ["detailed_approach", "our_understanding"],
    "Team":         ["team_structure"],
    "Experience":   ["detailed_experience"],
    "Tools":        ["tools_methodologies"],
    "Compliance":   ["certifications", "terms"],
}

DEFAULT_FALLBACK: list[str] = [WILDCARD]


def _normalise_group(group: str | None) -> str:
    return (group or "").strip().lower()


# Pre-built case-insensitive index of GROUP_TO_SECTIONS keys.
_INDEX: dict[str, list[str]] = {
    _normalise_group(k): v for k, v in GROUP_TO_SECTIONS.items()
}


def resolve_sections_for_group(group: str | None) -> list[str]:
    """Return the section_keys to evaluate against for a given group tag.

    Unknown groups → DEFAULT_FALLBACK (whole proposal) with a warning.
    """
    norm = _normalise_group(group)
    if norm not in _INDEX:
        logger.warning(
            "group_routing: unknown group=%r — falling back to whole-proposal "
            "evaluation. If this is intentional, add %r to GROUP_TO_SECTIONS.",
            group, group,
        )
        return list(DEFAULT_FALLBACK)
    return list(_INDEX[norm])


def is_wildcard(sections: list[str]) -> bool:
    """`["*"]` is the only valid wildcard form — used by both the code-
    driven mapping and the Phase-5 evidence_source field."""
    return sections == [WILDCARD]


def validate_evidence_source(value: list[str] | None) -> list[str]:
    """Validator shared by the Phase-5 Pydantic schema and any code path
    that hand-writes an evidence_source list.

    Rules:
      - None / empty → DEFAULT_FALLBACK.
      - `[WILDCARD]` is allowed and MUST be the only entry.
      - Otherwise every entry must be a canonical section_key.

    Raises ValueError on invalid input.
    """
    if not value:
        return list(DEFAULT_FALLBACK)
    if WILDCARD in value:
        if value != [WILDCARD]:
            raise ValueError(
                f"evidence_source: '*' must be the only entry, got {value!r}"
            )
        return [WILDCARD]
    invalid = [v for v in value if v not in SECTION_KEYS]
    if invalid:
        raise ValueError(
            f"evidence_source: unknown section keys {invalid!r}. "
            f"Allowed: {list(SECTION_KEYS) + [WILDCARD]}"
        )
    # Deduplicate while preserving order; SECTION_KEYS values are
    # already plain strings so this is safe.
    seen: set[str] = set()
    out: list[str] = []
    for v in value:
        if v not in seen:
            seen.add(v)
            out.append(v)
    return out
