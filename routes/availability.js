const router = require('express').Router();
const pool = require('../db');

uter.get('/', async (req, res) => {
  try {
    const { room_id } = req.query;
    const result = await pool.query(
      'SELECT * FROM availability WHERE room_id = $1',
      [room_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;