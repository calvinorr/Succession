# CLAUDE.md

## Project Overview

Succession captures expert knowledge from local authority finance staff through structured interviews and provides that knowledge to successors through a searchable knowledge base.

**Three User Roles:**
- **Expert** - Captures knowledge through guided interviews
- **Successor** - Accesses and learns from captured knowledge
- **Admin** - Oversees the system and manages quality

## Critical Constraints

**DO NOT introduce these concepts:**
- Industry, Projects, Organizations (this is single local authority deployment)
- Fixed roles like "Finance Director" (experts define their own topics)

## Architecture

```
src/
├── api/api.js    # Express REST endpoints
├── dal/dal.js    # JSON file persistence
├── agents/       # LLM agents (Interviewer, Note-Taker, etc.)
├── services/     # LLM service layer
└── ui/           # Frontend HTML/JS
    ├── index.html       # Role selector
    ├── expert/          # Expert portal
    ├── successor/       # Successor portal
    └── admin/           # Admin portal
```

## Commands

```bash
npm start   # Express server on port 3000
```

## Source of Truth

- GitHub Issues: https://github.com/calvinorr/Succession/issues
- Current Epic: #39 (Unified Knowledge Transfer Workflow)

## Status

Project reset on 2024-12-14. In planning mode to define unified workflow.
