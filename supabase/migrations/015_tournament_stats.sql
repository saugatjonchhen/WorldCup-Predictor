-- Migration: 015_tournament_stats.sql
-- Create table for storing scraped Opta tournament statistics

CREATE TABLE IF NOT EXISTS tournament_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL, -- e.g., 'players', 'teams'
    stat_type TEXT NOT NULL, -- e.g., 'big_chances_created', 'goals_per_match'
    data JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(category, stat_type)
);

-- Enable RLS
ALTER TABLE tournament_stats ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read
CREATE POLICY "Anyone can read tournament stats" 
    ON tournament_stats 
    FOR SELECT 
    USING (true);

-- Allow only admins to insert/update/delete
CREATE POLICY "Admins can insert tournament stats" 
    ON tournament_stats 
    FOR INSERT 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Admins can update tournament stats" 
    ON tournament_stats 
    FOR UPDATE 
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Admins can delete tournament stats" 
    ON tournament_stats 
    FOR DELETE 
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Also create a database webhook/RPC function if we need to call it from Edge Function
-- actually the edge function uses service_role key so it bypasses RLS.
