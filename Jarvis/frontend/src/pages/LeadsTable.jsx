import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Trash2 } from 'lucide-react';

const API_URL = 'http://localhost:3001';

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR');
}

function getCityState(lead) {
  const city = lead.city || '-';
  const state = lead.state || '-';
  return `${city}${state !== '-' ? ` / ${state}` : ''}`;
}

export default function LeadsTable() {
  const [leads, setLeads] = useState([]);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [websiteFilter, setWebsiteFilter] = useState('');
  const [ratingFilter, setRatingFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const fetchLeads = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await axios.get(`${API_URL}/api/leads?limit=2000`);
        if (active) setLeads(Array.isArray(response.data.leads) ? response.data.leads : []);
      } catch (err) {
        console.error('Erro ao buscar leads:', err);
        if (active) setError(err.response?.data?.error || 'Não foi possível carregar os leads. Verifique se o backend está funcionando.');
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchLeads();
    return () => { active = false; };
  }, []);

  const categories = useMemo(() => [...new Set(leads.map(lead => lead.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [leads]);

  const filteredLeads = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    return leads.filter(lead => {
      const haystack = [lead.name, lead.category, lead.phone, lead.city, lead.state, lead.website, lead.mapsUrl, lead.priority]
        .filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
      if (normalizedSearch && !haystack.includes(normalizedSearch)) return false;
      if (priorityFilter && lead.priority !== priorityFilter) return false;
      if (categoryFilter && lead.category !== categoryFilter) return false;
      if (websiteFilter === 'with' && !lead.website) return false;
      if (websiteFilter === 'without' && lead.website) return false;
      if (ratingFilter) {
        // A avaliação só é filtrável quando houver uma nota real salva no campo rating.
        if (lead.rating == null || Number(lead.rating) < Number(ratingFilter)) return false;
      }
      if (dateFrom || dateTo) {
        if (!lead.searchDate) return false;
        const day = new Date(lead.searchDate).toISOString().slice(0, 10);
        if (dateFrom && day < dateFrom) return false;
        if (dateTo && day > dateTo) return false;
      }
      return true;
    });
  }, [leads, search, priorityFilter, categoryFilter, websiteFilter, ratingFilter, dateFrom, dateTo]);

  const exportExcel = () => {
    const rows = filteredLeads.map(lead => ({
      Nome: lead.name || '-',
      Categoria: lead.category || '-',
      Telefone: lead.phone || '-',
      'Cidade/UF': getCityState(lead),
      'Link do site da empresa': lead.website || '-',
      'Link Google Maps': lead.mapsUrl || '-',
      'Avaliação Google Maps': lead.rating == null ? 'Não disponível' : Number(lead.rating).toFixed(1),
      Prioridade: lead.priority || '-',
      'Data Busca': formatDate(lead.searchDate)
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet['!cols'] = [
      { wch: 28 }, { wch: 30 }, { wch: 18 }, { wch: 24 }, { wch: 38 },
      { wch: 42 }, { wch: 22 }, { wch: 14 }, { wch: 14 }
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Leads JARVIS');
    XLSX.writeFile(workbook, `jarvis_leads_${Date.now()}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(16);
    doc.text('Relatório de Leads - J.A.R.V.I.S.', 14, 15);
    doc.setFontSize(9);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')} | Leads filtrados: ${filteredLeads.length}`, 14, 22);
    doc.autoTable({
      head: [['Nome', 'Categoria', 'Telefone', 'Cidade/UF', 'Site', 'Google Maps', 'Nota Google', 'Prioridade', 'Data Busca']],
      body: filteredLeads.map(lead => [
        lead.name || '-', lead.category || '-', lead.phone || '-', getCityState(lead),
        lead.website || '-', lead.mapsUrl || '-', lead.rating == null ? 'N/D' : Number(lead.rating).toFixed(1),
        lead.priority || '-', formatDate(lead.searchDate)
      ]),
      startY: 27,
      theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: 1.8, overflow: 'linebreak' },
      headStyles: { fillColor: [10, 25, 47], textColor: [100, 255, 218] },
      columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 32 }, 4: { cellWidth: 34 }, 5: { cellWidth: 34 } }
    });
    doc.save(`jarvis_leads_${Date.now()}.pdf`);
  };

  const getPriorityColor = priority => {
    if (priority === 'ALTA') return 'bg-red-500/20 text-red-400 border-red-500/50';
    if (priority === 'MEDIA') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
    return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
  };

  const clearFilters = () => {
    setSearch('');
    setPriorityFilter('');
    setCategoryFilter('');
    setWebsiteFilter('');
    setRatingFilter('');
    setDateFrom('');
    setDateTo('');
  };

  const handleClearDatabase = async () => {
    const confirmed = window.confirm(
      'ATENÇÃO: Tem certeza que deseja limpar o banco de dados? Todos os leads e o histórico de buscas serão apagados permanentemente.'
    );
    if (!confirmed) return;

    try {
      setLoading(true);
      setError('');
      await axios.delete(`${API_URL}/api/database/clear`);
      setLeads([]);
      alert('Banco de dados limpo com sucesso!');
    } catch (err) {
      console.error('Erro ao limpar banco de dados:', err);
      setError(err.response?.data?.error || 'Não foi possível limpar o banco de dados.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h2 className="text-3xl font-mono font-bold text-jarvis-cyan glow-text">Base de Leads</h2>
          <p className="text-sm text-jarvis-muted mt-1">{filteredLeads.length} de {leads.length} leads</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportExcel} disabled={!filteredLeads.length} className="btn-primary text-sm disabled:opacity-40">Exportar Excel</button>
          <button onClick={exportPDF} disabled={!filteredLeads.length} className="btn-primary text-sm disabled:opacity-40">Exportar PDF</button>
          <button
            onClick={handleClearDatabase}
            disabled={!leads.length || loading}
            className="flex items-center gap-2 bg-red-500/10 text-red-400 border border-red-500/50 px-4 py-2 rounded hover:bg-red-500/20 transition-all duration-300 font-mono text-sm disabled:opacity-40"
          >
            <Trash2 size={16} />
            Limpar Banco de Dados
          </button>
        </div>
      </div>

      <section className="glass p-4 rounded-xl mb-6">
        <h3 className="font-mono text-jarvis-cyan mb-3">Filtros de leads</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input className="input-jarvis min-w-0" placeholder="Buscar nome, telefone, cidade..." value={search} onChange={event => setSearch(event.target.value)} />
          <select className="input-jarvis min-w-0" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}>
            <option value="">Todas as categorias</option>
            {categories.map(category => <option key={category} value={category}>{category}</option>)}
          </select>
          <select className="input-jarvis min-w-0" value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)}>
            <option value="">Todas as prioridades</option>
            <option value="ALTA">ALTA</option>
            <option value="MEDIA">MÉDIA</option>
            <option value="BAIXA">BAIXA</option>
          </select>
          <select className="input-jarvis min-w-0" value={websiteFilter} onChange={event => setWebsiteFilter(event.target.value)}>
            <option value="">Com ou sem site</option>
            <option value="with">Com site</option>
            <option value="without">Sem site</option>
          </select>
          <select className="input-jarvis min-w-0" value={ratingFilter} onChange={event => setRatingFilter(event.target.value)}>
            <option value="">Qualquer avaliação Google</option>
            <option value="3">Nota mínima 3,0</option>
            <option value="4">Nota mínima 4,0</option>
            <option value="4.5">Nota mínima 4,5</option>
          </select>
          <label className="text-sm text-jarvis-muted flex flex-col gap-1">Data da busca — de<input aria-label="Data inicial da busca" className="input-jarvis min-w-0" type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></label>
          <label className="text-sm text-jarvis-muted flex flex-col gap-1">Data da busca — até<input aria-label="Data final da busca" className="input-jarvis min-w-0" type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} /></label>
          <button onClick={clearFilters} className="btn-primary text-sm">Limpar filtros</button>
        </div>
        <p className="text-xs text-jarvis-muted mt-3">A nota Google Maps aparece apenas quando houver uma avaliação real salva. A API Foursquare usada atualmente não fornece a avaliação do Google.</p>
      </section>

      <div className="glass rounded-xl overflow-hidden overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-jarvis-cyan font-mono animate-pulse">Carregando dados do sistema...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-400">{error}</div>
        ) : (
          <table className="w-full text-left border-collapse min-w-[1450px]">
            <thead className="bg-slate-800/80 text-jarvis-cyan font-mono text-sm">
              <tr>
                {['Nome', 'Categoria', 'Telefone', 'Cidade/UF', 'Link do site da empresa', 'Link Google Maps', 'Avaliação Google Maps', 'Prioridade', 'Data Busca'].map(title => (
                  <th key={title} className="p-4 border-b border-slate-700 whitespace-nowrap">{title}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-700/50">
              {filteredLeads.map(lead => (
                <tr key={lead.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-4 font-medium text-jarvis-text max-w-[220px]" title={lead.name}>{lead.name || '-'}</td>
                  <td className="p-4 text-jarvis-muted max-w-[240px]">{lead.category || '-'}</td>
                  <td className="p-4 text-jarvis-muted font-mono whitespace-nowrap">{lead.phone || '-'}</td>
                  <td className="p-4 text-jarvis-muted whitespace-nowrap">{getCityState(lead)}</td>
                  <td className="p-4 whitespace-nowrap">
                    {lead.website ? <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-jarvis-cyan hover:underline">Abrir site ↗</a> : <span className="text-jarvis-muted">Sem site</span>}
                  </td>
                  <td className="p-4 whitespace-nowrap">
                    {lead.mapsUrl ? <a href={lead.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-jarvis-blue hover:underline">Abrir Google Maps ↗</a> : <span className="text-jarvis-muted">-</span>}
                  </td>
                  <td className="p-4 whitespace-nowrap">
                    {lead.rating == null ? <span className="text-jarvis-muted">Não disponível</span> : <span className="text-yellow-300 font-semibold">★ {Number(lead.rating).toFixed(1)}</span>}
                  </td>
                  <td className="p-4 whitespace-nowrap"><span className={`px-2 py-1 rounded border text-xs font-bold ${getPriorityColor(lead.priority)}`}>{lead.priority || '-'}</span></td>
                  <td className="p-4 text-jarvis-muted whitespace-nowrap">{formatDate(lead.searchDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && !error && filteredLeads.length === 0 && <div className="p-8 text-center text-jarvis-muted">Nenhum lead encontrado com os filtros atuais.</div>}
      </div>
    </div>
  );
}
