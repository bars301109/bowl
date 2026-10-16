# Implementation Plan: Announcements & Support Ticket System

Full-featured Announcements broadcast engine and interactive Support Ticket messaging system for Akylman Quiz Bowl, integrated into both the Team Cabinet and Admin Panel with full Kyrgyz and Russian bilingual support, adhering to the paper & ink visual design language.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following choices were confirmed during interactive clarification and govern the implementation:

- **Announcements Display in Team Cabinet**: Dedicated **Announcements** tab in the sidebar navigation (`tabAnnouncements`), with a dynamic unread counter badge.
- **Support System Architecture**: Interactive **Ticket Messaging Thread** with bidirectional conversation between team members and administrators, allowing teams to ask questions, view status updates, and receive direct admin answers.
- **Announcement Targeting**: Supports both **Broadcast to all teams** and **Category-specific targeting** (e.g., specific age groups or tournament tiers).
- **Localization**: Full Kyrgyz (`ky`) and Russian (`ru`)/English (`en`) localization across all newly added views, forms, notifications, and badges.

---

## 1. Overview & Core Concept

1. **Announcements Engine (Объявления / Кулактандыруулар)**:
   - **Admin Management**: Admins can compose, schedule, publish, edit, and delete announcements with bilingual fields (Kyrgyz and Russian), target specific categories or all teams, and set urgency badges (`urgent`, `important`, `normal`).
   - **Team Cabinet View**: Teams see a chronological feed of active announcements relevant to their category or all teams, with clear publication dates, priority markers, and full bilingual translation.

2. **Support System (Поддержка / Колдоо)**:
   - **Team Cabinet Portal**: Teams can open tickets with subject, category (technical, test questions, organizational), and an initial message. They can chat directly with admins inside the ticket thread.
   - **Admin Panel Control**: Admins have a dedicated **Поддержка** (Support) tab listing all inquiries with status filtering (`Open`, `In Progress`, `Resolved`), team details, quick response input, and status toggle.

---

## 2. Visual Design & Interface Hierarchy

Adheres strictly to the established **Paper & Ink** design system (`team-modern.css` and `admin-modern.css`):

- **Palette**:
  - Background: `--paper: #f4f1ea`
  - Surfaces: `--surface: #fffdf9`, `--surface-2: #faf7f0`
  - Typography: Serif display headings (`Spectral`) with modern grotesque sans body (`Onest`)
  - Ink and Accents: `--ink: #1d1b18`, `--accent: #9a3a24`, `--line: #b8b0a0`
  - Status Indicators: Subtle textual indicators with typographic separators (no generic AI candy pill sandwiches)
- **Component Styling**:
  - Sidebar: New tab buttons (`tabAnnouncements` with 📢 icon, `tabSupport` with 💬 icon)
  - Cards: 1px border lines, flat elevation, compact data density
  - Chat/Ticket Stream: Clean alternating messages with sender badges (Team vs. Admin), timestamp in tabular numbers, and full keyboard submit support.

---

## 3. Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                          PostgreSQL Database                           │
│  ┌───────────────────────┐  ┌───────────────────┐  ┌─────────────────┐ │
│  │     announcements     │  │  support_tickets  │  │support_messages │ │
│  │ (title_ru, title_ky,  │  │ (team_id, subject,│  │(ticket_id, msg,│ │
│  │  target_type, etc.)   │  │  status, cat, dt) │  │ sender_type, dt)│ │
│  └───────────▲───────────┘  └────────▲──────────┘  └────────▲────────┘ │
└──────────────┼───────────────────────┼──────────────────────┼──────────┘
               │                       │                      │
┌──────────────┴───────────────────────┴──────────────────────┴──────────┐
│                         Express Backend API                            │
│  • GET  /api/announcements           (public/team-scoped)              │
│  • POST /api/admin/announcements     (admin create/update/delete)      │
│  • GET  /api/team/support/tickets    (team ticket list & messages)     │
│  • POST /api/team/support/tickets    (team create ticket / reply)      │
│  • GET  /api/admin/support/tickets   (admin all tickets & filtering)   │
│  • POST /api/admin/support/reply     (admin reply & status transition) │
└──────────────▲──────────────────────────────────────────────▲──────────┘
               │                                              │
    ┌──────────┴───────────────┐                  ┌───────────┴──────────┐
    │       Team Cabinet       │                  │     Admin Panel      │
    │  • Announcements Tab     │                  │  • Announcements Tab │
    │  • Support & Tickets Tab │                  │  • Support Inbox Tab │
    └──────────────────────────┘                  └──────────────────────┘
```

---

## 4. Step-by-Step Execution Plan

### Step 1: Database Schema Expansion (`backend/src/services/schema.js`)
- Add `announcements` table with bilingual title and content, category filter, priority, publication flag, and timestamps.
- Add `support_tickets` table linked to `teams(id)` with subject, category, and status.
- Add `support_messages` table linked to `support_tickets(id)` with `sender_type` (`team` | `admin`), message text, and timestamp.
- Create automated indices for fast lookups.

### Step 2: Backend REST API Endpoints
- **Public & Team Endpoints**:
  - `GET /api/announcements`: Retrieves active announcements filtered for the current authenticated team (broadcast + team's category).
  - `GET /api/team/support/tickets`: Retrieves all tickets and messages for the logged-in team.
  - `POST /api/team/support/tickets`: Creates a new support ticket with initial message.
  - `POST /api/team/support/tickets/:id/reply`: Sends a follow-up message to an existing ticket.
- **Admin Endpoints (`backend/src/routes/admin/index.js`)**:
  - `GET /api/admin/announcements`: List all announcements with author and engagement stats.
  - `POST /api/admin/announcements`: Create a new announcement.
  - `PUT /api/admin/announcements/:id`: Update existing announcement.
  - `DELETE /api/admin/announcements/:id`: Remove announcement.
  - `GET /api/admin/support/tickets`: List all tickets with unread counters and status filter.
  - `POST /api/admin/support/tickets/:id/reply`: Admin reply to a team's ticket.
  - `PATCH /api/admin/support/tickets/:id/status`: Update status (`open`, `in_progress`, `resolved`).

### Step 3: Frontend Localization (`frontend/src/js/i18n.js`)
- Add comprehensive keys for both Announcements and Support in English (`en`) and Kyrgyz (`ky`):
  - Sidebar titles: `team.tab.announcements`, `team.tab.support`, `admin.tab.announcements`, `admin.tab.support`.
  - Empty states, placeholders, buttons, priority tags, and status labels.

### Step 4: Team Cabinet Integration (`team.html` & `team.js`)
- Add **Announcements** button and **Support** button to `sidebar-nav`.
- Implement `renderAnnouncementsSection()` in `team.js`:
  - List cards with bilingual toggle, priority indicator, date badge, and category tag.
- Implement `renderSupportSection()` in `team.js`:
  - Active ticket overview with status (`Open` / `In Progress` / `Resolved`).
  - Interactive message thread for selected ticket with real-time send form.
  - "New Inquiry" modal/form with validation.

### Step 5: Admin Panel Integration (`admin.html` & `admin.js`)
- Add **Объявления** and **Поддержка** tabs to admin sidebar with badge counters.
- Implement Announcements management in `admin.js`:
  - Form to create/edit announcements (Russian + Kyrgyz tabs/fields, category picker, priority).
  - Management table with toggle publish and delete action with confirmation.
- Implement Support ticket desk in `admin.js`:
  - Ticket inbox with status filter tabs (`Все`, `Открытые`, `В работе`, `Решенные`).
  - Split-view or conversation modal to read team messages and submit admin replies.

---

## 5. Verification & Testing Strategy

1. **Schema & Migration Verification**:
   - Restart server and verify `ensureSchema()` runs smoothly without sequence or foreign key conflicts.
2. **Announcements Flow**:
   - Create broadcast announcement in Admin -> verify it appears in Team Cabinet in both Russian and Kyrgyz.
   - Create category-specific announcement -> verify it only appears for teams in that category.
3. **Support System Flow**:
   - Team creates a ticket in cabinet -> Ticket immediately appears in Admin Support tab with unread badge.
   - Admin replies in Admin panel -> Team sees admin response in their ticket thread.
   - Admin marks ticket as "Resolved" -> Team sees the resolved status and timestamp.
4. **Build & Lint Verification**:
   - Run `compile_applet` and `lint_applet` to ensure zero compilation or syntax errors.
