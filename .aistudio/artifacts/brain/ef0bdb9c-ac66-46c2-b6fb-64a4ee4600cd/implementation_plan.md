# 3-Member Team Architecture & Individual Participant Cabinets

This implementation transforms Akylman Quiz Bowl into a 3-member collaborative tournament platform where every student registers an individual account, joins a team of three via an invite code, mutually confirms category distribution, and takes their category test simultaneously on competition day.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following core product decisions have been confirmed and are locked into this plan:
> - **Egalitarian Team Formation**: No dedicated captain roles. Any student can create a team to generate an instant invite code (e.g., `AKYL-7842`), or enter an existing code to join.
> - **Strict Team Size**: Exactly 3 participants per team. Not more, not less.
> - **Tri-Category Specialization**: Exactly 3 categories are defined for the tournament. Each participant is responsible for exactly 1 category.
> - **Mutual Confirmation**: All 3 members must mutually vote/confirm the category distribution before it is officially locked.
> - **Simultaneous Testing**: On competition day, all 3 students take their respective category tests in parallel inside their personal cabinets.
> - **Team Scoring**: The team's tournament ranking is determined by the **sum of all three members' individual scores** (`Total = Score_Cat1 + Score_Cat2 + Score_Cat3`).

---

## 1. Overview & Core Concept

- **What It Does**: Shifts authentication and tournament participation from shared team credentials to individual student accounts. Students register personally, form 3-person squads using unique join codes, collaboratively distribute 3 tournament categories with mutual confirmation, and take their category test in synchronized online sessions.
- **Target Audience**: Middle and high school students (grades 8–10) in Kyrgyzstan, school teachers/mentors, and tournament jury.
- **Key Value**:
  - Eliminates credential sharing between students.
  - Ensures accountability: each student owns their specific domain exam.
  - Enhances team cohesion through code-based invites and unanimous category approval.
  - Provides a fair, transparent team leaderboard combining all three disciplines.

---

## 2. User Experience & Visual Design

The UI will follow our established **Paper & Ink** visual identity (warm cream canvas, rich dark charcoal typography, deep terracotta accents, hairline dividers, zero-pill metadata, and clean single-elevation cards).

### A. Key User Flows

```
[Student Registration / Login]
         │
         ▼
[Personal Participant Dashboard]
         │
         ├──────────────────────────────────────────────┐
         ▼                                              ▼
[Create Team]                                   [Join Team by Code]
  - Enter Team Name & School                      - Enter 8-char Invite Code
  - Generates Code (e.g. AKYL-4912)               - Instantly added to squad (2/3 or 3/3)
         │                                              │
         └──────────────────────┬───────────────────────┘
                                ▼
                   [Team Lobby (1/3 or 2/3)]
                     - Shareable code card
                     - Live member slots
                                │ (3rd member joins)
                                ▼
                   [Squad Ready (3/3 Members)]
                                │
                                ▼
             [Mutual Category Distribution Matrix]
               - 3 Categories displayed
               - Each member selects their category (1 each)
               - Live status: Member A (✓), Member B (✓), Member C (✓)
               - All 3 click "Confirm Distribution"
                                │ (Unanimous 3/3 confirmation)
                                ▼
                   [Locked & Tournament-Ready]
               - Member 1: Assigned Category 1
               - Member 2: Assigned Category 2
               - Member 3: Assigned Category 3
                                │ (On Competition Day)
                                ▼
              [Synchronized Testing & Live Team HUD]
               - Each member accesses their own test portal
               - Team progress widget shows live completion status
                                │
                                ▼
                 [Team Leaderboard & Breakdown]
               - Sum of 3 scores = Official Team Standing
```

### B. Visual Identity & Theme Tokens

- **Canvas & Surfaces**:
  - Main background: `var(--paper)` (`#fbf8f2`)
  - Elevated surfaces: `var(--surface)` (`#ffffff`) with 1px hairline border `var(--line)` (`#e7e0d4`)
  - Accent color: `var(--accent)` (`#8b2500` warm terracotta)
  - Subtle wash: `var(--accent-wash)` (`rgba(139, 37, 0, 0.08)`)
  - Dark ink typography: `var(--ink)` (`#1d1b18`) and secondary `var(--ink-2)` (`#575249`)
- **Anti-Slop Discipline**:
  - No candy pill enclosures or generic badges for metadata; clean unboxed text separated by `·`.
  - No fake AI scores or futuristic telemetry tickers.
  - Buttons follow the clean Paper & Ink standard with `py-2 px-4` proportion, rounded-md (6px), and high-contrast hover states.
- **Mascot Presence**:
  - The animated pixel art cat will remain as an encouraging companion in the squad lobby, offering animated cheers as teammates join and lock categories.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Individual Student Auth vs. Team Shared Login
- **Chosen Approach**: Transition to individual student accounts (`participants` table) with an assigned `team_id`.
- **Why**: Allows true multi-user independence, prevents teammates from overwriting each other's test sessions, and enables personal profile management while linking scores to a single team.
- **Alternatives Considered**: Shared team login with a "Select Who You Are" dropdown. Rejected because it allows simultaneous session collision and security vulnerabilities during live testing.

### Decision 2: Code-Based Egalitarian Squad Creation
- **Chosen Approach**: Any member can create a team and get an invite code (e.g. `AKYL-7842`), or enter an existing code to join. No rigid "Captain vs Subordinate" hierarchy.
- **Why**: Avoids social friction; matches school student behavior where any teammate can initiate the squad.
- **Capacity Enforcement**: Once 3 students are joined, the team code becomes automatically closed (`status: full`).

### Decision 3: Unanimous Category Confirmation
- **Chosen Approach**: Interactive 3-way confirmation matrix. Once all 3 slots are chosen (1 distinct category per member), each member has a "Confirm" toggle. When 3/3 confirmations are in, the distribution locks.
- **Why**: Directly satisfies the user requirement that all members agree on who takes which subject, preventing one student from unilaterally hijacking a subject.

### Decision 4: Backward Compatibility & Migration
- **Chosen Approach**: Keep existing tournament public routes intact, update `teams` to hold `invite_code` and team status, and create the `participants` table linked via foreign key to `teams(id)`.
- **Database Resilience**: Self-healing DDL in `schema.js` ensures tables and constraints are created safely in Cloud SQL with `ON DELETE CASCADE`.

---

## 4. Technical Architecture & Data Strategy

### System Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Frontend Architecture                           │
├────────────────────────────────┬───────────────────────────────────────┤
│  Personal Student Cabinet      │  Team Lobby & Mutual Confirmation     │
│  - Individual Profile & Grade  │  - Invite Code Generator & Join Input │
│  - Squad Status Widget         │  - 3-Way Category Selection Grid      │
│  - Assigned Category Exam HUD  │  - Unanimous Confirmation Action Bar  │
└────────────────────────────────┴───────────────────────────────────────┘
                                   │ HTTP (REST + JWT Bearer Auth)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Backend API Server                              │
├───────────────────────────────┬────────────────────────────────────────┤
│  Authentication Routes        │  Team Collaboration Routes             │
│  - POST /api/auth/register    │  - POST /api/teams/create              │
│  - POST /api/auth/login       │  - POST /api/teams/join (by code)      │
│  - GET  /api/auth/me          │  - POST /api/teams/category-pick       │
│                               │  - POST /api/teams/category-confirm    │
├───────────────────────────────┼────────────────────────────────────────┤
│  Exam Engine Routes           │  Leaderboard Routes                    │
│  - GET  /api/tests/my-test    │  - GET /api/leaderboard/teams          │
│  - POST /api/tests/submit     │    (Calculates sum of 3 members)       │
└───────────────────────────────┴────────────────────────────────────────┘
                                   │ SQL Queries
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 Cloud SQL (PostgreSQL Database)                        │
├────────────────────────────────────────────────────────────────────────┤
│  • categories (3 rows: math/science/humanities or custom 3 disciplines)│
│  • teams (id, team_name, school, city, invite_code, status)           │
│  • participants (id, full_name, email, password_hash, team_id,         │
│                  category_id, category_confirmed, grade)               │
│  • results (id, participant_id, team_id, test_id, category_id, score) │
│  • tests & questions (linked to category_id)                           │
└────────────────────────────────────────────────────────────────────────┘
```

### Database Schema Updates (`schema.js` & `src/db/schema.ts`)

```sql
-- 1. Teams Table (Stores squad details and unique join code)
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  team_name TEXT NOT NULL,
  school TEXT,
  city TEXT,
  invite_code VARCHAR(12) UNIQUE NOT NULL,
  status TEXT DEFAULT 'forming', -- 'forming' (1-2), 'full' (3), 'ready' (confirmed)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Participants Table (Individual student accounts)
CREATE TABLE IF NOT EXISTS participants (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  phone TEXT,
  grade VARCHAR(10),
  school TEXT,
  city TEXT,
  team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  category_confirmed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Results Table (Participant + Team score tracking)
ALTER TABLE results ADD COLUMN IF NOT EXISTS participant_id INTEGER REFERENCES participants(id) ON DELETE CASCADE;
ALTER TABLE results ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
```

### API Endpoints Specification

1. **Authentication**:
   - `POST /api/auth/register`: Student registers with name, email, password, grade, school, city.
   - `POST /api/auth/login`: Student logs in, receives individual JWT token.
   - `GET /api/auth/me`: Returns participant profile, their current team info, assigned category, and teammates.
2. **Team Collaboration**:
   - `POST /api/teams/create`: Generates a team and random 8-character code (e.g. `AKYL-5931`), links creator as member 1 of 3.
   - `POST /api/teams/join`: Validates invite code; if team has < 3 members, links participant; if full, rejects with descriptive error.
   - `POST /api/teams/leave`: Member can leave if categories are not yet locked.
   - `POST /api/teams/select-category`: Selects an unassigned category from the 3 available categories.
   - `POST /api/teams/confirm-categories`: Sets `category_confirmed = true` for the member. When all 3 confirm, sets team status to `ready`.
3. **Simultaneous Exam Execution**:
   - `GET /api/tests/my-assignment`: Returns the specific test matching the student's confirmed category.
   - `POST /api/tests/submit`: Saves answers and computes individual score, then updates the team's total tally.
4. **Leaderboard**:
   - `GET /api/leaderboard`: Groups scores by `team_id`, returns aggregate total score and member-by-member breakdown.

---

## 5. Phased Implementation Roadmap

1. **Database Schema & DDL Updates**:
   - Add `participants` table and update `teams` with `invite_code` and status.
   - Synchronize `backend/src/services/schema.js` and `src/db/schema.ts`.
2. **Backend Services & API Routes**:
   - Implement participant authentication (`auth.js` with individual JWT tokens).
   - Implement team creation, invite code generation, code joining, and team member management.
   - Implement mutual category selection and 3/3 confirmation logic.
   - Update scoring engine to compute team aggregate score.
3. **Frontend Personal Cabinet & Team Lobby**:
   - Redesign Cabinet UI (`team.html`, `team.js`, and `team-modern.css`) to show:
     - State 1: No team yet -> "Create Team" or "Join Team by Code".
     - State 2: Team forming (1/3 or 2/3) -> Share code card + teammate slots.
     - State 3: Team full (3/3) -> Category distribution grid with mutual confirmation checklist.
     - State 4: Ready for test -> Category test card + live teammate progress.
4. **Registration & Login Pages Integration**:
   - Update `/login` and `/register` for individual participant enrollment.
5. **Leaderboard & Results View**:
   - Render the new 3-category score breakdown + team total score on the public and internal leaderboards.
