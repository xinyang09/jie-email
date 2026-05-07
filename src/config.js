const normalizeBaseUrl = (value) => {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return "";
  }

  return normalized.endsWith("/") ? normalized : `${normalized}/`;
};

export const loadAppConfig = (env = process.env) => ({
  host: String(env.HOST || "127.0.0.1").trim() || "127.0.0.1",
  port: Number(env.PORT || 3000),
  tempMailBaseUrl: normalizeBaseUrl(env.TEMP_MAIL_BASE_URL),
  tempMailAdminAuth: String(env.TEMP_MAIL_ADMIN_AUTH ?? "").trim(),
  tempMailSiteAuth: String(env.TEMP_MAIL_SITE_AUTH ?? "").trim(),
  whitelistAuthCode: String(env.WHITELIST_AUTH_CODE ?? "Xinyang666!").trim(),
  whitelistFilePath: String(env.WHITELIST_FILE_PATH ?? "data/email-whitelist.json").trim(),
  orderEmailFilePath: String(env.ORDER_EMAIL_FILE_PATH ?? "data/order-email-map.json").trim()
});

export const validateAppConfig = (config) => {
  if (!config.tempMailBaseUrl) {
    throw new Error("Missing TEMP_MAIL_BASE_URL.");
  }

  if (!config.tempMailAdminAuth) {
    throw new Error("Missing TEMP_MAIL_ADMIN_AUTH.");
  }

  if (!config.whitelistAuthCode) {
    throw new Error("Missing WHITELIST_AUTH_CODE.");
  }
};
