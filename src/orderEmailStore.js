import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { isValidEmailAddress, normalizeAddress } from "./emailMatcher.js";

export const normalizeOrderId = (orderId) => String(orderId ?? "").trim();

const normalizeAddressList = (addresses) => [
  ...new Set(
    (Array.isArray(addresses) ? addresses : [])
      .map((address) => normalizeAddress(address))
      .filter(isValidEmailAddress)
  )
];

const normalizeRecords = (records) =>
  Object.fromEntries(
    Object.entries(records && typeof records === "object" ? records : {})
      .map(([orderId, addresses]) => [normalizeOrderId(orderId), normalizeAddressList(addresses)])
      .filter(([orderId, addresses]) => orderId && addresses.length)
  );

export const createFileOrderEmailStore = ({
  filePath = path.resolve(process.cwd(), "data/order-email-map.json")
} = {}) => {
  const readRecords = async () => {
    try {
      const contents = await readFile(filePath, "utf8");
      const payload = JSON.parse(contents);

      return normalizeRecords(payload?.orders);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return {};
      }

      throw error;
    }
  };

  const writeRecords = async (records) => {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify({ orders: normalizeRecords(records) }, null, 2)}\n`,
      "utf8"
    );
  };

  return {
    async list() {
      return readRecords();
    },

    async get(orderId) {
      const records = await readRecords();

      return records[normalizeOrderId(orderId)] ?? [];
    },

    async set(orderId, addresses) {
      const normalizedOrderId = normalizeOrderId(orderId);
      const normalizedAddresses = normalizeAddressList(addresses);

      if (!normalizedOrderId) {
        throw new Error("Please provide an order id.");
      }

      if (!normalizedAddresses.length) {
        throw new Error("Please provide at least one valid email address.");
      }

      const records = await readRecords();
      records[normalizedOrderId] = normalizedAddresses;
      await writeRecords(records);

      return records[normalizedOrderId];
    },

    async delete(orderId) {
      const normalizedOrderId = normalizeOrderId(orderId);

      if (!normalizedOrderId) {
        throw new Error("Please provide an order id.");
      }

      const records = await readRecords();
      delete records[normalizedOrderId];
      await writeRecords(records);

      return [];
    }
  };
};
