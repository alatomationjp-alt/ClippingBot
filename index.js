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

// which application types are currently accepted
let settings = loadJSON(SETTINGS_FILE, {
  open: { campaign: true, service: true, moderator: true, outreacher: true },
  levelUpChannelId: "1400519902976282876",
  logChannelId: "1517364435574984745",
  inviteLogChannelId: "1400219574695104674",
  joinEmoji: "📥",
  leaveEmoji: "📤",
  verifyEmoji: "✅",
  botStatus: "ClippingBase.com",
  linkFilterEnabled: true,
  embedColor: "#2B2D31",
  images: { verify: null, submit: null, levelup: null },
  leaderboardStyles: {
    level: { label: "Level Leaderboard", emoji: "🏆", color: "#F1C40F" },
    xp: { label: "XP Leaderboard", emoji: "✨", color: "#9B59B6" },
    invites: { label: "Invites Leaderboard", emoji: "📨", color: "#5865F2" },
    messages: { label: "Messages Leaderboard", emoji: "💬", color: "#57F287" }
  },
  leaderboardRotationMinutes: 5,
  levelUpStyle: {
    barColor: "#57F287",
    font: "sans-serif",
    headline: "Level-up!"
  }
});
if (!settings.levelUpChannelId) settings.levelUpChannelId = "1400519902976282876";
if (!settings.logChannelId) settings.logChannelId = "1517364435574984745";
if (!settings.inviteLogChannelId) settings.inviteLogChannelId = "1400219574695104674";
if (!settings.joinEmoji) settings.joinEmoji = "📥";
if (!settings.leaveEmoji) settings.leaveEmoji = "📤";
if (!settings.verifyEmoji) settings.verifyEmoji = "✅";
if (!settings.botStatus) settings.botStatus = "ClippingBase.com";
if (settings.linkFilterEnabled === undefined) settings.linkFilterEnabled = true;
if (!settings.embedColor) settings.embedColor = "#2B2D31";
if (!settings.images) settings.images = { verify: null, submit: null, levelup: null };
if (settings.images.verify === undefined) settings.images.verify = null;
if (settings.images.submit === undefined) settings.images.submit = null;
if (settings.images.levelup === undefined) settings.images.levelup = null;
if (!settings.leaderboardStyles) {
  settings.leaderboardStyles = {
    level: { label: "Level Leaderboard", emoji: "🏆", color: "#F1C40F" },
    xp: { label: "XP Leaderboard", emoji: "✨", color: "#9B59B6" },
    invites: { label: "Invites Leaderboard", emoji: "📨", color: "#5865F2" },
    messages: { label: "Messages Leaderboard", emoji: "💬", color: "#57F287" }
  };
}
if (!settings.leaderboardRotationMinutes) settings.leaderboardRotationMinutes = 5;
if (!settings.levelUpStyle) {
  settings.levelUpStyle = { barColor: "#57F287", font: "sans-serif", headline: "Level-up!" };
}
if (!settings.levelUpStyle.barColor) settings.levelUpStyle.barColor = "#57F287";
if (!settings.levelUpStyle.font) settings.levelUpStyle.font = "sans-serif";
if (!settings.levelUpStyle.headline) settings.levelUpStyle.headline = "Level-up!";
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

// the editable text/buttons on the Submit-a-Request panel
let panelConfig = loadJSON(PANEL_CONFIG_FILE, {
  title: "ClippingBase — Submissions & Applications",
  description: "Choose the application or request that best matches what you're looking for.",
  footer: "ClippingBase — Submissions & Applications",
  types: {
    campaign: {
      buttonLabel: "Launch a Campaign",
      buttonColor: "green",
      emoji: "🚀",
      text: "Launch a campaign to promote your brand, creator profile, app, product, or content through our network of creators. We'll help build a strategy designed to maximize your reach."
    },
    service: {
      buttonLabel: "Service Provider",
      buttonColor: "blue",
      emoji: "🔧",
      text: "Offer your professional services to ClippingBase. Whether you're a designer, developer, editor, marketer, or another specialist, we'd love to hear what you can bring to the platform."
    },
    moderator: {
      buttonLabel: "Content Moderator",
      buttonColor: "red",
      emoji: "🛡️",
      text: "Apply to join our moderation team. Review campaign submissions, enforce quality standards, and help keep ClippingBase running smoothly."
    },
    outreacher: {
      buttonLabel: "Outreacher",
      buttonColor: "",
      emoji: "🤝",
      text: "Help us bring creators, brands, and businesses to ClippingBase. Approved applicants receive access to our private Outreach Hub and exclusive opportunities."
    }
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

// { channelId, messageId, type: 'level'|'xp'|'invites'|'messages' }
let leaderboardState = loadJSON(LEADERBOARD_STATE_FILE, {
  channelId: "1400219324853256316",
  messageId: null,
  type: "level"
});
if (!leaderboardState.type) leaderboardState.type = "level";
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

const SUBMIT_BUTTON_TYPE = {
  submit_campaign: "campaign",
  submit_service: "service",
  submit_moderator: "moderator",
  submit_outreacher: "outreacher"
};

// Returns the currently configured emoji for a submit-panel type, falling
// back to the built-in default if it hasn't been customized yet.
function getTypeEmoji(key) {
  return (panelConfig.types[key] && panelConfig.types[key].emoji) || TYPE_EMOJI_DEFAULTS[key];
}

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

// All level-up images get posted here, regardless of which channel the user
// was chatting in when they leveled up. Editable live via the /dashboard
// "Settings > Channels" menu — see settings.levelUpChannelId.

const CARD_WIDTH = 900;
const CARD_HEIGHT = 320;

// Draws `img` into the rect (x, y, w, h) using "cover" behavior — scales the
// image up so it fully fills the rect (no letterboxing) and center-crops any
// overflow, same idea as CSS `background-size: cover`. Keeps portrait/odd
// aspect ratio backgrounds from looking stretched or squashed.
//
// offsetXPct / offsetYPct (-1..1) pan the crop left/right and up/down within
// the overflow room created by "cover" scaling. zoom (>=1) zooms in further
// before panning. All three are configurable per-server via
// Settings > Level-Up Card > Background Position.
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

  // Pan within the overflow room (how much bigger the scaled image is than
  // the rect) based on -1..1 percentages.
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

// Clips the canvas to a rounded-rectangle so the whole card (background image
// included) has soft corners like the reference design.
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

// Same rounded-rect path but WITHOUT clipping — used when you just want to
// fill/stroke a rounded shape (e.g. a progress bar) without affecting
// anything drawn after it.
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

// Loads the configured level-up background: a settings.images.levelup URL
// takes priority, then a local assets/levelup-bg.* file, then null (caller
// falls back to the gradient).
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

// ----------------------------------------------------------
// Level-up / rank card LAYOUT system
// ----------------------------------------------------------
// Every positionable element on the card (avatar, the "@user ..." line, the
// big headline, the sub line, the progress bar, and the XP text) has a
// configurable x/y (and size) stored in settings.levelUpStyle.layout. This
// lets an admin reposition things just by editing Settings > Level-Up Card,
// without touching code. Defaults below match the original design.
const DEFAULT_LEVELUP_LAYOUT = {
  avatar: { x: 40, y: 40, size: 90 },
  // userLine x/y of null means "auto" — follow the avatar like the original
  // design (to the right of it, vertically centered on it).
  userLine: { x: null, y: null, size: 32 },
  headline: { x: CARD_WIDTH / 2, y: 185, size: 68 },
  subline: { x: CARD_WIDTH / 2, y: 240, size: 34 },
  // progressBar.x is the CENTER of the bar (matches how it already behaved).
  progressBar: { x: CARD_WIDTH / 2, y: 272, width: 500, height: 20 },
  // xpText is the "N / N XP to level N" caption. Made bigger + bolder than
  // the original 14px by default so it's actually readable on the card.
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

// Builds the level-up card as a PNG buffer, styled like a level-up banner:
// rounded card, avatar + "@user you are now level N!" up top, a big
// "Level-up!" headline, an "oldLevel • newLevel" line, and a progress bar
// toward the next level — all over the configured background image (or the
// rainbow gradient fallback). All element positions come from
// getLevelUpLayout() so they're fully editable via Settings.
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

  // Lighter dark overlay than before so the background image reads through
  // more clearly, while text stays legible.
  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.restore();

  // ----- Avatar (rounded square, position/size configurable) -----
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

  // ----- "@user you are now level N!" -----
  const userLineX = layout.userLine.x !== null && layout.userLine.x !== undefined ? layout.userLine.x : avatarX + avatarSize + 30;
  const userLineY = layout.userLine.y !== null && layout.userLine.y !== undefined ? layout.userLine.y : avatarY + avatarSize / 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${layout.userLine.size}px ${font}`;
  ctx.fillText(`@${user.username} you are now level ${newLevel}!`, userLineX, userLineY);

  // ----- Big headline (configurable text + position/size) -----
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${layout.headline.size}px ${font}`;
  ctx.fillText(style.headline || "Level-up!", layout.headline.x, layout.headline.y);

  // ----- "oldLevel • newLevel" -----
  ctx.fillStyle = "#d9d9d9";
  ctx.font = `bold ${layout.subline.size}px ${font}`;
  ctx.fillText(`${oldLevel} • ${newLevel}`, layout.subline.x, layout.subline.y);

  // ----- Progress bar toward the NEXT level -----
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

  // ----- XP caption — bigger + bolder + drop shadow so it's actually visible -----
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

// Builds the /rank card as a PNG buffer, using the same background as the
// level-up card (configurable in Settings > Images > Level-Up Background)
// and the SAME layout positions as the level-up card (Settings > Level-Up
// Card > Element Layout), so moving something once moves it on both cards.
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

// Level up messages ping the user in the message content, with the card
// embedded in an embed (avatar top-left via setAuthor, @mention in the
// description, and a footer with the server icon/name + timestamp). Always
// posts to settings.levelUpChannelId, falling back to the guild's system
// channel if that ID hasn't been set/found.
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

// ===== TESTING XP MODE =====
// Right now XP is granted every N messages a user sends, no cooldown, no
// randomness — easy to test level-ups quickly. Swap this out for real
// requirements (cooldown, randomized amount, spam filtering, etc.) later.
const messageCounts = new Map(); // userId -> running count of messages sent
const MESSAGES_PER_XP_TRIGGER = 1; // every single message grants XP while testing
const TEST_XP_PER_TRIGGER = 100; // level 0 needs 100 XP, so this levels someone up on their very first message — easy to eyeball while testing

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
    .setDescription("Create a verification panel")
    .addStringOption(option => option.setName("description").setDescription("Embed description").setRequired(true))
    .addStringOption(option => option.setName("color").setDescription("Hex color").setRequired(true))
    .addStringOption(option => option.setName("image").setDescription("Image URL (defaults to Settings > Images if left blank)").setRequired(false))
    .addStringOption(option => option.setName("emoji").setDescription("Button emoji").setRequired(false)),

  new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("Open the moderation dashboard"),

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
    .setDescription("Post the Submit a Request panel (admin only)")

].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

client.once(Events.ClientReady, async () => {
  try {
    // NOTE: Only GLOBAL commands are registered. We also clear guild-scoped
    // commands in EVERY server the bot is in (not just process.env.GUILD_ID)
    // so leftover per-guild commands from earlier testing can't sit next to
    // the global ones and show up as duplicates in the slash-command picker
    // — this is what was causing "two /dashboard" to appear. Global commands
    // can take up to ~1 hour to propagate; that part is expected.
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

  // Cache current invite use-counts per guild so GuildMemberAdd can tell
  // which invite a new member came in on, and resync stored invite totals
  // against Discord's live counts (fixes undercounts from missed events).
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

  // Post/refresh the persistent leaderboard panel, then keep it rotating
  // between leaderboard types on a timer (interval editable in Settings).
  const leaderboardGuild = process.env.GUILD_ID
    ? client.guilds.cache.get(process.env.GUILD_ID)
    : client.guilds.cache.first();

  if (leaderboardGuild) {
    await postOrRefreshLeaderboard(leaderboardGuild);
    scheduleLeaderboardRotation(leaderboardGuild);
  } else {
    console.error("❌ Could not resolve a guild to post the leaderboard panel in.");
  }
});

// ==========================================================
// ===== INVITE TRACKING =====
// ==========================================================

// Recomputes each inviter's total from Discord's live invite `uses` counts
// and raises the stored total to match if our incremental tracking ever fell
// behind (missed events, bot downtime, etc). Never lowers a stored count.
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

      // "Fake" invite heuristic: brand-new accounts are commonly used to
      // farm invite rewards. Doesn't affect the total, just tracked
      // separately so the leaderboard can show it.
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
      logChannel.send({ embeds: [createEmbed(member.user, guild, desc, "#57F287")] })
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
      logChannel.send({ embeds: [createEmbed(member.user, guild, desc, "#ED4245")] })
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

// Merges the built-in word lists with whatever custom words admins have
// added via Settings > Filter Words. Always re-read live (customFilters is
// mutated directly by the add/remove handlers).
function getActiveFilters() {
  const merged = {};
  for (const cat of Object.keys(BUILTIN_FILTERS)) {
    merged[cat] = [...BUILTIN_FILTERS[cat], ...(customFilters[cat] || [])];
  }
  return merged;
}

function createEmbed(user, guild, description, color = null) {
  return new EmbedBuilder()
    .setColor(color || settings.embedColor || "#5865F2")
    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ dynamic: true, size: 1024 }) })
    .setDescription(description)
    .setFooter({ text: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
    .setTimestamp();
}

// Small helper so every plain-text reply/editReply in the bot goes out as an
// embed instead of raw content. Pass through any extra interaction reply
// options (ephemeral, components, etc.) via `extra`.
function embedReplyOptions(user, guild, description, color = "#5865F2", extra = {}) {
  return { embeds: [createEmbed(user, guild, description, color)], ...extra };
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

// Accepts either a raw channel ID or a "#channel" mention and returns the
// bare numeric ID.
function parseChannelId(raw) {
  return (raw || "").replace(/[<#>]/g, "").trim();
}

function resolveButtonStyle(colorName) {
  switch ((colorName || "").toLowerCase()) {
    case "green": case "success": return ButtonStyle.Success;
    case "red": case "danger": return ButtonStyle.Danger;
    case "blue": case "blurple": case "primary": return ButtonStyle.Primary;
    case "grey": case "gray": case "secondary": return ButtonStyle.Secondary;
    default: return ButtonStyle.Secondary; // left empty -> default grey
  }
}

function buildSubmitPanelPayload() {
  const embed = new EmbedBuilder()
    .setColor(settings.embedColor || "#2B2D31")
    .setTitle(panelConfig.title)
    .setDescription(panelConfig.description)
    .setFooter({ text: panelConfig.footer });

  if (settings.images.submit) embed.setImage(settings.images.submit);

  ["campaign", "service", "moderator", "outreacher"].forEach(key => {
    const t = panelConfig.types[key];
    embed.addFields({ name: `${getTypeEmoji(key)} ${t.buttonLabel}`, value: t.text });
  });

  const row = new ActionRowBuilder().addComponents(
    ["campaign", "service", "moderator", "outreacher"].map(key => {
      const t = panelConfig.types[key];
      return new ButtonBuilder()
        .setCustomId(`submit_${key}`)
        .setLabel(t.buttonLabel)
        .setEmoji(getTypeEmoji(key))
        .setStyle(resolveButtonStyle(t.buttonColor));
    })
  );

  return { embeds: [embed], components: [row] };
}

const TYPE_KEYS = {
  "promotion campaign": "campaign",
  "service provider": "service",
  "content moderator": "moderator",
  "outreacher": "outreacher"
};

function stripLeadingSymbols(line) {
  return line.replace(/^[^\w]+/u, "").trim();
}

// Parses a freeform message like:
//   ClippingBase — Submissions & Applications
//   Choose the application or request that best matches what you're looking for.
//   Promotion Campaign | green
//   Launch a campaign to promote your brand...
//   Service Provider | blue
//   ...
//   ClippingBase — Submissions & Applications
//   --submit
//
// Rule: line 1 = title, line 2 = description, LAST line = footer, IF those
// lines are present. This is intentionally lenient — whatever you actually
// typed gets applied, even a single line or a single word. Anything you
// don't include just keeps its previous value. Only hard-fails if literally
// nothing was typed before "--submit".
// Strips leading/trailing lines that are 100% blank (just whitespace) so the
// removal of "--submit" doesn't throw off which line is "first"/"last", but
// keeps everything else byte-for-byte as typed — including internal blank
// lines, leading spaces, and markdown like **bold** or *italic*.
function trimBlankEdgeLines(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start++;
  while (end > start && lines[end - 1].trim() === "") end--;
  return lines.slice(start, end);
}

function parsePanelMessage(rawContent) {
  const withoutCommand = rawContent.replace(/--submit/gi, "");
  const rawLines = withoutCommand.split("\n").map(l => l.replace(/\r$/, ""));
  const lines = trimBlankEdgeLines(rawLines);

  if (lines.length === 0) {
    return { error: "You didn't type anything to update before `--submit`." };
  }

  // Not enough lines to have a distinct title/description/footer/body —
  // just apply whatever was given, in order, and leave everything else as-is.
  // Title/description/footer are kept EXACTLY as typed (spaces, bold, etc).
  let title = panelConfig.title;
  let description = panelConfig.description;
  let footer = panelConfig.footer;
  let bodyRegionLines = [];

  if (lines.length === 1) {
    title = lines[0];
  } else if (lines.length === 2) {
    title = lines[0];
    description = lines[1];
  } else {
    title = lines[0];
    description = lines[1];
    footer = lines[lines.length - 1];
    bodyRegionLines = lines.slice(2, lines.length - 1);
  }

  const found = {};
  let currentType = null;
  let buffer = [];

  const flush = () => {
    if (currentType) found[currentType].text = trimBlankEdgeLines(buffer).join("\n");
  };

  for (const line of bodyRegionLines) {
    // Only the HEADER line (e.g. "Promotion Campaign | green") gets stripped
    // for matching purposes — everything else (the actual body text) is kept
    // completely untouched, including bold/italic markdown and spacing.
    const strippedForMatch = stripLeadingSymbols(line.trim());
    const [namePartRaw, colorPartRaw] = strippedForMatch.split("|");
    const namePart = (namePartRaw || "").trim();
    const colorPart = (colorPartRaw || "").trim().toLowerCase();
    const typeKey = line.trim() !== "" ? TYPE_KEYS[namePart.toLowerCase()] : undefined;

    if (typeKey) {
      flush();
      currentType = typeKey;
      found[typeKey] = {
        buttonLabel: panelConfig.types[typeKey] ? panelConfig.types[typeKey].buttonLabel : namePart,
        buttonColor: colorPart || (panelConfig.types[typeKey] ? panelConfig.types[typeKey].buttonColor : ""),
        emoji: panelConfig.types[typeKey] ? panelConfig.types[typeKey].emoji : TYPE_EMOJI_DEFAULTS[typeKey],
        text: ""
      };
      buffer = [];
    } else if (currentType) {
      buffer.push(line);
    }
  }
  flush();

  const allKeys = ["campaign", "service", "moderator", "outreacher"];
  const mergedTypes = {};
  const updatedKeys = [];
  for (const key of allKeys) {
    if (found[key] && found[key].text) {
      mergedTypes[key] = found[key];
      updatedKeys.push(key);
    } else {
      mergedTypes[key] = panelConfig.types[key];
    }
  }

  // Title/description/footer always count as "updated" if this parse ran at
  // all — even with zero recognized type sections, whatever text was typed
  // still gets applied.
  const changedTopLevel = [];
  if (title !== panelConfig.title) changedTopLevel.push("title");
  if (description !== panelConfig.description) changedTopLevel.push("description");
  if (footer !== panelConfig.footer) changedTopLevel.push("footer");

  return { title, description, footer, types: mergedTypes, updatedKeys: [...changedTopLevel, ...updatedKeys] };
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
    .setColor(settings.embedColor || "#99AAB5")
    .setDescription("Pick a category below to view and edit that part of the bot.")
    .addFields(
      { name: "📁 Channels", value: "Level-up, leaderboard, mod-log and invite-log channels, plus an invite resync tool.", inline: false },
      { name: "😀 Emoji Buttons", value: "Verify / join / leave emoji, and the 4 submit-panel button emojis.", inline: false },
      { name: "🎨 Panel Colors", value: "Button colors for each submit-panel type, and the shared embed color.", inline: false },
      { name: "🎚️ Submission Panel", value: "Turn each application type ON/OFF, plus the invite-link filter.", inline: false },
      { name: "🏆 Leaderboard Style", value: "Edit the label, emoji, color, and rotation interval for the leaderboard panel.", inline: false },
      { name: "🖼️ Images", value: "Set (or clear) the images used on the Verify, Submit and Level-Up panels.", inline: false },
      { name: "🎉 Level-Up Card", value: "Edit the progress bar color, font, headline text, background position/zoom, and the position of every element on the card.", inline: false },
      { name: "🚫 Filter Words", value: "Add or remove custom words the auto-moderator watches for.", inline: false }
    )
    .setFooter(settingsFooter(guild))
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("settings_channels").setLabel("Channels").setEmoji("📁").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("settings_emojis").setLabel("Emoji Buttons").setEmoji("😀").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("settings_panelcolors").setLabel("Panel Colors").setEmoji("🎨").setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("settings_toggles").setLabel("Submission Panel").setEmoji("🎚️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("settings_leaderboardstyle").setLabel("Leaderboard Style").setEmoji("🏆").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("settings_images").setLabel("Images").setEmoji("🖼️").setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("settings_levelupcard").setLabel("Level-Up Card").setEmoji("🎉").setStyle(ButtonStyle.Primary),
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
    .setColor(settings.embedColor || "#99AAB5")
    .addFields(
      { name: "🎉 Level-Up Channel", value: `<#${settings.levelUpChannelId}>`, inline: true },
      { name: "🏆 Leaderboard Channel", value: `<#${leaderboardState.channelId}>`, inline: true },
      { name: "🛡️ Moderation Log Channel", value: `<#${settings.logChannelId}>`, inline: true },
      { name: "📨 Invite Log Channel", value: `<#${settings.inviteLogChannelId}>`, inline: true }
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
      new ButtonBuilder().setCustomId("edit_invite_log_channel").setLabel("Invite Log Channel").setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("resync_invites").setLabel("🔄 Resync Invites").setStyle(ButtonStyle.Secondary)
    ),
    BACK_TO_SETTINGS_ROW
  ];

  return { embeds: [embed], components: rows };
}

function buildEmojiSettingsEmbed(guild) {
  const embed = new EmbedBuilder()
    .setTitle("😀 Emoji Buttons")
    .setColor(settings.embedColor || "#99AAB5")
    .setDescription("Type/paste the emoji you want to use for each field.")
    .addFields(
      { name: "✅ Verify Button Emoji", value: settings.verifyEmoji, inline: true },
      { name: "📥 Join Emoji", value: settings.joinEmoji, inline: true },
      { name: "📤 Leave Emoji", value: settings.leaveEmoji, inline: true },
      { name: `${getTypeEmoji("campaign")} Campaign Emoji`, value: getTypeEmoji("campaign"), inline: true },
      { name: `${getTypeEmoji("service")} Service Emoji`, value: getTypeEmoji("service"), inline: true },
      { name: `${getTypeEmoji("moderator")} Moderator Emoji`, value: getTypeEmoji("moderator"), inline: true },
      { name: `${getTypeEmoji("outreacher")} Outreacher Emoji`, value: getTypeEmoji("outreacher"), inline: true }
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

function buildPanelColorsSettingsEmbed(guild) {
  const embed = new EmbedBuilder()
    .setTitle("🎨 Panel Colors")
    .setColor(settings.embedColor || "#99AAB5")
    .setDescription("Button colors accept: green, blue, red, grey. The embed color is a hex code, e.g. #5865F2.")
    .addFields(
      { name: "🚀 Campaign Button Color", value: panelConfig.types.campaign.buttonColor || "grey (default)", inline: true },
      { name: "🔧 Service Button Color", value: panelConfig.types.service.buttonColor || "grey (default)", inline: true },
      { name: "🛡️ Moderator Button Color", value: panelConfig.types.moderator.buttonColor || "grey (default)", inline: true },
      { name: "🤝 Outreacher Button Color", value: panelConfig.types.outreacher.buttonColor || "grey (default)", inline: true },
      { name: "🎨 Shared Embed Color", value: settings.embedColor || "#2B2D31", inline: true }
    )
    .setFooter(settingsFooter(guild))
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("modal_panel_color_campaign").setLabel("Campaign Color").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("modal_panel_color_service").setLabel("Service Color").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("modal_panel_color_moderator").setLabel("Moderator Color").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("modal_panel_color_outreacher").setLabel("Outreacher Color").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("modal_embed_color").setLabel("Embed Color").setStyle(ButtonStyle.Primary)
    ),
    BACK_TO_SETTINGS_ROW
  ];

  return { embeds: [embed], components: rows };
}

function buildTogglesSettingsEmbed(guild) {
  const statusValue = Object.keys(TYPE_DISPLAY_NAMES).map(key => {
    const open = settings.open[key] !== false;
    return `${TYPE_DISPLAY_NAMES[key]}: ${open ? "**ON** ✅" : "**OFF** 🚫"}`;
  }).join("\n");

  const embed = new EmbedBuilder()
    .setTitle("🎚️ Submission Panel")
    .setColor(settings.embedColor || "#99AAB5")
    .addFields(
      { name: "Application Types", value: statusValue, inline: false },
      { name: "🔗 Invite Link Filter", value: settings.linkFilterEnabled ? "✅ ON" : "🚫 OFF", inline: false }
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

  const linkFilterRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("toggle_link_filter").setLabel(`Link Filter: ${settings.linkFilterEnabled ? "ON" : "OFF"}`).setStyle(settings.linkFilterEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [toggleRow, linkFilterRow, BACK_TO_SETTINGS_ROW] };
}

function buildLeaderboardStyleSettingsEmbed(guild) {
  const embed = new EmbedBuilder()
    .setTitle("🏆 Leaderboard Style")
    .setColor(settings.embedColor || "#99AAB5")
    .setDescription("Edit the emoji and color used for each leaderboard type, and how often the panel rotates to the next one.")
    .addFields({ name: "🔁 Rotation Interval", value: `Every **${settings.leaderboardRotationMinutes}** minute(s)`, inline: false })
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
    new ButtonBuilder().setCustomId("modal_lb_rotation").setLabel("🔁 Rotation Interval").setStyle(ButtonStyle.Primary)
  ));
  rows.push(BACK_TO_SETTINGS_ROW);

  return { embeds: [embed], components: rows };
}

function buildImagesSettingsEmbed(guild) {
  const embed = new EmbedBuilder()
    .setTitle("🖼️ Images")
    .setColor(settings.embedColor || "#99AAB5")
    .setDescription("Set an image URL for each panel below. Leave a field blank when editing to clear it — panels with no image just won't show one.")
    .addFields(
      { name: "🔐 Verify Panel", value: settings.images.verify ? "Set ✅" : "Not set", inline: true },
      { name: "📥 Submit Panel", value: settings.images.submit ? "Set ✅" : "Not set", inline: true },
      { name: "🎉 Level-Up / Rank Card Background", value: settings.images.levelup ? "Set ✅" : "Not set", inline: true }
    )
    .setFooter(settingsFooter(guild))
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("modal_image_verify").setLabel("Verify Image").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("modal_image_submit").setLabel("Submit Panel Image").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("modal_image_levelup").setLabel("Level-Up/Rank Background").setStyle(ButtonStyle.Secondary)
    ),
    BACK_TO_SETTINGS_ROW
  ];

  return { embeds: [embed], components: rows };
}

function buildLevelUpCardSettingsEmbed(guild) {
  const style = settings.levelUpStyle;
  const layout = getLevelUpLayout();
  const bgT = getBackgroundTransform();
  const embed = new EmbedBuilder()
    .setTitle("🎉 Level-Up Card")
    .setColor(settings.embedColor || "#99AAB5")
    .setDescription("Controls the look of the Level-Up and /rank cards. Positions are in pixels on a 900x320 canvas (0,0 = top-left).")
    .addFields(
      { name: "📊 Progress Bar Color", value: `\`${style.barColor}\``, inline: true },
      { name: "🔤 Font", value: `\`${style.font}\``, inline: true },
      { name: "📢 Headline Text", value: style.headline, inline: false },
      { name: "🖼️ Background Position/Zoom", value: `offsetX: \`${bgT.offsetX}\`, offsetY: \`${bgT.offsetY}\`, zoom: \`${bgT.zoom}\``, inline: false },
      { name: "👤 Avatar", value: `x:${layout.avatar.x} y:${layout.avatar.y} size:${layout.avatar.size}`, inline: true },
      { name: "🏷️ User Line", value: `x:${layout.userLine.x ?? "auto"} y:${layout.userLine.y ?? "auto"} size:${layout.userLine.size}`, inline: true },
      { name: "🅰️ Headline Pos", value: `x:${layout.headline.x} y:${layout.headline.y} size:${layout.headline.size}`, inline: true },
      { name: "🔢 Sub Line Pos", value: `x:${layout.subline.x} y:${layout.subline.y} size:${layout.subline.size}`, inline: true },
      { name: "📶 Progress Bar Pos", value: `x(center):${layout.progressBar.x} y:${layout.progressBar.y} w:${layout.progressBar.width} h:${layout.progressBar.height}`, inline: true },
      { name: "🔠 XP Text Pos", value: `x:${layout.xpText.x} y:${layout.xpText.y} size:${layout.xpText.size}`, inline: true }
    )
    .setFooter(settingsFooter(guild))
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("modal_levelup_barcolor").setLabel("Bar Color").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("modal_levelup_font").setLabel("Font").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("modal_levelup_headline").setLabel("Headline Text").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("modal_levelup_bgposition").setLabel("🖼️ Background Position").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("modal_levelup_layout1").setLabel("📐 Layout: Avatar/User/Headline").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("modal_levelup_layout2").setLabel("📐 Layout: Sub/Bar/XP Text").setStyle(ButtonStyle.Primary)
    ),
    BACK_TO_SETTINGS_ROW
  ];

  return { embeds: [embed], components: rows };
}

function buildFilterWordsSettingsEmbed(guild) {
  const embed = new EmbedBuilder()
    .setTitle("🚫 Filter Words")
    .setColor(settings.embedColor || "#99AAB5")
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
    .setColor(settings.embedColor || "#99AAB5")
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

const LEADERBOARD_PAGE_SIZE = 10;

// Returns a sorted array of entries for the given leaderboard type, highest
// first (top 10 only). Invites entries carry total/left/fake/regular so the
// new "X invites. [ Total Y ], Z left, W fake" format can be built from them.
function getLeaderboardEntries(type) {
  if (type === "level") {
    return Object.entries(levels)
      .map(([userId, d]) => ({ userId, primary: d.level, secondary: d.xp }))
      .filter(e => e.primary > 0 || e.secondary > 0)
      .sort((a, b) => b.primary - a.primary || b.secondary - a.secondary)
      .slice(0, LEADERBOARD_PAGE_SIZE);
  }

  if (type === "xp") {
    return Object.entries(levels)
      .map(([userId, d]) => ({ userId, primary: d.totalXp || 0, secondary: d.level }))
      .filter(e => e.primary > 0)
      .sort((a, b) => b.primary - a.primary)
      .slice(0, LEADERBOARD_PAGE_SIZE);
  }

  if (type === "invites") {
    return Object.entries(invites)
      .map(([userId, total]) => {
        const left = invitesLeft[userId] || 0;
        const fake = invitesFake[userId] || 0;
        const regular = Math.max(0, total - fake);
        return { userId, total, left, fake, primary: regular, secondary: total };
      })
      .filter(e => e.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, LEADERBOARD_PAGE_SIZE);
  }

  // messages
  return Object.entries(messageStats)
    .map(([userId, count]) => ({ userId, primary: count, secondary: 0 }))
    .filter(e => e.primary > 0)
    .sort((a, b) => b.primary - a.primary)
    .slice(0, LEADERBOARD_PAGE_SIZE);
}

// Real-message version (used for the ephemeral search reply) — uses an
// actual Discord @mention since that's a real message, not a canvas image.
function formatLeaderboardLine(type, rank, entry) {
  const mention = `<@${entry.userId}>`;
  if (type === "level") return `**#${rank}** ${mention} — Level ${entry.primary} (${entry.secondary} XP)`;
  if (type === "xp") return `**#${rank}** ${mention} — ${entry.primary} XP (Level ${entry.secondary})`;
  if (type === "invites") return `**#${rank}** ${mention} • ${entry.primary} invite${entry.primary === 1 ? "" : "s"}. [ Total ${entry.total} ], ${entry.left} left, ${entry.fake} fake`;
  return `**#${rank}** ${mention} — ${entry.primary} message${entry.primary === 1 ? "" : "s"}`;
}

// Plain (no-markdown) version of the stat line, for drawing onto the canvas
// image — a mention can't render inside a rasterized PNG, so we fall back to
// the display name/tag there.
function plainStatLine(type, userTag, entry) {
  if (type === "level") return `${userTag} — Level ${entry.primary} (${entry.secondary} XP)`;
  if (type === "xp") return `${userTag} — ${entry.primary} XP (Level ${entry.secondary})`;
  if (type === "invites") return `${userTag} • ${entry.primary} invite${entry.primary === 1 ? "" : "s"}. [ Total ${entry.total} ], ${entry.left} left, ${entry.fake} fake`;
  return `${userTag} — ${entry.primary} message${entry.primary === 1 ? "" : "s"}`;
}

const LB_ROW_HEIGHT = 74;
const LB_HEADER_HEIGHT = 76;
const LB_WIDTH = 760;
const LB_PADDING = 20;
const LB_RANK_COLORS = { 1: "#FFD700", 2: "#C0C0C0", 3: "#CD7F32" };

// Builds the leaderboard as a styled PNG image (rounded rows, rank-colored
// accent bar, circular avatar, and a progress bar for level/xp entries) —
// similar to the reference card design.
async function generateLeaderboardImage(guild, type, entries) {
  const meta = settings.leaderboardStyles[type];
  const rowCount = Math.max(entries.length, 1);
  const height = LB_HEADER_HEIGHT + rowCount * LB_ROW_HEIGHT + LB_PADDING;
  const canvas = createCanvas(LB_WIDTH, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#1e1f22";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(`${meta.emoji} ${meta.label}`, LB_PADDING, LB_HEADER_HEIGHT / 2 + 4);

  if (entries.length === 0) {
    ctx.font = "20px sans-serif";
    ctx.fillStyle = "#99AAB5";
    ctx.fillText("No data yet.", LB_PADDING, LB_HEADER_HEIGHT + 30);
    return canvas.encode("png");
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const rank = i + 1;
    const y = LB_HEADER_HEIGHT + i * LB_ROW_HEIGHT;
    const rowH = LB_ROW_HEIGHT - 10;

    ctx.fillStyle = i % 2 === 0 ? "#25272b" : "#2b2d31";
    roundRectPath(ctx, LB_PADDING, y, LB_WIDTH - LB_PADDING * 2, rowH, 12);
    ctx.fill();

    ctx.fillStyle = LB_RANK_COLORS[rank] || meta.color || "#4a4d52";
    ctx.fillRect(LB_PADDING, y, 6, rowH);

    const avatarSize = rowH - 16;
    const avatarX = LB_PADDING + 22;
    const avatarY = y + 8;

    let userTag = `Unknown User (${entry.userId})`;
    try {
      const user = await client.users.fetch(entry.userId).catch(() => null);
      if (user) {
        userTag = user.globalName || user.username;
        try {
          const avatarImg = await loadImage(user.displayAvatarURL({ extension: "png", size: 128 }));
          ctx.save();
          ctx.beginPath();
          ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
          ctx.restore();
        } catch (err) {
          console.log("Could not load avatar for leaderboard row:", err.message);
        }
      }
    } catch (err) {
      console.log("Could not fetch user for leaderboard row:", err.message);
    }

    const showBar = type === "level" || type === "xp";
    const textY = showBar ? y + rowH / 2 - 10 : y + rowH / 2;

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = LB_RANK_COLORS[rank] || "#ffffff";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(`#${rank}`, avatarX + avatarSize + 20, textY);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 19px sans-serif";
    ctx.fillText(plainStatLine(type, userTag, entry), avatarX + avatarSize + 78, textY);

    if (showBar) {
      const currentLevel = type === "level" ? entry.primary : entry.secondary;
      const currentXp = type === "level" ? entry.secondary : (levels[entry.userId] ? levels[entry.userId].xp : 0);
      const needed = xpForLevel(currentLevel);
      const pct = Math.max(0, Math.min(1, currentXp / needed));

      const barX = avatarX + avatarSize + 78;
      const barY = y + rowH - 20;
      const barW = LB_WIDTH - barX - 30;
      const barH = 8;

      ctx.fillStyle = "#40444b";
      roundRectPath(ctx, barX, barY, barW, barH, 4);
      ctx.fill();

      ctx.fillStyle = meta.color || "#5865F2";
      roundRectPath(ctx, barX, barY, Math.max(barH, barW * pct), barH, 4);
      ctx.fill();
    }
  }

  return canvas.encode("png");
}

// Only a Search button remains on the leaderboard panel now — it's a
// rotating carousel (Level -> XP -> Invites -> Messages -> Level -> ...) so
// manual "switch type" buttons aren't needed anymore.
function buildLeaderboardComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("lb_search").setLabel("🔍 Search").setStyle(ButtonStyle.Primary)
    )
  ];
}

// Builds the full { embeds, files, components } payload for a leaderboard
// type. The image goes inside the embed (attachment:// reference) rather
// than being sent as a bare file attachment.
async function renderLeaderboardMessage(guild, type) {
  const entries = getLeaderboardEntries(type);
  const buffer = await generateLeaderboardImage(guild, type, entries);
  const meta = settings.leaderboardStyles[type];

  const embed = new EmbedBuilder()
    .setColor(meta.color || settings.embedColor || "#5865F2")
    .setImage("attachment://leaderboard.png")
    .setFooter({ text: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
    .setTimestamp();

  const components = buildLeaderboardComponents();
  return { payload: { embeds: [embed], content: "", files: [{ attachment: buffer, name: "leaderboard.png" }], components } };
}

// Posts the leaderboard message if none is tracked/found, otherwise edits
// the existing one in place. Called on startup and on every rotation tick.
async function postOrRefreshLeaderboard(guild) {
  try {
    const channel = await client.channels.fetch(leaderboardState.channelId).catch(() => null);
    if (!channel) {
      console.error(`❌ Leaderboard channel ${leaderboardState.channelId} not found.`);
      return;
    }

    const { payload } = await renderLeaderboardMessage(guild, leaderboardState.type);

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

// Advances the posted leaderboard panel to the next type in rotation order
// (Level -> XP -> Invites -> Messages -> back to Level, etc).
async function advanceLeaderboardCarousel(guild) {
  const types = Object.keys(settings.leaderboardStyles);
  if (types.length === 0) return;
  const idx = types.indexOf(leaderboardState.type);
  const nextType = types[(idx + 1) % types.length];
  leaderboardState.type = nextType;
  saveLeaderboardState();
  await postOrRefreshLeaderboard(guild);
}

// Self-rescheduling timer (instead of a fixed setInterval) so that changing
// settings.leaderboardRotationMinutes from Settings takes effect on the very
// next tick without needing a restart.
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

      const description = interaction.options.getString("description");
      const color = interaction.options.getString("color");
      const image = interaction.options.getString("image") || settings.images.verify;
      const emoji = interaction.options.getString("emoji") || settings.verifyEmoji;

      const embed = new EmbedBuilder().setTitle("🔐 Verification").setDescription(description).setColor(color);
      if (image) embed.setImage(image);

      const button = new ButtonBuilder().setCustomId("verify_button").setLabel("Verify").setEmoji(emoji).setStyle(ButtonStyle.Success);
      const row = new ActionRowBuilder().addComponents(button);

      await interaction.channel.send({ embeds: [embed], components: [row] });
      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "✅ Verification panel created.", "#57F287", { ephemeral: true }));
    }

    if (interaction.commandName === "rank") {
      await interaction.deferReply();

      const target = interaction.options.getUser("user") || interaction.user;
      const data = levels[target.id] || { xp: 0, level: 0, totalXp: 0 };

      const buffer = await generateRankImage(target, data.level, data.xp, data.totalXp || 0);

      const embed = new EmbedBuilder()
        .setColor(settings.embedColor || "#5865F2")
        .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL({ dynamic: true, size: 256 }) })
        .setDescription(`${target}'s rank`)
        .setImage("attachment://rank.png")
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed], files: [{ attachment: buffer, name: "rank.png" }] });
    }

    if (interaction.commandName === "leaderboard") {
      const type = interaction.options.getString("type") || "level";
      await interaction.deferReply();

      const entries = getLeaderboardEntries(type);
      const buffer = await generateLeaderboardImage(interaction.guild, type, entries);
      const meta = settings.leaderboardStyles[type];

      const embed = new EmbedBuilder()
        .setColor(meta.color || settings.embedColor || "#5865F2")
        .setImage("attachment://leaderboard.png")
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) })
        .setTimestamp();

      // Only the Search button — no type-switch buttons here.
      const components = buildLeaderboardComponents();

      return interaction.editReply({ embeds: [embed], files: [{ attachment: buffer, name: "leaderboard.png" }], components });
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

    // Submit-a-Request buttons -> check if that type is open, then show modal
    if (submitModals[interaction.customId]) {
      const typeKey = SUBMIT_BUTTON_TYPE[interaction.customId];
      if (typeKey && settings.open[typeKey] === false) {
        const displayName = TYPE_DISPLAY_NAMES[typeKey];
        return interaction.reply(embedReplyOptions(
          interaction.user,
          interaction.guild,
          `🚫 We're not currently accepting **${displayName}** submissions right now. Please check back later.`,
          "#ED4245",
          { ephemeral: true }
        ));
      }

      const config = submitModals[interaction.customId];
      const modal = new ModalBuilder().setCustomId(config.id).setTitle(config.title);

      config.fields.forEach(field => {
        const input = new TextInputBuilder()
          .setCustomId(field.id)
          .setLabel(field.label)
          .setStyle(field.style)
          .setRequired(true);
        if (field.placeholder) input.setPlaceholder(field.placeholder);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
      });

      return interaction.showModal(modal);
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

    // Same toggle, but from inside Settings > Submission Panel
    if (interaction.customId.startsWith("stoggle_")) {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const key = interaction.customId.replace("stoggle_", "");
      if (!(key in TYPE_DISPLAY_NAMES)) return;

      settings.open[key] = !(settings.open[key] !== false);
      saveSettings();

      return interaction.update(buildTogglesSettingsEmbed(interaction.guild));
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
      settings_emojis: buildEmojiSettingsEmbed,
      settings_panelcolors: buildPanelColorsSettingsEmbed,
      settings_toggles: buildTogglesSettingsEmbed,
      settings_leaderboardstyle: buildLeaderboardStyleSettingsEmbed,
      settings_images: buildImagesSettingsEmbed,
      settings_levelupcard: buildLevelUpCardSettingsEmbed,
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
        .setLabel("Channel ID or #mention")
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
        .setLabel("Channel ID or #mention")
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
        .setLabel("Channel ID or #mention")
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
        .setLabel("Channel ID or #mention")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${settings.inviteLogChannelId}`)
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
        .setLabel("Status text (shown as \"Watching ...\")")
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

      return interaction.update(buildTogglesSettingsEmbed(interaction.guild));
    }

    // Settings page: generic emoji-edit buttons (verify / join / leave / submit types)
    const EMOJI_EDIT_MAP = {
      edit_verify_emoji: { modalId: "modal_verify_emoji", title: "Edit Verify Button Emoji", current: () => settings.verifyEmoji },
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
        .setLabel("Paste/type the emoji")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${cfg.current()}`)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // Panel button color edit (per submit-panel type)
    if (interaction.customId.startsWith("modal_panel_color_")) {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const typeKey = interaction.customId.replace("modal_panel_color_", "");
      const modal = new ModalBuilder().setCustomId(`modalsubmit_panel_color_${typeKey}`).setTitle(`Edit ${TYPE_DISPLAY_NAMES[typeKey]} Color`);
      const input = new TextInputBuilder()
        .setCustomId("color")
        .setLabel("green / blue / red / grey")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${panelConfig.types[typeKey].buttonColor || "grey"}`)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.customId === "modal_embed_color") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const modal = new ModalBuilder().setCustomId("modalsubmit_embed_color").setTitle("Edit Shared Embed Color");
      const input = new TextInputBuilder()
        .setCustomId("color")
        .setLabel("Hex color, e.g. #5865F2")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${settings.embedColor}`)
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
      const modal = new ModalBuilder().setCustomId(`modalsubmit_lb_style_${key}`).setTitle(`Edit ${s.label}`);
      const emojiInput = new TextInputBuilder()
        .setCustomId("emoji")
        .setLabel("Emoji")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${s.emoji}`)
        .setRequired(true);
      const colorInput = new TextInputBuilder()
        .setCustomId("color")
        .setLabel("Hex color, e.g. #5865F2")
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
        .setLabel("Minutes between leaderboard switches")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${settings.leaderboardRotationMinutes}`)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // Image URL edit (verify / submit / levelup)
    if (interaction.customId.startsWith("modal_image_")) {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const key = interaction.customId.replace("modal_image_", "");
      const labelMap = { verify: "Verify Panel", submit: "Submit Panel", levelup: "Level-Up/Rank Background" };
      const modal = new ModalBuilder().setCustomId(`modalsubmit_image_${key}`).setTitle(`Edit ${labelMap[key]} Image`);
      const input = new TextInputBuilder()
        .setCustomId("url")
        .setLabel("Image URL (leave blank to clear)")
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
        .setLabel("Hex color, e.g. #57F287")
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
        .setLabel("CSS font family, e.g. sans-serif, Georgia")
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
        .setLabel("Big headline text on the level-up card")
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
        .setLabel("Pan X (-1 left ... 1 right)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${bgT.offsetX}`)
        .setRequired(true);
      const offsetYInput = new TextInputBuilder()
        .setCustomId("offsetY")
        .setLabel("Pan Y (-1 up ... 1 down)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${bgT.offsetY}`)
        .setRequired(true);
      const zoomInput = new TextInputBuilder()
        .setCustomId("zoom")
        .setLabel("Zoom (1 = normal cover, 2 = zoomed in 2x)")
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
        .setLabel("Avatar: x,y,size")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${layout.avatar.x},${layout.avatar.y},${layout.avatar.size}`)
        .setRequired(true);
      const userLineInput = new TextInputBuilder()
        .setCustomId("userLine")
        .setLabel("User Line: x,y,size (or auto,auto,size)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${layout.userLine.x ?? "auto"},${layout.userLine.y ?? "auto"},${layout.userLine.size}`)
        .setRequired(true);
      const headlineInput = new TextInputBuilder()
        .setCustomId("headline")
        .setLabel("Headline: x,y,size")
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
        .setLabel("Sub Line: x,y,size")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${layout.subline.x},${layout.subline.y},${layout.subline.size}`)
        .setRequired(true);
      const barInput = new TextInputBuilder()
        .setCustomId("progressBar")
        .setLabel("Progress Bar: x(center),y,width,height")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Currently: ${layout.progressBar.x},${layout.progressBar.y},${layout.progressBar.width},${layout.progressBar.height}`)
        .setRequired(true);
      const xpInput = new TextInputBuilder()
        .setCustomId("xpText")
        .setLabel("XP Text: x,y,size")
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

    // Filter words: add / remove
    if (interaction.customId === "modal_add_filter_word") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, "❌ Admins only.", "#ED4245", { ephemeral: true }));
      }
      const modal = new ModalBuilder().setCustomId("modalsubmit_add_filter_word").setTitle("Add Filter Word");
      const catInput = new TextInputBuilder()
        .setCustomId("category")
        .setLabel("Category (profanity/harassment/bullying/spam)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      const wordInput = new TextInputBuilder()
        .setCustomId("word")
        .setLabel("Word or phrase")
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
        .setLabel("Exact word/phrase to remove")
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

    // Leaderboard panel: search for a user by username
    if (interaction.customId === "lb_search") {
      const modal = new ModalBuilder().setCustomId("lb_search_modal").setTitle("Search Leaderboard");
      const input = new TextInputBuilder()
        .setCustomId("query")
        .setLabel("Username to search for")
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

    // Settings page: save the new bot status text
    if (interaction.customId === "modal_bot_status") {
      const statusText = interaction.fields.getTextInputValue("statusText").trim();
      settings.botStatus = statusText;
      saveSettings();
      updateBotStatus();

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ Bot status set to \`Watching ${statusText}\`.`, "#57F287", { ephemeral: true }));
    }

    // Settings page: save any of the editable emojis
    const EMOJI_MODAL_SAVE_MAP = {
      modal_verify_emoji: value => { settings.verifyEmoji = value; saveSettings(); },
      modal_join_emoji: value => { settings.joinEmoji = value; saveSettings(); },
      modal_leave_emoji: value => { settings.leaveEmoji = value; saveSettings(); },
      modal_campaign_emoji: value => { panelConfig.types.campaign.emoji = value; savePanelConfig(); },
      modal_service_emoji: value => { panelConfig.types.service.emoji = value; savePanelConfig(); },
      modal_moderator_emoji: value => { panelConfig.types.moderator.emoji = value; savePanelConfig(); },
      modal_outreacher_emoji: value => { panelConfig.types.outreacher.emoji = value; savePanelConfig(); }
    };

    if (EMOJI_MODAL_SAVE_MAP[interaction.customId]) {
      const emojiValue = interaction.fields.getTextInputValue("emoji").trim();
      EMOJI_MODAL_SAVE_MAP[interaction.customId](emojiValue);

      if (interaction.customId.includes("campaign") || interaction.customId.includes("service") || interaction.customId.includes("moderator") || interaction.customId.includes("outreacher")) {
        if (panelConfig.panelChannelId && panelConfig.panelMessageId) {
          try {
            const ch = await client.channels.fetch(panelConfig.panelChannelId);
            const msg = await ch.messages.fetch(panelConfig.panelMessageId);
            await msg.edit(buildSubmitPanelPayload());
          } catch (err) {
            console.log("Could not refresh submit panel after emoji change:", err.message);
          }
        }
      }

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ Emoji updated to ${emojiValue}.`, "#57F287", { ephemeral: true }));
    }

    // Panel button color save
    if (interaction.customId.startsWith("modalsubmit_panel_color_")) {
      const typeKey = interaction.customId.replace("modalsubmit_panel_color_", "");
      const color = interaction.fields.getTextInputValue("color").trim();
      panelConfig.types[typeKey].buttonColor = color;
      savePanelConfig();

      if (panelConfig.panelChannelId && panelConfig.panelMessageId) {
        try {
          const ch = await client.channels.fetch(panelConfig.panelChannelId);
          const msg = await ch.messages.fetch(panelConfig.panelMessageId);
          await msg.edit(buildSubmitPanelPayload());
        } catch (err) {
          console.log("Could not refresh submit panel after color change:", err.message);
        }
      }

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ ${TYPE_DISPLAY_NAMES[typeKey]} button color set to \`${color}\`.`, "#57F287", { ephemeral: true }));
    }

    // Shared embed color save
    if (interaction.customId === "modalsubmit_embed_color") {
      const color = interaction.fields.getTextInputValue("color").trim();
      settings.embedColor = color;
      saveSettings();

      if (panelConfig.panelChannelId && panelConfig.panelMessageId) {
        try {
          const ch = await client.channels.fetch(panelConfig.panelChannelId);
          const msg = await ch.messages.fetch(panelConfig.panelMessageId);
          await msg.edit(buildSubmitPanelPayload());
        } catch (err) {
          console.log("Could not refresh submit panel after embed color change:", err.message);
        }
      }

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ Shared embed color set to \`${color}\`.`, "#57F287", { ephemeral: true }));
    }

    // Leaderboard style save (emoji + color)
    if (interaction.customId.startsWith("modalsubmit_lb_style_")) {
      const key = interaction.customId.replace("modalsubmit_lb_style_", "");
      const emoji = interaction.fields.getTextInputValue("emoji").trim();
      const color = interaction.fields.getTextInputValue("color").trim();
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
      saveSettings();

      return interaction.reply(embedReplyOptions(interaction.user, interaction.guild, `✅ The leaderboard panel will now rotate every **${minutes}** minute(s). This takes effect on the next rotation tick.`, "#57F287", { ephemeral: true }));
    }

    // Image URL save (verify / submit / levelup)
    if (interaction.customId.startsWith("modalsubmit_image_")) {
      const key = interaction.customId.replace("modalsubmit_image_", "");
      const url = interaction.fields.getTextInputValue("url").trim();
      settings.images[key] = url.length ? url : null;
      saveSettings();

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

    // Leaderboard search: find the user's rank and reply so only they can see it
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
          `❌ Couldn't find **${query}** on the ${meta.label} (top ${LEADERBOARD_PAGE_SIZE}).`,
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

  // ===== MESSAGE XP (testing mode: flat XP every message) =====
  const newCount = (messageCounts.get(message.author.id) || 0) + 1;
  messageCounts.set(message.author.id, newCount);
  console.log(`📨 ${message.author.tag} message #${newCount}`);

  if (newCount % MESSAGES_PER_XP_TRIGGER === 0) {
    console.log(`⚡ XP trigger fired for ${message.author.tag}`);
    const { leveledUp, oldLevel, newLevel, currentXp } = addXP(message.author.id, TEST_XP_PER_TRIGGER);
    if (leveledUp) {
      await announceLevelUp(message.author, message.guild, oldLevel, newLevel, currentXp);
    }
  }

  // ===== SUBMIT PANEL TEXT EDITOR (type your panel text + "--submit") =====
  if (message.content.toLowerCase().includes("--submit")) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply(embedReplyOptions(message.author, message.guild, "❌ You must be an admin to edit the submission panel.", "#ED4245"));
    }

    const parsed = parsePanelMessage(message.content);
    if (parsed.error) {
      return message.reply(embedReplyOptions(message.author, message.guild, `❌ ${parsed.error}`, "#ED4245"));
    }

    panelConfig.title = parsed.title;
    panelConfig.description = parsed.description;
    panelConfig.footer = parsed.footer;
    panelConfig.types = parsed.types;
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

    const changedSummary = parsed.updatedKeys.length ? parsed.updatedKeys.join(", ") : "nothing recognized, but title/description/footer were re-applied";
    return message.reply(embedReplyOptions(message.author, message.guild, `✅ Submit panel updated! Changed: ${changedSummary}.`, "#57F287"));
  }

  // ===== VERIFY SETUP COMMAND (legacy prefix) =====
  if (message.content.startsWith("!verifysetup")) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply(embedReplyOptions(message.author, message.guild, "❌ You must be an admin to use this command.", "#ED4245"));
    }

    const args = message.content.split(" ").slice(1);
    if (args.length < 4) {
      return message.reply(embedReplyOptions(message.author, message.guild, "Usage: !verifysetup #color emoji imageURL description", "#5865F2"));
    }

    const color = args[0];
    const emoji = args[1];
    const imageURL = args[2];
    const description = args.slice(3).join(" ");

    const embed = new EmbedBuilder().setTitle("🔐 Verification").setDescription(description).setColor(color).setImage(imageURL);
    const button = new ButtonBuilder().setCustomId("verify_button").setLabel("Verify").setEmoji(emoji).setStyle(ButtonStyle.Success);
    const row = new ActionRowBuilder().addComponents(button);

    await message.channel.send({ embeds: [embed], components: [row] });
    message.reply(embedReplyOptions(message.author, message.guild, "✅ Custom verification panel created.", "#57F287"));
  }

  // ===== WORD FILTER =====
  const WHITELISTED_ROLES = ['1360755486793666580', '1507406270519312565']; // <-- Add Admin/Mod role IDs to bypass filters

  if (message.member && message.member.roles.cache.some(role => WHITELISTED_ROLES.includes(role.id))) return;

  // ===== DISCORD INVITE LINK FILTER (toggleable in Settings) =====
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

  // ===============================================
  // ===== MENTION-BASED CONVERSATION & SUPPORT =====
  // ===============================================
  if (message.mentions.has(client.user)) {

    const cleanContent = message.content.replace(`<@${client.user.id}>`, "").trim().toLowerCase();

    const dynamicGreetings = [
      `👋 **Hey** ${message.author}! Hope you are having a wonderful day inside **${message.guild.name}**!`,
      `✨ **Hello** ${message.author}! Great to see you hanging out here today!`,
      `🤝 **Welcome**, ${message.author}! Thanks for pinging me, how's everything going?`,
      `☀️ **Greetings** ${message.author}! Wishing you an awesome time in our channels!`,
      `🔥 **What's up** ${message.author}! Awesome to have you chat with me!`
    ];

    const greetings = ["hello", "hi", "hey", "sup", "yo", "wsp"];
    if (greetings.includes(cleanContent)) {
      const randomGreeting = dynamicGreetings[Math.floor(Math.random() * dynamicGreetings.length)];
      return message.channel.send({ embeds: [createEmbed(message.author, message.guild, randomGreeting, "#3498DB")] });
    }

    if (content.includes("who built you") || content.includes("who made you") || content.includes("who is your creator")) {
      return message.channel.send({
        embeds: [createEmbed(message.author, message.guild, `🛠️ **Origin Protocol**\n\nI was built and coded by the development team right here in **${message.guild.name}**! They configured my systems to assist with moderation and user utility.`, "#1ABC9C")]
      });
    }

    if (content.includes("how are you") || content.includes("how are u") || content.includes("how doing")) {
      return message.channel.send({
        embeds: [createEmbed(message.author, message.guild, `⚡ **System Status**\n\n Hey, thanks you checking in on me, ${message.author}. How can I assist you today?`, "#2ECC71")]
      });
    }

    const helpPhrases = ["help", "commands", "features", "what can you do", "support", "ticket", "need help"];
    if (helpPhrases.some(phrase => content.includes(phrase))) {
      return message.channel.send({
        embeds: [createEmbed(message.author, message.guild, `ℹ️ **Server Support Routing**\n\nNeed assistance? Please follow the options below:\n\n🤖 **AI Automated Support**\nGo to <#1511543190803447858> to start a chat and <#1511140441616285857> (ClippingBase AI) will assist you immediately!\n\n👤 **Human Agents**\nIf you prefer talking to our human staff team, please head over to <#1455662844149366804>.`, "#9B59B6")]
      });
    }

    return message.channel.send({
      embeds: [createEmbed(message.author, message.guild, `🤖 **I'm unsure how to process that request**\n\nI can only handle basic moderation settings and simple chats. For real support solutions:\n\n* Start a chat in <#1511543190803447858> where <#1511140441616285857> **ClippingBase AI** will guide you.\n* Or contact our human customer care agents directly inside <#1455662844149366804>.`, "#E67E22")]
    });
  }

  // ===== LEGACY PREFIX COMMANDS (e.g., !kick, !ban) =====
  if (!message.content.startsWith("!")) return;
  const parts = message.content.slice(1).trim().split(/\s+/);
  const command = parts.shift().toLowerCase();

  if (command === "kick") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      return message.reply(embedReplyOptions(message.author, message.guild, "❌ You don't have permission to kick members.", "#ED4245"));
    }

    const member = message.mentions.members.first();
    if (!member) return message.reply(embedReplyOptions(message.author, message.guild, "⚠️ Mention a user to kick.", "#FEE75C"));
    if (!member.kickable) return message.reply(embedReplyOptions(message.author, message.guild, "⚠️ Sorry I Cannot Kick that User (check role hierarchy).", "#FEE75C"));

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
    if (!member.bannable) return message.reply(embedReplyOptions(message.author, message.guild, "⚠️ **Sorry, I cannot Ban that user. Check Role Hierarchy**", "#FEE75C"));

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