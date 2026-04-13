/* global api, initGraph */
'use strict';

/**
 * app.js — main application controller for the 公论 platform.
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentUser   = null;
let selectedNode  = null;
let references    = [];   // IDs of messages to reference when composing
let graph;

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------
async function loadUsers() {
  const users = await api.getUsers();
  const sel   = document.getElementById('user-select');
  sel.innerHTML = '';
  for (const u of users) {
    const opt = document.createElement('option');
    opt.value       = u.id;
    opt.textContent = `${u.name} (${u.points} pts)`;
    sel.appendChild(opt);
  }
  if (users.length > 0) {
    currentUser = users[0];
    sel.value   = currentUser.id;
    updateUserBar();
  }
}

async function refreshCurrentUser() {
  if (!currentUser) return;
  currentUser = await api.getUser(currentUser.id);
  // Refresh select option text
  const sel = document.getElementById('user-select');
  for (const opt of sel.options) {
    if (opt.value === currentUser.id) {
      opt.textContent = `${currentUser.name} (${currentUser.points} pts)`;
    }
  }
  updateUserBar();
}

function updateUserBar() {
  document.getElementById('user-points').textContent = currentUser.points;
  document.getElementById('user-level').textContent  = `Lv ${currentUser.level}`;
}

document.getElementById('user-select').addEventListener('change', async e => {
  currentUser = await api.getUser(e.target.value);
  updateUserBar();
});

document.getElementById('btn-new-user').addEventListener('click', async () => {
  const name = prompt('输入新用户名称：');
  if (!name) return;
  try {
    const user = await api.createUser(name);
    toast(`用户 "${user.name}" 已创建，初始贡献点 ${user.points}`, 'success');
    await loadUsers();
    document.getElementById('user-select').value = user.id;
    currentUser = user;
    updateUserBar();
  } catch (err) {
    toast(err.message, 'error');
  }
});

// ---------------------------------------------------------------------------
// Reference chip management
// ---------------------------------------------------------------------------
function addReference(id, label) {
  if (references.includes(id)) return;
  references.push(id);

  const chip = document.createElement('span');
  chip.className   = 'ref-chip';
  chip.dataset.id  = id;
  chip.innerHTML   = `${label.slice(0, 20)}<span class="remove-ref" title="移除">✕</span>`;
  chip.querySelector('.remove-ref').addEventListener('click', () => {
    references = references.filter(r => r !== id);
    chip.remove();
  });
  document.getElementById('reference-list').appendChild(chip);
}

// ---------------------------------------------------------------------------
// Message type → show/hide relation type selector
// ---------------------------------------------------------------------------
document.getElementById('msg-type').addEventListener('change', e => {
  const row = document.getElementById('relation-type-row');
  if (e.target.value === 'relation') row.classList.remove('hidden');
  else                                row.classList.add('hidden');
});

// ---------------------------------------------------------------------------
// Send message
// ---------------------------------------------------------------------------
document.getElementById('btn-send').addEventListener('click', async () => {
  if (!currentUser) return toast('请先选择用户', 'error');

  const content      = document.getElementById('msg-content').value.trim();
  const type         = document.getElementById('msg-type').value;
  const relationType = document.getElementById('relation-type').value;
  const tagsRaw      = document.getElementById('msg-tags').value;
  const tags         = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  if (!content) return toast('内容不能为空', 'error');

  try {
    const msg = await api.createMessage({
      authorId: currentUser.id,
      content,
      type,
      relationType: type === 'relation' ? relationType : undefined,
      references,
      tags,
    });
    toast(`消息已发送，获得 ${msg.pointsEarned} 贡献点`, 'success');
    // Clear form
    document.getElementById('msg-content').value = '';
    document.getElementById('msg-tags').value    = '';
    references = [];
    document.getElementById('reference-list').innerHTML = '';
    await refreshCurrentUser();
    await refreshGraph();
  } catch (err) {
    toast(err.message, 'error');
  }
});

// ---------------------------------------------------------------------------
// Place wager
// ---------------------------------------------------------------------------
document.getElementById('btn-place-wager').addEventListener('click', async () => {
  if (!currentUser) return toast('请先选择用户', 'error');

  const messageId  = document.getElementById('wager-msg-id').value.trim();
  const prediction = document.getElementById('wager-prediction').value === 'true';
  const amount     = parseInt(document.getElementById('wager-amount').value, 10);

  if (!messageId) return toast('请输入预测消息 ID', 'error');
  if (!amount || amount <= 0) return toast('押注金额必须大于 0', 'error');

  try {
    const wager = await api.createWager({
      messageId,
      creatorId: currentUser.id,
      prediction,
      amount,
    });
    toast(`预测已创建，押注 ${wager.amount} 贡献点`, 'success');
    await refreshCurrentUser();
    if (selectedNode && selectedNode.id === messageId) {
      showDetail(selectedNode);
    }
  } catch (err) {
    toast(err.message, 'error');
  }
});

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------
async function refreshGraph() {
  const data = await api.getGraph();
  graph.update(data);
}

document.getElementById('btn-refresh-graph').addEventListener('click', refreshGraph);

document.getElementById('btn-ai-cluster').addEventListener('click', async () => {
  try {
    const clusters = await api.clusterMessages();
    const lines    = Object.entries(clusters).map(([k, v]) => `${k}: ${v.length} 条`);
    toast('AI 聚类完成: ' + lines.join(' | '), 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
});

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------
async function showDetail(node) {
  selectedNode = node;

  document.getElementById('detail-empty').classList.add('hidden');
  document.getElementById('detail-content').classList.remove('hidden');

  // Fetch fresh message data
  const msg = await api.getMessage(node.id);

  document.getElementById('detail-type-badge').textContent = typeLabel(msg.type);
  document.getElementById('detail-content-text').textContent = msg.content;

  // Author name
  let authorName = msg.authorId;
  try {
    const u = await api.getUser(msg.authorId);
    authorName = `${u.name} (${u.points} pts)`;
  } catch (_) { /* ignore */ }
  document.getElementById('detail-author').textContent = authorName;
  document.getElementById('detail-time').textContent   = new Date(msg.timestamp).toLocaleString('zh-CN');

  // Tags
  const tagsEl = document.getElementById('detail-tags');
  tagsEl.innerHTML = '';
  for (const tag of (msg.tags || [])) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip'; chip.textContent = tag;
    tagsEl.appendChild(chip);
  }

  // Positions
  document.getElementById('count-support').textContent = msg.positions.support;
  document.getElementById('count-oppose').textContent  = msg.positions.oppose;
  document.getElementById('count-signup').textContent  = msg.positions.signup;

  // References
  const refsEl = document.getElementById('detail-refs');
  refsEl.innerHTML = '';
  if (msg.references && msg.references.length > 0) {
    const label = document.createElement('small');
    label.textContent = '引用消息:'; label.style.color = 'var(--text-muted)';
    refsEl.appendChild(label);
    for (const refId of msg.references) {
      try {
        const ref = await api.getMessage(refId);
        const entry = document.createElement('div');
        entry.className = 'ref-entry';
        entry.textContent = ref.content.slice(0, 80) + (ref.content.length > 80 ? '…' : '');
        entry.title = 'Click to view';
        entry.addEventListener('click', () => showDetail({ id: ref.id, ...ref }));
        refsEl.appendChild(entry);
      } catch (_) { /* ignore */ }
    }
  }

  // AI summary
  document.getElementById('ai-summary-text').classList.add('hidden');
  if (msg.aiSummary) {
    document.getElementById('ai-summary-text').textContent = msg.aiSummary;
    document.getElementById('ai-summary-text').classList.remove('hidden');
  }

  // Edit
  document.getElementById('edit-content').value = msg.content;
  const historyEl = document.getElementById('edit-history');
  historyEl.innerHTML = '';
  for (const h of (msg.editHistory || [])) {
    const entry = document.createElement('div');
    entry.className = 'history-entry';
    entry.textContent = `[${new Date(h.timestamp).toLocaleString('zh-CN')}] ${h.content.slice(0, 80)}`;
    historyEl.appendChild(entry);
  }

  // Wagers
  await loadWagers(msg.id);

  // Pre-fill wager form
  document.getElementById('wager-msg-id').value = msg.id;

  // "Use for wager" button
  document.getElementById('btn-use-for-wager').onclick = () => {
    document.getElementById('wager-msg-id').value = msg.id;
    document.getElementById('wager-amount').focus();
  };
}

async function loadWagers(messageId) {
  const wagerList = document.getElementById('wager-list');
  wagerList.innerHTML = '';
  try {
    const wagers = await api.getWagers({ messageId });
    if (wagers.length === 0) {
      wagerList.innerHTML = '<small style="color:var(--text-muted)">暂无预测</small>';
      return;
    }
    for (const w of wagers) {
      const item = document.createElement('div');
      item.className = 'wager-item';
      item.innerHTML = `
        <div>
          <strong>${w.prediction ? '✅ 预测为真' : '❌ 预测为假'}</strong>
          <span class="wager-status-${w.status}"> · ${w.status === 'open' ? '进行中' : '已结算'}</span>
        </div>
        <div>池子：${w.amount} 贡献点 · 参与者：${w.participants.length}</div>
      `;
      if (w.status === 'open') {
        const joinForm = document.createElement('div');
        joinForm.className = 'wager-join-form';
        joinForm.innerHTML = `
          <input type="number" min="1" value="10" placeholder="押注" class="join-amount" />
          <button class="btn-sm join-btn">参与对赌</button>
          <button class="btn-sm resolve-btn-true">裁定为真</button>
          <button class="btn-sm resolve-btn-false">裁定为假</button>
        `;
        joinForm.querySelector('.join-btn').addEventListener('click', async () => {
          if (!currentUser) return toast('请先选择用户', 'error');
          const amount = parseInt(joinForm.querySelector('.join-amount').value, 10);
          try {
            await api.joinWager(w.id, { userId: currentUser.id, amount });
            toast('已加入预测对赌', 'success');
            await refreshCurrentUser();
            await loadWagers(messageId);
          } catch (err) { toast(err.message, 'error'); }
        });
        joinForm.querySelector('.resolve-btn-true').addEventListener('click', async () => {
          try {
            await api.resolveWager(w.id, true);
            toast('预测已裁定为真，筹码已结算', 'success');
            await refreshCurrentUser();
            await loadWagers(messageId);
          } catch (err) { toast(err.message, 'error'); }
        });
        joinForm.querySelector('.resolve-btn-false').addEventListener('click', async () => {
          try {
            await api.resolveWager(w.id, false);
            toast('预测已裁定为假，筹码已结算', 'success');
            await refreshCurrentUser();
            await loadWagers(messageId);
          } catch (err) { toast(err.message, 'error'); }
        });
        item.appendChild(joinForm);
      }
      wagerList.appendChild(item);
    }
  } catch (err) {
    wagerList.innerHTML = `<small style="color:var(--danger)">${err.message}</small>`;
  }
}

// Position buttons
['support', 'oppose', 'signup'].forEach(type => {
  document.getElementById(`btn-${type}`).addEventListener('click', async () => {
    if (!currentUser) return toast('请先选择用户', 'error');
    if (!selectedNode) return;
    try {
      await api.takePosition({ userId: currentUser.id, messageId: selectedNode.id, type });
      toast(`已${type === 'support' ? '支持' : type === 'oppose' ? '反对' : '报名'}`, 'success');
      await showDetail(selectedNode);
    } catch (err) { toast(err.message, 'error'); }
  });
});

// AI summarize button
document.getElementById('btn-ai-summarize').addEventListener('click', async () => {
  if (!selectedNode) return;
  try {
    const result = await api.summarizeThread(selectedNode.id);
    const el = document.getElementById('ai-summary-text');
    el.textContent = result.summary;
    el.classList.remove('hidden');
    toast(`AI 摘要完成 (${result.threadLength} 条消息)`, 'success');
  } catch (err) { toast(err.message, 'error'); }
});

// Edit save button
document.getElementById('btn-edit-save').addEventListener('click', async () => {
  if (!selectedNode) return;
  const content = document.getElementById('edit-content').value.trim();
  if (!content) return toast('内容不能为空', 'error');
  try {
    await api.editMessage(selectedNode.id, content);
    toast('消息已更新', 'success');
    await showDetail(selectedNode);
    await refreshGraph();
  } catch (err) { toast(err.message, 'error'); }
});

// Close detail panel
document.getElementById('btn-close-detail').addEventListener('click', () => {
  document.getElementById('detail-empty').classList.remove('hidden');
  document.getElementById('detail-content').classList.add('hidden');
  selectedNode = null;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function typeLabel(type) {
  return { message: '消息', question: '提问', relation: '关系', summary: '摘要' }[type] || type;
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function init() {
  graph = initGraph('.graph-area');

  graph.onNodeClick(async node => {
    await showDetail(node);
    // Allow quick-add reference from detail panel
    // (user can also click "add as reference" via chip buttons)
    // If modifier key held, add to references instead of showing detail
  });

  // Allow ctrl+click on node to add reference
  document.getElementById('graph-svg').addEventListener('click', e => {
    // handled in graph.js click handler
  });

  try {
    await loadUsers();
    await refreshGraph();
  } catch (err) {
    toast('无法连接服务器: ' + err.message, 'error');
  }
}

// Add reference from selected node via keyboard shortcut
document.addEventListener('keydown', e => {
  if (e.key === 'r' && e.ctrlKey && selectedNode) {
    const label = selectedNode.label || selectedNode.id;
    addReference(selectedNode.id, label);
    toast(`已添加引用: ${label.slice(0, 20)}`, 'success');
  }
});

window.addEventListener('DOMContentLoaded', init);
