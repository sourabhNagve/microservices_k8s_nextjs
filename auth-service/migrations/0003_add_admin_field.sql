-- Add isAdmin field to users table
ALTER TABLE users ADD COLUMN "is_admin" BOOLEAN DEFAULT false NOT NULL;

-- Create index for better performance on admin queries
CREATE INDEX idx_users_is_admin ON users("is_admin");

-- Create index for better search performance
CREATE INDEX idx_users_name_search ON users USING gin(to_tsvector('english', name));
CREATE INDEX idx_users_email_search ON users USING gin(to_tsvector('english', email));
