const chatContainer = document.getElementById('chat-container');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const roleSelect = document.getElementById('role-select');
const startButton = document.getElementById('start-button');
const startSection = document.getElementById('start-section');
const chatSection = document.getElementById('chat-section');
const roleDisplay = document.getElementById('role-display');
const phaseDisplay = document.getElementById('phase-display');

let interviewId = null;
let isLoading = false;

// Function to set loading state
const setLoading = (loading) => {
    isLoading = loading;
    messageInput.disabled = loading;
    sendButton.disabled = loading;
    sendButton.innerHTML = loading
        ? '<span class="material-symbols-outlined text-[18px] animate-spin">progress_activity</span> Sending...'
        : '<span class="material-symbols-outlined text-[18px]">send</span> Send';
};

// Function to start a new interview
const startInterview = async () => {
    const role = roleSelect.value;
    if (!role) {
        alert('Please select an expert role');
        return;
    }

    try {
        const response = await fetch('/interviews/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role }),
        });

        if (!response.ok) {
            const error = await response.json();
            alert(error.error);
            return;
        }

        const interview = await response.json();
        interviewId = interview.id;

        // Show chat section, hide start section
        startSection.classList.add('hidden');
        chatSection.classList.remove('hidden');
        roleDisplay.textContent = interview.role || 'Expert Interview';
        if (phaseDisplay) phaseDisplay.textContent = `Phase: ${interview.phase}`;

        addMessage('System', `Interview started for ${interview.role || 'expert'}. The AI interviewer will guide you through capturing expert knowledge.`);
    } catch (error) {
        console.error('Error starting interview:', error);
        alert('Failed to start interview');
    }
};

// Function to send a message
const sendMessage = async () => {
    const message = messageInput.value.trim();
    if (!message || !interviewId || isLoading) return;

    addMessage('Expert', message);
    messageInput.value = '';
    setLoading(true);

    try {
        const response = await fetch(`/interviews/${interviewId}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message }),
        });

        if (!response.ok) {
            const error = await response.json();
            addMessage('System', `Error: ${error.error || 'Failed to send message'}`);
            return;
        }

        const data = await response.json();
        addMessage('Interviewer', data.response);
    } catch (error) {
        console.error('Error sending message:', error);
        addMessage('System', 'Error: Unable to reach server. Please try again.');
    } finally {
        setLoading(false);
        messageInput.focus();
    }
};

// Function to add a message to the chat
const addMessage = (sender, message) => {
    const messageElement = document.createElement('div');

    // Style based on sender type
    const baseClasses = 'p-4 rounded-xl max-w-3xl';
    let senderClasses = '';
    let icon = '';

    switch (sender.toLowerCase()) {
        case 'expert':
            senderClasses = 'bg-brand-50 border border-brand-100 ml-auto';
            icon = '<span class="material-symbols-outlined text-brand-500 text-[18px]">person</span>';
            break;
        case 'interviewer':
            senderClasses = 'bg-surface-0 border border-surface-200 shadow-sm';
            icon = '<span class="material-symbols-outlined text-emerald-500 text-[18px]">smart_toy</span>';
            break;
        case 'system':
            senderClasses = 'bg-amber-50 border border-amber-200 mx-auto text-center';
            icon = '<span class="material-symbols-outlined text-amber-500 text-[18px]">info</span>';
            break;
        default:
            senderClasses = 'bg-surface-100';
    }

    messageElement.className = `${baseClasses} ${senderClasses}`;
    messageElement.innerHTML = `
        <div class="flex items-start gap-3">
            <div class="flex-shrink-0 mt-0.5">${icon}</div>
            <div class="flex-1 min-w-0">
                <p class="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1">${sender}</p>
                <p class="text-surface-700 leading-relaxed whitespace-pre-wrap">${message}</p>
            </div>
        </div>
    `;

    chatContainer.appendChild(messageElement);
    chatContainer.scrollTop = chatContainer.scrollHeight;
};

// Event listeners
startButton.addEventListener('click', startInterview);
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});
