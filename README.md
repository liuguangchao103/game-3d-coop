# game-3d-coop

Git/GitHub automation scaffold for a 3D web game project.

## Branch strategy

- `main`: protected branch, only merge via pull request.
- `feature/<scope>`: feature development.
- `hotfix/<scope>`: production fix branch.
- Recommended merge command: `git merge --no-ff`.

## Conventional commits

Use one of the following commit types:

- `feat`
- `fix`
- `refactor`
- `chore`
- `docs`
- `test`

## Versioning rules

- Milestone tags for MVP must match `v0.x.y`.
- Tag command:
  - `npm run vcs:tag -- v0.1.0 "lobby online"`
- Rollback branch command:
  - `npm run vcs:rollback -- v0.1.0`

## Commands

- Initialize git + GitHub remote:
  - `npm run vcs:init`
- Configure main branch protection:
  - `npm run vcs:protect`

## Milestone plan

- `v0.1.0`: lobby/join/sync movement playable
- `v0.2.0`: combat + enemies + stage loop
- `v0.3.0`: mobile controls + performance pass
- `v0.4.0`: assets + SFX + post-processing + full UI
- `v1.0.0`: release-ready quality bar
