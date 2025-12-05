# User Story 2.1: Build a Persona from an Interview

## User Story
**As a** System Administrator  
**I want to** trigger the persona building process for a completed interview  
**So that** a first-person persona prompt can be generated.

## Acceptance Criteria
- The Persona Builder agent can be manually triggered from the UI or via an API call.
- The agent consumes all knowledge snapshots from a given interview.
- The agent outputs a complete, first-person persona prompt.
- The generated persona is stored and linked to the expert role.

## Detailed Implementation Notes

### UI/UX Flow
1.  **Trigger Location:** The System Administrator navigates to a list of completed interviews.
2.  **Action Button:** For each completed interview, there is a "Build Persona" button.
3.  **Confirmation:** Clicking the button prompts for confirmation ("Are you sure you want to build a persona for this interview?").
4.  **Feedback:** Once the process is complete, the admin is notified (e.g., "Persona for 'Finance Director' created successfully.") and redirected to the new persona's view.

### API Endpoint
- **Endpoint:** `POST /personas/build`
- **Request Body:**
  ```json
  {
    "interviewId": "a1b2c3d4e5f6"
  }
  ```
- **Success Response (201 Created):**
  ```json
  {
    "personaId": "pers-xyz-789",
    "interviewId": "a1b2c3d4e5f6",
    "status": "Draft"
  }
  ```
- **Error Response (404 Not Found):**
  ```json
  {
    "error": "Interview not found or is not in a 'Complete' state."
  }
  ```

### Data Model
- **Persona Object:**
  ```json
  {
    "personaId": "string",
    "interviewId": "string",
    "role": "string", // e.g., "Finance Director"
    "version": "integer", // 1, 2, 3...
    "promptText": "string", // The full, generated first-person prompt
    "status": "string", // "Draft", "Validated", "Deprecated"
    "createdAt": "datetime",
    "validatedAt": "datetime" // Null until validated
  }
  ```

### Business Logic
- **Prerequisites:** The system should only allow persona building for interviews where the `status` is "Complete".
- **Data Aggregation:** The API endpoint handler must fetch all `KnowledgeSnapshot` objects associated with the given `interviewId`.
- **Agent Invocation:** The aggregated data is then passed to the Persona Builder agent. This is likely a long-running process, so the API should respond asynchronously (e.g., return a `personaId` immediately and update the `promptText` later).
- **Initial State:** A newly created persona must have its `status` set to "Draft" and `version` to the next available number for that role.

### Open Questions/Considerations
- **Asynchronous Processing:** How does the UI know when the persona generation is complete if it's a long process? A polling mechanism or WebSocket notification could be used.
- **Failure Handling:** What happens if the Persona Builder agent fails to generate a coherent persona? The system should log the error and notify the admin, perhaps allowing them to retry with modified parameters.
- **Cost:** Generating a persona is a significant LLM operation. The system should provide visibility into this cost or at least log it for administrative purposes.