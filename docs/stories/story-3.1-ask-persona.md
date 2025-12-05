# User Story 3.1: Ask a Question to a Persona

## User Story
**As a** Finance Staff Member  
**I want to** ask a question or present a scenario to a specific expert persona (e.g., Head of AP)  
**So that** I can get advice in the style and context of that expert.

## Acceptance Criteria
- The user can select an expert role.
- The user can submit a free-text question or scenario.
- The system uses the corresponding validated persona to generate a response.
- The response is displayed to the user in a clear format.

## Detailed Implementation Notes

### UI/UX Flow
1.  **Role Selection:** A prominent dropdown or selection list on the main interface to choose the expert persona (e.g., "Finance Director", "Head of AP").
2.  **Question Input:** A large text box for the user to type their question or describe the scenario.
3.  **Submission:** A clear "Ask" or "Get Advice" button.
4.  **Response Display:** The answer from the persona is displayed below the question, clearly attributed to the selected role.
5.  **Conversation History (Optional):** For a richer experience, the UI could maintain a history of the current session's Q&A.

### API Endpoint
- **Endpoint:** `POST /personas/{id}/advise`
- **Request Body:**
  ```json
  {
    "question": "What are the key risks to consider when approving a large, unusual payment to a new supplier?",
    "userId": "user-123" // Optional, for logging
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "response": "From an AP perspective, the first step is always to verify the supplier... The key risks are around fraud, compliance, and cash flow impact.",
    "personaVersion": "2", // The version of the persona that was used
    "timestamp": "2023-10-27T10:30:00Z"
  }
  ```
- **Error Response (404 Not Found):**
  ```json
  {
    "error": "Persona not found or is not in a 'Validated' state."
  }
  ```

### Data Model
- **AdvisorLog Object (created per interaction):**
  ```json
  {
    "logId": "string",
    "personaId": "string",
    "personaVersion": "integer",
    "userId": "string",
    "question": "string",
    "response": "string",
    "createdAt": "datetime"
  }
  ```

### Business Logic
- **Persona Resolution:** The system must first resolve the `{id}` in the URL to the latest `Validated` persona for the selected role.
- **Agent Invocation:** The resolved persona's `promptText` is used as the system message for the LLM call. The user's `question` is used as the user message.
- **Statelessness:** Each call to the `/advise` endpoint should be independent. If conversational history is needed, it must be managed client-side and sent with each new request.
- **Logging:** Regardless of success or failure, an attempt to interact with a persona should be logged in the `AdvisorLog` for analytics.

### Open Questions/Considerations
- **Cost Controls:** This endpoint directly calls an LLM. How will usage be tracked and potentially throttled per user to manage costs?
- **Multi-turn Conversations:** Should the system support a more chat-like flow, or is it strictly a single Q&A? A single Q&A is simpler to implement.
- **Context Injection:** For complex scenarios, should the user be able to provide additional context or documents along with their question?
- **Performance:** The LLM call can be slow. The UI should handle this gracefully (e.g., with a loading indicator).