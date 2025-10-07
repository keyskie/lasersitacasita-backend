const db = require('../config/database');

exports.createBooking = (req, res) => {
  const {
    guestName,
    guestEmail,
    checkInDate,
    checkOutDate,
    numberOfGuests,
    roomId
  } = req.body;

  const sql = `
    INSERT INTO Bookings 
    (guestName, guestEmail, checkInDate, checkOutDate, numberOfGuests, roomId, status) 
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `;

  db.query(sql, [guestName, guestEmail, checkInDate, checkOutDate, numberOfGuests, roomId], (err, result) => {
    if (err) {
      console.error('Error creating booking:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.status(200).json({ message: 'Booking created', bookingId: result.insertId });
  });
};

exports.getAllBookings = (req, res) => {
  db.query('SELECT * FROM Bookings', (err, results) => {
    if (err) {
      console.error('Error fetching bookings:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.status(200).json(results);
  });
};
