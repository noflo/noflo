## Type definitions

Every API interface needs to have TypeScript definitions in JsDoc format. Run `npm run types` after every change to verify compatibility.

## Formatting

Fix formatting with `npm run format` after any changes to source files or tests.

## Monorepo lockstep

All packages in this monorepo must stay mutually compatible at every commit. When a change breaks another package's API surface, update that dependent package in the same change set (or in a stacked commit within the same review) so that `npm test` stays green across all workspaces. Do not leave a workspace depending on an API that no longer exists.

## Licensing

NoFlo core (`packages/noflo`) remains MIT-licensed. If we migrate other pre-existing NoFlo libraries into this monorepo, they also keep their MIT license _if_ they have 3rd party contributions in the codebase that remains. Otherwise they get EUPL-1.2. In case of uncertainty, ask user.

Any greenfield work (new packages) will be EUPL-1.2

## Boundaries

In addition to the global boundaries:

- ✅ **Always**: document major changes in the per-package `CHANGELOG.md` (Unreleased segment)
- 🚫 **Never**: update the root-level `CHANGELOG.md` — that is done as part of the release process
