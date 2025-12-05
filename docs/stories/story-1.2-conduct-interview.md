# User Story 1.2: Conduct a Multi-Turn Interview

## User Story
**As an** Expert  
**I want to** exchange messages with an Interviewer agent within a session  
**So that** I can provide my knowledge and experience in a conversational manner.

## Acceptance Criteria
- The expert can type and send messages.
- The Interviewer agent can respond with questions.
- The full transcript of the conversation is preserved in order.
- The UI clearly distinguishes between the expert's and the agent's messages.

## Detailed Implementation Notes

### UI/UX Flow
1.  **Chat Interface:** A split-screen or single-thread view where messages are displayed chronologically.
2.  **Input Field:** A text box for the expert to type their response.
3.  **Message Display:**
    - Expert's messages are aligned to the right.
    - Interviewer's messages are aligned to the left.
    - Each message shows a timestamp and sender name ("Expert" or "Interviewer").
4.  **Real-time Updates:** The interface should feel instantaneous, using WebSockets or a similar technology for live updates without needing a full page refresh.

### API Endpoint
- **Endpoint:** `POST /interviews/{id}/message`
- **Request Body:**
  ```json
  {
    "sender": "Expert", // or "Interviewer"
    "message": "This is my response to the previous question."
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "status": "Message received"
  }
  ```
- **Error Response (404 Not Found):**
  ```json
  {
    "error": "Interview session not found."
  }
  ```

### Data Model
- **Message Object (within Interview's transcript array):**
  ```json
  {
    "sender": "string", // "Expert" or "Interviewer"
    "message": "string",
    "timestamp": "datetime"
  }
  ```

### Business Logic
- **State Persistence:** Every message (from either party) is appended to the `transcript` array in the interview object and persisted to the data store immediately.
- **Agent Interaction:** When the Expert sends a message, the system might need to trigger the Interviewer agent to generate a response. This could be a synchronous or asynchronous process.
    - **Synchronous:** The API call for sending a message blocks until the agent's response is generated and then returns both the expert's and agent's messages.
    - **Asynchronous:** The API call returns immediately after storing the expert's message. A separate process generates the agent's response, which is then pushed to the client via a WebSocket.
- **Turn Management:** The system should be aware of conversational turns to potentially trigger other events (like knowledge snapshots, as per Story 1.3).

### Open Questions/Considerations
- **Agent's "Thinking" Indicator:** Should the UI show an indicator (e.g., "Interviewer is typing...") while the agent is generating a response? This improves UX.
- **Message History:** How much of the conversation history should be sent to the Interviewer agent with each turn to maintain context? The full transcript is the safest bet.
- **Error Handling:** What happens if the agent fails to generate a response? The UI should display a user-friendly error message and allow the expert to try again or continue.