const db = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

exports.login = (req, res) => {
  const { username, password } = req.body;
  db.query('SELECT * FROM Admins WHERE username = ?', [username], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(401).json({ message: 'Invalid credentials' });

    const admin = results[0];
    // Assuming password is hashed, compare it
    bcrypt.compare(password, admin.password, (err, same) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!same) return res.status(401).json({ message: 'Invalid credentials' });

      const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
      res.json({ message: 'Login successful', token });
    });
  });
};
