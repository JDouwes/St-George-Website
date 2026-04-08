/**
 * Lyme Treatment Germany — Symptom Assessment Quiz Engine
 * Pure vanilla JS. No UI code. Exports window.QuizEngine.
 * Handles: question data, scoring, state, localStorage persistence.
 */
(function () {
  'use strict';

  var STORAGE_PREFIX = 'ltg_quiz_';
  var TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Severity multiplier lookup (1=mild .. 4=very severe)
  var SEV = { 1: 1.0, 2: 1.15, 3: 1.3, 4: 1.45 };
  // Duration modifier lookup (e5 answer)
  var DUR = { '<1mo': 0.8, '1-6mo': 1.0, '6mo-2yr': 1.2, '>2yr': 1.4, unsure: 1.1 };
  // Radio option shorthand
  function o(value, points) { return { value: value, points: points }; }

  /* ================================================================== */
  /*  STEP & QUESTION DATA — 11 steps, 65 questions                     */
  /* ================================================================== */
  var STEPS = [
    // Step 1: Exposure History
    { id: 'exposure', title: 'Exposure History', heading: "Let's start with your background",
      descriptor: 'These questions help us understand your exposure history and any previous encounters with tick-borne illness.',
      icon: 'exposure', category: 'tickExposure', weight: 1.5,
      type: 'mixed', skippable: false, hasSeverity: false,
      questions: [
        { id:'e1', text:'Known tick bite (confirmed attachment)', type:'radio',
          options:[o('confirmed',4),o('possible',2),o('none',0),o('unsure',0)] },
        { id:'e2', text:'Regular time in wooded/rural areas', type:'radio',
          options:[o('frequently',2),o('occasionally',1),o('rarely',0)] },
        { id:'e3', text:'Prior Lyme diagnosis by physician', type:'radio',
          options:[o('yes',3),o('no',0),o('unclear',1)] },
        { id:'e4', text:'Prior positive Lyme test', type:'radio',
          options:[o('positive',3),o('negative',0.5),o('not_tested',0.5),o('unsure',0.5)] },
        { id:'e5', text:'How long have main symptoms been present?', type:'radio', isDuration:true,
          options:[o('<1mo',0),o('1-6mo',0),o('6mo-2yr',0),o('>2yr',0),o('unsure',0)] }
      ] },
    // Step 2: Constitutional (severity-enabled)
    { id: 'constitutional', title: 'Constitutional Symptoms', heading: 'General health patterns',
      descriptor: 'These questions address systemic symptoms that often accompany tick-borne illness.',
      icon: 'constitutional', category: 'constitutional', weight: 1.0,
      type: 'checkbox', skippable: false, hasSeverity: true,
      questions: [
        { id:'c1', text:'Persistent fatigue not relieved by rest', points:2 },
        { id:'c2', text:'Low-grade fevers, chills, flu-like episodes', points:2 },
        { id:'c3', text:'Night sweats', points:2 },
        { id:'c4', text:'Waxing/waning symptom pattern', points:3 },
        { id:'c5', text:'Symptoms worsen after activity', points:2 },
        { id:'c6', text:'Unexplained weight changes', points:1 }
      ] },
    // Step 3: Musculoskeletal (severity-enabled)
    { id: 'musculoskeletal', title: 'Musculoskeletal', heading: 'Joint and muscle symptoms',
      descriptor: 'Musculoskeletal involvement is one of the hallmarks of Lyme disease.',
      icon: 'musculoskeletal', category: 'musculoskeletal', weight: 1.0,
      type: 'checkbox', skippable: false, hasSeverity: true,
      questions: [
        { id:'m1', text:'Migratory joint pain', points:4 },
        { id:'m2', text:'Joint swelling, especially knees', points:3 },
        { id:'m3', text:'Widespread muscle aches', points:3 },
        { id:'m4', text:'Persistent neck stiffness', points:3 },
        { id:'m5', text:'Back pain without structural cause', points:2 },
        { id:'m6', text:'Tendon pain that comes and goes', points:2 }
      ] },
    // Step 4: Neurological (severity-enabled)
    { id: 'neurological', title: 'Neurological', heading: 'Neurological symptoms',
      descriptor: 'Neurological involvement can indicate central or peripheral nervous system effects.',
      icon: 'neurological', category: 'neurological', weight: 1.2,
      type: 'checkbox', skippable: false, hasSeverity: true,
      questions: [
        { id:'n1', text:'Brain fog, difficulty thinking clearly', points:3 },
        { id:'n2', text:'Memory problems, forgetting words', points:3 },
        { id:'n3', text:'Tingling, numbness, burning (hands/feet/face)', points:3 },
        { id:'n4', text:'Persistent headaches', points:2 },
        { id:'n5', text:'Dizziness, vertigo, balance problems', points:2 },
        { id:'n6', text:'Light or sound sensitivity', points:2 },
        { id:'n7', text:"Bell's palsy or facial weakness", points:4 },
        { id:'n8', text:'Word-finding or speech difficulty', points:2 }
      ] },
    // Step 5: Cardiovascular + Skin (override flags: cardiac, em_rash_current)
    { id: 'cardiovascular_skin', title: 'Cardiovascular & Skin', heading: 'Heart and skin signs',
      descriptor: 'These symptoms may indicate cardiac involvement or characteristic skin manifestations.',
      icon: 'cardio', category: 'cardiovascularSkin', weight: 1.1,
      type: 'mixed', skippable: false, hasSeverity: false,
      questions: [
        { id:'cv1', text:'Heart palpitations', points:3, cardiacFlag:true },
        { id:'cv2', text:'Chest pressure or tightness', points:3, cardiacFlag:true },
        { id:'cv3', text:'Fainting or near-fainting', points:3, cardiacFlag:true },
        { id:'cv4', text:'Shortness of breath with minimal exertion', points:2 },
        { id:'sk1', text:'Expanding rash (erythema migrans)', type:'radio', emFlag:true,
          options:[o('current',5),o('past',4),o('none',0)] },
        { id:'sk2', text:'Unexplained fevers that come and go', points:2 },
        { id:'sk3', text:'Waxing/waning pattern of symptoms', points:2 }
      ] },
    // Step 6: Psychiatric (skippable, crisis flag on p7)
    { id: 'psychiatric', title: 'Psychiatric', heading: 'Mood and cognitive changes',
      descriptor: 'Neuropsychiatric symptoms can be a feature of tick-borne illness. This section is optional.',
      icon: 'psychiatric', category: 'psychiatric', weight: 1.0,
      type: 'mixed', skippable: true, hasSeverity: false,
      questions: [
        { id:'p1', text:'Persistent low mood, hopelessness', points:2 },
        { id:'p2', text:'New or worsened anxiety, panic attacks', points:2 },
        { id:'p3', text:'Abrupt mood swings', points:3 },
        { id:'p4', text:'Sudden disproportionate irritability', points:3 },
        { id:'p5', text:'Feeling detached from yourself', points:2 },
        { id:'p6', text:'Personality change noted by self/others', points:2 },
        { id:'p7', text:'Thoughts of self-harm', type:'radio', crisisFlag:true, points:0,
          options:[o('no',0),o('some',0),o('now',0)] }
      ] },
    // Step 7: Co-infections (separate track)
    { id: 'coinfections', title: 'Co-infections', heading: 'Co-infection indicators',
      descriptor: 'Tick bites can transmit multiple organisms. These questions screen for common co-infections.',
      icon: 'coinfections', category: 'coinfection', weight: 1.0,
      type: 'checkbox', skippable: false, hasSeverity: false,
      questions: [
        { id:'co1', text:'Skin streaks or linear rashes', points:3 },
        { id:'co2', text:'Swollen/tender lymph nodes', points:2 },
        { id:'co3', text:'Burning pain in soles of feet at night', points:3 },
        { id:'co4', text:'Stretch mark-like skin lesions', points:3 },
        { id:'co5', text:'Air hunger episodes', points:4 },
        { id:'co6', text:'High spiking fevers/chills', points:3 },
        { id:'co7', text:'Ice-pick headaches', points:2 },
        { id:'co8', text:'Sweating episodes soaking clothing', points:3 }
      ] },
    // Step 8: Post-COVID / PASC (separate track)
    { id: 'postcovid', title: 'Post-COVID / PASC', heading: 'Post-viral symptoms',
      descriptor: 'Post-COVID and Lyme disease share overlapping mechanisms. This helps differentiate.',
      icon: 'postcovid', category: 'postcovid', weight: 1.0,
      type: 'checkbox', skippable: false, hasSeverity: false,
      questions: [
        { id:'pc1', text:'Symptoms began/worsened after viral illness', points:3 },
        { id:'pc2', text:'Persistent fatigue 12+ weeks after illness', points:3 },
        { id:'pc3', text:'Post-exertional malaise', points:3 },
        { id:'pc4', text:'Persistent breathlessness without heart/lung disease', points:2 },
        { id:'pc5', text:'Loss/distortion of smell or taste', points:2 },
        { id:'pc6', text:'Cognitive dysfunction after viral illness', points:3 },
        { id:'pc7', text:'Microclot symptoms (unusual bruising, clotting)', points:2 }
      ] },
    // Step 9: Functional Neural Networks (separate track)
    { id: 'fnn', title: 'Functional Neural Networks', heading: 'Brain network patterns',
      descriptor: 'These questions assess how well three major brain networks are functioning.',
      icon: 'fnn', category: 'fnn', weight: 1.1,
      type: 'checkbox', skippable: false, hasSeverity: false,
      questions: [
        { id:'fn1', text:"Racing thoughts, can't quiet mind at rest", points:2 },
        { id:'fn2', text:'Excessive rumination/replay of events', points:2 },
        { id:'fn3', text:'Mental inertia transitioning from rest to task', points:2 },
        { id:'fn4', text:'Sensory overload (sounds, lights, crowds)', points:3 },
        { id:'fn5', text:'Disproportionate emotional responses', points:2 },
        { id:'fn6', text:'Chronic hypervigilance without cause', points:3 },
        { id:'fn7', text:'Difficulty holding info while doing tasks', points:3 }
      ] },
    // Step 10: Autonomic Dysregulation (separate track)
    { id: 'autonomic', title: 'Autonomic Dysregulation', heading: 'Autonomic nervous system',
      descriptor: 'Dysautonomia is common in chronic Lyme and can include POTS-like symptoms.',
      icon: 'autonomic', category: 'autonomic', weight: 1.0,
      type: 'checkbox', skippable: false, hasSeverity: false,
      questions: [
        { id:'ad1', text:'Dizziness/racing heart on standing', points:4 },
        { id:'ad2', text:'Must sit/lie down after standing briefly', points:4 },
        { id:'ad3', text:"Can't tolerate warm environments", points:3 },
        { id:'ad4', text:'Extreme temperature sensitivity', points:2 },
        { id:'ad5', text:'Nausea/bloating not explained by GI disease', points:2 },
        { id:'ad6', text:'Excessive or absent sweating', points:2 }
      ] },
    // Step 11: Context (unscored)
    { id: 'context', title: 'Context', heading: 'Additional context',
      descriptor: 'These final questions help us tailor your results.',
      icon: 'context', category: null, weight: 0,
      type: 'context', skippable: false, hasSeverity: false,
      questions: [
        { id:'ctx1', text:'Seen a doctor about these symptoms?', type:'radio',
          options:[o('yes',0),o('no',0)] },
        { id:'ctx2', text:'Lyme test results', type:'radio',
          options:[o('positive',0),o('negative',0),o('inconclusive',0),o('not_tested',0),o('multiple_varying',0)] },
        { id:'ctx3', text:'Antibiotic treatment for Lyme?', type:'radio',
          options:[o('yes_improved',0),o('yes_returned',0),o('yes_no_improvement',0),o('no',0)] },
        { id:'ctx4', text:'Current symptom trajectory', type:'radio',
          options:[o('getting_better',0),o('stable',0),o('worsening',0),o('fluctuating',0)] },
        { id:'ctx5', text:'Primary hope from assessment', type:'radio',
          options:[o('understand',0),o('seek_evaluation',0),o('treatment_options',0),o('why_not_improving',0)] },
        { id:'hasLabUpload', text:'Lab upload attached', type:'boolean' }
      ] }
  ];

  /* ================================================================== */
  /*  STATE                                                              */
  /* ================================================================== */
  function freshState() {
    return {
      currentStep: 0, totalSteps: STEPS.length, completed: false,
      answers: {}, severity: {}, scores: {},
      totalWeightedScore: 0, totalMaxPossible: 0,
      resultBucket: null, overrideFlags: [],
      email: '', firstName: '',
      consentGiven: false, consentTimestamp: null,
      sessionId: uid(), startedAt: new Date().toISOString()
    };
  }
  var state = freshState();

  /* ================================================================== */
  /*  SCORING ENGINE                                                     */
  /* ================================================================== */
  // Lyme-track = steps 0-5 (exposure through psychiatric). Steps 6-9 = separate tracks.
  var LYME_IDX = [0,1,2,3,4,5];
  var TRACKS = { coinfection_pct:6, postcovid_pct:7, fnn_pct:8, autonomic_pct:9 };

  /** Max possible raw score for a step (ignores duration-modifier question). */
  function stepMaxRaw(step) {
    var t = 0;
    step.questions.forEach(function (q) {
      if (q.isDuration) return;
      if (q.options) {
        var mx = 0;
        q.options.forEach(function (op) { if (op.points > mx) mx = op.points; });
        t += mx;
      } else { t += (q.points || 0); }
    });
    return t;
  }

  /** Score one question from stored answer. */
  function scoreQ(q, ans) {
    if (ans === undefined || ans === null) return 0;
    if (q.options) {
      for (var i = 0; i < q.options.length; i++)
        if (q.options[i].value === ans) return q.options[i].points;
      return 0;
    }
    return ans === true ? (q.points || 0) : 0;
  }

  /** Detect clinical override flags from current answers. */
  function detectOverrides() {
    var flags = [], a = state.answers;
    // Cardiac: any 2 of cv1/cv2/cv3
    var cc = (a.cv1===true?1:0)+(a.cv2===true?1:0)+(a.cv3===true?1:0);
    if (cc >= 2) flags.push('cardiac');
    // EM rash current
    if (a.sk1 === 'current') flags.push('em_rash_current');
    // Crisis
    if (a.p7 === 'now') flags.push('crisis');
    return flags;
  }

  /** Map total weighted Lyme-track score to a result bucket. */
  function bucket(score) {
    if (score <= 8)  return 'low';
    if (score <= 20) return 'moderate';
    if (score <= 40) return 'significant';
    if (score <= 65) return 'high';
    return 'extensive';
  }

  /** Main scoring — populates state.scores, totals, bucket, overrides. */
  function calculateScores() {
    var scores = {}, totalW = 0, totalM = 0;
    var durMod = DUR[state.answers.e5] || 1.0;

    STEPS.forEach(function (step, idx) {
      if (!step.category) return; // skip unscored context step
      var raw = 0;
      step.questions.forEach(function (q) {
        if (!q.isDuration) raw += scoreQ(q, state.answers[q.id]);
      });
      var maxRaw = stepMaxRaw(step);
      var sm = step.hasSeverity ? (SEV[state.severity[idx]] || 1.0) : 1.0;
      var w = raw * step.weight * sm;
      var wm = maxRaw * step.weight * sm;
      if (idx === 0) { w *= durMod; wm *= durMod; } // duration modifier on exposure only
      scores[step.category] = {
        raw: raw,
        weighted: Math.round(w * 100) / 100,
        max: maxRaw,
        percent: maxRaw > 0 ? Math.round((raw / maxRaw) * 100) : 0
      };
      if (LYME_IDX.indexOf(idx) !== -1) { totalW += w; totalM += wm; }
    });

    state.scores = scores;
    state.totalWeightedScore = Math.round(totalW * 100) / 100;
    state.totalMaxPossible = Math.round(totalM * 100) / 100;
    state.overrideFlags = detectOverrides();
    state.resultBucket = bucket(totalW);
    return scores;
  }

  /** Return structured category scores for UI display. */
  function getCategoryScores() {
    var out = { lyme: {}, tracks: {} };
    LYME_IDX.forEach(function (i) {
      var c = STEPS[i].category;
      if (state.scores[c]) out.lyme[c] = state.scores[c];
    });
    Object.keys(TRACKS).forEach(function (k) {
      var c = STEPS[TRACKS[k]].category;
      out.tracks[k] = state.scores[c] || { raw:0, weighted:0, max:0, percent:0 };
    });
    out.totalWeightedScore = state.totalWeightedScore;
    out.totalMaxPossible = state.totalMaxPossible;
    out.resultBucket = state.resultBucket;
    return out;
  }

  /* ================================================================== */
  /*  STATE MUTATIONS                                                    */
  /* ================================================================== */
  function setAnswer(questionId, value) { state.answers[questionId] = value; }
  function setSeverity(stepIndex, value) { state.severity[stepIndex] = clamp(value, 1, 4); }
  function getProgressPercent() {
    return state.totalSteps ? Math.round((state.currentStep / state.totalSteps) * 100) : 0;
  }

  /* ================================================================== */
  /*  LOCALSTORAGE PERSISTENCE                                           */
  /* ================================================================== */
  function save() {
    try {
      var payload = {
        answers: state.answers, severity: state.severity,
        currentStep: state.currentStep, sessionId: state.sessionId,
        startedAt: state.startedAt, savedAt: Date.now()
      };
      localStorage.setItem(STORAGE_PREFIX + 'state', JSON.stringify(payload));
    } catch (e) { /* quota exceeded or private mode */ }
  }

  function restore() {
    try {
      var raw = localStorage.getItem(STORAGE_PREFIX + 'state');
      if (!raw) return false;
      var d = JSON.parse(raw);
      if (d.savedAt && (Date.now() - d.savedAt) > TTL_MS) { erase(); return false; }
      state.answers = d.answers || {};
      state.severity = d.severity || {};
      state.currentStep = d.currentStep || 0;
      state.sessionId = d.sessionId || uid();
      state.startedAt = d.startedAt || new Date().toISOString();
      return true;
    } catch (e) { return false; }
  }

  function erase() {
    try { localStorage.removeItem(STORAGE_PREFIX + 'state'); } catch (e) { /* noop */ }
    var sid = state.sessionId;
    Object.assign(state, freshState());
    state.sessionId = sid;
  }

  /* ================================================================== */
  /*  INIT                                                               */
  /* ================================================================== */
  function init() {
    if (!restore()) Object.assign(state, freshState());
    return state;
  }

  /* ================================================================== */
  /*  SUBMIT PAYLOAD (ready for n8n webhook POST)                        */
  /* ================================================================== */
  function getSubmitPayload() {
    calculateScores();
    return {
      sessionId: state.sessionId, startedAt: state.startedAt,
      completedAt: new Date().toISOString(),
      firstName: state.firstName, email: state.email,
      consentGiven: state.consentGiven, consentTimestamp: state.consentTimestamp,
      answers: state.answers, severity: state.severity,
      scores: state.scores,
      totalWeightedScore: state.totalWeightedScore,
      totalMaxPossible: state.totalMaxPossible,
      resultBucket: state.resultBucket, overrideFlags: state.overrideFlags,
      categoryScores: getCategoryScores(),
      context: {
        doctor: state.answers.ctx1 || null,
        testResults: state.answers.ctx2 || null,
        treatment: state.answers.ctx3 || null,
        trajectory: state.answers.ctx4 || null,
        primaryHope: state.answers.ctx5 || null,
        hasLabUpload: state.answers.hasLabUpload || false
      }
    };
  }

  /* ================================================================== */
  /*  PUBLIC API                                                         */
  /* ================================================================== */
  window.QuizEngine = {
    state: state,
    STEPS: STEPS,
    init: init,
    setAnswer: setAnswer,
    setSeverity: setSeverity,
    calculateScores: calculateScores,
    getBucket: function () { return state.resultBucket; },
    getOverrideFlags: function () { return state.overrideFlags; },
    getCategoryScores: getCategoryScores,
    getProgressPercent: getProgressPercent,
    save: save,
    restore: restore,
    erase: erase,
    getSubmitPayload: getSubmitPayload
  };
})();
