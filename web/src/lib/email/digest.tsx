import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr } from '@react-email/components';
import type { ReportData } from '@/lib/reports/aggregate';

const fmt = (v: number | null, unit = '') => (v === null ? '–' : `${Math.round(v * 100) / 100}${unit}`);
const dl = (d: number | null) => (d === null ? '' : ` (${d > 0 ? '+' : ''}${d})`);

export function DigestEmail({ orgName, data, appUrl, unsubscribeUrl }: { orgName: string; data: ReportData; appUrl: string; unsubscribeUrl: string }) {
  const k = data.kpis;
  return (
    <Html>
      <Head />
      <Preview>{`${orgName}: visibility ${fmt(k.visibility.value)}${dl(k.visibility.delta)} this week`}</Preview>
      <Body style={{ fontFamily: 'Helvetica, Arial, sans-serif', background: '#f6f6f6', color: '#1a1a1a' }}>
        <Container style={{ background: '#fff', padding: 24, maxWidth: 560 }}>
          <Heading as="h1" style={{ fontSize: 20, margin: 0 }}>Your weekly AI visibility digest</Heading>
          <Text style={{ color: '#666', marginTop: 4 }}>{orgName} · {data.period.from} – {data.period.to}</Text>
          <Section>
            <Text>Visibility score: <b>{fmt(k.visibility.value)}</b>{dl(k.visibility.delta)}</Text>
            <Text>Share of voice: <b>{fmt(k.sov.value, '%')}</b>{dl(k.sov.delta)}</Text>
            <Text>Citation share: <b>{fmt(k.citationShare.value, '%')}</b>{dl(k.citationShare.delta)}</Text>
            <Text>Sentiment: <b>{fmt(k.sentiment.value)}</b>{dl(k.sentiment.delta)}</Text>
          </Section>
          {data.gaps.length > 0 && (
            <Section>
              <Heading as="h2" style={{ fontSize: 15 }}>Top gaps</Heading>
              {data.gaps.slice(0, 3).map((g) => <Text key={g.label} style={{ margin: '2px 0' }}>• {g.label} (score {g.score})</Text>)}
            </Section>
          )}
          {data.movers.length > 0 && (
            <Section>
              <Heading as="h2" style={{ fontSize: 15 }}>Competitor movers</Heading>
              {data.movers.slice(0, 3).map((m) => <Text key={m.id} style={{ margin: '2px 0' }}>• {m.name}: {m.mentions} mentions ({m.change > 0 ? '+' : ''}{m.change})</Text>)}
            </Section>
          )}
          <Text><a href={`${appUrl}`}>Open dashboard</a></Text>
          <Hr />
          <Text style={{ fontSize: 11, color: '#888' }}>You get this because you are a member of {orgName}. <a href={unsubscribeUrl}>Turn off the weekly digest</a>.</Text>
        </Container>
      </Body>
    </Html>
  );
}
