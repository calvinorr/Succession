# User Story 5.2: Collect and Aggregate Feedback

## User Story
**As a** Project Manager  
**I want to** aggregate feedback from persona evaluations  
**So that** I can identify common gaps and plan calibration interviews.

## Acceptance Criteria
- Feedback scores are stored and linked to a persona version.
- An interface allows viewing aggregated scores and comments for a persona.
- The system can highlight personas or scenarios that consistently score low.

## Detailed Implementation Notes

### UI/UX Flow
1.  **QA Analytics Page:** A section within the admin panel dedicated to viewing the results of the QA process.
2.  **Persona-Centric View:** The primary view shows a list of personas that have undergone evaluation.
3.  **Drill-Down:** Selecting a persona shows a detailed report:
    - **Overall Score:** An average of all rubric scores.
    - **Scenario Breakdown:** A table listing each scenario tested against the persona, with individual scores for Accuracy, Tone, etc.
    - **Comments Section:** A compilation of all free-text feedback provided by evaluators.
4.  **Highlighting:**
    - **Low-Scoring Personas:** Personas with an average score below a certain threshold (e.g., 3.5) are flagged in red.
    - **Problem Scenarios:** Scenarios that consistently receive low scores across *all* personas are highlighted, indicating the scenario itself might be flawed or too ambiguous.

### API Endpoint
- **GET /qa/analytics/personas/{id}:**
    - **Success Response (200 OK):**
      ```json
      {
        "personaId": "pers-xyz-789",
        "version": 2,
        "totalEvaluations": 5,
        "averageScores": {
          "accuracy": 4.2,
          "tone": 4.0,
          "actionability": 3.8,
          "riskAwareness": 4.4
        },
        "scenarioEvaluations": [
          {
            "scenarioId": "sc-fd-01",
            "title": "Reserves decision...",
            "scores": { /* ... */ }
          }
          // ... other evaluated scenarios
        ],
        "allComments": [
          "Good on accuracy, but needs more specific actions.",
          "The tone is a bit too formal, needs to be more approachable."
        ]
      }
      ```
- **GET /qa/analytics/scenarios/{id}:** (Optional) An endpoint to see how a specific scenario performed across all personas.
    - **Success Response (200 OK):**
      ```json
      {
        "scenarioId": "sc-fd-01",
        "averageScores": { /* ... */ },
        "numberOfEvaluations": 15,
        "personasTested": 3
      }
      ```

### Data Model
- This story primarily reads from the `PersonaEvaluation` objects created in Story 5.1 and aggregates the data.

### Business Logic
- **Aggregation Logic:** The system must correctly calculate average scores, weighting all evaluations equally unless specified otherwise.
- **Flagging:** The logic for highlighting low-performing personas or scenarios must be configurable (e.g., the threshold for "low" can be an admin setting).
- **Data Linking:** The aggregated view must clearly link back to the source evaluation records for transparency and drill-down capability.

### Open Questions/Considerations
- **Actionable Insights:** Beyond just showing data, can the system provide suggestions? (e.g., "Persona 'Finance Director v2' has low actionability scores. Consider a calibration interview focusing on decision-making frameworks.")
- **Trend Analysis:** Can the system show how a persona's scores have changed over its different versions (e.g., a chart showing v1 vs. v2 scores)?
- **Evaluator Consistency:** Should the system track who performed each evaluation to check for evaluator bias? (e.g., does one evaluator consistently score lower than others?)
- **Exporting:** The ability to export the full analytics data (e.g., to CSV for a PowerPoint report) is likely a key requirement for a Project Manager.