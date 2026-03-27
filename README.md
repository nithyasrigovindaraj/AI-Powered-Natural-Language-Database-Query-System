# AI Database Querying System

This project allows non-technical users to query a MongoDB database using natural language (powered by Gemini AI). It features a full-stack architecture with a Node.js backend and a React (Vite) frontend containing premium design aesthetics and voice input capabilities.

## Architecture
- **Frontend**: React.js, vanilla CSS with glassmorphism, Web Speech API for voice.
- **Backend**: Node.js/Express.js, Mongoose for DB execution, Google Gemini AI API for generating queries.
- **Database**: MongoDB

## Prerequisites
- Node.js installed
- MongoDB installed and running locally on port 27017 (or a MongoDB Atlas string)
- A Google Gemini API Key

## Setup Instructions

### 1. Database
Ensure your MongoDB is running locally.

### 2. Backend Setup
1. Open the \`backend\` folder.
2. Edit the \`.env\` file and add your \`GEMINI_API_KEY\`.
   - Optionally update the \`MONGO_URI\` if needed.
3. Run \`npm install\` inside the backend directory.
4. Run \`node seed.js\` to initialize the database with sample "cities" data.
5. Start the backend with \`npm run dev\`. The API will run on \`http://localhost:5000\`.

### 3. Frontend Setup
1. Open the \`frontend\` folder.
2. Run \`npm install\` to install the dependencies.
3. Start the Vite dev server with \`npm run dev\`.
4. Open the displayed URL (usually \`http://localhost:5173\`) in your browser to interact with the AI Chat Interface.

### Example Queries
- "Show me all cities in the USA"
- "Which cities have a population over 10 million?"
- "Sort the cities by temperature in descending order"
- "Show me London"

## Features
- Natural language to MongoDB Query Pipeline
- Modern frontend UI
- Intelligent database schema recognition
- Table rendering of data responses
