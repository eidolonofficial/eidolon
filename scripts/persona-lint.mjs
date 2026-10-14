// scripts/persona-lint.mjs
//
// Validates a persona file against the construction template
// (references/persona-template.md) and a generated agent file against the agent
// contract (references/setup-workflow.md Stage 5). Enforces the anti-synthetic
// rail: a persona with no framework anchor is rejected, the same way a finding with
// no detection branch is rejected. Node built-ins only; read-only; reports, never fixes.
//
//   node scripts/persona-lint.mjs references/personas/<name>.md [more files]
//   node scripts/persona-lint.mjs --agent .claude/agents/<name>.md
//
// A .md file under a directory named "agents" is linted as an agent file without the flag.
// README.md files are skipped (they describe personas, they are not personas).

import { readFileSync } from "node:fs";

const MODEL_ALIASES = ["sonnet", "opus", "haiku", "fable", "inherit"];
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

// Body of a "## <name>" section, or null when absent.
function section(text, name) {
  const m = text.match(new RegExp("(^|\\n)##\\s*" + name + "\\b[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)", "i"));
  return m ? m[2] : null;
}

// The Reasoning contract: the section exists and names cause, falsifier and evidence.
function reasoningProblems(text) {
  const body = section(text, "Reasoning");
  if (body === null) return ["missing ## Reasoning section (cause, falsifier, evidence chain)"];
  const lacking = ["cause", "falsifier", "evidence"].filter((w) => !new RegExp(w, "i").test(body));
  return lacking.length ? ["## Reasoning section lacks the word(s): " + lacking.join(", ")] : [];
}

// Returns { ok, problems } for a persona file's text.
export function validatePersona(text) {
  const problems = [];
  const require_ = (re, label) => { if (!re.test(text)) problems.push("missing " + label); };

  require_(/(^|\n)\s*persona:\s*\S/, "persona id");
  require_(/(^|\n)\s*title:\s*\S/, "title");
  require_(/(^|\n)\s*swarm:\s*\S/, "swarm");

  // the anti-synthetic rail: anchors must exist and carry at least one entry
  const anchors = text.match(/(^|\n)\s*anchors:\s*\[([^\]]*)\]/);
  if (!anchors || !anchors[2].trim()) {
    problems.push("no framework anchor (the anti-synthetic rail: no anchor, no seat)");
  }

  require_(/(^|\n)\s*anti_behaviors:/, "anti_behaviors block");
  require_(/(^|\n)\s*floor:/, "anti_behaviors.floor");
  require_(/(^|\n)\s*specific:/, "anti_behaviors.specific");

  // the rail is anchor AND evidence contract (design spec section 19): require both
  require_(/(^|\n)#{1,6}\s*evidence contract\b/i, "Evidence contract section (the rail: anchor and evidence contract)");

  problems.push(...reasoningProblems(text));

  return { ok: problems.length === 0, problems };
}

// Frontmatter as { key: rawValue } plus the body after it; null when there is none.
function frontmatter(text) {
  const m = text.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const fields = {};
  let key = null;
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) { key = kv[1]; fields[key] = kv[2].trim(); }
    else if (key && line.trim()) fields[key] += " " + line.trim();   // list or folded continuation
  }
  return { fields, body: m[2] };
}

// Returns { ok, problems } for a generated agent file's text.
export function validateAgent(text) {
  const problems = [];
  const fm = frontmatter(text);
  if (!fm) return { ok: false, problems: ["missing YAML frontmatter (name, description, tools, model, effort)"] };
  const { fields, body } = fm;

  for (const k of ["name", "description", "tools", "model", "effort"]) {
    if (!fields[k]) problems.push("frontmatter missing " + k);
  }

  if (fields.tools) {
    const tools = fields.tools.split(/[\s,\[\]]+/).map((t) => t.replace(/^-+|["']/g, "")).filter(Boolean);
    // Task is the legacy name of the Agent tool; both let a worker spawn workers
    if (tools.some((t) => /^(Agent|Task)\b/.test(t))) problems.push("tools must never include Agent (workers do not spawn workers)");
  }

  if (fields.model) {
    const model = fields.model.replace(/["']/g, "");
    if (!MODEL_ALIASES.includes(model) && !/^claude-[a-z0-9][a-z0-9.-]*$/.test(model)) {
      problems.push("model must be one of " + MODEL_ALIASES.join(", ") + " or a full model id (got " + model + ")");
    }
  }

  if (fields.effort && !EFFORTS.includes(fields.effort.replace(/["']/g, ""))) {
    problems.push("effort must be one of " + EFFORTS.join(", ") + " (got " + fields.effort + ")");
  }

  problems.push(...reasoningProblems(body));
  if (!/(^|\n)\s*(\*\*)?anchors(\*\*)?\s*:/i.test(body)) problems.push("missing anchors line");
  if (!/anti[-_ ]behaviou?rs[^\n]*\n(\s*\n)*\s*(-|\*|\d+\.|\[)/i.test(body)) problems.push("missing anti-behaviors list");
  if (section(body, "Brief contract") === null) problems.push("missing ## Brief contract section");

  return { ok: problems.length === 0, problems };
}

const isAgentPath = (p) => /(^|\/)agents\/[^/]+\.md$/.test(p.replace(/\\/g, "/"));

// CLI (only when this module is the entry point, never when imported)
const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("persona-lint.mjs");
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const agentFlag = args.includes("--agent");
  const paths = args.filter((a) => a !== "--agent" && !/(^|[\\/])README\.md$/i.test(a));
  if (!paths.length) { console.error("FAIL  no file given"); process.exit(1); }
  let failed = 0;
  for (const path of paths) {
    try {
      const text = readFileSync(path, "utf8");
      const agent = agentFlag || isAgentPath(path);
      const r = agent ? validateAgent(text) : validatePersona(text);
      if (!r.ok) { failed++; console.error("FAIL  " + path + "\n  " + r.problems.join("\n  ")); }
      else if (paths.length === 1) console.log("PASS  " + (agent ? "agent" : "persona") + " is well-formed: " + path);
    } catch (e) {
      failed++; console.error("FAIL  could not read " + path + ": " + e.message);
    }
  }
  if (failed) process.exit(1);
  if (paths.length > 1) console.log("PASS  " + paths.length + " files well-formed");
}
