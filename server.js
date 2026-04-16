// ============================================================
// server.js — API REST ClearBooks
// Tourne sur Render. Toutes les routes sont protégées par JWT
// Supabase (l'utilisateur doit être connecté côté frontend).
// ============================================================

const express = require('express')
const cors = require('cors')
const { createClient } = require('@supabase/supabase-js')

const app = express()
const PORT = process.env.PORT || 3000

// ── Supabase admin client (service role = accès total, côté serveur uniquement)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// ── Middlewares
app.use(cors())
app.use(express.json())


// ============================================================
// Middleware : requireAuth
// Vérifie le JWT Supabase envoyé dans le header Authorization.
// Si valide, attache l'utilisateur à req.user et continue.
// ============================================================
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' })
  }

  const token = authHeader.split(' ')[1]

  // On vérifie le token avec le client Supabase
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return res.status(401).json({ error: 'Token invalide ou expiré' })
  }

  req.user = user
  next()
}


// ============================================================
// ROUTE : GET /health
// Vérification que l'API est en ligne (Render l'utilise aussi)
// ============================================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})


// ============================================================
// ROUTES : TRANSACTIONS
// ============================================================

// GET /transactions — Toutes les transactions de l'utilisateur connecté
app.get('/transactions', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', req.user.id)
    .order('date', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /transactions — Ajouter une transaction
app.post('/transactions', requireAuth, async (req, res) => {
  const { desc, amount, cat, date, type } = req.body

  if (!desc || !amount || !cat || !date || !type) {
    return res.status(400).json({ error: 'Champs manquants' })
  }

  const { data, error } = await supabase
    .from('transactions')
    .insert([{ user_id: req.user.id, desc, amount, cat, date, type }])
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// PUT /transactions/:id — Modifier une transaction
app.put('/transactions/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const { desc, amount, cat, date, type } = req.body

  // On filtre aussi par user_id pour éviter qu'un user modifie
  // les données d'un autre
  const { data, error } = await supabase
    .from('transactions')
    .update({ desc, amount, cat, date, type })
    .eq('id', id)
    .eq('user_id', req.user.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /transactions/:id — Supprimer une transaction
app.delete('/transactions/:id', requireAuth, async (req, res) => {
  const { id } = req.params

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', req.user.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).send()
})


// ============================================================
// ROUTES : PARAMÈTRES UTILISATEUR
// ============================================================

// GET /settings — Récupérer les paramètres de l'utilisateur
app.get('/settings', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', req.user.id)
    .single()

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = aucune ligne trouvée → pas une erreur ici
    return res.status(500).json({ error: error.message })
  }

  // Valeurs par défaut si l'utilisateur n'a pas encore de paramètres
  res.json(data || { company: 'Mon Entreprise', currency: '€', theme: 'dark' })
})

// PUT /settings — Sauvegarder les paramètres (upsert = insert ou update)
app.put('/settings', requireAuth, async (req, res) => {
  const { company, currency, theme } = req.body

  const { data, error } = await supabase
    .from('settings')
    .upsert({ user_id: req.user.id, company, currency, theme })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})


// ── Démarrage
app.listen(PORT, () => {
  console.log(`ClearBooks API démarrée sur le port ${PORT}`)
})

app.get('/', (req, res) => {
  res.send('API is running 🚀')
})