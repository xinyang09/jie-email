import test from "node:test";
import assert from "node:assert/strict";

const loadMailboxServiceModule = async () =>
  import("../src/mailboxService.js").catch(() => ({}));

const buildMessage = ({ uid, date, headers, text, subject, from }) => ({
  uid,
  internalDate: new Date(date),
  envelope: {
    date: new Date(date),
    subject,
    from: [{ address: from, name: from }]
  },
  source: Buffer.from(
    [
      ...headers,
      `Subject: ${subject}`,
      `From: ${from}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      text
    ].join("\r\n"),
    "utf8"
  )
});

const buildRawRecord = ({ id, date, raw, address }) => ({
  id,
  createdAt: date,
  raw,
  address
});

test("returns the newest message addressed to the requested alias", async () => {
  const mailboxServiceModule = await loadMailboxServiceModule();
  const service = mailboxServiceModule.createMailboxService?.({
    listRecentMessages: async () => [
      buildMessage({
        uid: 101,
        date: "2026-05-03T10:00:00.000Z",
        headers: [
          "Delivered-To: admin@example.com",
          "X-Original-To: alias@demo.example"
        ],
        subject: "Older code",
        from: "noreply@service.test",
        text: "older"
      }),
      buildMessage({
        uid: 102,
        date: "2026-05-03T11:00:00.000Z",
        headers: [
          "Delivered-To: admin@example.com",
          "X-Original-To: alias@demo.example"
        ],
        subject: "Newest code",
        from: "noreply@service.test",
        text: "newest"
      }),
      buildMessage({
        uid: 103,
        date: "2026-05-03T12:00:00.000Z",
        headers: [
          "Delivered-To: admin@example.com",
          "X-Original-To: other@demo.example"
        ],
        subject: "Other alias",
        from: "noreply@service.test",
        text: "other"
      })
    ]
  });

  const latestMessage = await service?.getLatestMessage("alias@demo.example");

  assert.equal(latestMessage?.subject, "Newest code");
  assert.equal(latestMessage?.text, "newest");
  assert.equal(latestMessage?.matchedAddress, "alias@demo.example");
});

test("returns all matching messages newest first for an alias", async () => {
  const mailboxServiceModule = await loadMailboxServiceModule();
  const service = mailboxServiceModule.createMailboxService?.({
    listRecentMessages: async () => [
      buildMessage({
        uid: 101,
        date: "2026-05-03T10:00:00.000Z",
        headers: [
          "Delivered-To: admin@example.com",
          "X-Original-To: alias@demo.example"
        ],
        subject: "Older code",
        from: "noreply@service.test",
        text: "older"
      }),
      buildMessage({
        uid: 102,
        date: "2026-05-03T11:00:00.000Z",
        headers: [
          "Delivered-To: admin@example.com",
          "X-Original-To: alias@demo.example"
        ],
        subject: "Newest code",
        from: "noreply@service.test",
        text: "newest"
      }),
      buildMessage({
        uid: 103,
        date: "2026-05-03T12:00:00.000Z",
        headers: [
          "Delivered-To: admin@example.com",
          "X-Original-To: other@demo.example"
        ],
        subject: "Other alias",
        from: "noreply@service.test",
        text: "other"
      })
    ]
  });

  const messages = await service?.listMessages("alias@demo.example");

  assert.equal(messages?.length, 2);
  assert.equal(messages?.[0].subject, "Newest code");
  assert.equal(messages?.[1].subject, "Older code");
  assert.equal(messages?.[0].matchedAddress, "alias@demo.example");
});

test("parses raw MIME records returned by the admin mail API", async () => {
  const mailboxServiceModule = await loadMailboxServiceModule();
  const service = mailboxServiceModule.createMailboxService?.({
    listRecentMessages: async () => [
      buildRawRecord({
        id: 201,
        date: "2026-05-03T12:30:00.000Z",
        address: "alias@demo.example",
        raw: [
          "Delivered-To: admin@example.com",
          "X-Original-To: alias@demo.example",
          "Subject: OTP",
          "From: [email protected]",
          "Content-Type: text/plain; charset=utf-8",
          "",
          "654321"
        ].join("\r\n")
      })
    ]
  });

  const latestMessage = await service?.getLatestMessage("alias@demo.example");

  assert.equal(latestMessage?.subject, "OTP");
  assert.equal(latestMessage?.text, "654321");
  assert.equal(latestMessage?.from, "[email protected]");
});

test("prefers the raw MIME field over the admin API source envelope", async () => {
  const mailboxServiceModule = await loadMailboxServiceModule();
  const service = mailboxServiceModule.createMailboxService?.({
    listRecentMessages: async () => [
      {
        id: 202,
        created_at: "2026-05-03 12:26:50",
        source: "bounces+alias=demo.example@sender.example",
        address: "alias@demo.example",
        raw: [
          "Subject: Login code",
          "From: noreply@example.com",
          "To: alias@demo.example",
          "Content-Type: text/html; charset=utf-8",
          "",
          "<html><body><p>Code: <strong>425369</strong></p></body></html>"
        ].join("\r\n")
      }
    ]
  });

  const latestMessage = await service?.getLatestMessage("alias@demo.example");

  assert.equal(latestMessage?.subject, "Login code");
  assert.equal(latestMessage?.from, "noreply@example.com");
  assert.match(latestMessage?.text, /425369/);
});

test("displays plain admin API timestamps as Beijing time from UTC", async () => {
  const mailboxServiceModule = await loadMailboxServiceModule();
  const service = mailboxServiceModule.createMailboxService?.({
    listRecentMessages: async () => [
      {
        id: 204,
        created_at: "2026-05-03 12:26:50",
        address: "alias@demo.example",
        raw: [
          "Subject: Login code",
          "From: noreply@example.com",
          "To: alias@demo.example",
          "",
          "425369"
        ].join("\r\n")
      }
    ]
  });

  const latestMessage = await service?.getLatestMessage("alias@demo.example");

  assert.equal(latestMessage?.displaySentAt, "2026/5/3 20:26:50");
});

test("extracts the verification code and filters tracking-heavy display text", async () => {
  const mailboxServiceModule = await loadMailboxServiceModule();
  const service = mailboxServiceModule.createMailboxService?.({
    listRecentMessages: async () => [
      buildRawRecord({
        id: 203,
        date: "2026-05-03T12:30:00.000Z",
        address: "alias@demo.example",
        raw: [
          "Subject: Login code",
          "From: noreply@example.com",
          "To: alias@demo.example",
          "Content-Type: text/html; charset=utf-8",
          "",
          [
            "<html><body>",
            "<img src=\"https://cdn.example/logo.png\" alt=\"OpenAI\" />",
            "<p>输入此临时验证码以继续：</p>",
            "<p>425369</p>",
            "<p>未请求验证码？你可以忽略此邮件。</p>",
            "<a href=\"https://tracking.example/very/long/path\">帮助中心</a>",
            "</body></html>"
          ].join("")
        ].join("\r\n")
      })
    ]
  });

  const latestMessage = await service?.getLatestMessage("alias@demo.example");

  assert.equal(latestMessage?.verificationCode, "425369");
  assert.match(latestMessage?.displayText, /输入此临时验证码以继续/);
  assert.match(latestMessage?.displayText, /未请求验证码/);
  assert.doesNotMatch(latestMessage?.displayText, /https:\/\//);
});

test("returns null when the alias has no matching message", async () => {
  const mailboxServiceModule = await loadMailboxServiceModule();
  const service = mailboxServiceModule.createMailboxService?.({
    listRecentMessages: async () => []
  });

  const latestMessage = await service?.getLatestMessage("missing@demo.example");

  assert.equal(latestMessage, null);
});

test("suggests a similar address when the local part matches recent mail", async () => {
  const mailboxServiceModule = await loadMailboxServiceModule();
  const calls = [];
  const service = mailboxServiceModule.createMailboxService?.({
    listRecentMessages: async (address) => {
      calls.push(address ?? null);

      if (address) {
        return [];
      }

      return [
        buildRawRecord({
          id: 301,
          date: "2026-05-03T12:30:00.000Z",
          address: "zxertq@jijie.online",
          raw: [
            "Subject: OTP",
            "To: zxertq@jijie.online",
            "",
            "425369"
          ].join("\r\n")
        }),
        buildRawRecord({
          id: 302,
          date: "2026-05-03T12:20:00.000Z",
          address: "other@demo.example",
          raw: [
            "Subject: Other",
            "To: other@demo.example",
            "",
            "other"
          ].join("\r\n")
        })
      ];
    }
  });

  const suggestion = await service?.suggestAddress("zxertq@jjie.online");

  assert.deepEqual(calls, [null]);
  assert.equal(suggestion, "zxertq@jijie.online");
});
