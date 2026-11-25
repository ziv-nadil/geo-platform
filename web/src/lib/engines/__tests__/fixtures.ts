/**
 * SYNTHETIC fixtures. Hand-written to match each vendor's documented/SDK-typed response shape
 * (methodology section 2 + the installed SDK type definitions). They are NOT captured from live
 * APIs: vendor network access was not available when these were written. Replace with recorded
 * responses after the first live spike (docs/ISSUES.md).
 */

export const ANSWER_TEXT =
  'For mid-size teams, the best CRM options are:\n\n' +
  '1. **HubSpot** - strong free tier and marketing tools.\n' +
  '2. **Acme CRM** - praised for fast onboarding and great support (see acmecrm.com).\n' +
  '3. Salesforce - powerful but expensive.\n\n' +
  'Many Reddit users recommend Acme CRM for startups.';

export const openaiResponse = {
  id: 'resp_fixture',
  model: 'gpt-5.4-mini-2026-03-17',
  status: 'completed',
  output: [
    {
      type: 'web_search_call',
      id: 'ws_1',
      status: 'completed',
      action: {
        type: 'search',
        query: 'best CRM for mid-size teams 2026',
        sources: [
          { type: 'url', url: 'https://www.g2.com/categories/crm?utm_source=openai' },
          { type: 'url', url: 'https://www.reddit.com/r/sales/comments/abc/best_crm/' },
          { type: 'url', url: 'https://acmecrm.com/pricing' },
        ],
      },
    },
    { type: 'web_search_call', id: 'ws_2', status: 'completed', action: { type: 'search', query: 'Acme CRM reviews' } },
    {
      type: 'message',
      id: 'msg_1',
      role: 'assistant',
      status: 'completed',
      content: [
        {
          type: 'output_text',
          text: ANSWER_TEXT,
          annotations: [
            { type: 'url_citation', url: 'https://www.g2.com/categories/crm?utm_source=openai', title: 'Best CRM Software', start_index: 0, end_index: 45 },
            { type: 'url_citation', url: 'https://acmecrm.com/pricing?utm_source=openai', title: 'Acme CRM Pricing', start_index: 100, end_index: 180 },
          ],
        },
      ],
    },
  ],
  usage: { input_tokens: 12000, output_tokens: 900, input_tokens_details: { cached_tokens: 2000 } },
};

export const perplexityResponse = {
  id: 'pplx_fixture',
  model: 'sonar-pro',
  object: 'response',
  status: 'completed',
  output: [
    {
      type: 'search_results',
      queries: ['best crm mid-size teams'],
      results: [
        { id: 1, url: 'https://www.capterra.com/crm-software/', title: 'CRM Software', snippet: 'Compare CRM…' },
        { id: 2, url: 'https://acmecrm.com/', title: 'Acme CRM', snippet: 'Acme CRM home' },
        { id: 3, url: 'https://www.youtube.com/watch?v=xyz', title: 'CRM review', snippet: 'video' },
      ],
    },
    {
      type: 'message',
      id: 'm1',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: 'Acme CRM is a top pick [2], ahead of HubSpot [1].', annotations: [] }],
    },
  ],
  usage: {
    input_tokens: 4000,
    output_tokens: 300,
    total_tokens: 4300,
    cost: { currency: 'USD', input_cost: 0.001, output_cost: 0.002, tool_calls_cost: 0.005, total_cost: 0.008 },
    tool_calls_details: { web_search: { invocation: 2, cost_usd: 0.005 } },
  },
};

export const anthropicMessage = {
  id: 'msg_fixture',
  type: 'message',
  role: 'assistant',
  model: 'claude-haiku-5-5',
  stop_reason: 'end_turn',
  content: [
    { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'best CRM mid-size team' } },
    {
      type: 'web_search_tool_result',
      tool_use_id: 'srvtoolu_1',
      content: [
        { type: 'web_search_result', url: 'https://www.trustradius.com/crm', title: 'CRM reviews', encrypted_content: 'xxx', page_age: null },
        { type: 'web_search_result', url: 'https://acmecrm.com/customers', title: 'Customers', encrypted_content: 'yyy', page_age: null },
      ],
    },
    { type: 'text', text: 'Top options: ' },
    {
      type: 'text',
      text: 'Acme CRM is well reviewed for support',
      citations: [{ type: 'web_search_result_location', url: 'https://www.trustradius.com/crm', title: 'CRM reviews', cited_text: 'Acme CRM support is great', encrypted_index: 'e' }],
    },
    { type: 'text', text: ', while HubSpot leads on marketing.' },
  ],
  usage: { input_tokens: 15000, output_tokens: 800, server_tool_use: { web_search_requests: 1 } },
};

export const geminiResponse = {
  modelVersion: 'gemini-3.8-flash',
  candidates: [
    {
      finishReason: 'STOP',
      content: { parts: [{ text: 'Acme CRM offers fast onboarding. HubSpot has a free tier.' }] },
      groundingMetadata: {
        webSearchQueries: ['acme crm onboarding', 'hubspot free tier'],
        groundingChunks: [
          { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA', title: 'acmecrm.com', domain: 'acmecrm.com' } },
          { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/BBB', title: 'hubspot.com', domain: 'hubspot.com' } },
          { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/CCC', title: 'forbes.com', domain: 'forbes.com' } },
        ],
        groundingSupports: [
          { segment: { startIndex: 0, endIndex: 32, text: 'Acme CRM offers fast onboarding.' }, groundingChunkIndices: [0] },
          { segment: { startIndex: 33, endIndex: 57, text: 'HubSpot has a free tier.' }, groundingChunkIndices: [1] },
        ],
      },
    },
  ],
  usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 200, thoughtsTokenCount: 100, toolUsePromptTokenCount: 2500 },
};

export const dfsAioPresent = {
  status_code: 20000,
  status_message: 'Ok.',
  cost: 0.0012,
  tasks: [
    {
      id: '11251234-1535-0066-0000-abcdef123456',
      status_code: 20000,
      status_message: 'Ok.',
      cost: 0.0012,
      result: [
        {
          keyword: 'best crm for mid-size teams',
          items: [
            {
              type: 'ai_overview',
              markdown: 'Popular choices include **Acme CRM** and HubSpot.',
              items: [
                {
                  type: 'ai_overview_element',
                  title: 'Top CRMs',
                  text: 'Acme CRM and HubSpot are popular.',
                  references: [
                    { type: 'ai_overview_reference', source: 'G2', domain: 'g2.com', url: 'https://www.g2.com/categories/crm', title: 'G2 CRM', text: 'Acme CRM rated 4.7' },
                  ],
                },
              ],
              references: [
                { type: 'ai_overview_reference', source: 'Acme', domain: 'acmecrm.com', url: 'https://acmecrm.com/', title: 'Acme CRM' },
                { type: 'ai_overview_reference', source: 'G2', domain: 'g2.com', url: 'https://www.g2.com/categories/crm#top', title: 'G2 CRM' },
              ],
            },
            { type: 'organic', rank_absolute: 2, url: 'https://www.hubspot.com/', title: 'HubSpot' },
          ],
        },
      ],
    },
  ],
};

export const dfsAioAbsent = {
  status_code: 20000,
  cost: 0.0006,
  tasks: [{ id: 'x', status_code: 20000, cost: 0.0006, result: [{ keyword: 'q', items: [{ type: 'organic', url: 'https://a.com/' }] }] }],
};

export const dfsAiMode = {
  status_code: 20000,
  cost: 0.0012,
  tasks: [
    {
      id: 'y',
      status_code: 20000,
      cost: 0.0012,
      result: [
        {
          keyword: 'best crm',
          markdown: 'AI Mode answer mentioning Acme CRM.',
          items: [
            {
              type: 'ai_overview',
              markdown: 'AI Mode says Acme CRM is great for startups.',
              references: [{ type: 'ai_overview_reference', domain: 'reddit.com', url: 'https://www.reddit.com/r/crm/x', title: 'thread' }],
            },
          ],
        },
      ],
    },
  ],
};

export const dfsPending = { status_code: 20000, cost: 0, tasks: [{ id: 'z', status_code: 40602, status_message: 'Task In Queue.', cost: 0, result: null }] };

export const BRAND = {
  id: 'b1',
  kind: 'brand' as const,
  name: 'Acme CRM',
  aliases: ['Acme', 'AcmeCRM'],
  domains: ['acmecrm.com'],
  contextTerms: ['crm'],
};
export const COMPETITORS = [
  { id: 'c1', kind: 'competitor' as const, name: 'HubSpot', aliases: [], domains: ['hubspot.com'] },
  { id: 'c2', kind: 'competitor' as const, name: 'Salesforce', aliases: ['SFDC'], domains: ['salesforce.com'] },
];
