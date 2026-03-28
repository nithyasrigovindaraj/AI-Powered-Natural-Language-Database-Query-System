const axios = require('axios');

async function callAI(prompt) {
  const apiKey = process.env.OPENROUTER_API_KEY ? process.env.OPENROUTER_API_KEY.trim() : '';
  
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: "meta-llama/llama-3.1-8b-instruct:free",
        messages: [{ role: "user", content: prompt }]
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // 🧪 DEBUG STEP: Log full response for debugging
    console.log(JSON.stringify(response.data, null, 2));

    const aiText = response.data?.choices?.[0]?.message?.content;
    
    // If AI returns empty or undefined: return a safe fallback message
    if (!aiText) {
      console.error("AI returned empty/undefined response.");
      return `{ "action": "GENERAL_CHAT", "replyMessage": "I'm having trouble connecting to the AI brain right now. Please try again in a moment." }`;
    }

    return aiText;
  } catch (error) {
    console.error("OpenRouter API Error: ", error.response?.data || error.message);
    throw new Error(
      error.response?.data?.error?.message || 
      error.message || 
      "Failed to communicate with OpenRouter API."
    );
  }
}

async function processUserIntent(naturalQuery, chatHistory, availableCollections, allSchemasSummary, activeCollection, dbEngine) {
  const prompt = `
You are a highly capable AI Database Assistant for managing a NoSQL database. 
Your goal is to parse user intents and generate executable queries dynamically. 

IMPORTANT DIRECTIVE: The user has selected **${dbEngine || 'MongoDB'}** as their NoSQL Database Engine. 
You MUST format all syntax output according to ${dbEngine || 'MongoDB'} standards inside the property "rawQueryString".

Current collections available: [${availableCollections.join(', ')}]
Currently Active/Focused Collection: ${activeCollection || 'None'}
Current schema details:
${allSchemasSummary}

Recent conversation history:
${chatHistory.map(h => `User: ${h.user}\nAssistant: ${h.bot}`).join('\n')}

Latest User Input: "${naturalQuery}"

Respond strictly with valid JSON representing the appropriate action. NO MARKDOWN, NO COMMENTS, ONLY JSON!
Look at the user's latest input and decide which "action" they are intending:

1. ACTION: "ASK_CLARIFICATION" 
   Choose this if they are giving an intent to create a table/database but haven't provided enough info (e.g., they didn't provide table name, columns, or rows). 
   CRITICAL RULE: Even if they provided table name, columns, and rows in their first prompt, you MUST still use "ASK_CLARIFICATION" to ask for their final confirmation (e.g., "Are you sure you want to create...?"). ONLY proceed to "CREATE_COLLECTION" if they say "yes" or confirm it in the history sequence.
   Return format:
   { "action": "ASK_CLARIFICATION", "replyMessage": "..." }

2. ACTION: "CREATE_COLLECTION"
   Choose this ONLY AFTER the user has confirmed they want to proceed with creation (e.g., they replied "yes" to your confirmation), AND you know the table name and columns.
   Return format:
   {
     "action": "CREATE_COLLECTION",
     "replyMessage": "Creating table 'salaries'...",
     "createDetails": {
        "collectionName": "...",
        "columns": ["col1", "col2"],
        "sampleData": [ {"col1": "val", "col2": 123} ]
     }
   }

3. ACTION: "QUERY"
   Choose this if the user wants to get, find, or aggregate data from an existing table.
   CRITICAL RULES:
   - If the user doesn't explicitly name a table, you MUST use the "Currently Active/Focused Collection" if it's set.
   - For string matches, ALWAYS use case-insensitive regex! Example: "name": { "$regex": "david", "$options": "i" }. 
   - Never assume exact case for strings!
   Return format:
   {
     "action": "QUERY",
     "replyMessage": "Query executed successfully.",
     "mongoQuery": {
        "collectionName": "...", /* Use Currently Active/Focused Collection! */
        "type": "find" or "aggregate" or "findOne",
        "query": { /* Standard generic JSON object for backend compatibility */ },
        "options": { /* sort, limit */ },
        "rawQueryString": "/* The raw native syntax formatted explicitly for ${dbEngine || 'MongoDB'} */"
     }
   }
   CRITICAL: The "query" property MUST be a standard JSON representation so the local executor can mock it.
   CRITICAL: The "rawQueryString" MUST be beautifully formatted in the exact syntax of the user's chosen DB (${dbEngine || 'MongoDB'}).

4. ACTION: "GENERAL_CHAT"
   Choose this if the user is just saying hi or chatting.
   Return format:
   { "action": "GENERAL_CHAT", "replyMessage": "..." }

Analyze the input and generate the JSON object:
`;

  try {
    const resultTextRaw = await callAI(prompt);
    
    let resultText = resultTextRaw.replace(/```json/g, '').replace(/```/g, '').trim();

    const parsedJson = JSON.parse(resultText);
    return parsedJson;
  } catch (error) {
    console.error("AI Generate Error: ", error);
    throw new Error(error.message || "Failed to process user intent using the AI Model. Please try again.");
  }
}

module.exports = {
  processUserIntent,
  callAI
};
