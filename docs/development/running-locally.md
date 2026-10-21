---
title: Running Locally
---

# Running Locally

Install Git and **Node.js 24 LTS** (which includes npm) before following the steps below.

Clone the repository, install dependencies, and start the development server:

## Electron (Desktop App)

```bash
git clone https://github.com/piratuks/invoice-builder.git
cd invoice-builder
npm install
npm run dev:desktop
```

## Webserver / Browser

```bash
git clone https://github.com/piratuks/invoice-builder.git
cd invoice-builder
npm install
npm run dev:renderer
npm run dev:webserver
```

`npm run dev:webserver` builds the shared workspaces and migrations, then watches contracts, core, and migration changes while running the webserver.

## Temporary glob dependency override

The root manifest pins `braces` to the third-party `@dieub/braces-depth-guard@3.0.3-pn.3`
backport via an npm alias. This mitigates
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) while no patched
official release is available. It is not maintained by the original `braces` authors.
The backport rejects nesting deeper than 100 groups and caps pattern length at 10,000
characters; ordinary glob patterns retain the existing API.

Compatibility and depth-limit checks are in
`apps/desktop/__tests__/globDependencies.spec.ts`, including file watching. A clean
audit alone does not validate the fork, since its package name differs from `braces`.
Remove the override once a compatible, patched official release is available.
