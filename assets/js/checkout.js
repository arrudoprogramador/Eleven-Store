const Checkout = (() => {

  const SK_CLIENTE = 'eleven_checkout_cliente';   
  const SK_SESSAO  = 'eleven_checkout_sessao';    
  const SK_PIX     = 'eleven_checkout_pix';       

  let state = {
    step: 1,
    nome: '', email: '', telefone: '',
    cep: '', endereco: null, numero: '', complemento: '',
    frete: null, pagamento: null,
    cartItems: [], subtotal: 0,
  };

  let _pollingInterval = null;
  let _timerInterval   = null;

  const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const mask = {
    cep: (v) => v.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 9),
    tel: (v) => v.replace(/\D/g, '')
                  .replace(/(\d{2})(\d)/, '($1) $2')
                  .replace(/(\d{5})(\d)/, '$1-$2')
                  .slice(0, 15),
  };

  const salvarCliente = () => {
    localStorage.setItem(SK_CLIENTE, JSON.stringify({
      nome: state.nome, email: state.email, telefone: state.telefone,
      cep: state.cep, numero: state.numero, complemento: state.complemento,
    }));
  };

  const salvarSessao = () => {
    sessionStorage.setItem(SK_SESSAO, JSON.stringify({
      step:      state.step,
      frete:     state.frete,
      pagamento: state.pagamento,
      endereco:  state.endereco,
      subtotal:  state.subtotal,
      cartItems: state.cartItems,
    }));
  };

  // Salva dados do PIX gerado (para retomada após reload)
  const salvarPix = (pixData) => {
    sessionStorage.setItem(SK_PIX, JSON.stringify({
      paymentId:    pixData.paymentId,
      qrCode:       pixData.qrCode,
      qrCodeBase64: pixData.qrCodeBase64,
      expiracao:    pixData.expiracao,
      savedAt:      Date.now(),
    }));
  };

  const limparPix    = () => sessionStorage.removeItem(SK_PIX);
  const limparSessao = () => sessionStorage.removeItem(SK_SESSAO);

  const carregarCliente = () => {
    try { return JSON.parse(localStorage.getItem(SK_CLIENTE) || '{}'); }
    catch { return {}; }
  };
  const carregarSessao = () => {
    try { return JSON.parse(sessionStorage.getItem(SK_SESSAO) || 'null'); }
    catch { return null; }
  };
  const carregarPix = () => {
    try { return JSON.parse(sessionStorage.getItem(SK_PIX) || 'null'); }
    catch { return null; }
  };

  // ── Frete ────────────────────────────────────────────────────
  const FRETE_API_URL = '/api/frete';
  const DIMS_PADRAO   = { largura: 15, altura: 5, comprimento: 20, peso: 0.3 };

  const calcularFreteFallback = (cep) => {
    const p = parseInt(cep.slice(0, 2));
    if (p >= 1  && p <= 19) return [
      { tipo: 'SEDEX', label: 'SEDEX — Correios', valor: 0.90, prazo: '1-2 dias úteis' },
    ];
    if (p >= 20 && p <= 28) return [
      { tipo: 'SEDEX', label: 'SEDEX — Correios', valor: 1.90, prazo: '2-3 dias úteis' },
    ];
    return [
      { tipo: 'SEDEX', label: 'SEDEX — Correios', valor: 2.90, prazo: '3-5 dias úteis' },
    ];
  };

  const calcularFrete = async (cep) => {
    const produtos = state.cartItems.map(item => ({
      id: item.id,
      preco: item.preco || item.price || 0,
      quantidade: item.quantidade || item.qty || item.quantity || 1,
      peso: item.peso || DIMS_PADRAO.peso,
      largura: item.largura || DIMS_PADRAO.largura,
      altura: item.altura || DIMS_PADRAO.altura,
      comprimento: item.comprimento || DIMS_PADRAO.comprimento,
    }));
    try {
      const res = await fetch(FRETE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cep_destino: cep, produtos }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.aviso || !data.opcoes?.length) return calcularFreteFallback(cep);
      return data.opcoes;
    } catch {
      return calcularFreteFallback(cep);
    }
  };

  // ── Busca CEP ────────────────────────────────────────────────
  const buscarCEP = async (cep) => {
    const raw = cep.replace(/\D/g, '');
    if (raw.length !== 8) throw new Error('CEP inválido');
    const res  = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
    const data = await res.json();
    if (data.erro) throw new Error('CEP não encontrado');
    return data;
  };

  // ── CSS ──────────────────────────────────────────────────────
  const injectCSS = () => {
    if (document.getElementById('checkout-style')) return;
    const style = document.createElement('style');
    style.id = 'checkout-style';
    style.textContent = `
      #checkout-overlay {
        position:fixed; inset:0; z-index:9999;
        background:rgba(0,0,0,.75); backdrop-filter:blur(6px);
        display:flex; align-items:center; justify-content:center;
        padding:1rem; animation:co-fadein .25s ease;
      }
      @keyframes co-fadein { from{opacity:0} to{opacity:1} }

      #checkout-modal {
        background:#0f0f0f; border:1px solid #222;
        border-radius:1.25rem; width:100%; max-width:540px;
        max-height:92vh; overflow-y:auto;
        box-shadow:0 32px 80px rgba(0,0,0,.8);
        animation:co-slidein .3s cubic-bezier(.16,1,.3,1);
        font-family:'Segoe UI',system-ui,sans-serif;
        color:#f0f0f0; scrollbar-width:thin; scrollbar-color:#333 transparent;
      }
      @keyframes co-slidein {
        from{transform:translateY(40px);opacity:0}
        to{transform:translateY(0);opacity:1}
      }

      .co-header {
        position:sticky; top:0; background:#0f0f0f;
        padding:1.25rem 1.5rem 1rem;
        border-bottom:1px solid #1c1c1c;
        display:flex; align-items:center; justify-content:space-between; z-index:10;
      }
      .co-header h2 { font-size:1.1rem; font-weight:700; letter-spacing:-.3px; margin:0; }
      .co-close {
        background:#1e1e1e; border:none; color:#aaa;
        width:32px; height:32px; border-radius:50%; cursor:pointer;
        font-size:1.1rem; display:flex; align-items:center; justify-content:center;
        transition:background .2s,color .2s;
      }
      .co-close:hover { background:#2d2d2d; color:#fff; }

      .co-steps { display:flex; padding:1rem 1.5rem .5rem; }
      .co-step-item {
        flex:1; display:flex; flex-direction:column;
        align-items:center; position:relative;
      }
      .co-step-item:not(:last-child)::after {
        content:''; position:absolute; top:13px; left:50%;
        width:100%; height:2px; background:#222; transition:background .3s;
      }
      .co-step-item.done::after,.co-step-item.active::after { background:#22c55e44; }
      .co-step-dot {
        width:28px; height:28px; border-radius:50%;
        display:flex; align-items:center; justify-content:center;
        font-size:.7rem; font-weight:700;
        background:#1a1a1a; border:2px solid #333; color:#666; z-index:1;
        transition:all .3s;
      }
      .co-step-item.active .co-step-dot { background:#22c55e; border-color:#22c55e; color:#000; }
      .co-step-item.done  .co-step-dot  { background:#15803d; border-color:#15803d; color:#fff; }
      .co-step-label {
        font-size:.62rem; color:#555; margin-top:.35rem;
        text-align:center; text-transform:uppercase; letter-spacing:.5px; transition:color .3s;
      }
      .co-step-item.active .co-step-label { color:#22c55e; }
      .co-step-item.done   .co-step-label { color:#16a34a; }

      .co-body { padding:1.5rem; }
      .co-section { display:none; }
      .co-section.active { display:block; animation:co-fadein .2s ease; }
      .co-section-title {
        font-size:.8rem; text-transform:uppercase;
        letter-spacing:1px; color:#22c55e; margin:0 0 1rem; font-weight:700;
      }

      .co-field { margin-bottom:1rem; }
      .co-field label { display:block; font-size:.78rem; color:#888; margin-bottom:.4rem; font-weight:500; }
      .co-field input,.co-field select {
        width:100%; background:#171717; border:1.5px solid #2a2a2a;
        border-radius:.6rem; color:#f0f0f0; padding:.7rem .9rem;
        font-size:.9rem; transition:border-color .2s,box-shadow .2s;
        outline:none; box-sizing:border-box;
      }
      .co-field input:focus,.co-field select:focus {
        border-color:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,.12);
      }
      .co-field .co-error { font-size:.72rem; color:#ef4444; margin-top:.3rem; }
      .co-row { display:grid; gap:.75rem; }
      .co-row.col2 { grid-template-columns:1fr 1fr; }

      .co-cep-wrap { position:relative; }
      .co-cep-wrap input { padding-right:2.8rem; }
      .co-cep-spinner {
        position:absolute; right:.8rem; top:50%; transform:translateY(-50%);
        width:18px; height:18px; border:2px solid #333; border-top-color:#22c55e;
        border-radius:50%; animation:spin .7s linear infinite; display:none;
      }
      .co-cep-spinner.visible { display:block; }
      @keyframes spin { to { transform:translateY(-50%) rotate(360deg); } }

      .co-address-found {
        background:#0d1f12; border:1px solid #1a3d22; border-radius:.6rem;
        padding:.75rem 1rem; font-size:.82rem; color:#86efac;
        margin-bottom:1rem; display:none;
      }
      .co-address-found.visible { display:block; }
      .co-address-found span { display:block; color:#4ade80; font-weight:600; }

      .co-frete-opts { display:flex; flex-direction:column; gap:.6rem; margin-bottom:1rem; }
      .co-frete-opt {
        display:flex; align-items:center; justify-content:space-between;
        background:#161616; border:1.5px solid #252525; border-radius:.7rem;
        padding:.8rem 1rem; cursor:pointer; transition:border-color .2s,background .2s;
      }
      .co-frete-opt:hover { border-color:#333; }
      .co-frete-opt.selected { border-color:#22c55e; background:#0d1f12; }
      .co-frete-opt input[type=radio] { display:none; }
      .co-frete-info .co-frete-label { font-size:.88rem; font-weight:600; }
      .co-frete-info .co-frete-prazo { font-size:.72rem; color:#666; margin-top:.1rem; }
      .co-frete-price { font-size:.95rem; font-weight:700; color:#22c55e; }
      .co-frete-loading {
        text-align:center; padding:1.5rem; color:#555; font-size:.85rem;
        display:flex; flex-direction:column; align-items:center; gap:.75rem;
      }
      .co-frete-loading .co-spinner-lg {
        width:32px; height:32px; border:3px solid #222; border-top-color:#22c55e;
        border-radius:50%; animation:spin .8s linear infinite;
      }

      .co-pay-opts { display:grid; grid-template-columns:repeat(2,1fr); gap:.75rem; margin-bottom:1.25rem; }
      .co-pay-opt {
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        gap:.4rem; background:#161616; border:1.5px solid #252525; border-radius:.8rem;
        padding:1rem .5rem; cursor:pointer; transition:border-color .2s,background .2s; text-align:center;
      }
      .co-pay-opt:hover { border-color:#333; }
      .co-pay-opt.selected { border-color:#22c55e; background:#0d1f12; }
      .co-pay-opt .co-pay-icon { display:flex; align-items:center; justify-content:center; width:40px; height:40px; }
      .co-pay-opt .co-pay-icon img { display:block; }
      .co-pay-opt .co-pay-label { font-size:.72rem; font-weight:600; color:#bbb; }
      .co-pay-opt.selected .co-pay-label { color:#22c55e; }
      .co-pay-info {
        background:#0d1f12; border:1px solid #1a3d22; border-radius:.7rem;
        padding:1rem; font-size:.8rem; color:#86efac;
        margin-top:.75rem; display:none;
      }
      .co-pay-info.visible { display:block; }
      .co-pay-info strong { color:#4ade80; }

      .co-summary-box {
        background:#111; border:1px solid #1e1e1e;
        border-radius:.9rem; overflow:hidden; margin-bottom:1.25rem;
      }
      .co-summary-items { padding:1rem; }
      .co-summary-item {
        display:flex; justify-content:space-between; align-items:center;
        padding:.5rem 0; border-bottom:1px solid #1a1a1a; font-size:.85rem;
      }
      .co-summary-item:last-child { border-bottom:none; }
      .co-summary-item .item-name { color:#ccc; }
      .co-summary-item .item-qty  { color:#555; font-size:.75rem; }
      .co-summary-item .item-price { font-weight:600; }
      .co-summary-totals { padding:1rem; border-top:1px solid #1e1e1e; }
      .co-total-row { display:flex; justify-content:space-between; font-size:.85rem; padding:.3rem 0; color:#888; }
      .co-total-row.grand {
        font-size:1.05rem; font-weight:700; color:#f0f0f0;
        padding-top:.75rem; border-top:1px solid #222; margin-top:.5rem;
      }
      .co-total-row.grand .val { color:#22c55e; font-size:1.15rem; }
      .co-info-grid { display:grid; grid-template-columns:1fr 1fr; gap:.5rem; margin-bottom:1.25rem; }
      .co-info-cell { background:#111; border:1px solid #1e1e1e; border-radius:.6rem; padding:.75rem; }
      .co-info-cell .lbl { font-size:.65rem; color:#555; text-transform:uppercase; letter-spacing:.5px; }
      .co-info-cell .val { font-size:.82rem; color:#ccc; margin-top:.2rem; font-weight:500; }

      .co-actions { display:flex; gap:.75rem; padding-top:1rem; border-top:1px solid #1a1a1a; margin-top:1rem; }
      .co-btn {
        flex:1; border:none; border-radius:.7rem; padding:.85rem 1rem;
        font-size:.9rem; font-weight:700; cursor:pointer;
        transition:all .2s; display:flex; align-items:center; justify-content:center; gap:.5rem;
      }
      .co-btn-back { background:#1a1a1a; color:#aaa; flex:0 0 auto; padding-inline:1.25rem; }
      .co-btn-back:hover { background:#242424; color:#fff; }
      .co-btn-next { background:#22c55e; color:#000; }
      .co-btn-next:hover { background:#16a34a; transform:translateY(-1px); }
      .co-btn-next:disabled { background:#1a1a1a; color:#444; cursor:not-allowed; transform:none; }
      .co-btn-whatsapp { background:#25d366; color:#fff; }
      .co-btn-whatsapp:hover { background:#1db954; }

      /* ── Tela PIX — DENTRO do modal agora ── */
      #co-step-pix { padding:1.5rem; }

      .co-pix-gerando {
        display:flex; flex-direction:column; align-items:center;
        gap:1rem; padding:3rem 1rem; color:#555; font-size:.85rem;
      }
      .co-pix-gerando .co-spinner-lg {
        width:44px; height:44px; border:3px solid #1e1e1e; border-top-color:#22c55e;
        border-radius:50%; animation:spin .8s linear infinite;
      }

      .co-pix-screen { display:flex; flex-direction:column; align-items:center; }
      .co-pix-screen .co-pix-title {
        font-size:1.1rem; font-weight:700; margin:0 0 .3rem; text-align:center;
      }
      .co-pix-screen .co-pix-subtitle {
        font-size:.8rem; color:#666; margin:0 0 1.25rem; text-align:center;
      }

      .co-qr-wrap {
        background:#fff; border-radius:1rem; padding:.85rem;
        margin-bottom:1rem;
        box-shadow:0 0 0 1px #2a2a2a, 0 8px 32px rgba(0,0,0,.5);
      }
      .co-qr-wrap img { display:block; width:200px; height:200px; border-radius:.4rem; }

      .co-pix-timer {
        display:inline-flex; align-items:center; gap:.4rem;
        background:#1a1a1a; border:1px solid #2a2a2a; border-radius:2rem;
        padding:.35rem .9rem; font-size:.8rem; color:#aaa; margin-bottom:1.25rem;
      }
      .co-pix-timer .timer-dot {
        width:7px; height:7px; border-radius:50%; background:#22c55e;
        animation:pulse-dot 1.4s ease-in-out infinite;
      }
      .co-pix-timer.expirando { border-color:#7f1d1d; color:#f87171; }
      .co-pix-timer.expirando .timer-dot { background:#ef4444; }
      @keyframes pulse-dot {
        0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.7)}
      }

      .co-copia-cola-wrap { width:100%; margin-bottom:1.25rem; }
      .co-copia-cola-wrap > label {
        display:block; font-size:.65rem; color:#555;
        text-transform:uppercase; letter-spacing:.5px; margin-bottom:.5rem;
      }
      .co-copia-cola-box { display:flex; gap:.5rem; }
      .co-copia-cola-box input {
        flex:1; background:#111; border:1.5px solid #2a2a2a; border-radius:.6rem;
        color:#777; padding:.65rem .8rem; font-size:.72rem; font-family:monospace;
        outline:none; cursor:default; min-width:0;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      }
      .co-btn-copiar {
        background:#1e1e1e; border:1.5px solid #2a2a2a; border-radius:.6rem;
        color:#aaa; padding:.65rem 1rem; cursor:pointer;
        font-size:.78rem; font-weight:600; white-space:nowrap; transition:all .2s; flex-shrink:0;
      }
      .co-btn-copiar:hover { background:#252525; color:#fff; }
      .co-btn-copiar.copiado { border-color:#22c55e; color:#22c55e; }

      .co-pix-status {
        width:100%; padding:.85rem 1rem; border-radius:.7rem;
        font-size:.82rem; font-weight:600; margin-bottom:1rem; display:none;
        box-sizing:border-box;
      }
      .co-pix-status.aguardando {
        display:flex; align-items:center; gap:.6rem;
        background:#111; border:1px solid #222; color:#666;
      }
      .co-pix-status.aprovado {
        display:flex; align-items:center; gap:.6rem;
        background:#0d1f12; border:1px solid #166534; color:#4ade80;
        animation:co-fadein .4s ease;
      }
      .co-pix-status.erro {
        display:block; background:#1a0a0a; border:1px solid #7f1d1d; color:#f87171;
      }
      .co-pix-status .status-spinner {
        width:16px; height:16px; border:2px solid #333; border-top-color:#22c55e;
        border-radius:50%; animation:spin .8s linear infinite; flex-shrink:0;
      }

      .co-pix-footer {
        text-align:center; font-size:.72rem; color:#3a3a3a; margin-top:.75rem; line-height:1.6;
      }

      /* ── Mobile ── */
      @media (max-width:480px) {
        #checkout-modal { border-radius:1rem 1rem 0 0; max-height:96vh; }
        #checkout-overlay { align-items:flex-end; padding:0; }
        .co-row.col2 { grid-template-columns:1fr; }
        .co-pay-opts { grid-template-columns:1fr 1fr; }
        .co-qr-wrap img { width:180px; height:180px; }
      }
    `;
    document.head.appendChild(style);
  };

  // ── HTML do modal ────────────────────────────────────────────
  const buildModal = () => {
    const el = document.createElement('div');
    el.id = 'checkout-overlay';
    el.innerHTML = `
      <div id="checkout-modal" role="dialog" aria-modal="true" aria-label="Finalizar Pedido">

        <div class="co-header">
          <h2>Finalizar Pedido</h2>
          <button class="co-close" id="co-close-btn" title="Fechar">✕</button>
        </div>

        <div class="co-steps" id="co-steps"></div>

        <div class="co-body">

          <!-- STEP 1 -->
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

          <!-- STEP 2 -->
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
            <p class="co-section-title" style="margin-top:1.25rem">Opção de Entrega</p>
            <div id="co-frete-container">
              <div class="co-frete-loading" id="co-frete-loading" style="display:none">
                <div class="co-spinner-lg"></div>
                Calculando frete...
              </div>
              <div class="co-frete-opts" id="co-frete-opts"></div>
              <div class="co-error" id="err-frete"></div>
            </div>
            <div class="co-actions">
              <button class="co-btn co-btn-back" id="co-back-2">← Voltar</button>
              <button class="co-btn co-btn-next" id="co-next-2">Continuar →</button>
            </div>
          </div>

          <!-- STEP 3 -->
          <div class="co-section" id="co-step-3">
            <p class="co-section-title">Forma de Pagamento</p>
            <div class="co-pay-opts">
              <div class="co-pay-opt" data-pay="pix">
                <div class="co-pay-icon">
                  <img src="./assets/img/icon-pix.svg" alt="PIX" width="28" height="28"/>
                </div>
                <div class="co-pay-label">PIX</div>
              </div>
              <div class="co-pay-opt" data-pay="cartao">
                <div class="co-pay-icon">
                  <img src="./assets/img/icon-cartao.svg" alt="Cartão" width="28" height="28"/>
                </div>
                <div class="co-pay-label">Cartão</div>
              </div>
            </div>
            <div class="co-error" id="err-pagamento"></div>
            <div class="co-pay-info" id="co-pix-info">
              <strong>PIX — Aprovação instantânea!</strong><br/>
              Você receberá um <strong>QR Code</strong> e o código <strong>Copia e Cola</strong>.
              O pedido é liberado automaticamente após o pagamento.
            </div>
            <div class="co-pay-info" id="co-cartao-info" style="background:#0f1523;border-color:#1e3a5f;color:#93c5fd;">
              <strong>Cartão de crédito/débito</strong><br/>
              Você será direcionado para o checkout seguro do <strong>Mercado Pago</strong>.
            </div>
            <div class="co-actions">
              <button class="co-btn co-btn-back" id="co-back-3">← Voltar</button>
              <button class="co-btn co-btn-next" id="co-next-3">Ver Resumo →</button>
            </div>
          </div>

          <!-- STEP 4 -->
          <div class="co-section" id="co-step-4">
            <p class="co-section-title">Resumo do Pedido</p>
            <div class="co-info-grid" id="co-info-grid"></div>
            <div class="co-summary-box">
              <div class="co-summary-items" id="co-summary-items"></div>
              <div class="co-summary-totals" id="co-summary-totals"></div>
            </div>
            <div class="co-actions">
              <button class="co-btn co-btn-back" id="co-back-4">← Voltar</button>
              <button class="co-btn co-btn-whatsapp" id="co-confirm-btn">Confirmar Pedido</button>
            </div>
          </div>

          <!-- STEP 5: PIX — DENTRO do co-body, mesmo scroll do modal -->
          <div class="co-section" id="co-step-pix">

            <!-- Estado: gerando -->
            <div class="co-pix-gerando" id="co-pix-gerando">
              <div class="co-spinner-lg"></div>
              Gerando QR Code PIX...
            </div>

            <!-- Estado: pronto -->
            <div id="co-pix-pronto" style="display:none">
              <div class="co-pix-screen">
                <p class="co-pix-title">Pague com PIX</p>
                <p class="co-pix-subtitle">Escaneie o QR Code ou use o Copia e Cola</p>
                <div class="co-qr-wrap">
                  <img id="co-qr-img" src="" alt="QR Code PIX"/>
                </div>
                <div class="co-pix-timer" id="co-pix-timer">
                  <div class="timer-dot"></div>
                  <span id="co-pix-timer-txt">Expira em 30:00</span>
                </div>
                <div class="co-copia-cola-wrap">
                  <label>PIX Copia e Cola</label>
                  <div class="co-copia-cola-box">
                    <input type="text" id="co-pix-codigo" readonly/>
                    <button class="co-btn-copiar" id="co-btn-copiar">Copiar</button>
                  </div>
                </div>
              </div>

              <div class="co-pix-status aguardando" id="co-pix-status">
                <div class="status-spinner"></div>
                Aguardando confirmação do pagamento...
              </div>

              <button class="co-btn co-btn-whatsapp" id="co-pix-whatsapp-btn"
                style="display:none;width:100%;margin-bottom:.75rem;">
                Pedido confirmado — Abrir WhatsApp
              </button>

              <p class="co-pix-footer">
                Confirmação automática após pagamento.<br/>
                Dúvidas? Entre em contato pelo WhatsApp da loja.
              </p>
            </div>

            <!-- Estado: erro -->
            <div id="co-pix-erro" style="display:none;padding:1rem;background:#1a0a0a;border:1px solid #7f1d1d;border-radius:.7rem;color:#f87171;font-size:.82rem;"></div>

          </div>

        </div><!-- /co-body -->
      </div><!-- /modal -->
    `;
    return el;
  };

  // ── Steps indicator ──────────────────────────────────────────
  const renderSteps = () => {
    const labels = ['Dados', 'Entrega', 'Pagamento', 'Resumo'];
    const wrap = document.getElementById('co-steps');
    if (!wrap) return;
    // Na tela PIX esconde os steps
    if (state.step === 5) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'flex';
    wrap.innerHTML = labels.map((lbl, i) => {
      const n = i + 1;
      const cls = n < state.step ? 'done' : n === state.step ? 'active' : '';
      return `<div class="co-step-item ${cls}">
        <div class="co-step-dot">${n < state.step ? '✓' : n}</div>
        <div class="co-step-label">${lbl}</div>
      </div>`;
    }).join('');
  };

  // ── Navegação ────────────────────────────────────────────────
  const goTo = (step) => {
    document.querySelectorAll('.co-section').forEach(s => s.classList.remove('active'));
    const id = step === 5 ? 'co-step-pix' : `co-step-${step}`;
    document.getElementById(id)?.classList.add('active');
    state.step = step;
    renderSteps();
    salvarSessao();
    document.getElementById('checkout-modal')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Validações ───────────────────────────────────────────────
  const setErr   = (id, msg) => { const el = document.getElementById(id); if (el) el.textContent = msg; };
  const clearErr = (id) => setErr(id, '');

  const validateStep1 = () => {
    let ok = true;
    const nome  = document.getElementById('co-nome').value.trim();
    const email = document.getElementById('co-email').value.trim();
    const tel   = document.getElementById('co-tel').value.replace(/\D/g, '');
    clearErr('err-nome'); clearErr('err-email'); clearErr('err-tel');
    if (nome.split(' ').length < 2)                        { setErr('err-nome',  'Informe nome e sobrenome'); ok = false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))        { setErr('err-email', 'E-mail inválido'); ok = false; }
    if (tel.length < 10)                                   { setErr('err-tel',   'WhatsApp inválido'); ok = false; }
    if (ok) { state.nome = nome; state.email = email; state.telefone = tel; salvarCliente(); salvarSessao(); }
    return ok;
  };

  const validateStep2 = () => {
    let ok = true;
    clearErr('err-cep'); clearErr('err-numero'); clearErr('err-frete');
    if (!state.endereco)                                   { setErr('err-cep',    'Informe um CEP válido'); ok = false; }
    const num = document.getElementById('co-numero').value.trim();
    if (!num)                                              { setErr('err-numero', 'Informe o número'); ok = false; }
    if (!state.frete)                                      { setErr('err-frete',  'Selecione uma opção de frete'); ok = false; }
    if (ok) { state.numero = num; state.complemento = document.getElementById('co-complemento').value.trim(); salvarCliente(); salvarSessao(); }
    return ok;
  };

  const validateStep3 = () => {
    clearErr('err-pagamento');
    if (!state.pagamento) { setErr('err-pagamento', 'Selecione uma forma de pagamento'); return false; }
    return true;
  };

  // ── Resumo ───────────────────────────────────────────────────
  const renderSummary = () => {
    const payLabel = { pix: 'PIX', cartao: 'Cartão' };
    document.getElementById('co-info-grid').innerHTML = `
      <div class="co-info-cell"><div class="lbl">Cliente</div><div class="val">${state.nome}</div></div>
      <div class="co-info-cell"><div class="lbl">WhatsApp</div><div class="val">${mask.tel(state.telefone)}</div></div>
      <div class="co-info-cell"><div class="lbl">Endereço</div><div class="val">${state.endereco.logradouro}, ${state.numero}${state.complemento ? ' – ' + state.complemento : ''}</div></div>
      <div class="co-info-cell"><div class="lbl">Cidade / UF</div><div class="val">${state.endereco.localidade} / ${state.endereco.uf}</div></div>
      <div class="co-info-cell"><div class="lbl">Frete</div><div class="val">${state.frete.label}</div></div>
      <div class="co-info-cell"><div class="lbl">Pagamento</div><div class="val">${payLabel[state.pagamento]}</div></div>
    `;
    const itemsHTML = state.cartItems.map(item => {
      const qty   = item.quantidade || item.qty || 1;
      const preco = item.preco || item.price || 0;
      return `<div class="co-summary-item">
        <div>
          <div class="item-name">${item.nome || item.name || 'Produto'}</div>
          <div class="item-qty">Qtd: ${qty}${item.tamanho ? ` · Tam: ${item.tamanho}` : ''}</div>
        </div>
        <div class="item-price">${fmt(preco * qty)}</div>
      </div>`;
    }).join('');
    document.getElementById('co-summary-items').innerHTML = itemsHTML;
    const total = state.subtotal + state.frete.valor;
    document.getElementById('co-summary-totals').innerHTML = `
      <div class="co-total-row"><span>Subtotal</span><span>${fmt(state.subtotal)}</span></div>
      <div class="co-total-row"><span>Frete (${state.frete.prazo})</span><span>${fmt(state.frete.valor)}</span></div>
      <div class="co-total-row grand"><span>Total</span><span class="val">${fmt(total)}</span></div>
    `;
  };

  // ── Mensagem WhatsApp ────────────────────────────────────────
  const buildWhatsappMsg = () => {
    const total    = state.subtotal + state.frete.valor;
    const payLabel = { pix: 'PIX', cartao: 'Cartão de Crédito/Débito' };
    const itens    = state.cartItems.map(item => {
      const qty = item.quantidade || item.qty || 1;
      const tam = item.tamanho ? ` (${item.tamanho})` : '';
      return `• ${item.nome || item.name}${tam} ×${qty} — ${fmt((item.preco || 0) * qty)}`;
    }).join('\n');
    return `*🛒 NOVO PEDIDO — Eleven Store*\n\n` +
      `*Cliente:* ${state.nome}\n*WhatsApp:* ${mask.tel(state.telefone)}\n*E-mail:* ${state.email}\n\n` +
      `*📦 Entrega:*\n${state.endereco.logradouro}, ${state.numero}${state.complemento ? ', '+state.complemento : ''}\n` +
      `${state.endereco.bairro} — ${state.endereco.localidade}/${state.endereco.uf}\nCEP: ${state.cep}\n\n` +
      `*🛍️ Itens:*\n${itens}\n\n` +
      `*Subtotal:* ${fmt(state.subtotal)}\n*Frete (${state.frete.label}):* ${fmt(state.frete.valor)}\n` +
      `*TOTAL: ${fmt(total)}*\n\n*Pagamento:* ${payLabel[state.pagamento]}\n\n_Pedido via site_`;
  };

  // ── Parar intervalos ─────────────────────────────────────────
  const pararIntervalos = () => {
    clearInterval(_pollingInterval);
    clearInterval(_timerInterval);
    _pollingInterval = null;
    _timerInterval   = null;
  };

  // ── Fluxo PIX: exibir tela ───────────────────────────────────
  const exibirTelaPix = (pixData) => {
    pararIntervalos();
    document.getElementById('co-pix-gerando').style.display = 'none';
    document.getElementById('co-pix-pronto').style.display  = 'block';
    document.getElementById('co-pix-erro').style.display    = 'none';

    // QR Code
    document.getElementById('co-qr-img').src      = `data:image/png;base64,${pixData.qrCodeBase64}`;
    document.getElementById('co-pix-codigo').value = pixData.qrCode;

    // Timer — calcula segundos restantes com base na expiração real
    const expMs    = new Date(pixData.expiracao).getTime();
    let segundos   = Math.max(0, Math.floor((expMs - Date.now()) / 1000));
    const timerEl  = document.getElementById('co-pix-timer');
    const timerTxt = document.getElementById('co-pix-timer-txt');

    const atualizarTimer = () => {
      const m = String(Math.floor(segundos / 60)).padStart(2, '0');
      const s = String(segundos % 60).padStart(2, '0');
      timerTxt.textContent = `Expira em ${m}:${s}`;
      if (segundos <= 300) timerEl.classList.add('expirando');
      if (segundos <= 0) {
        pararIntervalos();
        timerTxt.textContent = 'PIX expirado';
        limparPix();
        document.getElementById('co-pix-status').className   = 'co-pix-status erro';
        document.getElementById('co-pix-status').textContent = 'O PIX expirou. Feche e gere um novo pedido.';
      }
    };
    atualizarTimer();
    _timerInterval = setInterval(() => { segundos--; atualizarTimer(); }, 1000);

    // Botão copiar
    document.getElementById('co-btn-copiar').onclick = () => {
      navigator.clipboard.writeText(pixData.qrCode).then(() => {
        const b = document.getElementById('co-btn-copiar');
        b.textContent = '✓ Copiado!';
        b.classList.add('copiado');
        setTimeout(() => { b.textContent = 'Copiar'; b.classList.remove('copiado'); }, 2500);
      });
    };

    // Polling robusto — _pollingInterval declarado antes de usar dentro de verificarStatus
    const verificarStatus = async () => {
      try {
        const r = await fetch(`/api/webhook-pix?id=${pixData.paymentId}`);
        if (!r.ok) return; // rede instável — tenta na próxima rodada
        const d = await r.json();

        if (d.status === 'approved') {
          pararIntervalos();
          limparPix();
          limparSessao();

          document.getElementById('co-pix-status').className = 'co-pix-status aprovado';
          document.getElementById('co-pix-status').innerHTML = 'Pagamento confirmado! Abrindo WhatsApp...';

          if (typeof clearCart === 'function') clearCart();

          const waBtn  = document.getElementById('co-pix-whatsapp-btn');
          const phone  = (typeof NUMERO_WA !== 'undefined') ? NUMERO_WA : '5511916169179';
          const waUrl  = `https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsappMsg())}`;
          waBtn.style.display = 'block';
          waBtn.onclick = () => window.open(waUrl, '_blank');
          setTimeout(() => window.open(waUrl, '_blank'), 2000);
        }

        if (d.status === 'rejected' || d.status === 'cancelled') {
          pararIntervalos();
          limparPix();
          document.getElementById('co-pix-status').className   = 'co-pix-status erro';
          document.getElementById('co-pix-status').textContent = 'Pagamento não aprovado. Feche e tente novamente.';
        }
      } catch {
        // Falha de rede — silencioso, polling continua
      }
    };

    verificarStatus();
    _pollingInterval = setInterval(verificarStatus, 3000);
  };

  // ── Gerar PIX ────────────────────────────────────────────────
  const gerarPix = async () => {
    pararIntervalos();
    goTo(5);
    document.getElementById('co-pix-gerando').style.display = 'flex';
    document.getElementById('co-pix-pronto').style.display  = 'none';
    document.getElementById('co-pix-erro').style.display    = 'none';

    const total = state.subtotal + state.frete.valor;
    try {
      const res  = await fetch('/api/criar-pix', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedido: {
          nome: state.nome, email: state.email, telefone: state.telefone,
          total, pagamento: 'pix', itens: state.cartItems,
          endereco: { ...state.endereco, numero: state.numero, complemento: state.complemento },
          frete: state.frete,
        }}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro ao gerar PIX');

      salvarPix(data);
      exibirTelaPix(data);
    } catch (err) {
      document.getElementById('co-pix-gerando').style.display = 'none';
      const erroEl = document.getElementById('co-pix-erro');
      erroEl.style.display = 'block';
      erroEl.innerHTML = `⚠️ <strong>Não foi possível gerar o PIX.</strong><br/>${err.message}<br/><br/>
        <button onclick="Checkout.close()" style="margin-top:.5rem;background:#1e1e1e;border:1px solid #333;color:#ccc;padding:.5rem 1rem;border-radius:.5rem;cursor:pointer;">
          Fechar e tentar novamente
        </button>`;
    }
  };

  // ── Eventos ──────────────────────────────────────────────────
  const bindEvents = () => {

    document.getElementById('co-close-btn').addEventListener('click', Checkout.close);
    document.getElementById('checkout-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'checkout-overlay') Checkout.close();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') Checkout.close(); });

    // Step 1
    document.getElementById('co-next-1').addEventListener('click', () => {
      if (validateStep1()) goTo(2);
    });

    // CEP
    document.getElementById('co-cep').addEventListener('input', async (e) => {
      e.target.value = mask.cep(e.target.value);
      const raw = e.target.value.replace(/\D/g, '');
      if (raw.length !== 8) return;

      const spinner     = document.getElementById('co-cep-spinner');
      const addrBox     = document.getElementById('co-address-found');
      const freteLoad   = document.getElementById('co-frete-loading');
      const freteOpts   = document.getElementById('co-frete-opts');

      spinner.classList.add('visible');
      addrBox.classList.remove('visible');
      freteLoad.style.display = 'flex';
      freteOpts.innerHTML = '';
      state.endereco = null; state.frete = null; state.cep = e.target.value;

      try {
        const addr = await buscarCEP(raw);
        state.endereco = addr;
        addrBox.innerHTML = `<span>✓ Endereço encontrado</span>${addr.logradouro}, ${addr.bairro} — ${addr.localidade}/${addr.uf}`;
        addrBox.classList.add('visible');
        clearErr('err-cep');

        const opcoes = await calcularFrete(raw);
        freteLoad.style.display = 'none';
        freteOpts.innerHTML = opcoes.map((opt, i) => `
          <label class="co-frete-opt" data-tipo="${opt.tipo}">
            <input type="radio" name="frete" value="${opt.tipo}" ${i === 0 ? 'checked' : ''}/>
            <div class="co-frete-info">
              <div class="co-frete-label">${opt.label}</div>
              <div class="co-frete-prazo">${opt.prazo}</div>
            </div>
            <div class="co-frete-price">${fmt(opt.valor)}</div>
          </label>`).join('');

        state.frete = opcoes[0];
        freteOpts.querySelector('.co-frete-opt')?.classList.add('selected');

        freteOpts.querySelectorAll('.co-frete-opt').forEach(opt => {
          opt.addEventListener('click', () => {
            freteOpts.querySelectorAll('.co-frete-opt').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            state.frete = opcoes.find(o => o.tipo === opt.dataset.tipo);
            salvarSessao();
          });
        });
        salvarSessao();
      } catch (err) {
        setErr('err-cep', err.message || 'Erro ao buscar CEP');
        freteLoad.style.display = 'none';
      } finally {
        spinner.classList.remove('visible');
      }
    });

    document.getElementById('co-tel').addEventListener('input', (e) => {
      e.target.value = mask.tel(e.target.value);
    });

    document.getElementById('co-back-2').addEventListener('click', () => goTo(1));
    document.getElementById('co-next-2').addEventListener('click', () => { if (validateStep2()) goTo(3); });

    // Pagamento
    document.querySelectorAll('.co-pay-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.co-pay-opt').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        state.pagamento = opt.dataset.pay;
        ['co-pix-info', 'co-cartao-info'].forEach(id => {
          const el = document.getElementById(id);
          el.style.display = 'none'; el.classList.remove('visible');
        });
        const infoMap = { pix: 'co-pix-info', cartao: 'co-cartao-info' };
        const box = document.getElementById(infoMap[state.pagamento]);
        if (box) { box.style.display = 'block'; box.classList.add('visible'); }
        clearErr('err-pagamento');
        salvarSessao();
      });
    });

    document.getElementById('co-back-3').addEventListener('click', () => goTo(2));
    document.getElementById('co-next-3').addEventListener('click', () => {
      if (validateStep3()) { renderSummary(); goTo(4); }
    });

    document.getElementById('co-back-4').addEventListener('click', () => goTo(3));

    // Confirmar
    document.getElementById('co-confirm-btn').addEventListener('click', async () => {
      if (state.pagamento === 'pix') {
        await gerarPix();
      } else {
        const phone = (typeof NUMERO_WA !== 'undefined') ? NUMERO_WA : '5511916169179';
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsappMsg())}`, '_blank');
        if (typeof clearCart === 'function') clearCart();
        limparSessao();
      }
    });
  };

  // ── Restaurar sessão PIX pendente ────────────────────────────
  const restaurarPixPendente = () => {
    const pix = carregarPix();
    if (!pix) return false;

    // Verifica se não expirou
    const expMs = new Date(pix.expiracao).getTime();
    if (Date.now() >= expMs) { limparPix(); return false; }

    // Restaura state mínimo para buildWhatsappMsg funcionar
    const sessao = carregarSessao();
    if (sessao) {
      state.frete     = sessao.frete;
      state.pagamento = sessao.pagamento;
      state.endereco  = sessao.endereco;
      state.subtotal  = sessao.subtotal;
      state.cartItems = sessao.cartItems;
    }
    const cliente = carregarCliente();
    state.nome      = cliente.nome || '';
    state.email     = cliente.email || '';
    state.telefone  = cliente.telefone || '';
    state.cep       = cliente.cep || '';
    state.numero    = cliente.numero || '';
    state.complemento = cliente.complemento || '';

    // Vai direto para tela PIX
    goTo(5);
    setTimeout(() => exibirTelaPix(pix), 100);
    return true;
  };

  // ── API pública ──────────────────────────────────────────────
  return {

    open(cartItems = [], subtotal = 0) {
      if (document.getElementById('checkout-overlay')) return;

      injectCSS();

      const saved  = carregarCliente();
      const sessao = carregarSessao();

      state = {
        step: 1,
        nome:         saved.nome         || '',
        email:        saved.email        || '',
        telefone:     saved.telefone     || '',
        cep:          saved.cep          || '',
        endereco:     sessao?.endereco   || null,
        numero:       saved.numero       || '',
        complemento:  saved.complemento  || '',
        frete:        sessao?.frete      || null,
        pagamento:    sessao?.pagamento  || null,
        cartItems,
        subtotal,
      };

      const modal = buildModal();
      document.body.appendChild(modal);
      document.body.style.overflow = 'hidden';

      renderSteps();
      bindEvents();

      // Verifica PIX pendente antes de abrir qualquer step
      if (restaurarPixPendente()) return;

      // Preenche campos salvos
      if (saved.nome)     document.getElementById('co-nome').value  = saved.nome;
      if (saved.email)    document.getElementById('co-email').value = saved.email;
      if (saved.telefone) document.getElementById('co-tel').value   = mask.tel(saved.telefone);

      // Determina step de retomada
      let stepInicial = 1;
      if (sessao?.step && sessao.step <= 4) {
        // Só retoma steps 1-4 (step 5 é tratado por restaurarPixPendente)
        stepInicial = sessao.step;
      }
      goTo(stepInicial);

      setTimeout(() => {
        const primeiro = !saved.nome ? 'co-nome' : !saved.email ? 'co-email' : !saved.telefone ? 'co-tel' : 'co-nome';
        document.getElementById(primeiro)?.focus();
      }, 100);
    },

    close() {
      pararIntervalos(); // garante que polling para ao fechar
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

window.Checkout = Checkout;