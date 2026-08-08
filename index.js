require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  Events,
  PermissionsBitField,
  SlashCommandBuilder,
  REST,
  Routes,
  ActivityType
} = require("discord.js");

// ==========================================================
// ===== PERSISTENCE (simple JSON file storage) =====
// ==========================================================

const DATA_DIR = path.join(__dirname, "data");
const ASSETS_DIR = path.join(__dirname, "assets");
const LEVELS_FILE = path.join(DATA_DIR, "levels.json");
const STATS_FILE = path.join(DATA_DIR, "stats.json");
const SUBMISSIONS_FILE = path.join(DATA_DIR, "submissions.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const PANEL_CONFIG_FILE = path.join(DATA_DIR, "panelConfig.json");
const INVITES_FILE = path.join(DATA_DIR, "invites.json");
const INVITED_BY_FILE = path.join(DATA_DIR, "invitedBy.json");
const INVITES_LEFT_FILE = path.join(DATA_DIR, "invitesLeft.json");
const INVITES_FAKE_FILE = path.join(DATA_DIR, "invitesFake.json");
const MESSAGE_STATS_FILE = path.join(DATA_DIR, "messageStats.json");
const LEADERBOARD_STATE_FILE = path.join(DATA_DIR, "leaderboardState.json");
const FILTERS_FILE = path.join(DATA_DIR, "filters.json");
const XP_GIVEAWAYS_FILE = path.join(DATA_DIR, "xpGiveaways.json");

// Supports either a .png or .jpg/.jpeg background — whichever is present.
function resolveLevelUpBgPath() {
  const candidates = ["levelup-bg.png", "levelup-bg.jpg", "levelup-bg.jpeg"];
  for (const name of candidates) {
    const p = path.join(ASSETS_DIR, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR);

function loadJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.error(`⚠️ Failed to load ${file}, using fallback.`, err);
    return fallback;
  }
}

function saveJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`⚠️ Failed to save ${file}.`, err);
  }
}

// levels[userId] = { xp: number, level: number, totalXp: number }
let levels = loadJSON(LEVELS_FILE, {});

let stats = loadJSON(STATS_FILE, {
  totalKicks: 0,
  totalBans: 0,
  totalVerifications: 0,
  wordFilterHits: 0,
  appeals: 0
});
function saveStats() { saveJSON(STATS_FILE, stats); }

// submissions[] = { id, type, userId, userTag, fields: [{label, value}], status, timestamp }
let submissions = loadJSON(SUBMISSIONS_FILE, []);
function saveSubmissions() { saveJSON(SUBMISSIONS_FILE, submissions); }

// which application types are currently accepted, plus every editable knob
// exposed via Settings.
let settings = loadJSON(SETTINGS_FILE, {
  open: { campaign: true, service: true, moderator: true, outreacher: true },
  levelUpChannelId: "1400519902976282876",
  logChannelId: "1517364435574984745",
  inviteLogChannelId: "1400219574695104674",
  announcementChannelId: "1400219574695104674",
  joinEmoji: "📥",
  leaveEmoji: "📤",
  verifyEmoji: "✅",
  botStatus: "ClippingBase.com",
  linkFilterEnabled: true,
  embedColor: "#2B2D31",
  submitPanelColor: "#2B2D31",
  buttonLabels: {
    verify: "Verify",
    openOptions: "Open Options"
  },
  verifyPanel: {
    description: "",
    color: "#2B2D31",
    image: null,
    buttonColor: "green",
    buttonEmoji: "✅",
    panelChannelId: null,
    panelMessageId: null
  },
  images: { verify: null, submit: null, levelup: null, leaderboard: null },
  leaderboardStyles: {
    level: { label: "Level Leaderboard", emoji: "🏆", color: "#F1C40F" },
    xp: { label: "XP Leaderboard", emoji: "✨", color: "#9B59B6" },
    invites: { label: "Invites Leaderboard", emoji: "📨", color: "#5865F2" },
    messages: { label: "Messages Leaderboard", emoji: "💬", color: "#57F287" }
  },
  leaderboardRotationMinutes: 5,
  leaderboardIcon: "➤",
  leaderboardDisplayCount: 10,
  levelUpStyle: {
    barColor: "#57F287",
    font: "sans-serif",
    headline: "Level-up!"
  },
  xp: {
    perTrigger: 100,
    messagesPerTrigger: 1
  }
});

// ---- backfill defaults for anything missing from an older settings.json ----
if (!settings.levelUpChannelId) settings.levelUpChannelId = "1400519902976282876";
if (!settings.logChannelId) settings.logChannelId = "1517364435574984745";
if (!settings.inviteLogChannelId) settings.inviteLogChannelId = "1400219574695104674";
if (!settings.announcementChannelId) settings.announcementChannelId = settings.inviteLogChannelId;
if (!settings.joinEmoji) settings.joinEmoji = "📥";
if (!settings.leaveEmoji) settings.leaveEmoji = "📤";
if (!settings.verifyEmoji) settings.verifyEmoji = "✅";
if (!settings.botStatus) settings.botStatus = "ClippingBase.com";
if (settings.linkFilterEnabled === undefined) settings.linkFilterEnabled = true;
if (!settings.embedColor) settings.embedColor = "#2B2D31";
if (!settings.submitPanelColor) settings.submitPanelColor = settings.embedColor;
if (!settings.buttonLabels) settings.buttonLabels = {};
if (!settings.buttonLabels.verify) settings.buttonLabels.verify = "Verify";
if (!settings.buttonLabels.openOptions) settings.buttonLabels.openOptions = "Open Options";
if (!settings.verifyPanel) {
  settings.verifyPanel = { description: "", color: "#2B2D31", image: null, buttonColor: "green", buttonEmoji: "✅", panelChannelId: null, panelMessageId: null };
}
if (settings.verifyPanel.description === undefined) settings.verifyPanel.description = "";
if (!settings.verifyPanel.color) settings.verifyPanel.color = "#2B2D31";
if (settings.verifyPanel.image === undefined) settings.verifyPanel.image = null;
if (!settings.verifyPanel.buttonColor) settings.verifyPanel.buttonColor = "green";
if (settings.verifyPanel.buttonEmoji === undefined) settings.verifyPanel.buttonEmoji = "✅";
if (!settings.images) settings.images = { verify: null, submit: null, levelup: null, leaderboard: null };
if (settings.images.verify === undefined) settings.images.verify = null;
if (settings.images.submit === undefined) settings.images.submit = null;
if (settings.images.levelup === undefined) settings.images.levelup = null;
if (settings.images.leaderboard === undefined) settings.images.leaderboard = null;
if (!settings.leaderboardStyles) {
  settings.leaderboardStyles = {
    level: { label: "Level Leaderboard", emoji: "🏆", color: "#F1C40F" },
    xp: { label: "XP Leaderboard", emoji: "✨", color: "#9B59B6" },
    invites: { label: "Invites Leaderboard", emoji: "📨", color: "#5865F2" },
    messages: { label: "Messages Leaderboard", emoji: "💬", color: "#57F287" }
  };
}
if (!settings.leaderboardRotationMinutes) settings.leaderboardRotationMinutes = 5;
if (settings.leaderboardIcon === undefined) settings.leaderboardIcon = "➤";
if (!settings.leaderboardDisplayCount) settings.leaderboardDisplayCount = 10;
if (!settings.levelUpStyle) {
  settings.levelUpStyle = { barColor: "#57F287", font: "sans-serif", headline: "Level-up!" };
}
if (!settings.levelUpStyle.barColor) settings.levelUpStyle.barColor = "#57F287";
if (!settings.levelUpStyle.font) settings.levelUpStyle.font = "sans-serif";
if (!settings.levelUpStyle.headline) settings.levelUpStyle.headline = "Level-up!";
if (!settings.xp) settings.xp = { perTrigger: 100, messagesPerTrigger: 1 };
if (!settings.xp.perTrigger) settings.xp.perTrigger = 100;
if (!settings.xp.messagesPerTrigger) settings.xp.messagesPerTrigger = 1;
function saveSettings() { saveJSON(SETTINGS_FILE, settings); }

// Applies settings.botStatus as a "Watching ..." presence. Called on ready
// and whenever the status text is edited from Settings.
function updateBotStatus() {
  try {
    if (client.user) {
      client.user.setActivity(settings.botStatus, { type: ActivityType.Watching });
    }
  } catch (err) {
    console.log("Could not set bot status:", err.message);
  }
}

// fallback emojis if a saved panelConfig predates per-type emoji support
const TYPE_EMOJI_DEFAULTS = { campaign: "🚀", service: "🔧", moderator: "🛡️", outreacher: "🤝" };

// the editable text/buttons on the Submit-a-Request panel. Title/description
// start BLANK on purpose — nothing is auto-populated. The panel stays empty
// (just the Open Options button) until an admin types real content via
// "--submit" (title/description) or Settings (per-type dropdown labels).
let panelConfig = loadJSON(PANEL_CONFIG_FILE, {
  title: "",
  description: "",
  footer: "",
  types: {
    campaign: { buttonLabel: "Launch a Campaign", buttonColor: "green", emoji: "🚀", text: "" },
    service: { buttonLabel: "Service Provider", buttonColor: "blue", emoji: "🔧", text: "" },
    moderator: { buttonLabel: "Content Moderator", buttonColor: "red", emoji: "🛡️", text: "" },
    outreacher: { buttonLabel: "Outreacher", buttonColor: "", emoji: "🤝", text: "" }
  },
  panelMessageId: null,
  panelChannelId: null
});
// Backfill emoji field for panels saved before this was added
for (const key of Object.keys(TYPE_EMOJI_DEFAULTS)) {
  if (panelConfig.types[key] && !panelConfig.types[key].emoji) {
    panelConfig.types[key].emoji = TYPE_EMOJI_DEFAULTS[key];
  }
}
function savePanelConfig() { saveJSON(PANEL_CONFIG_FILE, panelConfig); }

// invites[userId] = number of members that user has invited
let invites = loadJSON(INVITES_FILE, {});
function saveInvites() { saveJSON(INVITES_FILE, invites); }

// invitedBy[userId] = the userId who invited them (or null if unknown, e.g.
// vanity URL / permission-less tracking). Used to report who invited someone
// when they leave the server.
let invitedBy = loadJSON(INVITED_BY_FILE, {});
function saveInvitedBy() { saveJSON(INVITED_BY_FILE, invitedBy); }

// invitesLeft[userId] = number of members THIS user invited who have since left
let invitesLeft = loadJSON(INVITES_LEFT_FILE, {});
function saveInvitesLeft() { saveJSON(INVITES_LEFT_FILE, invitesLeft); }

// invitesFake[userId] = number of members THIS user invited whose accounts
// were newer than FAKE_ACCOUNT_AGE_MS at the time they joined (a common
// signal for "fake"/alt invites used to farm invite counts).
let invitesFake = loadJSON(INVITES_FAKE_FILE, {});
function saveInvitesFake() { saveJSON(INVITES_FAKE_FILE, invitesFake); }
const FAKE_ACCOUNT_AGE_MS = 3 * 24 * 60 * 60 * 1000; // accounts younger than 3 days count as "fake"

// messageStats[userId] = total messages sent (persisted, separate from the
// in-memory XP trigger counter above)
let messageStats = loadJSON(MESSAGE_STATS_FILE, {});
function saveMessageStats() { saveJSON(MESSAGE_STATS_FILE, messageStats); }

// { channelId, messageId, type: 'level'|'xp'|'invites'|'messages', nextRotationAt }
let leaderboardState = loadJSON(LEADERBOARD_STATE_FILE, {
  channelId: "1400219324853256316",
  messageId: null,
  type: "level",
  nextRotationAt: null
});
if (!leaderboardState.type) leaderboardState.type = "level";
if (leaderboardState.nextRotationAt === undefined) leaderboardState.nextRotationAt = null;
function saveLeaderboardState() { saveJSON(LEADERBOARD_STATE_FILE, leaderboardState); }

// Custom word-filter additions layered on top of the built-in defaults below.
// customFilters.<category> = string[]
let customFilters = loadJSON(FILTERS_FILE, {
  profanity: [], harassment: [], bullying: [], spam: []
});
for (const cat of ["profanity", "harassment", "bullying", "spam"]) {
  if (!Array.isArray(customFilters[cat])) customFilters[cat] = [];
}
function saveCustomFilters() { saveJSON(FILTERS_FILE, customFilters); }

// xpGiveaways[] = { id, amount, xpGoal, winnerCount, channelId, status: 'scheduled'|'active'|'ended',
// createdAt, startAt, endAt, endedAt, startSnapshot: { userId: totalXpAtStart }, leaderboard: [...], results: [...] }
let xpGiveaways = loadJSON(XP_GIVEAWAYS_FILE, []);
function saveXpGiveaways() { saveJSON(XP_GIVEAWAYS_FILE, xpGiveaways); }

// guildId -> Collection<inviteCode, uses> — cached so we can tell which
// invite was used when a member joins
const invitesCache = new Map();

const warnings = new Map();

const TYPE_DISPLAY_NAMES = {
  campaign: "Promotion Campaign",
  service: "Service Provider",
  moderator: "Content Moderator",
  outreacher: "Outreacher"
};

// Fetches a guild channel, falling back to an API fetch if it isn't cached
// yet, and logs why it couldn't be found so silent failures are visible.
async function getChannelSafe(guild, channelId, label) {
  if (!channelId) {
    console.error(`❌ ${label}: no channel ID configured.`);
    return null;
  }
  let ch = guild.channels.cache.get(channelId);
  if (!ch) {
    ch = await guild.channels.fetch(channelId).catch(err => {
      console.error(`❌ ${label}: could not fetch channel ${channelId} — ${err.message}`);
      return null;
    });
  }
  if (!ch) {
    console.error(`❌ ${label}: channel ${channelId} not found in this guild (wrong ID, or bot lacks View Channel access).`);
  }
  return ch;
}

// Returns the currently configured emoji for a submit-panel type, falling
// back to the built-in default if it hasn't been customized yet.
function getTypeEmoji(key) {
  return (panelConfig.types[key] && panelConfig.types[key].emoji) || TYPE_EMOJI_DEFAULTS[key];
}

// ==========================================================
// ===== CUSTOM EMOJI HELPERS =====
// ==========================================================
// Every "emoji" field stored in settings/panelConfig can now be either a
// normal unicode emoji ("🚀"), a Discord custom emoji written in
// <:name:id> / <a:name:id> format (animated), OR left completely empty —
// in which case no emoji is applied to that button at all.

const CUSTOM_EMOJI_REGEX = /^<a?:\w+:\d+>$/;

// Validates whatever was typed into an emoji modal — either a real unicode
// emoji or a Discord custom emoji in <:name:id> / <a:name:id> format.
// An empty string is ALSO valid — it means "no emoji", per spec.
function isValidEmojiInput(str) {
  if (!str) return true;
  if (CUSTOM_EMOJI_REGEX.test(str)) return true;
  return /\p{Extended_Pictographic}/u.test(str) && str.length <= 8;
}

// Applies an emoji string to a ButtonBuilder ONLY if one is set — leaves the
// button with no emoji at all when the stored value is blank.
function applyButtonEmoji(button, raw) {
  if (raw && raw.trim()) button.setEmoji(raw.trim());
  return button;
}

// Converts a saved emoji string into the object shape StringSelectMenuBuilder
// options require. Buttons don't need this — ButtonBuilder.setEmoji() accepts
// the raw string (unicode or <:name:id>) directly.
function emojiToOptionObject(raw) {
  if (!raw) return undefined;
  const match = raw.match(/^<(a)?:(\w+):(\d+)>$/);
  if (match) return { id: match[3], name: match[2], animated: !!match[1] };
  return { name: raw };
}

// Discord hard-caps TextInputBuilder labels at 45 characters — anything
// longer throws an uncaught ExpectedConstraintError and crashes the bot.
// Every modal label in this file is routed through this helper so a long
// label gets truncated instead of taking the whole process down.
function safeLabel(str, max = 45) {
  const s = String(str == null ? "" : str);
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

// ==========================================================
// ===== LEVELING SYSTEM =====
// ==========================================================

function xpForLevel(level) {
  return 5 * level * level + 50 * level + 100;
}

function addXP(userId, amount) {
  if (!levels[userId]) levels[userId] = { xp: 0, level: 0, totalXp: 0 };
  if (levels[userId].totalXp === undefined) levels[userId].totalXp = 0;
  const userData = levels[userId];
  const oldLevel = userData.level;
  userData.xp += amount;
  userData.totalXp += amount;

  let leveledUp = false;
  while (userData.xp >= xpForLevel(userData.level)) {
    userData.xp -= xpForLevel(userData.level);
    userData.level++;
    leveledUp = true;
  }

  saveJSON(LEVELS_FILE, levels);
  return { leveledUp, oldLevel, newLevel: userData.level, currentXp: userData.xp };
}

const CARD_WIDTH = 900;
const CARD_HEIGHT = 320;

function drawImageCover(ctx, img, x, y, w, h, offsetXPct = 0, offsetYPct = 0, zoom = 1) {
  const imgRatio = img.width / img.height;
  const rectRatio = w / h;

  let drawWidth, drawHeight;
  if (imgRatio > rectRatio) {
    drawHeight = h;
    drawWidth = h * imgRatio;
  } else {
    drawWidth = w;
    drawHeight = w / imgRatio;
  }

  const z = Math.max(1, Number(zoom) || 1);
  drawWidth *= z;
  drawHeight *= z;

  let offsetX = x + (w - drawWidth) / 2;
  let offsetY = y + (h - drawHeight) / 2;

  const overflowX = drawWidth - w;
  const overflowY = drawHeight - h;
  const panX = Math.max(-1, Math.min(1, Number(offsetXPct) || 0));
  const panY = Math.max(-1, Math.min(1, Number(offsetYPct) || 0));
  offsetX -= (overflowX / 2) * panX;
  offsetY -= (overflowY / 2) * panY;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
  ctx.restore();
}

function clipRoundedRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.clip();
}

function roundRectPath(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function loadLevelUpBackground() {
  if (settings.images.levelup) {
    try {
      return await loadImage(settings.images.levelup);
    } catch (err) {
      console.log("Could not load configured level-up background URL, falling back:", err.message);
    }
  }
  const bgPath = resolveLevelUpBgPath();
  if (bgPath) {
    try {
      return await loadImage(bgPath);
    } catch (err) {
      console.log("Could not load local level-up background file:", err.message);
    }
  }
  return null;
}

const DEFAULT_LEVELUP_LAYOUT = {
  avatar: { x: 40, y: 40, size: 90 },
  userLine: { x: null, y: null, size: 32 },
  headline: { x: CARD_WIDTH / 2, y: 185, size: 68 },
  subline: { x: CARD_WIDTH / 2, y: 240, size: 34 },
  progressBar: { x: CARD_WIDTH / 2, y: 272, width: 500, height: 20 },
  xpText: { x: CARD_WIDTH / 2, y: 310, size: 22 }
};

function deepMergeLayout(base, override) {
  const out = {};
  for (const key of Object.keys(base)) {
    out[key] = { ...base[key], ...(override && override[key] ? override[key] : {}) };
  }
  return out;
}

function getLevelUpLayout() {
  return deepMergeLayout(DEFAULT_LEVELUP_LAYOUT, settings.levelUpStyle.layout);
}

function getBackgroundTransform() {
  const bg = settings.levelUpStyle.background || {};
  return {
    offsetX: typeof bg.offsetX === "number" ? bg.offsetX : 0,
    offsetY: typeof bg.offsetY === "number" ? bg.offsetY : 0,
    zoom: typeof bg.zoom === "number" ? bg.zoom : 1
  };
}

async function generateLevelUpImage(user, oldLevel, newLevel, currentXp) {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");
  const style = settings.levelUpStyle || { barColor: "#57F287", font: "sans-serif", headline: "Level-up!" };
  const font = style.font || "sans-serif";
  const layout = getLevelUpLayout();
  const bgT = getBackgroundTransform();

  ctx.save();
  clipRoundedRect(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, 28);

  const bg = await loadLevelUpBackground();
  if (bg) {
    drawImageCover(ctx, bg, 0, 0, CARD_WIDTH, CARD_HEIGHT, bgT.offsetX, bgT.offsetY, bgT.zoom);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, 0);
    gradient.addColorStop(0, "#ff0000");
    gradient.addColorStop(0.17, "#ff9900");
    gradient.addColorStop(0.34, "#ffee00");
    gradient.addColorStop(0.51, "#33ff00");
    gradient.addColorStop(0.68, "#0066ff");
    gradient.addColorStop(0.85, "#6600ff");
    gradient.addColorStop(1, "#ff00cc");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.restore();

  const avatarSize = layout.avatar.size;
  const avatarX = layout.avatar.x;
  const avatarY = layout.avatar.y;
  const avatarRadius = 18;

  try {
    const avatarURL = user.displayAvatarURL({ extension: "png", size: 256 });
    const avatarImg = await loadImage(avatarURL);

    ctx.save();
    clipRoundedRect(ctx, avatarX, avatarY, avatarSize, avatarSize, avatarRadius);
    ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();
  } catch (err) {
    console.log("Could not load avatar for level up card:", err.message);
  }

  const userLineX = layout.userLine.x !== null && layout.userLine.x !== undefined ? layout.userLine.x : avatarX + avatarSize + 30;
  const userLineY = layout.userLine.y !== null && layout.userLine.y !== undefined ? layout.userLine.y : avatarY + avatarSize / 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${layout.userLine.size}px ${font}`;
  ctx.fillText(`@${user.username} you are now level ${newLevel}!`, userLineX, userLineY);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${layout.headline.size}px ${font}`;
  ctx.fillText(style.headline || "Level-up!", layout.headline.x, layout.headline.y);

  ctx.fillStyle = "#d9d9d9";
  ctx.font = `bold ${layout.subline.size}px ${font}`;
  ctx.fillText(`${oldLevel} • ${newLevel}`, layout.subline.x, layout.subline.y);

  const needed = xpForLevel(newLevel);
  const pct = Math.max(0, Math.min(1, currentXp / needed));
  const barW = layout.progressBar.width;
  const barH = layout.progressBar.height;
  const barX = layout.progressBar.x - barW / 2;
  const barY = layout.progressBar.y;

  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  roundRectPath(ctx, barX, barY, barW, barH, 10);
  ctx.fill();

  ctx.fillStyle = style.barColor || "#57F287";
  roundRectPath(ctx, barX, barY, Math.max(barH, barW * pct), barH, 10);
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 4;
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${layout.xpText.size}px ${font}`;
  ctx.fillText(`${currentXp} / ${needed} XP to level ${newLevel + 1}`, layout.xpText.x, layout.xpText.y);
  ctx.restore();

  return canvas.encode("png");
}

async function generateRankImage(user, level, currentXp, totalXp) {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");
  const style = settings.levelUpStyle || { barColor: "#57F287", font: "sans-serif" };
  const font = style.font || "sans-serif";
  const layout = getLevelUpLayout();
  const bgT = getBackgroundTransform();

  ctx.save();
  clipRoundedRect(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, 28);

  const bg = await loadLevelUpBackground();
  if (bg) {
    drawImageCover(ctx, bg, 0, 0, CARD_WIDTH, CARD_HEIGHT, bgT.offsetX, bgT.offsetY, bgT.zoom);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, 0);
    gradient.addColorStop(0, "#ff0000");
    gradient.addColorStop(0.17, "#ff9900");
    gradient.addColorStop(0.34, "#ffee00");
    gradient.addColorStop(0.51, "#33ff00");
    gradient.addColorStop(0.68, "#0066ff");
    gradient.addColorStop(0.85, "#6600ff");
    gradient.addColorStop(1, "#ff00cc");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.restore();

  const avatarSize = layout.avatar.size;
  const avatarX = layout.avatar.x;
  const avatarY = layout.avatar.y;
  const avatarRadius = 18;

  try {
    const avatarURL = user.displayAvatarURL({ extension: "png", size: 256 });
    const avatarImg = await loadImage(avatarURL);

    ctx.save();
    clipRoundedRect(ctx, avatarX, avatarY, avatarSize, avatarSize, avatarRadius);
    ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();
  } catch (err) {
    console.log("Could not load avatar for rank card:", err.message);
  }

  const userLineX = layout.userLine.x !== null && layout.userLine.x !== undefined ? layout.userLine.x : avatarX + avatarSize + 30;
  const userLineY = layout.userLine.y !== null && layout.userLine.y !== undefined ? layout.userLine.y : avatarY + avatarSize / 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${layout.userLine.size}px ${font}`;
  ctx.fillText(`@${user.username}'s Rank`, userLineX, userLineY);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${layout.headline.size}px ${font}`;
  ctx.fillText(`Level ${level}`, layout.headline.x, layout.headline.y);

  ctx.fillStyle = "#d9d9d9";
  ctx.font = `bold ${layout.subline.size}px ${font}`;
  ctx.fillText(`Total XP Earned: ${totalXp}`, layout.subline.x, layout.subline.y);

  const needed = xpForLevel(level);
  const pct = Math.max(0, Math.min(1, currentXp / needed));
  const barW = layout.progressBar.width;
  const barH = layout.progressBar.height;
  const barX = layout.progressBar.x - barW / 2;
  const barY = layout.progressBar.y;

  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  roundRectPath(ctx, barX, barY, barW, barH, 10);
  ctx.fill();

  ctx.fillStyle = style.barColor || "#57F287";
  roundRectPath(ctx, barX, barY, Math.max(barH, barW * pct), barH, 10);
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 4;
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${layout.xpText.size}px ${font}`;
  ctx.fillText(`${currentXp} / ${needed} XP to level ${level + 1}`, layout.xpText.x, layout.xpText.y);
  ctx.restore();

  return canvas.encode("png");
}

async function announceLevelUp(user, guild, oldLevel, newLevel, currentXp) {
  try {
    const channel = (await getChannelSafe(guild, settings.levelUpChannelId, "Level-up channel"))
      || guild.systemChannel
      || guild.channels.cache.find(c => c.isTextBased && c.isTextBased());

    if (!channel) {
      console.error("❌ No level-up channel found and no systemChannel fallback exists either.");
      return;
    }

    console.log(`🎉 ${user.tag} leveled up ${oldLevel} → ${newLevel} — sending card to #${channel.name} (${channel.id})`);

    const buffer = await generateLevelUpImage(user, oldLevel, newLevel, currentXp);

    const embed = new EmbedBuilder()
      .setColor(settings.embedColor || "#57F287")
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ dynamic: true, size: 256 }) })
      .setDescription(`${user} just leveled up to **Level ${newLevel}**! 🎉`)
      .setImage("attachment://levelup.png")
      .setFooter({ text: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
      .setTimestamp();

    await channel.send({ content: `<@${user.id}>`, embeds: [embed], files: [{ attachment: buffer, name: "levelup.png" }] });
  } catch (err) {
    console.error("Failed to send level up image:", err);
  }
}

const messageCounts = new Map();

const voiceJoinTimes = new Map();
const VOICE_XP_PER_MINUTE = 10;

// ==========================================================
// ===== CLIENT SETUP =====
// ==========================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites
  ],
  partials: [Partials.Channel]
});

const commands = [

  new SlashCommandBuilder()
    .setName("verifysetup")
    .setDescription("Post the Verify panel using the current Settings > Verify Panel config"),

  new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("Open the moderation dashboard (admin Only)"),

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Check your level and XP progress")
    .addUserOption(option => option.setName("user").setDescription("Check someone else's rank").setRequired(false)),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View a leaderboard")
    .addStringOption(option =>
      option.setName("type")
        .setDescription("Which leaderboard to show")
        .setRequired(false)
        .addChoices(
          { name: "Level", value: "level" },
          { name: "XP", value: "xp" },
          { name: "Invites", value: "invites" },
          { name: "Messages", value: "messages" }
        )
    ),

  new SlashCommandBuilder()
    .setName("leaderboards")
    .setDescription("Post (or repost) the auto-updating leaderboard panel (admin only)"),

  new SlashCommandBuilder()
    .setName("submitpanel")
    .setDescription("Post the Submit a Request panel (admin only)"),

  new SlashCommandBuilder()
    .setName("giveaways")
    .setDescription("View active or ended XP giveaways")

].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

client.once(Events.ClientReady, async () => {
  try {
    console.log("⚡ Registering GLOBAL commands (shows on the bot's profile)...");
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log("✅ Global commands registered.");

    console.log("🧹 Clearing guild-scoped commands in every server I'm in (prevents duplicate entries)...");
    for (const guild of client.guilds.cache.values()) {
      try {
        await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guild.id), { body: [] });
      } catch (err) {
        console.log(`Could not clear guild commands for ${guild.name} (${guild.id}):`, err.message);
      }
    }
    console.log("✅ Guild-scoped duplicates cleared everywhere.");

    console.log(`✅ Logged in as ${client.user.tag}`);
  } catch (error) {
    console.error(error);
  }

  updateBotStatus();

  for (const guild of client.guilds.cache.values()) {
    try {
      const guildInvites = await guild.invites.fetch();
      invitesCache.set(guild.id, new Map(guildInvites.map(inv => [inv.code, inv.uses])));
      const result = await resyncInvitesForGuild(guild, guildInvites);
      if (result && !result.error) {
        console.log(`🔄 Resynced invites for ${guild.name}: updated ${result.changed} member(s).`);
      }
    } catch (err) {
      console.log(`Could not cache/resync invites for ${guild.name} (missing Manage Server permission?):`, err.message);
    }
  }

  const leaderboardGuild = process.env.GUILD_ID
    ? client.guilds.cache.get(process.env.GUILD_ID)
    : client.guilds.cache.first();

  if (leaderboardGuild) {
    await postOrRefreshLeaderboard(leaderboardGuild);
    scheduleLeaderboardRotation(leaderboardGuild);
    scheduleLeaderboardCountdown(leaderboardGuild);
    rehydrateGiveawayTimers(leaderboardGuild);
  } else {
    console.error("❌ Could not resolve a guild to post the leaderboard panel in.");
  }
});

// ==========================================================
// ===== INVITE TRACKING =====
// ==========================================================

async function resyncInvitesForGuild(guild, prefetchedInvites = null) {
  try {
    const guildInvites = prefetchedInvites || await guild.invites.fetch();
    const totals = {};
    for (const inv of guildInvites.values()) {
      if (!inv.inviter) continue;
      totals[inv.inviter.id] = (totals[inv.inviter.id] || 0) + (inv.uses || 0);
    }
    let changed = 0;
    for (const [uid, count] of Object.entries(totals)) {
      if ((invites[uid] || 0) < count) {
        invites[uid] = count;
        changed++;
      }
    }
    saveInvites();
    return { changed, totalTracked: Object.keys(totals).length };
  } catch (err) {
    console.error("Failed to resync invites:", err.message);
    return { error: err.message };
  }
}

client.on(Events.InviteCreate, invite => {
  const cache = invitesCache.get(invite.guild.id) || new Map();
  cache.set(invite.code, invite.uses || 0);
  invitesCache.set(invite.guild.id, cache);
});

client.on(Events.InviteDelete, invite => {
  const cache = invitesCache.get(invite.guild.id);
  if (cache) cache.delete(invite.code);
});

client.on(Events.GuildMemberAdd, async member => {
  try {
    const guild = member.guild;
    const oldCache = invitesCache.get(guild.id) || new Map();
    const newInvites = await guild.invites.fetch();
    const newCache = new Map(newInvites.map(inv => [inv.code, inv.uses]));
    invitesCache.set(guild.id, newCache);

    const usedInvite = newInvites.find(inv => (oldCache.get(inv.code) || 0) < inv.uses);

    let inviterId = null;
    let inviteCount = null;
    if (usedInvite && usedInvite.inviter) {
      inviterId = usedInvite.inviter.id;
      invites[inviterId] = (invites[inviterId] || 0) + 1;
      inviteCount = invites[inviterId];
      saveInvites();

      const accountAgeMs = Date.now() - member.user.createdTimestamp;
      if (accountAgeMs < FAKE_ACCOUNT_AGE_MS) {
        invitesFake[inviterId] = (invitesFake[inviterId] || 0) + 1;
        saveInvitesFake();
      }
    }

    invitedBy[member.id] = inviterId;
    saveInvitedBy();

    const logChannel = await getChannelSafe(guild, settings.inviteLogChannelId, "Invite log channel");
    if (logChannel) {
      const desc = inviterId
        ? `${settings.joinEmoji} ${member.user} has been invited by <@${inviterId}> and has now **${inviteCount}** invite${inviteCount === 1 ? "" : "s"}.`
        : `${settings.joinEmoji} ${member.user} joined, but I couldn't determine who invited them.`;
      logChannel.send({ embeds: [createEmbed(member.user, guild, desc, "#57F287", member.user.displayAvatarURL({ dynamic: true, size: 256 }))] })
        .catch(err => console.error("❌ Failed to send join/invite log message:", err.message));
    }
  } catch (err) {
    console.log("Could not resolve which invite was used for a new member:", err.message);
  }
});

client.on(Events.GuildMemberRemove, async member => {
  try {
    const guild = member.guild;
    const inviterId = invitedBy[member.id];
    delete invitedBy[member.id];
    saveInvitedBy();

    if (inviterId) {
      invitesLeft[inviterId] = (invitesLeft[inviterId] || 0) + 1;
      saveInvitesLeft();
    }

    const logChannel = await getChannelSafe(guild, settings.inviteLogChannelId, "Invite log channel");
    if (logChannel) {
      const inviterMention = inviterId ? `<@${inviterId}>` : "an unknown inviter";
      const desc = `${settings.leaveEmoji} **${member.user.tag}** left the server, they were invited by ${inviterMention} ! ClippingBase.`;
      logChannel.send({ embeds: [createEmbed(member.user, guild, desc, "#ED4245", member.user.displayAvatarURL({ dynamic: true, size: 256 }))] })
        .catch(err => console.error("❌ Failed to send leave/invite log message:", err.message));
    }
  } catch (err) {
    console.log("Error handling member leave for invite tracking:", err.message);
  }
});

// ==========================================================
// ===== WORD FILTERS =====
// ==========================================================

const BUILTIN_FILTERS = {
  profanity: [
    "fuck", "fucking", "shit", "bullshit", "bitch", "bitches",
    "asshole", "dick", "dickhead", "dickride", "stfu", "jerk",
    "slut", "wtf", "nigger", "nigga", "shii", "shiii",
  ],
  harassment: [
    "idiot", "moron", "loser", "worthless", "pathetic",
    "trash", "garbage", "braindead", "dumbass"
  ],
  bullying: [
    "you suck", "you're trash", "you are trash", "nobody likes you",
    "everyone hates you", "you're annoying", "you are annoying"
  ],
  spam: [
    "@everyonej", "@herej", "free nnitro", "free robux",
    "free vvbucks", "discord nnitro free"
  ]
};

function getActiveFilters() {
  const merged = {};
  for (const cat of Object.keys(BUILTIN_FILTERS)) {
    merged[cat] = [...BUILTIN_FILTERS[cat], ...(customFilters[cat] || [])];
  }
  return merged;
}

function createEmbed(user, guild, description, color = null, thumbnailURL = null) {
  const embed = new EmbedBuilder()
    .setColor(color || settings.embedColor || "#5865F2")
    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ dynamic: true, size: 1024 }) })
    .setDescription(description)
    .setFooter({ text: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
    .setTimestamp();
  if (thumbnailURL) embed.setThumbnail(thumbnailURL);
  return embed;
}

function embedReplyOptions(user, guild, description, color = "#5865F2", extra = {}) {
  return { embeds: [createEmbed(user, guild, description, color)], ...extra };
}

// ==========================================================
// ===== VERIFY PANEL BUILDER =====
// ==========================================================

function buildVerifyPanelPayload() {
  const vp = settings.verifyPanel;
  const embed = new EmbedBuilder()
    .setTitle("🔐 Verification")
    .setColor(vp.color || settings.embedColor || "#2B2D31");

  if (vp.description && vp.description.trim()) embed.setDescription(vp.description);
  if (vp.image) embed.setImage(vp.image);

  const button = new ButtonBuilder()
    .setCustomId("verify_button")
    .setLabel(settings.buttonLabels.verify || "Verify")
    .setStyle(resolveButtonStyle(vp.buttonColor));
  applyButtonEmoji(button, vp.buttonEmoji);

  const row = new ActionRowBuilder().addComponents(button);
  return { embeds: [embed], components: [row] };
}

// ==========================================================
// ===== SUBMIT-A-REQUEST FORMS =====
// ==========================================================

const submitModals = {
  submit_campaign: {
    id: "modal_campaign",
    title: "Promotion Campaign Request",
    fields: [
      { id: "contact", label: "Contact (Phone/Email)", style: TextInputStyle.Short, placeholder: "+1234567890, email@example.com" },
      { id: "promo", label: "What are we promoting? + assets", style: TextInputStyle.Paragraph, placeholder: "What's being promoted, plus links to assets" },
      { id: "requirements", label: "Requirements (pages/niches)", style: TextInputStyle.Paragraph, placeholder: "Page types, target niches" },
      { id: "contentreqs", label: "Content requirements", style: TextInputStyle.Paragraph, placeholder: "Audio specs, content guidelines, watermark details, etc." },
      { id: "budgetcpm", label: "Budget & CPM", style: TextInputStyle.Short, placeholder: "e.g. $1000 total budget, $2.50 CPM" }
    ]
  },
  submit_service: {
    id: "modal_service",
    title: "Service Provider Application",
    fields: [
      { id: "contact", label: "Contact (Phone/Email)", style: TextInputStyle.Short, placeholder: "+1234567890, email@example.com" },
      { id: "service", label: "Explain the service", style: TextInputStyle.Paragraph, placeholder: "What it's about and how it works" },
      { id: "price", label: "Price & payment terms", style: TextInputStyle.Short, placeholder: "e.g. $100/project - payment upfront" },
      { id: "evidence", label: "Evidence of past work/results", style: TextInputStyle.Paragraph, placeholder: "Screenshots, links, etc." },
      { id: "other", label: "Anything else we should know?", style: TextInputStyle.Paragraph }
    ]
  },
  submit_moderator: {
    id: "modal_moderator",
    title: "Content Moderator Application",
    fields: [
      { id: "contact", label: "Contact (Phone/Email)", style: TextInputStyle.Short, placeholder: "+1234567890, email@example.com" },
      { id: "modexp", label: "Moderation experience", style: TextInputStyle.Paragraph },
      { id: "bestfit", label: "What makes you the best choice?", style: TextInputStyle.Paragraph },
      { id: "scenario", label: "Rule violation scenario", style: TextInputStyle.Paragraph, placeholder: "If a video breaks a campaign rule, what would you do?" },
      { id: "availability", label: "Weekly availability", style: TextInputStyle.Short }
    ]
  },
  submit_outreacher: {
    id: "modal_outreacher",
    title: "Outreacher Application",
    fields: [
      { id: "info", label: "Name / Timezone / Country", style: TextInputStyle.Short },
      { id: "fit", label: "Why would you be a good fit?", style: TextInputStyle.Paragraph, placeholder: "Skills/experience you bring" },
      { id: "activity", label: "Active hours & availability", style: TextInputStyle.Paragraph, placeholder: "Hours/day online, general availability, peak hours" },
      { id: "strategy", label: "Past outreach + strategy", style: TextInputStyle.Paragraph, placeholder: "Done outreach before? How would you approach creators?" },
      { id: "rejection", label: "Handling hesitant creators", style: TextInputStyle.Paragraph, placeholder: "How do you turn hesitation into an opportunity?" }
    ]
  }
};

// ==========================================================
// ===== SUBMIT PANEL BUILDER + TEXT EDITOR =====
// ==========================================================

function parseChannelId(raw) {
  return (raw || "").replace(/[<#>]/g, "").trim();
}

function resolveButtonStyle(colorName) {
  switch ((colorName || "").toLowerCase()) {
    case "green": case "success": return ButtonStyle.Success;
    case "red": case "danger": return ButtonStyle.Danger;
    case "blue": case "blurple": case "primary": return ButtonStyle.Primary;
    case "grey": case "gray": case "secondary": return ButtonStyle.Secondary;
    default: return ButtonStyle.Secondary;
  }
}

const SUBMIT_TYPE_ORDER = ["campaign", "service", "moderator", "outreacher"];
const OPEN_OPTIONS_BUTTON_ID = "open_submit_options";
const SUBMIT_TYPE_SELECT_ID = "submit_type_select";

// The main Submit Panel embed shows ONLY what you typed via "--submit"
// (title/description) plus the footer/image if set — no auto marketing
// copy, no per-type fields. A single "Open Options" button opens a dropdown
// with the 4 application types (Settings > Submit Panel + Buttons/Emojis
// still control each option's label/color/emoji; per-type "text" becomes
// that option's description in the dropdown, shown only if you've set one).
function buildSubmitPanelPayload() {
  const embed = new EmbedBuilder().setColor(settings.submitPanelColor || settings.embedColor || "#2B2D31");

  if (panelConfig.title && panelConfig.title.trim()) embed.setTitle(panelConfig.title);
  if (panelConfig.description && panelConfig.description.trim()) embed.setDescription(panelConfig.description);
  if (panelConfig.footer && panelConfig.footer.trim()) embed.setFooter({ text: panelConfig.footer });
  if (settings.images.submit) embed.setImage(settings.images.submit);

  const openButton = new ButtonBuilder()
    .setCustomId(OPEN_OPTIONS_BUTTON_ID)
    .setLabel(settings.buttonLabels.openOptions || "Open Options")
    .setStyle(ButtonStyle.Primary);
  applyButtonEmoji(openButton, "📋");

  const row = new ActionRowBuilder().addComponents(openButton);

  return { embeds: [embed], components: [row] };
}

// Builds the ephemeral dropdown shown after clicking "Open Options" — only
// lists application types that are currently open (Settings > Submit Panel
// toggles).
function buildSubmitOptionsPayload(guild) {
  const openTypes = SUBMIT_TYPE_ORDER.filter(key => settings.open[key] !== false);

  if (openTypes.length === 0) {
    return { content: null, embeds: [createEmbed({ tag: "System", displayAvatarURL: () => null }, guild, "🚫 We're not currently accepting any submissions right now.", "#ED4245")], components: [] };
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(SUBMIT_TYPE_SELECT_ID)
    .setPlaceholder("Choose the type of request...")
    .addOptions(openTypes.map(key => {
      const t = panelConfig.types[key];
      const option = { label: t.buttonLabel, value: key };
      const emojiObj = emojiToOptionObject(getTypeEmoji(key));
      if (emojiObj) option.emoji = emojiObj;
      if (t.text && t.text.trim()) option.description = t.text.slice(0, 100);
      return option;
    }));

  return { embeds: [], components: [new ActionRowBuilder().addComponents(menu)] };
}

// ------------------------------------------------------------------
// --submit text editor: whatever text you type (after stripping the
// "--submit" token(s) and trimming only the leading/trailing whitespace)
// becomes the ENTIRE embed description on the Submit Panel — verbatim,
// internal spacing/newlines/punctuation untouched. Nothing else about the
// panel (footer, per-type dropdown labels/colors/emojis) is touched by
// this — those are edited from Settings instead.
// ------------------------------------------------------------------

function parsePanelMessage(rawContent) {
  return rawContent.replace(/--submit/gi, "").trim();
}

// helper used by several Settings modals to push a live edit to whichever
// panel message is already posted, so admins see changes instantly.
async function refreshPostedPanel(channelId, messageId, payload) {
  if (!channelId || !messageId) return false;
  try {
    const ch = await client.channels.fetch(channelId);
    const msg = await ch.messages.fetch(messageId);
    await msg.edit(payload);
    return true;
  } catch (err) {
    console.log("Could not refresh posted panel:", err.message);
    return false;
  }
}

// ==========================================================
// ===== DASHBOARD BUILDER =====
// ==========================================================

function buildDashboardEmbed(guild) {
  const recentJoins = guild.members.cache
    .sort((a, b) => b.joinedTimestamp - a.joinedTimestamp)
    .first(5)
    .map(m => `• ${m.user.tag}`)
    .join("\n") || "No data";

  const pending = submissions
    .filter(s => s.status === "pending")
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5);

  const submissionsValue = pending.length
    ? pending.map((s, i) => `**#${i + 1}** ${s.type} — ${s.userTag}`).join("\n")
    : "No pending submissions.";

  const statusValue = Object.keys(TYPE_DISPLAY_NAMES).map(key => {
    const open = settings.open[key] !== false;
    return `${open ? "✅" : "🚫"} ${TYPE_DISPLAY_NAMES[key]}`;
  }).join("\n");

  const embed = new EmbedBuilder()
    .setTitle("🛡️ Moderation Dashboard")
    .setColor(settings.embedColor || "#5865F2")
    .addFields(
      { name: "👥 Members", value: `\`${guild.memberCount}\``, inline: true },
      { name: "⛔ Bans", value: `\`${stats.totalBans}\``, inline: true },
      { name: "📤 Kicks", value: `\`${stats.totalKicks}\``, inline: true },
      { name: "✅ Verifications", value: `\`${stats.totalVerifications}\``, inline: true },
      { name: "⚠️ Word Filter Hits", value: `\`${stats.wordFilterHits}\``, inline: true },
      { name: "📨 Appeals", value: `\`${stats.appeals}\``, inline: true },
      { name: "Recent Joins:", value: recentJoins, inline: false },
      { name: "📋 Pending Submissions", value: submissionsValue, inline: false },
      { name: "🔧 Application Status", value: statusValue, inline: false }
    )
    .setFooter({ text: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
    .setTimestamp();

  const rows = [];

  if (pending.length > 0) {
    const viewButtons = pending.map((s, i) =>
      new ButtonBuilder().setCustomId(`view_submission_${s.id}`).setLabel(`View #${i + 1}`).setStyle(ButtonStyle.Primary)
    );
    rows.push(new ActionRowBuilder().addComponents(viewButtons));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("history_page_0").setLabel("📜 History").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("open_settings").setLabel("⚙️ Settings").setStyle(ButtonStyle.Secondary)
  ));

  return { embeds: [embed], components: rows };
}

// ==========================================================
// ===== SETTINGS — MAIN MENU (categorized) =====
// ==========================================================

function settingsFooter(guild) {
  return { text: guild.name, iconURL: guild.iconURL({ dynamic: true }) };
}

function buildSettingsMainEmbed(guild) {
  const embed = new EmbedBuilder()
    .setTitle("⚙️ Bot Settings")
    .setColor(settings.embedColor || "#48ff00")
    .setDescription("Pick a category below to view and edit that part of the bot.")
    .addFields(
      { name: "📁 Channels", value: "Level-up, leaderboard, mod-log, invite-log and announcement channels, plus an invite resync tool.", inline: false },
      { name: "🔘 Buttons", value: "Edit the text label on every button (Verify, Open Options, and each submit-panel type).", inline: false },
      { name: "😀 Emoji Buttons", value: "Verify / join / leave emoji, and the 4 submit-panel dropdown emojis. Leave any blank for no emoji.", inline: false },
      { name: "🎨 Default Embed Color", value: "The shared fallback color used for the dashboard, logs and other misc embeds.", inline: false },
      { name: "🔐 Verify Panel", value: "Image, embed color, description, button color and button emoji for the Verify panel.", inline: false },
      { name: "📥 Submit Panel", value: "Title, embed color and image/gif for the Submit-a-Request panel.", inline: false },
      { name: "🔗 Invite Links", value: "Turn the Discord invite-link filter on or off.", inline: false },
      { name: "🏆 Leaderboard Style", value: "Per-type label/emoji/color, rank icon, rows shown, rotation interval and panel image.", inline: false },
      { name: "🎉 Level-Up Card", value: "Background image/gif, progress bar color, font, headline text, and element positions.", inline: false },
      { name: "✨ XP Settings", value: "XP per message trigger, and hosting/ending XP Giveaways.", inline: false },
      { name: "🚫 Filter Words", value: "Add or remove custom words the auto-moderator watches for.", inline: false }
    )
    .setFooter(settingsFooter(guild))
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("settings_channels").setLabel("Channels").setEmoji("📁").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("settings_buttons").setLabel("Buttons").setEmoji("🔘").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("settings_emojis").setLabel("Emoji Buttons").setEmoji("😀").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("settings_embedcolor").setLabel("Default Embed Color").setEmoji("🎨").setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("settings_verifypanel").setLabel("Verify Panel").setEmoji("🔐").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("settings_submitpanel").setLabel("Submit Panel").setEmoji("📥").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("settings_invitelinks").setLabel("Invite Links").setEmoji("🔗").setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("settings_leaderboardstyle").setLabel("Leaderboard Style").setEmoji("🏆").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("settings_levelupcard").setLabel("Level-Up Card").setEmoji("🎉").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("settings_xp").setLabel("XP Settings").setEmoji("✨").setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("settings_filterwords").setLabel("Filter Words").setEmoji("🚫").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("back_to_dashboard").setLabel("Dashboard").setEmoji("🔙").setStyle(ButtonStyle.Secondary)
    )
  ];

  return { embeds: [embed], components: rows };
}

const BACK_TO_SETTINGS_ROW = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("settings_back_main").setLabel("🔙 Settings").setStyle(ButtonStyle.Secondary)
);

function buildChannelsSettingsEmbed(guild) {
  const embed = new EmbedBuilder()
    .setTitle("📁 Channels")
    .setColor(settings.embedColor || "#48ff00")
    .addFields(
      { name: "🎉 Level-Up Channel", value: `<#${settings.levelUpChannelId}>`, inline: true },
      { name: "🏆 Leaderboard Channel", value: `<#${leaderboardState.channelId}>`, inline: true },
      { name: "🛡️ Moderation Log Channel", value: `<#${settings.logChannelId}>`, inline: true },
      { name: "📨 Invite Log Channel", value: `<#${settings.inviteLogChannelId}>`, inline: true },
      { name: "📢 Announcement Channel", value: `<#${settings.announcementChannelId}>`, inline: true }
    )
    .setFooter(settingsFooter(guild))
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("edit_levelup_channel").setLabel("Level-Up Channel").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("edit_leaderboard_channel").setLabel("Leaderboard Channel").setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("edit_log_channel").setLabel("Log Channel").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("edit_invite_log_channel").setLabel("Invite Log Channel").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("edit_announcement_channel").setLabel("Announcement Channel").setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("resync_invites").setLabel("🔄 Resync Invites").setStyle(ButtonStyle.Secondary)
    ),
    BACK_TO_SETTINGS_ROW
  ];

  return { embeds: [embed], components: rows };
}

function buildButtonsSettingsEmbed(guild) {
  const embed = new EmbedBuilder()
    .setTitle("🔘 Buttons")
    .setColor(settings.embedColor || "#48ff00")
    .setDescription("Edit the text label shown on each button.")
    .addFields(
      { name: "✅ Verify Button", value: settings.buttonLabels.verify, inline: true },
      { name: "📋 Open Options Button", value: settings.buttonLabels.openOptions, inline: true },
      { name: "🚀 Campaign Button", value: panelConfig.types.campaign.buttonLabel, inline: true },
      { name: "🔧 Service Button", value: panelConfig.types.service.buttonLabel, inline: true },
      { name: "🛡️ Moderator Button", value: panelConfig.types.moderator.buttonLabel, inline: true },
      { name: "🤝 Outreacher Button", value: panelConfig.types.outreacher.buttonLabel, inline: true }
    )
    .setFooter(settingsFooter(guild))
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("modal_buttonlabel_verify").setLabel("Verify").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("modal_buttonlabel_openoptions").setLabel("Open Options").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("modal_buttonlabel_campaign").setLabel("Campaign").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("modal_buttonlabel_service").setLabel("Service").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("modal_buttonlabel_moderator").setLabel("Moderator").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("modal_buttonlabel_outreacher").setLabel("Outreacher").setStyle(ButtonStyle.Secondary)
    ),
    BACK_TO_SETTINGS_ROW
  ];

  return { embeds: [embed], components: rows };
}

function buildEmojiSettingsEmbed(guild) {
  const embed = new EmbedBuilder()
    .setTitle("😀 Emoji Buttons")
    .setColor(settings.embedColor || "#48ff00")
    .setDescription("Type/paste the emoji you want to use for each field. Works with normal emoji (🚀) or custom server emoji in `<:name:id>` / `<a:name:id>` format — type `\\:emojiname:` in any channel and send it to get the copyable code. **Leave the field blank and submit to remove the emoji entirely.**")
    .addFields(
      { name: "✅ Verify Button Emoji", value: settings.verifyPanel.buttonEmoji || "*(none)*", inline: true },
      { name: "📥 Join Emoji", value: settings.joinEmoji || "*(none)*", inline: true },
      { name: "📤 Leave Emoji", value: settings.leaveEmoji || "*(none)*", inline: true },
      { name: "Campaign Emoji", value: getTypeEmoji("campaign") || "*(none)*", inline: true },
      { name: "Service Emoji", value: getTypeEmoji("service") || "*(none)*", inline: true },
      { name: "Moderator Emoji", value: getTypeEmoji("moderator") || "*(none)*", inline: true },
      { name: "Outreacher Emoji", value: getTypeEmoji("outreacher") || "*(none)*", inline: true }
    )
    .setFooter(settingsFooter(guild))
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("edit_verify_emoji").setLabel("Verify").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("edit_join_emoji").setLabel("Join").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("edit_leave_emoji").setLabel("Leave").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("edit_campaign_emoji").setLabel("Campaign").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("edit_service_emoji").setLabel("Service").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("edit_moderator_emoji").setLabel("Moderator").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("edit_outreacher_emoji").setLabel("Outreacher").setStyle(ButtonStyle.Secondary)
    ),
    BACK_TO_SETTINGS_ROW
  ];

  return { embeds: [embed], components: rows };
}

function buildEmbedColorSettingsEmbed(guild) {
  const embed = new EmbedBuilder()
    .setTitle("🎨 Default Embed Color")
    .setColor(settings.embedColor || "#48ff00")
    .setDescription("Fallback color used for the dashboard, mod/invite logs and other misc embeds. Verify Panel and Submit Panel now have their own dedicated colors. Hex code, e.g. #5865F2.")
    .addFields({ name: "🎨 Default Embed Color", value: settings.embedColor || "#2B2D31", inline: true })
    .setFooter(settingsFooter(guild))
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("modal_embed_color").setLabel("Edit Default Color").setStyle(ButtonStyle.Primary)
    ),
    BACK_TO_SETTINGS_ROW
  ];

  return { embeds: [embed], components: rows };
}

function buildVerifyPanelSettingsEmbed(guild) {
  const vp = settings.verifyPanel;
  const embed = new EmbedBuilder()
    .setTitle("🔐 Verify Panel")
    .setColor(vp.color || "#48ff00")
    .setDescription("Everything shown on the Verify panel. If a live panel is already posted, edits here update it automatically.")
    .addFields(
      { name: "📝 Description", value: vp.description && vp.description.trim() ? vp.description : "*(none set)*", inline: false },
      { name: "🎨 Embed Color", value: vp.color, inline: true },
      { name: "🖼️ Image", value: vp.image ? "Set ✅" : "Not set", inline: true },
      { name: "🔘 Button Color", value: vp.buttonColor, inline: true },
      { name: "😀 Button Emoji", value: vp.buttonEmoji || "*(none)*", inline: true }
    )
    .setFooter(settingsFooter(guild))
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("modal_verifypanel_description").setLabel("Description").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("modal_verifypanel_color").setLabel("Embed Color").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("modal_verifypanel_image").setLabel("Image / GIF").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("modal_verifypanel_buttoncolor").setLabel("Button Color").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("modal_verifypanel_buttonemoji").setLabel("Button Emoji").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("post_verify_panel").setLabel("📤 Post/Update Panel").setStyle(ButtonStyle.Success)
    ),
    BACK_TO_SETTINGS_ROW
  ];

  return { embeds: [embed], components: rows };
}

function buildSubmitPanelSettingsEmbed(guild) {
  const statusValue = Object.keys(TYPE_DISPLAY_NAMES).map(key => {
    const open = settings.open[key] !== false;
    return `${TYPE_DISPLAY_NAMES[key]}: ${open ? "**ON** ✅" : "**OFF** 🚫"}`;
  }).join("\n");

  const embed = new EmbedBuilder()
    .setTitle("📥 Submit Panel")
    .setColor(settings.submitPanelColor || "#48ff00")
    .addFields(
      { name: "📝 Title", value: panelConfig.title && panelConfig.title.trim() ? panelConfig.title : "*(none set — use Edit Title, or `--submit <text>` in chat for the description)*", inline: false },
      { name: "🎨 Embed Color", value: settings.submitPanelColor, inline: true },
      { name: "🖼️ Image / GIF", value: settings.images.submit ? "Set ✅" : "Not set", inline: true },
      { name: "Application Types", value: statusValue, inline: false }
    )
    .setFooter(settingsFooter(guild))
    .setTimestamp();

  const toggleRow = new ActionRowBuilder().addComponents(
    Object.keys(TYPE_DISPLAY_NAMES).map(key => {
      const open = settings.open[key] !== false;
      return new ButtonBuilder()
        .setCustomId(`stoggle_${key}`)
        .setLabel(`${TYPE_DISPLAY_NAMES[key]}: ${open ? "ON" : "OFF"}`)
        .setStyle(open ? ButtonStyle.Success : ButtonStyle.Danger);
    })
  );

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("modal_submitpanel_title").setLabel("Title").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("modal_submitpanel_color").setLabel("Embed Color").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("modal_image_submit").setLabel("Image / GIF").setStyle(ButtonStyle.Secondary)
    ),
    toggleRow,
    BACK_TO_SETTINGS_ROW
  ];

  return { embeds: [embed], components: rows };
}

function buildInviteLinksSettingsEmbed(guild) {
  const embed = new EmbedBuilder()
    .setTitle("🔗 Invite Links")
    .setColor(settings.embedColor || "#48ff00")
    .setDescription("When ON, any message containing a Discord invite link (discord.gg/... or discord.com/invite/...) is deleted automatically, and the sender gets a DM explaining why.")
    .addFields({ name: "Status", value: settings.linkFilterEnabled ? "✅ ON" : "🚫 OFF", inline: false })
    .setFooter(settingsFooter(guild))
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("toggle_link_filter").setLabel(`Invite Links: ${settings.linkFilterEnabled ? "ON" : "OFF"}`).setStyle(settings.linkFilterEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
    ),
    BACK_TO_SETTINGS_ROW
  ];

  return { embeds: [embed], components: rows };
}

function buildLeaderboardStyleSettingsEmbed(guild) {
  const embed = new EmbedBuilder()
    .setTitle("🏆 Leaderboard Style")
    .setColor(settings.embedColor || "#48ff00")
    .setDescription("Edit the emoji and color used for each leaderboard type, the rank icon, how many rows show, the rotation interval, and an optional image/gif shown above every leaderboard.")
    .addFields(
      { name: "🔁 Rotation Interval", value: `Every **${settings.leaderboardRotationMinutes}** minute(s)`, inline: true },
      { name: "➤ Rank Icon", value: settings.leaderboardIcon ? `\`${settings.leaderboardIcon}\`` : "*(none — no icon shown)*", inline: true },
      { name: "🔢 Rows Displayed", value: `Top **${settings.leaderboardDisplayCount}**`, inline: true },
      { name: "🖼️ Panel Image / GIF", value: settings.images.leaderboard ? "Set ✅" : "Not set", inline: true }
    )
    .setFooter(settingsFooter(guild))
    .setTimestamp();

  const rows = [];
  const keys = Object.keys(settings.leaderboardStyles);
  for (const key of keys) {
    const s = settings.leaderboardStyles[key];
    embed.addFields({ name: `${s.emoji} ${s.label}`, value: `Color: \`${s.color}\``, inline: true });
  }

  rows.push(new ActionRowBuilder().addComponents(
    keys.map(key => new ButtonBuilder().setCustomId(`modal_lb_style_${key}`).setLabel(settings.leaderboardStyles[key].label).setStyle(ButtonStyle.Secondary))
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("modal_lb_rotation").setLabel("🔁 Rotation Interval").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("modal_lb_icon").setLabel("➤ Rank Icon").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("modal_image_leaderboard").setLabel("🖼️ Panel Image").setStyle(ButtonStyle.Primary)
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("lbcount_3").setLabel("Show Top 3").setStyle(settings.leaderboardDisplayCount === 3 ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("lbcount_10").setLabel("Show Top 10").setStyle(settings.leaderboardDisplayCount === 10 ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("lbcount_20").setLabel("Show Top 20").setStyle(settings.leaderboardDisplayCount === 20 ? ButtonStyle.Success : ButtonStyle.Secondary)
  ));
  rows.push(BACK_TO_SETTINGS_ROW);

  return { embeds: [embed], components: rows };
}

function buildLevelUpCardSettingsEmbed(guild) {
  const style = settings.levelUpStyle;
  const layout = getLevelUpLayout();
  const bgT = getBackgroundTransform();
  const embed = new EmbedBuilder()
    .setTitle("🎉 Level-Up Card")
    .setColor(settings.embedColor || "#48ff00")
    .setDescription("Controls the look of the Level-Up and /rank cards. Positions are in pixels on a 900x320 canvas (0,0 = top-left).")
    .addFields(
      { name: "🖼️ Background Image / GIF", value: settings.images.levelup ? "Set ✅" : "Not set (uses default gradient)", inline: false },
      { name: "📊 Progress Bar Color", value: `\`${style.barColor}\``, inline: true },
      { name: "🔤 Font", value: `\`${style.font}\``, inline: true },
      { name: "📢 Headline Text", value: style.headline, inline: false },
      { name: "🖼️ Background Position/Zoom", value: `offsetX: \`${bgT.offsetX}\`, offsetY: \`${bgT.offsetY}\`, zoom: \`${bgT.zoom}\``, inline: false },
      { name: "👤 Avatar", value: `x:${layout.avatar.x} y:${layout.avatar.y} size:${layout.avatar.size}`, inline: true },
      { name: "🏷️ User Line", value: `x:${layout.userLine.x != null ? layout.userLine.x : "auto"} y:${layout.userLine.y != null ? layout.userLine.y : "auto"} size:${layout.userLine.size}`, inline: true },
      { name: "🅰️ Headline Pos", value: `x:${layout.headline.x} y:${layout.headline.y} size:${layout.headline.size}`, inline: true },
      { name: "🔢 Sub Line Pos", value: `x:${layout.subline.x} y:${layout.subline.y} size:${layout.subline.size}`, inline: true },
      { name: "📶 Progress Bar Pos", value: `x(center):${layout.progressBar.x} y:${layout.progressBar.y} w:${layout.progressBar.width} h:${layout.progressBar.height}`, inline: true },
      { name: "🔠 XP Text Pos", value: `x:${layout.xpText.x} y:${layout.xpText.y} size:${layout.xpText.size}`, inline: true }
    )
    .setFooter(settingsFooter(guild))
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("modal_image_levelup").setLabel("🖼️ Background Image/GIF").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("modal_levelup_bgposition").setLabel("Background Position").setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("modal_levelup_barcolor").setLabel("Bar Color").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("modal_levelup_font").setLabel("Font").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("modal_levelup_headline").setLabel("Headline Text").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("modal_levelup_layout1").setLabel("📐 Layout: Avatar/User/Headline").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("modal_levelup_layout2").setLabel("📐 Layout: Sub/Bar/XP Text").setStyle(ButtonStyle.Primary)
    ),
    BACK_TO_SETTINGS_ROW
  ];

  return { embeds: [embed], components: rows };
}

function buildXpSettingsEmbed(guild) {
  const active = xpGiveaways.filter(g => g.status === "active" || g.status === "scheduled");
  const activeValue = active.length
    ? active.map(g => {
        const winners = g.winnerCount && g.winnerCount > 1 ? `top **${g.winnerCount}** split` : "**1** winner";
        const state = g.status === "scheduled" ? `⏳ starts <t:${Math.floor(g.startAt / 1000)}:R>` : "🟢 active";
        const ends = g.endAt ? `, ends <t:${Math.floor(g.endAt / 1000)}:R>` : "";
        return `**#${g.id}** — $${g.amount} reward (${winners}), needs **${g.xpGoal}** XP, ${state}${ends}, announces in <#${g.channelId}>`;
      }).join("\n")
    : "No active or scheduled giveaways.";

  const embed = new EmbedBuilder()
    .setTitle("✨ XP Settings")
    .setColor(settings.embedColor || "#48ff00")
    .addFields(
      { name: "⚡ XP Per Trigger", value: `**${settings.xp.perTrigger}** XP`, inline: true },
      { name: "💬 Messages Required", value: `Every **${settings.xp.messagesPerTrigger}** message(s) sent`, inline: true },
      { name: "🎁 Active/Scheduled XP Giveaways", value: activeValue, inline: false }
    )
    .setFooter(settingsFooter(guild))
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("modal_xp_rate").setLabel("Edit XP Rate").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("modal_xp_giveaway_start").setLabel("🎁 Start Giveaway").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("xp_giveaway_end").setLabel("🏁 End Giveaway").setStyle(ButtonStyle.Danger)
    ),
    BACK_TO_SETTINGS_ROW
  ];

  return { embeds: [embed], components: rows };
}

function buildFilterWordsSettingsEmbed(guild) {
  const embed = new EmbedBuilder()
    .setTitle("🚫 Filter Words")
    .setColor(settings.embedColor || "#48ff00")
    .setDescription("Categories: profanity, harassment, bullying, spam. **Built-in** words are always active and can't be removed here. **Custom** words are ones added via Settings.")
    .setFooter(settingsFooter(guild))
    .setTimestamp();

  for (const cat of ["profanity", "harassment", "bullying", "spam"]) {
    const builtin = BUILTIN_FILTERS[cat] || [];
    const custom = customFilters[cat] || [];
    const builtinStr = builtin.length ? builtin.map(w => `\`${w}\``).join(", ") : "None";
    const customStr = custom.length ? custom.map(w => `\`${w}\``).join(", ") : "No custom words yet.";
    embed.addFields({ name: `${cat} — Built-in`, value: builtinStr, inline: false });
    embed.addFields({ name: `${cat} — Custom`, value: customStr, inline: false });
  }

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("modal_add_filter_word").setLabel("➕ Add Word").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("modal_remove_filter_word").setLabel("➖ Remove Word").setStyle(ButtonStyle.Danger)
    ),
    BACK_TO_SETTINGS_ROW
  ];

  return { embeds: [embed], components: rows };
}

function buildHistoryEmbed(guild, page) {
  const historyItems = submissions
    .filter(s => s.status === "approved" || s.status === "declined")
    .sort((a, b) => b.timestamp - a.timestamp);

  const totalApproved = submissions.filter(s => s.status === "approved").length;
  const totalDeclined = submissions.filter(s => s.status === "declined").length;

  const pageSize = 3;
  const totalPages = Math.max(1, Math.ceil(historyItems.length / pageSize));
  const clampedPage = Math.min(Math.max(page, 0), totalPages - 1);
  const pageItems = historyItems.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  const embed = new EmbedBuilder()
    .setTitle("📜 Submission History")
    .setColor(settings.embedColor || "#48ff00")
    .addFields(
      { name: "✅ Total Approved", value: `\`${totalApproved}\``, inline: true },
      { name: "❌ Total Declined", value: `\`${totalDeclined}\``, inline: true }
    )
    .setFooter({ text: `Page ${clampedPage + 1} / ${totalPages} • ${guild.name}`, iconURL: guild.iconURL({ dynamic: true }) })
    .setTimestamp();

  if (pageItems.length === 0) {
    embed.addFields({ name: "No history yet", value: "Nothing has been approved or declined." });
  } else {
    pageItems.forEach(item => {
      embed.addFields({
        name: `${item.status === "approved" ? "✅" : "❌"} ${item.type}`,
        value: `**User:** ${item.userTag}\n**Status:** ${item.status}\n**Date:** <t:${Math.floor(item.timestamp / 1000)}:R>`
      });
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`history_page_${clampedPage - 1}`).setLabel("◀ Prev").setStyle(ButtonStyle.Secondary).setDisabled(clampedPage === 0),
    new ButtonBuilder().setCustomId(`history_page_${clampedPage + 1}`).setLabel("Next ▶").setStyle(ButtonStyle.Secondary).setDisabled(clampedPage >= totalPages - 1),
    new ButtonBuilder().setCustomId("back_to_dashboard").setLabel("🔙 Dashboard").setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

// ==========================================================
// ===== LEADERBOARD PANEL (Level / XP / Invites / Messages) =====
// ==========================================================

function getLeaderboardEntries(type) {
  const limit = Math.max(1, Number(settings.leaderboardDisplayCount) || 10);

  if (type === "level") {
    return Object.entries(levels)
      .map(([userId, d]) => ({ userId, primary: d.level, secondary: d.xp }))
      .filter(e => e.primary > 0 || e.secondary > 0)
      .sort((a, b) => b.primary - a.primary || b.secondary - a.secondary)
      .slice(0, limit);
  }

  if (type === "xp") {
    return Object.entries(levels)
      .map(([userId, d]) => ({ userId, primary: d.totalXp || 0, secondary: d.level }))
      .filter(e => e.primary > 0)
      .sort((a, b) => b.primary - a.primary)
      .slice(0, limit);
  }

  if (type === "invites") {
    return Object.entries(invites)
      .map(([userId, total]) => {
        const left = invitesLeft[userId] || 0;
        const current = Math.max(0, total - left);
        return { userId, total, left, primary: current, secondary: total };
      })
      .filter(e => e.total > 0)
      .sort((a, b) => b.primary - a.primary || b.total - a.total)
      .slice(0, limit);
  }

  return Object.entries(messageStats)
    .map(([userId, count]) => ({ userId, primary: count, secondary: 0 }))
    .filter(e => e.primary > 0)
    .sort((a, b) => b.primary - a.primary)
    .slice(0, limit);
}

function leaderboardBullet(rank) {
  const icon = settings.leaderboardIcon;
  return icon && icon.trim() ? `${icon}  ${rank}.` : `${rank}.`;
}

function formatLeaderboardLine(type, rank, entry) {
  const mention = `<@${entry.userId}>`;
  const bullet = leaderboardBullet(rank);

  if (type === "level") return `${bullet}  ${mention} • Level ${entry.primary} ┃${entry.secondary} XP┃`;
  if (type === "xp") return `${bullet}  ${mention} • ${entry.primary} XP ┃Level ${entry.secondary}┃`;
  if (type === "invites") return `${bullet}  ${mention} • ${entry.primary} invite${entry.primary === 1 ? "" : "s"} ┃${entry.total} Total┃ ${entry.left} left ┃`;
  return `${bullet}  ${mention} • ${entry.primary} message${entry.primary === 1 ? "" : "s"}`;
}

function buildLeaderboardEmbeds(guild, type) {
  const meta = settings.leaderboardStyles[type];
  const entries = getLeaderboardEntries(type);

  const description = entries.length
    ? entries.map((entry, i) => formatLeaderboardLine(type, i + 1, entry)).join("\n\n")
    : "No data yet.";

  const remainingMs = leaderboardState.nextRotationAt ? Math.max(0, leaderboardState.nextRotationAt - Date.now()) : settings.leaderboardRotationMinutes * 60 * 1000;
  const footerText = `Updating in ${formatCountdown(remainingMs)} • ${guild.name}`;

  const mainEmbed = new EmbedBuilder()
    .setTitle(`${meta.emoji} ${meta.label}`)
    .setColor(meta.color || settings.embedColor || "#5865F2")
    .setDescription(description)
    .setFooter({ text: footerText, iconURL: guild.iconURL({ dynamic: true }) })
    .setTimestamp();

  const embeds = [];
  if (settings.images.leaderboard) {
    embeds.push(new EmbedBuilder().setColor(meta.color || settings.embedColor || "#5865F2").setImage(settings.images.leaderboard));
  }
  embeds.push(mainEmbed);

  return embeds;
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function buildLeaderboardComponents(type, includePrevNext = true) {
  const types = Object.keys(settings.leaderboardStyles);
  const idx = types.indexOf(type);
  const prevType = types[(idx - 1 + types.length) % types.length];
  const nextType = types[(idx + 1) % types.length];

  const buttons = [];
  if (includePrevNext) {
    buttons.push(new ButtonBuilder().setCustomId(`lb_prev_${prevType}`).setLabel("◀ Prev").setStyle(ButtonStyle.Secondary));
    buttons.push(new ButtonBuilder().setCustomId(`lb_next_${nextType}`).setLabel("Next ▶").setStyle(ButtonStyle.Secondary));
  }
  buttons.push(new ButtonBuilder().setCustomId("lb_search").setLabel(" Search").setStyle(ButtonStyle.Success));

  return [new ActionRowBuilder().addComponents(...buttons)];
}

function renderLeaderboardMessage(guild, type, opts = {}) {
  const embeds = buildLeaderboardEmbeds(guild, type);
  const components = buildLeaderboardComponents(type, opts.includePrevNext !== false);
  return { payload: { embeds, content: "", components } };
}

async function postOrRefreshLeaderboard(guild) {
  try {
    const channel = await client.channels.fetch(leaderboardState.channelId).catch(() => null);
    if (!channel) {
      console.error(`❌ Leaderboard channel ${leaderboardState.channelId} not found.`);
      return;
    }

    if (!leaderboardState.nextRotationAt) {
      const minutes = Math.max(1, Number(settings.leaderboardRotationMinutes) || 5);
      leaderboardState.nextRotationAt = Date.now() + minutes * 60 * 1000;
    }

    const { payload } = renderLeaderboardMessage(guild, leaderboardState.type, { includePrevNext: false });

    if (leaderboardState.messageId) {
      const existing = await channel.messages.fetch(leaderboardState.messageId).catch(() => null);
      if (existing) {
        await existing.edit(payload);
        saveLeaderboardState();
        return;
      }
    }

    const sent = await channel.send(payload);
    leaderboardState.messageId = sent.id;
    saveLeaderboardState();
  } catch (err) {
    console.error("Failed to post/refresh leaderboard:", err);
  }
}

async function advanceLeaderboardCarousel(guild) {
  const types = Object.keys(settings.leaderboardStyles);
  if (types.length === 0) return;
  const idx = types.indexOf(leaderboardState.type);
  const nextType = types[(idx + 1) % types.length];
  leaderboardState.type = nextType;
  const minutes = Math.max(1, Number(settings.leaderboardRotationMinutes) || 5);
  leaderboardState.nextRotationAt = Date.now() + minutes * 60 * 1000;
  saveLeaderboardState();
  await postOrRefreshLeaderboard(guild);
}

function scheduleLeaderboardRotation(guild) {
  const minutes = Math.max(1, Number(settings.leaderboardRotationMinutes) || 5);
  const ms = minutes * 60 * 1000;
  setTimeout(async () => {
    try {
      await advanceLeaderboardCarousel(guild);
    } catch (err) {
      console.error("Failed to advance leaderboard carousel:", err);
    }
    scheduleLeaderboardRotation(guild);
  }, ms);
}

// Live-ish "Updating in M:SS" footer. Editing a message every single second
// would blow through Discord's per-channel rate limit (~5 edits / 5s), so
// this refreshes on a safe interval instead — still reads as a live clock.
const LEADERBOARD_COUNTDOWN_TICK_MS = 10 * 1000;
function scheduleLeaderboardCountdown(guild) {
  setInterval(async () => {
    try {
      if (!leaderboardState.messageId) return;
      const channel = await client.channels.fetch(leaderboardState.channelId).catch(() => null);
      if (!channel) return;
      const existing = await channel.messages.fetch(leaderboardState.messageId).catch(() => null);
      if (!existing) return;
      const { payload } = renderLeaderboardMessage(guild, leaderboardState.type, { includePrevNext: false });
      await existing.edit(payload).catch(() => {});
    } catch (err) {
      console.log("Leaderboard countdown tick failed:", err.message);
    }
  }, LEADERBOARD_COUNTDOWN_TICK_MS);
}

// ==========================================================
// ===== XP GIVEAWAYS =====
// ==========================================================

function nextGiveawayId() {
  const nums = xpGiveaways.map(g => Number(g.id)).filter(n => !isNaN(n));
  return String((nums.length ? Math.max(...nums) : 0) + 1);
}

// Map<giveawayId, { startTimer, endTimer }> — live setTimeout handles so we
// never double-schedule the same giveaway.
const giveawayTimers = new Map();

function clearGiveawayTimers(id) {
  const t = giveawayTimers.get(id);
  if (t) {
    if (t.startTimer) clearTimeout(t.startTimer);
    if (t.endTimer) clearTimeout(t.endTimer);
    giveawayTimers.delete(id);
  }
}

// Splits a dollar-ish amount string across `count` winners. Falls back to
// describing an equal share in words if the amount isn't a plain number.
function formatWinnerShare(amount, count) {
  const numeric = parseFloat(String(amount).replace(/[^0-9.]/g, ""));
  if (count <= 1 || isNaN(numeric)) return `$${amount}`;
  const each = numeric / count;
  return `$${each.toFixed(2)} each (from $${amount} split ${count} ways)`;
}

// Captures the XP snapshot and flips a giveaway to "active" — either called
// immediately at creation time (start = now) or later by a scheduled timer.
async function activateGiveaway(giveaway, guild) {
  const startSnapshot = {};
  for (const [userId, d] of Object.entries(levels)) {
    startSnapshot[userId] = d.totalXp || 0;
  }
  giveaway.startSnapshot = startSnapshot;
  giveaway.status = "active";
  saveXpGiveaways();

  if (guild) {
    const channel = await getChannelSafe(guild, giveaway.channelId, "Announcement channel");
    if (channel) {
      const winnerNote = giveaway.winnerCount > 1 ? `top **${giveaway.winnerCount}** XP earners will split` : "top XP earner wins";
      const goalNote = giveaway.xpGoal > 0 ? ` (must reach **${giveaway.xpGoal}** XP to qualify)` : "";
      const endNote = giveaway.endAt ? `\nEnds <t:${Math.floor(giveaway.endAt / 1000)}:R>.` : "";
      channel.send(embedReplyOptions(
        { tag: "System", displayAvatarURL: () => guild.iconURL({ dynamic: true }) },
        guild,
        `🎁 **XP Giveaway #${giveaway.id} has started!**\nEarn XP from this moment on — the ${winnerNote} **$${giveaway.amount}**${goalNote}.${endNote}`,
        "#F1C40F"
      )).catch(() => {});
    }
  }

  if (giveaway.endAt) scheduleGiveawayEnd(giveaway, guild);
}

function scheduleGiveawayStart(giveaway, guild) {
  const delay = Math.max(0, giveaway.startAt - Date.now());
  const existing = giveawayTimers.get(giveaway.id) || {};
  existing.startTimer = setTimeout(() => {
    activateGiveaway(giveaway, guild).catch(err => console.error("Failed to activate giveaway:", err));
  }, delay);
  giveawayTimers.set(giveaway.id, existing);
}

function scheduleGiveawayEnd(giveaway, guild) {
  const delay = Math.max(0, giveaway.endAt - Date.now());
  const existing = giveawayTimers.get(giveaway.id) || {};
  existing.endTimer = setTimeout(() => {
    const current = xpGiveaways.find(g => g.id === giveaway.id);
    if (current && current.status === "active") {
      endXpGiveaway(current, guild).catch(err => console.error("Failed to auto-end giveaway:", err));
    }
  }, delay);
  giveawayTimers.set(giveaway.id, existing);
}

// Re-schedules timers for every scheduled/active giveaway after a restart.
// Anything whose start/end time already passed while the bot was offline is
// resolved immediately instead of waiting on a timer.
function rehydrateGiveawayTimers(guild) {
  for (const giveaway of xpGiveaways) {
    if (giveaway.status === "scheduled") {
      if (giveaway.startAt <= Date.now()) {
        activateGiveaway(giveaway, guild).catch(err => console.error("Failed to activate giveaway on startup:", err));
      } else {
        scheduleGiveawayStart(giveaway, guild);
      }
    } else if (giveaway.status === "active" && giveaway.endAt) {
      if (giveaway.endAt <= Date.now()) {
        endXpGiveaway(giveaway, guild).catch(err => console.error("Failed to auto-end giveaway on startup:", err));
      } else {
        scheduleGiveawayEnd(giveaway, guild);
      }
    }
  }
}

async function endXpGiveaway(giveaway, guild) {
  clearGiveawayTimers(giveaway.id);

  const deltas = Object.entries(levels).map(([userId, d]) => {
    const startXp = giveaway.startSnapshot ? (giveaway.startSnapshot[userId] || 0) : 0;
    const gained = Math.max(0, (d.totalXp || 0) - startXp);
    return { userId, gained };
  }).sort((a, b) => b.gained - a.gained);

  const leaderboard = deltas.slice(0, 10);
  const winnerCount = Math.max(1, Number(giveaway.winnerCount) || 1);
  const eligible = deltas.filter(e => e.gained >= (giveaway.xpGoal || 0) && e.gained > 0);
  const winners = eligible.slice(0, winnerCount);

  giveaway.status = "ended";
  giveaway.endedAt = Date.now();
  giveaway.leaderboard = leaderboard;
  giveaway.results = winners;
  saveXpGiveaways();

  const channel = await getChannelSafe(guild, giveaway.channelId, "Announcement channel");
  if (!channel) return { top4: winners, posted: false };

  if (winners.length === 0) {
    await channel.send(embedReplyOptions(
      { tag: "System", displayAvatarURL: () => guild.iconURL({ dynamic: true }) },
      guild,
      `🎁 **XP Giveaway #${giveaway.id} has ended** — nobody reached the required **${giveaway.xpGoal}** XP, so no reward was won this time.`,
      "#ED4245"
    ));
    return { top4: winners, posted: true };
  }

  const share = formatWinnerShare(giveaway.amount, winners.length);
  const winnerMentions = winners.map(w => `<@${w.userId}>`).join(", ");

  const embed = new EmbedBuilder()
    .setTitle(winners.length > 1 ? "🎉 XP Giveaway Winners!" : "🎉 XP Giveaway Winner!")
    .setColor("#F1C40F")
    .setDescription(
      winners.length > 1
        ? `${winnerMentions} split **$${giveaway.amount}** (${share})! 🏆`
        : `<@${winners[0].userId}> won **$${giveaway.amount}** by earning **${winners[0].gained} XP** during this giveaway! 🏆`
    )
    .addFields(
      leaderboard.map((e, i) => ({
        name: `${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🏅"} #${i + 1}`,
        value: `<@${e.userId}> — ${e.gained} XP${i < winners.length ? " 🏆" : ""}`,
        inline: true
      }))
    )
    .setFooter({ text: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
    .setTimestamp();

  await channel.send({ content: `${winnerMentions} 🎉`, embeds: [embed] });
  return { top4: winners, posted: true };
}

// ---- /giveaways viewer ----

function buildGiveawayStatusSelectPayload() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("giveaways_status_select")
    .setPlaceholder("Choose a status...")
    .addOptions(
      { label: "Active / Scheduled", value: "active", emoji: "🟢" },
      { label: "Ended", value: "ended", emoji: "🏁" }
    );
  return { embeds: [new EmbedBuilder().setTitle("🎁 XP Giveaways").setColor("#F1C40F").setDescription("Pick a status to view.")], components: [new ActionRowBuilder().addComponents(menu)] };
}

function buildGiveawayPickSelectPayload(status, list) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`giveaways_pick_${status}`)
    .setPlaceholder("Choose a giveaway...")
    .addOptions(list.slice(0, 25).map(g => ({
      label: `#${g.id} — $${g.amount}`.slice(0, 100),
      value: g.id,
      description: (g.status === "ended" ? "Ended" : g.status === "scheduled" ? "Scheduled" : "Active").slice(0, 100)
    })));
  return { embeds: [new EmbedBuilder().setTitle("🎁 XP Giveaways").setColor("#F1C40F").setDescription(`Multiple **${status}** giveaways found — pick one.`)], components: [new ActionRowBuilder().addComponents(menu)] };
}

function buildGiveawayDetailEmbed(guild, giveaway) {
  const winnerNote = giveaway.winnerCount > 1 ? `Top ${giveaway.winnerCount} split` : "Single winner";

  if (giveaway.status === "scheduled") {
    const embed = new EmbedBuilder()
      .setTitle(`⏳ Giveaway #${giveaway.id} — Scheduled`)
      .setColor("#F1C40F")
      .setDescription(`**Reward:** $${giveaway.amount}\n**Winners:** ${winnerNote}\n**Min XP:** ${giveaway.xpGoal || 0}\n**Starts:** <t:${Math.floor(giveaway.startAt / 1000)}:R>${giveaway.endAt ? `\n**Ends:** <t:${Math.floor(giveaway.endAt / 1000)}:R>` : ""}`)
      .setFooter({ text: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
      .setTimestamp();
    return embed;
  }

  if (giveaway.status === "active") {
    const deltas = Object.entries(levels).map(([userId, d]) => {
      const startXp = giveaway.startSnapshot ? (giveaway.startSnapshot[userId] || 0) : 0;
      return { userId, gained: Math.max(0, (d.totalXp || 0) - startXp) };
    }).filter(e => e.gained > 0).sort((a, b) => b.gained - a.gained).slice(0, 10);

    const list = deltas.length
      ? deltas.map((e, i) => `${i + 1}. <@${e.userId}> — **${e.gained}** XP`).join("\n")
      : "No XP earned yet.";

    const endNote = giveaway.endAt ? `\n**Ends:** <t:${Math.floor(giveaway.endAt / 1000)}:R>` : "\n**Ends:** Manually, by an admin";

    const embed = new EmbedBuilder()
      .setTitle(`🟢 Giveaway #${giveaway.id} — Active`)
      .setColor("#57F287")
      .setDescription(`**Reward:** $${giveaway.amount}\n**Winners:** ${winnerNote}\n**Min XP:** ${giveaway.xpGoal || 0}${endNote}\n\n**Top 10 Right Now:**\n${list}`)
      .setFooter({ text: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
      .setTimestamp();
    return embed;
  }

  // ended
  const leaderboard = giveaway.leaderboard || [];
  const results = giveaway.results || [];
  const list = leaderboard.length
    ? leaderboard.map((e, i) => `${i + 1}. <@${e.userId}> — **${e.gained}** XP${i < results.length ? " 🏆" : ""}`).join("\n")
    : "No data recorded.";

  let winnerLine;
  if (results.length === 0) {
    winnerLine = "No one reached the required XP — no winner.";
  } else if (results.length === 1) {
    winnerLine = `🏆 <@${results[0].userId}> won **$${giveaway.amount}** with **${results[0].gained}** XP.`;
  } else {
    const share = formatWinnerShare(giveaway.amount, results.length);
    winnerLine = `🏆 ${results.map(r => `<@${r.userId}>`).join(", ")} split **$${giveaway.amount}** (${share}).`;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🏁 Giveaway #${giveaway.id} — Ended`)
    .setColor("#ED4245")
    .setDescription(`**Reward:** $${giveaway.amount}\n**Winners:** ${winnerNote}\n\n${winnerLine}\n\n**Top 10:**\n${list}`)
    .setFooter({ text: `${guild.name} • Ended`, iconURL: guild.iconURL({ dynamic: true }) })
    .setTimestamp(giveaway.endedAt || Date.now());
  return embed;
}

// ==========================================================
// ===== INTERACTIONS =====
// ==========================================================

client.on(Events.InteractionCreate, async interaction => {

  // ===== SLASH COMMAND HANDLER =====
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === "dashboard") {
      if (
        !interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages) &&
        !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
      ) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ No permission.", "#ED4245", { ephemeral: true }));
      }

      const payload = buildDashboardEmbed(interaction.guild);
      return interaction.reply({ ...payload, ephemeral: true });
    }

    if (interaction.commandName === "verifysetup") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ You must be an admin to use this command.", "#ED4245", { ephemeral: true }));
      }

      const payload = buildVerifyPanelPayload();
      const sent = await interaction.channel.send(payload);
      settings.verifyPanel.panelChannelId = sent.channel.id;
      settings.verifyPanel.panelMessageId = sent.id;
      saveSettings();

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "✅ Verification panel created from Settings > Verify Panel.", "#57F287", { ephemeral: true }));
    }

    if (interaction.commandName === "rank") {
      await interaction.deferReply();

      const target = interaction.options.getUser("user") || interaction.user;
      const data = levels[target.id] || { xp: 0, level: 0, totalXp: 0 };

      const buffer = await generateRankImage(target, data.level, data.xp, data.totalXp || 0);

      const embed = new EmbedBuilder()
        .setColor(settings.embedColor || "#48ff00")
        .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL({ dynamic: true, size: 256 }) })
        .setDescription(`${target}'s rank`)
        .setImage("attachment://rank.png")
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed], files: [{ attachment: buffer, name: "rank.png" }] });
    }

    if (interaction.commandName === "leaderboard") {
      const type = interaction.options.getString("type") || "level";
      const embeds = buildLeaderboardEmbeds(interaction.guild, type);
      const components = buildLeaderboardComponents(type);

      return interaction.reply({ embeds, components });
    }

    if (interaction.commandName === "leaderboards") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }

      await postOrRefreshLeaderboard(interaction.guild);

      return interaction.reply(embedReplyOptions(
        interaction.user,
        interaction.guild,
        `✅ Leaderboard panel posted/updated in <#${leaderboardState.channelId}>.`,
        "#57F287",
        { ephemeral: true }
      ));
    }

    if (interaction.commandName === "submitpanel") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }

      const payload = buildSubmitPanelPayload();
      const sent = await interaction.channel.send(payload);
      panelConfig.panelMessageId = sent.id;
      panelConfig.panelChannelId = sent.channel.id;
      savePanelConfig();

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "✅ Submission panel posted.", "#57F287", { ephemeral: true }));
    }

    if (interaction.commandName === "giveaways") {
      return interaction.reply({ ...buildGiveawayStatusSelectPayload(), ephemeral: true });
    }
  }

  // ===== SELECT MENU HANDLER =====
  if (interaction.isStringSelectMenu()) {

    // Dropdown from "Open Options" -> the person picked an application type
    if (interaction.customId === SUBMIT_TYPE_SELECT_ID) {
      const typeKey = interaction.values[0];

      if (settings.open[typeKey] === false) {
        return interaction.reply(embedReplyOptions(
          interaction.user,
          interaction.guild,
          `🚫 We're not currently accepting **${TYPE_DISPLAY_NAMES[typeKey]}** submissions right now. Please check back later.`,
          "#ED4245",
          { ephemeral: true }
        ));
      }

      const config = submitModals[`submit_${typeKey}`];
      if (!config) return;

      const modal = new ModalBuilder().setCustomId(config.id).setTitle(config.title);
      config.fields.forEach(field => {
        const input = new TextInputBuilder()
          .setCustomId(field.id)
          .setLabel(safeLabel(field.label))
          .setStyle(field.style)
          .setRequired(true);
        if (field.placeholder) input.setPlaceholder(field.placeholder);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
      });

      return interaction.showModal(modal);
    }

    // XP Settings: pick which active giveaway to end
    if (interaction.customId === "xp_giveaway_end_select") {
      const id = interaction.values[0];
      const giveaway = xpGiveaways.find(g => g.id === id && g.status === "active");
      if (!giveaway) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ That giveaway is no longer active.", "#ED4245", { ephemeral: true }));
      }

      await interaction.deferReply({ ephemeral: true });
      const { top4 } = await endXpGiveaway(giveaway, interaction.guild);

      return interaction.editReply(embedReplyOptions(
        interaction.user, interaction.guild,
        top4.length
          ? `✅ Giveaway #${giveaway.id} ended — winner(s): ${top4.map(w => `<@${w.userId}>`).join(", ")} ($${giveaway.amount}). Announcement sent to <#${giveaway.channelId}>.`
          : `✅ Giveaway #${giveaway.id} ended — nobody reached the ${giveaway.xpGoal} XP threshold, no reward given.`,
        "#57F287"
      ));
    }

    // /giveaways: status picked (active/ended)
    if (interaction.customId === "giveaways_status_select") {
      const status = interaction.values[0];
      const list = status === "active"
        ? xpGiveaways.filter(g => g.status === "active" || g.status === "scheduled")
        : xpGiveaways.filter(g => g.status === "ended");

      if (list.length === 0) {
        return interaction.update({
          embeds: [new EmbedBuilder().setTitle("🎁 XP Giveaways").setColor("#F1C40F").setDescription(`No **${status}** giveaways found.`)],
          components: []
        });
      }

      if (list.length === 1) {
        const embed = buildGiveawayDetailEmbed(interaction.guild, list[0]);
        return interaction.update({ embeds: [embed], components: [] });
      }

      return interaction.update(buildGiveawayPickSelectPayload(status, list.sort((a, b) => Number(b.id) - Number(a.id))));
    }

    // /giveaways: a specific giveaway picked from the list
    if (interaction.customId.startsWith("giveaways_pick_")) {
      const id = interaction.values[0];
      const giveaway = xpGiveaways.find(g => g.id === id);
      if (!giveaway) {
        return interaction.update({ embeds: [new EmbedBuilder().setColor("#ED4245").setDescription("❌ That giveaway no longer exists.")], components: [] });
      }
      const embed = buildGiveawayDetailEmbed(interaction.guild, giveaway);
      return interaction.update({ embeds: [embed], components: [] });
    }
  }

  // ===== BUTTON HANDLER =====
  if (interaction.isButton()) {

    if (interaction.customId === "verify_button") {
      try {
        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const member = interaction.member;

        const verifiedRole = guild.roles.cache.find(r => r.name === "☑️ Verified");
        const clipperRole = guild.roles.cache.find(r => r.name === "👤 Member");

        if (!verifiedRole || !clipperRole) {
          return interaction.editReply(embedReplyOptions(interaction.user, guild, "❌ I Could not verify you. Why? Verification roles not found.", "#ED4245"));
        }

        await member.roles.add(verifiedRole);
        await member.roles.add(clipperRole);

        stats.totalVerifications++;
        saveStats();

        const logChannel = await getChannelSafe(guild, settings.logChannelId, "Log channel");
        if (logChannel) {
          logChannel.send({ embeds: [createEmbed(interaction.user, guild, `✅ ${interaction.user} was verified successfully.`, "#57F287")] }).catch(() => {});
        }

        await interaction.editReply(embedReplyOptions(interaction.user, guild, "✅ You have been verified!", "#57F287"));
      } catch (error) {
        console.error(error);
        await interaction.editReply(embedReplyOptions(interaction.user, interaction.guild, `❌ Error: ${error.message}`, "#ED4245"));
      }
      return;
    }

    // Submit panel: "Open Options" -> ephemeral dropdown of application types
    if (interaction.customId === OPEN_OPTIONS_BUTTON_ID) {
      const payload = buildSubmitOptionsPayload(interaction.guild);
      return interaction.reply({ ...payload, ephemeral: true });
    }

    // "View #N" on the dashboard -> show full submission + Approve/Decline
    if (interaction.customId.startsWith("view_submission_")) {
      const id = interaction.customId.replace("view_submission_", "");
      const submission = submissions.find(s => s.id === id);

      if (!submission) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ That submission no longer exists.", "#ED4245", { ephemeral: true }));
      }

      const fieldLines = submission.fields.map(f => `**${f.label}**\n${f.value}`).join("\n\n");

      const viewEmbed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle(`📥 ${submission.type}`)
        .setDescription(`**Submitted by:** ${submission.userTag} (<@${submission.userId}>)\n**Status:** ${submission.status}\n\n${fieldLines}`)
        .setTimestamp(submission.timestamp);

      const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("back_to_dashboard").setLabel("🔙 Dashboard").setStyle(ButtonStyle.Secondary)
      );

      const components = [backRow];
      if (submission.status === "pending") {
        components.unshift(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`approve_submission_${submission.id}`).setLabel("Approve").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`decline_submission_${submission.id}`).setLabel("Decline").setStyle(ButtonStyle.Danger)
        ));
      }

      return interaction.reply({ embeds: [viewEmbed], components, ephemeral: true });
    }

    // Approve / Decline a submission
    if (interaction.customId.startsWith("approve_submission_") || interaction.customId.startsWith("decline_submission_")) {
      const isApprove = interaction.customId.startsWith("approve_submission_");
      const id = interaction.customId.replace(isApprove ? "approve_submission_" : "decline_submission_", "");
      const submission = submissions.find(s => s.id === id);

      if (!submission) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ That submission no longer exists.", "#ED4245", { ephemeral: true }));
      }

      submission.status = isApprove ? "approved" : "declined";
      saveSubmissions();

      try {
        const user = await client.users.fetch(submission.userId);
        await user.send({
          embeds: [
            new EmbedBuilder()
              .setColor(isApprove ? "#57F287" : "#ED4245")
              .setTitle(isApprove ? "✅ Your submission was approved!" : "❌ Your submission was declined")
              .setDescription(`Your **${submission.type}** submission has been ${isApprove ? "approved" : "declined"} by the ClippingBase Team.`)
          ]
        });
      } catch (e) {
        console.log(`Could not DM user ${submission.userId} about their submission status.`);
      }

      const resultEmbed = new EmbedBuilder()
        .setColor(isApprove ? "#57F287" : "#ED4245")
        .setTitle(`📥 ${submission.type}`)
        .setDescription(`**Submitted by:** ${submission.userTag}\n**Status:** ${submission.status.toUpperCase()}`);

      const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("back_to_dashboard").setLabel("🔙 Dashboard").setStyle(ButtonStyle.Primary)
      );

      return interaction.update({ embeds: [resultEmbed], components: [backRow] });
    }

    // Toggle whether a type is currently accepting submissions (dashboard)
    if (interaction.customId.startsWith("toggle_") && interaction.customId !== "toggle_link_filter") {
      const key = interaction.customId.replace("toggle_", "");
      if (!(key in TYPE_DISPLAY_NAMES)) return;

      settings.open[key] = !(settings.open[key] !== false);
      saveSettings();

      const payload = buildDashboardEmbed(interaction.guild);
      return interaction.update(payload);
    }

    // Same toggle, but from inside Settings > Submit Panel
    if (interaction.customId.startsWith("stoggle_")) {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const key = interaction.customId.replace("stoggle_", "");
      if (!(key in TYPE_DISPLAY_NAMES)) return;

      settings.open[key] = !(settings.open[key] !== false);
      saveSettings();

      return interaction.update(buildSubmitPanelSettingsEmbed(interaction.guild));
    }

    // Leaderboard rows-displayed quick buttons
    if (interaction.customId.startsWith("lbcount_")) {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const count = parseInt(interaction.customId.replace("lbcount_", ""), 10);
      settings.leaderboardDisplayCount = count;
      saveSettings();
      return interaction.update(buildLeaderboardStyleSettingsEmbed(interaction.guild));
    }

    // Post/refresh the Verify panel using current settings.verifyPanel
    if (interaction.customId === "post_verify_panel") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const payload = buildVerifyPanelPayload();
      const vp = settings.verifyPanel;
      const updated = await refreshPostedPanel(vp.panelChannelId, vp.panelMessageId, payload);

      if (!updated) {
        const sent = await interaction.channel.send(payload);
        settings.verifyPanel.panelChannelId = sent.channel.id;
        settings.verifyPanel.panelMessageId = sent.id;
        saveSettings();
      }

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "✅ Verify panel posted/updated.", "#57F287", { ephemeral: true }));
    }

    // XP Settings: "End Giveaway" -> pick which one if multiple, else end directly
    if (interaction.customId === "xp_giveaway_end") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const active = xpGiveaways.filter(g => g.status === "active");
      if (active.length === 0) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ There are no active XP Giveaways to end.", "#ED4245", { ephemeral: true }));
      }
      if (active.length === 1) {
        await interaction.deferReply({ ephemeral: true });
        const { top4 } = await endXpGiveaway(active[0], interaction.guild);
        return interaction.editReply(embedReplyOptions(
          interaction.user, interaction.guild,
          top4.length
            ? `✅ Giveaway #${active[0].id} ended — winner(s): ${top4.map(w => `<@${w.userId}>`).join(", ")} ($${active[0].amount}). Announcement sent to <#${active[0].channelId}>.`
            : `✅ Giveaway #${active[0].id} ended — nobody reached the ${active[0].xpGoal} XP threshold, no reward given.`,
          "#57F287"
        ));
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId("xp_giveaway_end_select")
        .setPlaceholder("Choose which giveaway to end...")
        .addOptions(active.map(g => ({ label: `#${g.id} — $${g.amount} (needs ${g.xpGoal} XP)`, value: g.id })));

      return interaction.reply({ components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
    }

    // ===== SETTINGS: main menu navigation =====
    if (interaction.customId === "open_settings" || interaction.customId === "settings_back_main") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      return interaction.update(buildSettingsMainEmbed(interaction.guild));
    }

    const SETTINGS_SUBMENUS = {
      settings_channels: buildChannelsSettingsEmbed,
      settings_buttons: buildButtonsSettingsEmbed,
      settings_emojis: buildEmojiSettingsEmbed,
      settings_embedcolor: buildEmbedColorSettingsEmbed,
      settings_verifypanel: buildVerifyPanelSettingsEmbed,
      settings_submitpanel: buildSubmitPanelSettingsEmbed,
      settings_invitelinks: buildInviteLinksSettingsEmbed,
      settings_leaderboardstyle: buildLeaderboardStyleSettingsEmbed,
      settings_levelupcard: buildLevelUpCardSettingsEmbed,
      settings_xp: buildXpSettingsEmbed,
      settings_filterwords: buildFilterWordsSettingsEmbed
    };

    if (SETTINGS_SUBMENUS[interaction.customId]) {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      return interaction.update(SETTINGS_SUBMENUS[interaction.customId](interaction.guild));
    }

    // Resync invites from Discord's live invite counts
    if (interaction.customId === "resync_invites") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const result = await resyncInvitesForGuild(interaction.guild);
      const msg = result.error
        ? `❌ Couldn't resync invites: ${result.error}`
        : `✅ Resynced invites — updated ${result.changed} member${result.changed === 1 ? "" : "s"} out of ${result.totalTracked} tracked inviter(s).`;
      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, msg, result.error ? "#ED4245" : "#57F287", { ephemeral: true }));
    }

    // Settings page: edit which channel level-up cards get posted to
    if (interaction.customId === "edit_levelup_channel") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }

      const modal = new ModalBuilder().setCustomId("modal_levelup_channel").setTitle("Edit Level-Up Channel");
      const input = new TextInputBuilder()
        .setCustomId("channelId")
        .setLabel(safeLabel("Channel ID or #mention"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${settings.levelUpChannelId}`)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // Settings page: edit which channel the auto-updating leaderboard panel lives in
    if (interaction.customId === "edit_leaderboard_channel") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }

      const modal = new ModalBuilder().setCustomId("modal_leaderboard_channel").setTitle("Edit Leaderboard Channel");
      const input = new TextInputBuilder()
        .setCustomId("channelId")
        .setLabel(safeLabel("Channel ID or #mention"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${leaderboardState.channelId}`)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // Settings page: edit which channel the word-filter moderation log posts to
    if (interaction.customId === "edit_log_channel") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }

      const modal = new ModalBuilder().setCustomId("modal_log_channel").setTitle("Edit Moderation Log Channel");
      const input = new TextInputBuilder()
        .setCustomId("channelId")
        .setLabel(safeLabel("Channel ID or #mention"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${settings.logChannelId}`)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // Settings page: edit which channel join/leave invite-tracking messages post to
    if (interaction.customId === "edit_invite_log_channel") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }

      const modal = new ModalBuilder().setCustomId("modal_invite_log_channel").setTitle("Edit Invite Log Channel");
      const input = new TextInputBuilder()
        .setCustomId("channelId")
        .setLabel(safeLabel("Channel ID or #mention"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${settings.inviteLogChannelId}`)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // Settings page: edit which channel XP Giveaway announcements post to by default
    if (interaction.customId === "edit_announcement_channel") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }

      const modal = new ModalBuilder().setCustomId("modal_announcement_channel").setTitle("Edit Announcement Channel");
      const input = new TextInputBuilder()
        .setCustomId("channelId")
        .setLabel(safeLabel("Channel ID or #mention"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${settings.announcementChannelId}`)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // Settings page: edit the bot's "Watching ..." status text
    if (interaction.customId === "edit_bot_status") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }

      const modal = new ModalBuilder().setCustomId("modal_bot_status").setTitle("Edit Bot Status");
      const input = new TextInputBuilder()
        .setCustomId("statusText")
        .setLabel(safeLabel("Status text (shown as \"Watching ...\")"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${settings.botStatus}`)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // Settings page: toggle the Discord invite link filter on/off
    if (interaction.customId === "toggle_link_filter") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }

      settings.linkFilterEnabled = !settings.linkFilterEnabled;
      saveSettings();

      return interaction.update(buildInviteLinksSettingsEmbed(interaction.guild));
    }

    // Settings page: generic emoji-edit buttons (verify / join / leave / submit types)
    const EMOJI_EDIT_MAP = {
      edit_verify_emoji: { modalId: "modal_verify_emoji", title: "Edit Verify Button Emoji", current: () => settings.verifyPanel.buttonEmoji },
      edit_join_emoji: { modalId: "modal_join_emoji", title: "Edit Join Emoji", current: () => settings.joinEmoji },
      edit_leave_emoji: { modalId: "modal_leave_emoji", title: "Edit Leave Emoji", current: () => settings.leaveEmoji },
      edit_campaign_emoji: { modalId: "modal_campaign_emoji", title: "Edit Campaign Emoji", current: () => getTypeEmoji("campaign") },
      edit_service_emoji: { modalId: "modal_service_emoji", title: "Edit Service Emoji", current: () => getTypeEmoji("service") },
      edit_moderator_emoji: { modalId: "modal_moderator_emoji", title: "Edit Moderator Emoji", current: () => getTypeEmoji("moderator") },
      edit_outreacher_emoji: { modalId: "modal_outreacher_emoji", title: "Edit Outreacher Emoji", current: () => getTypeEmoji("outreacher") }
    };

    if (EMOJI_EDIT_MAP[interaction.customId]) {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }

      const cfg = EMOJI_EDIT_MAP[interaction.customId];
      const modal = new ModalBuilder().setCustomId(cfg.modalId).setTitle(cfg.title);
      const input = new TextInputBuilder()
        .setCustomId("emoji")
        .setLabel(safeLabel("Emoji, <:name:id> for custom, or blank"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${cfg.current() || "(none)"}`)
        .setRequired(false);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // Button-label edit buttons
    const BUTTONLABEL_EDIT_MAP = {
      modal_buttonlabel_verify: { modalId: "modalsubmit_buttonlabel_verify", title: "Edit Verify Button Label", current: () => settings.buttonLabels.verify },
      modal_buttonlabel_openoptions: { modalId: "modalsubmit_buttonlabel_openoptions", title: "Edit Open Options Button Label", current: () => settings.buttonLabels.openOptions },
      modal_buttonlabel_campaign: { modalId: "modalsubmit_buttonlabel_campaign", title: "Edit Campaign Button Label", current: () => panelConfig.types.campaign.buttonLabel },
      modal_buttonlabel_service: { modalId: "modalsubmit_buttonlabel_service", title: "Edit Service Button Label", current: () => panelConfig.types.service.buttonLabel },
      modal_buttonlabel_moderator: { modalId: "modalsubmit_buttonlabel_moderator", title: "Edit Moderator Button Label", current: () => panelConfig.types.moderator.buttonLabel },
      modal_buttonlabel_outreacher: { modalId: "modalsubmit_buttonlabel_outreacher", title: "Edit Outreacher Button Label", current: () => panelConfig.types.outreacher.buttonLabel }
    };

    if (BUTTONLABEL_EDIT_MAP[interaction.customId]) {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const cfg = BUTTONLABEL_EDIT_MAP[interaction.customId];
      const modal = new ModalBuilder().setCustomId(cfg.modalId).setTitle(cfg.title);
      const input = new TextInputBuilder()
        .setCustomId("label")
        .setLabel(safeLabel("Button text"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${cfg.current()}`)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.customId === "modal_embed_color") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const modal = new ModalBuilder().setCustomId("modalsubmit_embed_color").setTitle("Edit Default Embed Color");
      const input = new TextInputBuilder()
        .setCustomId("color")
        .setLabel(safeLabel("Hex color, e.g. #5865F2"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${settings.embedColor}`)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // Verify Panel settings modals
    if (interaction.customId === "modal_verifypanel_description") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const modal = new ModalBuilder().setCustomId("modalsubmit_verifypanel_description").setTitle("Edit Verify Panel Description");
      const input = new TextInputBuilder()
        .setCustomId("description")
        .setLabel(safeLabel("Description"))
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder(settings.verifyPanel.description || "Click Verify below to gain access...")
        .setRequired(false);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.customId === "modal_verifypanel_color") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const modal = new ModalBuilder().setCustomId("modalsubmit_verifypanel_color").setTitle("Edit Verify Panel Embed Color");
      const input = new TextInputBuilder()
        .setCustomId("color")
        .setLabel(safeLabel("Hex color, e.g. #5865F2"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${settings.verifyPanel.color}`)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.customId === "modal_verifypanel_buttoncolor") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const modal = new ModalBuilder().setCustomId("modalsubmit_verifypanel_buttoncolor").setTitle("Edit Verify Button Color");
      const input = new TextInputBuilder()
        .setCustomId("color")
        .setLabel(safeLabel("green / red / blue / grey"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${settings.verifyPanel.buttonColor}`)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.customId === "modal_verifypanel_buttonemoji") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const modal = new ModalBuilder().setCustomId("modalsubmit_verifypanel_buttonemoji").setTitle("Edit Verify Button Emoji");
      const input = new TextInputBuilder()
        .setCustomId("emoji")
        .setLabel(safeLabel("Emoji, <:name:id> for custom, or blank"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${settings.verifyPanel.buttonEmoji || "(none)"}`)
        .setRequired(false);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // Submit Panel settings modals
    if (interaction.customId === "modal_submitpanel_title") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const modal = new ModalBuilder().setCustomId("modalsubmit_submitpanel_title").setTitle("Edit Submit Panel Title");
      const input = new TextInputBuilder()
        .setCustomId("title")
        .setLabel(safeLabel("Title"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(panelConfig.title || "Submit a Request")
        .setRequired(false);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.customId === "modal_submitpanel_color") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const modal = new ModalBuilder().setCustomId("modalsubmit_submitpanel_color").setTitle("Edit Submit Panel Embed Color");
      const input = new TextInputBuilder()
        .setCustomId("color")
        .setLabel(safeLabel("Hex color, e.g. #5865F2"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${settings.submitPanelColor}`)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // Leaderboard style edit (per leaderboard type)
    if (interaction.customId.startsWith("modal_lb_style_")) {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const key = interaction.customId.replace("modal_lb_style_", "");
      const s = settings.leaderboardStyles[key];
      const modal = new ModalBuilder().setCustomId(`modalsubmit_lb_style_${key}`).setTitle(`Edit ${s.label}`.slice(0, 45));
      const emojiInput = new TextInputBuilder()
        .setCustomId("emoji")
        .setLabel(safeLabel("Emoji"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${s.emoji}`)
        .setRequired(true);
      const colorInput = new TextInputBuilder()
        .setCustomId("color")
        .setLabel(safeLabel("Hex color, e.g. #5865F2"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${s.color}`)
        .setRequired(true);
      modal.addComponents(
        new ActionRowBuilder().addComponents(emojiInput),
        new ActionRowBuilder().addComponents(colorInput)
      );
      return interaction.showModal(modal);
    }

    // Leaderboard rotation interval edit
    if (interaction.customId === "modal_lb_rotation") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const modal = new ModalBuilder().setCustomId("modalsubmit_lb_rotation").setTitle("Edit Rotation Interval");
      const input = new TextInputBuilder()
        .setCustomId("minutes")
        .setLabel(safeLabel("Minutes between leaderboard switches"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${settings.leaderboardRotationMinutes}`)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // Leaderboard rank icon edit
    if (interaction.customId === "modal_lb_icon") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const modal = new ModalBuilder().setCustomId("modalsubmit_lb_icon").setTitle("Edit Leaderboard Rank Icon");
      const input = new TextInputBuilder()
        .setCustomId("icon")
        .setLabel(safeLabel("Icon before rank (blank for none)"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${settings.leaderboardIcon || "(none)"}`)
        .setRequired(false);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // Image URL edit (verify / submit / levelup / leaderboard)
    if (interaction.customId.startsWith("modal_image_")) {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const key = interaction.customId.replace("modal_image_", "");
      const labelMap = { verify: "Verify Panel", submit: "Submit Panel", levelup: "Level-Up/Rank Background", leaderboard: "Leaderboard Panel" };
      const modal = new ModalBuilder().setCustomId(`modalsubmit_image_${key}`).setTitle(`Upload ${labelMap[key]} Image/GIF`.slice(0, 45));
      const input = new TextInputBuilder()
        .setCustomId("url")
        .setLabel(safeLabel("Image/GIF URL (blank to clear)"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(settings.images[key] || "https://...")
        .setRequired(false);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // Level-up/rank card style edits (bar color / font / headline)
    if (interaction.customId === "modal_levelup_barcolor") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const modal = new ModalBuilder().setCustomId("modalsubmit_levelup_barcolor").setTitle("Edit Progress Bar Color");
      const input = new TextInputBuilder()
        .setCustomId("color")
        .setLabel(safeLabel("Hex color, e.g. #57F287"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${settings.levelUpStyle.barColor}`)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.customId === "modal_levelup_font") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const modal = new ModalBuilder().setCustomId("modalsubmit_levelup_font").setTitle("Edit Font");
      const input = new TextInputBuilder()
        .setCustomId("font")
        .setLabel(safeLabel("CSS font family, e.g. sans-serif"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${settings.levelUpStyle.font}`)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.customId === "modal_levelup_headline") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const modal = new ModalBuilder().setCustomId("modalsubmit_levelup_headline").setTitle("Edit Headline Text");
      const input = new TextInputBuilder()
        .setCustomId("headline")
        .setLabel(safeLabel("Big headline text on level-up card"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${settings.levelUpStyle.headline}`)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // Background position/zoom edit
    if (interaction.customId === "modal_levelup_bgposition") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const bgT = getBackgroundTransform();
      const modal = new ModalBuilder().setCustomId("modalsubmit_levelup_bgposition").setTitle("Edit Background Position");
      const offsetXInput = new TextInputBuilder()
        .setCustomId("offsetX")
        .setLabel(safeLabel("Pan X (-1 left ... 1 right)"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${bgT.offsetX}`)
        .setRequired(true);
      const offsetYInput = new TextInputBuilder()
        .setCustomId("offsetY")
        .setLabel(safeLabel("Pan Y (-1 up ... 1 down)"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${bgT.offsetY}`)
        .setRequired(true);
      const zoomInput = new TextInputBuilder()
        .setCustomId("zoom")
        .setLabel(safeLabel("Zoom (1 = normal, 2 = 2x zoom)"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${bgT.zoom}`)
        .setRequired(true);
      modal.addComponents(
        new ActionRowBuilder().addComponents(offsetXInput),
        new ActionRowBuilder().addComponents(offsetYInput),
        new ActionRowBuilder().addComponents(zoomInput)
      );
      return interaction.showModal(modal);
    }

    // Element layout edit — part 1: avatar / user line / headline
    if (interaction.customId === "modal_levelup_layout1") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const layout = getLevelUpLayout();
      const modal = new ModalBuilder().setCustomId("modalsubmit_levelup_layout1").setTitle("Layout: Avatar / User / Headline");
      const avatarInput = new TextInputBuilder()
        .setCustomId("avatar")
        .setLabel(safeLabel("Avatar: x,y,size"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${layout.avatar.x},${layout.avatar.y},${layout.avatar.size}`)
        .setRequired(true);
      const userLineInput = new TextInputBuilder()
        .setCustomId("userLine")
        .setLabel(safeLabel("User Line: x,y,size (or auto,auto,size)"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${layout.userLine.x != null ? layout.userLine.x : "auto"},${layout.userLine.y != null ? layout.userLine.y : "auto"},${layout.userLine.size}`)
        .setRequired(true);
      const headlineInput = new TextInputBuilder()
        .setCustomId("headline")
        .setLabel(safeLabel("Headline: x,y,size"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${layout.headline.x},${layout.headline.y},${layout.headline.size}`)
        .setRequired(true);
      modal.addComponents(
        new ActionRowBuilder().addComponents(avatarInput),
        new ActionRowBuilder().addComponents(userLineInput),
        new ActionRowBuilder().addComponents(headlineInput)
      );
      return interaction.showModal(modal);
    }

    // Element layout edit — part 2: sub line / progress bar / xp text
    if (interaction.customId === "modal_levelup_layout2") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const layout = getLevelUpLayout();
      const modal = new ModalBuilder().setCustomId("modalsubmit_levelup_layout2").setTitle("Layout: Sub Line / Bar / XP Text");
      const sublineInput = new TextInputBuilder()
        .setCustomId("subline")
        .setLabel(safeLabel("Sub Line: x,y,size"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${layout.subline.x},${layout.subline.y},${layout.subline.size}`)
        .setRequired(true);
      const barInput = new TextInputBuilder()
        .setCustomId("progressBar")
        .setLabel(safeLabel("Progress Bar: x(center),y,width,height"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${layout.progressBar.x},${layout.progressBar.y},${layout.progressBar.width},${layout.progressBar.height}`)
        .setRequired(true);
      const xpInput = new TextInputBuilder()
        .setCustomId("xpText")
        .setLabel(safeLabel("XP Text: x,y,size"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${layout.xpText.x},${layout.xpText.y},${layout.xpText.size}`)
        .setRequired(true);
      modal.addComponents(
        new ActionRowBuilder().addComponents(sublineInput),
        new ActionRowBuilder().addComponents(barInput),
        new ActionRowBuilder().addComponents(xpInput)
      );
      return interaction.showModal(modal);
    }

    // XP rate edit
    if (interaction.customId === "modal_xp_rate") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const modal = new ModalBuilder().setCustomId("modalsubmit_xp_rate").setTitle("Edit XP Rate");
      const amountInput = new TextInputBuilder()
        .setCustomId("amount")
        .setLabel(safeLabel("XP given per trigger"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${settings.xp.perTrigger}`)
        .setRequired(true);
      const messagesInput = new TextInputBuilder()
        .setCustomId("messages")
        .setLabel(safeLabel("Messages required per trigger"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${settings.xp.messagesPerTrigger}`)
        .setRequired(true);
      modal.addComponents(
        new ActionRowBuilder().addComponents(amountInput),
        new ActionRowBuilder().addComponents(messagesInput)
      );
      return interaction.showModal(modal);
    }

    // Start an XP giveaway
    if (interaction.customId === "modal_xp_giveaway_start") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const modal = new ModalBuilder().setCustomId("modalsubmit_xp_giveaway_start").setTitle("Start XP Giveaway");
      const amountInput = new TextInputBuilder()
        .setCustomId("amount")
        .setLabel(safeLabel("Reward amount ($)"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("e.g. 50")
        .setRequired(true);
      const goalInput = new TextInputBuilder()
        .setCustomId("goal")
        .setLabel(safeLabel("Min XP required (blank = none)"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("e.g. 5000")
        .setRequired(false);
      const winnersInput = new TextInputBuilder()
        .setCustomId("winners")
        .setLabel(safeLabel("Number of winners (top N split)"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("1 = single winner, e.g. 3, 4, 5...")
        .setRequired(false);
      const startInput = new TextInputBuilder()
        .setCustomId("start")
        .setLabel(safeLabel("Start (YYYY-MM-DD HH:mm UTC, blank=now)"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("blank = starts immediately")
        .setRequired(false);
      const endInput = new TextInputBuilder()
        .setCustomId("end")
        .setLabel(safeLabel("End (YYYY-MM-DD HH:mm UTC, blank=manual)"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("blank = ends only when an admin ends it")
        .setRequired(false);
      modal.addComponents(
        new ActionRowBuilder().addComponents(amountInput),
        new ActionRowBuilder().addComponents(goalInput),
        new ActionRowBuilder().addComponents(winnersInput),
        new ActionRowBuilder().addComponents(startInput),
        new ActionRowBuilder().addComponents(endInput)
      );
      return interaction.showModal(modal);
    }

    // Filter words: add / remove
    if (interaction.customId === "modal_add_filter_word") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const modal = new ModalBuilder().setCustomId("modalsubmit_add_filter_word").setTitle("Add Filter Word");
      const catInput = new TextInputBuilder()
        .setCustomId("category")
        .setLabel(safeLabel("Category (profanity/harassment/bullying/spam)"))
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      const wordInput = new TextInputBuilder()
        .setCustomId("word")
        .setLabel(safeLabel("Word or phrase"))
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      modal.addComponents(
        new ActionRowBuilder().addComponents(catInput),
        new ActionRowBuilder().addComponents(wordInput)
      );
      return interaction.showModal(modal);
    }

    if (interaction.customId === "modal_remove_filter_word") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const modal = new ModalBuilder().setCustomId("modalsubmit_remove_filter_word").setTitle("Remove Filter Word");
      const wordInput = new TextInputBuilder()
        .setCustomId("word")
        .setLabel(safeLabel("Exact word/phrase to remove"))
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(wordInput));
      return interaction.showModal(modal);
    }

    // History pagination
    if (interaction.customId.startsWith("history_page_")) {
      const page = parseInt(interaction.customId.replace("history_page_", ""), 10) || 0;
      const payload = buildHistoryEmbed(interaction.guild, page);
      return interaction.update(payload);
    }

    if (interaction.customId === "back_to_dashboard") {
      const payload = buildDashboardEmbed(interaction.guild);
      return interaction.update(payload);
    }

    // Leaderboard panel: Prev / Next — steps the posted panel to that type
    if (interaction.customId.startsWith("lb_prev_") || interaction.customId.startsWith("lb_next_")) {
      const targetType = interaction.customId.startsWith("lb_prev_")
        ? interaction.customId.replace("lb_prev_", "")
        : interaction.customId.replace("lb_next_", "");

      if (!settings.leaderboardStyles[targetType]) return;

      leaderboardState.type = targetType;
      const minutes = Math.max(1, Number(settings.leaderboardRotationMinutes) || 5);
      leaderboardState.nextRotationAt = Date.now() + minutes * 60 * 1000;
      saveLeaderboardState();

      const { payload } = renderLeaderboardMessage(interaction.guild, targetType);
      return interaction.update(payload);
    }

    // Leaderboard panel: search for a user by username
    if (interaction.customId === "lb_search") {
      const modal = new ModalBuilder().setCustomId("lb_search_modal").setTitle("Search Leaderboard");
      const input = new TextInputBuilder()
        .setCustomId("query")
        .setLabel(safeLabel("Username to search for"))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("e.g. johndoe")
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }
  }

  // ===== MODAL SUBMIT HANDLER =====
  if (interaction.isModalSubmit()) {

    // Dashboard: save the new level-up notification channel
    if (interaction.customId === "modal_levelup_channel") {
      const channelId = parseChannelId(interaction.fields.getTextInputValue("channelId"));
      const channel = interaction.guild.channels.cache.get(channelId);

      if (!channel || !channel.isTextBased()) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `❌ Couldn't find a text channel with ID \`${channelId}\` in this server.`, "#ED4245", { ephemeral: true }));
      }

      settings.levelUpChannelId = channelId;
      saveSettings();

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ Level-up cards will now be posted in <#${channelId}>.`, "#57F287", { ephemeral: true }));
    }

    // Dashboard: save the new leaderboard panel channel (and move the panel there)
    if (interaction.customId === "modal_leaderboard_channel") {
      const channelId = parseChannelId(interaction.fields.getTextInputValue("channelId"));
      const channel = interaction.guild.channels.cache.get(channelId);

      if (!channel || !channel.isTextBased()) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `❌ Couldn't find a text channel with ID \`${channelId}\` in this server.`, "#ED4245", { ephemeral: true }));
      }

      const oldChannelId = leaderboardState.channelId;
      const oldMessageId = leaderboardState.messageId;

      if (channelId !== oldChannelId) {
        if (oldMessageId) {
          try {
            const oldChannel = await client.channels.fetch(oldChannelId).catch(() => null);
            const oldMessage = oldChannel ? await oldChannel.messages.fetch(oldMessageId).catch(() => null) : null;
            if (oldMessage) await oldMessage.delete().catch(() => {});
          } catch (err) {
            console.log("Could not clean up old leaderboard panel message:", err.message);
          }
        }
        leaderboardState.channelId = channelId;
        leaderboardState.messageId = null;
        saveLeaderboardState();
      }

      await postOrRefreshLeaderboard(interaction.guild);

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ Leaderboard panel will now live in <#${channelId}>.`, "#57F287", { ephemeral: true }));
    }

    // Settings page: save the new moderation log channel
    if (interaction.customId === "modal_log_channel") {
      const channelId = parseChannelId(interaction.fields.getTextInputValue("channelId"));
      const channel = interaction.guild.channels.cache.get(channelId);

      if (!channel || !channel.isTextBased()) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `❌ Couldn't find a text channel with ID \`${channelId}\` in this server.`, "#ED4245", { ephemeral: true }));
      }

      settings.logChannelId = channelId;
      saveSettings();

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ Moderation log messages will now be posted in <#${channelId}>.`, "#57F287", { ephemeral: true }));
    }

    // Settings page: save the new invite (join/leave) log channel
    if (interaction.customId === "modal_invite_log_channel") {
      const channelId = parseChannelId(interaction.fields.getTextInputValue("channelId"));
      const channel = interaction.guild.channels.cache.get(channelId);

      if (!channel || !channel.isTextBased()) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `❌ Couldn't find a text channel with ID \`${channelId}\` in this server.`, "#ED4245", { ephemeral: true }));
      }

      settings.inviteLogChannelId = channelId;
      saveSettings();

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ Join/leave invite messages will now be posted in <#${channelId}>.`, "#57F287", { ephemeral: true }));
    }

    // Settings page: save the new announcement channel
    if (interaction.customId === "modal_announcement_channel") {
      const channelId = parseChannelId(interaction.fields.getTextInputValue("channelId"));
      const channel = interaction.guild.channels.cache.get(channelId);

      if (!channel || !channel.isTextBased()) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `❌ Couldn't find a text channel with ID \`${channelId}\` in this server.`, "#ED4245", { ephemeral: true }));
      }

      settings.announcementChannelId = channelId;
      saveSettings();

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ XP Giveaway announcements will now default to <#${channelId}>.`, "#57F287", { ephemeral: true }));
    }

    // Settings page: save the new bot status text
    if (interaction.customId === "modal_bot_status") {
      const statusText = interaction.fields.getTextInputValue("statusText").trim();
      settings.botStatus = statusText;
      saveSettings();
      updateBotStatus();

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ Bot status set to \`Watching ${statusText}\`.`, "#57F287", { ephemeral: true }));
    }

    // Settings page: save any of the editable emojis (blank allowed = no emoji)
    const EMOJI_MODAL_SAVE_MAP = {
      modal_verify_emoji: value => { settings.verifyPanel.buttonEmoji = value; saveSettings(); },
      modal_join_emoji: value => { settings.joinEmoji = value; saveSettings(); },
      modal_leave_emoji: value => { settings.leaveEmoji = value; saveSettings(); },
      modal_campaign_emoji: value => { panelConfig.types.campaign.emoji = value; savePanelConfig(); },
      modal_service_emoji: value => { panelConfig.types.service.emoji = value; savePanelConfig(); },
      modal_moderator_emoji: value => { panelConfig.types.moderator.emoji = value; savePanelConfig(); },
      modal_outreacher_emoji: value => { panelConfig.types.outreacher.emoji = value; savePanelConfig(); }
    };

    if (EMOJI_MODAL_SAVE_MAP[interaction.customId]) {
      const emojiValue = interaction.fields.getTextInputValue("emoji").trim();

      if (!isValidEmojiInput(emojiValue)) {
        return interaction.reply(embedReplyOptions(
          interaction.user, interaction.guild,
          "❌ That doesn't look like a valid emoji. Use a normal emoji (🚀), a custom one in `<:name:id>` / `<a:name:id>` format, or leave it blank for no emoji.",
          "#ED4245", { ephemeral: true }
        ));
      }

      EMOJI_MODAL_SAVE_MAP[interaction.customId](emojiValue);

      if (interaction.customId === "modal_verify_emoji") {
        await refreshPostedPanel(settings.verifyPanel.panelChannelId, settings.verifyPanel.panelMessageId, buildVerifyPanelPayload());
      }

      if (interaction.customId.includes("campaign") || interaction.customId.includes("service") || interaction.customId.includes("moderator") || interaction.customId.includes("outreacher")) {
        await refreshPostedPanel(panelConfig.panelChannelId, panelConfig.panelMessageId, buildSubmitPanelPayload());
      }

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, emojiValue ? `✅ Emoji updated to ${emojiValue}.` : "✅ Emoji cleared — that button now has no emoji.", "#57F287", { ephemeral: true }));
    }

    // Button-label saves
    const BUTTONLABEL_SAVE_MAP = {
      modalsubmit_buttonlabel_verify: value => { settings.buttonLabels.verify = value; saveSettings(); },
      modalsubmit_buttonlabel_openoptions: value => { settings.buttonLabels.openOptions = value; saveSettings(); },
      modalsubmit_buttonlabel_campaign: value => { panelConfig.types.campaign.buttonLabel = value; savePanelConfig(); },
      modalsubmit_buttonlabel_service: value => { panelConfig.types.service.buttonLabel = value; savePanelConfig(); },
      modalsubmit_buttonlabel_moderator: value => { panelConfig.types.moderator.buttonLabel = value; savePanelConfig(); },
      modalsubmit_buttonlabel_outreacher: value => { panelConfig.types.outreacher.buttonLabel = value; savePanelConfig(); }
    };

    if (BUTTONLABEL_SAVE_MAP[interaction.customId]) {
      const value = interaction.fields.getTextInputValue("label").trim();
      if (!value) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Button labels can't be blank.", "#ED4245", { ephemeral: true }));
      }
      BUTTONLABEL_SAVE_MAP[interaction.customId](value);

      if (interaction.customId === "modalsubmit_buttonlabel_verify") {
        await refreshPostedPanel(settings.verifyPanel.panelChannelId, settings.verifyPanel.panelMessageId, buildVerifyPanelPayload());
      } else {
        await refreshPostedPanel(panelConfig.panelChannelId, panelConfig.panelMessageId, buildSubmitPanelPayload());
      }

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ Button label updated to \`${value}\`.`, "#57F287", { ephemeral: true }));
    }

    // Default embed color save
    if (interaction.customId === "modalsubmit_embed_color") {
      const color = interaction.fields.getTextInputValue("color").trim();
      settings.embedColor = color;
      saveSettings();

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ Default embed color set to \`${color}\`.`, "#57F287", { ephemeral: true }));
    }

    // Verify Panel saves
    if (interaction.customId === "modalsubmit_verifypanel_description") {
      settings.verifyPanel.description = interaction.fields.getTextInputValue("description").trim();
      saveSettings();
      await refreshPostedPanel(settings.verifyPanel.panelChannelId, settings.verifyPanel.panelMessageId, buildVerifyPanelPayload());
      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "✅ Verify panel description updated.", "#57F287", { ephemeral: true }));
    }

    if (interaction.customId === "modalsubmit_verifypanel_color") {
      settings.verifyPanel.color = interaction.fields.getTextInputValue("color").trim();
      saveSettings();
      await refreshPostedPanel(settings.verifyPanel.panelChannelId, settings.verifyPanel.panelMessageId, buildVerifyPanelPayload());
      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ Verify panel color set to \`${settings.verifyPanel.color}\`.`, "#57F287", { ephemeral: true }));
    }

    if (interaction.customId === "modalsubmit_verifypanel_buttoncolor") {
      settings.verifyPanel.buttonColor = interaction.fields.getTextInputValue("color").trim();
      saveSettings();
      await refreshPostedPanel(settings.verifyPanel.panelChannelId, settings.verifyPanel.panelMessageId, buildVerifyPanelPayload());
      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ Verify button color set to \`${settings.verifyPanel.buttonColor}\`.`, "#57F287", { ephemeral: true }));
    }

    if (interaction.customId === "modalsubmit_verifypanel_buttonemoji") {
      const emojiValue = interaction.fields.getTextInputValue("emoji").trim();
      if (!isValidEmojiInput(emojiValue)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ That doesn't look like a valid emoji. Leave blank for no emoji.", "#ED4245", { ephemeral: true }));
      }
      settings.verifyPanel.buttonEmoji = emojiValue;
      saveSettings();
      await refreshPostedPanel(settings.verifyPanel.panelChannelId, settings.verifyPanel.panelMessageId, buildVerifyPanelPayload());
      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, emojiValue ? `✅ Verify button emoji set to ${emojiValue}.` : "✅ Verify button emoji cleared.", "#57F287", { ephemeral: true }));
    }

    // Submit Panel saves
    if (interaction.customId === "modalsubmit_submitpanel_title") {
      panelConfig.title = interaction.fields.getTextInputValue("title").trim();
      savePanelConfig();
      await refreshPostedPanel(panelConfig.panelChannelId, panelConfig.panelMessageId, buildSubmitPanelPayload());
      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "✅ Submit panel title updated.", "#57F287", { ephemeral: true }));
    }

    if (interaction.customId === "modalsubmit_submitpanel_color") {
      settings.submitPanelColor = interaction.fields.getTextInputValue("color").trim();
      saveSettings();
      await refreshPostedPanel(panelConfig.panelChannelId, panelConfig.panelMessageId, buildSubmitPanelPayload());
      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ Submit panel color set to \`${settings.submitPanelColor}\`.`, "#57F287", { ephemeral: true }));
    }

    // Leaderboard style save (emoji + color)
    if (interaction.customId.startsWith("modalsubmit_lb_style_")) {
      const key = interaction.customId.replace("modalsubmit_lb_style_", "");
      const emoji = interaction.fields.getTextInputValue("emoji").trim();
      const color = interaction.fields.getTextInputValue("color").trim();

      if (!isValidEmojiInput(emoji)) {
        return interaction.reply(embedReplyOptions(
          interaction.user, interaction.guild,
          "❌ That doesn't look like a valid emoji. Use a normal emoji (🏆) or a custom one in `<:name:id>` / `<a:name:id>` format.",
          "#ED4245", { ephemeral: true }
        ));
      }

      settings.leaderboardStyles[key].emoji = emoji;
      settings.leaderboardStyles[key].color = color;
      saveSettings();

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ ${settings.leaderboardStyles[key].label} updated (${emoji}, ${color}).`, "#57F287", { ephemeral: true }));
    }

    // Leaderboard rotation interval save
    if (interaction.customId === "modalsubmit_lb_rotation") {
      const raw = interaction.fields.getTextInputValue("minutes").trim();
      const minutes = parseInt(raw, 10);

      if (isNaN(minutes) || minutes < 1) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Please enter a whole number of minutes (1 or more).", "#ED4245", { ephemeral: true }));
      }

      settings.leaderboardRotationMinutes = minutes;
      leaderboardState.nextRotationAt = Date.now() + minutes * 60 * 1000;
      saveSettings();
      saveLeaderboardState();

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ The leaderboard panel will now rotate every **${minutes}** minute(s).`, "#57F287", { ephemeral: true }));
    }

    // Leaderboard rank icon save
    if (interaction.customId === "modalsubmit_lb_icon") {
      settings.leaderboardIcon = interaction.fields.getTextInputValue("icon").trim();
      saveSettings();
      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, settings.leaderboardIcon ? `✅ Leaderboard rank icon set to \`${settings.leaderboardIcon}\`.` : "✅ Leaderboard rank icon cleared — ranks show as plain numbers now.", "#57F287", { ephemeral: true }));
    }

    // Image URL save (verify / submit / levelup / leaderboard)
    if (interaction.customId.startsWith("modalsubmit_image_")) {
      const key = interaction.customId.replace("modalsubmit_image_", "");
      const url = interaction.fields.getTextInputValue("url").trim();
      settings.images[key] = url.length ? url : null;
      saveSettings();

      if (key === "verify") await refreshPostedPanel(settings.verifyPanel.panelChannelId, settings.verifyPanel.panelMessageId, buildVerifyPanelPayload());
      if (key === "submit") await refreshPostedPanel(panelConfig.panelChannelId, panelConfig.panelMessageId, buildSubmitPanelPayload());

      return interaction.reply(embedReplyOptions(
        interaction.user, interaction.guild,
        settings.images[key] ? `✅ Image updated.` : `✅ Image cleared — that panel will show no image now.`,
        "#57F287", { ephemeral: true }
      ));
    }

    // Level-up/rank card style saves
    if (interaction.customId === "modalsubmit_levelup_barcolor") {
      const color = interaction.fields.getTextInputValue("color").trim();
      settings.levelUpStyle.barColor = color;
      saveSettings();
      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ Progress bar color set to \`${color}\`.`, "#57F287", { ephemeral: true }));
    }

    if (interaction.customId === "modalsubmit_levelup_font") {
      const font = interaction.fields.getTextInputValue("font").trim();
      settings.levelUpStyle.font = font;
      saveSettings();
      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ Font set to \`${font}\`.`, "#57F287", { ephemeral: true }));
    }

    if (interaction.customId === "modalsubmit_levelup_headline") {
      const headline = interaction.fields.getTextInputValue("headline").trim();
      settings.levelUpStyle.headline = headline;
      saveSettings();
      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ Headline text set to \`${headline}\`.`, "#57F287", { ephemeral: true }));
    }

    // Background position/zoom save
    if (interaction.customId === "modalsubmit_levelup_bgposition") {
      const offsetX = parseFloat(interaction.fields.getTextInputValue("offsetX").trim());
      const offsetY = parseFloat(interaction.fields.getTextInputValue("offsetY").trim());
      const zoom = parseFloat(interaction.fields.getTextInputValue("zoom").trim());

      if ([offsetX, offsetY, zoom].some(n => isNaN(n))) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Please enter valid numbers for offsetX, offsetY, and zoom.", "#ED4245", { ephemeral: true }));
      }

      settings.levelUpStyle.background = {
        offsetX: Math.max(-1, Math.min(1, offsetX)),
        offsetY: Math.max(-1, Math.min(1, offsetY)),
        zoom: Math.max(1, zoom)
      };
      saveSettings();

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ Background position updated (offsetX: ${settings.levelUpStyle.background.offsetX}, offsetY: ${settings.levelUpStyle.background.offsetY}, zoom: ${settings.levelUpStyle.background.zoom}).`, "#57F287", { ephemeral: true }));
    }

    // Element layout save — part 1: avatar / user line / headline
    if (interaction.customId === "modalsubmit_levelup_layout1") {
      const parseNums = (raw) => raw.split(",").map(s => s.trim());

      const avatarParts = parseNums(interaction.fields.getTextInputValue("avatar"));
      const userLineParts = parseNums(interaction.fields.getTextInputValue("userLine"));
      const headlineParts = parseNums(interaction.fields.getTextInputValue("headline"));

      if (avatarParts.length < 3 || headlineParts.length < 3 || userLineParts.length < 3) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Each field needs 3 comma-separated values, e.g. `40,40,90`.", "#ED4245", { ephemeral: true }));
      }

      if (!settings.levelUpStyle.layout) settings.levelUpStyle.layout = {};
      settings.levelUpStyle.layout.avatar = { x: parseFloat(avatarParts[0]), y: parseFloat(avatarParts[1]), size: parseFloat(avatarParts[2]) };
      settings.levelUpStyle.layout.userLine = {
        x: userLineParts[0].toLowerCase() === "auto" ? null : parseFloat(userLineParts[0]),
        y: userLineParts[1].toLowerCase() === "auto" ? null : parseFloat(userLineParts[1]),
        size: parseFloat(userLineParts[2])
      };
      settings.levelUpStyle.layout.headline = { x: parseFloat(headlineParts[0]), y: parseFloat(headlineParts[1]), size: parseFloat(headlineParts[2]) };
      saveSettings();

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "✅ Avatar / User Line / Headline positions updated.", "#57F287", { ephemeral: true }));
    }

    // Element layout save — part 2: sub line / progress bar / xp text
    if (interaction.customId === "modalsubmit_levelup_layout2") {
      const parseNums = (raw) => raw.split(",").map(s => s.trim());

      const sublineParts = parseNums(interaction.fields.getTextInputValue("subline"));
      const barParts = parseNums(interaction.fields.getTextInputValue("progressBar"));
      const xpParts = parseNums(interaction.fields.getTextInputValue("xpText"));

      if (sublineParts.length < 3 || barParts.length < 4 || xpParts.length < 3) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Sub Line/XP Text need 3 values (x,y,size); Progress Bar needs 4 (x,y,width,height).", "#ED4245", { ephemeral: true }));
      }

      if (!settings.levelUpStyle.layout) settings.levelUpStyle.layout = {};
      settings.levelUpStyle.layout.subline = { x: parseFloat(sublineParts[0]), y: parseFloat(sublineParts[1]), size: parseFloat(sublineParts[2]) };
      settings.levelUpStyle.layout.progressBar = { x: parseFloat(barParts[0]), y: parseFloat(barParts[1]), width: parseFloat(barParts[2]), height: parseFloat(barParts[3]) };
      settings.levelUpStyle.layout.xpText = { x: parseFloat(xpParts[0]), y: parseFloat(xpParts[1]), size: parseFloat(xpParts[2]) };
      saveSettings();

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "✅ Sub Line / Progress Bar / XP Text positions updated.", "#57F287", { ephemeral: true }));
    }

    // XP rate save
    if (interaction.customId === "modalsubmit_xp_rate") {
      const amount = parseInt(interaction.fields.getTextInputValue("amount").trim(), 10);
      const messages = parseInt(interaction.fields.getTextInputValue("messages").trim(), 10);

      if (isNaN(amount) || amount < 1 || isNaN(messages) || messages < 1) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Both fields must be whole numbers of 1 or more.", "#ED4245", { ephemeral: true }));
      }

      settings.xp.perTrigger = amount;
      settings.xp.messagesPerTrigger = messages;
      saveSettings();

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ Users now earn **${amount} XP** every **${messages}** message(s) sent.`, "#57F287", { ephemeral: true }));
    }

    // Start an XP giveaway
    if (interaction.customId === "modalsubmit_xp_giveaway_start") {
      const amount = interaction.fields.getTextInputValue("amount").trim();
      const goalRaw = interaction.fields.getTextInputValue("goal").trim();
      const winnersRaw = interaction.fields.getTextInputValue("winners").trim();
      const startRaw = interaction.fields.getTextInputValue("start").trim();
      const endRaw = interaction.fields.getTextInputValue("end").trim();

      const goal = goalRaw ? parseInt(goalRaw, 10) : 0;
      if (goalRaw && (isNaN(goal) || goal < 0)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Min XP required must be a whole number of 0 or more (or leave blank).", "#ED4245", { ephemeral: true }));
      }

      const winnerCount = winnersRaw ? parseInt(winnersRaw, 10) : 1;
      if (isNaN(winnerCount) || winnerCount < 1) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Number of winners must be a whole number of 1 or more.", "#ED4245", { ephemeral: true }));
      }

      // Dates are parsed as UTC. Accepts "YYYY-MM-DD HH:mm" or anything
      // Date() can parse; blank start = now, blank end = manual end only.
      function parseGiveawayDate(raw) {
        if (!raw) return null;
        const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(raw) ? raw.replace(" ", "T") + ":00Z" : raw;
        const d = new Date(normalized);
        return isNaN(d.getTime()) ? undefined : d.getTime();
      }

      const startAtParsed = parseGiveawayDate(startRaw);
      if (startAtParsed === undefined) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Couldn't understand that start date. Use `YYYY-MM-DD HH:mm` (UTC) or leave blank to start now.", "#ED4245", { ephemeral: true }));
      }
      const endAtParsed = parseGiveawayDate(endRaw);
      if (endAtParsed === undefined) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Couldn't understand that end date. Use `YYYY-MM-DD HH:mm` (UTC) or leave blank for a manual end.", "#ED4245", { ephemeral: true }));
      }

      const startAt = startAtParsed || Date.now();
      const endAt = endAtParsed || null;

      if (endAt && endAt <= startAt) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ The end date must be after the start date.", "#ED4245", { ephemeral: true }));
      }

      const channelId = settings.announcementChannelId;
      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `❌ Your configured announcement channel (<#${channelId}>) couldn't be found. Fix it under Settings > Channels first.`, "#ED4245", { ephemeral: true }));
      }

      const giveaway = {
        id: nextGiveawayId(),
        amount,
        xpGoal: goal,
        winnerCount,
        channelId,
        status: startAt <= Date.now() ? "active" : "scheduled",
        createdAt: Date.now(),
        startAt,
        endAt,
        startSnapshot: {},
        leaderboard: [],
        results: []
      };
      xpGiveaways.push(giveaway);
      saveXpGiveaways();

      if (giveaway.status === "active") {
        await activateGiveaway(giveaway, interaction.guild);
      } else {
        scheduleGiveawayStart(giveaway, interaction.guild);
      }

      const winnerDesc = winnerCount > 1 ? `top **${winnerCount}** split` : "**1** winner";
      const whenDesc = giveaway.status === "active" ? "started now" : `scheduled to start <t:${Math.floor(startAt / 1000)}:R>`;
      const endDesc = endAt ? `, ends <t:${Math.floor(endAt / 1000)}:R>` : ", ends manually";

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ Giveaway #${giveaway.id} created — $${amount} reward (${winnerDesc}), ${whenDesc}${endDesc}. Announcing in <#${channelId}>.`, "#57F287", { ephemeral: true }));
    }

    // Filter words: add
    if (interaction.customId === "modalsubmit_add_filter_word") {
      const category = interaction.fields.getTextInputValue("category").trim().toLowerCase();
      const word = interaction.fields.getTextInputValue("word").trim().toLowerCase();

      if (!customFilters[category]) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `❌ Unknown category \`${category}\`. Use one of: profanity, harassment, bullying, spam.`, "#ED4245", { ephemeral: true }));
      }
      if (!customFilters[category].includes(word)) {
        customFilters[category].push(word);
        saveCustomFilters();
      }

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ Added \`${word}\` to **${category}**.`, "#57F287", { ephemeral: true }));
    }

    // Filter words: remove
    if (interaction.customId === "modalsubmit_remove_filter_word") {
      const word = interaction.fields.getTextInputValue("word").trim().toLowerCase();
      let removed = false;
      for (const cat of Object.keys(customFilters)) {
        const idx = customFilters[cat].indexOf(word);
        if (idx !== -1) {
          customFilters[cat].splice(idx, 1);
          removed = true;
        }
      }
      if (removed) saveCustomFilters();

      return interaction.reply(embedReplyOptions(
        interaction.user, interaction.guild,
        removed ? `✅ Removed \`${word}\` from the custom filter list.` : `❌ \`${word}\` wasn't found in the custom filter list (built-in words can't be removed here).`,
        removed ? "#57F287" : "#ED4245",
        { ephemeral: true }
      ));
    }
    //============================================================================
    // Leaderboard search: find the user's rank and reply so only they can see it
    //============================================================================
    if (interaction.customId === "lb_search_modal") {
      const query = interaction.fields.getTextInputValue("query").trim().toLowerCase();
      const type = leaderboardState.type;
      const meta = settings.leaderboardStyles[type];
      const entries = getLeaderboardEntries(type);

      let foundIndex = -1;
      let foundUser = null;
      for (let i = 0; i < entries.length; i++) {
        const user = await client.users.fetch(entries[i].userId).catch(() => null);
        if (!user) continue;
        if (user.username.toLowerCase() === query || user.tag.toLowerCase() === query || user.username.toLowerCase().includes(query)) {
          foundIndex = i;
          foundUser = user;
          break;
        }
      }

      if (foundIndex === -1) {
        return interaction.reply(embedReplyOptions(
          interaction.user,
          interaction.guild,
          `❌ Couldn't find **${query}** on the ${meta.label} (top ${settings.leaderboardDisplayCount}).`,
          "#ED4245",
          { ephemeral: true }
        ));
      }

      const rank = foundIndex + 1;
      const line = formatLeaderboardLine(type, rank, entries[foundIndex]);

      return interaction.reply(embedReplyOptions(
        interaction.user,
        interaction.guild,
        `🎯 **You're Ranked...**\n\n${line}`,
        meta.color,
        { ephemeral: true }
      ));
    }

    const modalConfig = Object.values(submitModals).find(m => m.id === interaction.customId);
    if (!modalConfig) return;

    try {
      const fieldsData = modalConfig.fields.map(f => ({
        label: f.label,
        value: interaction.fields.getTextInputValue(f.id)
      }));

      const submissionId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

      submissions.push({
        id: submissionId,
        type: modalConfig.title,
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        fields: fieldsData,
        status: "pending",
        timestamp: Date.now()
      });
      saveSubmissions();

      return interaction.reply(embedReplyOptions(
        interaction.user,
        interaction.guild,
        "✅ Your request has been successfully submitted!\n\n-# You'll receive a DM once reviewed!",
        "#57F287",
        { ephemeral: true }
      ));
    } catch (error) {
      console.error(error);
      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `❌ Error submitting request: ${error.message}`, "#ED4245", { ephemeral: true }));
    }
  }
});

// ==========================================================
// ===== VOICE XP =====
// ==========================================================

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;
  const userId = member.id;

  if (!oldState.channelId && newState.channelId) {
    voiceJoinTimes.set(userId, Date.now());
    return;
  }

  if (oldState.channelId && !newState.channelId) {
    const joinTime = voiceJoinTimes.get(userId);
    voiceJoinTimes.delete(userId);
    if (!joinTime) return;

    const minutes = Math.floor((Date.now() - joinTime) / 60000);
    if (minutes <= 0) return;

    const gained = minutes * VOICE_XP_PER_MINUTE;
    const { leveledUp, oldLevel, newLevel, currentXp } = addXP(userId, gained);

    if (leveledUp) {
      const guild = newState.guild || oldState.guild;
      await announceLevelUp(member.user, guild, oldLevel, newLevel, currentXp);
    }
  }
});

// ==========================================================
// ===== MESSAGE HANDLER =====
// ==========================================================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  // ===== MESSAGES SENT LEADERBOARD (persisted count) =====
  messageStats[message.author.id] = (messageStats[message.author.id] || 0) + 1;
  saveMessageStats();

  // ===== MESSAGE XP (configurable in Settings > XP Settings) =====
  const messagesPerTrigger = Math.max(1, Number(settings.xp.messagesPerTrigger) || 1);
  const xpPerTrigger = Math.max(1, Number(settings.xp.perTrigger) || 100);

  const newCount = (messageCounts.get(message.author.id) || 0) + 1;
  messageCounts.set(message.author.id, newCount);

  if (newCount % messagesPerTrigger === 0) {
    const { leveledUp, oldLevel, newLevel, currentXp } = addXP(message.author.id, xpPerTrigger);
    if (leveledUp) {
      await announceLevelUp(message.author, message.guild, oldLevel, newLevel, currentXp);
    }
  }

  // ===== SUBMIT PANEL TEXT EDITOR (type your panel text + "--submit") =====
  if (message.content.toLowerCase().includes("--submit")) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply(embedReplyOptions(message.author, message.guild, "❌ You must be an admin to edit the submission panel.", "#ED4245"));
    }

    const newDescription = parsePanelMessage(message.content);
    if (!newDescription) {
      return message.reply(embedReplyOptions(message.author, message.guild, "❌ You didn't type anything to update before `--submit`.", "#ED4245"));
    }

    panelConfig.description = newDescription;
    savePanelConfig();

    const payload = buildSubmitPanelPayload();
    let updated = false;

    if (panelConfig.panelChannelId && panelConfig.panelMessageId) {
      try {
        const ch = await client.channels.fetch(panelConfig.panelChannelId);
        const msg = await ch.messages.fetch(panelConfig.panelMessageId);
        await msg.edit(payload);
        updated = true;
      } catch (err) {
        console.log("Could not find/edit the existing panel message, sending a new one instead.");
      }
    }

    if (!updated) {
      const sent = await message.channel.send(payload);
      panelConfig.panelMessageId = sent.id;
      panelConfig.panelChannelId = sent.channel.id;
      savePanelConfig();
    }

    return message.reply(embedReplyOptions(message.author, message.guild, "✅ Submit panel updated!", "#57F287"));
  }

  // ===== VERIFY SETUP COMMAND (legacy prefix) =====
  if (message.content.startsWith("!verifysetup")) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply(embedReplyOptions(message.author, message.guild, "❌ You must be an admin to use this command.", "#ED4245"));
    }

    const payload = buildVerifyPanelPayload();
    const sent = await message.channel.send(payload);
    settings.verifyPanel.panelChannelId = sent.channel.id;
    settings.verifyPanel.panelMessageId = sent.id;
    saveSettings();

    message.reply(embedReplyOptions(message.author, message.guild, "✅ Verification panel posted from Settings > Verify Panel.", "#57F287"));
  }

  // ===== WORD FILTER =====
  const WHITELISTED_ROLES = ['1360755486793666580', '1507406270519312565']; // <-- Add Admin/Mod role IDs to bypass filters

  if (message.member && message.member.roles.cache.some(role => WHITELISTED_ROLES.includes(role.id))) return;

  // ===== DISCORD INVITE LINK FILTER (toggleable in Settings > Invite Links) =====
  const INVITE_LINK_REGEX = /(discord\.gg\/|discord(?:app)?\.com\/invite\/)[a-zA-Z0-9-]+/i;
  if (settings.linkFilterEnabled && INVITE_LINK_REGEX.test(message.content)) {
    await message.delete().catch(() => {});

    try {
      await message.author.send({
        embeds: [createEmbed(message.author, message.guild, `😡 You can't send that invite link in **${message.guild.name}**.`, "#ED4245")]
      });
    } catch (dmErr) {
      console.log(`Could not DM user ${message.author.id} about their removed invite link.`);
    }

    return;
  }

  const content = message.content.toLowerCase();
  const activeFilters = getActiveFilters();
  let filterType = null;
  let foundWord = null;

  for (const [type, words] of Object.entries(activeFilters)) {
    for (const word of words) {
      const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (regex.test(content)) {
        foundWord = word;
        filterType = type;
        break;
      }
    }
    if (foundWord) break;
  }

  if (foundWord) {
    stats.wordFilterHits++;
    saveStats();

    const originalMessageContent = message.content;
    await message.delete();

    const userId = message.author.id;
    let count = (warnings.get(userId) || 0) + 1;
    warnings.set(userId, count);

    const logChannel = await getChannelSafe(message.guild, settings.logChannelId, "Log channel");

    setTimeout(() => {
      const currentCount = warnings.get(userId) || 0;
      if (currentCount > 0) {
        warnings.set(userId, currentCount - 1);

        if (logChannel) {
          const expireEmbed = createEmbed(
            message.author,
            message.guild,
            `⏱️ **Warning Expired**\n\n**User:** ${message.author} (${userId})\n1 active strike has been removed after 24 hours.`,
            "#3498DB"
          );
          logChannel.send({ embeds: [expireEmbed] });
        }
      }
    }, 24 * 60 * 60 * 1000);

    if (count >= 3) {
      warnings.set(userId, 0);

      try {
        await message.author.send({
          embeds: [
            createEmbed(
              message.author,
              message.guild,
              `🚨 **You have been timed out in** **${message.guild.name}**\n\n**Reason:** Rule Violations.\n**Duration:** 5 minutes.`,
              "#ff0000"
            )
          ]
        });
      } catch (dmErr) {
        console.log(`Could not DM user ${userId}: DMs are likely disabled.`);
      }

      try {
        await message.member.timeout(5 * 60 * 1000, "Auto timeout: 3 rule violations");
      } catch (err) {
        console.log("Timeout error:", err);
      }

      const publicTimeoutEmbed = createEmbed(
        message.author,
        message.guild,
        `🚨 **You're on Timeout**\n\n**User:** ${message.author}\n**Reason:** 3 rule violations (Last: \`${foundWord}\`)`,
        "#ED4245"
      );
      await message.channel.send({ embeds: [publicTimeoutEmbed] });

      if (logChannel) {
        const logTimeoutEmbed = createEmbed(
          message.author,
          message.guild,
          `**🛡️Timeout Issued**\n\n**User:** ${message.author} (${userId})\n**Reason:**  Rule Violations\n**Last Trigger Word:** \`${foundWord}\`\n**Full Final Message:** \`${originalMessageContent}\`\n**Duration:** 5 Minutes`,
          "#ED4245"
        );
        logChannel.send({ embeds: [logTimeoutEmbed] });
      }
      return;
    }

    const FILTER_REASON_LABELS = {
      profanity: "Profanity",
      harassment: "Harassment",
      bullying: "Bullying",
      spam: "Spam"
    };
    const reasonLabel = FILTER_REASON_LABELS[filterType] || "Rule Violation";

    const publicWarnEmbed = createEmbed(
      message.author,
      message.guild,
      `⚠️ **You Have Been Warned**\nReason: ${reasonLabel}`,
      "#FEE75C"
    );
    await message.channel.send({ embeds: [publicWarnEmbed] });

    if (logChannel) {
      const logWarnEmbed = createEmbed(
        message.author,
        message.guild,
        `⚠️ **Word Filter Hit**\n\n**User:** ${message.author} (${userId})\n**Channel:** ${message.channel}\n**Filter Category:** \`${filterType}\`\n**Trigger Word:** \`${foundWord}\`\n**Full Sent Message:** \`${originalMessageContent}\`\n**Current Strike Count:** ${count}/3`,
        "#FEE75C"
      );
      logChannel.send({ embeds: [logWarnEmbed] });
    }
  }
  //=========================================================
  // ===== LEGACY PREFIX COMMANDS (e.g., !kick, !ban) =====
  //=========================================================  
  
  if (!message.content.startsWith("!")) return;
  const parts = message.content.slice(1).trim().split(/\s+/);
  const command = parts.shift().toLowerCase();

  if (command === "kick") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      return message.reply(embedReplyOptions(message.author, message.guild, "❌ You don't have permission to kick members.", "#ED4245"));
    }

    const member = message.mentions.members.first();
    if (!member) return message.reply(embedReplyOptions(message.author, message.guild, "⚠️ Mention a user to kick.", "#FEE75C"));
    if (!member.kickable) return message.reply(embedReplyOptions(message.author, message.guild, "⚠️ Sorry I Cannot Kick that User.", "#FEE75C"));

    await member.kick();
    stats.totalKicks++;
    saveStats();

    return message.channel.send({
      embeds: [createEmbed(message.author, message.guild, `👢 ${member.user.tag} Was Kicked Successfully.`, "#ff0000")]
    });
  }

  if (command === "ban") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return message.reply(embedReplyOptions(message.author, message.guild, "❌ You don't have permission to ban members.", "#ED4245"));
    }

    const member = message.mentions.members.first();
    if (!member) return message.reply(embedReplyOptions(message.author, message.guild, "⚠️ **You must mention a User to Ban.**", "#FEE75C"));
    if (!member.bannable) return message.reply(embedReplyOptions(message.author, message.guild, "⚠️ **Sorry, I cannot Ban that user.**", "#FEE75C"));

    await member.ban();
    stats.totalBans++;
    saveStats();

    return message.channel.send({
      embeds: [createEmbed(message.author, message.guild, `🔨 ${member.user.tag} **Was Banned Successfully.**`, "#ED4245")]
    });
  }
});

// ==========================================================
// ===== LOGIN =====
// ==========================================================

client.login(process.env.TOKEN)
  .then(() => console.log("✅ Login request sent to Discord"))
  .catch((err) => console.error("❌ LOGIN ERROR:", err));