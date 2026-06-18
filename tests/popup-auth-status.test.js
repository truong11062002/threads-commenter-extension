const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeElement {
  constructor(id) {
    this.id = id;
    this.textContent = "";
    this.innerHTML = "";
    this.value = "";
    this.disabled = false;
    this.checked = true;
    this.style = {};
    this.dataset = {};
    this.listeners = {};
    this.className = "";
    this.classList = {
      values: new Set(),
      add: value => this.classList.values.add(value),
      remove: value => this.classList.values.delete(value),
      toggle: (value, force) => {
        if (force) this.classList.values.add(value);
        else this.classList.values.delete(value);
      },
      contains: value => this.classList.values.has(value),
    };
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  closest() {
    return null;
  }
}

function createStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    removeCalls: [],
    async remove(key) {
      this.removeCalls.push(key);
      if (Array.isArray(key)) key.forEach(item => delete data[item]);
      else delete data[key];
    },
    async get(key) {
      if (typeof key === "string") return { [key]: data[key] };
      if (Array.isArray(key)) {
        return key.reduce((result, item) => {
          result[item] = data[item];
          return result;
        }, {});
      }
      return { ...data };
    },
    async set(values) {
      Object.assign(data, values);
    },
  };
}

function loadPopupScript(storage = createStorage(), tab = null, runtimeSendMessage = async () => null) {
  const elements = {};
  const document = {
    getElementById(id) {
      elements[id] ||= new FakeElement(id);
      return elements[id];
    },
    querySelectorAll() {
      return [];
    },
  };

  const context = {
    console,
    document,
    navigator: {
      clipboard: {
        writeText: async () => {},
      },
    },
    setTimeout: () => {},
    chrome: {
      storage: {
        local: storage,
      },
      tabs: {
        query: async () => (tab ? [tab] : []),
        sendMessage: async () => null,
      },
      runtime: {
        sendMessage: runtimeSendMessage,
      },
    },
  };

  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "..", "popup", "popup.js"), "utf8");
  vm.runInContext(source, context);
  return { context, elements, storage };
}

async function testPopupInitializesWithoutAuthGate() {
  const storage = createStorage();
  const { context, elements } = loadPopupScript(storage);

  await context.init();

  assert.equal(elements.settingsPanel, undefined);
  assert.equal(elements.tonesGrid, undefined);
  assert.equal(elements.generateBtn, undefined);
  assert.equal(elements.resultArea, undefined);
  assert.equal(elements.loginGate, undefined);
  assert.equal(elements.signOutBtn, undefined);
  assert.equal(storage.removeCalls.length, 0);
}

async function testPopupDoesNotDeleteLegacyAuthKeys() {
  const storage = createStorage({
    token: "legacy_token",
    user: { email: "old@example.com" },
    quota: { remaining: 12 },
    session: { access_token: "legacy_token" },
    userVoice: "warm and concise",
  });
  const { context, elements } = loadPopupScript(storage);

  await context.init();

  assert.equal(storage.data.token, "legacy_token");
  assert.equal(storage.data.user.email, "old@example.com");
  assert.equal(storage.data.quota.remaining, 12);
  assert.equal(storage.data.session.access_token, "legacy_token");
  assert.equal(elements.userVoiceInput.value, "warm and concise");
  assert.equal(storage.removeCalls.length, 0);
}

async function testPopupLoadsBackendPreferencesWhenAvailable() {
  const storage = createStorage();
  const messages = [];
  const { context, elements } = loadPopupScript(storage, null, async message => {
    messages.push(message);
    if (message.type === "GET_PREFERENCES") {
      return {
        preferences: {
          userVoice: "backend voice",
          viralStrategy: "backend strategy",
          useViralStrategy: false,
        },
      };
    }
    return null;
  });

  await context.init();

  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [
    { type: "GET_MODELS" },
    { type: "GET_PREFERENCES" },
  ]);
  assert.equal(elements.userVoiceInput.value, "backend voice");
  assert.equal(elements.viralStrategyInput.value, "backend strategy");
  assert.equal(elements.useViralStrategyToggle, undefined);
  assert.equal(elements.resetStrategyBtn, undefined);
  assert.equal(storage.data.userVoice, "backend voice");
  assert.equal(storage.data.viralStrategy, "backend strategy");
  assert.equal(storage.data.useViralStrategy, true);
}

async function testPopupLoadsModelsAndRestoresSavedSelection() {
  const storage = createStorage({
    selectedModel: "@cf/meta/llama-3.1-8b-instruct",
  });
  const messages = [];
  const { context, elements } = loadPopupScript(storage, null, async message => {
    messages.push(message);
    if (message.type === "GET_MODELS") {
      return {
        defaultModel: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
        models: [
          {
            key: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
            label: "DeepSeek R1 Distill Qwen 32B",
            description: "Default reasoning model",
          },
          {
            key: "@cf/meta/llama-3.1-8b-instruct",
            label: "Llama 3.1 8B Instruct",
            description: "Fast general replies",
          },
        ],
      };
    }
    if (message.type === "GET_PREFERENCES") return null;
    return null;
  });

  await context.init();

  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [
    { type: "GET_MODELS" },
    { type: "GET_PREFERENCES" },
  ]);
  assert.equal(elements.modelSelect.value, "@cf/meta/llama-3.1-8b-instruct");
  assert.match(elements.modelSelect.innerHTML, /Default - DeepSeek R1 Distill Qwen 32B/);
  assert.match(elements.modelSelect.innerHTML, /Llama 3.1 8B Instruct/);
  assert.equal(elements.modelStatus.textContent, "Using Llama 3.1 8B Instruct");
}

async function testPopupSavesSelectedModelLocally() {
  const storage = createStorage();
  const { context, elements } = loadPopupScript(storage, null, async message => {
    if (message.type === "GET_MODELS") {
      return {
        defaultModel: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
        models: [
          {
            key: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
            label: "DeepSeek R1 Distill Qwen 32B",
          },
          {
            key: "@cf/meta/llama-3.1-8b-instruct",
            label: "Llama 3.1 8B Instruct",
          },
        ],
      };
    }
    if (message.type === "GET_PREFERENCES") return null;
    return null;
  });

  await context.init();
  elements.modelSelect.value = "@cf/meta/llama-3.1-8b-instruct";

  await elements.modelSelect.listeners.change();

  assert.equal(storage.data.selectedModel, "@cf/meta/llama-3.1-8b-instruct");
  assert.equal(elements.modelStatus.textContent, "Using Llama 3.1 8B Instruct");
}

async function testPopupClearsSavedModelWhenBackendRemovesIt() {
  const storage = createStorage({
    selectedModel: "@cf/removed/model",
  });
  const { context, elements } = loadPopupScript(storage, null, async message => {
    if (message.type === "GET_MODELS") {
      return {
        defaultModel: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
        models: [
          {
            key: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
            label: "DeepSeek R1 Distill Qwen 32B",
          },
        ],
      };
    }
    if (message.type === "GET_PREFERENCES") return null;
    return null;
  });

  await context.init();

  assert.equal(elements.modelSelect.value, "");
  assert.equal(storage.data.selectedModel, "");
  assert.equal(elements.modelStatus.textContent, "Using DeepSeek R1 Distill Qwen 32B");
}

async function testSaveVoiceSendsPreferencesToBackground() {
  const storage = createStorage();
  const messages = [];
  const { context, elements } = loadPopupScript(storage, null, async message => {
    messages.push(message);
    if (message.type === "GET_PREFERENCES") return null;
    if (message.type === "SAVE_PREFERENCES") {
      return {
        preferences: {
          userVoice: message.userVoice,
          viralStrategy: message.viralStrategy,
          useViralStrategy: message.useViralStrategy,
        },
      };
    }
    return null;
  });

  await context.init();
  elements.userVoiceInput.value = "human, direct, lowercase";
  elements.viralStrategyInput.value = "invite a thoughtful reply";

  await elements.saveVoiceBtn.listeners.click();

  assert.deepEqual(JSON.parse(JSON.stringify(messages.at(-1))), {
    type: "SAVE_PREFERENCES",
    userVoice: "human, direct, lowercase",
    viralStrategy: "invite a thoughtful reply",
    useViralStrategy: true,
  });
  assert.equal(storage.data.userVoice, "human, direct, lowercase");
  assert.equal(storage.data.viralStrategy, "invite a thoughtful reply");
  assert.equal(storage.data.useViralStrategy, true);
}

async function testStrategyChangeSendsPreferencesToBackground() {
  const storage = createStorage();
  const messages = [];
  const { context, elements } = loadPopupScript(storage, null, async message => {
    messages.push(message);
    if (message.type === "GET_PREFERENCES") return null;
    if (message.type === "SAVE_PREFERENCES") {
      return {
        preferences: {
          userVoice: message.userVoice,
          viralStrategy: message.viralStrategy,
          useViralStrategy: message.useViralStrategy,
        },
      };
    }
    return null;
  });

  await context.init();
  elements.userVoiceInput.value = "warm voice";
  elements.viralStrategyInput.value = "backend strategy";

  await elements.viralStrategyInput.listeners.change();

  assert.deepEqual(JSON.parse(JSON.stringify(messages.at(-1))), {
    type: "SAVE_PREFERENCES",
    userVoice: "warm voice",
    viralStrategy: "backend strategy",
    useViralStrategy: true,
  });
  assert.equal(storage.data.useViralStrategy, true);
}

async function testTemplateButtonAppliesStrategyAndSaves() {
  const storage = createStorage();
  const messages = [];
  const { context, elements } = loadPopupScript(storage, null, async message => {
    messages.push(message);
    if (message.type === "GET_PREFERENCES") return null;
    if (message.type === "SAVE_PREFERENCES") {
      return {
        preferences: {
          userVoice: message.userVoice,
          viralStrategy: message.viralStrategy,
          useViralStrategy: message.useViralStrategy,
        },
      };
    }
    return null;
  });

  await context.init();
  elements.userVoiceInput.value = "warm voice";

  await elements.sparkReplyTemplateBtn.listeners.click();

  assert.match(elements.viralStrategyInput.value, /Template: Specific Reply/);
  assert.match(elements.viralStrategyInput.value, /Observation-first reply/);
  assert.doesNotMatch(elements.viralStrategyInput.value, /follow-up question/i);
  assert.deepEqual(JSON.parse(JSON.stringify(messages.at(-1))), {
    type: "SAVE_PREFERENCES",
    userVoice: "warm voice",
    viralStrategy: elements.viralStrategyInput.value,
    useViralStrategy: true,
  });
  assert.equal(storage.data.useViralStrategy, true);
}

(async () => {
  await testPopupInitializesWithoutAuthGate();
  await testPopupDoesNotDeleteLegacyAuthKeys();
  await testPopupLoadsBackendPreferencesWhenAvailable();
  await testPopupLoadsModelsAndRestoresSavedSelection();
  await testPopupSavesSelectedModelLocally();
  await testPopupClearsSavedModelWhenBackendRemovesIt();
  await testSaveVoiceSendsPreferencesToBackground();
  await testStrategyChangeSendsPreferencesToBackground();
  await testTemplateButtonAppliesStrategyAndSaves();
})();
