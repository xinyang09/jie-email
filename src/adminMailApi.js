const normalizeMailRecords = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  const candidates = [
    payload?.data,
    payload?.mails,
    payload?.results,
    payload?.items,
    payload?.records,
    payload?.data?.items
  ];

  const records = candidates.find(Array.isArray);

  return records ?? [];
};

const buildErrorMessage = async (response) => {
  if (response.status === 401 || response.status === 403) {
    return `Temp Mail API authentication failed (${response.status}). Check TEMP_MAIL_ADMIN_AUTH and TEMP_MAIL_SITE_AUTH.`;
  }

  try {
    const payload = await response.json();

    if (typeof payload?.error === "string" && payload.error.trim()) {
      return payload.error.trim();
    }

    if (typeof payload?.message === "string" && payload.message.trim()) {
      return payload.message.trim();
    }
  } catch {
    // Ignore JSON parsing errors and fall back to plain text below.
  }

  try {
    const text = await response.text();

    if (text.trim()) {
      return text.trim();
    }
  } catch {
    // Ignore text parsing errors and fall back to the status line.
  }

  return `Mail API request failed with status ${response.status}.`;
};

export const createAdminMailApiClient = ({
  baseUrl,
  adminAuth,
  siteAuth,
  fetchImpl = fetch,
  defaultLimit = 20
}) => ({
  async listMailsByAddress(address, { limit = defaultLimit, offset = 0 } = {}) {
    const url = new URL("/admin/mails", baseUrl);

    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    if (typeof address === "string" && address.trim()) {
      url.searchParams.set("address", address);
    }

    const headers = {
      "x-admin-auth": adminAuth,
      Accept: "application/json"
    };

    if (siteAuth) {
      headers["x-custom-auth"] = siteAuth;
    }

    const response = await fetchImpl(url, {
      method: "GET",
      headers
    });

    if (!response.ok) {
      throw new Error(await buildErrorMessage(response));
    }

    const payload = await response.json();

    return normalizeMailRecords(payload);
  }
});
