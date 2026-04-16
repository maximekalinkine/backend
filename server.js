// ============================================================
// server.js — ClearBooks Backend Express v2
// Colonnes corrigées : desc→description, type→tx_type,
//   date→tx_date (tx), date→inv_date (inv), date→qt_date (qt)
//   date→asset_date (assets), date→er_date (expense_reports)
//   type→contact_type (contacts)
// ============================================================

const express = require('express')
const cors    = require('cors')
const { createClient } = require('@supabase/supabase-js')

const app  = express()
const PORT = process.env.PORT || 3001

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// ── MIDDLEWARES ──────────────────────────────────────────────
app.use(cors({
  origin: [
    'https://your-app.netlify.app',  // ← remplace par ton URL Netlify
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
  ],
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}))
app.use(express.json())

// ── AUTH MIDDLEWARE ──────────────────────────────────────────
async function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant.' })
  }
  const { data, error } = await supabase.auth.getUser(header.slice(7))
  if (error || !data?.user) {
    return res.status(401).json({ error: 'Token invalide ou expiré.' })
  }
  req.userId = data.user.id
  next()
}

function handleError(res, error, ctx = '') {
  console.error(`[ClearBooks] ${ctx}:`, error.message)
  res.status(500).json({ error: error.message })
}
function notFound(res, entity) {
  res.status(404).json({ error: `${entity} introuvable.` })
}

// ── HEALTH ───────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', app: 'ClearBooks API', version: '2.1.0' })
})


// ============================================================
// TRANSACTIONS
// Les champs frontend (desc, type, date) sont mappés vers
// les colonnes DB (description, tx_type, tx_date)
// ============================================================

// Convertit une ligne DB → objet frontend
function txToFront(row) {
  if (!row) return null
  return {
    id:             row.id,
    type:           row.tx_type,
    desc:           row.description,
    amount:         row.amount,
    cat:            row.cat,
    date:           row.tx_date,
    tva_rate:       row.tva_rate,
    payment:        row.payment,
    ref:            row.ref,
    notes:          row.notes,
    contact_id:     row.contact_id,
    is_recurring:   row.is_recurring,
    recurring_freq: row.recurring_freq,
    created_at:     row.created_at
  }
}

app.get('/transactions', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', req.userId)
    .order('tx_date', { ascending: false })
  if (error) return handleError(res, error, 'GET /transactions')
  res.json((data || []).map(txToFront))
})

app.post('/transactions', requireAuth, async (req, res) => {
  const { desc, amount, cat, date, type, tva_rate, payment,
          ref, notes, contact_id, is_recurring, recurring_freq } = req.body

  if (!desc || !amount || !date || !type) {
    return res.status(400).json({ error: 'Champs requis : desc, amount, date, type.' })
  }
  const { data, error } = await supabase
    .from('transactions')
    .insert([{
      user_id:        req.userId,
      tx_type:        type,
      description:    desc,
      amount:         Number(amount),
      cat:            cat || 'Autre',
      tx_date:        date,
      tva_rate:       Number(tva_rate ?? 20),
      payment:        payment || 'virement',
      ref:            ref || null,
      notes:          notes || null,
      contact_id:     contact_id || null,
      is_recurring:   Boolean(is_recurring),
      recurring_freq: is_recurring ? (recurring_freq || 'monthly') : null
    }])
    .select().single()
  if (error) return handleError(res, error, 'POST /transactions')
  res.status(201).json(txToFront(data))
})

app.put('/transactions/:id', requireAuth, async (req, res) => {
  const { desc, amount, cat, date, type, tva_rate, payment,
          ref, notes, contact_id, is_recurring, recurring_freq } = req.body
  const { data, error } = await supabase
    .from('transactions')
    .update({
      tx_type:        type,
      description:    desc,
      amount:         Number(amount),
      cat,
      tx_date:        date,
      tva_rate:       Number(tva_rate ?? 20),
      payment:        payment || 'virement',
      ref:            ref || null,
      notes:          notes || null,
      contact_id:     contact_id || null,
      is_recurring:   Boolean(is_recurring),
      recurring_freq: is_recurring ? (recurring_freq || 'monthly') : null
    })
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
    .select().single()
  if (error) return handleError(res, error, 'PUT /transactions')
  if (!data)  return notFound(res, 'Transaction')
  res.json(txToFront(data))
})

app.delete('/transactions/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
  if (error) return handleError(res, error, 'DELETE /transactions')
  res.status(204).end()
})


// ============================================================
// SETTINGS
// ============================================================

app.get('/settings', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', req.userId)
    .maybeSingle()
  if (error) return handleError(res, error, 'GET /settings')
  if (!data) return res.json({
    company: 'ClearBooks', currency: '€', theme: 'dark',
    siret: '', vatId: '', vatRegime: 'monthly', cashflowAlert: 1000
  })
  res.json({
    company:       data.company,
    currency:      data.currency,
    theme:         data.theme,
    siret:         data.siret         || '',
    vatId:         data.vat_id        || '',
    vatRegime:     data.vat_regime    || 'monthly',
    cashflowAlert: Number(data.cashflow_alert || 1000)
  })
})

app.put('/settings', requireAuth, async (req, res) => {
  const { company, currency, theme, siret, vatId, vatRegime, cashflowAlert } = req.body
  const { data, error } = await supabase
    .from('settings')
    .upsert({
      user_id:       req.userId,
      company:       company || 'ClearBooks',
      currency:      currency || '€',
      theme:         theme || 'dark',
      siret:         siret || null,
      vat_id:        vatId || null,
      vat_regime:    vatRegime || 'monthly',
      cashflow_alert: Number(cashflowAlert || 1000)
    }, { onConflict: 'user_id' })
    .select().single()
  if (error) return handleError(res, error, 'PUT /settings')
  res.json({
    company:       data.company,
    currency:      data.currency,
    theme:         data.theme,
    siret:         data.siret         || '',
    vatId:         data.vat_id        || '',
    vatRegime:     data.vat_regime,
    cashflowAlert: Number(data.cashflow_alert)
  })
})


// ============================================================
// CONTACTS
// contact_type → type en frontend
// ============================================================

function contactToFront(row) {
  if (!row) return null
  return { ...row, type: row.contact_type }
}

app.get('/contacts', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('user_id', req.userId)
    .order('name', { ascending: true })
  if (error) return handleError(res, error, 'GET /contacts')
  res.json((data || []).map(contactToFront))
})

app.post('/contacts', requireAuth, async (req, res) => {
  const { type, name, email, phone, siret, vat_id, address } = req.body
  if (!name || !type) {
    return res.status(400).json({ error: 'Champs requis : name, type.' })
  }
  const { data, error } = await supabase
    .from('contacts')
    .insert([{
      user_id:      req.userId,
      contact_type: type,
      name,
      email:   email   || null,
      phone:   phone   || null,
      siret:   siret   || null,
      vat_id:  vat_id  || null,
      address: address || null
    }])
    .select().single()
  if (error) return handleError(res, error, 'POST /contacts')
  res.status(201).json(contactToFront(data))
})

app.put('/contacts/:id', requireAuth, async (req, res) => {
  const { type, name, email, phone, siret, vat_id, address } = req.body
  const { data, error } = await supabase
    .from('contacts')
    .update({
      contact_type: type,
      name,
      email:   email   || null,
      phone:   phone   || null,
      siret:   siret   || null,
      vat_id:  vat_id  || null,
      address: address || null
    })
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
    .select().single()
  if (error) return handleError(res, error, 'PUT /contacts')
  if (!data)  return notFound(res, 'Contact')
  res.json(contactToFront(data))
})

app.delete('/contacts/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
  if (error) return handleError(res, error, 'DELETE /contacts')
  res.status(204).end()
})


// ============================================================
// INVOICES  — inv_date → date en frontend
// ============================================================

function invToFront(row) {
  if (!row) return null
  return { ...row, date: row.inv_date }
}

app.get('/invoices', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('user_id', req.userId)
    .order('inv_date', { ascending: false })
  if (error) return handleError(res, error, 'GET /invoices')

  // Auto-marquer les factures en retard
  const today = new Date().toISOString().slice(0, 10)
  const lateIds = (data || [])
    .filter(i => i.status === 'sent' && i.due_date && i.due_date < today)
    .map(i => i.id)
  if (lateIds.length) {
    await supabase.from('invoices').update({ status: 'late' }).in('id', lateIds).eq('user_id', req.userId)
    data.forEach(i => { if (lateIds.includes(i.id)) i.status = 'late' })
  }
  res.json((data || []).map(invToFront))
})

app.post('/invoices', requireAuth, async (req, res) => {
  const { number, status, contact_id, date, due_date,
          lines, discount, tva_rate, total_ht, total_ttc, notes } = req.body
  if (!number || !date) {
    return res.status(400).json({ error: 'Champs requis : number, date.' })
  }
  const { data, error } = await supabase
    .from('invoices')
    .insert([{
      user_id:    req.userId,
      number,
      status:     status || 'draft',
      contact_id: contact_id || null,
      inv_date:   date,
      due_date:   due_date || null,
      lines:      lines || [],
      discount:   Number(discount || 0),
      tva_rate:   Number(tva_rate || 20),
      total_ht:   Number(total_ht || 0),
      total_ttc:  Number(total_ttc || 0),
      notes:      notes || null
    }])
    .select().single()
  if (error) return handleError(res, error, 'POST /invoices')
  res.status(201).json(invToFront(data))
})

app.put('/invoices/:id', requireAuth, async (req, res) => {
  const { number, status, contact_id, date, due_date,
          lines, discount, tva_rate, total_ht, total_ttc, notes } = req.body
  const { data, error } = await supabase
    .from('invoices')
    .update({
      number, status,
      contact_id: contact_id || null,
      inv_date:   date,
      due_date:   due_date || null,
      lines:      lines || [],
      discount:   Number(discount || 0),
      tva_rate:   Number(tva_rate || 20),
      total_ht:   Number(total_ht || 0),
      total_ttc:  Number(total_ttc || 0),
      notes:      notes || null
    })
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
    .select().single()
  if (error) return handleError(res, error, 'PUT /invoices')
  if (!data)  return notFound(res, 'Facture')
  res.json(invToFront(data))
})

app.delete('/invoices/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
  if (error) return handleError(res, error, 'DELETE /invoices')
  res.status(204).end()
})


// ============================================================
// QUOTES  — qt_date → date en frontend
// ============================================================

function qtToFront(row) {
  if (!row) return null
  return { ...row, date: row.qt_date }
}

app.get('/quotes', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('user_id', req.userId)
    .order('qt_date', { ascending: false })
  if (error) return handleError(res, error, 'GET /quotes')

  // Auto-marquer les devis expirés
  const today = new Date().toISOString().slice(0, 10)
  const expiredIds = (data || [])
    .filter(q => q.status === 'pending' && q.valid_until && q.valid_until < today)
    .map(q => q.id)
  if (expiredIds.length) {
    await supabase.from('quotes').update({ status: 'expired' }).in('id', expiredIds).eq('user_id', req.userId)
    data.forEach(q => { if (expiredIds.includes(q.id)) q.status = 'expired' })
  }
  res.json((data || []).map(qtToFront))
})

app.post('/quotes', requireAuth, async (req, res) => {
  const { number, status, contact_id, date, valid_until,
          lines, discount, tva_rate, total_ht, total_ttc, notes } = req.body
  if (!number || !date) {
    return res.status(400).json({ error: 'Champs requis : number, date.' })
  }
  const { data, error } = await supabase
    .from('quotes')
    .insert([{
      user_id:     req.userId,
      number,
      status:      status || 'pending',
      contact_id:  contact_id || null,
      qt_date:     date,
      valid_until: valid_until || null,
      lines:       lines || [],
      discount:    Number(discount || 0),
      tva_rate:    Number(tva_rate || 20),
      total_ht:    Number(total_ht || 0),
      total_ttc:   Number(total_ttc || 0),
      notes:       notes || null
    }])
    .select().single()
  if (error) return handleError(res, error, 'POST /quotes')
  res.status(201).json(qtToFront(data))
})

app.put('/quotes/:id', requireAuth, async (req, res) => {
  const { number, status, contact_id, date, valid_until,
          lines, discount, tva_rate, total_ht, total_ttc, notes } = req.body
  const { data, error } = await supabase
    .from('quotes')
    .update({
      number, status,
      contact_id:  contact_id || null,
      qt_date:     date,
      valid_until: valid_until || null,
      lines:       lines || [],
      discount:    Number(discount || 0),
      tva_rate:    Number(tva_rate || 20),
      total_ht:    Number(total_ht || 0),
      total_ttc:   Number(total_ttc || 0),
      notes:       notes || null
    })
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
    .select().single()
  if (error) return handleError(res, error, 'PUT /quotes')
  if (!data)  return notFound(res, 'Devis')
  res.json(qtToFront(data))
})

app.delete('/quotes/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('quotes')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
  if (error) return handleError(res, error, 'DELETE /quotes')
  res.status(204).end()
})


// ============================================================
// ASSETS  — asset_date → date en frontend
// ============================================================

function assetToFront(row) {
  if (!row) return null
  return { ...row, date: row.asset_date }
}

app.get('/assets', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('user_id', req.userId)
    .order('asset_date', { ascending: false })
  if (error) return handleError(res, error, 'GET /assets')
  res.json((data || []).map(assetToFront))
})

app.post('/assets', requireAuth, async (req, res) => {
  const { name, cat, value, date, duration, residual } = req.body
  if (!name || !date) {
    return res.status(400).json({ error: 'Champs requis : name, date.' })
  }
  const { data, error } = await supabase
    .from('assets')
    .insert([{
      user_id:    req.userId,
      name,
      cat:        cat || 'autre',
      value:      Number(value || 0),
      asset_date: date,
      duration:   Number(duration || 5),
      residual:   Number(residual || 0)
    }])
    .select().single()
  if (error) return handleError(res, error, 'POST /assets')
  res.status(201).json(assetToFront(data))
})

app.put('/assets/:id', requireAuth, async (req, res) => {
  const { name, cat, value, date, duration, residual } = req.body
  const { data, error } = await supabase
    .from('assets')
    .update({
      name,
      cat:        cat || 'autre',
      value:      Number(value || 0),
      asset_date: date,
      duration:   Number(duration || 5),
      residual:   Number(residual || 0)
    })
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
    .select().single()
  if (error) return handleError(res, error, 'PUT /assets')
  if (!data)  return notFound(res, 'Immobilisation')
  res.json(assetToFront(data))
})

app.delete('/assets/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('assets')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
  if (error) return handleError(res, error, 'DELETE /assets')
  res.status(204).end()
})


// ============================================================
// EXPENSE REPORTS  — description/er_date → desc/date en frontend
// ============================================================

function erToFront(row) {
  if (!row) return null
  return { ...row, desc: row.description, date: row.er_date }
}

app.get('/expense-reports', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('expense_reports')
    .select('*')
    .eq('user_id', req.userId)
    .order('er_date', { ascending: false })
  if (error) return handleError(res, error, 'GET /expense-reports')
  res.json((data || []).map(erToFront))
})

app.post('/expense-reports', requireAuth, async (req, res) => {
  const { desc, cat, amount, date, status, paid_by, notes } = req.body
  if (!desc || !date) {
    return res.status(400).json({ error: 'Champs requis : desc, date.' })
  }
  const { data, error } = await supabase
    .from('expense_reports')
    .insert([{
      user_id:     req.userId,
      description: desc,
      cat:         cat || 'autre',
      amount:      Number(amount || 0),
      er_date:     date,
      status:      status  || 'pending',
      paid_by:     paid_by || 'employee',
      notes:       notes   || null
    }])
    .select().single()
  if (error) return handleError(res, error, 'POST /expense-reports')
  res.status(201).json(erToFront(data))
})

app.put('/expense-reports/:id', requireAuth, async (req, res) => {
  const { desc, cat, amount, date, status, paid_by, notes } = req.body
  const { data, error } = await supabase
    .from('expense_reports')
    .update({
      description: desc,
      cat:         cat || 'autre',
      amount:      Number(amount || 0),
      er_date:     date,
      status:      status  || 'pending',
      paid_by:     paid_by || 'employee',
      notes:       notes   || null
    })
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
    .select().single()
  if (error) return handleError(res, error, 'PUT /expense-reports')
  if (!data)  return notFound(res, 'Note de frais')
  res.json(erToFront(data))
})

app.delete('/expense-reports/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('expense_reports')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
  if (error) return handleError(res, error, 'DELETE /expense-reports')
  res.status(204).end()
})


// ── 404 ─────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} introuvable.` })
})

// ── START ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  ClearBooks API v2.1 démarrée sur le port ${PORT}`)
})
