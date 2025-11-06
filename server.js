const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const WebSocket = require("ws");

const app = express();
const port = process.env.PORT || 4000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  session({
    secret: "Arun@2006",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);
app.use(express.static(path.join(__dirname, "public")));

const usersFilePath = path.join(__dirname, "users.json");
const feedbackFilePath = path.join(__dirname, "feedback.json");

let usersData = fs.existsSync(usersFilePath)
  ? JSON.parse(fs.readFileSync(usersFilePath, "utf8"))
  : [];
let feedbackData = fs.existsSync(feedbackFilePath)
  ? JSON.parse(fs.readFileSync(feedbackFilePath, "utf8"))
  : [];

// ✅ Redirect base URL to intro.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "intro.html"));
});

// ✅ Registration
app.post("/api/register", (req, res) => {
  const { name, email, username, password } = req.body;
  if (!name || !email || !username || !password)
    return res.status(400).json({ message: "All fields are required" });

  if (usersData.some((u) => u.username === username))
    return res.status(400).json({ message: "Username already exists" });

  usersData.push({ name, email, username, password });
  fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
  res.json({ message: "Registered successfully!" });
});

// ✅ Login
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const user = usersData.find(
    (u) => u.username === username && u.password === password
  );

  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  req.session.user = { name: user.name, username: user.username };
  res.json({ message: `Welcome ${user.name}!`, name: user.name });
});

// ✅ Logout with custom message
app.get("/logout", (req, res) => {
  const name = req.session.user?.name || "User";
  req.session.destroy(() => {
    res.send(`
      <html>
      <head>
        <meta http-equiv="refresh" content="2;url=/" />
        <style>
          body {
            background: #0d1b2a;
            color: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            font-family: 'Poppins', sans-serif;
          }
        </style>
      </head>
      <body>
        <h2>👋 Visit again soon, ${name}!</h2>
      </body>
      </html>
    `);
  });
});

// ✅ API for logged user
app.get("/api/name", (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ error: "Not logged in" });
  res.json({ name: req.session.user.name });
});

// ✅ Feedback category pages
const categories = ["restaurant", "hotel", "mall", "institution", "product"];
categories.forEach((cat) => {
  app.get(`/${cat}-feedback`, (req, res) => {
    if (!req.session.user) return res.redirect("/index.html");
    res.sendFile(path.join(__dirname, "public", `${cat}-feedback.html`));
  });
});

// ✅ Feedback display route
app.get("/feedback-display", (req, res) => {
  if (!req.session.user) return res.redirect("/index.html");
  res.sendFile(path.join(__dirname, "public", "feedback-display.html"));
});

// ✅ Submit feedback
app.post("/submit-feedback", (req, res) => {
  if (!req.session.user) return res.status(401).send("Not logged in");

  const feedback = req.body;
  feedback.name = req.session.user.name;
  feedback.timestamp = new Date().toISOString();
  feedbackData.push(feedback);

  fs.writeFileSync(feedbackFilePath, JSON.stringify(feedbackData, null, 2));
  res.json({ message: "Feedback submitted successfully!" });
});

// ✅ Get all feedback for display
app.get("/api/feedback", (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ error: "Not logged in" });
  res.json(feedbackData);
});

// ✅ Analytics page
app.get("/analytics", (req, res) => {
  if (!req.session.user) return res.redirect("/index.html");
  res.sendFile(path.join(__dirname, "public", "analytics.html"));
});

// ✅ Analytics API
app.get("/api/analytics", (req, res) => {
  res.json(generateAnalyticsData());
});

// Function: Generate Analytics Data
function generateAnalyticsData() {
  const cats = ["Restaurant", "Hotel", "Mall", "Institution", "Product"];
  const feedbackCounts = cats.map(
    (c) => feedbackData.filter((f) => f.category === c).length
  );

  const categoryDetails = cats.map((c) => {
    const catFeedback = feedbackData.filter((f) => f.category === c);
    if (catFeedback.length === 0)
      return { name: c, averageRating: 0, ratings: [0, 0, 0, 0, 0] };

    const avg =
      catFeedback.reduce((sum, f) => {
        const total =
          (parseInt(f["q1-rating"]) +
            parseInt(f["q2-rating"]) +
            parseInt(f["q3-rating"]) +
            parseInt(f["q4-rating"])) /
          4;
        return sum + total;
      }, 0) / catFeedback.length;

    const ratings = [0, 0, 0, 0, 0];
    catFeedback.forEach((f) => {
      const total =
        (parseInt(f["q1-rating"]) +
          parseInt(f["q2-rating"]) +
          parseInt(f["q3-rating"]) +
          parseInt(f["q4-rating"])) /
        4;
      const rounded = Math.min(5, Math.max(1, Math.round(total / 2))); // fix normalization
      ratings[rounded - 1]++;
    });

    return { name: c, averageRating: avg / 2, ratings };
  });

  return {
    categories: cats,
    feedbackCounts,
    categoryDetails,
  };
}

// ✅ Start WebSocket for live analytics
const server = app.listen(port, () => {
  console.log(`🚀 Running on http://localhost:${port}`);
});

const wss = new WebSocket.Server({ server, path: "/ws/analytics" });
wss.on("connection", (ws) => {
  ws.send(JSON.stringify(generateAnalyticsData()));
});
