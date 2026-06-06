// ============================================================
// ELEVEN STORE — checkout.js
// Fase 1: Checkout UI (Nome, CEP, Frete, Pagamento)
// Integra-se com cart.js existente
// ============================================================

const Checkout = (() => {

  // ── Estado interno ──────────────────────────────────────────
  let state = {
    step: 1,          // 1=dados pessoais, 2=entrega, 3=pagamento, 4=resumo
    nome: '',
    email: '',
    telefone: '',
    cep: '',
    endereco: null,    // objeto retornado pelo ViaCEP
    numero: '',
    complemento: '',
    frete: null,       // { tipo, valor, prazo }
    pagamento: null,   // 'pix' | 'cartao'
    cartItems: [],
    subtotal: 0,
  };

  // ── Helpers ─────────────────────────────────────────────────
  const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const mask = {
    cep: (v) => v.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 9),
    tel: (v) => v.replace(/\D/g, '')
                  .replace(/(\d{2})(\d)/, '($1) $2')
                  .replace(/(\d{5})(\d)/, '$1-$2')
                  .slice(0, 15),
  };

  // ── Persistência de dados do cliente ────────────────────────
  const STORAGE_KEY = 'eleven_checkout_cliente';

  const salvarCliente = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      nome: state.nome,
      email: state.email,
      telefone: state.telefone,
      cep: state.cep,
      numero: state.numero,
      complemento: state.complemento,
    }));
  };

  const carregarCliente = () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch { return {}; }
  };

  // ── Frete via Melhor Envio (Fase 2) ─────────────────────────
  //
  // URL do proxy Vercel. Em desenvolvimento local use:
  //   http://localhost:3000/api/frete   (vercel dev)
  // Em produção a Vercel resolve automaticamente para /api/frete
  const FRETE_API_URL = '/api/frete';

  // Dimensões padrão por produto (cm / kg).
  // Idealmente esses valores viriam do data.js de cada produto.
  // Se seu data.js já tiver campos largura/altura/comprimento/peso, eles
  // serão usados automaticamente. Caso contrário, esses defaults entram.
  const DIMS_PADRAO = { largura: 15, altura: 5, comprimento: 20, peso: 0.3 };

  // Fallback regional usado quando o backend não está disponível
  // (ex: desenvolvimento sem Vercel rodando)
  const calcularFreteFallback = (cep) => {
    const prefix = parseInt(cep.slice(0, 2));
    if (prefix >= 1 && prefix <= 19)
      return [
        { tipo: 'SEDEX', label: 'SEDEX — Correios', valor: 24.90, prazo: '1-2 dias úteis' },
      ];
    if (prefix >= 20 && prefix <= 28)
      return [
        { tipo: 'SEDEX', label: 'SEDEX — Correios', valor: 32.90, prazo: '2-3 dias úteis' },
      ];
    return [
      { tipo: 'SEDEX', label: 'SEDEX — Correios', valor: 38.90, prazo: '3-5 dias úteis' },
    ];
  };

  const calcularFrete = async (cep) => {
    // Monta lista de produtos com dimensões para o Melhor Envio
    const produtos = state.cartItems.map(item => ({
      id:           item.id,
      preco:        item.preco   || item.price  || 0,
      quantidade:   item.quantidade || item.qty || item.quantity || 1,
      peso:         item.peso         || DIMS_PADRAO.peso,
      largura:      item.largura      || DIMS_PADRAO.largura,
      altura:       item.altura       || DIMS_PADRAO.altura,
      comprimento:  item.comprimento  || DIMS_PADRAO.comprimento,
    }));

    try {
      const res = await fetch(FRETE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cep_destino: cep, produtos }),
      });

      // Se o proxy não existir ainda (dev sem Vercel), usa fallback
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      if (data.aviso || !data.opcoes?.length) {
        console.warn('[frete] Melhor Envio sem opções, usando fallback:', data.aviso);
        return calcularFreteFallback(cep);
      }

      return data.opcoes;

    } catch (err) {
      // Backend indisponível — usa tabela regional para não travar o fluxo
      console.warn('[frete] Proxy indisponível, usando fallback regional:', err.message);
      return calcularFreteFallback(cep);
    }
  };

  // ── Busca CEP via ViaCEP ─────────────────────────────────────
  const buscarCEP = async (cep) => {
    const raw = cep.replace(/\D/g, '');
    if (raw.length !== 8) throw new Error('CEP inválido');
    const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
    const data = await res.json();
    if (data.erro) throw new Error('CEP não encontrado');
    return data;
  };

  // ── Injetar CSS do modal ─────────────────────────────────────
  const injectCSS = () => {
    if (document.getElementById('checkout-style')) return;
    const style = document.createElement('style');
    style.id = 'checkout-style';
    style.textContent = `
      /* ── Reset / base ── */
      #checkout-overlay {
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(0,0,0,.7);
        backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        padding: 1rem;
        animation: co-fadein .25s ease;
      }
      @keyframes co-fadein { from { opacity:0 } to { opacity:1 } }

      #checkout-modal {
        background: #0f0f0f;
        border: 1px solid #222;
        border-radius: 1.25rem;
        width: 100%; max-width: 540px;
        max-height: 92vh;
        overflow-y: auto;
        box-shadow: 0 32px 80px rgba(0,0,0,.8);
        animation: co-slidein .3s cubic-bezier(.16,1,.3,1);
        font-family: 'Segoe UI', system-ui, sans-serif;
        color: #f0f0f0;
        scrollbar-width: thin;
        scrollbar-color: #333 transparent;
      }
      @keyframes co-slidein {
        from { transform: translateY(40px); opacity:0 }
        to   { transform: translateY(0);    opacity:1 }
      }

      /* ── Cabeçalho ── */
      .co-header {
        position: sticky; top: 0;
        background: #0f0f0f;
        padding: 1.25rem 1.5rem 1rem;
        border-bottom: 1px solid #1c1c1c;
        display: flex; align-items: center; justify-content: space-between;
        z-index: 10;
      }
      .co-header h2 {
        font-size: 1.1rem; font-weight: 700;
        letter-spacing: -.3px; margin: 0;
      }
      .co-close {
        background: #1e1e1e; border: none; color: #aaa;
        width: 32px; height: 32px; border-radius: 50%;
        cursor: pointer; font-size: 1.1rem;
        display: flex; align-items: center; justify-content: center;
        transition: background .2s, color .2s;
      }
      .co-close:hover { background: #2d2d2d; color: #fff; }

      /* ── Steps indicator ── */
      .co-steps {
        display: flex; gap: 0; padding: 1rem 1.5rem .5rem;
      }
      .co-step-item {
        flex: 1; display: flex; flex-direction: column;
        align-items: center; position: relative;
      }
      .co-step-item:not(:last-child)::after {
        content: ''; position: absolute;
        top: 13px; left: 50%; width: 100%; height: 2px;
        background: #222;
        transition: background .3s;
      }
      .co-step-item.done::after,
      .co-step-item.active::after { background: #22c55e44; }

      .co-step-dot {
        width: 28px; height: 28px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: .7rem; font-weight: 700;
        background: #1a1a1a; border: 2px solid #333;
        color: #666; z-index: 1;
        transition: all .3s;
      }
      .co-step-item.active .co-step-dot {
        background: #22c55e; border-color: #22c55e; color: #000;
      }
      .co-step-item.done .co-step-dot {
        background: #15803d; border-color: #15803d; color: #fff;
      }
      .co-step-label {
        font-size: .62rem; color: #555; margin-top: .35rem;
        text-align: center; text-transform: uppercase; letter-spacing: .5px;
        transition: color .3s;
      }
      .co-step-item.active .co-step-label { color: #22c55e; }
      .co-step-item.done .co-step-label { color: #16a34a; }

      /* ── Body ── */
      .co-body { padding: 1.5rem; }

      /* ── Seção ── */
      .co-section { display: none; }
      .co-section.active { display: block; animation: co-fadein .2s ease; }

      .co-section-title {
        font-size: .8rem; text-transform: uppercase;
        letter-spacing: 1px; color: #22c55e;
        margin: 0 0 1rem; font-weight: 700;
      }

      /* ── Inputs ── */
      .co-field { margin-bottom: 1rem; }
      .co-field label {
        display: block; font-size: .78rem;
        color: #888; margin-bottom: .4rem; font-weight: 500;
      }
      .co-field input, .co-field select {
        width: 100%; background: #171717;
        border: 1.5px solid #2a2a2a;
        border-radius: .6rem;
        color: #f0f0f0;
        padding: .7rem .9rem;
        font-size: .9rem;
        transition: border-color .2s, box-shadow .2s;
        outline: none; box-sizing: border-box;
      }
      .co-field input:focus, .co-field select:focus {
        border-color: #22c55e;
        box-shadow: 0 0 0 3px rgba(34,197,94,.12);
      }
      .co-field input.error { border-color: #ef4444; }
      .co-field .co-error {
        font-size: .72rem; color: #ef4444; margin-top: .3rem;
      }
      .co-row { display: grid; gap: .75rem; }
      .co-row.col2 { grid-template-columns: 1fr 1fr; }
      .co-row.col3 { grid-template-columns: 1fr 1fr 1fr; }

      /* ── CEP helper ── */
      .co-cep-wrap { position: relative; }
      .co-cep-wrap input { padding-right: 2.8rem; }
      .co-cep-spinner {
        position: absolute; right: .8rem; top: 50%;
        transform: translateY(-50%);
        width: 18px; height: 18px;
        border: 2px solid #333;
        border-top-color: #22c55e;
        border-radius: 50%;
        animation: spin .7s linear infinite;
        display: none;
      }
      .co-cep-spinner.visible { display: block; }
      @keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }

      .co-address-found {
        background: #0d1f12;
        border: 1px solid #1a3d22;
        border-radius: .6rem;
        padding: .75rem 1rem;
        font-size: .82rem;
        color: #86efac;
        margin-bottom: 1rem;
        display: none;
      }
      .co-address-found.visible { display: block; }
      .co-address-found span { display: block; color: #4ade80; font-weight: 600; }

      /* ── Opções de frete ── */
      .co-frete-opts { display: flex; flex-direction: column; gap: .6rem; margin-bottom: 1rem; }
      .co-frete-opt {
        display: flex; align-items: center; justify-content: space-between;
        background: #161616;
        border: 1.5px solid #252525;
        border-radius: .7rem;
        padding: .8rem 1rem;
        cursor: pointer;
        transition: border-color .2s, background .2s;
      }
      .co-frete-opt:hover { border-color: #333; }
      .co-frete-opt.selected {
        border-color: #22c55e;
        background: #0d1f12;
      }
      .co-frete-opt input[type=radio] { display: none; }
      .co-frete-info .co-frete-label { font-size: .88rem; font-weight: 600; }
      .co-frete-info .co-frete-prazo { font-size: .72rem; color: #666; margin-top: .1rem; }
      .co-frete-price { font-size: .95rem; font-weight: 700; color: #22c55e; }
      .co-frete-loading {
        text-align: center; padding: 1.5rem;
        color: #555; font-size: .85rem;
        display: flex; flex-direction: column; align-items: center; gap: .75rem;
      }
      .co-frete-loading .co-spinner-lg {
        width: 32px; height: 32px;
        border: 3px solid #222;
        border-top-color: #22c55e;
        border-radius: 50%;
        animation: spin .8s linear infinite;
      }

      /* ── Pagamento ── */
      .co-pay-opts { display: grid; grid-template-columns: repeat(3, 1fr); gap: .75rem; margin-bottom: 1.25rem; }
      .co-pay-opt {
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: .4rem;
        background: #161616;
        border: 1.5px solid #252525;
        border-radius: .8rem;
        padding: 1rem .5rem;
        cursor: pointer;
        transition: border-color .2s, background .2s;
        text-align: center;
      }
      .co-pay-opt:hover { border-color: #333; }
      .co-pay-opt.selected { border-color: #22c55e; background: #0d1f12; }
      .co-pay-opt .co-pay-icon {
        display: flex; align-items: center; justify-content: center;
        width: 40px; height: 40px;
      }
      .co-pay-opt .co-pay-icon img { display: block; }
      .co-pay-opt .co-pay-label { font-size: .72rem; font-weight: 600; color: #bbb; }
      .co-pay-opt.selected .co-pay-label { color: #22c55e; }
      .co-pix-info {
        background: #0d1f12; border: 1px solid #1a3d22;
        border-radius: .7rem; padding: 1rem;
        font-size: .8rem; color: #86efac;
        margin-top: .75rem; display: none;
      }
      .co-pix-info.visible { display: block; }
      .co-pix-info strong { color: #4ade80; }

      /* ── Resumo ── */
      .co-summary-box {
        background: #111; border: 1px solid #1e1e1e;
        border-radius: .9rem; overflow: hidden;
        margin-bottom: 1.25rem;
      }
      .co-summary-items { padding: 1rem; }
      .co-summary-item {
        display: flex; justify-content: space-between;
        align-items: center; padding: .5rem 0;
        border-bottom: 1px solid #1a1a1a;
        font-size: .85rem;
      }
      .co-summary-item:last-child { border-bottom: none; }
      .co-summary-item .item-name { color: #ccc; }
      .co-summary-item .item-qty { color: #555; font-size: .75rem; }
      .co-summary-item .item-price { font-weight: 600; }

      .co-summary-totals { padding: 1rem; border-top: 1px solid #1e1e1e; }
      .co-total-row {
        display: flex; justify-content: space-between;
        font-size: .85rem; padding: .3rem 0; color: #888;
      }
      .co-total-row.grand {
        font-size: 1.05rem; font-weight: 700;
        color: #f0f0f0; padding-top: .75rem;
        border-top: 1px solid #222; margin-top: .5rem;
      }
      .co-total-row.grand .val { color: #22c55e; font-size: 1.15rem; }

      .co-info-grid {
        display: grid; grid-template-columns: 1fr 1fr;
        gap: .5rem; margin-bottom: 1.25rem;
      }
      .co-info-cell {
        background: #111; border: 1px solid #1e1e1e;
        border-radius: .6rem; padding: .75rem;
      }
      .co-info-cell .lbl { font-size: .65rem; color: #555; text-transform: uppercase; letter-spacing: .5px; }
      .co-info-cell .val { font-size: .82rem; color: #ccc; margin-top: .2rem; font-weight: 500; }

      /* ── Botões ── */
      .co-actions {
        display: flex; gap: .75rem;
        padding-top: 1rem; border-top: 1px solid #1a1a1a;
        margin-top: 1rem;
      }
      .co-btn {
        flex: 1; border: none; border-radius: .7rem;
        padding: .85rem 1rem; font-size: .9rem;
        font-weight: 700; cursor: pointer;
        transition: all .2s; display: flex;
        align-items: center; justify-content: center; gap: .5rem;
      }
      .co-btn-back {
        background: #1a1a1a; color: #aaa; flex: 0 0 auto;
        padding-inline: 1.25rem;
      }
      .co-btn-back:hover { background: #242424; color: #fff; }
      .co-btn-next {
        background: #22c55e; color: #000;
      }
      .co-btn-next:hover { background: #16a34a; transform: translateY(-1px); }
      .co-btn-next:disabled {
        background: #1a1a1a; color: #444;
        cursor: not-allowed; transform: none;
      }
      .co-btn-whatsapp {
        background: #25d366; color: #fff;
      }
      .co-btn-whatsapp:hover { background: #1db954; }

      /* ── Mobile ── */
      @media (max-width: 480px) {
        #checkout-modal { border-radius: 1rem 1rem 0 0; max-height: 96vh; }
        #checkout-overlay { align-items: flex-end; padding: 0; }
        .co-row.col2, .co-row.col3 { grid-template-columns: 1fr; }
        .co-pay-opts { grid-template-columns: repeat(3, 1fr); }
      }

      /* ── Tela PIX ── */
      .co-pix-screen {
        text-align: center; padding: .5rem 0 1rem;
      }
      .co-pix-screen .co-pix-title {
        font-size: 1rem; font-weight: 700; margin-bottom: .25rem;
      }
      .co-pix-screen .co-pix-subtitle {
        font-size: .8rem; color: #666; margin-bottom: 1.25rem;
      }
      .co-qr-wrap {
        display: inline-flex; align-items: center; justify-content: center;
        background: #fff; border-radius: .9rem; padding: .75rem;
        margin-bottom: 1rem;
        box-shadow: 0 0 0 1px #2a2a2a, 0 8px 32px rgba(0,0,0,.4);
      }
      .co-qr-wrap img { display: block; width: 180px; height: 180px; border-radius: .4rem; }

      .co-pix-timer {
        display: inline-flex; align-items: center; gap: .4rem;
        background: #1a1a1a; border: 1px solid #2a2a2a;
        border-radius: 2rem; padding: .35rem .85rem;
        font-size: .8rem; color: #aaa; margin-bottom: 1.25rem;
      }
      .co-pix-timer .timer-dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: #22c55e;
        animation: pulse-dot 1.4s ease-in-out infinite;
      }
      .co-pix-timer.expirando { border-color: #7f1d1d; color: #f87171; }
      .co-pix-timer.expirando .timer-dot { background: #ef4444; }
      @keyframes pulse-dot {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%       { opacity: .4; transform: scale(.7); }
      }

      .co-copia-cola-wrap { margin-bottom: 1rem; }
      .co-copia-cola-wrap label {
        display: block; font-size: .72rem; color: #555;
        text-transform: uppercase; letter-spacing: .5px; margin-bottom: .4rem;
      }
      .co-copia-cola-box {
        display: flex; gap: .5rem;
      }
      .co-copia-cola-box input {
        flex: 1; background: #111; border: 1.5px solid #2a2a2a;
        border-radius: .6rem; color: #888; padding: .6rem .8rem;
        font-size: .72rem; font-family: monospace; outline: none;
        cursor: default;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .co-btn-copiar {
        background: #1e1e1e; border: 1.5px solid #2a2a2a;
        border-radius: .6rem; color: #aaa;
        padding: .6rem .9rem; cursor: pointer;
        font-size: .8rem; font-weight: 600;
        white-space: nowrap; transition: all .2s;
      }
      .co-btn-copiar:hover { background: #252525; color: #fff; }
      .co-btn-copiar.copiado { border-color: #22c55e; color: #22c55e; }

      .co-pix-status {
        padding: .85rem 1rem; border-radius: .7rem;
        font-size: .82rem; font-weight: 600;
        margin-bottom: 1rem; display: none;
      }
      .co-pix-status.aguardando {
        display: flex; align-items: center; gap: .6rem;
        background: #111; border: 1px solid #222; color: #666;
      }
      .co-pix-status.aprovado {
        display: flex; align-items: center; gap: .6rem;
        background: #0d1f12; border: 1px solid #166534; color: #4ade80;
        animation: co-fadein .3s ease;
      }
      .co-pix-status.erro {
        display: block;
        background: #1a0a0a; border: 1px solid #7f1d1d; color: #f87171;
      }
      .co-pix-status .status-spinner {
        width: 16px; height: 16px; border: 2px solid #333;
        border-top-color: #555; border-radius: 50%;
        animation: spin .8s linear infinite; flex-shrink: 0;
      }

      .co-pix-gerando {
        display: flex; flex-direction: column;
        align-items: center; gap: 1rem;
        padding: 2rem 1rem; color: #555; font-size: .85rem;
      }
      .co-pix-gerando .co-spinner-lg {
        width: 40px; height: 40px;
        border: 3px solid #1e1e1e; border-top-color: #22c55e;
        border-radius: 50%; animation: spin .8s linear infinite;
      }
    `;
    document.head.appendChild(style);
  };

  // ── Montar HTML do modal ─────────────────────────────────────
  const buildModal = () => {
    const el = document.createElement('div');
    el.id = 'checkout-overlay';
    el.innerHTML = `
      <div id="checkout-modal" role="dialog" aria-modal="true" aria-label="Finalizar Pedido">

        <!-- Cabeçalho -->
        <div class="co-header">
          <h2>🛒 Finalizar Pedido</h2>
          <button class="co-close" id="co-close-btn" title="Fechar">✕</button>
        </div>

        <!-- Steps -->
        <div class="co-steps" id="co-steps"></div>

        <!-- Body -->
        <div class="co-body">

          <!-- STEP 1: Dados Pessoais -->
          <div class="co-section" id="co-step-1">
            <p class="co-section-title">Dados Pessoais</p>
            <div class="co-field">
              <label>Nome completo *</label>
              <input type="text" id="co-nome" placeholder="Seu nome" autocomplete="name"/>
              <div class="co-error" id="err-nome"></div>
            </div>
            <div class="co-row col2">
              <div class="co-field">
                <label>E-mail *</label>
                <input type="email" id="co-email" placeholder="seu@email.com" autocomplete="email"/>
                <div class="co-error" id="err-email"></div>
              </div>
              <div class="co-field">
                <label>WhatsApp *</label>
                <input type="tel" id="co-tel" placeholder="(11) 99999-9999" autocomplete="tel"/>
                <div class="co-error" id="err-tel"></div>
              </div>
            </div>
            <div class="co-actions">
              <button class="co-btn co-btn-next" id="co-next-1">Continuar →</button>
            </div>
          </div>

          <!-- STEP 2: Entrega -->
          <div class="co-section" id="co-step-2">
            <p class="co-section-title">Endereço de Entrega</p>
            <div class="co-row col2">
              <div class="co-field">
                <label>CEP *</label>
                <div class="co-cep-wrap">
                  <input type="text" id="co-cep" placeholder="00000-000" maxlength="9" inputmode="numeric"/>
                  <div class="co-cep-spinner" id="co-cep-spinner"></div>
                </div>
                <div class="co-error" id="err-cep"></div>
              </div>
              <div class="co-field">
                <label>Número *</label>
                <input type="text" id="co-numero" placeholder="123" inputmode="numeric"/>
                <div class="co-error" id="err-numero"></div>
              </div>
            </div>
            <div class="co-address-found" id="co-address-found"></div>
            <div class="co-field">
              <label>Complemento</label>
              <input type="text" id="co-complemento" placeholder="Apto, Bloco..."/>
            </div>

            <!-- Frete -->
            <p class="co-section-title" style="margin-top:1.25rem">Opção de Entrega</p>
            <div id="co-frete-container">
              <div class="co-frete-loading" id="co-frete-loading" style="display:none">
                <div class="co-spinner-lg"></div>
                Calculando opções de frete...
              </div>
              <div class="co-frete-opts" id="co-frete-opts"></div>
              <div class="co-error" id="err-frete"></div>
            </div>

            <div class="co-actions">
              <button class="co-btn co-btn-back" id="co-back-2">← Voltar</button>
              <button class="co-btn co-btn-next" id="co-next-2">Continuar →</button>
            </div>
          </div>

          <!-- STEP 3: Pagamento -->
          <div class="co-section" id="co-step-3">
            <p class="co-section-title">Forma de Pagamento</p>
            <div class="co-pay-opts">
              <div class="co-pay-opt" data-pay="pix">
                <div class="co-pay-icon">
                  <img src="./assets/img/icon-pix.svg" alt="PIX" width="28" height="28" style="vertical-align:middle;"/>
                </div>
                <div class="co-pay-label">PIX</div>
              </div>
              <div class="co-pay-opt" data-pay="cartao">
                <div class="co-pay-icon">
                  <img src="./assets/img/icon-cartao.svg" alt="Cartão" width="28" height="28" style="vertical-align:middle;"/>
                </div>
                <div class="co-pay-label">Cartão</div>
              </div>
              
            </div>
            <div class="co-error" id="err-pagamento"></div>
            <div class="co-pix-info" id="co-pix-info">
               <strong>PIX — Aprovação instantânea!</strong><br/>
              Após confirmar o pedido, você receberá um <strong>QR Code</strong> e o código
              <strong>Copia e Cola</strong>. O pedido é liberado automaticamente após o pagamento.
            </div>
            <div class="co-pix-info" id="co-cartao-info" style="display:none; background:#0f1523; border-color:#1e3a5f; color:#93c5fd;">
               <strong>Cartão de crédito/débito</strong><br/>
              Você será direcionado para o checkout seguro do <strong>Mercado Pago</strong>
              para inserir os dados do cartão.
            </div>
            
            <div class="co-actions">
              <button class="co-btn co-btn-back" id="co-back-3">← Voltar</button>
              <button class="co-btn co-btn-next" id="co-next-3">Ver Resumo →</button>
            </div>
          </div>

          <!-- STEP 4: Resumo -->
          <div class="co-section" id="co-step-4">
            <p class="co-section-title">Resumo do Pedido</p>

            <!-- Info grid -->
            <div class="co-info-grid" id="co-info-grid"></div>

            <!-- Itens -->
            <div class="co-summary-box">
              <div class="co-summary-items" id="co-summary-items"></div>
              <div class="co-summary-totals" id="co-summary-totals"></div>
            </div>

            <div class="co-actions">
              <button class="co-btn co-btn-back" id="co-back-4">← Voltar</button>
              <button class="co-btn co-btn-whatsapp" id="co-confirm-btn">
                Confirmar Pedido
              </button>
            </div>
          </div>

        </div><!-- /co-body -->
      </div><!-- /modal -->

      <!-- STEP 5: PIX — fora do co-body para ocupar toda a largura -->
      <div id="co-step-pix" style="display:none; padding: 1.5rem;">

        <!-- Estado: gerando QR Code -->
        <div class="co-pix-gerando" id="co-pix-gerando">
          <div class="co-spinner-lg"></div>
          Gerando QR Code PIX...
        </div>

        <!-- Estado: QR Code pronto -->
        <div id="co-pix-pronto" style="display:none;">
          <div class="co-pix-screen">
            <p class="co-pix-title">Pague com PIX</p>
            <p class="co-pix-subtitle">Escaneie o QR Code ou copie o código abaixo</p>

            <!-- QR Code -->
            <div class="co-qr-wrap">
              <img id="co-qr-img" src="" alt="QR Code PIX"/>
            </div>

            <!-- Timer de expiração -->
            <div class="co-pix-timer" id="co-pix-timer">
              <div class="timer-dot"></div>
              <span id="co-pix-timer-txt">Expira em 30:00</span>
            </div>

            <!-- Copia e Cola -->
            <div class="co-copia-cola-wrap">
              <label>PIX Copia e Cola</label>
              <div class="co-copia-cola-box">
                <input type="text" id="co-pix-codigo" readonly/>
                <button class="co-btn-copiar" id="co-btn-copiar">Copiar</button>
              </div>
            </div>
          </div>

          <!-- Status do pagamento (polling) -->
          <div class="co-pix-status aguardando" id="co-pix-status">
            <div class="status-spinner"></div>
            Aguardando confirmação do pagamento...
          </div>

          <!-- Botão WhatsApp (aparece após aprovação) -->
          <button class="co-btn co-btn-whatsapp" id="co-pix-whatsapp-btn" style="display:none; width:100%;">
            Pedido confirmado — Abrir WhatsApp
          </button>

          <p style="text-align:center; font-size:.72rem; color:#444; margin-top:1rem;">
            Após o pagamento, a confirmação é automática.<br/>
            Dúvidas? Entre em contato pelo WhatsApp da loja.
          </p>
        </div>

        <!-- Estado: erro ao gerar PIX -->
        <div class="co-pix-status erro" id="co-pix-erro" style="display:block; margin-bottom:1rem;"></div>

      </div><!-- /co-step-pix -->
    `;
    return el;
  };

  // ── Renderizar steps indicator ───────────────────────────────
  const renderSteps = () => {
    const labels = ['Dados', 'Entrega', 'Pagamento', 'Resumo'];
    const wrap = document.getElementById('co-steps');
    if (!wrap) return;
    wrap.innerHTML = labels.map((lbl, i) => {
      const n = i + 1;
      let cls = '';
      if (n < state.step) cls = 'done';
      else if (n === state.step) cls = 'active';
      const icon = n < state.step ? '✓' : n;
      return `
        <div class="co-step-item ${cls}">
          <div class="co-step-dot">${icon}</div>
          <div class="co-step-label">${lbl}</div>
        </div>`;
    }).join('');
  };

  // ── Navegar entre steps ──────────────────────────────────────
  const goTo = (step) => {
    document.querySelectorAll('.co-section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`co-step-${step}`);
    if (target) target.classList.add('active');
    state.step = step;
    renderSteps();
    document.getElementById('checkout-modal')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Validações ───────────────────────────────────────────────
  const setErr = (id, msg) => {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;
  };
  const clearErr = (id) => setErr(id, '');

  const validateStep1 = () => {
    let ok = true;
    const nome = document.getElementById('co-nome').value.trim();
    const email = document.getElementById('co-email').value.trim();
    const tel = document.getElementById('co-tel').value.replace(/\D/g, '');

    clearErr('err-nome'); clearErr('err-email'); clearErr('err-tel');

    if (nome.split(' ').length < 2) {
      setErr('err-nome', 'Informe nome e sobrenome'); ok = false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErr('err-email', 'E-mail inválido'); ok = false;
    }
    if (tel.length < 10) {
      setErr('err-tel', 'WhatsApp inválido'); ok = false;
    }

    if (ok) {
      state.nome = nome;
      state.email = email;
      state.telefone = tel;
      salvarCliente(); // ← persiste imediatamente
    }
    return ok;
  };

  const validateStep2 = () => {
    let ok = true;
    clearErr('err-cep'); clearErr('err-numero'); clearErr('err-frete');

    if (!state.endereco) {
      setErr('err-cep', 'Informe um CEP válido'); ok = false;
    }
    const num = document.getElementById('co-numero').value.trim();
    if (!num) {
      setErr('err-numero', 'Informe o número'); ok = false;
    }
    if (!state.frete) {
      setErr('err-frete', 'Selecione uma opção de frete'); ok = false;
    }

    if (ok) {
      state.numero = num;
      state.complemento = document.getElementById('co-complemento').value.trim();
      salvarCliente(); // ← persiste endereço também
    }
    return ok;
  };

  const validateStep3 = () => {
    clearErr('err-pagamento');
    if (!state.pagamento) {
      setErr('err-pagamento', 'Selecione uma forma de pagamento');
      return false;
    }
    return true;
  };

  // ── Renderizar resumo ────────────────────────────────────────
  const renderSummary = () => {
    // Info grid
    const payLabel = { pix: 'PIX', cartao: 'Cartão'};
    document.getElementById('co-info-grid').innerHTML = `
      <div class="co-info-cell"><div class="lbl">Cliente</div><div class="val">${state.nome}</div></div>
      <div class="co-info-cell"><div class="lbl">WhatsApp</div><div class="val">${mask.tel(state.telefone)}</div></div>
      <div class="co-info-cell"><div class="lbl">Endereço</div><div class="val">${state.endereco.logradouro}, ${state.numero}${state.complemento ? ' – ' + state.complemento : ''}</div></div>
      <div class="co-info-cell"><div class="lbl">Cidade / UF</div><div class="val">${state.endereco.localidade} / ${state.endereco.uf}</div></div>
      <div class="co-info-cell"><div class="lbl">Frete</div><div class="val">${state.frete.label}</div></div>
      <div class="co-info-cell"><div class="lbl">Pagamento</div><div class="val">${payLabel[state.pagamento]}</div></div>
    `;

    // Itens do carrinho
    const itemsHTML = state.cartItems.map(item => `
      <div class="co-summary-item">
        <div>
          <div class="item-name">${item.nome || item.name || item.title || 'Produto'}</div>
          <div class="item-qty">Qtd: ${item.quantidade || item.qty || item.quantity || 1}</div>
        </div>
        <div class="item-price">${fmt((item.preco || item.price || 0) * (item.quantidade || item.qty || item.quantity || 1))}</div>
      </div>`).join('');
    document.getElementById('co-summary-items').innerHTML = itemsHTML;

    // Totais
    const total = state.subtotal + state.frete.valor;
    document.getElementById('co-summary-totals').innerHTML = `
      <div class="co-total-row"><span>Subtotal</span><span>${fmt(state.subtotal)}</span></div>
      <div class="co-total-row"><span>Frete (${state.frete.prazo})</span><span>${fmt(state.frete.valor)}</span></div>
      <div class="co-total-row grand"><span>Total</span><span class="val">${fmt(total)}</span></div>
    `;
  };

  // ── Montar mensagem para WhatsApp ────────────────────────────
  // (Fase 2+: substituir por chamada ao backend para PIX)
  const buildWhatsappMsg = () => {
    const total = state.subtotal + state.frete.valor;
    const payLabel = { pix: 'PIX', cartao: 'Cartão de Crédito/Débito' };
    const itens = state.cartItems.map(item => {
      const qty = item.quantidade || item.qty || item.quantity || 1;
      const preco = item.preco || item.price || 0;
      return `• ${item.nome || item.name || item.title} (${qty}x) — ${fmt(preco * qty)}`;
    }).join('\n');

    return `*🛒 NOVO PEDIDO — Eleven Store*\n\n` +
      `*Cliente:* ${state.nome}\n` +
      `*WhatsApp:* ${mask.tel(state.telefone)}\n` +
      `*E-mail:* ${state.email}\n\n` +
      `*📦 Entrega:*\n` +
      `${state.endereco.logradouro}, ${state.numero}${state.complemento ? ', ' + state.complemento : ''}\n` +
      `${state.endereco.bairro} — ${state.endereco.localidade}/${state.endereco.uf}\n` +
      `CEP: ${state.cep}\n\n` +
      `*🛍️ Itens:*\n${itens}\n\n` +
      `*Subtotal:* ${fmt(state.subtotal)}\n` +
      `*Frete (${state.frete.label}):* ${fmt(state.frete.valor)}\n` +
      `*TOTAL: ${fmt(total)}*\n\n` +
      `*Pagamento:* ${payLabel[state.pagamento]}\n\n` +
      `_Pedido realizado via site_`;
  };

  // ── Eventos ──────────────────────────────────────────────────
  const bindEvents = () => {

    // Fechar
    document.getElementById('co-close-btn').addEventListener('click', Checkout.close);
    document.getElementById('checkout-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'checkout-overlay') Checkout.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') Checkout.close();
    });

    // Step 1 → 2
    document.getElementById('co-next-1').addEventListener('click', () => {
      if (validateStep1()) goTo(2);
    });

    // CEP: máscara + busca automática
    const cepInput = document.getElementById('co-cep');
    cepInput.addEventListener('input', async (e) => {
      e.target.value = mask.cep(e.target.value);
      const raw = e.target.value.replace(/\D/g, '');
      if (raw.length === 8) {
        // Buscar endereço
        const spinner = document.getElementById('co-cep-spinner');
        const addrBox = document.getElementById('co-address-found');
        const freteLoading = document.getElementById('co-frete-loading');
        const freteOpts = document.getElementById('co-frete-opts');

        spinner.classList.add('visible');
        addrBox.classList.remove('visible');
        freteLoading.style.display = 'flex';
        freteOpts.innerHTML = '';
        state.endereco = null;
        state.frete = null;
        state.cep = e.target.value;

        try {
          const addr = await buscarCEP(raw);
          state.endereco = addr;
          addrBox.innerHTML = `<span>✓ Endereço encontrado</span>${addr.logradouro}, ${addr.bairro} — ${addr.localidade}/${addr.uf}`;
          addrBox.classList.add('visible');
          clearErr('err-cep');

          // Calcular frete
          const opcoes = await calcularFrete(raw);
          freteLoading.style.display = 'none';
          freteOpts.innerHTML = opcoes.map((opt, i) => `
            <label class="co-frete-opt" data-tipo="${opt.tipo}">
              <input type="radio" name="frete" value="${opt.tipo}" ${i === 0 ? 'checked' : ''}/>
              <div class="co-frete-info">
                <div class="co-frete-label">${opt.label}</div>
                <div class="co-frete-prazo">${opt.prazo}</div>
              </div>
              <div class="co-frete-price">${fmt(opt.valor)}</div>
            </label>`).join('');

          // Pré-selecionar primeira opção
          state.frete = opcoes[0];
          freteOpts.querySelector('.co-frete-opt').classList.add('selected');

          // Bind seleção de frete
          freteOpts.querySelectorAll('.co-frete-opt').forEach(opt => {
            opt.addEventListener('click', () => {
              freteOpts.querySelectorAll('.co-frete-opt').forEach(o => o.classList.remove('selected'));
              opt.classList.add('selected');
              const tipo = opt.dataset.tipo;
              state.frete = opcoes.find(o => o.tipo === tipo);
            });
          });
        } catch (err) {
          setErr('err-cep', err.message || 'Erro ao buscar CEP');
          freteLoading.style.display = 'none';
        } finally {
          spinner.classList.remove('visible');
        }
      }
    });

    // Tel: máscara
    document.getElementById('co-tel').addEventListener('input', (e) => {
      e.target.value = mask.tel(e.target.value);
    });

    // Step 2 → 1 / 3
    document.getElementById('co-back-2').addEventListener('click', () => goTo(1));
    document.getElementById('co-next-2').addEventListener('click', () => {
      if (validateStep2()) goTo(3);
    });

    // Pagamento
    document.querySelectorAll('.co-pay-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.co-pay-opt').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        state.pagamento = opt.dataset.pay;

        // Info boxes
        ['co-pix-info', 'co-cartao-info'].forEach(id => {
          document.getElementById(id).style.display = 'none';
          document.getElementById(id).classList.remove('visible');
        });
        const infoMap = { pix: 'co-pix-info', cartao: 'co-cartao-info' };
        const box = document.getElementById(infoMap[state.pagamento]);
        box.style.display = 'block';
        box.classList.add('visible');
        clearErr('err-pagamento');
      });
    });

    // Step 3 → 2 / 4
    document.getElementById('co-back-3').addEventListener('click', () => goTo(2));
    document.getElementById('co-next-3').addEventListener('click', () => {
      if (validateStep3()) {
        renderSummary();
        goTo(4);
      }
    });

    // Step 4 → 3
    document.getElementById('co-back-4').addEventListener('click', () => goTo(3));

    // Confirmar pedido
    document.getElementById('co-confirm-btn').addEventListener('click', async () => {
      const btn = document.getElementById('co-confirm-btn');

      if (state.pagamento === 'pix') {
        // ── Fluxo PIX ─────────────────────────────────────────
        btn.disabled = true;
        btn.textContent = 'Gerando PIX...';

        // Esconde steps e corpo, mostra tela PIX
        document.getElementById('co-steps').style.display = 'none';
        document.getElementById('co-step-4').style.display = 'none';
        const pixScreen = document.getElementById('co-step-pix');
        pixScreen.style.display = 'block';

        const total = state.subtotal + state.frete.valor;

        try {
          const res = await fetch('/api/criar-pix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pedido: {
                nome:      state.nome,
                email:     state.email,
                telefone:  state.telefone,
                total,
                pagamento: 'pix',
                itens:     state.cartItems,
                endereco:  { ...state.endereco, numero: state.numero, complemento: state.complemento },
                frete:     state.frete,
              },
            }),
          });

          const data = await res.json();

          if (!res.ok) throw new Error(data.erro || 'Erro ao gerar PIX');

          // ── Exibe QR Code ──────────────────────────────────
          document.getElementById('co-pix-gerando').style.display = 'none';
          document.getElementById('co-pix-pronto').style.display  = 'block';

          // QR Code (imagem base64)
          const qrImg = document.getElementById('co-qr-img');
          qrImg.src = `data:image/png;base64,${data.qrCodeBase64}`;

          // Código copia e cola
          document.getElementById('co-pix-codigo').value = data.qrCode;

          // ── Timer de expiração (30 min) ────────────────────
          let segundos = 30 * 60;
          const timerEl  = document.getElementById('co-pix-timer');
          const timerTxt = document.getElementById('co-pix-timer-txt');
          const timerInterval = setInterval(() => {
            segundos--;
            const m = String(Math.floor(segundos / 60)).padStart(2, '0');
            const s = String(segundos % 60).padStart(2, '0');
            timerTxt.textContent = `Expira em ${m}:${s}`;
            if (segundos <= 300) timerEl.classList.add('expirando');  // últimos 5 min
            if (segundos <= 0) {
              clearInterval(timerInterval);
              timerTxt.textContent = 'PIX expirado';
              clearInterval(pollingInterval);
              document.getElementById('co-pix-status').className = 'co-pix-status erro';
              document.getElementById('co-pix-status').innerHTML = 'O PIX expirou. Feche e tente novamente.';
            }
          }, 1000);

          // ── Botão copiar ───────────────────────────────────
          document.getElementById('co-btn-copiar').addEventListener('click', () => {
            navigator.clipboard.writeText(data.qrCode).then(() => {
              const btn = document.getElementById('co-btn-copiar');
              btn.textContent = '✓ Copiado!';
              btn.classList.add('copiado');
              setTimeout(() => { btn.textContent = 'Copiar'; btn.classList.remove('copiado'); }, 2500);
            });
          });

          // ── Polling de status a cada 3s ────────────────────
          const paymentId = data.paymentId;
          let pollingInterval;

          const verificarStatus = async () => {
            try {
              const r = await fetch(`/api/webhook-pix?id=${paymentId}`);
              const d = await r.json();

              if (d.status === 'approved') {
                clearInterval(pollingInterval);
                clearInterval(timerInterval);

                // Atualiza UI para aprovado
                document.getElementById('co-pix-status').className = 'co-pix-status aprovado';
                document.getElementById('co-pix-status').innerHTML = 'Pagamento confirmado! Abrindo WhatsApp...';

                // Limpa carrinho
                if (typeof clearCart === 'function') clearCart();

                // Exibe botão WhatsApp e dispara automaticamente após 2s
                const waBtn = document.getElementById('co-pix-whatsapp-btn');
                waBtn.style.display = 'block';

                const phone = (typeof NUMERO_WA !== 'undefined') ? NUMERO_WA : '5511916169179';
                const msg   = buildWhatsappMsg();
                const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;

                waBtn.addEventListener('click', () => window.open(waUrl, '_blank'));
                setTimeout(() => window.open(waUrl, '_blank'), 2000);
              }

              if (d.status === 'rejected' || d.status === 'cancelled') {
                clearInterval(pollingInterval);
                clearInterval(timerInterval);
                document.getElementById('co-pix-status').className = 'co-pix-status erro';
                document.getElementById('co-pix-status').innerHTML = 'Pagamento não aprovado. Feche e tente novamente.';
              }

            } catch (err) {
              // Erro de rede no polling — ignora e tenta na próxima rodada
              console.warn('[polling] Erro temporário:', err.message);
            }
          };

          // Primeira verificação imediata, depois a cada 3s
          verificarStatus();
          pollingInterval = setInterval(verificarStatus, 3000);

        } catch (err) {
          // Erro ao gerar PIX — mostra mensagem e fallback
          document.getElementById('co-pix-gerando').style.display = 'none';
          const erroEl = document.getElementById('co-pix-erro');
          erroEl.style.display = 'block';
          erroEl.innerHTML = `
            ⚠️ <strong>Não foi possível gerar o PIX.</strong><br/>
            ${err.message}<br/><br/>
            <button onclick="Checkout.close()" style="
              margin-top:.5rem; background:#1e1e1e; border:1px solid #333;
              color:#ccc; padding:.5rem 1rem; border-radius:.5rem; cursor:pointer;
            ">Fechar e tentar novamente</button>
          `;
        }

      } else {
        // ── Fluxo Cartão  → WhatsApp direto ─────────
        const msg   = buildWhatsappMsg();
        const phone = (typeof NUMERO_WA !== 'undefined') ? NUMERO_WA : '5511916169179';
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
        if (typeof clearCart === 'function') clearCart();
      }
    });
  };

  // ── API pública ──────────────────────────────────────────────
  return {

    /**
     * Abre o modal de checkout.
     * @param {Array}  cartItems  - itens do carrinho [{nome, preco, quantidade, ...}]
     * @param {number} subtotal   - valor total dos produtos
     */
    open(cartItems = [], subtotal = 0) {
      if (document.getElementById('checkout-overlay')) return; // já aberto

      injectCSS();

      // Recupera dados salvos do cliente anterior
      const saved = carregarCliente();

      state = {
        step: 1,
        nome: saved.nome || '',
        email: saved.email || '',
        telefone: saved.telefone || '',
        cep: saved.cep || '',
        endereco: null,
        numero: saved.numero || '',
        complemento: saved.complemento || '',
        frete: null,
        pagamento: null,
        cartItems,
        subtotal,
      };

      const modal = buildModal();
      document.body.appendChild(modal);
      document.body.style.overflow = 'hidden';

      renderSteps();
      goTo(1);
      bindEvents();

      // Preenche campos com dados salvos
      if (saved.nome)      document.getElementById('co-nome').value  = saved.nome;
      if (saved.email)     document.getElementById('co-email').value = saved.email;
      if (saved.telefone)  document.getElementById('co-tel').value   = mask.tel(saved.telefone);

      // Foco no primeiro campo vazio ou no nome
      setTimeout(() => {
        const primeiro = !saved.nome ? 'co-nome'
                       : !saved.email ? 'co-email'
                       : !saved.telefone ? 'co-tel'
                       : 'co-nome';
        document.getElementById(primeiro)?.focus();
      }, 100);
    },

    close() {
      const overlay = document.getElementById('checkout-overlay');
      if (overlay) {
        overlay.style.animation = 'co-fadein .2s ease reverse';
        setTimeout(() => {
          overlay.remove();
          document.body.style.overflow = '';
          document.removeEventListener('keydown', Checkout.close);
        }, 180);
      }
    },
  };
})();

// Exporta globalmente
window.Checkout = Checkout;