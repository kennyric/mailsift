import { describe, expect, it } from 'vitest';
import './setup.js';
import { StateStore, type MailRecord } from '../src/services/state.js';

const store = (): StateStore => new StateStore(':memory:');

describe('action centre', { timeout: 20_000 }, () => {
  it('keeps tasks, completion and due dates', () => {
    const state = store();
    const task = state.createTask({ title: 'Pay the invoice', dueAt: '2026-12-01T09:00:00.000Z' });
    expect(state.listTasks().map((row) => row.title)).toEqual(['Pay the invoice']);
    expect(state.listTasks()[0]?.dueAt).toBe('2026-12-01T09:00:00.000Z');
    expect(state.tasksSummary().open).toBe(1);
    const done = state.updateTask(task.id, { status: 'done' });
    expect(done?.status).toBe('done');
    expect(state.tasksSummary()).toMatchObject({ open: 0, done: 1 });
    expect(state.deleteTask(task.id)).toBe(true);
    expect(state.listTasks()).toEqual([]);
  });

  it('shows only real deadlines and hides one once a task is made from it', () => {
    const state = store();
    const record = (key: string, subject: string, importance: string, fields: Partial<MailRecord> = {}) => {
      state.markSeen(key, 'me@example.com', subject);
      state.recordOutcome(key, importance, false, {
        folder: 'INBOX', sender: key + '@example.com', deadline: '2026-12-01', ...fields,
      });
    };
    record('real', 'Renew the domain', 'warning');
    record('spam', 'Spam deadline', 'warning', { inSpam: true });
    record('promo', 'Promo deadline', 'warning', { category: 'Marketing' });
    record('social', 'Social deadline', 'warning', { category: 'Social' });
    record('calm', 'Calm note', 'info');
    expect(state.deadlines().map((row) => row.dedupKey)).toEqual(['real']);

    const task = state.createTask({ title: 'Renew the domain', messageKey: 'real' });
    expect(state.deadlines()).toEqual([]);

    // Deleting the task puts the mail back among the possible tasks.
    expect(state.deleteTask(task.id)).toBe(true);
    expect(state.deadlines().map((row) => row.dedupKey)).toEqual(['real']);
  });

  it('finds a sent message still waiting for its first reply', () => {
    const state = store();
    state.recordSent({
      account: 'me@example.com',
      messageId: '<sent-1@example.com>',
      threadKey: '<thread-1@example.com>',
      subject: 'Quote',
      fromAddr: 'me@example.com',
      fromName: 'Me',
      to: [{ name: 'Ann', address: 'ann@example.com' }],
      cc: [],
      bcc: [],
      date: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      text: 'Here is the quote',
      attachmentCount: 0,
      attachmentNames: [],
      source: 'page',
    });
    expect(state.followUps(3)).toHaveLength(1);
    expect(state.followUps(3)[0]).toMatchObject({ recipient: 'ann@example.com', daysWaiting: 5 });
  });

  it('summarizes triage and subscriptions without sending mail anywhere', () => {
    const state = store();
    state.markSeen('k1', 'me@example.com', 'Deal');
    state.recordOutcome('k1', 'info', false, {
      messageId: '<deal@shop>', sender: 'news@shop.example', senderName: 'Shop',
      category: 'Marketing', folder: 'INBOX', unsubscribeUrl: 'https://shop.example/unsubscribe',
    });
    const insights = state.insights(30);
    expect(insights.total).toBe(1);
    expect(insights.byImportance).toContainEqual({ name: 'info', n: 1 });
    expect(insights.subscriptions[0]).toMatchObject({
      sender: 'news@shop.example', unsubscribeUrl: 'https://shop.example/unsubscribe',
    });
  });
});
