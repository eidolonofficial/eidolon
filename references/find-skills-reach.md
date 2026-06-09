# Find-skills reach (beyond the installed set)

The swarm loadout is not limited to what is already installed. When recon or a
hired expert needs a capability the installed-skill registry does not have, for a
niche language, a specific framework, or a regulatory domain unique to the
codebase, Eidolon invokes find-skills to discover an installable skill that fills
the gap. So a codebase with an unusual need pulls the right tool instead of being
served by an approximate one, and the loadout still does not become a junk drawer.

## When to reach

```yaml
trigger:   a named capability gap that the installed-skill registry cannot fill,
           surfaced during recon or by a hired expert's retooling
examples:  a language the build-and-review pair does not cover; a framework with its
           own idioms; a regulatory or compliance skill the roster has no anchor for
not:       never a speculative install to look thorough; the gap must be named and real
```

## The rails (the same consent-first discipline as everything else)

```yaml
named_need:   the skill must serve a named, detected need; no speculative installs,
              no installing to look comprehensive
user_consent: the user consents before anything is installed; nothing is pulled quietly
verify_first: a newly installed skill is verified before its findings are trusted,
              exactly as any other skill is (the two-signal rule applies to the tool too)
attribution:  a folded or installed skill is credited in the target repo's CREDITS with
              its license named, the same consent-first rule the rest of the project runs on
```

## How it composes with hiring

```
hired expert needs a capability the installed set lacks
  -> find-skills discovers an installable skill for the named gap
  -> the user consents to the install
  -> the skill is verified before its findings are trusted
  -> the skill joins the expert's retooled loadout (references/expert-hiring.md, step 3)
```

So the loadout is assembled per swarm and per expert, and it can pull in the right
tool for an unusual need without ever becoming a junk drawer: every entry serves a
named need, was consented to, and was verified.

## Where this is grounded

The find-skills reach and its rails are design spec section 16 ("Reaching beyond
the installed set"); the per-expert retooling it feeds is the hire's step 3
(references/expert-hiring.md). The attribution-and-licensing discipline is the same
section 16 rule the swarm loadout follows.
