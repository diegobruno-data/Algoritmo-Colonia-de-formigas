# Simulador de Colônia de Formigas (Ant System) — Rota de entregas

Atividade Prática sobre Colônia de Formigas — **Inteligência Artificial, UFPI, período 2026.2**.

- **Aplicação publicada (GitHub Pages):** `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`
- **Repositório:** `https://github.com/SEU-USUARIO/SEU-REPOSITORIO`

## Autores

| Nome | Matrícula |
|---|---|
| Diego Bruno | 20249021415 |
| GABRIEL SAMPAIO TEIXEIRA | 20249023287 |
| JOSE NELSON | 20249022083 |

## Descrição da solução

O simulador planeja a rota de um veículo que sai do depósito, visita cada ponto de entrega exatamente uma vez e retorna ao depósito, minimizando a distância total (problema do caixeiro-viajante). Tudo roda no navegador, em HTML, CSS e JavaScript puros, sem servidor, login ou instalação.

- **Grafo:** completo e não direcionado; a distância de cada aresta é euclidiana, `d(i,j) = √((xᵢ−xⱼ)² + (yᵢ−yⱼ)²)`, e fica fixa durante a execução.
- **Algoritmo:** variante **Ant System**, implementada pelos autores em `js/aco.js`.
  1. Todas as arestas começam com o mesmo feromônio τ₀.
  2. Em cada iteração, cada formiga constrói uma rota completa a partir do depósito, escolhendo só vértices ainda não visitados e voltando ao depósito no fim.
  3. Peso de escolha `w(i,j) = τ(i,j)^α × (1/d(i,j))^β`; probabilidade `p(i,j) = w(i,j) / Σ w(i,u)` (somente `u` não visitados); o próximo vértice sai de um **sorteio proporcional** (roleta), nunca “o de maior peso”.
  4. Todas as formigas da iteração usam os **mesmos feromônios**, do fim da iteração anterior. Só depois de todas terminarem se aplica `τ_novo(i,j) = (1 − ρ) · τ_antigo(i,j) + Σ Δτₖ(i,j)`, com `Δτₖ = Q / Lₖ` para cada formiga que percorreu a aresta (retorno ao depósito incluído, e sem contar duas vezes a mesma formiga na mesma aresta).
  5. A matriz é simétrica (`τ(i,j) = τ(j,i)`), a diagonal fica em zero e há um piso numérico de 10⁻¹² por aresta.
  6. Registra-se a melhor rota de cada iteração e a melhor de toda a execução.
- **Números pseudoaleatórios:** gerador `mulberry32` próprio, com semente, usado em todos os sorteios. A velocidade da animação só controla a pausa entre iterações e nunca consome sorteios.
- **Estabilidade numérica:** as probabilidades são calculadas em escala logarítmica (matematicamente equivalente à fórmula), para não gerar `Infinity`/`NaN` com α, β e feromônios grandes. Os pesos `w` exibidos nos logs são os da fórmula direta.

## Como usar

1. Abra a página. Ela já carrega um **cenário padrão com 10 vértices**. O botão **Instância de referência (A–D)** carrega A(0,0), B(3,0), C(3,4), D(0,4) com os parâmetros do teste 6.4.
2. Edite os vértices (identificador, x, y), adicione (até 12) ou remova, e escolha o depósito.
3. Ajuste os parâmetros e clique em **Reiniciar** para aplicar as mudanças. Enquanto houver alterações pendentes ou campos inválidos, **Executar** e **Avançar** ficam bloqueados.
4. **Executar** roda as iterações em sequência; **Pausar** preserva o estado e **Executar** retoma de onde parou; **Avançar uma iteração** completa uma iteração e permanece pausado; **Reiniciar** limpa o histórico, restaura τ₀ e restabelece a semente.
5. No grafo, passe o cursor (ou clique) em uma aresta para ver a distância e o feromônio; use **Rótulos nas arestas** para mostrar τ ou d sobre todas elas.
6. Em **Registros da iteração**, escolha uma iteração para ver: rota e comprimento de cada formiga; a construção passo a passo da rota da formiga 1 (vértice atual, candidatos, `w`, `p`, escolhido e retorno ao depósito); e, por aresta, o feromônio anterior, após evaporação, depósito total e final. **Clicar em um passo da construção o destaca no grafo** (candidatos tracejados com a probabilidade, escolhido em destaque).

### Leitura visual do grafo

- Espessura e opacidade da aresta ∝ feromônio τ. A legenda mostra três amostras com seus valores.
- A escala visual é **cumulativa** (nunca diminui): uma aresta cujo τ caiu aparece mais fina. Quando a escala aumenta numa iteração, a legenda avisa (“de τ = X para τ = Y”).
- Seta laranja: melhor rota acumulada. Linhas azul-esverdeadas: passo da construção selecionado.
- A distância é um custo fixo; o feromônio é atualizado pelo algoritmo; o peso `w` é calculado a partir dos dois e é outra grandeza.

## Parâmetros e validação

| Campo | Faixa | Observação |
|---|---|---|
| Vértices | 4 a 12 | identificador único (sem diferenciar maiúsculas), x e y finitos entre 0 e 1.000 com até 2 casas decimais; coordenadas duplicadas são bloqueadas |
| Depósito | um dos vértices | seleção na lista |
| Número de formigas | inteiro, 1 a 100 | |
| Número de iterações | inteiro, 1 a 200 | |
| Influência do feromônio (α) | 0 a 5 | com 0 o feromônio não influencia |
| Influência da distância (β) | 0 a 5 | com 0 a distância não influencia |
| Taxa de evaporação (ρ) | 0 % a 90 % | convertida em fração (50 % ⇒ 0,5) |
| Feromônio inicial (τ₀) | 0,01 a 100 | igual em todas as arestas |
| Constante de depósito (Q) | 0,01 a 10.000 | cada formiga deposita Q/L |
| Semente aleatória | inteiro | reproduz os sorteios |

Campos vazios, valores fora da faixa, não numéricos e entradas inconsistentes mostram mensagem junto do campo e um resumo, e bloqueiam a execução. Vírgula ou ponto são aceitos como separador decimal.

## Bibliotecas

**Nenhuma biblioteca externa.** O grafo e o gráfico são SVG gerado pelo próprio código; o gerador pseudoaleatório com semente, o Ant System e a validação foram escritos pelos autores.

## Estrutura

```
index.html        aplicação
tests.html        testes de validação executados no navegador
css/style.css     estilos
js/aco.js         núcleo do Ant System (sem DOM): grafo, probabilidades, sorteio, feromônio, validação
js/app.js         interface: formulário, controles, grafo, gráfico, histórico e logs
js/tests.js       testes da seção 6 do enunciado
run-tests.js      executa os testes no terminal: node run-tests.js
```

## Resultados dos testes de validação

Os testes controlados chamam as funções do núcleo diretamente (rotas e escolhas fornecidas por código). Para reproduzir: abra `tests.html` no navegador ou execute `node run-tests.js`. Resultado nas duas formas: **todos passaram** (tolerância absoluta de 0,000001; cálculos internos sem arredondamento, que só ocorre na exibição).

### 6.1 Instância de referência e cálculo das rotas

**Entrada:** A = (0,0), B = (3,0), C = (3,4), D = (0,4); depósito A.

| Rota | L obtido | Esperado |
|---|---|---|
| A → B → C → D → A | 14 | 14 |
| A → B → D → C → A | 16 | 16 |
| A → C → B → D → A | 18 | 18 |
| A → C → D → B → A | 16 | 16 |
| A → D → B → C → A | 18 | 18 |
| A → D → C → B → A | 14 | 14 |

Distâncias obtidas: A-B = 3, A-C = 5, A-D = 4, B-C = 4, B-D = 5, C-D = 3, e `d(i,i) = 0`. Rotas incompletas (`A,B,C,A`), com repetição (`A,B,B,C,A`) ou sem retorno ao depósito foram **rejeitadas**.
**Conclusão:** distâncias e comprimentos conferem; o ótimo é 14, atingido pelas duas orientações da mesma rota.

### 6.2 Probabilidades de escolha

**Entrada:** formiga em A, τ = 1 em todas as arestas, α = 1, β = 2.

| Candidato | w obtido | p obtida | p esperada |
|---|---|---|---|
| B | 0,11111111 (1/9) | 0,52015605 | 400/769 ≈ 0,520156 |
| C | 0,04 (1/25) | 0,18725618 | 144/769 ≈ 0,187256 |
| D | 0,0625 (1/16) | 0,29258778 | 225/769 ≈ 0,292588 |

A soma das probabilidades é 1. Após visitar B: p(B,C) = 0,6097561 (25/41) e p(B,D) = 0,3902439 (16/41); A e B não participam do sorteio. Com α = 0 e β = 0 (com τ e distâncias diferentes), as três probabilidades são 0,33333333. Com um único candidato, p = 1. Em 200.000 sorteios (semente 7) as frequências de B/C/D foram 0,5205 / 0,1877 / 0,2918, ou seja, nenhuma opção é descartada por não ter o maior peso.
**Conclusão:** todos os valores conferem dentro de 10⁻⁶ e o sorteio é realmente proporcional.

### 6.3 Evaporação e depósito

**Entrada:** τ₀ = 1, ρ = 50 %, Q = 14, 1 formiga, rota forçada A → B → C → D → A (L = 14).

Iteração 1:

```
AB: anterior 1; após evaporação 0,5; depósito 1; final 1,5
BC: anterior 1; após evaporação 0,5; depósito 1; final 1,5
CD: anterior 1; após evaporação 0,5; depósito 1; final 1,5
AD: anterior 1; após evaporação 0,5; depósito 1; final 1,5
AC: anterior 1; após evaporação 0,5; depósito 0; final 0,5
BD: anterior 1; após evaporação 0,5; depósito 0; final 0,5
```

Iteração 2 (mesma rota forçada): perímetro = 1,75 nas quatro arestas e diagonais = 0,25. Reinício com 2 formigas na mesma rota, 1 iteração: perímetro = 2,5 e diagonais = 0,5 (soma dos depósitos, sem atualização durante a construção).
**Conclusão:** o depósito de retorno D → A é contado, a matriz permanece simétrica com diagonal zero e todos os valores esperados foram obtidos.

### 6.4 Execução completa e reprodutibilidade

**Entrada:** instância 6.1, depósito A, 10 formigas, 30 iterações, α = 1, β = 2, ρ = 50 %, τ₀ = 1, Q = 14, semente 42.

**Saída:** 30 registros (um por iteração); melhor rota **A → B → C → D → A, comprimento 14**, já na iteração 1; a melhor distância acumulada foi 14 em todas as 30 iterações (nunca aumentou). O estado inicial é a iteração 0, com τ = 1 e melhor distância “ainda não calculada” (não zero). Repetir dados, parâmetros e semente produziu histórico idêntico; pausar na iteração 11, mexer na velocidade e retomar também.
**Conclusão:** a execução é válida, monotônica e reprodutível no mesmo sistema.

### 6.5 Efeito dos parâmetros e entradas inválidas

**Entrada:** instância 6.1, 10 formigas, 30 iterações, α = 1, ρ = 50 %, τ₀ = 1, Q = 14; β ∈ {0, 2}; sementes 1, 2, 3, 4 e 5.

| Configuração | Melhores finais (sementes 1–5) | Média | Execuções que atingiram 14 |
|---|---|---|---|
| β = 0 | 14, 14, 14, 14, 14 | 14 | 5 de 5 |
| β = 2 | 14, 14, 14, 14, 14 | 14 | 5 de 5 |

**Interpretação:** nesta instância há só 3 rotas distintas (6 se contarmos a orientação) e 300 construções por execução; qualquer configuração as visita todas, então β não faz diferença, como o enunciado antecipa.

**Experimento complementar (não exigido).** No cenário padrão de 10 vértices (ótimo 2950,9854, obtido por força bruta), com 15 formigas, 60 iterações, α = 1, ρ = 10 %, τ₀ = 1, Q = 1000 e sementes 1–5:

| Configuração | Melhores finais | Média | Atingiram o ótimo |
|---|---|---|---|
| β = 0 | 3117,97; 3602,96; 3554,30; 3117,97; 3451,25 | 3368,89 | 0 de 5 |
| β = 2 | 2950,99 em todas | 2950,99 | 5 de 5 |

Em um problema maior o efeito de β aparece claramente: sem a informação de distância, o feromônio sozinho reforça rotas ruins sorteadas no começo; com β = 2, as formigas já partem de rotas melhores e o feromônio as consolida.

**Entradas inválidas.** Foram bloqueadas, com mensagem clara, todas as 28 entradas inválidas testadas: identificador repetido ou vazio, coordenadas duplicadas, menos de 4 e mais de 12 vértices, coordenada vazia, acima de 1.000, negativa, com 3 casas decimais ou não numérica, depósito inexistente, e valores vazios, não inteiros ou fora das faixas de formigas, iterações, α, β, ρ, τ₀, Q e semente. Duas entradas de controle (válidas, inclusive nos limites α = 0, β = 5, ρ = 90 %) foram aceitas. A lista completa com as mensagens aparece em `tests.html`.

**ρ = 0 %:** a evaporação não alterou nenhuma aresta e o feromônio nunca diminuiu em 30 iterações; com uma formiga e rota forçada, só os depósitos mudaram τ (perímetro 2 e diagonais 1).

## Como publicar no GitHub Pages

1. Crie um repositório **público** no GitHub e envie todos os arquivos desta pasta para a raiz (`index.html` precisa ficar na raiz).
2. Em **Settings → Pages**, em *Build and deployment*, escolha **Deploy from a branch**, branch `main` e pasta `/ (root)`, e salve.
3. Depois de alguns minutos a página abre em `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`.
4. Na página publicada, o link **“Repositório no GitHub”** (topo e rodapé) é montado automaticamente a partir do endereço do GitHub Pages. Falta apenas, neste README, trocar `SEU-USUARIO`/`SEU-REPOSITORIO` pelos nomes reais e preencher nomes e matrículas dos autores.
5. Entregue o link do GitHub Pages (o link do repositório sozinho não substitui).
