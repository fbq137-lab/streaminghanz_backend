const express = require('express');
const { pool } = require('../config/database');
const router = express.Router();

// Get homepage content (featured videos, new releases, etc.)
router.get('/homepage', async (req, res) => {
    try {
        // Get featured videos (premium content)
        const [featured] = await pool.execute(`
            SELECT v.*, c.name as category_name 
            FROM videos v 
            LEFT JOIN categories c ON v.category_id = c.id 
            WHERE v.is_premium = 1 AND v.status = 'active'
            ORDER BY v.created_at DESC LIMIT 10
        `);

        // Get latest movies
        const [latestMovies] = await pool.execute(`
            SELECT v.*, c.name as category_name 
            FROM videos v 
            LEFT JOIN categories c ON v.category_id = c.id 
            WHERE v.type = 'movie' AND v.status = 'active'
            ORDER BY v.created_at DESC LIMIT 10
        `);

        // Get popular series
        const [popularSeries] = await pool.execute(`
            SELECT v.*, c.name as category_name 
            FROM videos v 
            LEFT JOIN categories c ON v.category_id = c.id 
            WHERE v.type = 'series' AND v.status = 'active'
            ORDER BY v.views DESC LIMIT 10
        `);

        // Get categories with video counts
        const [categories] = await pool.execute(`
            SELECT c.*, COUNT(v.id) as video_count
            FROM categories c
            LEFT JOIN videos v ON c.id = v.category_id AND v.status = 'active'
            GROUP BY c.id
            HAVING video_count > 0
            ORDER BY video_count DESC
        `);

        res.json({
            success: true,
            data: {
                featured,
                latest_movies: latestMovies,
                popular_series: popularSeries,
                categories
            }
        });
    } catch (error) {
        console.error('Get homepage error:', error);
        res.status(500).json({ error: 'Failed to fetch homepage content' });
    }
});

// Check if user can watch content (ads-to-unlock logic)
router.post('/check-access', async (req, res) => {
    try {
        const { user_identifier, video_id, episode_id } = req.body;

        if (!user_identifier || (!video_id && !episode_id)) {
            return res.status(400).json({ error: 'User identifier and video/episode ID are required' });
        }

        // Get content details
        let content;
        if (episode_id) {
            const [episode] = await pool.execute(`
                SELECT e.*, v.title as video_title, v.is_premium as video_premium
                FROM episodes e
                JOIN videos v ON e.video_id = v.id
                WHERE e.id = ?
            `, [episode_id]);
            
            if (episode.length === 0) {
                return res.status(404).json({ error: 'Episode not found' });
            }
            
            content = episode[0];
            content.is_premium = content.is_premium || content.video_premium;
            content.ads_required = content.ads_to_unlock || 0;
        } else {
            const [video] = await pool.execute('SELECT * FROM videos WHERE id = ?', [video_id]);
            
            if (video.length === 0) {
                return res.status(404).json({ error: 'Video not found' });
            }
            
            content = video[0];
            content.ads_required = content.ads_to_unlock || 0;
        }

        // If not premium, allow access
        if (!content.is_premium) {
            return res.json({
                success: true,
                can_watch: true,
                reason: 'Free content',
                ads_watched: 0,
                ads_required: 0
            });
        }

        // Count ads watched by user for this content
        let adsWatchedQuery = `
            SELECT COUNT(*) as count
            FROM user_ad_views
            WHERE user_identifier = ?
        `;
        
        const adsParams = [user_identifier];

        if (episode_id) {
            adsWatchedQuery += ' AND episode_id = ?';
            adsParams.push(episode_id);
        } else {
            adsWatchedQuery += ' AND video_id = ?';
            adsParams.push(video_id);
        }

        const [adsResult] = await pool.execute(adsWatchedQuery, adsParams);
        const adsWatched = adsResult[0].count;
        const adsRequired = content.ads_required;

        const canWatch = adsWatched >= adsRequired;

        res.json({
            success: true,
            can_watch: canWatch,
            ads_watched: adsWatched,
            ads_required: adsRequired,
            reason: canWatch ? 'Access granted' : `Watch ${adsRequired - adsWatched} more ads to unlock`
        });

    } catch (error) {
        console.error('Check access error:', error);
        res.status(500).json({ error: 'Failed to check access' });
    }
});

// Get video player data (with ads configuration)
router.get('/player/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;
        const { episode_id } = req.query;

        // Get video/episode details
        let content;
        if (episode_id) {
            const [episode] = await pool.execute(`
                SELECT e.*, v.title as video_title, v.poster_url, v.description as video_description,
                       s.season_number
                FROM episodes e
                JOIN videos v ON e.video_id = v.id
                JOIN seasons s ON e.season_id = s.id
                WHERE e.id = ? AND v.id = ?
            `, [episode_id, videoId]);
            
            if (episode.length === 0) {
                return res.status(404).json({ error: 'Episode not found' });
            }
            
            content = episode[0];
        } else {
            const [video] = await pool.execute('SELECT * FROM videos WHERE id = ?', [videoId]);
            
            if (video.length === 0) {
                return res.status(404).json({ error: 'Video not found' });
            }
            
            content = video[0];
        }

        // Get active ads based on content type
        const adPositions = episode_id ? ['preroll', 'midroll'] : ['preroll'];
        
        const [ads] = await pool.execute(`
            SELECT a.*, an.name as network_name, an.code as network_code
            FROM advertisements a
            LEFT JOIN ad_networks an ON a.ad_network_id = an.id
            WHERE a.status = 'active' AND a.ad_type IN (?)
            ORDER BY a.priority DESC
        `, [adPositions]);

        // Separate ads by type
        const prerollAds = ads.filter(ad => ad.ad_type === 'preroll');
        const midrollAds = ads.filter(ad => ad.ad_type === 'midroll');

        res.json({
            success: true,
            data: {
                content,
                ads: {
                    preroll: prerollAds,
                    midroll: midrollAds
                }
            }
        });

    } catch (error) {
        console.error('Get player data error:', error);
        res.status(500).json({ error: 'Failed to fetch player data' });
    }
});

// Record watch progress
router.post('/watch-progress', async (req, res) => {
    try {
        const { user_identifier, video_id, episode_id, watched_duration, total_duration } = req.body;

        if (!user_identifier || (!video_id && !episode_id)) {
            return res.status(400).json({ error: 'User identifier and video/episode ID are required' });
        }

        // Check if record exists
        let query = 'SELECT id FROM watch_history WHERE user_identifier = ?';
        const params = [user_identifier];

        if (episode_id) {
            query += ' AND episode_id = ?';
            params.push(episode_id);
        } else {
            query += ' AND video_id = ? AND episode_id IS NULL';
            params.push(video_id);
        }

        const [existing] = await pool.execute(query, params);

        if (existing.length > 0) {
            // Update existing record
            await pool.execute(`
                UPDATE watch_history 
                SET watched_duration = ?, total_duration = ?, watched_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [watched_duration, total_duration, existing[0].id]);
        } else {
            // Create new record
            await pool.execute(`
                INSERT INTO watch_history (user_identifier, video_id, episode_id, watched_duration, total_duration)
                VALUES (?, ?, ?, ?, ?)
            `, [
                user_identifier,
                video_id || null,
                episode_id || null,
                watched_duration,
                total_duration
            ]);
        }

        res.json({
            success: true,
            message: 'Watch progress saved'
        });

    } catch (error) {
        console.error('Save watch progress error:', error);
        res.status(500).json({ error: 'Failed to save watch progress' });
    }
});

// Get user's watch history
router.get('/history/:userIdentifier', async (req, res) => {
    try {
        const { userIdentifier } = req.params;

        const [history] = await pool.execute(`
            SELECT wh.*, 
                   v.title as video_title, v.thumbnail as video_thumbnail, v.type as video_type,
                   e.title as episode_title, e.episode_number,
                   s.season_number
            FROM watch_history wh
            LEFT JOIN videos v ON wh.video_id = v.id
            LEFT JOIN episodes e ON wh.episode_id = e.id
            LEFT JOIN seasons s ON e.season_id = s.id
            WHERE wh.user_identifier = ?
            ORDER BY wh.watched_at DESC
        `, [userIdentifier]);

        res.json({
            success: true,
            data: history
        });

    } catch (error) {
        console.error('Get watch history error:', error);
        res.status(500).json({ error: 'Failed to fetch watch history' });
    }
});

// Search content
router.get('/search', async (req, res) => {
    try {
        const { q, type, category } = req.query;

        if (!q || q.trim().length < 3) {
            return res.status(400).json({ error: 'Search query must be at least 3 characters' });
        }

        let query = `
            SELECT v.*, c.name as category_name,
                   COUNT(e.id) as episode_count
            FROM videos v
            LEFT JOIN categories c ON v.category_id = c.id
            LEFT JOIN episodes e ON v.id = e.video_id
            WHERE v.status = 'active' AND (
                v.title LIKE ? OR v.description LIKE ?
            )
        `;
        
        const params = [`%${q}%`, `%${q}%`];

        if (type) {
            query += ' AND v.type = ?';
            params.push(type);
        }

        if (category) {
            query += ' AND (c.slug = ? OR c.id = ?)';
            params.push(category, category);
        }

        query += ' GROUP BY v.id ORDER BY v.views DESC LIMIT 20';

        const [results] = await pool.execute(query, params);

        res.json({
            success: true,
            data: results,
            query: q
        });

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Failed to search content' });
    }
});

module.exports = router;