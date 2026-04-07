/**
 * main.js — Carlos Eduardo Personal Site
 * Stack: Lenis + GSAP + ScrollTrigger + SplitText (com fallback manual)
 *
 * Ordem de inicialização:
 *  1. GSAP plugins
 *  2. Lenis smooth scroll (conectado ao ticker do GSAP)
 *  3. Canvas hero (grade de pontos animada)
 *  4. Animação de entrada do hero (nome + subtítulo)
 *  5. Navbar (aparece ao sair do hero, fundo blur ao rolar)
 *  6. Cursor customizado com efeito de lag
 *  7. Botões magnéticos
 *  8. Animações disparadas por scroll (SplitText + ScrollTrigger)
 */

/* ================================================================
   UTILS — manipulação de texto sem SplitText
   ================================================================ */

/**
 * Divide um elemento de texto em spans de chars, preservando <br>.
 * Usado como fallback quando o CDN do SplitText não estiver disponível.
 */
function splitCharsManual(el) {
  const html = el.innerHTML;
  const parts = html.split(/<br\s*\/?>/i);
  el.innerHTML = '';

  const chars = [];

  parts.forEach((part, i) => {
    // Remove tags HTML restantes antes de iterar caracteres
    const textContent = part.replace(/<[^>]+>/g, '');
    textContent.split('').forEach(char => {
      const span = document.createElement('span');
      span.className = 'char';
      span.style.cssText = 'display:inline-block;';
      span.textContent = char === ' ' ? '\u00A0' : char;
      el.appendChild(span);
      chars.push(span);
    });

    if (i < parts.length - 1) {
      el.appendChild(document.createElement('br'));
    }
  });

  return chars;
}

/* ================================================================
   1. REGISTRO DE PLUGINS GSAP
   ================================================================ */
function initGSAP() {
  gsap.registerPlugin(ScrollTrigger);

  if (typeof SplitText !== 'undefined') {
    gsap.registerPlugin(SplitText);
  }

  // Garante que ScrollTrigger recalcule após imagens carregarem
  window.addEventListener('load', () => ScrollTrigger.refresh());
}

/* ================================================================
   2. LENIS SMOOTH SCROLL
   ================================================================ */
let lenis;

function initLenis() {
  lenis = new Lenis({
    duration: 1.2,
    easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smooth: true,
    smoothTouch: false,
    touchMultiplier: 2,
  });

  // Conecta Lenis ao ScrollTrigger do GSAP
  lenis.on('scroll', ScrollTrigger.update);

  // Usa o ticker do GSAP para o loop de animação do Lenis
  gsap.ticker.add(time => {
    lenis.raf(time * 1000);
  });

  // Evita lag spikes no ticker
  gsap.ticker.lagSmoothing(0);

  // Scroll suave em links âncora internos
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const id = link.getAttribute('href');
      if (id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -80, duration: 1.4 });
    });
  });
}

/* ================================================================
   3. HERO CANVAS — CHUVA DE BINÁRIOS AZUL
   ================================================================
   Efeitos:
   · Chuva de "0" e "1" em tons de azul elétrico com glow
   · Mouse: colunas próximas ao cursor aceleram e ficam mais brilhantes
   · Clique: onda de choque circular cyan percorre a chuva
   · Idle: ~3% das colunas piscam em cyan (cor accent) aleatoriamente
   ================================================================ */
function initHeroCanvas() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  /* ---- Config ---- */
  const FS          = 13;          // font-size (px) → espaçamento das colunas
  const FADE_ALPHA  = 0.055;       // transparência do overlay por frame (controla tamanho da trilha)
  const BASE_SPEED  = 0.3;         // velocidade base das gotas (frames por célula)
  const MOUSE_RANGE = 140;         // raio de influência do mouse (px)
  const SHOCK_SPEED = 4.5;         // velocidade da onda de choque (px/frame)

  /* Cores (azul elétrico) */
  const C_HEAD    = '#7ab8ff';     // ponta da gota — azul claro brilhante
  const C_MID     = '#2266ee';     // meio da trilha
  const C_GLOW    = '#1144cc';     // cor do shadowColor padrão
  const C_MOUSE   = '#99ccff';     // colunas influenciadas pelo mouse
  const C_ACCENT  = '#00f5d4';     // flash cyan (accent do site)
  const C_SHOCK   = '#00f5d4';     // onda de choque

  /* Estado */
  let W, H, colCount;
  let drops   = [];   // posição Y atual de cada coluna (em células)
  let speeds  = [];   // velocidade base por coluna
  let glows   = [];   // timer de brilho accent por coluna (0–1)
  let shocks  = [];   // ondas de choque ativas [{x, y, r}]

  /* Posição do mouse relativa ao canvas */
  let mouseX = -9999, mouseY = -9999;

  /* ---- Eventos de mouse ---- */
  const section = canvas.parentElement;

  section.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  });

  section.addEventListener('mouseleave', () => {
    mouseX = -9999;
    mouseY = -9999;
  });

  /* Clique → cria onda de choque */
  section.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    shocks.push({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      r: 0,           // raio atual
      maxR: Math.max(W, H) * 0.85, // raio máximo
    });
  });

  /* ---- Redimensionamento ---- */
  function resize() {
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
    colCount = Math.floor(W / FS);

    /* Inicializa (ou reinicializa) arrays */
    drops  = Array.from({ length: colCount }, () => Math.random() * -(H / FS));
    speeds = Array.from({ length: colCount }, () => Math.random() * 0.45 + BASE_SPEED);
    glows  = Array(colCount).fill(0);
  }

  /* ---- Loop de desenho ---- */
  function draw() {
    /* Overlay semi-transparente → cria o efeito de trilha que desaparece */
    ctx.fillStyle = `rgba(10, 10, 10, ${FADE_ALPHA})`;
    ctx.fillRect(0, 0, W, H);

    ctx.font = `bold ${FS}px 'DM Mono', monospace`;
    ctx.textAlign = 'center';

    for (let i = 0; i < colCount; i++) {
      const cx = i * FS + FS / 2;          // centro X da coluna
      const cy = drops[i] * FS;            // Y atual da gota

      /* ── Distância ao mouse ── */
      const dxM   = cx - mouseX;
      const dyM   = cy - mouseY;
      const distM = Math.sqrt(dxM * dxM + dyM * dyM);
      const inflM = Math.max(0, 1 - distM / MOUSE_RANGE);

      /* ── Distância a cada onda de choque ── */
      let inflShock = 0;
      for (const s of shocks) {
        const dxS = cx - s.x;
        const dyS = cy - s.y;
        const d   = Math.sqrt(dxS * dxS + dyS * dyS);
        /* A onda afeta colunas numa faixa ao redor do raio atual */
        const delta = Math.abs(d - s.r);
        if (delta < 30) {
          inflShock = Math.max(inflShock, 1 - delta / 30);
        }
      }

      /* ── Disparo aleatório de flash accent ── */
      if ((inflM > 0.55 || inflShock > 0.5) && Math.random() < 0.06) {
        glows[i] = 1.0;
      } else if (Math.random() < 0.003) {
        glows[i] = 0.7; // flash espontâneo ocasional
      }
      if (glows[i] > 0) glows[i] = Math.max(0, glows[i] - 0.05);

      /* ── Escolha de cor e glow ── */
      let fillColor, shadowColor, shadowBlur;

      if (glows[i] > 0.15 || inflShock > 0.3) {
        /* Flash accent (cyan) */
        const a = Math.max(glows[i], inflShock);
        fillColor   = C_ACCENT;
        shadowColor = C_SHOCK;
        shadowBlur  = 18 + a * 20;
      } else if (inflM > 0.15) {
        /* Influência do mouse — azul mais claro e intenso */
        fillColor   = C_MOUSE;
        shadowColor = C_HEAD;
        shadowBlur  = 10 + inflM * 16;
      } else {
        /* Normal */
        fillColor   = C_HEAD;
        shadowColor = C_GLOW;
        shadowBlur  = 6;
      }

      ctx.shadowColor = shadowColor;
      ctx.shadowBlur  = shadowBlur;
      ctx.fillStyle   = fillColor;

      /* Desenha o caractere binário */
      const bit = Math.random() < 0.5 ? '0' : '1';
      ctx.fillText(bit, cx, cy);

      /* Zera glow para não vazar no próximo frame */
      ctx.shadowBlur = 0;

      /* ── Avança a gota ── */
      const boost = inflM * 1.4 + inflShock * 2.0;
      drops[i] += speeds[i] + boost;

      /* Reset da coluna quando sai pela base */
      if (drops[i] * FS > H && Math.random() > 0.975) {
        drops[i] = Math.random() * -25;
      }
    }

    /* ── Avança ondas de choque ── */
    for (let s of shocks) s.r += SHOCK_SPEED;
    /* Remove ondas que ultrapassaram o raio máximo */
    shocks = shocks.filter(s => s.r < s.maxR);

    requestAnimationFrame(draw);
  }

  /* ---- Inicia ---- */
  const ro = new ResizeObserver(resize);
  ro.observe(section);
  resize();
  requestAnimationFrame(draw);
}

/* ================================================================
   4. ANIMAÇÃO DE ENTRADA DO HERO
   ================================================================ */
function animateHero() {
  const heroNameEl = document.getElementById('heroName');
  const heroSubEl  = document.getElementById('heroSub');
  if (!heroNameEl) return;

  // --- Split em chars ---
  let chars;
  if (typeof SplitText !== 'undefined') {
    // SplitText via CDN
    const split = new SplitText(heroNameEl, {
      type:       'lines,chars',
      linesClass: 'line',
      charsClass: 'char',
    });
    // Adiciona overflow:hidden em cada linha para o efeito de reveal
    split.lines.forEach(line => {
      line.style.overflow = 'hidden';
    });
    chars = split.chars;
  } else {
    // Fallback manual
    chars = splitCharsManual(heroNameEl);
  }

  // Estado inicial: chars abaixo do viewport
  gsap.set(chars, { y: '110%' });

  // Timeline de entrada
  const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });

  const heroPhotoWrap = document.getElementById('heroPhotoWrap');
  const heroPhoto     = document.getElementById('heroPhoto');

  tl
    .to(chars, {
      y:        '0%',
      duration:  0.95,
      stagger:   0.032,
    })
    .to(
      heroSubEl,
      { y: 0, opacity: 1, duration: 0.75, ease: 'power3.out' },
      '-=0.5'
    );

  /* Revela a foto: clip-path de baixo para cima + fade-in do wrapper */
  if (heroPhotoWrap && heroPhoto) {
    /* O wrapper parte do estado opacity:0 / translateY(40px) definido no CSS */
    tl.to(
      heroPhotoWrap,
      { opacity: 1, y: 0, duration: 1.0, ease: 'power3.out' },
      0.25   /* começa cedo, sobrepõe com os chars */
    );

    /* Clip-path: revela a foto de baixo para cima */
    gsap.fromTo(
      heroPhoto,
      { clipPath: 'polygon(0 100%, 100% 100%, 100% 100%, 100% 100%, 0 100%)' },
      {
        clipPath:  'polygon(0 0%, 100% 0%, 100% 82%, 82% 100%, 0 100%)',
        duration:  1.2,
        ease:      'power4.out',
        delay:     0.35,
      }
    );
  }
}

/* ================================================================
   5. NAVBAR — aparece ao sair do hero, fundo blur ao rolar
   ================================================================ */
function initNavbar() {
  const navbar  = document.getElementById('navbar');
  const menuBtn = document.getElementById('menuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  if (!navbar) return;

  // Aparece quando sair do hero
  ScrollTrigger.create({
    trigger:    '.section-hero',
    start:      'bottom 85%',
    onEnter:    () => navbar.classList.add('visible'),
    onLeaveBack: () => navbar.classList.remove('visible'),
  });

  // Fundo translúcido ao rolar > 50px
  ScrollTrigger.create({
    start: '50px top',
    onUpdate(self) {
      navbar.classList.toggle('scrolled', self.progress > 0);
    },
  });

  // Menu mobile
  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', () => {
      const isOpen = !mobileMenu.classList.contains('open');
      mobileMenu.classList.toggle('open', isOpen);
      menuBtn.classList.toggle('open', isOpen);
      menuBtn.setAttribute('aria-expanded', String(isOpen));
      mobileMenu.setAttribute('aria-hidden', String(!isOpen));
      // Pausa/retoma scroll com Lenis
      isOpen ? lenis.stop() : lenis.start();
    });

    mobileMenu.querySelectorAll('.mobile-link').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        menuBtn.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
        mobileMenu.setAttribute('aria-hidden', 'true');
        lenis.start();
      });
    });
  }
}

/* ================================================================
   6. CURSOR PERSONALIZADO
   Dot pequeno segue imediatamente; círculo segue com suave lag.
   ================================================================ */
function initCursor() {
  // Não inicializa em touch devices
  if (window.matchMedia('(pointer: coarse)').matches) return;

  const dot    = document.getElementById('cursorDot');
  const circle = document.getElementById('cursorCircle');
  if (!dot || !circle) return;

  let mx = window.innerWidth  / 2;
  let my = window.innerHeight / 2;
  let cx = mx, cy = my;

  document.addEventListener('mousemove', e => {
    mx = e.clientX;
    my = e.clientY;
    // Dot segue instantaneamente
    gsap.set(dot, { x: mx, y: my });
  });

  // Loop de lag para o círculo
  function updateCircle() {
    cx += (mx - cx) * 0.11;
    cy += (my - cy) * 0.11;
    gsap.set(circle, { x: cx, y: cy });
    requestAnimationFrame(updateCircle);
  }
  updateCircle();

  // Aumenta o círculo ao passar sobre elementos interativos
  const hoverEls = document.querySelectorAll(
    'a, button, .mag-btn, .proj-card, .skill-card, .contact-link'
  );
  hoverEls.forEach(el => {
    el.addEventListener('mouseenter', () => circle.classList.add('hovering'));
    el.addEventListener('mouseleave', () => circle.classList.remove('hovering'));
  });
}

/* ================================================================
   7. BOTÕES MAGNÉTICOS
   O botão é atraído suavemente em direção ao cursor.
   ================================================================ */
function initMagneticButtons() {
  if (window.matchMedia('(pointer: coarse)').matches) return;

  document.querySelectorAll('.mag-btn').forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const rect  = btn.getBoundingClientRect();
      const cx    = rect.left + rect.width  / 2;
      const cy    = rect.top  + rect.height / 2;
      const dx    = e.clientX - cx;
      const dy    = e.clientY - cy;
      const dist  = Math.sqrt(dx * dx + dy * dy);
      const range = Math.max(rect.width, rect.height) * 0.85;

      if (dist < range) {
        gsap.to(btn, {
          x: dx * 0.3,
          y: dy * 0.3,
          duration: 0.4,
          ease: 'power2.out',
        });
      }
    });

    btn.addEventListener('mouseleave', () => {
      gsap.to(btn, {
        x: 0,
        y: 0,
        duration: 0.65,
        ease: 'elastic.out(1, 0.4)',
      });
    });
  });
}

/* ================================================================
   8A. ANIMAÇÃO DE TÍTULOS DE SEÇÃO (SplitText)
   ================================================================ */
function animateSectionTitles() {
  document.querySelectorAll('.sec-title').forEach(title => {
    // Pula o título "Sobre Mim" (tem animação própria)
    if (title.classList.contains('sobre-title')) return;

    let targets;

    if (typeof SplitText !== 'undefined') {
      const split = new SplitText(title, {
        type:       'lines,words',
        linesClass: 'line',
        wordsClass: 'word',
      });
      split.lines.forEach(l => (l.style.overflow = 'hidden'));
      targets = split.words;
    } else {
      targets = [title]; // anima o título inteiro
    }

    gsap.from(targets, {
      y:        50,
      opacity:  0,
      duration: 0.9,
      stagger:  0.06,
      ease:     'power4.out',
      scrollTrigger: {
        trigger: title,
        start:   'top 88%',
      },
    });
  });
}

/* ================================================================
   8B. RÓTULOS DE SEÇÃO (// 02, // 03 …)
   ================================================================ */
function animateSecLabels() {
  document.querySelectorAll('.sec-label').forEach(label => {
    gsap.from(label, {
      x:       -20,
      opacity:  0,
      duration: 0.6,
      ease:     'power3.out',
      scrollTrigger: {
        trigger: label,
        start:   'top 92%',
      },
    });
  });
}

/* ================================================================
   8C. FOTO DA SEÇÃO "SOBRE MIM"
   Reveal clip-path + parallax sutil ao scroll
   ================================================================ */
function animateSobrePhoto() {
  const photo = document.getElementById('sobrePhoto');
  if (!photo) return;

  // Reveal de baixo para cima com clip-path
  // O clip-path final deve corresponder ao definido no CSS
  gsap.fromTo(photo,
    { clipPath: 'polygon(0 100%, 100% 100%, 100% 100%, 100% 100%, 0 100%)' },
    {
      clipPath: 'polygon(0 0%, 100% 0%, 100% 80%, 80% 100%, 0 100%)',
      duration: 1.3,
      ease:     'power4.out',
      scrollTrigger: {
        trigger: photo,
        start:   'top 88%',
      },
    }
  );

  // Parallax sutil (move -50px enquanto a seção passa pelo viewport)
  gsap.to(photo, {
    y:    -50,
    ease: 'none',
    scrollTrigger: {
      trigger: '.sobre',
      start:   'top bottom',
      end:     'bottom top',
      scrub:   1.8,
    },
  });

  // Título "Sobre Mim"
  const sobreTitle = document.querySelector('.sobre-title');
  if (sobreTitle) {
    let targets;
    if (typeof SplitText !== 'undefined') {
      const split = new SplitText(sobreTitle, {
        type:       'lines,words',
        linesClass: 'line',
        wordsClass: 'word',
      });
      split.lines.forEach(l => (l.style.overflow = 'hidden'));
      targets = split.words;
    } else {
      targets = [sobreTitle];
    }

    gsap.from(targets, {
      y:        50,
      opacity:  0,
      duration: 0.9,
      stagger:  0.07,
      ease:     'power4.out',
      scrollTrigger: {
        trigger: sobreTitle,
        start:   'top 85%',
      },
    });
  }

  // Parágrafos e tags — efeito de digitação (typewriter)
  typewriterSobre();
}

/* ================================================================
   TYPEWRITER — Seção "Sobre Mim"
   ================================================================
   Lógica:
   · Divide cada nó de texto em <span class="tw-char"> (opacity:0)
   · Processa nós filhos recursivamente (suporte a <strong> etc.)
   · GSAP timeline sequencial: cada char aparece com 22ms de stagger
   · Cursor piscante <span class="tw-cursor"> se move elemento a elemento
   · Dispara uma única vez via ScrollTrigger ao entrar no viewport
   ================================================================ */
function typewriterSobre() {
  /* ---- Divide um elemento em spans de char, preservando elementos filhos ---- */
  function wrapCharsDeep(node) {
    const spans = [];
    // Copia a lista antes de iterar (o DOM é modificado durante o loop)
    [...node.childNodes].forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent;
        if (!text) return;
        const frag = document.createDocumentFragment();
        text.split('').forEach(char => {
          const span = document.createElement('span');
          span.className = 'tw-char';
          span.textContent = char;
          gsap.set(span, { opacity: 0 });
          frag.appendChild(span);
          spans.push(span);
        });
        node.replaceChild(frag, child);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        // Processa recursivamente (ex: <strong>)
        spans.push(...wrapCharsDeep(child));
      }
    });
    return spans;
  }

  const paragraphs = [...document.querySelectorAll('.sobre-paragraphs p')];
  const tags       = [...document.querySelectorAll('.sobre-tags .tag')];
  const allEls     = [...paragraphs, ...tags];

  if (!allEls.length) return;

  // Divide todos os elementos em chars antes de construir a timeline
  const charGroups = allEls.map(el => wrapCharsDeep(el));

  /* Cursor único que percorre os elementos durante a digitação */
  const cursor = document.createElement('span');
  cursor.className = 'tw-cursor';
  cursor.setAttribute('aria-hidden', 'true');

  /* Timeline mestre — pausada até o ScrollTrigger disparar */
  const masterTl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });

  charGroups.forEach((chars, i) => {
    if (!chars.length) return;
    const el = allEls[i];

    // Posiciona o cursor no final do elemento antes de começar a digitar
    masterTl.call(() => el.appendChild(cursor));

    // Digita os chars: cada um aparece instantaneamente, 22ms de intervalo
    masterTl.to(chars, {
      opacity:  1,
      duration: 0.001,   // reveal instantâneo por char
      stagger:  0.022,   // 22ms entre chars ≈ digitação rápida
    });

    // Pausa entre elementos (mais longa entre parágrafos, menor entre tags)
    const pause = i < paragraphs.length - 1 ? 0.22 : 0.08;
    masterTl.to({}, { duration: pause });
  });

  // Remove o cursor quando tudo termina
  masterTl.call(() => cursor.remove());

  // Dispara ao entrar no viewport (once: true → não repete ao rolar de volta)
  ScrollTrigger.create({
    trigger: '.sobre-text-wrap',
    start:   'top 75%',
    once:    true,
    onEnter: () => masterTl.play(),
  });
}

/* ================================================================
   8D. DASHBOARD DE SKILLS — interativo
   ================================================================
   Dados de cada categoria:
   · title, num, summary: texto do painel
   · items: { name, level (0-100), desc }
   · tags: badges exibidos na base
   ================================================================ */
const SKILLS_DATA = {
  security: {
    num: '01', title: 'Segurança',
    summary: 'Foco em identificação e exploração de vulnerabilidades com base em metodologias de pentest e hardening de sistemas Linux.',
    items: [
      {
        name: 'Cybersecurity',
        desc: 'Estudo e aplicação de fundamentos de segurança ofensiva e defensiva, abrangendo desde criptografia e autenticação até análise de ameaças e resposta a incidentes.',
        advantages: ['Proteção proativa contra ataques digitais', 'Base sólida para carreira em segurança da informação', 'Capacidade de pensar como atacante e defensor'],
      },
      {
        name: 'Pentest',
        desc: 'Testes de penetração em ambientes controlados usando metodologias como PTES e OWASP, identificando vetores de ataque antes que agentes maliciosos o façam.',
        advantages: ['Descoberta de falhas reais antes de explorações maliciosas', 'Geração de relatórios técnicos acionáveis', 'Experiência prática com ferramentas de mercado (Metasploit, Burp Suite)'],
      },
      {
        name: 'Linux Security',
        desc: 'Hardening de sistemas Linux, gestão de permissões, SELinux/AppArmor, auditoria de logs e controle de acesso baseado em princípio do menor privilégio.',
        advantages: ['Redução da superfície de ataque em servidores', 'Domínio do SO mais usado em infraestrutura crítica', 'Automatização de tarefas de segurança via scripts bash'],
      },
      {
        name: 'Análise de Vulnerabilidades',
        desc: 'Avaliação e priorização de vulnerabilidades usando CVE, CVSS e ferramentas como Nmap e Nessus, com geração de relatórios detalhados de risco.',
        advantages: ['Priorização eficiente de riscos por criticidade', 'Comunicação clara de falhas para equipes técnicas e de negócio', 'Base para ciclos de patch management e remediação'],
      },
    ],
    tags: ['OWASP', 'Kali Linux', 'CTF', 'Nmap'],
  },
  dev: {
    num: '02', title: 'Desenvolvimento',
    summary: 'Desenvolvimento de software com foco em lógica, eficiência e boas práticas de engenharia — da modelagem à implementação.',
    items: [
      {
        name: 'Java',
        desc: 'Linguagem orientada a objetos usada em projetos acadêmicos e sistemas empresariais, com domínio de POO, coleções, streams, tratamento de exceções e Maven.',
        advantages: ['Ecossistema maduro com vasta biblioteca de ferramentas', 'Portabilidade via JVM — "escreva uma vez, rode em qualquer lugar"', 'Fortemente tipada, reduzindo erros em tempo de execução'],
      },
      {
        name: 'C / C++',
        desc: 'Programação de baixo nível com gerenciamento manual de memória, ponteiros, alocação dinâmica e acesso direto ao hardware — base para sistemas embarcados e kernels.',
        advantages: ['Performance máxima para sistemas de alta exigência', 'Controle total sobre recursos de hardware e memória', 'Fundamenta o entendimento de como linguagens de alto nível funcionam'],
      },
      {
        name: 'Construção de Software',
        desc: 'Aplicação de padrões de projeto (GoF), princípios SOLID, testes unitários e refatoração contínua para produzir código limpo, legível e de fácil manutenção.',
        advantages: ['Código mais fácil de manter e evoluir com o tempo', 'Redução de débito técnico e retrabalho futuro', 'Facilita colaboração em equipe com convenções claras'],
      },
      {
        name: 'Algoritmos & Estruturas',
        desc: 'Estudo e implementação de algoritmos de ordenação, busca, grafos, árvores e análise de complexidade (Big-O) — essencial para resolver problemas computacionais com eficiência.',
        advantages: ['Soluções otimizadas que escalam bem com o crescimento dos dados', 'Base para aprovação em processos seletivos técnicos', 'Capacidade de escolher a estrutura de dados ideal para cada contexto'],
      },
    ],
    tags: ['Git', 'OOP', 'Clean Code', 'Maven'],
  },
  data: {
    num: '03', title: 'Dados',
    summary: 'Manipulação e visualização de dados para suporte à tomada de decisão — com foco em clareza analítica e precisão.',
    items: [
      {
        name: 'SQL',
        desc: 'Linguagem declarativa para consulta e manipulação de bancos de dados relacionais, com domínio de joins, subqueries, agregações, índices e transações.',
        advantages: ['Linguagem universal presente em praticamente todo sistema de dados', 'Consultas poderosas sem necessidade de programação imperativa', 'Base indispensável para análise de dados e engenharia de dados'],
      },
      {
        name: 'Power BI',
        desc: 'Criação de dashboards interativos e relatórios visuais com DAX, Power Query e integração com múltiplas fontes de dados para suporte à decisão executiva.',
        advantages: ['Transformação de dados brutos em insights visuais imediatos', 'Integração nativa com Excel, Azure e ecossistema Microsoft', 'Capacitação de equipes de negócio para self-service analytics'],
      },
      {
        name: 'Análise de Dados',
        desc: 'Processo de limpeza, transformação e interpretação de conjuntos de dados para identificar padrões, tendências e anomalias que embasam decisões estratégicas.',
        advantages: ['Decisões embasadas em evidências, não em intuição', 'Identificação precoce de problemas e oportunidades', 'Habilidade transversal valorizada em qualquer área de negócio'],
      },
      {
        name: 'Visualização',
        desc: 'Design de gráficos, KPIs e narrativas visuais (data storytelling) que comunicam resultados analíticos de forma clara para públicos técnicos e não-técnicos.',
        advantages: ['Comunicação eficaz de resultados complexos para stakeholders', 'Acelera a compreensão e o alinhamento entre equipes', 'Aumenta o impacto e a adoção de projetos analíticos'],
      },
    ],
    tags: ['ETL', 'DAX', 'Business Intelligence', 'Excel'],
  },
  systems: {
    num: '04', title: 'Sistemas',
    summary: 'Compreensão profunda de sistemas operacionais, redes e arquitetura de computadores — da camada física ao software.',
    items: [
      {
        name: 'Linux',
        desc: 'Administração de sistemas Linux via linha de comando, automação com scripts bash, gerenciamento de processos, permissões, serviços e configuração de ambiente.',
        advantages: ['Sistema operacional dominante em servidores, nuvem e dispositivos embarcados', 'Automação poderosa via scripts que economizam horas de trabalho manual', 'Ambiente ideal para desenvolvimento, segurança e infraestrutura'],
      },
      {
        name: 'Redes',
        desc: 'Fundamentos de redes de computadores: modelo OSI/TCP-IP, endereçamento IP, DNS, roteamento, protocolos (HTTP, SSH, FTP) e análise de tráfego com Wireshark.',
        advantages: ['Diagnóstico e resolução eficiente de problemas de conectividade', 'Essencial para cloud computing, DevOps e segurança de rede', 'Entendimento do caminho que cada pacote percorre na infraestrutura'],
      },
      {
        name: 'Sistemas Operacionais',
        desc: 'Estudo do funcionamento interno de SOs: gerenciamento de processos, escalonamento, memória virtual, sistemas de arquivos, concorrência e sincronização.',
        advantages: ['Compreensão de como o software interage com o hardware', 'Base para otimização de performance e resolução de deadlocks', 'Conhecimento aplicável em desenvolvimento de sistemas e kernels'],
      },
      {
        name: 'Arquitetura de Computadores',
        desc: 'Estudo da organização interna de processadores: pipeline, cache, registradores, conjunto de instruções (ISA) e noções de programação em assembly.',
        advantages: ['Otimização de código levando em conta o comportamento do hardware', 'Entendimento de limitações físicas que impactam software', 'Base para áreas como sistemas embarcados, compiladores e segurança de baixo nível'],
      },
    ],
    tags: ['Bash', 'TCP/IP', 'Virtualização', 'Wireshark'],
  },
};

function initSkillsDashboard() {
  const panel = document.getElementById('skillsPanel');
  const tabs  = document.querySelectorAll('.skill-tab');
  if (!panel || !tabs.length) return;

  /* ---- Constrói o HTML de um painel ---- */
  function buildPanelHTML(key) {
    const d = SKILLS_DATA[key];
    if (!d) return '';
    return `
      <div class="skill-panel-content">
        <div class="skill-panel-header">
          <span class="skill-panel-num" aria-hidden="true">${d.num}</span>
          <h3 class="skill-panel-title">${d.title}</h3>
        </div>
        <p class="skill-panel-summary">${d.summary}</p>
        <ul class="skill-list" aria-label="Habilidades">
          ${d.items.map((it, i) => `
            <li class="skill-item" data-index="${i}">
              <button class="skill-item-btn" aria-expanded="false">
                <span class="skill-item-name">${it.name}</span>
                <span class="skill-item-icon" aria-hidden="true">+</span>
              </button>
              <div class="skill-item-body" aria-hidden="true">
                <div class="skill-item-body-inner">
                  <p class="skill-item-desc">${it.desc}</p>
                  <ul class="skill-item-advantages">
                    ${it.advantages.map(a => `<li>${a}</li>`).join('')}
                  </ul>
                </div>
              </div>
            </li>
          `).join('')}
        </ul>
        <div class="skill-panel-tags">
          ${d.tags.map(t => `<span class="tag">${t}</span>`).join('')}
        </div>
      </div>`;
  }

  /* ---- Adiciona lógica de accordion no painel atual ---- */
  function bindAccordion() {
    panel.querySelectorAll('.skill-item-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.skill-item');
        const isOpen = item.classList.contains('open');
        /* Fecha todos */
        panel.querySelectorAll('.skill-item.open').forEach(el => {
          el.classList.remove('open');
          el.querySelector('.skill-item-btn').setAttribute('aria-expanded', 'false');
          el.querySelector('.skill-item-body').setAttribute('aria-hidden', 'true');
        });
        /* Abre o clicado (se estava fechado) */
        if (!isOpen) {
          item.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
          item.querySelector('.skill-item-body').setAttribute('aria-hidden', 'false');
        }
      });
    });
  }

  /* ---- Troca de painel com animação ---- */
  function switchPanel(key, animate = true) {
    if (animate) {
      gsap.to(panel, {
        opacity: 0, x: -12, duration: 0.18, ease: 'power2.in',
        onComplete() {
          panel.innerHTML = buildPanelHTML(key);
          bindAccordion();
          gsap.fromTo(panel,
            { opacity: 0, x: 14 },
            { opacity: 1, x: 0, duration: 0.32, ease: 'power3.out' }
          );
          gsap.from(panel.querySelectorAll('.skill-item'), {
            y: 14, opacity: 0, duration: 0.45, stagger: 0.07, ease: 'power3.out',
          });
          gsap.from(panel.querySelectorAll('.skill-panel-summary, .skill-panel-header'), {
            y: 10, opacity: 0, duration: 0.35, stagger: 0.06, ease: 'power3.out',
          });
        },
      });
    } else {
      panel.innerHTML = buildPanelHTML(key);
      bindAccordion();
    }
  }

  /* ---- Clique nas abas ---- */
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.classList.contains('active')) return;
      tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      switchPanel(tab.dataset.skill);
    });
  });

  /* ---- Estado inicial (sem animação — espera o ScrollTrigger) ---- */
  panel.innerHTML = buildPanelHTML('security');

  /* ---- Entrada da seção ao scroll ---- */
  ScrollTrigger.create({
    trigger: '.skills-dashboard',
    start:   'top 80%',
    once:    true,
    onEnter() {
      gsap.from(tabs, { x: -30, opacity: 0, duration: 0.55, stagger: 0.1, ease: 'power3.out' });
      gsap.from(panel, { opacity: 0, x: 20, duration: 0.55, delay: 0.2, ease: 'power3.out' });
      gsap.from(panel.querySelectorAll('.skill-item'), {
        y: 14, opacity: 0, duration: 0.4, stagger: 0.07, delay: 0.35, ease: 'power3.out',
      });
    },
  });
}

/* ================================================================
   8E. TIMELINE — linha cresce conforme o scroll
   ================================================================ */
function animateTimeline() {
  const progress = document.getElementById('timelineProgress');
  if (!progress) return;

  ScrollTrigger.create({
    trigger: '.timeline',
    start:   'top 72%',
    end:     'bottom 55%',
    scrub:   0.6,
    onUpdate(self) {
      progress.style.height = (self.progress * 100) + '%';
    },
  });

  gsap.from('.timeline-item', {
    x:        -30,
    opacity:  0,
    duration: 0.8,
    stagger:  0.18,
    ease:     'power3.out',
    scrollTrigger: {
      trigger: '.timeline',
      start:   'top 82%',
    },
  });
}

/* ================================================================
   8F. ITENS DE EXPERIÊNCIA
   ================================================================ */
function animateExpItems() {
  gsap.from('.exp-item', {
    y:        40,
    opacity:  0,
    duration: 0.7,
    stagger:  0.13,
    ease:     'power3.out',
    scrollTrigger: {
      trigger: '.exp-list',
      start:   'top 82%',
    },
  });
}

/* ================================================================
   8G. CARDS DE PROJETOS
   ================================================================ */
function animateProjectCards() {
  gsap.from('.proj-card', {
    y:        60,
    opacity:  0,
    duration: 0.8,
    stagger:  0.1,
    ease:     'power3.out',
    scrollTrigger: {
      trigger: '.projects-grid',
      start:   'top 82%',
    },
  });
}

/* ================================================================
   8H. SEÇÃO CTA
   ================================================================ */
function animateCTA() {
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: '.cta',
      start:   'top 78%',
    },
  });

  tl
    .from('.cta-badge', {
      y: 20, opacity: 0, duration: 0.6, ease: 'power3.out',
    })
    .from('.cta-title', {
      y: 60, opacity: 0, duration: 1.0, ease: 'power4.out',
    }, '-=0.2')
    .from('.cta-btn', {
      y: 20, opacity: 0, duration: 0.6, ease: 'power3.out',
    }, '-=0.4');
}

/* ================================================================
   8I. LINKS DE CONTATO
   ================================================================ */
function animateContactLinks() {
  gsap.from('.contact-link', {
    y:        30,
    opacity:  0,
    duration: 0.6,
    stagger:  0.1,
    ease:     'power3.out',
    scrollTrigger: {
      trigger: '.contact-links',
      start:   'top 86%',
    },
  });
}

/* ================================================================
   10. CHUVA DE BINÁRIOS GLOBAL
   ================================================================
   · Canvas fixo, cobre o viewport inteiro
   · opacity: 0 por padrão
   · Ao chegar em #skills → fade-in para opacity 0.09
   · Ao voltar acima de #skills → fade-out para opacity 0
   · Algoritmo idêntico ao do hero, porém font menor e sem interação
     de mouse (ambos funcionam em simultâneo sem conflito)
   ================================================================ */
function initGlobalBinaryRain() {
  const canvas = document.getElementById('globalBinaryCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  const FS         = 11;     /* tamanho da fonte — colunas mais densas */
  const FADE       = 0.055;  /* overlay por frame — controla o comprimento da trilha */

  let W, H, colCount;
  let drops  = [];
  let speeds = [];
  let glows  = [];  /* flash cyan espontâneo por coluna */

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    colCount = Math.floor(W / FS);
    drops  = Array.from({ length: colCount }, () => Math.random() * -(H / FS));
    speeds = Array.from({ length: colCount }, () => Math.random() * 0.38 + 0.2);
    glows  = Array(colCount).fill(0);
  }

  function draw() {
    /* Overlay de fade — cria a trilha */
    ctx.fillStyle = `rgba(10, 10, 10, ${FADE})`;
    ctx.fillRect(0, 0, W, H);

    ctx.font      = `bold ${FS}px 'DM Mono', monospace`;
    ctx.textAlign = 'center';

    for (let i = 0; i < colCount; i++) {
      const x = i * FS + FS / 2;
      const y = drops[i] * FS;

      /* Flash accent espontâneo (~0.2% chance por frame por coluna) */
      if (Math.random() < 0.002) glows[i] = 1.0;
      if (glows[i] > 0) glows[i] = Math.max(0, glows[i] - 0.06);

      if (glows[i] > 0.2) {
        ctx.shadowColor = '#00f5d4';
        ctx.shadowBlur  = 12;
        ctx.fillStyle   = `rgba(0, 245, 212, ${glows[i]})`;
      } else {
        ctx.shadowColor = '#0d3aaa';
        ctx.shadowBlur  = 4;
        ctx.fillStyle   = 'rgba(45, 110, 210, 0.72)';
      }

      ctx.fillText(Math.random() < 0.5 ? '0' : '1', x, y);
      ctx.shadowBlur = 0;

      drops[i] += speeds[i];

      if (drops[i] * FS > H && Math.random() > 0.975) {
        drops[i] = Math.random() * -20;
      }
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);

  /* ── Ativa ao entrar em #skills, desativa ao voltar ── */
  ScrollTrigger.create({
    trigger:     '#skills',
    start:       'top 60%',
    onEnter:     () => gsap.to(canvas, { opacity: 0.09, duration: 2.0, ease: 'power2.inOut' }),
    onLeaveBack: () => gsap.to(canvas, { opacity: 0,    duration: 1.2, ease: 'power2.inOut' }),
  });
}

/* ================================================================
   9. PARALLAX EM ELEMENTOS DECORATIVOS DE FUNDO
   (número hero-deco-num)
   ================================================================ */
function initParallaxBg() {
  gsap.to('.hero-deco-num', {
    y:    -120,
    ease: 'none',
    scrollTrigger: {
      trigger: '.section-hero',
      start:   'top top',
      end:     'bottom top',
      scrub:   1,
    },
  });
}

/* ================================================================
   INICIALIZAÇÃO PRINCIPAL
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // 1. Registra plugins GSAP
  initGSAP();

  // 2. Inicializa Lenis
  initLenis();

  // 3. Canvas animado no hero
  initHeroCanvas();

  // 4. Anima hero imediatamente (sem scroll trigger)
  animateHero();

  // 5–9. Restante após o GSAP estar pronto (micro delay)
  gsap.delayedCall(0.05, () => {
    initNavbar();
    initCursor();
    initMagneticButtons();

    animateSectionTitles();
    animateSecLabels();
    animateSobrePhoto();
    initGlobalBinaryRain();    /* chuva de binários global a partir de #skills */
    initSkillsDashboard();     /* dashboard interativo de habilidades */
    animateTimeline();
    animateExpItems();
    animateProjectCards();
    animateCTA();
    animateContactLinks();
    initParallaxBg();

    // Recalcula todos os ScrollTriggers após renderização completa
    ScrollTrigger.refresh();
  });
});
