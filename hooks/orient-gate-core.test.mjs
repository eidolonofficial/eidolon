// hooks/orient-gate-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  sense, recordRead, readSentinel, writeSentinel, sentinelPath, repoRoot,
  isSourceCodePath, isDispatchTool, isCodeEditTool, decideGate,
} from "./orient-gate-core.mjs";

// ---- sense: each active-orientation read form ----

test("sense: Read of GRAPH_REPORT.md -> graphify", () => {
  assert.equal(sense({ tool_name: "Read", tool_input: { file_path: "graphify-out/GRAPH_REPORT.md" } }), "graphify");
});
test("sense: Read of graph.json (Windows path) -> graphify", () => {
  assert.equal(sense({ tool_name: "Read", tool_input: { file_path: "C:\\proj\\graphify-out\\graph.json" } }), "graphify");
});
test("sense: Bash graphify query -> graphify", () => {
  assert.equal(sense({ tool_name: "Bash", tool_input: { command: 'graphify query "auth module"' } }), "graphify");
});
test("sense: Skill graphify -> graphify", () => {
  assert.equal(sense({ tool_name: "Skill", tool_input: { skill: "graphify", args: "query auth" } }), "graphify");
});
test("sense: Bash mempalace search -> mempalace", () => {
  assert.equal(sense({ tool_name: "Bash", tool_input: { command: 'mempalace search "auth"' } }), "mempalace");
});
test("sense: mempalace MCP search tool -> mempalace", () => {
  assert.equal(sense({ tool_name: "mcp__mempalace__search", tool_input: { query: "auth" } }), "mempalace");
});
test("sense: an unrelated Read -> null", () => {
  assert.equal(sense({ tool_name: "Read", tool_input: { file_path: "src/app.ts" } }), null);
});
test("sense: a mempalace MINE (not search) -> null", () => {
  assert.equal(sense({ tool_name: "Bash", tool_input: { command: "mempalace mine ." } }), null);
});

// ---- sense: codebase-memory-mcp (PRIMARY structural surface) -> the structural flag ----
// The flag is keyed "graphify" for back-compat (decideGate is unchanged); it now means
// "structural code-graph oriented via codebase-memory-mcp OR graphify".

test("sense: Bash codebase-memory-mcp cli query -> graphify", () => {
  assert.equal(sense({ tool_name: "Bash", tool_input: { command: `codebase-memory-mcp cli get_architecture '{"project":"x"}'` } }), "graphify");
});
test("sense: Bash full-path codebase-memory-mcp.exe cli query -> graphify", () => {
  assert.equal(sense({ tool_name: "Bash", tool_input: { command: `"C:/x/codebase-memory-mcp.exe" cli search_graph '{}'` } }), "graphify");
});
test("sense: codebase-memory-mcp MCP tool (any verb) -> graphify", () => {
  assert.equal(sense({ tool_name: "mcp__codebase-memory-mcp__get_architecture", tool_input: {} }), "graphify");
});
test("sense: merely MENTIONING codebase-memory without a cli query -> null (no false orient)", () => {
  assert.equal(sense({ tool_name: "Bash", tool_input: { command: "cat .claude/codebase-memory.json" } }), null);
});

// ---- isSourceCodePath / tool classifiers ----

test("isSourceCodePath: a source file anywhere is gated", () => {
  assert.equal(isSourceCodePath("src/app.ts"), true);
  assert.equal(isSourceCodePath("backend/rules.py"), true);
  assert.equal(isSourceCodePath("packages/core/lib/util.go"), true);
});
test("isSourceCodePath: absolute path to source is gated", () => {
  assert.equal(isSourceCodePath("C:\\Users\\x\\proj\\src\\GlobeMap.tsx"), true);
});
test("isSourceCodePath: markdown / config / data are not source", () => {
  assert.equal(isSourceCodePath("README.md"), false);
  assert.equal(isSourceCodePath("package.json"), false);
  assert.equal(isSourceCodePath("data/seed.csv"), false);
});
test("isSourceCodePath: source under exempt dirs is not gated", () => {
  assert.equal(isSourceCodePath("docs/examples/demo.ts"), false);
  assert.equal(isSourceCodePath(".claude/hooks/orient-gate.mjs"), false);
  assert.equal(isSourceCodePath("mockups/preview/app.js"), false);
  assert.equal(isSourceCodePath("dist/bundle.js"), false);
  assert.equal(isSourceCodePath("node_modules/pkg/index.js"), false);
});
test("isDispatchTool: Task and Agent", () => {
  assert.equal(isDispatchTool("Task"), true);
  assert.equal(isDispatchTool("Agent"), true);
  assert.equal(isDispatchTool("Bash"), false);
});
test("isCodeEditTool: Write/Edit/NotebookEdit", () => {
  assert.equal(isCodeEditTool("Write"), true);
  assert.equal(isCodeEditTool("Edit"), true);
  assert.equal(isCodeEditTool("NotebookEdit"), true);
  assert.equal(isCodeEditTool("Read"), false);
});

// ---- decideGate (pure; sentinel is THIS session's own record) ----

const SID = "sess-abc";
const both = { sessionId: SID, graphifyReadAt: "t1", mempalaceReadAt: "t2" };

test("decideGate: agent dispatch with no orientation -> block", () => {
  const v = decideGate({ toolName: "Agent", filePath: "", sessionId: SID, sentinel: null });
  assert.equal(v.kind, "block");
  assert.match(v.why, /graphify/);
  assert.match(v.why, /mempalace/);
  assert.match(v.why, /settled decisions/);
});
test("decideGate: agent dispatch fully oriented -> allow", () => {
  assert.equal(decideGate({ toolName: "Agent", filePath: "", sessionId: SID, sentinel: both }), null);
});
test("decideGate: source edit with no orientation -> block", () => {
  const v = decideGate({ toolName: "Edit", filePath: "src/app.ts", sessionId: SID, sentinel: null });
  assert.equal(v.kind, "block");
  assert.match(v.why, /editing source code/);
});
test("decideGate: source edit fully oriented -> allow", () => {
  assert.equal(decideGate({ toolName: "Edit", filePath: "src/app.ts", sessionId: SID, sentinel: both }), null);
});
test("decideGate: a docs/markdown edit is never gated (allow even un-oriented)", () => {
  assert.equal(decideGate({ toolName: "Edit", filePath: "docs/DECISIONS.md", sessionId: SID, sentinel: null }), null);
  assert.equal(decideGate({ toolName: "Write", filePath: "README.md", sessionId: SID, sentinel: null }), null);
});
test("decideGate: a Read is never gated", () => {
  assert.equal(decideGate({ toolName: "Read", filePath: "src/app.ts", sessionId: SID, sentinel: null }), null);
});
test("decideGate: a sentinel whose sessionId does not match -> block (defensive)", () => {
  const other = { sessionId: "other", graphifyReadAt: "t1", mempalaceReadAt: "t2" };
  assert.equal(decideGate({ toolName: "Agent", filePath: "", sessionId: SID, sentinel: other }).kind, "block");
});
test("decideGate: only graphify read -> block, names the missing mempalace", () => {
  const partial = { sessionId: SID, graphifyReadAt: "t1" };
  const v = decideGate({ toolName: "Agent", filePath: "", sessionId: SID, sentinel: partial });
  assert.equal(v.kind, "block");
  assert.match(v.why, /mempalace/);
});
test("decideGate: missing session id -> fail open (allow)", () => {
  assert.equal(decideGate({ toolName: "Agent", filePath: "", sessionId: "", sentinel: null }), null);
});

// ---- repoRoot + per-session sentinel files (real fs, temp dir) ----

test("repoRoot walks up to the .git dir; the sentinel is anchored there", () => {
  const root = mkdtempSync(join(tmpdir(), "orient-gate-"));
  mkdirSync(join(root, ".git"), { recursive: true });
  mkdirSync(join(root, ".claude"), { recursive: true });
  const sub = join(root, "backend", "tests");
  mkdirSync(sub, { recursive: true });
  try {
    assert.equal(repoRoot(sub), root);
    recordRead(sub, { session_id: "S", tool_name: "Read", tool_input: { file_path: "graphify-out/graph.json" } });
    const fromRoot = readSentinel(root, "S");
    const fromOther = readSentinel(join(root, "frontend", "src"), "S");
    assert.ok(fromRoot && fromRoot.graphifyReadAt);
    assert.deepEqual(fromRoot, fromOther);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("sentinelPath: distinct per session id", () => {
  const root = mkdtempSync(join(tmpdir(), "orient-gate-"));
  try {
    assert.notEqual(sentinelPath(root, "A"), sentinelPath(root, "B"));
    assert.match(sentinelPath(root, "A"), /\.orient-gate\.A\.json$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("recordRead: records graphify then mempalace for one session, then the gate allows", () => {
  const root = mkdtempSync(join(tmpdir(), "orient-gate-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  try {
    recordRead(root, { session_id: SID, tool_name: "Read", tool_input: { file_path: "graphify-out/GRAPH_REPORT.md" } });
    let s = readSentinel(root, SID);
    assert.ok(s.graphifyReadAt && !s.mempalaceReadAt);
    assert.equal(decideGate({ toolName: "Agent", filePath: "", sessionId: SID, sentinel: s }).kind, "block");

    recordRead(root, { session_id: SID, tool_name: "Bash", tool_input: { command: 'mempalace search "x"' } });
    s = readSentinel(root, SID);
    assert.ok(s.graphifyReadAt && s.mempalaceReadAt);
    assert.equal(decideGate({ toolName: "Agent", filePath: "", sessionId: SID, sentinel: s }), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("recordRead: CONCURRENT sessions write separate files and never clobber (the fix)", () => {
  const root = mkdtempSync(join(tmpdir(), "orient-gate-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  try {
    recordRead(root, { session_id: "A", tool_name: "Read", tool_input: { file_path: "graphify-out/GRAPH_REPORT.md" } });
    recordRead(root, { session_id: "A", tool_name: "Bash", tool_input: { command: 'mempalace search "x"' } });
    recordRead(root, { session_id: "B", tool_name: "Read", tool_input: { file_path: "graphify-out/graph.json" } });

    const a = readSentinel(root, "A");
    const b = readSentinel(root, "B");
    assert.ok(a.graphifyReadAt && a.mempalaceReadAt, "A keeps BOTH flags despite B writing");
    assert.ok(b.graphifyReadAt && !b.mempalaceReadAt, "B has only its own graphify flag");
    assert.equal(decideGate({ toolName: "Agent", filePath: "", sessionId: "A", sentinel: a }), null);
    assert.equal(decideGate({ toolName: "Agent", filePath: "", sessionId: "B", sentinel: b }).kind, "block");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readSentinel: fails open (returns null) on corrupt JSON, gate then blocks a gated op", () => {
  const root = mkdtempSync(join(tmpdir(), "orient-gate-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  try {
    writeFileSync(sentinelPath(root, SID), "{ not json", "utf8");
    assert.equal(readSentinel(root, SID), null);
    assert.equal(decideGate({ toolName: "Agent", filePath: "", sessionId: SID, sentinel: readSentinel(root, SID) }).kind, "block");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("recordRead: a codebase-memory cli query satisfies the STRUCTURAL half; gate still blocks until mempalace (enforcement preserved)", () => {
  const root = mkdtempSync(join(tmpdir(), "orient-gate-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  try {
    recordRead(root, { session_id: SID, tool_name: "Bash", tool_input: { command: `codebase-memory-mcp cli get_architecture '{"project":"x"}'` } });
    let s = readSentinel(root, SID);
    assert.ok(s.graphifyReadAt && !s.mempalaceReadAt, "cbm cli sets the structural (graphify) flag");
    // SILENT-GATE-DECAY GUARD: still blocks until mempalace is also read
    assert.equal(decideGate({ toolName: "Agent", filePath: "", sessionId: SID, sentinel: s }).kind, "block");

    recordRead(root, { session_id: SID, tool_name: "Bash", tool_input: { command: 'mempalace search "x"' } });
    s = readSentinel(root, SID);
    assert.equal(decideGate({ toolName: "Agent", filePath: "", sessionId: SID, sentinel: s }), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
