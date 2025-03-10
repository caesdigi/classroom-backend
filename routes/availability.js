const router = require('express').Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  try {
    const { room_id } = req.query;
    const result = await pool.query(
      'SELECT * FROM availability WHERE room_id = $1',
      [room_id]
    );
    
    // Format dates to strings
    const formattedData = result.rows.map(row => ({
      ...row,
      min_date: moment(row.min_date).format('YYYY-MM-DD'),
      max_date: moment(row.max_date).format('YYYY-MM-DD'),
      blocked_dates: row.blocked_dates?.map(d => moment(d).format('YYYY-MM-DD')) || []
    }));
    
    res.json(formattedData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;