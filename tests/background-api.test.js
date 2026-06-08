const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
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
    async remove(key) {
      if (Array.isArray(key)) key.forEach(item => delete data[item]);
      else delete data[key];
    },
  };
}

function loadBackgroundScript(fetchImpl, storage = createStorage()) {
  const listeners = [];
  const context = {
    console,
    crypto: {
      randomUUID: () => "device_test",
    },
    fetch: fetchImpl,
    chrome: {
      storage: {
        local: storage,
      },
      runtime: {
        onMessage: {
          addListener(listener) {
            listeners.push(listener);
          },
        },
      },
    },
  };

  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8");
  vm.runInContext(source, context);

  return { context, listeners, storage };
}

async function generate(context, request) {
  let response;
  await context.handleGenerateComment(request, nextResponse => {
    response = nextResponse;
  });
  return response;
}

async function testGenerateCommentCallsOnlyGenerateEndpoint() {
  const calls = [];
  const { context, storage } = loadBackgroundScript(async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        ok: true,
        comment: "this feels very real",
      }),
    };
  });

  const response = await generate(context, {
    type: "GENERATE_COMMENT",
    tone: "friendly",
    postText: "Building in public has been a strange but useful forcing function.",
    authorName: "Mina",
    authorUsername: "@mina",
    pageUrl: "https://www.threads.com/@mina/post/abc123",
    userVoice: "warm, concise, useful",
    viralStrategy: "invite a thoughtful reply",
  });

  assert.equal(response.comment, "this feels very real");
  assert.equal(response.error, undefined);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://threads-commenter-extension.fastapicloud.dev/api/comments/generate"
  );
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    postText: "Building in public has been a strange but useful forcing function.",
    authorName: "Mina",
    authorUsername: "@mina",
    pageUrl: "https://www.threads.com/@mina/post/abc123",
    tone: "friendly",
    deviceId: "device_test",
    userVoice: "warm, concise, useful",
    viralStrategy: "invite a thoughtful reply",
  });
  assert.equal(storage.data.deviceId, "device_test");
}

async function testGenerateCommentFormatsBackendCommentBeforeReturning() {
  const { context } = loadBackgroundScript(async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      comment: "- That's a great point! Honestly this is useful - it compounds. Second idea? Third. Fourth.",
    }),
  }));

  const response = await generate(context, {
    type: "GENERATE_COMMENT",
    tone: "insightful",
    postText: "Small replies can create surprisingly good conversations.",
    authorName: "Mina",
    authorUsername: "@mina",
  });

  assert.equal(response.comment, "this is useful, it compounds.\n\nsecond idea?\n\nthird.");
  assert.equal(response.error, undefined);
}

async function testGenerateCommentForwardsThreadContext() {
  const calls = [];
  const { context } = loadBackgroundScript(async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        ok: true,
        comment: "rooting for this",
      }),
    };
  });

  const response = await generate(context, {
    type: "GENERATE_COMMENT",
    tone: "friendly",
    postText: "Rooting for you man 🤝",
    authorName: "byanshsingh",
    authorUsername: "@byanshsingh",
    threadContext: [
      "THREAD CONTEXT:",
      "---",
      "[Post 1] @charles.nguyenvn (18h):",
      "\"Looking to connect with solo founders\"",
      "",
      "[FOCAL POST -- being replied to] @byanshsingh (35m):",
      "\"Rooting for you man 🤝\"",
    ].join("\n"),
    targetUser: "byanshsingh",
    loggedInUser: "charles.nguyenvn",
  });

  assert.equal(response.comment, "rooting for this");
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    postText: "Rooting for you man 🤝",
    authorName: "byanshsingh",
    authorUsername: "@byanshsingh",
    tone: "friendly",
    deviceId: "device_test",
    threadContext: [
      "THREAD CONTEXT:",
      "---",
      "[Post 1] @charles.nguyenvn (18h):",
      "\"Looking to connect with solo founders\"",
      "",
      "[FOCAL POST -- being replied to] @byanshsingh (35m):",
      "\"Rooting for you man 🤝\"",
    ].join("\n"),
    targetUser: "byanshsingh",
    loggedInUser: "charles.nguyenvn",
  });
}

async function testConfiguredTonesExposeRequestedToneSet() {
  const { context } = loadBackgroundScript(async () => ({
    ok: true,
    json: async () => ({ ok: true, comment: "unused" }),
  }));

  const tones = JSON.parse(vm.runInContext(
    "JSON.stringify(Object.entries(TONE_CONFIGS).map(([key, tone]) => ({ key, label: tone.label })))",
    context
  ));

  assert.deepEqual(tones, [
    { key: "simple", label: "💬 Simple" },
    { key: "friendly", label: "😊 Friendly" },
    { key: "funny", label: "😂 Funny" },
    { key: "insightful", label: "🧠 Insightful" },
    { key: "curious", label: "❓ Curious" },
    { key: "relatable", label: "😮‍💨 Relatable" },
    { key: "contrarian", label: "🔥 Contrarian" },
    { key: "supportive", label: "💪 Supportive" },
    { key: "expert", label: "🎯 Expert" },
    { key: "visionary", label: "🚀 Visionary" },
    { key: "analytical", label: "📊 Analytical" },
    { key: "meme", label: "🐸 Meme" },
  ]);
}

async function testGenerateCommentReusesDeviceId() {
  const calls = [];
  const { context } = loadBackgroundScript(async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({ ok: true, comment: "reuse works" }),
    };
  }, createStorage({ deviceId: "existing_device" }));

  const response = await generate(context, {
    type: "GENERATE_COMMENT",
    tone: "simple",
    postText: "Small consistent replies compound faster than people expect.",
    authorName: "Charles",
    authorUsername: "charles",
  });

  assert.equal(response.comment, "reuse works");
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].options.body).deviceId, "existing_device");
}

async function testSavePreferencesCallsBackendAndCachesResponse() {
  const calls = [];
  const storage = createStorage({ deviceId: "device_pref" });
  const { context } = loadBackgroundScript(async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        ok: true,
        preferences: {
          deviceId: "device_pref",
          userVoice: "warm, concise, lowercase",
          viralStrategy: "ask one specific follow-up",
          useViralStrategy: true,
        },
      }),
    };
  }, storage);

  let response;
  await context.handleSavePreferences({
    userVoice: "warm, concise, lowercase",
    viralStrategy: "ask one specific follow-up",
    useViralStrategy: true,
  }, nextResponse => {
    response = nextResponse;
  });

  assert.deepEqual(JSON.parse(JSON.stringify(response.preferences)), {
    deviceId: "device_pref",
    userVoice: "warm, concise, lowercase",
    viralStrategy: "ask one specific follow-up",
    useViralStrategy: true,
  });
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://threads-commenter-extension.fastapicloud.dev/api/preferences"
  );
  assert.equal(calls[0].options.method, "PUT");
  assert.equal(calls[0].options.headers.accept, "application/json");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    deviceId: "device_pref",
    userVoice: "warm, concise, lowercase",
    viralStrategy: "ask one specific follow-up",
    useViralStrategy: true,
  });
  assert.equal(storage.data.userVoice, "warm, concise, lowercase");
  assert.equal(storage.data.viralStrategy, "ask one specific follow-up");
  assert.equal(storage.data.useViralStrategy, true);
}

async function testGetPreferencesCallsBackendWithDeviceId() {
  const calls = [];
  const storage = createStorage({ deviceId: "device_pref" });
  const { context } = loadBackgroundScript(async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        ok: true,
        preferences: {
          deviceId: "device_pref",
          userVoice: "backend voice",
          viralStrategy: "backend strategy",
          useViralStrategy: false,
        },
      }),
    };
  }, storage);

  let response;
  await context.handleGetPreferences(nextResponse => {
    response = nextResponse;
  });

  assert.deepEqual(JSON.parse(JSON.stringify(response.preferences)), {
    deviceId: "device_pref",
    userVoice: "backend voice",
    viralStrategy: "backend strategy",
    useViralStrategy: false,
  });
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://threads-commenter-extension.fastapicloud.dev/api/preferences?deviceId=device_pref"
  );
  assert.equal(calls[0].options.method, "GET");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].options.headers)), {
    accept: "application/json",
  });
}

async function testApiErrorMessageIsReturned() {
  const { context } = loadBackgroundScript(async () => ({
    ok: false,
    statusText: "Bad Request",
    json: async () => ({
      ok: false,
      error: {
        code: "INVALID_TONE",
        message: "Unsupported tone",
      },
    }),
  }));

  const response = await generate(context, {
    type: "GENERATE_COMMENT",
    tone: "simple",
    postText: "A post with enough text to pass local validation.",
    authorName: "Charles",
    authorUsername: "@charles",
  });

  assert.equal(response.error, "Unsupported tone");
}

async function testInvalidPostTextSkipsNetworkCall() {
  const calls = [];
  const { context } = loadBackgroundScript(async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ ok: true, comment: "unused" }) };
  });

  const response = await generate(context, {
    type: "GENERATE_COMMENT",
    tone: "simple",
    postText: "hey",
    authorName: "Charles",
    authorUsername: "@charles",
  });

  assert.equal(response.error, "Post text must be 5-4000 characters.");
  assert.equal(calls.length, 0);
}

(async () => {
  await testConfiguredTonesExposeRequestedToneSet();
  await testGenerateCommentCallsOnlyGenerateEndpoint();
  await testGenerateCommentFormatsBackendCommentBeforeReturning();
  await testGenerateCommentForwardsThreadContext();
  await testGenerateCommentReusesDeviceId();
  await testSavePreferencesCallsBackendAndCachesResponse();
  await testGetPreferencesCallsBackendWithDeviceId();
  await testApiErrorMessageIsReturned();
  await testInvalidPostTextSkipsNetworkCall();
})();
