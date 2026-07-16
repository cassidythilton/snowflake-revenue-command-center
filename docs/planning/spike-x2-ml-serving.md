---
shaping: true
---

# X2 Spike Findings — Snowflake ML Serving

## Context

The command center needs believable live scoring for a single account and an inspectable request/response contract.

## Questions

| ID | Question |
|---|---|
| X2-Q1 | Should the demo use native warehouse inference or SPCS real-time serving? |
| X2-Q2 | How is the model version governed and observed? |
| X2-Q3 | What evidence should the UI expose? |

## Findings

- Snowflake Model Registry versions models, metadata, metrics, and access under Snowflake RBAC.
- Native inference runs model methods in a virtual warehouse through SQL and requires no service or compute-pool lifecycle.
- SPCS real-time inference provides a managed HTTP endpoint and autoscaling, but adds compute-pool privileges, service deployment, ingress, warm-up, and cost management.
- Both are valid. SPCS is justified by measured low-latency/high-concurrency needs, not merely by parity with Databricks Model Serving.

## Recommendation

Use Model Registry + native warehouse inference for the demo default:

- Invoke one-row scoring through the Snowflake SQL API.
- Pre-warm the demo warehouse.
- Show model/version, feature payload, generated SQL, score, elapsed time, and saved feedback.
- Capture representative runs before the demo and provide a deterministic fallback explicitly labeled as fallback.

Promote to SPCS only if a target-account test shows native inference cannot meet the interactive latency budget.

## Remaining gate

Benchmark one-row scoring in the target account, including suspended-warehouse behavior. Set the presenter latency threshold before deciding whether SPCS is needed.

## Acceptance

Complete when we can describe the exact scoring SQL/API, model/version contract, expected warm and cold latency, observability evidence, and fallback behavior.

## Sources

- [Snowflake Model Registry](https://docs.snowflake.com/en/developer-guide/snowflake-ml/model-registry/overview)
- [Model inference in Snowflake](https://docs.snowflake.com/en/developer-guide/snowflake-ml/inference/inference-overview)
- [Real-time inference REST API](https://docs.snowflake.com/en/developer-guide/snowflake-ml/inference/real-time-inference-rest-api)
