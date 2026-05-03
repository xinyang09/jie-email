const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeAddress = (value) =>
  String(value ?? "").trim().toLowerCase();

export const isValidEmailAddress = (value) =>
  EMAIL_PATTERN.test(normalizeAddress(value));

const collectAddresses = (entries = []) =>
  entries
    .map((entry) => normalizeAddress(entry?.address))
    .filter(Boolean);

export const envelopeContainsAddress = (envelope, address) => {
  const target = normalizeAddress(address);

  if (!target) {
    return false;
  }

  return ["to", "cc", "bcc", "replyTo"].some((field) =>
    collectAddresses(envelope?.[field]).includes(target)
  );
};

export const headerSectionContainsAddress = (headerSection, address) => {
  const target = normalizeAddress(address);

  if (!target || typeof headerSection !== "string") {
    return false;
  }

  return headerSection.toLowerCase().includes(target);
};

export const extractHeaderSection = (source) => {
  const rawMessage = Buffer.isBuffer(source) ? source.toString("utf8") : String(source ?? "");
  const separatorMatch = rawMessage.match(/\r?\n\r?\n/);

  if (!separatorMatch || separatorMatch.index === undefined) {
    return rawMessage;
  }

  return rawMessage.slice(0, separatorMatch.index);
};
