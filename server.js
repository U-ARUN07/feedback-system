// server.js (with JSONBin persistent storage)
const express = require('express');
const path = require('path');
const session = require('express-session');
const WebSocket = require('ws');
const app = express();
const port = process.env.PORT || 4000;

// 🔑 Load environment variables (from Render)
const USERS_BIN_ID = process.env.USERS_BIN_ID;
const FEEDBACK_BIN_ID = process.env.FEEDBACK_BIN_ID;
const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET || 'feedback@mlrit2025';

// Middleware setup
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));
app.use(express.static(path.join(__dirname, 'public')));

// Helper functions for JSONBin API
async function readBin(binId) {
  const response = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
    headers: { "X-Master-Key": JSONBIN_API_KEY }
  });
  const data = await response.json();
  return data.record || [];
}

async function writeBin(binId, data) {
  await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": JSONBIN_API_KEY
    },
    body: JSON.stringify(data)
  });
}

// Initialize cache
let usersData = [];
let feedbackData = [];

(async () => {
  usersData = await readBin(USERS_BIN_ID);
  feedbackData = await readBin(FEEDBACK_BIN_ID);
})();

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'intro.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get('/feedback', (req, res) => req.session.name ? res.sendFile(path.join(__dirname, 'public', 'feedback.html')) : res.redirect('/login'));

// Register
app.post('/register', async (req, res) => {
  const { name, email, username, password, confirmPassword } = req.body;
  if (!name || !email || !username || !password || !confirmPassword)
    return res.status(400).send('All fields required');
  if (password !== confirmPassword)
    return res.status(400).send('Passwords do not match');
  if (usersData.some(u => u.username === username))
    return res.status(400).send('Username already exists');

  usersData.push({ name, email, username, password });
  await writeBin(USERS_BIN_ID, usersData);
  res.redirect('/login');
});

// Login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = usersData.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).send('Invalid credentials');
  req.session.name = user.name;
  res.redirect('/feedback');
});

// Feedback forms
const feedbackPages = ['restaurant', 'hotel', 'product', 'mall', 'institution'];
feedbackPages.forEach(page => {
  app.get(`/${page}-feedback`, (req, res) => {
    if (!req.session.name) return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'public', `${page}-feedback.html`));
  });
});

// Submit feedback
app.post('/submit-feedback', async (req, res) => {
  if (!req.session.name) return res.redirect('/login');
  const feedback = { ...req.body, name: req.session.name, timestamp: new Date().toISOString() };
  feedbackData.push(feedback);
  await writeBin(FEEDBACK_BIN_ID, feedbackData);
  res.redirect('/feedback-display');
});

// Display pages
app.get('/feedback-display', (req, res) => req.session.name ? res.sendFile(path.join(__dirname, 'public', 'feedback-display.html')) : res.redirect('/login'));
app.get('/analytics', (req, res) => req.session.name ? res.sendFile(path.join(__dirname, 'public', 'analytics.html')) : res.redirect('/login'));

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Analytics API
app.get('/api/analytics', (req, res) => {
  if (!req.session.name) return res.status(401).json({ error: 'Not logged in' });
  const analyticsData = generateAnalyticsData();
  res.json(analyticsData);
});

// Helper to generate analytics
function generateAnalyticsData() {
  const recentFeedback = feedbackData;
  const categories = ['Restaurant', 'Hotel', 'Product', 'Mall', 'Institution'];
  const feedbackCounts = categories.map(cat => recentFeedback.filter(f => f.category === cat).length);
  return { categories, feedbackCounts };
}

// Start server
const server = app.listen(port, () => console.log(`✅ Server running on port ${port}`));
const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
  const sendData = () => ws.send(JSON.stringify(generateAnalyticsData()));
  sendData();
  const interval = setInterval(sendData, 5000);
  ws.on('close', () => clearInterval(interval));
});
