"""Shared operator decision contract and renderers.

Keep this module lightweight so importing `operator_surfaces.runtime_health`
does not pull in the heavier decision-contract dependencies unless the caller
actually asks for those symbols.
"""

from importlib import import_module
from typing import Any

__all__ = [
    "OPERATOR_PAYLOAD_SCHEMA_VERSION",
    "assert_consumer_compatible",
    "build_lifecycle_operator_payload",
    "build_market_brief_operator_payload",
    "build_operator_payload",
    "build_ops_highway_plan",
    "describe_operator_outcome",
    "render_operator_payload",
    "validate_operator_payload",
]

_EXPORTS: dict[str, tuple[str, str]] = {
    "OPERATOR_PAYLOAD_SCHEMA_VERSION": ("operator_surfaces.decision_contract", "OPERATOR_PAYLOAD_SCHEMA_VERSION"),
    "build_lifecycle_operator_payload": ("operator_surfaces.decision_contract", "build_lifecycle_operator_payload"),
    "build_market_brief_operator_payload": ("operator_surfaces.decision_contract", "build_market_brief_operator_payload"),
    "build_operator_payload": ("operator_surfaces.decision_contract", "build_operator_payload"),
    "validate_operator_payload": ("operator_surfaces.decision_contract", "validate_operator_payload"),
    "assert_consumer_compatible": ("operator_surfaces.compatibility", "assert_consumer_compatible"),
    "build_ops_highway_plan": ("operator_surfaces.ops_highway", "build_ops_highway_plan"),
    "describe_operator_outcome": ("operator_surfaces.renderers", "describe_operator_outcome"),
    "render_operator_payload": ("operator_surfaces.renderers", "render_operator_payload"),
}


def __getattr__(name: str) -> Any:
    module_name, attr_name = _EXPORTS[name]
    value = getattr(import_module(module_name), attr_name)
    globals()[name] = value
    return value
