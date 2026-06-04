document.getElementById('filtros').addEventListener('click', e => {
    const btn = e.target.closest('.pill');
    if (!btn) return;
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    catAtual = btn.dataset.cat;
    renderProdutos(catAtual);
  });
