const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const aiService = require('../services/aiService');
const dbQueryExecutor = require('../services/dbQueryExecutor');

const upload = multer({ dest: 'uploads/' });

router.get('/collections', (req, res) => {
  const engine = req.query.engine;
  res.json({ collections: dbQueryExecutor.getAvailableCollections(engine) });
});

router.get('/collections/:name/data', async (req, res) => {
  try {
    const data = await dbQueryExecutor.executeQuery(req.params.name, 'find', {});
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/collections/:name', async (req, res) => {
  try {
    const engine = req.query.engine;
    await dbQueryExecutor.deleteCollection(req.params.name);
    res.json({ success: true, collections: dbQueryExecutor.getAvailableCollections(engine) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { dbEngine } = req.body;
    const filePath = req.file.path;
    const fileName = req.file.originalname;

    // Create a safe collection name (alphanumeric only)
    let collectionName = fileName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

    let jsonData = [];
    if (fileName.endsWith('.csv')) {
      jsonData = await new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (data) => results.push(data))
          .on('end', () => resolve(results))
          .on('error', reject);
      });
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    } else {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Only .csv and .xlsx files are supported.' });
    }

    if (jsonData.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'The uploaded file is empty.' });
    }

    // Automatically cast string representations of numbers to purely Numbers to prevent query logic failures
    jsonData = jsonData.map(row => {
      let newRow = {};
      for (let key in row) {
        let val = row[key];
        let cleanKey = key.trim(); // strip bad spaces
        if (typeof val === 'string') {
          val = val.trim();
          if (val !== '' && !isNaN(val)) {
            newRow[cleanKey] = Number(val);
          } else {
            newRow[cleanKey] = val;
          }
        } else {
          newRow[cleanKey] = val;
        }
      }
      return newRow;
    });

    // Extract columns from the first row
    const columns = Object.keys(jsonData[0]);

    // Avoid duplicate collection names
    const available = dbQueryExecutor.getAvailableCollections();
    if (available.includes(collectionName)) {
      collectionName = collectionName + '_' + Date.now();
    }

    dbQueryExecutor.registerCollection(collectionName, columns, dbEngine);
    await dbQueryExecutor.executeQuery(collectionName, 'insertMany', jsonData);

    fs.unlinkSync(filePath); // Cleanup

    return res.json({
      success: true,
      message: "File uploaded successfully",
      file: fileName,
      collectionName,
      collections: dbQueryExecutor.getAvailableCollections(dbEngine)
    });

  } catch (error) {
    console.error(error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(500).json({
      error: "Upload failed",
      details: error.message
    });
  }
});

router.post('/chat', async (req, res) => {
  const { naturalQuery, history, activeCollection, dbEngine } = req.body;

  if (!naturalQuery) {
    return res.status(400).json({ error: 'naturalQuery is required.' });
  }

  try {
    const availableCollections = dbQueryExecutor.getAvailableCollections(dbEngine);
    const allSchemasSummary = dbQueryExecutor.getAllSchemasSummary(dbEngine);

    // Parse user intent
    const intent = await aiService.processUserIntent(naturalQuery, history || [], availableCollections, allSchemasSummary, activeCollection, dbEngine);

    if (intent.action === 'CREATE_COLLECTION' && intent.createDetails) {
      // Validate that we have the table name and columns
      const { collectionName, columns, sampleData } = intent.createDetails;
      if (!collectionName || !columns || columns.length === 0) {
        return res.json({
          success: true,
          action: "ASK_CLARIFICATION",
          replyMessage: "I need a name and columns to create the table. Could you provide them?"
        });
      }

      // Register schema in mongoose and save it
      dbQueryExecutor.registerCollection(collectionName, columns, dbEngine);

      let results = [];
      if (sampleData && sampleData.length > 0) {
        results = await dbQueryExecutor.executeQuery(collectionName, 'insertMany', sampleData);
      }

      return res.json({
        success: true,
        action: 'CREATE_COLLECTION',
        replyMessage: intent.replyMessage || `Created NoSQL table '${collectionName}' successfully.`,
        results: results,
        collections: dbQueryExecutor.getAvailableCollections(dbEngine)
      });
    }

    if (intent.action === 'QUERY' && intent.mongoQuery) {
      let errorDetails = null;
      let results = null;

      try {
        results = await dbQueryExecutor.executeQuery(
          intent.mongoQuery.collectionName,
          intent.mongoQuery.type,
          intent.mongoQuery.query,
          intent.mongoQuery.options
        );
      } catch (dbErr) {
        errorDetails = dbErr.message;
      }

      return res.json({
        success: true,
        action: 'QUERY',
        replyMessage: intent.replyMessage || "Executing database query...",
        query: intent.mongoQuery.rawQueryString,
        results: results,
        dbError: errorDetails
      });
    }

    // Default catch-all (ASK_CLARIFICATION, GENERAL_CHAT)
    return res.json({
      success: true,
      action: intent.action,
      replyMessage: intent.replyMessage
    });

  } catch (error) {
    console.error('Error in /chat:', error);
    if (!process.env.GEMINI_API_KEY) {
      return res.status(200).json({ success: false, error: "⚠️ MISSING API KEY: You must open backend/.env and insert your real GEMINI_API_KEY to use the chat interface!" });
    }
    res.status(500).json({ success: false, error: error.message || "AI Parsing failed or database error occurred." });
  }
});

module.exports = router;
