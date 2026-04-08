const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, required: true },
    role: { type: String, default: 'user' }, 
    fcmToken: { type: String, default: "" }, // 🔥 Notification ke liye zaroori
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);