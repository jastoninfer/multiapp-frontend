# Frontend Code Reading Guide

这份文档是给你读当前 `frontmultiapp` 代码用的，不是用户手册。它解释关键文件为什么这样设计、数据如何流动、哪些地方是临时取舍，以及后续最值得重构的点。

## 1. 当前前端的核心设计

这个前端目前围绕四条主线组织：

1. **Keycloak/OIDC 登录**
   - 前端不提供用户名密码表单。
   - 未登录访问受保护页面时，直接跳 Keycloak。
   - Keycloak 回调 `/auth/callback` 使用 Authorization Code + PKCE 换取 token。
   - 前端只用 `access_token` 访问后端 API。
   - `id_token` 只用于 Keycloak logout 的 `id_token_hint`。

2. **单一 `/me` 身份入口**
   - 后端 `/me` 已经返回 profile 和 tenants。
   - 前端现在不再调用 `/me/tenants`。
   - `useCurrentTenant()` 是读取当前用户、租户列表、当前租户和角色的统一入口。

3. **Tenant-scoped API**
   - 除 `/me` 这类 tenant-independent endpoint 以外，业务 API 都需要 `X-Tenant-Id`。
   - 当前 tenant 存在 `AuthContext` state 和 `localStorage` 中。
   - 切换 tenant 后会 invalidate query cache 并回到 `/dashboard`。

4. **Role-aware UI**
   - UI 会根据 `CUSTOMER / AGENT / ADMIN / RESOURCE_USER` 展示入口。
   - 这只是体验层面的隐藏。
   - 真正权限仍然以后端为准，前端必须处理 `403`。

## 2. 目录结构速读

```txt
src/
  api/                 Backend API wrappers
  auth/                OIDC, auth context, authorization helpers
  components/          Shared UI and feature panels
  hooks/               Cross-page hooks, currently mostly tenant/user state
  pages/               Route pages
  queryKeys.ts         TanStack Query key conventions
  router.tsx           React Router route table
  types.ts             Backend-facing DTO-ish frontend types
```

## 3. 登录链路

相关文件：

- `src/components/RequireAuth.tsx`
- `src/components/AuthRedirect.tsx`
- `src/auth/oidc.ts`
- `src/pages/AuthCallbackPage.tsx`
- `src/auth/AuthContext.tsx`
- `src/pages/SignedOutPage.tsx`

### 3.1 未登录访问业务页面

路由默认都被 `RequireAuth` 包住。用户没有本地 `access_token` 时：

```txt
RequireAuth
  -> AuthRedirect
  -> startKeycloakLogin(...)
  -> Keycloak authorize endpoint
```

`AuthRedirect` 会把用户原来想访问的 URL 保存为 `returnTo`。例如用户直接访问：

```txt
/tickets/abc
```

登录成功后应回到：

```txt
/tickets/abc
```

如果原始地址是 `/`、`/signed-out`、`/auth/callback`，`oidc.ts` 会归一化为 `/dashboard`，避免流程页成为登录成功后的目标页。

### 3.2 PKCE 为什么存在

`startKeycloakLogin()` 会生成：

- `state`
- `code_verifier`
- `code_challenge`

其中：

- `state` 防 CSRF / 错误回调。
- `code_verifier` 保存在 `sessionStorage`。
- `code_challenge` 发给 Keycloak。
- 回调时用 `code_verifier` 证明这次 code 是同一个前端发起的。

### 3.3 Authorization code 只能消费一次

`AuthCallbackPage` 会调用：

```ts
exchangeCodeForToken(code, state)
```

这个 code 是一次性的。如果 React dev mode 的 `StrictMode` 导致 effect 重复执行，或者用户刷新 callback 页面，同一个 code 被重复提交，Keycloak 会返回：

```json
{
  "error": "invalid_grant",
  "error_description": "Code not valid"
}
```

为了解决这个问题，`oidc.ts` 里做了 callback lock：

```txt
multiapp.oidc.callback.<state>.<code> = processing | consumed
```

`AuthCallbackPage` 也有 `useRef` 防止同一组件实例重复跑 effect。两层保护的目的不同：

- `useRef` 防同一次 mount 内重复执行。
- `sessionStorage` lock 防 StrictMode remount、刷新、重复 callback。

### 3.4 invalid_grant 的恢复策略

如果 code 已经过期或被消费，前端不会回 `/signed-out`，而是在 callback 页面显示：

- `Start sign-in again`
- `Force re-authentication`

前者重新发起普通 authorize request。若 Keycloak remember-me session 有效，可能免密回调。

后者会带：

```txt
prompt=login
```

强制 Keycloak 显示登录页。

### 3.5 Logout 和 remember me

`Sign out` 会调用 Keycloak logout endpoint，并带 `id_token_hint`。这意味着：

```txt
Sign out = 尝试结束 Keycloak SSO session
```

所以即使用户勾选 remember me，只要真正执行 Keycloak logout，下次点击 `Sign in again` 也可能要求重新输入密码。

Remember me 的意义是：如果用户没有主动 logout，只是 access token 过期或前端 token 丢失，重新跳 Keycloak authorize 时，Keycloak 可以用仍然有效的 SSO session 直接签发新的 code。

## 4. AuthContext

文件：

- `src/auth/AuthContext.tsx`

它保存四类本地状态：

- `accessToken`
- `idToken`
- `currentTenantId`
- `authIssue`

`authIssue` 是全局认证流程状态，不是普通 API 错误展示字段：

- `session-expired`: 当前 access token 已过期或 `/me` 被 401 拒绝，需要重新登录；受保护路由会跳到 `/session-expired`。
- `backend-unauthorized`: 后端返回了 401，但前端不能明确判断为 token 过期；页面仍显示具体请求错误，AuthContext 只记录这个认证异常。
- `""`: 没有待处理的全局认证异常。

logout in progress flag 放在 `sessionStorage`，用于避免主动退出过程中又被 protected route 自动拉回登录页。

### 4.1 为什么用 localStorage

当前选择是为了开发和刷新页面后保留登录状态：

```txt
reload page -> AuthProvider reads localStorage -> isAuthenticated true
```

缺点也很明确：

- localStorage 中的 token 暴露面比 memory-only token 大。
- 若未来要更严谨，可以改为 memory token + refresh token rotation + silent renew。

### 4.2 401 处理

`api/client.ts` 遇到 `401` 会发出浏览器事件：

```txt
multiapp:session-expired
multiapp:backend-unauthorized
```

`AuthProvider` 监听这些事件。明确 session 过期时会清本地 access token，并让受保护路由跳到 `/session-expired`；无法明确归类的后端 401 会记录为 `backend-unauthorized`，由当前页面的请求错误继续提示用户。

这个机制比较粗糙，但足够作为第一版。未来更优雅的做法是：

- token 过期前主动 refresh
- refresh 失败后再 logout/login
- 对当前页面显示 toast，而不是直接改变全局登录状态

## 5. `/me` 与 tenant 选择

文件：

- `src/api/me.ts`
- `src/hooks/useCurrentTenant.ts`

### 5.1 当前唯一身份请求

现在身份加载只调用：

```txt
GET /me
```

不调用：

```txt
GET /me/tenants
```

因为后端 `/me` 已经返回：

```ts
{
  meResponse: { ...profile },
  tenants: [...]
}
```

### 5.2 useCurrentTenant 返回什么

`useCurrentTenant()` 返回：

- `meQuery`: TanStack Query object，数据是完整 `/me` response。
- `profile`: `meQuery.data?.meResponse`
- `tenants`: `meQuery.data?.tenants ?? []`
- `currentTenant`: 当前 tenant
- `role`: 当前 tenant 下的 role
- `tenantsQuery`: 兼容旧页面命名，目前就是 `meQuery`

`tenantsQuery` 这个名字以后可以删掉，直接统一用 `meQuery`，现在保留是为了减少页面改动。

### 5.3 current tenant 选择规则

在 `Layout` 中：

1. 如果 localStorage tenant 仍在 `/me.tenants` 中，使用它。
2. 否则使用 `isDefault=true` 的 tenant。
3. 否则使用第一个 tenant。
4. 如果用户没有 tenant，业务入口不可用。

### 5.4 切换 tenant

用户在顶部 dropdown 切换 tenant 后：

```txt
updateTenantId(nextTenantId)
queryClient.invalidateQueries()
navigate("/dashboard")
```

这会让 tenant-scoped query 重新请求。

当前做法简单粗暴：invalidate 全部 query。后续可以只 invalidate tenant-scoped keys。

## 6. API Client

文件：

- `src/api/client.ts`

它做几件事：

1. 拼接 base URL。
2. 自动加：
   - `Authorization: Bearer <access_token>`
   - `X-Request-Id`
   - `X-Tenant-Id`
   - `If-Match`
3. 处理 JSON、blob、text、empty response。
4. 统一把错误包装成 `ApiError`。
5. 从 `ETag` header 或 response body `version` 推导 optimistic locking token。

### 6.1 tenantScoped

默认：

```ts
tenantScoped: true
```

因此多数业务请求都会带 `X-Tenant-Id`。

对于 `/me` 这种 tenant-independent endpoint，要显式传：

```ts
apiRequest("/me", { tenantScoped: false })
```

否则用户刚登录但还没选择 tenant 时，`/me` 会错误地带空/旧 tenant。

### 6.2 X-Request-Id

每个请求都会调用：

```ts
crypto.randomUUID()
```

生成 `X-Request-Id`。这方便前后端日志关联。

### 6.3 If-Match

更新类请求通过：

```ts
apiRequest(path, { etag: '"3"' })
```

添加：

```txt
If-Match: "3"
```

后端当前要求带引号的版本号。

### 6.4 当前缺陷

错误处理现在仍偏“页面内展示 error”。你前面提到不希望频繁展示 friendly error，这个方向是对的。未来可以改成：

- 401: 静默 refresh 或重新登录。
- 403: 页面级 forbidden。
- 409: 操作区提示 conflict，并提供 refresh。
- 400: 表单字段旁边提示。
- 500: 全局 toast + request id。

也就是说，error 应按严重度和上下文分层，而不是所有地方都渲染 `ErrorMessage`。

## 7. Query Keys

文件：

- `src/queryKeys.ts`

TanStack Query 的 key 要包含 tenant 和 filters：

```ts
queryKeys.tickets(tenantId, filters)
queryKeys.ticket(tenantId, ticketId)
queryKeys.appointments(tenantId, filters)
```

这样切换 tenant 后，不同 tenant 的缓存不会混在一起。

注意：`queryKeys.me` 不包含 tenant，因为 `/me` 是 tenant-independent。

## 8. Authorization Helper

文件：

- `src/auth/authorization.ts`

它只负责 UI 层的显示判断：

- `hasRole`
- `hasAnyRole`
- `isAdmin`
- `isAgentOrAdmin`
- `isResourceUser`
- `isCustomer`
- `isPlatformAdmin`

前端隐藏按钮只是提升体验，不是安全边界。真正授权仍靠后端。

### 8.1 Platform admin

前端支持：

```ts
me.isPlatformAdmin
me.is_platform_admin
```

但当前后端 `MeResponse` 是否真的返回这个字段，需要你确认。如果后端不返回，前端会认为不是 platform admin。

## 9. 路由导读

文件：

- `src/router.tsx`

### 9.1 公共路由

- `/auth/callback`
- `/signed-out`

这两个不能被 `RequireAuth` 包住，否则登录/登出流程会互相打架。

### 9.2 受保护路由

都在：

```tsx
<RequireAuth />
```

下面。

主要包括：

- `/dashboard`
- `/me`
- `/tickets`
- `/tickets/new`
- `/tickets/:id`
- `/appointments`
- `/appointments/:id`
- `/contacts`
- `/contacts/claim`
- `/contacts/:contactId`
- `/members`
- `/tenant`
- `/admin/tenants`
- `/resources`
- `/resources/:resourceUserId/availability`
- `/notifications`
- `/audit-logs`

## 10. 页面导读

### 10.1 DashboardPage

文件：

- `src/pages/DashboardPage.tsx`

角色感知的首页：

- Customer: 工单入口、创建工单、claim contact。
- Agent/Admin: tickets/appointments/contacts 等入口。
- Resource user: appointments/resource blocks/availability。

目前 summary 不是专门的 aggregate endpoint，而是通过小页 list query 估算。这是合理的第一版，但以后最好由后端提供 dashboard summary endpoint。

### 10.2 MePage

文件：

- `src/pages/MePage.tsx`

展示：

- profile
- tenant memberships
- switch tenant
- set default tenant
- claim contact

注意：不做密码和 credential 编辑，因为身份由 Keycloak 管。

### 10.3 TicketsPage

文件：

- `src/pages/TicketsPage.tsx`

列表页使用后端实际支持的 filters：

- `ticketStatus`
- `ticketPriority`
- `ownerId`
- `requesterUserId`
- `requesterContactId`
- `ticketType`
- `createdFrom`
- `createdTo`

`q` 当前后端不支持，所以 UI 是 disabled placeholder。

### 10.4 NewTicketPage

文件：

- `src/pages/NewTicketPage.tsx`

创建工单会发送：

```txt
Idempotency-Key: crypto.randomUUID()
```

Customer 默认以当前用户作为 requester。Agent/Admin 可以选择 requester user/contact id。

当前后端 `CreateTicketRequest` 仍要求 requesterUserId/requesterContactId 二选一。如果你想实现“Customer 不传 requester，后端默认当前用户”，后端 DTO/Service 需要相应调整。

### 10.5 TicketDetailPage

文件：

- `src/pages/TicketDetailPage.tsx`

包含 tabs：

- Overview
- Comments
- Attachments
- Appointments
- Audit placeholder

支持：

- basic field patch
- assign
- transition
- comments
- attachment upload/download
- create appointment

更新操作使用 `ETag` 或 `version` 作为 `If-Match`。

### 10.6 CommentPanel

文件：

- `src/components/CommentPanel.tsx`

读取：

```txt
GET /tickets/{ticketId}/comments
```

追加：

```txt
POST /tickets/{ticketId}/comments
```

Customer 只能 PUBLIC，Agent/Admin 可以 INTERNAL。

### 10.7 AttachmentList

文件：

- `src/components/AttachmentList.tsx`

上传：

```txt
POST /tickets/{ticketId}/attachments
multipart field=file
```

下载：

```txt
GET /tickets/{ticketId}/attachments/{attachmentId}/download
```

注意：后端没有单独的 `GET /tickets/{id}/attachments`，所以列表来自 `GET /tickets/{id}` 的 detail response。

### 10.8 AppointmentsPage / AppointmentDetailPage

文件：

- `src/pages/AppointmentsPage.tsx`
- `src/pages/AppointmentDetailPage.tsx`

列表支持后端实际 filters：

- `resourceUserId`
- `ticketId`
- `from`
- `to`
- `status`

Resource user 默认看自己。Agent/Admin 可以选择 resource user。

PATCH 使用 `If-Match`。

### 10.9 ContactsPage / ContactDetailPage / ContactClaimPage

文件：

- `src/pages/ContactsPage.tsx`
- `src/pages/ContactDetailPage.tsx`
- `src/pages/ContactClaimPage.tsx`

对应后端：

- `GET /contacts`
- `POST /contacts`
- `GET /contacts/{id}`
- `PATCH /contacts/{id}`
- `POST /contacts/{contactId}/claim-codes`
- `POST /contacts/claim`

Contact update 使用 `If-Match`。

### 10.10 MembersPage

文件：

- `src/pages/MembersPage.tsx`

对应后端：

- `GET /members`
- `GET /members/{userId}`
- `POST /members`
- `PATCH /members/{userId}`
- `DELETE /members/{userId}`

注意：后端 `POST /members` 当前需要 `userId`，不是 email invitation。因此 UI 明确提示需要 existing user id。

### 10.11 TenantPage / AdminTenantsPage

文件：

- `src/pages/TenantPage.tsx`
- `src/pages/AdminTenantsPage.tsx`

Tenant page 对应：

- `GET /tenant`
- `PATCH /tenant`
- `POST /tenant/transition`

Admin tenants 对应：

- `GET /admin/tenants`
- `POST /admin/tenants`

Platform admin 的识别依赖 `/me` 是否返回 platform admin flag。

### 10.12 Resources / Availability

文件：

- `src/pages/ResourcesPage.tsx`
- `src/pages/AvailabilityPage.tsx`

对应：

- `GET /resources/{resourceUserId}/availability`
- `PUT /resources/{resourceUserId}/availability`
- `GET /resources/{resourceUserId}/blocks`
- `POST /resources/{resourceUserId}/blocks`
- `DELETE /resources/{resourceUserId}/blocks/{blockId}`

后端没有独立的 `/working-hours` endpoint，所以 working hours editor 走 availability `PUT`。

### 10.13 Notifications / AuditLogs

文件：

- `src/pages/NotificationsPage.tsx`
- `src/pages/AuditLogsPage.tsx`

目前是 placeholder，因为后端没有对应 controller。

## 11. 当前已知缺陷

### 11.1 Token refresh 尚未实现

当前 access token 过期后的行为是：

```txt
API 401 -> clear local token -> protected route redirects to Keycloak
```

如果 Keycloak remember-me/SSO session 仍有效，用户可能免密回来。

但这不是“活跃期间自动续期”。更成熟的做法是：

- 保存 refresh token 或使用 Keycloak JS adapter。
- 在 token 快过期前 refresh。
- refresh 失败再跳登录。

实现前需要考虑安全策略：refresh token 放 localStorage 风险较高。

### 11.2 错误展示太直接

很多页面现在直接渲染 `ErrorMessage`。这对开发期有帮助，但商业软件不应到处显示后端错误。

建议后续做：

- 表单错误：字段内联显示。
- 权限错误：Forbidden page。
- 冲突错误：局部 action alert + refresh。
- 系统错误：toast + request id。
- 可忽略错误：只在控制台/日志记录，不打扰用户。

### 11.3 UI 还只是骨架

当前 UI 仍是工程骨架，不是成熟 B2B 产品视觉。要变成熟，需要：

- icon library，例如 `lucide-react`
- sidebar/topbar 视觉体系
- table density 和 empty/loading states
- consistent spacing scale
- button variants
- toast system
- modal/dialog system
- form validation presentation

### 11.4 Platform admin 字段不确定

前端支持：

```ts
isPlatformAdmin
is_platform_admin
```

但后端 `MeResponse` 当前是否返回，需要确认。若不返回，platform admin nav 不会出现。

### 11.5 Query invalidation 可以更精细

tenant 切换目前 invalidate 全部 query。简单但粗。后续可只清 tenant-scoped keys，保留 `/me`。

### 11.6 Frontend route hiding 不是权限控制

即使 UI 隐藏了按钮，用户仍可手动请求 API。后端必须继续做 RBAC。

## 12. 建议阅读顺序

如果你想系统读这份代码，建议按这个顺序：

1. `src/auth/config.ts`
2. `src/auth/AuthContext.tsx`
3. `src/auth/oidc.ts`
4. `src/components/RequireAuth.tsx`
5. `src/components/AuthRedirect.tsx`
6. `src/pages/AuthCallbackPage.tsx`
7. `src/api/client.ts`
8. `src/api/me.ts`
9. `src/hooks/useCurrentTenant.ts`
10. `src/auth/authorization.ts`
11. `src/router.tsx`
12. `src/components/Layout.tsx`
13. `src/queryKeys.ts`
14. `src/pages/DashboardPage.tsx`
15. `src/pages/TicketsPage.tsx`
16. `src/pages/TicketDetailPage.tsx`

读完这些，再看具体业务页会轻松很多。

## 13. 下一步最值得做的事

我建议后续优先级：

1. 引入 token refresh 或 Keycloak JS adapter。
2. 重做错误展示策略，不要到处直接显示 backend error。
3. 加 toast/dialog 体系。
4. 引入 icon library，重做 AppShell 视觉。
5. 把 `tenantsQuery` 兼容别名删除，统一使用 `meQuery/profile/tenants`。
6. 给复杂表单补校验。
7. 给关键 flows 写 Playwright smoke tests。
