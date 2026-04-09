const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking'); 
const Worker = require('../models/Worker'); 
const crypto = require('crypto'); // OTP ke liye

// 1. CREATE BOOKING (With OTP in Notification Body)
router.post('/create', async (req, res) => {
    try {
        let { user, worker, location, price, latitude, longitude } = req.body;

        if (!user || !worker) {
            return res.status(400).json({ message: "User ID aur Worker ID zaroori hai" });
        }

        if (location && typeof location === 'string' && location.includes('|')) {
            const parts = location.split('|');
            latitude = parseFloat(parts[0]);
            longitude = parseFloat(parts[1]);
            location = parts[2] || "Live Location";
        }

        const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();

        const newBooking = new Booking({
            user,      
            worker,    
            location: location || "Live Location",
            price: price || 199,      
            status: 'pending',
            latitude: latitude,
            longitude: longitude,
            otp: generatedOtp 
        });

        await newBooking.save();

        const targetWorker = await Worker.findById(worker);
        if (targetWorker && targetWorker.fcmToken) {
            const firebaseAdmin = req.app.get('firebaseAdmin'); 
            if (firebaseAdmin) {
                const message = {
                    notification: {
                        title: 'New Booking Request! 🛠️',
                        body: `Nayi job request! OTP: ${generatedOtp}. Customer se verify karein.`,
                    },
                    token: targetWorker.fcmToken,
                    data: {
                        bookingId: newBooking._id.toString(),
                        otp: generatedOtp
                    }
                };
                firebaseAdmin.messaging().send(message)
                    .then((response) => console.log('✅ Sent notification with OTP to Worker'))
                    .catch((error) => console.log('❌ Notification Error:', error));
            }
        }

        res.status(201).json({ 
            success: true, 
            message: "Booking Successfully Saved!", 
            otp: generatedOtp, 
            booking: newBooking 
        });

    } catch (err) {
        console.error("Booking Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// 2. VERIFY OTP (Ongoing status update)
router.post('/verify-otp', async (req, res) => {
    try {
        const { bookingId, otp } = req.body;
        const booking = await Booking.findById(bookingId);
        
        if (booking && booking.otp === otp) {
            booking.status = 'ongoing'; 
            await booking.save();
            return res.json({ success: true, message: "OTP Verified! Work Started." });
        }
        res.status(400).json({ success: false, message: "Invalid OTP" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. UPDATE STATUS (Notification logic)
router.put('/update-status/:bookingId', async (req, res) => {
    try {
        const { status } = req.body; 

        const booking = await Booking.findByIdAndUpdate(
            req.params.bookingId,
            { status: status },
            { new: true }
        ).populate('user', 'fcmToken name'); 

        const firebaseAdmin = req.app.get('firebaseAdmin');

        if (firebaseAdmin && booking.user && booking.user.fcmToken) {
            let title = '';
            let body = '';

            if (status === 'accepted') {
                title = 'Booking Accepted! ✅';
                body = `Worker aa raha hai. OTP: ${booking.otp} (Worker ko batayein)`;
            } else if (status === 'completed') {
                title = 'Work Completed! 🏁';
                body = `Kaam poora ho gaya. Rating dena na bhulein!`;
            }

            if (title !== '') {
                const message = {
                    notification: { title, body },
                    token: booking.user.fcmToken,
                    data: { 
                        type: status === 'completed' ? "RATING_REQUIRED" : "STATUS_UPDATE",
                        bookingId: booking._id.toString() 
                    }
                };
                firebaseAdmin.messaging().send(message)
                    .catch((error) => console.log('❌ User Notification Error:', error));
            }
        }
        res.json(booking);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. GET WORKER EARNINGS
router.get('/worker-earnings/:workerId', async (req, res) => {
    try {
        const completedJobs = await Booking.find({ 
            worker: req.params.workerId, 
            status: 'completed' 
        });
        const totalEarnings = completedJobs.reduce((sum, job) => sum + job.price, 0);
        const totalJobs = completedJobs.length;
        res.json({ success: true, totalEarnings, totalJobs, currency: "INR" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🔥 5. GET ALL REVIEWS FOR A WORKER (Naya Feature Yahan Hai)
router.get('/worker-reviews/:workerId', async (req, res) => {
    try {
        const { workerId } = req.params;

        const reviews = await Booking.find({ 
            worker: workerId, 
            status: 'completed',
            rating: { $gt: 0 } 
        })
        .populate('user', 'name') 
        .sort({ createdAt: -1 }); 

        res.status(200).json(reviews);
    } catch (error) {
        res.status(500).json({ message: "Server Error", error });
    }
});

// 6. GET USER BOOKINGS
router.get('/my-bookings/:userId', async (req, res) => {
    try {
        const bookings = await Booking.find({ user: req.params.userId })
            .populate('worker', 'name phone serviceType location') 
            .sort({ createdAt: -1 }); 
        res.json(bookings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. GET WORKER REQUESTS
router.get('/worker-requests/:workerId', async (req, res) => {
    try {
        const bookings = await Booking.find({ 
            worker: req.params.workerId, 
            status: 'pending'          
        })
        .populate('user', 'name phone email') 
        .sort({ createdAt: -1 });
        res.json(bookings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 8. SUBMIT RATING (Updated to save rating inside Booking too)
router.post('/rate-worker', async (req, res) => {
    try {
        const { workerId, userId, rating, comment, bookingId } = req.body;
        const worker = await Worker.findById(workerId);
        if (!worker) return res.status(404).json({ message: "Worker nahi mila" });

        // Worker collection mein review add karna (Puraana logic)
        worker.reviews.push({ user: userId, rating, comment });
        const currentTotal = (worker.averageRating || 0) * (worker.totalRatings || 0);
        worker.totalRatings = (worker.totalRatings || 0) + 1;
        worker.averageRating = (currentTotal + rating) / worker.totalRatings;

        await worker.save();

        // 🔥 Booking collection mein bhi rating/comment update karna (Naya logic for reviews screen)
        await Booking.findByIdAndUpdate(bookingId, { 
            status: 'completed',
            rating: rating,
            comment: comment
        });

        res.status(200).json({ success: true, message: "Rating submitted!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;