# User Story 1.3: Capture Periodic Knowledge Snapshots

## User Story
**As an** Interviewer Agent  
**I want to** automatically create structured knowledge snapshots during an interview  
**So that** key insights are captured and can be used later for persona building.

## Acceptance Criteria
- The system triggers a snapshot process at logical points (e.g., every 5-10 turns).
- The Note-Taker agent processes the recent transcript segment.
- The snapshot is stored as structured data (JSON) linked to the interview ID.
- The snapshot includes topics covered, gaps, and suggested next probes.

## Detailed Implementation Notes

### Triggering Logic
- The snapshot process should be an automated, background task.
- **Triggers:**
    - **Turn-based:** After every N messages from the expert (e.g., 5).
    - **Time-based:** Every M minutes (e.g., 10).
    - **Phase-based:** When the Interviewer agent changes the interview phase (e.g., from "Warm-Up" to "Core Frameworks").
- A combination of these triggers could be used for more intelligent snapshotting.

### API Endpoint
- **Endpoint:** `POST /interviews/{id}/note-snapshot`
- **Request Body:** This would likely be an internal call, not a public API. The system would pass the recent transcript to the Note-Taker agent.
- **Success Response (201 Created):**
  ```json
  {
    "snapshotId": "snap-xyz-123",
    "interviewId": "a1b2c3d4e5f6",
    "status": "Processed"
  }
  ```

### Data Model
- **KnowledgeSnapshot Object:**
  ```json
  {
    "snapshotId": "string",
    "interviewId": "string",
    "phase": "string", // Corresponds to the interview's current phase
    "createdAt": "datetime",
    "data": {
      "topicsCovered": ["string"], // e.g., ["MTFS", "Reserves Policy"]
      "coverageGaps": ["string"], // e.g., ["Political influence on savings"]
      "suggestedNextProbe": "string" // e.g., "Can you describe a time when you had to make a difficult cut?"
    }
  }
  ```

### Business Logic
- **Data Segmentation:** The system needs to determine the "recent transcript segment" to send to the Note-Taker. This could be the last N turns or all messages since the last snapshot.
- **Agent Orchestration:** The system calls the Note-Taker agent with the transcript segment and the current interview phase. The agent is responsible for parsing the text and extracting the structured information.
- **Storage:** The resulting JSON object from the Note-Taker is stored as a new `KnowledgeSnapshot` object, linked to the `interviewId`.
- **Idempotency:** Care must be taken to ensure duplicate snapshots are not created for the same conversational segment.

### Open Questions/Considerations
- **Cost Management:** Each snapshot call to an LLM incurs a cost. The triggering frequency should be carefully balanced to capture value without being prohibitively expensive.
- **User Feedback:** Should the Interviewer or Expert have a manual "Take Snapshot Now" button? This allows for on-demand capture of key moments.
- **Failure Handling:** What happens if the Note-Taker agent fails to process a segment? The system should log the error and retry, but not interrupt the interview flow.
- **Context Window:** The Note-Taker agent will have a limited context window. For very long interviews, the system might need to summarize older parts of the conversation before sending the latest segment.