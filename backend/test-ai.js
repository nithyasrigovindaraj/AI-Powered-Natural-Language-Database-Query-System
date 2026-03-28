require('dotenv').config();
const axios = require('axios');

async function run() {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY ? process.env.OPENROUTER_API_KEY.trim() : '';
    if (!apiKey) {
      throw new Error("Missing OPENROUTER_API_KEY");
    }

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: "mistralai/mistral-7b-instruct:free",
        messages: [{ role: "user", content: "Test prompt: Provide a simple hello world" }]
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log("Success:", response.data.choices[0].message.content);
  } catch (error) {
    console.error("OpenRouter API Error:", error.response ? error.response.data : error.message);
  }
}
run();
