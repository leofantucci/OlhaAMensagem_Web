import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Trash2, Plus, ChevronDown, ChevronRight } from 'lucide-react';

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [newCat, setNewCat] = useState('');
  const [newSubs, setNewSubs] = useState('');

  const fetchCategories = async () => {
    const res = await axios.get('http://localhost:3001/api/categories');
    setCategories(res.data);
  };

  useEffect(() => { fetchCategories(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newCat || !newSubs) return;
    const subs = newSubs.split(',').map(s => s.trim()).filter(s => s);
    await axios.post('http://localhost:3001/api/categories', { name: newCat, subcategories: subs });
    setNewCat('');
    setNewSubs('');
    fetchCategories();
  };

  const handleDelete = async (id) => {
    if (confirm('Excluir esta categoria e todas as subcategorias?')) {
      await axios.delete(`http://localhost:3001/api/categories/${id}`);
      fetchCategories();
    }
  };

  const toggleExpand = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-3xl font-mono font-bold text-jarvis-cyan mb-6 glow-text">
        Categorias
      </h2>

      {/* Adicionar nova */}
      <form onSubmit={handleAdd} className="glass p-6 rounded-xl mb-6 space-y-4">
        <h3 className="text-jarvis-cyan font-mono flex items-center gap-2">
          <Plus size={18} /> Nova Categoria
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input 
            className="input-jarvis" 
            placeholder="Nome da categoria (ex: Advocacia)" 
            value={newCat} 
            onChange={e => setNewCat(e.target.value)} 
            required 
          />
          <input 
            className="input-jarvis" 
            placeholder="Subcategorias separadas por vírgula" 
            value={newSubs} 
            onChange={e => setNewSubs(e.target.value)} 
            required 
          />
        </div>
        <button type="submit" className="btn-primary">Adicionar Categoria</button>
      </form>

      {/* Lista */}
      <div className="space-y-3">
        {categories.map(cat => (
          <div key={cat.id} className="glass rounded-xl overflow-hidden">
            <div 
              className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-800/50 transition-colors"
              onClick={() => toggleExpand(cat.id)}
            >
              <div className="flex items-center gap-3">
                {expanded[cat.id] ? <ChevronDown className="text-jarvis-cyan" /> : <ChevronRight className="text-jarvis-muted" />}
                <span className="font-mono font-bold text-jarvis-text">{cat.name}</span>
                <span className="text-jarvis-muted text-sm">({cat.subcategories.length})</span>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); handleDelete(cat.id); }}
                className="text-red-400 hover:text-red-300 p-2"
              >
                <Trash2 size={16} />
              </button>
            </div>
            
            {expanded[cat.id] && (
              <div className="border-t border-slate-700 p-4 bg-slate-900/50">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {cat.subcategories.map(sub => (
                    <div key={sub.id} className="text-sm text-jarvis-text p-2 bg-slate-800/50 rounded border border-slate-700">
                      {sub.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
