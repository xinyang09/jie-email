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
  tempMailSiteAuth: String(env.TEMP_MAIL_SITE_AUTH ?? "").trim()
});

export const validateAppConfig = (config) => {
  if (!config.tempMailBaseUrl) {
    throw new Error("Missing TEMP_MAIL_BASE_URL.");
  }

  if (!config.tempMailAdminAuth) {
    throw new Error("Missing TEMP_MAIL_ADMIN_AUTH.");
  }
};
