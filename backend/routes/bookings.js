const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking'); 
const Worker = require('../models/Worker'); 
const crypto = require('crypto'); // OTP ke liye

// 1. CREATE BOOKING (Broadcasting & Broadcast Model Integrated)
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
            user: user,      
            worker: worker || null, 
            location: location || "Live Location",
            price: price || 199,      
            status: 'pending', 
            latitude: latitude,
            longitude: longitude,
            otp: generatedOtp,
            serviceType: serviceType, 
            createdAt: new Date()
        });

        await newBooking.save();

        const io = req.app.get('socketio');
        if (io && serviceType) {
            console.log(`📡 Broadcasting to room: ${serviceType}`);
            io.to(serviceType).emit("new_booking_available", {
                bookingId: newBooking._id,
                location: newBooking.location,
                price: newBooking.price,
                userName: "Customer", 
                serviceType: serviceType,
                latitude: latitude,
                longitude: longitude
            });
        }

        res.status(201).json({ 
            success: true, 
            message: "Booking request broadcasted Successfully!", 
            otp: generatedOtp, 
            booking: newBooking 
        });

    } catch (err) {
        console.error("Booking Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ✅ Correct Route for Acceptance
router.post('/accept-booking', async (req, res) => {
    try {
        const { bookingId, workerId, serviceType } = req.body;
        console.log("📩 Accept Request Received for:", bookingId);

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking nahi mili!" });
        }

        if (booking.status !== 'pending' || booking.worker !== null) {
            return res.status(400).json({ success: false, message: "Pehle hi kisi ne accept kar liya hai." });
        }

        booking.worker = workerId;
        booking.status = 'accepted';
        await booking.save();

        const updatedBooking = await Booking.findById(booking._id)
            .populate('worker', 'name phone averageRating location');

        const io = req.app.get('socketio');
        if (io) {
            io.to(serviceType || booking.serviceType).emit("remove_booking_request", { bookingId: booking._id });
            io.emit(`booking_accepted_${booking.user}`, { 
                message: "Worker is on the way!",
                booking: updatedBooking 
            });
        }

        res.status(200).json({ 
            success: true, 
            message: "Job assigned successfully", 
            booking: updatedBooking 
        });
    } catch (error) {
        console.error("❌ Accept Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ✅ VERIFY OTP (Updated with 5% Commission Logic as requested)
router.post('/verify-otp', async (req, res) => {
    try {
        const { bookingId, otp } = req.body;
        const booking = await Booking.findById(bookingId);
        
        if (booking && booking.otp === otp) {
            booking.status = 'ongoing'; 
            await booking.save();

            const worker = await Worker.findById(booking.worker);
            if (worker) {
                // 🚀 START COMMISSION LOGIC
                const totalAmount = booking.price || 199;
                const commission = totalAmount * 0.05; // 5% Company ka commission
                const workerShare = totalAmount - commission; // 95% Worker ka paisa

                worker.walletBalance = (worker.walletBalance || 0) + workerShare; // Worker ko net amount mila
                await worker.save();
                // 🚀 END COMMISSION LOGIC

                return res.json({ 
                    success: true, 
                    message: `OTP Verified! ₹${workerShare.toFixed(2)} added to wallet (5% platform fee deducted).` 
                });
            }

            return res.json({ success: true, message: "OTP Verified!" });
        }
        res.status(400).json({ success: false, message: "Invalid OTP" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. UPDATE STATUS
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

// Worker ki UPI ID update karne ka route
router.put('/update-upi', async (req, res) => {
    try {
        const { workerId, upiId } = req.body; // Frontend se data aayega

        if (!workerId || !upiId) {
            return res.status(400).json({ success: false, message: "Missing data" });
        }

        // Database mein update karein
        const worker = await Worker.findByIdAndUpdate(
            workerId, 
            { upiId: upiId }, 
            { new: true }
        );

        if (!worker) {
            return res.status(404).json({ success: false, message: "Worker not found" });
        }

        res.status(200).json({ success: true, message: "UPI Updated Successfully", upiId: worker.upiId });
    } catch (error) {
        console.error("UPI Update Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 6. Withdrawal Request
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

// 7. GET ALL REVIEWS
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

// 11. GET WORKER HISTORY
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

// 🏦 12. ADMIN Withdrawals
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

// ✅ 13. ADMIN Withdraw Action
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