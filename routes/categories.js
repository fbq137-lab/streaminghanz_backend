const express = require('express');
const { pool } = require('../config/database');
const { verifyToken, isAdmin } = require('../middleware/auth');
const router = express.Router();

// Get all categories
router.get('/', async (req, res) => {
    try {
        const [categories] = await pool.execute(`
            SELECT c.*, COUNT(v.id) as video_count
            FROM categories c
            LEFT JOIN videos v ON c.id = v.category_id AND v.status = 'active'
            GROUP BY c.id
            ORDER BY c.name
        `);

        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// Get single category
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [category] = await pool.execute('SELECT * FROM categories WHERE id = ?', [id]);

        if (category.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json({
            success: true,
            data: category[0]
        });
    } catch (error) {
        console.error('Get category error:', error);
        res.status(500).json({ error: 'Failed to fetch category' });
    }
});

// Create category (Admin only)
router.post('/', verifyToken, isAdmin, async (req, res) => {
    try {
        const { name, slug } = req.body;

        if (!name || !slug) {
            return res.status(400).json({ error: 'Name and slug are required' });
        }

        const [result] = await pool.execute(
            'INSERT INTO categories (name, slug) VALUES (?, ?)',
            [name, slug]
        );

        res.json({
            success: true,
            message: 'Category created successfully',
            data: { id: result.insertId }
        });
    } catch (error) {
        console.error('Create category error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Category slug already exists' });
        }
        res.status(500).json({ error: 'Failed to create category' });
    }
});

// Update category (Admin only)
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, slug } = req.body;

        const updates = [];
        const values = [];

        if (name) { updates.push('name = ?'); values.push(name); }
        if (slug) { updates.push('slug = ?'); values.push(slug); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);

        const [result] = await pool.execute(`
            UPDATE categories SET ${updates.join(', ')} WHERE id = ?
        `, values);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json({
            success: true,
            message: 'Category updated successfully'
        });
    } catch (error) {
        console.error('Update category error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Category slug already exists' });
        }
        res.status(500).json({ error: 'Failed to update category' });
    }
});

// Delete category (Admin only)
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await pool.execute('DELETE FROM categories WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json({
            success: true,
            message: 'Category deleted successfully'
        });
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({ error: 'Failed to delete category' });
    }
});

module.exports = router;