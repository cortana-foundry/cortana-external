"""Evaluation helpers for comparing practical scoring models.

Keep this package lightweight so importing submodules such as
`evaluation.artifact_contracts` or `evaluation.run_manifest` does not force
the heavier comparison module to load unless its symbols are actually used.
"""

from importlib import import_module
from typing import Any

__all__ = [
    "ARTIFACT_FAMILY_MARKET_BRIEF",
    "ARTIFACT_FAMILY_READINESS_CHECK",
    "ARTIFACT_FAMILY_RUN_MANIFEST",
    "ARTIFACT_FAMILY_STRATEGY_ALERT",
    "ARTIFACT_SCHEMA_VERSION",
    "ModelFamily",
    "OUTCOME_ANALYSIS_FAILED",
    "OUTCOME_DEGRADED_RISKY",
    "OUTCOME_DEGRADED_SAFE",
    "OUTCOME_HEALTHY_CANDIDATES_FOUND",
    "OUTCOME_HEALTHY_NO_CANDIDATES",
    "OUTCOME_MARKET_GATE_BLOCKED",
    "RUN_MANIFEST_OUTCOME_COMPLETED",
    "RUN_MANIFEST_OUTCOME_FAILED",
    "TaxonomyResult",
    "annotate_artifact",
    "attach_model_family_scores",
    "build_artifact_metadata",
    "build_default_model_families",
    "build_run_manifest",
    "classify_market_brief_outcome",
    "classify_strategy_outcome",
    "compare_model_families",
    "render_model_comparison_report",
    "score_enhanced_rank",
    "validate_artifact_payload",
]

_EXPORTS: dict[str, tuple[str, str]] = {
    "ARTIFACT_FAMILY_MARKET_BRIEF": ("evaluation.artifact_contracts", "ARTIFACT_FAMILY_MARKET_BRIEF"),
    "ARTIFACT_FAMILY_READINESS_CHECK": ("evaluation.artifact_contracts", "ARTIFACT_FAMILY_READINESS_CHECK"),
    "ARTIFACT_FAMILY_RUN_MANIFEST": ("evaluation.artifact_contracts", "ARTIFACT_FAMILY_RUN_MANIFEST"),
    "ARTIFACT_FAMILY_STRATEGY_ALERT": ("evaluation.artifact_contracts", "ARTIFACT_FAMILY_STRATEGY_ALERT"),
    "ARTIFACT_SCHEMA_VERSION": ("evaluation.artifact_contracts", "ARTIFACT_SCHEMA_VERSION"),
    "annotate_artifact": ("evaluation.artifact_contracts", "annotate_artifact"),
    "build_artifact_metadata": ("evaluation.artifact_contracts", "build_artifact_metadata"),
    "validate_artifact_payload": ("evaluation.artifact_contracts", "validate_artifact_payload"),
    "ModelFamily": ("evaluation.comparison", "ModelFamily"),
    "attach_model_family_scores": ("evaluation.comparison", "attach_model_family_scores"),
    "build_default_model_families": ("evaluation.comparison", "build_default_model_families"),
    "compare_model_families": ("evaluation.comparison", "compare_model_families"),
    "render_model_comparison_report": ("evaluation.comparison", "render_model_comparison_report"),
    "score_enhanced_rank": ("evaluation.comparison", "score_enhanced_rank"),
    "OUTCOME_ANALYSIS_FAILED": ("evaluation.failure_taxonomy", "OUTCOME_ANALYSIS_FAILED"),
    "OUTCOME_DEGRADED_RISKY": ("evaluation.failure_taxonomy", "OUTCOME_DEGRADED_RISKY"),
    "OUTCOME_DEGRADED_SAFE": ("evaluation.failure_taxonomy", "OUTCOME_DEGRADED_SAFE"),
    "OUTCOME_HEALTHY_CANDIDATES_FOUND": ("evaluation.failure_taxonomy", "OUTCOME_HEALTHY_CANDIDATES_FOUND"),
    "OUTCOME_HEALTHY_NO_CANDIDATES": ("evaluation.failure_taxonomy", "OUTCOME_HEALTHY_NO_CANDIDATES"),
    "OUTCOME_MARKET_GATE_BLOCKED": ("evaluation.failure_taxonomy", "OUTCOME_MARKET_GATE_BLOCKED"),
    "TaxonomyResult": ("evaluation.failure_taxonomy", "TaxonomyResult"),
    "classify_market_brief_outcome": ("evaluation.failure_taxonomy", "classify_market_brief_outcome"),
    "classify_strategy_outcome": ("evaluation.failure_taxonomy", "classify_strategy_outcome"),
    "RUN_MANIFEST_OUTCOME_COMPLETED": ("evaluation.run_manifest", "RUN_MANIFEST_OUTCOME_COMPLETED"),
    "RUN_MANIFEST_OUTCOME_FAILED": ("evaluation.run_manifest", "RUN_MANIFEST_OUTCOME_FAILED"),
    "build_run_manifest": ("evaluation.run_manifest", "build_run_manifest"),
}


def __getattr__(name: str) -> Any:
    module_name, attr_name = _EXPORTS[name]
    value = getattr(import_module(module_name), attr_name)
    globals()[name] = value
    return value
