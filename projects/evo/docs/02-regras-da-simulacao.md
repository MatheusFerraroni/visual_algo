# Regras da simulação

Este documento é o contrato do domínio. Os números abaixo são defaults configuráveis, mas suas unidades e relações não devem mudar silenciosamente.

## Defaults

| Área | Parâmetro | Valor inicial |
| --- | --- | ---: |
| Mundo | Colunas e linhas | 128 × 128 tiles |
| Mundo | Tamanho lógico do tile | 16 × 16 px |
| Seed | Simulação | `evo-1` |
| Seed | Mapa | `evo-1` |
| Terreno | Escala, oitavas | `0,075`, 4 |
| Terreno | Persistência, lacunaridade | `0,5`, `2` |
| Terreno | Pesos noise/radial | `70%` / `30%` |
| Terreno | Terra total | `46%..49%` do mapa |
| Terreno | Ilha principal | `50%..65%` da terra |
| Terreno | Ilhas secundárias | 8, com mínimo de 256 tiles cada |
| Terreno | Lagos internos | 4 a 8 planejados, com 4 a 32 tiles |
| Produtividade | Escala, oitavas | `0,10`, 3 |
| Produtividade | Persistência, lacunaridade | `0,55`, `2` |
| Produtividade | Massa total | `5.760` |
| Produtividade | Alcance do bônus de água | 6 tiles |
| Produtividade | Bônus máximo de água | `0,35` |
| Produtividade | Bônus máximo por ilha menor | `50%` |
| Tempo | Frequência física | 30 ticks/s |
| Tempo | Frequência do cérebro | 10 decisões/s |
| Tempo | Velocidades | `1×`, `2×`, `4×`, `8×`, `máximo` |
| Tempo | Orçamento do modo máximo | 8 ms por frame |
| Tempo | Delta real máximo aceito | 250 ms por frame |
| Interface | Espera da prévia automática | 300 ms |
| Geração | Duração máxima | 120 s simulados |
| Geração | Histórico mantido | Todas as gerações da execução atual |
| População | Seres | 40 |
| Ser | Vida inicial e máxima | 100 |
| Ser | Energia inicial | 60 |
| Ser | Energia máxima | 100 |
| Movimento | Velocidade máxima | 1 tile/s |
| Movimento | Giro máximo | 180°/s |
| Energia | Metabolismo basal | 0,75/s |
| Energia | Coeficiente de movimento | 4 |
| Energia | Expoente de movimento | 2 |
| Energia | Custo máximo de giro | 1/s |
| Água | Multiplicador de movimento | 3 |
| Vida | Perda com energia zero | 20/s |
| Cura | Limiar de energia | 80 |
| Cura | Conversão | 2 energia : 1 vida |
| Cura | Recuperação máxima | 1 vida/s |
| Comida | Quantidade inicial | 20 |
| Comida | Intervalo de spawn | 3 s simulados |
| Comida | Quantidade por spawn | 3 |
| Comida | Máximo simultâneo | 300 |
| Comida | Consumo por ser | 3/s |
| Comida | Energia mínima e máxima | 10 a 50 |
| Comida | Realocação por inatividade | mínimo de 30 s + `0..30` s seedados; `0` desativa |
| Comida | Distância para comer | 1 tile |
| Comida | Distância neural segura | 90% da distância para comer (0,9 tile) |
| Comida | Energia para iniciar uma refeição | abaixo de 90 |
| Olhos | Quantidade | 5 frontais + 1 inferior fixo |
| Olhos | Campo de visão | 120° |
| Olhos | Alcance | 6 tiles |
| Rede | Camadas ocultas | `[12]` |
| Rede | Ativação padrão | `tanh` |
| Rede | Topologia padrão | `16 → 12 → 2` (230 genes) |
| Rede | Faixa inicial dos genes | `-1..1` |
| Rede | Limites absolutos dos genes | `-5..5` |
| Rede | Quantização | 9 casas decimais |
| Câmera | Zoom e passo dos botões | `1×..8×`, fator `1,25` |
| Genética | Melhores genomas preservados | 4 seres |
| Genética | Torneio | 3 indivíduos |
| Genética | Chance por pai no crossover uniforme | 50% |
| Genética | Chance de mutação por gene | 5% |
| Genética | Intensidade da mutação | 0,15 |

## Coordenadas, mapa e ilha

O mundo padrão possui 2.048 × 2.048 pixels lógicos. O canvas pode ser escalado para ocupar a largura disponível, mantendo sua proporção. Zoom e pan transformam somente a projeção entre coordenadas do mundo e da tela.

Cada `Tile` contém:

- coluna e linha do grid;
- tipo `land` ou `water`;
- elevação normalizada em `0..1`;
- produtividade normalizada em `0..1`;

Um tile é imutável. O mapa também não muda durante uma execução e suas consultas fora dos limites retornam `null`.

O terreno usa Improved Perlin Noise 2D implementado em JavaScript, sem `p5.noise`. Uma permutação Fisher–Yates é produzida por `SeededRandom.fromSeed(seeds.map).fork("terrain")`. O campo fBm usa escala `0,075`, quatro oitavas, persistência `0,5` e lacunaridade `2`; cada tile amostra `column × escala` e `row × escala`.

O arquipélago é construído por metas explícitas. Cada tentativa usa o stream independente `archipelago-layout:<tentativa>` e sorteia uma fração terrestre entre `0,46..0,49`, a participação da ilha central entre `0,50..0,65` e a divisão restante entre oito ilhas secundárias de pelo menos 256 tiles. O núcleo principal fica no centro; os demais ocupam setores angulares, com órbita e deslocamento seedados.

Uma partição de Voronoi ponderada pelo tamanho-alvo cria territórios. As bordas entre territórios são erodidas em um tile e cada componente cresce por quatro vizinhos a partir de seu núcleo, escolhendo primeiro a maior combinação de fBm e máscara radial local; empates usam o menor índice row-major. Isso mantém os componentes conectados, separados por água e com a quantidade de terra determinada antes da geração. A borda externa permanece aquática.

Lagos são abertos em regiões internas de baixa elevação, a pelo menos três tiles da água existente, sem dividir nenhuma ilha. O default conserva de quatro a oito lagos planejados de `4..32` tiles; cavidades menores que quatro tiles são preenchidas. A costa é expandida quando necessário para repor a terra retirada pelos lagos sem fechá-los. O primeiro de até 64 layouts que cumprir todos os limites é aceito; a geração falha explicitamente caso nenhum seja válido.

A elevação combina 70% do fBm com 30% da máscara radial do território e é quantizada em seis casas. Em uma amostra determinística de 100 seeds, os defaults produziram sempre 9 ilhas, de 46,1% a 49,0% de terra, ilha principal entre 50,2% e 64,8%, ilha secundária mínima entre 313 e 444 tiles e de 4 a 10 lagos. `evo-1` é aceito na primeira tentativa e produz 7.829 tiles terrestres (aproximadamente 47,8%), 4.378 na ilha principal, oito ilhas secundárias de 389 a 459 tiles e cinco lagos somando 110 tiles.

A produtividade usa a stream `SeededRandom.fromSeed(seeds.map).fork("productivity")` e outro fBm, com escala `0,10`, três oitavas, persistência `0,55` e lacunaridade `2`. Depois que a topologia final está pronta, uma busca multiorigem por quatro vizinhos calcula a distância Manhattan de cada tile terrestre até a água mais próxima, incluindo mar, canais e lagos internos.

```text
proximidadeDaAgua = max(0, (6 + 1 - distanciaEmTiles) / 6)
produtividadeBruta = min(1, fbm + 0,35 × proximidadeDaAgua)
pesoDaIlha = 1 + 0,50 × (1 - sqrt(tamanhoDaIlha / tamanhoDaPrincipal))
```

Um tile adjacente à água recebe o bônus completo, o bônus decai até seis tiles e passa a zero a partir do sétimo. A massa total `5.760` é repartida entre as ilhas proporcionalmente a `tamanho × pesoDaIlha`, em unidades de `10⁻⁶`; restos usam maior fração e depois o primeiro índice row-major. Dentro de cada componente, uma busca binária determinística ajusta o campo bruto à massa atribuída. Assim, a média-alvo cresce continuamente conforme a ilha diminui e pode se aproximar de 50% de bônus, sem mudar a capacidade global. Água recebe zero. `evo-1` tem média `0,736` no conjunto, `0,639` na principal e `0,855..0,863` nas secundárias.

A geração falha explicitamente se a terra ou qualquer ilha não comportar sua massa produtiva. O snapshot do mapa é serializável, profundamente imutável, ordenado em row-major e reutilizado entre frames. Além dos agregados anteriores, `islands` expõe rank, tamanho, fração da terra, produtividade total e média de cada componente, também congelados.

Seres podem atravessar água, mas nascem em terra. A borda é fechada. Ao tentar sair, a posição é mantida dentro do mapa e a direção é refletida. Seres não colidem entre si e podem se sobrepor.

## Seed e aleatoriedade

Existem duas seeds raiz independentes. `seeds.map` controla terreno, produtividade, leva inicial de comida e posições iniciais dos seres de cada geração. `seeds.simulation` controla spawns posteriores, direção inicial, genomas, eventos e genética. Ambas aceitam texto ou número e são canonizadas com `String(seed)`, de modo que `42` e `"42"` representam a mesma seed; valores vazios e números não finitos são inválidos. Ambas começam como `evo-1`, sem compartilhar estado aleatório.

O gerador usa `xmur3` sobre a chave canônica para produzir quatro inteiros de 32 bits que inicializam `sfc32`. O algoritmo é parte do contrato de reprodução e não é criptográfico. Alterá-lo exige atualizar documentação e vetores dourados.

Streams derivados usam sua respectiva chave raiz, o separador `U+001F`, o prefixo `stream:` e o rótulo solicitado. Criar um stream não consome o gerador pai; portanto, sua sequência independe da ordem em que outros streams forem criados. `terrain` e `productivity` nascem diretamente da seed do mapa. A leva inicial usa `generation:<n>:initial-food`, seus prazos usam `generation:<n>:initial-food-inactivity` e as posições usam `generation:<n>:initial-beings`, todos sobre a seed do mapa. Os eventos seguintes usam `generation:<n>:food-spawn`, seus prazos usam `generation:<n>:food-spawn-inactivity`, realocações usam `generation:<n>:food-relocation` e os prazos das comidas realocadas usam `generation:<n>:food-relocation-inactivity`, todos sobre a seed da simulação. Direção usa `generation:<n>:being:<id>:initial-heading`; apenas a geração 1 sorteia genomas por `generation:1:being:<id>:initial-genome`.

Para cada descendente das gerações seguintes, a seed da simulação deriva streams independentes `generation:<n>:offspring:<id>:parent-a`, `parent-b`, `crossover`, `mutation-choice` e `mutation-noise`. A seleção de um descendente não consome streams de outro.

Alterar somente `seeds.simulation` preserva mapa, leva inicial e posições dos seres, mas altera direções, genomas e spawns posteriores. Na geração 1, alterar somente `seeds.map` preserva direções e genomas, mas altera mapa, produtividade, leva inicial e posições. Nas gerações evoluídas, o mapa pode influenciar indiretamente os genomas por alterar fitness e seleção; ele nunca fornece aleatoriedade ao algoritmo genético.

Os defaults normativos das duas seeds permanecem `evo-1`. No navegador, quando não existe uma preferência válida salva, a interface gera dois UUIDs independentes antes da primeira prévia e os persiste após validação. Os botões `Aleatório` usam a mesma geração criptográfica e aplicam a prévia imediatamente. O fallback usa `crypto.getRandomValues()` para montar um UUID v4; nunca usa `Math.random()` ou streams da simulação.

Digitar seeds ou configurações estruturais aplica a prévia após 300 ms sem alterações. Mudar apenas a seed da simulação ou o cérebro preserva a câmera e as posições; uma nova seed de mapa válida reenquadra o mundo. `Iniciar` aplica de imediato os valores atuais, cancelando qualquer espera pendente. Essa conveniência não é consumida pela lógica determinística.

Durante execução ou pausa, podem mudar `population.size`, `food.initialCount`, `food.spawnCount`, `food.spawnIntervalSeconds`, `food.maxCount`, `food.minEnergy`, `food.maxEnergy`, `food.inactivityTimeoutSeconds`, `generation.durationSeconds`, os campos de custo em `movement`, `energy`, `water`, `life` e `healing` e os cinco campos de `genetics`. `Simulation.applyRuntimeConfig()` recebe uma configuração completa já validada por `createConfig()`, rejeita qualquer diferença nos demais campos e aplica o conjunto permitido atomicamente. Quantidade e intervalo do spawn mudam na geração atual; comida inicial, energia, inatividade, custos, sobrevivência e os demais campos estruturais ficam pendentes para a seguinte. Formulários inválidos não alteram a execução nem o payload válido do `localStorage`.

Não usar `Math.random()` na lógica. Renderização e interface não consomem aleatoriedade da simulação. O tamanho do mapa e todos os parâmetros fazem parte das condições de reprodução.

## Tempo

O passo físico é sempre `dt = 1/30 s`. Uma geração de 120 segundos termina no tick 3.600, salvo se todos morrerem antes. A duração deve corresponder a uma quantidade inteira de ticks físicos.

O limite é capturado ao iniciar cada geração. Alterá-lo durante execução ou pausa registra um valor pendente para a próxima geração e nunca encurta nem prolonga a geração corrente. O recibo de `Simulation.applyRuntimeConfig()` informa os limites atual e seguinte. `Reiniciar` usa o último valor válido imediatamente desde a geração 1.

No modo normal, um acumulador converte tempo real em ticks fixos. A contribuição de um frame é limitada a 250 ms; tempo real além disso é descartado, sem criar ou pular ticks simulados. Nenhum tick usa um `dt` maior para compensar lentidão.

Os modos `1×`, `2×`, `4×` e `8×` multiplicam quantos ticks fixos vencem no acumulador. O modo máximo ignora o delta real e processa ticks por até 8 ms a cada frame antes de devolver controle à interface. Dentro do domínio, `performance.now()` mede somente esse orçamento do escalonador e nunca entra no estado simulado. A camada externa de diagnóstico também pode consultar um relógio monotônico para cronometrar spans, sempre fora dos snapshots, regras, streams e decisões da simulação.

Comida, idade, energia, vida, cérebro e duração da geração dependem exclusivamente do tempo simulado. Pausar interrompe os ticks.

## Estado e movimento do ser

Cada `Being` mantém pelo menos:

- ID estável;
- posição contínua no mundo;
- direção em graus ou radianos;
- velocidade atual normalizada em `-1..1`;
- giro atual normalizado em `-1..1`;
- vida, energia, idade e estado vivo/morto;
- energia total absorvida e fitness;
- sensores, rede neural e genoma.

A posição inicial é o centro de um tile distinto escolhido uniformemente, sem reposição, entre os tiles da ilha principal em row-major. A escolha usa a seed do mapa e o número da geração; aumentar a população preserva o prefixo de posições. A geração falha se a ilha principal não comportar todos os seres. A ocupação de comida é independente, portanto um ser pode nascer sobre uma comida.

Olhos e cérebro fazem parte do snapshot imutável do ser. O genoma não é copiado a cada frame; ele fica disponível pela API do domínio. Velocidade e giro podem ocorrer no mesmo tick, velocidade negativa move para trás e o giro máximo corresponde ao módulo `1`.

O custo de movimento é não linear e usa parâmetros configuráveis:

```text
custoMovimentoPorSegundo = coeficiente × |velocidade|^expoente × multiplicadorDoTerreno
custoGiroPorSegundo = custoMáximoDeGiro × |giro|
custoTotalPorSegundo = metabolismoBasal + custoMovimentoPorSegundo + custoGiroPorSegundo
```

Os defaults são coeficiente `4`, expoente `2`, giro máximo `1/s`, metabolismo `0,75/s` e multiplicador `3×` na água; em terra o multiplicador permanece `1`. A água afeta somente o deslocamento. O terreno é determinado pela posição resultante do ser no tick. Todos esses valores podem ser editados durante execução, mas a política ativa é capturada no início da geração e só muda na transição seguinte ou após `Reiniciar`. O snapshot `beingPolicy` expõe a política ativa de forma profundamente imutável.

Exemplos em terra, sem giro:

| Velocidade | Movimento | Total com metabolismo |
| ---: | ---: | ---: |
| 0 | 0 | 0,75/s |
| 0,25 | 0,25/s | 1/s |
| 0,50 | 1/s | 1,75/s |
| 0,75 | 2,25/s | 3/s |
| 1 | 4/s | 4,75/s |

Um ser com energia positiva no início do tick pode executar sua ação. Depois do custo, a energia é limitada ao mínimo zero. Com energia zero no início do tick, velocidade e giro efetivos são zero.

Giro é aplicado antes do deslocamento. Ao ultrapassar uma borda, o excesso é refletido para dentro do mundo e o eixo correspondente da direção também é refletido; um canto pode refletir ambos. Vida, energia, alimentação e fitness usam unidades de `10⁻⁶`; posição, direção, velocidade e giro são quantizados em nove casas após a física.

## Vida, fome e cura

O metabolismo basal consome energia mesmo quando o ser está parado. Não existe envelhecimento independente no escopo inicial.

Após alimentação, usando os defaults configuráveis:

- com energia zero, o ser perde 20 de vida por segundo;
- acima de zero, a fome não remove vida;
- acima de 80 de energia e abaixo de 100 de vida, o ser recupera até 1 vida por segundo;
- cada unidade de vida recuperada consome 2 de energia;
- a cura nunca reduz a energia abaixo de 80;
- vida e energia permanecem em `0..100`;
- vida igual ou inferior a zero encerra definitivamente o ser naquela geração.

O painel “Custos e sobrevivência” expõe dano sem energia, limiar de cura, energia gasta por vida e cura máxima, além dos custos de movimento. Dano, metabolismo, giro, coeficiente de movimento e cura máxima aceitam zero; expoente, multiplicador da água e energia por vida devem ser positivos. O limiar permanece em `0..energiaMáxima`. Alterações válidas ficam pendentes e nunca mudam vida ou energia de seres já avaliados na geração corrente.

## Olhos

Os olhos configuráveis ocupam somente a frente do ser. O campo de visão é dividido em setores de mesmo tamanho, ordenados da esquerda para a direita. Com cinco olhos e 120°, existe um setor central alinhado com a direção do ser. Além deles, todo ser possui um olho inferior fixo, que não gira e informa se o tile sob o corpo é terra (`0`) ou água (`1`).

Cada olho fornece:

1. proximidade da comida mais próxima dentro de seu setor e alcance;
2. proximidade da primeira transição de terreno ou borda na direção central do setor.

A comida usa distância euclidiana entre o ser e o centro do alimento. A costa é encontrada por travessia determinística do grid ao longo do raio central, comparando cada tile atravessado com o tipo do tile inicial. Em terra, o raio detecta a primeira água; na água, detecta a primeira terra. A borda externa encerra o raio se vier primeiro. Estar na água não zera a leitura; somente uma posição já sobre a borda externa produz distância zero. Se nenhuma transição ou borda estiver dentro do alcance, a distância é `null` e a proximidade é zero. Para os dois canais:

```text
proximidade = clamp(1 - distância / alcance, 0, 1)
```

Uma fronteira interna entre setores pertence ao setor à direita; a borda externa final pertence ao último. Distâncias iguais entre comidas usam o menor ID. Leituras são quantizadas em seis casas e valem zero quando nada é detectado. Olhos não detectam produtividade nem outros seres.

Os olhos frontais giram com o ser. Virar tem custo energético, inclusive parado. As leituras visuais são atualizadas em cada tick físico para permanecerem alinhadas à pose atual, mas o cérebro continua consumindo inputs somente nos ticks de decisão. Para reduzir poluição visual, desenhar apenas os raios centrais reais dos olhos frontais do melhor ser e do ser selecionado; fronteiras de setores não são desenhadas como lasers. O olho inferior aparece como um marcador fixo no centro do corpo, não produz raio e não é listado separadamente no inspetor.

## Rede neural

A rede é feed-forward e não usa backpropagation. Pesos e biases formam o genoma. O genoma percorre as camadas em ordem; dentro de cada camada, percorre neurônios de destino e, para cada um, registra os pesos das entradas na ordem anterior e depois o bias.

Inputs, nesta ordem:

1. para cada olho, da esquerda para a direita: proximidade de comida e de transição de terreno ou borda;
2. comida no alcance seguro: `1` quando qualquer comida estiver a até `eatDistanceTiles × 0,9`, em 360°;
3. refeição ativa: `1` enquanto o ser estiver preso à comida alvo;
4. energia normalizada em `0..1`;
5. vida normalizada em `0..1`;
6. velocidade atual em `-1..1`;
7. leitura do olho inferior: água em `1`, terra em `0`.

Com cinco olhos, a rede tem 16 inputs. A topologia padrão `16 → 12 → 2` possui 230 genes. Outputs sempre usam `tanh`:

1. velocidade desejada em `-1..1`;
2. giro em `-1..1`.

Camadas internas aceitam `tanh`, ReLU ou sigmoide. Quantidade de olhos, campo visual, alcance, frequência do cérebro, camadas ocultas, ativação e inicialização são configuráveis. Alterar olhos recalcula entradas e genes. São permitidos até 15 olhos, quatro camadas ocultas, 64 neurônios por camada e 20.000 genes por ser; a saída deve conter exatamente dois neurônios. Uma configuração incompatível falha antes de substituir a última prévia válida.

Na geração 1, cada genoma é sorteado por `generation:1:being:<id>:initial-genome`. Pesos iniciais usam faixa configurável, padrão `-1..1`, dentro dos limites absolutos padrão `-5..5`. Gerações posteriores recebem genomas do algoritmo genético. Genes, inputs, ativações e outputs são quantizados em nove casas para estabilizar a inferência entre execuções.

O cérebro executa por padrão a 10 Hz, nos ticks `1`, `4`, `7` e assim por diante, conservando a ação nos ticks físicos intermediários. A interface oferece apenas frequências `1`, `2`, `3`, `5`, `6`, `10`, `15` e `30`, que dividem os 30 ticks físicos exatamente. A prévia no tick zero calcula os olhos, o alcance seguro em 360° e os inputs iniciais, mas mantém a refeição inativa, outputs e ação neutros.

## Comida e produtividade

Cada `Food` fica no centro de um tile de terra e conserva energia inicial/restante, tick de criação e tick do último consumo. Existe no máximo uma comida por tile.

A energia inicial depende linearmente da produtividade `p` do tile:

```text
energiaDaComida = energiaMínima + (energiaMáxima - energiaMínima) × p
```

A energia é quantizada em seis casas decimais; os defaults `10..50` preservam a fórmula anterior `10 + 40 × p`. A escolha do tile de spawn é ponderada pela produtividade entre tiles de terra livres, percorridos em row-major. Para cada comida, sorteia-se um ponto em `[0, somaDosPesos)` e seleciona-se o primeiro tile cuja soma acumulada o ultrapassa. O tile escolhido sai dos candidatos do lote. Se não houver tile com peso positivo ou o limite global tiver sido alcançado, o restante do evento não cria comida nem consome aleatoriedade.

A geração começa no tick `0` com 20 comidas por padrão. Com 30 ticks/s e intervalo padrão de 3 s, os eventos ocorrem nos ticks concluídos `90`, `180`, `270` e assim por diante, criando até três comidas por evento e respeitando o máximo de 300. IDs são inteiros crescentes dentro da geração. O snapshot `foods` é imutável, ordenado por ID e reutilizado entre mudanças.

Alterar somente a quantidade por spawn preserva o evento já agendado. Alterar o intervalo durante uma geração agenda o próximo evento para `tickAtual + novoIntervaloEmTicks`; não cria eventos retroativos e não consome aleatoriedade no momento da atualização. A nova política vale inclusive durante pausa, mas nenhum spawn ocorre sem um tick físico. Alterar `food.initialCount`, `food.maxCount`, energia ou inatividade não modifica as comidas nem a capacidade da geração corrente: os novos valores ficam pendentes para a geração seguinte. Aumentar a leva inicial preserva o prefixo que seria obtido com uma quantidade menor. Na próxima transição, o calendário e a política recomeçam no tick zero com a configuração ativa. `Reiniciar` aplica os últimos valores válidos desde a geração 1. O snapshot expõe a política ativa, incluindo `initialCount`, e o recibo dinâmico informa valores atuais e próximos.

O valor configurado é o prazo mínimo. Ao criar uma comida, soma-se em ticks um inteiro uniforme no intervalo fechado `[0, prazoMínimo]`; portanto, o default gera prazos individuais entre 900 e 1.800 ticks, ou 30 e 60 segundos. O prazo sorteado permanece com a comida e é reiniciado integralmente por qualquer concessão positiva de energia. No tick limite, a realocação ocorre somente depois de processar o consumo. `0` desativa o mecanismo e não consome o stream de inatividade. Expirações do mesmo tick são resolvidas por ID crescente: todas liberam seus tiles e cada uma tenta criar imediatamente uma nova comida, com novo ID, novo prazo e energia derivada do tile de destino. A seleção ponderada exclui o tile anterior quando existe destino alternativo. Sem outro tile terrestre livre de peso positivo, a comida desaparece sem reposição e sem consumir aleatoriedade de destino ou de novo prazo.

Posição e prazo usam streams separados para a leva inicial, spawns e realocações. Criar um prazo não desloca os sorteios de tiles; realocar uma comida também não desloca posições ou prazos de spawns normais. Somente comidas efetivamente criadas consomem uma amostra de prazo. Realocações incrementam o total criado, mas não o total esgotado: “esgotada” continua significando que o consumo reduziu a energia a zero.

Um ser pode iniciar uma refeição quando:

- está vivo;
- possui menos de 90 de energia;
- está a no máximo 1 tile de distância euclidiana do centro da comida.

Se mais de uma comida estiver ao alcance, o ser prende a refeição à mais próxima; distâncias iguais usam o menor ID. Enquanto esse alimento existir, permanecer a no máximo 1 tile e o ser não alcançar sua energia máxima, o alvo não muda, mesmo que outra comida se torne mais próxima.

Depois de iniciada abaixo de 90, a refeição pode atravessar esse limiar e continuar até a energia máxima, 100 no default. O ser solicita por tick:

```text
min(3 × dt, energiaMáxima - energiaAtual)
```

A refeição termina ao alcançar a energia máxima, morrer, perder a comida alvo ou sair do alcance real. Se o alvo for perdido e a energia ainda estiver abaixo de 90, outra refeição pode começar com a comida alcançável mais próxima; com 90 ou mais, o ser deve aguardar a energia voltar a ficar abaixo do limiar. Alcançar a energia máxima encerra a sessão antes da cura, portanto energia gasta pela cura não reabre imediatamente a refeição.

O cérebro recebe dois sinais globais separados da visão frontal: a existência de qualquer comida em até `0,9 ×` o alcance real e o estado da refeição. O primeiro é uma margem interna para favorecer a parada antes da borda de consumo; ele não amplia nem restringe a regra física de 1 tile e pode detectar comida atrás do ser.

Todos podem consumir a mesma comida simultaneamente. Primeiro são calculadas todas as solicitações. Se a comida cobrir o total, todos recebem integralmente; caso contrário, o restante é dividido proporcionalmente em unidades de `10⁻⁶`. Restos da divisão usam o método dos maiores restos e o menor ID do ser como desempate. A soma concedida é removida da comida e adicionada `1:1` à energia e à energia absorvida do ser.

A comida é removida ao chegar a zero e seu tile volta a ficar disponível para spawns futuros. A divisão simultânea não depende da ordem dos seres.

## Fitness e gerações

Todos os seres de uma geração começam juntos, com vida e energia reiniciadas. A geração termina ao alcançar o limite de ticks ou quando todos morrerem. No tick terminal, o resumo final é registrado e a geração seguinte é criada imediatamente; o relógio não pausa e o estado terminal não ocupa um frame próprio. A execução continua sem limite de gerações até uma ação do usuário. `Reiniciar` reproduz a geração 1 e limpa o histórico.

O fitness é:

```text
fitness = segundosVivos + energiaTotalAbsorvida
```

O processamento genético ao final é:

1. ordenar por fitness decrescente e usar o ID como desempate estável;
2. atualizar o arquivo global com os K melhores genomas distintos já avaliados em toda a execução, ordenados por fitness, geração mais antiga e menor ID;
3. copiar exatamente esse arquivo, sem crossover, mutação ou nova quantização, para os primeiros K IDs da nova geração;
4. para cada outro ID, executar dois torneios independentes de três competidores distintos; os vencedores dos dois torneios podem coincidir;
5. fazer crossover uniforme, gene a gene, com 50% de chance de usar o pai A;
6. para cada gene, sortear mutação com 5% de chance e, quando aplicável, somar ruído gaussiano de desvio `0,15`;
7. limitar o resultado à faixa absoluta e quantizar em nove casas;
8. reiniciar vida, energia, posição, direção, comida e cérebro para a geração seguinte.

Uma amostra de crossover e uma decisão de mutação são consumidas para cada gene; a amostra gaussiana é consumida somente quando a mutação ocorre. Dentro de cada torneio, os competidores são sorteados uniformemente sem reposição. Todos os indivíduos da geração encerrada participam, vivos ou mortos. IDs são locais à geração.

O mapa permanece igual durante toda a execução. Leva inicial e posições variam com a seed do mapa e o número da geração. Spawns posteriores, direções, evolução e eventos usam a seed da simulação e o número da geração. Não existe nascimento ou reprodução durante a avaliação.

`genetics.eliteCount` define K e deve ser um inteiro entre `1` e o tamanho da população. O arquivo é atualizado sem duplicar reavaliações do mesmo genoma e nunca descarta um campeão histórico em favor de uma avaliação pior. Somente o genoma dos elites atravessa a fronteira da geração; posição, direção, vida, energia, idade, comida e percepção são reinicializadas como nos demais seres.

População e genética alteradas durante uma geração entram em vigor somente na reprodução seguinte. O algoritmo genético recebe o tamanho-alvo e produz exatamente essa quantidade de genomas; a população que está sendo avaliada não é redimensionada. Top K e torneio devem caber tanto na população atual quanto na desejada, sem redução silenciosa. Ao aumentar K, o próximo arquivo usa as elites ainda armazenadas e os indivíduos da geração recém-avaliada; candidatos históricos já descartados não são reconstruídos. Ao reduzir K, o corte também ocorre somente na próxima transição. Em todos os casos, as elites escolhidas continuam sendo copiadas bit a bit, sem crossover, mutação ou nova quantização. `Reiniciar` aplica a configuração válida mais recente já na geração 1.

O snapshot expõe ticks e tempo da geração, ticks e tempo totais, quantidade de gerações concluídas, melhor resultado de toda a execução e todos os resumos finais da sessão. Cada resumo informa geração, motivo, duração, limite configurado, sobreviventes, melhor ID, melhor fitness, fitness média, média dos melhores 10% da população final, média do arquivo Top K global e a timeline completa. A quantidade do Top 10% é `max(1, ceil(populaçãoAvaliada × 0,10))`; vivos e mortos participam do ranking final. A média Top K usa o arquivo depois de incorporar a geração encerrada e registra sua quantidade efetiva, portanto acompanha mudanças dinâmicas de K naquela transição. As médias são quantizadas em seis casas. Empates do melhor histórico preservam a geração mais antiga e, dentro dela, o menor ID. Todos esses dados são imutáveis. `Reiniciar`, `Nova execução` e restauração dos padrões limpam o histórico; a recarga não o restaura.

`currentGenerationTimeline` contém uma amostra no tick `0`, em cada múltiplo de 30 ticks e no tick terminal, mesmo quando este não coincide com um segundo inteiro. Cada amostra registra tick, tempo, seres e comidas disponíveis, energia total nas comidas, energia e vida médias dos vivos, melhor fitness e fitness média da população completa, módulo médio da velocidade dos vivos, fração dos vivos na água, mortes no intervalo e acumuladas e comidas criadas e esgotadas no intervalo. Médias sem sobreviventes são `null`, formando lacunas visuais. A amostra inicial zera todos os contadores de intervalo. Comida consumida conta somente quando sua energia chega a zero e ela é removida; consumo parcial aparece pela redução da energia total. Energia e médias são quantizadas em seis casas.

## Ordem de um tick

1. Criar comidas de eventos de spawn vencidos.
2. Quando o intervalo de decisão vencer, atualizar olhos, formar inputs e executar a rede.
3. Aplicar giro e deslocamento.
4. Cobrar metabolismo, movimento e giro.
5. Resolver simultaneamente as solicitações de comida e depois realocar as inativas.
6. Aplicar cura ou perda de vida por energia zero.
7. Resolver mortes e métricas.
8. Atualizar as leituras visuais dos seres vivos na pose resultante, sem executar novamente a rede.
9. Encerrar ou continuar a geração; quando encerrar, registrar, evoluir e inicializar imediatamente a próxima.

Usar sempre ordenação estável quando múltiplos eventos no mesmo tick precisarem de desempate.

## Visualização

- Água e terra têm cores distintas.
- A tonalidade da terra comunica produtividade.
- A comida é um círculo amarelo centralizado no tile; seu diâmetro é `tileSize × (0,25 + 0,55 × energiaRestante/energiaInicial)`.
- Cada ser vivo é um círculo de aproximadamente `0,7` tile com indicador de direção e um pequeno olho inferior fixo centralizado. Sua cor comunica vida. Acima dele, barras de `0,72` tile de largura e `0,06` tile de altura mostram vida em verde e energia em amarelo-ocre; perto da borda superior, o conjunto passa para baixo do corpo.
- As barras são desenhadas depois de todos os corpos, com proporções limitadas a `0..1`. Sua geometria permanece no espaço do mundo e escala naturalmente entre `1×` e `8×`; apenas o contorno fino compensa o zoom para conservar legibilidade. Seres mortos não recebem barras.
- O melhor ser vivo recebe um contorno distinto. `bestBeingId` continua registrando o melhor geral da geração, vivo ou morto; `bestAliveBeingId` usa maior fitness entre os vivos e menor ID no empate.
- Clique procura primeiro um ser vivo e depois uma comida dentro de meio tile, escolhendo a entidade mais próxima e usando o menor ID em empates. O inspetor mostra estado e tabelas com nome, significado e valor de cada input e output neural, ou posição, produtividade e energia da comida. O domínio expõe um schema imutável com a ordem e a faixa das entradas, sem textos de apresentação. Sensores aparecem apenas no melhor vivo e no selecionado vivo.
- A câmera usa zoom `1×..8×`, roda ancorada no cursor, arraste, pinça e botões com fator `1,25`. O pan é limitado para não revelar área fora do mundo. Um ser vivo selecionado pode ser seguido manualmente. “Seguir melhor” seleciona, inspeciona e centraliza o melhor vivo, transfere o alvo quando o líder muda e permanece ativo entre gerações. Selecionar outro ser converte para acompanhamento manual; comida, clique vazio, arraste, pinça, centralização, morte do alvo manual, reinício ou nova execução encerram o acompanhamento correspondente. Zoom não o encerra.
- Deslocamentos de até quatro pixels CSS continuam sendo clique; acima disso tornam-se pan.
- Trocar o mapa ou iniciar `Nova execução` reenquadra a câmera. Pausa, reinício e mudanças exclusivamente neurais preservam o enquadramento.
- Zoom e pan não alteram coordenadas, alcance, seed, sensores ou resultados.
- O histórico conserva todas as gerações da execução. O gráfico Chart.js inicia nas 50 últimas e pode mostrar todas; o eixo vertical inclui zero. Quatro linhas sólidas mostram melhor fitness, média geral, média do Top K global e média dos melhores 10%. Quatro linhas tracejadas mostram suas médias móveis de até dez gerações, incluindo a atual. O cálculo usa o histórico completo antes do recorte visual, de modo que “Últimas 50” e “Todas” coincidem nas gerações compartilhadas.
- “Dinâmica da geração” mostra sete gráficos Chart.js: seres/comidas, energia total em comida, energia/vida médias, fitness, velocidade/água, mortes e fluxo de comidas. O fitness sobrepõe às linhas brutas médias móveis no intervalo `(tempo − 5 s, tempo]`. O seletor e os botões anterior/próxima acompanham a geração atual ou fixam qualquer geração concluída enquanto a execução continua. Linhas aceitam lacunas `null`; mortes e fluxo usam barras proporcionais ao intervalo real no eixo X. O fluxo soma as amostras brutas em janelas completas de cinco segundos e inclui uma última janela parcial somente no término. “Criadas” inclui spawns e realocações; “Esgotadas” conta somente comidas removidas ao chegar a zero por consumo. Consumo parcial permanece visível na energia total. Escalas incluem zero e movimento/água usa `0..1`.
- As médias móveis são projeções quantizadas em seis casas e não fazem parte do snapshot, do histórico persistido ou da aleatoriedade. Gráficos são atualizados sem animação e não descartam pontos no modo “Todas”.
- Cada configuração da interface possui ajuda contextual em PT-BR, acessível por hover, foco ou toque e associada semanticamente ao controle. A ajuda informa finalidade, unidade e quando uma alteração entra em vigor.
- Ao final da página, o painel recolhível de desempenho mostra tempos decorridos da thread principal por preparação, tick, evolução, interface e desenho. A coleta começa somente ao iniciar uma execução, congela durante a pausa e não é persistida. Esses números são diagnósticos e não alteram ticks ou resultados determinísticos.

## Preferências locais

O payload `evo.settings.v1` contém somente os controles configuráveis — inclusive comida inicial, limite, energia e inatividade da comida, custos e sobrevivência —, velocidade e recorte `last50` ou `all` do gráfico evolutivo. Payloads antigos sem esses campos recebem os defaults atuais durante a leitura; o valor legado `last2` é migrado para `last50`. Escritas ocorrem apenas após validação completa por `createConfig`; uma entrada inválida não substitui o último payload válido. Histórico, timelines, genomas, execução, seleção, zoom e pan não são persistidos.

Alterações dinâmicas válidas também atualizam esse mesmo payload. Durante a aplicação híbrida, quantidade e intervalo de spawn são imediatos; população, comida inicial, máximo, energia e inatividade da comida, custos, sobrevivência, limite de tempo e genética ficam pendentes para a próxima transição. A preferência persistida sempre representa o conjunto completo que será usado por `Reiniciar` e por uma futura recarga.

Payload ausente, corrompido ou incompatível é removido e tratado como primeira abertura. `Restaurar padrões` exige confirmação, encerra a execução, remove somente a chave do app, aplica `DEFAULT_CONFIG`, volta a `1×` e `last50` e não grava os defaults automaticamente. Se a página for recarregada sem nova alteração, duas novas seeds aleatórias serão criadas.

## Validações mínimas

- Mesmas seeds e configuração geram o mesmo mapa e estado após N ticks.
- Alterar apenas a seed da simulação preserva o mapa; alterar apenas a seed do mapa preserva os streams da simulação.
- No `FoodSystem` isolado, `evo-1` gera 20 comidas terrestres únicas no tick 0 e 23 no tick 90; na simulação integrada, o consumo pode reduzir essa contagem.
- Alterar apenas a seed da simulação preserva a leva inicial e altera o primeiro evento; alterar a seed do mapa altera a leva inicial.
- Os 40 seres nascem em tiles distintos da ilha principal; alterar apenas a seed da simulação preserva suas posições e altera direções e genomas.
- O default possui 16 entradas, 12 neurônios ocultos, duas saídas e 230 genes por ser.
- Olhos frontais respeitam setores, alcance, bordas, transições terra→água e água→terra e desempates determinísticos; o olho inferior identifica o terreno sob o corpo e permite interpretar o lado da costa.
- Os raios desenhados correspondem à pose e às leituras do tick atual, sem linhas extras para fronteiras de setores.
- Barras de vida e energia conservam proporções, ordem, cores, fallback na borda superior e escala no espaço do mundo.
- Os K melhores genomas históricos permanecem intactos nos primeiros slots de todas as gerações seguintes.
- O cérebro decide nos ticks vencidos, conserva a ação intermediária e reinicia com o mesmo genoma para a mesma seed.
- `evo-1` gera 9 ilhas, 5 lagos internos com pelo menos 4 tiles, 7.829 tiles terrestres no total, 4.378 na ilha principal, borda aquática, produtividade terrestre total 5.760 e média aproximadamente `0,736`.
- Em 100 seeds fixas, a ilha principal conserva 50–65% da terra e cada uma das oito secundárias possui pelo menos 256 tiles.
- Em `evo-1`, a produtividade média dos tiles adjacentes à água é maior que a da faixa próxima, que por sua vez é maior que a do interior.
- Os vetores dourados do PRNG permanecem estáveis e streams derivados não dependem da ordem de criação.
- Rodar em 1× ou acelerado gera o mesmo estado após N ticks.
- Pausar não processa nem acumula tempo; deltas reais acima de 250 ms são descartados.
- Velocidades `0`, `0,5` e `1` respeitam a curva quadrática.
- Água triplica apenas o custo de deslocamento.
- Girar parado consome metabolismo e giro.
- Ser parado perde energia, mas não vida enquanto houver energia.
- Cura respeita o limiar e a conversão `2:1`.
- Consumidores simultâneos dividem corretamente uma comida insuficiente.
- Um ser ao alcance de várias comidas escolhe a mais próxima e desempata pelo menor ID.
- A refeição inicia somente abaixo de 90, conserva o mesmo alvo acima do limiar e termina no máximo de energia ou ao perder seu alimento.
- O cérebro distingue comida no raio seguro de 0,9 tile e refeição ativa sem restringir a percepção aos olhos frontais.
- Comida nunca nasce na água e sua energia reflete a produtividade.
- Inatividade usa um prazo individual entre o mínimo e o dobro configurado, expira depois do consumo do tick limite, reinicia com consumo positivo e usa streams que não alteram posições de spawns ou realocações.
- A geração termina pelo tempo máximo ou pela morte de todos e a seguinte começa no tick zero sem pausar.
- Elites, torneios, crossover e mutação repetem exatamente com a mesma seed, configuração e população final.
- O histórico mantém mais de 50 gerações sem truncamento e preserva o melhor resultado global.
- Os X melhores genomas são copiados exatamente e todo o restante do estado dos seres é reiniciado.
- Mudanças dinâmicas iguais aplicadas nos mesmos ticks produzem snapshots e genomas idênticos; mudar o intervalo de spawn reagenda sem evento retroativo.
- Alterar a população durante uma geração não muda seus seres atuais e produz exatamente o tamanho pendente na transição seguinte.
- O melhor vivo usa fitness e menor ID, e o acompanhamento visual pode trocar de líder sem modificar a simulação.
- O schema neural mantém a ordem dos valores numéricos e a interface associa cada entrada e saída à sua descrição sem inserir textos PT-BR no domínio.
- Persistência local restaura somente configuração, velocidade e recorte do gráfico; restaurar padrões não remove outras chaves da origem.
- Renderização, zoom, pan e inspeção não modificam o estado simulado.
