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
      'http://127.0.0.1:5173', // Alternative localhost
      'https://classroom-frontend-a0n6.onrender.com' //production domain
    ],
    methods: ['GET', 'POST', 'PATCH'],
    credentials: true
  };

  app.use(cors(corsOptions));
  app.use(express.json());

// Import routes
const bookingsRouter = require('./routes/bookings');
const roomsRouter = require('./routes/rooms');
const availabilityRouter = require('./routes/availability');
const equipmentRouter = require('./routes/equipment');
const equipmentTypesRouter = require('./routes/equipmentTypes');
app.use('/api/bookings', bookingsRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api/equipment', equipmentRouter);
app.use('/api/equipment-types', equipmentTypesRouter);

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));