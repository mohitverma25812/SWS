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

// 6. Withdrawal Request (REPLACED WITH SECURE LOGIC)
router.post('/withdraw-request', async (req, res) => {
    try {
        const { workerId, amount } = req.body;
        
        // 1. Worker dhoondhein
        const worker = await Worker.findById(workerId);

        if (!worker) {
            return res.status(404).json({ success: false, message: "Worker nahi mila!" });
        }

        // 2. Check karein ki balance kafi hai ya nahi
        if ((worker.walletBalance || 0) < amount) {
            return res.status(400).json({ success: false, message: "Balance kam hai bhai!" });
        }

        // 3. Paisa kaatein aur withdrawal array mein entry daalein
        worker.walletBalance -= amount;
        
        // Mongoose sub-document push
        worker.withdrawals.push({
            amount: amount,
            status: 'pending',
            date: new Date()
        });
        
        // 4. Database mein save karein
        await worker.save();

        res.json({ 
            success: true, 
            message: "Withdrawal request sent! Admin verify karega.",
            newBalance: worker.walletBalance 
        });

    } catch (err) {
        console.error("Withdraw Error:", err);
        res.status(500).json({ success: false, error: err.message });
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

// 🏦 12. ADMIN Withdrawals (UPDATED - Sab status dikhega)
router.get('/admin/withdrawals', async (req, res) => {
    try {
        const workers = await Worker.find(
            { "withdrawals.0": { $exists: true } }, // Koi bhi withdrawal ho
            'name upiId withdrawals'
        );
        let allRequests = [];

        workers.forEach(worker => {
            worker.withdrawals.forEach(reqst => {
                allRequests.push({
                    requestId: reqst._id,
                    workerId: worker._id,
                    workerName: worker.name,
                    upiId: worker.upiId || "Not Set",
                    amount: reqst.amount,
                    status: reqst.status, // ✅ 'pending', 'success', 'rejected' sab aayega
                    date: reqst.date ? reqst.date.toISOString().split('T')[0] : "N/A"
                });
            });
        });

        // Latest pehle dikhao
        allRequests.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.status(200).json(allRequests);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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

// ✅ CANCEL BOOKING WITH REASON + AUTO PENALIZE
router.put('/cancel/:bookingId', async (req, res) => {
  try {
    const { reason, cancelledBy, userId } = req.body;
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    booking.status = 'cancelled';
    booking.cancelReason = reason;
    booking.cancelledBy = cancelledBy;
    await booking.save();

    // Auto-penalize worker agar 3+ cancellations in 7 days
    if (cancelledBy === 'worker' && booking.worker) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentCancels = await Booking.countDocuments({
        worker: booking.worker,
        status: 'cancelled',
        cancelledBy: 'worker',
        updatedAt: { $gte: sevenDaysAgo }
      });

      if (recentCancels >= 3) {
        await Worker.findByIdAndUpdate(booking.worker, {
          $inc: { walletBalance: -50 }, // ₹50 penalty
          cancelPenaltyCount: recentCancels
        });
      }
    }

    // Refund user if cancelled by worker
    if (cancelledBy === 'worker') {
      const firebaseAdmin = req.app.get('firebaseAdmin');
      const user = await User.findById(booking.user);
      if (firebaseAdmin && user?.fcmToken) {
        await firebaseAdmin.messaging().send({
          notification: {
            title: '❌ Booking Cancelled',
            body: `Worker ne booking cancel ki. Reason: ${reason}. Aap dobara book kar sakte hain.`
          },
          token: user.fcmToken
        }).catch(() => {});
      }
    }

    res.json({ success: true, message: 'Booking cancelled', booking });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ SURGE PRICING — Check karo kitne workers available hain
router.get('/surge-price/:serviceType', async (req, res) => {
  try {
    const { serviceType } = req.params;
    const { basePrice } = req.query;

    // Available workers dhundho
    const availableWorkers = await Worker.countDocuments({
      serviceType,
      isAvailable: true
    });

    // Last 30 min mein kitni bookings
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
    const recentBookings = await Booking.countDocuments({
      serviceType,
      createdAt: { $gte: thirtyMinsAgo }
    });

    // Surge logic
    let surgeMultiplier = 1.0;
    if (availableWorkers === 0) {
      surgeMultiplier = 1.5;
    } else {
      const demandRatio = recentBookings / availableWorkers;
      if (demandRatio > 3) surgeMultiplier = 1.5;
      else if (demandRatio > 2) surgeMultiplier = 1.3;
      else if (demandRatio > 1) surgeMultiplier = 1.2;
    }

    const finalPrice = Math.ceil((parseFloat(basePrice) || 199) * surgeMultiplier);

    res.json({
      success: true,
      surgeMultiplier,
      isSurge: surgeMultiplier > 1.0,
      finalPrice,
      availableWorkers,
      recentBookings
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ CHAT MESSAGES — Save & Get
router.post('/chat/send', async (req, res) => {
  try {
    const { bookingId, senderId, senderRole, message } = req.body;
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    booking.chatMessages.push({
      senderId,
      senderRole,
      message,
      timestamp: new Date()
    });
    await booking.save();

    // Socket emit
    const io = req.app.get('socketio');
    if (io) {
      io.emit(`chat_${bookingId}`, {
        senderId, senderRole, message,
        timestamp: new Date().toISOString()
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/chat/:bookingId', async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId)
      .select('chatMessages');
    if (!booking) return res.status(404).json({ message: 'Not found' });
    res.json(booking.chatMessages || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ WORKER EARNINGS DASHBOARD
router.get('/worker-dashboard/:workerId', async (req, res) => {
  try {
    const workerId = req.params.workerId;
    const now = new Date();

    // Date ranges
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const allCompleted = await Booking.find({
      worker: workerId,
      status: 'completed'
    }).sort({ createdAt: 1 });

    const todayEarnings = allCompleted
      .filter(b => new Date(b.createdAt) >= todayStart)
      .reduce((s, b) => s + (b.price * 0.95), 0);

    const weekEarnings = allCompleted
      .filter(b => new Date(b.createdAt) >= weekStart)
      .reduce((s, b) => s + (b.price * 0.95), 0);

    const monthEarnings = allCompleted
      .filter(b => new Date(b.createdAt) >= monthStart)
      .reduce((s, b) => s + (b.price * 0.95), 0);

    const totalEarnings = allCompleted
      .reduce((s, b) => s + (b.price * 0.95), 0);

    // Last 7 days daily breakdown
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now - i * 24 * 60 * 60 * 1000);
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const dayEarn = allCompleted
        .filter(b => {
          const d = new Date(b.createdAt);
          return d >= dayStart && d < dayEnd;
        })
        .reduce((s, b) => s + (b.price * 0.95), 0);

      last7Days.push({
        date: dayStart.toISOString().split('T')[0],
        earnings: Math.round(dayEarn),
        jobs: allCompleted.filter(b => {
          const d = new Date(b.createdAt);
          return d >= dayStart && d < dayEnd;
        }).length
      });
    }

    const worker = await Worker.findById(workerId).select(
      'averageRating totalRatings walletBalance withdrawals'
    );
    const totalWithdrawn = (worker?.withdrawals || [])
      .filter(w => w.status === 'success')
      .reduce((s, w) => s + w.amount, 0);

    res.json({
      success: true,
      today: Math.round(todayEarnings),
      week: Math.round(weekEarnings),
      month: Math.round(monthEarnings),
      total: Math.round(totalEarnings),
      totalJobs: allCompleted.length,
      averageRating: worker?.averageRating || 0,
      totalRatings: worker?.totalRatings || 0,
      walletBalance: worker?.walletBalance || 0,
      totalWithdrawn,
      last7Days
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ NEARBY NOTIFICATION — Worker 500m pe hai
router.post('/notify-nearby', async (req, res) => {
  try {
    const { bookingId, workerLat, workerLng } = req.body;
    const booking = await Booking.findById(bookingId).populate('user', 'fcmToken name');
    if (!booking) return res.status(404).json({ message: 'Not found' });

    const dist = getDistanceMeters(
      workerLat, workerLng,
      booking.latitude, booking.longitude
    );

    if (dist <= 500 && !booking.nearbyNotified) {
      booking.nearbyNotified = true;
      await booking.save();

      const firebaseAdmin = req.app.get('firebaseAdmin');
      if (firebaseAdmin && booking.user?.fcmToken) {
        await firebaseAdmin.messaging().send({
          notification: {
            title: '🏃 Worker Paas Aa Gaya!',
            body: 'Worker sirf 500 meter door hai. Taiyaar rahein!'
          },
          token: booking.user.fcmToken
        }).catch(() => {});
      }
      return res.json({ success: true, notified: true, distance: dist });
    }
    res.json({ success: true, notified: false, distance: dist });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

module.exports = router;