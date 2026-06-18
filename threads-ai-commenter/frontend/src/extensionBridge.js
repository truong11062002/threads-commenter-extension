const EXTENSION_ID = "fiplldnkdjahpjfhkefmkmmillhhflld";

export function sendTokenToExtension({ token, user, quota }) {
  if (!token) return Promise.resolve(false);
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      EXTENSION_ID,
      { type: "AUTH_SUCCESS", token, user: user || null, quota: quota || null },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        resolve(response?.ok === true);
      }
    );
  });
}
