// Evidence-based, host-neutral skill routing for Eidolon.
// Pure routing logic is exported for tests and adapters; CLI accepts JSON on stdin.

const COMMON = new Set([
  'api','auth','build','cache','code','db','error','git','http','https','json','login','node',
  'python','react','skill','sql','test','token','user'
]);

const words = (v) => String(v || '')
  .toLowerCase()
  .replace(/[^a-z0-9_./:+-]+/g, ' ')
  .split(/\s+/)
  .filter(Boolean);

const phraseMatch = (haystack, needle) => {
  const h = String(haystack || '').toLowerCase();
  const n = String(needle || '').trim().toLowerCase();
  return n.length >= 3 && h.includes(n);
};

const concreteTrigger = (trigger) => {
  const t = String(trigger || '').trim().toLowerCase();
  if (!t) return false;
  if (/[\s./:_-]/.test(t) || /\d/.test(t)) return true;
  return !COMMON.has(t);
};

const unique = (xs) => [...new Set(xs)];

export function scoreSkill(input, candidate) {
  const task = String(input.task || '');
  const repoSignals = unique(input.repoSignals || []).map(String);
  const riskTags = unique(input.riskTags || []).map(String);
  const explicit = unique(input.explicitSkills || []).map((x) => String(x).toLowerCase());
  const name = String(candidate.name || '').toLowerCase();
  const reasons = [];
  const rejects = [];
  let score = 0;

  if (!name || !candidate.description) rejects.push('missing portable name/description');

  for (const ex of candidate.excludes || []) {
    if (phraseMatch(task, ex) || repoSignals.some((s) => phraseMatch(s, ex))) {
      rejects.push(`excluded:${ex}`);
    }
  }

  const isExplicit = explicit.includes(name);
  if (isExplicit) {
    score += 100;
    reasons.push('explicit-user-choice');
  }

  for (const trigger of candidate.triggers || []) {
    if (!concreteTrigger(trigger)) continue;
    if (phraseMatch(task, trigger)) {
      score += 12;
      reasons.push(`trigger:${trigger}`);
    }
  }

  for (const signal of candidate.signals || []) {
    if (repoSignals.some((s) => phraseMatch(s, signal) || phraseMatch(signal, s))) {
      score += 8;
      reasons.push(`repo:${signal}`);
    }
  }

  for (const risk of candidate.risk || []) {
    if (riskTags.some((r) => r.toLowerCase() === String(risk).toLowerCase())) {
      score += 10;
      reasons.push(`risk:${risk}`);
    }
  }

  const taskWords = new Set(words(task).filter((w) => w.length > 2 && !COMMON.has(w)));
  const descWords = new Set(words(candidate.description));
  const overlap = [...taskWords].filter((w) => descWords.has(w)).slice(0, 4);
  if (overlap.length) {
    score += Math.min(4, overlap.length);
    reasons.push(`description:${overlap.join(',')}`);
  }

  if ((candidate.requires || []).some((req) => !(input.availableCapabilities || []).includes(req))) {
    rejects.push('missing-prerequisite');
  }

  return { name, score, reasons, rejects, explicit: isExplicit, candidate };
}

export function routeSkills(input, candidates, options = {}) {
  const threshold = options.threshold ?? 8;
  const scored = candidates.map((c) => scoreSkill(input, c));
  const viable = scored
    .filter((x) => x.rejects.length === 0 && (x.explicit || x.score >= threshold))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const selected = [];
  const covered = new Set();
  const conflicts = new Set();

  for (const item of viable) {
    if (conflicts.has(item.name)) continue;
    const evidence = item.reasons.filter((r) => r !== 'explicit-user-choice');
    const addsEvidence = item.explicit || evidence.some((r) => !covered.has(r));
    if (!addsEvidence) continue;
    selected.push(item);
    for (const r of evidence) covered.add(r);
    for (const c of item.candidate.conflicts || []) conflicts.add(String(c).toLowerCase());
  }

  const rejected = scored
    .filter((x) => !selected.some((s) => s.name === x.name))
    .map((x) => ({
      name: x.name,
      score: x.score,
      reasons: x.reasons,
      rejectedBecause: x.rejects.length ? x.rejects : ['lower-confidence-or-redundant']
    }));

  return {
    selected: selected.map((x) => ({ name: x.name, score: x.score, reasons: x.reasons, explicit: x.explicit })),
    rejected,
    gap: selected.length === 0,
    threshold
  };
}

async function cli() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  let payload;
  try { payload = JSON.parse(data || '{}'); }
  catch { console.error('skill-router: invalid JSON input'); process.exit(2); }
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.candidates)) {
    console.error('skill-router: input requires candidates[]'); process.exit(2);
  }
  process.stdout.write(JSON.stringify(routeSkills(payload, payload.candidates), null, 2) + '\n');
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/skill-router.mjs')) cli();
