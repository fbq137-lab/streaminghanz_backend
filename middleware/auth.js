const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

// JWT Secret from environment
const JWT_SECRET = process.env.JWT_SECRET || 'streaminghanz_jwt_secret';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Ant137';

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1] || req.query.token;

    if (!token) {
        return res.status(403).json({ error: 'No token provided' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        req.userId = decoded.id;
        req.username = decoded.username;
        next();
    });
};

// Admin login function
const adminLogin = async (username, password) => {
    try {
        // For admin panel, check against environment password
        if (username === 'admin' && password === ADMIN_PASSWORD) {
            const token = jwt.sign({ 
                id: 1, 
                username: 'admin',
                role: 'admin'
            }, JWT_SECRET, { expiresIn: '24h' });
            
            return { success: true, token, user: { id: 1, username: 'admin', role: 'admin' } };
        }
        
        return { success: false, message: 'Invalid credentials' };
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, message: 'Login failed' };
    }
};

// Check if user is admin
const isAdmin = (req, res, next) => {
    if (req.username === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Admin access required' });
    }
};

module.exports = { verifyToken, adminLogin, isAdmin, JWT_SECRET };