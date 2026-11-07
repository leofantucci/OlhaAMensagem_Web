const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const initialCategories = [
  {
    name: 'Advogados',
    subs: [
      'Advogado Civil', 'Advogado Trabalhista', 'Advogado Previdenciário',
      'Advogado de Família', 'Advogado Criminal', 'Advogado Empresarial',
      'Advogado Tributário', 'Advogado Imobiliário', 'Advogado Consumidor'
    ]
  },
  {
    name: 'Médicos',
    subs: [
      'Clínico Geral', 'Cardiologista', 'Dermatologista', 'Ginecologista',
      'Pediatra', 'Ortopedista', 'Oftalmologista', 'Psiquiatra',
      'Otorrinolaringologista', 'Endocrinologista', 'Gastroenterologista',
      'Urologista', 'Neurologista'
    ]
  },
  {
    name: 'Dentistas',
    subs: [
      'Dentista', 'Ortodontista', 'Endodontista', 'Periodontista',
      'Implantodontista', 'Odontopediatra', 'Cirurgião Dentista',
      'Clínica Odontológica'
    ]
  },
  {
    name: 'Beleza e Estética',
    subs: [
      'Salão de Beleza', 'Barbearia', 'Barbeiro', 'Cabeleireiro',
      'Manicure', 'Pedicure', 'Nail Designer', 'Maquiadora',
      'Design de Sobrancelhas', 'Esteticista', 'Depilação',
      'Micropigmentação', 'Lash Designer', 'Studio de Beleza'
    ]
  },
  {
    name: 'Saúde e Bem-estar',
    subs: [
      'Psicólogo', 'Nutricionista', 'Fisioterapeuta', 'Personal Trainer',
      'Educador Físico', 'Academia', 'Pilates', 'Yoga',
      'Terapeuta', 'Massoterapeuta'
    ]
  },
  {
    name: 'Assistência Técnica',
    subs: [
      'Assistência Técnica de Celular', 'Conserto de Computador',
      'Conserto de Notebook', 'Conserto de Eletrodomésticos',
      'Conserto de Ar Condicionado', 'Chaveiro', 'Serralheiro'
    ]
  },
  {
    name: 'Serviços Automotivos',
    subs: [
      'Mecânico', 'Auto Elétrico', 'Funilaria', 'Borracharia',
      'Lava Jato', 'Centro Automotivo', 'Troca de Óleo',
      'Alinhamento e Balanceamento'
    ]
  },
  {
    name: 'Veterinário e Pet',
    subs: [
      'Veterinário', 'Clínica Veterinária', 'Pet Shop',
      'Banho e Tosa', 'Adestrador', 'Hotel para Pets',
      'Creche para Cães'
    ]
  },
  {
    name: 'Educação e Aulas',
    subs: [
      'Professor Particular', 'Reforço Escolar', 'Escola de Idiomas',
      'Aulas de Música', 'Aulas de Dança', 'Curso Profissionalizante',
      'Mentoria', 'Coach'
    ]
  },
  {
    name: 'Serviços Residenciais',
    subs: [
      'Eletricista', 'Encanador', 'Pintor', 'Pedreiro',
      'Marido de Aluguel', 'Dedetização', 'Limpeza',
      'Diarista', 'Jardineiro', 'Paisagista'
    ]
  },
  {
    name: 'Contabilidade e Finanças',
    subs: [
      'Contador', 'Escritório de Contabilidade', 'Consultor Financeiro',
      'Corretor de Seguros', 'Assessor de Investimentos'
    ]
  },
  {
    name: 'Arquitetura e Engenharia',
    subs: [
      'Arquiteto', 'Designer de Interiores', 'Engenheiro Civil',
      'Engenheiro Eletricista', 'Engenheiro Mecânico'
    ]
  },
  {
    name: 'Fotografia e Vídeo',
    subs: [
      'Fotógrafo', 'Cinegrafista', 'Estúdio Fotográfico',
      'Fotógrafo de Casamento', 'Fotógrafo de Eventos'
    ]
  },
  {
    name: 'Alimentação',
    subs: [
      'Restaurante', 'Lanchonete', 'Confeitaria', 'Padaria',
      'Marmitaria', 'Buffet', 'Food Truck', 'Pizzaria'
    ]
  },
  {
    name: 'Imóveis',
    subs: [
      'Corretor de Imóveis', 'Imobiliária', 'Administradora de Imóveis',
      'Consultor Imobiliário'
    ]
  }
];

async function main() {
  console.log('🌱 Iniciando seed de categorias...');
  
  for (const cat of initialCategories) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: {},
      create: {
        name: cat.name,
        subcategories: {
          create: cat.subs.map(s => ({ 
            name: s, 
            searchTerms: `${s},${s.toLowerCase()}` 
          }))
        }
      }
    });
    console.log(`   ✅ ${cat.name} (${cat.subs.length} subcategorias)`);
  }
  
  console.log('\n🎉 Seed concluído com sucesso!');
}

main()
  .catch(e => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
