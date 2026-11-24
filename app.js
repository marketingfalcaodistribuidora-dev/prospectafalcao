/* Prospecção Falcão — app de celular. Sem dependências.
   Marcações e anotações ficam no aparelho (localStorage), com gravação imediata. */
(function () {
  "use strict";
  var CHAVE = "prospeccao-falcao:estado:v1";
  var CHAVE_CODIGO = "prospeccao-falcao:codigo:v1";
  var $ = function (s) {
    return document.querySelector(s);
  };
  var esc = function (t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  };
  var D = null; // dados
  var S = {}; // estado: { id: { v: bool, a: texto, t: timestamp } }
  var salvouOk = true;
  var niveis = new Set([1, 2, 3]);
  var ordem = "rota";
  var soPendentes = false;

  /* ---------- armazenamento ---------- */
  function lerEstado() {
    try {
      var bruto = localStorage.getItem(CHAVE);
      if (bruto) {
        var o = JSON.parse(bruto);
        if (o && typeof o === "object") return o;
      }
    } catch (e) {
      salvouOk = false;
    }
    return {};
  }
  function gravar() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(S));
      // confere que realmente gravou
      if (localStorage.getItem(CHAVE) === null) throw new Error("vazio");
      salvouOk = true;
      var h = new Date();
      $("#salvo").textContent =
        "✔ Salvo neste aparelho às " +
        h.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
      avisar(null);
    } catch (e) {
      salvouOk = false;
      $("#salvo").textContent = "";
      avisar(
        'Não foi possível salvar neste navegador (modo anônimo ou sem espaço). Use "Baixar cópia" no menu ⋯ para não perder o que anotou.',
      );
    }
  }
  function avisar(msg) {
    var el = $("#aviso");
    if (msg) {
      el.textContent = msg;
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }
  var timer = null;
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

  // grava ao sair da aba, trocar de app ou fechar
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") gravarJa();
  });
  window.addEventListener("pagehide", gravarJa);

  function pedirArmazenamentoPermanente() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().then(function () {
          mostrarArmazenamento();
        });
      }
    } catch (e) {
      /* ignora */
    }
  }
  function mostrarArmazenamento() {
    var el = $("#armaz");
    if (!el) return;
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(function (p) {
        el.textContent = p
          ? "Armazenamento protegido neste aparelho: o navegador não apaga as marcações sozinho."
          : "Dica: instale na tela inicial (botão acima ou menu do navegador) para o aparelho não apagar suas marcações.";
      });
    }
  }

  /* ---------- dados (aberto ou com código de acesso) ---------- */
  function b64(s) {
    var b = atob(s),
      a = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return a;
  }
  function decifrar(pacote, codigo) {
    var enc = new TextEncoder();
    return crypto.subtle
      .importKey("raw", enc.encode(codigo), "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return crypto.subtle.deriveKey(
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
        );
      })
      .then(function (chave) {
        return crypto.subtle.decrypt(
          { name: "AES-GCM", iv: b64(pacote.iv) },
          chave,
          b64(pacote.ct),
        );
      })
      .then(function (buf) {
        return JSON.parse(new TextDecoder().decode(buf));
      });
  }
  function carregarDados() {
    return fetch("dados.json", { cache: "no-cache" })
      .then(function (r) {
        if (r.ok) return r.json();
        throw new Error("sem dados abertos");
      })
      .catch(function () {
        return fetch("dados.enc", { cache: "no-cache" })
          .then(function (r) {
            if (!r.ok) throw new Error("sem dados");
            return r.json();
          })
          .then(function (pacote) {
            return pedirCodigo(pacote);
          });
      });
  }
  function pedirCodigo(pacote) {
    return new Promise(function (resolve) {
      var salvo = null;
      try {
        salvo = localStorage.getItem(CHAVE_CODIGO);
      } catch (e) {
        /* ignora */
      }
      function tentar(codigo, manual) {
        return decifrar(pacote, codigo)
          .then(function (dados) {
            try {
              localStorage.setItem(CHAVE_CODIGO, codigo);
            } catch (e) {
              /* ignora */
            }
            $("#tela-codigo").hidden = true;
            resolve(dados);
          })
          .catch(function () {
            if (manual) $("#erro-codigo").hidden = false;
            $("#tela-codigo").hidden = false;
          });
      }
      if (salvo) {
        tentar(salvo, false);
      } else {
        $("#tela-codigo").hidden = false;
      }
      $("#form-codigo").addEventListener("submit", function (ev) {
        ev.preventDefault();
        $("#erro-codigo").hidden = true;
        tentar($("#codigo").value, true);
      });
    });
  }

  /* ---------- tela ---------- */
  function cidadeAtual() {
    return D.cidades[$("#cid").selectedIndex];
  }

  function progresso(c) {
    var todos = D.emp.filter(function (e) {
      return e.c === c.nome && e.n !== 9;
    });
    var feitos = todos.filter(function (e) {
      return (S[e.id] || {}).v;
    }).length;
    var pct = todos.length ? Math.round((feitos * 100) / todos.length) : 0;
    $("#progresso").innerHTML = todos.length
      ? feitos +
        " de " +
        todos.length +
        ' visitadas<div class="barra"><i style="width:' +
        pct +
        '%"></i></div>'
      : "";
  }

  var NOMES_N = {
    1: "Certeza ALTA",
    2: "Certeza MÉDIA",
    3: "Certeza BAIXA",
    9: "Inativas (fechadas na Receita)",
  };

  function render() {
    var c = cidadeAtual();
    var q = $("#q").value.toLowerCase();
    var r = c.rota;
    $("#rota").innerHTML = r.n
      ? '<div class="rota"><b>' +
        (ordem === "rota" ? "Ordenado por rota" : "Ordenado por certeza") +
        "</b>" +
        '<div class="mu">' +
        r.n +
        " empresas ativas numeradas pelo menor caminho de carro" +
        (r.km >= 1
          ? " (~" + Math.round(r.km) + " km no total)"
          : ", todas no centro da cidade") +
        (r.real ? "" : " · distância estimada em linha reta") +
        ". O número da rota fica no círculo azul e não muda ao trocar a ordenação.</div></div>"
      : "";
    progresso(c);
    var it = D.emp.filter(function (e) {
      if (e.c !== c.nome || !niveis.has(e.n)) return false;
      if (soPendentes && (S[e.id] || {}).v) return false;
      if (!q) return true;
      var texto = (
        e.nome +
        " " +
        e.end +
        " " +
        e.t
          .map(function (t) {
            return t[0];
          })
          .join(" ") +
        " " +
        e.perfil
      ).toLowerCase();
      return texto.indexOf(q) >= 0;
    });
    it.sort(
      ordem === "rota"
        ? function (a, b) {
            return (a.p || 99999) - (b.p || 99999) || a.n - b.n;
          }
        : function (a, b) {
            return a.n - b.n || (a.p || 99999) - (b.p || 99999);
          },
    );
    var saida = [];
    var tierAtual = null;
    it.forEach(function (e) {
      if (ordem === "certeza" && e.n !== tierAtual) {
        tierAtual = e.n;
        saida.push('<h2 class="grupo n' + e.n + '">' + NOMES_N[e.n] + "</h2>");
      }
      saida.push(cartao(e));
    });
    $("#lista").innerHTML = saida.length
      ? saida.join("")
      : '<div class="vazio">Nada por aqui com esses filtros.</div>';
  }

  function cartao(e) {
    var s = S[e.id] || {};
    var tel = e.t
      .map(function (t) {
        return t[2]
          ? '<a class="btn g" target="_blank" rel="noopener" href="https://wa.me/55' +
              t[1] +
              '">WhatsApp ' +
              esc(t[0]) +
              "</a>"
          : '<a class="btn" href="tel:+55' +
              t[1] +
              '">Ligar ' +
              esc(t[0]) +
              "</a>";
      })
      .join("");
    var ig = e.ig
      ? '<a class="btn s" target="_blank" rel="noopener" href="' +
        esc(e.ig) +
        '">Instagram</a>'
      : '<a class="btn s" target="_blank" rel="noopener" href="' +
        esc(e.igb) +
        '">Buscar Instagram</a>';
    return (
      '<div class="card n' +
      e.n +
      (s.v ? " feito" : "") +
      '" data-id="' +
      esc(e.id) +
      '">' +
      '<div class="top">' +
      (e.p ? '<div class="num">' + e.p + "</div>" : "") +
      "<div>" +
      '<div class="nome">' +
      esc(e.nome) +
      "</div>" +
      (e.razao && e.razao.toLowerCase() !== e.nome.toLowerCase()
        ? '<div class="mu">' + esc(e.razao) + "</div>"
        : "") +
      "<div>" +
      esc(e.end) +
      (e.cep ? " · CEP " + esc(e.cep) : "") +
      "</div>" +
      '<span class="tag">' +
      esc(e.perfil) +
      "</span>" +
      '<div class="okc">✔ ' +
      esc(e.chk.join(" · ")) +
      "</div>" +
      e.av
        .map(function (a) {
          return '<div class="av">⚠ ' + esc(a) + "</div>";
        })
        .join("") +
      "</div></div><div>" +
      tel +
      (e.go
        ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(e.go) + '">Ir até aqui</a>'
        : "") +
      '<a class="btn s" target="_blank" rel="noopener" href="' +
      esc(e.maps) +
      '">Maps</a>' +
      ig +
      '<a class="btn s" target="_blank" rel="noopener" href="' +
      esc(e.dir) +
      '">Diretório</a>' +
      (e.em
        ? '<a class="btn s" href="mailto:' + esc(e.em) + '">E-mail</a>'
        : "") +
      "</div>" +
      '<label class="v"><input type="checkbox" data-id="' +
      esc(e.id) +
      '"' +
      (s.v ? " checked" : "") +
      "> Visitada</label>" +
      '<textarea data-id="' +
      esc(e.id) +
      '" placeholder="Anotações (com quem falou, o que compra…)">' +
      esc(s.a || "") +
      "</textarea></div>"
    );
  }

  /* ---------- cópia de segurança ---------- */
  function baixarCopia() {
    var blob = new Blob(
      [
        JSON.stringify(
          {
            app: "prospeccao-falcao",
            versao: 1,
            em: new Date().toISOString(),
            estado: S,
          },
          null,
          1,
        ),
      ],
      { type: "application/json" },
    );
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download =
      "marcacoes-prospeccao-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 2000);
  }
  function restaurarCopia(arquivo) {
    var leitor = new FileReader();
    leitor.onload = function () {
      try {
        var o = JSON.parse(leitor.result);
        var novo = (o && o.estado) || {};
        Object.keys(novo).forEach(function (id) {
          var a = S[id],
            b = novo[id];
          if (!a || (b.t || 0) >= (a.t || 0)) S[id] = b; // fica o mais recente
        });
        gravarJa();
        render();
        avisar("Cópia restaurada.");
        setTimeout(function () {
          avisar(null);
        }, 3000);
      } catch (e) {
        avisar("Arquivo inválido: não consegui restaurar.");
      }
    };
    leitor.readAsText(arquivo);
  }

  /* ---------- início ---------- */
  function iniciar(dados) {
    D = dados;
    S = lerEstado();
    $("#hoje").textContent = D.hoje;
    $("#cid").innerHTML = D.cidades
      .map(function (c) {
        return "<option>" + esc(c.nome) + " (" + c.n + ")</option>";
      })
      .join("");
    try {
      var ult = localStorage.getItem(CHAVE + ":cidade");
      if (ult) $("#cid").selectedIndex = Math.min(+ult, D.cidades.length - 1);
    } catch (e) {
      /* ignora */
    }
    $("#app").hidden = false;
    $("#cid").onchange = function () {
      try {
        localStorage.setItem(CHAVE + ":cidade", $("#cid").selectedIndex);
      } catch (e) {
        /* ignora */
      }
      render();
    };
    $("#q").oninput = render;
    try {
      var ordSalva = localStorage.getItem(CHAVE + ":ordem");
      if (ordSalva === "rota" || ordSalva === "certeza") ordem = ordSalva;
    } catch (e) {
      /* ignora */
    }
    document.querySelectorAll(".chip[data-o]").forEach(function (b) {
      b.classList.toggle("on", b.dataset.o === ordem);
      b.onclick = function () {
        ordem = b.dataset.o;
        try {
          localStorage.setItem(CHAVE + ":ordem", ordem);
        } catch (e) {
          /* ignora */
        }
        document.querySelectorAll(".chip[data-o]").forEach(function (o) {
          o.classList.toggle("on", o.dataset.o === ordem);
        });
        render();
      };
    });
    document.querySelectorAll(".chip[data-n]").forEach(function (b) {
      b.onclick = function () {
        var n = +b.dataset.n;
        if (niveis.has(n)) niveis.delete(n);
        else niveis.add(n);
        b.classList.toggle("on");
        render();
      };
    });
    $("#pend").onclick = function (ev) {
      soPendentes = !soPendentes;
      ev.currentTarget.classList.toggle("on");
      render();
    };
    $("#lista").addEventListener("change", function (ev) {
      if (ev.target.type === "checkbox") {
        var o = item(ev.target.dataset.id);
        o.v = ev.target.checked;
        o.t = Date.now();
        gravarJa();
        pedirArmazenamentoPermanente();
        var cartaoEl = ev.target.closest(".card");
        if (cartaoEl) cartaoEl.classList.toggle("feito", o.v);
        progresso(cidadeAtual());
        if (soPendentes && o.v) setTimeout(render, 400);
      }
    });
    $("#lista").addEventListener("input", function (ev) {
      if (ev.target.tagName === "TEXTAREA") {
        var o = item(ev.target.dataset.id);
        o.a = ev.target.value;
        o.t = Date.now();
        agendarGravacao();
        pedirArmazenamentoPermanente();
      }
    });
    $("#lista").addEventListener("focusout", function (ev) {
      if (ev.target.tagName === "TEXTAREA") gravarJa();
    });
    $("#menu-btn").onclick = function () {
      var m = $("#menu");
      m.hidden = !m.hidden;
      $("#menu-btn").setAttribute("aria-expanded", String(!m.hidden));
      if (!m.hidden) mostrarArmazenamento();
    };
    $("#salvar-copia").onclick = baixarCopia;
    $("#restaurar").onchange = function (ev) {
      if (ev.target.files[0]) restaurarCopia(ev.target.files[0]);
      ev.target.value = "";
    };
    var evInstalar = null;
    window.addEventListener("beforeinstallprompt", function (ev) {
      ev.preventDefault();
      evInstalar = ev;
      $("#instalar").hidden = false;
    });
    $("#instalar").onclick = function () {
      if (evInstalar) {
        evInstalar.prompt();
        evInstalar = null;
        $("#instalar").hidden = true;
      }
    };
    if (!salvouOk)
      avisar(
        'Este navegador não deixa salvar. Use "Baixar cópia" no menu ⋯ para não perder suas anotações.',
      );
    else if (Object.keys(S).length)
      $("#salvo").textContent =
        "✔ Marcações anteriores carregadas deste aparelho";
    render();
  }

  carregarDados()
    .then(iniciar)
    .catch(function () {
      document.body.innerHTML =
        '<p style="padding:24px">Não consegui carregar os dados. Confira a internet e abra de novo.</p>';
    });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {
        /* ignora */
      });
    });
  }
})();
