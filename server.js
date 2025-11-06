import express from "express";
import bodyParser from "body-parser";
import session from "express-session";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

// Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "Arun@2006",
    resave: false,
    saveUninitialized: true,
  })
);
app.use(express.static(path.join(__dirname, "public")));

// JSONBin details
const API_KEY = process.env.JSONBIN_API_KEY;
const USERS_BIN = process.env.USER_BIN_ID;
const FEEDBACK_BIN = process.env.FEEDBACK_BIN_ID;
const BASE_URL = "https://api.jsonbin.io/v3/b";

// Fetch Bin Data
async function getBinData(binId) {
  try {
    const res = await fetch(`${BASE_URL}/${binId}/latest`, {
      headers: { "X-Master-Key": API_KEY },
    });
    const data = await res.json();
    return data.record || [];
  } catch (err) {
    console.error("Error fetching JSONBin data:", err);
    return [];
  }
}

// Update Bin Data
async function updateBinData(binId, newData) {
  try {
    await fetch(`${BASE_URL}/${binId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": API_KEY,
      },
      body: JSON.stringify(newData),
    });
  } catch (err) {
    console.error("Error updating JSONBin data:", err);
  }
}

//
// 🌟 ROUTES
//

// Intro Page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "intro.html"));
});

// Register Page
app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "register.html"));
});

// Login Page
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Register Logic
app.post("/register", async (req, res) => {
  const { name, email, username, password, confirmPassword } = req.body;

  if (!name || !email || !username || !password || !confirmPassword)
    return res.status(400).send("All fields are required");

  if (password !== confirmPassword)
    return res.status(400).send("Passwords do not match");

  const users = await getBinData(USERS_BIN);
  if (users.some((u) => u.username === username))
    return res.status(400).send("Username already exists");

  const newUser = { name, email, username, password };
  users.push(newUser);
  await updateBinData(USERS_BIN, users);

  console.log(`✅ Registered: ${username}`);
  res.redirect("/login");
});

// Login Logic
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const users = await getBinData(USERS_BIN);
  const user = users.find(
    (u) => u.username === username && u.password === password
  );

  if (!user) return res.status(401).send("Invalid credentials");

  req.session.user = user;
  console.log(`✅ Logged in: ${user.name}`);
  res.redirect("/feedback");
});

// Feedback Categories
app.get("/feedback", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.sendFile(path.join(__dirname, "public", "feedback.html"));
});

// Submit Feedback
app.post("/submit-feedback", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const feedbacks = await getBinData(FEEDBACK_BIN);
  const newFeedback = {
    ...req.body,
    name: req.session.user.name,
    timestamp: new Date().toISOString(),
  };

  feedbacks.push(newFeedback);
  await updateBinData(FEEDBACK_BIN, feedbacks);

  console.log(`✅ Feedback submitted by ${req.session.user.name}`);
  res.redirect("/feedback-display");
});

// Feedback Display
app.get("/feedback-display", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.sendFile(path.join(__dirname, "public", "feedback-display.html"));
});

// Analytics
app.get("/analytics", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.sendFile(path.join(__dirname, "public", "analytics.html"));
});

// API - Get Logged-in User
app.get("/api/name", (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ error: "Not logged in" });
  res.json({ name: req.session.user.name });
});

// API - Get Feedback Data
app.get("/api/feedback", async (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ error: "Not logged in" });

  const feedbacks = await getBinData(FEEDBACK_BIN);
  res.json(feedbacks);
});

// Logout
app.get("/logout", (req, res) => {
  if (req.session.user) console.log(`👋 ${req.session.user.name} logged out`);
  req.session.destroy(() => res.redirect("/?logout=1"));
});

// Start Server
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
