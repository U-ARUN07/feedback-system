// server.js — Final Feedback System Server
import express from "express";
import path from "path";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import session from "express-session";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Path Setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "Arun@2006",
    resave: false,
    saveUninitialized: false,
  })
);

// ✅ Root route → Intro page
app.get("/", (req, res) => {
  const introPath = path.join(__dirname, "public", "intro.html");
  res.sendFile(introPath);
});

// ✅ Redirect safeguard
app.get("/intro", (req, res) => {
  res.redirect("/");
});

// ✅ Protect Feedback & Analytics Routes
function ensureLogin(req, res, next) {
  if (req.session.user) next();
  else res.redirect("/index.html");
}

// ✅ Serve Feedback Category Page
app.get("/feedback", ensureLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "feedback.html"));
});

// ✅ Serve Analytics Page
app.get("/analytics", ensureLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "analytics.html"));
});

// ✅ Serve Feedback Display Page
app.get("/feedback-display", ensureLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "feedback-display.html"));
});

// ===================================================
//  🔹 AUTHENTICATION ROUTES
// ===================================================
const JSONBIN_URL = "https://api.jsonbin.io/v3/b/"; // change to your bin
const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY || "";

// ✅ Register user
app.post("/api/register", async (req, res) => {
  const { name, email, username, password } = req.body;
  if (!name || !email || !username || !password)
    return res.status(400).json({ message: "Missing required fields." });

  try {
    // Fetch existing users from JSONBin
    const getRes = await fetch(`${JSONBIN_URL}${process.env.USER_BIN_ID}/latest`, {
      headers: { "X-Master-Key": JSONBIN_API_KEY },
    });
    const data = await getRes.json();
    const users = data.record || [];

    if (users.find((u) => u.username === username)) {
      return res.status(409).json({ message: "Username already exists." });
    }

    users.push({ name, email, username, password });

    await fetch(`${JSONBIN_URL}${process.env.USER_BIN_ID}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": JSONBIN_API_KEY,
      },
      body: JSON.stringify(users),
    });

    res.status(201).json({ message: "User registered successfully!" });
  } catch (error) {
    console.error("Error in /api/register:", error);
    res.status(500).json({ message: "Server error." });
  }
});

// ✅ Login
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: "Missing credentials." });

  try {
    const response = await fetch(`${JSONBIN_URL}${process.env.USER_BIN_ID}/latest`, {
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
    res.json({ message: `Welcome ${user.name}!` });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error." });
  }
});

// ✅ Get logged-in user info
app.get("/api/name", (req, res) => {
  if (req.session.user) res.json({ name: req.session.user.name });
  else res.status(401).json({ message: "Not logged in" });
});

// ✅ Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/index.html");
  });
});

// ===================================================
//  🔹 FEEDBACK MANAGEMENT
// ===================================================
app.post("/submit-feedback", ensureLogin, async (req, res) => {
  const feedback = req.body;
  feedback.user = req.session.user.username;
  feedback.timestamp = new Date().toISOString();

  try {
    const getRes = await fetch(`${JSONBIN_URL}${process.env.FEEDBACK_BIN_ID}/latest`, {
      headers: { "X-Master-Key": JSONBIN_API_KEY },
    });
    const data = await getRes.json();
    const allFeedback = data.record || [];

    allFeedback.push(feedback);

    await fetch(`${JSONBIN_URL}${process.env.FEEDBACK_BIN_ID}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": JSONBIN_API_KEY,
      },
      body: JSON.stringify(allFeedback),
    });

    res.status(200).json({ message: "Feedback submitted successfully!" });
  } catch (error) {
    console.error("Feedback submit error:", error);
    res.status(500).json({ message: "Error saving feedback." });
  }
});

app.get("/api/feedback", ensureLogin, async (req, res) => {
  try {
    const response = await fetch(`${JSONBIN_URL}${process.env.FEEDBACK_BIN_ID}/latest`, {
      headers: { "X-Master-Key": JSONBIN_API_KEY },
    });
    const data = await response.json();
    res.json(data.record || []);
  } catch (error) {
    console.error("Error fetching feedback:", error);
    res.status(500).json({ message: "Error retrieving feedback." });
  }
});

// ===================================================
//  🔹 START SERVER
// ===================================================
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
