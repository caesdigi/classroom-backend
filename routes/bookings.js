const router = require('express').Router();
const pool = require('../db');

// Get bookings for a room/date
router.get('/', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const result = await pool.query(
      `SELECT * FROM bookings 
       WHERE start_time < $2 
       AND end_time > $1`,
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
      'SELECT * FROM bookings WHERE room_id = $1 AND (start_time, end_time) OVERLAPS ($2, $3)',
      [room_id, start_time, end_time]
    );
    if (conflictCheck.rows.length > 0) {
      return res.status(400).json({ error: "Slot already booked" });
    }
    // Add UID validation
    if (!/^\d{5}$/.test(uid)) {
      return res.status(400).json({ error: "Invalid UID format" });
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

// Cancel booking
router.post('/cancel', async (req, res) => {
  const { booking_id, uid_attempt } = req.body;
  
  // Temporary debug logs
  console.log('Cancellation attempt for booking:', booking_id);
  console.log('UID attempt:', uid_attempt);

  try {
    // Verify UID match
    const uidCheck = await pool.query(
      `SELECT id FROM bookings 
       WHERE id = $1 
       AND uid = $2 
       AND cancel_token IS FALSE`,
      [booking_id, uid_attempt]
    );

    // Debug log query results
    console.log('UID check results:', uidCheck.rows);

    if (uidCheck.rows.length === 0) {
      console.log('No matching active booking found');
      return res.status(400).json({ 
        error: "Invalid cancellation code or already cancelled" 
      });
    }

    // Mark as cancelled
    const updateResult = await pool.query(
      `UPDATE bookings 
       SET cancel_token = TRUE 
       WHERE id = $1 
       RETURNING id`,
      [booking_id]
    );

    // Debug log update results
    console.log('Update results:', updateResult.rows);

    res.json({ 
      success: true,
      message: "Booking cancelled successfully"
    });

  } catch (err) {
    console.error('Cancellation error:', err);
    res.status(500).json({ 
      error: "Internal server error during cancellation" 
    });
  }
});

module.exports = router;