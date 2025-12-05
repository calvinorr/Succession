# Epic 1: Expert Interview Management

## Goal
To enable the capture of expert knowledge through structured interviews.

## Description
This epic covers all functionalities required to set up and conduct interviews with domain experts. It includes starting new interview sessions, managing the conversational flow between the expert and an AI Interviewer agent, and automatically capturing structured data snapshots during the conversation. These snapshots are crucial as they form the primary data source for persona generation in a later epic.

The core idea is to create a seamless, conversational experience for the expert, while the system works in the background to extract, structure, and store key pieces of information. This process ensures that the expert's tacit knowledge, decision-making frameworks, and communication style are captured effectively.

## User Stories Included
- **User Story 1.1:** Start a New Interview
- **User Story 1.2:** Conduct a Multi-Turn Interview
- **User Story 1.3:** Capture Periodic Knowledge Snapshots

## Out of Scope
- The actual AI logic for the Interviewer or Note-Taker agents (this is covered in other epics/implementation details).
- Persona generation from the captured data (covered in Epic 2).
- UI/UX design specifics beyond functional requirements.
- Authentication and authorization of users.

## Technical Considerations
- **State Management:** The system must manage the state of each interview (e.g., Warm-Up, Core Frameworks, Cases, Meta, Complete).
- **Real-time Communication:** The interview interface should support real-time, bi-directional communication.
- **Scalability:** The snapshot mechanism should be efficient and not degrade the interview experience.
- **Data Integrity:** The transcript must be an accurate, chronological log of the entire conversation.