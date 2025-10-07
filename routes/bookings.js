const express = require('express');
const router = express.Router();
const db = require('../config/database');

// GET all bookings
router.get('/', (req, res) => {
  db.query('SELECT * FROM Bookings', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// POST add new booking
router.post('/', (req, res) => {
  const { guestName, guestEmail, checkInDate, checkOutDate, numberOfGuests, status, roomId } = req.body;

  if (!guestName || !guestEmail || !checkInDate || !checkOutDate || !numberOfGuests || !roomId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const query = `
    INSERT INTO Bookings
    (guestName, guestEmail, checkInDate, checkOutDate, numberOfGuests, status, roomId, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;

  db.query(query, [guestName, guestEmail, checkInDate, checkOutDate, numberOfGuests, status || 'Pending', roomId], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Booking added', bookingId: result.insertId });
  });
});

// DELETE booking by ID
router.delete('/:id', (req, res) => {
  const bookingId = req.params.id;
  db.query('DELETE FROM Bookings WHERE id = ?', [bookingId], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Booking not found' });
    res.json({ message: 'Booking deleted' });
  });
});

module.exports = router;
