const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/database');
const { verifyToken, isAdmin } = require('../middleware/auth');
const router = express.Router();

// Multer configuration for episode thumbnails
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
        cb(null, 'episode-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
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

// Get episodes by video ID with season grouping
router.get('/video/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;
        const { season } = req.query;

        let query = `
            SELECT e.*, s.season_number, s.title as season_title,
                   v.title as video_title, v.type as video_type
            FROM episodes e
            JOIN seasons s ON e.season_id = s.id
            JOIN videos v ON e.video_id = v.id
            WHERE e.video_id = ?
        `;
        
        const params = [videoId];

        if (season) {
            query += ' AND s.season_number = ?';
            params.push(parseInt(season));
        }

        query += ' ORDER BY s.season_number, e.episode_number';

        const [episodes] = await pool.execute(query, params);

        // Group episodes by season
        const seasonsMap = {};
        episodes.forEach(episode => {
            const seasonKey = `Season ${episode.season_number}`;
            if (!seasonsMap[seasonKey]) {
                seasonsMap[seasonKey] = {
                    season_number: episode.season_number,
                    season_title: episode.season_title,
                    episodes: []
                };
            }
            seasonsMap[seasonKey].episodes.push({
                id: episode.id,
                episode_number: episode.episode_number,
                title: episode.title,
                description: episode.description,
                video_url: episode.video_url,
                thumbnail_url: episode.thumbnail_url,
                duration: episode.duration,
                is_premium: episode.is_premium,
                ads_to_unlock: episode.ads_to_unlock,
                views: episode.views,
                created_at: episode.created_at
            });
        });

        const groupedSeasons = Object.values(seasonsMap);

        res.json({
            success: true,
            data: {
                video_id: videoId,
                seasons: groupedSeasons
            }
        });
    } catch (error) {
        console.error('Get episodes error:', error);
        res.status(500).json({ error: 'Failed to fetch episodes' });
    }
});

// Get single episode
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [episode] = await pool.execute(`
            SELECT e.*, s.season_number, v.title as video_title, v.type as video_type
            FROM episodes e
            JOIN seasons s ON e.season_id = s.id
            JOIN videos v ON e.video_id = v.id
            WHERE e.id = ?
        `, [id]);

        if (episode.length === 0) {
            return res.status(404).json({ error: 'Episode not found' });
        }

        res.json({
            success: true,
            data: episode[0]
        });
    } catch (error) {
        console.error('Get episode error:', error);
        res.status(500).json({ error: 'Failed to fetch episode' });
    }
});

// Create new season (Admin only)
router.post('/season', verifyToken, isAdmin, async (req, res) => {
    try {
        const { video_id, season_number, title, description, poster_url } = req.body;

        if (!video_id || !season_number) {
            return res.status(400).json({ error: 'Video ID and season number are required' });
        }

        // Check if video exists
        const [videoCheck] = await pool.execute('SELECT id FROM videos WHERE id = ? AND type = "series"', [video_id]);
        if (videoCheck.length === 0) {
            return res.status(404).json({ error: 'Video not found or not a series' });
        }

        // Check if season already exists
        const [existingSeason] = await pool.execute(
            'SELECT id FROM seasons WHERE video_id = ? AND season_number = ?',
            [video_id, parseInt(season_number)]
        );

        if (existingSeason.length > 0) {
            return res.status(400).json({ error: 'Season already exists for this video' });
        }

        const [result] = await pool.execute(`
            INSERT INTO seasons (video_id, season_number, title, description, poster_url)
            VALUES (?, ?, ?, ?, ?)
        `, [
            video_id,
            parseInt(season_number),
            title || `Season ${season_number}`,
            description || null,
            poster_url || null
        ]);

        res.json({
            success: true,
            message: 'Season created successfully',
            data: { id: result.insertId }
        });
    } catch (error) {
        console.error('Create season error:', error);
        res.status(500).json({ error: 'Failed to create season' });
    }
});

// Create new episode (Admin only)
router.post('/', verifyToken, isAdmin, upload.single('thumbnail'), async (req, res) => {
    try {
        const {
            video_id,
            season_id,
            episode_number,
            title,
            description,
            video_url,
            duration,
            is_premium,
            ads_to_unlock
        } = req.body;

        // Validate required fields
        if (!video_id || !season_id || !episode_number || !title || !video_url) {
            return res.status(400).json({ error: 'Video ID, Season ID, episode number, title, and video URL are required' });
        }

        // Check if season exists and belongs to video
        const [seasonCheck] = await pool.execute(
            'SELECT id FROM seasons WHERE id = ? AND video_id = ?',
            [season_id, video_id]
        );

        if (seasonCheck.length === 0) {
            return res.status(400).json({ error: 'Season not found or does not belong to the specified video' });
        }

        // Check if episode number already exists in season
        const [existingEpisode] = await pool.execute(
            'SELECT id FROM episodes WHERE season_id = ? AND episode_number = ?',
            [season_id, parseInt(episode_number)]
        );

        if (existingEpisode.length > 0) {
            return res.status(400).json({ error: 'Episode number already exists in this season' });
        }

        const thumbnail_url = req.file ? `/uploads/${req.file.filename}` : null;

        const [result] = await pool.execute(`
            INSERT INTO episodes (
                video_id, season_id, episode_number, title, description,
                video_url, thumbnail_url, duration, is_premium, ads_to_unlock
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            video_id,
            season_id,
            parseInt(episode_number),
            title,
            description || null,
            video_url,
            thumbnail_url,
            duration || null,
            is_premium === 'true' || is_premium === true,
            parseInt(ads_to_unlock) || 0
        ]);

        res.json({
            success: true,
            message: 'Episode created successfully',
            data: { id: result.insertId }
        });
    } catch (error) {
        console.error('Create episode error:', error);
        res.status(500).json({ error: 'Failed to create episode' });
    }
});

// Update episode (Admin only)
router.put('/:id', verifyToken, isAdmin, upload.single('thumbnail'), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            episode_number,
            title,
            description,
            video_url,
            duration,
            is_premium,
            ads_to_unlock
        } = req.body;

        // Build update query dynamically
        let updates = [];
        let values = [];

        if (episode_number !== undefined) { updates.push('episode_number = ?'); values.push(parseInt(episode_number)); }
        if (title !== undefined) { updates.push('title = ?'); values.push(title); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (video_url !== undefined) { updates.push('video_url = ?'); values.push(video_url); }
        if (duration !== undefined) { updates.push('duration = ?'); values.push(duration); }
        if (is_premium !== undefined) { updates.push('is_premium = ?'); values.push(is_premium === 'true' || is_premium === true); }
        if (ads_to_unlock !== undefined) { updates.push('ads_to_unlock = ?'); values.push(parseInt(ads_to_unlock) || 0); }

        // Handle thumbnail upload
        if (req.file) {
            updates.push('thumbnail_url = ?');
            values.push(`/uploads/${req.file.filename}`);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);

        const [result] = await pool.execute(`
            UPDATE episodes SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, values);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Episode not found' });
        }

        res.json({
            success: true,
            message: 'Episode updated successfully'
        });
    } catch (error) {
        console.error('Update episode error:', error);
        res.status(500).json({ error: 'Failed to update episode' });
    }
});

// Delete episode (Admin only)
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await pool.execute('DELETE FROM episodes WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Episode not found' });
        }

        res.json({
            success: true,
            message: 'Episode deleted successfully'
        });
    } catch (error) {
        console.error('Delete episode error:', error);
        res.status(500).json({ error: 'Failed to delete episode' });
    }
});

// Increment episode views
router.post('/:id/view', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.execute('UPDATE episodes SET views = views + 1 WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to increment view' });
    }
});

module.exports = router;