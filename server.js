// ✅ FEEDBACK SYSTEM - FINAL FULL SERVER CODE (with intro redirect + JSONBin storage)
// Author: U ARUN

import express from "express";
import bodyParser from "body-parser";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 4000;

// ✅ Fix for ESM path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ JSONBin API Setup
const JSONBIN_URL = "https://api.jsonbin.io/v3/b/";
const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY;
const USER_BIN_ID = process.env.USER_BIN_ID;
const FEEDBACK_BIN_ID = process.env.FEEDBACK_BIN_ID;

// ✅ Fetch support for Node 16+
const fetchFn = global.fetch || ((...args) => import("node-fetch").then(({ default: f }) => f(...args)));

// ✅ Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "Arun@2006",
    resave: false,
    saveUninitialized: false,
  })
);

// ====================================================
// 🌐 ROUTES
// ====================================================

// 🏠 Landing (Intro Page)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "intro.html"));
});

// ✅ Redirect for /intro
app.get("/intro", (req, res) => {
  res.redirect("/");
});

// ====================================================
// 🔐 AUTHENTICATION
// ====================================================

// 🧾 Register User
app.post("/api/register", async (req, res) => {
  const { fullname, email, username, password } = req.body;

  if (!fullname || !email || !username || !password)
    return res.status(400).json({ message: "⚠️ All fields are required." });

  try {
    // Fetch existing users
    const response = await fetchFn(`${JSONBIN_URL}${USER_BIN_ID}/latest`, {
      headers: { "X-Master-Key": JSONBIN_API_KEY },
    });
    const data = await response.json();
    const users = data.record || [];

    // Check for duplicates
    if (users.some((u) => u.username === username))
      return res.status(409).json({ message: "❌ Username already exists." });

    users.push({ fullname, email, username, password });

    // Save updated users
    await fetchFn(`${JSONBIN_URL}${USER_BIN_ID}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": JSONBIN_API_KEY,
      },
      body: JSON.stringify(users),
    });

    res.status(201).json({ message: "✅ Registration successful!" });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Server error during registration." });
  }
});

// 🧍 Login User
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ message: "⚠️ Enter both fields." });

  try {
    const response = await fetchFn(`${JSONBIN_URL}${USER_BIN_ID}/latest`, {
      headers: { "X-Master-Key": JSONBIN_API_KEY },
    });
    const data = await response.json();
    const users = data.record || [];

    const user = users.find(
      (u) => u.username === username && u.password === password
    );

    if (!user) return res.status(401).json({ message: "❌ Invalid credentials." });

    req.session.user = user;
    res.json({ message: `Welcome ${user.fullname}!` });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error during login." });
  }
});

// 🧾 Get User Name
app.get("/api/name", (req, res) => {
  if (req.session.user) res.json({ name: req.session.user.fullname });
  else res.status(401).json({ message: "Not logged in." });
});

// 🚪 Logout
app.get("/logout", (req, res) => {
  const name = req.session.user?.fullname || "User";
  req.session.destroy(() => {
    res.send(`
      <html style="font-family: Arial; background: #0d1b2a; color: white; text-align: center; padding: 100px;">
        <h1>👋 Visit Again, ${name}!</h1>
        <p>We hope to see your valuable feedback soon!</p>
        <a href="/" style="color:#4cc9f0;text-decoration:none;font-size:18px;">Return to Home</a>
      </html>
    `);
  });
});

// ====================================================
// 🧩 AUTH MIDDLEWARE
// ====================================================
function ensureLogin(req, res, next) {
  if (req.session.user) next();
  else res.redirect("/index.html");
}

// ====================================================
// 📝 FEEDBACK SYSTEM
// ====================================================

// Submit feedback
app.post("/submit-feedback", ensureLogin, async (req, res) => {
  const feedback = req.body;
  feedback.username = req.session.user.username;
  feedback.fullname = req.session.user.fullname;
  feedback.timestamp = new Date().toISOString();

  try {
    const response = await fetchFn(`${JSONBIN_URL}${FEEDBACK_BIN_ID}/latest`, {
      headers: { "X-Master-Key": JSONBIN_API_KEY },
    });
    const data = await response.json();
    const feedbacks = data.record || [];

    feedbacks.push(feedback);

    await fetchFn(`${JSONBIN_URL}${FEEDBACK_BIN_ID}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": JSONBIN_API_KEY,
      },
      body: JSON.stringify(feedbacks),
    });

    res.status(200).json({ message: "✅ Feedback submitted successfully!" });
  } catch (error) {
    console.error("Feedback error:", error);
    res.status(500).json({ message: "Error submitting feedback." });
  }
});

// Get feedback list
app.get("/api/feedback", ensureLogin, async (req, res) => {
  try {
    const response = await fetchFn(`${JSONBIN_URL}${FEEDBACK_BIN_ID}/latest`, {
      headers: { "X-Master-Key": JSONBIN_API_KEY },
    });
    const data = await response.json();
    res.json(data.record || []);
  } catch (error) {
    console.error("Feedback fetch error:", error);
    res.status(500).json({ message: "Error fetching feedback." });
  }
});

// ====================================================
// 🌐 PAGE ROUTES
// ====================================================
app.get("/feedback", ensureLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "feedback.html"));
});

app.get("/feedback-display", ensureLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "feedback-display.html"));
});

app.get("/analytics", ensureLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "analytics.html"));
});

// Category pages
["restaurant", "hotel", "mall", "institution", "product"].forEach((category) => {
  app.get(`/${category}-feedback`, ensureLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "public", `${category}-feedback.html`));
  });
});

// ====================================================
// 🚀 SERVER START
// ====================================================
app.listen(PORT, () => {
  console.log(`✅ Feedback System running at http://localhost:${PORT}`);
});
