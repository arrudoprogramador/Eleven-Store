function gerarLinkWhatsapp() {
  const lista = carrinho
    .map(i => `• ${i.nome} (x${i.qtd}) — R$ ${(i.preco * i.qtd).toFixed(2).replace('.', ',')}`)
    .join('\n');
 
  const total = carrinho.reduce((s, i) => s + i.preco * i.qtd, 0);
 
  const mensagem = `Olá! Tenho interesse nos seguintes produtos:\n\n${lista}\n\n*Total: R$ ${total.toFixed(2).replace('.', ',')}*`;
 
  return `https://wa.me/${NUMERO_WA}?text=${encodeURIComponent(mensagem)}`;
}
 
function sendToWhatsApp() {
  if (carrinho.length === 0) return;
  window.open(gerarLinkWhatsapp(), '_blank');
}
 