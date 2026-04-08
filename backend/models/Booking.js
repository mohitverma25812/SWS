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
    // 🔥 NAYA BADLAV: OTP field add kar di
    otp: { 
        type: String,
        required: false 
    },
    status: { 
        type: String, 
        // 💡 status mein 'ongoing' bhi dalo taaki OTP verify hone par update ho sake
        enum: ['pending', 'accepted', 'rejected', 'ongoing', 'completed'], 
        default: 'pending' 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.model('Booking', BookingSchema);