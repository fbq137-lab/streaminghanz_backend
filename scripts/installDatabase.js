const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function installDatabase() {
    try {
        // Connect to MySQL server (without database)
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || ''
        });

        console.log('Connected to MySQL server');

        // Create database
        await connection.execute(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'streaminghanz'}`);
        console.log('Database created or already exists');

        // Use database
        await connection.execute(`USE ${process.env.DB_NAME || 'streaminghanz'}`);

        // Read and execute schema
        const schemaPath = path.join(__dirname, '../database/schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // Split schema into individual statements
        const statements = schema.split(';').filter(stmt => stmt.trim().length > 0);

        for (const statement of statements) {
            if (statement.trim().startsWith('--') || statement.trim() === '') continue;
            
            try {
                await connection.execute(statement);
                console.log('Executed: ' + statement.substring(0, 50) + '...');
            } catch (error) {
                if (!error.message.includes('already exists') && !error.message.includes('Duplicate')) {
                    console.error('Error executing statement:', error.message);
                }
            }
        }

        console.log('Database installation completed successfully!');
        console.log('Default admin credentials:');
        console.log('Username: admin');
        console.log('Password: Ant137');

        await connection.end();

    } catch (error) {
        console.error('Database installation failed:', error);
        process.exit(1);
    }
}

// Run installation
if (require.main === module) {
    installDatabase();
}

module.exports = installDatabase;