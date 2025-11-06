import express from "express";
import path from "path";
import fetch from "node-fetch";
import session from "express-session";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Load environment variables
const USERS_BIN = process.env.USERS_BIN_ID;     // ✅ corrected variable name
const FEEDBACK_BIN = process.env.FEEDBACK_BIN_ID;
const API_KEY = process.env.JSONBIN_API_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET || "Arun@2006";

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

// Serve static files
app.use(express.static("public"));

// ✅ Landing page
app.get("/", (req, res) => {
  res.sendFile(path.resolve("public/intro.html"));
});


// ✅ Fetch all users from JSONBin
async function getUsers() {
  const response = await fetch(`https://api.jsonbin.io/v3/b/${USERS_BIN}/latest`, {
    headers: { "X-Master-Key": API_KEY },
  });
  const data = await response.json();
  return data.record || [];
}

// ✅ Save users to JSONBin
async function saveUsers(users) {
  await fetch(`https://api.jsonbin.io/v3/b/${USERS_BIN}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": API_KEY,
    },
    body: JSON.stringify(users),
  });
}

// ✅ Fetch feedbacks
async function getFeedback() {
  const response = await fetch(`https://api.jsonbin.io/v3/b/${FEEDBACK_BIN}/latest`, {
    headers: { "X-Master-Key": API_KEY },
  });
  const data = await response.json();
  return data.record || [];
}

// ✅ Save feedbacks
async function saveFeedback(feedback) {
  await fetch(`https://api.jsonbin.io/v3/b/${FEEDBACK_BIN}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": API_KEY,
    },
    body: JSON.stringify(feedback),
  });
}

// ✅ Register user
app.post("/register", async (req, res) => {
  try {
    const { name, email, username, password } = req.body;
    if (!name || !email || !username || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const users = await getUsers();
    const exists = users.find((u) => u.username === username || u.email === email);
    if (exists) {
      return res.status(400).json({ message: "User already exists." });
    }

    users.push({ name, email, username, password });
    await saveUsers(users);
    console.log(`✅ Registered: ${username}`);
    res.status(200).json({ message: "User registered successfully!" });
  } catch (err) {
    console.error("❌ Registration Error:", err);
    res.status(500).json({ message: "Network error. Please try again." });
  }
});

// ✅ Login user
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const users = await getUsers();

    const user = users.find(
      (u) => u.username === username && u.password === password
    );

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    req.session.user = user;
    console.log(`✅ Logged in: ${user.name}`);
    res.status(200).json({
      message: `Welcome ${user.name}!`,
      redirect: "/feedback.html",
    });
  } catch (err) {
    console.error("❌ Login Error:", err);
    res.status(500).json({ message: "Server error. Please try again." });
  }
});

// ✅ Logout
app.post("/logout", (req, res) => {
  const name = req.session.user?.name || "User";
  req.session.destroy(() => {
    console.log(`👋 ${name} logged out.`);
    res.status(200).json({ message: `Visit again, ${name}!` });
  });
});

// ✅ Submit feedback
app.post("/submit-feedback", async (req, res) => {
  try {
    const feedback = await getFeedback();
    feedback.push(req.body);
    await saveFeedback(feedback);
    console.log(`📝 New feedback submitted by ${req.body.name}`);
    res.status(200).json({ message: "Feedback submitted successfully!" });
  } catch (err) {
    console.error("❌ Feedback Error:", err);
    res.status(500).json({ message: "Error submitting feedback." });
  }
});

// ✅ Get feedback for display page
app.get("/api/feedback", async (req, res) => {
  try {
    const feedback = await getFeedback();
    res.json(feedback);
  } catch (err) {
    console.error("❌ Fetch feedback error:", err);
    res.status(500).json({ message: "Failed to load feedback." });
  }
});

// ✅ Get logged-in user
app.get("/api/name", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Not logged in" });
  }
  res.json({ name: req.session.user.name });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
