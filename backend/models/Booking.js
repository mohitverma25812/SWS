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
        required: true 
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
        enum: ['pending', 'accepted', 'rejected', 'ongoing', 'completed'], 
        default: 'pending' 
    },
    // ⭐ NAYA BADLAV: Rating aur Comment fields
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