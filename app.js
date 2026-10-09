import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// This page is wired to one specific Supabase project - the same one
// Star's desktop sync uses (see services/cloud_sync.py). The
// publishable key is meant to be public (Supabase's own docs: "safe
// to use in a browser") - real access control is Row Level Security
// on the tables themselves, not secrecy of this key.
const SUPABASE_URL = 'https://razfgrczcyfiozvwkwpk.supabase.co'
const SUPABASE_KEY = 'sb_publishable_xTOIxp_1WTj3tshXD5C6ZQ_AYk6wmpO'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const loginScreen = document.getElementById('login-screen')
const appScreen = document.getElementById('app-screen')
const loginForm = document.getElementById('login-form')
const loginError = document.getElementById('login-error')
const logoutBtn = document.getElementById('logout-btn')

function nowIso() {
  return new Date().toISOString()
}

// Lets a returning visit skip the login form entirely, without ever
// putting the password in this file (which anyone with the site's
// link could read) - it only ever lives in this one phone's own
// browser storage, same as how a browser's own "remember password"
// feature works.
const CREDS_KEY = 'starPhoneCreds'

function saveCreds(email, password) {
  try {
    localStorage.setItem(CREDS_KEY, JSON.stringify({ email, password }))
  } catch (e) {
    console.error('Could not save login for next time:', e)
  }
}

function loadCreds() {
  try {
    const raw = localStorage.getItem(CREDS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

function clearCreds() {
  try {
    localStorage.removeItem(CREDS_KEY)
  } catch (e) {}
}

function showApp() {
  loginScreen.classList.add('hidden')
  appScreen.classList.remove('hidden')
  loadAll()
}

function showLogin() {
  appScreen.classList.add('hidden')
  loginScreen.classList.remove('hidden')
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  loginError.textContent = ''

  const email = document.getElementById('login-email').value
  const password = document.getElementById('login-password').value

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    loginError.textContent = error.message
    return
  }

  saveCreds(email, password)
  showApp()
})

logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut()
  clearCreds()
  showLogin()
})

// Supabase persists the session in localStorage by default, so a
// returning visit (including "Add to Home Screen" launches) skips
// straight past the login screen if that session is still valid. If
// it has expired, fall back to this device's saved email/password (if
// any was saved via a previous manual sign-in) to sign in again
// silently instead of showing the form.
async function tryAutoLogin() {
  const { data } = await supabase.auth.getSession()
  if (data.session) {
    showApp()
    return
  }

  const creds = loadCreds()
  if (!creds) {
    showLogin()
    return
  }

  const { error } = await supabase.auth.signInWithPassword(creds)
  if (error) {
    // Saved password no longer works (changed elsewhere, etc.) -
    // fall back to the manual form rather than looping forever.
    clearCreds()
    showLogin()
    return
  }

  showApp()
}

tryAutoLogin()

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'))
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'))
    btn.classList.add('active')
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active')
  })
})

function renderEmptyHint(list, text) {
  const li = document.createElement('li')
  li.className = 'empty-hint'
  li.textContent = text
  list.appendChild(li)
}

// ============================== Tasks ================================

let allTasks = []
let taskFilter = 'open'

document.querySelectorAll('#tasks-filter .filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#tasks-filter .filter-btn').forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    taskFilter = btn.dataset.filter
    renderTasks()
  })
})

async function loadTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('deleted', false)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error(error)
    return
  }

  allTasks = data
  renderTasks()
}

function renderTasks() {
  const list = document.getElementById('tasks-list')
  list.innerHTML = ''

  const tasks = allTasks.filter((task) => {
    if (taskFilter === 'open') return !task.completed
    if (taskFilter === 'closed') return task.completed
    return true
  })

  if (tasks.length === 0) {
    renderEmptyHint(list, taskFilter === 'all' ? 'No tasks yet.' : `No ${taskFilter} tasks.`)
    return
  }

  tasks.forEach((task) => {
    const li = document.createElement('li')
    li.className = 'item' + (task.completed ? ' completed' : '')

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = task.completed
    checkbox.addEventListener('change', () => toggleTaskCompleted(task.id, checkbox.checked))

    const text = document.createElement('span')
    text.className = 'item-text'
    text.textContent = task.description

    li.append(checkbox, text)

    if (task.due_time) {
      const due = document.createElement('span')
      due.className = 'item-meta'
      due.textContent = new Date(task.due_time).toLocaleString(undefined, {
        day: 'numeric', month: 'numeric', hour: 'numeric', minute: '2-digit',
      })
      li.append(due)
    }

    const delBtn = document.createElement('button')
    delBtn.className = 'delete-btn'
    delBtn.textContent = '✕'
    delBtn.addEventListener('click', () => deleteTask(task.id))
    li.append(delBtn)

    list.appendChild(li)
  })
}

async function toggleTaskCompleted(id, completed) {
  await supabase.from('tasks').update({ completed, updated_at: nowIso() }).eq('id', id)
  loadTasks()
}

async function deleteTask(id) {
  await supabase.from('tasks')
    .update({ deleted: true, deleted_at: nowIso(), updated_at: nowIso() })
    .eq('id', id)
  loadTasks()
}

document.getElementById('add-task-form').addEventListener('submit', async (e) => {
  e.preventDefault()

  const input = document.getElementById('new-task-text')
  const description = input.value.trim()
  if (!description) return

  // user_id isn't sent - the tasks table's own DEFAULT (auth.uid())
  // fills it in from this signed-in session, and RLS's "with check"
  // would reject a mismatched value anyway.
  await supabase.from('tasks').insert({
    description,
    completed: false,
    reminded: false,
    sort_order: 0,
    deleted: false,
    created_at: nowIso(),
    updated_at: nowIso(),
  })

  input.value = ''
  loadTasks()
})

// ============================== Notes =================================

const NOTE_COLOR_HEX = {
  yellow: '#FFF3B0', pink: '#FFD1DC', green: '#C9F2C7', blue: '#C7E4FF', orange: '#FFD8B0',
}

async function loadNotes() {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('deleted', false)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error(error)
    return
  }

  renderNotes(data)
}

function renderNotes(notes) {
  const list = document.getElementById('notes-list')
  list.innerHTML = ''

  if (notes.length === 0) {
    renderEmptyHint(list, 'No notes yet.')
    return
  }

  notes.forEach((note) => {
    const li = document.createElement('li')
    li.className = 'item note-item'
    li.style.borderLeftColor = NOTE_COLOR_HEX[note.color] || NOTE_COLOR_HEX.yellow

    const text = document.createElement('span')
    text.className = 'item-text'
    text.textContent = note.text || '(empty note)'
    li.append(text)

    const delBtn = document.createElement('button')
    delBtn.className = 'delete-btn'
    delBtn.textContent = '✕'
    delBtn.addEventListener('click', () => deleteNote(note.id))
    li.append(delBtn)

    list.appendChild(li)
  })
}

async function deleteNote(id) {
  await supabase.from('notes')
    .update({ deleted: true, deleted_at: nowIso(), updated_at: nowIso() })
    .eq('id', id)
  loadNotes()
}

document.getElementById('add-note-form').addEventListener('submit', async (e) => {
  e.preventDefault()

  const input = document.getElementById('new-note-text')
  const text = input.value.trim()
  if (!text) return

  await supabase.from('notes').insert({
    text,
    color: 'yellow',
    pinned: false,
    deleted: false,
    created_at: nowIso(),
    updated_at: nowIso(),
  })

  input.value = ''
  loadNotes()
})

// ============================= Tickets =================================

const TICKET_STATUSES = ['Open', 'In Progress', 'Resolved']

async function loadTickets() {
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('deleted', false)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error(error)
    return
  }

  renderTickets(data)
}

function renderTickets(tickets) {
  const list = document.getElementById('tickets-list')
  list.innerHTML = ''

  if (tickets.length === 0) {
    renderEmptyHint(list, 'No tickets yet.')
    return
  }

  tickets.forEach((ticket) => {
    const li = document.createElement('li')
    li.className = 'item ticket-item'

    const top = document.createElement('div')
    top.className = 'ticket-item-top'

    const title = document.createElement('span')
    title.className = 'item-text'
    title.textContent = ticket.title
    top.append(title)

    const statusSelect = document.createElement('select')
    TICKET_STATUSES.forEach((status) => {
      const opt = document.createElement('option')
      opt.value = status
      opt.textContent = status
      opt.selected = status === ticket.status
      statusSelect.appendChild(opt)
    })
    statusSelect.addEventListener('change', () => setTicketStatus(ticket.id, statusSelect.value))
    top.append(statusSelect)

    const delBtn = document.createElement('button')
    delBtn.className = 'delete-btn'
    delBtn.textContent = '✕'
    delBtn.addEventListener('click', () => deleteTicket(ticket.id))
    top.append(delBtn)

    li.append(top)

    if (ticket.solution) {
      const solution = document.createElement('div')
      solution.className = 'ticket-solution'
      solution.textContent = 'Solution: ' + ticket.solution
      li.append(solution)
    }

    list.appendChild(li)
  })
}

async function setTicketStatus(id, status) {
  const fields = { status, updated_at: nowIso() }
  if (status === 'Resolved') fields.resolved_at = nowIso()

  await supabase.from('tickets').update(fields).eq('id', id)
  loadTickets()
}

async function deleteTicket(id) {
  await supabase.from('tickets')
    .update({ deleted: true, deleted_at: nowIso(), updated_at: nowIso() })
    .eq('id', id)
  loadTickets()
}

document.getElementById('add-ticket-form').addEventListener('submit', async (e) => {
  e.preventDefault()

  const input = document.getElementById('new-ticket-title')
  const title = input.value.trim()
  if (!title) return

  await supabase.from('tickets').insert({
    title,
    description: '',
    status: 'Open',
    solution: '',
    aging_notified: false,
    sort_order: 0,
    deleted: false,
    created_at: nowIso(),
    updated_at: nowIso(),
  })

  input.value = ''
  loadTickets()
})

// ============================= Passwords ================================
// Same Row Level Security model as every other table here - this
// table is only reachable at all once signed in as the one owner
// account, same login as Tasks/Notes/Tickets above.

async function loadPasswords() {
  const { data, error } = await supabase
    .from('password_entries')
    .select('*')
    .eq('deleted', false)
    .order('title', { ascending: true })

  if (error) {
    console.error(error)
    return
  }

  renderPasswords(data)
}

function renderPasswords(entries) {
  const list = document.getElementById('passwords-list')
  list.innerHTML = ''

  if (entries.length === 0) {
    renderEmptyHint(list, 'No passwords yet.')
    return
  }

  entries.forEach((entry) => {
    const li = document.createElement('li')
    li.className = 'item password-item'

    const top = document.createElement('div')
    top.className = 'password-item-top'

    const title = document.createElement('span')
    title.className = 'item-text'
    title.textContent = entry.title
    top.append(title)

    if (entry.project) {
      const badge = document.createElement('span')
      badge.className = 'project-badge'
      badge.textContent = entry.project
      top.append(badge)
    }

    const delBtn = document.createElement('button')
    delBtn.className = 'delete-btn'
    delBtn.textContent = '✕'
    delBtn.addEventListener('click', () => deletePassword(entry.id))
    top.append(delBtn)

    li.append(top)

    const fields = document.createElement('div')
    fields.className = 'password-fields'

    if (entry.username) {
      fields.append(buildCopyRow('Username', entry.username))
    }

    if (entry.password) {
      fields.append(buildPasswordRow(entry.password))
    }

    if (entry.url) {
      const urlRow = document.createElement('div')
      urlRow.className = 'password-row'
      const link = document.createElement('a')
      link.href = entry.url.startsWith('http') ? entry.url : 'https://' + entry.url
      link.target = '_blank'
      link.rel = 'noopener'
      link.textContent = entry.url
      urlRow.append(link)
      fields.append(urlRow)
    }

    if (entry.notes) {
      const notesRow = document.createElement('div')
      notesRow.className = 'password-row password-notes'
      notesRow.textContent = entry.notes
      fields.append(notesRow)
    }

    li.append(fields)
    list.appendChild(li)
  })
}

function buildCopyRow(label, value) {
  const row = document.createElement('div')
  row.className = 'password-row'

  const span = document.createElement('span')
  span.className = 'password-value'
  span.textContent = `${label}: ${value}`
  row.append(span)

  const copyBtn = document.createElement('button')
  copyBtn.className = 'small-btn'
  copyBtn.textContent = 'Copy'
  copyBtn.addEventListener('click', () => copyToClipboard(value, copyBtn))
  row.append(copyBtn)

  return row
}

function buildPasswordRow(password) {
  const row = document.createElement('div')
  row.className = 'password-row'

  const span = document.createElement('span')
  span.className = 'password-value'
  span.textContent = 'Password: ' + '•'.repeat(Math.min(password.length, 12))

  let revealed = false

  const revealBtn = document.createElement('button')
  revealBtn.className = 'small-btn'
  revealBtn.textContent = 'Show'
  revealBtn.addEventListener('click', () => {
    revealed = !revealed
    span.textContent = 'Password: ' + (revealed ? password : '•'.repeat(Math.min(password.length, 12)))
    revealBtn.textContent = revealed ? 'Hide' : 'Show'
  })

  const copyBtn = document.createElement('button')
  copyBtn.className = 'small-btn'
  copyBtn.textContent = 'Copy'
  copyBtn.addEventListener('click', () => copyToClipboard(password, copyBtn))

  row.append(span, revealBtn, copyBtn)
  return row
}

async function copyToClipboard(value, button) {
  try {
    await navigator.clipboard.writeText(value)
    const original = button.textContent
    button.textContent = 'Copied'
    setTimeout(() => { button.textContent = original }, 1200)
  } catch (e) {
    console.error('Clipboard copy failed:', e)
  }
}

async function deletePassword(id) {
  await supabase.from('password_entries')
    .update({ deleted: true, deleted_at: nowIso(), updated_at: nowIso() })
    .eq('id', id)
  loadPasswords()
}

document.getElementById('add-password-form').addEventListener('submit', async (e) => {
  e.preventDefault()

  const titleInput = document.getElementById('new-password-title')
  const title = titleInput.value.trim()
  if (!title) return

  const username = document.getElementById('new-password-username').value.trim() || null
  const password = document.getElementById('new-password-password').value.trim() || null
  const url = document.getElementById('new-password-url').value.trim() || null
  const project = document.getElementById('new-password-project').value.trim() || null

  await supabase.from('password_entries').insert({
    title, username, password, url, project,
    deleted: false,
    created_at: nowIso(),
    updated_at: nowIso(),
  })

  e.target.reset()
  loadPasswords()
})

// =========================== Important Emails ===========================
// Read-only besides Unpin - no "add" form here, since the phone has no
// Outlook access to pull a real email's content from (see
// services/cloud_sync.py's pinned_emails section).

async function loadEmails() {
  const { data, error } = await supabase
    .from('pinned_emails')
    .select('*')
    .eq('deleted', false)
    .order('pinned_at', { ascending: false })

  if (error) {
    console.error(error)
    return
  }

  renderEmails(data)
}

function renderEmails(emails) {
  const list = document.getElementById('emails-list')
  list.innerHTML = ''

  if (emails.length === 0) {
    renderEmptyHint(list, 'No pinned emails yet.')
    return
  }

  emails.forEach((email) => {
    const li = document.createElement('li')
    li.className = 'item email-item'

    const top = document.createElement('div')
    top.className = 'email-item-top'

    const subject = document.createElement('span')
    subject.className = 'item-text'
    subject.textContent = email.subject || '(no subject)'
    top.append(subject)

    const delBtn = document.createElement('button')
    delBtn.className = 'delete-btn'
    delBtn.textContent = '✕'
    delBtn.title = 'Unpin'
    delBtn.addEventListener('click', () => unpinEmail(email.id))
    top.append(delBtn)

    li.append(top)

    const meta = document.createElement('div')
    meta.className = 'email-meta'
    const who = email.sender_name || email.sender_email || ''
    const when = email.received_time
      ? new Date(email.received_time).toLocaleString(undefined, { day: 'numeric', month: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
      : ''
    meta.textContent = [who, when].filter(Boolean).join(' · ')
    li.append(meta)

    if (email.body) {
      const toggle = document.createElement('button')
      toggle.className = 'small-btn email-toggle'
      toggle.textContent = 'View'

      const body = document.createElement('div')
      body.className = 'email-body hidden'
      body.textContent = email.body

      toggle.addEventListener('click', () => {
        body.classList.toggle('hidden')
        toggle.textContent = body.classList.contains('hidden') ? 'View' : 'Hide'
      })

      li.append(toggle, body)
    }

    list.appendChild(li)
  })
}

async function unpinEmail(id) {
  await supabase.from('pinned_emails')
    .update({ deleted: true, deleted_at: nowIso(), updated_at: nowIso() })
    .eq('id', id)
  loadEmails()
}

function loadAll() {
  loadTasks()
  loadNotes()
  loadTickets()
  loadPasswords()
  loadEmails()
}
