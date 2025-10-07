const db = require('../config/database');

exports.getAllDishes = (req, res) => {
  db.query('SELECT * FROM restaurantmenu', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
};

// etc... for addDish, updateDish, etc.
