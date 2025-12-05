# User Story 1.1: Start a New Interview

## User Story
**As an** Interviewer  
**I want to** start a new interview session for a specific expert role (e.g., Finance Director)  
**So that** I can begin capturing their knowledge for persona creation.

## Acceptance Criteria
- A new interview can be initiated via UI or API.
- The system generates a unique ID for the interview session.
- The initial state of the interview is set to "Warm-Up".
- The expert role is recorded and associated with the session.

## Detailed Implementation Notes

### UI/UX Flow
1.  **Initiation Point:** The Interviewer accesses a "Start New Interview" section.
2.  **Role Selection:** A dropdown or selection menu is presented with predefined expert roles (e.g., Finance Director, Head of AP, etc.).
3.  **Confirmation:** Upon selection, a confirmation screen/button ("Start Interview") is shown.
4.  **Session Creation:** After confirmation, the system transitions to the interview interface, displaying the unique session ID to the Interviewer.

### API Endpoint
- **Endpoint:** `POST /interviews/start`
- **Request Body:** 
  ```json
  {
    "expertRole": "Finance Director"
  }
  ```
- **Success Response (201 Created):**
  ```json
  {
    "interviewId": "a1b2c3d4e5f6",
    "status": "Warm-Up",
    "expertRole": "Finance Director"
  }
  ```
- **Error Response (400 Bad Request):**
  ```json
  {
    "error": "Expert role is required."
  }
  ```

### Data Model
- **Interview Object:**
  ```json
  {
    "interviewId": "string",
    "expertRole": "string",
    "status": "string", // "Warm-Up", "Core Frameworks", "Cases", "Meta", "Complete"
    "transcript": [], // Array of message objects
    "createdAt": "datetime",
    "updatedAt": "datetime"
  }
  ```

### Business Logic
- The `interviewId` should be a unique, non-sequential identifier (e.g., UUID) to prevent guessing.
- The initial `status` must be hardcoded to "Warm-Up" upon creation.
- The system should log the creation of a new interview for auditing purposes.

### Open Questions/Considerations
- Should the system allow for custom expert roles to be entered, or should it be strictly a predefined list? (For now, assume predefined list).
- Should there be a pre-interview setup where the Interviewer can add notes or objectives? (Considered out of scope for this story).