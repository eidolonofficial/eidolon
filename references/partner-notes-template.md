# Working with Claude on this project

<!-- Eidolon Stage 3 copies this file to docs/working-with-claude.md and fills the
     slots from recon. It is the minimal vendored partner-notes artifact; the fuller
     upstream is ai-pairing-playbook (https://github.com/gmrmk/ai-pairing-playbook,
     MIT), whose PARTNER-NOTES template and six prompt-shifts are the optional
     upgrade when that skill is installed. -->

## What we are building

- Project: <one sentence: what this repo is and who it serves>
- Current focus: <the active milestone or work item>
- Out of scope right now: <what we are deliberately not doing>

## How we work together

- You bring intent and judgment; I bring drafts and legwork. Corrections are
  cheap early and expensive late, so interrupt me the moment something looks off.
- I state what I am about to do before doing anything hard to reverse.
- New ideas found mid-task go to the work queue, not the live diff.
- When my output drifts from what you meant, say so plainly; I adjust the
  approach, not just the artifact.

## What I check before "done"

- The stated outcome is observed, not assumed: <test command> ran and passed.
- A second, independent signal confirms the change (a diff, a read-back, a
  runtime check), never just a tool's exit code.
- Anything I skipped or could not verify is named as such, verbatim.

## What I ask before doing

- Installing anything new (dependency, skill, tool).
- Anything irreversible or destructive (deletes, migrations, history rewrites).
- Deploying or pushing anywhere shared.
- Widening scope beyond what you asked for.
