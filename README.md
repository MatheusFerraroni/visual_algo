# Visual Algo

Repositório para hospedar demonstrações visuais de algoritmos com HTML, CSS e JavaScript puro, publicado no GitHub Pages a partir da raiz do projeto.

## Estrutura

```text
/
├── index.html
├── README.md
├── css/
│   └── global.css
├── shared/
│   ├── libs/
│   │   ├── bootstrap.min.css
│   │   ├── chart.umd.min.js
│   │   ├── p5.min.js
│   │   └── tf.min.js
│   ├── math/
│   ├── ui/
│   └── utils/
└── projects/
    ├── template/
    │   ├── index.html
    │   ├── README.md
    │   ├── assets/
    │   ├── css/
    │   │   └── style.css
    │   └── js/
    │       ├── main.js
    │       └── template-demo.js
    ├── kmeans/
        ├── index.html
        ├── README.md
        ├── assets/
        ├── css/
        │   └── style.css
        └── js/
            ├── algorithm.js
            ├── canvas-space.js
            ├── chart-controller.js
            ├── colors.js
            ├── config.js
            ├── elbow-analysis.js
            ├── elbow-chart-controller.js
            ├── kmeans-demo.js
            ├── main.js
            ├── metrics.js
            ├── presets.js
            ├── random.js
            ├── render.js
            ├── state.js
            └── summary-controller.js
    ├── perceptron/
    │   ├── index.html
    │   ├── README.md
    │   ├── assets/
    │   ├── css/
    │   │   └── style.css
    │   └── js/
    │       ├── activation-functions.js
    │       ├── chart-controller.js
    │       ├── main.js
    │       ├── p5-perceptron-view.js
    │       ├── perceptron-demo.js
    │       └── state.js
    └── codex-car/
        ├── index.html
        ├── README.md
        └── src/
            ├── styles.css
            └── js/
```

## Organização

- [index.html](/Users/matheus/Projects/visual_algo/index.html): home do repositório com a lista de demonstrações disponíveis.
- [css/global.css](/Users/matheus/Projects/visual_algo/css/global.css): estilos globais compartilhados.
- [shared/libs](/Users/matheus/Projects/visual_algo/shared/libs): bibliotecas locais versionadas no repositório.
- `shared/ui`, `shared/utils` e `shared/math`: espaço para código reutilizável entre demonstrações.
- [projects/template](/Users/matheus/Projects/visual_algo/projects/template): modelo base para criar novas demos.
- [projects/kmeans](/Users/matheus/Projects/visual_algo/projects/kmeans): demonstração interativa do algoritmo K-Means.
- [projects/perceptron](/Users/matheus/Projects/visual_algo/projects/perceptron): configurador e visualizador de um único perceptron.
- [projects/codex-car](/Users/matheus/Projects/visual_algo/projects/codex-car): simulação de veículos neurais evoluídos por algoritmo genético.

## Projetos atuais

- [Template](/Users/matheus/Projects/visual_algo/projects/template/index.html): base mínima para novas demonstrações com `p5.js`, `Bootstrap` local e JavaScript modular.
- [K-Means](/Users/matheus/Projects/visual_algo/projects/kmeans/index.html): demonstração interativa com adição manual de pontos e centróides, presets, execução passo a passo, execução contínua, métricas e gráfico de cotovelo.
- [Perceptron](/Users/matheus/Projects/visual_algo/projects/perceptron/index.html): configurador de entradas, pesos, bias e função de ativação com visualização do fluxo do perceptron.
- [Veículos Neurais](/Users/matheus/Projects/visual_algo/projects/codex-car/index.html): simulação de veículos 2D com editor de pista, rede neural, algoritmo genético e histórico de fitness.

## Como abrir localmente

Como os projetos usam módulos ES com `type="module"`, prefira abrir com um servidor local em vez de `file://`.

Exemplo com Python:

```bash
python3 -m http.server 8000
```

Depois acesse:

- `http://localhost:8000/`
- `http://localhost:8000/projects/template/`
- `http://localhost:8000/projects/kmeans/`
- `http://localhost:8000/projects/perceptron/`
- `http://localhost:8000/projects/codex-car/`

## Como criar uma nova demonstração

1. Copie [projects/template](/Users/matheus/Projects/visual_algo/projects/template) para uma nova pasta dentro de `projects/`.
2. Renomeie a pasta e ajuste título, descrição e textos da página.
3. Implemente a lógica da demonstração no `js/main.js` e, se necessário, crie módulos adicionais em `js/`.
4. Reaproveite código compartilhado em `shared/` quando fizer sentido.
5. Adicione o novo link na home em [index.html](/Users/matheus/Projects/visual_algo/index.html).

## Publicação no GitHub Pages

Este repositório foi organizado para publicar diretamente da raiz.

1. Envie o conteúdo para um repositório no GitHub.
2. Abra `Settings` > `Pages`.
3. Em `Build and deployment`, selecione:
   - `Source`: `Deploy from a branch`
   - `Branch`: a branch desejada
   - `Folder`: `/ (root)`
4. Salve a configuração e aguarde a publicação.

Com isso, a home será servida por `index.html` na raiz, e cada demonstração ficará acessível por sua subpasta em `projects/`.
