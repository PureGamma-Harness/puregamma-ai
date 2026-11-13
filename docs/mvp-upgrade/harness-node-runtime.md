# Harness build support on Node 22 and 24

## Repository evidence and execution prompt

Base: `1e0e5097c1947dea3607fd275714d482a4501e5e`. The Harness manifest
declares Node `^22.19.0 || >=24.0.0`, pins pnpm11.7.0 and the published
DeepSeek Harness SDK0.1.5-rc.2. The client-gateway bundle runs TypeScript and
`tsdown --config-loader tsx`. Its existing TypeSafe configuration loads the
SDK generator plugin. The previous research-output change recorded a Node24.22.1
`ENOENT node:fs?tsx-namespace=...` failure at this configuration loader, while
the Node22 full check passed. That does not yet prove an application-source
regression or a general unsupported runtime.

Act as the Harness build maintainer. Reproduce the claimed failure against the
unchanged pinned build path, inspect the actual tsdown/tsx/generator loader
contract, and choose a minimum supported repair if the repository needs one.
Preserve Cordis ownership, all existing TypeScript/generator/bundle checks,
SDK versions, package policy, engine support, execution permissions and release
gates. Do not mask a failure by skipping a package or narrowing the engines.
Do not change the web application or Python services. Use only local build and
offline replay evidence; no model, provider, trading or notification action.

## Acceptance and independent review

1. Keep the exact original failure or successful reproduction log, with Node
   and tool versions and a clear source/environment distinction.
2. Any repair uses a documented loader path and preserves generated host and
   remote-client artifacts, declarations and original policy checks.
3. Validate relevant builds on both Node22 and24, then run the complete Harness
   check where feasible; report actual omissions separately.
4. Keep unrelated dependency versions, source domains and provider defaults
   unchanged. Clear only this worktree's generated build outputs.
5. Require an independent source/evidence review before publishing or merging.

## Root cause and bounded repair

The unchanged Node24 configuration invocation deterministically fails in
`tsx`'s namespaced load hook with `ENOENT node:fs?tsx-namespace=...`. The same
source and dependency resolution succeed when that single invocation selects
`--config-loader auto`. This isolates the failure to configuration import,
not to an invalid generated protocol or a provider operation.

The installed official tsdown0.22.14 contract supports `auto`, `native`, `tsx`
and `unrun` for configuration loading. Its default `auto` selects native import
when native TypeScript stripping and `node:module.registerHooks` are available;
otherwise it retains its supported fallback. Both tested Node versions provide
that native path. Evidence is in the published package's
`dist/options-C1CN2x0L.mjs:562–602` and
`dist/types-DP3_0kws.d.mts:1453–1457`.

Seven package scripts unnecessarily forced `tsx`: client-gateway, brand,
client-remotes, ui-account, ui-billing, ui-notifications and ui-pg-tsy-runtime.
They now use tsdown's existing default, consistently with the other Harness
packages. Every TypeScript prefix, generator plugin, host/client face, artifact
export and policy test is retained. These seven configs and their shared helper
use erasable TypeScript; business TSX and decorators still pass through their
original TypeScript and Typert transforms. The published generator entry is
already JavaScript. The `tsx` dependency and its test commands are retained.

The Harness workflow now runs the complete existing steps on Node22.20.0 and
24.22.1 with independent results. The Node22 check keeps its original `build`
name; Node24 is `build-node24`. Fail-fast is disabled so a failure does not erase
the other runtime's evidence. Permissions, pinned submodules, install policy,
timeout and every existing build/artifact/policy verification remain unchanged.

## Verification record

- Local toolchain: pnpm11.7.0, tsdown0.22.14, tsx4.22.4, TypeScript6.0.3 and the
  same SDK0.1.5-rc.2. An ignored local lock copied from the previous installation
  fixes dependency resolution for this A/B comparison. It is not committed;
  dependency versions and the existing CI non-frozen install policy are unchanged.
- Original direct config-load reproduction on Node24.22.1: exit1 with the
  namespaced built-in-module error. Same source/lock with `auto`: exit0 and the
  target bundle produced. This is a focused configuration reproduction rather
  than a claim to rerun the entire original failing check.
- Complete `corepack pnpm@11.7.0 run check` passes on Node24.22.1, including all
  workspace bundles, host/global types, profile composition, architecture,
  retirement and all61 tests in the seven existing groups.
- After removing only this worktree's59 untracked generated directories,
  the same complete check passes cold on Node22.23.4 with61/61 tests. CI retains
  the previously selected Node22.20.0, so its exact patch validation remains a
  required hosted check; the local Node22 patch is reported separately.
- All25 gateway/UI contract artifacts exist on both runtimes. Their SHA256
  values match byte for byte, including host and remote-client JS/declarations,
  client entrypoints and client declarations.
- All seven manifests differ semantically only in their bundle command.
  No provider/domain source, dependency version, SDK, application permission or
  release gate changes. Generated artifacts and the temporary lock are removed
  from this worktree after verification.

Detailed reproduction, counts and artifact manifests are retained in
`/workspace/scratch/round7-harness-runtime-verification.json`,
`round7-harness-loader-before-node24.log`, `round7-harness-loader-auto-node24.log`,
`round7-harness-check-node24.log`, `round7-harness-check-node22.log` and
`round7-harness-artifacts-node{22,24}.json`. These offline checks do not claim a
live provider session or every historical Node patch. Independent frozen-source
review and hosted CI remain required before merge.

## Hosted closure

The reviewed commit `418d4877a647d9c479419ca29e03a82ba802d22b` passed both
Node matrix jobs in [run 43451071628](https://github.com/PureGamma-Harness/puregamma-ai/actions/runs/43451071628).
Independent review matched all nine remote files to the approved source before
[PR #57](https://github.com/PureGamma-Harness/puregamma-ai/pull/57) merged as
`b3bdf88f7c63ba5d53ec7ec9dd573e36b703d056`. The separate default-branch
[run 43451894101](https://github.com/PureGamma-Harness/puregamma-ai/actions/runs/43451894101)
also passed. Those hosted results complete the earlier pre-merge requirement;
the local Node 22.23.4 and CI's pinned Node 22.20.0 remain distinct evidence.
