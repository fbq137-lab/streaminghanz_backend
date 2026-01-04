const express = require('express');
const installDatabase = require('../scripts/installDatabase');
const { verifyToken, isAdmin } = require('../middleware/auth');
const { pool } = require('../config/database');
const router = express.Router();

// Install database endpoint
router.post('/install', verifyToken, isAdmin, async (req, res) => {
    try {
        await installDatabase();
        res.json({
            success: true,
            message: 'Database installed successfully'
        });
    } catch (error) {
        console.error('Database installation error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Database installation failed',
            details: error.message 
        });
    }
});

// Test database connection
router.get('/test', verifyToken, isAdmin, async (req, res) => {
    try {
        const connection = await pool.getConnection();
        await connection.ping();
        connection.release();
        
        res.json({
            success: true,
            message: 'Database connection is working'
        });
    } catch (error) {
        console.error('Database test error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Database connection failed',
            details: error.message 
        });
    }
});

// Get database status
router.get('/status', verifyToken, isAdmin, async (req, res) => {
    try {
        const connection = await pool.getConnection();
        
        // Get table status
        const [tables] = await connection.execute(`
            SELECT TABLE_NAME, TABLE_ROWS 
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = DATABASE()
        `);
        
        connection.release();
        
        res.json({
            success: true,
            data: {
                database: process.env.DB_NAME,
                tables: tables,
                status: 'connected'
            }
        });
    } catch (error) {
        console.error('Database status error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get database status',
            details: error.message 
        });
    }
});

module.exports = router;