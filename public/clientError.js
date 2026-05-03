const LOCAL_SERVER_ERROR_MESSAGE =
  "无法连接到本地服务，请确认 http://127.0.0.1:3000 正在运行。";

export const formatLookupError = ({ payload, error }) => {
  if (
    typeof payload?.error === "string" &&
    payload.error.trim() &&
    typeof payload?.suggestion === "string" &&
    payload.suggestion.trim()
  ) {
    return `${payload.error.trim()} Did you mean ${payload.suggestion.trim()}?`;
  }

  if (typeof payload?.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }

  if (error instanceof TypeError && /fetch failed/i.test(error.message)) {
    return LOCAL_SERVER_ERROR_MESSAGE;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "查询失败。";
};
