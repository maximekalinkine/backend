-- ============================================================
-- schema.sql — À coller dans l'éditeur SQL de Supabase
-- Crée les tables transactions et settings avec Row Level Security
-- ============================================================


-- ── Table : transactions
CREATE TABLE IF NOT EXISTS transactions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  desc       TEXT NOT NULL,
  amount     NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  cat        TEXT NOT NULL,
  date       DATE NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour accélérer les requêtes filtrées par utilisateur
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);

-- Row Level Security : chaque utilisateur ne voit que ses données
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture propres transactions" ON transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Insertion propres transactions" ON transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Modification propres transactions" ON transactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Suppression propres transactions" ON transactions
  FOR DELETE USING (auth.uid() = user_id);


-- ── Table : settings
CREATE TABLE IF NOT EXISTS settings (
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  company    TEXT DEFAULT 'Mon Entreprise',
  currency   TEXT DEFAULT '€',
  theme      TEXT DEFAULT 'dark',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture propres paramètres" ON settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Modification propres paramètres" ON settings
  FOR ALL USING (auth.uid() = user_id);
