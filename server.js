const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const WebSocket = require('ws');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 4000;

// Middleware setup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'Arun@2006',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

// ✅ Serve intro page first (main homepage)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'intro.html'));
});

// ✅ Serve static assets (HTML, CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));

//
// ---------------- JSONBin Helper Functions ----------------
//

// Load data from a JSONBin
async function loadBin(binId) {
  try {
    const response = await axios.get(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
      headers: { 'X-Master-Key': process.env.JSONBIN_API_KEY },
    });
    return response.data.record || [];
  } catch (error) {
    console.error('Error loading bin:', error.message);
    return [];
  }
}

// Save data back to a JSONBin
async function saveBin(binId, data) {
  try {
    await axios.put(`https://api.jsonbin.io/v3/b/${binId}`, data, {
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': process.env.JSONBIN_API_KEY,
      },
    });
  } catch (error) {
    console.error('Error saving bin:', error.message);
  }
}

//
// ---------------- AUTH ROUTES ----------------
//

// Login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Register page
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Register user
app.post('/register', async (req, res) => {
  const { name, email, username, password, confirmPassword } = req.body;

  if (!name || !email || !username || !password || !confirmPassword)
    return res.status(400).send('All fields are required');
  if (password !== confirmPassword)
    return res.status(400).send('Passwords do not match');

  const usersData = await loadBin(process.env.USERS_BIN_ID);
  if (usersData.some((u) => u.username === username))
    return res.status(400).send('Username already exists');

  const newUser = { name, email, username, password };
  usersData.push(newUser);
  await saveBin(process.env.USERS_BIN_ID, usersData);

  res.redirect('/login');
});

// Login user
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  const usersData = await loadBin(process.env.USERS_BIN_ID);
  const user = usersData.find((u) => u.username === username && u.password === password);

  if (!user) return res.status(401).send('Invalid credentials');

  req.session.name = user.name;
  res.redirect('/feedback');
});

//
// ---------------- FEEDBACK ROUTES ----------------
//

// Feedback main page
app.get('/feedback', (req, res) => {
  if (!req.session.name) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public', 'feedback.html'));
});

// Feedback form routes
const feedbackPages = ['restaurant', 'hotel', 'product', 'mall', 'institution'];
feedbackPages.forEach((type) => {
  app.get(`/${type}-feedback`, (req, res) => {
    if (!req.session.name) return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'public', `${type}-feedback.html`));
  });
});

// Submit feedback
app.post('/submit-feedback', async (req, res) => {
  if (!req.session.name) return res.redirect('/login');

  const feedback = req.body;
  feedback.name = req.session.name;
  feedback.timestamp = new Date().toISOString();

  const feedbackData = await loadBin(process.env.FEEDBACK_BIN_ID);
  feedbackData.push(feedback);
  await saveBin(process.env.FEEDBACK_BIN_ID, feedbackData);

  res.redirect('/feedback-display');
});

// Feedback display page
app.get('/feedback-display', (req, res) => {
  if (!req.session.name) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public', 'feedback-display.html'));
});

// Analytics page
app.get('/analytics', (req, res) => {
  if (!req.session.name) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public', 'analytics.html'));
});

//
// ---------------- API ROUTES ----------------
//

// API: Return logged-in user name
app.get('/api/name', (req, res) => {
  if (!req.session.name) return res.status(401).json({ error: 'Not logged in' });
  res.json({ name: req.session.name });
});

// API: Fetch user’s feedback data
app.get('/api/feedback', async (req, res) => {
  if (!req.session.name) return res.status(401).json({ error: 'Not logged in' });

  try {
    const feedbackData = await loadBin(process.env.FEEDBACK_BIN_ID);
    const userFeedback = feedbackData.filter((f) => f.name === req.session.name);
    res.json(userFeedback);
  } catch (error) {
    console.error('Error fetching feedback:', error.message);
    res.status(500).json({ error: 'Failed to load feedback' });
  }
});

// API: Analytics data
app.get('/api/analytics', async (req, res) => {
  try {
    const feedbackData = await loadBin(process.env.FEEDBACK_BIN_ID);
    const categories = ['Restaurant', 'Hotel', 'Product', 'Mall', 'Institution'];

    const categoryDetails = categories.map((cat) => {
      const catFeedback = feedbackData.filter((f) => f.category === cat);
      const avgRating =
        catFeedback.length > 0
          ? (
              catFeedback.reduce(
                (sum, f) =>
                  sum +
                  (parseInt(f['q1-rating']) +
                    parseInt(f['q2-rating']) +
                    parseInt(f['q3-rating']) +
                    parseInt(f['q4-rating'])) /
                    4,
                0
              ) / catFeedback.length
            ).toFixed(1)
          : 0;

      const ratings = [0, 0, 0, 0, 0];
      catFeedback.forEach((f) => {
        const avg =
          (parseInt(f['q1-rating']) +
            parseInt(f['q2-rating']) +
            parseInt(f['q3-rating']) +
            parseInt(f['q4-rating'])) /
          4;
        const index = Math.min(Math.floor(avg / 2), 4);
        ratings[index]++;
      });

      return { name: cat, averageRating: parseFloat(avgRating), ratings };
    });

    const feedbackCounts = categoryDetails.map((c) =>
      feedbackData.filter((f) => f.category === c.name).length
    );

    const response = {
      categories,
      feedbackCounts,
      categoryDetails,
      timeLabels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
      averageRatings: [3.8, 4.2, 4.5, 4.3],
    };

    res.json(response);
  } catch (error) {
    console.error('Error building analytics:', error.message);
    res.status(500).json({ error: 'Failed to load analytics data' });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Session destroy error:', err);
    res.redirect('/');
  });
});

//
// ---------------- SERVER + WEBSOCKET ----------------
//

const server = app.listen(port, () => {
  console.log(`✅ Feedback System running at http://localhost:${port}`);
});

const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
  console.log('🔗 WebSocket connected');
  ws.send(JSON.stringify({ status: 'connected' }));
  ws.on('close', () => console.log('❌ WebSocket disconnected'));
});
