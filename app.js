// app.js
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// Configure CORS
const corsOptions = {
    origin: [
      'http://localhost:5173', // Vite default
      'http://127.0.0.1:5173' // Alternative localhost
    ],
    methods: ['GET', 'POST'],
    credentials: true
  };

  app.use(cors(corsOptions));
  app.use(express.json());

// Import routes
const bookingsRouter = require('./routes/bookings');
app.use('/api/bookings', bookingsRouter);

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));