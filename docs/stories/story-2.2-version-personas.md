# User Story 2.2: Version and Store Personas

## User Story
**As a** System Administrator  
**I want to** manage different versions of personas for each role  
**So that** we can track improvements and ensure the correct version is in use.

## Acceptance Criteria
- Each persona is assigned a version number (e.g., v1, v2).
- The system stores the full prompt text for each version.
- Personas can have a status (e.g., Draft, Validated, Deprecated).
- The latest validated version for a role is easily identifiable.

## Detailed Implementation Notes

### UI/UX Flow
1.  **Persona List View:** A table or list view showing all personas, with columns for Role, Version, Status, and Last Updated.
2.  **Filtering/Sorting:** The admin can filter by role or status, and sort by version or date.
3.  **Version History:** Clicking on a role reveals a version history, showing the evolution of that persona.
4.  **Status Badge:** Each persona has a clear visual indicator for its status (e.g., a colored badge).

### API Endpoints
- **GET /personas:** Retrieves a list of all personas, with optional filtering.
    - **Query Params:** `?role=FinanceDirector&status=Validated`
    - **Success Response (200 OK):**
      ```json
      [
        {
          "personaId": "pers-xyz-789",
          "role": "Finance Director",
          "version": 2,
          "status": "Validated",
          "createdAt": "..."
        },
        // ... other personas
      ]
      ```
- **GET /personas/{id}:** Retrieves a single persona by its ID.
    - **Success Response (200 OK):**
      ```json
      {
        "personaId": "pers-xyz-789",
        "promptText": "You are the Finance Director...",
        "version": 2,
        "status": "Validated"
      }
      ```

### Data Model
- The `Persona` object remains consistent with what's defined in Story 2.1.
- **Versioning Logic:**
    - When a new persona is created for a role, its `version` should be `MAX(version) + 1` for that role.
    - The `status` field is critical for workflow control.

### Business Logic
- **Default Persona:** The system must have a clear way to determine which persona is the "latest validated" for a given role. This is the one that should be used by the Expert Advisor agent (Epic 3).
- **Deprecation:** When a new version is validated, the old one should be marked as `Deprecated` by the system to avoid confusion.
- **Immutability:** A persona version, once created, should be immutable. Any changes result in a new version.

### Open Questions/Considerations
- **Cloning:** Should there be an ability to create a new persona by "cloning" an old one and making edits? This could speed up the process for minor adjustments.
- **Deletion:** Can personas be deleted, or should they only be deprecated to maintain a historical record? For auditing, deprecation is better.
- **Access Control:** While this story is for the System Administrator, what permissions are needed for other roles to view personas? (Likely covered in Epic 4).