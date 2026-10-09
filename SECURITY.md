# Security policy

## Reporting a vulnerability

Don't report security vulnerabilities in public issues, discussions or pull requests.

Report them privately by [opening a draft security advisory](https://github.com/atlanai/ai-registry/security/advisories/new) on GitHub. If you can't use GitHub, email [security@atlan.com](mailto:security@atlan.com).

Please include:

- what is affected: the aireg version (`aireg --version`), or the file and commit in this repository
- the steps to reproduce it, with the smallest example you can share
- what an attacker could do with it

If English isn't your first language, write in the language you're most comfortable with.

We'll acknowledge your report within 3 business days and work with you to verify and fix the issue. We'll agree a disclosure date with you, request a CVE when one is warranted, and credit you in the advisory under the name you choose, or not at all if you prefer.

## What counts as a vulnerability

A registry holds instructions that coding agents follow. aireg checks that what you install is exactly what the registry published. It doesn't judge whether a skill or agent is safe to follow.

These are vulnerabilities:

- aireg installs an artifact or version you didn't ask for
- aireg accepts a file that doesn't match its digest
- aireg writes outside the folders it manages for the scope you install into
- aireg sends a registry's token anywhere other than that registry
- aireg installs an update that isn't signed by a trusted release key
- the spec lets a client that follows it be tricked into any of the above

These are not:

- what a skill or agent tells your coding agent to do, after you installed it from a registry you added. Add only registries you trust, and review changes before you install them
- changes made by someone with write access to a registry. A git or bucket registry gets its access control from the git host or the bucket
- a sync job publishing edits from a folder you told it to watch

This policy covers the file spec and its schemas, aireg with its installer and release files, and the example registries in this repository. It doesn't cover registries that other people run, or Atlan's hosted products. For Atlan's products, use Atlan's [responsible disclosure program](https://atlan.com/responsible-disclosure-program/).

## Supported versions

| Component | Gets security fixes |
|---|---|
| The latest aireg release | Yes. Fixes ship in a new release; update with `aireg self update`, or install it again |
| File spec | The current draft, v0.1 |
