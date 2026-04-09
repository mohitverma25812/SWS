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

// ✅ 2. VERIFY OTP (Updated: Paisa Wallet mein add karne ke liye)
router.post('/verify-otp', async (req, res) => {
    try {
        const { bookingId, otp } = req.body;
        const booking = await Booking.findById(bookingId);
        
        if (booking && booking.otp === otp) {
            booking.status = 'ongoing'; // Kaam shuru
            await booking.save();

            // 💰 Jab OTP verify ho jaye, tabhi worker ke wallet mein balance add karo
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

// 🔥 5. NAYA ROUTE: UPI ID Update karne ke liye
router.put('/update-upi/:workerId', async (req, res) => {
    try {
        const { upiId } = req.body;
        await Worker.findByIdAndUpdate(req.params.workerId, { upiId: upiId });
        res.json({ success: true, message: "UPI ID Updated Successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🔥 6. NAYA ROUTE: Withdrawal Request bhejne ke liye
router.post('/withdraw-request', async (req, res) => {
    try {
        const { workerId, amount } = req.body;
        const worker = await Worker.findById(workerId);

        if (!worker || worker.walletBalance < amount) {
            return res.status(400).json({ success: false, message: "Balance kam hai bhai!" });
        }

        // Wallet se balance kato aur request list mein dalo
        worker.walletBalance -= amount;
        worker.withdrawals.push({ amount: amount, status: 'pending' });
        
        await worker.save();
        res.json({ success: true, message: "Withdrawal request sent! Admin verify karega." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. GET ALL REVIEWS FOR A WORKER
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

// 8. GET USER BOOKINGS
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

// 9. GET WORKER REQUESTS
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

// 10. SUBMIT RATING
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

// ... baaki puraane routes yahan honge ...

// 🚀 UPDATE: Worker ki puri history (All statuses)
router.get('/worker-history/:workerId', async (req, res) => {
    try {
        const { workerId } = req.params;
        const bookings = await Booking.find({ worker: workerId })
            .populate('user', 'name phone email') 
            .sort({ createdAt: -1 });
        res.json(bookings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// 🏦 ADMIN: Saari pending withdrawal requests dekhna
router.get('/admin/withdrawals', async (req, res) => {
    try {
        const workers = await Worker.find({ "withdrawals.status": "pending" }, { name: 1, upiId: 1, withdrawals: 1 });
        
        // Sirf pending requests ko filter karke bhejna
        let pendingRequests = [];
        workers.forEach(worker => {
            worker.withdrawals.forEach(req => {
                if(req.status === 'pending') {
                    pendingRequests.push({
                        workerId: worker._id,
                        workerName: worker.name,
                        upiId: worker.upiId,
                        requestId: req._id,
                        amount: req.amount,
                        date: req.date
                    });
                }
            });
        });
        res.json(pendingRequests);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ✅ ADMIN: Withdrawal request ko Approve/Reject karna
router.put('/admin/withdraw-action', async (req, res) => {
    try {
        const { workerId, requestId, action } = req.body; // action: 'success' ya 'rejected'
        const worker = await Worker.findById(workerId);

        const withdrawal = worker.withdrawals.id(requestId);
        if (!withdrawal) return res.status(404).json({ message: "Request nahi mili" });

        withdrawal.status = action;

        // Agar reject hua toh paisa wapas wallet mein dalo
        if (action === 'rejected') {
            worker.walletBalance += withdrawal.amount;
        }

        await worker.save();
        res.json({ success: true, message: `Request ${action} ho gayi!` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;