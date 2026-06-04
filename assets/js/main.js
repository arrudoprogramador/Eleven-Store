window.addEventListener('scroll', () => {
    document.getElementById('navbar')
    .classList.toggle('scrolled', window.scrollY > 40);
});

function observeReveal() {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(el => { if (el.isIntersecting) { el.target.classList.add('visible'); observer.unobserve(el.target); } });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal:not(.visible)').forEach(el => observer.observe(el));
}

renderDestaques();
renderProdutos();
renderCarrinho();
observeReveal();