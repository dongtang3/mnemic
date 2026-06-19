# Mnemic Benchmark Landscape

Last reviewed: 2026-06-18.

Mnemic should make memory-quality claims only when the repository ships a reproducible command for them. This page separates the current local benchmark from external benchmark targets so launch copy stays credible.

## Current Reproducible Result

Run:

```bash
npm run benchmark
```

Latest local baseline:

| Suite | Scope | Command | Current result | Status |
| --- | --- | --- | --- | --- |
| Mnemic `coding-agent` | Source-keyed project memory, relation-path recall, stale false positives, recall explanations, runtime-boundary guardrail | `npm run benchmark` | `recall@5 1.00`, `mean hit rank 1.00`, `stale false positive rate 0.00`, `relation path coverage 1.00` | implemented and CI-covered through model-free eval |

The generated report is:

```text
target/mnemic-benchmark/mnemic-eval-report.md
```

The baseline summary is tracked in [docs/benchmark-baseline.md](benchmark-baseline.md).

## Public Benchmark Map

| Benchmark | What it measures | Why it matters for Mnemic | Mnemic status |
| --- | --- | --- | --- |
| LoCoMo | Long conversational memory with factual recall, temporal reasoning, and multi-hop questions | Useful for personal/chat memory retrieval, but less specific to coding-agent project workflows | planned adapter, not claimed |
| LongMemEval | Long-term memory across multi-session and temporal categories | Good comparison point for recall quality and context compression | planned adapter, not claimed |
| BEAM | Memory retrieval across larger conversation scales and multiple memory abilities | Useful for stress-testing retrieval cost and long-context alternatives | planned adapter, not claimed |
| LongMemEval-V2 | Web-agent environment experience: static state, dynamic state, workflow knowledge, gotchas, and premise awareness | Closest external fit for Mnemic's goal of helping agents become experienced project operators | planned adapter, not claimed |
| MemGym | Agentic memory across tool-use dialogue, deep research, coding, and computer-use regimes | Strong future fit for coding-agent and web-agent memory evaluation | planned adapter, not claimed |

Primary sources:

- Mem0 State of AI Agent Memory 2026: https://mem0.ai/blog/state-of-ai-agent-memory-2026
- Mem0 memory-benchmarks repository: https://github.com/mem0ai/memory-benchmarks
- LongMemEval-V2 paper: https://arxiv.org/abs/2605.12493
- LongMemEval-V2 project page: https://xiaowu0162.github.io/longmemeval-v2/
- MemGym paper: https://arxiv.org/abs/2605.20833

## What Mnemic Should Claim Today

Mnemic can claim:

- deterministic local benchmark harness
- model-free coding-agent fixture
- source-keyed write coverage
- relation-path coverage
- stale-memory false-positive guardrail
- recall explanation coverage
- CI-gated eval command

Mnemic should not claim:

- LoCoMo score
- LongMemEval or LongMemEval-V2 score
- BEAM score
- MemGym score
- state-of-the-art benchmark ranking

## Adapter Roadmap

1. Keep the current `MemoryEvalResult` report shape stable.
2. Add fixture adapters that normalize external benchmark tasks into source-keyed memory writes, relation links, recall queries, and answer-evidence scoring.
3. Report retrieval metrics separately from downstream model-answer accuracy.
4. Track token budget, recall latency, write-time cost, stale false positives, and temporal invalidation behavior.
5. Publish only commands that can run locally or with clearly documented dataset credentials.

The first external adapter should target coding-agent or web-agent memory, not generic chat history, because that is where Mnemic is differentiated.
