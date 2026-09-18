type Language = "c" | "cpp";

type IrMetrics = {
  instructions_before: number;
  instructions_after: number;
  basic_blocks_before: number;
  basic_blocks_after: number;
  lines_before: number;
  lines_after: number;
  bytes_before: number;
  bytes_after: number;
  functions_before: number;
  functions_after: number;
  globals_before: number;
  globals_after: number;
  lines_added: number;
  lines_removed: number;
  instruction_delta: number;
  basic_block_delta: number;
  line_delta: number;
  byte_delta: number;
  reduction_percent: number;
};

type IrStats = {
  instructions: number;
  basicBlocks: number;
  lines: number;
  bytes: number;
  functions: number;
  globals: number;
};

type Sample = {
  id: string;
  name: string;
  source: string;
  initial: string;
  passes: Array<{ name: string; after: string }>;
};

const COMMON_HEADER = `; ModuleID = 'lpta-demo'
source_filename = "lpta-demo.c"
target triple = "x86_64-pc-linux-gnu"
`;

const samples: Sample[] = [
  {
    id: "constant-folding",
    name: "Constant Folding",
    source: `int calculate(int x) {
    int unused = 100;
    int a = x * 2;
    int b = a + 0;
    return b + (10 + 20);
}`,
    initial: `${COMMON_HEADER}
define i32 @calculate(i32 %x) {
entry:
  %unused = alloca i32, align 4
  %a = alloca i32, align 4
  %b = alloca i32, align 4
  store i32 100, ptr %unused, align 4
  %mul = mul nsw i32 %x, 2
  store i32 %mul, ptr %a, align 4
  %load_a = load i32, ptr %a, align 4
  %add_zero = add nsw i32 %load_a, 0
  store i32 %add_zero, ptr %b, align 4
  %load_b = load i32, ptr %b, align 4
  %constant = add i32 10, 20
  %result = add nsw i32 %load_b, %constant
  br label %return
return:
  ret i32 %result
}
`,
    passes: [
      {
        name: "mem2reg",
        after: `${COMMON_HEADER}
define i32 @calculate(i32 %x) {
entry:
  %mul = mul nsw i32 %x, 2
  %add_zero = add nsw i32 %mul, 0
  %constant = add i32 10, 20
  %result = add nsw i32 %add_zero, %constant
  br label %return
return:
  ret i32 %result
}
`,
      },
      {
        name: "instcombine",
        after: `${COMMON_HEADER}
define i32 @calculate(i32 %x) {
entry:
  %mul = shl i32 %x, 1
  %constant = 30
  %result = add nsw i32 %mul, 30
  br label %return
return:
  ret i32 %result
}
`,
      },
      {
        name: "simplifycfg",
        after: `${COMMON_HEADER}
define i32 @calculate(i32 %x) {
entry:
  %mul = shl i32 %x, 1
  %result = add nsw i32 %mul, 30
  ret i32 %result
}
`,
      },
      {
        name: "dce",
        after: `${COMMON_HEADER}
define i32 @calculate(i32 %x) {
entry:
  %result = add nsw i32 (shl i32 %x, 1), 30
  ret i32 %result
}
`,
      },
    ],
  },
  {
    id: "dead-code",
    name: "Dead Code Elimination",
    source: `int keep(int x) {
    int unused = x * 100;
    int answer = x + 1;
    return answer;
}`,
    initial: `${COMMON_HEADER}
define i32 @keep(i32 %x) {
entry:
  %unused = mul nsw i32 %x, 100
  %answer = add nsw i32 %x, 1
  %guard = icmp sgt i32 %answer, 0
  br i1 %guard, label %positive, label %return
positive:
  br label %return
return:
  ret i32 %answer
}
`,
    passes: [
      {
        name: "mem2reg",
        after: `${COMMON_HEADER}
define i32 @keep(i32 %x) {
entry:
  %unused = mul nsw i32 %x, 100
  %answer = add nsw i32 %x, 1
  %guard = icmp sgt i32 %answer, 0
  br i1 %guard, label %positive, label %return
positive:
  br label %return
return:
  ret i32 %answer
}
`,
      },
      {
        name: "instcombine",
        after: `${COMMON_HEADER}
define i32 @keep(i32 %x) {
entry:
  %unused = mul nsw i32 %x, 100
  %answer = add nsw i32 %x, 1
  %guard = icmp sgt i32 %answer, 0
  br i1 %guard, label %positive, label %return
positive:
  br label %return
return:
  ret i32 %answer
}
`,
      },
      {
        name: "simplifycfg",
        after: `${COMMON_HEADER}
define i32 @keep(i32 %x) {
entry:
  %unused = mul nsw i32 %x, 100
  %answer = add nsw i32 %x, 1
  ret i32 %answer
}
`,
      },
      {
        name: "dce",
        after: `${COMMON_HEADER}
define i32 @keep(i32 %x) {
entry:
  %answer = add nsw i32 %x, 1
  ret i32 %answer
}
`,
      },
    ],
  },
  {
    id: "instruction-combining",
    name: "Instruction Combining",
    source: `int combine(int x) {
    int step = x + 0;
    int scaled = step * 1;
    return scaled - 0;
}`,
    initial: `${COMMON_HEADER}
define i32 @combine(i32 %x) {
entry:
  %step = add nsw i32 %x, 0
  %scaled = mul nsw i32 %step, 1
  %result = sub nsw i32 %scaled, 0
  ret i32 %result
}
`,
    passes: [
      {
        name: "mem2reg",
        after: `${COMMON_HEADER}
define i32 @combine(i32 %x) {
entry:
  %step = add nsw i32 %x, 0
  %scaled = mul nsw i32 %step, 1
  %result = sub nsw i32 %scaled, 0
  ret i32 %result
}
`,
      },
      {
        name: "instcombine",
        after: `${COMMON_HEADER}
define i32 @combine(i32 %x) {
entry:
  ret i32 %x
}
`,
      },
      {
        name: "simplifycfg",
        after: `${COMMON_HEADER}
define i32 @combine(i32 %x) {
entry:
  ret i32 %x
}
`,
      },
      {
        name: "dce",
        after: `${COMMON_HEADER}
define i32 @combine(i32 %x) {
entry:
  ret i32 %x
}
`,
      },
    ],
  },
  {
    id: "control-flow",
    name: "Control Flow Simplification",
    source: `int choose(int x) {
    if (1) {
        return x + 4;
    } else {
        return x - 4;
    }
}`,
    initial: `${COMMON_HEADER}
define i32 @choose(i32 %x) {
entry:
  br i1 true, label %then, label %else
then:
  %up = add nsw i32 %x, 4
  br label %exit
else:
  %down = sub nsw i32 %x, 4
  br label %exit
exit:
  %value = phi i32 [ %up, %then ], [ %down, %else ]
  ret i32 %value
}
`,
    passes: [
      {
        name: "mem2reg",
        after: `${COMMON_HEADER}
define i32 @choose(i32 %x) {
entry:
  br i1 true, label %then, label %else
then:
  %up = add nsw i32 %x, 4
  br label %exit
else:
  %down = sub nsw i32 %x, 4
  br label %exit
exit:
  %value = phi i32 [ %up, %then ], [ %down, %else ]
  ret i32 %value
}
`,
      },
      {
        name: "instcombine",
        after: `${COMMON_HEADER}
define i32 @choose(i32 %x) {
entry:
  br i1 true, label %then, label %else
then:
  %up = add nsw i32 %x, 4
  br label %exit
else:
  %down = sub nsw i32 %x, 4
  br label %exit
exit:
  %value = phi i32 [ %up, %then ], [ %down, %else ]
  ret i32 %value
}
`,
      },
      {
        name: "simplifycfg",
        after: `${COMMON_HEADER}
define i32 @choose(i32 %x) {
entry:
  %up = add nsw i32 %x, 4
  ret i32 %up
}
`,
      },
      {
        name: "dce",
        after: `${COMMON_HEADER}
define i32 @choose(i32 %x) {
entry:
  %up = add nsw i32 %x, 4
  ret i32 %up
}
`,
      },
    ],
  },
  {
    id: "memory-promotion",
    name: "Memory-to-Register Promotion",
    source: `int increment(int x) {
    int value = x;
    value = value + 1;
    return value;
}`,
    initial: `${COMMON_HEADER}
define i32 @increment(i32 %x) {
entry:
  %value = alloca i32, align 4
  store i32 %x, ptr %value, align 4
  %loaded = load i32, ptr %value, align 4
  %next = add nsw i32 %loaded, 1
  store i32 %next, ptr %value, align 4
  %result = load i32, ptr %value, align 4
  ret i32 %result
}
`,
    passes: [
      {
        name: "mem2reg",
        after: `${COMMON_HEADER}
define i32 @increment(i32 %x) {
entry:
  %next = add nsw i32 %x, 1
  ret i32 %next
}
`,
      },
      {
        name: "instcombine",
        after: `${COMMON_HEADER}
define i32 @increment(i32 %x) {
entry:
  %next = add nsw i32 %x, 1
  ret i32 %next
}
`,
      },
      {
        name: "simplifycfg",
        after: `${COMMON_HEADER}
define i32 @increment(i32 %x) {
entry:
  %next = add nsw i32 %x, 1
  ret i32 %next
}
`,
      },
      {
        name: "dce",
        after: `${COMMON_HEADER}
define i32 @increment(i32 %x) {
entry:
  %next = add nsw i32 %x, 1
  ret i32 %next
}
`,
      },
    ],
  },
];

const purposes: Record<string, string> = {
  mem2reg: "Promotes suitable stack-based memory operations into SSA registers.",
  instcombine: "Canonicalizes and combines local LLVM instructions using algebraic simplification.",
  simplifycfg: "Simplifies control-flow graphs by removing unreachable and redundant branches.",
  dce: "Removes instructions whose results are not observable or used by the program.",
};

function lines(ir: string): string[] {
  return ir.replace(/\r\n/g, "\n").trimEnd().split("\n");
}

function countInstructions(irLines: string[]): number {
  const opcodes =
    /^(?:alloca|load|store|add|sub|mul|sdiv|udiv|shl|lshr|ashr|icmp|fcmp|br|call|ret|phi|select|getelementptr|bitcast|zext|sext|trunc|fadd|fsub|fmul|fdiv|switch|invoke|unreachable)\b/;
  return irLines.filter((line) => {
    const code = line.trim().replace(/^%[\w.$-]+\s*=\s*/, "");
    return opcodes.test(code);
  }).length;
}

function stats(ir: string): IrStats {
  const irLines = lines(ir);
  const blockLines = irLines.filter((line) => /^[A-Za-z$._][\w$.-]*:\s*$/.test(line.trim()));
  const functionCount = irLines.filter((line) => /^\s*(define|declare)\b/.test(line)).length;
  const basicBlocks = blockLines.length || functionCount;
  return {
    instructions: countInstructions(irLines),
    basicBlocks,
    lines: irLines.length,
    bytes: Buffer.byteLength(ir, "utf8"),
    functions: functionCount,
    globals: irLines.filter((line) => /^@\S+\s*=/.test(line.trim())).length,
  };
}

function lcsLength(before: string[], after: string[]): number {
  const row = new Array(after.length + 1).fill(0) as number[];
  for (const beforeLine of before) {
    let diagonal = 0;
    for (let index = 1; index <= after.length; index += 1) {
      const previous = row[index];
      row[index] =
        beforeLine === after[index - 1]
          ? diagonal + 1
          : Math.max(row[index], row[index - 1]);
      diagonal = previous;
    }
  }
  return row[after.length];
}

function compare(beforeIr: string, afterIr: string): IrMetrics {
  const before = stats(beforeIr);
  const after = stats(afterIr);
  const beforeLines = lines(beforeIr);
  const afterLines = lines(afterIr);
  const common = lcsLength(beforeLines, afterLines);
  const reduction = before.instructions
    ? ((before.instructions - after.instructions) / before.instructions) * 100
    : 0;
  return {
    instructions_before: before.instructions,
    instructions_after: after.instructions,
    basic_blocks_before: before.basicBlocks,
    basic_blocks_after: after.basicBlocks,
    lines_before: before.lines,
    lines_after: after.lines,
    bytes_before: before.bytes,
    bytes_after: after.bytes,
    functions_before: before.functions,
    functions_after: after.functions,
    globals_before: before.globals,
    globals_after: after.globals,
    lines_added: afterLines.length - common,
    lines_removed: beforeLines.length - common,
    instruction_delta: after.instructions - before.instructions,
    basic_block_delta: after.basicBlocks - before.basicBlocks,
    line_delta: after.lines - before.lines,
    byte_delta: after.bytes - before.bytes,
    reduction_percent: Number(reduction.toFixed(1)),
  };
}

function impact(metrics: IrMetrics) {
  const magnitude = Math.abs(metrics.instruction_delta) * 4 + Math.abs(metrics.lines_added - metrics.lines_removed) + Math.abs(metrics.basic_block_delta) * 15;
  const score = Math.min(100, magnitude);
  return {
    score,
    label: score === 0 ? "NONE" : score < 20 ? "LOW" : score < 50 ? "MEDIUM" : "HIGH",
  } as const;
}

function observedChange(passName: string, metrics: IrMetrics, beforeIr: string, afterIr: string): string[] {
  if (beforeIr === afterIr) return ["No textual or measured IR change detected."];
  const changes: string[] = [];
  if (metrics.instruction_delta < 0) changes.push(`reduced LLVM instructions by ${Math.abs(metrics.instruction_delta)}`);
  if (metrics.instruction_delta > 0) changes.push(`added ${metrics.instruction_delta} LLVM instructions`);
  if (metrics.basic_block_delta < 0) changes.push(`reduced basic blocks by ${Math.abs(metrics.basic_block_delta)}`);
  if (metrics.basic_block_delta > 0) changes.push(`added ${metrics.basic_block_delta} basic blocks`);
  if (passName === "mem2reg" && /alloca|store|load/.test(beforeIr) && !/alloca|store|load/.test(afterIr)) {
    changes.push("removed stack-based load/store operations");
  }
  if (passName === "simplifycfg" && metrics.basic_block_delta < 0) {
    changes.push("collapsed redundant control-flow blocks");
  }
  if (passName === "dce" && metrics.instruction_delta < 0) {
    changes.push("removed unused computation");
  }
  return changes.length ? changes : ["changed IR text without a confident single-category classification"];
}

function explain(passName: string, metrics: IrMetrics, beforeIr: string, afterIr: string): string {
  if (beforeIr === afterIr) {
    return `No IR change was detected during ${passName}; the pass had no measurable effect on this snapshot.`;
  }
  if (passName === "mem2reg" && /alloca|store|load/.test(beforeIr) && !/alloca|store|load/.test(afterIr)) {
    return `LPTA detected ${Math.abs(metrics.instruction_delta)} fewer LLVM instructions and no change in basic-block count. The snapshot shows stack operations replaced by SSA values, which is consistent with memory-to-register promotion.`;
  }
  if (passName === "simplifycfg" && metrics.basic_block_delta < 0) {
    return `LPTA detected ${Math.abs(metrics.basic_block_delta)} fewer basic blocks and ${Math.abs(metrics.instruction_delta)} fewer instructions. The measured change is primarily control-flow simplification.`;
  }
  if (passName === "dce") {
    return `LPTA detected ${Math.abs(metrics.instruction_delta)} fewer instructions after this pass. The removed computation is not referenced by the remaining IR, so dead code elimination is the supported classification.`;
  }
  return `LPTA detected ${Math.abs(metrics.instruction_delta)} instruction delta and ${Math.abs(metrics.line_delta)} IR line delta. The pass changed the snapshot, but the exact transformation is not inferred beyond these measurements.`;
}

function codegenFor(initial: string, final: string) {
  const baseline = stats(initial).instructions + 3;
  const optimized = stats(final).instructions + 2;
  return {
    available: false,
    label: "DEMO / ESTIMATED",
    baseline_instructions: baseline,
    optimized_instructions: optimized,
    delta: optimized - baseline,
    baseline_assembly: `mov %edi, %eax\n; ${baseline - 1} additional demo instructions\nret`,
    optimized_assembly: `lea 0x1(%rdi), %eax\n; ${optimized - 1} additional demo instructions\nret`,
    note: "Generated code is deterministic demo data. No assembler or runtime benchmark was executed.",
  };
}

export function analyzeProgram(input: { language: Language; source: string; sample_id?: string | null }) {
  const requested = input.sample_id ? samples.find((sample) => sample.id === input.sample_id) : undefined;
  const selected = requested ?? samples.find((sample) => input.source.trim() === sample.source.trim()) ?? samples[0];
  let beforeIr = selected.initial;
  const stages = selected.passes.map((pass) => {
    const afterIr = pass.after;
    const metrics = compare(beforeIr, afterIr);
    const stage = {
      pass_name: pass.name,
      changed: beforeIr !== afterIr,
      before_ir: beforeIr,
      after_ir: afterIr,
      metrics,
      impact: impact(metrics),
      general_purpose: purposes[pass.name] ?? "Applies an LLVM transformation to the current IR.",
      observed_change: observedChange(pass.name, metrics, beforeIr, afterIr),
      explanation: explain(pass.name, metrics, beforeIr, afterIr),
    };
    beforeIr = afterIr;
    return stage;
  });
  const finalIr = beforeIr;
  const initialStats = stats(selected.initial);
  const finalStats = stats(finalIr);
  const changedPasses = stages.filter((stage) => stage.changed).length;
  const series = [
    { label: "Initial", value: initialStats.instructions },
    ...stages.map((stage) => ({ label: stage.pass_name, value: stage.metrics.instructions_after })),
  ];
  return {
    mode: "demo" as const,
    llvm_version: null,
    pipeline: stages.map((stage) => stage.pass_name),
    source_ir: selected.initial,
    final_ir: finalIr,
    stages,
    summary: {
      total_passes: stages.length,
      changed_passes: changedPasses,
      major_transformations: stages.filter((stage) => stage.impact.label === "HIGH").length,
      instructions_before: initialStats.instructions,
      instructions_after: finalStats.instructions,
      basic_blocks_before: initialStats.basicBlocks,
      basic_blocks_after: finalStats.basicBlocks,
      lines_before: initialStats.lines,
      lines_after: finalStats.lines,
      bytes_before: initialStats.bytes,
      bytes_after: finalStats.bytes,
      ir_reduction_percent: initialStats.lines ? Number((((initialStats.lines - finalStats.lines) / initialStats.lines) * 100).toFixed(1)) : 0,
      instruction_series: series,
    },
    codegen: codegenFor(selected.initial, finalIr),
  };
}

export { samples };