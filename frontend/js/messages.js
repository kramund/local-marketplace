// ─────────────────────────────────────────────────────────────
// MESSAGES.JS — Inbox & Chat
// ─────────────────────────────────────────────────────────────

const API      = '/api';
const getToken = () => localStorage.getItem('lm_token');
const getUser  = () => JSON.parse(localStorage.getItem('lm_user') || 'null');
const isLoggedIn = () => !!getToken();

const authHeaders = () => ({
  'Authorization': `Bearer ${getToken()}`,
  'Content-Type':  'application/json',
});

// ─── Helpers ─────────────────────────────────────────────────
const timeAgo = (dateStr) => {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};

const formatTime = (dateStr) => new Date(dateStr).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });

const formatPrice = (price) => {
  if (!price) return '';
  return '₱' + parseFloat(price).toLocaleString('en-PH', { minimumFractionDigits: 2 });
};

const initials = (name) => (name || '?').charAt(0).toUpperCase();

// ─── Auth Guard ──────────────────────────────────────────────
if (!isLoggedIn()) window.location.href = '/pages/login.html';
const currentUser = getUser();

// ─── Messages Page ───────────────────────────────────────────
const convListEl = document.getElementById('conv-list');
const chatPanelEl = document.getElementById('chat-panel');

if (convListEl) {
  let activeConvId = null;
  let pollInterval = null;

  // Check for ?conv= in URL to auto-open a conversation
  const urlParams   = new URLSearchParams(window.location.search);
  const openConvId  = urlParams.get('conv');

  // ─── Load Conversations ──────────────────────────────────
  const loadConversations = async (autoOpenId = null) => {
    try {
      const res  = await fetch(`${API}/messages/conversations`, { headers: authHeaders() });
      const data = await res.json();
      const convs = data.conversations || [];

      // Unread badge
      const totalUnread = convs.reduce((sum, c) => sum + parseInt(c.unread_count || 0), 0);
      const badge = document.getElementById('unread-badge');
      if (totalUnread > 0) {
        badge.textContent = totalUnread;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }

      if (convs.length === 0) {
        convListEl.innerHTML = `
          <div class="conv-empty">
            <div class="ce-icon">💬</div>
            <p>No conversations yet.<br/>Message a seller from any listing!</p>
          </div>`;
        return;
      }

      convListEl.innerHTML = convs.map(c => {
        const isMe    = c.buyer_id === currentUser.id;
        const other   = isMe ? { id: c.seller_id, username: c.seller_username, photo: c.seller_photo }
                              : { id: c.buyer_id,  username: c.buyer_username,  photo: c.buyer_photo  };
        const unread  = parseInt(c.unread_count || 0) > 0;
        const preview = c.last_message || 'No messages yet';

        return `
          <div class="conv-item ${unread ? 'unread' : ''} ${activeConvId == c.id ? 'active' : ''}"
               data-conv-id="${c.id}" onclick="openConversation(${c.id})">
            <div class="conv-avatar">
              ${other.photo ? `<img src="${other.photo}" alt="${other.username}"/>` : initials(other.username)}
            </div>
            <div class="conv-body">
              <div class="conv-name">${other.username}</div>
              <div class="conv-listing">📦 ${c.listing_title}</div>
              <div class="conv-preview ${unread ? 'unread-preview' : ''}">${preview.length > 50 ? preview.slice(0, 50) + '…' : preview}</div>
            </div>
            <div class="conv-meta">
              <span class="conv-time">${c.last_message_at ? timeAgo(c.last_message_at) : ''}</span>
              ${unread ? '<div class="unread-dot"></div>' : ''}
            </div>
          </div>`;
      }).join('');

      // Auto-open conversation from URL param
      if (autoOpenId) {
        openConversation(autoOpenId);
      }
    } catch (err) {
      convListEl.innerHTML = `<div class="conv-empty"><p style="color:#ef4444;">Failed to load conversations.</p></div>`;
    }
  };

  // ─── Open a Conversation ─────────────────────────────────
  window.openConversation = async (convId) => {
    activeConvId = convId;

    // Mark active in list
    document.querySelectorAll('.conv-item').forEach(el => {
      el.classList.toggle('active', el.dataset.convId == convId);
      if (el.dataset.convId == convId) {
        el.classList.remove('unread');
        el.querySelector('.unread-dot')?.remove();
        const preview = el.querySelector('.conv-preview');
        if (preview) preview.classList.remove('unread-preview');
      }
    });

    // Update URL
    history.replaceState(null, '', `?conv=${convId}`);

    chatPanelEl.innerHTML = `<div class="chat-empty"><div class="ce-icon">⏳</div><p>Loading...</p></div>`;

    try {
      const res  = await fetch(`${API}/messages/conversations/${convId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      const { conversation: conv, messages } = data;

      const isMe    = conv.buyer_id === currentUser.id;
      const other   = isMe ? { username: conv.seller_username } : { username: conv.buyer_username };

      // Build chat UI
      chatPanelEl.innerHTML = `
        <div class="chat-header">
          <div class="conv-avatar" style="width:40px;height:40px;font-size:1rem;">
            ${initials(other.username)}
          </div>
          <div class="chat-header-info">
            <div class="chat-header-name">${other.username}</div>
            <div class="chat-header-listing">re: ${conv.listing_title}</div>
          </div>
          ${conv.listing_id ? `
            <a href="/pages/listing.html?id=${conv.listing_id}" class="chat-listing-badge" target="_blank">
              ${conv.listing_image ? `<img src="${conv.listing_image}" class="chat-listing-thumb" alt="listing"/>` : '<div class="chat-listing-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.2rem;">📦</div>'}
              <div class="chat-listing-info">
                <div class="chat-listing-title">${conv.listing_title}</div>
                ${conv.listing_price ? `<div class="chat-listing-price">${formatPrice(conv.listing_price)}</div>` : ''}
              </div>
            </a>` : ''}
        </div>

        <div class="chat-messages" id="chat-messages">
          ${renderMessages(messages)}
        </div>

        <div class="chat-input-area">
          <textarea id="msg-input" placeholder="Type a message…" rows="1"
            onkeydown="handleMsgKey(event, ${convId})"
            oninput="autoResize(this)"></textarea>
          <button class="send-btn" onclick="sendMessage(${convId})" title="Send">➤</button>
        </div>`;

      scrollToBottom();
      document.getElementById('msg-input')?.focus();

      // Start polling for new messages
      clearInterval(pollInterval);
      pollInterval = setInterval(() => pollMessages(convId), 4000);

    } catch (err) {
      chatPanelEl.innerHTML = `<div class="chat-empty"><p style="color:#ef4444;">Failed to load conversation.</p></div>`;
    }
  };

  // ─── Render Messages ─────────────────────────────────────
  const renderMessages = (messages) => {
    if (!messages.length) {
      return '<div style="text-align:center;color:#94a3b8;padding:2rem;font-size:0.9rem;">No messages yet. Say hello! 👋</div>';
    }

    let html = '';
    let lastDate = '';

    messages.forEach(msg => {
      const msgDate = formatDate(msg.created_at);
      if (msgDate !== lastDate) {
        html += `<div class="msg-date-divider">${msgDate}</div>`;
        lastDate = msgDate;
      }

      const mine = msg.sender_id === currentUser.id;
      html += `
        <div class="msg-row ${mine ? 'mine' : 'theirs'}">
          ${!mine ? `<div class="msg-avatar">${msg.sender_photo ? `<img src="${msg.sender_photo}" alt="${msg.sender_username}"/>` : initials(msg.sender_username)}</div>` : ''}
          <div>
            <div class="msg-bubble">${escapeHtml(msg.content).replace(/\n/g, '<br/>')}</div>
            <div class="msg-time">${formatTime(msg.created_at)}</div>
          </div>
          ${mine ? `<div class="msg-avatar">${initials(currentUser.username)}</div>` : ''}
        </div>`;
    });

    return html;
  };

  // ─── Send Message ─────────────────────────────────────────
  window.sendMessage = async (convId) => {
    const input   = document.getElementById('msg-input');
    const content = input?.value.trim();
    if (!content) return;

    const sendBtn = document.querySelector('.send-btn');
    if (sendBtn) sendBtn.disabled = true;
    input.value = '';
    autoResize(input);

    // Optimistic UI — add message immediately
    const messagesEl = document.getElementById('chat-messages');
    if (messagesEl) {
      const tempDiv = document.createElement('div');
      tempDiv.className = 'msg-row mine';
      tempDiv.innerHTML = `
        <div>
          <div class="msg-bubble">${escapeHtml(content).replace(/\n/g, '<br/>')}</div>
          <div class="msg-time">Sending…</div>
        </div>
        <div class="msg-avatar">${initials(currentUser.username)}</div>`;
      messagesEl.appendChild(tempDiv);
      scrollToBottom();
    }

    try {
      await fetch(`${API}/messages/conversations/${convId}`, {
        method:  'POST',
        headers: authHeaders(),
        body:    JSON.stringify({ message: content }),
      });
      // Reload to get server-stamped message
      await refreshMessages(convId);
      loadConversations();
    } catch {
      if (messagesEl?.lastChild) messagesEl.removeChild(messagesEl.lastChild);
      input.value = content;
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      input.focus();
    }
  };

  // ─── Poll for new messages ────────────────────────────────
  window.pollMessages = async (convId) => {
    if (document.hidden) return; // Don't poll when tab is hidden
    await refreshMessages(convId);
    loadConversations();
  };

  const refreshMessages = async (convId) => {
    try {
      const res  = await fetch(`${API}/messages/conversations/${convId}`, { headers: authHeaders() });
      const data = await res.json();
      const el   = document.getElementById('chat-messages');
      if (el) {
        const wasAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        el.innerHTML = renderMessages(data.messages);
        if (wasAtBottom) scrollToBottom();
      }
    } catch (_) {}
  };

  // ─── Key handler (Enter to send, Shift+Enter for newline) ─
  window.handleMsgKey = (e, convId) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(convId);
    }
  };

  // ─── Auto-resize textarea ─────────────────────────────────
  window.autoResize = (el) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  // ─── Scroll to bottom ─────────────────────────────────────
  const scrollToBottom = () => {
    const el = document.getElementById('chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  };

  // ─── Escape HTML ──────────────────────────────────────────
  const escapeHtml = (str) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // ─── Init ─────────────────────────────────────────────────
  loadConversations(openConvId);

  // Cleanup polling when leaving page
  window.addEventListener('beforeunload', () => clearInterval(pollInterval));
}

// ─────────────────────────────────────────────────────────────
// "MESSAGE SELLER" BUTTON (used on listing detail page)
// ─────────────────────────────────────────────────────────────
window.openMessageModal = (listingId, sellerUsername) => {
  if (!isLoggedIn()) { window.location.href = '/pages/login.html'; return; }

  // Remove existing modal if any
  document.getElementById('msg-modal')?.remove();

  const modal = document.createElement('div');
  modal.id    = 'msg-modal';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:999;
    display:flex;align-items:center;justify-content:center;padding:1rem;`;

  modal.innerHTML = `
    <div style="background:white;border-radius:14px;padding:1.75rem;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,0.2);">
      <h3 style="font-size:1.1rem;font-weight:700;margin-bottom:0.4rem;">💬 Message ${sellerUsername}</h3>
      <p style="font-size:0.85rem;color:#64748b;margin-bottom:1rem;">Introduce yourself and ask about the item.</p>
      <textarea id="msg-modal-input" rows="4" placeholder="Hi! Is this still available?" style="
        width:100%;padding:0.65rem 0.9rem;border:1px solid #e2e8f0;border-radius:8px;
        font-size:0.92rem;font-family:inherit;resize:none;outline:none;margin-bottom:1rem;"></textarea>
      <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
        <button onclick="document.getElementById('msg-modal').remove()" style="
          padding:0.6rem 1.1rem;border-radius:8px;border:1px solid #e2e8f0;
          background:white;cursor:pointer;font-size:0.9rem;">Cancel</button>
        <button onclick="submitFirstMessage(${listingId})" style="
          padding:0.6rem 1.25rem;border-radius:8px;border:none;
          background:#2563eb;color:white;font-weight:700;cursor:pointer;font-size:0.9rem;">Send Message</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.querySelector('textarea').focus();
};

window.submitFirstMessage = async (listingId) => {
  const input   = document.getElementById('msg-modal-input');
  const content = input?.value.trim();
  if (!content) { input.style.borderColor = '#ef4444'; return; }

  try {
    const res  = await fetch(`${API}/messages/conversations`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ listing_id: listingId, message: content }),
    });
    const data = await res.json();

    if (!res.ok) { alert(data.error || 'Failed to send message.'); return; }

    document.getElementById('msg-modal').remove();
    window.location.href = `/pages/messages.html?conv=${data.conversation_id}`;
  } catch {
    alert('Something went wrong. Please try again.');
  }
};
