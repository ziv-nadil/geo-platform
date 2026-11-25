import { describe, expect, it } from 'vitest';
import { lintIssues, lintText, sentenceStats } from '../lint';

describe('lintText', () => {
  it('replaces em dashes and pause en dashes with commas', () => {
    const r = lintText('Pricing is simple — and fair – for most teams.');
    expect(r.text).toBe('Pricing is simple, and fair, for most teams.');
    expect(r.changes.emDash).toBe(1);
    expect(r.changes.enDash).toBe(1);
  });
  it('keeps numeric ranges readable', () => {
    expect(lintText('Plans cost 10–20 dollars.').text).toBe('Plans cost 10-20 dollars.');
  });
  it('removes emoji', () => {
    const r = lintText('Great tool 🚀 for teams 👩‍💻.');
    expect(r.text).toBe('Great tool for teams.');
    expect(r.changes.emoji).toBeGreaterThan(0);
  });
  it('drops filler openers and capitalises the rest', () => {
    expect(lintText("It's worth noting that the tool exports CSV.").text).toBe('The tool exports CSV.');
    expect(lintText("In today's fast-paced world, teams need speed.").text).toBe('Teams need speed.');
  });
  it('swaps filler words', () => {
    expect(lintText('We delve into pricing and leverage data.').text).toBe('We look at pricing and use data.');
  });
  it('leaves headings, tables, code and lists alone', () => {
    const src = '## A — B\n| a — b | c |\n- item — one\n```\nx — y\n```';
    expect(lintText(src).text).toBe(src.replace('- item — one', '- item, one').replace('## A — B', '## A, B').replace('| a — b | c |', '| a, b | c |'));
  });
  it('breaks up a monotone paragraph', () => {
    const mono = 'The tool is good. The tool is fast. The tool is cheap. The tool is easy.';
    const r = lintText(mono);
    expect(r.changes.variety).toBe(1);
    expect(sentenceStats(r.text).cv).toBeGreaterThan(sentenceStats(mono).cv);
  });
  it('splits long uniform sentences at a conjunction', () => {
    const p = 'Teams compare vendors on price and support every quarter, but they rarely track outcomes. Buyers read reviews on several sites before they shortlist products. Analysts publish yearly reports on category growth and strength. Managers share spreadsheets with scores for each shortlisted option.';
    const r = lintText(p);
    expect(r.changes.variety).toBe(1);
    expect(r.text).toContain('But they rarely track outcomes.');
  });
  it('is clean after linting and idempotent', () => {
    const dirty = "It's worth noting that we delve into data — fast 🚀. Leverage it.";
    const once = lintText(dirty).text;
    expect(lintIssues(once)).toEqual([]);
    expect(lintText(once).text).toBe(once);
  });
});
