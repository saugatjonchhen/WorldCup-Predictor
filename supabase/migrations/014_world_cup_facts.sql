-- Create world_cup_facts table
CREATE TABLE IF NOT EXISTS public.world_cup_facts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fact_text TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Policies
ALTER TABLE public.world_cup_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "World cup facts are viewable by everyone"
    ON public.world_cup_facts FOR SELECT
    USING (true);

CREATE POLICY "Only admins can insert facts"
    ON public.world_cup_facts FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Only admins can update facts"
    ON public.world_cup_facts FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Only admins can delete facts"
    ON public.world_cup_facts FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Seed some initial facts
INSERT INTO public.world_cup_facts (fact_text) VALUES
('The 2026 FIFA World Cup will be the first to include 48 teams, expanded from 32.'),
('The tournament will be jointly hosted by 16 cities in three North American countries: Canada, Mexico, and the United States.'),
('Mexico will become the first country to host or co-host the men''s World Cup three times (previously 1970 and 1986).'),
('The "WeAre26" official brand was unveiled in Los Angeles in May 2023.'),
('A total of 104 matches will be played, up from 64 in the 32-team format.'),
('The final match will be held at MetLife Stadium in East Rutherford, New Jersey, on July 19, 2026.')
ON CONFLICT DO NOTHING;
