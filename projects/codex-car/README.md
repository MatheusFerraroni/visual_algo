# Veículos Neurais

Demonstração visual de veículos 2D controlados por rede neural e evoluídos com algoritmo genético.

## O que esta demo faz

- carrega uma pista padrão ao abrir a página
- permite editar paredes externas, internas e posição de largada
- executa uma população de veículos em tempo real ou em modo sem renderização
- ajusta arquitetura da rede neural, sensores e parâmetros do algoritmo genético
- mostra métricas da geração atual, inspeção de veículos e histórico de fitness
- permite importar/exportar pista e melhor rede via JSON ou `localStorage`

## Estrutura

- `index.html`: página principal da demonstração.
- `src/styles.css`: estilos específicos adaptados ao tema do Visual Algo.
- `src/js/main.js`: ponto de entrada da página.
- `src/js/core`: estado global, runtime e profiler.
- `src/js/track`: geometria e editor de pista.
- `src/js/neural`: modelo da rede neural.
- `src/js/sim`: evolução, inferência e worker de inferência.
- `src/js/render`: canvas e desenho da simulação.
- `src/js/ui`: controles, histórico e inspeção.

## Dependências

Esta demo não usa CDN.

- `p5.js`, `Bootstrap` e `TensorFlow.js` são carregados de `shared/libs` do repositório.

## Como abrir

Na raiz do repositório:

```bash
python3 -m http.server 8000
```

Depois abra:

```text
http://localhost:8000/projects/codex-car/
```
