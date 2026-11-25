import 'server-only';
import { createHmac } from 'node:crypto';
import { AwsClient } from 'aws4fetch';
import { safeFetch } from '../net/safe-fetch';
import { errDetail, result, str, type Check, type Tester } from './types';

/** Per-org ExternalId for the cross-account role trust policy: HMAC(AWS_EXTERNAL_ID_SECRET, orgId). */
export function awsExternalId(orgId: string): string | null {
  const s = process.env.AWS_EXTERNAL_ID_SECRET;
  return s ? `beacon-${createHmac('sha256', s).update(orgId).digest('hex').slice(0, 24)}` : null;
}

const tag = (xml: string, t: string) => xml.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? null;

async function send(client: AwsClient, url: string, init: RequestInit & { aws?: { service?: string; region?: string } } = {}) {
  const signed = await client.sign(url, init);
  const res = await safeFetch(signed, { integration: 'aws' });
  return { status: res.status, ok: res.ok, text: await res.text(), headers: res.headers };
}

export const test: Tester = async (ctx) => {
  if (str(ctx.data.cloud_provider) !== 'aws') return result([], ['Only AWS is tested automatically; other providers are reviewed manually'], true);
  const region = str(ctx.data.aws_region) ?? 'us-east-1';
  const bucket = str(ctx.data.s3_bucket);
  const dist = str(ctx.data.cloudfront_distribution_id);
  const roleArn = str(ctx.data.aws_role_arn);
  const cdn = str(ctx.data.cdn_base_url);
  const checks: Check[] = [];
  const missing: string[] = [];

  // 1. credentials: assume the client's role with our principal, or use their access keys
  let creds: { accessKeyId: string; secretAccessKey: string; sessionToken?: string } | null = null;
  try {
    if (roleArn) {
      const ext = awsExternalId(ctx.orgId);
      const ourKey = process.env.AWS_ACCESS_KEY_ID, ourSecret = process.env.AWS_SECRET_ACCESS_KEY;
      if (!ext || !ourKey || !ourSecret) return result([], ['AWS_EXTERNAL_ID_SECRET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'].filter((n) => !process.env[n]), true);
      const ours = new AwsClient({ accessKeyId: ourKey, secretAccessKey: ourSecret, sessionToken: process.env.AWS_SESSION_TOKEN, service: 'sts', region: 'us-east-1' });
      const q = new URLSearchParams({ Action: 'AssumeRole', Version: '2011-06-15', RoleArn: roleArn, RoleSessionName: 'beacon-connection-test', ExternalId: ext, DurationSeconds: '900' });
      const r = await send(ours, `https://sts.amazonaws.com/?${q}`);
      if (r.ok) creds = { accessKeyId: tag(r.text, 'AccessKeyId')!, secretAccessKey: tag(r.text, 'SecretAccessKey')!, sessionToken: tag(r.text, 'SessionToken')! };
      checks.push({ id: 'aws_assume_role', label: 'Role can be assumed', ok: r.ok, detail: r.ok ? 'AssumeRole succeeded' : `${tag(r.text, 'Code') ?? `HTTP ${r.status}`}: ${tag(r.text, 'Message') ?? ''}`.slice(0, 200) });
    } else {
      const keyId = str(ctx.data.aws_access_key_id);
      const secret = await ctx.secret('aws_secret_access_key');
      if (!keyId || !secret) return result([], ['aws_role_arn (preferred) or aws_access_key_id + aws_secret_access_key']);
      const c = new AwsClient({ accessKeyId: keyId, secretAccessKey: secret, service: 'sts', region: 'us-east-1' });
      const r = await send(c, 'https://sts.amazonaws.com/?Action=GetCallerIdentity&Version=2011-06-15');
      if (r.ok) creds = { accessKeyId: keyId, secretAccessKey: secret };
      checks.push({ id: 'aws_assume_role', label: 'Access keys valid', ok: r.ok, detail: r.ok ? `caller ${tag(r.text, 'Arn')}` : `HTTP ${r.status}` });
    }
  } catch (e) {
    checks.push({ id: 'aws_assume_role', label: 'Role can be assumed', ok: false, detail: errDetail(e) });
  }
  if (!creds) return result(checks, missing);

  // 2. S3 read/write under beacon/, and must be denied outside it
  const key = 'beacon/_connection-test.txt';
  if (bucket) {
    try {
      const s3 = new AwsClient({ ...creds, service: 's3', region });
      const base = `https://${bucket}.s3.${region}.amazonaws.com`;
      const put = await send(s3, `${base}/${key}`, { method: 'PUT', body: 'Beacon GEO connection test', headers: { 'content-type': 'text/plain' } });
      const get = put.ok ? await send(s3, `${base}/${key}`) : null;
      const outside = await send(s3, `${base}/_beacon-outside-test.txt`, { method: 'PUT', body: 'x' });
      if (outside.ok) await send(s3, `${base}/_beacon-outside-test.txt`, { method: 'DELETE' });
      const ok = put.ok && !!get?.ok && !outside.ok;
      checks.push({ id: 'aws_s3_rw', label: 'S3 read/write under beacon/', ok,
        detail: !put.ok ? `PutObject denied (HTTP ${put.status})` : !get?.ok ? 'GetObject failed' : outside.ok ? 'over-permissioned: role can write outside beacon/' : 'put/get ok, outside prefix denied' });
      if (outside.ok) missing.push('Restrict the policy to beacon/* (security warning)');
      // delete happens after the public fetch check below
      if (cdn) {
        const pub = await safeFetch(`${cdn.replace(/\/$/, '')}/${key}`, { integration: 'scrape' }).catch(() => null);
        checks.push({ id: 'aws_public_fetch', label: 'Asset is served publicly', ok: !!pub?.ok, detail: pub ? `HTTP ${pub.status}` : 'not reachable' });
      } else missing.push('cdn_base_url');
      if (put.ok) await send(s3, `${base}/${key}`, { method: 'DELETE' });
    } catch (e) {
      checks.push({ id: 'aws_s3_rw', label: 'S3 read/write under beacon/', ok: false, detail: errDetail(e) });
    }
  } else missing.push('s3_bucket');

  // 3. CloudFront invalidation
  if (dist) {
    try {
      const cf = new AwsClient({ ...creds, service: 'cloudfront', region: 'us-east-1' });
      const d = await send(cf, `https://cloudfront.amazonaws.com/2020-05-31/distribution/${encodeURIComponent(dist)}`);
      const inv = d.ok ? await send(cf, `https://cloudfront.amazonaws.com/2020-05-31/distribution/${encodeURIComponent(dist)}/invalidation`, {
        method: 'POST', headers: { 'content-type': 'application/xml' },
        body: `<?xml version="1.0" encoding="UTF-8"?><InvalidationBatch xmlns="http://cloudfront.amazonaws.com/doc/2020-05-31/"><Paths><Quantity>1</Quantity><Items><Path>/${key}</Path></Items></Paths><CallerReference>beacon-${Date.now()}</CallerReference></InvalidationBatch>` }) : null;
      checks.push({ id: 'aws_cloudfront_invalidate', label: 'CloudFront invalidation', ok: !!inv?.ok,
        detail: !d.ok ? `GetDistribution HTTP ${d.status}` : inv?.ok ? `distribution ${tag(d.text, 'Status')}, invalidation created` : `CreateInvalidation denied (HTTP ${inv?.status})` });
    } catch (e) {
      checks.push({ id: 'aws_cloudfront_invalidate', label: 'CloudFront invalidation', ok: false, detail: errDetail(e) });
    }
  } else missing.push('cloudfront_distribution_id');
  return result(checks, missing);
};
