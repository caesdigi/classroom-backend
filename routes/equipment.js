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
      checkout_date,
      remarks
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
        student_phone,
        remarks
      )
      VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7)
      RETURNING transaction_id;
    `;
    
    await client.query(insertQuery, [
      last5UID,
      equipment_id,
      new Date(`${checkout_date}T00:00:00+08:00`), // HKT time
      student_name,
      student_email,
      student_phone,
      remarks
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

// Add this route at the bottom of the file
router.get('/reservations/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    
    // Get student name from the first transaction
    const nameQuery = `
      SELECT student_name 
      FROM transactions 
      WHERE uid = $1 
      LIMIT 1;
    `;
    const nameRes = await pool.query(nameQuery, [uid]);
    const studentName = nameRes.rows[0]?.student_name || '';

    // Get all reservations for the UID
    const query = `
      SELECT 
        t.*,
        e.product_name,
        e.variant,
        e.image_url
      FROM transactions t
      JOIN equipment e ON t.equipment_id = e.equipment_id
      WHERE t.uid = $1
      ORDER BY t.reserve_date DESC;
    `;
    const result = await pool.query(query, [uid]);

    // Categorize reservations
    const pending = [];
    const checkedout = [];
    const checkedin = [];
    const cancelled = []; // Add cancelled array

    result.rows.forEach(transaction => {
      // First, check for cancelled reservations
      if (transaction.reserve_date !== null && 
          transaction.checkout_date === null && 
          transaction.return_date === null && 
          transaction.checkin_date === null) {
        cancelled.push(transaction);
      } else if (!transaction.return_date && !transaction.checkin_date) {
        pending.push(transaction);
      } else if (transaction.return_date && !transaction.checkin_date) {
        checkedout.push(transaction);
      } else if (transaction.return_date && transaction.checkin_date) {
        checkedin.push(transaction);
      }
    });

    // Sort according to requirements
    pending.sort((a, b) => new Date(b.reserve_date) - new Date(a.reserve_date));
    checkedout.sort((a, b) => new Date(a.return_date) - new Date(b.return_date));
    checkedin.sort((a, b) => new Date(b.checkin_date) - new Date(a.checkin_date));
    cancelled.sort((a, b) => new Date(b.reserve_date) - new Date(a.reserve_date)); // Sort cancelled

    res.json({
      studentName,
      reservations: {
        pending,
        checkedout,
        checkedin,
        cancelled // Include cancelled in response
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add this route in routes/equipment.js
router.get('/check-uid/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    const query = `
      SELECT EXISTS(
        SELECT 1 
        FROM transactions 
        WHERE uid = $1
      ) as uid_exists;
    `;
    const result = await pool.query(query, [uid]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get pending checkout equipment
router.get('/pending-checkout', async (req, res) => {
  try {
    const query = `
      SELECT 
        t.transaction_id,
        t.uid,
        t.student_name,
        t.reserve_date,
        t.checkout_date,
        t.return_date,
        t.checkin_date,
        t.remarks,
        e.equipment_id,
        e.product_name,
        e.variant,
        e.tag,
        e.image_url
      FROM transactions t
      JOIN equipment e ON t.equipment_id = e.equipment_id
      WHERE t.return_date IS NULL 
        AND t.checkin_date IS NULL
        AND t.reserve_date IS NOT NULL
        AND t.checkout_date IS NOT NULL
      ORDER BY e.product_name ASC, e.variant ASC, e.tag ASC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Process equipment checkout
router.patch('/checkout/:transactionId', async (req, res) => {
  const { transactionId } = req.params;
  const { returnDate } = req.body;

  if (!returnDate) {
    return res.status(400).json({ error: 'Return date is required' });
  }

  try {
    // Convert to HKT timezone (UTC+8)
    const returnDateTime = new Date(`${returnDate}T23:59:59+08:00`).toISOString();
    const checkoutDateTime = new Date().toISOString();

    const updateQuery = `
      UPDATE transactions
      SET 
        checkout_date = $1,
        return_date = $2
      WHERE transaction_id = $3
      RETURNING *;
    `;
    
    const result = await pool.query(updateQuery, [
      checkoutDateTime,
      returnDateTime,
      transactionId
    ]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get pending check-in equipment
router.get('/pending-checkin', async (req, res) => {
  try {
    const query = `
      SELECT 
        t.transaction_id,
        t.uid,
        t.student_name,
        t.reserve_date,
        t.checkout_date,
        t.return_date,
        t.checkin_date,
        t.remarks,
        e.equipment_id,
        e.product_name,
        e.variant,
        e.tag,
        e.image_url
      FROM transactions t
      JOIN equipment e ON t.equipment_id = e.equipment_id
      WHERE t.return_date IS NOT NULL 
        AND t.checkin_date IS NULL
        AND t.reserve_date IS NOT NULL
        AND t.checkout_date IS NOT NULL
      ORDER BY e.product_name ASC, e.variant ASC, e.tag ASC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Process equipment check-in
router.patch('/checkin/:transactionId', async (req, res) => {
  const { transactionId } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    
    // 1. Update checkin_date
    const updateTransactionQuery = `
      UPDATE transactions
      SET checkin_date = NOW()
      WHERE transaction_id = $1
      RETURNING equipment_id;
    `;
    
    const transactionResult = await client.query(updateTransactionQuery, [transactionId]);
    
    if (transactionResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    const equipmentId = transactionResult.rows[0].equipment_id;
    
    // 2. Update equipment availability
    const updateEquipmentQuery = `
      UPDATE equipment 
      SET availability = true 
      WHERE equipment_id = $1;
    `;
    await client.query(updateEquipmentQuery, [equipmentId]);
    
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Check-in error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Add this route for cancelling reservations
router.patch('/cancel-reservation/:transactionId', async (req, res) => {
  const { transactionId } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Get the equipment_id from the transaction
    const getQuery = `
      SELECT equipment_id 
      FROM transactions 
      WHERE transaction_id = $1
      FOR UPDATE;
    `;
    const getRes = await client.query(getQuery, [transactionId]);
    
    if (getRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const equipmentId = getRes.rows[0].equipment_id;

    // 2. Update the transaction: set checkout_date to NULL
    const updateTransactionQuery = `
      UPDATE transactions
      SET checkout_date = NULL
      WHERE transaction_id = $1;
    `;
    await client.query(updateTransactionQuery, [transactionId]);

    // 3. Update the equipment: set availability to TRUE
    const updateEquipmentQuery = `
      UPDATE equipment 
      SET availability = true 
      WHERE equipment_id = $1;
    `;
    await client.query(updateEquipmentQuery, [equipmentId]);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Cancellation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

module.exports = router;