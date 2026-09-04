const STORAGE_KEY = "hanja-constellation-web.v1";

const GAME_TYPES = [
  { id: "predict", title: "Predict the Compound", icon: "✦" },
  { id: "meaning", title: "Meaning Match", icon: "⇄" },
  { id: "builder", title: "Word Builder", icon: "字" },
  { id: "detective", title: "Hanja Detective", icon: "⌕" },
  { id: "speed", title: "Speed Round", icon: "ϟ" },
];

const app = document.querySelector("#app");

const state = {
  lessons: [],
  glosses: {},
  view: "home",
  lesson: null,
  step: 0,
  hearts: 3,
  correctAnswers: 0,
  selected: null,
  submitted: false,
  builder: [],
  usedTiles: new Set(),
  seconds: 15,
  timer: null,
  progress: loadProgress(),
};

init();

async function init() {
  try {
    const [lessonResponse, glossResponse] = await Promise.all([
      fetch("./data/lessons.json"),
      fetch("./data/hanja-glosses.json"),
    ]);
    if (!lessonResponse.ok) throw new Error(`Lesson data returned ${lessonResponse.status}`);
    if (!glossResponse.ok) throw new Error(`Hanja glosses returned ${glossResponse.status}`);
    state.lessons = await lessonResponse.json();
    state.glosses = await glossResponse.json();
    render();
    registerServiceWorker();
  } catch (error) {
    console.error(error);
    app.innerHTML = `
      <section class="error-card">
        <h1>Couldn't load the constellation</h1>
        <p>Please refresh while connected to the internet.</p>
        <button class="primary-button" data-action="reload">Try again</button>
      </section>
    `;
  }
}

function loadProgress() {
  const empty = { completed: [], xp: 0, streak: 0, lastPracticeDate: null };
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return empty;
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function render() {
  clearTimer();
  if (state.view === "home") renderHome();
  if (state.view === "intro") renderIntro();
  if (state.view === "game") renderGame();
  if (state.view === "complete") renderComplete();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHome() {
  const completed = new Set(state.progress.completed);
  app.innerHTML = `
    <header class="topbar">
      <div>
        <p class="eyebrow">HANJA CONSTELLATION</p>
        <h1>오늘의 한자</h1>
      </div>
      <div class="star" aria-hidden="true">星</div>
    </header>

    <section class="stats" aria-label="Practice statistics">
      ${stat("🔥", state.progress.streak, "day streak")}
      ${stat("✨", state.progress.xp, "total XP")}
      ${stat("✓", `${completed.size}/${state.lessons.length}`, "mastered")}
    </section>

    <section>
      <h2 class="section-heading">Your path</h2>
      <div class="lesson-path">
        ${state.lessons.map((lesson) => lessonCard(lesson, completed)).join("")}
      </div>
    </section>

    <footer class="site-footer">
      Progress stays in this browser and is never uploaded.
      Character sequence adapted from
      <a href="https://www.howtostudykorean.com/hanja-unit-1-lessons-1-20/" target="_blank" rel="noreferrer">HowToStudyKorean's Hanja Unit 1</a>;
      lesson sentences and game content are original.
    </footer>
  `;
}

function stat(icon, value, label) {
  return `
    <div class="stat">
      <span class="stat-icon" aria-hidden="true">${icon}</span>
      <strong>${escapeHtml(String(value))}</strong>
      <small>${escapeHtml(label)}</small>
    </div>
  `;
}

function lessonCard(lesson, completed) {
  const isComplete = completed.has(lesson.id);
  return `
    <button
      class="lesson-card ${isComplete ? "complete" : ""}"
      data-lesson="${lesson.id}"
      aria-label="Day ${lesson.id}: ${escapeHtml(lesson.koreanName)}${isComplete ? ", completed" : ""}"
    >
      <span class="hanja-orb">${escapeHtml(lesson.character)}</span>
      <span class="lesson-copy">
        <span class="lesson-day">DAY ${lesson.id}</span>
        <span class="lesson-name">${escapeHtml(lesson.koreanName)}</span>
        <span class="lesson-meaning">${escapeHtml(lesson.coreMeaning)}</span>
      </span>
      <span class="lesson-status" aria-hidden="true">${isComplete ? "✓" : "›"}</span>
    </button>
  `;
}

function renderIntro() {
  const lesson = state.lesson;
  app.innerHTML = `
    <section class="intro">
      <div class="lesson-topbar">
        <button class="back-button" data-action="home" aria-label="Back to lesson path">←</button>
        <div>
          <p class="eyebrow">DAY ${lesson.id}</p>
        </div>
      </div>

      <div class="hero-orb">${escapeHtml(lesson.character)}</div>
      <h1>${escapeHtml(lesson.koreanName)}</h1>
      <p class="core-meaning">${escapeHtml(lesson.coreMeaning)}</p>
      <p class="mnemonic">${escapeHtml(lesson.mnemonic)}</p>

      <div class="word-list">
        ${lesson.words.map((word) => `
          <article class="word-card">
            <div class="word-heading">
              <strong>${escapeHtml(word.term)}</strong>
              <span class="word-hanja">${escapeHtml(word.hanja)}</span>
            </div>
            <span class="word-meaning">${escapeHtml(word.meaning)}</span>
            <div class="word-breakdown" aria-label="${escapeHtml(`${word.term} character breakdown`)}">
              ${renderBreakdown(word.hanja)}
            </div>
          </article>
        `).join("")}
      </div>

      <button class="primary-button" data-action="start">Start lesson</button>
    </section>
  `;
}

function renderGame() {
  const game = GAME_TYPES[state.step];
  const progress = ((state.step + 1) / GAME_TYPES.length) * 100;
  const content = renderExercise(game.id);
  const showFooter = game.id !== "speed" || state.submitted;

  app.innerHTML = `
    <section class="game-shell">
      <header class="lesson-topbar">
        <button class="close-button" data-action="intro" aria-label="Leave lesson">×</button>
        <div class="progress-track" aria-label="Lesson progress">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
        <span class="hearts" aria-label="${state.hearts} hearts">♥ ${state.hearts}</span>
      </header>

      <div class="game-main">
        <div class="game-heading">
          <span class="game-icon" aria-hidden="true">${game.icon}</span>
          <span class="game-label">${game.title.toUpperCase()}</span>
          <h2>${exercisePrompt(game.id)}</h2>
        </div>
        ${content}
      </div>

      ${showFooter ? renderGameFooter() : ""}
    </section>
  `;

  if (game.id === "speed" && !state.submitted) startTimer();
}

function renderExercise(type) {
  const word = currentWord();
  if (type === "predict") {
    return `
      <div class="predict-card">
        <strong class="predict-term">${escapeHtml(word.term)}</strong>
        <div class="word-breakdown predict-breakdown">
          ${renderBreakdown(word.hanja)}
        </div>
      </div>
      ${choices(stableOptions(word.meaning, state.lesson.words.map((item) => item.meaning)), word.meaning)}
    `;
  }

  if (type === "meaning") {
    return choices(stableOptions(word.meaning, state.lesson.words.map((item) => item.meaning)), word.meaning);
  }

  if (type === "builder") {
    const characters = [...word.hanja].sort().reverse();
    return `
      <div class="builder-answer">${state.builder.length ? escapeHtml(state.builder.join("")) : "· · ·"}</div>
      <div class="builder-tiles">
        ${characters.map((character, index) => `
          <button class="tile" data-tile="${index}" ${state.usedTiles.has(index) ? "disabled" : ""}>
            ${escapeHtml(character)}
          </button>
        `).join("")}
      </div>
      ${state.builder.length && !state.submitted ? '<button class="clear-button" data-action="clear-builder">Clear</button>' : ""}
    `;
  }

  if (type === "detective") {
    return `
      <div class="constellation-card">
        ${state.lesson.words.slice(0, 4).map((item) => `
          <div class="constellation-word">
            <strong>${escapeHtml(item.term)}</strong>
            <span>${escapeHtml(item.hanja)}</span>
          </div>
        `).join("")}
      </div>
      ${choices(detectiveOptions(), state.lesson.coreMeaning)}
    `;
  }

  const wordForSpeed = speedWord();
  return `
    <div class="speed-time ${state.seconds <= 5 ? "urgent" : ""}">${state.seconds}</div>
    <div class="speed-word">
      <strong>${escapeHtml(wordForSpeed.term)}</strong>
      <span>${escapeHtml(wordForSpeed.hanja)}</span>
    </div>
    <div class="speed-actions">
      <button class="primary-button coral" data-speed="No">No</button>
      <button class="primary-button" data-speed="Yes">Yes</button>
    </div>
  `;
}

function exercisePrompt(type) {
  const word = currentWord();
  if (type === "predict") return "What does this compound probably mean?";
  if (type === "meaning") return `What does ${word.term} (${word.hanja}) mean?`;
  if (type === "builder") return `Build the Hanja for ${word.term}.`;
  if (type === "detective") return "What idea connects these words?";
  return `Does this word contain today's Hanja, ${state.lesson.character}?`;
}

function choices(options, correct) {
  return `
    <div class="choices">
      ${options.map((option) => `
        <button
          class="choice ${choiceClass(option, correct)}"
          data-choice="${encodeURIComponent(option)}"
          ${state.submitted ? "disabled" : ""}
        >${escapeHtml(option)}</button>
      `).join("")}
    </div>
  `;
}

function choiceClass(option, correct) {
  if (!state.submitted) return state.selected === option ? "selected" : "";
  if (option === correct) return "correct";
  if (option === state.selected) return "incorrect";
  return "";
}

function renderGameFooter() {
  const hasAnswer = answerValue() !== null && answerValue() !== "";
  const correct = state.submitted && answerIsCorrect();
  const last = state.step === GAME_TYPES.length - 1;
  return `
    <footer class="game-footer">
      ${state.submitted ? `
        <div class="feedback ${correct ? "good" : "bad"}">
          <span aria-hidden="true">${correct ? "✓" : "×"}</span>
          <span>${correct ? "Nice connection!" : `Answer: ${escapeHtml(correctAnswer())}`}</span>
        </div>
      ` : ""}
      <button class="primary-button ${state.submitted && !correct ? "coral" : ""}" data-action="${state.submitted ? "continue" : "check"}" ${hasAnswer || state.submitted ? "" : "disabled"}>
        ${state.submitted ? (last ? "Finish" : "Continue") : "Check"}
      </button>
    </footer>
  `;
}

function renderComplete() {
  const earnedXP = state.correctAnswers * 10 + state.hearts * 2;
  app.innerHTML = `
    <section class="complete-screen">
      <div class="hero-orb">${escapeHtml(state.lesson.character)}</div>
      <h1>Constellation complete!</h1>
      <p class="xp-earned">+${earnedXP} XP</p>
      <p class="complete-copy">You connected ${escapeHtml(state.lesson.character)} with ${state.lesson.words.length} Korean words.</p>
      <button class="primary-button" data-action="home">Back to path</button>
    </section>
  `;
}

function currentWord() {
  return state.lesson.words[state.step % state.lesson.words.length];
}

function speedWord() {
  if (state.lesson.id % 2 !== 0) return currentWord();
  const nextLesson = state.lessons[state.lesson.id % state.lessons.length];
  return nextLesson.words[0];
}

function correctAnswer() {
  const type = GAME_TYPES[state.step].id;
  if (type === "predict") return currentWord().meaning;
  if (type === "meaning") return currentWord().meaning;
  if (type === "builder") return currentWord().hanja;
  if (type === "detective") return state.lesson.coreMeaning;
  return speedWord().hanja.includes(state.lesson.character) ? "Yes" : "No";
}

function answerValue() {
  return GAME_TYPES[state.step].id === "builder" ? state.builder.join("") : state.selected;
}

function answerIsCorrect() {
  return answerValue() === correctAnswer();
}

function stableOptions(correct, pool) {
  return [...new Set([correct, ...pool.filter((item) => item !== correct).slice(0, 3)])].sort((a, b) => a.localeCompare(b));
}

function renderBreakdown(hanja) {
  return [...hanja].map((character) => `
    <span class="breakdown-part">
      <span class="breakdown-character">${escapeHtml(character)}</span>
      <span class="breakdown-gloss">${escapeHtml(state.glosses[character])}</span>
    </span>
  `).join('<span class="breakdown-plus" aria-hidden="true">+</span>');
}

function detectiveOptions() {
  const alternatives = state.lessons
    .filter((lesson) => lesson.id !== state.lesson.id)
    .slice(0, 3)
    .map((lesson) => lesson.coreMeaning);
  return stableOptions(state.lesson.coreMeaning, alternatives);
}

function beginLesson() {
  state.step = 0;
  state.hearts = 3;
  state.correctAnswers = 0;
  resetAnswer();
  state.view = "game";
  render();
}

function submitAnswer() {
  if (answerValue() === null || answerValue() === "") return;
  state.submitted = true;
  recordResult(answerIsCorrect());
  render();
}

function submitSpeed(answer) {
  if (state.submitted) return;
  state.selected = answer;
  state.submitted = true;
  recordResult(answerIsCorrect());
  render();
}

function recordResult(correct) {
  if (correct) state.correctAnswers += 1;
  else state.hearts = Math.max(0, state.hearts - 1);
}

function advance() {
  if (state.step === GAME_TYPES.length - 1) {
    completeLesson();
    return;
  }
  state.step += 1;
  resetAnswer();
  render();
}

function completeLesson() {
  const firstCompletion = !state.progress.completed.includes(state.lesson.id);
  if (firstCompletion) state.progress.completed.push(state.lesson.id);
  const earnedXP = state.correctAnswers * 10 + state.hearts * 2;
  state.progress.xp += firstCompletion ? earnedXP : Math.max(5, Math.floor(earnedXP / 4));
  updateStreak();
  saveProgress();
  state.view = "complete";
  render();
}

function updateStreak() {
  const today = localDateString(new Date());
  if (!state.progress.lastPracticeDate) {
    state.progress.streak = 1;
  } else if (state.progress.lastPracticeDate !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    state.progress.streak =
      state.progress.lastPracticeDate === localDateString(yesterday)
        ? state.progress.streak + 1
        : 1;
  }
  state.progress.lastPracticeDate = today;
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resetAnswer() {
  clearTimer();
  state.selected = null;
  state.submitted = false;
  state.builder = [];
  state.usedTiles = new Set();
  state.seconds = 15;
}

function startTimer() {
  clearTimer();
  state.timer = window.setInterval(() => {
    state.seconds -= 1;
    if (state.seconds <= 0) {
      state.selected = "Timed out";
      state.submitted = true;
      recordResult(false);
      render();
      return;
    }
    const timerElement = document.querySelector(".speed-time");
    if (timerElement) {
      timerElement.textContent = state.seconds;
      timerElement.classList.toggle("urgent", state.seconds <= 5);
    }
  }, 1000);
}

function clearTimer() {
  if (state.timer !== null) {
    window.clearInterval(state.timer);
    state.timer = null;
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Offline mode could not be enabled.", error);
    });
  }
}

app.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;

  if (target.dataset.lesson) {
    state.lesson = state.lessons.find((lesson) => lesson.id === Number(target.dataset.lesson));
    state.view = "intro";
    render();
    return;
  }

  if (target.dataset.choice) {
    state.selected = decodeURIComponent(target.dataset.choice);
    render();
    return;
  }

  if (target.dataset.tile !== undefined) {
    const index = Number(target.dataset.tile);
    if (state.usedTiles.has(index)) return;
    const characters = [...currentWord().hanja].sort().reverse();
    state.usedTiles.add(index);
    state.builder.push(characters[index]);
    render();
    return;
  }

  if (target.dataset.speed) {
    submitSpeed(target.dataset.speed);
    return;
  }

  const action = target.dataset.action;
  if (action === "home") {
    state.view = "home";
    render();
  } else if (action === "intro") {
    state.view = "intro";
    render();
  } else if (action === "start") {
    beginLesson();
  } else if (action === "check") {
    submitAnswer();
  } else if (action === "continue") {
    advance();
  } else if (action === "clear-builder") {
    state.builder = [];
    state.usedTiles = new Set();
    render();
  } else if (action === "reload") {
    window.location.reload();
  }
});
