const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const WebSocket = require('ws');
const app = express();
const port = 4000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));
// At the top of server.js, after middleware setup
app.get('/', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'public', 'intro.html');
        console.log(`Attempting to serve: ${filePath}`);

        if (!fs.existsSync(filePath)) {
            console.error('Error: intro.html not found at path');
            return res.status(500).send('Intro page not available');
        }

        res.sendFile(filePath);
    } catch (err) {
        console.error('Root route error:', err);
        res.status(500).send('Server error');
    }
});

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// Files to store data
const feedbackFilePath = path.join(__dirname, 'feedback.json');
const usersFilePath = path.join(__dirname, 'users.json');

// Load existing data (if any)
let feedbackData = [];
let usersData = [];
if (fs.existsSync(feedbackFilePath)) {
    feedbackData = JSON.parse(fs.readFileSync(feedbackFilePath, 'utf8'));
}
if (fs.existsSync(usersFilePath)) {
    usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
}

// Route for the intro/welcome page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'intro.html'));
});

// Route for the login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route for the registration page
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Registration route
app.post('/register', (req, res) => {
    const { name, email, username, password, confirmPassword } = req.body;

    if (!name || !email || !username || !password || !confirmPassword) {
        return res.status(400).send('All fields are required');
    }
    if (password !== confirmPassword) {
        return res.status(400).send('Passwords do not match');
    }

    if (usersData.some(user => user.username === username)) {
        return res.status(400).send('Username already exists');
    }

    const user = { name, email, username, password };
    usersData.push(user);
    fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));

    res.redirect('/login');
});

// Login route
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    const user = usersData.find(user => user.username === username && user.password === password);
    if (!user) {
        return res.status(401).send('Invalid credentials');
    }

    req.session.name = user.name;
    res.redirect('/feedback');
});

// Feedback categories page
app.get('/feedback', (req, res) => {
    if (!req.session.name) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'feedback.html'));
});

// API endpoint to fetch the user's name
app.get('/api/name', (req, res) => {
    if (req.session.name) {
        res.json({ name: req.session.name });
    } else {
        res.status(401).json({ error: 'Not logged in' });
    }
});

// Feedback forms
app.get('/restaurant-feedback', (req, res) => {
    if (!req.session.name) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'restaurant-feedback.html'));
});

app.get('/hotel-feedback', (req, res) => {
    if (!req.session.name) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'hotel-feedback.html'));
});

app.get('/product-feedback', (req, res) => {
    if (!req.session.name) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'product-feedback.html'));
});

app.get('/mall-feedback', (req, res) => {
    if (!req.session.name) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'mall-feedback.html'));
});

app.get('/institution-feedback', (req, res) => {
    if (!req.session.name) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'institution-feedback.html'));
});

// Submit feedback route
app.post('/submit-feedback', (req, res) => {
    if (!req.session.name) {
        return res.redirect('/login');
    }

    const feedback = req.body;
    feedback.name = req.session.name;
    feedback.timestamp = new Date().toISOString();

    feedbackData.push(feedback);
    fs.writeFileSync(feedbackFilePath, JSON.stringify(feedbackData, null, 2));

    res.redirect('/feedback-display');
});

// Feedback display page
app.get('/feedback-display', (req, res) => {
    if (!req.session.name) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'feedback-display.html'));
});

// Analytics page
app.get('/analytics', (req, res) => {
    if (!req.session.name) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'analytics.html'));
});

// API endpoint to fetch feedback data for the logged-in user
app.get('/api/feedback', (req, res) => {
    if (!req.session.name) {
        return res.status(401).json({ error: 'Not logged in' });
    }
    const userFeedback = feedbackData.filter(feedback => feedback.name === req.session.name);
    res.json(userFeedback);
});

// Analytics data API
app.get('/api/analytics', (req, res) => {
    if (!req.session.name) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    const analyticsData = generateAnalyticsData();
    res.json(analyticsData);
});

// Helper function to generate analytics data
function generateAnalyticsData() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentFeedback = feedbackData.filter(feedback =>
        new Date(feedback.timestamp) >= thirtyDaysAgo
    );

    const categories = ['Restaurant', 'Hotel', 'Product', 'Mall', 'Institution'];
    const feedbackCounts = categories.map(cat =>
        recentFeedback.filter(f => f.category === cat).length
    );

    const timeLabels = [];
    const averageRatings = [];

    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        timeLabels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

        const dayFeedback = recentFeedback.filter(f => {
            const feedbackDate = new Date(f.timestamp);
            return feedbackDate.toDateString() === date.toDateString();
        });

        if (dayFeedback.length > 0) {
            const totalRatings = dayFeedback.reduce((sum, feedback) => {
                return sum + (
                    (parseInt(feedback['q1-rating']) || 0) +
                    (parseInt(feedback['q2-rating']) || 0) +
                    (parseInt(feedback['q3-rating']) || 0) +
                    (parseInt(feedback['q4-rating']) || 0)
                ) / 4;
            }, 0);

            averageRatings.push(totalRatings / dayFeedback.length);
        } else {
            averageRatings.push(0);
        }
    }

    const categoryDetails = categories.map(category => {
        const categoryFeedback = recentFeedback.filter(f => f.category === category);

        if (categoryFeedback.length === 0) {
            return {
                name: category,
                averageRating: 0,
                ratings: [0, 0, 0, 0, 0]
            };
        }

        const totalRating = categoryFeedback.reduce((sum, feedback) => {
            return sum + (
                (parseInt(feedback['q1-rating']) || 0) +
                (parseInt(feedback['q2-rating']) || 0) +
                (parseInt(feedback['q3-rating']) || 0) +
                (parseInt(feedback['q4-rating']) || 0)
            ) / 4;
        }, 0);

        const averageRating = totalRating / categoryFeedback.length;

        const ratings = [0, 0, 0, 0, 0];
        categoryFeedback.forEach(feedback => {
            const rating = Math.round((
                (parseInt(feedback['q1-rating']) || 0) +
                (parseInt(feedback['q2-rating']) || 0) +
                (parseInt(feedback['q3-rating']) || 0) +
                (parseInt(feedback['q4-rating']) || 0)
            ) / 4);

            if (rating >= 1 && rating <= 5) {
                ratings[rating - 1]++;
            }
        });

        return {
            name: category,
            averageRating,
            ratings
        };
    });

    return {
        categories,
        feedbackCounts,
        timeLabels,
        averageRatings,
        categoryDetails
    };
}

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.redirect('/');
    });
});

// Create HTTP server
const server = app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

// WebSocket server for real-time analytics
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('New WebSocket connection for analytics');

    const sendAnalyticsData = () => {
        const analyticsData = generateAnalyticsData();
        ws.send(JSON.stringify(analyticsData));
    };

    sendAnalyticsData();

    const interval = setInterval(sendAnalyticsData, 5000);

    ws.on('close', () => {
        console.log('WebSocket connection closed');
        clearInterval(interval);
    });
});