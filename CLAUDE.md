# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Succession is an expert interview and persona building system for **local authority finance succession planning**. It captures expert knowledge through structured interviews and synthesizes it into reusable "expert personas" that provide decision support.

### Core Use Case

When senior finance staff retire or leave a local authority, their institutional knowledge is lost. This system preserves that expertise by:

1. **Interviewing experts** before they leave
2. **Extracting structured knowledge** from those interviews
3. **Building AI personas** that embody the expert's knowledge and decision-making style
4. **Providing advice** to remaining staff via these personas

### Target Roles (Fixed List)

The system targets these specific local authority finance roles:
- **Finance Director** - Strategic financial leadership
- **Head of AP** - Accounts Payable expertise
- **Head of AR** - Accounts Receivable expertise
- **Head of Treasury** - Treasury management expertise

## IMPORTANT: Design Guidance

**DO NOT introduce concepts that aren't in the PRD:**

| Concept | Status | Notes |
|---------|--------|-------|
| Industry | ❌ NOT NEEDED | This is a single local authority, not multi-industry SaaS |
| Projects | ❌ NOT NEEDED | We have Interviews → Personas, no separate project entity |
| Expert entity | ❌ NOT NEEDED | Interview captures expertName and role |
| Organizations | ❌ NOT NEEDED | Single local authority deployment |

**Design mockups in `docs/Screendesign/` are for visual inspiration only.** They show generic SaaS patterns that don't apply to this specific use case. Always defer to `docs/project-plan.md` for actual requirements.

### Core Entities (What Actually Exists)

1. **Interview** - A knowledge capture session with an expert
   - Has: id, role, phase, messages[], expertName, createdAt
   - Produces: Knowledge Snapshots

2. **Snapshot** - Structured knowledge extracted from an interview segment
   - Has: id, interviewId, phase, timestamp, topics, insights, gaps

3. **Persona** - A first-person AI representation of an expert
   - Has: id, role, interviewId, promptText, status, version
   - Used by: Expert Advisor for decision support

## Commands

```bash
npm start        # Start Express server on port 3000
npm test         # Not implemented yet
```

## Architecture

### Four Agent Roles

1. **Interviewer Agent** - Conducts multi-turn interviews with experts
2. **Note-Taker Agent** - Extracts structured knowledge from interview segments
3. **Persona Builder Agent** - Synthesizes snapshots into first-person expert personas
4. **Expert Advisor Agent** - Uses personas to provide decision support

### Data Flow

```
Interview → Knowledge Snapshots → Persona Version → Expert Advice
```

### Interview Phases

Warm-Up → Core Frameworks → Cases → Meta → Complete

### Project Structure

```
src/
├── api/api.js       # Express server with REST endpoints
├── dal/dal.js       # Data Access Layer (JSON file persistence)
├── agents/          # LLM agent implementations
├── services/        # LLM service layer
└── ui/              # Frontend HTML/JS
data/                # Runtime JSON storage
docs/
├── project-plan.md  # Epics and user stories (SOURCE OF TRUTH)
├── epics/           # Detailed epic breakdowns (1-5)
└── stories/         # User story files with acceptance criteria
```

### API Endpoints

Core endpoints for the MVP:

```
POST   /interviews/start           - Create new interview session
GET    /interviews                 - List all interviews
GET    /interviews/:id             - Get interview details
POST   /interviews/:id/message     - Add message to interview
POST   /interviews/:id/note-snapshot - Create structured snapshot
GET    /interviews/:id/snapshots   - Get all snapshots for interview

POST   /personas/build             - Trigger persona generation
GET    /personas                   - List all personas
GET    /personas/:id               - Retrieve persona
PUT    /personas/:id               - Update persona (status, validation)
POST   /personas/:id/advise        - Get expert advice

GET    /dashboard/stats            - Aggregate counts for dashboard
```

### Data Access Layer

The DAL (`src/dal/dal.js`) provides file-based JSON persistence with `readData()` and `writeData()` functions. This abstraction allows future migration to a proper database.

## Documentation

The `docs/` folder is the **source of truth** for requirements:
- `docs/project-plan.md` - High-level epics and user stories
- `docs/epics/` - Detailed breakdown of 5 epics
- `docs/stories/` - User stories with full acceptance criteria

## Development Status

**Current Phase:** Core functionality implemented

Implemented:
- Interview management (start, message, complete)
- Knowledge snapshot extraction
- Persona building from snapshots
- Expert advisor (ask questions to personas)
- Dashboard with stats
- Modern UI layout

**Key priorities:**
1. Validation UI and feedback collection
2. Persona versioning
3. Test scenario framework
