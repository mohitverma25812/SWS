const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Worker = require('../models/Worker');

// 1. REGISTER USER
router.post('/register/user', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: "User already exists" });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({ name, email, password: hashedPassword, phone });
        await newUser.save();
        res.status(201).json({ message: "User Registered Successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. REGISTER WORKER
router.post('/register/worker', async (req, res) => {
    try {
        const { name, email, password, phone, serviceType, latitude, longitude } = req.body;
        const existingWorker = await Worker.findOne({ email });
        if (existingWorker) return res.status(400).json({ message: "Worker already exists" });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newWorker = new Worker({
            name, email, password: hashedPassword, phone, serviceType,
            location: { type: "Point", coordinates: [longitude, latitude] }
        });
        await newWorker.save();
        res.status(201).json({ message: "Worker Registered Successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. LOGIN API
router.post('/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        let user = role === 'worker' ? await Worker.findOne({ email }) : await User.findOne({ email });

        if (!user) return res.status(400).json({ message: "User not found" });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Invalid Password" });

        const token = jwt.sign({ id: user._id, role: role }, 'your_jwt_secret_key', { expiresIn: '7d' });

        res.status(200).json({
            success: true,
            token: token,
            userData: { 
                userId: user._id, 
                name: user.name, 
                email: user.email, 
                role: role, 
                serviceType: user.serviceType,
                fcmToken: user.fcmToken || "" 
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 🔔 4. UPDATE FCM TOKEN
router.put('/update-fcm-token/:id', async (req, res) => {
    try {
        const { fcmToken, role } = req.body;
        const Model = role === 'worker' ? Worker : User;
        await Model.findByIdAndUpdate(req.params.id, { fcmToken });
        res.status(200).json({ success: true, message: "FCM Token Updated" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. GET ALL WORKERS
router.get('/workers', async (req, res) => {
    try {
        const workers = await Worker.find({ isAvailable: true }, '-password'); 
        const formattedWorkers = workers.map(worker => ({
            _id: worker._id,
            name: worker.name,
            serviceType: worker.serviceType,
            latitude: worker.location.coordinates[1],
            longitude: worker.location.coordinates[0]
        }));
        res.status(200).json(formattedWorkers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. UPDATE WORKER LOCATION (Existing PUT method)
router.put('/update-location/:id', async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        await Worker.findByIdAndUpdate(req.params.id, {
            location: { type: "Point", coordinates: [longitude, latitude] }
        });
        res.status(200).json({ success: true, message: "Location Updated" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ✅ 7. NEW: WORKER LIVE LOCATION UPDATE (POST method for Flutter LocationService)
router.post('/worker/update-location', async (req, res) => {
    try {
        const { workerId, lat, lng } = req.body;
        
        if (!workerId) return res.status(400).json({ message: "Worker ID is required" });

        await Worker.findByIdAndUpdate(workerId, {
            location: {
                type: "Point",
                coordinates: [lng, lat] // MongoDB expects [Longitude, Latitude]
            },
            lastLocationUpdate: new Date()
        });

        console.log(`📍 Live Location Sync: Worker ${workerId} at ${lat}, ${lng}`);
        res.status(200).json({ success: true, message: "Live Location Synced" });
    } catch (err) {
        console.error("❌ Location Sync Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// 8. UPDATE AVAILABILITY
router.put('/update-availability/:id', async (req, res) => {
    try {
        const { isAvailable } = req.body;
        await Worker.findByIdAndUpdate(req.params.id, { isAvailable });
        res.status(200).json({ success: true, message: "Status Updated" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ... baaki saare purane routes (login, register etc.)

// ✅ Yahan paste karein (module.exports se upar)
router.post('/worker/update-location', async (req, res) => {
    try {
        const { workerId, lat, lng } = req.body;
        
        if (!workerId) return res.status(400).json({ message: "Worker ID is required" });

        await Worker.findByIdAndUpdate(workerId, {
            location: {
                type: "Point",
                coordinates: [lng, lat] // [Longitude, Latitude]
            },
            lastLocationUpdate: new Date()
        });

        console.log(`📍 Live Sync: Worker ${workerId} at ${lat}, ${lng}`);
        res.status(200).json({ success: true, message: "Live Location Synced" });
    } catch (err) {
        console.error("❌ Sync Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ⚠️ Ye line humesha file ke aakhir mein honi chahiye
module.exports = router;

module.exports = router;