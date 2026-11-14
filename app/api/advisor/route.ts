import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { enforceRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

interface AdvisorPlan {
  architecture: string;
  techStack: string[];
  keyModules: string[];
  timeline: string;
  estimatedCost: string;
  notes?: string;
}

interface AdvisorResponsePayload {
  reply: string;
  plan?: AdvisorPlan;
  conversationId?: string | null;
}

function parseJsonResponse(rawText: string): { reply: string; plan?: AdvisorPlan } {
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed.reply === 'string') {
      return {
        reply: parsed.reply,
        plan: parsed.plan && typeof parsed.plan.architecture === 'string' ? parsed.plan : undefined,
      };
    }
  } catch {
    // Plain text answer from model
  }
  return { reply: rawText.trim() };
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'advisor');
  if (limited) return limited;

  try {
    const body = await req.json();
    const message = String(body.message || '').trim();
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const userId = body.userId ? String(body.userId) : null;
    const deviceId = body.deviceId ? String(body.deviceId) : 'web-visitor';
    let conversationId: string | null = body.conversationId ? String(body.conversationId) : null;
    const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

    // Ensure conversation record exists in Supabase
    try {
      const now = new Date().toISOString();
      if (!conversationId) {
        const { data: conv } = await supabaseAdmin
          .from('ai_conversations')
          .insert([{ user_id: userId, device_id: deviceId, status: 'active', last_message_at: now }])
          .select('id')
          .single();
        if (conv?.id) conversationId = conv.id;
      } else {
        await supabaseAdmin
          .from('ai_conversations')
          .update({ last_message_at: now, updated_at: now })
          .eq('id', conversationId);
      }
      if (conversationId) {
        await supabaseAdmin
          .from('ai_messages')
          .insert([{ conversation_id: conversationId, sender_type: 'user', content: message }]);
      }
    } catch (dbErr) {
      console.warn('Advisor DB log notice:', dbErr);
    }

    // Load live services from Supabase for grounded recommendations
    let catalogContext = '';
    try {
      const { data: svcs } = await supabaseAdmin
        .from('services')
        .select('title, price_min, service_plans(level, price_min, estimated_delivery_time)')
        .eq('is_active', true)
        .limit(8);
      if (svcs && svcs.length > 0) {
        catalogContext = `\nLive Taliyo Marketplace catalog:\n${JSON.stringify(svcs)}`;
      }
    } catch {}

    const basePrompt =
      process.env.TALIYO_AI_SYSTEM_PROMPT ||
      'You are Taliyo AI Project Advisor, a senior software architect for Taliyo Technologies.';

    const systemPrompt = `${basePrompt}
${catalogContext}
Respond ONLY in valid JSON with this exact schema:
{
  "reply": "short helpful response in English/Hinglish as needed",
  "plan": {
    "architecture": "concise architecture style",
    "techStack": ["item1", "item2"],
    "keyModules": ["mod1", "mod2"],
    "timeline": "realistic timeline",
    "estimatedCost": "INR range based on catalog or project scope",
    "notes": "optional concise caveat"
  }
}
Include "plan" whenever the user asks for an architecture, app, website, software system, or cost estimate.`;

    let aiResult: { reply: string; plan?: AdvisorPlan } | null = null;

    // 1. Try Groq API
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      try {
        const groqMessages = [
          { role: 'system', content: systemPrompt },
          ...history.map((h: { sender?: string; text?: string }) => ({
            role: h.sender === 'user' ? 'user' : 'assistant',
            content: String(h.text || ''),
          })),
          { role: 'user', content: message },
        ];
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: (process.env.GROQ_MODEL || 'openai/gpt-oss-20b').split(',')[0].trim(),
            messages: groqMessages,
            temperature: 0.4,
            response_format: { type: 'json_object' },
          }),
        });
        if (res.ok) {
          const json = await res.json();
          const content = json?.choices?.[0]?.message?.content;
          if (typeof content === 'string' && content.trim()) {
            aiResult = parseJsonResponse(content);
          }
        }
      } catch (e) {
        console.warn('Groq advisor notice:', e);
      }
    }

    // 2. Fallback to Gemini API if Groq failed or absent
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!aiResult && geminiKey) {
      try {
        const model = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').split(',')[0].trim();
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: 'user', parts: [{ text: message }] }],
              generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
            }),
          }
        );
        if (res.ok) {
          const json = await res.json();
          const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (typeof text === 'string' && text.trim()) {
            aiResult = parseJsonResponse(text);
          }
        }
      } catch (e) {
        console.warn('Gemini advisor notice:', e);
      }
    }

    if (!aiResult) {
      return NextResponse.json(
        { error: 'AI service is temporarily unavailable. Please try again or contact WhatsApp support.' },
        { status: 503 }
      );
    }

    // Persist assistant response
    try {
      if (conversationId) {
        await supabaseAdmin.from('ai_messages').insert([
          {
            conversation_id: conversationId,
            sender_type: 'assistant',
            content: aiResult.reply,
          },
        ]);
      }
    } catch {}

    const payload: AdvisorResponsePayload = {
      reply: aiResult.reply,
      plan: aiResult.plan,
      conversationId,
    };

    return NextResponse.json(payload);
  } catch (err: unknown) {
    console.error('Advisor API error:', err);
    return NextResponse.json({ error: 'Failed to generate AI advice' }, { status: 500 });
  }
}
