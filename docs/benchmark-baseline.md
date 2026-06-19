# Mnemic Benchmark Baseline

Mnemic includes a deterministic, model-free coding-agent memory eval so recall quality claims can be reproduced locally before external benchmark adapters exist.

Run it from the repository root:

```bash
npm run benchmark
```

The command starts an isolated local backend, seeds the `coding-agent` fixture, links memory records, calls recall explanations, and writes a Markdown report to:

```text
target/mnemic-benchmark/mnemic-eval-report.md
```

## Latest Local Baseline

Last verified: 2026-06-18.

| Metric | Value |
| --- | ---: |
| fixture | `coding-agent` |
| seeded memories | 6 |
| linked relations | 3 |
| query limit | 5 |
| recall@5 | 1.00 |
| mean hit rank | 1.00 |
| stale false positive rate | 0.00 |
| stale false positives | 0 |
| relation path coverage | 1.00 |

## Query Coverage

| Query | Expected memory |
| --- | --- |
| `typescript workspace agent memory` | `eval/typescript-foundation` |
| `source keys auditable repeated writes` | `eval/source-keyed-writes` |
| `preview memory before remember` | `eval/write-preview-policy` |
| `why was this memory recalled` | `eval/recall-explanation` |
| `current TypeScript product path` | `eval/runtime-boundary` |

## Scope

This is a local smoke benchmark, not a claim against LoCoMo, LongMemEval, LongMemEval-V2, BEAM, or MemGym. Its purpose is to keep Mnemic's core promises testable in CI and demos:

- source-keyed writes remain retrievable.
- stale memories do not outrank current expected records.
- relation paths are surfaced for graph-connected memories.
- recall explanations expose enough detail to debug why a record was selected.

External benchmark adapters should land behind the same report shape so future results stay comparable.
