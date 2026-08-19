import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// This page is wired to one specific Supabase project - the same one
// Spark's desktop sync uses (see services/cloud_sync.py). The
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

  showApp()
})

logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut()
  showLogin()
})

// Supabase persists the session in localStorage by default, so a
// returning visit (including "Add to Home Screen" launches) skips
// straight past the login screen if it's still valid.
supabase.auth.getSession().then(({ data }) => {
  if (data.session) showApp()
  else showLogin()
})

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

    const title = document.createElement('span')
    title.className = 'item-text'
    title.textContent = ticket.title
    li.append(title)

    const statusSelect = document.createElement('select')
    TICKET_STATUSES.forEach((status) => {
      const opt = document.createElement('option')
      opt.value = status
      opt.textContent = status
      opt.selected = status === ticket.status
      statusSelect.appendChild(opt)
    })
    statusSelect.addEventListener('change', () => setTicketStatus(ticket.id, statusSelect.value))
    li.append(statusSelect)

    const delBtn = document.createElement('button')
    delBtn.className = 'delete-btn'
    delBtn.textContent = '✕'
    delBtn.addEventListener('click', () => deleteTicket(ticket.id))
    li.append(delBtn)

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

function loadAll() {
  loadTasks()
  loadNotes()
  loadTickets()
}
