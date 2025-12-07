import { GoogleGenAI, Type } from "@google/genai";
import type { InsightResponse } from '../types';

// Get API key from environment variables
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

/**
 * Gets AI-powered trip insights including fun facts and suggested stops along the route
 * @param origin Starting point name
 * @param destination Ending point name
 * @param distanceKm Distance in kilometers
 * @param language Language code ('en' or 'uk')
 * @returns Trip insights and suggested stops
 */
export const getTripInsights = async (
  origin: string,
  destination: string,
  distanceKm: number,
  language: string = 'en'
): Promise<InsightResponse> => {
  if (!API_KEY) {
    return {
      content: language === 'uk'
        ? "Для отримання AI інсайтів потрібен валідний API ключ."
        : "AI Insights require a valid API Key.",
      suggestedStops: []
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    const langInstruction = language === 'uk'
      ? "Respond in Ukrainian language."
      : "Respond in English language.";

    const prompt = `
      I am planning a road trip from ${origin} to ${destination}.
      The distance is approximately ${distanceKm.toFixed(1)} km.
      ${langInstruction}

      Task:
      1. Provide 2-3 brief, interesting fun facts or potential quick pit-stops along this route.
      2. Suggest 1 or 2 specific cities or towns to stop at that are directly on the route.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            content: {
              type: Type.STRING,
              description: "Brief, interesting fun facts or potential quick pit-stops along this route.",
            },
            suggestedStops: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING
              },
              description: "List of 1 or 2 specific cities or towns to stop at that are directly on the route.",
            },
          },
        },
      }
    });

    const text = response.text || "{}";
    const data = JSON.parse(text);

    return {
      content: data.content || (language === 'uk' ? "Інформація відсутня." : "No specific insights available."),
      suggestedStops: Array.isArray(data.suggestedStops) ? data.suggestedStops : []
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      content: language === 'uk'
        ? "Не вдалося отримати дані."
        : "Could not retrieve AI insights at this time.",
      suggestedStops: []
    };
  }
};
