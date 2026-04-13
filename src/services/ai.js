'use strict';

/**
 * AI service for the 公论 platform.
 *
 * If OPENAI_API_KEY (or OPENAI_BASE_URL) is configured, real AI calls are
 * made.  Otherwise a deterministic rule-based fallback is used so the app
 * works out-of-the-box without any keys.
 */

const OPENAI_API_KEY  = process.env.OPENAI_API_KEY  || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL    = process.env.OPENAI_MODEL    || 'gpt-4o-mini';

// --------------------------------------------------------------------------
// Internal: call OpenAI-compatible chat API
// --------------------------------------------------------------------------
async function callLLM(systemPrompt, userPrompt) {
  if (!OPENAI_API_KEY) return null; // fall through to rule-based

  const url = `${OPENAI_BASE_URL}/chat/completions`;
  const body = JSON.stringify({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
    max_tokens: 512,
    temperature: 0.4,
  });

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// Rule-based fallback helpers
// --------------------------------------------------------------------------

function ruleBasedSummary(messages) {
  const total   = messages.length;
  const authors = [...new Set(messages.map(m => m.authorId))].length;
  const types   = messages.reduce((acc, m) => {
    acc[m.type] = (acc[m.type] || 0) + 1; return acc;
  }, {});

  const preview = messages
    .slice(0, 3)
    .map(m => `• ${m.content.slice(0, 80)}`)
    .join('\n');

  return `[讨论摘要] 本线程共 ${total} 条消息，${authors} 位参与者。` +
    (types.question ? `  其中问题 ${types.question} 个。` : '') +
    (types.relation ? `  关系节点 ${types.relation} 个。` : '') +
    `\n\n前几条消息:\n${preview}`;
}

function ruleBasedCluster(messages) {
  // Very simple clustering: group by first tag
  const clusters = {};
  for (const m of messages) {
    const tag = (m.tags && m.tags[0]) || 'general';
    if (!clusters[tag]) clusters[tag] = [];
    clusters[tag].push(m.id);
  }
  return clusters;
}

function ruleBasedCategories(content) {
  const lower = content.toLowerCase();
  const cats  = [];
  if (lower.includes('问题') || lower.includes('?') || lower.includes('？')) cats.push('question');
  if (lower.includes('建议') || lower.includes('应当') || lower.includes('应该')) cats.push('proposal');
  if (lower.includes('反对') || lower.includes('不认为') || lower.includes('但是')) cats.push('counter');
  if (lower.includes('总结') || lower.includes('综上')) cats.push('summary');
  if (cats.length === 0) cats.push('discussion');
  return cats;
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/**
 * Summarize a thread of messages.
 * @param {object[]} messages
 * @returns {Promise<string>}
 */
async function summarizeThread(messages) {
  if (messages.length === 0) return '（空线程）';

  const systemPrompt = '你是公论平台的 AI 助手，负责对讨论线程进行简洁的中文摘要。' +
    '摘要应包含主要观点、分歧点和已达成的共识（如有）。' +
    '不超过 200 字。';

  const userPrompt = messages
    .map((m, i) => `[${i + 1}] ${m.authorId}: ${m.content}`)
    .join('\n');

  const aiResult = await callLLM(systemPrompt, userPrompt);
  return aiResult || ruleBasedSummary(messages);
}

/**
 * Cluster messages by topic similarity.
 * @param {object[]} messages
 * @returns {Promise<object>}  { clusterLabel: [messageId, …] }
 */
async function clusterMessages(messages) {
  if (messages.length === 0) return {};

  const systemPrompt = '你是公论平台的 AI 助手。请将以下消息按主题聚类。' +
    '返回 JSON 格式，键为主题标签（中文），值为消息 ID 数组。只返回 JSON，不要其他内容。';

  const userPrompt = messages
    .map(m => {
      const safeContent = m.content
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .slice(0, 100);
      return `{"id":"${m.id}","content":"${safeContent}"}`;
    })
    .join('\n');

  const aiResult = await callLLM(systemPrompt, userPrompt);

  if (aiResult) {
    try {
      // Extract JSON even if wrapped in code fences
      const jsonStr = aiResult.replace(/```json?/g, '').replace(/```/g, '').trim();
      return JSON.parse(jsonStr);
    } catch {
      // fall through
    }
  }

  return ruleBasedCluster(messages);
}

/**
 * Auto-categorize a single message.
 * @param {string} content
 * @returns {Promise<string[]>}  array of category tags
 */
async function categorizeMessage(content) {
  const systemPrompt = '你是公论平台的 AI 助手。请为以下消息返回 1-3 个分类标签（中文），' +
    '以 JSON 数组形式返回，例如 ["提案","讨论"]。只返回 JSON。';

  const aiResult = await callLLM(systemPrompt, content);

  if (aiResult) {
    try {
      const jsonStr = aiResult.replace(/```json?/g, '').replace(/```/g, '').trim();
      const parsed  = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through
    }
  }

  return ruleBasedCategories(content);
}

module.exports = { summarizeThread, clusterMessages, categorizeMessage };
