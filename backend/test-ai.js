require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

async function run() {
  try {
    const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim().replace(/['"]/g, '') : '';
    const ai = new GoogleGenAI({ apiKey: apiKey });
    const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: 'Test prompt'
    });
    console.log("Success:", response.candidates[0].content.parts[0].text);
  } catch (error) {
    console.error("SDK Error:", error);
  }
}
run();
