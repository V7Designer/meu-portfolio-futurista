const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

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

const db = new Database(dbPath);

// Criar tabelas
db.exec(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL,
    telefone TEXT,
    mensagem TEXT NOT NULL,
    status TEXT DEFAULT 'pendente',
    data DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
)`);

// Tabela de promoções
db.exec(`CREATE TABLE IF NOT EXISTS promocoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    descricao TEXT,
    preco_original TEXT,
    preco_promocional TEXT,
    bonus TEXT,
    data_validade DATETIME,
    ativo INTEGER DEFAULT 1,
    cor_destaque TEXT DEFAULT '#ff3366',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Inserir admin padrão
const admin = db.prepare("SELECT COUNT(*) as count FROM admin WHERE username = 'admin'").get();
if (admin.count === 0) {
    const hashedPassword = bcrypt.hashSync('Vini@Futuro2026#Secure', 10);
    db.prepare("INSERT INTO admin (username, password) VALUES (?, ?)").run('admin', hashedPassword);
    console.log('✅ Admin criado: admin / Vini@Futuro2026#Secure');
}

// Inserir promoção de exemplo
const promocao = db.prepare("SELECT COUNT(*) as count FROM promocoes").get();
if (promocao.count === 0) {
    const validade = new Date();
    validade.setDate(validade.getDate() + 2); // 2 dias de validade
    db.prepare(`INSERT INTO promocoes (titulo, descricao, preco_original, preco_promocional, bonus, data_validade, ativo) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        '🔥 PROMOÇÃO RELÂMPAGO 🔥',
        'Aproveite o desconto especial para os primeiros clientes!',
        'R$ 800',
        'R$ 450',
        '+ 1 mês de suporte gratuito',
        validade.toISOString(),
        1
    );
    console.log('✅ Promoção exemplo criada!');
}

// ========== ROTAS PÚBLICAS ==========
app.get('/api/promocao/ativa', (req, res) => {
    const agora = new Date().toISOString();
    const promocao = db.prepare(`SELECT * FROM promocoes 
        WHERE ativo = 1 AND data_validade > ? 
        ORDER BY created_at DESC LIMIT 1`).get(agora);
    res.json(promocao || null);
});

app.post('/api/contato', (req, res) => {
    const { nome, email, telefone, mensagem } = req.body;
    if (!nome || !email || !mensagem) {
        return res.status(400).json({ error: 'Campos obrigatórios' });
    }
    try {
        const stmt = db.prepare("INSERT INTO leads (nome, email, telefone, mensagem, status) VALUES (?, ?, ?, ?, 'pendente')");
        const result = stmt.run(nome, email, telefone || null, mensagem);
        res.json({ id: result.lastInsertRowid, message: 'Mensagem enviada com sucesso!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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

// ========== ROTAS ADMIN ==========
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
    const user = db.prepare("SELECT * FROM admin WHERE username = ?").get(username);
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '24h' });
    res.json({ token });
});

// CRUD de Promoções
app.get('/api/admin/promocoes', verifyToken, (req, res) => {
    const promocoes = db.prepare("SELECT * FROM promocoes ORDER BY created_at DESC").all();
    res.json(promocoes);
});

app.post('/api/admin/promocoes', verifyToken, (req, res) => {
    const { titulo, descricao, preco_original, preco_promocional, bonus, data_validade, cor_destaque } = req.body;
    try {
        const stmt = db.prepare(`INSERT INTO promocoes 
            (titulo, descricao, preco_original, preco_promocional, bonus, data_validade, cor_destaque, ativo) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)`);
        const result = stmt.run(titulo, descricao, preco_original, preco_promocional, bonus, data_validade, cor_destaque || '#ff3366');
        res.json({ id: result.lastInsertRowid, message: 'Promoção criada com sucesso!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/promocoes/:id', verifyToken, (req, res) => {
    const { ativo } = req.body;
    db.prepare("UPDATE promocoes SET ativo = ? WHERE id = ?").run(ativo, req.params.id);
    res.json({ message: 'Status da promoção atualizado!' });
});

app.delete('/api/admin/promocoes/:id', verifyToken, (req, res) => {
    db.prepare("DELETE FROM promocoes WHERE id = ?").run(req.params.id);
    res.json({ message: 'Promoção excluída!' });
});

app.get('/api/admin/leads', verifyToken, (req, res) => {
    const leads = db.prepare("SELECT * FROM leads ORDER BY data DESC").all();
    res.json(leads);
});

app.delete('/api/admin/leads/:id', verifyToken, (req, res) => {
    const result = db.prepare("DELETE FROM leads WHERE id = ?").run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Lead não encontrado' });
    res.json({ message: 'Lead excluído com sucesso' });
});

app.put('/api/admin/leads/:id/finalizar', verifyToken, (req, res) => {
    const result = db.prepare("UPDATE leads SET status = 'finalizado' WHERE id = ?").run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Lead não encontrado' });
    res.json({ message: 'Lead finalizado com sucesso' });
});

app.get('/api/admin/stats', verifyToken, (req, res) => {
    const totalLeads = db.prepare("SELECT COUNT(*) as total FROM leads").get();
    const pendentes = db.prepare("SELECT COUNT(*) as total FROM leads WHERE status = 'pendente'").get();
    const finalizados = db.prepare("SELECT COUNT(*) as total FROM leads WHERE status = 'finalizado'").get();
    res.json({
        totalLeads: totalLeads.total,
        pendentes: pendentes.total,
        finalizados: finalizados.total,
        projetosTotal: 5
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Portfólio futurista rodando na porta ${PORT}`);
    console.log(`📱 Acesse: http://localhost:${PORT}`);
    console.log(`🔐 Admin: http://localhost:${PORT}/admin.html`);
});