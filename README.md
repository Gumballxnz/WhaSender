# WhaSender

Plataforma open-source para automação, geração de leads e disparos em massa via WhatsApp com persistência SQLite e interface moderna em React.

---

## Recursos Principais

- **Onboarding Wizard (/setup)**: Instalação automática sem necessidade de arquivos `.env` manuais — configure o proprietário e a organização diretamente pela interface.
- **Organizações & Equipes (Multi-tenant)**: Crie equipes, atribua funções hierárquicas (`owner`, `admin`, `member`) e convide colaboradores via links compartilháveis.
- **Motor Baileys Isolado**: Conexão WebSocket resiliente com suporte a QR Code e código de pareamento, reconexão automática e retry exponencial.
- **Gerador de Leads Integrado**: Geração em massa com saturação por prefixo e banco anti-duplicação global SQLite (0% duplicação).
- **Validador de WhatsApp em Massa**: Identificação rápida de contas ativas versus números sem WhatsApp via consulta em lote com Baileys, exportação segmentada e integração direta com a fila de disparo.
- **Proteção Anti-Ban**: Controle de cadência por lote com pausas inteligentes configuráveis e verificação prévia de números via `onWhatsApp`.
- **Gestão de Arquivos**: Importação/exportação de planilhas `.xlsx` e download em formato `.zip`.
- **Interface SPA Moderna**: Dashboard em tempo real com React 18, Zustand, animações skeleton screens e tema escuro.
- **Compatível com Dokploy & Coolify**: Deploy automatizado via Dockerfile multi-stage com volume persistente.

---

## Como Executar

### Deploy no Dokploy (Recomendado para Produção)

1. No Dokploy, crie uma nova **Application** e selecione o repositório GitHub `Gumballxnz/WhaSender` (Branch `master`).
2. Em **Build Type**, selecione `Dockerfile`.
3. Em **Volumes**, mapeie um volume persistente para manter a base e as sessões:
   - **Host / Volume**: `whasender_data`
   - **Container Path**: `/app/data`
4. Em **Port**, configure `3002`.
5. Clique em **Deploy**! Ao abrir o domínio atribuído, você será direcionado automaticamente para o assistente de Onboarding (`/setup`).

### Via NPX

```bash
npx @gumballwotersan/whasender
```

### Instalação Local

1. **Clonar o Repositório**:
   ```bash
   git clone https://github.com/Gumballxnz/WhaSender.git
   cd WhaSender
   ```

2. **Instalar Dependências e Compilar**:
   ```bash
   npm install
   npm run build
   ```

3. **Iniciar a Plataforma**:
   ```bash
   npm start
   ```

---

## Estrutura do Projeto

```text
├── api/             # Servidor REST + WebSocket (Express e SQLite)
├── bot/             # Motor Baileys (processo filho isolado)
├── frontend/        # Interface SPA React (Vite)
├── bin/             # Ponto de entrada CLI (NPX)
├── data/            # Armazenamento local (ignorado pelo git)
├── .env.example     # Modelo de configuração de ambiente
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
