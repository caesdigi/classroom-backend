const router = require('express').Router();
const pool = require('../db');

// Get bookings for a room/date
router.get('/', async (req, res) => {
  try {
    const { start_date, end_date, show_cancelled } = req.query;
    const result = await pool.query(
      `SELECT * FROM bookings 
       WHERE start_time < $2 
       AND end_time > $1
       ${show_cancelled === 'false' ? 'AND is_cancelled = false' : ''}`, 
      [start_date, end_date]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create booking
router.post('/', async (req, res) => {
  const { room_id, student_name, student_email, student_phone, uid, remarks, start_time, end_time } = req.body;
  try {
    // Check for overlapping bookings
    const conflictCheck = await pool.query(
      `SELECT * FROM bookings 
      WHERE room_id = $1 
      AND (start_time, end_time) OVERLAPS ($2, $3)
      AND is_cancelled = false`,
      [room_id, start_time, end_time]
    );
    if (conflictCheck.rows.length > 0) {
      return res.status(400).json({ error: "This slot is occupied." });
    }
    // Add UID validation
    if (!/^\d{5}$/.test(uid)) {
      return res.status(400).json({ error: "Invalid UID - 10 digits needed." });
    }

    const result = await pool.query(
      `INSERT INTO bookings 
      (room_id, student_name, student_email, student_phone, uid, remarks, start_time, end_time) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [room_id, student_name, student_email, student_phone, uid, remarks, start_time, end_time]
    );

    // Send confirmation email (see next step)
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel route
router.post('/cancel', async (req, res) => {
  const { booking_id, uid_attempt } = req.body;
  
  try {
    // Verify UID match using the uid column (5 digits)
    const result = await pool.query(
      `UPDATE bookings 
       SET is_cancelled = true 
       WHERE id = $1 
       AND uid = $2 
       AND is_cancelled = false 
       RETURNING id`,
      [booking_id, uid_attempt]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ 
        error: "invalid cancellation code" 
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Cancellation error:', err);
    res.status(500).json({ error: "Cancellation failed." });
  }
});

module.exports = router;