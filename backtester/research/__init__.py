"""Research artifact contracts and runtime helpers."""

from research.artifacts import (
    RESEARCH_ARTIFACT_SCHEMA_VERSION,
    ResearchArtifact,
    build_research_artifact,
    validate_research_artifact,
)
from research.runtime import (
    build_hot_contract,
    build_research_runtime_snapshot,
    classify_research_freshness,
    read_hot_research_artifact,
    write_research_artifact,
)

__all__ = [
    "RESEARCH_ARTIFACT_SCHEMA_VERSION",
    "ResearchArtifact",
    "build_hot_contract",
    "build_research_artifact",
    "build_research_runtime_snapshot",
    "classify_research_freshness",
    "read_hot_research_artifact",
    "validate_research_artifact",
    "write_research_artifact",
]
