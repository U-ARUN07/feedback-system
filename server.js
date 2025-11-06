// ✅ Feedback System Server.js (Final Version)
// Developed for: U ARUN

import express from "express";
import bodyParser from "body-parser";
import session from "express-session";
import path from "path";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Path setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware setup
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "Arun@2006",
    resave: false,
    saveUninitialized: false,
  })
);

// ======================================================
// 🏠 DEFAULT PAGE (Intro)
// ======================================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "intro.html"));
});

app.get("/intro", (req, res) => {
  res.redirect("/");
});

// ======================================================
// 🔒 AUTHENTICATION HANDLERS
// ======================================================

const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY;
const JSONBIN_URL = "https://api.jsonbin.io/v3/b/";
const USER_BIN_ID = process.env.USER_BIN_ID;
const FEEDBACK_BIN_ID = process.env.FEEDBACK_BIN_ID;

// ✅ Register new user
app.post("/api/register", async (req, res) => {
  const { fullname, email, username, password } = req.body;

  if (!fullname || !email || !username || !password)
    return res.status(400).json({ message: "All fields are required." });

  try {
    const response = await fetch(`${JSONBIN_URL}${USER_BIN_ID}/latest`, {
      headers: { "X-Master-Key": JSONBIN_API_KEY },
    });
    const data = await response.json();
    const users = data.record || [];

    if (users.find((u) => u.username === username)) {
      return res.status(400).json({ message: "Username already exists." });
    }

    users.push({ fullname, email, username, password });

    await fetch(`${JSONBIN_URL}${USER_BIN_ID}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": JSONBIN_API_KEY,
      },
      body: JSON.stringify(users),
    });

    res.status(200).json({ message: "User registered successfully!" });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error during registration." });
  }
});

// ✅ Login existing user
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ message: "Enter username and password." });

  try {
    const response = await fetch(`${JSONBIN_URL}${USER_BIN_ID}/latest`, {
      headers: { "X-Master-Key": JSONBIN_API_KEY },
    });
    const data = await response.json();
    const users = data.record || [];

    const user = users.find(
      (u) => u.username === username && u.password === password
    );

    if (!user)
      return res.status(401).json({ message: "Invalid username or password." });

    req.session.user = user;
    res.json({ message: `Welcome ${user.fullname}!` });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error during login." });
  }
});

// ✅ Logout route
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/index.html");
  });
});

// ✅ Get logged-in user info
app.get("/api/name", (req, res) => {
  if (req.session.user) {
    res.json({ name: req.session.user.fullname });
  } else {
    res.status(401).json({ message: "Not logged in." });
  }
});

// ======================================================
// 🔐 AUTH MIDDLEWARE (Protect private pages)
// ======================================================
function ensureLogin(req, res, next) {
  if (req.session.user) next();
  else res.redirect("/index.html");
}

// ======================================================
// 📋 FEEDBACK ROUTES
// ======================================================

// ✅ Submit feedback
app.post("/submit-feedback", ensureLogin, async (req, res) => {
  const feedback = req.body;
  feedback.username = req.session.user.username;
  feedback.timestamp = new Date().toISOString();

  try {
    const response = await fetch(`${JSONBIN_URL}${FEEDBACK_BIN_ID}/latest`, {
      headers: { "X-Master-Key": JSONBIN_API_KEY },
    });
    const data = await response.json();
    const feedbacks = data.record || [];

    feedbacks.push(feedback);

    await fetch(`${JSONBIN_URL}${FEEDBACK_BIN_ID}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": JSONBIN_API_KEY,
      },
      body: JSON.stringify(feedbacks),
    });

    res.status(200).json({ message: "Feedback submitted successfully!" });
  } catch (err) {
    console.error("Feedback error:", err);
    res.status(500).json({ message: "Error saving feedback." });
  }
});

// ✅ Get all feedback
app.get("/api/feedback", ensureLogin, async (req, res) => {
  try {
    const response = await fetch(`${JSONBIN_URL}${FEEDBACK_BIN_ID}/latest`, {
      headers: { "X-Master-Key": JSONBIN_API_KEY },
    });
    const data = await response.json();
    res.json(data.record || []);
  } catch (err) {
    console.error("Fetch feedback error:", err);
    res.status(500).json({ message: "Error loading feedback." });
  }
});

// ======================================================
// 📊 PAGE ROUTES
// ======================================================
app.get("/feedback", ensureLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "feedback.html"));
});

app.get("/feedback-display", ensureLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "feedback-display.html"));
});

app.get("/analytics", ensureLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "analytics.html"));
});

// ======================================================
// 🚀 SERVER START
// ======================================================
app.listen(PORT, () => {
  console.log(`✅ Feedback System running at: http://localhost:${PORT}`);
});
