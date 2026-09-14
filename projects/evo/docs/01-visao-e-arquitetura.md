# Visão e arquitetura

Este é o ponto de entrada do projeto. Leia também [02-regras-da-simulacao.md](02-regras-da-simulacao.md) antes de alterar regras, parâmetros ou comportamento da simulação.

## Objetivo

Construir uma página HTML local que mostre, em p5.js, uma população de seres evoluindo para encontrar comida em uma ilha. Cada ser é controlado por uma rede neural leve cujos pesos evoluem por algoritmo genético.

A execução deve ser reproduzível por duas seeds independentes — mapa e simulação —, independente da taxa de renderização e utilizável em computadores lentos ou em modo acelerado.

## Restrições

- Aplicação estática executada localmente.
- p5.js e Chart.js armazenados no projeto; nenhum recurso carregado por CDN.
- CSP sem `unsafe-inline`; o único hash de estilo inline autoriza exatamente o indicador de carregamento do p5.js 2.3.2 fixado.
- JavaScript em módulos ES nativos, sem transpilação ou etapa de build.
- Desenvolvimento servido por HTTP local; publicação futura usa a raiz da `main` no GitHub Pages.
- Referências de assets sempre relativas para funcionar também em subcaminhos.
- Canvas com 100% da largura disponível e proporção do mundo preservada.
- Configurações padrão centralizadas em `config.js`.
- Estado da simulação separado de renderização e interface.
- Terreno, produtividade, leva inicial de comida e posições iniciais dos seres de cada geração são derivados da seed do mapa. Spawns posteriores, direções, decisões, eventos e genética são derivados da seed da simulação.
- Classes com responsabilidades explícitas; evitar um arquivo principal monolítico.

## Leitura e fonte de verdade

1. Este arquivo define objetivo, escopo e arquitetura.
2. [02-regras-da-simulacao.md](02-regras-da-simulacao.md) define o contrato do domínio e os valores padrão.
3. `src/config.js` materializa os defaults documentados sem redefinir as regras.

Em caso de divergência, a documentação deve ser corrigida junto com a implementação aprovada.

## Componentes esperados

| Componente | Responsabilidade |
| --- | --- |
| `Simulation` | Coordenar mundo, população, ticks, gerações e aplicação atômica da configuração dinâmica. |
| `SimulationClock` | Produzir passos fixos, pausa e aceleração. |
| `SeededRandom` | Gerar streams determinísticos independentes a partir de cada seed. |
| `Tile` | Representar terreno e produtividade. |
| `WorldMap` | Gerar e consultar o grid do arquipélago e seus lagos. |
| `Food` | Representar posição, energia inicial/restante e prazo individual de inatividade de uma comida. |
| `FoodSystem` | Selecionar tiles, controlar ocupação, agendar spawns e distribuir deterministicamente os prazos e realocações de comidas inativas, mantendo contadores agregados. |
| `Being` | Manter estado físico, sensores, cérebro, energia, vida, refeição ativa e fitness. |
| `GenerationInitializer` | Escolher posições iniciais distintas na ilha principal. |
| `PopulationSystem` | Coordenar seres, ações, física, alimentação e métricas. |
| `EyeSensor` | Calcular comida e a primeira transição de terreno ou borda em cada raio frontal. |
| `NeuralNetwork` | Executar inferência e expor pesos e biases como genoma. |
| `NeuralController` | Converter inputs em velocidade e giro e conservar a ação entre decisões. |
| `GeneticAlgorithm` | Selecionar, cruzar e mutar genomas entre gerações. |
| `Camera2D` | Transformar coordenadas entre mundo e tela sem acessar o domínio. |
| `Renderer` | Desenhar com p5.js sem modificar o estado simulado. |
| `UIController` | Ler controles, comandar a execução e apresentar métricas. |
| `GenerationChart` | Projetar o histórico evolutivo e suas médias móveis com Chart.js. |
| `GenerationTimelineChart` | Projetar séries temporais em linhas ou barras com Chart.js, sem acessar ou alterar a simulação. |
| `SettingsStore` | Validar e persistir somente controles e preferências locais versionadas. |
| `PerformanceProfiler` | Medir etapas síncronas da thread principal sem integrar estado, aleatoriedade ou snapshots do domínio. |
| `PerformanceDebugPanel` | Apresentar contexto operacional e agregados do profiler em uma tabela acessível e atualizada com baixa frequência. |

O agrupamento em arquivos pode ser ajustado durante a implementação. As responsabilidades e a separação entre simulação e desenho devem permanecer.

## Estado da implementação

A implementação atual contém `Simulation`, `SimulationClock`, `SeededRandom`, mapa, comida, população, seres, olhos, rede neural, algoritmo genético, física, consumo, câmera, renderização, interface, configuração validada e servidor estático local. O canvas apresenta um arquipélago determinístico equilibrado, com uma ilha central e oito ilhas secundárias relevantes, em camada cacheada, além de comidas dinâmicas, sensores, seres inspecionáveis e barras discretas de vida e energia.

Leva inicial, eventos de spawn, alimentação compartilhada com alvo persistente, energia por produtividade, prazos individuais seedados e realocação por inatividade, visão frontal simétrica de costa, sinais globais de alcance seguro e refeição ativa, olho inferior de terreno, inferência neural, movimento, custos, fome, cura, morte, fitness, seleção, arquivo global de elites, crossover, mutação e troca contínua de geração estão implementados. Em terra, os raios detectam a primeira água ou borda; na água, a primeira terra ou borda. O histórico retém todas as gerações da execução, o melhor resultado global, a média do Top K global e a média dos melhores 10% de cada geração. Cada geração conserva também uma timeline amostrada no tick zero, a cada segundo simulado e no tick terminal.

## Relógio e renderização

A simulação avança somente por ticks fixos fornecidos por `SimulationClock`. Entidades não consultam `millis()`, `performance.now()` ou o frame rate diretamente.

O modo acelerado executa mais ticks entre renderizações; ele não aumenta o tamanho do passo físico. Se o computador não acompanhar a velocidade solicitada, o tempo simulado fica mais lento em vez de pular ticks ou alterar a física.

Zoom, pan, redimensionamento, seleção, acompanhamento manual, acompanhamento do melhor ser vivo e barras de estado são transformações visuais. As barras usam dimensões do mundo, portanto crescem com o zoom sem alterar mundo, sensores, seed ou resultados.

### Diagnóstico de desempenho

Uma camada de observabilidade opcional mede tempo decorrido na thread principal com um relógio monotônico independente daquele injetado no `SimulationClock`. A sessão começa antes da construção disparada por **Iniciar**, portanto inclui validação, mapa e população inicial, mas não a prévia automática. Pausar congela os agregados, continuar retoma a mesma sessão e reiniciar abre outra. Nova execução e restauração dos padrões descartam a sessão.

O profiler recebe spans síncronos de preparação, ticks, sensores, cérebro, física, comida, evolução, snapshots, interface e desenho. Ele conserva até 300 durações recentes por etapa para último valor, média, P95 e máximo; chamadas e total abrangem a sessão. Os snapshots diagnósticos são imutáveis e separados de `Simulation.getSnapshot()`. Medir pode reduzir o throughput real do modo máximo, mas nunca altera a sequência de ticks, streams aleatórios ou o estado obtido depois de uma mesma quantidade de ticks.

## Configuração e interface

`config.js` contém os defaults de:

- mapa e geração da ilha;
- relógio e limites de aceleração;
- população, energia e movimento;
- comida e produtividade;
- olhos e rede neural;
- algoritmo genético;
- zoom e aparência.

A barra antes do canvas expõe pelo menos:

- seed da simulação;
- seed do mapa;
- prévia automática do mapa;
- quantidade de seres;
- comida inicial;
- quantidade, intervalo de spawn, máximo simultâneo, energia e inatividade da comida;
- tempo máximo por geração;
- velocidade da simulação;
- iniciar ou reiniciar;
- pausar ou continuar.

Na etapa atual, a interface distribui as configurações em seis grupos recolhíveis por tema: população e geração, comida, custos e sobrevivência, cérebro neural, evolução e seeds, nesta ordem. Uma única barra sticky, anterior ao painel de configuração, conserva velocidade, `Iniciar/Reiniciar` e `Pausar/Continuar` disponíveis durante toda a rolagem; ações secundárias permanecem no painel. A prévia padrão mostra mapa, comida, seres e percepção inicial. Campos aguardam 300 ms sem alterações; botões `Aleatório` aplicam imediatamente. Alterar a seed da simulação muda direções e genomas, mas não reposiciona seres nem recria o terreno em outro resultado. Nenhuma prévia inicia ticks. `Iniciar` aplica os valores atuais; `Reiniciar` reutiliza a configuração ativa. Erros preservam a última prévia válida.

Na primeira abertura sem preferências, a interface cria duas seeds UUID independentes. Configurações válidas, velocidade e recorte do gráfico são persistidos sob uma chave versionada do `localStorage`; estado evolutivo, histórico, câmera e seleção permanecem apenas na sessão. `Restaurar padrões` encerra a execução, limpa a chave do app e aplica `DEFAULT_CONFIG` após confirmação.

Seeds, olhos, frequência e topologia neural ficam bloqueados durante uma execução. População, comida inicial, quantidade e intervalo dos spawns, máximo simultâneo, energia mínima/máxima, inatividade da comida, tempo máximo, custos, sobrevivência e os cinco parâmetros genéticos continuam editáveis durante execução ou pausa. Após 300 ms, a interface valida a configuração completa e a aplica atomicamente: quantidade e intervalo de spawn passam a valer na geração atual; população, comida inicial, máximo, energia, inatividade, limite de tempo, custos, sobrevivência e evolução passam a valer na próxima reprodução. A geração em andamento conserva integralmente suas políticas ativas. O snapshot expõe `foodPolicy` e `beingPolicy`, enquanto a interface diferencia valores atuais dos pendentes. Uma entrada inválida preserva a configuração ativa e a última preferência válida. `Reiniciar` usa a configuração válida mais recente desde a geração 1. Todos os controles configuráveis possuem ajuda contextual acessível por mouse, teclado e toque.

Depois dos controles, a ordem visual e semântica é mundo e inspetor, métricas agregadas, histórico evolutivo e dinâmica temporal. São mostrados geração, tempos da geração e total, gerações concluídas, seres vivos, comidas existentes, fitness atual e melhor histórico. O painel recolhível “Custos e sobrevivência” permite explorar movimento, metabolismo, penalidade da água, fome e cura sem alterar uma geração já iniciada. O resumo do mundo também informa a participação terrestre da ilha principal e compara sua produtividade média com a das secundárias, que recebem bônus crescente conforme diminuem. O gráfico evolutivo conserva todas as gerações e alterna entre as 50 últimas e a série completa. Ele sobrepõe melhor fitness, média geral, média do Top K global e média dos melhores 10% às respectivas médias móveis de dez gerações. Um dashboard separado permite acompanhar a geração atual ou fixar qualquer geração concluída em sete gráficos Chart.js de população, comida, condição, fitness, movimento, mortes e fluxo de alimentos; o gráfico de fitness acrescenta médias móveis de cinco segundos e botões anterior/próxima percorrem o histórico. O fluxo agrega visualmente as amostras de um segundo em janelas de cinco segundos, sem alterar a timeline do domínio, e considera realocações como criações. O inspetor apresenta estado, comida alvo e tabelas explicativas das 16 entradas e duas saídas neurais do ser, ou energia e tempo restante até a realocação de uma comida. A câmera oferece roda, arraste, pinça, acompanhamento manual, modo persistente “Seguir melhor”, botões e reenquadramento entre `1×` e `8×`. Ao terminar por extinção ou limite de tempo, a geração é registrada e a próxima começa imediatamente; somente uma ação do usuário pausa o ciclo.

Depois dos gráficos, “Diagnóstico de desempenho” permanece recolhido por padrão. Ao ser aberto, atualiza no máximo quatro vezes por segundo o contexto operacional e as tabelas hierárquicas de tempo. Essa apresentação, inclusive sua própria sobrecarga, não é persistida e não pertence ao domínio.

## Escopo inicial

Incluído:

- arquipélago determinístico com ilha principal, ilhas secundárias, lagos, mar e produtividade;
- comida discreta e compartilhável;
- seres com visão frontal, velocidade e giro;
- rede neural configurável;
- gerações síncronas por algoritmo genético;
- execução normal, pausada e acelerada;
- inspeção básica, zoom e pan.

Fora do escopo inicial:

- colisão entre seres;
- reprodução durante uma geração;
- visão ou interação direta entre seres;
- persistência e importação de genomas ou execuções; somente preferências locais são salvas;
- genealogia, especiação, comparação sobreposta entre gerações e exportação das séries;
- servidor de aplicação, conta de usuário ou integração remota. O servidor HTTP local serve apenas arquivos estáticos durante o desenvolvimento.

## Critérios gerais de conclusão

- A aplicação funciona sem recursos remotos.
- Mesmas seeds, configuração e quantidade de ticks produzem o mesmo estado.
- Executar em velocidades visuais diferentes não muda o resultado por tick.
- Renderização nunca altera a simulação.
- As regras e os defaults de [02-regras-da-simulacao.md](02-regras-da-simulacao.md) estão cobertos por validação automatizada quando forem lógica pura.
