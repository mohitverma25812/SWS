const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
    // Ye fields existing schema mein add karo
cancelReason: { type: String, default: "" },
cancelledBy: { type: String, enum: ['user', 'worker', ''], default: '' },
nearbyNotified: { type: Boolean, default: false },
vehicleType: { type: String, default: "motorcycle" },
subService: { type: String, default: "" },
chatMessages: [
  {
    senderId: String,
    senderRole: { type: String, enum: ['user', 'worker'] },
    message: String,
    timestamp: { type: Date, default: Date.now }
  }
],
    user: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    // ✅ BADLAV: Required hata diya gaya hai taaki broadcast ke waqt ye null reh sake
    worker: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Worker', 
        default: null 
    },
    // ✅ NAYA: Category wise broadcast karne ke liye zaroori hai
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
    // 🔥 OTP field verification ke liye
    otp: { 
        type: String,
        required: false 
    },
    status: { 
        type: String, 
        // ✅ Status list mein 'cancelled' add kiya gaya hai
        enum: ['pending', 'accepted', 'rejected', 'ongoing', 'completed', 'cancelled'], 
        default: 'pending' 
    },
    // ⭐ Rating aur Comment fields
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