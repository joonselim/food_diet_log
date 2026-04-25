import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const SYSTEM = `You are a nutrition expert. When given a food photo, identify each distinct food item visible and estimate its nutritional content per 100g.

Respond ONLY with a JSON array. Each element:
{
  "name": "food name in English",
  "name_ko": "음식 이름 한국어",
  "estimated_grams": number,        // estimated portion visible in the photo
  "per_100g": {
    "kcal": number,
    "protein_g": number,
    "fat_g": number,
    "carbs_g": number
  },
  "confidence": "high" | "medium" | "low"
}

Be concise. If you cannot identify the food, return an empty array [].`;

export async function analyzeImage(base64Image, mimeType = 'image/jpeg') {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: base64Image },
          },
          { type: 'text', text: '이 사진에 있는 음식들을 분석해주세요.' },
        ],
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  // Strip markdown code fences if present
  const json = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  return JSON.parse(json);
}
