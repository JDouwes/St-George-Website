/* ============================================================
   LYME TREATMENT GERMANY — Symptom Assessment Quiz UI
   DOM rendering, animations, results, email gate, webhook
   Depends on window.QuizEngine (loaded before this file)
   ============================================================ */
(function () {
  'use strict';
  var QE = window.QuizEngine;
  if (!QE) { console.error('QuizEngine not loaded'); return; }

  var WEBHOOK = 'https://n8n.nutrador.com/webhook/lyme-quiz-submit';
  var SEGMENTS = [[0,1],[2,3],[4,5],[6,7],[8,9],[10]];
  var noMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var BUCKETS = ['low','moderate','significant','high','extensive'];
  var GAUGE_COLORS = { low:'#4db6ac', moderate:'#80cbc4', significant:'#d4a574', high:'#c17a3a', extensive:'#a85d2a' };

  var COPY = {
    low: { label:'Low Symptom Overlap', headline:'Few symptoms identified',
      interpretation:'The symptoms you described do not show a strong overlap with Lyme disease patterns. If you are concerned, we encourage you to continue working with your physician.',
      ctaText:'Learn more about Lyme disease', ctaUrl:'/pages/knowledge/what-is-lyme-disease.html' },
    moderate: { label:'Moderate Symptom Overlap', headline:'A moderate symptom pattern',
      interpretation:'You selected symptoms across one or two categories. While these can have many causes, this pattern is worth discussing with a physician experienced in tick-borne diseases.',
      ctaText:'Understand your testing options', ctaUrl:'/pages/knowledge/lyme-testing-diagnosis.html' },
    significant: { label:'Notable Symptom Overlap', headline:'Multi-system symptom pattern',
      interpretation:'Your symptoms span multiple body systems. This multi-system pattern is one we see frequently in our patients. It warrants a thorough evaluation by a Lyme-experienced physician.',
      ctaText:'Request a specialist case review', ctaUrl:'/pages/consultation.html' },
    high: { label:'Strong Symptom Overlap', headline:'Significant symptom burden',
      interpretation:'The breadth of your symptoms is consistent with presentations we often see in chronic Lyme disease. We would strongly recommend a comprehensive evaluation and welcome the opportunity to review your case.',
      ctaText:'Request a free case review', ctaUrl:'/pages/consultation.html' },
    extensive: { label:'Complex Multi-System Presentation', headline:'Complex symptom burden',
      interpretation:'Patients with this breadth of symptoms have often spent years searching for answers. Your pattern warrants expert evaluation. Our team reviews cases like yours regularly and offers a personal case review at no cost.',
      ctaText:'Request a personal case review', ctaUrl:'/pages/consultation.html' }
  };

  /* DOM refs */
  var $box = document.getElementById('quiz-container');
  var $prog = document.getElementById('quiz-progress');
  var $step = document.getElementById('quiz-step');
  var $nav = document.getElementById('quiz-nav');
  var $load = document.getElementById('quiz-loading');
  var $res = document.getElementById('quiz-results');

  /* Helpers */
  function mk(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  }
  function ga(name, p) { if (typeof gtag !== 'undefined') gtag('event', name, p); }
  function segOf(idx) {
    for (var i = 0; i < SEGMENTS.length; i++) if (SEGMENTS[i].indexOf(idx) !== -1) return i;
    return 0;
  }
  function checkedCount(si) {
    var c = 0;
    QE.STEPS[si].questions.forEach(function (q) { if (q.type === 'checkbox' && QE.state.answers[q.id]) c++; });
    return c;
  }
  function fmtCat(k) { return k.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function sortedCatKeys(cats) {
    return Object.keys(cats).sort(function (a, b) { return cats[b].percent - cats[a].percent; });
  }

  /* ---- PROGRESS BAR ---- */
  function renderProgress(si) {
    var s = QE.STEPS[si], seg = segOf(si);
    var h = '<div class="progress-label">Step ' + (si+1) + ' of 11 &mdash; ' + s.title + '</div><div class="progress-bar">';
    for (var i = 0; i < SEGMENTS.length; i++) {
      h += '<div class="progress-segment' + (i < seg ? ' done' : i === seg ? ' current' : '') + '"></div>';
    }
    $prog.innerHTML = h + '</div>';
  }

  /* ---- BUILD STEP ---- */
  function buildStep(si) {
    var step = QE.STEPS[si], frag = document.createDocumentFragment();
    frag.appendChild(mk('div', 'step-icon icon-' + step.id));
    frag.appendChild(mk('h2', 'step-heading', step.heading));
    if (step.descriptor) frag.appendChild(mk('p', 'step-descriptor', step.descriptor));

    var list = mk('ul', 'symptom-list');
    step.questions.forEach(function (q) {
      if (q.type === 'radio') {
        var grp = mk('div', 'radio-group');
        grp.setAttribute('data-id', q.id);
        grp.appendChild(mk('p', 'radio-question', q.text));
        q.options.forEach(function (opt) {
          var lbl = mk('label', 'radio-item');
          var inp = document.createElement('input');
          inp.type = 'radio'; inp.name = q.id; inp.value = opt.value;
          if (QE.state.answers[q.id] === opt.value) inp.checked = true;
          lbl.appendChild(inp);
          lbl.appendChild(mk('span', 'radio-dot'));
          lbl.appendChild(mk('span', '', opt.label));
          inp.addEventListener('change', function () { QE.setAnswer(q.id, opt.value); });
          grp.appendChild(lbl);
        });
        list.appendChild(grp);
      } else {
        var li = mk('li', 'symptom-item');
        li.setAttribute('data-id', q.id);
        if (QE.state.answers[q.id]) li.classList.add('selected');
        li.appendChild(mk('div', 'symptom-check'));
        var ld = mk('div', 'symptom-label');
        ld.innerHTML = '<strong>' + q.text + '</strong>' + (q.detail ? ' ' + q.detail : '');
        li.appendChild(ld);
        li.addEventListener('click', function () {
          QE.setAnswer(q.id, li.classList.toggle('selected'));
          updateSev(si);
        });
        list.appendChild(li);
      }
    });
    frag.appendChild(list);

    if (step.hasSeverity) {
      var sev = mk('div', 'severity-block');
      sev.id = 'severity-' + si; sev.style.display = 'none';
      sev.appendChild(mk('p', '', 'How severely do these symptoms affect your daily life?'));
      var opts = mk('div', 'severity-options');
      [['1','Mild'],['2','Moderate'],['3','Severe'],['4','Very severe']].forEach(function (p) {
        var btn = mk('button', 'severity-btn', p[1]);
        btn.setAttribute('data-severity', p[0]);
        if (QE.state.severity[si] === parseInt(p[0])) btn.classList.add('active');
        btn.addEventListener('click', function () {
          opts.querySelectorAll('.severity-btn').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          QE.setSeverity(si, parseInt(p[0]));
        });
        opts.appendChild(btn);
      });
      sev.appendChild(opts);
      frag.appendChild(sev);
    }

    if (step.skippable) {
      var skip = mk('a', 'skip-link', 'Skip this section');
      skip.href = '#';
      skip.addEventListener('click', function (e) { e.preventDefault(); goTo(si + 1); });
      frag.appendChild(skip);
    }
    return frag;
  }

  function updateSev(si) {
    var b = document.getElementById('severity-' + si);
    if (b) b.style.display = checkedCount(si) >= 2 ? '' : 'none';
  }

  /* ---- OVERRIDE ALERTS ---- */
  function checkOverrides() {
    var f = QE.getOverrideFlags();
    if (f.crisis) { showCrisis(); return true; }
    var old = $step.querySelector('.override-alert');
    if (old) old.remove();
    if (f.em_rash_current) {
      $step.insertBefore(mk('div', 'override-alert alert-red',
        '<strong>Important:</strong> An expanding rash may require prompt medical attention. Please contact a physician today.'), $step.firstChild);
    } else if (f.cardiac) {
      $step.insertBefore(mk('div', 'override-alert alert-amber',
        '<strong>Note:</strong> Some of your selected symptoms warrant prompt medical review regardless of Lyme.'), $step.firstChild);
    }
    return false;
  }

  function showCrisis() {
    $box.style.display = 'none'; $res.style.display = 'none'; $load.style.display = 'none';
    var p = mk('div', 'crisis-panel');
    p.innerHTML = '<div class="crisis-inner"><h2>We want to make sure you are safe</h2>' +
      '<p>Some of your responses suggest you may be in distress. Please reach out to a crisis support service now.</p>' +
      '<ul class="crisis-numbers"><li><strong>Germany:</strong> 0800 111 0 111 (free, 24/7)</li>' +
      '<li><strong>UK:</strong> 116 123 (Samaritans, free, 24/7)</li>' +
      '<li><strong>International:</strong> <a href="https://www.iasp.info/resources/Crisis_Centres/" target="_blank" rel="noopener">IASP Crisis Centre Directory</a></li></ul>' +
      '<p>You are not alone. Help is available.</p></div>';
    document.body.appendChild(p);
  }

  /* ---- NAVIGATION ---- */
  function renderNav(si) {
    var first = si === 0, last = si === QE.STEPS.length - 1;
    var h = '<div class="step-nav">';
    h += first ? '<a href="#" class="btn-intro-back">&larr; Return to introduction</a>'
               : '<button class="btn btn--outline btn-back">&larr; Back</button>';
    h += '<span class="step-count">Step ' + (si+1) + ' of 11</span>';
    h += '<button class="btn btn--warm btn-next">' + (last ? 'See My Results' : 'Continue &rarr;') + '</button></div>';
    $nav.innerHTML = h;

    var bk = $nav.querySelector('.btn-back'), ib = $nav.querySelector('.btn-intro-back'), nx = $nav.querySelector('.btn-next');
    if (bk) bk.addEventListener('click', function () { goTo(si - 1, true); });
    if (ib) ib.addEventListener('click', function (e) { e.preventDefault(); window.history.back(); });
    if (nx) nx.addEventListener('click', function () { last ? showLoading() : goTo(si + 1); });
  }

  /* ---- STEP TRANSITIONS ---- */
  function renderStep(si) {
    QE.state.currentStep = si;
    renderProgress(si);
    $step.innerHTML = '';
    $step.appendChild(buildStep(si));
    updateSev(si);
    renderNav(si);
    if (!checkOverrides()) ga('quiz_step_complete', { step: si+1, step_name: QE.STEPS[si].id });
  }

  function goTo(ni, back) {
    if (ni < 0 || ni >= QE.STEPS.length) return;
    QE.save();
    var dir = back ? 1 : -1, dur = noMotion ? 0 : 200, ease = 'cubic-bezier(0.4,0,0.2,1)';
    var tr = function (d) { return 'transform ' + d + 'ms ' + ease + ',opacity ' + d + 'ms ' + ease; };
    $step.style.transition = tr(dur);
    $step.style.transform = 'translateX(' + (dir * 60) + 'px)';
    $step.style.opacity = '0';
    setTimeout(function () {
      renderStep(ni);
      $step.style.transition = 'none';
      $step.style.transform = 'translateX(' + (-dir * 60) + 'px)';
      $step.style.opacity = '0';
      void $step.offsetHeight;
      $step.style.transition = tr(noMotion ? 0 : 250);
      $step.style.transform = 'translateX(0)';
      $step.style.opacity = '1';
      $box.scrollIntoView({ behavior: noMotion ? 'auto' : 'smooth', block: 'start' });
    }, dur);
  }

  /* ---- LOADING STATE ---- */
  function showLoading() {
    QE.save();
    $box.style.display = 'none';
    $load.style.display = 'flex';
    $load.innerHTML = '<div class="loading-inner"><div class="loading-shield"></div>' +
      '<p class="loading-text">Analysing your symptom profile\u2026</p>' +
      '<div class="loading-bar"><div class="loading-fill"></div></div></div>';
    var fill = $load.querySelector('.loading-fill');
    void fill.offsetHeight;
    fill.style.transition = 'width 1.5s linear'; fill.style.width = '100%';
    setTimeout(function () { $load.style.display = 'none'; showResults(); }, 1600);
  }

  /* ---- RESULTS ---- */
  function showResults() {
    QE.calculateScores();
    var bkt = QE.getBucket(), cp = COPY[bkt] || COPY.low;
    var cats = QE.getCategoryScores(), keys = sortedCatKeys(cats);
    $res.style.display = 'block'; $res.innerHTML = '';

    /* Gauge */
    var gw = mk('div', 'result-gauge');
    gw.appendChild(buildGauge(bkt));
    gw.appendChild(mk('h2', 'result-bucket', cp.label));
    gw.appendChild(mk('p', 'result-interpretation', cp.interpretation));
    $res.appendChild(gw);

    /* Category bars */
    var bw = mk('div', 'result-categories');
    keys.forEach(function (k, i) {
      var b = mk('div', 'cat-bar' + (i >= 3 ? ' blurred' : ''));
      b.innerHTML = '<span class="cat-label">' + fmtCat(k) + '</span>' +
        '<div class="cat-track"><div class="cat-fill" style="width:' + cats[k].percent + '%"></div></div>' +
        '<span class="cat-pct">' + cats[k].percent + '%</span>';
      bw.appendChild(b);
    });
    if (keys.length > 3) bw.appendChild(mk('div', 'blur-overlay', '<span>Unlock full breakdown</span>'));
    $res.appendChild(bw);
    $res.appendChild(buildGate());
    ga('quiz_complete', { bucket: bkt, score: QE.state.scores && QE.state.scores.total, top_category: keys[0] });
  }

  function buildGauge(bkt) {
    var idx = BUCKETS.indexOf(bkt), pct = ((idx+1) / BUCKETS.length) * 100;
    var color = GAUGE_COLORS[bkt] || '#4db6ac';
    var ang = (pct / 100) * 180, rad = ang * Math.PI / 180;
    var x = 100 + 80 * Math.cos(Math.PI - rad), y = 100 - 80 * Math.sin(Math.PI - rad);
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 200 110'); svg.setAttribute('width', '200'); svg.setAttribute('class', 'gauge-svg');
    svg.innerHTML = '<path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#e0e0e0" stroke-width="10" stroke-linecap="round"/>' +
      '<path d="M 20 100 A 80 80 0 ' + (ang > 180 ? 1 : 0) + ' 1 ' + x.toFixed(1) + ' ' + y.toFixed(1) +
      '" fill="none" stroke="' + color + '" stroke-width="10" stroke-linecap="round"/>';
    return svg;
  }

  /* ---- EMAIL GATE ---- */
  function buildGate() {
    var g = mk('div', 'email-gate');
    g.innerHTML = '<h3>Unlock Your Complete Symptom Report</h3>' +
      '<ul class="gate-bullets"><li>Detailed breakdown of all symptom categories</li>' +
      '<li>Co-infection and post-COVID pattern analysis</li>' +
      '<li>Neural network and autonomic assessment</li>' +
      '<li>Personalised next-step recommendations</li></ul>' +
      '<input type="text" id="gate-firstName" placeholder="First name">' +
      '<input type="email" id="gate-email" placeholder="your@email.com">' +
      '<label class="consent-check"><input type="checkbox" id="gate-consent">' +
      ' I agree to receive my report and educational emails from Lyme Treatment Germany</label>' +
      '<div class="gate-error" id="gate-error" style="display:none"></div>' +
      '<button class="btn btn--warm btn-submit">Send Me My Full Report</button>' +
      '<p class="gate-privacy">GDPR protected. No spam. Unsubscribe anytime.</p>';
    g.querySelector('.btn-submit').addEventListener('click', handleSubmit);
    return g;
  }

  function handleSubmit() {
    var email = (document.getElementById('gate-email').value || '').trim();
    var name = (document.getElementById('gate-firstName').value || '').trim();
    var consent = document.getElementById('gate-consent').checked;
    var err = document.getElementById('gate-error');
    var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!name) { err.textContent = 'Please enter your first name.'; err.style.display = 'block'; return; }
    if (!re.test(email)) { err.textContent = 'Please enter a valid email address.'; err.style.display = 'block'; return; }
    if (!consent) { err.textContent = 'Please agree to the consent checkbox.'; err.style.display = 'block'; return; }
    err.style.display = 'none';

    QE.state.email = email;
    QE.state.firstName = name;
    QE.state.consentTimestamp = new Date().toISOString();
    QE.save();

    var btn = document.querySelector('.btn-submit');
    btn.disabled = true; btn.textContent = 'Sending\u2026';
    fetch(WEBHOOK, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(QE.getSubmitPayload())
    }).then(function () {
      ga('quiz_email_captured', { bucket: QE.getBucket() });
      revealFull();
    }).catch(function () { revealFull(); });
  }

  /* ---- FULL RESULTS (POST-GATE) ---- */
  function revealFull() {
    $res.querySelectorAll('.cat-bar.blurred').forEach(function (b) { b.classList.remove('blurred'); });
    var ov = $res.querySelector('.blur-overlay'); if (ov) ov.remove();
    var gt = $res.querySelector('.email-gate'); if (gt) gt.remove();

    var cats = QE.getCategoryScores(), bkt = QE.getBucket(), cp = COPY[bkt] || COPY.low;
    var keys = sortedCatKeys(cats);

    /* Per-category interpretations */
    var det = mk('div', 'result-detail');
    keys.forEach(function (k) {
      if (cats[k].percent > 0) {
        var s = mk('div', 'detail-section');
        var level = cats[k].percent >= 60 ? 'a notable symptom burden' : cats[k].percent >= 30 ? 'moderate involvement' : 'mild indicators';
        s.innerHTML = '<h4>' + fmtCat(k) + ' (' + cats[k].percent + '%)</h4>' +
          '<p>Your responses in this category suggest ' + level + ' that warrants professional evaluation.</p>';
        det.appendChild(s);
      }
    });
    $res.appendChild(det);

    /* Pattern sections */
    var pats = [
      ['Co-infection Pattern', 'Analysis of symptoms commonly associated with Lyme co-infections such as Babesia, Bartonella, and Ehrlichia.'],
      ['Post-COVID Pattern', 'Several symptoms you reported overlap with post-COVID presentations. A differential evaluation can help distinguish these conditions.'],
      ['Neural Network Assessment', 'Your neurological symptom profile has been noted. Cognitive, sensory, and autonomic markers are evaluated together.'],
      ['Autonomic Function', 'Autonomic dysregulation markers including temperature regulation, heart rate variability, and digestive patterns.']
    ];
    pats.forEach(function (p) {
      $res.appendChild(mk('div', 'pattern-section', '<h4>' + p[0] + '</h4><p>' + p[1] + '</p>'));
    });

    /* CTAs */
    var ctas = mk('div', 'result-ctas');
    ctas.innerHTML = '<a href="' + cp.ctaUrl + '" class="btn btn--warm btn--lg">' + cp.ctaText + '</a>' +
      '<a href="/pages/knowledge/what-is-lyme-disease.html" class="btn btn--outline">Learn more about our approach</a>';
    $res.appendChild(ctas);

    setTimeout(function () { if (window.scrollY < 200) window.location.href = '/pages/quiz-thank-you/'; }, 2000);
  }

  /* ---- RESUME PROMPT ---- */
  function showResume() {
    var b = mk('div', 'resume-prompt');
    b.innerHTML = '<p>Welcome back! You left off on step ' + (QE.state.currentStep+1) + '.</p>' +
      '<button class="btn btn--warm btn-resume">Continue where you left off</button>' +
      '<button class="btn btn--outline btn-restart">Start over</button>';
    $box.insertBefore(b, $box.firstChild);
    b.querySelector('.btn-resume').addEventListener('click', function () { b.remove(); renderStep(QE.state.currentStep); });
    b.querySelector('.btn-restart').addEventListener('click', function () { QE.erase(); QE.init(); b.remove(); renderStep(0); });
  }

  /* ---- INIT ---- */
  document.addEventListener('DOMContentLoaded', function () {
    if (!$box || !$step) return;
    QE.init();
    if (QE.state.currentStep > 0) showResume();
    else renderStep(0);
  });
})();
