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

// Enhanced message rendering with better timestamp formatting
function renderMessage(message, peers) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${message.username === room.party.client.username ? 'sent' : 'received'}`;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.textContent = message.content;

  const infoDiv = document.createElement('div');
  infoDiv.className = 'message-info';
  
  // Format timestamp more naturally
  const messageDate = new Date(message.created_at);
  const now = new Date();
  let timestamp;

  if (messageDate.toDateString() === now.toDateString()) {
    // Today - show time only
    timestamp = messageDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } else if (messageDate.getFullYear() === now.getFullYear()) {
    // This year - show month and day
    timestamp = messageDate.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
                messageDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } else {
    // Different year - show full date
    timestamp = messageDate.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  }

  infoDiv.textContent = `${message.username} • ${timestamp}`;

  messageDiv.appendChild(contentDiv);
  messageDiv.appendChild(infoDiv);
  
  messagesContainer.appendChild(messageDiv);
  
  // Smooth scroll to bottom with a small delay to ensure content is rendered
  setTimeout(() => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }, 100);
}

// Enhanced user selection with smooth transitions
function selectUser(userId) {
  selectedUserId = userId;
  const peer = room.party.peers[userId];
  
  if (!peer) return;

  // Update UI with smooth transitions
  const userItems = document.querySelectorAll('.user-item');
  userItems.forEach(item => item.classList.remove('active'));
  document.querySelector(`[data-user-id="${userId}"]`)?.classList.add('active');

  // Show chat view with transition
  noChat.style.display = 'none';
  chatView.style.display = 'flex';
  
  // Use setTimeout to ensure the transition happens after display change
  setTimeout(() => {
    chatPanel.classList.add('active');
  }, 50);
  
  usersPanel.style.display = 'none';
  
  // Update chat header with more detailed info
  chatHeader.innerHTML = `
    <button class="back-button" id="back-button">←</button>
    <img src="https://images.websim.ai/avatar/${peer.username}" alt="${peer.username}" />
    <div>
      <h3>@${peer.username}</h3>
    </div>
  `;

  document.getElementById('back-button').addEventListener('click', goBack);

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

// Enhanced users list rendering
function renderUsers() {
  const usersList = document.getElementById('users-list');
  const peers = Object.values(room.party.peers);
  
  const peerCount = peers.length - 1;
  userCount.textContent = `${peerCount} ${peerCount === 1 ? 'user' : 'users'} online`;

  if (peerCount === 0) {
    usersList.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
        <p>Waiting for other users to join...</p>
      </div>`;
    return;
  }

  usersList.innerHTML = '';

  const sortedPeers = Object.entries(room.party.peers)
    .sort(([,a], [,b]) => a.username.localeCompare(b.username));

  for (const [userId, peer] of sortedPeers) {
    if (userId === room.party.client.id) continue;

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