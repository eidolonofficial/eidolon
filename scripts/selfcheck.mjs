// scripts/selfcheck.mjs
//
// Verifies eidolon's own invariants in one command (design spec section 10:
// recursive verification - eidolon runs against itself). Read-only over the
// repo; it reports and never auto-fixes. Exits non-zero on any failed invariant.
//
//   node scripts/selfcheck.mjs                 # check the repo it lives in
//   node scripts/selfcheck.mjs --dir PATH      # check another checkout
//   node scripts/selfcheck.mjs --profile NAME  # load profiles/NAME.json for extra paths

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const dir = arg("--dir") || ".";

let failures = 0;
const pass = (m) => console.log("PASS  " + m);
const fail = (m) => { console.error("FAIL  " + m); failures += 1; };

// 1. every hook parses (safe exec: argument array, no shell string)
const hooksDir = join(dir, "hooks");
if (existsSync(hooksDir)) {
  for (const f of readdirSync(hooksDir)) {
    if (!f.endsWith(".mjs")) continue;
    const file = join(hooksDir, f);
    try { execFileSync("node", ["--check", file], { stdio: "pipe" }); pass("hook parses: " + f); }
    catch { fail("hook does not parse: " + file); }
  }
}

// 2. settings.json is valid JSON
const settings = join(dir, ".claude", "settings.json");
if (existsSync(settings)) {
  try { JSON.parse(readFileSync(settings, "utf8")); pass("settings.json is valid JSON"); }
  catch { fail("settings.json is not valid JSON"); }
}

// 3. no em or en dash in the skill, reference, and hook docs (U+2014, U+2013)
const DASH = /[\u2014\u2013]/;
const targets = [join(dir, "SKILL.md")];
for (const sub of ["references", "hooks"]) {
  const d = join(dir, sub);
  if (existsSync(d)) for (const f of readdirSync(d)) if (f.endsWith(".md")) targets.push(join(d, f));
}

// optional: a named profile under profiles/ can list extra files to dash-check.
// The name is confined to profiles/ (no separators, no traversal) and every
// listed path is confined to the repo root, so a profile cannot read outside it.
const profile = arg("--profile");
if (profile) {
  const profilesDir = resolve(dir, "profiles");
  const repoRoot = resolve(dir);
  const inside = (p, root) => p === root || p.startsWith(root + sep);
  if (profile.includes("..") || /[\\/]/.test(profile)) {
    fail("profile name must be a bare filename under profiles/: " + profile);
  } else {
    const profilePath = resolve(profilesDir, profile);
    if (!inside(profilePath, profilesDir)) {
      fail("profile path escapes profiles/: " + profile);
    } else if (!existsSync(profilePath)) {
      fail("profile not found: " + profile);
    } else {
      try {
        const extra = JSON.parse(readFileSync(profilePath, "utf8"));
        for (const t of extra.files || []) {
          const rt = resolve(dir, t);
          if (inside(rt, repoRoot)) targets.push(rt);
          else fail("profile lists a path outside the repo: " + t);
        }
      } catch { fail("profile is not valid JSON: " + profile); }
    }
  }
}

for (const t of targets) {
  if (!existsSync(t)) continue;
  if (DASH.test(readFileSync(t, "utf8"))) fail("em or en dash in " + t);
  else pass("no em or en dash: " + t);
}

console.log(failures === 0 ? "\nselfcheck: PASS" : "\nselfcheck: FAIL (" + failures + ")");
process.exit(failures === 0 ? 0 : 1);
