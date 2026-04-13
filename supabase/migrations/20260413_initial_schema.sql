-- GritOS Initial Schema
-- Runs against Supabase Postgres (auth.users managed by Supabase Auth)

-- ═══════════════════════════════════════════════════
-- USER PROFILES
-- ═══════════════════════════════════════════════════

CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  sex TEXT,
  height TEXT,
  weight_lbs DECIMAL,
  bmi DECIMAL,
  experience TEXT CHECK (experience IN ('beginner', 'intermediate', 'advanced', 'elite')),
  body_comp_goals TEXT[] DEFAULT '{}',
  fitness_goals TEXT[] DEFAULT '{}',
  training_days_per_week INT DEFAULT 4,
  training_days INT[] DEFAULT '{0,1,3,4}',
  session_duration_minutes INT DEFAULT 60,
  workout_styles TEXT[] DEFAULT '{}',
  additional_notes TEXT,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'elite')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════
-- USER EQUIPMENT
-- ═══════════════════════════════════════════════════

CREATE TABLE user_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  equipment_type TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  UNIQUE(user_id, equipment_type)
);

-- ═══════════════════════════════════════════════════
-- WORKING WEIGHTS (user's known 8-10RM)
-- ═══════════════════════════════════════════════════

CREATE TABLE user_working_weights (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_pattern TEXT NOT NULL,
  weight_lbs DECIMAL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY(user_id, exercise_pattern)
);

-- ═══════════════════════════════════════════════════
-- COACH MESSAGES (for rate limiting + history)
-- ═══════════════════════════════════════════════════

CREATE TABLE coach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT,
  actions JSONB,
  tokens_in INT DEFAULT 0,
  tokens_out INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_coach_messages_user_date ON coach_messages(user_id, created_at DESC);

-- ═══════════════════════════════════════════════════
-- INJURIES
-- ═══════════════════════════════════════════════════

CREATE TABLE injuries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  body_part TEXT NOT NULL,
  severity TEXT DEFAULT 'mild',
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  recovered_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════
-- ROW LEVEL SECURITY — users can only see their own data
-- ═══════════════════════════════════════════════════

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_working_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE injuries ENABLE ROW LEVEL SECURITY;

-- Policies: users can read/write their own rows only
CREATE POLICY "Users manage own profile" ON user_profiles
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own equipment" ON user_equipment
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own weights" ON user_working_weights
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own messages" ON coach_messages
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own injuries" ON injuries
  FOR ALL USING (auth.uid() = user_id);

-- Service role (Edge Functions) bypasses RLS automatically
