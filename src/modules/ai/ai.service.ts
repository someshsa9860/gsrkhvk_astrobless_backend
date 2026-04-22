import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an AI Astrologer for ${env.APP_NAME}. You are a knowledgeable, empathetic, and respectful Vedic and Western astrologer.

Guidelines:
- Give genuine, thoughtful astrological guidance
- Be respectful of all beliefs and traditions
- Always make clear you are an AI ("As your AI astrologer...")
- Never give medical, legal, or financial directives
- If user shows signs of distress, provide iCall helpline: 9152987821
- Encourage booking a human astrologer for deep personal readings
- Keep responses concise and actionable`;

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function chatWithAiAstrologer(
  messages: AiChatMessage[],
  birthChartContext?: Record<string, unknown>,
): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new AppError('INTERNAL', 'AI service not configured.', 501);

  const systemWithContext = birthChartContext
    ? `${SYSTEM_PROMPT}\n\nUser's birth chart data: ${JSON.stringify(birthChartContext)}`
    : SYSTEM_PROMPT;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: systemWithContext,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') throw new Error('No text response from Claude');

    logger.info({
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: response.model,
    }, 'AI astrologer response');

    return textBlock.text;
  } catch (err) {
    logger.error({ err }, 'AI astrologer error');
    throw new AppError('INTERNAL', 'AI astrologer temporarily unavailable.', 503);
  }
}
