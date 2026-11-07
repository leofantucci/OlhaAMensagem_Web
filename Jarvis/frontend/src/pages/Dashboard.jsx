import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Users, Phone, Globe, AlertTriangle, Trash2 } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [clearing, setClearing] = useState(false);

  const loadStats = () => {
    axios.get('http://localhost:3001/api/dashboard').then(res => setStats(res.data));
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handleClearDatabase = async () => {
    const confirmed = window.confirm(
      'ATENÇÃO: Tem certeza que deseja limpar o banco de dados? Todos os leads e o histórico de buscas serão apagados permanentemente.'
    );
    if (!confirmed) return;

    try {
      setClearing(true);
      await axios.delete('http://localhost:3001/api/database/clear');
      loadStats();
      alert('Banco de dados limpo com sucesso!');
    } catch (err) {
      console.error('Erro ao limpar banco de dados:', err);
      alert('Erro ao tentar limpar o banco de dados.');
    } finally {
      setClearing(false);
    }
  };

  if (!stats) return <div className="text-jarvis-cyan font-mono animate-pulse">Inicializando sistemas J.A.R.V.I.S...</div>;

  const cards = [
    { title: 'Total de Leads', value: stats.total, icon: Users, color: 'text-jarvis-cyan' },
    { title: 'Alta Prioridade', value: stats.alta, icon: AlertTriangle, color: 'text-red-400' },
    { title: 'Com Telefone', value: stats.comTelefone, icon: Phone, color: 'text-green-400' },
    { title: 'Sem Site', value: stats.semSite, icon: Globe, color: 'text-yellow-400' },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h2 className="text-3xl font-mono font-bold text-jarvis-cyan glow-text">Dashboard de Prospecção</h2>
        <button
          onClick={handleClearDatabase}
          disabled={stats.total === 0 || clearing}
          className="flex items-center gap-2 bg-red-500/10 text-red-400 border border-red-500/50 px-4 py-2 rounded hover:bg-red-500/20 transition-all duration-300 font-mono text-sm disabled:opacity-40"
        >
          <Trash2 size={16} />
          {clearing ? 'Limpando...' : 'Limpar Banco de Dados'}
        </button>
      </div>
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
