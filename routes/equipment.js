const router = require('express').Router();
const pool = require('../db');

// Get equipment grouped by product_name
router.get('/catalogue', async (req, res) => {
  try {
    const query = `
      SELECT 
        product_name,
        BOOL_OR(availability) AS available,
        MIN(image_url) AS image_url,
        es.subtype_name,
        et.type_name,
        et.type_id,
        es.subtype_id
      FROM equipment e
      JOIN equipment_subtypes es ON e.subtype_id = es.subtype_id
      JOIN equipment_types et ON es.type_id = et.type_id
      GROUP BY product_name, es.subtype_name, et.type_name, et.type_id, es.subtype_id
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get equipment details by product_name
router.get('/details/:product_name', async (req, res) => {
  try {
    const { product_name } = req.params;
    const query = `
      SELECT 
        e.*,
        es.subtype_name,
        et.type_name
      FROM equipment e
      JOIN equipment_subtypes es ON e.subtype_id = es.subtype_id
      JOIN equipment_types et ON es.type_id = et.type_id
      WHERE e.product_name = $1
    `;
    const result = await pool.query(query, [product_name]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get non-empty subtypes (subtypes with at least one equipment)
router.get('/non-empty-subtypes', async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT es.subtype_id, es.subtype_name, es.type_id
      FROM equipment e
      JOIN equipment_subtypes es ON e.subtype_id = es.subtype_id
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;