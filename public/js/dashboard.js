// ===== Auth guard =====
const token = localStorage.getItem('token');
if (!token) window.location.href = '/';

const user = JSON.parse(localStorage.getItem('user') || '{}');

// ===== Helpers =====
const api = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      ...(options.headers || {})
    }
  });
  if (res.status === 401) {
    localStorage.clear();
    window.location.href = '/';
    throw new Error('Unauthorized');
  }
  return res;
};

const fmtMoney = (n) =>
  '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let toastTimer;
function toast(msg, isErr = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 2600);
}

// ===== State =====
let currentPage = 1;
let currentSearch = '';
let totalPages = 1;

// ===== User chip =====
document.getElementById('userName').textContent = user.name || 'Admin';
document.getElementById('avatar').textContent = (user.name || 'A').charAt(0).toUpperCase();

// ===== Logout =====
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.clear();
  window.location.href = '/';
});

// ===== Load stats =====
async function loadStats() {
  try {
    const res = await api('/api/stats');
    const s = await res.json();
    document.getElementById('statTotal').textContent = s.total;
    document.getElementById('statSum').textContent = fmtMoney(s.sum);
    document.getElementById('statCompleted').textContent = s.completed;
    document.getElementById('statPending').textContent = s.pending;
  } catch {}
}

// ===== Load transactions =====
async function loadTransactions() {
  const body = document.getElementById('tableBody');
  body.innerHTML = '<tr><td colspan="7" class="empty">Loading...</td></tr>';
  try {
    const res = await api(`/api/transactions?page=${currentPage}&limit=15&search=${encodeURIComponent(currentSearch)}`);
    const { data, totalPages: tp } = await res.json();
    totalPages = tp || 1;

    if (!data.length) {
      body.innerHTML = '<tr><td colspan="7" class="empty">No transactions found.</td></tr>';
      document.getElementById('pagination').innerHTML = '';
      return;
    }

    body.innerHTML = data.map(t => `
      <tr>
        <td>${t.id}</td>
        <td><span class="link">${esc(t.title)}</span></td>
        <td>${esc(t.generated_on)}</td>
        <td>${esc(t.summary)}</td>
        <td class="amount">${fmtMoney(t.amount)}</td>
        <td><span class="badge ${t.status === 'Completed' ? 'completed' : 'pending'}">${esc(t.status)}</span></td>
        <td class="row-actions">
          <button class="edit" data-id="${t.id}" title="Edit">Edit</button>
          <button class="del" data-id="${t.id}" title="Delete">Delete</button>
        </td>
      </tr>
    `).join('');

    renderPagination();
    attachRowActions(data);
  } catch (e) {
    body.innerHTML = '<tr><td colspan="7" class="empty">Failed to load.</td></tr>';
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ===== Pagination =====
function renderPagination() {
  const pg = document.getElementById('pagination');
  if (totalPages <= 1) { pg.innerHTML = ''; return; }
  let html = `<button ${currentPage === 1 ? 'disabled' : ''} data-pg="first">First</button>`;
  html += `<button ${currentPage === 1 ? 'disabled' : ''} data-pg="prev">‹</button>`;
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) {
    html += `<button class="${i === currentPage ? 'active' : ''}" data-pg="${i}">${i}</button>`;
  }
  html += `<button ${currentPage === totalPages ? 'disabled' : ''} data-pg="next">›</button>`;
  html += `<button ${currentPage === totalPages ? 'disabled' : ''} data-pg="last">Last</button>`;
  pg.innerHTML = html;

  pg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.pg;
    if (v === 'first') currentPage = 1;
    else if (v === 'prev') currentPage = Math.max(1, currentPage - 1);
    else if (v === 'next') currentPage = Math.min(totalPages, currentPage + 1);
    else if (v === 'last') currentPage = totalPages;
    else currentPage = parseInt(v);
    loadTransactions();
  }));
}

// ===== Row actions =====
function attachRowActions(data) {
  document.querySelectorAll('.row-actions .edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = data.find(x => x.id == btn.dataset.id);
      openModal(t);
    });
  });
  document.querySelectorAll('.row-actions .del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this transaction?')) return;
      try {
        await api('/api/transactions/' + btn.dataset.id, { method: 'DELETE' });
        toast('Transaction deleted');
        loadTransactions();
        loadStats();
      } catch { toast('Delete failed', true); }
    });
  });
}

// ===== Search (debounced) =====
let searchTimer;
function wireSearch(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentSearch = el.value.trim();
      currentPage = 1;
      // keep both search boxes in sync
      ['searchInput', 'tableSearch'].forEach(o => {
        const other = document.getElementById(o);
        if (other && other !== el) other.value = el.value;
      });
      loadTransactions();
    }, 350);
  });
}
wireSearch('searchInput');
wireSearch('tableSearch');

// ===== Modal =====
const modal = document.getElementById('modal');
function openModal(txn) {
  document.getElementById('modalTitle').textContent = txn ? 'Edit Transaction' : 'Add Transaction';
  document.getElementById('txnId').value = txn ? txn.id : '';
  document.getElementById('fTitle').value = txn ? txn.title : 'Accounting Aggregation Transactions';
  document.getElementById('fGenerated').value = txn ? txn.generated_on : '';
  document.getElementById('fSummary').value = txn ? txn.summary : '';
  document.getElementById('fAmount').value = txn ? txn.amount : '';
  document.getElementById('fStatus').value = txn ? txn.status : 'Completed';
  modal.classList.add('show');
}
function closeModal() { modal.classList.remove('show'); }

document.getElementById('addBtn').addEventListener('click', () => openModal(null));
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalCancel').addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

document.getElementById('modalSave').addEventListener('click', async () => {
  const id = document.getElementById('txnId').value;
  const payload = {
    title: document.getElementById('fTitle').value.trim(),
    generated_on: document.getElementById('fGenerated').value.trim(),
    summary: document.getElementById('fSummary').value.trim(),
    amount: parseFloat(document.getElementById('fAmount').value) || 0,
    status: document.getElementById('fStatus').value
  };
  if (!payload.title || !payload.summary) {
    toast('Title and Summary required', true);
    return;
  }
  try {
    if (id) {
      await api('/api/transactions/' + id, { method: 'PUT', body: JSON.stringify(payload) });
      toast('Transaction updated');
    } else {
      await api('/api/transactions', { method: 'POST', body: JSON.stringify(payload) });
      toast('Transaction added');
    }
    closeModal();
    loadTransactions();
    loadStats();
  } catch { toast('Save failed', true); }
});

// ===== Init =====
loadStats();
loadTransactions();
