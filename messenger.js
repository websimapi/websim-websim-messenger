const room = new WebsimSocket();

// Track active users and selected chat
let selectedUserId = null;
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const chatView = document.getElementById('chat-view');
const noChat = document.getElementById('no-chat');
const chatHeader = document.getElementById('chat-header');
const chatPanel = document.getElementById('chat-panel');
const usersPanel = document.getElementById('users-panel');
const backButton = document.getElementById('back-button');
const userCount = document.getElementById('user-count');
const typingIndicator = document.getElementById('typing-indicator');

let typingTimeout = null;

// Handle sending messages
async function sendMessage() {
  const content = messageInput.value.trim();
  if (!content || !selectedUserId) return;

  // Store message in database
  await room.collection('messages').create({
    to_user_id: selectedUserId,
    content: content
  });

  messageInput.value = '';
  sendButton.disabled = true;
  updateTypingStatus(false);
}

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Enable/disable send button based on input
messageInput.addEventListener('input', (e) => {
  sendButton.disabled = !e.target.value.trim();
  updateTypingStatus(true);
});

// Handle typing indicator
function updateTypingStatus(isTyping) {
  if (!selectedUserId) return;

  if (typingTimeout) {
    clearTimeout(typingTimeout);
  }

  if (isTyping) {
    room.send({
      type: 'typing',
      to_user_id: selectedUserId,
      isTyping: true
    });

    typingTimeout = setTimeout(() => {
      room.send({
        type: 'typing',
        to_user_id: selectedUserId,
        isTyping: false
      });
    }, 2000);
  } else {
    room.send({
      type: 'typing',
      to_user_id: selectedUserId,
      isTyping: false
    });
  }
}

// Handle displaying messages
function renderMessage(message, peers) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${message.username === room.party.client.username ? 'sent' : 'received'}`;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.textContent = message.content;

  const infoDiv = document.createElement('div');
  infoDiv.className = 'message-info';
  
  const timestamp = new Date(message.created_at).toLocaleTimeString();
  infoDiv.textContent = `${message.username} • ${timestamp}`;

  messageDiv.appendChild(contentDiv);
  messageDiv.appendChild(infoDiv);
  
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Handle user selection and chat display
function selectUser(userId) {
  selectedUserId = userId;
  const peer = room.party.peers[userId];
  
  if (!peer) return;

  // Update UI
  const userItems = document.querySelectorAll('.user-item');
  userItems.forEach(item => item.classList.remove('active'));
  document.querySelector(`[data-user-id="${userId}"]`)?.classList.add('active');

  // Show chat view
  noChat.style.display = 'none';
  chatView.style.display = 'flex';
  chatPanel.classList.add('active');
  usersPanel.style.display = 'none';
  
  // Update chat header
  chatHeader.innerHTML = `
    <button class="back-button" id="back-button">←</button>
    <img src="https://images.websim.ai/avatar/${peer.username}" alt="${peer.username}" />
    <h3>@${peer.username}</h3>
  `;

  // Re-attach back button listener
  document.getElementById('back-button').addEventListener('click', goBack);

  // Clear and load messages
  messagesContainer.innerHTML = '';
  messageInput.value = '';
  sendButton.disabled = true;
  loadMessages();
  messageInput.focus();
}

// Handle going back to users list on mobile
function goBack() {
  chatPanel.classList.remove('active');
  usersPanel.style.display = 'block';
  selectedUserId = null;
}

backButton.addEventListener('click', goBack);

// Render users list
function renderUsers() {
  const usersList = document.getElementById('users-list');
  const peers = Object.values(room.party.peers);
  
  // Update user count
  const peerCount = peers.length - 1; // Exclude self
  userCount.textContent = `${peerCount} online`;

  // Show empty state if no other users
  if (peerCount === 0) {
    usersList.innerHTML = '<div class="empty-state">Waiting for other users to join...</div>';
    return;
  }

  usersList.innerHTML = '';

  // Sort peers by username
  const sortedPeers = Object.entries(room.party.peers)
    .sort(([,a], [,b]) => a.username.localeCompare(b.username));

  for (const [userId, peer] of sortedPeers) {
    if (userId === room.party.client.id) continue; // Skip self

    const userItem = document.createElement('div');
    userItem.className = 'user-item';
    userItem.dataset.userId = userId;
    
    userItem.innerHTML = `
      <img class="user-avatar" src="https://images.websim.ai/avatar/${peer.username}" alt="${peer.username}" />
      <span>@${peer.username}</span>
    `;

    userItem.addEventListener('click', () => selectUser(userId));
    usersList.appendChild(userItem);
  }
}

// Load messages between current user and selected user
async function loadMessages() {
  if (!selectedUserId) return;
  
  const messages = room.collection('messages')
    .filter(msg => {
      return (msg.username === room.party.client.username && msg.to_user_id === selectedUserId) ||
             (msg.username === room.party.peers[selectedUserId].username && msg.to_user_id === room.party.client.id);
    })
    .getList();

  messages.forEach(msg => renderMessage(msg, room.party.peers));
}

// Handle typing indicators
room.onmessage = (event) => {
  const data = event.data;
  if (data.type === 'typing' && data.to_user_id === room.party.client.id) {
    if (selectedUserId === data.clientId) {
      if (data.isTyping) {
        typingIndicator.style.display = 'block';
        typingIndicator.textContent = `${data.username} is typing...`;
      } else {
        typingIndicator.style.display = 'none';
      }
    }
  }
};

// Subscribe to peers updates
room.party.subscribe(() => {
  renderUsers();
  
  // If selected user disconnected, clear chat
  if (selectedUserId && !room.party.peers[selectedUserId]) {
    selectedUserId = null;
    chatPanel.classList.remove('active');
    usersPanel.style.display = 'block';
    noChat.style.display = 'flex';
    chatView.style.display = 'none';
  }
});

// Subscribe to new messages
room.collection('messages').subscribe((messages) => {
  if (!selectedUserId) return;
  
  messagesContainer.innerHTML = '';
  const filteredMessages = messages.filter(msg => {
    return (msg.username === room.party.client.username && msg.to_user_id === selectedUserId) ||
           (msg.username === room.party.peers[selectedUserId].username && msg.to_user_id === room.party.client.id);
  });
  
  filteredMessages.forEach(msg => renderMessage(msg, room.party.peers));
});

// Handle visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    updateTypingStatus(false);
  }
});

// Initial render
renderUsers();