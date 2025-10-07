// routes/restaurantadmin.js

const express = require('express');
const router = express.Router();
const db = require('../config/database');

router.post('/', (req, res) => {
  console.log("Received body:", req.body); // ← DITO MO ILAGAY

  const { dish_name, description, price, availability, image_urls } = req.body;

  if (!dish_name || !description || !price || !availability || !image_urls) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const sql = "INSERT INTO Menu (dish_name, description, price, availability, image_urls) VALUES (?, ?, ?, ?, ?)";
  const values = [dish_name, description, price, availability, image_urls];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.status(200).json({ message: "Menu item added successfully!" });
  });
});

module.exports = router;
