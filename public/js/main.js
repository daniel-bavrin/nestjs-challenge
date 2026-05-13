import {
  escapeHtml,
  qs,
  renderField,
  renderPagination,
  renderTracklistBox,
  showToast,
} from './utils.js';
import {
  extractOrderStatuses,
  getRequestBodySchema,
  schemaFieldsFromRef,
} from './openapi.js';

const state = {
  openApi: null,
  recordCreateFields: [],
  recordUpdateFields: [],
  orderCreateFields: [],
  orderStatusEnum: [],
  recordPage: 1,
  orderPage: 1,
  limit: 10,
  recordFilters: {},
  orderFilters: {},
  editingRecordId: null,
  currentEditingRecord: null,
  editingOrderId: null,
};

function normalizePayload(formEl, fields) {
  const payload = {};
  const data = new FormData(formEl);
  for (const field of fields) {
    const raw = data.get(field.name);
    if (raw === null) continue;
    const value = String(raw).trim();
    if (value === '') {
      if (field.required) payload[field.name] = value;
      continue;
    }
    if (field.type === 'integer') {
      payload[field.name] = parseInt(value, 10);
    } else if (field.type === 'number') {
      payload[field.name] = parseFloat(value);
    } else {
      payload[field.name] = value;
    }
  }
  return payload;
}

function renderRecordForm(values) {
  const fields = state.editingRecordId
    ? state.recordUpdateFields
    : state.recordCreateFields;
  qs('recordFields').innerHTML = fields
    .map((field) => renderField(field, values ? values[field.name] : undefined))
    .join('');
  qs('fillTracklistBtn').classList.toggle('hidden', !state.editingRecordId);
  qs('clearTracklistBtn').classList.toggle('hidden', !state.editingRecordId);
  renderTracklistBox(values, Boolean(state.editingRecordId));
}

function renderOrderForm() {
  qs('orderFields').innerHTML = state.orderCreateFields
    .map((field) => renderField(field, undefined))
    .join('');
}

function renderOrderStatusFilter() {
  const options = ['<option value="">All statuses</option>'];
  for (const status of state.orderStatusEnum) {
    const selected = state.orderFilters.status === status ? 'selected' : '';
    options.push(`<option value="${status}" ${selected}>${status}</option>`);
  }
  qs('orderStatus').innerHTML = options.join('');
}

async function loadRecords() {
  const params = new URLSearchParams({
    page: String(state.recordPage),
    limit: String(state.limit),
    ...state.recordFilters,
  });
  const res = await fetch(`/v1/records?${params.toString()}`);
  if (!res.ok) throw new Error('Failed loading records');
  const data = await res.json();
  const items = data.items || [];

  if (items.length === 0) {
    qs('recordsTableWrap').innerHTML = '<p>No records found.</p>';
    return;
  }

  let html = '<table><thead><tr><th>Artist</th><th>Album</th><th>Format</th><th>Category</th><th>Price</th><th>Qty</th><th>Tracklist</th><th>Actions</th></tr></thead><tbody>';
  for (const item of items) {
    const hasTracklist = Array.isArray(item.tracklist) && item.tracklist.length > 0;
    html += `<tr>
      <td>${escapeHtml(item.artist)}</td>
      <td>${escapeHtml(item.album)}</td>
      <td>${escapeHtml(item.format)}</td>
      <td>${escapeHtml(item.category)}</td>
      <td>${Number(item.price).toFixed(2)}</td>
      <td>${item.qty}</td>
      <td><span class="${hasTracklist ? 'track-ok' : 'track-missing'}">${hasTracklist ? '✓' : '—'}</span></td>
      <td>
        <button class="btn" data-edit-id="${item._id}">Edit</button>
        <button class="btn danger" data-del-id="${item._id}">Delete</button>
      </td>
    </tr>`;
  }
  html += '</tbody></table>';
  html += renderPagination(data.meta?.totalPages || 1, state.recordPage, 'records');
  qs('recordsTableWrap').innerHTML = html;

  document.querySelectorAll('[data-edit-id]').forEach((btn) => {
    btn.addEventListener('click', () => withError(() => editRecord(btn.getAttribute('data-edit-id'))));
  });
  document.querySelectorAll('[data-del-id]').forEach((btn) => {
    btn.addEventListener('click', () => withError(() => deleteRecord(btn.getAttribute('data-del-id'))));
  });
  document.querySelectorAll('[data-page-records]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.recordPage = parseInt(btn.getAttribute('data-page-records'), 10);
      withError(loadRecords);
    });
  });
}

async function loadOrders() {
  const params = new URLSearchParams({
    page: String(state.orderPage),
    limit: String(state.limit),
    ...state.orderFilters,
  });
  const res = await fetch(`/v1/orders?${params.toString()}`);
  if (!res.ok) throw new Error('Failed loading orders');
  const data = await res.json();
  const items = data.items || [];

  if (items.length === 0) {
    qs('ordersTableWrap').innerHTML = '<p>No orders found.</p>';
    return;
  }

  let html = '<table><thead><tr><th>ID</th><th>Record ID</th><th>Qty</th><th>Total</th><th>Status</th><th>Source</th><th>Actions</th></tr></thead><tbody>';
  for (const item of items) {
    const isCanceled = String(item.status).toLowerCase() === 'canceled';
    const editDisabled = isCanceled ? 'disabled title="Canceled orders cannot be edited"' : '';
    const cancelDisabled = isCanceled ? 'disabled title="Order is already canceled"' : '';

    html += `<tr>
      <td class="mono">${escapeHtml(item._id)}</td>
      <td class="mono">${escapeHtml(item.recordId)}</td>
      <td>${item.quantity}</td>
      <td>${Number(item.totalPrice).toFixed(2)}</td>
      <td>${escapeHtml(item.status)}</td>
      <td>${escapeHtml(item.source || '')}</td>
      <td>
        <button class="btn" data-edit-order="${item._id}" ${editDisabled}>Edit Qty</button>
        <button class="btn danger" data-cancel-order="${item._id}" ${cancelDisabled}>Cancel Order</button>
      </td>
    </tr>`;
  }
  html += '</tbody></table>';
  html += renderPagination(data.meta?.totalPages || 1, state.orderPage, 'orders');
  qs('ordersTableWrap').innerHTML = html;

  document.querySelectorAll('[data-edit-order]:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => withError(() => openOrderEditModal(btn.getAttribute('data-edit-order'))));
  });
  document.querySelectorAll('[data-cancel-order]:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => withError(() => requestOrderCancel(btn.getAttribute('data-cancel-order'))));
  });
  document.querySelectorAll('[data-page-orders]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.orderPage = parseInt(btn.getAttribute('data-page-orders'), 10);
      withError(loadOrders);
    });
  });
}

async function editRecord(id) {
  const res = await fetch(`/v1/records/${id}`);
  if (!res.ok) throw new Error('Failed loading record details');
  const record = await res.json();
  state.editingRecordId = id;
  state.currentEditingRecord = record;
  renderRecordForm(record);
  qs('recordForm').classList.remove('hidden');
}

async function fillTracklistNow() {
  if (!state.editingRecordId) return;
  const res = await fetch(`/v1/records/${state.editingRecordId}/fill-tracklist`, { method: 'POST' });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.message || 'Failed to fill tracklist');
  }
  const updatedRecord = await res.json();
  state.currentEditingRecord = updatedRecord;
  renderRecordForm(updatedRecord);
  showToast('Tracklist fetched and stored');
  await loadRecords();
}

async function clearTracklistNow() {
  if (!state.editingRecordId) return;
  const res = await fetch(`/v1/records/${state.editingRecordId}/clear-tracklist`, { method: 'POST' });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.message || 'Failed to clear tracklist');
  }
  const updatedRecord = await res.json();
  state.currentEditingRecord = updatedRecord;
  renderRecordForm(updatedRecord);
  showToast('Tracklist cleared');
  await loadRecords();
}

async function deleteRecord(id) {
  if (!confirm('Delete this record?')) return;
  const res = await fetch(`/v1/records/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Delete failed');
  showToast('Record deleted');
  await loadRecords();
}

function showOrderEditModal() {
  qs('orderEditModal').classList.remove('hidden');
}

function hideOrderEditModal() {
  qs('orderEditModal').classList.add('hidden');
  state.editingOrderId = null;
}

async function openOrderEditModal(id) {
  const res = await fetch(`/v1/orders/${id}`);
  if (!res.ok) throw new Error('Failed loading order');
  const order = await res.json();
  if (String(order.status).toLowerCase() === 'canceled') {
    throw new Error('Canceled orders cannot be edited');
  }
  state.editingOrderId = id;
  qs('editOrderQty').value = order.quantity;
  showOrderEditModal();
}

async function requestOrderCancel(id) {
  if (!confirm('Cancel this order? Inventory will be restocked.')) return;
  const res = await fetch(`/v1/orders/${id}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.message || 'Cancel failed');
  }
  showToast('Order canceled');
  await loadOrders();
}

async function submitOrderQuantityUpdate(event) {
  event.preventDefault();
  if (!state.editingOrderId) return;
  const newQty = parseInt(qs('editOrderQty').value, 10);
  const res = await fetch(`/v1/orders/${state.editingOrderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity: newQty }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.message || 'Failed to update order quantity');
  }
  hideOrderEditModal();
  showToast('Order quantity updated');
  await loadOrders();
}

function wireTabs() {
  qs('tabRecords').addEventListener('click', () => {
    qs('tabRecords').classList.add('active');
    qs('tabOrders').classList.remove('active');
    qs('recordsPanel').classList.remove('hidden');
    qs('ordersPanel').classList.add('hidden');
  });
  qs('tabOrders').addEventListener('click', () => {
    qs('tabOrders').classList.add('active');
    qs('tabRecords').classList.remove('active');
    qs('ordersPanel').classList.remove('hidden');
    qs('recordsPanel').classList.add('hidden');
  });
}

function wireActions() {
  qs('newRecordBtn').addEventListener('click', () => {
    state.editingRecordId = null;
    state.currentEditingRecord = null;
    renderRecordForm();
    qs('recordForm').classList.remove('hidden');
  });
  qs('cancelRecordBtn').addEventListener('click', () => {
    state.editingRecordId = null;
    state.currentEditingRecord = null;
    qs('recordForm').classList.add('hidden');
  });
  qs('fillTracklistBtn').addEventListener('click', () => withError(fillTracklistNow));
  qs('clearTracklistBtn').addEventListener('click', () => withError(clearTracklistNow));

  qs('recordSearchBtn').addEventListener('click', () => {
    const query = qs('recordSearch').value.trim();
    state.recordFilters = query ? { q: query } : {};
    state.recordPage = 1;
    withError(loadRecords);
  });
  qs('recordClearBtn').addEventListener('click', () => {
    qs('recordSearch').value = '';
    state.recordFilters = {};
    state.recordPage = 1;
    withError(loadRecords);
  });

  qs('recordForm').addEventListener('submit', (event) => withError(async () => {
    event.preventDefault();
    const fields = state.editingRecordId ? state.recordUpdateFields : state.recordCreateFields;
    const payload = normalizePayload(qs('recordForm'), fields);
    const isUpdate = Boolean(state.editingRecordId);
    const url = isUpdate ? `/v1/records/${state.editingRecordId}` : '/v1/records';
    const method = isUpdate ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || 'Record save failed');
    }
    qs('recordForm').classList.add('hidden');
    state.editingRecordId = null;
    state.currentEditingRecord = null;
    showToast(isUpdate ? 'Record updated' : 'Record created');
    await loadRecords();
  }));

  qs('newOrderBtn').addEventListener('click', () => {
    renderOrderForm();
    qs('orderForm').classList.remove('hidden');
  });
  qs('cancelOrderBtn').addEventListener('click', () => {
    qs('orderForm').classList.add('hidden');
  });

  qs('orderForm').addEventListener('submit', (event) => withError(async () => {
    event.preventDefault();
    const payload = normalizePayload(qs('orderForm'), state.orderCreateFields);
    const res = await fetch('/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || 'Order create failed');
    }
    qs('orderForm').classList.add('hidden');
    showToast('Order created');
    await loadOrders();
  }));

  qs('orderStatus').addEventListener('change', () => {
    const value = qs('orderStatus').value;
    state.orderFilters = value ? { status: value } : {};
    state.orderPage = 1;
    withError(loadOrders);
  });
  qs('orderClearBtn').addEventListener('click', () => {
    qs('orderStatus').value = '';
    state.orderFilters = {};
    state.orderPage = 1;
    withError(loadOrders);
  });

  qs('cancelOrderEditBtn').addEventListener('click', hideOrderEditModal);
  qs('orderEditForm').addEventListener('submit', (event) =>
    withError(() => submitOrderQuantityUpdate(event)),
  );
}

function bootstrapSchema() {
  state.recordCreateFields = schemaFieldsFromRef(
    state.openApi,
    getRequestBodySchema(state.openApi, '/v1/records', 'post'),
  );
  state.recordUpdateFields = schemaFieldsFromRef(
    state.openApi,
    getRequestBodySchema(state.openApi, '/v1/records/{id}', 'put'),
  );
  state.orderCreateFields = schemaFieldsFromRef(
    state.openApi,
    getRequestBodySchema(state.openApi, '/v1/orders', 'post'),
  );
  state.orderStatusEnum = extractOrderStatuses(state.openApi);
}

async function withError(task) {
  try {
    await task();
  } catch (error) {
    showToast(error?.message || 'Something went wrong', true);
  }
}

async function init() {
  await withError(async () => {
    const swaggerRes = await fetch('/swagger-json');
    if (!swaggerRes.ok) throw new Error('Failed to fetch swagger-json');

    state.openApi = await swaggerRes.json();
    bootstrapSchema();

    renderOrderStatusFilter();
    wireTabs();
    wireActions();

    await loadRecords();
    await loadOrders();
  });
}

init();
