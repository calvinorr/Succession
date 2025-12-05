# User Story 4.1: Manage Expert Roles

## User Story
**As a** System Administrator  
**I want to** define and manage the list of available expert roles (e.g., Finance Director, Head of Treasury)  
**So that** the system can be configured for different organizational structures.

## Acceptance Criteria
- New roles can be added to the system.
- Existing roles can be edited or deactivated.
- The list of roles is used in relevant UI dropdowns and API calls.

## Detailed Implementation Notes

### UI/UX Flow
1.  **Role Management Page:** A dedicated page in the admin panel for managing roles.
2.  **List View:** A table lists all current roles with columns: Name, Status (Active/Inactive), Date Created.
3.  **Actions:**
    - **Add Role:** A button that opens a form to create a new role.
    - **Edit Role:** An icon or link next to each role to edit its name.
    - **Deactivate Role:** An option to mark a role as inactive. This is preferred over deletion to maintain data integrity.
4.  **Form:** A modal or new page for adding/editing a role with a simple text input for the role's name.

### API Endpoints
- **GET /admin/roles:** Retrieves all roles.
    - **Success Response (200 OK):**
      ```json
      [
        {
          "roleId": "role-fd-001",
          "name": "Finance Director",
          "isActive": true,
          "createdAt": "..."
        },
        // ... other roles
      ]
      ```
- **POST /admin/roles:** Creates a new role.
    - **Request Body:**
      ```json
      {
        "name": "Head of Tax"
      }
      ```
    - **Success Response (201 Created):**
      ```json
      {
        "roleId": "role-tax-002",
        "name": "Head of Tax",
        "isActive": true
      }
      ```
- **PUT /admin/roles/{id}:** Updates an existing role.
    - **Request Body:** Same as POST.
    - **Success Response (200 OK):** The updated role object.
- **DELETE /admin/roles/{id}/deactivate:** Deactivates a role.
    - **Success Response (200 OK):**
      ```json
      {
        "message": "Role deactivated successfully."
      }
      ```

### Data Model
- **Role Object:**
  ```json
  {
    "roleId": "string",
    "name": "string",
    "isActive": "boolean",
    "createdAt": "datetime",
    "updatedAt": "datetime"
  }
  ```

### Business Logic
- **Uniqueness:** Role names must be unique within the system.
- **Referential Integrity:** A role should not be deletable if it's associated with existing interviews or personas. Deactivation is the safer approach.
- **System-wide Update:** When a role is added or updated, the change must be reflected immediately in all relevant parts of the application (e.g., the interview start form).

### Open Questions/Considerations
- **Pre-defined vs. Custom:** Should the system allow for completely custom roles to be entered during interview creation, or should it be strictly limited to this admin-defined list? The PRD suggests a predefined list is the starting point.
- **Localization:** Are role names expected to be localized (e.g., for different languages)?
- **Permissions:** Is managing roles a top-level admin function, or should there be a more granular permission system (e.g., "Role Manager" vs. "User Manager")?