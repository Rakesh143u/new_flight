const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'rakeshraki935390',     // your email
    pass: 'Rakesh@123'        // use App Password (not your Gmail password)
  }
});


// Create database connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Dancerraj@12', // Your MySQL password
    database: 'new'
});

// Connect to database
db.connect(err => {
    if (err) {
        console.error('Error connecting to the database:', err);
        return;
    }
    console.log('Connected to database successfully');
});

const app = express();

// Middleware
app.use(cors({
    origin: 'http://127.0.0.1:5500',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));
app.use(express.json());

// Signup endpoint
app.post('/api/signup', (req, res) => {
    console.log('Received signup request:', req.body);
    
    const { username, email, password } = req.body;
    
    // Validate input
    if (!username || !email || !password) {
        return res.status(400).json({ 
            error: 'Please provide all required fields' 
        });
    }

    // Check if user exists
    db.query(
        'SELECT * FROM users WHERE email = ? OR username = ?',
        [email, username],
        (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ 
                    error: 'Database error occurred' 
                });
            }

            if (results.length > 0) {
                return res.status(400).json({ 
                    error: 'User already exists' 
                });
            }

            // Insert new user
            db.query(
                'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
                [username, email, password],
                (err, result) => {
                    if (err) {
                        console.error('Insert error:', err);
                        return res.status(500).json({ 
                            error: 'Error creating user' 
                        });
                    }
                    
                    res.status(201).json({ 
                        message: 'User registered successfully',
                        userId: result.insertId
                    });
                }
            );
        }
    );
});

// Login endpoint
app.post('/api/login', (req, res) => {
    console.log('Received login request:', req.body);
    
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ 
            error: 'Please provide email and password' 
        });
    }

    db.query(
        'SELECT * FROM users WHERE email = ? AND password = ?',
        [email, password],
        (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ 
                    error: 'Login failed' 
                });
            }

            if (results.length === 0) {
                return res.status(401).json({ 
                    error: 'Invalid email or password' 
                });
            }

            const user = results[0];
            res.json({ 
                message: 'Login successful',
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email
                }
            });
        }
    );
});

// Add flight endpoint
app.post('/api/admin/flights', (req, res) => {
    const { flight_number, airline, departure, arrival, date, classes } = req.body;

    // Validate input
    if (!flight_number || !airline || !departure || !arrival || !date || !classes) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    db.beginTransaction(err => {
        if (err) {
            console.error('Transaction error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        // First insert the route
        db.query(
          
            'INSERT INTO routes (airline, flight_number, departure, arrival, date, status) VALUES (?, ?, ?, ?, ?, ?)',
            [airline, flight_number, departure, arrival, date, 'Scheduled'],
            (err, result) => {
                if (err) {
                    console.error('Route insert error:', err);
                    return db.rollback(() => {
                        res.status(500).json({ error: 'Error adding flight details' });
                    });
                }

                const flight_id = result.insertId;
                const classTypes = ['first', 'business', 'premium', 'economy'];
                
                // Insert each class
                const classPromises = classTypes.map(type => {
                    return new Promise((resolve, reject) => {
                        const classData = classes[type];
                        db.query(
                            'INSERT INTO flight_classes (flight_id, class_type, total_seats, available_seats, adult_price, child_price) VALUES (?, ?, ?, ?, ?, ?)',
                            [flight_id, type, classData.seats, classData.seats, classData.adult_price, classData.child_price],
                            (err) => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });
                });

                // Execute all class insertions
                Promise.all(classPromises)
                    .then(() => {
                        db.commit(err => {
                            if (err) {
                                return db.rollback(() => {
                                    res.status(500).json({ error: 'Error committing transaction' });
                                });
                            }
                            res.json({ 
                                message: 'Flight added successfully',
                                flight_id: flight_id 
                            });
                        });
                    })
                    .catch(err => {
                        console.error('Class insert error:', err);
                        db.rollback(() => {
                            res.status(500).json({ error: 'Error adding class details' });
                        });
                    });
            }
        );
    });
});

app.post('/api/update-luggage', (req, res) => {
  const { booking_id, luggage_kg } = req.body;

  const maxWeight = 30; // limit, e.g., 30 kg
  const costPerKg = 500; // ₹500 per kg over 15kg

  if (luggage_kg > maxWeight) {
    return res.status(400).json({ message: `Maximum allowed luggage is ${maxWeight} kg` });
  }

  const freeAllowance = 15;
  const chargeableWeight = Math.max(0, luggage_kg - freeAllowance);
  const luggage_cost = chargeableWeight * costPerKg;

  const query = `UPDATE bookings SET luggage_kg = ?, luggage_cost = ? WHERE id = ?`;

  db.query(query, [luggage_kg, luggage_cost, booking_id], (err, result) => {
    if (err) return res.status(500).json({ message: 'Error updating luggage info' });
    res.json({ message: 'Luggage updated successfully', luggage_kg, luggage_cost });
  });
});

// Get all flights for admin
app.get('/api/admin/flights', (req, res) => {
    db.query(`
        SELECT r.*, GROUP_CONCAT(
            CONCAT(fc.class_type, ':', fc.total_seats, ':', fc.available_seats, ':', fc.adult_price, ':', fc.child_price)
        ) as class_details
        FROM routes r
        LEFT JOIN flight_classes fc ON r.id = fc.flight_id
        GROUP BY r.id
        ORDER BY r.date DESC`,
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(results);
        }
    );
});

// Get all users for admin
app.get('/api/admin/users', (req, res) => {
    db.query('SELECT id, username, email, created_at FROM users', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Get all bookings for admin
// Get bookings for a specific user with passenger details
// Get bookings for a specific user by email
app.get('/api/my-bookings', (req, res) => {
  const user_email = req.query.user_email;
  if (!user_email) return res.status(400).json({ error: 'User email is required' });

  const query = `
    SELECT 
      b.id AS booking_id,
      b.booking_date,
      r.flight_number,
      r.departure,
      r.arrival,
      r.date,
      b.class_type,
      pd.title,
      pd.first_name,
      pd.last_name,
      pd.email AS passenger_email,
      pd.phone,
      pd.country
    FROM bookings b
    JOIN routes r ON b.route_id = r.id
    LEFT JOIN passenger_details pd ON b.id = pd.booking_id
    WHERE b.user_email = ?
    ORDER BY b.booking_date DESC
  `;
  db.query(query, [user_email], (err, results) => {
    if (err) return res.status(500).json({ error: 'Error retrieving bookings' });
    res.json(results);
  });
});


// DELETE /api/cancel-booking/:id
app.delete('/api/cancel-booking/:id', (req, res) => {
  const bookingId = parseInt(req.params.id, 10);

  if (!bookingId || isNaN(bookingId)) {
    return res.status(400).json({ message: 'Invalid booking ID' });
  }

  console.log("Cancelling booking ID:", bookingId);

  // First, fetch class_type and flight_id
  db.query('SELECT route_id, class_type FROM bookings WHERE id = ?', [bookingId], (err, rows) => {
    if (err || rows.length === 0) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const { route_id, class_type } = rows[0];

    db.beginTransaction(err => {
      if (err) return res.status(500).json({ message: 'Transaction error' });

      // Step 1: Delete passengers
      db.query('DELETE FROM passenger_details WHERE booking_id = ?', [bookingId], (err1) => {
        if (err1) return db.rollback(() => res.status(500).json({ message: 'Error deleting passengers' }));

        // Step 2: Delete booking
        db.query('DELETE FROM bookings WHERE id = ?', [bookingId], (err2, result2) => {
          if (err2) return db.rollback(() => res.status(500).json({ message: 'Error deleting booking' }));

          if (result2.affectedRows === 0) {
            return db.rollback(() => res.status(404).json({ message: 'Booking not found' }));
          }

          // Step 3: Restore seat
          db.query(
            'UPDATE flight_classes SET available_seats = available_seats + 1 WHERE flight_id = ? AND class_type = ?',
            [route_id, class_type],
            (err3) => {
              if (err3) return db.rollback(() => res.status(500).json({ message: 'Error restoring seat' }));

              db.commit(err4 => {
                if (err4) return db.rollback(() => res.status(500).json({ message: 'Commit failed' }));
                res.json({ message: 'Booking cancelled successfully' });
              });
            }
          );
        });
      });
    });
  });
});





// Bookings endpoint
app.post('/api/bookings', (req, res) => {
  const { flight_id, class_type, first_name, last_name, email, phone, country } = req.body;

  db.beginTransaction(err => {
    if (err) return res.status(500).json({ error: err.message });

    // now only three columns
    db.query(
      'INSERT INTO bookings (user_email, route_id, class_type) VALUES (?, ?, ?)',
      [email, flight_id, class_type],
      (err, bookingResult) => {
        if (err) return db.rollback(() => res.status(500).json({ error: err.message }));
        const booking_id = bookingResult.insertId;

        db.query(
          'INSERT INTO passenger_details (booking_id, title, first_name, last_name, email, phone, country) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [booking_id, 'Mr', first_name, last_name, email, phone, country],
          err => {
            if (err) return db.rollback(() => res.status(500).json({ error: err.message }));
            db.query(
              'UPDATE flight_classes SET available_seats = available_seats - 1 WHERE flight_id = ? AND class_type = ?',
              [flight_id, class_type],
              err => {
                if (err) return db.rollback(() => res.status(500).json({ error: err.message }));
                db.commit(err => {
                  if (err) return db.rollback(() => res.status(500).json({ error: err.message }));
                  res.json({ message: 'Booking successful', booking_id });
                });
              }
            );
          }
        );
      }
    );
  });
});




// Add this endpoint for searching flights
app.get('/api/search-flights', (req, res) => {
    const { departure, arrival, date } = req.query;
    
    console.log('Search params:', { departure, arrival, date }); // Debug log

    const query = `
        SELECT r.*, 
            GROUP_CONCAT(
                CONCAT(
                    fc.class_type, ':', 
                    fc.available_seats, ':',
                    fc.adult_price, ':',
                    fc.child_price
                )
            ) as class_details
        FROM routes r
        LEFT JOIN flight_classes fc ON r.id = fc.flight_id
        WHERE r.departure = ? 
        AND r.arrival = ? 
        AND DATE(r.date) = DATE(?)
        GROUP BY r.id`;

    db.query(query, [departure, arrival, date], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        // Format the results
        const flights = results.map(flight => {
            const classes = {};
            if (flight.class_details) {
                flight.class_details.split(',').forEach(classInfo => {
                    const [type, seats, adultPrice, childPrice] = classInfo.split(':');
                    classes[type] = {
                        available_seats: parseInt(seats),
                        adult_price: parseFloat(adultPrice),
                        child_price: parseFloat(childPrice)
                    };
                });
            }

            return {
                id: flight.id,
                flight_number: flight.flight_number,
                airline: flight.airline,
                departure: flight.departure,
                arrival: flight.arrival,
                date: flight.date,
                status: flight.status,
                classes: classes
            };
        });

        res.json(flights);
    });
});
// Admin route: Get all bookings without booking_details
app.get('/api/admin/booking', (req, res) => {
  const query = `
    SELECT 
      b.id AS booking_id,
      b.user_email,
      b.booking_date,
      r.flight_number,
      r.airline,
      r.departure,
      r.arrival,
      r.date AS flight_date,
      r.status,
      p.title,
      p.first_name,
      p.last_name,
      p.email AS passenger_email,
      p.phone,
      p.country
    FROM bookings b
    JOIN routes r ON b.route_id = r.id
    LEFT JOIN passenger_details p ON p.booking_id = b.id
    ORDER BY b.booking_date DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('🔥 SQL ERROR in /api/admin/booking:', err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});
// GET /api/whatson?departure=Bengaluru&arrival=New%20Delhi&date=2025-06-30
app.get('/api/whatson', (req, res) => {
  const { departure, arrival, date } = req.query;
  if (!departure || !arrival || !date) {
    return res.status(400).json({ error: 'departure, arrival & date are required' });
  }

  // 1) Find the route_id
  const routeSql = `
    SELECT id
    FROM routes
    WHERE LOWER(departure) = LOWER(?) 
      AND LOWER(arrival)   = LOWER(?) 
      AND DATE(date)       = DATE(?)
    LIMIT 1
  `;
  db.query(routeSql, [departure.trim(), arrival.trim(), date], (err, routeRows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (routeRows.length === 0) {
      return res.json([]); // no matching flight → no services
    }
    const routeId = routeRows[0].id;

    // 2) Fetch in‑flight services for that route
    const svcSql = `
      SELECT service_name, description
      FROM inflight_services
      WHERE route_id = ?
    `;
    db.query(svcSql, [routeId], (err2, svcRows) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json(svcRows);
    });
  });
});



const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});