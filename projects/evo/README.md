# Evo

Simulação evolutiva determinística em p5.js, sem build e sem dependências remotas em execução. A aplicação contém arquipélago procedural, comida compartilhável, seres com física, visão frontal e olho inferior de terreno, cérebro neural feed-forward, algoritmo genético, gerações contínuas, inspeção, gráficos Chart.js e câmera com zoom e pan.

Esta entrada foi importada do commit `cb00f90d203d2a60ab730046bc804c41adac4cca` do projeto Evo.

## Executar

Na raiz do repositório Visual Algo, execute um servidor HTTP local:

```sh
python3 -m http.server 8000
```

Acesse `http://localhost:8000/projects/evo/`. A aplicação usa módulos ES nativos e não possui build nem dependências remotas em execução.

“Seed do mapa” controla terreno, produtividade, comida inicial — inclusive seus prazos individuais de inatividade — e posições de cada geração. O gerador mantém uma ilha central com 50–65% da terra e oito ilhas secundárias maiores; quanto menor a ilha, maior sua produtividade média-alvo, com bônus de até 50% e massa total preservada. “Seed da simulação” controla spawns posteriores, realocações e seus novos prazos, direções, genomas iniciais e aleatoriedade genética. Sem preferências salvas, cada seed começa com um UUID local independente; os botões **Aleatório** sugerem novos valores. A prévia é atualizada após 300 ms de inatividade.

**Iniciar** aplica os controles e executa gerações consecutivas. Cada geração termina por extinção ou pelo tempo máximo configurável, inicialmente 120 segundos simulados; um arquivo global mantém os K melhores genomas intactos no pool, enquanto torneios, crossover uniforme e mutação gaussiana criam os demais. Alterar o limite durante a execução afeta somente a próxima geração; **Reiniciar** o aplica desde a geração 1. Uma barra persistente mantém velocidade, **Iniciar/Reiniciar** e **Pausar/Continuar** disponíveis durante toda a rolagem; **Nova execução** permanece no painel principal. O ciclo não possui limite automático de gerações.

Os controles são organizados em painéis recolhíveis por tema: **População e geração**, **Comida**, **Custos e sobrevivência**, **Cérebro neural**, **Evolução** e, por último, **Seeds**. Durante execução ou pausa, população, comida inicial, spawns, máximo simultâneo, energia e inatividade da comida, custos, limite de tempo e evolução continuam editáveis: quantidade e intervalo de spawn são atualizados na geração atual; os demais valem na próxima reprodução e aparecem como “Atual/Próxima”. O máximo padrão é 300, a energia varia de 10 a 50 conforme a produtividade e o prazo configurado de 30 segundos é o mínimo de inatividade: cada comida recebe mais `0..30` segundos seedados, ficando entre 30 e 60 segundos sem consumo antes da realocação. Usar zero desativa essa expiração. Alterações inválidas não substituem a configuração ativa, e cada controle possui ajuda contextual. Depois dos controles, a página prioriza o mapa e o inspetor; métricas agregadas e os gráficos evolutivos e temporais aparecem em seguida, no fim. O histórico evolutivo mantém todas as gerações e alterna entre as 50 últimas e a série completa, mostrando melhor fitness, média geral, média do Top K global, média dos melhores 10% e médias móveis de dez gerações. O dashboard **Dinâmica da geração** acompanha a atual ou fixa uma concluída, também por botões anterior/próxima; seu gráfico de fitness acrescenta médias móveis de cinco segundos. O fluxo agrega eventos em janelas de cinco segundos: “Criadas” inclui spawns e realocações, consumo parcial aparece na energia disponível e “Esgotada” significa removida ao chegar a zero por consumo.

A alimentação usa histerese: o ser só inicia uma refeição abaixo de 90 de energia, prende-se à mesma comida e pode continuar até alcançar sua energia máxima. O consumo exige distância real de até 1 tile; o cérebro recebe sinais separados para refeição ativa e para qualquer comida em um raio seguro de 0,9 tile, inclusive atrás do ser. Cada olho frontal também mede a primeira transição de terreno ou borda: em terra encontra água, no mar encontra terra, enquanto o olho inferior informa de qual lado da costa o ser está. A rede padrão permanece `16 → 12 → 2`, com 230 genes.

Clique em um ser ou em uma comida para inspecionar seus dados. Comidas mostram energia inicial, restante, prazo individual e tempo até a realocação; seu tamanho representa a fração da própria energia inicial. Para seres, o inspetor mostra se existe uma refeição ativa, o ID da comida alvo e as entradas e saídas neurais em tabelas com significado e valor. Todos os seres vivos exibem barras discretas de vida em verde e energia em amarelo; elas usam o espaço do mundo e crescem ou diminuem com o zoom. Um ser vivo selecionado pode ser seguido manualmente, e **Seguir melhor** transfere câmera e inspetor sempre que o líder vivo muda, inclusive entre gerações. Zoom, pan, seleção, barras e acompanhamento são exclusivamente visuais. O mundo padrão possui 128 × 128 tiles de 16 px.

Os controles, incluindo comida inicial, custos, sobrevivência, energia e inatividade da comida, máximo simultâneo, tempo máximo, velocidade e recorte do gráfico evolutivo são salvos no `localStorage` sob a chave `evo.settings.v1`. **Restaurar padrões** pede confirmação, encerra a execução, limpa somente essa chave e reaplica `DEFAULT_CONFIG`. Histórico, timelines, genomas, câmera e seleção não são persistidos.

No fim da página, **Diagnóstico de desempenho** mede em milissegundos preparação, mapa, ticks, sensores, cérebro, física, comida, evolução, snapshots, interface e desenho. O painel começa fechado, coleta somente depois de **Iniciar**, congela durante a pausa e pode zerar os agregados sem reiniciar a simulação. Último valor, média, P95 e máximo usam até 300 chamadas recentes; chamadas e total abrangem a sessão. Os valores medem tempo decorrido na thread principal e não são persistidos nem adicionados ao estado determinístico.

A política de segurança permanece estrita. p5.js 2.3.2 e Chart.js 4.5.1 são vendorizados e servidos por URLs relativas. O único hash inline permitido pela CSP corresponde exatamente ao indicador de carregamento do p5.js; `unsafe-inline` não é usado.

## Validar

```sh
npm test
```

## GitHub Pages

No Visual Algo, esta demonstração é publicada em `projects/evo/`. Todos os recursos usam caminhos relativos e funcionam sob esse subcaminho.

As regras do domínio estão em [docs/02-regras-da-simulacao.md](docs/02-regras-da-simulacao.md).
