import React, { useState, useEffect } from 'react';
import axios from 'axios';
import LocationAutocomplete from '../components/LocationAutocomplete';

export default function SearchLeads() {
  const [mode, setMode] = useState('simple');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSubs, setSelectedSubs] = useState([]);
  
  const [form, setForm] = useState({
    query: '',
    location: '',
    radius: 25,
    hasPhone: true,
    noWebsite: true,
    minRating: 4
  });

  useEffect(() => {
    axios.get('http://localhost:3001/api/categories')
      .then(res => setCategories(res.data))
      .catch(err => console.error('Erro ao carregar categorias:', err));
  }, []);

  const handleSimpleSearch = async (e) => {
    e.preventDefault();
    if (!form.location) {
      alert('Selecione uma localização válida da lista');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await axios.post('http://localhost:3001/api/search', form);
      setResult(res.data);
    } catch (err) {
      alert('Erro na busca: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleCategorySearch = async (e) => {
    e.preventDefault();
    if (!selectedCategory) {
      alert('Selecione uma categoria');
      return;
    }
    if (!form.location) {
      alert('Selecione uma localização válida da lista');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await axios.post('http://localhost:3001/api/search-categories', {
        categoryId: selectedCategory,
        subcategoryIds: selectedSubs,
        location: form.location,
        radius: form.radius,
        hasPhone: form.hasPhone,
        noWebsite: form.noWebsite,
        minRating: form.minRating
      });
      setResult(res.data);
    } catch (err) {
      alert('Erro na busca: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const toggleSub = (id) => {
    setSelectedSubs(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAllSubs = () => {
    if (selectedCategory) {
      const cat = categories.find(c => c.id === selectedCategory);
      setSelectedSubs(cat.subcategories.map(s => s.id));
    }
  };

  const clearSubs = () => setSelectedSubs([]);

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-3xl font-mono font-bold text-jarvis-cyan mb-6 glow-text">
        Buscar Leads
      </h2>

      {/* Seletor de modo */}
      <div className="glass p-4 rounded-xl mb-6 flex gap-4">
        <button
          type="button"
          onClick={() => { setMode('simple'); setResult(null); }}
          className={`flex-1 py-3 rounded-lg font-mono transition-all ${
            mode === 'simple' 
              ? 'bg-jarvis-cyan/20 text-jarvis-cyan border border-jarvis-cyan/50' 
              : 'bg-slate-800/50 text-jarvis-muted hover:text-jarvis-text'
          }`}
        >
          🔍 Busca Simples
        </button>
        <button
          type="button"
          onClick={() => { setMode('categories'); setResult(null); }}
          className={`flex-1 py-3 rounded-lg font-mono transition-all ${
            mode === 'categories' 
              ? 'bg-jarvis-cyan/20 text-jarvis-cyan border border-jarvis-cyan/50' 
              : 'bg-slate-800/50 text-jarvis-muted hover:text-jarvis-text'
          }`}
        >
          📂 Busca por Categorias
        </button>
      </div>

      {/* Filtros globais */}
      <div className="glass p-6 rounded-xl mb-6">
        <h3 className="text-jarvis-cyan font-mono mb-4">⚙️ Filtros</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-jarvis-muted text-sm font-mono mb-1">
              📍 Localização <span className="text-red-400">*</span>
            </label>
            <LocationAutocomplete
              value={form.location}
              onChange={(loc) => setForm({...form, location: loc})}
              placeholder="Digite a cidade (ex: São Paulo, SP)"
            />
            <p className="text-jarvis-muted text-xs mt-1 font-mono">
              💡 Selecione uma sugestão para usar a cidade e a UF corretas
            </p>
          </div>
          <div>
            <label className="block text-jarvis-muted text-sm font-mono mb-1">Raio (km)</label>
            <input 
              type="number" 
              className="input-jarvis w-full" 
              value={form.radius} 
              onChange={e => setForm({...form, radius: e.target.value})} 
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-jarvis-muted text-sm font-mono mb-1">Avaliação Mín.</label>
            <input 
              type="number" 
              step="0.1" 
              className="input-jarvis w-full" 
              value={form.minRating} 
              onChange={e => setForm({...form, minRating: e.target.value})} 
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-6 pt-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={form.hasPhone} 
              onChange={e => setForm({...form, hasPhone: e.target.checked})} 
              className="accent-jarvis-cyan w-4 h-4" 
            />
            <span className="text-jarvis-text">Com telefone</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={form.noWebsite} 
              onChange={e => setForm({...form, noWebsite: e.target.checked})} 
              className="accent-jarvis-cyan w-4 h-4" 
            />
            <span className="text-jarvis-text">Sem site (Alta Prioridade)</span>
          </label>
        </div>
      </div>

      {/* Busca Simples */}
      {mode === 'simple' && (
        <form onSubmit={handleSimpleSearch} className="glass p-6 rounded-xl space-y-4">
          <div>
            <label className="block text-jarvis-muted text-sm font-mono mb-1">Termo de Busca / Categoria</label>
            <input 
              className="input-jarvis w-full" 
              value={form.query} 
              onChange={e => setForm({...form, query: e.target.value})} 
              placeholder="Ex: Confeitaria, Eletricista, Dentista" 
              required 
            />
          </div>
          <button 
            type="submit" 
            disabled={loading} 
            className="btn-primary w-full flex items-center justify-center space-x-2"
          >
            {loading ? <span className="animate-pulse">Processando...</span> : <span>Iniciar Varredura</span>}
          </button>
        </form>
      )}

      {/* Busca por Categorias */}
      {mode === 'categories' && (
        <div className="glass p-6 rounded-xl space-y-4">
          <div>
            <label className="block text-jarvis-muted text-sm font-mono mb-1">Selecione a Categoria</label>
            <select 
              className="input-jarvis w-full" 
              value={selectedCategory || ''} 
              onChange={e => { setSelectedCategory(e.target.value); setSelectedSubs([]); }}
            >
              <option value="">-- Escolha uma categoria --</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.subcategories.length})</option>
              ))}
            </select>
          </div>

          {selectedCategory && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-jarvis-muted text-sm font-mono">Subcategorias</label>
                <div className="space-x-2">
                  <button type="button" onClick={selectAllSubs} className="text-jarvis-cyan text-xs hover:underline">
                    Selecionar todas
                  </button>
                  <button type="button" onClick={clearSubs} className="text-jarvis-muted text-xs hover:underline">
                    Limpar
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto p-2 bg-slate-900/50 rounded border border-slate-700">
                {categories.find(c => c.id === selectedCategory)?.subcategories.map(sub => (
                  <label key={sub.id} className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-slate-800">
                    <input 
                      type="checkbox" 
                      checked={selectedSubs.includes(sub.id)} 
                      onChange={() => toggleSub(sub.id)} 
                      className="accent-jarvis-cyan" 
                    />
                    <span className="text-jarvis-text text-sm">{sub.name}</span>
                  </label>
                ))}
              </div>
              <p className="text-jarvis-muted text-xs mt-2 font-mono">
                {selectedSubs.length} subcategoria(s) selecionada(s)
              </p>
            </div>
          )}

          <button 
            type="button"
            onClick={handleCategorySearch}
            disabled={loading || !selectedCategory} 
            className="btn-primary w-full flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {loading ? <span className="animate-pulse">Varrendo categorias...</span> : <span>Iniciar Varredura por Categorias</span>}
          </button>
        </div>
      )}

      {/* Resultado */}
      {result && (
        <div className="mt-6 glass p-6 rounded-xl border border-jarvis-cyan/30">
          <h3 className="text-xl font-mono text-jarvis-cyan mb-4">
            ✅ Resultado da Varredura
          </h3>
          <p className="text-jarvis-text mb-2">
            Leads encontrados e salvos: <span className="font-bold text-jarvis-cyan text-lg">{result.count || result.total}</span>
          </p>
          
          {result.progress && (
            <div className="mt-4 space-y-1">
              <p className="text-jarvis-muted text-sm font-mono mb-2">Progresso por subcategoria:</p>
              {result.progress.map((p, i) => (
                <div key={i} className="flex justify-between text-sm p-2 bg-slate-900/50 rounded">
                  <span className="text-jarvis-text">{p.subcategory}</span>
                  <span className={p.status === 'success' ? 'text-green-400' : 'text-red-400'}>
                    {p.status === 'success' ? `✅ ${p.count} leads` : '❌ Erro'}
                  </span>
                </div>
              ))}
            </div>
          )}

          <a href="/leads" className="btn-primary inline-block mt-4">
            Ver na Tabela de Leads →
          </a>
        </div>
      )}
    </div>
  );
}
