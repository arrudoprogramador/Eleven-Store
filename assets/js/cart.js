// ============================================================
// assets/js/cart.js — estado e lógica do carrinho
// Depende de: data.js (NUMERO_WA, produtos)
// ============================================================

let carrinho = JSON.parse(localStorage.getItem('eleven_cart') || '[]');

/* ── Persistência ── */
function salvarCarrinho() {
  localStorage.setItem('eleven_cart', JSON.stringify(carrinho));
}

/* ── Ações ── */
function adicionarAoCarrinho(id) {
  const prod = produtos.find(p => p.id === id);
  if (!prod || !prod.disponivel) return;

  const existente = carrinho.find(i => i.id === id);
  if (existente) {
    existente.qtd++;
  } else {
    carrinho.push({ ...prod, qtd: 1 });
  }

  salvarCarrinho();
  renderCarrinho();
  openCart();
}

function removerDoCarrinho(id) {
  carrinho = carrinho.filter(i => i.id !== id);
  salvarCarrinho();
  renderCarrinho();
}

function clearCart() {
  carrinho = [];
  salvarCarrinho();
  renderCarrinho();
}

/* ── Drawer ── */
function openCart() {
  document.getElementById('cart-drawer').classList.remove('translate-x-full');
  document.getElementById('cart-overlay').classList.remove('opacity-0', 'pointer-events-none');
  document.getElementById('cart-overlay').classList.add('opacity-100');
}

function closeCart() {
  document.getElementById('cart-drawer').classList.add('translate-x-full');
  document.getElementById('cart-overlay').classList.add('opacity-0', 'pointer-events-none');
  document.getElementById('cart-overlay').classList.remove('opacity-100');
}

/* ── Render do carrinho ── */
function renderCarrinho() {
  const list      = document.getElementById('cart-items');
  const empty     = document.getElementById('cart-empty');
  const badge     = document.getElementById('cart-badge');
  const subtotalEl = document.getElementById('cart-subtotal');

  const qtdTotal = carrinho.reduce((s, i) => s + i.qtd, 0);
  const total    = carrinho.reduce((s, i) => s + i.preco * i.qtd, 0);

  // Badge
  subtotalEl.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
  if (qtdTotal > 0) {
    badge.textContent = qtdTotal;
    badge.classList.remove('hidden');
    badge.classList.add('flex');
  } else {
    badge.classList.add('hidden');
    badge.classList.remove('flex');
  }

  // Limpa itens anteriores
  list.querySelectorAll('.cart-item').forEach(el => el.remove());

  if (carrinho.length === 0) {
    empty.style.display = '';
    return;
  }

  empty.style.display = 'none';

  carrinho.forEach(item => {
    const div = document.createElement('div');
    div.className = 'cart-item flex items-center gap-3 p-3 rounded-xl border border-white/[0.08] bg-white/[0.03]';
    div.innerHTML = `
      <div class="w-14 h-14 rounded-xl bg-white/[0.05] flex items-center justify-center shrink-0 text-gray-600">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.57a2 2 0 0 0-1.34-2.23z"/>
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-white text-sm font-medium truncate">${item.nome}</p>
        <p class="text-brand text-xs font-semibold mt-0.5">
          R$ ${item.preco.toFixed(2).replace('.', ',')} × ${item.qtd}
        </p>
      </div>
      <button
        onclick="removerDoCarrinho(${item.id})"
        class="w-7 h-7 rounded-full flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors text-base"
        aria-label="Remover ${item.nome}">&times;</button>
    `;
    list.appendChild(div);
  });
}