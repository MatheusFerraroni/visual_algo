# K-Means

Demonstração visual interativa do algoritmo K-Means construída com `p5.js`, `Chart.js`, `Bootstrap` e JavaScript modular sem framework.

## O que esta demo faz

- adiciona pontos amostrais manualmente no canvas
- adiciona centróides manualmente no canvas
- permite adição em lote de amostras
- executa o K-Means passo a passo ou continuamente
- permite alterar `K`, `seed`, limite de iterações e intervalo entre iterações
- oferece presets com cenários simples e desafiadores para o algoritmo
- mostra métricas por iteração e gráfico de cotovelo

## Estrutura

- [index.html](/Users/matheus/Projects/visual_algo/projects/kmeans/index.html): página principal da demonstração.
- [css/style.css](/Users/matheus/Projects/visual_algo/projects/kmeans/css/style.css): estilos específicos da interface.
- [assets](/Users/matheus/Projects/visual_algo/projects/kmeans/assets): espaço reservado para recursos do projeto.
- [js/main.js](/Users/matheus/Projects/visual_algo/projects/kmeans/js/main.js): bootstrap da interface e ligação dos controles.
- [js/kmeans-demo.js](/Users/matheus/Projects/visual_algo/projects/kmeans/js/kmeans-demo.js): orquestração principal da simulação e do canvas.
- [js/state.js](/Users/matheus/Projects/visual_algo/projects/kmeans/js/state.js): estado da simulação.
- [js/algorithm.js](/Users/matheus/Projects/visual_algo/projects/kmeans/js/algorithm.js): iteração do K-Means.
- [js/presets.js](/Users/matheus/Projects/visual_algo/projects/kmeans/js/presets.js): geração dos cenários predefinidos.
- [js/render.js](/Users/matheus/Projects/visual_algo/projects/kmeans/js/render.js): desenho de amostras, centróides e informações visuais no canvas.
- [js/metrics.js](/Users/matheus/Projects/visual_algo/projects/kmeans/js/metrics.js): cálculo das métricas da simulação.
- [js/elbow-analysis.js](/Users/matheus/Projects/visual_algo/projects/kmeans/js/elbow-analysis.js): análise do gráfico de cotovelo.
- [js/chart-controller.js](/Users/matheus/Projects/visual_algo/projects/kmeans/js/chart-controller.js): gráfico do histórico da simulação.
- [js/elbow-chart-controller.js](/Users/matheus/Projects/visual_algo/projects/kmeans/js/elbow-chart-controller.js): gráfico de cotovelo.
- [js/random.js](/Users/matheus/Projects/visual_algo/projects/kmeans/js/random.js): utilitários pseudoaleatórios determinísticos baseados em `seed`.
- [js/colors.js](/Users/matheus/Projects/visual_algo/projects/kmeans/js/colors.js): paleta compartilhada dos clusters.
- [js/config.js](/Users/matheus/Projects/visual_algo/projects/kmeans/js/config.js): configuração padrão, modos e presets.
- [js/canvas-space.js](/Users/matheus/Projects/visual_algo/projects/kmeans/js/canvas-space.js): cálculos normalizados pelo tamanho do canvas.
- [js/summary-controller.js](/Users/matheus/Projects/visual_algo/projects/kmeans/js/summary-controller.js): resumo textual dos dados atuais.

## Dependências locais

Esta demo não usa CDN.

- [shared/libs/p5.min.js](/Users/matheus/Projects/visual_algo/shared/libs/p5.min.js)
- [shared/libs/bootstrap.min.css](/Users/matheus/Projects/visual_algo/shared/libs/bootstrap.min.css)
- [shared/libs/chart.umd.min.js](/Users/matheus/Projects/visual_algo/shared/libs/chart.umd.min.js)

## Como abrir

Na raiz do repositório:

```bash
python3 -m http.server 8000
```

Depois abra:

```text
http://localhost:8000/projects/kmeans/
```

## Observações

- A simulação usa `seed` para tornar os cenários e inicializações pseudoaleatórias reproduzíveis.
- As iterações trabalham sobre snapshots do estado, então o usuário pode adicionar amostras durante a execução contínua.
- Os presets carregam apenas amostras; os centróides podem ser adicionados manualmente ou gerados a partir do valor atual de `K`.
