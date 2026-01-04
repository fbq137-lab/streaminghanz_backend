const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/database');
const { verifyToken, isAdmin } = require('../middleware/auth');
const router = express.Router();

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Get all videos with pagination and filtering
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 20, category, type, search, status = 'active' } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT v.*, c.name as category_name, c.slug as category_slug,
                   COUNT(e.id) as episode_count
            FROM videos v
            LEFT JOIN categories c ON v.category_id = c.id
            LEFT JOIN episodes e ON v.id = e.video_id
            WHERE 1=1
        `;
        
        const params = [];

        if (category) {
            query += ' AND (c.slug = ? OR c.id = ?)';
            params.push(category, category);
        }

        if (type) {
            query += ' AND v.type = ?';
            params.push(type);
        }

        if (search) {
            query += ' AND (v.title LIKE ? OR v.description LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        if (status) {
            query += ' AND v.status = ?';
            params.push(status);
        }

        query += ' GROUP BY v.id ORDER BY v.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [videos] = await pool.execute(query, params);

        // Get total count for pagination
        let countQuery = 'SELECT COUNT(DISTINCT v.id) as total FROM videos v LEFT JOIN categories c ON v.category_id = c.id WHERE 1=1';
        const countParams = [];

        if (category) {
            countQuery += ' AND (c.slug = ? OR c.id = ?)';
            countParams.push(category, category);
        }
        if (type) {
            countQuery += ' AND v.type = ?';
            countParams.push(type);
        }
        if (search) {
            countQuery += ' AND (v.title LIKE ? OR v.description LIKE ?)';
            countParams.push(`%${search}%`, `%${search}%`);
        }
        if (status) {
            countQuery += ' AND v.status = ?';
            countParams.push(status);
        }

        const [countResult] = await pool.execute(countQuery, countParams);
        const total = countResult[0].total;

        res.json({
            success: true,
            data: videos,
            pagination: {
                current_page: parseInt(page),
                per_page: parseInt(limit),
                total: total,
                total_pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get videos error:', error);
        res.status(500).json({ error: 'Failed to fetch videos' });
    }
});

// Get single video with episodes
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Get video details
        const [videoResult] = await pool.execute(`
            SELECT v.*, c.name as category_name 
            FROM videos v 
            LEFT JOIN categories c ON v.category_id = c.id 
            WHERE v.id = ?
        `, [id]);

        if (videoResult.length === 0) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const video = videoResult[0];

        // Get seasons and episodes for series
        if (video.type === 'series') {
            const [seasons] = await pool.execute(`
                SELECT * FROM seasons WHERE video_id = ? ORDER BY season_number
            `, [id]);

            for (let season of seasons) {
                const [episodes] = await pool.execute(`
                    SELECT * FROM episodes 
                    WHERE season_id = ? 
                    ORDER BY episode_number
                `, [season.id]);
                season.episodes = episodes;
            }

            video.seasons = seasons;
        }

        res.json({
            success: true,
            data: video
        });
    } catch (error) {
        console.error('Get video error:', error);
        res.status(500).json({ error: 'Failed to fetch video' });
    }
});

// Create new video (Admin only)
router.post('/', verifyToken, isAdmin, upload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'poster', maxCount: 1 }
]), async (req, res) => {
    try {
        const {
            title,
            description,
            category_id,
            type,
            is_premium,
            ads_to_unlock,
            rating,
            release_year,
            duration,
            trailer_url,
            status
        } = req.body;

        // Validate required fields
        if (!title || !type) {
            return res.status(400).json({ error: 'Title and type are required' });
        }

        const thumbnail = req.files && req.files['thumbnail'] ? `/uploads/${req.files['thumbnail'][0].filename}` : null;
        const poster = req.files && req.files['poster'] ? `/uploads/${req.files['poster'][0].filename}` : null;

        const [result] = await pool.execute(`
            INSERT INTO videos (
                title, description, thumbnail, poster_url, trailer_url,
                category_id, type, is_premium, ads_to_unlock,
                rating, release_year, duration, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            title,
            description || null,
            thumbnail,
            poster,
            trailer_url || null,
            category_id || null,
            type,
            is_premium === 'true' || is_premium === true,
            parseInt(ads_to_unlock) || 0,
            parseFloat(rating) || 0.0,
            release_year || null,
            duration || null,
            status || 'active'
        ]);

        res.json({
            success: true,
            message: 'Video created successfully',
            data: { id: result.insertId }
        });
    } catch (error) {
        console.error('Create video error:', error);
        res.status(500).json({ error: 'Failed to create video' });
    }
});

// Update video (Admin only)
router.put('/:id', verifyToken, isAdmin, upload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'poster', maxCount: 1 }
]), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            description,
            category_id,
            type,
            is_premium,
            ads_to_unlock,
            rating,
            release_year,
            duration,
            trailer_url,
            status
        } = req.body;

        // Build update query dynamically
        let updates = [];
        let values = [];

        if (title !== undefined) { updates.push('title = ?'); values.push(title); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (category_id !== undefined) { updates.push('category_id = ?'); values.push(category_id); }
        if (type !== undefined) { updates.push('type = ?'); values.push(type); }
        if (is_premium !== undefined) { updates.push('is_premium = ?'); values.push(is_premium === 'true' || is_premium === true); }
        if (ads_to_unlock !== undefined) { updates.push('ads_to_unlock = ?'); values.push(parseInt(ads_to_unlock) || 0); }
        if (rating !== undefined) { updates.push('rating = ?'); values.push(parseFloat(rating) || 0.0); }
        if (release_year !== undefined) { updates.push('release_year = ?'); values.push(release_year); }
        if (duration !== undefined) { updates.push('duration = ?'); values.push(duration); }
        if (trailer_url !== undefined) { updates.push('trailer_url = ?'); values.push(trailer_url); }
        if (status !== undefined) { updates.push('status = ?'); values.push(status); }

        // Handle file uploads
        if (req.files && req.files['thumbnail']) {
            updates.push('thumbnail = ?');
            values.push(`/uploads/${req.files['thumbnail'][0].filename}`);
        }
        if (req.files && req.files['poster']) {
            updates.push('poster_url = ?');
            values.push(`/uploads/${req.files['poster'][0].filename}`);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);

        const [result] = await pool.execute(`
            UPDATE videos SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, values);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Video not found' });
        }

        res.json({
            success: true,
            message: 'Video updated successfully'
        });
    } catch (error) {
        console.error('Update video error:', error);
        res.status(500).json({ error: 'Failed to update video' });
    }
});

// Delete video (Admin only)
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await pool.execute('DELETE FROM videos WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Video not found' });
        }

        res.json({
            success: true,
            message: 'Video deleted successfully'
        });
    } catch (error) {
        console.error('Delete video error:', error);
        res.status(500).json({ error: 'Failed to delete video' });
    }
});

// Increment video views
router.post('/:id/view', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.execute('UPDATE videos SET views = views + 1 WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to increment view' });
    }
});

module.exports = router;