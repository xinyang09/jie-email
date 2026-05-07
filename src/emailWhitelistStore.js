import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { isValidEmailAddress, normalizeAddress } from "./emailMatcher.js";

const normalizeAddressList = (addresses) => [
  ...new Set(
    (Array.isArray(addresses) ? addresses : [])
      .map((address) => normalizeAddress(address))
      .filter(isValidEmailAddress)
  )
];

export const createFileEmailWhitelistStore = ({
  filePath = path.resolve(process.cwd(), "data/email-whitelist.json")
} = {}) => {
  const readAddresses = async () => {
    try {
      const contents = await readFile(filePath, "utf8");
      const payload = JSON.parse(contents);

      return normalizeAddressList(payload?.addresses);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return [];
      }

      throw error;
    }
  };

  const writeAddresses = async (addresses) => {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify({ addresses: normalizeAddressList(addresses) }, null, 2)}\n`,
      "utf8"
    );
  };

  return {
    async list() {
      return readAddresses();
    },

    async add(address) {
      const normalizedAddress = normalizeAddress(address);

      if (!isValidEmailAddress(normalizedAddress)) {
        throw new Error("Please provide a valid email address.");
      }

      const addresses = await readAddresses();
      const nextAddresses = normalizeAddressList([...addresses, normalizedAddress]);

      await writeAddresses(nextAddresses);

      return nextAddresses;
    },

    async delete(address) {
      const normalizedAddress = normalizeAddress(address);

      if (!isValidEmailAddress(normalizedAddress)) {
        throw new Error("Please provide a valid email address.");
      }

      const addresses = await readAddresses();
      const nextAddresses = addresses.filter((item) => item !== normalizedAddress);

      await writeAddresses(nextAddresses);

      return nextAddresses;
    }
  };
};
