import {
  envelopeContainsAddress,
  headerSectionContainsAddress,
  extractHeaderSection,
  normalizeAddress
} from "./emailMatcher.js";
import { simpleParser } from "mailparser";

const parseHeaderValue = (headerSection, name) => {
  const pattern = new RegExp(`^${name}:\\s*(.+)$`, "im");
  const match = headerSection.match(pattern);

  return match?.[1]?.trim() ?? "";
};

const toSourceBuffer = (message) => {
  const source = message?.raw ?? message?.source ?? "";

  return Buffer.isBuffer(source) ? source : Buffer.from(String(source), "utf8");
};

const htmlToPlainText = (html) =>
  String(html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();

const extractVerificationCode = (text) => {
  const normalized = String(text ?? "");
  const candidates = normalized.match(/\b\d{4,8}\b/g) ?? [];

  return candidates.find((candidate) => candidate.length >= 5) ?? candidates[0] ?? "";
};

const buildDisplayText = (text) => {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^https?:\/\//i.test(line))
    .filter((line) => !/\[(https?:\/\/|mailto:)/i.test(line))
    .filter((line) => !/(sendgrid\.net|\/wf\/open|\/ls\/click)/i.test(line));

  const uniqueLines = [...new Set(lines)];

  return uniqueLines.slice(0, 8).join("\n\n");
};

const getMessageTimestamp = (message) => {
  const dateValue = getMessageDateValue(message);

  const timestamp = parseMessageTimestamp(dateValue);

  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const getMessageDateValue = (message) =>
  message?.internalDate ||
  message?.envelope?.date ||
  message?.createdAt ||
  message?.created_at ||
  message?.receivedAt ||
  message?.date;

const parseMessageTimestamp = (value) => {
  const plainMatch = String(value ?? "").match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/
  );

  if (plainMatch) {
    return Date.UTC(
      Number(plainMatch[1]),
      Number(plainMatch[2]) - 1,
      Number(plainMatch[3]),
      Number(plainMatch[4]),
      Number(plainMatch[5]),
      Number(plainMatch[6])
    );
  }

  return new Date(value || 0).getTime();
};

const formatDisplaySentAt = (timestamp) => {
  return new Date(timestamp || Date.now()).toLocaleString("zh-CN", {
    hour12: false,
    timeZone: "Asia/Shanghai"
  });
};

const toUniqueAddresses = (values) => [...new Set(values.filter(Boolean))];

const extractCandidateAddresses = (message) => {
  const explicitAddress = normalizeAddress(message?.address || message?.to);

  if (explicitAddress) {
    return [explicitAddress];
  }

  return toUniqueAddresses([
    ...((message?.envelope?.to ?? []).map((entry) => normalizeAddress(entry?.address))),
    ...((message?.envelope?.cc ?? []).map((entry) => normalizeAddress(entry?.address))),
    ...((message?.envelope?.bcc ?? []).map((entry) => normalizeAddress(entry?.address)))
  ]);
};

const splitAddress = (address) => {
  const normalized = normalizeAddress(address);
  const [localPart = "", domain = ""] = normalized.split("@");

  return { normalized, localPart, domain };
};

const getEditDistance = (leftValue, rightValue) => {
  const left = String(leftValue ?? "");
  const right = String(rightValue ?? "");

  if (!left) {
    return right.length;
  }

  if (!right) {
    return left.length;
  }

  const rows = Array.from({ length: left.length + 1 }, (_, index) => [index]);

  for (let column = 1; column <= right.length; column += 1) {
    rows[0][column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;

      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + cost
      );
    }
  }

  return rows[left.length][right.length];
};

const chooseClosestAddress = (requestedAddress, candidateAddresses) => {
  const request = splitAddress(requestedAddress);

  const ranked = candidateAddresses
    .filter((candidateAddress) => candidateAddress !== request.normalized)
    .map((candidateAddress) => {
      const candidate = splitAddress(candidateAddress);
      const localPartMatches = candidate.localPart === request.localPart;
      const domainDistance = getEditDistance(candidate.domain, request.domain);
      const fullDistance = getEditDistance(candidate.normalized, request.normalized);

      return {
        address: candidateAddress,
        localPartMatches,
        domainDistance,
        fullDistance
      };
    })
    .sort((left, right) => {
      if (left.localPartMatches !== right.localPartMatches) {
        return left.localPartMatches ? -1 : 1;
      }

      if (left.domainDistance !== right.domainDistance) {
        return left.domainDistance - right.domainDistance;
      }

      return left.fullDistance - right.fullDistance;
    });

  const bestMatch = ranked[0];

  if (!bestMatch) {
    return null;
  }

  if (bestMatch.localPartMatches || bestMatch.fullDistance <= 3) {
    return bestMatch.address;
  }

  return null;
};

const defaultParseMessage = async (message, matchedAddress) => {
  const sourceBuffer = toSourceBuffer(message);
  const headerSection = extractHeaderSection(sourceBuffer);
  const parsed = await simpleParser(sourceBuffer);
  const html =
    typeof parsed.html === "string"
      ? parsed.html
      : Buffer.isBuffer(parsed.html)
        ? parsed.html.toString("utf8")
        : "";
  const text = parsed.text?.trim() || htmlToPlainText(html);
  const displayText = buildDisplayText(text);
  const timestamp = getMessageTimestamp(message) || Date.now();

  return {
    matchedAddress,
    subject:
      parsed.subject?.trim() ||
      message?.envelope?.subject?.trim() ||
      parseHeaderValue(headerSection, "Subject"),
    from:
      parsed.from?.value?.[0]?.address ||
      message?.envelope?.from?.[0]?.address ||
      parseHeaderValue(headerSection, "From"),
    sentAt: new Date(timestamp).toISOString(),
    displaySentAt: formatDisplaySentAt(timestamp),
    text,
    displayText,
    verificationCode: extractVerificationCode(displayText || text),
    html,
    id: message?.id ?? message?.uid ?? null
  };
};

const messageMatchesAddress = (message, matchedAddress) => {
  const headerSection = extractHeaderSection(toSourceBuffer(message));
  const explicitAddress = normalizeAddress(message?.address || message?.to);

  return (
    explicitAddress === matchedAddress ||
    envelopeContainsAddress(message.envelope, matchedAddress) ||
    headerSectionContainsAddress(headerSection, matchedAddress)
  );
};

export const createMailboxService = ({
  listRecentMessages,
  parseMessage = defaultParseMessage
}) => {
  const listMessages = async (address) => {
    const matchedAddress = normalizeAddress(address);

    if (!matchedAddress) {
      return [];
    }

    const messages = await listRecentMessages(matchedAddress);
    const newestFirst = [...messages].sort(
      (left, right) => getMessageTimestamp(right) - getMessageTimestamp(left)
    );
    const matchingMessages = newestFirst.filter((message) =>
      messageMatchesAddress(message, matchedAddress)
    );

    return Promise.all(
      matchingMessages.map((message) => parseMessage(message, matchedAddress))
    );
  };

  return {
    listMessages,

    async getLatestMessage(address) {
      const messages = await listMessages(address);

      return messages[0] ?? null;
    },

    async suggestAddress(address) {
      const matchedAddress = normalizeAddress(address);

      if (!matchedAddress) {
        return null;
      }

      const recentMessages = await listRecentMessages();
      const candidateAddresses = toUniqueAddresses(
        recentMessages.flatMap((message) => extractCandidateAddresses(message))
      );

      return chooseClosestAddress(matchedAddress, candidateAddresses);
    }
  };
};
