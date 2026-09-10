# Engine security and migration contract

The review branch targets bounded candidate execution, digest-bound operator
approval, strict JSON/YAML state, deterministic offline embeddings, JSON-only
vector persistence and process-safe updates. These changes are not an operating
system sandbox. A venv and shell hooks do not stop a hostile same-user process
from accessing files or networks allowed by the operating system.

Candidate, evaluator and custom sampler code must be explicitly trusted for local
execution. Untrusted experiments require an independently configured disposable
sandbox. No model or optional memory service may be installed merely because a
skill was loaded. A chat yes or a mutable Boolean is not an approval receipt.

Approval binds the declared interpreter, engine code, dependency versions, judge,
supporting inputs, scope, timeout and budget. It cannot automatically discover all
possible imports or external inputs. Re-approve after changing any bound input.
Failure, non-finite scores, stale results and changed evidence must not become
successful experiment records. Existing history is preserved through new entries,
not overwritten to make an experiment look successful.

Old pickle/native vector caches must never be loaded to migrate them. Preserve
those files as evidence and rebuild derived indexes from validated source JSON.
Ambiguous legacy actor ownership requires operator review; an agent must not
choose which controller's state to inherit. Authenticated host behavior remains
separate from synthetic event tests.

The history audit fetched all accessible branches, tags and pull-request heads:
93 Eidolon, 28 Setup and 56 Hearth commits. Git full integrity checks passed.
Gitleaks found two Hearth vendor-lock matches that were recomputed as file hashes,
not credentials. Additional scanner candidates require explicit triage. No
credential was tested against a live service. Deleted/unadvertised server objects,
external stores and unknown secret formats cannot be certified absent.

The dependency audit checked all conditional package/version pairs: core 3,
optional ML 64, Graphifyy 31 and MemPalace 82. The first three graphs had no known
advisories at the observation. MemPalace resolved ChromaDB 1.5.9 with
CVE-2026-45829, CVE-2026-45830, CVE-2026-45831 and CVE-2026-45833; the advisory
feed listed no fixed versions. New automatic installation must stay blocked until
that path is reviewed. Existing user installations must not be silently removed.
Applicability depends on deployment and exposed server features.

A clean advisory scan is not a malware audit or proof against unknown defects.
Optional model/GPU behavior, authenticated clients and interrupted installations
need their own acceptance evidence. Do not describe branch changes as applied to
main or installed on a user's machine until that action has actually succeeded.
