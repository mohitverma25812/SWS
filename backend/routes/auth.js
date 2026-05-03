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

// 3. LOGIN API (With Wallet Status check)
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
                phone: user.phone,
                role: role, 
                walletBalance: user.walletBalance || 0,
                serviceType: user.serviceType,
                fcmToken: user.fcmToken || "" 
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. UPDATE AVAILABILITY (Uber Logic: Negative balance check + Daily Fee)
router.put('/update-availability/:id', async (req, res) => {
    try {
        const { isAvailable } = req.body;
        const worker = await Worker.findById(req.params.id);

        if (!worker) return res.status(404).json({ message: "Worker nahi mila" });

        if (isAvailable) {
            // 1. Check if balance is negative
            if (worker.walletBalance < 0) {
                return res.status(403).json({ 
                    success: false, 
                    message: `Pehle pending balance (₹${Math.abs(worker.walletBalance)}) jama karein!` 
                });
            }

            // 2. Daily Platform Fee (₹20) Logic
            const today = new Date().toISOString().split('T')[0];
            if (worker.lastOnlineDate !== today) {
                worker.walletBalance -= 20; // Auto deduct ₹20
                worker.lastOnlineDate = today;
                console.log(`💸 ₹20 deducted from worker ${worker.name} for today.`);
            }
        }

        worker.isAvailable = isAvailable;
        await worker.save();
        res.status(200).json({ success: true, walletBalance: worker.walletBalance });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. GET ALL WORKERS
router.get('/workers', async (req, res) => {
    try {
        const workers = await Worker.find({ isAvailable: true }, '-password'); 
        res.status(200).json(workers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. LIVE LOCATION UPDATE
router.post('/worker/update-location', async (req, res) => {
    try {
        const { workerId, lat, lng } = req.body;
        await Worker.findByIdAndUpdate(workerId, {
            location: { type: "Point", coordinates: [lng, lat] },
            lastLocationUpdate: new Date()
        });
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. GET WORKER PROFILE
router.get('/worker/:id', async (req, res) => {
    try {
        const worker = await Worker.findById(req.params.id).select('-password');
        if (!worker) return res.status(404).json({ success: false, message: "Worker nahi mila" });
        res.status(200).json({
            success: true,
            ...worker._doc,
            latitude: worker.location.coordinates[1], 
            longitude: worker.location.coordinates[0]
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 8. UPDATE WORKER UPI ID (Payouts ke liye)
router.put('/update-upi', async (req, res) => {
    try {
        const { workerId, upiId } = req.body;

        if (!workerId || !upiId) {
            return res.status(400).json({ 
                success: false, 
                message: "Worker ID aur UPI ID dono zaroori hain!" 
            });
        }

        const updatedWorker = await Worker.findByIdAndUpdate(
            workerId,
            { upiId: upiId },
            { new: true }
        );

        if (!updatedWorker) {
            return res.status(404).json({ 
                success: false, 
                message: "Worker nahi mila!" 
            });
        }

        res.status(200).json({
            success: true,
            message: "UPI ID successfully update ho gayi!",
            upiId: updatedWorker.upiId
        });

    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});


// ✅ NEW: Worker ki apni withdrawal history
router.get('/worker-withdrawals/:workerId', async (req, res) => {
    try {
        const worker = await Worker.findById(req.params.workerId).select('withdrawals walletBalance');
        if (!worker) return res.status(404).json({ success: false, message: "Worker not found" });
        
        // Latest pehle
        const sorted = [...worker.withdrawals].sort((a, b) => new Date(b.date) - new Date(a.date));
        
        res.status(200).json({ 
            success: true, 
            withdrawals: sorted,
            currentBalance: worker.walletBalance 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Cloudinary config — .env mein add karo:
// CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: { folder: 'sws_profiles', allowed_formats: ['jpg', 'jpeg', 'png'] },
});
const upload = multer({ storage });

// ✅ Upload Worker Profile Photo
router.post('/upload-profile/:userId/:role', upload.single('photo'), async (req, res) => {
  try {
    const { userId, role } = req.params;
    const imageUrl = req.file.path;
    if (role === 'worker') {
      await Worker.findByIdAndUpdate(userId, { profileImage: imageUrl });
    } else {
      await User.findByIdAndUpdate(userId, { profileImage: imageUrl });
    }
    res.json({ success: true, imageUrl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Get User profile
router.get('/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Worker Verification — Admin approve kare
router.put('/verify-worker/:workerId', async (req, res) => {
  try {
    const worker = await Worker.findByIdAndUpdate(
      req.params.workerId,
      { isVerified: true },
      { new: true }
    );
    res.json({ success: true, worker });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Worker ID document upload
router.post('/upload-id/:workerId', upload.single('idDoc'), async (req, res) => {
  try {
    const imageUrl = req.file.path;
    await Worker.findByIdAndUpdate(req.params.workerId, { idDocumentUrl: imageUrl, isVerified: false });
    res.json({ success: true, imageUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const crypto = require('crypto');

// ✅ Forgot Password — OTP send karo (Simple version without email — OTP console mein aayega)
// Production mein Nodemailer se email bhejo
router.post('/forgot-password', async (req, res) => {
  try {
    const { email, role } = req.body;
    let user = role === 'worker'
      ? await Worker.findOne({ email })
      : await User.findOne({ email });

    if (!user) return res.status(404).json({ success: false, message: "Ye email registered nahi hai!" });

    // 6-digit OTP generate karo
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    user.resetOtp = otp;
    user.resetOtpExpiry = expiry;
    await user.save();

    // Production mein yahan email bhejo — abhi console mein dikhao
    console.log(`🔑 Password Reset OTP for ${email}: ${otp}`);

    // TODO: Nodemailer se email bhejo
    // await sendEmail(email, 'Password Reset OTP', `Your OTP is: ${otp}`);

    res.json({ success: true, message: "OTP bheja gaya! Email check karein.", otp }); // dev mein otp return karo
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Reset Password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword, role } = req.body;
    let user = role === 'worker'
      ? await Worker.findOne({ email })
      : await User.findOne({ email });

    if (!user) return res.status(404).json({ success: false, message: "User nahi mila!" });
    if (user.resetOtp !== otp) return res.status(400).json({ success: false, message: "Galat OTP!" });
    if (new Date() > user.resetOtpExpiry) return res.status(400).json({ success: false, message: "OTP expire ho gaya! Dobara try karo." });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetOtp = undefined;
    user.resetOtpExpiry = undefined;
    await user.save();

    res.json({ success: true, message: "Password successfully change ho gaya!" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;