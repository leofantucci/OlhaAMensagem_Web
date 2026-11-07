import React, { useState } from 'react';
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
