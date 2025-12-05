const chatContainer = document.getElementById('chat-container');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');

let interviewId = null;

// Function to start a new interview
const startInterview = async () => {
    try {
        const response = await fetch('/interviews/start', { method: 'POST' });
        const data = await response.text();
        interviewId = data.split('ID: ')[1];
        addMessage('Interviewer', 'Hello! Let\'s start the interview.');
    } catch (error) {
        console.error('Error starting interview:', error);
    }
};

// Function to send a message
const sendMessage = async () => {
    const message = messageInput.value;
    if (!message) return;

    addMessage('Expert', message);
    messageInput.value = '';

    try {
        const response = await fetch(`/interviews/${interviewId}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message }),
        });
        const data = await response.text();
        addMessage('Interviewer', data);
    } catch (error) {
        console.error('Error sending message:', error);
    }
};

// Function to add a message to the chat
const addMessage = (sender, message) => {
    const messageElement = document.createElement('div');
    messageElement.innerHTML = `<strong>${sender}:</strong> ${message}`;
    chatContainer.appendChild(messageElement);
    chatContainer.scrollTop = chatContainer.scrollHeight;
};

// Event listeners
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Start the interview when the page loads
window.onload = startInterview;