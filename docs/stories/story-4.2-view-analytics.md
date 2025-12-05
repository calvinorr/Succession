# User Story 4.2: View System Data and Analytics

## User Story
**As a** System Administrator  
**I want to** view an overview of all interviews, personas, and their status  
**So that** I can monitor the system's usage and progress.

## Acceptance Criteria
- A dashboard or admin view shows key metrics (e.g., number of interviews, personas in draft vs. validated).
- The administrator can view lists of interviews and personas, with filtering and sorting options.
- The administrator can drill down to see details of any item.

## Detailed Implementation Notes

### UI/UX Flow
1.  **Dashboard Home:** The first page the admin sees, with a set of key performance indicator (KPI) cards.
    - **KPI Cards:** Total Interviews, Completed Personas, Validated Personas, Active Users (if tracked).
2.  **Navigation Tabs:** Clear sections for "Interviews", "Personas", and "Usage Analytics".
3.  **Interviews Tab:**
    - A list of all interviews, with columns: Expert Role, Date, Status, Interview ID.
    - **Filtering:** By role, by status (e.g., "Complete"), by date range.
    - **Drill-down:** Clicking an interview shows its full transcript and associated snapshots.
4.  **Personas Tab:**
    - A list of all personas, with columns: Role, Version, Status, Last Validated.
    - **Filtering:** By role, by status (e.g., "Draft").
    - **Drill-down:** Clicking a persona shows its full prompt text and validation history.
5.  **Usage Analytics Tab:**
    - Graphs or charts showing activity over time (e.g., interviews created per week).
    - Tables showing most active users or most queried personas.

### API Endpoints
This story primarily uses existing endpoints (`/interviews`, `/personas`) but aggregates the data for the admin view.
- **GET /admin/dashboard:** A new endpoint to pre-fetch KPI data.
    - **Success Response (200 OK):**
      ```json
      {
        "totalInterviews": 50,
        "completedPersonas": 12,
        "validatedPersonas": 8,
        "draftPersonas": 4
      }
      ```
- The other views would use `GET /interviews` and `GET /personas` with appropriate query parameters for filtering and pagination.

### Business Logic
- **Aggregation:** The dashboard must perform efficient queries (e.g., SQL `GROUP BY`, `COUNT`) to calculate KPIs without fetching all records.
- **Permissions:** The data displayed must be scoped to the administrator's permissions. A junior admin might see less than a super admin.
- **Real-time vs. Batch:** The KPIs might not need to be real-time. They could be cached and refreshed every few minutes to improve performance.

### Open Questions/Considerations
- **Data Volume:** As the system grows, how will the analytics views remain performant? Pagination, indexing, and caching will be key.
- **Custom Reports:** Should the admin be able to define and save custom report queries?
- **Exporting:** Is there a need to export the raw data behind the charts for external analysis in tools like Excel?
- **Alerting:** Should the dashboard have proactive alerts (e.g., "No new interviews have been started this week")?