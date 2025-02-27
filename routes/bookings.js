const router = require('express').Router();
const pool = require('../db');

// Get bookings for a room/date
router.get('/', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const result = await pool.query(
      'SELECT * FROM bookings WHERE start_time >= $1 AND end_time <= $2',
      [start_date, end_date]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create booking
router.post('/', async (req, res) => {
  const { room_id, student_name, student_email, student_phone, start_time, end_time } = req.body;
  try {
    // Check for overlapping bookings
    const conflictCheck = await pool.query(
      'SELECT * FROM bookings WHERE room_id = $1 AND (start_time, end_time) OVERLAPS ($2, $3)',
      [room_id, start_time, end_time]
    );
    if (conflictCheck.rows.length > 0) {
      return res.status(400).json({ error: "Slot already booked" });
    }

    const result = await pool.query(
      'INSERT INTO bookings (room_id, student_name, student_email, student_phone, start_time, end_time) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [room_id, student_name, student_email, student_phone, start_time, end_time]
    );

    // Send confirmation email (see next step)
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;