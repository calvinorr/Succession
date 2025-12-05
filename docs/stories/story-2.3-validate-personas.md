# User Story 2.3: Review and Validate Personas

## User Story
**As an** Expert  
**I want to** review the persona generated from my interview  
**So that** I can confirm its accuracy and approve it for use.

## Acceptance Criteria
- The expert can view the full persona text.
- The expert can provide feedback or comments.
- The expert can change the persona's status from "Draft" to "Validated".
- The system records who validated the persona and when.

## Detailed Implementation Notes

### UI/UX Flow
1.  **Access:** The expert receives a unique link to a review page for a specific persona (e.g., via email).
2.  **Authentication:** The expert must authenticate to ensure only the correct person can review the persona.
3.  **Review Screen:**
    - A large text area displays the full, read-only `promptText` of the persona.
    - A section for "Feedback or Comments" is provided.
    - Clear buttons for "Approve" and "Request Changes".
4.  **Approval:** Clicking "Approve" changes the persona's status to "Validated" and locks it from further edits (except by creating a new version).
5.  **Feedback:** If "Request Changes" is clicked, the system notifies the System Administrator and provides a text area for detailed feedback.

### API Endpoints
- **GET /personas/{id}/review:** A special endpoint that returns persona data for a review context. Might include a one-time-use token in the URL for security.
    - **Success Response (200 OK):**
      ```json
      {
        "personaId": "pers-xyz-789",
        "promptText": "You are the Finance Director...",
        "role": "Finance Director",
        "status": "Draft"
      }
      ```
- **POST /personas/{id}/validate:**
    - **Request Body:**
      ```json
      {
        "validatedBy": "expert@example.com", // The authenticated expert's identifier
        "feedback": "Looks good, but please add more about political aspects."
      }
      ```
    - **Success Response (200 OK):**
      ```json
      {
        "status": "Validated",
        "validatedAt": "2023-10-27T10:00:00Z"
      }
      ```

### Data Model
- The `Persona` object is updated with `validatedBy`, `validatedAt`, and `status` fields.
- A new `PersonaFeedback` object might be created to store the feedback text.

### Business Logic
- **Permissions:** Only the expert who was interviewed for the persona should have permission to validate it. This needs a secure mechanism, like a signed URL or token.
- **State Transition:** The endpoint for validation should only work if the persona's current `status` is "Draft".
- **Notification:** Upon successful validation, the System Administrator should be notified (e.g., via email or in-app notification).
- **Audit Trail:** The `validatedBy` and `validatedAt` fields create a clear audit trail for compliance and quality control.

### Open Questions/Considerations
- **Iterative Process:** What if the expert wants to make small changes after validation? The process should mandate creating a new version (`v2`) to maintain integrity of the validated one.
- **Multiple Reviewers:** For some roles, should more than one expert be able to review and validate a persona? The current model assumes one primary expert.
- **Disagreement:** What if the expert fundamentally disagrees with the generated persona? The feedback mechanism should be robust enough to capture this, potentially triggering a follow-up interview or a significant revision.
- **Security:** The review link must be secure and not guessable to prevent unauthorized access.