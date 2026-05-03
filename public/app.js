import { formatLookupError } from "./clientError.js";

const STORAGE_KEY = "cf-temp-mail-viewer:mailboxes";

const form = document.querySelector("#mailbox-form");
const addressInput = document.querySelector("#address");
const statusText = document.querySelector("#status");
const mailboxList = document.querySelector("#mailbox-list");
const mailboxCount = document.querySelector("#mailbox-count");
const summaryTitle = document.querySelector("#summary-title");
const refreshButton = document.querySelector("#refresh-button");
const messageList = document.querySelector("#message-list");
const detailEmpty = document.querySelector("#detail-empty");
const detailPanel = document.querySelector("#detail-panel");
const matchedAddress = document.querySelector("#matched-address");
const sender = document.querySelector("#sender");
const sentAt = document.querySelector("#sent-at");
const subject = document.querySelector("#subject");
const messageText = document.querySelector("#message-text");
const codePanel = document.querySelector("#code-panel");
const verificationCode = document.querySelector("#verification-code");

const state = {
  mailboxes: [],
  selectedAddress: "",
  messagesByAddress: new Map(),
  selectedMessageId: ""
};

const setStatus = (message, tone = "") => {
  statusText.textContent = message;
  statusText.dataset.tone = tone;
};

const normalizeAddress = (address) => address.trim().toLowerCase();

const loadMailboxes = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

    return Array.isArray(parsed)
      ? parsed.map((item) => normalizeAddress(String(item))).filter(Boolean)
      : [];
  } catch {
    return [];
  }
};

const saveMailboxes = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.mailboxes));
};

const getMessageKey = (message, index) =>
  String(message.id ?? `${message.sentAt}-${message.from}-${message.subject}-${index}`);

const formatTime = (value) =>
  new Date(value).toLocaleString("zh-CN", {
    hour12: false
  });

const getDisplayTime = (message) => message.displaySentAt || formatTime(message.sentAt);

const getPreviewText = (message) => {
  const text = message.displayText || message.text || "";

  return text.replace(/\s+/g, " ").trim() || "(空邮件内容)";
};

const hideDetail = () => {
  detailPanel.classList.add("hidden");
  detailEmpty.classList.remove("hidden");
  codePanel.classList.add("hidden");
};

const showResult = (message) => {
  detailEmpty.classList.add("hidden");
  detailPanel.classList.remove("hidden");
  matchedAddress.textContent = message.matchedAddress;
  sender.textContent = message.from || "Unknown";
  sentAt.textContent = getDisplayTime(message);
  subject.textContent = message.subject || "(No subject)";
  messageText.textContent =
    message.displayText || message.text || "(Empty message body)";

  if (message.verificationCode) {
    verificationCode.textContent = message.verificationCode;
    codePanel.classList.remove("hidden");
  } else {
    verificationCode.textContent = "";
    codePanel.classList.add("hidden");
  }
};

const renderMailboxes = () => {
  mailboxCount.textContent = String(state.mailboxes.length);

  if (!state.mailboxes.length) {
    mailboxList.innerHTML = '<div class="empty-state">还没有邮箱，先添加一个地址。</div>';
    summaryTitle.textContent = "选择邮箱";
    refreshButton.disabled = true;
    return;
  }

  mailboxList.replaceChildren(
    ...state.mailboxes.map((address) => {
      const item = document.createElement("button");

      item.type = "button";
      item.className = "mailbox-item";
      item.dataset.active = String(address === state.selectedAddress);
      item.textContent = address;
      item.addEventListener("click", () => {
        selectMailbox(address);
      });

      return item;
    })
  );
};

const renderMessages = () => {
  const messages = state.messagesByAddress.get(state.selectedAddress) || [];

  summaryTitle.textContent = state.selectedAddress || "选择邮箱";
  refreshButton.disabled = !state.selectedAddress;

  if (!state.selectedAddress) {
    messageList.innerHTML = '<div class="empty-state">先在左侧添加或选择邮箱。</div>';
    hideDetail();
    return;
  }

  if (!messages.length) {
    messageList.innerHTML = '<div class="empty-state">这个邮箱暂无邮件。</div>';
    hideDetail();
    return;
  }

  messageList.replaceChildren(
    ...messages.map((message, index) => {
      const key = getMessageKey(message, index);
      const item = document.createElement("button");
      const title = document.createElement("span");
      const meta = document.createElement("span");
      const preview = document.createElement("span");

      item.type = "button";
      item.className = "message-item";
      item.dataset.active = String(key === state.selectedMessageId);
      title.className = "message-subject";
      meta.className = "message-meta";
      preview.className = "message-preview";

      title.textContent = message.subject || "(No subject)";
      meta.textContent = `${message.from || "Unknown"} · ${getDisplayTime(message)}`;
      preview.textContent = getPreviewText(message);

      item.append(title, meta, preview);
      item.addEventListener("click", () => {
        state.selectedMessageId = key;
        renderMessages();
        showResult(message);
      });

      return item;
    })
  );
};

const loadMessages = async (address) => {
  setStatus("正在加载邮件列表...", "loading");
  hideDetail();

  try {
    const response = await fetch(
      `/api/messages?address=${encodeURIComponent(address)}`
    );
    const payload = await response.json();

    if (!response.ok) {
      state.messagesByAddress.set(address, []);
      renderMessages();
      setStatus(formatLookupError({ payload }), "error");
      return;
    }

    state.messagesByAddress.set(address, payload.messages || []);
    state.selectedMessageId = "";
    renderMessages();
    setStatus(`已加载 ${payload.messages?.length || 0} 封邮件。`, "success");
  } catch (error) {
    state.messagesByAddress.set(address, []);
    renderMessages();
    setStatus(formatLookupError({ error }), "error");
  }
};

const selectMailbox = (address) => {
  state.selectedAddress = address;
  state.selectedMessageId = "";
  renderMailboxes();
  renderMessages();
  loadMessages(address);
};

const addMailbox = (address) => {
  const normalized = normalizeAddress(address);

  if (!normalized) {
    return;
  }

  if (!state.mailboxes.includes(normalized)) {
    state.mailboxes.push(normalized);
    saveMailboxes();
  }

  addressInput.value = "";
  selectMailbox(normalized);
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  addMailbox(addressInput.value);
});

refreshButton.addEventListener("click", () => {
  if (state.selectedAddress) {
    loadMessages(state.selectedAddress);
  }
});

state.mailboxes = loadMailboxes();
state.selectedAddress = state.mailboxes[0] || "";
renderMailboxes();
renderMessages();

if (state.selectedAddress) {
  loadMessages(state.selectedAddress);
}
