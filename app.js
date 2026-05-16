import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  onDisconnect,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyD5WEuVfjGyWAg_i5DiKEoNIrqQmNTVluY",
  authDomain: "hiraganakaruta01.firebaseapp.com",
  databaseURL: "https://hiraganakaruta01-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "hiraganakaruta01",
  storageBucket: "hiraganakaruta01.firebasestorage.app",
  messagingSenderId: "658311576186",
  appId: "1:658311576186:web:ec4133054bba290decd9c3",
  measurementId: "G-5T4H3CTDW0"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const HIRAGANA = [
  "あ", "い", "う", "え", "お",
  "か", "き", "く", "け", "こ",
  "さ", "し", "す", "せ", "そ",
  "た", "ち", "つ", "て", "と",
  "な", "に", "ぬ", "ね", "の",
  "は", "ひ", "ふ", "へ", "ほ",
  "ま", "み", "む", "め", "も",
  "や", "ゆ", "よ",
  "ら", "り", "る", "れ", "ろ",
  "わ", "を", "ん"
];

const els = {
  welcomePanel: document.querySelector("#welcomePanel"),
  gamePanel: document.querySelector("#gamePanel"),
  playerName: document.querySelector("#playerName"),
  roomCodeInput: document.querySelector("#roomCodeInput"),
  createRoomBtn: document.querySelector("#createRoomBtn"),
  joinRoomBtn: document.querySelector("#joinRoomBtn"),
  roomPicker: document.querySelector("#roomPicker"),
  welcomeStatus: document.querySelector("#welcomeStatus"),
  copyRoomBtn: document.querySelector("#copyRoomBtn"),
  repeatBtn: document.querySelector("#repeatBtn"),
  shuffleBtn: document.querySelector("#shuffleBtn"),
  restartBtn: document.querySelector("#restartBtn"),
  leaveBtn: document.querySelector("#leaveBtn"),
  currentCall: document.querySelector("#currentCall"),
  roundMessage: document.querySelector("#roundMessage"),
  opponentCards: document.querySelector("#opponentCards"),
  myCards: document.querySelector("#myCards"),
  myName: document.querySelector("#myName"),
  opponentName: document.querySelector("#opponentName"),
  myScore: document.querySelector("#myScore"),
  opponentScore: document.querySelector("#opponentScore"),
  myPenalty: document.querySelector("#myPenalty"),
  opponentPenalty: document.querySelector("#opponentPenalty"),
  myZoneName: document.querySelector("#myZoneName"),
  opponentZoneName: document.querySelector("#opponentZoneName"),
  sakuraLayer: document.querySelector("#sakuraLayer"),
  cardTemplate: document.querySelector("#cardTemplate"),
  winnerModal: document.querySelector("#winnerModal"),
  winnerTitle: document.querySelector("#winnerTitle"),
  winnerDetails: document.querySelector("#winnerDetails"),
  winnerCloseBtn: document.querySelector("#winnerCloseBtn")
};

let state = {
  roomCode: "",
  playerId: sessionStorage.getItem("karutaPlayerId") || crypto.randomUUID(),
  playerSlot: "",
  room: null,
  unsubscribeRoom: null,
  lastRoundNonce: "",
  lastClaimNonce: "",
  lastFinishedRoomKey: "",
  audioContext: null,
  waitingMelodyTimer: null,
  waitingMelodyStep: 0,
  nextTimer: null
};

sessionStorage.setItem("karutaPlayerId", state.playerId);
els.playerName.value = localStorage.getItem("karutaPlayerName") || "";

els.createRoomBtn.addEventListener("click", createRoom);
els.joinRoomBtn.addEventListener("click", joinRoomFromInput);
els.roomCodeInput.addEventListener("input", () => {
  els.roomCodeInput.value = els.roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});
els.playerName.addEventListener("input", () => {
  localStorage.setItem("karutaPlayerName", getPlayerName());
});
els.copyRoomBtn.addEventListener("click", copyRoomCode);
els.repeatBtn.addEventListener("click", () => speakCurrent(true));
els.shuffleBtn.addEventListener("click", changePositions);
els.restartBtn.addEventListener("click", restartGame);
els.leaveBtn.addEventListener("click", leaveRoom);
els.winnerCloseBtn.addEventListener("click", hideWinnerModal);
async function createRoom() {

  try {

    primeAudio();

    const code = generateRoomCode();

    const room = {
      code,
      createdAt: Date.now(),
      status: "lobby",
      hostSlot: "p1",
      players: {
        p1: {
          id: state.playerId,
          slot: "p1",
          name: getPlayerName(),
          score: 0,
          penalty: 0,
          positionChanged: false,
          connected: true,
          joinedAt: Date.now()
        }
      },
      deck: {},
      round: null,
      winner: null,
      message: "Waiting for player 2..."
    };

    await set(roomRef(code), room);

    await enterRoom(code, "p1");

    setStatus(`Room ${code} created!`);

  }
  catch (error) {

    console.error(error);

    setStatus("Could not create room.");
  }
}

function getPlayerName() {
  return (els.playerName.value || "Karuta player").trim().slice(0, 18);
}

function roomRef(code = state.roomCode) {
  return ref(db, `rooms/${code}`);
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function resetRoomToLobby(room, message) {
  room.status = "lobby";
  room.deck = {};
  room.round = null;
  room.winner = null;
  room.message = message;
  if (room.players?.p1) {
    room.players.p1.score = 0;
    room.players.p1.penalty = 0;
    room.players.p1.positionChanged = false;
  }
  if (room.players?.p2) {
    room.players.p2.score = 0;
    room.players.p2.penalty = 0;
    room.players.p2.positionChanged = false;
  }
  return room;
}

async function legacyCreateRoom() {
  try {
    setStatus("Preparing a fresh tatami room...");
    const code = generateRoomCode();
    const player = makePlayer("p1");
    const room = {
      code,
      createdAt: serverTimestamp(),
      status: "lobby",
      hostSlot: "p1",
      players: { p1: player },
      deck: {},
      round: null,
      message: `Room ${code} created. Join from the second device or tab.`
    };

    await set(roomRef(code), room);
    await enterRoom(code, "p1");
  } catch (error) {
    console.error(error);
    setStatus("Could not create a room. Check the Firebase database rules and connection.");
    playTone("wrong");
  }
}

async function joinRoomFromInput() {

  const code = els.roomCodeInput.value
    .trim()
    .toUpperCase();

  primeAudio();

  if (code.length < 5) {
    setStatus("Invalid room code.");
    return;
  }

  try {

    setStatus("Joining room...");

    const snapshot = await new Promise(resolve => {
      onValue(roomRef(code), data => {
        resolve(data);
      }, { onlyOnce: true });
    });

    const room = snapshot.val();

    if (!room) {
      setStatus("Room not found.");
      playTone("wrong");
      return;
    }

    let slot = "";

    if (!room.players?.p1) {
      slot = "p1";
    }
    else if (!room.players?.p2) {
      slot = "p2";
    }
    else {
      setStatus("Room is full.");
      playTone("wrong");
      return;
    }

    await update(ref(db, `rooms/${code}/players/${slot}`), {
      id: state.playerId,
      name: getPlayerName(),
      connected: true,
      score: 0,
      penalty: 0,
      positionChanged: false,
      joinedAt: Date.now()
    });

    await enterRoom(code, slot);

  }
  catch (error) {

    console.error(error);

    setStatus("Could not join room.");

    playTone("wrong");
  }
}


  try {
    setStatus("Joining room...");
    const duplicateTabPlayerId = crypto.randomUUID();
    let joinedWithNewId = "";
    const result = await runTransaction(roomRef(code), room => {
      if (!room) return; emptyPreparedRoom(code);

      const existingSlot = findSlotByPlayerId(room, state.playerId);
      if (existingSlot) {
        if (existingSlot === "p1" && !room.players?.p2) {
          joinedWithNewId = duplicateTabPlayerId;
          room.players.p2 = makePlayer("p2", duplicateTabPlayerId);
          return resetRoomToLobby(room, "Both players are here. Start the match!");
        }

        room.players[existingSlot].name = getPlayerName();
        room.players[existingSlot].connected = true;
        return room;
      }

      room.players = room.players || {};
      if (!room.players.p1) {
        room.players.p1 = makePlayer("p1");
        return resetRoomToLobby(room, "Player 1 joined. Waiting for player 2.");
      }
      if (!room.players.p2) {
        room.players.p2 = makePlayer("p2");
        return resetRoomToLobby(room, "Both players are here. Start the match!");
      }
      if (room.players.p1.connected === false) {
        room.players.p1 = makePlayer("p1");
        return resetRoomToLobby(room, "Player 1 rejoined. Start the match!");
      }
      if (room.players.p2.connected === false) {
        room.players.p2 = makePlayer("p2");
        return resetRoomToLobby(room, "Player 2 rejoined. Start the match!");
      }
      room.players.p2 = makePlayer("p2");
      return resetRoomToLobby(room, "Player 2 changed. Start the match!");
    });

    if (!result.committed || !result.snapshot.exists()) {
      setStatus(`Room ${code} is already full.`);
      playTone("wrong");
      return;
    }

    const room = result.snapshot.val();
    if (joinedWithNewId) {
      state.playerId = joinedWithNewId;
      sessionStorage.setItem("karutaPlayerId", state.playerId);
    }
    const slot = findSlotByPlayerId(room, state.playerId);
    await enterRoom(code, slot);
  } catch (error) {
    console.error(error);
    setStatus("Could not join. Check the room code, Firebase rules, and connection.");
    playTone("wrong");
  }
}

function makePlayer(slot, playerId = state.playerId) {
  return {
    id: playerId,
    slot,
    name: getPlayerName(),
    score: 0,
    penalty: 0,
    positionChanged: false,
    connected: true,
    joinedAt: Date.now()
  };
}

function findSlotByPlayerId(room, playerId) {
  if (!room || !room.players) return "";
  return Object.keys(room.players).find(slot => room.players[slot]?.id === playerId) || "";
}

async function enterRoom(code, slot) {
  stopWaitingMelody();
  state.roomCode = code;
  state.playerSlot = slot;
  els.copyRoomBtn.textContent = code;
  els.roomCodeInput.value = code;
  window.history.replaceState({}, "", `${window.location.pathname}?room=${code}`);
  els.welcomePanel.classList.add("hidden");
  els.gamePanel.classList.remove("hidden");

  const playerConnectionRef = ref(db, `rooms/${code}/players/${slot}/connected`);
  await update(ref(db, `rooms/${code}/players/${slot}`), {
    id: state.playerId,
    name: getPlayerName(),
    connected: true
  });
  onDisconnect(playerConnectionRef).set(false);

  if (state.unsubscribeRoom) state.unsubscribeRoom();
  state.unsubscribeRoom = onValue(roomRef(code), snapshot => {
    state.room = snapshot.val();
    if (!state.room) {
      leaveRoom(false);
      setStatus("Room closed.");
      return;
    }
    renderRoom();
    reactToRound();
  });
}

async function restartGame() {
if (!state.roomCode || !state.room) return;

const bothPlayers =
state.room.players?.p1 &&
state.room.players?.p2;

if (!bothPlayers) {
await update(roomRef(), {
message: "Waiting for another player before starting."
});
return;
}

const currentPlayers = {
p1: {
...state.room.players.p1,
score: 0,
penalty: 0,
positionChanged: false
},
p2: {
...state.room.players.p2,
score: 0,
penalty: 0,
positionChanged: false
}
};

const deck = buildDeck();
const target = pickRandomActive(deck);

const freshRoom = {
code: state.roomCode,
createdAt: Date.now(),
status: "playing",
hostSlot: "p1",
players: currentPlayers,
deck: deck,
round: makeRound(target),
winner: null,
message: "New match started!"
};

await set(roomRef(), freshRoom);

hideWinnerModal();

playTone("start");
}

async function changePositions() {
  if (!state.roomCode || !state.room?.deck || state.room.status !== "playing") return;
  const me = state.room.players?.[state.playerSlot];
  if (me?.positionChanged) {
    state.room.message = "You already changed positions this game.";
    els.roundMessage.textContent = state.room.message;
    playTone("wrong");
    return;
  }

  primeAudio();
  const updates = {};
  Object.entries(state.room.deck).forEach(([cardId, card]) => {
    if (card.owner !== state.playerSlot) return;
    updates[`deck/${cardId}/order`] = Math.random();
  });
  updates[`players/${state.playerSlot}/positionChanged`] = true;
  updates.message = `${getPlayerName()} changed the card positions.`;
  await update(roomRef(), updates);
  playTone("select");
}

function buildDeck() {
  const shuffled = shuffle(HIRAGANA).slice(0, 30);
  return shuffled.reduce((deck, char, index) => {
    const owner = index % 2 === 0 ? "p1" : "p2";
    deck[`card_${index}_${char}`] = {
      id: `card_${index}_${char}`,
      char,
      owner,
      active: true,
      order: Math.random()
    };
    return deck;
  }, {});
}

function makeRound(target) {
  return {
    target,
    nonce: crypto.randomUUID(),
    startedAt: Date.now(),
    claimedBy: "",
    claimedCardId: "",
    correct: false,
    resolving: false
  };
}

function pickRandomActive(deck) {
  const active = Object.values(deck || {}).filter(card => card.active);
  return active[Math.floor(Math.random() * active.length)]?.char || "";
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function renderRoom() {
  const room = state.room;
  const mySlot = state.playerSlot;
  const opponentSlot = mySlot === "p1" ? "p2" : "p1";
  const me = room.players?.[mySlot] || {};
  const opponent = room.players?.[opponentSlot] || {};

  els.myName.textContent = me.name || "You";
  els.opponentName.textContent = opponent.name || "Waiting...";
  els.myScore.textContent = me.score || 0;
  els.opponentScore.textContent = opponent.score || 0;
  els.myPenalty.textContent = `Penalty ${me.penalty || 0}`;
  els.opponentPenalty.textContent = `Penalty ${opponent.penalty || 0}`;
  els.myZoneName.textContent = `${me.name || "Your"} side`;
  els.opponentZoneName.textContent = `${opponent.name || "Opponent"} side`;
  els.currentCall.textContent = room.round?.target || "?";
  els.roundMessage.textContent = room.message || "";
  els.restartBtn.textContent = room.status === "playing" || room.status === "finished" ? "Restart" : "Start";
  els.shuffleBtn.disabled = room.status !== "playing" || Boolean(me.positionChanged);
  els.shuffleBtn.textContent = me.positionChanged ? "Position Used" : "Change Position";

  renderCards(els.myCards, cardsForOwner(mySlot));
  renderCards(els.opponentCards, cardsForOwner(opponentSlot));

  if (room.status === "lobby") {
    startWaitingMelody();
  } else {
    stopWaitingMelody();
  }

  if (room.status === "finished") {
    showWinnerModal(room);
  } else {
    state.lastFinishedRoomKey = "";
    hideWinnerModal();
  }
}

function cardsForOwner(owner) {
  return Object.values(state.room?.deck || {})
    .filter(card => card.owner === owner)
    .sort((a, b) => a.order - b.order);
}

function renderCards(container, cards) {
  const oldCards = new Map([...container.querySelectorAll(".karuta-card")].map(card => [card.dataset.cardId, card]));
  const wanted = new Set(cards.map(card => card.id));

  oldCards.forEach((node, id) => {
    if (!wanted.has(id)) {
      node.classList.add("removing");
      node.addEventListener("animationend", () => node.remove(), { once: true });
    }
  });

  cards.forEach(card => {
    let node = oldCards.get(card.id);
    if (!node) {
      node = els.cardTemplate.content.firstElementChild.cloneNode(true);
      node.dataset.cardId = card.id;
      node.querySelector(".kana").textContent = card.char;
      node.addEventListener("touchstart", event => {
        event.preventDefault();
        claimCard(card.id, node);
      }, { passive: false });
      node.addEventListener("click", () => claimCard(card.id, node));
      node.addEventListener("contextmenu", event => event.preventDefault());
      container.appendChild(node);
    }
    node.classList.toggle("claimed", !card.active);
    node.disabled = !card.active;
  });

  cards.forEach(card => {
    const node = oldCards.get(card.id) || container.querySelector(`[data-card-id="${CSS.escape(card.id)}"]`);
    if (node) container.appendChild(node);
  });
}

async function claimCard(cardId, node) {
  if (!state.room || state.room.status !== "playing" || state.room.round?.claimedBy) return;
  primeAudio();
  const tappedChar = state.room.deck?.[cardId]?.char;
  if (tappedChar) speakKana(tappedChar);

  const result = await runTransaction(roomRef(), room => {
    if (!room || room.status !== "playing" || !room.round || room.round.claimedBy) return room;
    const card = room.deck?.[cardId];
    if (!card || !card.active) return room;

    const player = room.players?.[state.playerSlot];
    if (!player) return room;

    const correct = card.char === room.round.target;
    if (correct) {
      card.active = false;
      player.score = (player.score || 0) + 1;
      room.round.claimedBy = state.playerSlot;
      room.round.claimedCardId = cardId;
      room.round.correct = true;
      room.round.resolving = true;
      room.message = `${player.name} found ${card.char}!`;
      const activeLeft = Object.values(room.deck).filter(item => item.active).length;
      if (activeLeft === 0) {
        room.status = "finished";
        room.winner = decideWinner(room.players);
        room.message = room.winner ? `${room.players[room.winner].name} wins!` : "It is a draw!";
      }
    } else {
      player.penalty = (player.penalty || 0) + 1;
      player.score = Math.max(0, (player.score || 0) - 1);
      room.message = `${player.name} tapped ${card.char}. Penalty!`;
    }

    return room;
  });

  const freshRoom = result.snapshot.val();
  const freshCard = freshRoom?.deck?.[cardId];
  const wasCorrect = freshRoom?.round?.claimedCardId === cardId && freshRoom?.round?.claimedBy === state.playerSlot;

  if (wasCorrect) {
    node.classList.add("hit");
    makeSpark(node);
    playTone("hit");
    scheduleAdvance(freshRoom.round.nonce);
  } else if (freshCard?.active) {
    node.classList.add("wrong");
    playTone("wrong");
    node.addEventListener("animationend", () => node.classList.remove("wrong"), { once: true });
  }
}

function decideWinner(players) {
  const p1 = players?.p1?.score || 0;
  const p2 = players?.p2?.score || 0;
  if (p1 === p2) return "";
  return p1 > p2 ? "p1" : "p2";
}

function showWinnerModal(room) {
  const finishKey = `${state.roomCode}:${room.winner || "draw"}:${room.players?.p1?.score || 0}:${room.players?.p2?.score || 0}`;
  if (state.lastFinishedRoomKey === finishKey) return;
  state.lastFinishedRoomKey = finishKey;

  const p1 = room.players?.p1 || {};
  const p2 = room.players?.p2 || {};
  const winnerName = room.winner ? room.players?.[room.winner]?.name : "";
  els.winnerTitle.textContent = winnerName ? `${winnerName} wins!` : "Draw game!";
  els.winnerDetails.textContent = `${p1.name || "Player 1"} ${p1.score || 0} - ${p2.score || 0} ${p2.name || "Player 2"}`;
  els.winnerModal.classList.remove("hidden");
  playTone(room.winner === state.playerSlot ? "hit" : "start");
}

function hideWinnerModal() {
  els.winnerModal.classList.add("hidden");
}

function reactToRound() {
  const round = state.room?.round;
  if (!round) return;

  if (round.nonce !== state.lastRoundNonce) {
    state.lastRoundNonce = round.nonce;
    window.setTimeout(() => speakCurrent(false), 240);
  }

  if (round.claimedBy && round.nonce !== state.lastClaimNonce) {
    state.lastClaimNonce = round.nonce;
    const card = document.querySelector(`[data-card-id="${CSS.escape(round.claimedCardId)}"]`);
    if (card) {
      card.classList.add("hit");
      makeSpark(card);
    }
    playTone("hit");
    scheduleAdvance(round.nonce);
  }
}

function scheduleAdvance(nonce) {
  if (state.nextTimer) clearTimeout(state.nextTimer);
  state.nextTimer = window.setTimeout(() => advanceRound(nonce), 1250);
}

async function advanceRound(nonce) {
  await runTransaction(roomRef(), room => {
    if (!room || room.status !== "playing" || !room.round || room.round.nonce !== nonce) return room;
    if (!room.round.claimedBy || !room.round.resolving) return room;

    const target = pickRandomActive(room.deck);
    if (!target) {
      room.status = "finished";
      room.winner = decideWinner(room.players);
      room.message = room.winner ? `${room.players[room.winner].name} wins!` : "It is a draw!";
      return room;
    }

    room.round = makeRound(target);
    room.message = "Next card!";
    return room;
  });
}

function speakCurrent(force) {
  const target = state.room?.round?.target;
  if (!target || state.room?.status !== "playing") return;
  if (!force && document.hidden) return;

  speakKana(target);
}

function speakKana(kana) {
  if (!kana) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(kana);
  utterance.lang = "ja-JP";
  utterance.rate = 0.62;
  utterance.pitch = 1.2;
  utterance.volume = 1;
  speechSynthesis.speak(utterance);
  playCharacterTone(kana);
}

function primeAudio() {
  if (!state.audioContext) {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (state.audioContext.state === "suspended") {
    state.audioContext.resume();
  }
}

function playCharacterTone(kana) {
  try {
    primeAudio();
    const index = Math.max(0, HIRAGANA.indexOf(kana));
    const scale = [523, 587, 659, 698, 784, 880, 988];
    const frequency = scale[index % scale.length] * (index > 34 ? 0.75 : 1);
    playNote(frequency, 0.16, "triangle", 0.08);
    window.setTimeout(() => playNote(frequency * 1.5, 0.12, "sine", 0.05), 95);
  } catch {
    // Character voice is decorative; speech synthesis still handles the kana.
  }
}

function playNote(frequency, duration = 0.18, type = "sine", volume = 0.08) {
  const ctx = state.audioContext;
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.03);
}

function startWaitingMelody() {
  if (state.waitingMelodyTimer || !state.audioContext) return;
  const melody = [523, 659, 784, 659, 587, 698, 880, 698];
  state.waitingMelodyTimer = window.setInterval(() => {
    if (document.hidden || state.room?.status !== "lobby") return;
    const note = melody[state.waitingMelodyStep % melody.length];
    state.waitingMelodyStep += 1;
    playNote(note, 0.22, "sine", 0.025);
  }, 760);
}

function stopWaitingMelody() {
  if (!state.waitingMelodyTimer) return;
  clearInterval(state.waitingMelodyTimer);
  state.waitingMelodyTimer = null;
}

function playTone(type) {
  try {
    primeAudio();
    const ctx = state.audioContext;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const frequencies = {
      start: [523, 784],
      hit: [880, 1175],
      wrong: [190, 140],
      select: [660, 880]
    }[type] || [440];

    osc.type = type === "wrong" ? "sawtooth" : "sine";
    osc.frequency.setValueAtTime(frequencies[0], now);
    if (frequencies[1]) osc.frequency.exponentialRampToValueAtTime(frequencies[1], now + 0.1);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(type === "wrong" ? 0.08 : 0.16, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  } catch {
    // Browsers may block audio until a direct user gesture; gameplay continues either way.
  }
}

function makeSpark(node) {
  const rect = node.getBoundingClientRect();
  const spark = document.createElement("span");
  spark.className = "hit-spark";
  spark.style.left = `${rect.left + rect.width / 2 - 9}px`;
  spark.style.top = `${rect.top + rect.height / 2 - 9}px`;
  document.body.appendChild(spark);
  spark.addEventListener("animationend", () => spark.remove(), { once: true });
}

function spawnSakura() {
  window.setInterval(() => {
    if (document.hidden) return;
    const petal = document.createElement("span");
    petal.className = "petal";
    petal.style.left = `${Math.random() * 100}%`;
    petal.style.setProperty("--drift", `${Math.random() * 180 - 90}px`);
    petal.style.setProperty("--fall-duration", `${7 + Math.random() * 5}s`);
    els.sakuraLayer.appendChild(petal);
    petal.addEventListener("animationend", () => petal.remove(), { once: true });
  }, 520);
}

async function copyRoomCode() {
  if (!state.roomCode) return;
  try {
    await navigator.clipboard.writeText(state.roomCode);
    els.roundMessage.textContent = "Room code copied.";
  } catch {
    els.roundMessage.textContent = `Room code: ${state.roomCode}`;
  }
}

function setStatus(message) {
  els.welcomeStatus.textContent = message;
}

async function leaveRoom(clearConnection = true) {
  stopWaitingMelody();
  if (state.unsubscribeRoom) {
    state.unsubscribeRoom();
    state.unsubscribeRoom = null;
  }

  if (clearConnection && state.roomCode && state.playerSlot) {
    await update(ref(db, `rooms/${state.roomCode}/players/${state.playerSlot}`), { connected: false });
  }

  state.roomCode = "";
  state.playerSlot = "";
  state.room = null;
  state.lastRoundNonce = "";
  state.lastClaimNonce = "";
  window.history.replaceState({}, "", window.location.pathname);
  els.gamePanel.classList.add("hidden");
  els.welcomePanel.classList.remove("hidden");
}

window.addEventListener("beforeunload", () => {
  if (state.roomCode && state.playerSlot) {
    set(ref(db, `rooms/${state.roomCode}/players/${state.playerSlot}/connected`), false);
  }
});
