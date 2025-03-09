const router = require('express').Router();
const pool = require('../db');

router.get('/:roomId', async (req, res) => {
    try {
        const { roomId } = req.params;
        const result = await pool.query(
            'SELECT * FROM availability WHERE room_id = $1',
            [roomId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;