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

/* ── Gera HTML dos botões de tamanho ── */
function tamanhosBtnsHTML(produto) {
  if (!produto.tamanhos) return '';

  const btns = Object.entries(produto.tamanhos).map(([tam, disponivel]) => {
    if (!disponivel) {
      // Esgotado: riscado, não clicável
      return `
        <button
          disabled
          class="size-btn relative w-9 h-9 rounded-lg text-xs font-bold
                 border border-white/[0.06] text-gray-600 cursor-not-allowed
                 overflow-hidden select-none"
          title="${tam} — Esgotado">
          ${tam}
          <span class="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span class="absolute w-[120%] h-px bg-white/20 rotate-[-35deg]"></span>
          </span>
        </button>`;
    }
    // Disponível: clicável
    return `
      <button
        data-tam="${tam}"
        data-id="${produto.id}"
        onclick="selecionarTamanho(this)"
        class="size-btn w-9 h-9 rounded-lg text-xs font-bold
               border border-white/[0.12] text-gray-300
               hover:border-brand hover:text-brand
               transition-all duration-150 select-none"
        title="${tam}">
        ${tam}
      </button>`;
  }).join('');

  return `
    <div class="mb-3">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-[.65rem] text-gray-600 uppercase tracking-wider">Tamanho</span>
        <span class="size-hint text-[.65rem] text-gray-600" id="hint-${produto.id}">Selecione</span>
      </div>
      <div class="flex gap-1.5" id="tamanhos-${produto.id}">
        ${btns}
      </div>
    </div>`;
}

/* ── Seleciona tamanho — chamado pelo onclick dos botões ── */
function selecionarTamanho(btn) {
  const id = btn.dataset.id;

  // Remove seleção anterior no mesmo card
  document.querySelectorAll(`#tamanhos-${id} .size-btn`).forEach(b => {
    b.classList.remove('!border-brand', '!text-brand', 'bg-brand/10');
  });

  // Marca o clicado
  btn.classList.add('!border-brand', '!text-brand', 'bg-brand/10');

  // Atualiza hint
  const hint = document.getElementById(`hint-${id}`);
  if (hint) hint.textContent = btn.dataset.tam;

  // Habilita o botão de adicionar ao carrinho
  const addBtn = document.getElementById(`add-btn-${id}`);
  if (addBtn) {
    addBtn.disabled = false;
    addBtn.classList.remove('opacity-40', 'cursor-not-allowed');
    addBtn.classList.add('hover:bg-[#20c55e]', 'active:scale-95');
  }
}

/* ── Cria um card de produto ── */
function criarCard(produto) {
  const temTamanhos = produto.tamanhos && Object.values(produto.tamanhos).some(v => v);

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
  // Se tem tamanhos, começa desabilitado até o usuário selecionar um
  const btnHTML = produto.disponivel
    ? `<button
         id="add-btn-${produto.id}"
         onclick="adicionarAoCarrinhoComTamanho(${produto.id})"
         ${temTamanhos ? 'disabled' : ''}
         class="flex-1 flex items-center justify-center gap-1.5
                bg-brand text-black font-bold text-xs py-2.5 rounded-full
                transition-all
                ${temTamanhos ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#20c55e] active:scale-95'}"
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
      ${tamanhosBtnsHTML(produto)}
      <div class="flex gap-2">${btnHTML}</div>
    </div>
  `;

  return article;
}

/* ── Adiciona ao carrinho com tamanho selecionado ── */
function adicionarAoCarrinhoComTamanho(id) {
  const produto = produtos.find(p => p.id === id);
  if (!produto || !produto.disponivel) return;

  // Descobre tamanho selecionado
  const tamBtn = document.querySelector(`#tamanhos-${id} .size-btn.\\!border-brand`);
  const tamanho = tamBtn ? tamBtn.dataset.tam : null;

  // Se tem tamanhos configurados mas nenhum foi selecionado, ignora
  if (produto.tamanhos && !tamanho) return;

  // Chama adicionarAoCarrinho do cart.js passando tamanho
  adicionarAoCarrinho(id, tamanho);
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