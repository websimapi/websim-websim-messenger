const room = new WebsimSocket();

// Track active users and selected chat
let selectedUserId = null;
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const chatView = document.getElementById('chat-view');
const noChat = document.getElementById('no-chat');
const chatHeader = document.getElementById('chat-header');

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
}

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendMessage();
  }
});

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
  
  // Update chat header
  chatHeader.innerHTML = `
    <img src="https://images.websim.ai/avatar/${peer.username}" alt="${peer.username}" />
    <h3>@${peer.username}</h3>
  `;

  // Clear and load messages
  messagesContainer.innerHTML = '';
  loadMessages();
}

// Render users list
function renderUsers() {
  const usersList = document.getElementById('users-list');
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

// Subscribe to peers updates
room.party.subscribe(() => {
  renderUsers();
  
  // If selected user disconnected, clear chat
  if (selectedUserId && !room.party.peers[selectedUserId]) {
    selectedUserId = null;
    chatView.style.display = 'none';
    noChat.style.display = 'flex';
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

// Initial render
renderUsers();