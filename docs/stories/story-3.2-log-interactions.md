# User Story 3.2: Log Advisor Interactions for Feedback

## User Story
**As a** System Administrator  
**I want to** log all interactions with the Expert Advisor agent  
**So that** we can review performance and gather data for continuous improvement.

## Acceptance Criteria
- Each question posed to a persona is logged.
- The generated response is logged alongside the question.
- The persona version used is recorded.
- Logs are timestamped and stored securely.

## Detailed Implementation Notes

### UI/UX Flow
1.  **Access:** The System Administrator navigates to an "Analytics" or "Logs" section of the admin panel.
2.  **Viewing Logs:** A paginated table or list displays all `AdvisorLog` entries.
3.  **Filtering/Searching:** The admin can filter logs by:
    - Date range.
    - User ID (`userId`).
    - Persona role or ID.
4.  **Exporting:** An option to export the log data (e.g., to CSV) for external analysis.

### API Endpoint
This story is more about the internal logic of the `/personas/{id}/advise` endpoint (from Story 3.1) and a new endpoint for viewing the logs.
- **GET /admin/advisor-logs:**
    - **Query Params:** `?personaId=...&userId=...&fromDate=...&toDate=...`
    - **Success Response (200 OK):**
      ```json
      {
        "logs": [
          {
            "logId": "log-abc-123",
            "personaId": "pers-xyz-789",
            "personaVersion": 2,
            "userId": "user-123",
            "question": "...",
            "response": "...",
            "createdAt": "2023-10-27T10:30:00Z"
          }
          // ... more log entries
        ],
        "pagination": {
          "currentPage": 1,
          "totalPages": 10
        }
      }
      ```

### Data Model
- The `AdvisorLog` object is defined as in Story 3.1.

### Business Logic
- **Automatic Logging:** The logic for creating an `AdvisorLog` entry should be an integral, non-failable part of the `/personas/{id}/advise` endpoint. It must be created before the response is sent back to the user.
- **Data Integrity:** The log entry must accurately record the persona version used to ensure that performance analysis is tied to correct iteration of the persona.
- **Security:** Access to these logs should be strictly limited to System Administrators.
- **Retention:** A policy for log retention should be defined (e.g., logs are kept for 90 days) to manage storage and privacy.

### Open Questions/Considerations
- **PII:** Does the `question` or `response` text contain any Personally Identifiable Information that needs to be scrubbed before logging?
- **Analytics:** What are the key performance indicators (KPIs) to derive from these logs? (e.g., number of questions per day, most-used personas, average response time).
- **Error Logging:** How are failed advisor calls (e.g., LLM timeout, API error) logged? The `response` field could contain an error message.
- **Real-time Monitoring:** Should there be a real-time dashboard showing current advisor activity, or is a retrospective view sufficient?