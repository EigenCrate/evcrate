## [2.10.1](https://github.com/EigenCrate/evcrate/compare/v2.10.0...v2.10.1) (2026-10-07)


### 🐞 Bug Fixes

* **vscode:** map TodoWrite to manage_todo_list ([#20](https://github.com/EigenCrate/evcrate/issues/20)) ([b1e1b31](https://github.com/EigenCrate/evcrate/commit/b1e1b31e268b650f5b5f2a237e1c0afb2b2b40b4))

## [2.10.0](https://github.com/EigenCrate/evcrate/compare/v2.9.1...v2.10.0) (2026-10-07)


### 🚀 Features

* **advisor:** implement deterministic advice activation helper and workflow cutover ([#19](https://github.com/EigenCrate/evcrate/issues/19)) ([deb9344](https://github.com/EigenCrate/evcrate/commit/deb9344b6d1a5f156bc51bff454d9673913ae561))


### 🐞 Bug Fixes

* **ci:** eliminate dynamic require and harden rollout test ([17bb297](https://github.com/EigenCrate/evcrate/commit/17bb297a12aa70c7636c079c51d22e3d6fba0053))

## [2.9.1](https://github.com/EigenCrate/evcrate/compare/v2.9.0...v2.9.1) (2026-10-05)


### ⚡ Performance Improvements

* **build:** optimize build and manifest generation performance with linear URI restoration, worker staging, and incremental caching ([#17](https://github.com/EigenCrate/evcrate/issues/17)) ([aba4265](https://github.com/EigenCrate/evcrate/commit/aba4265a502d02dba45251080de2a824662332e6))

## [2.9.0](https://github.com/EigenCrate/evcrate/compare/v2.8.0...v2.9.0) (2026-10-05)


### 🚀 Features

* **snyk-expert:** add zero-dependency npm and npx package installer ([bcb7ddd](https://github.com/EigenCrate/evcrate/commit/bcb7ddd8a97cb788142c522f84c9344a183873d9))

## [2.8.0](https://github.com/EigenCrate/evcrate/compare/v2.7.0...v2.8.0) (2026-10-04)


### 🚀 Features

* **advisor:** migrate to explicit Node launch and cross-platform runtime qualification ([#16](https://github.com/EigenCrate/evcrate/issues/16)) ([5d54a98](https://github.com/EigenCrate/evcrate/commit/5d54a98995ece22283a2365d52d4dc1671ff5dcd))

## [2.7.0](https://github.com/EigenCrate/evcrate/compare/v2.6.0...v2.7.0) (2026-10-04)


### 🚀 Features

* **vscode:** add opt-in settings.json registration flow to publish ([7110a67](https://github.com/EigenCrate/evcrate/commit/7110a676c439ce4b139a995ec08bf147b2dd2863))
* **vscode:** complete native target implementation, projections, hooks, lifecycle, and qualification ([768fbb5](https://github.com/EigenCrate/evcrate/commit/768fbb5e9bd91f5a3b301c63bd02b47785c8e94c))
* **vscode:** publication and activation ([efd84ee](https://github.com/EigenCrate/evcrate/commit/efd84ee68fda6e3266a4300c82bb7c52c718dc9e))
* **vscode:** real native local qualification ([f43d89b](https://github.com/EigenCrate/evcrate/commit/f43d89b2d6b9d5873aaf427ee306975deedece43))


### 🐞 Bug Fixes

* **advisor:** repair advice-mode caller lifecycle ([68e3d85](https://github.com/EigenCrate/evcrate/commit/68e3d853c1b6a0896f15921772edbf085e8226fe))
* **plugin:** gracefully handle EACCES and EPERM in inspectStat ([6d03d7d](https://github.com/EigenCrate/evcrate/commit/6d03d7d7354250da11d0d750aab3e21d36e66eed))
* **vscode:** resolve PR review findings for plugin format, hooks path, and security contracts ([6bec0d2](https://github.com/EigenCrate/evcrate/commit/6bec0d261389f48051c4cf21a0c5d3adb0753bb2))
* **workflows:** reconcile phase progress, preserve sealed evidence ([fb3be6e](https://github.com/EigenCrate/evcrate/commit/fb3be6e7b1cbe106457359d52969b829b54547c0))


### 📚 Documentation

* **advisor:** add root identity generation guide and host configuration ([2adcce2](https://github.com/EigenCrate/evcrate/commit/2adcce261da68b6d92d55811f8017cdad173c8d7))
* **vscode:** documentation, controlled rollout, and lifecycle governance ([0930f80](https://github.com/EigenCrate/evcrate/commit/0930f8004505cd5692cb2e8d3ac7f274bf05365b))


### ♻️ Code Refactoring

* **advisor:** retire dam-hopper plugin integration and release assets ([c395305](https://github.com/EigenCrate/evcrate/commit/c39530514aea6a280389d5b9abd76ebf268c7f97))

## Unreleased


### Bug Fixes

* **adapters:** restore linear regex callback literal URL replacement for Codex transforms and register extracted URI restoration helper in all seven translated target hash closures.
* **benchmarks:** label build generation memory metric accurately as post-build parent process RSS.
* **build:** inventory the full imported emit closure, preserve ownership receipts across clean builds, share ordinary prebuild prerequisites, refuse unsafe ancestor traversal, retain receipts on cleanup failure, honor CLI output overrides, and leave emitting-build ownership unchanged for `--noEmit`.
* **distribution:** include consumed .gitignore bytes in snapshot freshness identity, reject unsafe path entries before ignore filtering, exclude heavy artifact directories during snapshot traversal, validate compiled runtime revisions across serial and parallel worker execution, and execute freshness verification under promotion lock before journal recording.
* **manifests:** regenerate target and aggregate identities from reproducible tracked inputs, without an accidental empty Codex patch directory.


### Documentation

* **standards:** document compiler emit closure, receipt partitioning, snapshot traversal safety, runtime revision binding, promotion lock freshness, and post-build parent RSS benchmark metrics.


### ♻️ Chores & Refactoring

* **advisor:** retire Dam-Hopper plugin runtime, worker, and distribution artifacts in favor of native Dam-Hopper in-process Advisor integration; preserve standalone viewer components and core CLI controller.

## [2.6.0](https://github.com/EigenCrate/evcrate/compare/v2.5.0...v2.6.0) (2026-10-01)


### 🚀 Features

* **advisor:** strengthen canonical mentor brief ([1919f99](https://github.com/EigenCrate/evcrate/commit/1919f99e850d99e89266a8e4c8924c297cfe3ef4))


### 📚 Documentation

* **readme:** remove informal Windows status notes from header ([c504611](https://github.com/EigenCrate/evcrate/commit/c5046114af5e18384f7edc1f5b06d60b1cb99f45))
* synchronize documentation and README ([ac4303d](https://github.com/EigenCrate/evcrate/commit/ac4303d35a52bc22f6449b318ebe993a32a5d487))

## [2.5.0](https://github.com/EigenCrate/evcrate/compare/v2.4.0...v2.5.0) (2026-09-30)


### 🚀 Features

* **advisor-plugin:** cut over standalone navigation and regenerate package ([dbc3fb7](https://github.com/EigenCrate/evcrate/commit/dbc3fb72bdb3f3cfae50a688985ed8037a25376f))
* **advisor-plugin:** qualify history scope and unmapped-record preservation for Phase 02 ([639b9b6](https://github.com/EigenCrate/evcrate/commit/639b9b64a6d2637dd1432a6ce775caf2653422b5))
* **advisor:** freeze Phase 00 contracts and add workspace panel fixtures ([858604d](https://github.com/EigenCrate/evcrate/commit/858604dbf5d2859c961a95d9ccea4725df253fd9))
* **advisor:** implement bridge extension, port provider, and reusable host docs ([2eb229c](https://github.com/EigenCrate/evcrate/commit/2eb229c73d82e98e9384d6b40db73b0718f65847))
* **viewer:** implement activity scope, epoch fencing, and manual request state ([8eeec3d](https://github.com/EigenCrate/evcrate/commit/8eeec3d487f1a7e6d343c32d819ae2f56c626aec))
* **viewer:** implement compact activity views, responsive cards, and accessible tabs ([3ae4315](https://github.com/EigenCrate/evcrate/commit/3ae431515c5a32a6528733e0d11b51373ece51ac))
* **viewer:** implement configuration and evaluations disclosures (Phase 07) ([ddb893e](https://github.com/EigenCrate/evcrate/commit/ddb893eec2e0e291a737c5bf8ac4bb337d88f47f))


### 🐞 Bug Fixes

* **viewer:** guard refreshHistory against unavailable history scope and non-root All scope ([c16848c](https://github.com/EigenCrate/evcrate/commit/c16848c4aafe9e62f565b0ef9fec397d17355d7f))


### 📚 Documentation

* **advisor:** paired qualification, documentation, and release handoff (Phase 09) ([ac07ba3](https://github.com/EigenCrate/evcrate/commit/ac07ba357432306feb9879f2a7ae9a47f3c8dee9))
* **advisor:** update architecture, roadmap, and host contract for Phase 01 ([335635f](https://github.com/EigenCrate/evcrate/commit/335635fb5ec1df7345cd7a1edd3e26fc0228ac72))


### ✅ Tests

* **viewer:** add test for unavailable-All and unavailable historyScope refresh gating ([6c98fed](https://github.com/EigenCrate/evcrate/commit/6c98fedccfc5c906296a49a974acf436bc0f4486))

## [2.4.0](https://github.com/EigenCrate/evcrate/compare/v2.3.2...v2.4.0) (2026-09-28)


### 🚀 Features

* **advisor:** add native Windows invocation guidance and closure checks ([d44fbae](https://github.com/EigenCrate/evcrate/commit/d44fbae9a0ef8f145cfb3492921448935eba1583))
* **advisor:** complete native Windows controller lifecycle ([9650e3c](https://github.com/EigenCrate/evcrate/commit/9650e3c4f59d0ba51418d8a677b822442eddaac4))
* **advisor:** repair Windows Job supervision and console observation ([40aad07](https://github.com/EigenCrate/evcrate/commit/40aad07c850657b1c78f075ef8f0809472b71dbd))
* **release:** attach advisor plugin to workflow release assets ([c1104be](https://github.com/EigenCrate/evcrate/commit/c1104beb12aff7b1c17fa43a4dd725ad4bd81159))


### 🐞 Bug Fixes

* **advisor:** increase preflight probe output limit to 5 MiB ([2549a88](https://github.com/EigenCrate/evcrate/commit/2549a88adf68764f95f239f3b7efbda325f69569))
* **advisor:** restore Windows advisor storage and cleanup safety ([2df3058](https://github.com/EigenCrate/evcrate/commit/2df3058f8091e78ef2c5b4c38e933f2c539bf9df))
* **advisor:** restore Windows provider launch identity and canonical environment ([4d655a3](https://github.com/EigenCrate/evcrate/commit/4d655a38f47e82f17b8ed6e83a352d76e147777a))
* **docs:** improve docs validator search scope and failure classification ([ff20667](https://github.com/EigenCrate/evcrate/commit/ff20667a2648df4c6c7046188330e80a41fe585b))
* **filesystem:** complete durable cutover and qualification ([d25e739](https://github.com/EigenCrate/evcrate/commit/d25e73954dcc47e06b1408a70abdf5d46ef1ca63))
* **filesystem:** complete launchability and identity cutover ([35f54b5](https://github.com/EigenCrate/evcrate/commit/35f54b562b49760b6cafd7a8e161ffdee80dca91))
* **release:** add defensive tag ancestry and progression validation ([7eb49e8](https://github.com/EigenCrate/evcrate/commit/7eb49e8c92a8a54a7add0d9d2a1b75e5f48564bc))
* **release:** compare computed version against starting package.json version ([4f0f4bb](https://github.com/EigenCrate/evcrate/commit/4f0f4bb01a61b8836e2e000e164dc934bcb77147))
* **scripts:** optimize validate-docs and docs-manager with ripgrep ([bce08bb](https://github.com/EigenCrate/evcrate/commit/bce08bbc7684a840f7342f2a6e0af1017b48fda9))


### 📚 Documentation

* record Phase 01 native Windows primitives feasibility completion ([dd10ea6](https://github.com/EigenCrate/evcrate/commit/dd10ea6a7c1a1c01d9b567dc8f9f2dfa3e4c7c3c))


### ✅ Tests

* **advisor:** complete repair verification and readiness tests ([2eded71](https://github.com/EigenCrate/evcrate/commit/2eded710102a604131805f82bcc55af367e156c0))
* **advisor:** qualify Windows support and protect Linux controller lifecycle ([8abbaac](https://github.com/EigenCrate/evcrate/commit/8abbaac9ae424f33a98947e98c3994a01cb9d118))
* **docs:** add integration tests for grep fallback, encoding, and path boundaries ([3d2cd4e](https://github.com/EigenCrate/evcrate/commit/3d2cd4ef9dfec635a2e7080e0bfb960fe1f881e7))

## [2.3.2](https://github.com/EigenCrate/evcrate/compare/v2.3.1...v2.3.2) (2026-09-26)


### 🐞 Bug Fixes

* **plugin:** permit non-root workspace targets when running under unprivileged service runner ([d2dcc6c](https://github.com/EigenCrate/evcrate/commit/d2dcc6cb2c6db8378abb95dec97132b791f8c499))
* **plugin:** resolve history root and advisor policy paths under service runner ([90a5eaf](https://github.com/EigenCrate/evcrate/commit/90a5eafdd73b99fd148e0365e84c7c8e7dc976e9))

## [2.3.1](https://github.com/EigenCrate/evcrate/compare/v2.3.0...v2.3.1) (2026-09-26)


### 🐞 Bug Fixes

* **ci:** support cross-platform npm execution in Windows smoke and release scripts ([ffa8280](https://github.com/EigenCrate/evcrate/commit/ffa8280b4092adf1e235152ffe11677f2d8a90d6))

## [2.3.0](https://github.com/EigenCrate/evcrate/compare/v2.2.0...v2.3.0) (2026-09-25)


### 🚀 Features

* **advisor-plugin:** implement domain contracts and parity qualification ([3cdcba1](https://github.com/EigenCrate/evcrate/commit/3cdcba1e08bcac42f748f00737e76d5f74efe46f))
* **advisor-plugin:** implement embedded provider-neutral four-view UI ([f098f8b](https://github.com/EigenCrate/evcrate/commit/f098f8bd92f1cd47b1b7e4c03f6dff96c0adcc24))
* **advisor-plugin:** implement owner-safe read provider ([a7bf719](https://github.com/EigenCrate/evcrate/commit/a7bf719d1cccc1dd5555c29953f23534880c6cec))
* **advisor-plugin:** pin D00 companion candidate @dam-hopper/plugin-sdk@0.1.0 in contract manifest ([6a90685](https://github.com/EigenCrate/evcrate/commit/6a90685d6503f20dbb74798c39cdc8c6f65c0e0b))
* **advisor:** implement checkpoint digest, metrics kernel, and generated CJS adapters ([89bf1a1](https://github.com/EigenCrate/evcrate/commit/89bf1a14e9583a2f1a2a472895cf835414ddd0d8))
* **advisor:** implement counsel evaluation protocol and fixtures ([6d82482](https://github.com/EigenCrate/evcrate/commit/6d82482139f8b51703d0fdbc4e4bfd91f20295d9))
* **advisor:** implement portable advisor contract runtime and fixtures ([6e21a8e](https://github.com/EigenCrate/evcrate/commit/6e21a8ebce12d96557f129d0436938e2352f8d4f))
* **advisor:** integrate history metrics CLI operation and query collector ([5b03810](https://github.com/EigenCrate/evcrate/commit/5b03810871f0f596806d0a7dd7c7890fec6696f0))
* **advisor:** migrate controller closure to 33 files and enforce inventory parity ([b35d02f](https://github.com/EigenCrate/evcrate/commit/b35d02fea42922765724f9d50a1e34fad81272e8))
* **plugin:** add DamHopper embedded bridge ([7308981](https://github.com/EigenCrate/evcrate/commit/73089816b474ec2f36fc4e0c5793afce159c69ae))
* **plugin:** complete paired qualification and release decision ([012c76d](https://github.com/EigenCrate/evcrate/commit/012c76d493dd4498154ad593f06e3d3b072e167c))
* **plugin:** freeze cross-project scope and domain data contract ([e31bb66](https://github.com/EigenCrate/evcrate/commit/e31bb66b85f39a748ef859917c7a9ba35f62b6a9))
* **plugin:** implement framed Node worker candidate for DamHopper platform ([dd50529](https://github.com/EigenCrate/evcrate/commit/dd50529c28df944f761d482952b1ef43ba8d21cb))
* **plugin:** implement owner-safe all-project history worker ([cc0960c](https://github.com/EigenCrate/evcrate/commit/cc0960c0a75efaccca19233c72446295c962466f))
* **plugin:** implement project filter UI and honest identity ([6d5a524](https://github.com/EigenCrate/evcrate/commit/6d5a5244adfd3a042c3399f5b3d84cfa0ef7e1a3))
* **plugin:** qualify gate with independent package and lifecycle integration ([9a1b5db](https://github.com/EigenCrate/evcrate/commit/9a1b5dbb8411ce546958deafca6a8dff30472371))
* **viewer:** auto-discover and compare evaluation documents in advisor plugin ([a975681](https://github.com/EigenCrate/evcrate/commit/a975681939e0212ea3c0fc679005296f58242ad5))
* **viewer:** implement browser history traversal and scanner ([1999f04](https://github.com/EigenCrate/evcrate/commit/1999f04bc217cde3748d7ad681f70c3568129249))
* **viewer:** implement React explorer and view architecture ([63d00ec](https://github.com/EigenCrate/evcrate/commit/63d00ece95318238dfaf2c09215278fe74ddc093))
* **viewer:** package static explorer with strict CSP and release inventory isolation ([e216a14](https://github.com/EigenCrate/evcrate/commit/e216a14b9dbac8b73ca6b37c9a7a814d95a0f0fa))


### 🐞 Bug Fixes

* **plugin:** add authorized backend path resolver for worker package ([e2ecb10](https://github.com/EigenCrate/evcrate/commit/e2ecb1086b1829516328e0136ef7a7491c424c93))


### 📚 Documentation

* **advisor:** documentation cutover and support for advisor metrics explorer ([d4f4e2a](https://github.com/EigenCrate/evcrate/commit/d4f4e2a9949c3e2d418ef3a0332b3129be70bc8d))
* **auth:** record completion and production auth architecture ([7cbc816](https://github.com/EigenCrate/evcrate/commit/7cbc816ff4fbba03d2fd67b04258852d4d519d82))
* **plugins:** record completion and owner-root authorization architecture ([1bb37d1](https://github.com/EigenCrate/evcrate/commit/1bb37d1e8a5916c990a6845985fb777484eb663b))

## [2.2.0](https://github.com/EigenCrate/evcrate/compare/v2.1.0...v2.2.0) (2026-09-16)


### 🚀 Features

* **windows:** implement Windows release qualification, installer lifecycle support, and publication fixes ([fb13ad8](https://github.com/EigenCrate/evcrate/commit/fb13ad895a0f49816b271ae5bab29a782982f60a))

## [2.1.0](https://github.com/EigenCrate/evcrate/compare/v2.0.1...v2.1.0) (2026-09-13)


### 🚀 Features

* **distribution:** add manifest project descriptors and canonical identity ([b027e25](https://github.com/EigenCrate/evcrate/commit/b027e2523f3b9679f525b8d5760abad7b18ea9d3))
* **distribution:** add scoped publication state recovery ([0e409ea](https://github.com/EigenCrate/evcrate/commit/0e409ea579784f03d99e09f87e836ee1bd27aebf))
* **distribution:** add shared publication planning ([a5f9463](https://github.com/EigenCrate/evcrate/commit/a5f94639794fb346a49b3f0da74673cce023167e))
* **distribution:** freeze scoped publication contracts ([2de9520](https://github.com/EigenCrate/evcrate/commit/2de9520162e715bd72275f58dd28db75613cf055))
* **distribution:** generalize scoped publication transactions ([82e56a4](https://github.com/EigenCrate/evcrate/commit/82e56a4226d1609dd921c737836fe1c10c9dbd1d))


### 🐞 Bug Fixes

* **advisor:** relax non-private directory mode and ownership checks for non-POSIX mounts ([bcf65ca](https://github.com/EigenCrate/evcrate/commit/bcf65ca8a10f29e2d3ff9cd63a008028d9ed3556))
* **advisor:** remove file and directory mode checks across controller modules ([8e9c97c](https://github.com/EigenCrate/evcrate/commit/8e9c97c856892c9828704693bc40de5754d18d9d))
* **distribution:** close runtime publication scope ([c7ab2b7](https://github.com/EigenCrate/evcrate/commit/c7ab2b7cf01a06ac5e15faa7209485b59b627e68))
* **publication:** auto-create missing homeRoot on publish apply and clean submodule gitlink ([ce0b235](https://github.com/EigenCrate/evcrate/commit/ce0b2352500022aa6d7f3a6c2044d117d9cd115e))


### 📚 Documentation

* **distribution:** post-verification operator and architecture documentation ([15df486](https://github.com/EigenCrate/evcrate/commit/15df4867aadf428a82633fbc602033e4279f00fa))

## [Unreleased]

### 🚀 Features

* **distribution:** generalize journaled publication across HOME and project scopes with complete preflight, ordered locks, durable workspace identity, fsync/marker recovery, per-source mode provenance, and bounded retention.
* **distribution:** separate schema-2 shared-controller and HOME-harness state; migrate and recover valid schema-1 state under the HOME lock; isolate HOME/project recovery; report project partials with project-only rollback and durable `ROLLBACK_FAILED` journals; fail closed on ambiguous ownership, identity, workspace, volume, and cleanup state.

## [2.0.1](https://github.com/EigenCrate/evcrate/compare/v2.0.0...v2.0.1) (2026-09-11)


### 🐞 Bug Fixes

* **advisor:** resolve V2 evidence files schema and diagnostics ([cb435e4](https://github.com/EigenCrate/evcrate/commit/cb435e4ccda5d7db98ea9c70ecc9062a8dd5847e))


### 📚 Documentation

* update documentation and README for v2.0.0 release ([0dddbd9](https://github.com/EigenCrate/evcrate/commit/0dddbd9429b2fa74d49cc904e7665ef62ed257a7))

## [2.0.0](https://github.com/EigenCrate/evcrate/compare/v1.0.0...v2.0.0) (2026-09-09)


### ⚠ BREAKING CHANGES

* **distribution:** Python migration engine and parity suites retired; distribution requires pure TypeScript runtime. Filesystem permission bitmasks removed per Option A.

### 🚀 Features

* **advisor:** deliver canonical mentoring brief and structured advice body ([9839484](https://github.com/EigenCrate/evcrate/commit/9839484b3d2ce53c84c4c93c03a3bb74015341ea))
* **advisor:** freeze v2 contracts and safe policy migration ([a5da28d](https://github.com/EigenCrate/evcrate/commit/a5da28dd554b1b83439b4dce9e5f571c8a83a5e3))
* **advisor:** implement cooperative mentoring and harness integration ([aa17d5b](https://github.com/EigenCrate/evcrate/commit/aa17d5b6f86a7eac9a050a7b31ac9853cad519ba))
* **advisor:** implement durable task state and correction gates ([b762447](https://github.com/EigenCrate/evcrate/commit/b762447835b50720d7d618b2d1c193f6d402270d))
* **advisor:** implement end-to-end acceptance and improvement evaluation baseline ([1b98006](https://github.com/EigenCrate/evcrate/commit/1b98006ce521ffeec44965c7830792cadaf536b4))
* **advisor:** implement indefinite wait, cancellation dominance, and verified cleanup ([84c110e](https://github.com/EigenCrate/evcrate/commit/84c110e4c2841093b9ce3dfc4dc1834d7689c3ea))
* **advisor:** implement primary retry and backup orchestration ([27b361a](https://github.com/EigenCrate/evcrate/commit/27b361a15262f747c39169c20fe18f3c5b097220))
* **advisor:** implement sanitized audit history, outcomes, and review tools ([5f1bb87](https://github.com/EigenCrate/evcrate/commit/5f1bb8718cc50fdb6412a2f92ec704eb4b0820aa))
* **advisor:** qualify adapters, enforce strict terminal parsing, and adapt generation limits ([8b6084a](https://github.com/EigenCrate/evcrate/commit/8b6084afb08ef93f4688b488b9a00069eda1da69))
* **catalogs:** finalize regeneration, documentation, and release gates ([b5d1345](https://github.com/EigenCrate/evcrate/commit/b5d1345a36326e0ff025b9c6d98e7d2c914d0907))
* **catalogs:** freeze catalog schema, add source identity, and enforce freshness checks ([73f5b51](https://github.com/EigenCrate/evcrate/commit/73f5b510b5c406b91cd3cd988c557505de3f5b8b))
* **catalogs:** implement seven-target scanner and catalog adapters ([30b22f7](https://github.com/EigenCrate/evcrate/commit/30b22f772e4b6d23c59ece6ca88324f2ecd9b5fa))
* **catalogs:** normalize canonical metadata and implement strict scanner core ([92abcfe](https://github.com/EigenCrate/evcrate/commit/92abcfe9434e5e4fa6e2b75ae6a77d1c0797db6d))
* **distribution:** cutover to pure TypeScript distribution and remove python parity ([8d41394](https://github.com/EigenCrate/evcrate/commit/8d413945e20d6f68bf78a94ba84041aa1bc74f82))
* **distribution:** generate projections, synchronize build manifests, and stage coherent cutover ([40db1ab](https://github.com/EigenCrate/evcrate/commit/40db1abd32ab781b991f7bf9aa461e55db03e753))
* **hooks:** finalize verification, signal safety, and target projections ([7fc866b](https://github.com/EigenCrate/evcrate/commit/7fc866b2aa2a6771f54cf2cf969e9eec94a130bb))
* **hooks:** standardize ignore policy, sync target projections, and complete verification ([547b184](https://github.com/EigenCrate/evcrate/commit/547b184ecb5ea1ffae07fd41c0cff56c89cd5354))
* **hooks:** unblock build commands and refine path extraction ([b6830e3](https://github.com/EigenCrate/evcrate/commit/b6830e3ce6b03c11e5ef256006eb575bf75f25d2))


### 🐞 Bug Fixes

* **advisor:** harden clause conjunctions, affirmative stuck directives, and lifecycle status assertions ([fa533f6](https://github.com/EigenCrate/evcrate/commit/fa533f6c9f434552829134cf4877a5733a98eeb8))
* **advisor:** harden V2 envelope validation correspondence and stack pattern guards ([bf9e933](https://github.com/EigenCrate/evcrate/commit/bf9e93364e33fb1a578162cc760d01bf46d31221))


### 📚 Documentation

* **scripts:** update scanner specs and refresh build manifests ([5df3c46](https://github.com/EigenCrate/evcrate/commit/5df3c4690af6c2c92a8f41a67a34cd996758c499))

## 1.0.0 (2026-09-06)


### 🚀 Features

* **adapters:** add TypeScript target projections ([7e52d7a](https://github.com/EigenCrate/evcrate/commit/7e52d7a9450d86edd5e6dde350070c170252b717))
* add accessible web testing demo flow ([07c9d24](https://github.com/EigenCrate/evcrate/commit/07c9d245129d337ea27d66a63ca8941033a14883))
* add base distribution ([c2d0307](https://github.com/EigenCrate/evcrate/commit/c2d0307c663e803c0d1cbedb6ee416ceb6343eb4))
* add resource registry and explicit imports ([734485a](https://github.com/EigenCrate/evcrate/commit/734485a0aae5b7c2e80559360312825572aa50de))
* add web testing release gate demo ([7f5bfd6](https://github.com/EigenCrate/evcrate/commit/7f5bfd6c3c7315e8a691cff8f6c42fc46e03dcc1))
* **advisor:** add canonical advise interview relay ([c52bd06](https://github.com/EigenCrate/evcrate/commit/c52bd0604045de1bd61f42e71ee2d8e2f7982eb1))
* **advisor:** add constrained broker runtime ([3de0c34](https://github.com/EigenCrate/evcrate/commit/3de0c34066018c660d3f7c353eed85343d13bcc2))
* **advisor:** add cross-harness route resolver ([0c02b25](https://github.com/EigenCrate/evcrate/commit/0c02b2547c32bed00959b10eb83647e18f0ad37b))
* **advisor:** add cross-harness routing ([c5b0ca9](https://github.com/EigenCrate/evcrate/commit/c5b0ca9e2d7a1ee9c62ac83a258f6d95053ec741))
* **advisor:** add cross-harness runner harness ([3d560f2](https://github.com/EigenCrate/evcrate/commit/3d560f28f82c3f44d4fb800ef0442c6da27afe04))
* **advisor:** add explicit command mentoring mode ([ded302a](https://github.com/EigenCrate/evcrate/commit/ded302a100321ba01e1ebb7e490c89d6b19bc5ca))
* **advisor:** add Pi routing adapter and native boundary ([d3a69b3](https://github.com/EigenCrate/evcrate/commit/d3a69b35cfe15a812c1580eb05edb7cea0be27bc))
* **advisor:** centralize controller resource control ([aa50608](https://github.com/EigenCrate/evcrate/commit/aa50608679d1cb001166eb4d54cbf219444cc2cc))
* **advisor:** finalize evcrate runtime namespace and migration docs ([4d26ff4](https://github.com/EigenCrate/evcrate/commit/4d26ff457cda4253259605a6d05bcc6fceb3cd51))
* **advisor:** integrate checkpoint routing workflow ([5b5e8a7](https://github.com/EigenCrate/evcrate/commit/5b5e8a7ee7d868d839218bd6f5b6396c872a12d2))
* **advisor:** replace advisor mode with advice checkpoints ([dde7be7](https://github.com/EigenCrate/evcrate/commit/dde7be7e15b7c390b85d73f3490c0fc6cf8a986f))
* **advisor:** roll out generated command mode ([b2f4a2c](https://github.com/EigenCrate/evcrate/commit/b2f4a2c8f135b32196d637cf5c095878c6305eb3))
* **agent:** initialize gemini cli core ([6ba782c](https://github.com/EigenCrate/evcrate/commit/6ba782c3f9b053f8a43f3d8cebd4c81a90fe027b))
* **cli:** add TypeScript control-plane foundation ([cf2f04b](https://github.com/EigenCrate/evcrate/commit/cf2f04b0d4a4bf3b8f472218d668d11ae45b1ece))
* **cli:** harden TypeScript control-plane foundation ([66d8a08](https://github.com/EigenCrate/evcrate/commit/66d8a08eeacb5ff738cae36a91184b7d03561f2c))
* **cli:** integrate DamHopper consumer subprocess adapter and cross-repository fixtures ([f432781](https://github.com/EigenCrate/evcrate/commit/f432781287d1b540774393e6293659627301146a))
* **codex:** add MCP package runner and Node hook execution utilities ([b9b9297](https://github.com/EigenCrate/evcrate/commit/b9b9297f19a12e6ba24b49267ffe83dd8553aab4))
* **control-plane:** add protocol contracts ([e74cd45](https://github.com/EigenCrate/evcrate/commit/e74cd45b17e45fac4469b01ce6ee04d947f5badc))
* **control-plane:** add resource scopes and advisor settings CAS ([bdc65e2](https://github.com/EigenCrate/evcrate/commit/bdc65e26d283a57953e384e7e495d4fedd28d96a))
* **copilot:** add Copilot target migration ([e12f802](https://github.com/EigenCrate/evcrate/commit/e12f802b0e847d72cc5581c48cf63ab648307a9e))
* **distribution:** add deterministic staged builds ([295a481](https://github.com/EigenCrate/evcrate/commit/295a4810e979d6ff51190e019570dc4fdacc35c9))
* **distribution:** add native Pi target contract ([1cd51c4](https://github.com/EigenCrate/evcrate/commit/1cd51c4808248d35ac8ca03e626c795d9621c2a9))
* **distribution:** add Pi-only publish command ([eacd80c](https://github.com/EigenCrate/evcrate/commit/eacd80cc28979bea20c8fa420d065fe8ea528529))
* **distribution:** cut over to private registry-free release assets and prove Linux lifecycle ([1e3f194](https://github.com/EigenCrate/evcrate/commit/1e3f1946567d1abd78e6c8541c4f2ab2d2cd1ab9))
* **distribution:** decouple consumer build resolution and complete rollout ([0723610](https://github.com/EigenCrate/evcrate/commit/072361051e552801fa98b96fa5399d503641ed35))
* **distribution:** harden cross-runtime publication safety ([01295fe](https://github.com/EigenCrate/evcrate/commit/01295fee3ca03c1a3a46d778f18dd362f1772c98))
* **distribution:** implement atomic target publication and recovery ([108e9db](https://github.com/EigenCrate/evcrate/commit/108e9db105250557f93012e35729eec954e6754b))
* **distribution:** implement release packaging and per-target cutover ([bfc9388](https://github.com/EigenCrate/evcrate/commit/bfc93889cec2367d4e4af2d26eb10556b9c37865))
* **distribution:** publish Claude config to home ([75db181](https://github.com/EigenCrate/evcrate/commit/75db1811a700d3c1b1d370fc94d5a3905bbb52bf))
* **distribution:** publish verified home artifacts ([4fa85e1](https://github.com/EigenCrate/evcrate/commit/4fa85e16f47be9e7d6ddd0735ee12987af943ace))
* **distribution:** rewrite Codex paths for HOME only ([14f865b](https://github.com/EigenCrate/evcrate/commit/14f865bee7b97048dde6e8e312e06a39ef722ab1))
* **distribution:** seal private unpack payload and runtime closure ([e59fe28](https://github.com/EigenCrate/evcrate/commit/e59fe287d1e583e665fe37e8f5b00f64a3000283))
* **distribution:** split build and publish gates ([5ca0a4a](https://github.com/EigenCrate/evcrate/commit/5ca0a4acab40df1f8f82aac88af24a68fd9531b5))
* enhance migration scripts, distribute agy config, and improve audit accuracy ([1196ecc](https://github.com/EigenCrate/evcrate/commit/1196eccf434ade4eae7ba1934b32fc0b114eed19))
* **examples:** add simple web testing demo scaffold ([e7420d1](https://github.com/EigenCrate/evcrate/commit/e7420d1c25682c6085045228144fe3be7b989897))
* **installer:** implement Linux standalone unpack installer and lifecycle ([5fa5072](https://github.com/EigenCrate/evcrate/commit/5fa5072e1e086ebf2e9df2b057765541488b9b9b))
* **installers:** implement standalone Windows PowerShell unpack installer ([8a80ded](https://github.com/EigenCrate/evcrate/commit/8a80ded2c662bf314e4c8a9fbe089613701da260))
* **migration:** add parameter support for local and global target baselines in migration scripts ([34205bb](https://github.com/EigenCrate/evcrate/commit/34205bb1e2cb0c0b5e8d4a74aed18b9efb75075a))
* **omp:** add source projection and resources in .evcrate/source/.omp ([aef4ec5](https://github.com/EigenCrate/evcrate/commit/aef4ec531a7207a65e07a3c18121616991ba71d5))
* **omp:** implement OMP adapter, migration pipeline, and distribution target ([c1bc27d](https://github.com/EigenCrate/evcrate/commit/c1bc27dec42b0110b49466b34e77e1d9da13d808))
* **omp:** prefix generated command namespace ([1071f7e](https://github.com/EigenCrate/evcrate/commit/1071f7ef2fc3b80a591cb45bc124925eea7da9ed))
* **pi:** add default todo package ([ff368ba](https://github.com/EigenCrate/evcrate/commit/ff368baf760258e51a9c21e68125efc9b2ac01d7))
* **pi:** add native evcrate extension ([7567a32](https://github.com/EigenCrate/evcrate/commit/7567a321094209272e36e158ab471b3d5e548d5e))
* **pi:** add native runtime extension ([83d6b12](https://github.com/EigenCrate/evcrate/commit/83d6b129842a701144542da9be344aee9206d5d5))
* **pi:** migrate deterministic native resources ([b9a4b6b](https://github.com/EigenCrate/evcrate/commit/b9a4b6bcd8a29ad3d3049d49abfd55157505858e))
* **pi:** restore delegation output and skill roots ([6d27c1c](https://github.com/EigenCrate/evcrate/commit/6d27c1cd22d8d58eb30d37dd58d63b6342494e77))
* project brainstormer model across targets ([f0027db](https://github.com/EigenCrate/evcrate/commit/f0027dbd9c69bac39e8e187f59f509a005195053))
* **refactor:** port distribute.sh to modular distribute.py script ([015db5c](https://github.com/EigenCrate/evcrate/commit/015db5cb4899d9db07ceb8d95bcd53a357b760b9))
* **scout:** unify external CLI strategies ([606ac4d](https://github.com/EigenCrate/evcrate/commit/606ac4d3775f0068fd150ae8ba0fa1b433963e9c))
* **skill:** add spring boot 4 migration skill ([313727d](https://github.com/EigenCrate/evcrate/commit/313727d51cfb6ec479e919d62094ac127d8a18e0))
* **skills:** add web testing skill ([e006c32](https://github.com/EigenCrate/evcrate/commit/e006c325ba107d5c9ed856d78ba2af0b4cf2b76a))
* **take:** make take a first-class command and skill ([d0c7fcb](https://github.com/EigenCrate/evcrate/commit/d0c7fcbfeb88255b7e7b640c0de891fce3f990e3))
* **take:** strengthen transfer workflow gates ([6123879](https://github.com/EigenCrate/evcrate/commit/6123879b8cc0c8656442b2e8e9880db970fbe540))
* **tooling:** add command and skill catalog scanners ([c67698a](https://github.com/EigenCrate/evcrate/commit/c67698abe96c1b33a30c5f658de5b4a523e7d663))
* update design first and review for plan ([be5d8ff](https://github.com/EigenCrate/evcrate/commit/be5d8ffd0c6921ce8cc3129ba753b11374184622))
* **web-testing-demo:** implement k6 release gate with Windows PATH handling ([6225fac](https://github.com/EigenCrate/evcrate/commit/6225fac16882b75a49322633b7fb9196e09052db))


### 🐞 Bug Fixes

* **adapters:** set executable bit on .gemini/hooks/claude-session-end.cjs ([241e790](https://github.com/EigenCrate/evcrate/commit/241e7903e7b084ca72ec4f8659428c0bae0a0df5))
* **advisor:** close review follow-ups ([644f007](https://github.com/EigenCrate/evcrate/commit/644f007208ae64fb304f184bf7a51e5934e9d165))
* **advisor:** harden command-mode follow-ups ([c763139](https://github.com/EigenCrate/evcrate/commit/c763139992304c92be30aebd967d2a808547514d))
* **advisor:** harden native advice handoff lifecycle ([92c47bb](https://github.com/EigenCrate/evcrate/commit/92c47bb14f0bb92902aa04483536f08b10a1a05d))
* **advisor:** resolve generated workflow paths ([c1c898e](https://github.com/EigenCrate/evcrate/commit/c1c898ef903e152cffb2a5515df6f5cd418918c0))
* **ci:** enable unprivileged user namespaces and handle unshare unavailability in rollout tests ([60faa63](https://github.com/EigenCrate/evcrate/commit/60faa637dc9c4c6001cd63d27a998cad16c79d3a))
* **ci:** keep node-version=24 and remove brittle executable bit assertion in parity test ([f812401](https://github.com/EigenCrate/evcrate/commit/f8124011ac61592ddec3b582e5b6f3c2abad1d64))
* **cli:** update Gemini migration script and configuration ([25fecf1](https://github.com/EigenCrate/evcrate/commit/25fecf1ac54bfa52ee1007b9c4bd4b8e072c0c99))
* **codex:** align generated command routing ([2e5df47](https://github.com/EigenCrate/evcrate/commit/2e5df4736a74b8aedbf66490f2d0a60cb210747b))
* **codex:** harden Claude resource migration ([395bff7](https://github.com/EigenCrate/evcrate/commit/395bff7c2323fbb5090a1e00ad1af9e9e0fe495e))
* **codex:** restore 3-tier model delegation in migration generator ([2003b72](https://github.com/EigenCrate/evcrate/commit/2003b7216e81794ca851fc336f37eee2e43e9f78))
* **cook:** add preflight and quality gates ([8298629](https://github.com/EigenCrate/evcrate/commit/8298629e7e4e2aafccd18603108e9e8c3e99375d))
* **copilot:** update runtime hook schema, bridge payload normalization, and session cleanup ([6b71c52](https://github.com/EigenCrate/evcrate/commit/6b71c5201550ee2d673a8395f962f9a4d57bf98e))
* **distribution:** correct Windows ownership handling ([0e32a8a](https://github.com/EigenCrate/evcrate/commit/0e32a8acaabdeb9b874151bf125ae864c4c4724d))
* **distribution:** filter non-skill Claude files ([45d6985](https://github.com/EigenCrate/evcrate/commit/45d6985f65e741e454044b60f7407cd7ad4c7d9b))
* **distribution:** harden hook rewriting against symlinks ([2b5016e](https://github.com/EigenCrate/evcrate/commit/2b5016e37024ed578b502b29fac8a7b825de9fe9))
* **distribution:** increase linux release verification timeouts to prevent ETIMEDOUT under load ([e87ff02](https://github.com/EigenCrate/evcrate/commit/e87ff0299b2431616fd219e4b442e1d9cff3f434))
* **distribution:** normalize .claude/.gitignore line endings to LF ([35e2430](https://github.com/EigenCrate/evcrate/commit/35e24308c67e555ff4b82d87cc5b9c5ae13045c9))
* **distribution:** port Windows-safe publication to evcrate ([5405489](https://github.com/EigenCrate/evcrate/commit/54054893d602128097ffb2dc9f3a239c6ca52bd4))
* **distribution:** rebuild all target projections with normalized LF line endings ([749124c](https://github.com/EigenCrate/evcrate/commit/749124c70c1381512b60f656da58c0e1653e1da2))
* **distribution:** regenerate all per-target build manifests ([e4b85ad](https://github.com/EigenCrate/evcrate/commit/e4b85ad68af7b94354c7dc9f1cb84fbf2b112eda))
* **distribution:** regenerate per-target build manifests with clean LF hashes ([afa00cc](https://github.com/EigenCrate/evcrate/commit/afa00cc3db7fe6f06b4acca26960634e4f76e275))
* **distribution:** register complete advisor runtime closure ([39ded59](https://github.com/EigenCrate/evcrate/commit/39ded5978b2023f102eb6d5ef56685da0838c0a4))
* **distribution:** relax output and controller hash equality checks in verification ([c895cf4](https://github.com/EigenCrate/evcrate/commit/c895cf4105ee3babe9b98259033a37e9b15017d2))
* **distribution:** remove build hash gating and make advisor executable check non-blocking ([5c5d558](https://github.com/EigenCrate/evcrate/commit/5c5d558802d63a30172967e69d8c8586045f889e))
* **distribution:** remove file mode and hash restrictions and regenerate distributions ([637e0e4](https://github.com/EigenCrate/evcrate/commit/637e0e4d43e1e3808a63477c508715bcface289d))
* **distribution:** restore cryptographic output and controller hash verification in verifyBuild ([75e7b3f](https://github.com/EigenCrate/evcrate/commit/75e7b3f6d4712735023d1124b990a1f9c11f487f))
* **distribution:** unignore and track .evcrate/source/.antigravity target tree ([4dc18e0](https://github.com/EigenCrate/evcrate/commit/4dc18e0519bbbe7d9ff3d613cc54ab3e28f2ae26))
* **distribution:** update build manifests with canonical LF hashes for CI consistency ([ab55def](https://github.com/EigenCrate/evcrate/commit/ab55def2e9b40ca8ec8f29fdec3c10b93878197f))
* **distribution:** validate target-local resource projections ([67d0a11](https://github.com/EigenCrate/evcrate/commit/67d0a1115bb2292b112e119b50e3c4cc70188cc4))
* **gemini:** harden Claude resource migration ([d2b9fa2](https://github.com/EigenCrate/evcrate/commit/d2b9fa20a8eeaf25c276d351f163299f2475c7f1))
* harden distribute.sh distribution logic ([5a9f36a](https://github.com/EigenCrate/evcrate/commit/5a9f36af98d2f4041e9a15ac5cc553d48bbc75b1))
* **installer:** set executable permission on install.sh and add CI safeguards ([91582d5](https://github.com/EigenCrate/evcrate/commit/91582d58d6fc5c75bb365df902a7e5d5d0e4d071))
* **orchestration:** wait for terminal subagent results ([4478302](https://github.com/EigenCrate/evcrate/commit/44783021f007c3ae1d86c1b06c9e59c4e560e58a))
* **pi:** align delegation and skill roots ([b87d741](https://github.com/EigenCrate/evcrate/commit/b87d741b7038aaab5cafe2d286f4d55d9b2ddce6))
* **pi:** cover Windows root resolution regressions ([073959f](https://github.com/EigenCrate/evcrate/commit/073959fa1d11edd1128aee498fb074baaa995b03))
* **pi:** normalize delegation tool updates ([53e5636](https://github.com/EigenCrate/evcrate/commit/53e56363be0ac763c57912622cab8f473bf1ef86))
* **pi:** regenerate Windows root resolution artifacts ([4b9620d](https://github.com/EigenCrate/evcrate/commit/4b9620d28889721fde56a2b5c54a78b591a99d9c))
* **pi:** resolve agent root on native Windows ([6ae17b2](https://github.com/EigenCrate/evcrate/commit/6ae17b2bda3727bc49a8fdad3d782c2cfe219538))
* **pi:** translate Claude resources into native layout ([a768d70](https://github.com/EigenCrate/evcrate/commit/a768d70bf9d993ed92ea9f50c0418ed86a9c937f))
* **publish:** safely publish home directory symlinks ([4432c76](https://github.com/EigenCrate/evcrate/commit/4432c76fd33f1386463acb10edd34291ded46201))
* **refactor:** correct command description extraction from frontmatter ([b3a678f](https://github.com/EigenCrate/evcrate/commit/b3a678f8a13d4a8953c65311b4aee6bd747e1eda))
* **release:** eliminate release-blocking restrictions and prevent recursive packaging ([c113fdb](https://github.com/EigenCrate/evcrate/commit/c113fdb8430e19cce208195b9e8aba2f89d8f5b2))
* **release:** resolve release asset collision, configure semantic-release plugins, and target EigenCrate repository ([62b6ec4](https://github.com/EigenCrate/evcrate/commit/62b6ec4e0eb97aa1a98f9ed5c8082698bfe97e89))
* repair routing and OMP skill migration ([4a70b51](https://github.com/EigenCrate/evcrate/commit/4a70b51ceb2f329de146340710d68cbc0116e7d6))
* resolve safety hooks project root and argument mapping in multi-workspace setups ([367154c](https://github.com/EigenCrate/evcrate/commit/367154c3badd6c88bae3c200bf2b26e2b26612ad))
* **scopes:** ensure assertOwnerOnlyFile rejects non-owner modes while allowing fixed 0777 mounts ([8052dc9](https://github.com/EigenCrate/evcrate/commit/8052dc91614e7c81edd94f87084370ce7fc52621))
* **skills:** handle case-insensitive skill discovery ([9b44e17](https://github.com/EigenCrate/evcrate/commit/9b44e1708291b7cccf19a51c4ff3d7a4c3a997a9))
* **test:** ensure advisor controller test fixtures are executable ([2302e1b](https://github.com/EigenCrate/evcrate/commit/2302e1bb4213426f195dba5b9a95ba9fc0eefc9b))
* **test:** resolve CI failures in primitives, adapters, and publication verification ([0238011](https://github.com/EigenCrate/evcrate/commit/02380118ceafa30dba13f0a0f3daff2d6203184b))
* **tests:** ensure dist/release assets are prepared in validation-and-rollout test ([70fffe6](https://github.com/EigenCrate/evcrate/commit/70fffe637a882c8a3ece25ef839c5ef4ef830733))
* **workflow:** preserve advice mode through fix routing ([4d50f2a](https://github.com/EigenCrate/evcrate/commit/4d50f2a3ade23f8a2d54afb56be82db4c2575d96))


### 📚 Documentation

* add web gate evidence ([534511f](https://github.com/EigenCrate/evcrate/commit/534511f1a6df3460c3e5dfb2d57334f0cd32cb58))
* **agents:** update agent and skill frontmatter ([f17e666](https://github.com/EigenCrate/evcrate/commit/f17e6663ed1166cb889973972e84ecc611544d67))
* **readme:** add download and installation guide for linux and windows users ([3b03bb9](https://github.com/EigenCrate/evcrate/commit/3b03bb90c705170bdad667014d19d5fa692bbc9f))


### ♻️ Code Refactoring

* **advisor:** finalize skill-only distribution ([5016030](https://github.com/EigenCrate/evcrate/commit/50160306c1ba8c2e09bf54fe9e96397b8fa53d3d))
* **codex:** replace advisor broker with static skill ([8d92667](https://github.com/EigenCrate/evcrate/commit/8d92667805ef2ee30007435d8f6596712ad90e75))
* **config:** enable Codex coding levels ([5cccfc1](https://github.com/EigenCrate/evcrate/commit/5cccfc160da7f6f430627c210c7be8427d3c6228))
* **config:** rename config file ([39a8530](https://github.com/EigenCrate/evcrate/commit/39a8530339fbf022eb4e82a043606f6e600e7549))
* **distribution:** relocate agent configuration source ([c39da0c](https://github.com/EigenCrate/evcrate/commit/c39da0c5091620170e50ef8615d0d8d8986c36b1))
* ignore ([506367d](https://github.com/EigenCrate/evcrate/commit/506367dfefedf754184c27c192e8fd52e9e2553c))
* **migrate:** migrate claude to gemini ([27ccace](https://github.com/EigenCrate/evcrate/commit/27ccacea83efd33377f9fe58683286900394b627))
* **models:** update model mapping to properly migrate recent Claude 4.5/4.6 models to Gemini 3/3.1 equivalents ([5febc2b](https://github.com/EigenCrate/evcrate/commit/5febc2bcb11286664e489fb33dda13490e0ad9bd))
* **pi:** complete native resource migration ([ad0804a](https://github.com/EigenCrate/evcrate/commit/ad0804aad25f135318d79261cc4907f60dba210a))
* remove namespace prefix, default to bare command names ([7a27e2a](https://github.com/EigenCrate/evcrate/commit/7a27e2abc47325080de57246c5756ffac332aa44))
* rename crate ([d528337](https://github.com/EigenCrate/evcrate/commit/d5283378efdd144e286a052dc0f896a55ac07c27))
* **tests:** eliminate phase references in test files and scripts ([af5a83a](https://github.com/EigenCrate/evcrate/commit/af5a83a083afa97852422fab034671b221a59c7e))


### ✅ Tests

* add web testing demo tooling ([1c809e1](https://github.com/EigenCrate/evcrate/commit/1c809e1eff1623d2dff1295531fe8e226cb4c8f9))
* freeze phase one distribution baseline ([4b17162](https://github.com/EigenCrate/evcrate/commit/4b171624bf77dee14e532e38e2b8822d5e79ae07))
* **pi:** add native migration release gates ([1f0fe80](https://github.com/EigenCrate/evcrate/commit/1f0fe80c9e4bd9398c2e8700824c01e1cb6d98d4))
* **pi:** remove stale doctor command assertion ([018f313](https://github.com/EigenCrate/evcrate/commit/018f31304215dc12048d67ba0b3ef33bcd952bbc))


### 👷 CI

* **release:** remove Python setup and distribution steps from release workflow ([39e9556](https://github.com/EigenCrate/evcrate/commit/39e9556da06fa99082c7ee6cc4966eafc64d7719))

## 1.0.0 (2026-09-06)


### 🚀 Features

* **adapters:** add TypeScript target projections ([7e52d7a](https://github.com/EigenCrate/evcrate/commit/7e52d7a9450d86edd5e6dde350070c170252b717))
* add accessible web testing demo flow ([07c9d24](https://github.com/EigenCrate/evcrate/commit/07c9d245129d337ea27d66a63ca8941033a14883))
* add base distribution ([c2d0307](https://github.com/EigenCrate/evcrate/commit/c2d0307c663e803c0d1cbedb6ee416ceb6343eb4))
* add resource registry and explicit imports ([734485a](https://github.com/EigenCrate/evcrate/commit/734485a0aae5b7c2e80559360312825572aa50de))
* add web testing release gate demo ([7f5bfd6](https://github.com/EigenCrate/evcrate/commit/7f5bfd6c3c7315e8a691cff8f6c42fc46e03dcc1))
* **advisor:** add canonical advise interview relay ([c52bd06](https://github.com/EigenCrate/evcrate/commit/c52bd0604045de1bd61f42e71ee2d8e2f7982eb1))
* **advisor:** add constrained broker runtime ([3de0c34](https://github.com/EigenCrate/evcrate/commit/3de0c34066018c660d3f7c353eed85343d13bcc2))
* **advisor:** add cross-harness route resolver ([0c02b25](https://github.com/EigenCrate/evcrate/commit/0c02b2547c32bed00959b10eb83647e18f0ad37b))
* **advisor:** add cross-harness routing ([c5b0ca9](https://github.com/EigenCrate/evcrate/commit/c5b0ca9e2d7a1ee9c62ac83a258f6d95053ec741))
* **advisor:** add cross-harness runner harness ([3d560f2](https://github.com/EigenCrate/evcrate/commit/3d560f28f82c3f44d4fb800ef0442c6da27afe04))
* **advisor:** add explicit command mentoring mode ([ded302a](https://github.com/EigenCrate/evcrate/commit/ded302a100321ba01e1ebb7e490c89d6b19bc5ca))
* **advisor:** add Pi routing adapter and native boundary ([d3a69b3](https://github.com/EigenCrate/evcrate/commit/d3a69b35cfe15a812c1580eb05edb7cea0be27bc))
* **advisor:** centralize controller resource control ([aa50608](https://github.com/EigenCrate/evcrate/commit/aa50608679d1cb001166eb4d54cbf219444cc2cc))
* **advisor:** finalize evcrate runtime namespace and migration docs ([4d26ff4](https://github.com/EigenCrate/evcrate/commit/4d26ff457cda4253259605a6d05bcc6fceb3cd51))
* **advisor:** integrate checkpoint routing workflow ([5b5e8a7](https://github.com/EigenCrate/evcrate/commit/5b5e8a7ee7d868d839218bd6f5b6396c872a12d2))
* **advisor:** replace advisor mode with advice checkpoints ([dde7be7](https://github.com/EigenCrate/evcrate/commit/dde7be7e15b7c390b85d73f3490c0fc6cf8a986f))
* **advisor:** roll out generated command mode ([b2f4a2c](https://github.com/EigenCrate/evcrate/commit/b2f4a2c8f135b32196d637cf5c095878c6305eb3))
* **agent:** initialize gemini cli core ([6ba782c](https://github.com/EigenCrate/evcrate/commit/6ba782c3f9b053f8a43f3d8cebd4c81a90fe027b))
* **cli:** add TypeScript control-plane foundation ([cf2f04b](https://github.com/EigenCrate/evcrate/commit/cf2f04b0d4a4bf3b8f472218d668d11ae45b1ece))
* **cli:** harden TypeScript control-plane foundation ([66d8a08](https://github.com/EigenCrate/evcrate/commit/66d8a08eeacb5ff738cae36a91184b7d03561f2c))
* **cli:** integrate DamHopper consumer subprocess adapter and cross-repository fixtures ([f432781](https://github.com/EigenCrate/evcrate/commit/f432781287d1b540774393e6293659627301146a))
* **codex:** add MCP package runner and Node hook execution utilities ([b9b9297](https://github.com/EigenCrate/evcrate/commit/b9b9297f19a12e6ba24b49267ffe83dd8553aab4))
* **control-plane:** add protocol contracts ([e74cd45](https://github.com/EigenCrate/evcrate/commit/e74cd45b17e45fac4469b01ce6ee04d947f5badc))
* **control-plane:** add resource scopes and advisor settings CAS ([bdc65e2](https://github.com/EigenCrate/evcrate/commit/bdc65e26d283a57953e384e7e495d4fedd28d96a))
* **copilot:** add Copilot target migration ([e12f802](https://github.com/EigenCrate/evcrate/commit/e12f802b0e847d72cc5581c48cf63ab648307a9e))
* **distribution:** add deterministic staged builds ([295a481](https://github.com/EigenCrate/evcrate/commit/295a4810e979d6ff51190e019570dc4fdacc35c9))
* **distribution:** add native Pi target contract ([1cd51c4](https://github.com/EigenCrate/evcrate/commit/1cd51c4808248d35ac8ca03e626c795d9621c2a9))
* **distribution:** add Pi-only publish command ([eacd80c](https://github.com/EigenCrate/evcrate/commit/eacd80cc28979bea20c8fa420d065fe8ea528529))
* **distribution:** cut over to private registry-free release assets and prove Linux lifecycle ([1e3f194](https://github.com/EigenCrate/evcrate/commit/1e3f1946567d1abd78e6c8541c4f2ab2d2cd1ab9))
* **distribution:** decouple consumer build resolution and complete rollout ([0723610](https://github.com/EigenCrate/evcrate/commit/072361051e552801fa98b96fa5399d503641ed35))
* **distribution:** harden cross-runtime publication safety ([01295fe](https://github.com/EigenCrate/evcrate/commit/01295fee3ca03c1a3a46d778f18dd362f1772c98))
* **distribution:** implement atomic target publication and recovery ([108e9db](https://github.com/EigenCrate/evcrate/commit/108e9db105250557f93012e35729eec954e6754b))
* **distribution:** implement release packaging and per-target cutover ([bfc9388](https://github.com/EigenCrate/evcrate/commit/bfc93889cec2367d4e4af2d26eb10556b9c37865))
* **distribution:** publish Claude config to home ([75db181](https://github.com/EigenCrate/evcrate/commit/75db1811a700d3c1b1d370fc94d5a3905bbb52bf))
* **distribution:** publish verified home artifacts ([4fa85e1](https://github.com/EigenCrate/evcrate/commit/4fa85e16f47be9e7d6ddd0735ee12987af943ace))
* **distribution:** rewrite Codex paths for HOME only ([14f865b](https://github.com/EigenCrate/evcrate/commit/14f865bee7b97048dde6e8e312e06a39ef722ab1))
* **distribution:** seal private unpack payload and runtime closure ([e59fe28](https://github.com/EigenCrate/evcrate/commit/e59fe287d1e583e665fe37e8f5b00f64a3000283))
* **distribution:** split build and publish gates ([5ca0a4a](https://github.com/EigenCrate/evcrate/commit/5ca0a4acab40df1f8f82aac88af24a68fd9531b5))
* enhance migration scripts, distribute agy config, and improve audit accuracy ([1196ecc](https://github.com/EigenCrate/evcrate/commit/1196eccf434ade4eae7ba1934b32fc0b114eed19))
* **examples:** add simple web testing demo scaffold ([e7420d1](https://github.com/EigenCrate/evcrate/commit/e7420d1c25682c6085045228144fe3be7b989897))
* **installer:** implement Linux standalone unpack installer and lifecycle ([5fa5072](https://github.com/EigenCrate/evcrate/commit/5fa5072e1e086ebf2e9df2b057765541488b9b9b))
* **installers:** implement standalone Windows PowerShell unpack installer ([8a80ded](https://github.com/EigenCrate/evcrate/commit/8a80ded2c662bf314e4c8a9fbe089613701da260))
* **migration:** add parameter support for local and global target baselines in migration scripts ([34205bb](https://github.com/EigenCrate/evcrate/commit/34205bb1e2cb0c0b5e8d4a74aed18b9efb75075a))
* **omp:** add source projection and resources in .evcrate/source/.omp ([aef4ec5](https://github.com/EigenCrate/evcrate/commit/aef4ec531a7207a65e07a3c18121616991ba71d5))
* **omp:** implement OMP adapter, migration pipeline, and distribution target ([c1bc27d](https://github.com/EigenCrate/evcrate/commit/c1bc27dec42b0110b49466b34e77e1d9da13d808))
* **omp:** prefix generated command namespace ([1071f7e](https://github.com/EigenCrate/evcrate/commit/1071f7ef2fc3b80a591cb45bc124925eea7da9ed))
* **pi:** add default todo package ([ff368ba](https://github.com/EigenCrate/evcrate/commit/ff368baf760258e51a9c21e68125efc9b2ac01d7))
* **pi:** add native evcrate extension ([7567a32](https://github.com/EigenCrate/evcrate/commit/7567a321094209272e36e158ab471b3d5e548d5e))
* **pi:** add native runtime extension ([83d6b12](https://github.com/EigenCrate/evcrate/commit/83d6b129842a701144542da9be344aee9206d5d5))
* **pi:** migrate deterministic native resources ([b9a4b6b](https://github.com/EigenCrate/evcrate/commit/b9a4b6bcd8a29ad3d3049d49abfd55157505858e))
* **pi:** restore delegation output and skill roots ([6d27c1c](https://github.com/EigenCrate/evcrate/commit/6d27c1cd22d8d58eb30d37dd58d63b6342494e77))
* project brainstormer model across targets ([f0027db](https://github.com/EigenCrate/evcrate/commit/f0027dbd9c69bac39e8e187f59f509a005195053))
* **refactor:** port distribute.sh to modular distribute.py script ([015db5c](https://github.com/EigenCrate/evcrate/commit/015db5cb4899d9db07ceb8d95bcd53a357b760b9))
* **scout:** unify external CLI strategies ([606ac4d](https://github.com/EigenCrate/evcrate/commit/606ac4d3775f0068fd150ae8ba0fa1b433963e9c))
* **skill:** add spring boot 4 migration skill ([313727d](https://github.com/EigenCrate/evcrate/commit/313727d51cfb6ec479e919d62094ac127d8a18e0))
* **skills:** add web testing skill ([e006c32](https://github.com/EigenCrate/evcrate/commit/e006c325ba107d5c9ed856d78ba2af0b4cf2b76a))
* **take:** make take a first-class command and skill ([d0c7fcb](https://github.com/EigenCrate/evcrate/commit/d0c7fcbfeb88255b7e7b640c0de891fce3f990e3))
* **take:** strengthen transfer workflow gates ([6123879](https://github.com/EigenCrate/evcrate/commit/6123879b8cc0c8656442b2e8e9880db970fbe540))
* **tooling:** add command and skill catalog scanners ([c67698a](https://github.com/EigenCrate/evcrate/commit/c67698abe96c1b33a30c5f658de5b4a523e7d663))
* update design first and review for plan ([be5d8ff](https://github.com/EigenCrate/evcrate/commit/be5d8ffd0c6921ce8cc3129ba753b11374184622))
* **web-testing-demo:** implement k6 release gate with Windows PATH handling ([6225fac](https://github.com/EigenCrate/evcrate/commit/6225fac16882b75a49322633b7fb9196e09052db))


### 🐞 Bug Fixes

* **adapters:** set executable bit on .gemini/hooks/claude-session-end.cjs ([241e790](https://github.com/EigenCrate/evcrate/commit/241e7903e7b084ca72ec4f8659428c0bae0a0df5))
* **advisor:** close review follow-ups ([644f007](https://github.com/EigenCrate/evcrate/commit/644f007208ae64fb304f184bf7a51e5934e9d165))
* **advisor:** harden command-mode follow-ups ([c763139](https://github.com/EigenCrate/evcrate/commit/c763139992304c92be30aebd967d2a808547514d))
* **advisor:** harden native advice handoff lifecycle ([92c47bb](https://github.com/EigenCrate/evcrate/commit/92c47bb14f0bb92902aa04483536f08b10a1a05d))
* **advisor:** resolve generated workflow paths ([c1c898e](https://github.com/EigenCrate/evcrate/commit/c1c898ef903e152cffb2a5515df6f5cd418918c0))
* **ci:** enable unprivileged user namespaces and handle unshare unavailability in rollout tests ([60faa63](https://github.com/EigenCrate/evcrate/commit/60faa637dc9c4c6001cd63d27a998cad16c79d3a))
* **ci:** keep node-version=24 and remove brittle executable bit assertion in parity test ([f812401](https://github.com/EigenCrate/evcrate/commit/f8124011ac61592ddec3b582e5b6f3c2abad1d64))
* **cli:** update Gemini migration script and configuration ([25fecf1](https://github.com/EigenCrate/evcrate/commit/25fecf1ac54bfa52ee1007b9c4bd4b8e072c0c99))
* **codex:** align generated command routing ([2e5df47](https://github.com/EigenCrate/evcrate/commit/2e5df4736a74b8aedbf66490f2d0a60cb210747b))
* **codex:** harden Claude resource migration ([395bff7](https://github.com/EigenCrate/evcrate/commit/395bff7c2323fbb5090a1e00ad1af9e9e0fe495e))
* **codex:** restore 3-tier model delegation in migration generator ([2003b72](https://github.com/EigenCrate/evcrate/commit/2003b7216e81794ca851fc336f37eee2e43e9f78))
* **cook:** add preflight and quality gates ([8298629](https://github.com/EigenCrate/evcrate/commit/8298629e7e4e2aafccd18603108e9e8c3e99375d))
* **copilot:** update runtime hook schema, bridge payload normalization, and session cleanup ([6b71c52](https://github.com/EigenCrate/evcrate/commit/6b71c5201550ee2d673a8395f962f9a4d57bf98e))
* **distribution:** correct Windows ownership handling ([0e32a8a](https://github.com/EigenCrate/evcrate/commit/0e32a8acaabdeb9b874151bf125ae864c4c4724d))
* **distribution:** filter non-skill Claude files ([45d6985](https://github.com/EigenCrate/evcrate/commit/45d6985f65e741e454044b60f7407cd7ad4c7d9b))
* **distribution:** harden hook rewriting against symlinks ([2b5016e](https://github.com/EigenCrate/evcrate/commit/2b5016e37024ed578b502b29fac8a7b825de9fe9))
* **distribution:** increase linux release verification timeouts to prevent ETIMEDOUT under load ([e87ff02](https://github.com/EigenCrate/evcrate/commit/e87ff0299b2431616fd219e4b442e1d9cff3f434))
* **distribution:** normalize .claude/.gitignore line endings to LF ([35e2430](https://github.com/EigenCrate/evcrate/commit/35e24308c67e555ff4b82d87cc5b9c5ae13045c9))
* **distribution:** port Windows-safe publication to evcrate ([5405489](https://github.com/EigenCrate/evcrate/commit/54054893d602128097ffb2dc9f3a239c6ca52bd4))
* **distribution:** rebuild all target projections with normalized LF line endings ([749124c](https://github.com/EigenCrate/evcrate/commit/749124c70c1381512b60f656da58c0e1653e1da2))
* **distribution:** regenerate all per-target build manifests ([e4b85ad](https://github.com/EigenCrate/evcrate/commit/e4b85ad68af7b94354c7dc9f1cb84fbf2b112eda))
* **distribution:** regenerate per-target build manifests with clean LF hashes ([afa00cc](https://github.com/EigenCrate/evcrate/commit/afa00cc3db7fe6f06b4acca26960634e4f76e275))
* **distribution:** register complete advisor runtime closure ([39ded59](https://github.com/EigenCrate/evcrate/commit/39ded5978b2023f102eb6d5ef56685da0838c0a4))
* **distribution:** relax output and controller hash equality checks in verification ([c895cf4](https://github.com/EigenCrate/evcrate/commit/c895cf4105ee3babe9b98259033a37e9b15017d2))
* **distribution:** remove build hash gating and make advisor executable check non-blocking ([5c5d558](https://github.com/EigenCrate/evcrate/commit/5c5d558802d63a30172967e69d8c8586045f889e))
* **distribution:** remove file mode and hash restrictions and regenerate distributions ([637e0e4](https://github.com/EigenCrate/evcrate/commit/637e0e4d43e1e3808a63477c508715bcface289d))
* **distribution:** restore cryptographic output and controller hash verification in verifyBuild ([75e7b3f](https://github.com/EigenCrate/evcrate/commit/75e7b3f6d4712735023d1124b990a1f9c11f487f))
* **distribution:** unignore and track .evcrate/source/.antigravity target tree ([4dc18e0](https://github.com/EigenCrate/evcrate/commit/4dc18e0519bbbe7d9ff3d613cc54ab3e28f2ae26))
* **distribution:** update build manifests with canonical LF hashes for CI consistency ([ab55def](https://github.com/EigenCrate/evcrate/commit/ab55def2e9b40ca8ec8f29fdec3c10b93878197f))
* **distribution:** validate target-local resource projections ([67d0a11](https://github.com/EigenCrate/evcrate/commit/67d0a1115bb2292b112e119b50e3c4cc70188cc4))
* **gemini:** harden Claude resource migration ([d2b9fa2](https://github.com/EigenCrate/evcrate/commit/d2b9fa20a8eeaf25c276d351f163299f2475c7f1))
* harden distribute.sh distribution logic ([5a9f36a](https://github.com/EigenCrate/evcrate/commit/5a9f36af98d2f4041e9a15ac5cc553d48bbc75b1))
* **installer:** set executable permission on install.sh and add CI safeguards ([91582d5](https://github.com/EigenCrate/evcrate/commit/91582d58d6fc5c75bb365df902a7e5d5d0e4d071))
* **orchestration:** wait for terminal subagent results ([4478302](https://github.com/EigenCrate/evcrate/commit/44783021f007c3ae1d86c1b06c9e59c4e560e58a))
* **pi:** align delegation and skill roots ([b87d741](https://github.com/EigenCrate/evcrate/commit/b87d741b7038aaab5cafe2d286f4d55d9b2ddce6))
* **pi:** cover Windows root resolution regressions ([073959f](https://github.com/EigenCrate/evcrate/commit/073959fa1d11edd1128aee498fb074baaa995b03))
* **pi:** normalize delegation tool updates ([53e5636](https://github.com/EigenCrate/evcrate/commit/53e56363be0ac763c57912622cab8f473bf1ef86))
* **pi:** regenerate Windows root resolution artifacts ([4b9620d](https://github.com/EigenCrate/evcrate/commit/4b9620d28889721fde56a2b5c54a78b591a99d9c))
* **pi:** resolve agent root on native Windows ([6ae17b2](https://github.com/EigenCrate/evcrate/commit/6ae17b2bda3727bc49a8fdad3d782c2cfe219538))
* **pi:** translate Claude resources into native layout ([a768d70](https://github.com/EigenCrate/evcrate/commit/a768d70bf9d993ed92ea9f50c0418ed86a9c937f))
* **publish:** safely publish home directory symlinks ([4432c76](https://github.com/EigenCrate/evcrate/commit/4432c76fd33f1386463acb10edd34291ded46201))
* **refactor:** correct command description extraction from frontmatter ([b3a678f](https://github.com/EigenCrate/evcrate/commit/b3a678f8a13d4a8953c65311b4aee6bd747e1eda))
* **release:** eliminate release-blocking restrictions and prevent recursive packaging ([c113fdb](https://github.com/EigenCrate/evcrate/commit/c113fdb8430e19cce208195b9e8aba2f89d8f5b2))
* **release:** resolve release asset collision, configure semantic-release plugins, and target EigenCrate repository ([62b6ec4](https://github.com/EigenCrate/evcrate/commit/62b6ec4e0eb97aa1a98f9ed5c8082698bfe97e89))
* repair routing and OMP skill migration ([4a70b51](https://github.com/EigenCrate/evcrate/commit/4a70b51ceb2f329de146340710d68cbc0116e7d6))
* resolve safety hooks project root and argument mapping in multi-workspace setups ([367154c](https://github.com/EigenCrate/evcrate/commit/367154c3badd6c88bae3c200bf2b26e2b26612ad))
* **scopes:** ensure assertOwnerOnlyFile rejects non-owner modes while allowing fixed 0777 mounts ([8052dc9](https://github.com/EigenCrate/evcrate/commit/8052dc91614e7c81edd94f87084370ce7fc52621))
* **skills:** handle case-insensitive skill discovery ([9b44e17](https://github.com/EigenCrate/evcrate/commit/9b44e1708291b7cccf19a51c4ff3d7a4c3a997a9))
* **test:** ensure advisor controller test fixtures are executable ([2302e1b](https://github.com/EigenCrate/evcrate/commit/2302e1bb4213426f195dba5b9a95ba9fc0eefc9b))
* **test:** resolve CI failures in primitives, adapters, and publication verification ([0238011](https://github.com/EigenCrate/evcrate/commit/02380118ceafa30dba13f0a0f3daff2d6203184b))
* **tests:** ensure dist/release assets are prepared in validation-and-rollout test ([70fffe6](https://github.com/EigenCrate/evcrate/commit/70fffe637a882c8a3ece25ef839c5ef4ef830733))
* **workflow:** preserve advice mode through fix routing ([4d50f2a](https://github.com/EigenCrate/evcrate/commit/4d50f2a3ade23f8a2d54afb56be82db4c2575d96))


### 📚 Documentation

* add web gate evidence ([534511f](https://github.com/EigenCrate/evcrate/commit/534511f1a6df3460c3e5dfb2d57334f0cd32cb58))
* **agents:** update agent and skill frontmatter ([f17e666](https://github.com/EigenCrate/evcrate/commit/f17e6663ed1166cb889973972e84ecc611544d67))


### ♻️ Code Refactoring

* **advisor:** finalize skill-only distribution ([5016030](https://github.com/EigenCrate/evcrate/commit/50160306c1ba8c2e09bf54fe9e96397b8fa53d3d))
* **codex:** replace advisor broker with static skill ([8d92667](https://github.com/EigenCrate/evcrate/commit/8d92667805ef2ee30007435d8f6596712ad90e75))
* **config:** enable Codex coding levels ([5cccfc1](https://github.com/EigenCrate/evcrate/commit/5cccfc160da7f6f430627c210c7be8427d3c6228))
* **config:** rename config file ([39a8530](https://github.com/EigenCrate/evcrate/commit/39a8530339fbf022eb4e82a043606f6e600e7549))
* **distribution:** relocate agent configuration source ([c39da0c](https://github.com/EigenCrate/evcrate/commit/c39da0c5091620170e50ef8615d0d8d8986c36b1))
* ignore ([506367d](https://github.com/EigenCrate/evcrate/commit/506367dfefedf754184c27c192e8fd52e9e2553c))
* **migrate:** migrate claude to gemini ([27ccace](https://github.com/EigenCrate/evcrate/commit/27ccacea83efd33377f9fe58683286900394b627))
* **models:** update model mapping to properly migrate recent Claude 4.5/4.6 models to Gemini 3/3.1 equivalents ([5febc2b](https://github.com/EigenCrate/evcrate/commit/5febc2bcb11286664e489fb33dda13490e0ad9bd))
* **pi:** complete native resource migration ([ad0804a](https://github.com/EigenCrate/evcrate/commit/ad0804aad25f135318d79261cc4907f60dba210a))
* remove namespace prefix, default to bare command names ([7a27e2a](https://github.com/EigenCrate/evcrate/commit/7a27e2abc47325080de57246c5756ffac332aa44))
* rename crate ([d528337](https://github.com/EigenCrate/evcrate/commit/d5283378efdd144e286a052dc0f896a55ac07c27))
* **tests:** eliminate phase references in test files and scripts ([af5a83a](https://github.com/EigenCrate/evcrate/commit/af5a83a083afa97852422fab034671b221a59c7e))


### ✅ Tests

* add web testing demo tooling ([1c809e1](https://github.com/EigenCrate/evcrate/commit/1c809e1eff1623d2dff1295531fe8e226cb4c8f9))
* freeze phase one distribution baseline ([4b17162](https://github.com/EigenCrate/evcrate/commit/4b171624bf77dee14e532e38e2b8822d5e79ae07))
* **pi:** add native migration release gates ([1f0fe80](https://github.com/EigenCrate/evcrate/commit/1f0fe80c9e4bd9398c2e8700824c01e1cb6d98d4))
* **pi:** remove stale doctor command assertion ([018f313](https://github.com/EigenCrate/evcrate/commit/018f31304215dc12048d67ba0b3ef33bcd952bbc))


### 👷 CI

* **release:** remove Python setup and distribution steps from release workflow ([39e9556](https://github.com/EigenCrate/evcrate/commit/39e9556da06fa99082c7ee6cc4966eafc64d7719))
