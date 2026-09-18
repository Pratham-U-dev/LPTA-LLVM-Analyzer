# LPTA samples

The five deterministic demo traces are:

- `constant-folding.c`
- `dead-code.c`
- `instruction-combining.c`
- `control-flow.c`
- `memory-promotion.c`

The backend keeps the corresponding LLVM IR snapshots next to its analysis
logic so all stage metrics are derived from the exact before/after strings.