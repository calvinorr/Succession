
This template can be used by the Persona Builder agent as a target structure when synthesising interview data.
EOF2

#######################################
# docs/generic/06-validation-and-evaluation.md
#######################################
cat << 'EOF2' > docs/generic/06-validation-and-evaluation.md
# Validation and Evaluation (Generic)

This document defines how to determine whether a generated persona is “good enough” to use operationally.

## Test Scenarios

For each persona, define 8–12 representative scenarios. For example:

- Finance Director:
  - Reserves decision under uncertainty.
  - Evaluating conflicting savings options.
  - Advising on politically sensitive cuts.
- Head of AP:
  - Handling a disputed invoice from a critical supplier.
  - Detecting potential fraud in a payment batch.
- Head of AR:
  - Deciding when to escalate a long-outstanding debt.
- Head of Treasury:
  - Choosing between fixed and floating borrowing in current market conditions.

These scenarios should be realistic and reflect the role’s most important decisions.

## Evaluation Rubric

For each scenario:

- **Accuracy (1–5)**  
  Does the persona’s advice match what the real expert would recommend?
- **Tone and Style (1–5)**  
  Does the output sound like the expert and reflect their communication style?
- **Actionability (1–5)**  
  Is the answer concrete enough to act on?
- **Risk Awareness (1–5)**  
  Does the answer acknowledge relevant risks and constraints?

Optionally collect free-text comments for each response.

## Process

1. Generate persona v1 from the first complete interview.
2. For each test scenario:
   - Use the Expert Advisor agent with the persona prompt.
   - Ask the scenario question.
   - Record the persona’s answer.
3. Ask the real expert to rate each answer using the rubric.
4. Aggregate scores across scenarios.

## Acceptance Criteria (Example)

A persona is considered “validated for pilot use” if:

- Average accuracy score ≥ 4 across all scenarios.
- Average tone/style score ≥ 4.
- No single response has accuracy ≤ 2 without follow-up action.
- The expert is comfortable with pilot deployment.

## Calibration Loop

If the persona fails to meet acceptance criteria:

1. Identify common gaps:
   - Missing political dimension?
   - Overly optimistic risk assumptions?
   - Incorrect tone?

2. Plan a calibration interview:
   - Focus questions specifically on the gaps.
   - Capture more examples, clarify principles.

3. Regenerate persona v2 using the additional data.

4. Re-run the evaluation on a subset or full set of scenarios.

Repeat as needed. Typically, 1–2 calibration cycles should be enough for a strong persona.
EOF2

#######################################
# docs/generic/07-implementation-notes.md
#######################################
cat << 'EOF2' > docs/generic/07-implementation-notes.md
# Implementation Notes (Generic Web App)

This document provides practical guidance for implementing the generic architecture in code.

## Model Choice

You can use any capable LLM; options include:

- A Microsoft Copilot endpoint (if available outside M365 context).
- Gemini Flash or similar models in your local environment.
- Another provider with good instruction-following.

Key requirements:

- Handles multi-turn conversations reliably.
- Can follow structured prompts for extraction (Note-Taker).
- Can generate long-form persona text.

## Prompt Design

- Keep system prompts concise but explicit about role and objectives.
- Use separate prompts for Interviewer, Note-Taker, Persona Builder, Expert Advisor.
- Consider including examples in the Note-Taker and Persona Builder prompts to stabilise output.

## Storage Strategy

For a prototype:

- Use JSON files or SQLite to store:
  - Transcripts.
  - Note snapshots.
  - Personas.
  - Feedback.

Aim for a simple DAL so you can swap storage later without changing the core logic.

## API Layer

Design a minimal API:

- POST /interviews/start
- POST /interviews/{id}/message
- POST /interviews/{id}/note-snapshot
- POST /personas/build
- GET /personas/{id}
- POST /personas/{id}/advise
- POST /personas/{id}/feedback

Keep it simple and aligned with the data structures defined elsewhere.

## Front-End Considerations

- A basic UI is sufficient:
  - Chat-like interface for interviews.
  - Admin view to see transcripts and snapshots.
  - Persona preview view.
  - Test scenario runner for validation.

- You can iterate later with nicer UX; prioritise correctness and traceability first.

## Portability

The generic design is intended to be portable:

- To M365: by replacing the LLM orchestration with Copilot Studio agents and storage with SharePoint.
- To other stacks: by swapping the LLM backend and storage, keeping the same data shapes and flows.

Keep the markdown docs as the single source of truth; automate as much of the implementation from them as feasible.
EOF2

#######################################
# docs/m365-sharepoint/00-index.md
#######################################
cat << 'EOF2' > docs/m365-sharepoint/00-index.md
# M365 + SharePoint Track – Overview

This folder describes how to implement the expert interview and persona system in an organisation that:

- Has Microsoft 365 and Copilot Studio.
- Can use SharePoint Lists and Power Automate.
- Does not have Dataverse available.

The goal is to adapt the generic architecture to M365 primitives and stay within constraints.

## Key Differences from Generic Track

- **Agents**: Implemented as Copilot Studio agents instead of direct LLM calls.
- **Storage**: Uses SharePoint Lists and document libraries instead of Dataverse or a custom database.
- **Automation**: Power Automate flows orchestrate agent calls and data movement where possible.
- **Exposure**: Expert Advisor personas surfaced in Teams, SharePoint, or Copilot experiences.

## Documents in This Track

1. `01-data-model-sharepoint.md` – SharePoint lists and document libraries design.
2. `02-agents-and-orchestration.md` – Copilot Studio agent roles and how they interact.
3. `03-workflows-and-automation.md` – Power Automate flows and integration logic.
4. `04-deployment-and-governance.md` – security, roles, and change control.
5. `05-finance-roles-patterns.md` – patterns for applying the system to Finance Director, Head of AP/AR, and Head of Treasury.

Use this track when planning an implementation in your workplace environment.
EOF2

#######################################
# docs/m365-sharepoint/01-data-model-sharepoint.md
#######################################
cat << 'EOF2' > docs/m365-sharepoint/01-data-model-sharepoint.md
# Data Model – SharePoint

This document defines how to represent the system’s data using SharePoint Lists and document libraries instead of Dataverse.

## Lists Overview

Use three primary lists:

1. **Interviews**
2. **KnowledgeSnapshots**
3. **PersonaVersions**

Optionally, a fourth list for feedback:

4. **PersonaFeedback**

You can add role-specific views (Finance Director, Head of AP, etc.) using filters.

## Interviews List

Purpose: Track each expert interview session.

Suggested columns:

- `Title` (Single line of text) – e.g. "FD Interview 2025-01-15".
- `ExpertRole` (Choice) – "Finance Director", "Head of AP", "Head of AR", "Head of Treasury".
- `Date` (Date and Time).
- `Phase` (Choice) – "Warm-Up", "Core Frameworks", "Cases", "Meta", "Complete".
- `TranscriptUrl` (Hyperlink) – link to transcript stored in a document library (e.g. a .txt or .md file).
- `Status` (Choice) – "Draft", "Complete", "Archived".
- `CreatedBy`, `ModifiedBy` – standard SharePoint fields.

## KnowledgeSnapshots List

Purpose: Store structured Note-Taker outputs.

Suggested columns:

- `Title` – e.g. "FD Snapshot 5".
- `Interview` (Lookup to Interviews).
- `Phase` (Choice) – same as Interview.
- `SnapshotJson` (Multiple lines of text) – JSON text from Note-Taker.
- `TopicsCovered` (Multiple lines of text) – human-readable summary.
- `CoverageGaps` (Multiple lines of text).
- `SuggestedNextProbe` (Multiple lines of text).
- `Created`, `CreatedBy` – standard.

## PersonaVersions List

Purpose: Track persona prompt versions per role.

Suggested columns:

- `Title` – e.g. "FD Persona v1".
- `Role` (Choice) – same as ExpertRole.
- `Version` (Number) – 1, 2, 3, ...
- `PromptText` (Multiple lines of text) – the full persona prompt.
- `Status` (Choice) – "Draft", "Validated", "Deprecated".
- `LastValidatedBy` (Person).
- `LastValidatedAt` (Date and Time).

## PersonaFeedback List (Optional)

Purpose: Store expert feedback on persona answers to test scenarios.

Suggested columns:

- `Title` – e.g. "FD Scenario 3 Feedback".
- `PersonaVersion` (Lookup to PersonaVersions).
- `ScenarioDescription` (Multiple lines of text).
- `RatingAccuracy` (Number, 1–5).
- `RatingTone` (Number, 1–5).
- `RatingActionability` (Number, 1–5).
- `Comments` (Multiple lines of text).
- `CreatedBy`, `Created`.

## Transcripts and Documents

Due to size limits and usability, store long transcripts and artifacts in a document library:

- Library: `ExpertInterviews`
- Folder per role, e.g.:
  - `FinanceDirector/`
  - `HeadOfAP/`
  - `HeadOfAR/`
  - `HeadOfTreasury/`

Files:

- `FD-Interview-2025-01-15-transcript.md`
- `FD-Interview-2025-01-15-notes.md`

Link these files from the `Interviews` list via `TranscriptUrl` and other hyperlink fields.

## List Limits and Considerations

SharePoint List considerations:

- Item count can be large, but indexing and views matter for performance.
- Complex filtering and joins are more limited than in a database.
- JSON text fields are fine for this use case, but you may want to:
  - Keep JSON relatively small per item.
  - Break very long snapshots into multiple items if necessary.

Design for:

- Modest scale (dozens to hundreds of interviews and snapshots).
- Simple views (filtered by role, date, status).
- Clear naming conventions for files and items.
EOF2

#######################################
# docs/m365-sharepoint/02-agents-and-orchestration.md
#######################################
cat << 'EOF2' > docs/m365-sharepoint/02-agents-and-orchestration.md
# Agents and Orchestration – Copilot Studio + SharePoint

This document outlines how to implement the agent roles and orchestration in Microsoft Copilot Studio, using SharePoint Lists as storage.

## Agent Roles

Implement four main agents:

1. **Interviewer Agent**
2. **Note-Taker Agent**
3. **Persona Builder Agent**
4. **Expert Advisor Agent**

### Interviewer Agent

- Exposed to experts via Copilot Chat, Teams, or a web embed.
- Role:
  - Conduct interviews.
  - Track phase (Warm-Up, Core Frameworks, Cases, Meta).
  - Save transcripts to a document library.
  - Create or update `Interviews` list items.

- Behaviour:
  - Uses a role-specific system message.
  - At logical points (e.g. every 5–10 turns), calls the Note-Taker Agent with transcript segments.
  - Updates the `Phase` and `Status` in the `Interviews` list.

### Note-Taker Agent

- Not directly exposed to end users.
- Called by Interviewer Agent as a “tool” or via a Copilot Studio plugin action pattern.
- Input:
  - Transcript excerpt.
  - Current phase.
  - Basic metadata (role, interview ID).
- Output:
  - JSON summarising new insights and coverage status.

- Storage:
  - Writes a new item in `KnowledgeSnapshots` list with the JSON and summaries.

### Persona Builder Agent

- Triggered when an interview is marked as `Complete`.
- Input:
  - All `KnowledgeSnapshots` for an interview (queried from SharePoint).
  - Optionally, the transcript file from the document library.
- Output:
  - First-person persona prompt for that role and interview.
  - Metadata about domains covered.
- Storage:
  - Writes a new item to `PersonaVersions` with `PromptText`, `Role`, `Version`, and `Status = Draft`.

### Expert Advisor Agent

- Exposed to finance staff via Copilot Chat, Teams, or SharePoint.
- System message:
  - Uses the latest `Validated` persona version for the requested role (Finance Director, Head of AP, etc.).
- Behaviour:
  - Answers questions and scenarios using the persona prompt.
  - Optionally logs interactions for future analysis.

## Orchestration Pattern

Use Copilot Studio’s capabilities:

- Parent agent orchestrates calls to child agents.
- SharePoint connector is used to:
  - Query and update `Interviews`, `KnowledgeSnapshots`, and `PersonaVersions`.
  - Fetch or upload files in the `ExpertInterviews` document library.

High-level flow:

1. Expert starts a conversation with Interviewer Agent.
2. Interviewer creates an `Interviews` item if needed.
3. As conversation progresses:
   - Transcript is appended to a local variable.
   - Periodically, Interviewer:
     - Saves a transcript chunk to file.
     - Calls Note-Taker Agent with the chunk.
     - Note-Taker writes a `KnowledgeSnapshots` item.
4. When expert and interviewer agree the session is complete:
   - Interviewer sets `Phase = Complete`, `Status = Complete` on the `Interviews` item.
   - Persona Builder Agent is triggered (via Power Automate or explicit call).
5. Persona Builder:
   - Reads all snapshots for the interview.
   - Generates a persona prompt.
   - Writes to `PersonaVersions`.
6. Expert validates persona via a separate process; once approved, persona status becomes `Validated` and is used by Expert Advisor Agent.

This pattern stays inside the M365 ecosystem and avoids Dataverse, using SharePoint Lists as the main persistence mechanism.
EOF2

#######################################
# docs/m365-sharepoint/03-workflows-and-automation.md
#######################################
cat << 'EOF2' > docs/m365-sharepoint/03-workflows-and-automation.md
# Workflows and Automation – Power Automate

This document describes how to glue the Copilot Studio agents and SharePoint Lists together using Power Automate.

## Key Flows

### Flow 1 – On Interview Start

Trigger:
- Manual trigger, or a message from the Interviewer Agent.

Actions:

1. Create a new item in `Interviews` list:
   - Set `Title`, `ExpertRole`, `Date`, `Phase = Warm-Up`, `Status = Draft`.
2. Optionally create a transcript file in `ExpertInterviews` library and store link in `TranscriptUrl`.

Outcome:
- An interview session ID/datapoint that the Interviewer Agent can reference.

### Flow 2 – Periodic Snapshot

Trigger:
- Explicit call from Interviewer Agent (e.g. after N turns) or scheduled.

Actions:

1. Take the latest transcript chunk (passed from the agent).
2. Call Note-Taker Agent with:
   - Transcript excerpt.
   - Role and interview metadata.
3. Parse Note-Taker output.
4. Create a new `KnowledgeSnapshots` item with:
   - `Interview` lookup.
   - `Phase`.
   - `SnapshotJson`.
   - `TopicsCovered`.
   - `CoverageGaps`.
   - `SuggestedNextProbe`.

Outcome:
- Accumulated structured insight linked to the interview.

### Flow 3 – Persona Build Trigger

Trigger:
- A change in the `Interviews` list where:
  - `Status` is set to `Complete`.
  - Or a manual “Build Persona” button (Power Apps or manual flow trigger).

Actions:

1. Get the relevant `Interviews` item and all related `KnowledgeSnapshots`.
2. Call Persona Builder Agent with:
   - JSON list of snapshots.
   - Optional reference to transcript file.
3. Create a `PersonaVersions` item:
   - `Role`.
   - `Version` (incremented per role).
   - `PromptText`.
   - `Status = Draft`.

Outcome:
- A draft persona prompt stored and ready for expert review.

### Flow 4 – Persona Validation

Trigger:
- Expert completes a validation form (e.g. Microsoft Forms) or a custom Power Apps screen.
- Or manual update of `PersonaVersions` `Status` to `Validated`.

Actions:

1. If the expert approves:
   - Set `Status = Validated`.
   - Update `LastValidatedBy` and `LastValidatedAt`.
2. If rejected or partial approval:
   - Store feedback in `PersonaFeedback`.
   - Trigger a follow-up interview request (e.g. send email or Teams message).

Outcome:
- Controlled elevation of persona versions into production use.

## Implementation Notes

- Keep flows simple and modular.
- Avoid large payloads directly in flow variables; store text in files or list fields and pass references where possible.
- Use environment variables or configuration lists to manage:
  - Role names.
  - Versioning rules.
  - Persona selection logic for Expert Advisor Agent.

This setup provides a low-code orchestration framework entirely within the M365 ecosystem.
EOF2

#######################################
# docs/m365-sharepoint/04-deployment-and-governance.md
#######################################
cat << 'EOF2' > docs/m365-sharepoint/04-deployment-and-governance.md
# Deployment and Governance – M365

This document covers environment, security, and change management considerations for deploying the system in a Microsoft 365 context.

## Environments

Recommended environments:

- **Dev**: For experimenting with Copilot Studio agents and flows.
- **Test**: For running interviews and validation with a small group.
- **Prod**: For live Expert Advisor usage by the finance team.

Use separate SharePoint sites or libraries per environment, or clearly separate lists and libraries with naming conventions.

## Security and Access

- Create a dedicated M365 security group for Finance personas (e.g. `FinancePersonaUsers`).
- Grant:
  - Read access to `PersonaVersions` for all members.
  - Edit access only to:
    - Finance leadership.
    - System owner.
- Restrict access to `Interviews` and `KnowledgeSnapshots` to:
  - Interviewers.
  - Relevant experts.
  - System owner.

Ensure that Copilot Studio agents run with appropriate permissions or via service accounts, using the principle of least privilege.

## Data Sensitivity

Treat all interview content and personas as internal confidential:

- Apply sensitivity labels if your organisation uses them.
- Avoid including personally identifiable information unrelated to the expert’s professional role.
- Document the processing purpose (succession planning and decision support).

## Change Management

- Define owners:
  - Business owner: e.g. Head of Finance.
  - Technical owner: IT / Digital team member.
- Persona changes:
  - Any change to a persona prompt requires:
    - Updated version in `PersonaVersions`.
    - Expert review and approval.
- Periodic review:
  - At least annually, review each persona:
    - Revalidate assumptions.
    - Update for new regulations, policies, or organisational changes.

## Training and Adoption

- Train experts on:
  - How interviews work.
  - How their persona will be used.
- Train users on:
  - The Expert Advisor Agent’s scope and limitations.
  - When to escalate to a human expert.
- Provide simple guidance pages in SharePoint or Teams pointing to:
  - What the system is.
  - How to access it.
  - Who to contact for issues.

Clear governance ensures the system is trusted and sustainable, not a one-off experiment.
EOF2

#######################################
# docs/m365-sharepoint/05-finance-roles-patterns.md
#######################################
cat << 'EOF2' > docs/m365-sharepoint/05-finance-roles-patterns.md
# Finance Roles Patterns – M365

This document describes how to apply the succession pattern to multiple finance roles using Copilot Studio and SharePoint, focusing on:

- Finance Director (FD)
- Head of Accounts Payable (Head of AP)
- Head of Accounts Receivable (Head of AR)
- Head of Treasury

## Shared Pattern

For each role:

1. Configure Interviewer Agent with a role-specific prompt and question set.
2. Use the same Note-Taker and Persona Builder patterns.
3. Maintain separate persona versions per role in `PersonaVersions`.
4. Provide either:
   - A separate Expert Advisor Agent per role, or
   - A single “Finance Expert” Agent that routes internally based on selected role.

## Finance Director

- Use the same domains and interview structures as in the generic track:
  - MTFS, reserves, savings, capital, political environment.
- In SharePoint:
  - Create views filtered on `ExpertRole = Finance Director`.
  - Use naming conventions like "FD Interview – [date]" for `Interviews` items.

## Head of Accounts Payable (Head of AP)

### Interview Focus

- How they manage invoice flows and payment timing.
- Approaches to fraud detection and process controls.
- Handling critical suppliers vs non-critical.
- Philosophy on automation vs manual oversight.

### Persona Outcomes

- The AP persona should help staff:
  - Decide when to pay, hold, or escalate invoices.
  - Apply controls consistently.
  - Prioritise limited attention on highest-risk items.

## Head of Accounts Receivable (Head of AR)

### Interview Focus

- How they prioritise collections.
- Approaches to disputes and customer relationships.
- Escalation thresholds and write-off decisions.

### Persona Outcomes

- The AR persona should help staff:
  - Decide how to handle overdue accounts.
  - Balance recovery against customer relationships.
  - Apply write-off policies consistently.

## Head of Treasury

### Interview Focus

- Daily liquidity and cash visibility.
- Investment policy and instruments.
- Borrowing strategy and risk management.
- Relationships with banks and financial markets.

### Persona Outcomes

- The Treasury persona should help staff:
  - Make daily cash decisions.
  - Understand the impact of different borrowing or investment options.
  - Keep within agreed risk and policy limits.

## Expert Advisor Exposure

Options:

- **Per-role Agents**:
  - “Ask the Finance Director Persona”
  - “Ask the AP Persona”
  - etc.
- **Unified Agent**:
  - Single “Finance Expert” Copilot agent:
    - First asks: “Which role’s perspective do you want: FD, AP, AR, or Treasury?”
    - Then applies the corresponding persona from `PersonaVersions`.

In both cases, the underlying storage and patterns remain the same; only the agent prompts and routing differ.

This makes the succession pattern reusable across the finance department within the M365 and SharePoint constraints.
EOF2

# Add and commit
git add README.md docs
git commit -m "Add initial documentation structure and content for Succession project"
echo "Created branch $BRANCH with initial docs. Next steps:"
echo "  git push -u origin $BRANCH"
echo "Then open a PR on GitHub."
EOF

chmod +x generate-docs.sh

echo "Script generate-docs.sh created. Run it inside the repo with: ./generate-docs.sh"
EOF

3. Make the script executable and run it:

