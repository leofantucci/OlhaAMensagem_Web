const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const app = express();
const prisma = new PrismaClient();
app.use(cors());
app.use(express.json());

// ============ FUNÇÕES AUXILIARES ============
function calcPriority(phone, website) {
  if (phone && !website) return 'ALTA';
  if (phone && website) return 'MEDIA';
  return 'BAIXA';
}

function buildGoogleMapsUrl(name, address) {
  const query = [name, address].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// Converte categoria do Foursquare (array) em string legível
function formatCategory(categories) {
  if (!categories || categories.length === 0) return 'Outros';
  // Pega a categoria mais específica (última do array)
  const primary = categories[categories.length - 1];
  return primary?.name || 'Outros';
}

// ============ LOCALIZAÇÃO / UF BRASILEIRA ============
const STATES = {
  'ACRE': 'AC', 'ALAGOAS': 'AL', 'AMAPA': 'AP', 'AMAPÁ': 'AP',
  'AMAZONAS': 'AM', 'BAHIA': 'BA', 'CEARA': 'CE', 'CEARÁ': 'CE',
  'DISTRITO FEDERAL': 'DF', 'ESPIRITO SANTO': 'ES', 'ESPÍRITO SANTO': 'ES',
  'GOIAS': 'GO', 'GOIÁS': 'GO', 'MARANHAO': 'MA', 'MARANHÃO': 'MA',
  'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS', 'MINAS GERAIS': 'MG',
  'PARA': 'PA', 'PARÁ': 'PA', 'PARAIBA': 'PB', 'PARAÍBA': 'PB',
  'PARANA': 'PR', 'PARANÁ': 'PR', 'PERNAMBUCO': 'PE', 'PIAUI': 'PI',
  'PIAUÍ': 'PI', 'RIO DE JANEIRO': 'RJ', 'RIO GRANDE DO NORTE': 'RN',
  'RIO GRANDE DO SUL': 'RS', 'RONDONIA': 'RO', 'RONDÔNIA': 'RO',
  'RORAIMA': 'RR', 'SANTA CATARINA': 'SC', 'SAO PAULO': 'SP', 'SÃO PAULO': 'SP',
  'SERGIPE': 'SE', 'TOCANTINS': 'TO'
};
const STATE_NAMES = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins'
};
const normalizeText = value => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

function getStateCode(state) {
  const normalized = normalizeText(state);
  if (/^[A-Z]{2}$/.test(normalized) && Object.values(STATES).includes(normalized)) return normalized;
  return STATES[normalized] || '';
}

function getCityFromAddress(address, fallback) {
  return address.city || address.town || address.municipality ||
    address.village || address.city_district || address.county || fallback || '';
}

async function geocodeLocation(location) {
  const value = String(location || '').trim();
  if (!value) throw new Error('Informe uma cidade e selecione uma sugestão do autocomplete.');

  const parts = value.split(',').map(part => part.trim()).filter(Boolean);
  const city = parts[0];
  const statePart = parts.length > 1 ? parts[1] : '';
  const stateCode = getStateCode(statePart);
  const stateName = stateCode ? STATE_NAMES[stateCode] : statePart;

  const params = new URLSearchParams({
    format: 'jsonv2',
    limit: '5',
    countrycodes: 'br',
    'accept-language': 'pt-BR',
    addressdetails: '1',
    q: [city, stateName, 'Brasil'].filter(Boolean).join(', ')
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': 'JarvisLeads/1.0 (local business search application)' }
  });
  if (!response.ok) throw new Error(`Serviço de localização indisponível (HTTP ${response.status}).`);

  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error(`Não foi possível localizar "${value}". Selecione uma cidade válida no autocomplete.`);
  }

  // Preferir resultado que corresponda à cidade e, quando fornecida, à UF.
  const match = results.find(item => {
    const addr = item.address || {};
    const resultCity = normalizeText(getCityFromAddress(addr, item.name));
    const resultStateCode = getStateCode(addr['ISO3166-2-lvl4']?.split('-').pop() || addr.state);
    return resultCity === normalizeText(city) &&
      (!stateCode || !resultStateCode || stateCode === resultStateCode);
  }) || results[0];

  return { lat: Number(match.lat), lon: Number(match.lon) };
}

// ============ AUTOCOMPLETE DE LOCALIZAÇÃO (OpenStreetMap) ============
app.get('/api/autocomplete', async (req, res) => {
  try {
    const input = String(req.query.input || '').trim();
    if (input.length < 3) return res.json([]);

    const params = new URLSearchParams({
      format: 'jsonv2',
      q: input,
      addressdetails: '1',
      limit: '8',
      countrycodes: 'br',
      'accept-language': 'pt-BR'
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'JarvisLeads/1.0 (local business search application)' }
    });
    if (!response.ok) {
      console.error('Nominatim autocomplete HTTP:', response.status);
      return res.status(502).json({ error: 'O serviço de localização está temporariamente indisponível.' });
    }

    const data = await response.json();
    const suggestions = [];
    const seen = new Set();

    for (const place of Array.isArray(data) ? data : []) {
      const addr = place.address || {};
      const city = getCityFromAddress(addr, place.name);
      const stateName = addr.state || '';
      const stateCode = getStateCode(addr['ISO3166-2-lvl4']?.split('-').pop() || stateName);
      if (!city) continue;

      const locationLabel = stateCode ? `${city}, ${stateCode}` : (stateName ? `${city}, ${stateName}` : city);
      const key = normalizeText(locationLabel);
      if (seen.has(key)) continue;
      seen.add(key);

      suggestions.push({
        mainText: city,
        secondaryText: stateCode
          ? `${stateName || STATE_NAMES[stateCode]} (${stateCode}), Brasil`
          : (stateName ? `${stateName}, Brasil` : 'Brasil'),
        stateCode,
        location: locationLabel,
        lat: Number(place.lat),
        lon: Number(place.lon)
      });
    }
    res.json(suggestions);
  } catch (error) {
    console.error('Erro no autocomplete:', error.message);
    res.status(502).json({ error: 'Não foi possível consultar sugestões de localização.' });
  }
});

// ============ BUSCA SIMPLES (FOURSQUARE) ============
app.post('/api/search', async (req, res) => {
  try {
    console.log('🔍 Iniciando busca Foursquare:', req.body);
    
    if (!process.env.FOURSQUARE_API_KEY || process.env.FOURSQUARE_API_KEY === 'FSQ3_SUA_API_KEY_AQUI') {
      return res.status(500).json({ error: 'API Key do Foursquare não configurada no .env' });
    }
    
    const { query, location, radius, hasPhone, noWebsite, minRating } = req.body;
    const radiusInt = parseInt(radius) || 5;
    const radiusMeters = radiusInt * 1000; // Foursquare usa metros

    // Converte "Cidade, UF" para coordenadas usando o nome oficial do estado.
    const { lat, lon } = await geocodeLocation(location);
    console.log(`📍 Coordenadas: ${lat}, ${lon}`);

    // Busca no Foursquare
    const fsqUrl = `https://places-api.foursquare.com/places/search?query=${encodeURIComponent(query)}&ll=${lat},${lon}&radius=${radiusMeters}&limit=50&fields=name,location,tel,website,categories,fsq_place_id,link`;

    const response = await fetch(fsqUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.FOURSQUARE_API_KEY}`,
        'Accept': 'application/json',
        'X-Places-Api-Version': '2025-06-17'
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('❌ Erro Foursquare API:', response.status, errorData);
      return res.status(response.status).json({ 
        error: 'Erro na API do Foursquare', 
        details: errorData 
      });
    }

    const data = await response.json();
    let places = data.results || [];
    console.log(`✅ Recebidos: ${places.length} lugares`);

    // Filtros locais
    if (hasPhone) places = places.filter(p => p.tel);
    if (noWebsite) places = places.filter(p => !p.website);
    // Foursquare não tem rating em estrelas, então minRating não se aplica aqui
    // Podemos usar popularity como filtro alternativo no futuro

    const leadsToSave = places.map(place => {
      const loc = place.location || {};
      return {
        placeId: place.fsq_place_id,
        name: place.name || 'Sem nome',
        phone: place.tel || null,
        website: place.website || null,
        address: [loc.address, loc.locality, loc.region, loc.postcode, loc.country].filter(Boolean).join(', ') || null,
        city: loc.locality || loc.city || loc.region || null,
        state: loc.region || null,
            rating: null, // Foursquare não tem rating em estrelas
        reviewCount: 0,
        popularity: 0,
        category: formatCategory(place.categories),
        mapsUrl: buildGoogleMapsUrl(place.name, [loc.address, loc.locality, loc.region].filter(Boolean).join(', ')),
        priority: calcPriority(place.tel, place.website),
        source: 'Foursquare',
        sourceUrl: place.link || null
      };
    });

    const savedLeads = [];
    for (const lead of leadsToSave) {
      try {
        const saved = await prisma.lead.upsert({
          where: { placeId: lead.placeId },
          update: { ...lead, searchDate: new Date(), updatedAt: new Date() },
          create: { ...lead, searchDate: new Date() }
        });
        savedLeads.push(saved);
      } catch (dbError) {
        console.error('❌ Erro ao salvar lead:', lead.name, dbError.message);
      }
    }

    await prisma.searchHistory.create({
      data: { 
        query, 
        location, 
        radius: radiusInt,
        categories: query, 
        resultsCount: savedLeads.length 
      }
    });

    console.log(`✅ Busca concluída: ${savedLeads.length} leads salvos`);
    res.json({ success: true, count: savedLeads.length, leads: savedLeads });
  } catch (error) {
    console.error('❌ ERRO CRÍTICO:', error);
    res.status(error.message.includes('localiz') || error.message.includes('Localização') || error.message.includes('cidade') ? 400 : 500).json({ error: 'Erro na busca', details: error.message });
  }
});

// ============ BUSCA POR CATEGORIAS RELACIONADAS (FOURSQUARE) ============
app.post('/api/search-categories', async (req, res) => {
  try {
    const { categoryId, subcategoryIds, location, radius, hasPhone, noWebsite } = req.body;
    const radiusInt = parseInt(radius) || 5;
    const radiusMeters = radiusInt * 1000;

    if (!process.env.FOURSQUARE_API_KEY || process.env.FOURSQUARE_API_KEY === 'FSQ3_SUA_API_KEY_AQUI') {
      return res.status(500).json({ error: 'API Key do Foursquare não configurada' });
    }

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      include: { subcategories: true }
    });

    if (!category) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    const selectedSubs = subcategoryIds && subcategoryIds.length > 0
      ? category.subcategories.filter(s => subcategoryIds.includes(s.id))
      : category.subcategories;

    console.log(`🎯 Categoria: ${category.name} | ${selectedSubs.length} subcategorias`);

    // Converte "Cidade, UF" para coordenadas usando o nome oficial do estado.
    const { lat, lon } = await geocodeLocation(location);

    const allLeads = [];
    const progress = [];
    const placeIdsSeen = new Set();

    for (const sub of selectedSubs) {
      try {
        const fsqUrl = `https://places-api.foursquare.com/places/search?query=${encodeURIComponent(sub.name)}&ll=${lat},${lon}&radius=${radiusMeters}&limit=50&fields=name,location,tel,website,categories,fsq_place_id,link`;

        const response = await fetch(fsqUrl, {
          headers: {
            'Authorization': `Bearer ${process.env.FOURSQUARE_API_KEY}`,
            'Accept': 'application/json',
            'X-Places-Api-Version': '2025-06-17'
          }
        });

        if (!response.ok) {
          progress.push({ subcategory: sub.name, status: 'error', count: 0 });
          continue;
        }

        const data = await response.json();
        let places = data.results || [];

        if (hasPhone) places = places.filter(p => p.tel);
        if (noWebsite) places = places.filter(p => !p.website);

        // Deduplicação
        places = places.filter(p => !placeIdsSeen.has(p.fsq_place_id));
        places.forEach(p => placeIdsSeen.add(p.fsq_place_id));

        const leadsToSave = places.map(place => {
          const loc = place.location || {};
          return {
            placeId: place.fsq_place_id,
            name: place.name || 'Sem nome',
            phone: place.tel || null,
            website: place.website || null,
            address: [loc.address, loc.locality, loc.region, loc.postcode, loc.country].filter(Boolean).join(', ') || null,
            city: loc.locality || loc.city || loc.region || null,
            state: loc.region || null,
                    rating: null,
            reviewCount: 0,
            popularity: 0,
            category: `${category.name} > ${formatCategory(place.categories)}`,
            mapsUrl: buildGoogleMapsUrl(place.name, [loc.address, loc.locality, loc.region].filter(Boolean).join(', ')),
            priority: calcPriority(place.tel, place.website),
            source: 'Foursquare',
            sourceUrl: place.link || null
          };
        });

        const savedLeads = [];
        for (const lead of leadsToSave) {
          try {
            const saved = await prisma.lead.upsert({
              where: { placeId: lead.placeId },
              update: { ...lead, searchDate: new Date(), updatedAt: new Date() },
              create: { ...lead, searchDate: new Date() }
            });
            savedLeads.push(saved);
          } catch (dbError) {
            console.error('❌ Erro ao salvar:', lead.name);
          }
        }

        allLeads.push(...savedLeads);
        progress.push({ subcategory: sub.name, status: 'success', count: savedLeads.length });
        console.log(`✅ ${sub.name}: ${savedLeads.length} leads`);

        // Delay para respeitar rate limit do Foursquare (100 req/min no free tier)
        await new Promise(r => setTimeout(r, 700));
      } catch (err) {
        console.error(`❌ Erro em ${sub.name}:`, err.message);
        progress.push({ subcategory: sub.name, status: 'error', count: 0 });
      }
    }

    await prisma.searchHistory.create({
      data: {
        query: category.name,
        location,
        radius: radiusInt,
        categories: selectedSubs.map(s => s.name).join(', '),
        resultsCount: allLeads.length
      }
    });

    res.json({ 
      success: true, 
      total: allLeads.length, 
      progress,
      leads: allLeads 
    });
  } catch (error) {
    console.error('❌ ERRO:', error);
    res.status(error.message.includes('localiz') || error.message.includes('Localização') || error.message.includes('cidade') ? 400 : 500).json({ error: 'Erro na busca por categorias', details: error.message });
  }
});

// ============ LEADS ============
app.get('/api/leads', async (req, res) => {
  try {
    const { page = '1', limit = '1000', priority, city, search, category } = req.query;
    const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
    const safeLimit = Math.min(2000, Math.max(1, Number.parseInt(limit, 10) || 1000));
    const skip = (safePage - 1) * safeLimit;
    const where = {};
    if (priority) where.priority = priority;
    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (category) where.category = { contains: category, mode: 'insensitive' };
    if (search) where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { category: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
      { state: { contains: search, mode: 'insensitive' } }
    ];

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({ where, skip, take: safeLimit, orderBy: { searchDate: 'desc' } }),
      prisma.lead.count({ where })
    ]);
    res.json({ leads, total, pages: Math.ceil(total / safeLimit) });
  } catch (error) {
    console.error('Erro ao consultar leads:', error);
    res.status(500).json({ error: 'Não foi possível carregar os leads.' });
  }
});

app.put('/api/leads/:id', async (req, res) => {
  const { observations, priority, email } = req.body;
  const lead = await prisma.lead.update({ 
    where: { id: req.params.id }, 
    data: { observations, priority, email } 
  });
  res.json(lead);
});

app.delete('/api/leads/:id', async (req, res) => {
  await prisma.lead.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// ============ CATEGORIAS ============
app.get('/api/categories', async (req, res) => {
  const categories = await prisma.category.findMany({ 
    include: { subcategories: true },
    orderBy: { name: 'asc' }
  });
  res.json(categories);
});

app.post('/api/categories', async (req, res) => {
  const { name, subcategories } = req.body;
  const category = await prisma.category.create({
    data: {
      name,
      subcategories: {
        create: subcategories.map(s => ({ name: s, searchTerms: s }))
      }
    },
    include: { subcategories: true }
  });
  res.json(category);
});

app.delete('/api/categories/:id', async (req, res) => {
  await prisma.category.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// ============ HISTÓRICO ============
app.get('/api/history', async (req, res) => {
  const history = await prisma.searchHistory.findMany({ 
    orderBy: { date: 'desc' },
    take: 50
  });
  res.json(history);
});

// ============ DASHBOARD ============
app.get('/api/dashboard', async (req, res) => {
  const total = await prisma.lead.count();
  const alta = await prisma.lead.count({ where: { priority: 'ALTA' } });
  const media = await prisma.lead.count({ where: { priority: 'MEDIA' } });
  const baixa = await prisma.lead.count({ where: { priority: 'BAIXA' } });
  const comTelefone = await prisma.lead.count({ where: { phone: { not: null } } });
  const semSite = await prisma.lead.count({ where: { website: null } });
  
  const porCategoria = await prisma.lead.groupBy({
    by: ['category'],
    _count: true,
    orderBy: { _count: { category: 'desc' } },
    take: 10
  });

  res.json({ total, alta, media, baixa, comTelefone, semSite, porCategoria });
});


// ============ LIMPAR BANCO DE DADOS ============
app.delete('/api/database/clear', async (req, res) => {
  try {
    const { includeCategories } = req.query;
    const operations = [
      prisma.lead.deleteMany({}),
      prisma.searchHistory.deleteMany({})
    ];
    if (includeCategories === 'true') {
      operations.push(prisma.subcategory.deleteMany({}));
      operations.push(prisma.category.deleteMany({}));
    }
    const [deletedLeads, deletedHistory] = await prisma.$transaction(operations);
    console.log(`🧹 Banco de dados limpo: ${deletedLeads.count} leads e ${deletedHistory.count} históricos removidos.`);
    res.json({
      success: true,
      message: 'Banco de dados limpo com sucesso!',
      deletedLeads: deletedLeads.count,
      deletedHistory: deletedHistory.count
    });
  } catch (error) {
    console.error('❌ Erro ao limpar banco de dados:', error);
    res.status(500).json({ error: 'Erro ao limpar o banco de dados.', details: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Servidor J.A.R.V.I.S. rodando na porta ${PORT}`));
