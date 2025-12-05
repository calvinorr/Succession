# User Story 5.1: Run Test Scenarios Against a Persona

## User Story
**As an** Expert or Quality Assurer  
**I want to** present a set of predefined test scenarios to a persona  
**So that** I can evaluate its accuracy, tone, and actionability.

## Acceptance Criteria
- A set of test scenarios can be loaded for a given role.
- Each scenario can be submitted to the persona.
- The persona's response is captured for evaluation.
- The evaluator can rate the response against a rubric (Accuracy, Tone, Actionability, Risk Awareness).

## Detailed Implementation Notes

### UI/UX Flow
1.  **Validation Page:** A dedicated interface for the QA process.
2.  **Persona Selection:** The evaluator selects the persona and version to be tested (e.g., "Finance Director v2").
3.  **Scenario Loading:** The system loads a set of predefined scenarios for that role. These are displayed as a list.
4.  **Execution:**
    - The evaluator clicks a "Run Scenario" button next to a scenario.
    - The scenario is sent to the Expert Advisor agent (from Epic 3) using the selected persona.
    - The persona's response is displayed in a "Response" section.
5.  **Evaluation Rubric:** Below the response, a form is presented with sliders or input fields for:
    - **Accuracy (1-5):** Does the persona's advice match what the real expert would recommend?
    - **Tone and Style (1-5):** Does the output sound like the expert?
    - **Actionability (1-5):** Is the answer concrete enough to act on?
    - **Risk Awareness (1-5):** Does the answer acknowledge relevant risks and constraints?
    - A free-text "Comments" box.
6.  **Submission:** A "Submit Evaluation" button saves the scores and comments.

### API Endpoints
- **GET /qa/scenarios/{role}:** Fetches the list of test scenarios for a given role.
    - **Success Response (200 OK):**
      ```json
      [
        {
          "scenarioId": "sc-fd-01",
          "title": "Reserves decision under uncertainty.",
          "description": "A major, unexpected cost arises..."
        }
        // ... more scenarios
      ]
      ```
- **POST /qa/run:**
    - **Request Body:**
      ```json
      {
        "personaId": "pers-xyz-789",
        "scenarioId": "sc-fd-01"
      }
      ```
    - **Success Response (201 Created):**
      ```json
      {
        "evaluationId": "eval-abc-123",
        "response": "From an FD perspective, the first step is..."
      }
      ```
- **POST /qa/evaluate:**
    - **Request Body:**
      ```json
      {
        "evaluationId": "eval-abc-123",
        "accuracy": 4,
        "tone": 5,
        "actionability": 3,
        "riskAwareness": 4,
        "comments": "Good on accuracy, but needs more specific actions."
      }
      ```

### Data Model
- **TestScenario Object:**
  ```json
  {
    "scenarioId": "string",
    "roleId": "string",
    "title": "string",
    "description": "string"
  }
  ```
- **PersonaEvaluation Object:**
  ```json
  {
    "evaluationId": "string",
    "personaId": "string",
    "scenarioId": "string",
    "response": "string", // The persona's generated response
    "scores": {
      "accuracy": "integer",
      "tone": "integer",
      "actionability": "integer",
      "riskAwareness": "integer"
    },
    "comments": "string",
    "evaluatedBy": "string",
    "createdAt": "datetime"
  }
  ```

### Business Logic
- **State Management:** The persona being evaluated should be locked or its state clearly indicated to prevent changes during the QA process.
- **Linking:** The evaluation must be linked to both the persona version and the specific scenario.
- **Aggregation:** The system must be able to average scores across multiple evaluations for a given persona to get an overall quality score.

### Open Questions/Considerations
- **Scenario Management:** Who creates and owns the test scenarios? This is likely a content management task for the business owner.
- **Blind Evaluation:** Should the evaluator know which persona they are evaluating? To avoid bias, the persona's identity could be hidden during the test.
- **Calibration Trigger:** What is the threshold for a "failed" evaluation that should trigger a mandatory calibration interview? (e.g., an average score < 3).