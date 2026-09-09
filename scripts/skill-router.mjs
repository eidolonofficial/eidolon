// Deterministic routing constraints. Scores rank evidence; they are not permissions or probabilities.
const COMMON = new Set('api auth build cache code db error git http https json login node python react skill sql test token user'.split(' '));
const norm = value => String(value ?? '').normalize('NFKC').trim().toLowerCase();
const unique = values => [...new Set(values)];
const strings = (value, field, limit = 128) => {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > limit || value.some(x => typeof x !== 'string' || !x.trim() || x.length > 2048)) throw Error('Invalid ' + field);
  return unique(value.map(x => x.trim()));
};
const tokens = value => norm(value).split(/[^a-z0-9_./:+-]+/).filter(x => x.length > 2 && !COMMON.has(x));
const match = (hay, needle) => norm(needle).length >= 3 && norm(hay).includes(norm(needle));
const concrete = value => { const n = norm(value); return n.length >= 3 && !COMMON.has(n); };
const identity = c => c.id || (c.source || c.path || c.revision ? [c.name, c.source || '', c.path || '', c.revision || ''].join('::') : c.name);
function positiveMatch(task, phrase) {
  const text = norm(task), needle = norm(phrase);
  let at = text.indexOf(needle);
  while (at >= 0) {
    const prefix = text.slice(Math.max(0, at - 100), at).split(/[;\n.!?]/).at(-1);
    if (!/\b(?:do not|don't|never|without|avoid|not to)\b/.test(prefix)) return true;
    at = text.indexOf(needle, at + needle.length);
  }
  return false;
}
function checked(c) {
  if (!c || Array.isArray(c) || typeof c !== 'object' || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(c.name || '') || typeof c.description !== 'string' || !c.description.trim() || c.description.length > 8192) throw Error('Invalid skill metadata');
  for (const key of ['id','source','path','revision','project','projectRoot']) if (c[key] != null && (typeof c[key] !== 'string' || c[key].length > 2048 || /[\0\r\n]/.test(c[key]))) throw Error('Invalid skill identity');
  const out = {...c};
  for (const key of ['triggers','signals','risk','excludes','conflicts','requires','requiresSkills','provides','effects','hosts','modes']) out[key] = unique(strings(c[key], key).map(norm));
  if (c.scope != null && !['project','global'].includes(c.scope)) throw Error('Invalid scope');
  out.id = identity(c); return out;
}
export function scoreSkill(input, candidate) {
  const c = checked(candidate), task = input.task || '', reasons = [], rejects = [];
  const explicit = strings(input.explicitSkills, 'explicitSkills').some(x => x === c.id || norm(x) === c.name);
  const repo = strings(input.repoSignals, 'repoSignals'), risks = strings(input.riskTags, 'riskTags').map(norm);
  let score = explicit ? 100 : 0;
  if (explicit) reasons.push('explicit-user-choice');
  if (c.enabled === false || c.trusted === false) rejects.push('disabled-or-untrusted');
  if (!explicit && (c.disableModelInvocation === true || c['disable-model-invocation'] === true)) rejects.push('manual-invocation-only');
  if (c.hosts.length && !c.hosts.includes(norm(input.host))) rejects.push('unsupported-host');
  if (c.modes.length && !c.modes.includes(norm(input.mode))) rejects.push('task-mode-mismatch');
  if ((c.scope === 'project' || c.project) && (!c.project || c.project !== input.project)) rejects.push('project-scope-mismatch');
  if (c.projectRoot && c.projectRoot.replace(/\\/g,'/').replace(/\/$/,'') !== String(input.projectRoot || '').replace(/\\/g,'/').replace(/\/$/,'')) rejects.push('project-root-mismatch');
  if (['review','explain','plan'].includes(input.mode) && c.effects.some(e => e !== 'read')) rejects.push('effect-not-authorized-by-review');
  if (c.effects.some(e => strings(input.forbiddenEffects, 'forbiddenEffects').map(norm).includes(e))) rejects.push('forbidden-effect');
  if (input.allowedEffects && c.effects.some(e => !strings(input.allowedEffects, 'allowedEffects').map(norm).includes(e))) rejects.push('effect-out-of-scope');
  for (const ex of c.excludes) if (match(task, ex) || repo.some(s => match(s, ex))) rejects.push('excluded:' + ex);
  const add = (values, weight, cap, prefix) => { score += Math.min(cap, values.length * weight); reasons.push(...values.map(x => prefix + x)); };
  add(c.triggers.filter(x => concrete(x) && positiveMatch(task, x)), 12, 24, 'trigger:');
  add(c.signals.filter(x => concrete(x) && repo.some(s => match(s, x))), 8, 16, 'repo:');
  add(c.risk.filter(x => risks.includes(x)), 10, 20, 'risk:');
  const descriptionWords = new Set(tokens(c.description));
  const overlap = unique(tokens(task)).filter(x => descriptionWords.has(x)).slice(0,4);
  if (overlap.length) { score += overlap.length; reasons.push('description:' + overlap.join(',')); }
  if (c.requires.some(x => !strings(input.availableCapabilities,'availableCapabilities').map(norm).includes(x))) rejects.push('missing-prerequisite');
  return {id:c.id, name:c.name, score, reasons:unique(reasons), rejects:unique(rejects), explicit, candidate:c};
}
export function routeSkills(input, candidates, options = {}) {
  if (!input || Array.isArray(input) || typeof input !== 'object' || (input.task != null && (typeof input.task !== 'string' || input.task.length > 32768))) throw Error('Invalid task');
  if (!Array.isArray(candidates) || candidates.length > 256) throw Error('Invalid candidates');
  const threshold = options.threshold ?? 8;
  if (!Number.isFinite(threshold) || threshold < 1 || threshold > 1000) throw Error('Invalid threshold');
  for (const key of ['explicitSkills','requiredCapabilities','repoSignals','riskTags','availableCapabilities','allowedEffects','forbiddenEffects']) strings(input[key],key);
  const explicit = strings(input.explicitSkills,'explicitSkills');
  const required = strings(input.requiredCapabilities,'requiredCapabilities').map(norm);
  const scored = candidates.map((c,i) => {
    try { return scoreSkill(input,c); }
    catch { return {id:'invalid:'+i,name:typeof c?.name === 'string' ? c.name : 'invalid',score:0,reasons:[],rejects:['invalid-metadata'],explicit:false,candidate:{conflicts:[],requiresSkills:[],provides:[]}}; }
  });
  const lookup = ref => scored.filter(s => s.id === ref || s.name === norm(ref));
  const issues = [], missingExplicit = [];
  for (const ref of explicit) {
    const hits = lookup(ref);
    if (hits.length > 1) issues.push({kind:'ambiguous-explicit-skill',skill:ref});
    else if (hits.length === 0 || hits[0].rejects.length) missingExplicit.push(ref);
  }
  for (const s of scored) if (scored.filter(x => x.id === s.id).length > 1) s.rejects.push('duplicate-identity');
  const clashes = (a,b) => a.candidate.conflicts.some(x => x === norm(b.id) || x === b.name) || b.candidate.conflicts.some(x => x === norm(a.id) || x === a.name);
  const chosenExplicit = scored.filter(s => s.explicit && !s.rejects.length);
  for (let i=0;i<chosenExplicit.length;i++) for(let j=i+1;j<chosenExplicit.length;j++) if(clashes(chosenExplicit[i],chosenExplicit[j])) issues.push({kind:'conflicting-explicit-skills',skills:[chosenExplicit[i].id,chosenExplicit[j].id]});
  const closure = (item, visiting = new Set()) => {
    if (visiting.has(item.id)) throw Error('dependency-cycle');
    if (item.rejects.length) throw Error('ineligible-dependency');
    const next = new Set([...visiting,item.id]), out = [];
    for (const ref of item.candidate.requiresSkills) {
      const deps=lookup(ref);
      if(deps.length!==1) throw Error(deps.length ? 'ambiguous-dependency' : 'missing-dependency');
      out.push(...closure(deps[0],next));
    }
    out.push(item); return [...new Map(out.map(x=>[x.id,x])).values()];
  };
  const selected=[], covered=new Set(), evidence=new Set();
  const viable=scored.filter(s=>!s.rejects.length && (s.explicit || s.score>=threshold)).sort((a,b)=>Number(b.explicit)-Number(a.explicit)||b.score-a.score||a.id.localeCompare(b.id));
  if (!issues.length && input.policyDenied!==true) for(const item of viable) {
    if(selected.some(s=>s.id===item.id)) continue;
    let group;
    try {group=closure(item);} catch(e) {item.rejects.push(e.message);continue;}
    const combined=[...new Map([...selected,...group].map(x=>[x.id,x])).values()];
    if(combined.some((a,i)=>combined.slice(i+1).some(b=>clashes(a,b)))) {item.rejects.push('conflict');continue;}
    const addsNeed=group.some(x=>x.candidate.provides.some(p=>!covered.has(p) && (!required.length || required.includes(p))));
    const addsEvidence=item.reasons.filter(r=>r!=='explicit-user-choice').some(r=>!evidence.has(r));
    if(!item.explicit && !addsNeed && (!addsEvidence || (required.length && item.candidate.provides.length))) continue;
    for(const x of group) if(!selected.some(s=>s.id===x.id)) {
      selected.push(x); for(const p of x.candidate.provides) covered.add(p); for(const r of x.reasons) evidence.add(r);
    }
  }
  const uncovered=unique([...required.filter(x=>!covered.has(x)).map(x=>'capability:'+x),...missingExplicit.map(x=>'skill:'+x),...explicit.filter(x=>!selected.some(s=>s.id===x||s.name===norm(x))).map(x=>'skill:'+x)]);
  const status=input.policyDenied===true ? 'blocked' : issues.length ? 'needs_input' : uncovered.length ? 'gap' : selected.length ? 'ready' : 'direct';
  return {routingVersion:2,status,selected:selected.map(({id,name,score,reasons,explicit,candidate})=>({id,name,score,reasons,explicit,provides:candidate.provides,source:candidate.source||null,path:candidate.path||null,revision:candidate.revision||null})),
    rejected:scored.filter(x=>!selected.some(s=>s.id===x.id)).map(x=>({id:x.id,name:x.name,score:x.score,reasons:x.reasons,rejectedBecause:unique(x.rejects.length?x.rejects:['lower-confidence-or-redundant'])})),
    covered:required.filter(x=>covered.has(x)),uncovered,issues,threshold,
    // Compatibility only: old callers used gap for an empty recommendation. Use status and uncovered in new code.
    gap:selected.length===0||uncovered.length>0||issues.length>0,authority:'selection-is-not-permission'};
}
async function cli() {
  let data='';
  try {
    for await(const chunk of process.stdin) {data+=chunk;if(Buffer.byteLength(data)>1024*1024)throw Error('Input too large');}
    const payload=JSON.parse(data); process.stdout.write(JSON.stringify(routeSkills(payload,payload.candidates),null,2)+'\n');
  } catch {console.error('skill-router: invalid or oversized routing input');process.exitCode=2;}
}
if(process.argv[1]?.replace(/\\/g,'/').endsWith('/skill-router.mjs')) cli();
