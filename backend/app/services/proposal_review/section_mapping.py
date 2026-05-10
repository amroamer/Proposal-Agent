"""Canonical KPMG proposal section keys + Arabic-title lookup.

Every KPMG technical proposal follows the same templated section order
(table of contents on slide 5). Section markers in the extracted text
look like `01 – معايير التقييم`, `02 – الملخص التنفيذي`, etc.: a two-
digit number, a separator (en-dash or hyphen), then the Arabic title.

The splitter normalises the title and looks it up here to map onto a
stable English `section_key` that the rest of the pipeline (dossier
schemas, group routing, evidence source field) keys off.
"""
from __future__ import annotations

# Canonical keys — DO NOT rename these without updating dossier_schemas.py,
# group_routing.py, the Phase-5 evidence_source validator, and any data
# already persisted to the dossiers / proposal_criterion_reviews tables.
SECTION_KEYS: tuple[str, ...] = (
    "evaluation_criteria",
    "executive_summary",
    "our_understanding",
    "value_proposition",
    "our_perspective",
    "detailed_approach",
    "team_structure",
    "detailed_experience",
    "tools_methodologies",
    "kpmg_profile",
    "certifications",
    "terms",
    "assumptions",
)

# `front_matter` is reserved for slides that appear BEFORE the first
# numbered section marker (cover page, agenda, etc.). It is a real key
# in the dossier output, but it is not part of the canonical 13.
FRONT_MATTER_KEY = "front_matter"

# Bilingual labels for the canonical sections. The English labels are
# what the Phase-5 multi-select shows when the editor toggles off the
# "whole proposal" switch.
SECTION_LABELS: dict[str, dict[str, str]] = {
    "evaluation_criteria":  {"en": "Evaluation Criteria",        "ar": "معايير التقييم"},
    "executive_summary":    {"en": "Executive Summary",          "ar": "الملخص التنفيذي"},
    "our_understanding":    {"en": "Our Understanding",          "ar": "فهمنا لمتطلباتكم"},
    "value_proposition":    {"en": "Value Proposition",          "ar": "القيمة التي نقدمها"},
    "our_perspective":      {"en": "Our Point of View (Our POV)", "ar": "وجهة نظرنا"},
    "detailed_approach":    {"en": "Detailed Approach & Timeline", "ar": "نهجنا المُفصّل والجدول الزمني"},
    "team_structure":       {"en": "Our Team Structure",         "ar": "الهيكل التنظيمي والسير الذاتية"},
    "detailed_experience":  {"en": "Detailed Experience",        "ar": "الخبرات التفصيلية في مشاريع مشابهة"},
    "tools_methodologies":  {"en": "Tools & Methodologies",      "ar": "الأدوات والمنهجيات"},
    "kpmg_profile":         {"en": "KPMG Profile",               "ar": "الملف التعريفي بشركة كي بي إم جي"},
    "certifications":       {"en": "Legal Documents",            "ar": "السجلات والشهادات النظامية"},
    "terms":                {"en": "Terms and Conditions",       "ar": "الشروط والأحكام العامة"},
    "assumptions":          {"en": "Assumptions",                "ar": "الافتراضات"},
}


# Lookup table: each entry is a list of *canonicalised* substrings that,
# if found in the normalised section title, identify the key. Multiple
# substrings cover plural / abbreviated / synonym wordings KPMG decks
# vary across (e.g. "النهج" vs "نهجنا", "السيرة" vs "السير الذاتية").
#
# Matching is substring-based AFTER normalisation (see _normalise below)
# so cosmetic differences (tashkeel, alef variants, stretched kashida,
# trailing punctuation) do not break detection.
_AR_KEYWORDS: dict[str, tuple[str, ...]] = {
    "evaluation_criteria":  ("معايير التقييم", "معايير تقييم"),
    "executive_summary":    ("الملخص التنفيذي", "ملخص تنفيذي"),
    "our_understanding":    ("فهمنا", "فهم المتطلبات", "فهم متطلبات"),
    "value_proposition":    ("القيمة التي نقدمها", "القيمة المقدمة", "القيمه التي نقدمها"),
    "our_perspective":      ("وجهة نظرنا", "وجهه نظرنا", "رؤيتنا"),
    "detailed_approach":    ("النهج", "نهجنا", "المنهجية المفصلة", "الجدول الزمني"),
    "team_structure":       ("الهيكل التنظيمي", "السير الذاتية", "السيرة الذاتية", "الفريق"),
    "detailed_experience":  ("الخبرات", "مشاريع مشابهة", "الخبرة التفصيلية"),
    "tools_methodologies":  ("الأدوات والمنهجيات", "ادوات ومنهجيات", "المنهجيات والأدوات"),
    "kpmg_profile":         ("كي بي ام جي", "كي بي إم جي", "kpmg", "الملف التعريفي"),
    "certifications":       ("الشهادات", "السجلات", "الشهادات النظامية"),
    "terms":                ("الشروط والأحكام", "الشروط", "الاحكام", "الأحكام"),
    "assumptions":          ("الافتراضات", "الافتراضات والاستثناءات"),
}

# English fallback keywords — used when a deck mixes EN/AR section titles
# (e.g. "01 – Executive Summary"). Same substring-after-normalise logic.
_EN_KEYWORDS: dict[str, tuple[str, ...]] = {
    "evaluation_criteria":  ("evaluation criteria",),
    "executive_summary":    ("executive summary",),
    "our_understanding":    ("our understanding", "understanding of",),
    "value_proposition":    ("value we provide", "value proposition",),
    "our_perspective":      ("our perspective", "our point of view", "our view",),
    "detailed_approach":    ("detailed approach", "approach and timeline", "approach & timeline",),
    "team_structure":       ("org structure", "team structure", "cvs", "team and cv",),
    "detailed_experience":  ("detailed experience", "similar projects", "experience in similar",),
    "tools_methodologies":  ("tools and methodologies", "tools & methodologies", "methodologies and tools",),
    "kpmg_profile":         ("kpmg profile", "about kpmg",),
    "certifications":       ("certifications", "records and certifications", "records & certifications",),
    "terms":                ("general terms", "terms and conditions", "terms & conditions",),
    "assumptions":          ("assumptions",),
}


# Arabic letter normalisation — strips tashkeel and folds variant alefs
# / yaa / taa-marbuta so substring matching is robust across decks that
# differ only in diacritics or visually-similar characters.
_TASHKEEL = (
    "ًٌٍَُِّْٰٕٓٔ"
)
_AR_FOLD = str.maketrans({
    "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا",
    "ى": "ي", "ئ": "ي",
    "ؤ": "و",
    "ة": "ه",
    "ـ": "",   # kashida / tatweel
})


def _normalise(s: str) -> str:
    """Lowercase, strip tashkeel, fold alef/yaa/taa-marbuta variants,
    collapse whitespace. Used on BOTH the deck title and the lookup
    keywords so matching is symmetric."""
    if not s:
        return ""
    out = s.lower()
    out = "".join(ch for ch in out if ch not in _TASHKEEL)
    out = out.translate(_AR_FOLD)
    out = " ".join(out.split())
    return out


def map_title_to_key(title: str) -> str | None:
    """Map a section heading (Arabic, English, or mixed) onto a canonical
    `section_key`. Returns None when no entry matches — caller logs a
    warning and treats the section as unrecognised."""
    if not title:
        return None
    norm = _normalise(title)
    if not norm:
        return None

    # Try Arabic first (the dominant template language), then English.
    # Score by longest-substring-match so "الخبرات التفصيلية في مشاريع
    # مشابهة" prefers `detailed_experience` over a shorter overlap.
    best_key: str | None = None
    best_len: int = 0
    for key, keywords in _AR_KEYWORDS.items():
        for kw in keywords:
            nkw = _normalise(kw)
            if nkw and nkw in norm and len(nkw) > best_len:
                best_key, best_len = key, len(nkw)
    for key, keywords in _EN_KEYWORDS.items():
        for kw in keywords:
            nkw = _normalise(kw)
            if nkw and nkw in norm and len(nkw) > best_len:
                best_key, best_len = key, len(nkw)
    return best_key


def english_label(key: str) -> str:
    """Return the canonical English label for a section_key, or the key
    itself if not in the table (e.g. `front_matter`)."""
    entry = SECTION_LABELS.get(key)
    return entry["en"] if entry else key


def arabic_label(key: str) -> str:
    """Return the canonical Arabic label for a section_key, or '' if not
    in the table."""
    entry = SECTION_LABELS.get(key)
    return entry["ar"] if entry else ""
