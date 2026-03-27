const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const queryRoutes = require('./routes/query');

const { MongoMemoryServer } = require('mongodb-memory-server');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());



// Connect to MongoDB Using Memory Server by default so users don't need it installed!
async function startServer() {
  try {
    const mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    
    await mongoose.connect(uri);
    console.log('Connected to In-Memory NoSQL DB successfully! No default databases seeded.');
    
    // Register routes
    app.use('/api', require('./routes/query'));

    app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
  } catch (err) {
    console.log('NoSQL DB connection error:', err);
  }
}

startServer();
