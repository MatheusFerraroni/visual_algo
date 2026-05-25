# Perceptron

Configurador e visualizador de um unico perceptron.

## Estrutura

- `index.html`: pagina principal da demonstracao.
- `css/style.css`: layout da interface, cards visuais e grafico.
- `js/main.js`: ponto de entrada da interface.
- `js/perceptron-demo.js`: classe principal da demonstracao.
- `js/p5-perceptron-view.js`: visualizacao complementar do fluxo do perceptron em canvas.
- `js/state.js`: estado inicial, vetores de entradas/pesos e sincronizacao de dimensionalidade.
- `js/activation-functions.js`: catalogo das funcoes de ativacao.
- `js/chart-controller.js`: geracao do grafico automatico por variacao das entradas.
- `assets/`: imagens, dados ou outros recursos do projeto.

## O que a base atual cobre

- configuracao do numero de entradas
- configuracao da funcao de ativacao
- edicao direta das entradas, pesos e bias
- visualizacao da soma ponderada e do output
- grafico que varia automaticamente cada entrada dentro de um intervalo
