# bubo

Um tutor de inglês que vive num popup flutuante no canto da tela. Você conversa em inglês, ele responde no seu nível e, discretamente, mostra o que um nativo teria dito.

## O que ele faz

- Janela sempre no topo, sem bordas, no canto inferior direito.
- Atalho global `Ctrl+Alt+B` mostra/esconde, `Esc` esconde, ícone na bandeja com menu.
- Orbe animado que muda de cor e movimento conforme o estado: ocioso (lilás), pensando (âmbar) e escrevendo (verde).
- Chat com streaming de resposta e bloco de correções por mensagem: trecho errado, versão natural e explicação curta em português.
- Nível CEFR configurável (A2 → C1) e persona opcional.
- Histórico local em SQLite.

## Stack

Tauri v2 (Rust) + React + TypeScript + Vite.

- A chave da API fica no Windows Credential Manager (serviço `bubo`), nunca em arquivo.
- O processo Rust é o único que fala com o provedor; a chave não chega ao WebView.
- Comandos IPC: `chat`, `history`, `clear_history`, `get_settings`, `save_settings`, `save_api_key`, `has_api_key`, `set_autostart`, `hide_window`, `quit_app`.

## Desenvolvimento

```powershell
npm install
npm run tauri dev      # janela de desenvolvimento com hot reload
npm run tauri build    # instalador em src-tauri/target/release/bundle
```

Pré-requisitos: Node 20+, Rust (stable-msvc) e Visual Studio Build Tools com workload C++.

## Configuração

Na primeira execução a tela de settings abre sozinha:

- **API key**: Groq (`https://console.groq.com`), salva no Credential Manager.
- **Model**: padrão `openai/gpt-oss-120b`; qualquer modelo de chat disponível na conta funciona.
- **Base URL**: `https://api.groq.com/openai/v1` (qualquer endpoint compatível com OpenAI serve).
- **Level**: ajusta vocabulário e tamanho das frases.

Arquivos de dados: `%APPDATA%\com.lucas.bubo\` (settings e `bubo.db`).
