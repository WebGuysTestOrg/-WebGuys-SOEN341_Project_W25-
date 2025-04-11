-- ========================
-- Database Schema Creation
-- ========================

-- ====================
-- user_form Table
-- ====================

CREATE TABLE IF NOT EXISTS user_form (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100),
    password VARCHAR(255),
    user_type ENUM('admin', 'user')
);

-- ====================
-- teams Table
-- ====================
CREATE TABLE IF NOT EXISTS teams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_by INT NOT NULL,
    FOREIGN KEY (created_by) REFERENCES user_form(id)
);

-- ====================
-- channels Table
-- ====================
CREATE TABLE IF NOT EXISTS channels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    team_id INT NOT NULL,
    FOREIGN KEY (team_id) REFERENCES teams(id)
);

-- ====================
-- user_channels Table
-- ====================
CREATE TABLE IF NOT EXISTS user_channels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    channel_id INT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user_form(id),
    FOREIGN KEY (channel_id) REFERENCES channels(id)
);

-- ====================
-- direct_messages Table
-- ====================
CREATE TABLE IF NOT EXISTS direct_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT NOT NULL,
    recipient_id INT NOT NULL,
    text TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    pinned BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (sender_id) REFERENCES user_form(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES user_form(id) ON DELETE CASCADE
);

-- ====================
-- user_teams Table
-- ====================
CREATE TABLE IF NOT EXISTS user_teams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    team_id INT NOT NULL,
    KEY user_id (user_id),
    KEY team_id (team_id)
);

-- ====================
-- channels_messages Table
-- ====================
CREATE TABLE IF NOT EXISTS channels_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    team_name VARCHAR(255) NOT NULL,
    channel_name VARCHAR(255) NOT NULL,
    sender VARCHAR(255) NOT NULL,
    text TEXT NOT NULL,
    quoted_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    pinned BOOLEAN DEFAULT FALSE,
    INDEX (team_name, channel_name)
);

-- ====================
-- user_activity_log Table
-- ====================
CREATE TABLE IF NOT EXISTS user_activity_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    logout_time TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES user_form(id) ON DELETE CASCADE
);

-- ====================
-- team_members Table
-- ====================
CREATE TABLE IF NOT EXISTS team_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    team_id INT NOT NULL,
    user_id INT NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id),
    FOREIGN KEY (user_id) REFERENCES user_form(id),
    UNIQUE KEY unique_team_member (team_id, user_id)
);

-- ====================
-- channel_members Table
-- ====================
CREATE TABLE IF NOT EXISTS channel_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    channel_id INT NOT NULL,
    user_id INT NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES channels(id),
    FOREIGN KEY (user_id) REFERENCES user_form(id),
    UNIQUE KEY unique_channel_member (channel_id, user_id)
);

-- ====================
-- global_messages Table
-- ====================
CREATE TABLE IF NOT EXISTS global_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT NOT NULL,
    sender_name VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    quoted_text TEXT,
    quoted_sender VARCHAR(255),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES user_form(id)
);

-- ====================
-- groups Table
-- ====================
CREATE TABLE IF NOT EXISTS `groups` (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES user_form(id)
);

-- ====================
-- group_members Table
-- ====================
CREATE TABLE IF NOT EXISTS group_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    user_id INT NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES `groups`(id),
    FOREIGN KEY (user_id) REFERENCES user_form(id),
    UNIQUE KEY unique_group_member (group_id, user_id)
);

-- ====================
-- group_messages Table
-- ====================
CREATE TABLE IF NOT EXISTS group_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    user_id INT NOT NULL,
    text TEXT NOT NULL,
    is_system_message BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES `groups`(id),
    FOREIGN KEY (user_id) REFERENCES user_form(id)
);

-- ====================
-- group_requests Table
-- ====================
CREATE TABLE IF NOT EXISTS group_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES `groups`(id),
    FOREIGN KEY (user_id) REFERENCES user_form(id),
    UNIQUE KEY unique_group_request (group_id, user_id)
);
