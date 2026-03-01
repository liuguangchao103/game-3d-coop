# game-3d-coop

Two-player online 3D web game prototype (`Shadow Breach`) with a Three.js client and authoritative Node.js WebSocket server.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Start server:

```bash
npm run dev:server
```

3. Start client (new terminal):

```bash
npm run dev:client
```

4. Open `http://localhost:5173` in two browser tabs and test co-op flow:
- Tab A: create room
- Tab B: enter room code and join
- Both click ready
- Use `W/A/S/D` to move

## Repo Structure

- `client/`: Three.js web client + lobby/HUD UI
- `server/`: Express + WebSocket authoritative room server
- `shared/`: protocol types, constants, zod validation schema

## Branch Strategy

- `main`: protected branch, merge by PR.
- `feature/<scope>`: feature development.
- `hotfix/<scope>`: urgent fixes.
- Recommended merge method: `git merge --no-ff`.

## Versioning

- Milestone tags use SemVer (`v0.x.y` for MVP stage).
- Create milestone tag:

```bash
npm run vcs:tag -- v0.1.0 "lobby online"
```

- Create rollback branch from tag:

```bash
npm run vcs:rollback -- v0.1.0
```

## VCS Automation Commands

- Initialize git + remote:

```bash
npm run vcs:init
```

- Configure branch protection:

```bash
npm run vcs:protect
```

## Milestone Targets

- `v0.1.0`: lobby/join/sync movement playable
- `v0.2.0`: combat + enemies + stage loop
- `v0.3.0`: mobile controls + performance pass
- `v0.4.0`: assets + SFX + post-processing + full UI
- `v1.0.0`: release-ready quality bar
