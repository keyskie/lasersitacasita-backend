const db = require('../config/database');

exports.getRooms = (req, res) => {
  db.query('SELECT * FROM Rooms', (err, results) => {
    if (err) {
      console.error('DB Error getRooms:', err);
      return res.status(500).json({ error: 'Database query error' });
    }
    res.json(results);
  });
};

exports.addRoom = (req, res) => {
  const { name, description, images, price, capacity, amenities } = req.body;

  if (!name || !price) {
    return res.status(400).json({ error: 'Name and Price are required' });
  }

  db.query(
    `INSERT INTO Rooms (name, description, image_urls, price, capacity, amenities, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [name, description, images, price, capacity, amenities],
    (err, results) => {
      if (err) {
        console.error('DB Error addRoom:', err);
        return res.status(500).json({ error: 'Failed to add room' });
      }
      res.json({ message: 'Room added', id: results.insertId });
    }
  );
};

exports.deleteRoom = (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM Rooms WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error('DB Error deleteRoom:', err);
      return res.status(500).json({ error: 'Failed to delete room' });
    }
    res.json({ message: 'Room deleted' });
  });
};
