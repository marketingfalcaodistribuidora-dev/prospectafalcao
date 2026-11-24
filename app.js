/* Prospecção Falcão — app de celular. Sem dependências.
   Marcações e anotações ficam no aparelho (localStorage), com gravação imediata. */
(function () {
  "use strict";
  const CHAVE = "prospeccao-falcao:estado:v1";
  const CHAVE_CODIGO = "prospeccao-falcao:codigo:v1";
  const CHAVE_TEMA = "prospeccao-falcao:estado:v1:tema";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = (t) =>
    String(t).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  const NIVEL = { 1: "Alta", 2: "Média", 3: "Baixa", 9: "Inativa" };
  const GRUPO = {
    1: "Certeza alta",
    2: "Certeza média",
    3: "Certeza baixa",
    9: "Inativas (fechadas na Receita)",
  };

  let D = null; // dados
  let S = {}; // estado: { id: { v: bool, a: texto, t: timestamp } }
  let salvouOk = true;
  let niveis = new Set([1, 2, 3]);
  let ordem = "rota";
  let soPendentes = false;

  /* ---------- tema (o claro é o inicial) ---------- */
  function aplicarTema(t) {
    const escuro = t === "escuro";
    document.documentElement.dataset.tema = escuro ? "escuro" : "claro";
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = escuro ? "#0b0d12" : "#f3f4f6";
    const b = document.querySelector("#tema");
    if (b) b.textContent = escuro ? "Usar tema claro" : "Usar tema escuro";
  }

  /* ---------- armazenamento ---------- */
  function guardar(chave, valor) {
    try {
      localStorage.setItem(chave, valor);
    } catch (e) {
      /* ignora */
    }
  }
  function ler(chave) {
    try {
      return localStorage.getItem(chave);
    } catch (e) {
      return null;
    }
  }
  function lerEstado() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (bruto) {
        const o = JSON.parse(bruto);
        if (o && typeof o === "object") return o;
      }
    } catch (e) {
      salvouOk = false;
    }
    return {};
  }

  let tToast = null;
  function gravar() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(S));
      if (localStorage.getItem(CHAVE) === null) throw new Error("vazio");
      salvouOk = true;
      const el = $("#salvo");
      el.textContent =
        "✔ Salvo neste aparelho às " +
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
      el.classList.add("ver");
      clearTimeout(tToast);
      tToast = setTimeout(() => el.classList.remove("ver"), 2200);
      avisar(null);
    } catch (e) {
      salvouOk = false;
      $("#salvo").textContent = "";
      avisar(
        'Não foi possível salvar neste navegador (modo anônimo ou sem espaço). As anotações podem se perder ao fechar o app.',
      );
    }
  }
  function avisar(msg) {
    const el = $("#aviso");
    if (msg) {
      el.textContent = msg;
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }
  let timer = null;
  function agendarGravacao() {
    clearTimeout(timer);
    timer = setTimeout(gravar, 300);
  }
  function gravarJa() {
    clearTimeout(timer);
    gravar();
  }
  function item(id) {
    return S[id] || (S[id] = {});
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") gravarJa();
  });
  window.addEventListener("pagehide", gravarJa);

  function pedirArmazenamentoPermanente() {
    try {
      if (navigator.storage && navigator.storage.persist)
        navigator.storage.persist().then(mostrarArmazenamento);
    } catch (e) {
      /* ignora */
    }
  }
  function mostrarArmazenamento() {
    const el = $("#armaz");
    if (!el) return;
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then((p) => {
        el.textContent = p
          ? "Armazenamento protegido neste aparelho: o navegador não apaga as marcações sozinho."
          : "Dica: instale na tela inicial para o aparelho não apagar suas marcações.";
      });
    }
  }

  /* ---------- dados (abertos ou com código de acesso) ---------- */
  function b64(s) {
    const b = atob(s),
      a = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return a;
  }
  function decifrar(pacote, codigo) {
    return crypto.subtle
      .importKey("raw", new TextEncoder().encode(codigo), "PBKDF2", false, [
        "deriveKey",
      ])
      .then((base) =>
        crypto.subtle.deriveKey(
          {
            name: "PBKDF2",
            salt: b64(pacote.salt),
            iterations: pacote.iter,
            hash: "SHA-256",
          },
          base,
          { name: "AES-GCM", length: 256 },
          false,
          ["decrypt"],
        ),
      )
      .then((chave) =>
        crypto.subtle.decrypt(
          { name: "AES-GCM", iv: b64(pacote.iv) },
          chave,
          b64(pacote.ct),
        ),
      )
      .then((buf) => JSON.parse(new TextDecoder().decode(buf)));
  }
  function carregarDados() {
    return fetch("dados.json", { cache: "no-cache" })
      .then((r) => {
        if (r.ok) return r.json();
        throw new Error("sem dados abertos");
      })
      .catch(() =>
        fetch("dados.enc", { cache: "no-cache" })
          .then((r) => {
            if (!r.ok) throw new Error("sem dados");
            return r.json();
          })
          .then(pedirCodigo),
      );
  }
  function pedirCodigo(pacote) {
    return new Promise((resolve) => {
      const salvo = ler(CHAVE_CODIGO);
      const tentar = (codigo, manual) =>
        decifrar(pacote, codigo)
          .then((dados) => {
            guardar(CHAVE_CODIGO, codigo);
            $("#tela-codigo").hidden = true;
            resolve(dados);
          })
          .catch(() => {
            if (manual) $("#erro-codigo").hidden = false;
            $("#tela-codigo").hidden = false;
          });
      if (salvo) tentar(salvo, false);
      else $("#tela-codigo").hidden = false;
      $("#form-codigo").addEventListener("submit", (ev) => {
        ev.preventDefault();
        $("#erro-codigo").hidden = true;
        tentar($("#codigo").value, true);
      });
    });
  }

  /* ---------- tela ---------- */
  const cidadeAtual = () => D.cidades[$("#cid").selectedIndex];
  const daCidade = (c) => D.emp.filter((e) => e.c === c.nome);

  function atualizarChips() {
    const m = { 1: 0, 2: 0, 3: 0, 9: 0 };
    daCidade(cidadeAtual()).forEach((e) => {
      m[e.n]++;
    });
    $$(".chip[data-n]").forEach((b) => {
      const n = +b.dataset.n;
      b.querySelector(".cont").textContent = m[n];
      b.classList.toggle("on", niveis.has(n));
      b.setAttribute("aria-pressed", String(niveis.has(n)));
    });
  }

  function atualizarInfo() {
    const c = cidadeAtual();
    const r = c.rota;
    const ativos = daCidade(c).filter((e) => e.n !== 9);
    const feitos = ativos.filter((e) => (S[e.id] || {}).v).length;
    const pct = ativos.length ? Math.round((feitos * 100) / ativos.length) : 0;
    $("#prog-barra").style.width = pct + "%";
    $("#info").innerHTML = r.n
      ? `<span>${r.n} paradas${r.km >= 1 ? ` · ~${Math.round(r.km)} km de carro` : " · todas no centro"}${r.real ? "" : " (estimado)"}</span>` +
        `<span class="feitos">✓ ${feitos}/${ativos.length} visitadas</span>`
      : `<span>Nenhuma empresa ativa nesta cidade</span><span></span>`;
  }

  function resumoAviso(a) {
    if (/aproximada/.test(a)) return "Local aproximado";
    if (/CNPJ registrado/.test(a)) return "CNPJ de outra cidade";
    if (/aparece em/.test(a)) return "Telefone repetido";
    if (/BA-052 km/.test(a)) return "Km longe do centro";
    return "Conferir";
  }

  function render() {
    const c = cidadeAtual();
    const q = $("#q").value.trim().toLowerCase();
    atualizarChips();
    atualizarInfo();
    const it = daCidade(c).filter((e) => {
      if (!niveis.has(e.n)) return false;
      if (soPendentes && (S[e.id] || {}).v) return false;
      if (!q) return true;
      const texto = (
        e.nome +
        " " +
        e.end +
        " " +
        e.t.map((t) => t[0]).join(" ") +
        " " +
        e.perfil
      ).toLowerCase();
      return texto.indexOf(q) >= 0;
    });
    it.sort(
      ordem === "rota"
        ? (a, b) => (a.p || 99999) - (b.p || 99999) || a.n - b.n
        : (a, b) => a.n - b.n || (a.p || 99999) - (b.p || 99999),
    );
    const cont = { 1: 0, 2: 0, 3: 0, 9: 0 };
    it.forEach((e) => {
      cont[e.n]++;
    });
    const saida = [];
    let atual = null;
    it.forEach((e) => {
      if (ordem === "certeza" && e.n !== atual) {
        atual = e.n;
        saida.push(
          `<h2 class="grupo"><i class="dot n${e.n}"></i>${GRUPO[e.n]} · ${cont[e.n]}</h2>`,
        );
      }
      saida.push(cartao(e));
    });
    $("#lista").innerHTML = saida.length
      ? saida.join("")
      : '<div class="vazio">Nada por aqui com esses filtros.</div>';
  }

  function cartao(e) {
    const s = S[e.id] || {};
    const p1 = e.t[0];
    const primario = p1
      ? p1[2]
        ? `<a class="b prim wpp" target="_blank" rel="noopener" href="https://wa.me/55${p1[1]}">WhatsApp ${esc(p1[0])}</a>`
        : `<a class="b prim" href="tel:+55${p1[1]}">Ligar ${esc(p1[0])}</a>`
      : '<span class="b prim off">Sem telefone</span>';
    const ir = e.go
      ? `<a class="b" target="_blank" rel="noopener" href="${esc(e.go)}" aria-label="Ir até aqui">Ir ↗</a>`
      : "";
    const avisos = e.av
      .map(
        (a) =>
          `<span class="pill av" title="${esc(a)}">⚠ ${esc(resumoAviso(a))}</span>`,
      )
      .join("");
    const telefones = e.t
      .map(
        (t) =>
          `<a class="b" href="tel:+55${t[1]}">Ligar ${esc(t[0])}</a>` +
          (t[2]
            ? `<a class="b wpp" target="_blank" rel="noopener" href="https://wa.me/55${t[1]}">WhatsApp</a>`
            : ""),
      )
      .join("");
    const ig = e.ig
      ? `<a class="b" target="_blank" rel="noopener" href="${esc(e.ig)}">Instagram</a>`
      : `<a class="b" target="_blank" rel="noopener" href="${esc(e.igb)}">Buscar Instagram</a>`;
    const temNota = !!(s.a && s.a.trim());
    return `<article class="card n${e.n}${s.v ? " feito" : ""}" data-id="${esc(e.id)}">
  <div class="cab">
    ${e.p ? `<div class="num" title="Ordem na rota">${e.p}</div>` : ""}
    <div class="t">
      <div class="nome">${esc(e.nome)}</div>
      <div class="end">${esc(e.end)}</div>
      <div class="meta"><span class="pill n${e.n}">${NIVEL[e.n]}</span><span class="pill">${esc(e.perfil)}</span>${avisos}</div>
    </div>
    <label class="vis" title="Marcar como visitada"><input type="checkbox" data-id="${esc(e.id)}" aria-label="Visitada"${s.v ? " checked" : ""}><span>✓</span></label>
  </div>
  <div class="acoes">${primario}${ir}<button class="b ic${temNota ? " tem" : ""}" type="button" data-acao="nota" aria-label="${temNota ? "Ver anotação" : "Anotar"}" title="Anotação">✎</button></div>
  <textarea class="nota" data-id="${esc(e.id)}" placeholder="Com quem falou, o que compra…" aria-label="Anotações"${temNota ? "" : " hidden"}>${esc(s.a || "")}</textarea>
  <details class="mais"><summary>Detalhes</summary><div class="det">
    ${e.razao && e.razao.toLowerCase() !== e.nome.toLowerCase() ? `<div class="mu">${esc(e.razao)}</div>` : ""}
    ${e.cep ? `<div class="mu">CEP ${esc(e.cep)}</div>` : ""}
    <div class="ok">✔ ${esc(e.chk.join(" · "))}</div>
    ${e.av.map((a) => `<div class="aviso-l">⚠ ${esc(a)}</div>`).join("")}
    <div class="links"><a class="b" target="_blank" rel="noopener" href="${esc(e.maps)}">Ver no Maps</a>${telefones}${e.em ? `<a class="b" href="mailto:${esc(e.em)}">E-mail</a>` : ""}${ig}<a class="b" target="_blank" rel="noopener" href="${esc(e.dir)}">Diretório</a></div>
  </div></details>
</article>`;
  }

  /* ---------- cabeçalho: some ao rolar para baixo, volta ao rolar para cima ---------- */
  function cabecalhoInteligente() {
    const topo = $("#topo");
    let ultimo = 0;
    window.addEventListener(
      "scroll",
      () => {
        const y = window.scrollY;
        const aberto = !$("#menu").hidden || !$("#busca").hidden;
        if (!aberto && y > 140 && y > ultimo + 8) topo.classList.add("oculto");
        else if (y < ultimo - 8 || y <= 140 || aberto)
          topo.classList.remove("oculto");
        ultimo = y;
      },
      { passive: true },
    );
  }

  /* ---------- início ---------- */
  function iniciar(dados) {
    D = dados;
    S = lerEstado();
    $("#hoje").textContent = D.hoje;
    $("#cid").innerHTML = D.cidades
      .map((c) => `<option>${esc(c.nome)} (${c.n})</option>`)
      .join("");
    const ult = ler(CHAVE + ":cidade");
    if (ult) $("#cid").selectedIndex = Math.min(+ult, D.cidades.length - 1);
    const ord = ler(CHAVE + ":ordem");
    if (ord === "rota" || ord === "certeza") ordem = ord;
    $("#app").hidden = false;

    $("#cid").onchange = () => {
      guardar(CHAVE + ":cidade", $("#cid").selectedIndex);
      window.scrollTo(0, 0);
      render();
    };
    $("#q").oninput = render;
    $$(".seg [data-o]").forEach((b) => {
      const marcar = () =>
        $$(".seg [data-o]").forEach((o) => {
          o.classList.toggle("on", o.dataset.o === ordem);
          o.setAttribute("aria-pressed", String(o.dataset.o === ordem));
        });
      marcar();
      b.onclick = () => {
        ordem = b.dataset.o;
        guardar(CHAVE + ":ordem", ordem);
        marcar();
        render();
      };
    });
    $$(".chip[data-n]").forEach((b) => {
      b.onclick = () => {
        const n = +b.dataset.n;
        if (niveis.has(n)) niveis.delete(n);
        else niveis.add(n);
        render();
      };
    });
    $("#pend").onclick = (ev) => {
      soPendentes = !soPendentes;
      ev.currentTarget.classList.toggle("on", soPendentes);
      ev.currentTarget.setAttribute("aria-pressed", String(soPendentes));
      render();
    };

    $("#busca-btn").onclick = () => {
      const b = $("#busca");
      b.hidden = !b.hidden;
      $("#busca-btn").setAttribute("aria-expanded", String(!b.hidden));
      if (!b.hidden) $("#q").focus();
    };
    $("#menu-btn").onclick = () => {
      const m = $("#menu");
      m.hidden = !m.hidden;
      $("#menu-btn").setAttribute("aria-expanded", String(!m.hidden));
      if (!m.hidden) mostrarArmazenamento();
    };

    const lista = $("#lista");
    lista.addEventListener("change", (ev) => {
      if (ev.target.type === "checkbox") {
        const o = item(ev.target.dataset.id);
        o.v = ev.target.checked;
        o.t = Date.now();
        gravarJa();
        pedirArmazenamentoPermanente();
        const cartaoEl = ev.target.closest(".card");
        if (cartaoEl) cartaoEl.classList.toggle("feito", o.v);
        atualizarInfo();
        if (soPendentes && o.v) setTimeout(render, 450);
      }
    });
    lista.addEventListener("input", (ev) => {
      if (ev.target.tagName === "TEXTAREA") {
        const o = item(ev.target.dataset.id);
        o.a = ev.target.value;
        o.t = Date.now();
        agendarGravacao();
        pedirArmazenamentoPermanente();
      }
    });
    lista.addEventListener("focusout", (ev) => {
      if (ev.target.tagName === "TEXTAREA") {
        gravarJa();
        const btn = ev.target
          .closest(".card")
          .querySelector('[data-acao="nota"]');
        const tem = ev.target.value.trim() !== "";
        btn.setAttribute("aria-label", tem ? "Ver anotação" : "Anotar");
        btn.classList.toggle("tem", tem);
        if (!tem) ev.target.hidden = true;
      }
    });
    lista.addEventListener("click", (ev) => {
      const btn = ev.target.closest('[data-acao="nota"]');
      if (!btn) return;
      const ta = btn.closest(".card").querySelector("textarea.nota");
      ta.hidden = !ta.hidden;
      if (!ta.hidden) ta.focus();
    });

    $("#tema").onclick = () => {
      const novo = document.documentElement.dataset.tema === "escuro" ? "claro" : "escuro";
      guardar(CHAVE_TEMA, novo);
      aplicarTema(novo);
    };
    let evInstalar = null;
    window.addEventListener("beforeinstallprompt", (ev) => {
      ev.preventDefault();
      evInstalar = ev;
      $("#instalar").hidden = false;
    });
    $("#instalar").onclick = () => {
      if (evInstalar) {
        evInstalar.prompt();
        evInstalar = null;
        $("#instalar").hidden = true;
      }
    };

    cabecalhoInteligente();
    if (!salvouOk)
      avisar(
        'Este navegador não deixa salvar. As anotações podem se perder ao fechar o app.',
      );
    render();
  }

  aplicarTema(ler(CHAVE_TEMA));

  carregarDados()
    .then(iniciar)
    .catch(() => {
      document.body.innerHTML =
        '<p style="padding:24px">Não consegui carregar os dados. Confira a internet e abra de novo.</p>';
    });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {
        /* ignora */
      });
    });
  }
})();
