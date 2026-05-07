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
- `WHITELIST_AUTH_CODE`: 白名单接口认证 code，默认 `Xinyang666!`
- `WHITELIST_FILE_PATH`: 白名单数据文件，默认 `data/email-whitelist.json`
- `ORDER_EMAIL_FILE_PATH`: 订单和邮箱映射数据文件，默认 `data/order-email-map.json`

## 启动

```bash
npm install
PORT=3000 HOST=127.0.0.1 TEMP_MAIL_BASE_URL=https://your-temp-mail-domain.example TEMP_MAIL_ADMIN_AUTH=your-admin-token npm start
```

打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。

## Docker 启动

先复制并填写环境变量：

```bash
cp .env.example .env
```

容器内需要监听 `0.0.0.0`，`docker-compose.yml` 已经自动设置：

```bash
docker compose up -d --build
```

打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。

停止服务：

```bash
docker compose down
```

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

### 邮箱白名单接口

所有白名单接口都需要认证，推荐用请求头：

```http
x-auth-code: Xinyang666!
```

也支持：

```http
Authorization: Bearer Xinyang666!
```

获取白名单：

```http
GET /api/email-whitelist
x-auth-code: Xinyang666!
```

增加邮箱：

```http
POST /api/email-whitelist
Content-Type: application/json
x-auth-code: Xinyang666!

{"action":"add","address":"alias@example.com"}
```

删除邮箱：

```http
POST /api/email-whitelist
Content-Type: application/json
x-auth-code: Xinyang666!

{"action":"delete","address":"alias@example.com"}
```

### 订单号邮件查询

写入订单号对应的邮箱列表需要认证：

```http
POST /api/order-email-map
Content-Type: application/json
x-auth-code: Xinyang666!

{"action":"set","orderId":"ORDER-1001","addresses":["a@example.com","b@example.com"]}
```

获取某个订单绑定了哪些邮箱需要认证：

```http
GET /api/order-email-map?orderId=ORDER-1001
x-auth-code: Xinyang666!
```

按订单号查询该订单下所有邮箱的邮件：

```http
GET /api/order-messages?orderId=ORDER-1001
```

如果不想让 A 继续用这个订单查邮件，删除订单映射即可：

```http
POST /api/order-email-map
Content-Type: application/json
x-auth-code: Xinyang666!

{"action":"delete","orderId":"ORDER-1001"}
```

邮箱直接查询只检查白名单；`x-auth-code` 只用于白名单和订单映射维护接口。

参考文档：

- [Mail API 文档](https://temp-mail-docs.awsl.uk/zh/guide/feature/mail-api.html)
