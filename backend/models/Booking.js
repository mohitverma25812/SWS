const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
    user: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    worker: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Worker', 
        default: null 
    },
    serviceType: { 
        type: String, 
        required: true 
    },
    subService: {
        type: String,
        default: ""
    },
    location: { 
        type: String, 
        default: "Live Location" 
    },
    latitude: {
        type: Number,
        required: false
    },
    longitude: {
        type: Number,
        required: false
    },
    price: { 
        type: Number, 
        default: 199 
    },
    // ✅ NAYI FIELDS ADDED HERE
    tip: { 
        type: Number, 
        default: 0 
    },
    totalAmount: { 
        type: Number, 
        default: 199 
    },
    // 🔥 OTP field verification ke liye
    otp: { 
        type: String,
        required: false 
    },
    status: { 
        type: String, 
        enum: ['pending', 'accepted', 'rejected', 'ongoing', 'completed', 'cancelled'], 
        default: 'pending' 
    },
    // ❌ Cancellation logic
    cancelReason: { type: String, default: "" },
    cancelledBy: { type: String, enum: ['user', 'worker', ''], default: '' },
    
    // 🏃 Tracking notifications
    nearbyNotified: { type: Boolean, default: false },
    vehicleType: { type: String, default: "motorcycle" },
    
    // 💬 In-App Chat
    chatMessages: [
      {
        senderId: String,
        senderRole: { type: String, enum: ['user', 'worker'] },
        message: String,
        timestamp: { type: Date, default: Date.now }
      }
    ],
    // ⭐ Feedback
    rating: { 
        type: Number, 
        default: 0 
    },
    comment: { 
        type: String, 
        default: "" 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.model('Booking', BookingSchema);