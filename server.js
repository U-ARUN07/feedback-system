// ============================
// Feedback System (Full Server)
// ============================

const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const WebSocket = require("ws");

const app = express();
const port = process.env.PORT || 4000;

// ------------------------------
// Middleware & Session Setup
// ------------------------------
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  session({
    secret: "Arun@2006", // ✅ your session key
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

// Serve static files (HTML, CSS, JS, Images)
app.use(express.static(path.join(__dirname, "public")));

// ------------------------------
// File Paths & Load Data
// ------------------------------
const usersFilePath = path.join(__dirname, "users.json");
const feedbackFilePath = path.join(__dirname, "feedback.json");

let usersData = [];
let feedbackData = [];

if (fs.existsSync(usersFilePath)) {
  usersData = JSON.parse(fs.readFileSync(usersFilePath, "utf8"));
}
if (fs.existsSync(feedbackFilePath)) {
  feedbackData = JSON.parse(fs.readFileSync(feedbackFilePath, "utf8"));
}

// ------------------------------
// Intro Page (Landing Page)
// ------------------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "intro.html"));
});

// ------------------------------
// Authentication Routes
// ------------------------------

// ✅ Register
app.post("/api/register", (req, res) => {
  const { name, email, username, password } = req.body;

  if (!name || !email || !username || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (usersData.some((u) => u.username === username)) {
    return res.status(400).json({ message: "Username already exists" });
  }

  usersData.push({ name, email, username, password });
  fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));

  res.json({ message: "User registered successfully" });
});

// ✅ Login
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const user = usersData.find(
    (u) => u.username === username && u.password === password
  );

  if (!user) {
    return res.status(401).json({ message: "Invalid username or password" });
  }

  req.session.user = { name: user.name, username: user.username };
  res.json({ message: "Login successful", name: user.name });
});

// ✅ Logout
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error("Error destroying session:", err);
    res.redirect("/");
  });
});

// ✅ Get Logged-in User Info
app.get("/api/name", (req, res) => {
  if (req.session.user) {
    res.json({ name: req.session.user.name });
  } else {
    res.status(401).json({ error: "Not logged in" });
  }
});

// ------------------------------
// Feedback Routes
// ------------------------------

// ✅ Category Page (Feedback Selection)
app.get("/feedback", (req, res) => {
  if (!req.session.user) return res.redirect("/index.html");
  res.sendFile(path.join(__dirname, "public", "feedback.html"));
});

// ✅ Submit Feedback
app.post("/submit-feedback", (req, res) => {
  if (!req.session.user) return res.status(401).send("Not logged in");

  const feedback = req.body;
  feedback.name = req.session.user.name;
  feedback.timestamp = new Date().toISOString();

  feedbackData.push(feedback);
  fs.writeFileSync(feedbackFilePath, JSON.stringify(feedbackData, null, 2));

  res.json({ message: "Feedback submitted successfully" });
});

// ✅ Fetch User Feedbacks
app.get("/api/feedback", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });

  const userFeedback = feedbackData.filter(
    (f) => f.name === req.session.user.name
  );
  res.json(userFeedback);
});

// ------------------------------
// Analytics Routes
// ------------------------------
app.get("/analytics", (req, res) => {
  if (!req.session.user) return res.redirect("/index.html");
  res.sendFile(path.join(__dirname, "public", "analytics.html"));
});

// ✅ API for Analytics Data
app.get("/api/analytics", (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ error: "Not logged in" });

  const analyticsData = generateAnalyticsData();
  res.json(analyticsData);
});

// ------------------------------
// Helper Functions
// ------------------------------
function generateAnalyticsData() {
  const days = 30;
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - days);

  const recentFeedback = feedbackData.filter(
    (f) => new Date(f.timestamp) >= thirtyDaysAgo
  );

  const categories = ["Restaurant", "Hotel", "Product", "Mall", "Institution"];
  const feedbackCounts = categories.map(
    (cat) => recentFeedback.filter((f) => f.category === cat).length
  );

  const timeLabels = [];
  const averageRatings = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    timeLabels.push(
      date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    );

    const dayFeedback = recentFeedback.filter(
      (f) => new Date(f.timestamp).toDateString() === date.toDateString()
    );

    if (dayFeedback.length > 0) {
      const avg =
        dayFeedback.reduce((sum, f) => {
          const total =
            (parseInt(f["q1-rating"]) || 0) +
            (parseInt(f["q2-rating"]) || 0) +
            (parseInt(f["q3-rating"]) || 0) +
            (parseInt(f["q4-rating"]) || 0);
          return sum + total / 4;
        }, 0) / dayFeedback.length;
      averageRatings.push(avg.toFixed(2));
    } else {
      averageRatings.push(0);
    }
  }

  const categoryDetails = categories.map((cat) => {
    const catFeedback = recentFeedback.filter((f) => f.category === cat);
    if (catFeedback.length === 0)
      return { name: cat, averageRating: 0, ratings: [0, 0, 0, 0, 0] };

    const total = catFeedback.reduce((sum, f) => {
      const avg =
        ((parseInt(f["q1-rating"]) || 0) +
          (parseInt(f["q2-rating"]) || 0) +
          (parseInt(f["q3-rating"]) || 0) +
          (parseInt(f["q4-rating"]) || 0)) /
        4;
      return sum + avg;
    }, 0);

    const averageRating = total / catFeedback.length;
    const ratings = [0, 0, 0, 0, 0];
    catFeedback.forEach((f) => {
      const avg =
        ((parseInt(f["q1-rating"]) || 0) +
          (parseInt(f["q2-rating"]) || 0) +
          (parseInt(f["q3-rating"]) || 0) +
          (parseInt(f["q4-rating"]) || 0)) /
        4;
      const rounded = Math.round(avg);
      if (rounded >= 1 && rounded <= 5) ratings[rounded - 1]++;
    });

    return { name: cat, averageRating, ratings };
  });

  return {
    categories,
    feedbackCounts,
    timeLabels,
    averageRatings,
    categoryDetails,
  };
}

// ------------------------------
// WebSocket for Real-time Analytics
// ------------------------------
const server = app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});

const wss = new WebSocket.Server({ server, path: "/ws/analytics" });

wss.on("connection", (ws) => {
  console.log("📊 New WebSocket connection (Analytics)");

  const sendAnalytics = () => {
    const analyticsData = generateAnalyticsData();
    ws.send(JSON.stringify(analyticsData));
  };

  sendAnalytics();
  const interval = setInterval(sendAnalytics, 10000); // update every 10s

  ws.on("close", () => {
    clearInterval(interval);
    console.log("❌ Analytics WebSocket closed");
  });
});
