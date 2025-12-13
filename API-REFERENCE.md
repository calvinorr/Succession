# Succession API Reference

Complete reference for all API endpoints in the Succession project.

## Base URL
```
http://localhost:3000
```

## Interview Endpoints

### List All Interviews
```http
GET /interviews
```
Returns array of all interviews with summary information.

**Response:**
```json
[
  {
    "id": "abc123",
    "role": "Finance Director",
    "phase": "warm-up",
    "status": "in-progress",
    "messageCount": 4,
    "createdAt": "2025-12-12T18:00:00.000Z",
    "expertName": "John Smith",
    "industry": "Finance & Banking"
  }
]
```

### Create Interview
```http
POST /interviews/start
Content-Type: application/json

{
  "role": "Finance Director",
  "expertName": "John Smith",     // Optional
  "industry": "Healthcare Finance" // Optional
}
```

**Response:**
```json
{
  "id": "abc123",
  "role": "Finance Director",
  "phase": "warm-up",
  "messages": [],
  "createdAt": "2025-12-12T18:00:00.000Z",
  "expertName": "John Smith",
  "industry": "Healthcare Finance"
}
```

### Get Single Interview
```http
GET /interviews/:id
```

**Response:**
```json
{
  "id": "abc123",
  "role": "Finance Director",
  "phase": "core-frameworks",
  "messages": [...],
  "createdAt": "2025-12-12T18:00:00.000Z",
  "expertName": "John Smith",
  "industry": "Healthcare Finance",
  "status": "in-progress"
}
```

### Update Interview
```http
PUT /interviews/:id
Content-Type: application/json

{
  "expertName": "John M. Smith",   // Optional
  "industry": "Corporate Finance",  // Optional
  "phase": "core-frameworks",       // Optional
  "status": "in-progress"           // Optional
}
```

**Response:** Updated interview object with `updatedAt` timestamp

### Add Message to Interview
```http
POST /interviews/:id/message
Content-Type: application/json

{
  "message": "I have 25 years of experience in finance"
}
```

**Response:**
```json
{
  "response": "Assistant's response text..."
}
```

### Complete Interview
```http
POST /interviews/:id/complete
```

**Response:** Updated interview object with:
- `phase`: "complete"
- `completedAt`: timestamp
- Triggers automatic snapshot creation

### Get Interview Transcript
```http
GET /interviews/:id/transcript
```

**Response:**
```json
{
  "transcript": "[12/12/2025, 6:42:00 PM] Expert: Message...\n\n[12/12/2025, 6:42:01 PM] Interviewer: Response...",
  "messageCount": 4,
  "duration": "5m 30s"
}
```

### Create Knowledge Snapshot
```http
POST /interviews/:id/note-snapshot
```

**Response:** Snapshot object with extracted knowledge

### Get Interview Snapshots
```http
GET /interviews/:id/snapshots
```

**Response:** Array of snapshot objects

## Persona Endpoints

### List All Personas
```http
GET /personas
```

**Response:** Array of persona summary objects

### Build Persona
```http
POST /personas/build
Content-Type: application/json

{
  "interviewId": "abc123"
}
```

**Response:**
```json
{
  "id": "xyz789",
  "role": "Finance Director",
  "interviewId": "abc123",
  "promptText": "First-person expert persona text...",
  "status": "draft",
  "createdAt": "2025-12-12T18:00:00.000Z"
}
```

### Get Single Persona
```http
GET /personas/:id
```

**Response:** Full persona object

### Update Persona
```http
PUT /personas/:id
Content-Type: application/json

{
  "name": "John M. Smith",                // Optional
  "role": "Finance Director",             // Optional
  "organization": "ABC Corporation",      // Optional
  "yearsOfExperience": 25,                // Optional
  "bio": "Expert in finance...",          // Optional
  "traits": ["analytical", "strategic"],  // Optional
  "expertise": ["MTFS", "budgeting"],     // Optional
  "status": "active"                      // Optional
}
```

**Response:** Updated persona object with `updatedAt` timestamp

### Get Expert Advice
```http
POST /personas/:id/advise
Content-Type: application/json

{
  "question": "How should I approach budget forecasting?"
}
```

**Response:**
```json
{
  "response": "Expert's advice based on persona...",
  "personaId": "xyz789",
  "role": "Finance Director"
}
```

### Submit Feedback
```http
POST /personas/:id/feedback
Content-Type: application/json

{
  "feedback": "This advice was helpful"
}
```

## Dashboard Endpoints

### Get Dashboard Stats
```http
GET /dashboard/stats
```

**Response:**
```json
{
  "activeInterviews": 3,
  "completedInterviews": 5,
  "personasGenerated": 4,
  "transcriptsReady": 5,
  "totalInterviews": 8
}
```

## Error Responses

### 404 Not Found
```json
{
  "error": "Interview not found: abc123"
}
```

### 400 Bad Request
```json
{
  "error": "Invalid role. Must be one of: Finance Director, Head of AP, Head of AR, Head of Treasury"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error processing message",
  "details": "Error message details..."
}
```

## Valid Role Values

- Finance Director
- Head of AP
- Head of AR
- Head of Treasury

## Interview Phases

- warm-up
- core-frameworks
- cases
- meta
- complete

## Persona Status Values

- draft
- active
- archived
