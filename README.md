# Portal de Iniciativas Digitais — Syensqo Itatiba

Página interna que mostra a cada área da planta o andamento das suas iniciativas
digitais: uma árvore de dependências e um painel de gestão com o que está
atrasado, o que vem a seguir e o que está travado.

É um site estático puro — sem build, sem npm, sem framework e sem nenhuma
requisição a domínio externo. Abre direto no GitHub Pages e é incorporado num
iframe dentro do SharePoint de cada área.

---

## Como funciona

```
Microsoft List (SharePoint)
        │  o analista mantém as iniciativas
        ▼
Power Automate  ── de hora em hora ──▶  data/initiatives.json  (via API do GitHub)
        │
        ▼
GitHub Pages  ──▶  iframe na página da área  ──▶  index.html?area=manutencao
```

> **`data/initiatives.json` é escrito só pelo Power Automate.**
> Não edite, não formate e não gere esse arquivo à mão: a próxima execução do
> fluxo sobrescreve tudo. O portal apenas lê.

---

## Rodar localmente

O `fetch` dos JSON não funciona abrindo o `index.html` pelo duplo clique
(`file://` bloqueia módulos ES e requisições). Suba um servidor:

```bash
# Windows
python -m http.server 8000

# macOS / Linux
python3 -m http.server 8000
```

E abra:

| URL | O que mostra |
| --- | --- |
| `http://localhost:8000/areas.html` | Índice com as 10 áreas e o endereço de cada painel |
| `http://localhost:8000/areas/confiabilidade/` | Painel de uma área (endereço estável, usado no iframe) |
| `http://localhost:8000/index.html?area=confiabilidade` | O mesmo painel, na forma com parâmetro |
| `http://localhost:8000/index.html` | Todas as áreas, consolidado |
| `http://localhost:8000/index.html?area=xyz` | Estado "Área não encontrada" |

Estado da interface vai na hash, então esses endereços também funcionam:
`#fase=execucao,planejamento`, `#projeto=maintenance-analytics`, `#tech=power-bi`,
`#q=inspecao`, `#i=79` (detalhe aberto), `#raia=digital::digital-batchsheet`
(resumo do projeto).

---

## Arquitetura

```
index.html                a aplicação: cabeçalho, filtros, árvore, gestão e <dialog> do detalhe
areas.html                índice das áreas, com contagens e endereço de incorporação
areas/<slug>/index.html   endereço estável de cada área; encaminha para a aplicação
config/areas.json         slug -> nome oficial da área + descrição
config/site.json          link do Forms, contato do Teams, textos do portal
assets/css/tokens.css     cores, tipografia, espaçamento, movimento e @font-face
assets/css/app.css        layout, componentes, responsivo, prefers-reduced-motion
assets/fonts/             Poppins 400/500/600 (latin e latin-ext) + licença OFL
assets/img/favicon.svg    ícone do portal
assets/js/data.js         carga, saneamento, derivações e índices do grafo
assets/js/tree.js         layout e render da árvore em SVG, zoom, destaque de cadeia
assets/js/panels.js       painel de gestão e painel de detalhe/resumo
assets/js/app.js          estado, filtros, hash e orquestração
assets/js/hub.js          monta o índice de areas.html
data/initiatives.json     escrito pelo Power Automate — não mexer
```

As páginas em `areas/<slug>/` são só o endereço: elas encaminham para
`index.html?area=<slug>` preservando a hash, em vez de repetir o HTML da
aplicação dez vezes — assim não existe cópia para dessincronizar quando o
`index.html` mudar.

Os quatro módulos JS conversam numa direção só:

```
app.js  ──▶  data.js   (carrega e deriva)
   │
   ├────▶  tree.js     (recebe os itens já filtrados)
   └────▶  panels.js   (recebe os mesmos itens)
```

### `data.js` — o que é derivado dos dados brutos

A Microsoft List entrega muito campo nulo, e isso é normal. A camada de dados
normaliza tudo antes de qualquer render:

- `technologies`, `gainTypes` e `dependsOn` viram listas simples.
- Texto passa por `DOMParser` → `textContent` → espaços normalizados → `null` se
  sobrar vazio. Nada de dado entra no DOM por `innerHTML`.
- Dependência inválida é descartada: para si mesma, para id inexistente ou que
  fecharia ciclo (o layout por nível trava com ciclo). O descarte sai num
  `console.warn` com o relatório.
- `Implantada` conta como 100% mesmo sem `progress`; `doneDate` só vale se o
  status for `Implantada`.

Campos derivados que a interface usa:

| Campo | Significado |
| --- | --- |
| `fase` | Planejamento, Execução, Entregue ou Interrompida |
| `bloqueada` | Tem dependência que ainda não está Implantada |
| `prontaParaIniciar` | Está em Planejamento e todas as dependências fecharam |
| `atrasada` / `diasAtraso` | `dueDate` no passado, fora de Implantada e Cancelada |
| `semAtualizacao` | `updatedAt` com mais de `staleDays` dias e fase ≠ Entregue |
| `independente` | Sem dependência e sem quem dependa dela |
| `chaveRaia` | `área::projeto` — o mesmo projeto existe em áreas diferentes |

### `tree.js` — os três modos de layout

Um SVG por render, com as raias como faixas empilhadas e **posições absolutas**:
por isso uma dependência que cruza projetos é desenhada como qualquer outra.

| Modo | Quando | Como fica |
| --- | --- | --- |
| Horizontal | a cadeia cabe na largura | colunas por nível, da esquerda para a direita |
| Serpentina | não cabe | quebra em zigue-zague, com conector curvo de continuidade |
| Vertical | abaixo de 600px | um card de largura total por linha, traço vertical entre eles |

Uma aresta que liga projetos diferentes desce por um corredor — o vão entre duas
colunas, que é livre de cards em toda a altura — e entra pela lateral do
destino. É isso que impede a curva de acabar escondida atrás de um card.

O nível de cada iniciativa é o **caminho mais longo** pelas dependências do
mesmo projeto, e os níveis são recompactados quando um filtro esvazia um deles.
A ordem das raias é topológica: se um projeto depende de outro, ele vem depois,
e as duas ficam vizinhas para a linha não atravessar raia alheia.

Zoom fica nos botões **+ / −**, no Ctrl+roda e na pinça — a roda sozinha nunca é
capturada, para não sequestrar a rolagem da página do SharePoint. Em 100% a
árvore inteira cabe na largura e não há nada a arrastar; passando disso, a área
vira uma superfície com cursor `grab`, inércia ao soltar e limite elástico. O
arrasto pode começar em cima de um card (que é quase toda a superfície): só
depois de 4px de movimento o gesto vira arrasto, e aí o clique não abre o
detalhe. Duplo clique num card enquadra ele no centro.

**Ampliar** expande a árvore sobre a área visível do iframe, escondendo
cabeçalho e painel de gestão — por CSS, não pela API de tela cheia, que costuma
ser bloqueada dentro de iframe. Sai pelo botão ou por Esc.

### `panels.js` — as três listas

Cada bloco mostra 5 itens e expande com "ver todas (N)":

1. **Atrasadas** — mais antiga primeiro, com quantos dias de atraso.
2. **Próximas** — o que está em execução (com selo `bloqueada` quando a
   dependência ainda não fechou, porque o que já começou não pode sumir da
   vista), depois o que está pronto para iniciar. Nada com dependência pendente
   entra pela porta das "prontas".
3. **Aguardando** — travadas que ainda não começaram, com de quem dependem e em
   que status a dependência está.

Seção sem conteúdo é omitida inteira, no painel e nos cards: nunca aparece
rótulo seguido de traço.

---

## Altura do web part

A página **não rola por dentro**: ela cresce com o conteúdo e quem rola é o
iframe. Por isso a altura do web part é o que decide se o gestor vê tudo de uma
vez ou precisa rolar.

Alturas reais do conteúdo, medidas com os 87 itens de hoje:

| Área | itens | 1200px | 900px | 640px | 380px |
| --- | --- | --- | --- | --- | --- |
| Digital | 18 | 2180px | 3030px | 4169px | 4270px |
| Confiabilidade | 14 | 2509px | 3160px | 4296px | 4095px |
| Automação | 12 | 2075px | 2534px | 3567px | 3563px |
| SGI | 10 | 1974px | 2309px | 3027px | 3055px |
| Laboratório | 8 | 1492px | 1638px | 2451px | 2460px |
| Produção | 8 | 1726px | 1995px | 2626px | 2593px |
| Processos | 6 | 1467px | 1779px | 2206px | 2228px |
| Manutenção | 5 | 918px | 1226px | 1717px | 1785px |
| Logística | 3 | 930px | 1029px | 1262px | 1392px |
| HSE | 3 | 906px | 1029px | 1244px | 1346px |
| Todas as áreas | 87 | 8785px | 9735px | 14620px | 14709px |

**Recomendação por porte de área**, para o monitor da planta (~1200px de largura
disponível), já com folga para a área crescer:

| Porte | Áreas de hoje | Altura do web part |
| --- | --- | --- |
| Grande (12+ iniciativas) | Digital (2180px), Confiabilidade (2509px), Automação | **2600px** |
| Média (6 a 11) | SGI, Laboratório, Produção, Processos | **2100px** |
| Pequena (até 5) | Manutenção, Logística (930px), HSE | **1000px** |

Duas observações que mudam a conta:

- **A altura cresce cerca de 60% no celular.** No app do Teams (~380px) a mesma
  Confiabilidade passa de 2509px para 4095px, porque cada iniciativa vira um
  card de largura total. Se o web part tiver altura fixa em pixels, no celular
  vai sobrar rolagem — o que está certo, é o iframe rolando.
- **A visão consolidada não cabe em web part nenhum** (8785px com 87 itens).
  Use `areas.html` como entrada e deixe o consolidado para quem abre o portal
  fora do SharePoint.

Se não quiser calibrar altura por área, o botão **Ampliar** resolve pelo outro
lado: a árvore passa a ocupar a área visível do iframe, seja ela qual for.

## Adicionar uma área nova

1. Confira como a área está escrita na coluna `area` da Microsoft List — o nome
   precisa bater **exatamente**, com acento e maiúsculas.
2. Acrescente a entrada em `config/areas.json`:

   ```json
   {
     "slug": "utilidades",
     "name": "Utilidades",
     "description": "Vapor, ar comprimido e água gelada."
   }
   ```

   O `slug` é o valor aceito em `?area=`: minúsculo, sem acento e sem espaço
   (`Manutenção` → `manutencao`).
3. Crie o endereço da área copiando qualquer pasta existente e trocando as duas
   ocorrências do slug e o nome:

   ```bash
   mkdir -p areas/utilidades
   sed 's/manutencao/utilidades/g; s/Manutenção/Utilidades/g' \
     areas/manutencao/index.html > areas/utilidades/index.html
   ```

4. Na página do SharePoint da área, incorpore
   `https://<usuário>.github.io/ita-digital-portal/areas/utilidades/`.
   O endereço de cada área também aparece pronto em `areas.html`.

Se o slug não existir na configuração, a página mostra "Área não encontrada" com
os slugs válidos — falha visível, para ninguém rodar meses com o embed errado.

---

## Antes de publicar

Troque os placeholders de `config/site.json`:

| Campo | Trocar por |
| --- | --- |
| `newInitiative.url` | Link do Microsoft Forms de nova iniciativa |
| `teams.email` | E-mail que recebe o chat do Teams |
| `teams.message` / `teams.initiativeMessage` | Textos que já vêm preenchidos no chat |

`staleDays` controla em quantos dias sem `updatedAt` uma iniciativa é marcada
como parada (padrão: 30).

---

## Decisões que valem saber

- **Sem `localStorage` e sem cookie.** Dentro do iframe do SharePoint eles podem
  ser bloqueados, então todo o estado vive na hash da URL.
- **Fontes versionadas.** A Poppins está em `assets/fonts/` e é carregada por
  `@font-face` local, com fallback de sistema declarado — a rede corporativa
  pode bloquear o Google Fonts. Licença SIL OFL, em `assets/fonts/OFL.txt`.
- **Nenhuma rolagem interna.** A página é um documento que flui: cabeçalho,
  árvore inteira e painel de gestão inteiro, com a altura dada pelo conteúdo.
  Quem rola é o iframe. As duas exceções são sobrepostas — o painel de detalhe
  e o modo Ampliar.
- **Árvore em cima, gestão embaixo**, as duas em largura total. A árvore é o
  elemento central e recebe a página inteira; as três listas da gestão se
  distribuem em três colunas acima de 900px, duas entre 600 e 900px e uma
  abaixo disso. Coluna com lista vazia não estica para acompanhar as outras.
- **Links externos** sempre com `target="_blank"` e `rel="noopener"`.
- **`prefers-reduced-motion`** desliga entrada escalonada, pulso, fluxo das
  arestas e preenchimento das barras.
