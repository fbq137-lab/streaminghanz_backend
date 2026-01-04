const express = require('express');
const { pool } = require('../config/database');
const { verifyToken, isAdmin } = require('../middleware/auth');
const router = express.Router();

// Get all ad networks
router.get('/networks', async (req, res) => {
    try {
        const [networks] = await pool.execute('SELECT * FROM ad_networks ORDER BY name');
        res.json({
            success: true,
            data: networks
        });
    } catch (error) {
        console.error('Get ad networks error:', error);
        res.status(500).json({ error: 'Failed to fetch ad networks' });
    }
});

// Get all advertisements
router.get('/', async (req, res) => {
    try {
        const { type, position, status } = req.query;

        let query = `
            SELECT a.*, an.name as network_name, an.code as network_code
            FROM advertisements a
            LEFT JOIN ad_networks an ON a.ad_network_id = an.id
            WHERE 1=1
        `;
        
        const params = [];

        if (type) {
            query += ' AND a.ad_type = ?';
            params.push(type);
        }

        if (position) {
            query += ' AND a.position = ?';
            params.push(position);
        }

        if (status) {
            query += ' AND a.status = ?';
            params.push(status);
        }

        query += ' ORDER BY a.priority DESC, a.created_at DESC';

        const [ads] = await pool.execute(query, params);

        res.json({
            success: true,
            data: ads
        });
    } catch (error) {
        console.error('Get advertisements error:', error);
        res.status(500).json({ error: 'Failed to fetch advertisements' });
    }
});

// Get active ads by position and type
router.get('/active', async (req, res) => {
    try {
        const { position, ad_type } = req.query;

        let query = `
            SELECT a.*, an.name as network_name, an.code as network_code
            FROM advertisements a
            LEFT JOIN ad_networks an ON a.ad_network_id = an.id
            WHERE a.status = 'active'
        `;
        
        const params = [];

        if (position) {
            query += ' AND a.position = ?';
            params.push(position);
        }

        if (ad_type) {
            query += ' AND a.ad_type = ?';
            params.push(ad_type);
        }

        query += ' ORDER BY a.priority DESC';

        const [ads] = await pool.execute(query, params);

        res.json({
            success: true,
            data: ads
        });
    } catch (error) {
        console.error('Get active ads error:', error);
        res.status(500).json({ error: 'Failed to fetch active ads' });
    }
});

// Get single advertisement
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [ad] = await pool.execute(`
            SELECT a.*, an.name as network_name, an.code as network_code
            FROM advertisements a
            LEFT JOIN ad_networks an ON a.ad_network_id = an.id
            WHERE a.id = ?
        `, [id]);

        if (ad.length === 0) {
            return res.status(404).json({ error: 'Advertisement not found' });
        }

        res.json({
            success: true,
            data: ad[0]
        });
    } catch (error) {
        console.error('Get advertisement error:', error);
        res.status(500).json({ error: 'Failed to fetch advertisement' });
    }
});

// Create advertisement (Admin only)
router.post('/', verifyToken, isAdmin, async (req, res) => {
    try {
        const {
            ad_network_id,
            name,
            ad_type,
            ad_code,
            position,
            priority
        } = req.body;

        // Validate required fields
        if (!name || !ad_type || !ad_code) {
            return res.status(400).json({ error: 'Name, ad type, and ad code are required' });
        }

        const [result] = await pool.execute(`
            INSERT INTO advertisements (
                ad_network_id, name, ad_type, ad_code, position, priority
            ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
            ad_network_id || null,
            name,
            ad_type,
            ad_code,
            position || null,
            parseInt(priority) || 1
        ]);

        res.json({
            success: true,
            message: 'Advertisement created successfully',
            data: { id: result.insertId }
        });
    } catch (error) {
        console.error('Create advertisement error:', error);
        res.status(500).json({ error: 'Failed to create advertisement' });
    }
});

// Update advertisement (Admin only)
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            ad_network_id,
            name,
            ad_type,
            ad_code,
            position,
            priority,
            status
        } = req.body;

        // Build update query dynamically
        let updates = [];
        let values = [];

        if (ad_network_id !== undefined) { updates.push('ad_network_id = ?'); values.push(ad_network_id); }
        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (ad_type !== undefined) { updates.push('ad_type = ?'); values.push(ad_type); }
        if (ad_code !== undefined) { updates.push('ad_code = ?'); values.push(ad_code); }
        if (position !== undefined) { updates.push('position = ?'); values.push(position); }
        if (priority !== undefined) { updates.push('priority = ?'); values.push(parseInt(priority)); }
        if (status !== undefined) { updates.push('status = ?'); values.push(status); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);

        const [result] = await pool.execute(`
            UPDATE advertisements SET ${updates.join(', ')} WHERE id = ?
        `, values);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Advertisement not found' });
        }

        res.json({
            success: true,
            message: 'Advertisement updated successfully'
        });
    } catch (error) {
        console.error('Update advertisement error:', error);
        res.status(500).json({ error: 'Failed to update advertisement' });
    }
});

// Delete advertisement (Admin only)
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await pool.execute('DELETE FROM advertisements WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Advertisement not found' });
        }

        res.json({
            success: true,
            message: 'Advertisement deleted successfully'
        });
    } catch (error) {
        console.error('Delete advertisement error:', error);
        res.status(500).json({ error: 'Failed to delete advertisement' });
    }
});

// Record ad view (for ads-to-unlock system)
router.post('/view', async (req, res) => {
    try {
        const { user_identifier, video_id, episode_id, ad_id } = req.body;

        if (!user_identifier || !ad_id) {
            return res.status(400).json({ error: 'User identifier and ad ID are required' });
        }

        await pool.execute(`
            INSERT INTO user_ad_views (user_identifier, video_id, episode_id, ad_id)
            VALUES (?, ?, ?, ?)
        `, [user_identifier, video_id || null, episode_id || null, ad_id]);

        res.json({
            success: true,
            message: 'Ad view recorded'
        });
    } catch (error) {
        console.error('Record ad view error:', error);
        res.status(500).json({ error: 'Failed to record ad view' });
    }
});

// Get user's ad view count for specific content
router.get('/view-count/:userIdentifier', async (req, res) => {
    try {
        const { userIdentifier } = req.params;
        const { video_id, episode_id } = req.query;

        let query = `
            SELECT COUNT(*) as view_count
            FROM user_ad_views
            WHERE user_identifier = ?
        `;
        
        const params = [userIdentifier];

        if (video_id) {
            query += ' AND video_id = ?';
            params.push(video_id);
        }

        if (episode_id) {
            query += ' AND episode_id = ?';
            params.push(episode_id);
        }

        const [result] = await pool.execute(query, params);

        res.json({
            success: true,
            data: {
                user_identifier: userIdentifier,
                view_count: result[0].view_count
            }
        });
    } catch (error) {
        console.error('Get ad view count error:', error);
        res.status(500).json({ error: 'Failed to get ad view count' });
    }
});

module.exports = router;