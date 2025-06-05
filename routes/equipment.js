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
      ORDER BY product_name;  -- Added alphabetical ordering
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
      ORDER BY variant;  -- Added alphabetical ordering for variants
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

// Add this route at the bottom of the file
router.post('/reserve', async (req, res) => {
  const client = await pool.connect();
  try {
    const { 
      product_name, 
      variant, 
      student_name, 
      student_email, 
      student_phone, 
      uid, 
      checkout_date 
    } = req.body;

    await client.query('BEGIN');

    // 1. Check availability
    const availabilityQuery = `
      SELECT equipment_id 
      FROM equipment 
      WHERE product_name = $1 
        AND (variant = $2 OR ($2 IS NULL AND variant IS NULL))
        AND availability = true
      LIMIT 1
      FOR UPDATE;
    `;
    
    const availabilityRes = await client.query(availabilityQuery, [product_name, variant]);
    
    if (availabilityRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Equipment not available' });
    }

    const equipment_id = availabilityRes.rows[0].equipment_id;
    const last5UID = uid.slice(-5); // Store only last 5 digits

    // 2. Create transaction
    const insertQuery = `
      INSERT INTO transactions (
        uid, 
        equipment_id, 
        reserve_date, 
        checkout_date, 
        student_name, 
        student_email, 
        student_phone
      )
      VALUES ($1, $2, NOW(), $3, $4, $5, $6)
      RETURNING transaction_id;
    `;
    
    await client.query(insertQuery, [
      last5UID,
      equipment_id,
      new Date(`${checkout_date}T00:00:00+08:00`), // HKT time
      student_name,
      student_email,
      student_phone
    ]);

    // 3. Update availability
    const updateQuery = `
      UPDATE equipment 
      SET availability = false 
      WHERE equipment_id = $1;
    `;
    await client.query(updateQuery, [equipment_id]);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reservation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

module.exports = router;