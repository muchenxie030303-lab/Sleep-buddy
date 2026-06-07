const SOUND_OPTIONS = [
  { id: "gentle-chime", label: "Gentle chime" },
  { id: "bright-bells", label: "Bright bells" },
  { id: "soft-pulse", label: "Soft pulse" },
];

const STORAGE_KEY = "sleepBuddy";
const CHECK_INTERVAL_MS = 30_000;

const $ = (id) => document.getElementById(id);

const wakeTime = $("wakeTime");
const sleepTime = $("sleepTime");
const wakeSound = $("wakeSound");
const sleepSound = $("sleepSound");
const enabled = $("enabled");
const saveBtn = $("save");
const testWakeBtn = $("testWake");
const testSleepBtn = $("testSleep");
const statusEl = $("status");
const notifStatusEl = $("notifStatus");
const alertBanner = $("alertBanner");
const alertTitle = $("alertTitle");
const alertBody = $("alertBody");
const dismissAlert = $("dismissAlert");

let lastWakeFired = "";
let lastSleepFired = "";

function populateSoundSelects() {
  const markup = SOUND_OPTIONS.map(
    (opt) => `<option value="${opt.id}">${opt.label}</option>`
  ).join("");
  wakeSound.innerHTML = markup;
  sleepSound.innerHTML = markup;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    wakeTime.value = data.wakeTime || "07:00";
    sleepTime.value = data.sleepTime || "23:00";
    wakeSound.value = data.wakeSound || "gentle-chime";
    sleepSound.value = data.sleepSound || "soft-pulse";
    enabled.checked = data.enabled !== false;
  } catch {
    setStatus("Could not load saved settings.", true);
  }
}

function saveSettings() {
  const data = {
    wakeTime: wakeTime.value,
    sleepTime: sleepTime.value,
    wakeSound: wakeSound.value,
    sleepSound: sleepSound.value,
    enabled: enabled.checked,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  setStatus("Saved! Reminders are ready.");
}

function playBuiltInSound(soundId, repeat = 1) {
  const ctx = new AudioContext();
  const patternDuration = 2.5;

  for (let r = 0; r < repeat; r++) {
    const offset = r * (patternDuration + 0.4);
    playBuiltInPattern(ctx, soundId, offset);
  }

  window.setTimeout(() => ctx.close(), repeat * (patternDuration + 0.4) * 1000 + 500);
}

function playBuiltInPattern(ctx, soundId, offsetSec) {
  const now = ctx.currentTime + offsetSec;

  const patterns = {
    "gentle-chime": [
      { freq: 523.25, at: 0, dur: 0.35 },
      { freq: 659.25, at: 0.25, dur: 0.45 },
      { freq: 783.99, at: 0.55, dur: 0.6 },
    ],
    "bright-bells": [
      { freq: 880, at: 0, dur: 0.2 },
      { freq: 1108.73, at: 0.15, dur: 0.2 },
      { freq: 1318.51, at: 0.3, dur: 0.35 },
      { freq: 1760, at: 0.5, dur: 0.4 },
    ],
    "soft-pulse": [
      { freq: 392, at: 0, dur: 0.5 },
      { freq: 349.23, at: 0.55, dur: 0.55 },
      { freq: 329.63, at: 1.15, dur: 0.7 },
    ],
  };

  const notes = patterns[soundId] || patterns["gentle-chime"];

  notes.forEach(({ freq, at, dur }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + at);
    gain.gain.exponentialRampToValueAtTime(0.22, now + at + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + at);
    osc.stop(now + at + dur + 0.05);
  });
}

async function playReminder(kind) {
  const raw = localStorage.getItem(STORAGE_KEY);
  const data = raw ? JSON.parse(raw) : {};
  const soundId = kind === "wake" ? data.wakeSound : data.sleepSound;
  const title = kind === "wake" ? "Time to wake up! ☀️" : "Time to sleep! 🌙";

  playBuiltInSound(
    soundId || (kind === "wake" ? "gentle-chime" : "soft-pulse"),
    3
  );

  showInAppAlert("Sleep Buddy", title);

  if (Notification.permission === "granted") {
    new Notification("Sleep Buddy", { body: title, tag: `sleep-buddy-${kind}` });
  }
}

function showInAppAlert(title, body) {
  alertTitle.textContent = title;
  alertBody.textContent = body;
  alertBanner.hidden = false;
}

function updateNotifStatus() {
  if (!("Notification" in window)) {
    notifStatusEl.textContent = "Notifications not supported in this browser.";
    notifStatusEl.classList.add("warn");
    return;
  }

  const labels = {
    granted: "System notifications: on",
    denied: "System notifications: blocked — allow in browser Settings",
    default: "System notifications: off — tap Save or Test to enable",
  };
  notifStatusEl.textContent = labels[Notification.permission] || labels.default;
  notifStatusEl.classList.toggle("warn", Notification.permission !== "granted");
}

async function requestNotifications() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  const result = await Notification.requestPermission();
  return result;
}

function currentHHMM() {
  const now = new Date();
  return now.toTimeString().slice(0, 5);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function checkReminders() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  const data = JSON.parse(raw);
  if (!data.enabled) return;

  const nowKey = `${todayKey()}-${currentHHMM()}`;

  if (data.wakeTime === currentHHMM() && lastWakeFired !== nowKey) {
    lastWakeFired = nowKey;
    playReminder("wake");
  }

  if (data.sleepTime === currentHHMM() && lastSleepFired !== nowKey) {
    lastSleepFired = nowKey;
    playReminder("sleep");
  }
}

async function onSave() {
  saveSettings();
  const perm = await requestNotifications();
  updateNotifStatus();
  if (perm === "granted") {
    setStatus("Saved! Notifications are on.");
  } else if (perm === "denied") {
    setStatus("Saved, but notifications are blocked in Settings.", true);
  } else {
    setStatus("Saved! You'll still see on-screen alerts when reminders fire.");
  }
}

async function onTest(kind) {
  const perm = await requestNotifications();
  updateNotifStatus();

  try {
    await playReminder(kind);
    if (perm === "granted") {
      setStatus(`Test ${kind} reminder — sound + notification sent.`);
    } else {
      setStatus(`Test ${kind} reminder — sound played. Check the popup banner above.`);
    }
  } catch {
    setStatus("Tap again — iPhone needs a tap before playing audio.", true);
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

dismissAlert.addEventListener("click", () => {
  alertBanner.hidden = true;
});

populateSoundSelects();
loadSettings();
updateNotifStatus();
registerServiceWorker();
setInterval(checkReminders, CHECK_INTERVAL_MS);
checkReminders();

saveBtn.addEventListener("click", onSave);
testWakeBtn.addEventListener("click", () => onTest("wake"));
testSleepBtn.addEventListener("click", () => onTest("sleep"));
