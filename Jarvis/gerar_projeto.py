import os

def create_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"✅ Criado: {path}")

# ==========================================
# 1. BACKEND
# ==========================================
create_file('backend/.env', '''DATABASE_URL="postgresql://postgres:senha@localhost:5432/jarvis_leads"
GOOGLE_MAPS_API_KEY="SUA_CHAVE_API_AQUI"
PORT=3001
''')

create_file('backend/package.json', '''{
  "name": "jarvis-backend",
  "version": "1.0.0",
  "main": "src/server.js",
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js",
    "db:push": "prisma db push",
    "db:seed": "node src/seed.js"
  },
  "dependencies": {
    "@prisma/client": "^5.10.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.18.3",
    "node-fetch": "^3.3.2"
  },
  "devDependencies": {
    "nodemon": "^3.1.0",
    "prisma": "^5.10.0"
  }
}
''')

create_file('backend/prisma/schema.prisma', '''generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Category {
  id            String        @id @default(uuid())
  name          String        @unique
  subcategories Subcategory[]
  createdAt     DateTime      @default(now())
}

model Subcategory {
  id          String   @id @default(uuid())
  name        String
  categoryId  String
  category    Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  searchTerms String
  createdAt   DateTime @default(now())
}

model Lead {
  id              String   @id @default(uuid())
  placeId         String   @unique
  name            String
  phone           String?
  email           String?
  website         String?
  address         String?
  city            String?
  state           String?
  country         String   @default("Brasil")
  rating          Float?
  reviewCount     Int?
  category        String?
  mapsUrl         String?
  priority        String   @default("BAIXA")
  source          String   @default("Google Maps")
  sourceUrl       String?
  verificationUrl String?
  searchDate      DateTime @default(now())
  observations    String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model SearchHistory {
  id           String   @id @default(uuid())
  query        String
  location     String
  radius       Int
  categories   String
  resultsCount Int
  date         DateTime @default(now())
}
''')

create_file('backend/src/server.js', '''const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const app = express();
const prisma = new PrismaClient();
app.use(cors());
app.use(express.json());

const FIELD_MASK = 'places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.types,places.id,places.location,places.googleMapsUri';

function calcPriority(phone, website) {
  if (phone && !website) return 'ALTA';
  if (phone && website) return 'MEDIA';
  return 'BAIXA';
}

app.post('/api/search', async (req, res) => {
  try {
    const { query, location, radius, hasPhone, noWebsite, minRating } = req.body;
    const url = 'https://places.googleapis.com/v1/places:searchText';
    const requestBody = {
      textQuery: `${query} em ${location}`,
      languageCode: 'pt-BR',
      regionCode: 'BR'
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': FIELD_MASK
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    let places = data.places || [];

    // Filtros locais
    if (hasPhone) places = places.filter(p => p.internationalPhoneNumber);
    if (noWebsite) places = places.filter(p => !p.websiteUri);
    if (minRating) places = places.filter(p => (p.rating || 0) >= minRating);

    const leadsToSave = [];
    for (const place of places) {
      const priority = calcPriority(place.internationalPhoneNumber, place.websiteUri);
      leadsToSave.push({
        placeId: place.id,
        name: place.displayName?.text || 'Sem nome',
        phone: place.internationalPhoneNumber,
        website: place.websiteUri,
        address: place.formattedAddress,
        rating: place.rating,
        reviewCount: place.userRatingCount,
        category: place.types?.[0],
        mapsUrl: place.googleMapsUri,
        priority,
        country: 'Brasil'
      });
    }

    // Upsert para evitar duplicatas e preservar observações
    const savedLeads = [];
    for (const lead of leadsToSave) {
      const saved = await prisma.lead.upsert({
        where: { placeId: lead.placeId },
        update: { ...lead, updatedAt: new Date() },
        create: lead
      });
      savedLeads.push(saved);
    }

    await prisma.searchHistory.create({
      data: { query, location, radius, categories: query, resultsCount: savedLeads.length }
    });

    res.json({ success: true, count: savedLeads.length, leads: savedLeads });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro na busca', details: error.message });
  }
});

app.get('/api/leads', async (req, res) => {
  const { page = 1, limit = 20, priority, city, search } = req.query;
  const skip = (page - 1) * limit;
  const where = {};
  if (priority) where.priority = priority;
  if (city) where.city = { contains: city, mode: 'insensitive' };
  if (search) where.OR = [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }];

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({ where, skip, take: Number(limit), orderBy: { createdAt: 'desc' } }),
    prisma.lead.count({ where })
  ]);
  res.json({ leads, total, pages: Math.ceil(total / limit) });
});

app.put('/api/leads/:id', async (req, res) => {
  const { observations, priority } = req.body;
  const lead = await prisma.lead.update({ where: { id: req.params.id }, data: { observations, priority } });
  res.json(lead);
});

app.delete('/api/leads/:id', async (req, res) => {
  await prisma.lead.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

app.get('/api/categories', async (req, res) => {
  const categories = await prisma.category.findMany({ include: { subcategories: true } });
  res.json(categories);
});

app.get('/api/dashboard', async (req, res) => {
  const total = await prisma.lead.count();
  const alta = await prisma.lead.count({ where: { priority: 'ALTA' } });
  const media = await prisma.lead.count({ where: { priority: 'MEDIA' } });
  const baixa = await prisma.lead.count({ where: { priority: 'BAIXA' } });
  const comTelefone = await prisma.lead.count({ where: { phone: { not: null } } });
  const semSite = await prisma.lead.count({ where: { website: null } });
  res.json({ total, alta, media, baixa, comTelefone, semSite });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Servidor J.A.R.V.I.S. rodando na porta ${PORT}`));
''')

create_file('backend/src/seed.js', '''const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const initialCategories = [
  { name: 'Faz-tudo', subs: ['Marido de aluguel', 'Pequenos reparos', 'Serviços residenciais'] },
  { name: 'Limpeza', subs: ['Diaristas', 'Limpeza residencial', 'Limpeza comercial', 'Limpeza pós-obra', 'Higienizadores de estofados'] },
  { name: 'Instalações e Reparos', subs: ['Eletricistas', 'Encanadores', 'Instaladores de ar-condicionado', 'Desentupidoras'] },
  { name: 'Montagem e Transporte', subs: ['Montadores de móveis', 'Frete e carreto', 'Mudanças'] },
  { name: 'Jardinagem', subs: ['Jardineiros', 'Paisagistas', 'Podadores'] },
  { name: 'Beleza e Estética', subs: ['Cabeleireiros', 'Barbeiros', 'Maquiadoras', 'Manicures', 'Esteticistas'] },
  { name: 'Alimentação', subs: ['Confeitarias', 'Bolos personalizados', 'Salgadeiras', 'Marmitarias', 'Buffets'] }
];

async function main() {
  for (const cat of initialCategories) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: {},
      create: {
        name: cat.name,
        subcategories: { create: cat.subs.map(s => ({ name: s, searchTerms: s })) }
      }
    });
  }
  console.log('✅ Categorias semeadas com sucesso!');
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
''')

# ==========================================
# 2. FRONTEND
# ==========================================
create_file('frontend/package.json', '''{
  "name": "jarvis-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.3",
    "lucide-react": "^0.344.0",
    "axios": "^1.6.7",
    "xlsx": "^0.18.5",
    "jspdf": "^2.5.1",
    "jspdf-autotable": "^3.8.2"
  },
  "devDependencies": {
    "@types/react": "^18.2.56",
    "@types/react-dom": "^18.2.19",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.18",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "vite": "^5.1.4"
  }
}
''')

create_file('frontend/tailwind.config.js', '''export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        jarvis: {
          bg: '#0a192f',
          card: 'rgba(17, 34, 64, 0.75)',
          cyan: '#64ffda',
          blue: '#007bff',
          text: '#ccd6f6',
          muted: '#8892b0'
        }
      },
      fontFamily: {
        mono: ['"Fira Code"', 'monospace'],
      }
    },
  },
  plugins: [],
}
''')

create_file('frontend/postcss.config.js', '''export default { plugins: { tailwindcss: {}, autoprefixer: {} } }''')

create_file('frontend/vite.config.js', '''import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react()] })''')

create_file('frontend/index.html', '''<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>J.A.R.V.I.S. | Busca Leads</title>
    <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;600&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  </head>
  <body class="bg-jarvis-bg text-jarvis-text font-sans antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
''')

create_file('frontend/src/index.css', '''@tailwind base;
@tailwind components;
@tailwind utilities;

body { background-color: #0a192f; color: #ccd6f6; }
.glass {
  background: rgba(17, 34, 64, 0.75);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(100, 255, 218, 0.1);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
}
.glow-text { text-shadow: 0 0 10px rgba(100, 255, 218, 0.5); }
.btn-primary {
  @apply bg-jarvis-cyan/10 text-jarvis-cyan border border-jarvis-cyan/50 px-4 py-2 rounded hover:bg-jarvis-cyan/20 transition-all duration-300 font-mono;
}
.input-jarvis {
  @apply bg-slate-800/50 border border-slate-600 rounded px-3 py-2 text-jarvis-text focus:border-jarvis-cyan focus:outline-none focus:ring-1 focus:ring-jarvis-cyan transition-all;
}
''')

create_file('frontend/src/main.jsx', '''import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
''')

create_file('frontend/src/App.jsx', '''import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Search, List, FolderTree, History, Settings, Menu, X } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import SearchLeads from './pages/SearchLeads';
import LeadsTable from './pages/LeadsTable';

function Sidebar({ isOpen, toggle }) {
  const location = useLocation();
  const links = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/search', icon: Search, label: 'Buscar Leads' },
    { to: '/leads', icon: List, label: 'Todos os Leads' },
    { to: '/categories', icon: FolderTree, label: 'Categorias' },
    { to: '/history', icon: History, label: 'Histórico' },
    { to: '/settings', icon: Settings, label: 'Configurações' },
  ];

  return (
    <div className={`fixed inset-y-0 left-0 z-50 w-64 glass transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}>
      <div className="flex items-center justify-between p-6 border-b border-jarvis-cyan/20">
        <h1 className="text-2xl font-mono font-bold text-jarvis-cyan glow-text">J.A.R.V.I.S.</h1>
        <button onClick={toggle} className="md:hidden text-jarvis-cyan"><X /></button>
      </div>
      <nav className="mt-6 px-4 space-y-2">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = location.pathname === link.to;
          return (
            <Link key={link.to} to={link.to} className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${isActive ? 'bg-jarvis-cyan/10 text-jarvis-cyan border border-jarvis-cyan/30' : 'text-jarvis-muted hover:text-jarvis-text hover:bg-slate-800'}`}>
              <Icon size={20} />
              <span className="font-medium">{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <Router>
      <div className="flex h-screen overflow-hidden">
        <Sidebar isOpen={sidebarOpen} toggle={() => setSidebarOpen(!sidebarOpen)} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="glass md:hidden flex items-center justify-between p-4">
            <button onClick={() => setSidebarOpen(true)} className="text-jarvis-cyan"><Menu /></button>
            <span className="font-mono font-bold text-jarvis-cyan">J.A.R.V.I.S.</span>
          </header>
          <main className="flex-1 overflow-y-auto p-6 bg-gradient-to-br from-jarvis-bg to-slate-900">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/search" element={<SearchLeads />} />
              <Route path="/leads" element={<LeadsTable />} />
              <Route path="/categories" element={<div className="text-jarvis-muted">Módulo de Categorias (Em desenvolvimento)</div>} />
              <Route path="/history" element={<div className="text-jarvis-muted">Módulo de Histórico (Em desenvolvimento)</div>} />
              <Route path="/settings" element={<div className="text-jarvis-muted">Módulo de Configurações (Em desenvolvimento)</div>} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}
''')

create_file('frontend/src/pages/Dashboard.jsx', '''import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Users, Phone, Globe, AlertTriangle } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    axios.get('http://localhost:3001/api/dashboard').then(res => setStats(res.data));
  }, []);

  if (!stats) return <div className="text-jarvis-cyan font-mono animate-pulse">Inicializando sistemas J.A.R.V.I.S...</div>;

  const cards = [
    { title: 'Total de Leads', value: stats.total, icon: Users, color: 'text-jarvis-cyan' },
    { title: 'Alta Prioridade', value: stats.alta, icon: AlertTriangle, color: 'text-red-400' },
    { title: 'Com Telefone', value: stats.comTelefone, icon: Phone, color: 'text-green-400' },
    { title: 'Sem Site', value: stats.semSite, icon: Globe, color: 'text-yellow-400' },
  ];

  return (
    <div>
      <h2 className="text-3xl font-mono font-bold text-jarvis-cyan mb-6 glow-text">Dashboard de Prospecção</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i} className="glass p-6 rounded-xl border-l-4 border-jarvis-cyan/50 hover:border-jarvis-cyan transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-jarvis-muted text-sm font-mono">{card.title}</p>
                  <p className={`text-3xl font-bold mt-2 ${card.color}`}>{card.value}</p>
                </div>
                <Icon className={`${card.color} opacity-80`} size={32} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
''')

create_file('frontend/src/pages/SearchLeads.jsx', '''import React, { useState } from 'react';
import axios from 'axios';

export default function SearchLeads() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [form, setForm] = useState({ query: '', location: 'São Paulo, SP', radius: 5, hasPhone: true, noWebsite: true, minRating: 4 });

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post('http://localhost:3001/api/search', form);
      setResult(res.data);
    } catch (err) {
      alert('Erro na busca: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-mono font-bold text-jarvis-cyan mb-6 glow-text">Buscar Leads</h2>
      <form onSubmit={handleSearch} className="glass p-6 rounded-xl space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-jarvis-muted text-sm font-mono mb-1">Termo de Busca / Categoria</label>
            <input className="input-jarvis w-full" value={form.query} onChange={e => setForm({...form, query: e.target.value})} placeholder="Ex: Eletricista, Confeitaria" required />
          </div>
          <div>
            <label className="block text-jarvis-muted text-sm font-mono mb-1">Localização</label>
            <input className="input-jarvis w-full" value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="Cidade, Estado" required />
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-jarvis-muted text-sm font-mono mb-1">Raio (km)</label>
            <input type="number" className="input-jarvis w-full" value={form.radius} onChange={e => setForm({...form, radius: e.target.value})} />
          </div>
          <div>
            <label className="block text-jarvis-muted text-sm font-mono mb-1">Avaliação Mín.</label>
            <input type="number" step="0.1" className="input-jarvis w-full" value={form.minRating} onChange={e => setForm({...form, minRating: e.target.value})} />
          </div>
        </div>

        <div className="flex flex-wrap gap-4 pt-2">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input type="checkbox" checked={form.hasPhone} onChange={e => setForm({...form, hasPhone: e.target.checked})} className="accent-jarvis-cyan" />
            <span className="text-jarvis-text">Com telefone</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input type="checkbox" checked={form.noWebsite} onChange={e => setForm({...form, noWebsite: e.target.checked})} className="accent-jarvis-cyan" />
            <span className="text-jarvis-text">Sem site (Alta Prioridade)</span>
          </label>
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full mt-4 flex items-center justify-center space-x-2">
          {loading ? <span className="animate-pulse">Processando dados...</span> : <span>Iniciar Varredura</span>}
        </button>
      </form>

      {result && (
        <div className="mt-6 glass p-6 rounded-xl border border-jarvis-cyan/30">
          <h3 className="text-xl font-mono text-jarvis-cyan mb-4">Resultado da Varredura</h3>
          <p className="text-jarvis-text mb-4">Encontrados e processados: <span className="font-bold text-jarvis-cyan">{result.count}</span> leads.</p>
          <a href="/leads" className="btn-primary inline-block">Ver na Tabela de Leads</a>
        </div>
      )}
    </div>
  );
}
''')

create_file('frontend/src/pages/LeadsTable.jsx', '''import React, { useEffect, useState } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function LeadsTable() {
  const [leads, setLeads] = useState([]);
  const [filter, setFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  const fetchLeads = async () => {
    const res = await axios.get(`http://localhost:3001/api/leads?search=${filter}&priority=${priorityFilter}`);
    setLeads(res.data.leads);
  };

  useEffect(() => { fetchLeads(); }, [filter, priorityFilter]);

  const exportCSV = () => {
    const ws = XLSX.utils.json_to_sheet(leads);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    XLSX.writeFile(wb, "jarvis_leads.xlsx");
  };

  const exportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.text("Relatório de Leads - J.A.R.V.I.S.", 14, 15);
    doc.autoTable({
      head: [['Nome', 'Telefone', 'Cidade', 'Prioridade', 'Site']],
      body: leads.map(l => [l.name, l.phone || '-', l.city || '-', l.priority, l.website || '-']),
      startY: 20,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [10, 25, 47], textColor: [100, 255, 218] }
    });
    doc.save('jarvis_leads.pdf');
  };

  const getPriorityColor = (p) => {
    if (p === 'ALTA') return 'bg-red-500/20 text-red-400 border-red-500/50';
    if (p === 'MEDIA') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
    return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h2 className="text-3xl font-mono font-bold text-jarvis-cyan glow-text">Base de Leads</h2>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="btn-primary text-sm">Exportar Excel</button>
          <button onClick={exportPDF} className="btn-primary text-sm">Exportar PDF</button>
        </div>
      </div>

      <div className="glass p-4 rounded-xl mb-6 flex flex-wrap gap-4">
        <input className="input-jarvis flex-1 min-w-[200px]" placeholder="Buscar por nome ou telefone..." value={filter} onChange={e => setFilter(e.target.value)} />
        <select className="input-jarvis" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
          <option value="">Todas as Prioridades</option>
          <option value="ALTA">ALTA</option>
          <option value="MEDIA">MÉDIA</option>
          <option value="BAIXA">BAIXA</option>
        </select>
      </div>

      <div className="glass rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-800/80 text-jarvis-cyan font-mono text-sm">
            <tr>
              <th className="p-4 border-b border-slate-700">Nome</th>
              <th className="p-4 border-b border-slate-700">Telefone</th>
              <th className="p-4 border-b border-slate-700">Cidade/UF</th>
              <th className="p-4 border-b border-slate-700">Avaliação</th>
              <th className="p-4 border-b border-slate-700">Prioridade</th>
              <th className="p-4 border-b border-slate-700">Site</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-slate-700/50">
            {leads.map(lead => (
              <tr key={lead.id} className="hover:bg-slate-800/50 transition-colors">
                <td className="p-4 font-medium text-jarvis-text">{lead.name}</td>
                <td className="p-4 text-jarvis-muted font-mono">{lead.phone || '-'}</td>
                <td className="p-4 text-jarvis-muted">{lead.city} / {lead.state}</td>
                <td className="p-4 text-jarvis-muted">{lead.rating ? `${lead.rating} ⭐ (${lead.reviewCount})` : '-'}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded border text-xs font-bold ${getPriorityColor(lead.priority)}`}>{lead.priority}</span>
                </td>
                <td className="p-4">
                  {lead.website ? <a href={lead.website} target="_blank" className="text-jarvis-cyan hover:underline">Link</a> : <span className="text-red-400/70">Sem site</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {leads.length === 0 && <div className="p-8 text-center text-jarvis-muted">Nenhum lead encontrado.</div>}
      </div>
    </div>
  );
}
''')

print("\\n" + "="*50)
print("🎉 PROJETO J.A.R.V.I.S. GERADO COM SUCESSO!")
print("="*50)
print("Siga as instruções abaixo para configurar e executar.")
