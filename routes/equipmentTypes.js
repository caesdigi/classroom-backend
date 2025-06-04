const router = require('express').Router();
const pool = require('../db');

// Get all equipment types
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM equipment_types');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get subtypes by type_id
router.get('/:type_id/subtypes', async (req, res) => {
  try {
    const { type_id } = req.params;
    const result = await pool.query(
      'SELECT * FROM equipment_subtypes WHERE type_id = $1',
      [type_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;