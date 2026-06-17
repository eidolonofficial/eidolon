// hooks/codebase-memory-orient.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatArch, shortQN } from "./codebase-memory-orient.mjs";

// A trimmed but faithful sample of the real `cli get_architecture` raw JSON
// (shape: total_nodes/total_edges/languages/hotspots/layers/entry_points/clusters;
// hotspots = {name, qualified_name, fan_in}).
const PROJECT = "C-Users-x-projects-demo";
const sampleArch = {
  total_nodes: 4188,
  total_edges: 8970,
  languages: [
    { language: "TypeScript", file_count: 205 },
    { language: "Python", file_count: 83 },
  ],
  hotspots: [
    { name: "close", qualified_name: `${PROJECT}.frontend.src.store.matches.close`, fan_in: 97 },
    { name: "connect", qualified_name: `${PROJECT}.backend.db.connect`, fan_in: 29 },
  ],
  layers: [
    { name: "db", layer: "core", reason: "high fan-in" },
    { name: "ui", layer: "core", reason: "high fan-in" },
  ],
  entry_points: [{ name: "main", qualified_name: `${PROJECT}.backend.seed.main`, file: "backend/seed.py" }],
  clusters: [{ id: 11, label: "backend", members: 98, cohesion: 0.77, top_nodes: ["close", "connect"] }],
};

// ---- shortQN: strips the project-id prefix segment ----

test("shortQN: drops the leading project-id token", () => {
  assert.equal(shortQN(`${PROJECT}.frontend.src.store.matches.close`), "frontend.src.store.matches.close");
});
test("shortQN: a name with no dots is returned unchanged", () => {
  assert.equal(shortQN("main"), "main");
});
test("shortQN: empty / nullish is safe", () => {
  assert.equal(shortQN(""), "");
  assert.equal(shortQN(undefined), "");
});

// ---- formatArch: the injected directive body ----

test("formatArch: surfaces god-nodes with fan-in", () => {
  const out = formatArch(sampleArch, { exe: "cbm", project: PROJECT });
  assert.match(out, /close/);
  assert.match(out, /97/);
  assert.match(out, /connect/);
  assert.match(out, /29/);
});
test("formatArch: hotspot paths are shown stripped of the project prefix", () => {
  const out = formatArch(sampleArch, { exe: "cbm", project: PROJECT });
  assert.match(out, /store\.matches\.close/);
  assert.ok(!new RegExp(PROJECT.replace(/[-]/g, "\\$&") + "\\.frontend\\.src\\.store").test(out),
    "project prefix should be stripped from displayed qualified names");
});
test("formatArch: includes node/edge counts and languages", () => {
  const out = formatArch(sampleArch, { exe: "cbm", project: PROJECT });
  assert.match(out, /4188/);
  assert.match(out, /8970/);
  assert.match(out, /TypeScript/);
});
test("formatArch: ENFORCED ORIENT-GATE block names cbm (primary) + graphify (fallback), 'source code'", () => {
  const out = formatArch(sampleArch, { exe: "cbm", project: PROJECT });
  assert.match(out, /ORIENT-GATE/);
  assert.match(out, /editing source code/);
  assert.match(out, /codebase-memory-mcp/);
  assert.match(out, /graphify/i);
  assert.match(out, /mempalace search/);
});
test("formatArch: a filled wing adds --wing; an unfilled <WING> placeholder does not", () => {
  const withWing = formatArch(sampleArch, { exe: "cbm", project: PROJECT, wing: "demo_wing" });
  assert.match(withWing, /--wing demo_wing/);
  const noWing = formatArch(sampleArch, { exe: "cbm", project: PROJECT, wing: "<WING>" });
  assert.ok(!/--wing/.test(noWing), "unfilled <WING> placeholder must not emit a --wing flag");
});
test("formatArch: empty architecture does not throw and still emits the gate", () => {
  const out = formatArch({}, { exe: "cbm", project: PROJECT });
  assert.equal(typeof out, "string");
  assert.match(out, /ORIENT-GATE/);
});
