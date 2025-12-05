# Future Epics: M365 & SharePoint Track

This document outlines the epics and user stories for implementing the Succession Planning system within the Microsoft 365 ecosystem, as detailed in the PRD. This track is an alternative to the generic web application, leveraging Copilot Studio, SharePoint, and Power Automate.

---

## Epic 6: M365 Integration with Copilot Studio

**Goal:** To implement the core agent logic using Microsoft Copilot Studio.

### User Stories
- **User Story 6.1:** Implement agents as Copilot Studio agents.
- **User Story 6.2:** Orchestrate agent calls within the M365 environment.

**Implementation Notes:**
- This involves re-architecting the agent orchestration layer from direct LLM calls to invoking Copilot Studio topics.
- The Interviewer, Note-Taker, Persona Builder, and Expert Advisor agents will be defined as separate Copilot Studio topics.
- The system's backend (e.g., Power Automate) will be responsible for calling these topics in the correct sequence and passing data between them.

---

## Epic 7: SharePoint-Based Data Storage

**Goal:** To replace the generic JSON file storage with SharePoint Lists and Document Libraries.

### User Stories
- **User Story 7.1:** Replace JSON file storage with SharePoint Lists.
- **User Story 7.2:** Store transcripts and documents in SharePoint Document Libraries.

**Implementation Notes:**
- **Data Model Mapping:** The `Interviews`, `KnowledgeSnapshots`, and `PersonaVersions` lists will be created in a dedicated SharePoint site.
- **Columns:** The list columns will mirror the fields of the JSON objects (e.g., `Title`, `ExpertRole`, `Phase`, `SnapshotJson`, `PromptText`).
- **Document Libraries:** Long-form content like interview transcripts will be stored as `.md` or `.txt` files in a library like `ExpertInterviews`.
- **Connector:** The backend logic will use the SharePoint connector (in Power Automate or a custom Azure Function) to perform CRUD operations on these lists and libraries.

---

## Epic 8: Power Automate Workflows

**Goal:** To glue the Copilot Studio agents and SharePoint Lists together using Power Automate.

### User Stories
- **User Story 8.1:** Automate interview start and snapshot creation with Power Automate.
- **User Story 8.2:** Create a workflow for persona validation and status updates.

**Implementation Notes:**
- **Flow 1 (Interview Start):** Triggered manually or on a schedule, this flow creates a new item in the `Interviews` SharePoint list and might send an initial Teams message to the expert.
- **Flow 2 (Periodic Snapshot):** Triggered by a timer or when a new message is added to an interview transcript, this flow calls the Note-Taker Copilot Studio agent and writes the output to the `KnowledgeSnapshots` list.
- **Flow 3 (Persona Validation):** Triggered when an expert submits the validation form, this flow updates the `Status` of the corresponding item in the `PersonaVersions` list to "Validated".

---

## Epic 9: Deployment and Governance in M365

**Goal:** To set up environments, security, and change management for the M365 solution.

### User Stories
- **User Story 9.1:** Set up Dev, Test, and Prod environments.
- **User Story 9.2:** Configure security groups and access permissions.
- **User Story 9.3:** Implement change management and periodic review processes.

**Implementation Notes:**
- **Environments:** Separate SharePoint sites or hubs will be used for Dev, Test, and Prod to ensure proper isolation.
- **Security:** M365 Security Groups will be used to grant permissions. For example, `FinancePersonaUsers` group gets read access to `PersonaVersions`, while `FinancePersonaAdmins` gets full control.
- **Governance:** A formal process will be documented, outlining how changes to Copilot Studio agents or SharePoint list structures are approved and deployed. This includes a periodic review of all personas for accuracy and relevance.