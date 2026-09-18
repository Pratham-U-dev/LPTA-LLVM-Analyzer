# LPTA — LLVM Pass Transformation Analyzer

LPTA is a hackathon MVP for tracing how an LLVM optimization pipeline changes
IR, one pass at a time. It shows measured IR snapshots, derived diffs,
instruction/basic-block/line/byte metrics, a transparent impact heuristic,
deterministic explanations, transformation history, and generated code metrics.


## Run

The managed workflows start both services:

- `artifacts/lpta-analyzer: web` — the LPTA interface
- `artifacts/api-server: API Server` — `/api/healthz` and `/api/analyze`

The normal demo flow is:

1. Choose one of the five samples.
2. Click **Analyze program**.
3. Select a pass in the pass inspector.
4. Open **Unified diff**, **Transformation history**, and **Generated code**.

## API

`POST /api/analyze`

```json
{
  "language": "c",
  "source": "int calculate(int x) { return x + 1; }",
  "pipeline": "standard",
  "sample_id": "constant-folding"
}
```

The response is typed from `lib/api-spec/openapi.yaml` and includes
`mode: "demo"` so consumers can distinguish it from future live LLVM support.
