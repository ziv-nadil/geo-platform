import { describe, expect, it } from 'vitest';
import { plannerDue } from '../planner';

const now = new Date('2026-11-25T12:00:00Z');
describe('plannerDue', () => {
  it('never runs when off', () => expect(plannerDue('off', null, now)).toBe(false));
  it('runs when never planned', () => expect(plannerDue('weekly', null, now)).toBe(true));
  it('daily needs ~a day', () => {
    expect(plannerDue('daily', new Date('2026-11-25T01:00:00Z'), now)).toBe(false);
    expect(plannerDue('daily', new Date('2026-11-24T10:00:00Z'), now)).toBe(true);
  });
  it('weekly needs ~a week', () => {
    expect(plannerDue('weekly', new Date('2026-11-20T12:00:00Z'), now)).toBe(false);
    expect(plannerDue('weekly', new Date('2026-11-18T11:00:00Z'), now)).toBe(true);
  });
});
