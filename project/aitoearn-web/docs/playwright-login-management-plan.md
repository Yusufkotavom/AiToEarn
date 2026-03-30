# Playwright Login Management Plan (Headless, Multi-Profile, Strict No-Fallback)

## Summary
This plan upgrades Google Flow Playwright integration from a single-session worker into a multi-profile orchestration system.

Key goals:
- Server-first headless operation.
- Script-driven login with hybrid challenge handling (OTP/verification can be completed manually, then resumed by script).
- Multiple independent Playwright profiles for future model/provider expansion.
- Deterministic routing: image/video requests must explicitly include `profileId`.
- Strict fail-fast behavior: no silent fallback profile, no fallback model routing.

## Target Architecture

### Worker (`google-flow-playwright-worker`)
- Replace single queue/context with:
  - profile registry,
  - persistent context per profile,
  - queue per profile.
- Persist profile metadata and debug events in profile directory.
- Add login state machine:
  - `idle`
  - `starting`
  - `awaiting_challenge`
  - `authenticated`
  - `expired`
  - `failed`
- Keep legacy auth endpoints as compatibility shim for older callers.

### Backend Relay (`aitoearn-ai`)
- Extend Google Flow browser service with profile management APIs.
- Add new controller namespace: `ai/playwright/*`.
- Keep old `ai/google-flow/*` endpoints for compatibility.
- For Google Flow image/video generation, require `profileId`.

### Frontend
- New dedicated page: Playwright Management (`/[lng]/playwright-manager`).
- Features:
  - list/create profile,
  - profile selection,
  - start/resume/reset/check login,
  - debug timeline and report copy.
- In AI generation settings and request payload:
  - when model is Google Flow Playwright channel, user must select profile,
  - payload includes `profileId`,
  - if profile not authenticated, request fails immediately.

## API Contract (Worker)

### Profile management
- `POST /v1/profiles`
- `GET /v1/profiles`
- `GET /v1/profiles/:id`

### Login flow
- `POST /v1/profiles/:id/login/start`
- `GET /v1/profiles/:id/login/status`
- `POST /v1/profiles/:id/login/resume`
- `POST /v1/profiles/:id/login/reset`

### Debug
- `GET /v1/profiles/:id/debug`

### Generation
- `POST /v1/image/generate` (`profileId` required)
- `POST /v1/video/generate` (`profileId` required)
- `GET /v1/tasks/:taskId`

## Strict Rules
- No default profile auto-selection for generation requests.
- No hidden fallback from Playwright model to another model.
- Authentication status must be explicit; unauthenticated profile causes immediate error.

## Test Plan
- Worker syntax check and endpoint smoke test.
- Backend type-check for new config/service/controller contract.
- Frontend type-check for manager page + profile selection in generation settings.
- Manual E2E:
  1. create profile,
  2. start login,
  3. complete challenge,
  4. resume/check until authenticated,
  5. run image/video generation using selected profile.
