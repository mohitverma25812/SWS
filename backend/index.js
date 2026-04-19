const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const admin = require('firebase-admin');
const http = require('http'); // ✅ Added
const { Server } = require("socket.io"); // ✅ Added
require('dotenv').config();

const app = express();
const server = http.createServer(app); // ✅ HTTP wrapper for Socket.io

// 🛠️ Middleware
app.use(express.json());
app.use(cors());

// 🔌 Socket.io Setup
const io = new Server(server, {
    cors: { origin: "*" } // Flutter app compatibility
});

// 🔔 Firebase Admin SDK Initialize
try {
    if (!admin.apps.length) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("✅ Firebase Admin SDK Initialized");
    }
} catch (error) {
    console.error("❌ Firebase Error:", error.message);
}

// 📦 Share 'admin' and 'io' with other routes
app.set('firebaseAdmin', admin);
app.set('socketio', io); // ✅ Route files mein use karne ke liye

// 🚀 Socket Connection Logic
io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    // 1. Worker joins category room (e.g., 'Plumber')
    socket.on("join_category", (category) => {
        socket.join(category);
        console.log(`Worker joined room: ${category}`);
    });

    // 2. User sends booking request to all nearby workers in that category
    socket.on("send_booking_request", (bookingData) => {
        io.to(bookingData.serviceType).emit("new_booking_available", bookingData);
    });

    // 3. When one worker accepts, tell others to remove the request
    socket.on("booking_accepted", (data) => {
        io.to(data.serviceType).emit("remove_booking_request", { bookingId: data.bookingId });
    });

    socket.on("disconnect", () => {
        console.log("User disconnected");
    });
});

// 🚀 Routes Import
const bookingRoutes = require('./routes/bookings'); 
const authRoutes = require('./routes/auth'); 

// 🛣️ API Routes
app.use('/api/bookings', bookingRoutes);
app.use('/api/auth', authRoutes); 

// 🍃 MongoDB Connection
const mongoUri = process.env.MONGO_URI;
mongoose.connect(mongoUri)
    .then(() => console.log("✅ MongoDB Connected Successfully"))
    .catch((err) => console.log("❌ DB Connection Error:", err));

// 🏠 Default Route
app.get('/', (req, res) => {
    res.send("🚀 Smart Work Server (with Sockets) is running perfectly on Render!");
});

// 🌍 Server Listen (Using 'server' instead of 'app')
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => { 
    console.log(`🚀 Server running on port ${PORT}`);
});