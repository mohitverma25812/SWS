const mongoose = require('mongoose');

const workerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, required: true },
    serviceType: { type: String, required: true }, 
    isVerified: { type: Boolean, default: false }, 
    isAvailable: { type: Boolean, default: true },
    fcmToken: { type: String, default: "" }, 
    location: {
        type: { type: String, default: "Point" },
        coordinates: { type: [Number], index: "2dsphere" } 
    },
    profileImage: { type: String, default: "" },
idDocumentUrl: { type: String, default: "" },
cancelPenaltyCount: { type: Number, default: 0 },

    // ✅ LIVE TRACKING FIELD
    lastLocationUpdate: { 
        type: Date, 
        default: Date.now 
    },

    // ⭐ RATING SYSTEM FIELDS
    totalRatings: { 
        type: Number, 
        default: 0 
    }, 
    averageRating: { 
        type: Number, 
        default: 0 
    }, 
    reviews: [
        {
            user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            rating: { type: Number, required: true },
            comment: { type: String, default: "" },
            createdAt: { type: Date, default: Date.now }
        }
    ],

    // 💰 WALLET & WITHDRAWAL SYSTEM
    walletBalance: { 
        type: Number, 
        default: 0 
    },

    // 👇 NEW FIELDS ADDED HERE
    lastOnlineDate: { 
        type: String, 
        default: "" 
    }, // Aaj ki platform fee date check karne ke liye
    isBlocked: { 
        type: Boolean, 
        default: false 
    }, // Negative balance block status

    upiId: { 
        type: String, 
        default: "" 
    },
    withdrawals: [
        {
            amount: Number,
            status: { 
                type: String, 
                enum: ['pending', 'success', 'rejected'], 
                default: 'pending' 
            },
            date: { 
                type: Date, 
                default: Date.now 
            }
        }
    ]
});

module.exports = mongoose.model('Worker', workerSchema);