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

## Como Executar

### Via NPX (Recomendado)

Execute diretamente sem precisar clonar ou instalar:

```bash
npx @gumballwotersan/whasender
```

### Instalação Global

```bash
npm install -g @gumballwotersan/whasender
whasender
```

### Instalação Local

1. **Clonar o Repositório**:
   ```bash
   git clone https://github.com/Gumballxnz/WhaSender.git
   cd WhaSender
   ```

2. **Instalar Dependências**:
   ```bash
   npm install
   ```

3. **Configurar Ambiente**:
   ```bash
   cp .env.example .env
   ```

4. **Compilar Frontend e Iniciar**:
   ```bash
   npm run build
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
