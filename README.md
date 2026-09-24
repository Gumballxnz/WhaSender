# WhaSender

Plataforma open-source para automação, geração de leads e disparos em massa via WhatsApp com persistência SQLite e interface moderna em React.

---

## Recursos Principais

- **Motor Baileys Isolado**: Conexão WebSocket resiliente com suporte a QR Code e código de pareamento, reconexão automática e retry exponencial.
- **Gerador de Leads Integrado**: Geração em massa com saturação por prefixo e banco anti-duplicação global SQLite (0% duplicação).
- **Proteção Anti-Ban**: Controle de cadência por lote com pausas inteligentes configuráveis e verificação prévia de números via `onWhatsApp`.
- **Gestão de Arquivos**: Importação/exportação de planilhas `.xlsx` e download em formato `.zip`.
- **Interface SPA Moderna**: Dashboard em tempo real com React 18, Zustand e tema escuro.
- **Segurança de Sessão**: Autenticação JWT com renovação automática por refresh token seguro.

---

## Formas de Uso e Execução

### Opção 1: Via NPX (Sem Instalação)

```bash
npx @gumballwotersan/whasender
```

### Opção 2: Via Docker Compose

```bash
# Iniciar em segundo plano
docker compose up -d

# Parar serviços
docker compose down
```

### Opção 3: Instalação Global via NPM

```bash
npm install -g @gumballwotersan/whasender
whasender
```

### Opção 4: Desenvolvimento e Instalação Local

1. **Clonar o Repositório**:
   ```bash
   git clone https://github.com/Gumballwotersan/WhaSender.git
   cd WhaSender
   ```

2. **Instalar Dependências**:
   ```bash
   npm install
   ```

3. **Configurar Variáveis de Ambiente**:
   ```bash
   cp .env.example .env
   ```
   *Edite o arquivo `.env` gerado e defina suas credenciais e chaves JWT.*

4. **Compilar o Frontend**:
   ```bash
   npm run build
   ```

5. **Iniciar a Aplicação**:
   ```bash
   npm start
   ```

---

## Publicação no NPM

### Manualmente via Terminal

```bash
# 1. Login no NPM
npm login

# 2. Build dos assets
npm run build

# 3. Publicar com escopo público
npm publish --access public
```

### Automaticamente via GitHub Actions

O repositório inclui um workflow em `.github/workflows/publish.yml`:
1. Adicione o segredo `NPM_TOKEN` nas configurações do repositório no GitHub (`Settings > Secrets and variables > Actions`).
2. Publique uma nova Release no GitHub ou execute o workflow manualmente na aba **Actions**.

---

## Estrutura do Projeto

```text
├── api/             # Servidor REST + WebSocket (Express e SQLite)
├── bot/             # Motor Baileys (processo filho isolado)
├── frontend/        # Interface SPA React (Vite)
├── bin/             # Ponto de entrada CLI (NPX)
├── data/            # Armazenamento local (ignorado pelo git)
├── .env.example     # Modelo de configuração de ambiente
├── Dockerfile       # Imagem Docker multi-stage
├── docker-compose.yml # Orquestração de container
└── ecosystem.config.js # Configuração PM2 para servidores de produção
```

---

## Variáveis de Ambiente

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT_API` | `3002` | Porta do servidor HTTP e WebSocket |
| `NODE_ENV` | `development` | Ambiente de execução |
| `ADMIN_USERNAME` | `admin` | Nome de usuário administrativo |
| `ADMIN_PASSWORD_HASH` | - | Hash bcrypt da senha de acesso |
| `JWT_SECRET` | - | Segredo para assinatura de Access Tokens |
| `JWT_REFRESH_SECRET` | - | Segredo para assinatura de Refresh Tokens |
| `DB_PATH` | `./data/whasender.db` | Caminho do arquivo de banco SQLite |
| `FILES_PATH` | `./data/arquivos` | Diretório de armazenamento de planilhas |
| `SESSIONS_PATH` | `./data/sessions` | Diretório para exportação de lotes |
| `SESSION_PATH` | `./bot/src/session` | Diretório de autenticação do Baileys |

---

## Licença

Distribuído sob a licença [MIT](LICENSE).
