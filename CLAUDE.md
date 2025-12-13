# CLAUDE.md

## Project Overview

Succession captures expert knowledge from local authority finance staff through structured interviews, synthesizes it into AI personas, and provides decision support to successors.

**Target Roles:** Finance Director, Head of AP, Head of AR, Head of Treasury

## Critical Constraints

**DO NOT introduce these concepts (not in PRD):**
- Industry, Projects, Expert entity, Organizations

This is a **single local authority deployment**, not multi-industry SaaS. Design mockups in `docs/Screendesign/` are visual inspiration only - defer to `docs/project-plan.md`.

## Core Entities

| Entity | Key Fields | Purpose |
|--------|------------|---------|
| Interview | id, role, phase, messages[], expertName | Knowledge capture session |
| Snapshot | id, interviewId, phase, topics, insights | Extracted knowledge |
| Persona | id, role, interviewId, promptText, status | AI expert representation |

## Architecture

```
src/
├── api/api.js    # Express REST endpoints
├── dal/dal.js    # JSON file persistence
├── agents/       # LLM agents (Interviewer, Note-Taker, Persona Builder, Advisor)
├── services/     # LLM service layer
└── ui/           # Frontend HTML/JS
```

**Data Flow:** Interview → Snapshots → Persona → Expert Advice

**Interview Phases:** Warm-Up → Core Frameworks → Cases → Meta → Complete

## Commands

```bash
npm start   # Express server on port 3000
```

## Source of Truth

Requirements: `docs/project-plan.md`, `docs/epics/`, `docs/stories/`
