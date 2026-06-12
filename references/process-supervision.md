# Process supervision

<!-- why: a long-lived dev process is a cache of code that was true when it started.
     code-on-disk moves forward; the process does not. the gap is invisible until a
     drill fails on the live world while every gate runs green against the new code.
     field-proven 2026-06-11 (FIX-2026-06-11-stale-backend-process-survives-restart.md). -->

```yaml
doctrine:    process-supervision
failure:     dev-process-staleness (running code silently diverges from disk code)
proven_by:   FIX-2026-06-11-stale-backend-process-survives-restart.md (2026-06-11)
governs:     eidolon Stage 1 recon, Stage 9 verification, every restart-dependent done-claim
```

## 1. The failure class

<!-- why: name the exact shape so it is recognized before it bites, not after. -->

```yaml
class:        a long-lived dev process serves code from when it started, not code on disk
proven_case:  FIX-2026-06-11 - backend PID 12584, CreationDate 2026-06-11 20:54:31,
              command line `uvicorn main:app --app-dir backend --port 8000` (no --reload),
              served ~3-hour-stale code while every gate ran green against the new code
silent_part:  the operator restart never took - the old process held port 8000, the new
              invocation could not bind and died, and nothing reported the failed bind
blast_window: every code change after 20:54 (incl. the boot_id health endpoint) was
              invisible to the serving process; the banner could not detect a restart
              against a backend that had no boot_id to change
```

- A non-reloading dev process is a frozen copy of disk code at its start time.
- A restart without `--reload` or a supervisor can fail silently: old process holds the port, new one fails to bind and dies.
- A green gate proves the test agrees with disk code, never that the running process is that code.

## 2. The doctrine: code-in-process is a claim

<!-- why: the question "is the running process newer than the code?" must be answerable
     by a direct read, not by process-table forensics after a drill already failed. -->

```yaml
principle:    code-in-process is a claim, never an assumption
boot_id:      every service exposes a health endpoint carrying a boot identifier,
              a new value per process start (a restart is directly observable)
code_stamp:   next hardening - the same endpoint carries a code stamp (git sha at
              import) so process-older-than-disk is directly detectable
detectable:   with boot_id + code_stamp, "the running process is older than the code"
              is a one-read fact, not an inference from CreationDate
proven_by:    FIX-2026-06-11:30-34 - the next-time line that mandated the code identifier
```

- Expose a boot identifier on the health endpoint; mint a new value at every process start.
- Add a git-sha code stamp at import as the next hardening so disk-vs-process drift is a direct read.
- Treat the absence of a boot identifier as the failure that hid the stale process, not a missing nicety.

## 3. The client-side guard

<!-- why: a stale backend is invisible to a long-lived UI until a human notices wrong
     behavior. make staleness loud and self-evident at the surface the operator watches. -->

```yaml
poll:         long-lived UIs poll the boot identifier and compare to the value seen at load
visible:      a changed boot_id raises a banner with a reload affordance - staleness is
              SEEN, never inferred from broken behavior
socket:       a dev-socket death listener catches orphaned bundles (the dev server died
              but the tab kept serving stale assets)
proven_by:    FIX-2026-06-11 - the StalenessBanner is the U0 outcome the drill existed to prove
```

- Poll the boot identifier from any long-lived UI and surface a change as a banner with a reload affordance.
- Add a dev-socket death listener so an orphaned bundle announces itself instead of serving silently.
- Make staleness a visible artifact the operator cannot miss, never a behavior they must diagnose.

## 4. Restart drills

<!-- why: the staleness-banner drill passed two green commits (8af4669, 43400aa) and still
     failed on the live tab because no real restart was ever observed. a restart-dependent
     feature is proven only by a real kill-and-restart watched end to end. -->

```yaml
done_signal:  any claim that a restart-dependent feature works is proven by a REAL
              kill-and-restart observed end to end (a live browser watching the banner appear)
not_a_proof:  a green unit suite is not evidence the running world matches the tested code
              (FIX-2026-06-11 - two green commits, drill still failed on the live tab)
drill_signal: the drill itself carries a verification signal for whether the restart took -
              two views, never one:
              1. Win32_Process CreationDate (the process is newly born)
              2. Get-NetTCPConnection port-holder identity (the new PID holds the port)
screenshot:   the live-tab banner appearing is captured (screenshot evidence) before the
              user is asked to re-drill
proven_by:    FIX-2026-06-11:21-24 (fix) and :16-19 (the two verification signals)
```

- Prove any restart-dependent feature with a real kill-and-restart watched end to end, never with a green suite.
- Carry the drill's own signal: process CreationDate AND port-holder PID, two views, never one.
- Capture the live banner (screenshot) before asking the user to re-drill; a passing test beside a stale process proves nothing.
- Treat the user's "it's not" as a red gate, not an argument to win (the outcome-not-gate discipline caught this case, FIX-2026-06-11:27-29).

## 5. The setup-time rule

<!-- why: an unsupervised non-reloading dev process is not a fact of life - it is a finding.
     catch it at recon, surface it at verification, before it serves stale code for hours. -->

```yaml
stage_1:      eidolon Stage 1 recon records HOW each dev process is run -
              reload behavior, port, supervisor presence
stage_9:      eidolon Stage 9 verification treats an unsupervised non-reloading dev
              process as a FINDING to surface, not a fact of life
remedy:       a dev backend should run under --reload or a supervisor so code-on-disk
              and code-in-process cannot silently diverge for hours
proven_by:    FIX-2026-06-11:30-35 - the next-time lines that named both the recon gap
              and the supervisor remedy
```

- Record reload behavior, port, and supervisor for every dev process during Stage 1 recon.
- Surface any unsupervised non-reloading dev process as a Stage 9 finding, never wave it through as normal.
- Run dev backends under `--reload` or a supervisor so disk and process cannot diverge unobserved.

## Provenance

```yaml
fix_log:      docs/fixes/FIX-2026-06-11-stale-backend-process-survives-restart.md (FFR repo)
session:      FFR session 2026-06-11 - U0 StalenessBanner outcome drill failed on the
              user's live tab; root-caused to a 20:54 non-reloading backend (PID 12584)
              that held the port across a failed restart; two-signal verification
              (two-port API probe + Win32_Process CreationDate) proved the process age
seated:       devops-release-engineer persona, 2026-06-12
```
