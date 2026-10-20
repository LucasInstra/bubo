# bubo

Um tutor de inglês que vive num popup flutuante no canto da tela. Você conversa em inglês, ele responde no seu nível e, discretamente, mostra o que um nativo teria dito.

## O que ele faz

- Janela sem bordas no canto inferior direito, sempre no topo por padrão, com botão de pin para liberar.
- Atalho global configurável (padrão `Ctrl+Alt+B`), `Esc` esconde, ícone na bandeja com menu.
- Orbe animado com rosto: olhos que piscam e seguem o mouse, boca que mexe enquanto ele escreve, respiração e brilho que mudam por estado (ocioso lilás, pensando âmbar, escrevendo verde). No chat ele fica ao lado do campo de digitação; na tela vazia aparece grande.
- Chat com streaming de resposta e bloco de correções por mensagem: trecho errado, versão natural e explicação curta em português.
- **Prática**: cada correção entra numa fila de revisão espaçada (1, 3, 7, 21, 45 dias). O botão de alvo no header mostra quantas estão devidas e abre o drill.
- Nível CEFR configurável (A2 → C1) e persona opcional.
- Histórico local em SQLite.

## Como a conversa funciona

Duas chamadas por mensagem:

1. **Resposta** — streaming SSE do provedor; os deltas chegam ao WebView por evento (`bubo-delta`).
2. **Correções** — chamada separada, sem streaming, que devolve JSON estrito (`[{"wrong","right","note"}]`). O cartão aparece quando ela termina (`bubo-fixes`).

Separar as duas evita depender de o modelo respeitar marcadores no meio do texto — ele não respeita.

Se a resposta falha, a mensagem do usuário é removida do histórico (nada de turno órfão). Erros e tempos ficam em `%APPDATA%\com.lucas.bubo\bubo.log`.

## Prática

As correções são gravadas em duas tabelas: `messages` (o chat) e `fixes` (o que revisar). A tabela de prática é idempotente por `(wrong, right)` e é preenchida também a partir do histórico antigo na primeira abertura.

No drill, você reescreve o trecho errado; acertar sobe o intervalo (1 → 3 → 7 → 21 → 45 dias), errar volta para 10 minutos. "Show answer" conta como erro de propósito.

## Stack

Tauri v2 (Rust) + React + TypeScript + Vite.

- A chave da API fica no Windows Credential Manager (serviço `bubo`), nunca em arquivo.
- O processo Rust é o único que fala com o provedor; a chave não chega ao WebView.
- Comandos IPC: `chat`, `history`, `clear_history`, `drill_stats`, `drill_next`, `drill_review`, `get_settings`, `save_settings`, `save_api_key`, `has_api_key`, `set_autostart`, `set_pinned`, `hide_window`, `quit_app`.

## Desenvolvimento

```powershell
npm install
npm run tauri dev      # janela de desenvolvimento com hot reload
npm run tauri build    # instalador em src-tauri/target/release/bundle
cargo test --manifest-path src-tauri/Cargo.toml
```

Pré-requisitos: Node 20+, Rust (stable-msvc) e Visual Studio Build Tools com workload C++.

## Configuração

Na primeira execução a tela de settings abre sozinha:

- **API key**: Groq (`https://console.groq.com`), salva no Credential Manager.
- **Model**: padrão `openai/gpt-oss-120b`; qualquer modelo de chat disponível na conta funciona.
- **Base URL**: `https://api.groq.com/openai/v1` (qualquer endpoint compatível com OpenAI serve).
- **Level**: ajusta vocabulário e tamanho das frases.
- **Ignore capitalization**: ligado por padrão; não marca `i` minúsculo nem dia da semana sem maiúscula, para não incomodar em conversa informal.
- **Hotkey**: qualquer combinação no formato `Ctrl+Alt+B`; é re-registrada ao salvar.

Arquivos de dados: `%APPDATA%\com.lucas.bubo\` (settings e `bubo.db`).
