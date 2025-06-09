const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Connect to MySQL
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Dancerraj@12',
  database: 'flights'
});

db.connect(err => {
  if (err) throw err;
  console.log('MySQL Connected!');
});

// Signup endpoint
app.post('/api/signup', (req, res) => {
  const { username, email, password } = req.body;
  bcrypt.hash(password, 10, (err, hash) => {
    if (err) return res.status(500).json({ error: 'Server error' });
    db.query(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hash],
      (err, result) => {
        if (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Username or email already exists' });
          }
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Signup successful' });
      }
    );
  });
});

// Login endpoint
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  db.query(
    'SELECT * FROM users WHERE email = ?',
    [email],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      bcrypt.compare(password, results[0].password, (err, match) => {
        if (err || !match) {
          return res.status(401).json({ error: 'Invalid email or password' });
        }
        res.json({ message: 'Login successful', user: results[0] });
      });
    }
  );
});

// Manual search-flights endpoint (fetches from your own routes table)
// After you set up your MySQL pool & express.json()…
// Remove async/await and pool, just use db.query:
app.get('/api/search-flights', (req, res) => {
  const { departure, arrival, date } = req.query;
  db.query(
    'SELECT * FROM routes WHERE departure = ? AND arrival = ? AND date = ?',
    [departure, arrival, date],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    }
  );
});

// Add a route to create a new flight route (for admin/demo)
app.post('/api/add-route', (req, res) => {
  const { departure, arrival, date, flight_number, status } = req.body;
  db.query(
    'INSERT INTO routes (departure, arrival, date, flight_number, status) VALUES (?, ?, ?, ?, ?)',
    [departure, arrival, date, flight_number, status],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Route added successfully' });
    }
  );
});

app.post('/api/book-flight', (req, res) => {
  const { flight_id, seat, travelClass, adults, children, user_email } = req.body;
  // Prevent double booking
  db.query(
    'SELECT * FROM bookings WHERE route_id = ? AND seat = ?',
    [flight_id, seat],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length > 0) {
        return res.status(400).json({ error: 'This seat is already booked.' });
      }
      db.query(
        'INSERT INTO bookings (user_email, route_id, seat, class, adults, children) VALUES (?, ?, ?, ?, ?, ?)',
        [user_email, flight_id, seat, travelClass, adults, children],
        (err, result) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ message: 'Booking successful!' });
        }
      );
    }
  );
});

app.get('/api/my-bookings', (req, res) => {
  const { user_email } = req.query;
  db.query(
    `SELECT b.*, r.flight_number, r.departure, r.arrival, r.date, r.status
     FROM bookings b
     JOIN routes r ON b.route_id = r.id
     WHERE b.user_email = ? ORDER BY b.booked_at DESC`,
    [user_email],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.delete('/api/cancel-booking/:id', (req, res) => {
  const bookingId = req.params.id;
  db.query('DELETE FROM bookings WHERE id = ?', [bookingId], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Booking cancelled.' });
  });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));

// // Example: Attach this to your signup form's submit event
// document.querySelector('#signup-form').addEventListener('submit', function(e) {
//   e.preventDefault();
//   const username = this.querySelector('input[name="username"]').value;
//   const email = this.querySelector('input[name="email"]').value;
//   const password = this.querySelector('input[name="password"]').value;

//   fetch('http://localhost:3000/api/signup', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ username, email, password })
//   })
//   .then(res => res.json())
//   .then(data => {
//     if (data.error) {
//       alert('Signup failed: ' + data.error);
//     } else {
//       alert('Signup successful!');
//     }
//   });
// });