const SOUND_OPTIONS = [
  { id: "gentle-chime", label: "Gentle chime" },
  { id: "bright-bells", label: "Bright bells" },
  { id: "soft-pulse", label: "Soft pulse" },
];

const STORAGE_KEY = "sleepBuddy";
const CHECK_INTERVAL_MS = 30_000;
const WAKE_REPEAT_INTERVAL_MS = 60_000;

const $ = (id) => document.getElementById(id);

const wakeTime = $("wakeTime");
const sleepTime = $("sleepTime");
const wakeTimeDisplay = $("wakeTimeDisplay");
const sleepTimeDisplay = $("sleepTimeDisplay");
const wakeSound = $("wakeSound");
const sleepSound = $("sleepSound");
const enabled = $("enabled");
const saveBtn = $("save");
const testWakeBtn = $("testWake");
const testSleepBtn = $("testSleep");
const statusEl = $("status");
const notifStatusEl = $("notifStatus");
const sleepAlert = $("sleepAlert");
const sleepAlertTitle = $("sleepAlertTitle");
const sleepAlertBody = $("sleepAlertBody");
const dismissSleepAlert = $("dismissSleepAlert");
const wakeAlarmOverlay = $("wakeAlarmOverlay");
const dismissWakeAlarm = $("dismissWakeAlarm");

let lastSleepFired = "";
let wakeAlarmActive = false;
let wakeAlarmIntervalId = null;
let wakeDismissedDate = "";

function populateSoundSelects() {
  const markup = SOUND_OPTIONS.map(
    (opt) => `<option value="${opt.id}">${opt.label}</option>`
  ).join("");
  wakeSound.innerHTML = markup;
  sleepSound.innerHTML = markup;
}

function formatTimeDisplay(timeValue) {
  const [h, m] = timeValue.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function syncTimeDisplays() {
  wakeTimeDisplay.textContent = formatTimeDisplay(wakeTime.value);
  sleepTimeDisplay.textContent = formatTimeDisplay(sleepTime.value);
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
    wakeDismissedDate = data.wakeDismissedDate || "";
  } catch {
    setStatus("Could not load saved settings.", true);
  }
  syncTimeDisplays();
}

function saveSettings() {
  const data = {
    wakeTime: wakeTime.value,
    sleepTime: sleepTime.value,
    wakeSound: wakeSound.value,
    sleepSound: sleepSound.value,
    enabled: enabled.checked,
    wakeDismissedDate,
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

function getSoundId(kind) {
  const raw = localStorage.getItem(STORAGE_KEY);
  const data = raw ? JSON.parse(raw) : {};
  if (kind === "wake") {
    return data.wakeSound || wakeSound.value || "gentle-chime";
  }
  return data.sleepSound || sleepSound.value || "soft-pulse";
}

function fireWakeAlarmCycle() {
  const title = "Time to wake up! ☀️";
  playBuiltInSound(getSoundId("wake"), 3);

  if (Notification.permission === "granted") {
    new Notification("Sleep Buddy", {
      body: title,
      tag: "sleep-buddy-wake",
      requireInteraction: true,
    });
  }
}

function startWakeAlarm() {
  if (wakeAlarmActive) return;
  wakeAlarmActive = true;
  wakeAlarmOverlay.hidden = false;
  document.body.style.overflow = "hidden";

  fireWakeAlarmCycle();
  wakeAlarmIntervalId = window.setInterval(fireWakeAlarmCycle, WAKE_REPEAT_INTERVAL_MS);
}

function stopWakeAlarm() {
  wakeAlarmActive = false;
  if (wakeAlarmIntervalId !== null) {
    window.clearInterval(wakeAlarmIntervalId);
    wakeAlarmIntervalId = null;
  }
  wakeAlarmOverlay.hidden = true;
  document.body.style.overflow = "";

  wakeDismissedDate = todayKey();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const data = JSON.parse(raw);
    data.wakeDismissedDate = wakeDismissedDate;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}

function showSleepAlert(title, body) {
  sleepAlertTitle.textContent = title;
  sleepAlertBody.textContent = body;
  sleepAlert.hidden = false;
}

function playSleepReminder() {
  const title = "Time to sleep! 🌙";
  playBuiltInSound(getSoundId("sleep"), 3);
  showSleepAlert("Sleep Buddy", title);

  if (Notification.permission === "granted") {
    new Notification("Sleep Buddy", { body: title, tag: "sleep-buddy-sleep" });
  }
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
  return Notification.requestPermission();
}

function currentHHMM() {
  return new Date().toTimeString().slice(0, 5);
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
  const alreadyDismissedToday = data.wakeDismissedDate === todayKey();

  if (
    data.wakeTime === currentHHMM() &&
    !alreadyDismissedToday &&
    !wakeAlarmActive
  ) {
    startWakeAlarm();
  }

  if (data.sleepTime === currentHHMM() && lastSleepFired !== nowKey) {
    lastSleepFired = nowKey;
    playSleepReminder();
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
    setStatus("Saved! Wake alarm repeats until dismissed.");
  }
}

async function onTestWake() {
  const perm = await requestNotifications();
  updateNotifStatus();

  try {
    startWakeAlarm();
    if (perm === "granted") {
      setStatus("Wake alarm on — tap I'm awake to stop.");
    } else {
      setStatus("Wake alarm on — tap I'm awake when you're up.");
    }
  } catch {
    setStatus("Tap again — iPhone needs a tap before playing audio.", true);
  }
}

async function onTestSleep() {
  const perm = await requestNotifications();
  updateNotifStatus();

  try {
    playSleepReminder();
    if (perm === "granted") {
      setStatus("Test sleep reminder — sound + notification sent.");
    } else {
      setStatus("Test sleep reminder — sound played.");
    }
  } catch {
    setStatus("Tap again — iPhone needs a tap before playing audio.", true);
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

dismissWakeAlarm.addEventListener("click", () => {
  stopWakeAlarm();
  setStatus("Wake alarm dismissed. Have a great day!");
});

dismissSleepAlert.addEventListener("click", () => {
  sleepAlert.hidden = true;
});

wakeTime.addEventListener("change", syncTimeDisplays);
sleepTime.addEventListener("change", syncTimeDisplays);

populateSoundSelects();
loadSettings();
updateNotifStatus();
registerServiceWorker();
setInterval(checkReminders, CHECK_INTERVAL_MS);
checkReminders();

saveBtn.addEventListener("click", onSave);
testWakeBtn.addEventListener("click", onTestWake);
testSleepBtn.addEventListener("click", onTestSleep);
