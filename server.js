const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Connect to MySQL
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Rakesh@123',
  database: 'flight_booking'
});

db.connect(err => {
  if (err) throw err;
  console.log('MySQL Connected!');
});

// Signup endpoint
app.post('/api/signup', (req, res) => {
  const { username, email, password } = req.body;
  db.query(
    'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
    [username, email, password],
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

// Login endpoint
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  db.query(
    'SELECT * FROM users WHERE email = ? AND password = ?',
    [email, password],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      res.json({ message: 'Login successful', user: results[0] });
    }
  );
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