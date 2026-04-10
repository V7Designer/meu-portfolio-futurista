const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'portfolio_vini_super_secret_2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Banco de dados
const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const dbPath = path.join(dbDir, 'portfolio.db');
console.log('📁 Banco de dados:', dbPath);
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Tabela de leads com campo STATUS
  db.run(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL,
    telefone TEXT,
    mensagem TEXT NOT NULL,
    status TEXT DEFAULT 'pendente',
    data DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  )`);

  setTimeout(() => {
    db.get("SELECT COUNT(*) as count FROM admin WHERE username = 'admin'", (err, row) => {
      if (err) console.error(err);
      else if (row.count === 0) {
        const hashedPassword = bcrypt.hashSync('Vini@Futuro2026#Secure', 10);
        db.run("INSERT INTO admin (username, password) VALUES (?, ?)", ['admin', hashedPassword]);
        console.log('✅ Admin: admin / Vini@Futuro2026#Secure');
      }
    });
  }, 100);
});

// ROTAS PÚBLICAS
app.post('/api/contato', (req, res) => {
  const { nome, email, telefone, mensagem } = req.body;
  if (!nome || !email || !mensagem) return res.status(400).json({ error: 'Campos obrigatórios' });
  db.run("INSERT INTO leads (nome, email, telefone, mensagem, status) VALUES (?, ?, ?, ?, 'pendente')",
    [nome, email, telefone || null, mensagem],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, message: 'Mensagem enviada!' });
    }
  );
});

app.get('/api/projetos', (req, res) => {
  const projetos = [
    { id: 1, nome: "O Barretão", descricao: "Churrascaria com sistema de delivery e fidelidade", link: "https://barretao-restaurante.onrender.com", imagem: "https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=300" },
    { id: 2, nome: "Ancoreta", descricao: "Restaurante com frutos do mar e vista privilegiada", link: "https://ancora-restaurante.onrender.com", imagem: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=300" },
    { id: 3, nome: "Tiowei", descricao: "Comida japonesa com sistema de reservas", link: "https://tiowei-restaurante.onrender.com", imagem: "https://images.unsplash.com/photo-1617196035154-1e7e6e28b0db?w=300" },
    { id: 4, nome: "Leone", descricao: "Culinária italiana com cardápio digital", link: "https://leone-restaurante.onrender.com", imagem: "https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=300" },
    { id: 5, nome: "D'Melo Bolos", descricao: "Confeitaria artesanal com pedidos online", link: "https://dmelo-bolos.onrender.com", imagem: "https://images.unsplash.com/photo-1586985289688-ca3cf47d3e6e?w=300" }
  ];
  res.json(projetos);
});

// ROTAS ADMIN
function verifyToken(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(403).json({ error: 'Token não fornecido' });
  jwt.verify(token.split(' ')[1], SECRET_KEY, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = decoded;
    next();
  });
}

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM admin WHERE username = ?", [username], (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    if (bcrypt.compareSync(password, user.password)) {
      const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '24h' });
      res.json({ token });
    } else res.status(401).json({ error: 'Usuário ou senha inválidos' });
  });
});

app.get('/api/admin/leads', verifyToken, (req, res) => {
  db.all("SELECT * FROM leads ORDER BY data DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// DELETE - Excluir lead permanentemente
app.delete('/api/admin/leads/:id', verifyToken, (req, res) => {
  db.run("DELETE FROM leads WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Lead excluído com sucesso' });
  });
});

// PUT - Finalizar lead (marcar como finalizado)
app.put('/api/admin/leads/:id/finalizar', verifyToken, (req, res) => {
  db.run("UPDATE leads SET status = 'finalizado' WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Lead finalizado com sucesso' });
  });
});

app.get('/api/admin/stats', verifyToken, (req, res) => {
  db.get("SELECT COUNT(*) as totalLeads FROM leads", (err, rowTotal) => {
    db.get("SELECT COUNT(*) as pendentes FROM leads WHERE status = 'pendente'", (err, rowPend) => {
      db.get("SELECT COUNT(*) as finalizados FROM leads WHERE status = 'finalizado'", (err, rowFin) => {
        res.json({ 
          totalLeads: rowTotal?.totalLeads || 0, 
          pendentes: rowPend?.pendentes || 0,
          finalizados: rowFin?.finalizados || 0,
          projetosTotal: 5 
        });
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Portfólio futurista rodando na porta ${PORT}`);
  console.log(`📱 Acesse: http://localhost:${PORT}`);
  console.log(`🔐 Admin: http://localhost:${PORT}/admin.html`);
});