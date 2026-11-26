/**
 * The action centre: tasks, sent mail waiting for a reply, and judged mail
 * with a deadline. It is a sheet over the triaged list, so a task made from a
 * message keeps that message's key and can open it again.
 */
export function actionsPart(): string {
  return String.raw`
// ---- Action centre ----
const actionSheet = $('#action-sheet'), actionBody = $('#action-body'), actionOpen = $('#actions-open');
const taskSheet = $('#task-sheet'), taskBody = $('#task-body');
const actionPeek = $('#action-peek'), actionBadge = $('#actions-count');
let actionLoading = false;
let taskDraft = null;
let taskSuggestSeq = 0;
// Set while a task detail is open; it saves the latest edits and resolves true
// when there is nothing left unsaved.
let taskFlush = null;
const selectedDeadlines = new Set();
let bulkAddButton = null;
let bulkDismissButton = null;

function localDueInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

/** Keep the badge and the strip under the title in step with the latest summary. */
function updateActionPeek(summary) {
  const counts = summary && summary.actionCenter;
  if (!counts) return;
  // "due" is a subset of tasks, not another item.
  const total = Number(counts.tasks || 0) + Number(counts.followUps || 0) + Number(counts.deadlines || 0);
  if (actionBadge) {
    actionBadge.hidden = total === 0;
    actionBadge.textContent = total > 99 ? '99+' : String(total);
  }
  if (!actionPeek) return;
  actionPeek.hidden = total === 0;
  const text = $('#action-peek-text');
  if (!text) return;
  const bits = [];
  if (counts.tasks) bits.push(String(counts.tasks) + ' ' + t('action.tasks'));
  if (counts.followUps) bits.push(String(counts.followUps) + ' ' + t('action.followups'));
  if (counts.deadlines) bits.push(String(counts.deadlines) + ' ' + t('action.deadlines'));
  text.replaceChildren(
    el('span', 'action-peek-title', t('action.title')),
    el('span', 'action-peek-meta', bits.join(' · ')),
  );
}
if (actionPeek) actionPeek.onclick = openActionCenter;

function actionHeading(text) {
  return el('h3', 'section-label', text);
}

function actionEmpty(text) {
  return el('p', 'inline-status', text);
}

function actionDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString(lang, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function drawTask(task, redraw) {
  const row = el('div', 'action-row');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = task.status === 'done';
  box.setAttribute('aria-label', t('action.markDone'));
  box.onchange = async () => {
    box.disabled = true;
    const answer = await post('/api/tasks/update', { id: task.id, status: box.checked ? 'done' : 'open' });
    if (!answer.ok) toast((answer.data && answer.data.error) || t('error.taskFailed'), true);
    await redraw();
  };
  const copy = el('div', 'action-copy action-clickable');
  const title = el('div', 'action-title', task.title);
  if (task.status === 'done') title.style.textDecoration = 'line-through';
  copy.appendChild(title);
  const dueText = actionDate(task.dueAt);
  copy.appendChild(el('div', 'action-meta action-due-line',
    dueText ? fill('action.dueTask', { at: dueText }) : t('action.noDue')));
  copy.onclick = (event) => {
    if (event.target.closest('button, a, input')) return;
    openTaskDetail(task);
  };
  const tools = el('div', 'action-tools');
  const remove = el('button', 'text-btn quiet small', t('action.delete'));
  remove.type = 'button';
  remove.onclick = async () => {
    remove.disabled = true;
    const answer = await post('/api/tasks/delete', { id: task.id });
    if (!answer.ok) toast((answer.data && answer.data.error) || t('error.taskFailed'), true);
    await redraw();
  };
  tools.appendChild(remove);
  row.append(box, copy, tools);
  return row;
}

// Open a message above the action centre, so its Back returns here. A desk
// shows the message in the pane under the sheet instead, so there the sheet
// makes way without adding a history entry of its own.
function openMailFromActionCentre(key) {
  if (isWide()) {
    if (taskSheet.open) closeSheet(taskSheet, true);
    if (actionSheet.open) closeSheet(actionSheet, true);
  }
  openFromLink(key, false);
}

function drawDeadline(row, redraw) {
  const item = el('div', 'action-row');
  const lead = el('span', 'action-lead');
  const dot = el('span', 'mark ' + (row.importance === 'critical' ? 'critical' : row.importance === 'warning' ? 'warning' : 'info'));
  const pick = el('input');
  pick.type = 'checkbox';
  pick.checked = selectedDeadlines.has(row.dedupKey);
  pick.setAttribute('aria-label', t('action.selectHint'));
  pick.onchange = () => {
    if (pick.checked) selectedDeadlines.add(row.dedupKey);
    else selectedDeadlines.delete(row.dedupKey);
    syncBulkAdd();
  };
  lead.append(dot, pick);
  const copy = el('div', 'action-copy action-clickable');
  copy.appendChild(el('div', 'action-title', row.subject || row.summary || '(no subject)'));
  copy.appendChild(el('div', 'action-meta', [row.deadline, row.senderName || row.sender].filter(Boolean).join(' · ')));
  if (row.dedupKey) {
    copy.onclick = (event) => {
      if (event.target.closest('button, a, input')) return;
      openMailFromActionCentre(row.dedupKey);
    };
  }
  const tools = el('div', 'action-tools');
  if (row.dedupKey) {
    const add = el('button', 'text-btn small action-add', t('action.quickAdd'));
    add.type = 'button';
    add.onclick = () => addTasksFromMessages([row.dedupKey], redraw, add);
    tools.appendChild(add);
    const dismiss = el('button', 'icon-btn small action-dismiss');
    dismiss.type = 'button';
    dismiss.title = t('action.dismiss');
    dismiss.setAttribute('aria-label', t('action.dismiss'));
    dismiss.appendChild(icon('x'));
    dismiss.onclick = () => dismissDeadlines([row.dedupKey], redraw, dismiss);
    tools.appendChild(dismiss);
  }
  item.append(lead, copy, tools);
  return item;
}

function syncBulkAdd() {
  const selected = selectedDeadlines.size > 0;
  if (bulkAddButton) {
    bulkAddButton.hidden = !selected;
    bulkAddButton.textContent = t('action.addSelected');
  }
  if (bulkDismissButton) {
    bulkDismissButton.hidden = !selected;
    bulkDismissButton.textContent = t('action.dismissSelected');
  }
}

async function dismissDeadlines(keys, redraw, button) {
  if (!keys.length) return;
  if (button) button.disabled = true;
  try {
    const answer = await post('/api/action-center/dismiss', { keys });
    if (!answer.ok) throw new Error((answer.data && answer.data.error) || t('error.taskFailed'));
    for (const key of keys) selectedDeadlines.delete(key);
    toast(keys.length > 1 ? fill('action.dismissedMany', { n: keys.length }) : t('action.dismissedToast'), false, {
      label: t('undo'),
      run: async () => {
        const back = await post('/api/action-center/restore', { keys });
        if (!back.ok) toast((back.data && back.data.error) || t('error.taskFailed'), true);
        else await redraw();
      },
    });
    await redraw();
  } catch (error) {
    toast(error.message || t('error.taskFailed'), true);
    if (button) button.disabled = false;
  }
}

async function addTasksFromMessages(keys, redraw, button) {
  if (!keys.length) return;
  if (button) { button.disabled = true; button.textContent = t('action.adding'); }
  try {
    const answer = await post('/api/tasks/from-messages', { keys });
    if (!answer.ok) throw new Error((answer.data && answer.data.error) || t('error.taskFailed'));
    const created = answer.data && answer.data.created ? answer.data.created.length : 0;
    for (const key of keys) selectedDeadlines.delete(key);
    toast(created > 1 ? fill('action.multipleSaved', { n: created }) : t('action.savedToast'));
    await redraw();
  } catch (error) {
    toast(error.message || t('error.taskFailed'), true);
    if (button) { button.disabled = false; button.textContent = t('action.quickAdd'); }
  }
}

function drawFollowUp(row) {
  const item = el('div', 'action-row');
  const clock = el('span', 'mark later');
  clock.appendChild(icon('clock'));
  const copy = el('div', 'action-copy');
  copy.appendChild(el('div', 'action-title', row.subject || '(no subject)'));
  copy.appendChild(el('div', 'action-meta', [
    fill('action.from', { name: row.recipient || row.accountLabel || row.account }),
    fill('action.days', { n: row.daysWaiting }),
  ].filter(Boolean).join(' · ')));
  item.append(clock, copy, el('div', 'action-tools'));
  return item;
}

async function drawActionCenter() {
  if (actionLoading) return;
  actionLoading = true;
  actionBody.textContent = '';
  actionBody.appendChild(el('p', 'inline-status reading', t('ask.thinking')));
  try {
    const response = await fetch('/api/action-center', { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error((data && data.error) || 'failed');
    actionBody.textContent = '';
    updateActionPeek({ actionCenter: {
      tasks: data.counts.open,
      due: data.counts.due,
      followUps: data.followUps.length,
      deadlines: data.deadlines.length,
    } });
    const redraw = drawActionCenter;

    const form = el('form', 'action-form');
    const title = el('input');
    title.name = 'title';
    title.type = 'text';
    title.placeholder = t('action.taskTitle');
    title.setAttribute('aria-label', t('action.taskTitle'));
    const due = el('input');
    due.name = 'due';
    due.type = 'datetime-local';
    due.setAttribute('aria-label', t('action.due'));
    const notes = el('input');
    notes.name = 'notes';
    notes.type = 'text';
    notes.placeholder = t('action.notes');
    const add = el('button', 'primary-action', t('action.add'));
    add.type = 'submit';
    const draft = taskDraft;
    taskDraft = null;
    if (draft) title.value = draft.title;
    const suggestionNote = el('p', 'action-suggest', '');
    form.append(title, due, notes, suggestionNote, add);
    let touched = false;
    for (const input of [title, notes, due]) input.addEventListener('input', () => { touched = true; });
    if (draft && draft.key) {
      const seq = ++taskSuggestSeq;
      suggestionNote.className = 'action-suggest reading';
      suggestionNote.textContent = t('action.taskSuggestion');
      post('/api/tasks/suggest', { key: draft.key }).then((answer) => {
        if (seq !== taskSuggestSeq) return;
        const suggestion = answer.ok && answer.data ? answer.data.suggestion : null;
        if (suggestion && !touched) {
          if (suggestion.title) title.value = suggestion.title;
          if (suggestion.notes) notes.value = suggestion.notes;
          if (suggestion.dueAt) due.value = localDueInput(suggestion.dueAt);
        }
        suggestionNote.className = 'action-suggest' + (answer.data && answer.data.ai ? ' ok' : '');
        suggestionNote.textContent = answer.data && answer.data.ai ? t('action.taskSuggested') : t('action.taskFallback');
      });
    }
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (!title.value.trim()) { title.focus(); return; }
      add.disabled = true;
      const answer = await post('/api/tasks/create', {
        title: title.value,
        notes: notes.value,
        dueAt: due.value ? new Date(due.value).toISOString() : '',
        ...(draft && draft.key ? { key: draft.key } : {}),
      });
      add.disabled = false;
      if (!answer.ok) toast((answer.data && answer.data.error) || t('error.taskFailed'), true);
      else await redraw();
    };
    actionBody.appendChild(actionHeading(t('action.newTask')));
    actionBody.appendChild(form);

    actionBody.appendChild(actionHeading(t('action.tasks')));
    if (!data.tasks.length) actionBody.appendChild(actionEmpty(t('action.empty')));
    else data.tasks.forEach((task) => actionBody.appendChild(drawTask(task, redraw)));

    actionBody.appendChild(actionHeading(t('action.followups')));
    if (!data.followUps.length) actionBody.appendChild(actionEmpty(t('action.empty')));
    else data.followUps.forEach((row) => actionBody.appendChild(drawFollowUp(row)));

    actionBody.appendChild(actionHeading(t('action.deadlines')));
    for (const key of [...selectedDeadlines]) {
      if (!data.deadlines.some((row) => row.dedupKey === key)) selectedDeadlines.delete(key);
    }
    if (!data.deadlines.length) {
      bulkAddButton = null;
      bulkDismissButton = null;
      actionBody.appendChild(actionEmpty(t('action.empty')));
    } else {
      const bulk = el('div', 'action-bulk');
      bulk.appendChild(el('span', 'action-bulk-hint', t('action.selectHint')));
      const bulkTools = el('div', 'action-bulk-actions');
      bulkDismissButton = el('button', 'text-btn quiet', t('action.dismissSelected'));
      bulkDismissButton.type = 'button';
      bulkDismissButton.hidden = selectedDeadlines.size === 0;
      bulkDismissButton.onclick = () => dismissDeadlines([...selectedDeadlines], redraw, bulkDismissButton);
      bulkAddButton = el('button', 'text-btn', t('action.addSelected'));
      bulkAddButton.type = 'button';
      bulkAddButton.hidden = selectedDeadlines.size === 0;
      bulkAddButton.onclick = () => addTasksFromMessages([...selectedDeadlines], redraw, bulkAddButton);
      bulkTools.append(bulkDismissButton, bulkAddButton);
      bulk.appendChild(bulkTools);
      actionBody.appendChild(bulk);
      data.deadlines.forEach((row) => actionBody.appendChild(drawDeadline(row, redraw)));
    }
  } catch (error) {
    actionBody.textContent = '';
    actionBody.appendChild(el('p', 'inline-error', error.message || t('error.taskFailed')));
  } finally {
    actionLoading = false;
  }
}

function detailField(labelText, control) {
  const box = el('label', 'action-detail-field');
  box.appendChild(el('span', 'action-detail-label', labelText));
  box.appendChild(control);
  return box;
}

function openTaskDetail(task) {
  taskBody.replaceChildren();
  const form = el('form', 'action-detail');
  const title = el('input');
  title.type = 'text';
  title.value = task.title;
  title.setAttribute('aria-label', t('action.taskTitle'));
  const notes = el('textarea');
  notes.rows = 3;
  notes.value = task.notes || '';
  notes.setAttribute('aria-label', t('action.notes'));
  const due = el('input');
  due.type = 'datetime-local';
  due.value = localDueInput(task.dueAt);
  due.setAttribute('aria-label', t('action.due'));

  const status = el('p', 'action-detail-status', t('action.autoSave'));
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const buttons = el('div', 'action-detail-actions');
  // Done sits with Delete, so the whole task can be settled without leaving
  // the row of controls; edits save by themselves underneath.
  const done = el('input');
  done.type = 'checkbox';
  done.checked = task.status === 'done';
  done.setAttribute('aria-label', t('action.markDone'));
  const doneText = el('span', null, done.checked ? t('action.done') : t('action.markDone'));
  const doneLine = el('label', 'action-detail-check' + (done.checked ? ' on' : ''));
  doneLine.append(done, doneText);
  buttons.appendChild(doneLine);

  const remove = el('button', 'text-btn danger', t('action.delete'));
  remove.type = 'button';
  let closed = false;
  let timer = 0;
  remove.onclick = async () => {
    remove.disabled = true;
    if (timer) { clearTimeout(timer); timer = 0; }
    closed = true;
    taskFlush = null;
    const answer = await post('/api/tasks/delete', { id: task.id });
    if (!answer.ok) {
      remove.disabled = false;
      closed = false;
      taskFlush = save;
      toast((answer.data && answer.data.error) || t('error.taskFailed'), true);
    } else {
      // The sheet's close handler redraws the list underneath.
      closeSheet(taskSheet, false);
    }
  };
  buttons.appendChild(remove);

  const dueIso = () => {
    if (!due.value) return '';
    const date = new Date(due.value);
    return Number.isNaN(date.valueOf()) ? '' : date.toISOString();
  };
  const fieldValues = () => JSON.stringify({
    title: title.value.trim(),
    notes: notes.value,
    dueAt: dueIso(),
    status: done.checked ? 'done' : 'open',
  });
  let saved = fieldValues();
  let chain = Promise.resolve(true);
  const setStatus = (text, cls) => {
    if (closed) return;
    status.textContent = text;
    status.className = 'action-detail-status' + (cls ? ' ' + cls : '');
  };
  const save = () => {
    if (timer) { clearTimeout(timer); timer = 0; }
    if (fieldValues() === saved) return chain;
    if (!title.value.trim()) {
      setStatus(t('action.titleRequired'), 'err');
      return Promise.resolve(false);
    }
    chain = chain.then(async () => {
      const latest = fieldValues();
      if (latest === saved) return true;
      if (!title.value.trim()) {
        setStatus(t('action.titleRequired'), 'err');
        return false;
      }
      setStatus(t('action.saving'), 'reading');
      const answer = await post('/api/tasks/update', Object.assign({ id: task.id }, JSON.parse(latest)));
      if (!answer.ok) {
        setStatus(t('action.saveFailed'), 'err');
        return false;
      }
      saved = latest;
      // Edited again while the request was in flight: the pending debounce
      // saves those next, so leave the "saving" note in place.
      if (fieldValues() === latest) setStatus(t('action.saved'), 'ok');
      return true;
    });
    return chain;
  };
  const schedule = () => {
    if (closed) return;
    setStatus(t('action.saving'), 'reading');
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = 0; void save(); }, 600);
  };
  for (const input of [title, notes, due]) input.addEventListener('input', schedule);
  done.addEventListener('change', () => {
    doneText.textContent = done.checked ? t('action.done') : t('action.markDone');
    doneLine.classList.toggle('on', done.checked);
    schedule();
  });
  taskFlush = save;

  if (task.messageKey) {
    const open = el('button', 'text-btn', t('action.openMessage'));
    open.type = 'button';
    open.onclick = async () => {
      open.disabled = true;
      const ok = await save();
      if (!ok) { open.disabled = false; return; }
      // On a phone the message opens above this detail, so Back returns here;
      // a desk closes it silently and shows the message in the pane.
      openMailFromActionCentre(task.messageKey);
      open.disabled = false;
    };
    buttons.appendChild(open);
  }

  form.append(
    detailField(t('action.taskTitle'), title),
    detailField(t('action.notes'), notes),
    detailField(t('action.due'), due),
    buttons,
    status,
  );
  form.onsubmit = (event) => { event.preventDefault(); void save(); };
  taskBody.appendChild(form);
  openSheet(taskSheet, { hash: '#task=' + task.id });
}
function openActionCenter() {
  openSheet(actionSheet, { hash: '#actions' });
  drawActionCenter();
}
function openTaskFor(row) {
  taskDraft = { key: row.dedupKey, title: row.subject || row.summary || '' };
  // Reached from a message that was itself opened from the action centre:
  // put the message (and a task detail under it) down to show the form.
  if (actionSheet.open) {
    if (sheet.open) closeSheet(sheet, false);
    if (taskSheet.open) closeSheet(taskSheet, false);
    drawActionCenter();
    return;
  }
  openActionCenter();
}
if (actionOpen) actionOpen.onclick = openActionCenter;
const actionDone = $('#action-done');
if (actionDone) actionDone.onclick = () => closeSheet(actionSheet, false);
// This sheet is created after the generic sheet wiring, so it gets the same
// dismiss gestures here: swipe the head down, tap the backdrop, or Escape.
for (const dialog of [actionSheet, taskSheet]) {
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeSheet(dialog, false); });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeSheet(dialog, false);
  });
  enableDrag(dialog);
}
// Every way out of the task detail — Done, a swipe, the backdrop, Escape or
// opening the linked mail — saves what is still in the fields. The request
// outlives the dialog, and the list underneath is redrawn once it lands.
taskSheet.addEventListener('close', () => {
  const flush = taskFlush;
  taskFlush = null;
  const redraw = () => {
    if (actionSheet.open && !actionSheet.classList.contains('closing')) drawActionCenter();
  };
  if (!flush) {
    redraw();
    return;
  }
  void Promise.resolve(flush()).then(redraw);
});
const taskDone = $('#task-done');
if (taskDone) taskDone.onclick = async () => {
  if (taskDone.disabled) return;
  taskDone.disabled = true;
  let ok = true;
  try {
    if (taskFlush) ok = await taskFlush();
  } finally {
    taskDone.disabled = false;
  }
  if (ok) closeSheet(taskSheet, false);
};
// A message opened above the action centre can complete it, archive it, or
// give it a task; refresh the list underneath when the reader closes.
sheet.addEventListener('close', () => {
  if (actionSheet.open && !actionSheet.classList.contains('closing')) drawActionCenter();
});
`;
}
