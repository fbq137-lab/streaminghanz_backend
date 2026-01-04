const express = require('express');
const { adminLogin, verifyToken, isAdmin } = require('../middleware/auth');
const router = express.Router();

// Admin login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const result = await adminLogin(username, password);

        if (result.success) {
            res.json({
                success: true,
                message: 'Login successful',
                token: result.token,
                user: result.user
            });
        } else {
            res.status(401).json({
                success: false,
                message: result.message
            });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Verify token
router.get('/verify', verifyToken, (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.userId,
            username: req.username
        }
    });
});

// Admin logout (client-side token removal)
router.post('/logout', verifyToken, (req, res) => {
    res.json({
        success: true,
        message: 'Logout successful'
    });
});

// Change password endpoint
router.post('/change-password', verifyToken, isAdmin, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        // In a production app, you'd update the password in database
        // For this implementation, password is in .env
        res.json({
            success: true,
            message: 'Password change endpoint - Update your .env file with new password'
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to change password' });
    }
});

module.exports = router;