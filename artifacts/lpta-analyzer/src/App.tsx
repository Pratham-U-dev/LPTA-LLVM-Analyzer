import { useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAnalyzeProgram, useHealthCheck } from "@workspace/api-client-react";

type Language = "c" | "cpp";
type Metric = { before: number; after: number; delta: number };
type Metrics = { instruction: Metric; basic_block: Metric; line: Metric; byte: Metric; function: Metric; global: Metric; added_lines: number; removed_lines: number; reduction_percent: number };
type Stage = { pass_name: string; changed: boolean; before_ir: string; after_ir: string; metrics: Metrics; impact: string; general_purpose: string; observed_change: string; explanation: string };
type Result = { mode: string; llvm_version: string; pipeline: string[]; source_ir: string; final_ir: string; stages: Stage[]; summary: { totals: Metrics; instruction_series: number[] }; codegen: { availability: boolean; estimated: boolean; label: string; assembly_counts: Metric; assembly_text: string } };
type ApiResult = {
  mode: string; llvm_version: string | null; pipeline: string[]; source_ir: string; final_ir: string;
  stages: Array<{ pass_name: string; changed: boolean; before_ir: string; after_ir: string; metrics: { instructions_before: number; instructions_after: number; basic_blocks_before: number; basic_blocks_after: number; lines_before: number; lines_after: number; bytes_before: number; bytes_after: number; functions_before: number; functions_after: number; globals_before: number; globals_after: number; lines_added: number; lines_removed: number; instruction_delta: number; basic_block_delta: number; line_delta: number; byte_delta: number; reduction_percent: number }; impact: { label: string }; general_purpose: string; observed_change: string[]; explanation: string }>;
  summary: { instructions_before: number; instructions_after: number; basic_blocks_before: number; basic_blocks_after: number; lines_before: number; lines_after: number; bytes_before: number; bytes_after: number; ir_reduction_percent: number; instruction_series: Array<{ label: string; value: number }> };
  codegen: { available: boolean; label: string; baseline_instructions: number; optimized_instructions: number; delta: number; baseline_assembly: string; optimized_assembly: string; note: string };
};

function normalizeResult(api: ApiResult): Result {
  const makeMetrics = (m: ApiResult["stages"][number]["metrics"]): Metrics => ({
    instruction: { before: m.instructions_before, after: m.instructions_after, delta: m.instruction_delta },
    basic_block: { before: m.basic_blocks_before, after: m.basic_blocks_after, delta: m.basic_block_delta },
    line: { before: m.lines_before, after: m.lines_after, delta: m.line_delta },
    byte: { before: m.bytes_before, after: m.bytes_after, delta: m.byte_delta },
    function: { before: m.functions_before, after: m.functions_after, delta: m.functions_after - m.functions_before },
    global: { before: m.globals_before, after: m.globals_after, delta: m.globals_after - m.globals_before },
    added_lines: m.lines_added, removed_lines: m.lines_removed, reduction_percent: m.reduction_percent,
  });
  const totals = { instruction: { before: api.summary.instructions_before, after: api.summary.instructions_after, delta: api.summary.instructions_after - api.summary.instructions_before }, basic_block: { before: api.summary.basic_blocks_before, after: api.summary.basic_blocks_after, delta: api.summary.basic_blocks_after - api.summary.basic_blocks_before }, line: { before: api.summary.lines_before, after: api.summary.lines_after, delta: api.summary.lines_after - api.summary.lines_before }, byte: { before: api.summary.bytes_before, after: api.summary.bytes_after, delta: api.summary.bytes_after - api.summary.bytes_before }, function: { before: 1, after: 1, delta: 0 }, global: { before: 0, after: 0, delta: 0 }, added_lines: 0, removed_lines: 0, reduction_percent: api.summary.ir_reduction_percent };
  return {
    mode: api.mode, llvm_version: api.llvm_version ?? "LLVM version unavailable", pipeline: api.pipeline, source_ir: api.source_ir, final_ir: api.final_ir,
    stages: api.stages.map(stage => ({ pass_name: stage.pass_name, changed: stage.changed, before_ir: stage.before_ir, after_ir: stage.after_ir, metrics: makeMetrics(stage.metrics), impact: `${stage.impact.label} impact`, general_purpose: stage.general_purpose, observed_change: stage.observed_change.join(" "), explanation: stage.explanation })),
    summary: { totals, instruction_series: api.summary.instruction_series.map(point => point.value) },
    codegen: { availability: api.codegen.available, estimated: true, label: api.codegen.label, assembly_counts: { before: api.codegen.baseline_instructions, after: api.codegen.optimized_instructions, delta: api.codegen.delta }, assembly_text: api.codegen.optimized_assembly },
  };
}

const samples: Record<string, { label: string; language: Language; source: string }> = {
  "constant-folding": { label: "Constant folding", language: "c", source: `int calculate(int x) {
  int unused = 100;
  int a = x * 2;
  int b = a + 0;
  return b + (10 + 20);
}` },
  "dead-code": { label: "Dead code elimination", language: "c", source: `int keep(int x) {
  int unused = x * 100;
  int answer = x + 1;
  return answer;
}` },
  "instruction-combining": { label: "Instruction combining", language: "c", source: `int combine(int x) {
  int step = x + 0;
  int scaled = step * 1;
  return scaled - 0;
}` },
  "control-flow": { label: "Control-flow simplification", language: "c", source: `int choose(int x) {
  if (1) {
    return x + 4;
  } else {
    return x - 4;
  }
}` },
  "memory-promotion": { label: "Memory-to-register promotion", language: "c", source: `int increment(int x) {
  int value = x;
  value = value + 1;
  return value;
}` },
};

const metrics = (before: number, after: number): Metrics => ({
  instruction: { before, after, delta: after - before }, basic_block: { before: 4, after: 3, delta: -1 },
  line: { before: 14, after: 11, delta: -3 }, byte: { before: 96, after: 72, delta: -24 },
  function: { before: 1, after: 1, delta: 0 }, global: { before: 0, after: 0, delta: 0 },
  added_lines: 1, removed_lines: 4, reduction_percent: Math.round(((before - after) / before) * 100),
});

function demoResult(source: string, sample: string): Result {
  const before = `define i32 @${sample.replace("-", "_")}(ptr %values, i64 %count) {
entry:
  %idx = alloca i64
  %total = alloca i32
  store i64 0, ptr %idx
  store i32 0, ptr %total
  br label %loop
loop:
  %i = load i64, ptr %idx
  %ok = icmp ult i64 %i, %count
  br i1 %ok, label %body, label %exit
body:
  %item = getelementptr i32, ptr %values, i64 %i
  %value = load i32, ptr %item
  %sum = load i32, ptr %total
  %next = add i32 %sum, %value
  store i32 %next, ptr %total
  br label %loop
exit:
  %result = load i32, ptr %total
  ret i32 %result
}`;
  const after = `define i32 @${sample.replace("-", "_")}(ptr %values, i64 %count) {
entry:
  br label %loop
loop:
  %i = phi i64 [ 0, %entry ], [ %next_i, %loop ]
  %total = phi i32 [ 0, %entry ], [ %next, %loop ]
  %ok = icmp ult i64 %i, %count
  br i1 %ok, label %body, label %exit
body:
  %item = getelementptr i32, ptr %values, i64 %i
  %value = load i32, ptr %item
  %next = add i32 %total, %value
  %next_i = add i64 %i, 1
  br label %loop
exit:
  ret i32 %total
}`;
  const makeStage = (name: string, changed: boolean, b: string, a: string, m: Metrics, purpose: string, observed: string, explanation: string): Stage => ({ pass_name: name, changed, before_ir: b, after_ir: a, metrics: m, impact: changed ? `${Math.abs(m.instruction.delta)} instructions removed` : "No measurable IR change", general_purpose: purpose, observed_change: observed, explanation });
  return {
    mode: "deterministic_demo", llvm_version: "LLVM 18.1.2", pipeline: ["mem2reg", "instcombine", "simplifycfg", "adce", "loop-vectorize"], source_ir: before, final_ir: after,
    stages: [
      makeStage("mem2reg", true, before, before.replace(/alloca i64|alloca i32|store i64 0, ptr %idx|store i32 0, ptr %total/g, ""), metrics(19, 14), "Promote stack slots into SSA values.", "The accumulator and induction variable become phi nodes.", "Replaces local storage with SSA form so later passes can reason about values directly."),
      makeStage("instcombine", true, before, after, metrics(14, 11), "Fold instruction patterns into canonical forms.", "The loop increment and accumulator update are kept in canonical add form.", "Combines equivalent instructions and normalizes integer operations."),
      makeStage("simplifycfg", false, after, after, metrics(11, 11), "Remove redundant control-flow edges.", "Control flow is already minimal for this sample.", "No basic block or branch simplification was profitable in the demo trace."),
      makeStage("adce", true, after, after, metrics(11, 10), "Eliminate computations with no observable effect.", "One unused value is removed from the trace.", "Deletes dead instructions while preserving externally visible behavior."),
      makeStage("loop-vectorize", false, after, after, metrics(10, 10), "Explore SIMD loop transformations.", "Vectorization was not selected for this scalar sample.", "The deterministic demo keeps the scalar loop to make the evidence inspectable."),
    ],
    summary: { totals: metrics(source.split("\n").length + 8, 11), instruction_series: [19, 14, 11, 11, 10, 10] },
    codegen: { availability: true, estimated: true, label: "Estimated demo codegen", assembly_counts: { before: 28, after: 19, delta: -9 }, assembly_text: `sum_range:
  xor     eax, eax
  test    rsi, rsi
  je      .Lexit
.Lloop:
  add     eax, dword ptr [rdi]
  add     rdi, 4
  dec     rsi
  jne     .Lloop
.Lexit:
  ret` },
  };
}

function MetricCard({ label, value }: { label: string; value: Metric }) {
  return <div className="metric"><span>{label}</span><strong>{value.before} → {value.after}</strong><em>{value.delta > 0 ? "+" : ""}{value.delta} delta</em></div>;
}

function Home() {
  const health = useHealthCheck();
  const analyze = useAnalyzeProgram();
  const [language, setLanguage] = useState<Language>("c");
  const [sample, setSample] = useState("constant-folding");
  const [source, setSource] = useState(samples["constant-folding"].source);
  const [result, setResult] = useState<Result | null>(null);
  const [selectedStage, setSelectedStage] = useState(0);
  const [tab, setTab] = useState<"stages" | "diff" | "history" | "codegen">("stages");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const active = result?.stages[selectedStage];
  const visibleMetrics = useMemo(() => active?.metrics ?? result?.summary.totals, [active, result]);
  const chooseSample = (value: string) => { setSample(value); setLanguage(samples[value].language); setSource(samples[value].source); setResult(null); setSelectedStage(0); };
  const runAnalysis = async () => {
    setLoading(true); setError("");
    try {
      const response = await (analyze as any).mutateAsync({ data: { language, source, pipeline: "standard", sample_id: sample } });
      setResult(normalizeResult(response as ApiResult));
    } catch {
      setResult(demoResult(source, sample));
      setError("API unavailable — showing the same deterministic demo trace locally. No LLVM process was executed.");
    } finally { setLoading(false); }
  };
  return <div className="app-shell">
    <div className="top-rule" />
    <header className="topbar"><div className="brand"><div className="brand-mark">λ</div><div><div className="brand-name">LPTA</div><div className="brand-sub">LLVM Pass Transformation Analyzer</div></div></div><div className="health"><span className="health-dot" />{health.data ? "Analyzer service ready" : "Demo service status"} <span className="mono">/ deterministic</span></div></header>
    <main className="workspace">
      <section className="intro"><div><div className="eyebrow">Optimization workbench / trace 001</div><h1>See what every pass did.</h1><p>Inspect a deterministic transformation trace from source through LLVM IR to estimated codegen. Evidence first; speed claims never.</p></div><div className="mode-note">DEMO MODE — IR and assembly are deterministic analysis artifacts. No live LLVM execution or runtime benchmarking is performed.</div></section>
       <section className="controls panel"><div className="field"><label htmlFor="language">Language</label><select id="language" className="select" value={language} onChange={e => setLanguage(e.target.value as Language)}><option value="c">C</option><option value="cpp">C++</option></select></div><div className="field"><label htmlFor="sample">Starting sample</label><select id="sample" className="select" value={sample} onChange={e => chooseSample(e.target.value)}>{Object.entries(samples).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></div><button className="secondary-button" onClick={() => { setResult(null); setError(""); setSelectedStage(0); setTab("stages"); }} disabled={loading}>Reset</button><button className="analyze-button" onClick={runAnalysis} disabled={loading}>{loading ? "Tracing…" : "Analyze program"}</button></section>
      {error && <div className="error-bar" role="status">{error}</div>}
      <div className="main-grid" style={{ marginTop: error ? 14 : 0 }}>
        <section className="panel source-panel"><div className="panel-heading"><div className="panel-title"><span className="square-dot" />Source input</div><span className="heading-note">{language === "cpp" ? "C++17" : "C17"} / editable</span></div><div className="source-wrap"><div className="line-numbers">{source.split("\n").map((_, i) => <div key={i}>{String(i + 1).padStart(2, "0")}</div>)}</div><textarea className="source" value={source} onChange={e => setSource(e.target.value)} spellCheck={false} aria-label="Source code" /></div><div className="source-footer"><span>{source.split("\n").length} lines</span><span>UTF-8 · unsaved</span></div></section>
        <div className="right-stack">
          {loading ? <section className="panel empty-state"><div style={{ width: "min(100%, 300px)" }}><div className="skeleton" /><div className="skeleton" style={{ marginTop: 10, width: "76%" }} /><div className="skeleton" style={{ marginTop: 10, width: "54%" }} /><p style={{ marginTop: 18, color: "hsl(var(--ink-soft))", font: "10px var(--font-mono)" }}>Walking deterministic pass pipeline…</p></div></section> : !result ? <section className="panel empty-state"><div><div className="empty-mark">→</div><h3>Ready to trace</h3><p>Choose a sample or edit the source, then run Analyze program to populate pass evidence, IR, diffs, and estimated codegen.</p></div></section> : <Results result={result} active={active} selectedStage={selectedStage} setSelectedStage={setSelectedStage} tab={tab} setTab={setTab} visibleMetrics={visibleMetrics} />}
        </div>
      </div>
    </main>
  </div>;
}

function Results({ result, active, selectedStage, setSelectedStage, tab, setTab, visibleMetrics }: { result: Result; active?: Stage; selectedStage: number; setSelectedStage: (value: number) => void; tab: "stages" | "diff" | "history" | "codegen"; setTab: (value: "stages" | "diff" | "history" | "codegen") => void; visibleMetrics?: Metrics }) {
  return <><section className="panel summary-panel"><div className="panel-heading"><div className="panel-title"><span className="square-dot" />Trace summary</div><span className="heading-note">{result.llvm_version} · {result.mode}</span></div><div className="summary-grid"><div className="stat"><div className="stat-label">IR instructions</div><div className="stat-value">{result.summary.totals.instruction.after}</div><div className="stat-delta">{result.summary.totals.instruction.delta} from source</div></div><div className="stat"><div className="stat-label">Basic blocks</div><div className="stat-value">{result.summary.totals.basic_block.after}</div><div className="stat-delta">{result.summary.totals.basic_block.delta} delta</div></div><div className="stat"><div className="stat-label">IR lines</div><div className="stat-value">{result.summary.totals.line.after}</div><div className="stat-delta">{result.summary.totals.reduction_percent}% reduction</div></div><div className="stat"><div className="stat-label">Est. assembly</div><div className="stat-value">{result.codegen.assembly_counts.after}</div><div className="stat-delta">{result.codegen.assembly_counts.delta} instructions</div></div></div></section>
    <section className="panel"><div className="tabs">{(["stages", "diff", "history", "codegen"] as const).map(item => <button key={item} className={`tab ${tab === item ? "active" : ""}`} onClick={() => setTab(item)}>{item === "stages" ? "Pass inspector" : item === "diff" ? "Unified diff" : item === "history" ? "Transformation history" : "Generated code"}</button>)}</div>
       {tab === "stages" && <div className="stage-list"><nav className="stage-nav" aria-label="Pass stages">{result.stages.map((stage, i) => <button key={stage.pass_name} className={`stage-item ${i === selectedStage ? "selected" : ""}`} onClick={() => setSelectedStage(i)}><span className="stage-index">0{i + 1} / {result.stages.length}</span><span className="stage-name">{stage.pass_name}</span><span className={`stage-state ${stage.changed ? "" : "no-change"}`}><i />{stage.changed ? "changed" : "no change"}</span></button>)}</nav><article className="stage-detail"><div className="detail-head"><div className="eyebrow">Selected pass · {active?.general_purpose}</div><h2>{active?.pass_name}</h2><p>{active?.explanation}</p><span className="impact">{active?.impact}</span></div><div className="metrics">{visibleMetrics && <><MetricCard label="Instructions" value={visibleMetrics.instruction} /><MetricCard label="Basic blocks" value={visibleMetrics.basic_block} /><MetricCard label="IR lines" value={visibleMetrics.line} /><MetricCard label="Bytes" value={visibleMetrics.byte} /><MetricCard label="Functions" value={visibleMetrics.function} /><MetricCard label="Globals" value={visibleMetrics.global} /></>}</div><div className="observation"><strong>Observed change</strong><br />{active?.observed_change}</div></article></div>}
       {tab === "diff" && <DiffPane passName={active?.pass_name ?? "selected pass"} before={active?.before_ir ?? ""} after={active?.after_ir ?? ""} />}
      {tab === "history" && <div className="history">{result.stages.map((stage, i) => <div className="history-row" key={stage.pass_name}><span className="history-num">0{i + 1}</span><span className="history-pass">{stage.pass_name}</span><span className="history-desc">{stage.observed_change}</span><span className="history-change">{stage.changed ? `${stage.metrics.instruction.delta} inst.` : "stable"}</span></div>)}</div>}
      {tab === "codegen" && <div className="code-view"><CodePane label={result.codegen.label} code={result.codegen.assembly_text} after /><div className="code-pane"><div className="code-label">Codegen evidence</div><div className="observation"><strong>Availability</strong><br />{result.codegen.availability ? "Assembly text available for inspection." : "Assembly text unavailable for this trace."}<br /><br /><strong>Counts</strong><br />Before {result.codegen.assembly_counts.before} → After {result.codegen.assembly_counts.after}<br /><br /><span className="mode-note" style={{ display: "block" }}>Estimated output only. This is not a runtime speedup measurement.</span></div></div></div>}
    </section></>;
}

function CodePane({ label, code, after = false }: { label: string; code: string; after?: boolean }) {
  return <div className="code-pane"><div className="code-label">{label}</div><pre className={`ir ${after ? "after" : ""}`}>{code}</pre></div>;
}

function DiffPane({ passName, before, after }: { passName: string; before: string; after: string }) {
  const beforeLines = before.trimEnd().split("\n");
  const afterLines = after.trimEnd().split("\n");
  const afterSet = new Set(afterLines);
  const beforeSet = new Set(beforeLines);
  return <div className="diff-wrap"><div className="code-label">Unified diff · {passName} · derived from IR snapshots</div><pre className="ir diff" aria-label="Unified LLVM IR diff">{beforeLines.map((line, index) => <span className={afterSet.has(line) ? "diff-context" : "diff-remove"} key={`before-${index}`}>- {String(index + 1).padStart(3, "0")} {line}{"\n"}</span>)}{afterLines.map((line, index) => <span className={beforeSet.has(line) ? "diff-context" : "diff-add"} key={`after-${index}`}>+ {String(index + 1).padStart(3, "0")} {line}{"\n"}</span>)}</pre><div className="diff-legend"><span className="diff-remove">− removed</span><span className="diff-add">+ added</span><span>· unchanged context</span></div></div>;
}

function App() {
  return <QueryClientProvider client={new QueryClient()}><Home /></QueryClientProvider>;
}

export default App;