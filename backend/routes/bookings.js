const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking'); 
const Worker = require('../models/Worker'); 
const crypto = require('crypto'); // OTP ke liye

// 1. CREATE BOOKING (Broadcasting logic added)
router.post('/create', async (req, res) => {
    try {
        let { user, worker, location, price, latitude, longitude, serviceType } = req.body;

        if (!user) {
            return res.status(400).json({ message: "User ID zaroori hai" });
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
            worker: worker || null, // Broadcast ke liye worker null ho sakta hai shuru mein
            location: location || "Live Location",
            price: price || 199,      
            status: 'pending',
            latitude: latitude,
            longitude: longitude,
            otp: generatedOtp,
            serviceType: serviceType // Kaunsa worker chahiye (Plumber, etc.)
        });

        await newBooking.save();

        // 🚀 SOCKET BROADCAST: Saare nearby category workers ko batayein
        const io = req.app.get('socketio');
        if (io && serviceType) {
            io.to(serviceType).emit("new_booking_available", {
                bookingId: newBooking._id,
                location: newBooking.location,
                price: newBooking.price,
                userName: "Customer", // Aap yahan user model se naam nikal sakte hain
                serviceType: serviceType
            });
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

// ✅ NEW: ACCEPT BOOKING API (With Socket update)
router.post('/accept-booking', async (req, res) => {
    try {
        const { bookingId, workerId, serviceType } = req.body;
        const booking = await Booking.findById(bookingId);

        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        // 1. Check agar pehle hi kisi ne accept kar liya ho
        if (booking.status !== 'pending') {
            return res.status(400).json({ success: false, message: "Too late! Already accepted by another worker." });
        }

        // 2. Worker assign karo aur status badlo
        booking.worker = workerId;
        booking.status = 'accepted';
        await booking.save();

        // 🚀 SOCKET UPDATE: Baaki saare workers ki screen se request hatao
        const io = req.app.get('socketio');
        if (io) {
            io.to(serviceType || booking.serviceType).emit("remove_booking_request", { 
                bookingId: booking._id 
            });
        }

        res.status(200).json({ success: true, message: "Job assigned to you!", booking });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ✅ 2. VERIFY OTP (Wallet logic remains same)
router.post('/verify-otp', async (req, res) => {
    try {
        const { bookingId, otp } = req.body;
        const booking = await Booking.findById(bookingId);
        
        if (booking && booking.otp === otp) {
            booking.status = 'ongoing'; 
            await booking.save();

            const worker = await Worker.findById(booking.worker);
            if (worker) {
                worker.walletBalance = (worker.walletBalance || 0) + (booking.price || 199);
                await worker.save();
            }

            return res.json({ 
                success: true, 
                message: "OTP Verified! ₹" + (booking.price || 199) + " added to your wallet." 
            });
        }
        res.status(400).json({ success: false, message: "Invalid OTP" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. UPDATE STATUS (Notification logic remains same)
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

// 4. GET WORKER EARNINGS (Safe)
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

// 🔥 5. UPI ID Update (Safe)
router.put('/update-upi/:workerId', async (req, res) => {
    try {
        const { upiId } = req.body;
        await Worker.findByIdAndUpdate(req.params.workerId, { upiId: upiId });
        res.json({ success: true, message: "UPI ID Updated Successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🔥 6. Withdrawal Request (Safe)
router.post('/withdraw-request', async (req, res) => {
    try {
        const { workerId, amount } = req.body;
        const worker = await Worker.findById(workerId);

        if (!worker || (worker.walletBalance || 0) < amount) {
            return res.status(400).json({ success: false, message: "Balance kam hai bhai!" });
        }

        worker.walletBalance -= amount;
        worker.withdrawals.push({ amount: amount, status: 'pending' });
        
        await worker.save();
        res.json({ success: true, message: "Withdrawal request sent! Admin verify karega." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. GET ALL REVIEWS (Safe)
router.get('/worker-reviews/:workerId', async (req, res) => {
    try {
        const reviews = await Booking.find({ 
            worker: req.params.workerId, 
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

// 8. GET USER BOOKINGS (Safe)
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

// 9. GET WORKER REQUESTS (Safe)
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

// 10. SUBMIT RATING (Safe)
router.post('/rate-worker', async (req, res) => {
    try {
        const { workerId, userId, rating, comment, bookingId } = req.body;
        const worker = await Worker.findById(workerId);
        if (!worker) return res.status(404).json({ message: "Worker nahi mila" });

        worker.reviews.push({ user: userId, rating, comment });
        const currentTotal = (worker.averageRating || 0) * (worker.totalRatings || 0);
        worker.totalRatings = (worker.totalRatings || 0) + 1;
        worker.averageRating = (currentTotal + rating) / worker.totalRatings;

        await worker.save();
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

// 11. GET WORKER HISTORY (Safe)
router.get('/worker-history/:workerId', async (req, res) => {
    try {
        const bookings = await Booking.find({ worker: req.params.workerId })
            .populate('user', 'name phone email') 
            .sort({ createdAt: -1 });
        res.json(bookings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🏦 12. ADMIN Withdrawals (Safe)
router.get('/admin/withdrawals', async (req, res) => {
    try {
        const workers = await Worker.find({ "withdrawals.status": "pending" }, 'name upiId withdrawals');
        let pendingRequests = [];
        workers.forEach(worker => {
            worker.withdrawals.forEach(reqst => {
                if (reqst.status === 'pending') {
                    pendingRequests.push({
                        requestId: reqst._id,
                        workerId: worker._id,
                        workerName: worker.name,
                        upiId: worker.upiId,
                        amount: reqst.amount,
                        date: reqst.date
                    });
                }
            });
        });
        res.status(200).json(pendingRequests);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ✅ 13. ADMIN Withdraw Action (Safe)
router.put('/admin/withdraw-action', async (req, res) => {
    try {
        const { workerId, requestId, action } = req.body;
        const worker = await Worker.findById(workerId);
        if (!worker) return res.status(404).json({ message: "Worker not found" });
        const request = worker.withdrawals.id(requestId);
        if (!request) return res.status(404).json({ message: "Request not found" });

        if (action === 'success') {
            request.status = 'success';
        } else if (action === 'rejected') {
            worker.walletBalance += request.amount;
            request.status = 'rejected';
        }

        await worker.save();
        res.status(200).json({ success: true, message: `Withdrawal ${action} successfully` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;