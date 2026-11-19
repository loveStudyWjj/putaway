import type { AiResult } from './types';
import type { AiSettings } from './settings';

const PROMPT = `你是物品识别助手。观察图片中的物品，只输出一个 JSON 对象（不要输出其他文字、不要用代码块包裹）：
{"name":"物品名称","categoryPath":"建议分类路径，层级用/分隔，例如 厨房/调料","description":"一句话描述","quantity":1,"attributes":{"属性名":"属性值"},"tags":["标签"]}
规则：name 用简洁中文名；attributes 只保留图片中能看出的属性（如品牌/颜色/材质/型号/规格/数量单位），不确定就留空对象；quantity 取整数；tags 给 1-3 个。 /no_think`;

function extractJson(text: string): any {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

export async function recognizeItem(base64Jpeg: string, s: AiSettings): Promise<AiResult> {
  if (!s.apiKey) throw new Error('请先在「设置」里填写 API Key');
  if (!s.model) throw new Error('请先在「设置」里填写模型名称');

  const url = s.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${s.apiKey}`,
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: s.model,
        temperature: 0.2,
        max_tokens: 1500,
        // vLLM/Qwen：关闭思考模式，直接输出 JSON
        chat_template_kwargs: { enable_thinking: false },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Jpeg}` } },
            ],
          },
        ],
      }),
    });
  } catch (e: any) {
    throw new Error(e?.name === 'AbortError' ? '识别超时，请检查网络后重试' : `网络错误：${e?.message ?? e}`);
  } finally {
    clearTimeout(timer);
  }

  const body = await res.text();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      msg = JSON.parse(body)?.error?.message ?? msg;
    } catch {
      msg = body.slice(0, 200) || msg;
    }
    throw new Error(`识别失败：${msg}`);
  }

  let content = '';
  try {
    content = JSON.parse(body).choices?.[0]?.message?.content ?? '';
  } catch {
    throw new Error('接口返回格式异常');
  }
  if (!content) throw new Error('模型未返回内容，该模型可能不支持识图');

  const raw = extractJson(content);
  const attrs: Record<string, string> = {};
  if (raw.attributes && typeof raw.attributes === 'object') {
    for (const [k, v] of Object.entries(raw.attributes)) {
      if (k && v != null && String(v).trim()) attrs[String(k).trim()] = String(v).trim();
    }
  }
  return {
    name: String(raw.name ?? '').trim(),
    categoryPath: String(raw.categoryPath ?? '').trim(),
    description: String(raw.description ?? '').trim(),
    quantity: Math.max(1, parseInt(raw.quantity, 10) || 1),
    attributes: attrs,
    tags: Array.isArray(raw.tags) ? raw.tags.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 6) : [],
  };
}
