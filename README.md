# Governanta — web

PWA da Governanta (Next.js App Router + TypeScript). Alvo principal: tablet de quiosque na geladeira (1280×800, paisagem); também funciona no celular (390 px: colunas empilhadas, barra de baixo fixa, Falar vira botão redondo).

## Rodar

```bash
pnpm install       # também vendoriza o runtime da voz (public/voice/vendor, fora do git)
pnpm dev           # http://localhost:3100
pnpm build && pnpm start   # produção, também na 3100
pnpm lint
```

- `NEXT_PUBLIC_API_URL` (padrão `http://localhost:3101`) é embutido no build.
- Código da casa: se a API roda com `HOUSEHOLD_TOKEN`, todo pedido leva `Authorization: Bearer <código>` (`authedFetch` em `lib/api.ts`). O código vem de `NEXT_PUBLIC_HOUSEHOLD_TOKEN` no build ou é digitado uma vez no aparelho (Configurações → Sistema → Código da casa, ou a tela que aparece quando a API responde 401) e fica no `localStorage`.

## Moldura

- **Barra de baixo**: Casa · Lista · Previsões · Planejar · Histórico e o botão **Falar** (some fora da Casa se "Botão Falar sempre visível" estiver desligado). Mostra "offline" sem conexão.
- **Voz** (telas 02/03/03b): `lib/voice` (módulo do agente de voz) entrega estado e intents; `components/shell/VoiceOverlay.tsx` desenha "Estou ouvindo / Entendendo…", resolve cada produto (`resolveProduct`) e chama a API: acabou → `POST /events/depleted`, coloca → `POST /shopping-list/items` (ou `PATCH` da quantidade se já está na lista), tira → `DELETE`, usei → `POST /events/used` (fração, quantidade e unidade). Vários produtos → "Qual leite acabou?". **Desfazer** cancela; "acabou", "usei" e "tira" só gravam quando a confirmação fecha (Pronto, ou sozinha em 10 s). Fora de produção, `window.__governantaVoice("acabou o leite")` simula uma fala (testes sem microfone).
- **Folha de produto** (`ProductSheet.tsx`): Adicionar à lista / O que acabou? / O que vocês usaram? (¼ ½ ¾ Tudo), com busca, microfone e "Mais frequentes" (`GET /products?frequent=1`).
- **Aviso com Desfazer**: ações que a API não sabe reverter (acabou, usei, joguei fora, remover, limpar comprados) só gravam quando o aviso some (5 s); as outras gravam na hora e o Desfazer apaga/volta.
- **Falha de rede**: escrita que falha fica numa fila em memória, abre "Não consegui sincronizar agora" e é tentada de novo a cada 2 min, ao voltar a conexão ou em "Tentar agora". Banner "Sem internet…" na Casa.
- **Configuração inicial**: com `household.onboardedAt` nulo, qualquer tela leva a `/onboarding` (dá para "Pular por agora", que conclui).
- Escurecer à noite (22h–6h) aplica um véu escuro quando a preferência está ligada.

## Telas

| Rota | Tela |
|---|---|
| `/` | 01 Casa: saudação, relógio, lista (4 itens), "Acaba em breve", próxima compra, ações rápidas (Usei algo, Acabou algo, Adicionar item, Escanear nota), atalhos para Perguntar, Despensa e Dieta (no celular a Dieta fica só em Configurações) |
| `/lista` | 04 Lista por lugar da casa; filtros Todos/Previstos/Adicionados; marcar comprado, quantidade (+/−), remover, Limpar comprados |
| `/previsoes` | 06 Próximos a acabar: faixa de estimativa (hoje → +12 dias) com a próxima compra marcada; "Ainda aprendendo" |
| `/produto/[id]` | 07 Produto: provavelmente acaba (faixa), estoque, uso recente, duração, última compra, preços |
| `/produto/[id]/precos` | 13 Comparação de preços por mercado e por mês |
| `/escanear` | 08 NFC-e: câmera (BarcodeDetector ou jsQR), chave de acesso digitada, compra encontrada, nota ilegível, câmera indisponível. Fora de produção: "protótipo: ler agora" (fixture sintética) e "nota inválida" |
| `/compras/[id]/revisar` | 09 Revisão: reconhecidos, confirmar um a um (Corrigir: buscar outro produto, cadastrar novo, não registrar), Compra registrada |
| `/compras/[id]` | 11 Detalhe da compra |
| `/historico`, `/historico/gastos` | 10 Histórico (por mês, com busca) e 12 Gastos |
| `/planejar` | 14 Planejamento: já na lista, sugestões com quanto comprar quando a API sabe ("2 × 13 unidades") (Incluir / Agora não / Desfazer / Incluir todos) |
| `/configuracoes` | 15 Configurações: casa, sistema (código da casa), dias de mercado, voz e tela, avisos, Avisos no iPhone (Atalhos: moradores, código do Atalho, lugares e passo a passo), links para Despensa, Dieta e Perguntar |
| `/onboarding` | 16 Configuração inicial (3 passos) |
| `/perguntar` | Perguntar à Governanta (`POST /ask`) |
| `/despensa` | Despensa por lugar: validade, quanto resta, previsão, Acabou / Joguei fora, lugar e "Dura ~N dias" |
| `/dieta` | Dieta. Sem plano ativo: "Cole o plano da nutricionista" (texto → `POST /diet/import`, morador se houver) e planos em revisão (Continuar / Apagar). Com plano ativo: refeições de hoje com o que você costuma comer, "Hoje não segui" / "Segui em parte" (`POST /diet/:id/exceptions`, Desfazer apaga), "Registrar o que comi" (refeição → opção → quantidade já preenchida → `POST /diet/log`, grava quando o aviso some) e "Para comprar até …" (`GET /diet/shopping`: Pôr na lista / Pôr tudo na lista, com quantidade) |
| `/dieta/[id]/revisar` | Revisão da dieta em 3 etapas: **Alimentos** (cada ingrediente → produto: Confirmar a sugestão, Outro/Trocar pela folha de busca, que também cadastra produto novo com o nome digitado; "g por fatia/unidade" e "mg/UI por cápsula" onde importa; `PUT /diet/:id/links`), **Escolhas** (por slot: Só esta · Metade · Alterna, Incluir opcionais; `PUT /diet/:id/choices`), **Dias** (`PATCH dietWeekdays`). Ao lado, "Por dia" ao vivo (`GET /diet/rates?planId=`) com os avisos da API ("defina a dose por cápsula"). "Ativar plano" (`PATCH active`, Desfazer desativa) |

Previsões aparecem sempre como faixa e com incerteza ("provavelmente acaba sexta ou sábado", "estimativa: 3–5 dias", "pouca certeza"), nunca como data certa. Previsões calculadas pela dieta (`method: "diet"`) levam "· pela dieta" (Casa, Previsões, Despensa, Produto).

## Visual

Tema escuro único do desenho (`app/globals.css`, tokens em `:root`: `--bg #1b1916`, `--surface #24211d`, `--line #3b3631`, `--fg #f3efe8`, `--muted #bdb4a8`, `--subtle #978f84`, `--ok #a3c7a6`…), Helvetica Neue, cartões de 20–32 px de raio e botões em pílula. Todas as medidas do desenho são `calc(N * var(--u))`: `--u` = 1px a partir de 1181 px de largura, 0,86 px em telas médias e 0,7 px no celular. Ícones: Material Symbols Outlined do pacote `material-symbols` (servido pelo app; nada de Google Fonts em runtime, por causa do COEP).

## Estrutura

- `lib/api.ts`: tipos e chamadas de todos os endpoints, estado de conexão, código da casa (`authedFetch`).
- `lib/format.ts` (datas, dinheiro, quantidades), `lib/forecast.ts` (textos e faixas de previsão), `lib/diet.ts` (regras e textos da dieta: o que conta, dias, quanto pôr na lista), `lib/useResource.ts` (carregar/recarregar), `lib/useNow.ts` (relógio).
- `components/shell/`: moldura (`KioskProvider`, `Dock`, `VoiceOverlay`, `ProductSheet`, `context.ts`). A `ProductSheet` também tem o modo `pick` (só devolve o produto escolhido ou o nome de um novo), usado na revisão da dieta.
- `components/screens/`: uma view por tela; `components/ui.tsx`: peças comuns.
- PWA: `app/manifest.ts`, `public/sw.js` (app shell e `/voice/` em cache; nunca a API; preserva o cache do modelo de voz).
- `.screenshots/`: todas as telas e estados em 1280×800 e 390×844 (dados de um mock da API) e `api-real/` (contra a API real). `diet-*`: o fluxo da dieta com o plano real colado (mock com a saída real do leitor da API e leituras da API real).
