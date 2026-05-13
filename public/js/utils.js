export const qs = (id) => document.getElementById(id);

export function showToast(message, isError = false) {
  const el = document.createElement('div');
  el.className = `toast${isError ? ' error' : ' success'}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

export function toLabel(name) {
  return name.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}

export function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

export function renderField(field, value) {
  const required = field.required ? 'required' : '';
  const requiredMark = field.required ? '<span class="req">*</span>' : '';

  if (field.type === 'enum' && Array.isArray(field.enum)) {
    const opts = ['<option value=""></option>']
      .concat(
        field.enum.map((entry) => {
          const selected = value === entry ? 'selected' : '';
          return `<option value="${entry}" ${selected}>${entry}</option>`;
        }),
      )
      .join('');

    return `<div class="field"><label>${field.label} ${requiredMark}</label><select name="${field.name}" ${required}>${opts}</select></div>`;
  }

  if (field.type === 'integer' || field.type === 'number') {
    const min = field.minimum !== undefined ? `min="${field.minimum}"` : '';
    const max = field.maximum !== undefined ? `max="${field.maximum}"` : '';
    const val = value !== undefined ? `value="${String(value)}"` : '';
    return `<div class="field"><label>${field.label} ${requiredMark}</label><input type="number" step="${field.type === 'integer' ? '1' : 'any'}" name="${field.name}" ${min} ${max} ${required} ${val}></div>`;
  }

  const isTextArea = field.maxLength && field.maxLength > 140;
  const maxlength = field.maxLength ? `maxlength="${field.maxLength}"` : '';
  const minlength = field.minLength ? `minlength="${field.minLength}"` : '';
  const val = value !== undefined ? String(value) : '';

  if (isTextArea) {
    return `<div class="field"><label>${field.label} ${requiredMark}</label><textarea name="${field.name}" ${maxlength} ${minlength} ${required}>${val}</textarea></div>`;
  }

  return `<div class="field"><label>${field.label} ${requiredMark}</label><input type="text" name="${field.name}" value="${val}" ${maxlength} ${minlength} ${required}></div>`;
}

export function renderPagination(totalPages, currentPage, kind) {
  if (!totalPages || totalPages <= 1) return '';
  let html = '<div class="pagination">';
  for (let i = 1; i <= totalPages; i += 1) {
    const cls = i === currentPage ? 'active' : '';
    html += `<button class="${cls}" data-page-${kind}="${i}">${i}</button>`;
  }
  html += '</div>';
  return html;
}

export function renderTracklistBox(record, isEditingRecord) {
  const box = qs('recordTracklistBox');

  if (!isEditingRecord) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }

  const tracklist = Array.isArray(record?.tracklist) ? record.tracklist : [];

  if (tracklist.length === 0) {
    box.classList.remove('hidden');
    box.innerHTML = '<h4>Tracklist</h4><p>No tracks currently stored for this record.</p>';
    return;
  }

  const itemsHtml = tracklist
    .map((track) => {
      const pos = track.position !== undefined ? `#${track.position}` : '-';
      const title = escapeHtml(track.title || 'Untitled');
      const duration = track.duration ? ` (${escapeHtml(track.duration)})` : '';
      return `<div class="track-item"><span class="mono">${pos}</span><span>${title}${duration}</span></div>`;
    })
    .join('');

  box.classList.remove('hidden');
  box.innerHTML = `<h4>Tracklist (${tracklist.length})</h4>${itemsHtml}`;
}
