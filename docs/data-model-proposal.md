# Data Model Evolution Proposal

## Current State

### Interview
```json
{
  "id": "string",
  "role": "Finance Director | Head of AP | Head of AR | Head of Treasury",
  "phase": "warm-up | core-frameworks | cases | meta | complete",
  "messages": [
    { "role": "user | assistant", "content": "string", "timestamp": "ISO8601" }
  ],
  "createdAt": "ISO8601"
}
```

### Persona
```json
{
  "id": "string",
  "role": "string",
  "interviewId": "string",
  "promptText": "string (markdown)",
  "status": "draft",
  "createdAt": "ISO8601"
}
```

### Snapshot
```json
{
  "id": "string",
  "interviewId": "string",
  "phase": "string",
  "timestamp": "ISO8601",
  "topicsCovered": ["string"],
  "keyInsights": ["string"],
  "frameworksMentioned": ["string"],
  "gaps": ["string"],
  "suggestedProbes": ["string"]
}
```

---

## Proposed State

### NEW: Expert
```json
{
  "id": "string",
  "name": "string",
  "email": "string (optional)",
  "photoUrl": "string (optional)",
  "organization": "string",
  "industry": "Finance & Banking | Healthcare | Technology | Retail | Other",
  "yearsOfExperience": "number",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```
**Storage**: `data/experts/{id}.json`

### NEW: Project
```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "deadline": "ISO8601 (optional)",
  "targetPersonaId": "string (optional)",
  "expertId": "string",
  "status": "draft | active | complete",
  "topics": [
    { "id": "string", "title": "string", "description": "string", "order": "number" }
  ],
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```
**Storage**: `data/projects/{id}.json`

### EXTENDED: Interview
```json
{
  "id": "string",
  "role": "string",
  "phase": "string",
  "messages": [...],
  "createdAt": "ISO8601",

  // NEW FIELDS
  "expertId": "string (optional, for backward compat)",
  "projectId": "string (optional)",
  "expertName": "string (denormalized for display)",
  "industry": "string (denormalized)",
  "status": "scheduled | in-progress | transcribing | completed",
  "scheduledAt": "ISO8601 (optional)",
  "completedAt": "ISO8601 (optional)",
  "questions": [
    {
      "id": "string",
      "text": "string",
      "category": "string",
      "suggestedFollowUps": ["string"],
      "isCovered": "boolean",
      "notes": "string"
    }
  ],
  "bookmarks": [
    { "timestamp": "ISO8601", "label": "string" }
  ]
}
```

### EXTENDED: Persona
```json
{
  "id": "string",
  "interviewId": "string",
  "promptText": "string (for AI usage)",
  "createdAt": "ISO8601",

  // NEW FIELDS - Structured Identity
  "name": "string",
  "role": "string (job title)",
  "organization": "string",
  "yearsOfExperience": "number",
  "bio": "string (one-liner)",
  "photoUrl": "string (optional)",
  "industry": "string",

  // NEW FIELDS - Behavioral
  "traits": ["Risk-Averse", "Analytical", "Systems Thinker", ...],

  // NEW FIELDS - Expertise
  "expertise": [
    { "domain": "string", "level": "1-5 (None to Expert)" }
  ],

  // NEW FIELDS - Status & Discovery
  "status": "draft | pending | active | archived",
  "isFavorite": "boolean",
  "viewedAt": "ISO8601 (optional)",
  "publishedAt": "ISO8601 (optional)"
}
```

---

## New API Endpoints

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard/stats` | Return counts: activeInterviews, personasGenerated, transcriptsReady |

### Experts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/experts` | List all experts |
| POST | `/experts` | Create new expert |
| GET | `/experts/:id` | Get expert by ID |
| PUT | `/experts/:id` | Update expert |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects` | List all projects |
| POST | `/projects` | Create new project |
| GET | `/projects/:id` | Get project by ID |
| PUT | `/projects/:id` | Update project |

### Interviews (extended)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/interviews` | List all interviews (with filters: status, expertId) |
| PUT | `/interviews/:id` | Update interview (status, questions) |

### Personas (extended)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/personas` | List all personas (with filters: status, industry, experience) |
| PUT | `/personas/:id` | Update persona |
| PUT | `/personas/:id/favorite` | Toggle favorite status |

---

## Migration Strategy

1. **Backward Compatibility**: All new fields are optional; existing data continues to work
2. **Gradual Enhancement**: UI can display "Unknown Expert" for interviews without expertId
3. **Data Enrichment Script**: Optional script to prompt for missing data on existing records

---

## Implementation Order

1. **Phase 1** (Story 6.6 - Critical)
   - Add new API endpoints for listing interviews and personas
   - Add dashboard stats endpoint
   - Extend persona model with structured fields

2. **Phase 2** (With UI Stories)
   - Add Expert entity when Interview Setup is built
   - Add Project entity when Interview Setup is built
   - Add structured questions when Interview Session is built
