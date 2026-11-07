# J.A.R.V.I.S. — versão corrigida

## Correções principais
- Autocomplete retorna a cidade e a sigla da UF (por exemplo, `Birigui, SP`).
- O backend converte a UF para o nome oficial do estado antes de consultar o Nominatim.
- A geocodificação verifica respostas HTTP e trata localizações não encontradas.
- O autocomplete remove sugestões duplicadas, trata falhas da API e ignora respostas antigas durante a digitação.
- Corrigida a indicação no formulário: as sugestões vêm do OpenStreetMap/Nominatim, não do Google Maps.

## Requisitos
- Node.js 18 ou superior (recomendado Node.js 20+).
- PostgreSQL em execução.
- Chave válida da API Foursquare.

## Configuração
1. Entre na pasta `backend` e copie `.env.example` para `.env`.
2. Preencha `DATABASE_URL` e `FOURSQUARE_API_KEY` no arquivo `.env`.
3. Na pasta `backend`, execute:
   ```bash
   npm install
   npx prisma generate
   npx prisma db push
   npm run db:seed
   npm run dev
   ```
4. Em outro terminal, entre em `frontend` e execute:
   ```bash
   npm install
   npm run dev
   ```
5. Abra o endereço informado pelo Vite, normalmente `http://localhost:5173`.

## Observações
- Não compartilhe o arquivo `.env` nem envie sua chave de API ao Git.
- O Nominatim é um serviço público com limites de uso. Evite buscas automatizadas em alta frequência.
- O campo de raio é usado na consulta ao Foursquare; a localização escolhida é geocodificada pelo backend.
