/**
 * The action centre: tasks, sent mail waiting for a reply, and judged mail
 * with a deadline. It is a sheet over the triaged list, so a task made from a
 * message keeps that message's key and can open it again.
 */
export function actionsPart(): string {
  return String.raw`
// ---- Action centre ----
const actionSheet = $('#action-sheet'), actionBody = $('#action-body'), actionOpen = $('#actions-open');
let actionLoading = false;
let taskDraft = null;

function actionHeading(text) {
  return el('h3', 'section-label', text);
}

function actionEmpty(text) {
  return el('p', 'inline-status', text);
}

function actionDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString(lang, { month: 'short', day: 'numeric' });
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
  const copy = el('div', 'action-copy');
  const title = el('div', 'action-title', task.title);
  if (task.status === 'done') title.style.textDecoration = 'line-through';
  copy.appendChild(title);
  const meta = [task.dueAt ? t('action.dueTask', { at: actionDate(task.dueAt) }) : ''].filter(Boolean).join(' · ');
  if (meta) copy.appendChild(el('div', 'action-meta', meta));
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

function drawDeadline(row, redraw) {
  const item = el('div', 'action-row');
  const dot = el('span', 'mark ' + (row.importance === 'critical' ? 'critical' : row.importance === 'warning' ? 'warning' : 'info'));
  const copy = el('div', 'action-copy');
  copy.appendChild(el('div', 'action-title', row.subject || row.summary || '(no subject)'));
  copy.appendChild(el('div', 'action-meta', [row.deadline, row.senderName || row.sender].filter(Boolean).join(' · ')));
  const tools = el('div', 'action-tools');
  if (row.dedupKey) {
    const open = el('button', 'text-btn small', t('action.openMessage'));
    open.type = 'button';
    open.onclick = () => {
      closeSheet(actionSheet, false);
      openFromLink(row.dedupKey, false);
    };
    tools.appendChild(open);
  }
  item.append(dot, copy, tools);
  return item;
}

function drawFollowUp(row) {
  const item = el('div', 'action-row');
  const clock = el('span', 'mark later');
  clock.appendChild(icon('clock'));
  const copy = el('div', 'action-copy');
  copy.appendChild(el('div', 'action-title', row.subject || '(no subject)'));
  copy.appendChild(el('div', 'action-meta', [
    t('action.from', { name: row.recipient || row.accountLabel || row.account }),
    t('action.days', { n: row.daysWaiting }),
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
    form.append(title, due, notes, add);
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
    if (!data.deadlines.length) actionBody.appendChild(actionEmpty(t('action.empty')));
    else data.deadlines.forEach((row) => actionBody.appendChild(drawDeadline(row, redraw)));
  } catch (error) {
    actionBody.textContent = '';
    actionBody.appendChild(el('p', 'inline-error', error.message || t('error.taskFailed')));
  } finally {
    actionLoading = false;
  }
}

function openActionCenter() {
  openSheet(actionSheet, { hash: '#actions' });
  drawActionCenter();
}
function openTaskFor(row) {
  taskDraft = { key: row.dedupKey, title: row.subject || row.summary || '' };
  openActionCenter();
}
if (actionOpen) actionOpen.onclick = openActionCenter;
const actionDone = $('#action-done');
if (actionDone) actionDone.onclick = () => closeSheet(actionSheet, false);
`;
}
