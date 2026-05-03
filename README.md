# CF Temp Mail Viewer

一个最小 Web 应用：输入临时邮箱地址，服务端通过 Temp Mail 的 Admin Mail API 拉取该地址的最新邮件，并把 `raw MIME` 解析成可读内容后返回给页面。

## 依赖

- Node.js 22+

## 配置

复制环境变量并填入你自己的站点配置：

```bash
cp .env.example .env
```

必须配置：

- `TEMP_MAIL_BASE_URL`: 你的临时邮箱站点根地址
- `TEMP_MAIL_ADMIN_AUTH`: 文档里的 `x-admin-auth`

可选配置：

- `TEMP_MAIL_SITE_AUTH`: 如果站点启用了 `x-custom-auth`，就在这里填
- `HOST`: 默认 `127.0.0.1`
- `PORT`: 默认 `3000`

## 启动

```bash
npm install
PORT=3000 HOST=127.0.0.1 TEMP_MAIL_BASE_URL=https://your-temp-mail-domain.example TEMP_MAIL_ADMIN_AUTH=your-admin-token npm start
```

打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。

## 接口

页面会调用：

```http
GET /api/messages/latest?address=alias@example.com
```

服务端会转发到文档中的 Admin API：

```http
GET {TEMP_MAIL_BASE_URL}/admin/mails?limit=20&offset=0&address=alias@example.com
x-admin-auth: {TEMP_MAIL_ADMIN_AUTH}
x-custom-auth: {TEMP_MAIL_SITE_AUTH?}
```

参考文档：

- [Mail API 文档](https://temp-mail-docs.awsl.uk/zh/guide/feature/mail-api.html)
