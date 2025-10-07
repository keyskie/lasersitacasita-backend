const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve uploads folder statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MySQL Connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '12345', // Your MySQL password
  database: 'Lasersitacasita'
});

db.connect((err) => {
  if (err) {
    console.error('MySQL connection error:', err);
    process.exit(1);
  }
  console.log('MySQL connected');
});

// Multer setup for image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');  // make sure this folder exists
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ storage });










//=================================================================================================================================
/* ========== ADMIN LOGIN ========== */
//=================================================================================================================================
// Admin login route
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  const query = "SELECT * FROM Admins WHERE username = ?";
  db.query(query, [username], (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });

    if (results.length === 0) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const admin = results[0];
    if (admin.password !== password) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    return res.status(200).json({ message: "Login successful" });
  });
});














//=================================================================================================================================
/* ========== ROOMS CRUD ========== */
//=================================================================================================================================
// Get all rooms
app.get('/api/rooms', (req, res) => {
  db.query('SELECT * FROM Rooms', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Get room by id
app.get('/api/rooms/:id', (req, res) => {
  db.query('SELECT * FROM Rooms WHERE id = ?', [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ message: 'Room not found' });
    res.json(results[0]);
  });
});

// Add a new room with image upload + stock
app.post('/api/rooms', upload.array('images'), (req, res) => {
  const { name, description, price, capacity, amenities, stock } = req.body;

  // Map uploaded files to URLs
  const imageUrls = req.files.map(file => {
    return `http://localhost:${PORT}/uploads/${file.filename}`;
  });

  db.query(
    `INSERT INTO Rooms (name, description, image_urls, price, capacity, amenities, stock, availability, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
    [name, description, JSON.stringify(imageUrls), price, capacity, amenities, stock || 0],
    (err, results) => {
      if (err) {
        console.error('Insert Room error:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Room added', id: results.insertId });
    }
  );
});

// Update room by id, optionally updating images + stock
app.put('/api/rooms/:id', upload.array('images'), (req, res) => {
  const { name, description, price, capacity, amenities, stock } = req.body;

  let newImageUrls = [];
  if (req.files.length > 0) {
    newImageUrls = req.files.map(file => `http://localhost:${PORT}/uploads/${file.filename}`);
  }

  // Get existing images to preserve if no new upload
  db.query('SELECT image_urls FROM Rooms WHERE id = ?', [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ message: 'Room not found' });

    let imagesToStore = newImageUrls.length > 0 ? newImageUrls : JSON.parse(results[0].image_urls || '[]');

    db.query(
      `UPDATE Rooms 
       SET name = ?, description = ?, image_urls = ?, price = ?, capacity = ?, amenities = ?, stock = ?, updatedAt = NOW() 
       WHERE id = ?`,
      [name, description, JSON.stringify(imagesToStore), price, capacity, amenities, stock, req.params.id],
      (err2, results2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        if (results2.affectedRows === 0) return res.status(404).json({ message: 'Room not found' });
        res.json({ message: 'Room updated' });
      }
    );
  });
});

// Delete room by id
app.delete('/api/rooms/:id', (req, res) => {
  db.query('DELETE FROM Rooms WHERE id = ?', [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.affectedRows === 0) return res.status(404).json({ message: 'Room not found' });
    res.json({ message: 'Room deleted' });
  });
});











//=================================================================================================================================
// ======================= BOOKINGS ROUTES =======================
//=================================================================================================================================
// Create booking
app.post('/api/bookings', (req, res) => {
  const {
    guestName,
    guestEmail,
    checkInDate,
    checkOutDate,
    numberOfGuests,
    roomId,
    userId
  } = req.body;

  if (!guestName || !guestEmail || !checkInDate || !checkOutDate || !numberOfGuests || !roomId) {
    return res.status(400).json({ message: 'Missing required booking fields' });
  }

  // Check room stock first
  db.query('SELECT stock FROM rooms WHERE id = ?', [roomId], (err, results) => {
    if (err) {
      console.error('Failed to fetch room stock:', err);
      return res.status(500).json({ message: 'Booking failed' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const roomStock = results[0].stock;
    if (roomStock <= 0) {
      return res.status(400).json({ message: 'Room is fully booked' });
    }

    // Insert booking
    const sql = `
      INSERT INTO bookings 
      (guestName, guestEmail, checkInDate, checkOutDate, numberOfGuests, status, paymentStatus, roomId, userId)
      VALUES (?, ?, ?, ?, ?, 'pending', 'pending', ?, ?)
    `;
    const values = [guestName, guestEmail, checkInDate, checkOutDate, numberOfGuests, roomId, userId];

    db.query(sql, values, (err, result) => {
      if (err) {
        console.error('Booking insert failed:', err);
        return res.status(500).json({ message: 'Booking failed' });
      }

      // Decrease room stock by 1
      db.query('UPDATE rooms SET stock = stock - 1 WHERE id = ?', [roomId], (err2) => {
        if (err2) console.error('Failed to update room stock:', err2);
      });

      res.status(201).json({ message: 'Booking successful', bookingId: result.insertId });
    });
  });
});

// Get all bookings
app.get('/api/bookings', (req, res) => {
  const sql = 'SELECT * FROM bookings ORDER BY createdAt DESC';
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Failed to fetch bookings:', err);
      return res.status(500).json({ message: 'Failed to get bookings' });
    }
    res.json(results);
  });
});

// Get booking by ID
app.get('/api/bookings/:id', (req, res) => {
  const bookingId = req.params.id;
  const sql = 'SELECT * FROM bookings WHERE id = ?';
  db.query(sql, [bookingId], (err, results) => {
    if (err) {
      console.error('Failed to fetch booking:', err);
      return res.status(500).json({ message: 'Failed to get booking' });
    }
    if (results.length === 0) return res.status(404).json({ message: 'Booking not found' });
    res.json(results[0]);
  });
});

// Update booking (all fields except status/paymentStatus)
app.put('/api/bookings/:id', (req, res) => {
  const bookingId = req.params.id;
  const { guestName, guestEmail, checkInDate, checkOutDate, numberOfGuests, roomId, userId } = req.body;

  const sql = `
    UPDATE bookings
    SET guestName = ?, guestEmail = ?, checkInDate = ?, checkOutDate = ?, numberOfGuests = ?, roomId = ?, userId = ?
    WHERE id = ?
  `;
  const values = [guestName, guestEmail, checkInDate, checkOutDate, numberOfGuests, roomId, userId, bookingId];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error('Failed to update booking:', err);
      return res.status(500).json({ message: 'Failed to update booking' });
    }
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Booking not found' });
    res.json({ message: 'Booking updated successfully' });
  });
});

// Update booking status only
app.patch('/api/bookings/:id/status', (req, res) => {
  const bookingId = req.params.id;
  const { status } = req.body;
  const allowedStatuses = ['pending', 'confirmed', 'cancelled'];
  if (!allowedStatuses.includes(status)) return res.status(400).json({ message: 'Invalid status value' });

  const sql = 'UPDATE bookings SET status = ? WHERE id = ?';
  db.query(sql, [status, bookingId], (err, result) => {
    if (err) {
      console.error('Failed to update booking status:', err);
      return res.status(500).json({ message: 'Failed to update booking status' });
    }
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Booking not found' });
    res.json({ message: `Booking status updated to '${status}'` });
  });
});

// Update payment status only
app.patch('/api/bookings/:id/payment-status', (req, res) => {
  const bookingId = req.params.id;
  const { paymentStatus } = req.body;
  const allowedPaymentStatuses = ['pending', 'paid', 'failed'];
  if (!allowedPaymentStatuses.includes(paymentStatus)) return res.status(400).json({ message: 'Invalid payment status value' });

  const sql = 'UPDATE bookings SET paymentStatus = ? WHERE id = ?';
  db.query(sql, [paymentStatus, bookingId], (err, result) => {
    if (err) {
      console.error('Failed to update payment status:', err);
      return res.status(500).json({ message: 'Failed to update payment status' });
    }
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Booking not found' });
    res.json({ message: `Payment status updated to '${paymentStatus}'` });
  });
});

// Delete booking (and restore stock)
app.delete('/api/bookings/:id', (req, res) => {
  const bookingId = req.params.id;

  // First get booking to know roomId
  db.query('SELECT roomId FROM bookings WHERE id = ?', [bookingId], (err, results) => {
    if (err) return res.status(500).json({ message: 'Failed to delete booking' });
    if (results.length === 0) return res.status(404).json({ message: 'Booking not found' });

    const roomId = results[0].roomId;

    // Delete booking
    db.query('DELETE FROM bookings WHERE id = ?', [bookingId], (err2, result) => {
      if (err2) return res.status(500).json({ message: 'Failed to delete booking' });

      // Restore stock
      db.query('UPDATE rooms SET stock = stock + 1 WHERE id = ?', [roomId], (err3) => {
        if (err3) console.error('Failed to restore room stock:', err3);
      });

      res.json({ message: 'Booking deleted successfully' });
    });
  });
});
















//================================================================================================================================
// ================= RESTAURANT MENU ROUTES =================
// ===== RESTAURANT MENU ROUTES =====
//================================================================================================================================
// Get all menu items
app.get('/api/restaurantadmin', (req, res) => {
  db.query('SELECT * FROM RestaurantMenu', (err, results) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch menu items' });
    res.json(results);
  });
});

// Get single menu item by ID
app.get('/api/restaurantadmin/:id', (req, res) => {
  const { id } = req.params;
  db.query('SELECT * FROM RestaurantMenu WHERE id = ?', [id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch menu item' });
    if (results.length === 0) return res.status(404).json({ message: 'Menu item not found' });
    res.json(results[0]);
  });
});

// Add a new menu item (with image upload)
app.post('/api/restaurantadmin', upload.single('image'), (req, res) => {
  const { dish_name, description, price, availability, category } = req.body;
  const image_urls = req.file ? `/uploads/${req.file.filename}` : null;

  const sql = `
    INSERT INTO RestaurantMenu
    (dish_name, description, price, availability, image_urls, category, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;

  db.query(sql, [dish_name, description, price, availability, image_urls, category], (err, result) => {
    if (err) {
      console.error('Insert menu item error:', err);
      return res.status(500).json({ error: 'Failed to add dish' });
    }
    res.status(201).json({ message: 'Dish added', id: result.insertId });
  });
});

// Update a menu item (with optional new image)
app.put('/api/restaurantadmin/:id', upload.single('image'), (req, res) => {
  const { id } = req.params;
  const { dish_name, description, price, availability, category, image_urls: existingImage } = req.body;
  const image_urls = req.file ? `/uploads/${req.file.filename}` : existingImage;

  const sql = `
    UPDATE RestaurantMenu
    SET dish_name = ?, description = ?, price = ?, availability = ?, image_urls = ?, category = ?, updatedAt = NOW()
    WHERE id = ?
  `;

  db.query(sql, [dish_name, description, price, availability, image_urls, category, id], (err, result) => {
    if (err) {
      console.error('Update menu item error:', err);
      return res.status(500).json({ error: 'Failed to update dish' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Dish not found' });
    }
    res.json({ message: 'Dish updated' });
  });
});

// Delete a menu item
app.delete('/api/restaurantadmin/:id', (req, res) => {
  const { id } = req.params;

  db.query('DELETE FROM RestaurantMenu WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error('Delete menu item error:', err);
      return res.status(500).json({ error: 'Failed to delete dish' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Dish not found' });
    }
    res.json({ message: 'Dish deleted' });
  });
});
















//=================================================================================================================================
/* ========== WATERSPA CRUD ========== */
//=================================================================================================================================
app.get('/api/waterspa', (req, res) => {
  db.query('SELECT * FROM waterspa', (err, results) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch water spa services' });
    res.json(results);
  });
});

// Get a single service by ID
app.get('/api/waterspa/:id', (req, res) => {
  const { id } = req.params;
  db.query('SELECT * FROM waterspa WHERE id = ?', [id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch service' });
    if (results.length === 0) return res.status(404).json({ message: 'Service not found' });
    res.json(results[0]);
  });
});

// Add a new service (with image upload)
app.post('/api/waterspa', upload.single('image'), (req, res) => {
  const { service_name, description, price, availability, stock } = req.body;
  const image_url = req.file ? req.file.filename : null;

  if (!service_name || !price) {
    return res.status(400).json({ error: 'service_name and price are required fields' });
  }

  const sql = `
    INSERT INTO waterspa (service_name, description, price, availability, image_url, stock, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;

  db.query(
    sql,
    [service_name, description || '', price, availability ?? 1, image_url || '', stock ?? 0],
    (err, result) => {
      if (err) {
        console.error('Insert water spa service error:', err);
        return res.status(500).json({ error: 'Failed to add service' });
      }
      res.status(201).json({ message: 'Service added', id: result.insertId });
    }
  );
});

// Update a service (with optional new image)
app.put('/api/waterspa/:id', upload.single('image'), (req, res) => {
  const { id } = req.params;
  const { service_name, description, price, availability, stock, image_url: oldImage } = req.body;
  const image_url = req.file ? req.file.filename : oldImage;

  if (!service_name || !price) {
    return res.status(400).json({ error: 'service_name and price are required for update' });
  }

  const sql = `
    UPDATE waterspa
    SET service_name = ?, description = ?, price = ?, availability = ?, image_url = ?, stock = ?, updatedAt = NOW()
    WHERE id = ?
  `;

  db.query(
    sql,
    [service_name, description || '', price, availability ?? 1, image_url || '', stock ?? 0, id],
    (err, result) => {
      if (err) {
        console.error('Update water spa service error:', err);
        return res.status(500).json({ error: 'Failed to update service' });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Service not found' });
      }
      res.json({ message: 'Service updated' });
    }
  );
});

// Delete a service
app.delete('/api/waterspa/:id', (req, res) => {
  const { id } = req.params;

  db.query('DELETE FROM waterspa WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error('Delete water spa service error:', err);
      return res.status(500).json({ error: 'Failed to delete service' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Service not found' });
    }
    res.json({ message: 'Service deleted' });
  });
});












//================================================================================================================================
// Helper: current datetime
//================================================================================================================================
const getCurrentDateTime = () =>
  new Date().toISOString().slice(0, 19).replace('T', ' ');

// Password policy regex
const passwordPolicy =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;


// --- SIGNUP ---=================================================================================================================
app.post('/api/user/signup', async (req, res) => {
  const { username, password, consent } = req.body;

  if (!username || !password)
    return res.status(400).json({ message: 'Username and password required' });

  if (!consent)
    return res
      .status(400)
      .json({ message: 'You must agree to the Terms & Privacy Policy' });

  if (!passwordPolicy.test(password))
    return res.status(400).json({
      message:
        'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.',
    });

  db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
    if (err) {
      console.error('DB select error:', err);
      return res.status(500).json({ message: 'Database error' });
    }
    if (results.length > 0)
      return res.status(400).json({ message: 'Username already taken' });

    try {
      const hashedPassword = await bcrypt.hash(password, 10);

      const sql = `
        INSERT INTO users (username, passwordHash, role, consentGiven, consentTimestamp)
        VALUES (?, ?, 'guest', 1, NOW())
      `;
      db.query(sql, [username, hashedPassword], (err, result) => {
        if (err) {
          console.error('Insert error:', err);
          return res.status(500).json({
            message: 'Insert error',
            error: err.sqlMessage,
          });
        }
        console.log('User inserted:', result);
        return res
          .status(201)
          .json({ success: true, message: 'User registered successfully' });
      });
    } catch (hashErr) {
      console.error('Hashing error:', hashErr);
      return res.status(500).json({ message: 'Password hashing failed' });
    }
  });
});












//================================================================================================================================
// --- LOGIN ---
//================================================================================================================================
app.post('/api/user/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ message: 'Username and password required' });

  db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
    if (err) {
      console.error('DB login error:', err);
      return res.status(500).json({ message: 'Database error' });
    }
    if (results.length === 0)
      return res.status(401).json({ message: 'Invalid username or password' });

    const user = results[0];
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match)
      return res.status(401).json({ message: 'Invalid username or password' });

    delete user.passwordHash;
    return res.status(200).json({ success: true, user });
  });
});


// ======================= GET ALL USERS (Admin) =======================
app.get('/api/admin/users', (req, res) => {
  const sql = 'SELECT id, username, createdAt FROM users ORDER BY createdAt DESC';
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching users:', err);
      return res.status(500).json({ message: 'Failed to retrieve users' });
    }

    res.json(results);
  });
});

// ======================= DELETE USER (Admin) =======================
app.delete('/api/admin/users/:id', (req, res) => {
  const userId = req.params.id;

  const sql = 'DELETE FROM users WHERE id = ?';
  db.query(sql, [userId], (err, result) => {
    if (err) {
      console.error('Error deleting user:', err);
      return res.status(500).json({ message: 'Failed to delete user' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  });
});








//================================================================================================================================
// --- WaterSpa Booking Routes ---
//================================================================================================================================
app.post('/api/waterspa-bookings', (req, res) => {
  const {
    guestName,
    guestEmail,
    bookingDate,
    numberOfGuests,
    serviceId, // importante para malaman alin service ibabawas
    status = 'pending',
    paymentStatus = 'pending',
    userId = null
  } = req.body;

  // Validate required fields
  if (!guestName || !guestEmail || !bookingDate || !numberOfGuests || !serviceId) {
    return res.status(400).json({ message: 'Please fill all required fields.' });
  }

  // 1. Check if service exists and has stock
  db.query('SELECT stock FROM waterspa WHERE id = ?', [serviceId], (err, results) => {
    if (err) {
      console.error('Stock Check Error:', err);
      return res.status(500).json({ message: 'Database error.' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'Service not found.' });
    }

    const stock = results[0].stock;
    if (stock <= 0) {
      return res.status(400).json({ message: 'Sorry, this service is fully booked (out of stock).' });
    }

    // 2. Insert booking
    const sql = `
      INSERT INTO waterspa_bookings 
      (guestName, guestEmail, bookingDate, numberOfGuests, status, paymentStatus, userId, serviceId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [guestName, guestEmail, bookingDate, numberOfGuests, status, paymentStatus, userId, serviceId];

    db.query(sql, values, (err2, result) => {
      if (err2) {
        console.error('Insert Error:', err2);
        return res.status(500).json({ message: 'Booking failed.' });
      }

      // 3. Deduct stock
      db.query('UPDATE waterspa SET stock = stock - 1 WHERE id = ?', [serviceId], (err3) => {
        if (err3) {
          console.error('Stock Update Error:', err3);
          return res.status(500).json({ message: 'Booking saved but stock update failed.' });
        }

        res.status(201).json({
          message: 'Booking successful!',
          bookingId: result.insertId,
        });
      });
    });
  });
});


// === GET: All Bookings (for Admin Panel) ===
app.get('/api/waterspa-bookings', (req, res) => {
  db.query('SELECT * FROM waterspa_bookings ORDER BY createdAt DESC', (err, results) => {
    if (err) {
      console.error('Fetch Error:', err);
      return res.status(500).json({ message: 'Database error.' });
    }
    res.json(results);
  });
});

app.delete('/api/waterspa-bookings/:id', (req, res) => {
  const bookingId = req.params.id;

  db.query('SELECT serviceId FROM waterspa_bookings WHERE id = ?', [bookingId], (err, results) => {
    if (err) return res.status(500).json({ message: 'Database error.' });
    if (results.length === 0) return res.status(404).json({ message: 'Booking not found.' });

    const serviceId = results[0].serviceId;

    db.query('DELETE FROM waterspa_bookings WHERE id = ?', [bookingId], (err2) => {
      if (err2) return res.status(500).json({ message: 'Failed to delete booking.' });

      db.query('UPDATE waterspa SET stock = stock + 1 WHERE id = ?', [serviceId], (err3) => {
        if (err3) console.error('Failed to restore stock:', err3);

        res.json({ message: 'Booking deleted successfully.' });
      });
    });
  });
});








//================================================================================================================================
///////////   ROOM SERVICE   ////////////
// 📌 Room Service Order Endpoint
//================================================================================================================================
app.post('/api/roomservice/orders', (req, res) => {
  const { userId, itemId, quantity, instructions } = req.body;

  if (!userId || !itemId || !quantity) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const sql = `
    INSERT INTO room_service_orders (userId, itemId, quantity, instructions)
    VALUES (?, ?, ?, ?)
  `;

  db.query(sql, [userId, itemId, quantity, instructions || ''], (err, result) => {
    if (err) {
      console.error('Failed to place order:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.status(201).json({ message: 'Order placed', orderId: result.insertId });
  });
});
app.get('/api/roomservice/orders', (req, res) => {
  const sql = `
    SELECT o.id, o.userId, o.quantity, o.instructions, o.createdAt, m.dish_name
    FROM room_service_orders o
    JOIN restaurantmenu m ON o.itemId = m.id
    ORDER BY o.createdAt DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Failed to fetch orders:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results);
  });
});

app.delete('/api/roomservice/orders/:id', (req, res) => {
  const { id } = req.params;

  const sql = 'DELETE FROM room_service_orders WHERE id = ?';
  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error('Error deleting order:', err);
      return res.status(500).json({ message: 'Failed to delete order.' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    res.json({ message: 'Order deleted successfully.' });
  });
});






//================================================================================================================================
///////////////////////////////////BOOKING HISTORY/////////////////////////////////////
//================================================================================================================================
// Example gamit express + mysql2/promise
// In your backend, e.g., bookings.js or server.js
// Booking history by user email
app.get('/api/bookings/history', (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const sql = `
    SELECT b.id, b.guestName, b.guestEmail, b.checkInDate, b.checkOutDate,
           b.numberOfGuests, b.status, b.createdAt, r.room_name, r.room_type
    FROM Bookings b
    LEFT JOIN Rooms r ON b.roomId = r.id
    WHERE b.guestEmail = ?
    ORDER BY b.createdAt DESC
  `;

  db.query(sql, [email], (err, results) => {
    if (err) {
      console.error('Error fetching booking history:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    // ❌ wag na mag return ng "Booking not found"
    // ✅ diretso return results (kahit empty array)
    res.json(results);
  });
});





//===================================================================================================================================
///////////////////////////////ROOM SERVICE///////////////////////////////////
//===================================================================================================================================
app.post('/api/orders', (req, res) => {
  const { roomNumber, guestName, paymentMethod, items } = req.body;

  if (!roomNumber || !guestName || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Missing required fields or items' });
  }

  let totalPrice = 0;
  let remaining = items.length;
  const itemPrices = [];

  items.forEach((item, index) => {
    db.query('SELECT price FROM restaurantmenu WHERE id = ?', [item.menu_item_id], (err, results) => {
      if (err) return res.status(500).json({ message: 'Database error', error: err });
      if (results.length === 0) {
        return res.status(400).json({ message: `Menu item ${item.menu_item_id} not found` });
      }

      totalPrice += results[0].price * item.quantity;
      itemPrices[index] = { ...item, price: results[0].price };
      remaining--;

      if (remaining === 0) {
        // Insert into orders table
        db.query(
          `INSERT INTO orders (room_number, guest_name, payment_method, total_price, status) VALUES (?, ?, ?, ?, 'pending')`,
          [roomNumber, guestName, paymentMethod, totalPrice],
          (err, orderResult) => {
            if (err) return res.status(500).json({ message: 'Error inserting order', error: err });

            const orderId = orderResult.insertId;
            let itemsInserted = 0;

            itemPrices.forEach((item) => {
              db.query(
                'INSERT INTO order_items (order_id, menu_item_id, quantity) VALUES (?, ?, ?)',
                [orderId, item.menu_item_id, item.quantity],
                (err) => {
                  if (err) return res.status(500).json({ message: 'Error inserting order items', error: err });
                  itemsInserted++;
                  if (itemsInserted === itemPrices.length) {
                    res.status(201).json({ message: 'Order placed successfully', orderId });
                  }
                }
              );
            });
          }
        );
      }
    });
  });
});

// Get orders
app.get('/api/orders', (req, res) => {
  const query = `
    SELECT 
      o.id,
      o.room_number,
      o.guest_name,
      o.payment_method,
      o.total_price,
      o.status,
      o.order_date,
      GROUP_CONCAT(CONCAT(oi.quantity, 'x ', m.dish_name) SEPARATOR ', ') AS order_details
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    JOIN restaurantmenu m ON oi.menu_item_id = m.id
    GROUP BY o.id
    ORDER BY o.order_date DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching orders:', err);
      return res.status(500).json({ message: 'Server error' });
    }

    res.json(results);
  });
});

app.get('/api/room_service_orders', (req, res) => {
  const query = `
    SELECT 
      o.id AS order_id,
      o.room_number,
      o.guest_name,
      o.payment_method,
      o.total_price,
      o.status,
      o.order_date,
      oi.menu_item_id,
      m.dish_name,
      oi.quantity
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    JOIN restaurantmenu m ON oi.menu_item_id = m.id
    ORDER BY o.order_date DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching orders:', err);
      return res.status(500).json({ message: 'Server error' });
    }

    res.json(results);
  });
});

// Delete order item by order item ID (optional)
// If you want to delete the entire order, you'd have to delete order_items first then orders.
app.delete('/api/room_service_orders/:orderId', (req, res) => {
  const orderId = req.params.orderId;

  // First delete all order_items for that order
  db.query('DELETE FROM order_items WHERE order_id = ?', [orderId], (err) => {
    if (err) {
      console.error('Error deleting order items:', err);
      return res.status(500).json({ message: 'Failed to delete order items' });
    }

    // Then delete the order itself
    db.query('DELETE FROM orders WHERE id = ?', [orderId], (err2) => {
      if (err2) {
        console.error('Error deleting order:', err2);
        return res.status(500).json({ message: 'Failed to delete order' });
      }

      res.json({ message: 'Order deleted successfully' });
    });
  });
});







// ===================================================================================================================================
// Payment Upload Route
// ===================================================================================================================================
app.post('/api/payments', upload.single('proofOfPayment'), (req, res) => {
  const { bookingId, bookingType, paymentMethod, transactionId } = req.body;
  const proofUrl = req.file ? `/uploads/${req.file.filename}` : null;

  if (!bookingId || !bookingType || !paymentMethod) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  // Status depende sa method
  let paymentStatus =
    paymentMethod === 'Pay on Arrival' ? 'Unpaid' : 'Pending Verification';

  const sql = `
    INSERT INTO payments
    (bookingId, bookingType, paymentMethod, transactionId, proofUrl, paymentStatus, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, NOW())
  `;

  db.query(
    sql,
    [bookingId, bookingType, paymentMethod, transactionId || null, proofUrl, paymentStatus],
    (err, result) => {
      if (err) {
        console.error('Error inserting payment:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.status(200).json({
        message: 'Payment submitted successfully',
        paymentId: result.insertId,
        proofUrl
      });
    }
  );
});

// ====================================================================
// Update Payment Status (Approve/Reject by Admin)
// ====================================================================
app.patch('/api/payments/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['Paid', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const sql = `UPDATE payments SET paymentStatus = ? WHERE id = ?`;

  db.query(sql, [status, id], (err) => {
    if (err) {
      console.error('Error updating payment status:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ message: 'Payment status updated successfully' });
  });
});







// ================================================================================================================================
// Get All Payments (for Admin Panel)
// ================================================================================================================================
app.get('/api/payments', (req, res) => {
  const sql = `
    SELECT 
      p.id, 
      p.bookingId, 
      p.bookingType,
      p.paymentMethod, 
      p.transactionId, 
      p.proofUrl, 
      p.paymentStatus, 
      p.createdAt,
      b.guestName, 
      b.guestEmail, 
      b.checkInDate, 
      b.checkOutDate,
      b.numberOfGuests
    FROM Payments p
    JOIN Bookings b ON p.bookingId = b.id
    WHERE p.bookingType = 'room'

    UNION ALL

    SELECT 
      p.id, 
      p.bookingId, 
      p.bookingType,
      p.paymentMethod, 
      p.transactionId, 
      p.proofUrl, 
      p.paymentStatus, 
      p.createdAt,
      w.guestName, 
      w.guestEmail, 
      w.bookingDate AS checkInDate, 
      w.bookingDate AS checkOutDate,
      w.numberOfGuests
    FROM Payments p
    JOIN waterspa_bookings w ON p.bookingId = w.id
    WHERE p.bookingType = 'waterspa'

    ORDER BY createdAt DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching payments:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results);
  });
});



// Server listen
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});




