const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const admin = require('firebase-admin'); 
require('dotenv').config();

const app = express();

// 🛠️ Middleware
app.use(express.json());
app.use(cors());

// 🔔 Firebase Admin SDK Initialize (Using Environment Variable)
try {
    if (!admin.apps.length) {
        // 🔥 JSON File ki jagah Environment Variable se data uthana
        // Hum 'FIREBASE_SERVICE_ACCOUNT' naam ka variable Render pe banayenge
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("✅ Firebase Admin SDK Initialized from Environment Variable");
    }
} catch (error) {
    console.error("❌ Firebase Error:", error.message);
    console.log("⚠️ Render dashboard mein 'FIREBASE_SERVICE_ACCOUNT' variable check karein.");
}

// 📦 Share 'admin' with other routes (Very Important)
app.set('firebaseAdmin', admin);

// 🚀 Routes Import
const bookingRoutes = require('./routes/bookings'); 
const authRoutes = require('./routes/auth'); 

// 🛣️ API Routes
app.use('/api/bookings', bookingRoutes);
app.use('/api/auth', authRoutes); 

// 🍃 MongoDB Connection
const mongoUri = process.env.MONGO_URI; // Render pe iska variable bhi banega

mongoose.connect(mongoUri)
    .then(() => console.log("✅ MongoDB Connected Successfully"))
    .catch((err) => console.log("❌ DB Connection Error:", err));

// 🏠 Default Route
app.get('/', (req, res) => {
    res.send("🚀 Smart Work Server is running perfectly on Render!");
});

// 🌍 Server Listen (Render setting)
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => { 
    console.log(`🚀 Server running on port ${PORT}`);
});