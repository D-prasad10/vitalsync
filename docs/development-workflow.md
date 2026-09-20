# SwasthyaEdge (VitalsSync) Development & Git Workflow

This document defines the team Git branching model, repository ownership rules, code review standards, commit conventions, and pull request procedures for the SwasthyaEdge healthcare platform.

---

## 1. Branching Model & Branch Hierarchy

The repository maintains a strict hierarchical branching strategy configured with branch protection rules:

```
                  ┌─────────────────────────────────────┐
                  │                main                 │
                  │   (Protected Production Branch)     │
                  └──────────────────┬──────────────────┘
                                     ▲
                     Pull Request    │    Squash & Merge
                     (2 Approvals)   │    (Passing CI)
             ┌───────────────────────┼───────────────────────┐
             │                       │                       │
┌────────────┴───────────┐ ┌─────────┴───────────┐ ┌─────────┴───────────┐
│    feature/frontend    │ │     feature/backend   │ │   feature/ai-engine   │
│ (React 19 / Vite 7 SPA)│ │(Node / Express / IoT)│ │(Models & Analytics) │
└────────────┬───────────┘ └─────────┬───────────┘ └─────────┬───────────┘
             ▲                       ▲                       ▲
             │                       │                       │
      feature/ui-graph        feature/esp-ingest       feature/arrhythmia
```

### 1.1 Long-Lived Branches

| Branch Name | Purpose | Target Environment | Protection Rules |
| :--- | :--- | :--- | :--- |
| **`main`** | Production release branch. Contains stable, audited, deployable code. | Production / Staging | **STRICTLY PROTECTED**. Direct pushes forbidden. Requires PR, passing CI tests, and 2 code owner approvals. |
| **`feature/frontend`** | Integration branch for web interface, React components, state stores, styling, and charts. | Frontend Staging | Direct pushes restricted. Feature PRs merged after peer review. |
| **`feature/backend`** | Integration branch for Express API endpoints, SQLite schema migrations, Socket.IO channels, and hardware ingestion. | Backend Staging | Direct pushes restricted. Feature PRs merged after peer review. |
| **`feature/ai-engine`** | Integration branch for machine learning models, telemetry feature extraction, inference endpoints, and anomaly classifiers. | AI Sandbox / Dev | Direct pushes restricted. Model benchmark verification required. |

---

## 2. Branch Ownership & Responsibilities

| Branch / Subsystem | Primary Owner | Scope & Authority |
| :--- | :--- | :--- |
| **`main`** | Lead Architect / Release Manager | Final release cut, production tag creation, deployment verification, hotfix approvals. |
| **`feature/frontend`** | Frontend Lead Engineer | `frontend/` directory, UI/UX accessibility, Chart.js performance, responsive styling, client WebSocket state. |
| **`feature/backend`** | Backend Lead Engineer | `backend/` directory, SQLite database migrations, REST API design, rate-limiting, hardware poller & watchdog. |
| **`feature/ai-engine`** | ML / Data Science Lead | `ai/` or inference modules, training scripts, ONNX export, signal processing DSP filters, model confidence calibration. |
| **`hardware/`** | Embedded Systems Engineer | `hardware/` directory, ESP8266 Arduino firmware, pinout configurations, I2C bus timing, local diagnostics page. |

---

## 3. Strict Rules Against Directly Pushing to `main`

> [!CAUTION]
> **Zero Direct Pushes to `main`**:  
> No developer, regardless of permissions, is allowed to run `git push origin main`.
> Any attempt to push directly to `main` will be rejected by GitHub branch protection settings. All production code must enter `main` exclusively through an approved, audited Pull Request.

### Enforcement Rules
1. Branch protection rule enabled on `main` in the GitHub repository.
2. Require signed commits for all merges to `main`.
3. Require status checks to pass before merging:
   - Frontend build (`npm run build` inside `frontend/`).
   - Backend syntax & lint verification (`node --check backend/server.js`).
   - Telemetry schema conformance checks.
4. Require linear git history (no merge commits directly on `main`).

---

## 4. Daily Development Workflow

### Step 1: Branch Creation
Always branch from the latest state of your relevant feature integration branch (or `main` for critical hotfixes):

```bash
# Ensure local repo is up to date
git checkout feature/backend
git pull origin feature/backend

# Create a short-lived topic branch
# Naming format: <type>/<brief-description>
git checkout -b feature/esp-timeout-watchdog
```

*Branch naming conventions*:
- `feature/<name>` — New feature work (e.g. `feature/ecg-filter`).
- `fix/<name>` — Bug fix (e.g. `fix/otp-expiration-race`).
- `docs/<name>` — Documentation updates (e.g. `docs/telemetry-update`).
- `perf/<name>` — Performance optimization (e.g. `perf/socket-batching`).

---

### Step 2: Commit Workflow & Standards
Commits must follow the **Conventional Commits** specification. Each commit must represent an atomic, coherent unit of work.

```bash
git add backend/server.js
git commit -m "feat(ingest): add 10-second hardware watchdog for offline detection"
```

#### Commit Message Format
```
<type>(<scope>): <short imperative summary>

[optional body explaining motivation, context, and breaking changes]

[optional issue reference, e.g. Fixes #104]
```

#### Allowed Types
- `feat`: A new feature or endpoint.
- `fix`: A bug fix.
- `docs`: Documentation only changes.
- `style`: Formatting, missing semicolons, no code change.
- `refactor`: Code change that neither fixes a bug nor adds a feature.
- `perf`: Performance enhancement.
- `test`: Adding or correcting tests.
- `chore`: Maintenance, updating dependencies or build scripts.

---

### Step 3: Push Workflow
Before pushing, rebase your topic branch onto the latest upstream branch to maintain a clean linear commit graph:

```bash
# Fetch latest remote changes
git fetch origin

# Rebase your branch
git rebase origin/feature/backend

# Push topic branch to remote
git push -u origin feature/esp-timeout-watchdog
```

---

### Step 4: Pull Request (PR) Workflow

1. **Open PR**: Navigate to GitHub and open a PR from your topic branch (`feature/esp-timeout-watchdog`) into the appropriate integration branch (`feature/backend`).
2. **PR Description**: Include:
   - Summary of changes.
   - Affected subsystems (`frontend`, `backend`, `hardware`, `docs`).
   - Verification steps performed (exact terminal commands and output).
   - Relevant issue numbers.
3. **CI Checks**: Wait for automated GitHub Actions workflows (linting, build verification) to pass.

---

### Step 5: Code Review Requirements

Every Pull Request requires:
- **Minimum 1 Peer Approval** for integration branches (`feature/frontend`, `feature/backend`, `feature/ai-engine`).
- **Minimum 2 Senior Approvals** for merges into `main`.
- **Review Criteria**:
  - Medical integrity compliance (no fabrication of heart rate, SpO2, or blood pressure).
  - Proper error handling and database safety.
  - No secrets, hardcoded API keys, or credentials committed.
  - Documentation updated in `docs/` if APIs or telemetry payloads were changed.

---

### Step 6: Merge Strategy

- **Integration into Feature Branches**: **Rebase and Merge** or **Squash and Merge** to maintain a clean history without redundant merge bubbles.
- **Integration into `main`**: **Squash and Merge**.
  - The squashed commit message must summarize the completed feature and reference the PR number:
    `feat(hardware): integrate ESP8266 telemetry ingestion pipeline (#42)`
- After merging, delete the local and remote topic branch:
  ```bash
  git branch -d feature/esp-timeout-watchdog
  git push origin --delete feature/esp-timeout-watchdog
  ```
