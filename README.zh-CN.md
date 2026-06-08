# DynamoDB 实践指南

> 📖 [English Version (英文版)](README.md)

一个以实践为主的 DynamoDB 学习项目。每个模块先讲解概念，然后通过可运行的 TypeScript 练习让你动手实践。

## 快速开始

**方案 A — 真实 AWS DynamoDB（推荐，支持完整功能）：**

```bash
# 1. 安装依赖
npm install

# 2. 配置 .env（不设置 DDB_ENDPOINT = 云端模式）
#    凭证自动从 ~/.aws/credentials 或环境变量中读取
cp .env.example .env
#    编辑 .env：注释掉 DDB_ENDPOINT、AWS_ACCESS_KEY_ID、AWS_SECRET_ACCESS_KEY

# 3. 创建表并填充示例数据（写入你的 AWS 账户）
npm run setup
npm run seed

# 4. 运行第一个练习！
npm run exercise:crud
```

**方案 B — 本地模拟器（无需 AWS 账户）：**

```bash
# 1. 安装依赖
npm install

# 2. 在新终端中启动本地 DynamoDB 模拟器
npm run db:start

# 3. 创建表并填充示例数据
npm run setup
npm run seed

# 4. 运行第一个练习！
npm run exercise:crud
```

## 学习路径

每个模块遵循 **概念 → 实践** 的模式：
1. 阅读模块的 `concept.md` 文件
2. 运行 `exercise.ts` 脚本进行练习
3. 阅读源代码理解每个操作的实现
4. 修改练习文件进行实验

| 模块 | 命令 | 你将学到 |
|--------|---------|-------------------|
| **01 CRUD** | `npm run exercise:crud` | PutItem、GetItem、UpdateItem、DeleteItem、数据类型、条件表达式、返回值、消耗容量 |
| **02 查询** | `npm run exercise:queries` | Query vs Scan、KeyConditionExpression、FilterExpression、分页、复合键 |
| **03 索引** | `npm run exercise:indexes` | LSI、GSI、稀疏索引、投影类型、索引设计决策、GSI vs Scan 成本对比 |
| **04 单表设计** | `npm run exercise:single-table` | 键重载、实体区分、邻接表、GSI 重载、基于访问模式的设计 |
| **05 高级特性** | `npm run exercise:advanced` | 事务、批量操作、TTL、乐观锁、条件写入、原子计数器 |
| **06 流** | `npm run exercise:streams` | 流启用、分片迭代、INSERT/MODIFY/REMOVE 事件、Lambda 触发器、事件源映射 |
| **07 容量** | `npm run exercise:capacity` | RCU/WCU、预置 vs 按需、成本估算、盈亏平衡分析、监控 |
| **08 生产特性** | `npm run exercise:production` | 全局表、PITR、按需备份、DAX、成本对比 |

## 项目结构

```
src/
├── config/          # Zod 验证的环境变量、DynamoDB 客户端工厂
├── shared/          # 类型、错误、日志、验证器
├── 01-crud/         # Books 表的基础 CRUD
├── 02-queries/      # Orders 表的查询与扫描
├── 03-indexes/      # Orders 表的 LSI/GSI
├── 04-single-table/ # 单表电商设计
├── 05-advanced/     # 事务、TTL、流、计数器
├── 06-streams/      # 流与 Lambda 触发器
├── 07-capacity/     # RCU/WCU、预置 vs 按需、成本估算
└── 08-production/   # 全局表、PITR、备份、DAX

test/                # Vitest 测试（镜像 src/ 结构）
scripts/             # 表创建、删除、填充数据、数据库启动器
```

## 前置条件

- **Node.js 18+** — 运行环境
- **方案 A（云端）：** 拥有 DynamoDB 访问权限的 AWS 账户（免费套餐包含 25 GB 存储 + 25 RCU/WCU）
- **方案 B（本地）：** 无需 Docker 或 AWS 账户 — 只需要 Node.js

## 数据管理

```bash
npm run reset       # 清空所有数据、重建表、重新填充（teardown + setup + seed）
npm run db:scan     # 交互式表浏览器（选择表、分页、格式化输出）
npm run db:describe # 显示表结构、键、索引、条目数量、大小
npm run teardown    # 删除所有练习表
npm run setup       # 创建表（可安全重复运行 — 已存在的表会跳过）
npm run seed        # 填充新的示例数据
```

**逐步模式：** 在任意练习命令后添加 `--step` 可在每个操作之间暂停：
```bash
npx tsx src/01-crud/exercise.ts --step
```
在另一个终端中运行 `npm run db:scan` 可在步骤之间查看数据库状态。

## 可用命令

| 命令 | 描述 |
|---------|-------------|
| `npm run db:start` | 启动本地 DynamoDB 模拟器（dynalite） |
| `npm run db:docker` | 替代方案：通过 Docker 启动 DDB Local |
| `npm run reset` | 清空所有数据、重建表、重新填充 |
| `npm run setup` | 创建所有练习表 |
| `npm run seed` | 用示例数据填充表 |
| `npm run teardown` | 删除所有练习表 |
| `npm run db:scan` | 交互式表浏览器（选择表、分页、格式化） |
| `npm run db:describe` | 显示表结构、键、索引、条目数量、大小 |
| `npm run exercise:crud` | 运行模块 01 练习 |
| `npm run exercise:queries` | 运行模块 02 练习 |
| `npm run exercise:indexes` | 运行模块 03 练习 |
| `npm run exercise:single-table` | 运行模块 04 练习 |
| `npm run exercise:advanced` | 运行模块 05 练习 |
| `npm run exercise:streams` | 运行模块 06 练习（需要真实 AWS） |
| `npm run exercise:capacity` | 运行模块 07 练习 |
| `npm run exercise:production` | 运行模块 08 练习 |
| `npm test` | 运行所有测试 |
| `npm run test:watch` | 监听模式运行测试 |
| `npm run test:coverage` | 运行带覆盖率报告的测试 |
| `npm run typecheck` | TypeScript 类型检查 |

## 配置

### AWS 云端（默认）

当 `.env` 中**未设置** `DDB_ENDPOINT` 时，SDK 连接到真实的 AWS DynamoDB。凭证通过标准 AWS 链解析：

1. `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` 环境变量
2. `~/.aws/credentials` 配置文件（`aws configure`）
3. IAM 角色（EC2、ECS、Lambda）

```bash
# .env — 云端模式（无 endpoint = 真实 AWS）
AWS_REGION=eu-west-2
DDB_TABLE_PREFIX=playground_
```

### 本地模拟器

默认模拟器是 **dynalite**，一个纯 Node.js 的 DynamoDB 兼容服务器，启动即时，避免了 Windows 上的 JVM/Docker 问题。

```bash
# .env — 本地模式
DDB_ENDPOINT=http://127.0.0.1:8000
AWS_REGION=eu-west-2
AWS_ACCESS_KEY_ID=local
AWS_SECRET_ACCESS_KEY=local
DDB_TABLE_PREFIX=playground_
```

**本地完全支持：** CRUD、Query、Scan、GSI、LSI、批量操作、条件写入、原子计数器
**需要真实 AWS：** 事务、流、TTL 自动过期

要使用功能更完整的基于 Java 的 DynamoDB Local：
```bash
npm run db:docker    # 需要 Docker
```

## 设计决策

- **客户端工厂，而非单例** — 每个模块创建自己的 DynamoDB 客户端，使测试可隔离
- **Zod 验证** — 所有用户输入在模块边界处验证
- **不可变性** — 函数返回新对象，永不修改原对象
- **零框架** — 仅使用 AWS SDK v3、Zod 和 dotenv。无 Express、无 ORM、无 CLI 框架
- **代码即文档** — 练习脚本逐步讲解每个概念

## 测试

测试使用 Vitest 配合本地模拟器。每个测试文件创建自己唯一命名的表以实现隔离。

```bash
# 运行所有测试
npm test

# 运行特定模块的测试
npx vitest run test/01-crud/

# 运行带覆盖率的测试（目标：50%+）
npm run test:coverage
```
