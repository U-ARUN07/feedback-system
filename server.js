const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const WebSocket = require('ws');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 4000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'feedback@mlrit2025',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// Helper function: Load data from JSONBin
async function loadBin(binId) {
  try {
    const response = await axios.get(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
      headers: { 'X-Master-Key': process.env.JSONBIN_API_KEY },
    });
    return response.data.record;
  } catch (error) {
    console.error('Error loading bin:', error.message);
    return [];
  }
}

// Helper function: Save data to JSONBin
async function saveBin(binId, data) {
  try {
    await axios.put(
      `https://api.jsonbin.io/v3/b/${binId}`,
      data,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': process.env.JSONBIN_API_KEY,
        },
      }
    );
  } catch (error) {
    console.error('Error saving bin:', error.message);
  }
}

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'intro.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));

// Register
app.post('/register', async (req, res) => {
  const { name, email, username, password, confirmPassword } = req.body;

  if (!name || !email || !username || !password || !confirmPassword)
    return res.status(400).send('All fields are required');
  if (password !== confirmPassword)
    return res.status(400).send('Passwords do not match');

  const usersData = await loadBin(process.env.USERS_BIN_ID);
  if (usersData.some((user) => user.username === username))
    return res.status(400).send('Username already exists');

  usersData.push({ name, email, username, password });
  await saveBin(process.env.USERS_BIN_ID, usersData);

  res.redirect('/login');
});

// Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const usersData = await loadBin(process.env.USERS_BIN_ID);
  const user = usersData.find((u) => u.username === username && u.password === password);

  if (!user) return res.status(401).send('Invalid credentials');

  req.session.name = user.name;
  res.redirect('/feedback');
});

// Feedback category page
app.get('/feedback', (req, res) => {
  if (!req.session.name) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public', 'feedback.html'));
});

// Feedback forms
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

// Display feedback
app.get('/feedback-display', (req, res) => {
  if (!req.session.name) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public', 'feedback-display.html'));
});

// Analytics page
app.get('/analytics', (req, res) => {
  if (!req.session.name) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public', 'analytics.html'));
});

// --- NEW API: Get username for top bar ---
app.get('/api/name', (req, res) => {
  if (!req.session.name) return res.status(401).json({ error: 'Not logged in' });
  res.json({ name: req.session.name });
});

// --- API: Get feedback (for feedback-display.html) ---
app.get('/api/feedback', async (req, res) => {
  if (!req.session.name) return res.status(401).json({ error: 'Not logged in' });

  try {
    const response = await axios.get(
      `https://api.jsonbin.io/v3/b/${process.env.FEEDBACK_BIN_ID}/latest`,
      { headers: { 'X-Master-Key': process.env.JSONBIN_API_KEY } }
    );

    const allFeedback = response.data.record;
    const userFeedback = allFeedback.filter(f => f.name === req.session.name);
    res.json(userFeedback);
  } catch (error) {
    console.error('Error fetching feedback:', error.message);
    res.status(500).json({ error: 'Failed to load feedback' });
  }
});

// --- NEW API: Analytics Data (for analytics.html) ---
app.get('/api/analytics', async (req, res) => {
  if (!req.session.name) return res.status(401).json({ error: 'Not logged in' });

  try {
    const response = await axios.get(
      `https://api.jsonbin.io/v3/b/${process.env.FEEDBACK_BIN_ID}/latest`,
      { headers: { 'X-Master-Key': process.env.JSONBIN_API_KEY } }
    );
    const feedback = response.data.record;

    const categories = [...new Set(feedback.map(f => f.category))];
    const feedbackCounts = categories.map(c => feedback.filter(f => f.category === c).length);

    const categoryDetails = categories.map(cat => {
      const catFeedback = feedback.filter(f => f.category === cat);
      const avgRating = catFeedback.reduce((sum, f) =>
        sum + ((+f['q1-rating'] + +f['q2-rating'] + +f['q3-rating'] + +f['q4-rating']) / 4), 0
      ) / (catFeedback.length || 1);

      const ratings = [0, 0, 0, 0, 0];
      catFeedback.forEach(f => {
        const avg = (+f['q1-rating'] + +f['q2-rating'] + +f['q3-rating'] + +f['q4-rating']) / 4;
        const idx = Math.min(4, Math.max(0, Math.floor(avg / 2)));
        ratings[idx]++;
      });

      return { name: cat, averageRating: avgRating, ratings };
    });

    const timeLabels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    const averageRatings = [3.8, 4.2, 4.5, 4.6];

    res.json({ categories, feedbackCounts, categoryDetails, timeLabels, averageRatings });
  } catch (error) {
    console.error('Analytics error:', error.message);
    res.status(500).json({ error: 'Failed to load analytics data' });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Start HTTP + WebSocket Server
const server = app.listen(port, () => console.log(`Server running on port ${port}`));

const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
  console.log('WebSocket connected');
  ws.send(JSON.stringify({ status: 'connected' }));
  ws.on('close', () => console.log('WebSocket disconnected'));
});
