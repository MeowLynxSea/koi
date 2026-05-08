/**
 * WebFetchTool — 预批准域名列表与域名检查
 *
 * 抽离为独立模块，避免 check-permissions.ts 与 webfetch.ts 之间的循环依赖。
 */

/** 危险/本地域名黑名单 */
export const DANGEROUS_DOMAINS: string[] = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "[::]",
];

/** 预批准技术文档域名（127+ 条） */
export const PREAPPROVED_DOMAINS: string[] = [
  /* Python */
  "docs.python.org",
  "python.org",
  /* MDN / Web 标准 */
  "developer.mozilla.org",
  "mdn.dev",
  /* TypeScript / JavaScript 运行时 */
  "typescriptlang.org",
  "nodejs.org",
  "npmjs.com",
  "deno.land",
  "bun.sh",
  /* React 生态 */
  "react.dev",
  "reactjs.org",
  "nextjs.org",
  "remix.run",
  /* Vue / Angular / Svelte */
  "vuejs.org",
  "nuxt.com",
  "angular.io",
  "angular.cn",
  "svelte.dev",
  "solidjs.com",
  /* Go */
  "go.dev",
  "golang.org",
  "golang.google.cn",
  "pkg.go.dev",
  /* Rust */
  "doc.rust-lang.org",
  "rust-lang.org",
  "docs.rs",
  "crates.io",
  /* Java / JVM */
  "docs.oracle.com",
  "spring.io",
  "docs.spring.io",
  "kotlinlang.org",
  "docs.kotlinlang.org",
  /* .NET */
  "learn.microsoft.com",
  "dotnet.microsoft.com",
  "asp.net",
  /* Swift / Apple */
  "developer.apple.com",
  "swift.org",
  /* 云平台 */
  "docs.aws.amazon.com",
  "aws.amazon.com",
  "cloud.google.com",
  "developers.google.com",
  "firebase.google.com",
  "azure.microsoft.com",
  "docs.digitalocean.com",
  /* 数据库 */
  "postgresql.org",
  "docs.postgresql.org",
  "mysql.com",
  "dev.mysql.com",
  "mongodb.com",
  "docs.mongodb.com",
  "redis.io",
  "redis.com",
  "sqlite.org",
  "www.sqlite.org",
  "neo4j.com",
  "prisma.io",
  "orm.drizzle.team",
  "cassandra.apache.org",
  "influxdata.com",
  /* ML / AI / Data Science */
  "pytorch.org",
  "tensorflow.org",
  "keras.io",
  "huggingface.co",
  "scikit-learn.org",
  "scipy.org",
  "numpy.org",
  "pandas.pydata.org",
  "matplotlib.org",
  "jupyter.org",
  "openai.com",
  "platform.openai.com",
  "docs.anthropic.com",
  "langchain.com",
  "python.langchain.com",
  "docs.llamaindex.ai",
  "mlflow.org",
  /* 容器 / DevOps */
  "docker.com",
  "docs.docker.com",
  "kubernetes.io",
  "helm.sh",
  "terraform.io",
  "ansible.com",
  "prometheus.io",
  "grafana.com",
  "grafana.org",
  "nginx.org",
  "nginx.com",
  "traefik.io",
  /* Git 托管 / CI */
  "github.com",
  "docs.github.com",
  "gitlab.com",
  "about.gitlab.com",
  "bitbucket.org",
  /* 包管理 / Registry */
  "pypi.org",
  "packagist.org",
  "rubygems.org",
  "nuget.org",
  "mvnrepository.com",
  /* 前端 / UI */
  "tailwindcss.com",
  "ui.shadcn.com",
  "radix-ui.com",
  "mui.com",
  "vuetifyjs.com",
  "ant.design",
  "element-plus.org",
  "storybook.js.org",
  "figma.com",
  "developers.figma.com",
  /* 构建工具 */
  "vitejs.dev",
  "webpack.js.org",
  "rollupjs.org",
  "esbuild.github.io",
  "swc.rs",
  /* 测试 */
  "jestjs.io",
  "vitest.dev",
  "cypress.io",
  "playwright.dev",
  /* Lint / Format */
  "eslint.org",
  "prettier.io",
  /* 后端框架 */
  "expressjs.com",
  "fastify.dev",
  "nestjs.com",
  "docs.djangoproject.com",
  "flask.palletsprojects.com",
  "fastapi.tiangolo.com",
  "pydantic.dev",
  "sqlalchemy.org",
  "laravel.com",
  "rubyonrails.org",
  "guides.rubyonrails.org",
  /* 通信 / 消息队列 */
  "kafka.apache.org",
  "rabbitmq.com",
  "docs.confluent.io",
  "nats.io",
  /* 搜索 / 大数据 */
  "elastic.co",
  "opensearch.org",
  "spark.apache.org",
  /* 文档 / 社区 */
  "stackoverflow.com",
  "stackexchange.com",
  "wikipedia.org",
  "dev.to",
  "medium.com",
  "github.io",
  "gitlab.io",
  /* API / 协议 */
  "graphql.org",
  "json-schema.org",
  "openapi.org",
  "swagger.io",
  "postman.com",
  /* 部署 / Serverless */
  "vercel.com",
  "netlify.com",
  "cloudflare.com",
  "workers.cloudflare.com",
  "supabase.com",
  "docs.supabase.com",
  /* 移动开发 */
  "reactnative.dev",
  "expo.dev",
  /* 游戏引擎 */
  "unity.com",
  "docs.unity3d.com",
  "unrealengine.com",
  "godotengine.org",
  /* 安全 / 加密 */
  "owasp.org",
  "letsencrypt.org",
  /* 版本控制 */
  "git-scm.com",
  /* 操作系统 / 内核 */
  "kernel.org",
  "man7.org",
  "freebsd.org",
];

/** 检查主机名是否为本地/IP/危险地址 */
export function isDangerousHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (DANGEROUS_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`))) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (h.startsWith("[") && h.endsWith("]")) return true;
  return false;
}

/** 判断 URL 是否属于预批准域名 */
export function isPreapprovedDomain(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (isDangerousHost(hostname)) return false;
    return PREAPPROVED_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`)
    );
  } catch {
    return false;
  }
}
