// popup.js

const DEFAULT_USER_VOICE = [
  "positive energy, grounded and encouraging",
  "congratulate people when they share a win or make progress",
  "share small personal experiences when relevant",
  "show openness to connect, collaborate, or learn from each other",
  "keep the reply useful and human, not salesy",
  "occasionally add a small light joke when it fits naturally",
].join("\n");

const STRATEGY_TEMPLATES = {
  sparkReply: [
    "Template: Specific Reply",
    "Observation-first reply",
    "Goal: earn attention with a reply that feels specific, useful, and easy to answer without relying on questions.",
    "Write a short comment that notices one specific detail, adds a grounded reaction or useful angle, and leaves room for replies without asking a question.",
    "Avoid generic praise, fake curiosity, question hooks, and engagement-bait wording.",
  ].join("\n"),
  valueDrop: [
    "Template: Value Drop",
    "Add value + soft CTA",
    "Goal: build authority while staying generous and low-pressure.",
    "Write a concise comment with one useful insight, example, or next step, then add a soft invitation to compare notes or try the idea.",
    "Avoid sounding like a sales pitch, lecture, or recycled advice.",
  ].join("\n"),
  hotTake: [
    "Template: Hot Take",
    "Contrarian + credibility",
    "Goal: stand out with a sharp but fair angle.",
    "Write a concise comment that respectfully challenges the obvious take, explains why in one grounded line, and shows lived experience or pattern recognition.",
    "Avoid rage bait, dunking, and disagreement that feels personal.",
  ].join("\n"),
};

const DEFAULT_VIRAL_STRATEGY = STRATEGY_TEMPLATES.sparkReply;

const el = {
  modelSelect: document.getElementById("modelSelect"),
  modelStatus: document.getElementById("modelStatus"),
  userVoiceInput: document.getElementById("userVoiceInput"),
  saveVoiceBtn: document.getElementById("saveVoiceBtn"),
  voiceStatus: document.getElementById("voiceStatus"),
  viralStrategyInput: document.getElementById("viralStrategyInput"),
  sparkReplyTemplateBtn: document.getElementById("sparkReplyTemplateBtn"),
  valueDropTemplateBtn: document.getElementById("valueDropTemplateBtn"),
  hotTakeTemplateBtn: document.getElementById("hotTakeTemplateBtn"),
  strategyStatus: document.getElementById("strategyStatus"),
  errorArea: document.getElementById("errorArea"),
  errorText: document.getElementById("errorText"),
};

let initPromise = null;
let modelPickerState = {
  models: [],
  defaultOption: {
    label: "Default - backend default",
    description: "Uses the backend default model",
  },
};

async function init() {
  if (initPromise) return initPromise;
  initPromise = initializePreferences();
  return initPromise;
}

async function initializePreferences() {
  const {
    userVoice,
    viralStrategy,
    useViralStrategy,
    selectedModel,
  } = await chrome.storage.local.get([
    "userVoice",
    "viralStrategy",
    "useViralStrategy",
    "selectedModel",
  ]);

  applyPreferences({
    userVoice,
    viralStrategy,
    useViralStrategy,
  });

  await initializeModelPicker(selectedModel);
  await loadBackendPreferences();
}

function applyPreferences(preferences = {}) {
  const userVoice = cleanString(preferences.userVoice);
  const viralStrategy = cleanString(preferences.viralStrategy);

  el.userVoiceInput.value = userVoice || DEFAULT_USER_VOICE;
  el.voiceStatus.textContent = userVoice
    ? "Saved, applied to every generated comment"
    : "Default voice, edit and save to customize";
  el.voiceStatus.classList.toggle("saved", !!userVoice);

  el.viralStrategyInput.value = viralStrategy || DEFAULT_VIRAL_STRATEGY;
  el.strategyStatus.textContent = viralStrategy
    ? "Saved, used in every generated Threads reply"
    : "Pick a template or write your own strategy";
  el.strategyStatus.classList.toggle("saved", !!viralStrategy);
}

el.saveVoiceBtn.addEventListener("click", async () => {
  el.saveVoiceBtn.disabled = true;
  const originalText = el.saveVoiceBtn.textContent;
  try {
    const preferences = await savePreferencesToBackend();
    hideError();

    el.saveVoiceBtn.textContent = "Saved";
    el.voiceStatus.textContent = preferences.userVoice
      ? "Saved to backend, applied to every generated comment"
      : "Default voice, saved to backend";
    el.voiceStatus.classList.toggle("saved", !!preferences.userVoice);
    setTimeout(() => { el.saveVoiceBtn.textContent = "Save voice"; }, 1500);
  } catch (error) {
    el.saveVoiceBtn.textContent = originalText;
    showError(error?.message || "Could not save voice to backend.");
  } finally {
    el.saveVoiceBtn.disabled = false;
  }
});

el.viralStrategyInput.addEventListener("change", saveViralStrategy);
el.modelSelect.addEventListener("change", saveSelectedModel);
el.sparkReplyTemplateBtn.addEventListener("click", () => applyStrategyTemplate("sparkReply"));
el.valueDropTemplateBtn.addEventListener("click", () => applyStrategyTemplate("valueDrop"));
el.hotTakeTemplateBtn.addEventListener("click", () => applyStrategyTemplate("hotTake"));

async function initializeModelPicker(selectedModel) {
  renderModelOptions({
    defaultModel: "",
    models: [],
  }, selectedModel);

  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_MODELS" });
    if (!response || response.error) {
      throw new Error(response?.error || "Could not load models.");
    }

    const renderedModel = renderModelOptions(response, selectedModel);
    if (selectedModel && renderedModel !== selectedModel) {
      await chrome.storage.local.set({ selectedModel: "" });
    }
    hideError();
  } catch (error) {
    el.modelStatus.textContent = error?.message || "Could not load models.";
    showError(el.modelStatus.textContent);
  }
}

function renderModelOptions(response = {}, selectedModel = "") {
  const models = normalizeModels(response.models);
  const defaultModel = cleanString(response.defaultModel);
  const defaultOption = getDefaultModelOption(models, defaultModel);
  const validSelectedModel = models.some(model => model.key === selectedModel)
    ? selectedModel
    : "";
  modelPickerState = { models, defaultOption };

  el.modelSelect.innerHTML = [
    optionHtml("", defaultOption.label, defaultOption.description),
    ...models.map(model => optionHtml(model.key, model.label, model.description)),
  ].join("");
  el.modelSelect.value = validSelectedModel;
  updateModelStatus(validSelectedModel, models, defaultOption);
  return validSelectedModel;
}

function normalizeModels(models) {
  if (!Array.isArray(models)) return [];

  return models
    .map(model => ({
      key: cleanString(model?.key),
      label: cleanString(model?.label),
      description: cleanString(model?.description),
    }))
    .filter(model => model.key && model.label);
}

function getDefaultModelOption(models, defaultModel) {
  const defaultModelOption = models.find(model => model.key === defaultModel);
  const defaultLabel = defaultModelOption?.label || defaultModel || "backend default";

  return {
    label: `Default - ${defaultLabel}`,
    description: defaultModelOption?.description || "Uses the backend default model",
  };
}

async function saveSelectedModel() {
  const selectedModel = cleanString(el.modelSelect.value);
  await chrome.storage.local.set({ selectedModel });
  updateModelStatus(selectedModel);
}

function updateModelStatus(
  selectedModel,
  models = modelPickerState.models,
  defaultOption = modelPickerState.defaultOption
) {
  const selectedOption = models.find(model => model.key === selectedModel);
  if (selectedOption) {
    el.modelStatus.textContent = `Using ${selectedOption.label}`;
    el.modelStatus.classList.add("saved");
    return;
  }

  const defaultLabel = defaultOption?.label?.replace(/^Default - /, "") || "backend default";
  el.modelStatus.textContent = `Using ${defaultLabel}`;
  el.modelStatus.classList.toggle("saved", false);
}

function optionHtml(value, label, description = "") {
  const safeDescription = escapeHtml(description);
  const title = safeDescription ? ` title="${safeDescription}"` : "";
  return `<option value="${escapeHtml(value)}"${title}>${escapeHtml(label)}</option>`;
}

async function applyStrategyTemplate(templateKey) {
  el.viralStrategyInput.value = STRATEGY_TEMPLATES[templateKey] || DEFAULT_VIRAL_STRATEGY;
  await saveViralStrategy();
}

async function saveViralStrategy() {
  setTemplateButtonsDisabled(true);
  try {
    const preferences = await savePreferencesToBackend();
    el.strategyStatus.textContent = preferences.viralStrategy
      ? "Saved to backend, used in every generated reply"
      : "Default strategy, saved to backend";
    el.strategyStatus.classList.toggle("saved", !!preferences.viralStrategy);
    hideError();
  } catch (error) {
    showError(error?.message || "Could not save strategy to backend.");
  } finally {
    setTemplateButtonsDisabled(false);
  }
}

async function loadBackendPreferences() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_PREFERENCES" });
    if (!response?.preferences) return;

    const preferences = normalizePreferences(response.preferences);
    if (!hasSavedBackendPreferences(preferences)) return;

    applyPreferences(preferences);
    await chrome.storage.local.set({
      userVoice: preferences.userVoice,
      viralStrategy: preferences.viralStrategy,
      useViralStrategy: preferences.useViralStrategy,
    });
    hideError();
  } catch {
    // Keep local settings usable if the backend is temporarily unavailable.
  }
}

async function savePreferencesToBackend() {
  const current = readCurrentPreferences();
  const response = await chrome.runtime.sendMessage({
    type: "SAVE_PREFERENCES",
    ...current,
  });

  if (!response || response.error) {
    throw new Error(response?.error || "Could not save preferences to backend.");
  }

  const preferences = normalizePreferences(response.preferences || current);
  applyPreferences(preferences);
  await chrome.storage.local.set({
    userVoice: preferences.userVoice,
    viralStrategy: preferences.viralStrategy,
    useViralStrategy: preferences.useViralStrategy,
  });
  return preferences;
}

function readCurrentPreferences() {
  return {
    userVoice: el.userVoiceInput.value.trim(),
    viralStrategy: el.viralStrategyInput.value.trim() || DEFAULT_VIRAL_STRATEGY,
    useViralStrategy: true,
  };
}

function normalizePreferences(preferences = {}) {
  return {
    userVoice: cleanString(preferences.userVoice),
    viralStrategy: cleanString(preferences.viralStrategy),
    useViralStrategy: true,
  };
}

function hasSavedBackendPreferences(preferences) {
  return !!preferences.userVoice || !!preferences.viralStrategy;
}

function setTemplateButtonsDisabled(disabled) {
  [
    el.sparkReplyTemplateBtn,
    el.valueDropTemplateBtn,
    el.hotTakeTemplateBtn,
  ].forEach(button => {
    if (button) button.disabled = disabled;
  });
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value) {
  return cleanString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showError(msg) {
  if (!el.errorText || !el.errorArea) return;
  el.errorText.textContent = msg;
  el.errorArea.style.display = "flex";
}

function hideError() {
  if (el.errorArea) {
    el.errorArea.style.display = "none";
  }
}

init().catch(error => {
  showError(error?.message || "Could not load extension settings.");
});
