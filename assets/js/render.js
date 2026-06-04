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
         <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
           <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
         </svg>
         Pedir pelo WA
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