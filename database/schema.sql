-- StreamingHanz Database Schema

-- Create Database
CREATE DATABASE IF NOT EXISTS streaminghanz;
USE streaminghanz;

-- Admin Users Table
CREATE TABLE IF NOT EXISTS admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin user (password: Ant137)
INSERT IGNORE INTO admin_users (username, password) VALUES 
('admin', '$2a$10$rOvFTJg6/8SH5K4K5J7lEOW7I9cYfLH5haO8Z1jf8E4G7K2I6P1pO');

-- Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default categories
INSERT IGNORE INTO categories (name, slug) VALUES 
('Action', 'action'),
('Drama', 'drama'),
('Comedy', 'comedy'),
('Horror', 'horror'),
('Romance', 'romance'),
('Thriller', 'thriller'),
('Sci-Fi', 'sci-fi'),
('Fantasy', 'fantasy');

-- Videos Table (Movies and Series)
CREATE TABLE IF NOT EXISTS videos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    thumbnail VARCHAR(500),
    poster_url VARCHAR(500),
    trailer_url VARCHAR(500),
    category_id INT,
    type ENUM('movie', 'series') DEFAULT 'movie',
    is_premium BOOLEAN DEFAULT FALSE,
    ads_to_unlock INT DEFAULT 0,
    rating DECIMAL(2,1) DEFAULT 0.0,
    release_year YEAR,
    duration VARCHAR(50),
    status ENUM('active', 'inactive') DEFAULT 'active',
    views INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Seasons Table
CREATE TABLE IF NOT EXISTS seasons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    video_id INT NOT NULL,
    season_number INT NOT NULL,
    title VARCHAR(255),
    description TEXT,
    poster_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    UNIQUE KEY unique_season (video_id, season_number)
);

-- Episodes Table
CREATE TABLE IF NOT EXISTS episodes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    video_id INT NOT NULL,
    season_id INT NOT NULL,
    episode_number INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    video_url VARCHAR(500) NOT NULL,
    thumbnail_url VARCHAR(500),
    duration VARCHAR(50),
    is_premium BOOLEAN DEFAULT FALSE,
    ads_to_unlock INT DEFAULT 0,
    views INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
    UNIQUE KEY unique_episode (video_id, season_id, episode_number)
);

-- Advertisement Networks Table
CREATE TABLE IF NOT EXISTS ad_networks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default ad networks
INSERT IGNORE INTO ad_networks (name, code) VALUES 
('AdSense', 'adsense'),
('AdMob', 'admob'),
('Adsterra', 'adsterra');

-- Advertisements Table
CREATE TABLE IF NOT EXISTS advertisements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ad_network_id INT,
    name VARCHAR(255) NOT NULL,
    ad_type ENUM('banner', 'interstitial', 'rewarded', 'preroll', 'midroll') NOT NULL,
    ad_code TEXT NOT NULL,
    position VARCHAR(100),
    priority INT DEFAULT 1,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ad_network_id) REFERENCES ad_networks(id) ON DELETE SET NULL
);

-- User Ad Views Table (for tracking ads watched)
CREATE TABLE IF NOT EXISTS user_ad_views (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_identifier VARCHAR(255),
    video_id INT,
    episode_id INT,
    ad_id INT,
    viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
    FOREIGN KEY (ad_id) REFERENCES advertisements(id) ON DELETE CASCADE
);

-- Watch History Table
CREATE TABLE IF NOT EXISTS watch_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_identifier VARCHAR(255),
    video_id INT,
    episode_id INT,
    watched_duration INT DEFAULT 0,
    total_duration INT DEFAULT 0,
    watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

-- Create Indexes for better performance
CREATE INDEX idx_videos_type ON videos(type);
CREATE INDEX idx_videos_category ON videos(category_id);
CREATE INDEX idx_videos_status ON videos(status);
CREATE INDEX idx_episodes_video ON episodes(video_id);
CREATE INDEX idx_episodes_season ON episodes(season_id);
CREATE INDEX idx_ad_views_user ON user_ad_views(user_identifier);
CREATE INDEX idx_watch_history_user ON watch_history(user_identifier);