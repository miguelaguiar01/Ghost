import type { AutomationRunHistory } from '@tryghost/admin-x-framework/api/automation-run-history';
import { formatNumber } from '@tryghost/shade/utils';

export type HistoryCardState = 'occurred' | 'pending' | 'planned' | 'exited' | 'unknown';
export type HistoryTimestamp = {
  label: string;
  value: string;
  estimated?: boolean;
  related?: { label: string; value: string };
};
export type HistoryCardData = {
  id: string;
  kind: 'trigger' | 'wait' | 'email' | 'unavailable' | 'end';
  title: string;
  state: HistoryCardState;
  statusLabel: string;
  timestamp?: HistoryTimestamp;
  details: string[];
  executionTimestamp?: HistoryTimestamp;
};

const exitReasons: Record<string, { label: string; description: string }> = {
  failed: {
    label: 'Failed',
    description: 'This run stopped because a step failed.',
  },
  'automation disabled': {
    label: 'Automation turned off',
    description: 'This automation was turned off before the run could continue.',
  },
  'member changed status': {
    label: 'Member changed status',
    description: "The member's subscription status no longer matched this automation.",
  },
  // Core also records this status when the member is missing. Current member
  // data cannot establish which condition caused the historical exit.
  'member unsubscribed': {
    label: 'Member unavailable or unsubscribed',
    description: 'The member unsubscribed from updates or was no longer available.',
  },
};
const exitReason = (status: string) =>
  Object.hasOwn(exitReasons, status) ? exitReasons[status] : undefined;

export const waitDuration = (hours: number | null): string | null => {
  if (hours === null || !Number.isFinite(hours) || hours <= 0) {
    return null;
  }
  const days = hours % 24 === 0;
  const value = days ? hours / 24 : hours;
  const unit = days ? (value === 1 ? 'day' : 'days') : value === 1 ? 'hour' : 'hours';
  return `${formatNumber(value, { maximumFractionDigits: 20 })} ${unit}`;
};

const mapStep = (step: AutomationRunHistory['steps'][number]): HistoryCardData => {
  const reason = exitReason(step.status);
  const state: HistoryCardState =
    step.status === 'finished'
      ? 'occurred'
      : step.status === 'pending'
        ? 'pending'
        : reason
          ? 'exited'
          : 'unknown';
  const details: string[] = [];
  let title = 'Step details unavailable';
  const kind =
    step.action?.type === 'wait'
      ? 'wait'
      : step.action?.type === 'send_email'
        ? 'email'
        : 'unavailable';
  if (step.action?.type === 'wait') {
    const duration = waitDuration(step.action.data.wait_hours);
    title = duration
      ? `${state === 'occurred' ? 'Waited' : state === 'pending' ? 'Waiting' : 'Wait'} ${duration}`
      : 'Wait';
    if (!duration) {
      details.push('Wait duration unavailable.');
    }
  } else if (kind === 'email') {
    title = state === 'occurred' ? 'Sent email' : 'Send email';
  }

  let timestamp: HistoryCardData['timestamp'];
  if (state === 'pending') {
    timestamp = { label: 'est.', value: step.ready_at, estimated: true };
  } else if (state === 'occurred' || state === 'exited') {
    const label = state === 'occurred' ? 'Completed' : 'Stopped';
    if (step.finished_at) {
      timestamp = { label, value: step.finished_at };
    } else {
      details.push(`${state === 'occurred' ? 'Completion' : 'Stop'} time unavailable.`);
    }
  } else {
    details.push(`Recorded status: ${step.status || 'unavailable'}.`);
  }

  let executionTimestamp: HistoryCardData['executionTimestamp'];
  if (kind === 'email' && (step.email_sent_at || step.email_delivered_at)) {
    // Delivery evidence is stronger than submission. A send can succeed before
    // the scheduler commits the step, so preserve its recorded status separately.
    title = step.email_delivered_at ? 'Received email' : 'Sent email';
    executionTimestamp = state !== 'occurred' ? timestamp : undefined;
    timestamp = step.email_delivered_at
      ? {
          label: 'Delivered',
          value: step.email_delivered_at,
          related: step.email_sent_at ? { label: 'Sent', value: step.email_sent_at } : undefined,
        }
      : { label: 'Sent', value: step.email_sent_at! };
  } else if (kind === 'email' && state === 'occurred' && timestamp) {
    // Older servers/records still establish a successful send through a finished
    // email step; its completion is the best available send timestamp.
    timestamp = { ...timestamp, label: 'Sent' };
  }

  return {
    id: `step:${step.id}`,
    kind,
    title,
    state,
    timestamp,
    executionTimestamp,
    details,
    statusLabel:
      state === 'occurred'
        ? 'Completed'
        : state === 'pending'
          ? 'Pending'
          : state === 'exited'
            ? reason!.label
            : 'Status unavailable',
  };
};

const mapEnd = (history: AutomationRunHistory): HistoryCardData => {
  const base = { id: `end:${history.id}`, kind: 'end' as const };
  // An earlier stopped step must not explain an unknown final outcome.
  const reason = exitReason(history.steps.at(-1)?.status ?? '');
  switch (history.status) {
    case 'completed':
      return {
        ...base,
        title: 'Completed',
        state: 'occurred',
        statusLabel: 'Completed',
        details: [],
      };
    case 'exited_early':
      return {
        ...base,
        title: 'Exited early',
        state: 'exited',
        statusLabel: history.failed ? 'Failed' : 'Exited early',
        details: [reason?.description ?? 'The reason for this exit is unavailable.'],
      };
    case 'in_progress':
      return {
        ...base,
        title: 'End of automation',
        state: 'planned',
        statusLabel: 'Not reached',
        details: [],
      };
    case 'unclassified':
      return {
        ...base,
        title: 'Outcome unavailable',
        state: 'unknown',
        statusLabel: 'Unclassified',
        details: ['The recorded steps do not establish how this run ended.'],
      };
  }
};

export const mapRunHistory = (
  history: AutomationRunHistory,
  planned: HistoryCardData[] = [],
): HistoryCardData[] => [
  {
    id: `entry:${history.id}`,
    kind: 'trigger',
    title: 'Entered automation',
    state: 'occurred',
    statusLabel: 'Entered',
    timestamp: { label: 'Entered', value: history.created_at },
    details: [],
  },
  // API order describes recorded history, not edges in the current editing graph.
  // Keep unknown/email steps in place rather than joining across omitted records.
  ...history.steps.map(mapStep),
  ...planned,
  mapEnd(history),
];
