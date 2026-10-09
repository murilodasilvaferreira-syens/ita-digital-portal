# Site da área Digital — Syensqo Itatiba

Site interno da Transformação Digital da planta. Todas as páginas são
publicadas no GitHub Pages e incorporadas em páginas do SharePoint por iframe:

| Página | O que é |
| --- | --- |
| `home.html` | **Início** — busca única, destinos, a planta em números, trilhas e movimento recente |
| `hub.html` | **Roadmaps** — pulso das áreas e um card por área |
| `index.html?area=<slug>` | Roadmap de dependências de uma área (sem `area`, todas) |
| `areas/<slug>/` | Endereço estável de cada área, para colar no iframe; encaminha para `index.html?area=` |
| `indicadores.html` | **Indicadores** — o Observatório da Transformação, calculado dos dados reais |
| `academia.html` | **Academia Digital** — trilhas, perfis, casos, curiosidade e recursos |
| `noticias.html` | **Notícias** — listagem editorial e leitura do artigo em `#/<slug>` |
| `areas.html` | Índice técnico, com o endereço de incorporação de cada área |

É um site estático puro — sem build, sem npm, sem framework e sem nenhuma
requisição a domínio externo. Fontes, ícones e bibliotecas ficam versionados em
`assets/`.

O visual segue o **Portal Digital v2** feito no Claude Design (o `.zip` de
referência está na raiz do repositório): Instrument Serif nos títulos, Geist na
interface, Geist Mono em rótulos e dados, cartões de vidro, navegação em pílula
flutuante e gráficos desenhados em SVG/CSS a partir dos JSON.

---

## Como funciona

```
Microsoft List (SharePoint)
        │  o analista mantém as iniciativas
        ▼
Power Automate  ── de hora em hora ──▶  data/initiatives.json  (via API do GitHub)
        │
        ▼
GitHub Pages  ──▶  iframe na página do SharePoint  ──▶  areas/manutencao/
```

> **`data/initiatives.json` é escrito só pelo Power Automate.**
> Não edite, não formate e não gere esse arquivo à mão: a próxima execução do
> fluxo sobrescreve tudo. O portal apenas lê.

As outras fontes são editadas à mão, e é nelas que se publica conteúdo — o
JavaScript não tem conteúdo dentro dele:

| Arquivo | O que guarda |
| --- | --- |
| `config/areas.json` | slug → nome oficial da área, descrição, `pageUrl` e `ocultarEstatisticas` |
| `config/site.json` | link do Forms de nova iniciativa, contato do Teams, `staleDays` |
| `data/academia/*.json` | trilhas e perfis, recursos, casos, curiosidade e textos da Academia |
| `content/noticias/` | `index.json`, um `.md` por artigo e as imagens de capa |

---

## Rodar localmente

O `fetch` dos JSON não funciona abrindo o arquivo pelo duplo clique (`file://`
bloqueia módulos ES e requisições). Suba um servidor na raiz:

```bash
python -m http.server 8000      # Windows
python3 -m http.server 8000     # macOS / Linux
```

| URL | O que mostra |
| --- | --- |
| `http://localhost:8000/home.html` | Início |
| `http://localhost:8000/hub.html` | Roadmaps (`#ordem=avanco` ordena os cards pelo avanço) |
| `http://localhost:8000/areas/confiabilidade/` | Roadmap de uma área, pelo endereço estável |
| `http://localhost:8000/index.html` | Todas as áreas, consolidado |
| `http://localhost:8000/index.html?area=xyz` | Estado "Área não encontrada" |
| `http://localhost:8000/indicadores.html#periodo=ano&area=digital` | Indicadores filtrados |
| `http://localhost:8000/academia.html#trilha=power-apps` | Academia com o detalhe de uma trilha aberto |
| `http://localhost:8000/noticias.html#/o-que-e-rag` | Uma notícia aberta |
| `http://localhost:8000/areas.html` | Índice técnico |

O estado da interface vai sempre na hash, então todo endereço acima pode ser
compartilhado. No roadmap valem as chaves de sempre: `#fase=execucao,planejamento`,
`#projeto=<slug>`, `#tech=<slug>`, `#q=<texto>`, `#i=79` (etapa aberta) e
`#raia=digital::digital-batchsheet` (resumo do projeto).

---

## Arquitetura

```
home.html  hub.html  index.html  indicadores.html  academia.html  noticias.html  areas.html
areas/<slug>/index.html   endereço estável de cada área; encaminha preservando a hash
.nojekyll                 impede o Jekyll do Pages de mexer nos arquivos

assets/css/tokens.css     única fonte de verdade visual: cores, status, tipografia, raios, sombras, movimento, @font-face
assets/css/base.css       reset, casca (nav, rodapé, fio de progresso), tipografia de display, vidro, cartão,
                          botões, campos, chips, selos, painel lateral (gaveta) e revelação ao rolar
assets/css/<página>.css   só o que é daquela página (home, roadmaps, roadmap, indicadores, academia, noticias, areas)

assets/js/shell.js        casca compartilhada: nav em pílula, rodapé, revelação, brilho dos cartões, links do Teams/Forms
assets/js/ui.js           utilitários de DOM, hash, debounce, contagem animada
assets/js/data.js         carga e saneamento das iniciativas, fase derivada, índices do grafo
assets/js/metricas.js     todos os números derivados das iniciativas (Início, Roadmaps e Indicadores usam os mesmos)
assets/js/conteudo.js     artigos e trilhas: leitura, ordenação, tempo de leitura, datas
assets/js/grafo.js        layout do roadmap — só geometria, sem DOM
assets/js/quadro.js       quadro de dependências: cards sobre arestas SVG, zoom, arrasto, destaque de cadeia
assets/js/atencao.js      "O que pede atenção": atrasadas, próximas e aguardando
assets/js/gaveta.js       painel lateral do roadmap: detalhe da etapa ou resumo do projeto
assets/js/roadmap.js      orquestra index.html: estado na hash, filtros, render
assets/js/home.js | roadmaps.js | indicadores.js | academia.js | noticias.js | areas.js   uma por página

assets/icons/icones.js    conjunto de ícones SVG do site
assets/fonts/             Instrument Serif, Geist e Geist Mono (subconjunto latin) + licenças OFL
assets/img/               favicon e as imagens de fundo do Início, em WebP e JPEG, dois tamanhos
assets/vendor/            marked (MIT), versionado com a licença
```

Regras que valem para todas as páginas:

- **Uma página = um HTML + um CSS + um módulo JS.** Tudo que se repete entre
  páginas mora em `tokens.css`, `base.css`, `shell.js`, `metricas.js` ou
  `conteudo.js` — não há CSS duplicado entre páginas.
- **Cor nova vira token.** Nenhum CSS de página inventa valor solto de cor,
  raio ou sombra que outra página também precise.
- **Todo dado entra por `textContent`.** A única exceção é o corpo do artigo de
  Notícias (ver abaixo).
- **Fonte que falha não derruba a página.** Cada página carrega suas fontes em
  paralelo; se uma falhar, só a seção dela some.

### Paleta de status

Uma paleta só para o site todo, definida em `tokens.css` e usada pelo roadmap,
pelos cards de Roadmaps e por todos os gráficos de Indicadores:

| Status | Token | Cor |
| --- | --- | --- |
| Implantada | `--st-implantada` | laranja `#e8752a` |
| Em desenvolvimento | `--st-desenvolvimento` | laranja médio `#f0a472` |
| Dependente | `--st-dependente` | areia `#cfc5b6` |
| Backlog | `--st-backlog` | grafite `#6b6459` |
| Ideia | `--st-ideia` | areia clara `#e3d9c8` |

O roadmap ainda agrupa os status em **fases** (Planejamento, Execução, Entregue,
Interrompida) para filtros e contagens — ver `data.js`.

### `data.js` — o que é derivado dos dados brutos

A Microsoft List entrega muito campo nulo, e isso é normal. A camada de dados
normaliza tudo antes de qualquer render:

- **Linha em branco é descartada:** registro sem título **e** sem status (linha
  vazia criada na lista) não entra em nenhuma contagem.
- `technologies`, `gainTypes` e `dependsOn` viram listas simples.
- Texto passa por `DOMParser` → `textContent` → espaços normalizados → `null`
  se sobrar vazio.
- Dependência inválida é descartada: para si mesma, para id inexistente ou que
  fecharia ciclo. O descarte sai num `console.warn`.
- `Implantada` conta como 100% mesmo sem `progress`; `doneDate` só vale se o
  status for `Implantada`.

| Status da lista | Fase |
| --- | --- |
| Ideia, Em análise, Aprovada, Backlog, **Dependente** | Planejamento |
| Em desenvolvimento, Em testes | Execução |
| Implantada | Entregue |
| Em pausa, Cancelada | Interrompida |

"Dependente" é planejamento: a etapa espera outra terminar e ainda não começou.
Status desconhecido também cai em Planejamento.

| Campo derivado | Significado |
| --- | --- |
| `fase` | Planejamento, Execução, Entregue ou Interrompida |
| `bloqueada` | Tem dependência que ainda não está Implantada |
| `prontaParaIniciar` | Está em Planejamento e todas as dependências fecharam |
| `atrasada` / `diasAtraso` | `dueDate` no passado, fora de Implantada e Cancelada |
| `semAtualizacao` | `updatedAt` com mais de `staleDays` dias e fase ≠ Entregue |
| `chaveRaia` | `área::projeto` — o mesmo projeto existe em áreas diferentes |

---

## Início (`home.html`)

Não tem conteúdo próprio — tudo sai, ao vivo, dos mesmos arquivos que as outras
páginas leem.

| Bloco | De onde vem |
| --- | --- |
| **Busca única** (Ctrl/⌘ K) | Índice em memória com iniciativas, trilhas e artigos; resultados agrupados por frente, com escopo Roadmaps/Academia/Notícias |
| **Letreiro** | Nomes das áreas de `config/areas.json` |
| **Destinos** | Roadmaps: implantadas no mês pela `doneDate`. Academia: trilhas disponíveis. Notícias: último artigo, com selo NOVO até 14 dias |
| **A planta em números** | Portfólio por status, evolução das implantadas, matriz prioridade × complexidade, ritmo por área e leituras — tudo de `metricas.js` |
| **Trilhas** | Até três trilhas; "em breve" vira um "Avise-me" pelo Teams |
| **Movimento recente** | Artigos + implantadas pela data de conclusão, mais recentes primeiro |

O ritmo por área conta só meses já ocorridos: data de início planejada no
futuro não é movimento.

## Roadmaps (`hub.html`)

O **pulso das áreas** desenha cada área como um nó (tamanho = volume, cor =
avanço médio, linhas tracejadas = projetos em comum). Abaixo, um card por área,
ordenável por volume ou por avanço.

O card leva ao **`pageUrl`** da área em `config/areas.json` — a página dela no
SharePoint — em nova aba, porque o hub roda num iframe e um link comum abriria a
página espremida nele. Sem `pageUrl`, o card abre o roadmap da área no próprio
portal. `ocultarEstatisticas: true` mostra só o nome e o acesso. Etapas sem área
preenchida aparecem num card "Outros", que leva à visão de todas as áreas.

## Roadmap de dependências (`index.html`)

Cada projeto é uma **raia**; cada etapa, um card. As arestas mostram quem
depende de quem, inclusive entre projetos e entre áreas.

- **Layout** (`grafo.js`): horizontal quando a raia cabe, serpentina quando
  não cabe, vertical abaixo de ~600px. O nível de cada etapa é o caminho mais
  longo pelas dependências; as raias seguem ordem topológica. Arestas entre
  projetos descem por corredores livres de card.
- **Quadro** (`quadro.js`): zoom pelos botões, Ctrl+roda e pinça — a roda
  sozinha nunca é capturada, para não sequestrar a rolagem do SharePoint.
  Acima de 100% o quadro arrasta com inércia. Passar o mouse num card acende a
  cadeia (o que vem antes e o que vem depois). **Ampliar** expande o quadro
  sobre a área visível do iframe, por CSS (a API de tela cheia costuma ser
  bloqueada em iframe); sai por Esc.
- **O que pede atenção** (`atencao.js`): atrasadas, próximas e aguardando,
  cinco por lista com "ver todas".
- **Painel lateral** (`gaveta.js`): detalhe da etapa ou resumo do projeto, sem
  bloquear o quadro. Navegar por uma dependência empilha o painel; "voltar"
  desempilha.

Seção sem dado some inteira: nunca aparece rótulo seguido de traço.

## Indicadores (`indicadores.html`)

O Observatório da Transformação. Nove painéis e seis KPIs, todos calculados no
navegador (`metricas.js`), com filtros de **período** (tudo, este mês, este
ano), **área** e **tema** (tipo de ganho) guardados na hash
(`#periodo=mes&area=<slug>&tema=<slug>`).

| Painel | Como é calculado |
| --- | --- |
| KPIs | Projetos distintos, etapas, implantadas, áreas, trilhas e artigos. A variação compara o mês corrente com o anterior pela data real (`requestedDate`, `doneDate`); sem base no mês anterior não há variação |
| Evolução do portfólio | Acumulado dos últimos 6 meses com registro: implantadas por `doneDate`, iniciadas por `startDate`, backlog por `requestedDate` sem início; ou solicitações × entregas |
| Atividade do ano | Cada acontecimento pela sua data real; meses futuros aparecem tracejados (datas previstas) |
| Tecnologias | Cada tecnologia conta uma vez por iniciativa |
| Matriz prioridade × complexidade | Bolhas por status em cada célula; sem classificação fica de fora e é informado |
| Áreas em movimento | Iniciativas por área × status, cada coluna com escala própria; "Sem área" por último |
| Fluxo de transformação | Sankey área → tecnologia → status; cada iniciativa vale 1 e divide o peso entre suas tecnologias |
| Distribuição do progresso | Um ponto por iniciativa, em seis faixas |
| Academia / Produção de conteúdo | `trilhas.json` e `content/noticias/index.json` (artigos por mês ou trimestre) |

"Filtrar por período" mantém as etapas com alguma data real (solicitação,
início, conclusão ou atualização) dentro do período. O mockup mostrava
visualizações e usuários únicos simulados em "Produção de conteúdo"; como não
existe fonte para isso, o painel mostra só o que é real (artigos, categorias e
data do último).

## Academia Digital (`academia.html`)

| Arquivo em `data/academia/` | O que guarda |
| --- | --- |
| `trilhas.json` | As trilhas e os perfis de "Por onde começar" |
| `recursos.json` | A biblioteca de recursos (sempre em nova aba; só `http(s)`) |
| `casos.json` | Os casos de sucesso (texto corrido ou `desafio`/`solucao`/`resultado`) |
| `curiosidade.json` | A curiosidade da semana |
| `site.json` | Kicker, título, frase de apoio e o convite do Teams |

Os números do topo e o trilho do catálogo são **calculados** de `trilhas.json`.
O detalhe de uma trilha abre num painel lateral e fica em `#trilha=<id>` — o
endereço que o Início, a busca e os Indicadores usam.

Para acrescentar uma trilha, inclua um item em `trilhas.json`:

```json
{
  "id": "power-bi",
  "nome": "Power BI",
  "icone": "barras",
  "descricao": "Construa relatórios e dashboards interativos de dados.",
  "nivel": "Iniciante",
  "ferramenta": "Power BI",
  "disponivel": true,
  "link": "https://…",
  "duracaoHoras": 5,
  "aulas": 8,
  "publico": "Quem acompanha indicadores e quer montar o próprio painel.",
  "aprende": ["Conectar a primeira fonte", "Modelar os dados", "Publicar o relatório"],
  "preRequisitos": ["Conta Microsoft 365 da Syensqo"]
}
```

- `disponivel: false` põe a trilha em **Em breve**; aí `link` pode faltar.
- `nivel` usa Iniciante, Intermediário ou Avançado (os pontinhos de nível).
- `duracaoHoras`, `aulas`, `aprende`, `preRequisitos` e `publico` são opcionais:
  cada um some quando não existe.
- `dataDisponibilizacao` (opcional, `AAAA-MM-DD`) faz a trilha entrar na
  "Atividade do ano" dos Indicadores.
- Cada perfil em `perfis` aponta para o `id` de uma trilha. Perfil apontando
  para trilha inexistente é ignorado.

## Notícias (`noticias.html`)

Publicar uma notícia são **dois passos**.

**1. Escreva o artigo** em `content/noticias/<slug>.md` (slug minúsculo, sem
acento, com hífens):

```markdown
Abertura em um parágrafo, que é o que prende a leitura. Sem repetir o título.

## Primeiro subtítulo

Texto. Pode usar **negrito**, *itálico*, [link](https://…), listas, tabelas,
citação com `>` e bloco de código.
```

**2. Acrescente ao índice** `content/noticias/index.json`:

```json
{
  "slug": "nome-do-arquivo-sem-md",
  "titulo": "Título da publicação",
  "data": "2026-09-21",
  "categoria": "IA",
  "resumo": "Uma ou duas frases que aparecem no card e no topo do artigo.",
  "autor": "Seu nome",
  "destaque": false,
  "link": "",
  "capa": "",
  "rascunho": false
}
```

| Campo | Para que serve |
| --- | --- |
| `destaque` | `true` põe a publicação na manchete; sem nenhum, entra a mais recente |
| `link` | Botão "Abrir link relacionado" no fim do artigo |
| `capa` | Imagem em `content/noticias/img/`; sem ela, a mídia usa a inicial em tipografia |
| `rascunho` | `true` marca visivelmente que o texto ainda está sendo escrito |

O **tempo de leitura é calculado** do texto (200 palavras por minuto). As
categorias saem sozinhas do índice. A leitura abre em `noticias.html#/<slug>`,
em página inteira — o mockup previa um painel lateral, mas ele teria rolagem
interna dentro do iframe; aqui a página cresce com o texto. Slug inexistente
mostra "Artigo não encontrado".

O corpo do artigo é a **única** parte do site renderizada como HTML. Por isso o
HTML embutido no Markdown fica desligado (uma tag aparece como texto), e link ou
imagem só aceitam `http:`, `https:` e `mailto:` — `javascript:` e `data:` perdem
o atributo. O renderizador é o `marked`, versionado em `assets/vendor/`.

---

## Altura do web part

A página **não rola por dentro**: ela cresce com o conteúdo e quem rola é o
iframe. Alturas medidas com os dados de hoje (89 etapas válidas):

| Roadmap da área | etapas | 1200px | 380px |
| --- | --- | --- | --- |
| Digital | 18 | 3150px | 5680px |
| Confiabilidade | 14 | 3260px | 5490px |
| Automação | 12 | 2730px | 4730px |
| SGI | 10 | 2740px | 4350px |
| Produção | 8 | 2460px | 3850px |
| Laboratório | 8 | 2230px | 3580px |
| Processos | 6 | 2180px | 3400px |
| Manutenção | 5 | 1580px | 3100px |
| Logística | 3 | 1570px | 2650px |
| HSE | 3 | 1570px | 2540px |
| Todas as áreas | 89 | 10740px | 18690px |

| Página | 1200px | 380px |
| --- | --- | --- |
| Início | 5340px | 8590px |
| Roadmaps | 2570px | 5240px |
| Indicadores | 2760px | 5980px |
| Academia | 5400px | 7810px |
| Notícias (lista) | 2100px | 2460px |

Sugestão para o monitor da planta (~1200px): **3300px** para as áreas grandes
(12+ etapas), **2800px** para as médias e **1700px** para as pequenas. No
celular a altura cresce bastante porque cada card ocupa a largura toda — com
altura fixa, sobra rolagem, o que está certo: é o iframe rolando. A visão
consolidada não cabe em web part nenhum; use `hub.html` como entrada. Se não
quiser calibrar altura, o botão **Ampliar** do roadmap resolve pelo outro lado.

---

## Adicionar uma área nova

1. Confira como a área está escrita na coluna `area` da Microsoft List — o nome
   precisa bater **exatamente**, com acento e maiúsculas.
2. Acrescente a entrada em `config/areas.json`:

   ```json
   {
     "slug": "utilidades",
     "name": "Utilidades",
     "description": "Vapor, ar comprimido e água gelada.",
     "pageUrl": "",
     "ocultarEstatisticas": false
   }
   ```

   O `slug` é o valor aceito em `?area=`: minúsculo, sem acento e sem espaço.
3. Crie o endereço da área copiando uma pasta existente:

   ```bash
   mkdir -p areas/utilidades
   sed 's/manutencao/utilidades/g; s/Manutenção/Utilidades/g' \
     areas/manutencao/index.html > areas/utilidades/index.html
   ```

4. Na página do SharePoint da área, incorpore
   `https://<usuário>.github.io/ita-digital-portal/areas/utilidades/` (o
   endereço também aparece pronto, com botão de copiar, em `areas.html`).
5. Cole o endereço dessa página do SharePoint no `pageUrl` da área.

Área na lista que não existe em `config/areas.json` aparece como aviso em
`areas.html`; slug errado no iframe mostra "Área não encontrada" com os slugs
válidos.

---

## Antes de publicar

Troque os placeholders de `config/site.json`:

| Campo | Trocar por |
| --- | --- |
| `newInitiative.url` | Link do Microsoft Forms de nova iniciativa (botão "Nova iniciativa" da navegação e do Início) |
| `teams.email` | E-mail que recebe os chats do Teams (rodapé, "Avise-me" das trilhas, "Seguir no Teams") |
| `teams.message` / `teams.initiativeMessage` | Textos que já vêm preenchidos no chat |

`staleDays` controla em quantos dias sem `updatedAt` uma etapa é marcada como
parada (padrão: 30).

---

## Decisões que valem saber

- **Sem `localStorage` e sem cookie.** Dentro do iframe do SharePoint eles podem
  ser bloqueados, então todo estado vive na hash da URL.
- **Fontes versionadas.** Instrument Serif, Geist e Geist Mono ficam em
  `assets/fonts/` (subconjunto latin, WOFF2), carregadas por `@font-face` local
  com fallback de sistema — a rede corporativa pode bloquear o Google Fonts.
  Licenças SIL OFL ao lado dos arquivos.
- **Nenhuma rolagem interna.** Quem rola é o iframe. As exceções são sobrepostas
  e fecham por Esc: os painéis laterais (roadmap e Academia) e o modo Ampliar.
- **Revelação ao rolar com salvaguarda.** Cartões e gráficos entram em cena ao
  aparecer na tela; num iframe em segundo plano (sem callbacks do
  IntersectionObserver) tudo aparece sozinho depois de ~1,6s.
- **`prefers-reduced-motion`** desliga revelação, letreiro, pulsos, contagens e
  transições dos gráficos — tudo aparece no estado final.
- **Links externos** sempre com `target="_blank"` e `rel="noopener"`, e só
  `http(s)` vira link.
