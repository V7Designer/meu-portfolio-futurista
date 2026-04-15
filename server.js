const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'portfolio_vini_super_secret_2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Conexão com PostgreSQL (usando a variável do Render)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Criar tabelas e inserir dados iniciais
async function initDatabase() {
    try {
        // Tabela de leads
        await pool.query(`
            CREATE TABLE IF NOT EXISTS leads (
                id SERIAL PRIMARY KEY,
                nome TEXT NOT NULL,
                email TEXT NOT NULL,
                telefone TEXT,
                mensagem TEXT NOT NULL,
                status TEXT DEFAULT 'pendente',
                data TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de admin
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admin (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            )
        `);

        // Tabela de promoções
        await pool.query(`
            CREATE TABLE IF NOT EXISTS promocoes (
                id SERIAL PRIMARY KEY,
                titulo TEXT NOT NULL,
                descricao TEXT,
                preco_original TEXT,
                preco_promocional TEXT,
                bonus TEXT,
                data_validade TIMESTAMP,
                ativo INTEGER DEFAULT 1,
                cor_destaque TEXT DEFAULT '#ff3366',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de projetos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS projetos (
                id SERIAL PRIMARY KEY,
                nome TEXT NOT NULL,
                descricao TEXT NOT NULL,
                link TEXT,
                imagem TEXT,
                categoria TEXT DEFAULT 'restaurante',
                destaque INTEGER DEFAULT 0,
                ordem INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Inserir admin padrão se não existir
        const admin = await pool.query("SELECT * FROM admin WHERE username = 'admin'");
        if (admin.rows.length === 0) {
            const hashedPassword = bcrypt.hashSync('Vini@Futuro2026#Secure', 10);
            await pool.query("INSERT INTO admin (username, password) VALUES ($1, $2)", ['admin', hashedPassword]);
            console.log('✅ Admin criado');
        }

        // Inserir projetos padrão se não existirem
        const projetos = await pool.query("SELECT * FROM projetos");
        if (projetos.rows.length === 0) {
            const projetosList = [
                ['O Barretão', 'Churrascaria com sistema de delivery e fidelidade', 'https://barretao-restaurante.onrender.com', 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=300', 1, 1],
                ['Ancoreta', 'Restaurante com frutos do mar e vista privilegiada', 'https://ancora-restaurante.onrender.com', 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=300', 1, 2],
                ['Tiowei', 'Comida japonesa com sistema de reservas', 'https://tiowei-restaurante.onrender.com', 'https://images.unsplash.com/photo-1617196035154-1e7e6e28b0db?w=300', 0, 3],
                ['Leone', 'Culinária italiana com cardápio digital', 'https://leone-restaurante.onrender.com', 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=300', 0, 4],
                ['D\'Melo Bolos', 'Confeitaria artesanal com pedidos online', 'https://dmelo-bolos.onrender.com', 'https://images.unsplash.com/photo-1586985289688-ca3cf47d3e6e?w=300', 0, 5]
            ];
            for (const p of projetosList) {
                await pool.query(`INSERT INTO projetos (nome, descricao, link, imagem, destaque, ordem) VALUES ($1, $2, $3, $4, $5, $6)`, p);
            }
            console.log('✅ Projetos padrão inseridos');
        }


        console.log('📁 Banco PostgreSQL conectado com sucesso!');
    } catch (err) {
        console.error('Erro ao inicializar banco:', err);
    }
}

initDatabase();

// ========== ROTAS PÚBLICAS ==========
app.get('/api/promocao/ativa', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM promocoes WHERE ativo = 1 AND data_validade > NOW() ORDER BY created_at DESC LIMIT 1`);
        res.json(result.rows[0] || null);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.post('/api/contato', async (req, res) => {
    const { nome, email, telefone, mensagem } = req.body;
    if (!nome || !email || !mensagem) {
        return res.status(400).json({ error: 'Campos obrigatórios' });
    }
    try {
        const result = await pool.query(
            `INSERT INTO leads (nome, email, telefone, mensagem, status) VALUES ($1, $2, $3, $4, 'pendente') RETURNING id`,
            [nome, email, telefone || null, mensagem]
        );
        res.json({ id: result.rows[0].id, message: 'Mensagem enviada!' });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.get('/api/projetos', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM projetos ORDER BY destaque DESC, ordem ASC, id DESC`);
        res.json(result.rows);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
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

app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await pool.query("SELECT * FROM admin WHERE username = $1", [username]);
        if (user.rows.length === 0 || !bcrypt.compareSync(password, user.rows[0].password)) {
            return res.status(401).json({ error: 'Usuário ou senha inválidos' });
        }
        const token = jwt.sign({ id: user.rows[0].id, username: user.rows[0].username }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ token });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// CRUD Projetos
app.get('/api/admin/projetos', verifyToken, async (req, res) => {
    try { 
        const result = await pool.query("SELECT * FROM projetos ORDER BY ordem ASC, id DESC"); 
        res.json(result.rows); 
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.post('/api/admin/projetos', verifyToken, async (req, res) => {
    const { nome, descricao, link, imagem, categoria, destaque } = req.body;
    if (!nome || !descricao) {
        return res.status(400).json({ error: 'Nome e descrição são obrigatórios' });
    }
    try {
        const result = await pool.query(
            `INSERT INTO projetos (nome, descricao, link, imagem, categoria, destaque) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [nome, descricao, link || null, imagem || null, categoria || 'restaurante', destaque || 0]
        );
        res.json({ id: result.rows[0].id, message: 'Projeto adicionado!' });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.put('/api/admin/projetos/:id', verifyToken, async (req, res) => {
    const { nome, descricao, link, imagem, categoria, destaque } = req.body;
    try {
        await pool.query(
            `UPDATE projetos SET nome=$1, descricao=$2, link=$3, imagem=$4, categoria=$5, destaque=$6 WHERE id=$7`,
            [nome, descricao, link, imagem, categoria, destaque || 0, req.params.id]
        );
        res.json({ message: 'Projeto atualizado!' });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.delete('/api/admin/projetos/:id', verifyToken, async (req, res) => {
    try { 
        await pool.query("DELETE FROM projetos WHERE id = $1", [req.params.id]); 
        res.json({ message: 'Projeto excluído!' }); 
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// CRUD Promoções
app.get('/api/admin/promocoes', verifyToken, async (req, res) => {
    try { 
        const result = await pool.query("SELECT * FROM promocoes ORDER BY created_at DESC"); 
        res.json(result.rows); 
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.post('/api/admin/promocoes', verifyToken, async (req, res) => {
    const { titulo, descricao, preco_original, preco_promocional, bonus, data_validade, cor_destaque } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO promocoes (titulo, descricao, preco_original, preco_promocional, bonus, data_validade, cor_destaque, ativo) VALUES ($1, $2, $3, $4, $5, $6, $7, 1) RETURNING id`,
            [titulo, descricao, preco_original, preco_promocional, bonus, data_validade, cor_destaque || '#ff3366']
        );
        res.json({ id: result.rows[0].id, message: 'Promoção criada!' });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.put('/api/admin/promocoes/:id', verifyToken, async (req, res) => {
    const { ativo } = req.body;
    try { 
        await pool.query("UPDATE promocoes SET ativo = $1 WHERE id = $2", [ativo, req.params.id]); 
        res.json({ message: 'Status atualizado!' }); 
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.delete('/api/admin/promocoes/:id', verifyToken, async (req, res) => {
    try { 
        await pool.query("DELETE FROM promocoes WHERE id = $1", [req.params.id]); 
        res.json({ message: 'Promoção excluída!' }); 
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.get('/api/admin/leads', verifyToken, async (req, res) => {
    try { 
        const result = await pool.query("SELECT * FROM leads ORDER BY data DESC"); 
        res.json(result.rows); 
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.delete('/api/admin/leads/:id', verifyToken, async (req, res) => {
    try { 
        await pool.query("DELETE FROM leads WHERE id = $1", [req.params.id]); 
        res.json({ message: 'Lead excluído!' }); 
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.put('/api/admin/leads/:id/finalizar', verifyToken, async (req, res) => {
    try { 
        await pool.query("UPDATE leads SET status = 'finalizado' WHERE id = $1", [req.params.id]); 
        res.json({ message: 'Lead finalizado!' }); 
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.get('/api/admin/stats', verifyToken, async (req, res) => {
    try {
        const totalLeads = await pool.query("SELECT COUNT(*) as total FROM leads");
        const pendentes = await pool.query("SELECT COUNT(*) as total FROM leads WHERE status = 'pendente'");
        const finalizados = await pool.query("SELECT COUNT(*) as total FROM leads WHERE status = 'finalizado'");
        const totalProjetos = await pool.query("SELECT COUNT(*) as total FROM projetos");
        res.json({
            totalLeads: parseInt(totalLeads.rows[0].total),
            pendentes: parseInt(pendentes.rows[0].total),
            finalizados: parseInt(finalizados.rows[0].total),
            projetosTotal: parseInt(totalProjetos.rows[0].total)
        });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Portfólio futurista rodando na porta ${PORT}`);
    console.log(`📱 Acesse: http://localhost:${PORT}`);
    console.log(`🔐 Admin: http://localhost:${PORT}/admin.html`);
});