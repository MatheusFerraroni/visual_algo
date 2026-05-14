# Template

Pasta modelo para criar uma nova demonstracao visual.

## Como copiar

1. Copie `projects/template/` para uma nova pasta dentro de `projects/`.
2. Renomeie a nova pasta com um nome curto e descritivo.
3. Atualize o `index.html`, o `README.md` e os textos exibidos.
4. Implemente a logica da demonstracao em `js/main.js`.
5. Adicione arquivos auxiliares em `js/`, `assets/` ou em `shared/` quando fizer sentido.
6. Inclua um link para a nova pasta na home em `/index.html`.

## Estrutura

- `index.html`: pagina da demonstracao.
- `css/style.css`: estilos especificos do projeto.
- `js/main.js`: ponto de entrada do projeto.
- `js/template-demo.js`: classe base da demonstracao atual.
- `assets/`: imagens, dados ou outros recursos do projeto.

## Observacoes

- O `p5.min.js` e o `bootstrap.min.css` sao carregados localmente de `shared/libs/`.
- O HTML usa `type="module"` para permitir `import/export`.
- Este template nao implementa nenhum algoritmo; ele serve apenas como base copiavel.
