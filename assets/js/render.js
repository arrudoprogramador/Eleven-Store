// ============================================================
// assets/js/render.js — criação de HTML e renderização dos grids
// Depende de: data.js (produtos), cart.js (adicionarAoCarrinho)
// ============================================================

/* ── Placeholder quando o produto não tem imagem ── */
function cardPlaceholder() {
  return `
    <div class="aspect-[3/4] w-full bg-gradient-to-br from-[#1a1a1a] to-[#222] flex items-center justify-center">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
           stroke="rgba(255,255,255,.12)" stroke-width="1">
        <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0
                 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.84H6v10c0
                 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0
                 0 .99-.84l.58-3.57a2 2 0 0 0-1.34-2.23z"/>
      </svg>
    </div>`;
}

/* ── Cria um card de produto ── */
function criarCard(produto) {
  // Imagem ou placeholder
  const imgHTML = produto.imagem
    ? `<img
         class="aspect-[3/4] w-full object-cover block bg-[#1a1a1a]"
         src="${produto.imagem}"
         alt="${produto.nome}"
         loading="lazy" />`
    : cardPlaceholder();

  // Badge (Novo / Esgotado)
  const badgeHTML = produto.novo
    ? `<span class="text-[.65rem] font-bold tracking-[.08em] uppercase bg-brand text-black px-2 py-0.5 rounded-full">Novo</span>`
    : !produto.disponivel
      ? `<span class="text-[.65rem] font-bold tracking-[.08em] uppercase bg-white/10 text-gray-400 px-2 py-0.5 rounded-full">Esgotado</span>`
      : '';

  // Botão de ação
  const btnHTML = produto.disponivel
    ? `<button
         onclick="adicionarAoCarrinho(${produto.id})"
         class="flex-1 flex items-center justify-center gap-1.5 bg-brand text-black font-bold text-xs py-2.5 rounded-full hover:bg-[#20c55e] active:scale-95 transition-all"
         aria-label="Adicionar ${produto.nome} ao carrinho">
         Adicionar ao carrinho
       </button>`
    : `<span class="flex-1 text-center text-xs text-gray-600 py-2.5 font-medium">Indisponível</span>`;

  const article = document.createElement('article');
  article.className = [
    'reveal',
    'bg-[#111]',
    'border border-white/[0.07]',
    'rounded-2xl overflow-hidden',
    'hover:-translate-y-1.5 hover:border-brand/30',
    'transition-all duration-300',
  ].join(' ');

  article.innerHTML = `
    <div class="relative">
      ${imgHTML}
      ${badgeHTML ? `<div class="absolute top-3 left-3">${badgeHTML}</div>` : ''}
    </div>
    <div class="p-4">
      <p class="text-xs text-gray-600 uppercase tracking-wider mb-1">${produto.categoria}</p>
      <h3 class="text-white font-semibold text-sm leading-tight mb-1">${produto.nome}</h3>
      <p class="text-brand font-bold text-base mb-3">R$ ${produto.preco.toFixed(2).replace('.', ',')}</p>
      <div class="flex gap-2">${btnHTML}</div>
    </div>
  `;

  return article;
}

/* ── Renderiza seção de destaques ── */
function renderDestaques() {
  const grid = document.getElementById('destaques-grid');
  grid.innerHTML = '';
  produtos
    .filter(p => p.destaque)
    .forEach(p => grid.appendChild(criarCard(p)));
}

/* ── Renderiza catálogo completo com filtro opcional ── */
function renderProdutos(categoria = 'todos') {
  const grid = document.getElementById('produtos-grid');
  grid.innerHTML = '';
  const lista = categoria === 'todos'
    ? produtos
    : produtos.filter(p => p.categoria === categoria);
  lista.forEach(p => grid.appendChild(criarCard(p)));
}