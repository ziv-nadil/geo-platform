import 'server-only';
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import type { ReportData, Table } from '@/lib/reports/aggregate';
import { reportTables } from '@/lib/reports/aggregate';

/**
 * PDF via @react-pdf/renderer: pure JS, no headless Chromium, so it fits Vercel's function size/cold-start limits
 * (a Playwright/Chromium render would need @sparticuz/chromium and ~50MB of binary).
 */
const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: 'Helvetica', color: '#1a1a1a' },
  h1: { fontSize: 18, marginBottom: 2 },
  sub: { color: '#666', marginBottom: 14 },
  h2: { fontSize: 12, marginTop: 14, marginBottom: 6 },
  kpis: { flexDirection: 'row', gap: 8 },
  kpi: { flexGrow: 1, border: '1 solid #ddd', borderRadius: 4, padding: 8 },
  kpiLabel: { color: '#666', fontSize: 8 },
  kpiValue: { fontSize: 16, marginTop: 2 },
  row: { flexDirection: 'row', borderBottom: '0.5 solid #e5e5e5', paddingVertical: 3 },
  th: { fontFamily: 'Helvetica-Bold', color: '#444' },
  empty: { color: '#888' },
});

const fmt = (v: string | number | null) => (v === null || v === undefined ? '–' : typeof v === 'number' ? String(Math.round(v * 100) / 100) : v);
const sign = (d: number | null) => (d === null ? '' : `${d > 0 ? '+' : ''}${d}`);

function Grid({ t, limit = 25 }: { t: Pick<Table, 'columns' | 'rows'>; limit?: number }) {
  if (!t.rows.length) return <Text style={s.empty}>No data for this period.</Text>;
  return (
    <View>
      <View style={s.row}>{t.columns.map((c) => <Text key={c} style={[s.th, { flex: 1 }]}>{c.replace(/_/g, ' ')}</Text>)}</View>
      {t.rows.slice(0, limit).map((r, i) => (
        <View key={i} style={s.row} wrap={false}>{r.map((v, j) => <Text key={j} style={{ flex: 1 }}>{fmt(v)}</Text>)}</View>
      ))}
    </View>
  );
}

export function ReportDocument({ title, orgName, data }: { title: string; orgName: string; data: ReportData }): ReactElement {
  const tables = reportTables(data);
  const pick = (name: string) => tables.find((t) => t.name === name)!;
  const k = data.kpis;
  const tiles: [string, number | null, number | null, string][] = [
    ['Visibility score', k.visibility.value, k.visibility.delta, ''],
    ['Share of voice', k.sov.value, k.sov.delta, '%'],
    ['Citation share', k.citationShare.value, k.citationShare.delta, '%'],
    ['Sentiment', k.sentiment.value, k.sentiment.delta, ''],
  ];
  return (
    <Document title={title} author="ASO Engine">
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{title}</Text>
        <Text style={s.sub}>{orgName} · {data.period.from} to {data.period.to} ({data.period.days} days) · vs {data.previous.from} – {data.previous.to}</Text>
        <View style={s.kpis}>
          {tiles.map(([label, v, d, unit]) => (
            <View key={label} style={s.kpi}>
              <Text style={s.kpiLabel}>{label}</Text>
              <Text style={s.kpiValue}>{v === null ? '–' : `${fmt(v)}${unit}`}</Text>
              <Text style={s.kpiLabel}>{sign(d) ? `${sign(d)} vs previous` : 'no prior data'}</Text>
            </View>
          ))}
        </View>
        <Text style={s.h2}>Trends by engine</Text>
        <Grid t={pick('engines')} />
        <Text style={s.h2}>Top gaps</Text>
        <Grid t={pick('gaps')} />
        <Text style={s.h2}>Competitor movers</Text>
        <Grid t={pick('competitor_movers')} />
      </Page>
    </Document>
  );
}

export async function renderReportPdf(args: { title: string; orgName: string; data: ReportData }): Promise<Buffer> {
  return renderToBuffer(ReportDocument(args) as Parameters<typeof renderToBuffer>[0]);
}
