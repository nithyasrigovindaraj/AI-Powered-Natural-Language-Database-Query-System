const mongoose = require('mongoose');
const { models } = require('./services/dbQueryExecutor');
require('dotenv').config();

const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/aidb_test';

mongoose.connect(mongoURI)
  .then(async () => {
    console.log('Connected to MongoDB for seeding...');
    const City = models['cities'];

    // Clear existing data
    await City.deleteMany({});

    const sampleCities = [
      { name: "New York", country: "USA", population: 8400000, temperature: 15 },
      { name: "London", country: "UK", population: 8900000, temperature: 10 },
      { name: "Tokyo", country: "Japan", population: 13900000, temperature: 22 },
      { name: "Sydney", country: "Australia", population: 5300000, temperature: 25 },
      { name: "Paris", country: "France", population: 2100000, temperature: 18 },
      { name: "Moscow", country: "Russia", population: 11900000, temperature: -5 },
      { name: "Chennai", country: "India", population: 10900000, temperature: 35 },
      { name: "Reykjavik", country: "Iceland", population: 130000, temperature: 2 },
      { name: "Nairobi", country: "Kenya", population: 4300000, temperature: 24 }
    ];

    await City.insertMany(sampleCities);
    console.log(`Inserted ${sampleCities.length} cities.`);
    
    mongoose.disconnect();
    console.log('Seeding complete.');
  })
  .catch(err => {
    console.error('Error connecting to database:', err);
    process.exit(1);
  });
