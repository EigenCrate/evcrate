---
name: spring-boot-4-migration
description: Upgrade Java or Kotlin applications to Spring Boot 4.0.0 using the official Spring Boot 4.0 Migration Guide. Use when auditing or updating `pom.xml`, `build.gradle(.kts)`, dependency management, starter or module wiring, `application.properties` or `application.yml`, source imports, Spring test infrastructure, Jackson migration, or runtime behavior changes required by Spring Framework 7, Jakarta EE 11, and Servlet 6.1.
---

# Spring Boot 4 Migration

## Overview

Use this skill to run an audit-first Spring Boot 4.0.0 migration. Start from the official migration guide, identify high-risk build and test breakpoints, then upgrade in small validated steps.

## Quick Start

1. Upgrade the project to the latest Spring Boot `3.5.x` release before moving to `4.0.0`.
2. Run `python3 scripts/audit_spring_boot_4.py /path/to/repo`.
3. Read [references/migration-checklist.md](./references/migration-checklist.md).
4. If modularization creates broad compile failures, temporarily switch to `spring-boot-starter-classic` and `spring-boot-starter-test-classic`.
5. Remove classic starters after imports and focused starters are corrected.

## Workflow

### 1. Confirm the baseline

- Require Java 17 or later.
- Require Kotlin 2.2 or later when Kotlin is present.
- Require GraalVM native-image 25 or later when native builds are used.
- Expect Spring Framework 7.x, Jakarta EE 11, and a Servlet 6.1 baseline.
- Identify unmanaged dependencies such as Spring Cloud before changing the Boot version.
- Review Spring Boot 3.x deprecations before starting the upgrade.

### 2. Audit the repository first

Run the bundled script before editing files:

```bash
python3 scripts/audit_spring_boot_4.py /path/to/repo
```

Use the output as a prioritized checklist. Treat the audit as a starting point, not as permission to bulk-rewrite blindly.

### 3. Choose the migration path

- Prefer direct modular migration for smaller codebases.
- Use classic starters only as a temporary bridge for large applications with many import and starter assumptions.
- Avoid building one custom starter artifact that supports both Spring Boot 3 and Spring Boot 4.

### 4. Apply build and dependency changes

- Add `spring-boot-properties-migrator` during migration, then remove it after configuration is updated.
- Replace removed or renamed starters, modules, and loader settings.
- Revisit Jackson, Spring Retry, Spring Authorization Server, CycloneDX, Undertow, and Tomcat WAR packaging.
- Add technology-specific Boot starters where Boot 4 no longer infers support from a third-party dependency alone.

Read [references/starter-and-module-mapping.md](./references/starter-and-module-mapping.md) when the audit reports starter, module, or package issues.

### 5. Apply source and configuration changes

- Update package moves and renamed APIs.
- Update configuration property prefixes and moved settings.
- Review Jackson 3 changes before preserving Jackson 2 compatibility.
- Check web, actuator, data, messaging, and batch behavior changes before changing code mechanically.

### 6. Apply test changes explicitly

- Replace `@MockBean` and `@SpyBean`.
- Add explicit `@AutoConfigureMockMvc`, `@AutoConfigureTestRestTemplate`, or `@AutoConfigureRestTestClient` where needed.
- Fix `TestRestTemplate` imports and dependencies.
- Re-check shared mock patterns that used `@Configuration` or `@TestConfiguration`.

### 7. Validate and clean up

- Compile after each migration slice instead of after one large rewrite.
- Run the full test suite after build, configuration, and test-infrastructure changes.
- Start the application and inspect startup output from `spring-boot-properties-migrator`.
- Remove `spring-boot-properties-migrator`.
- Remove classic starters once focused starters are known.
- Review other Spring portfolio release notes listed in [references/migration-checklist.md](./references/migration-checklist.md).

## References

- Read [references/migration-checklist.md](./references/migration-checklist.md) for the end-to-end upgrade plan distilled from the official guide.
- Read [references/starter-and-module-mapping.md](./references/starter-and-module-mapping.md) for modularization, starter replacements, package moves, and property renames.

## Operating Rules

- Prefer incremental edits with compile or test checkpoints after each group of changes.
- Preserve temporary compatibility measures only long enough to finish the migration.
- Escalate to official release notes when the project depends on Spring Data, Security, Kafka, AMQP, Batch, Session, GraphQL, or other Spring portfolio components with their own major-version changes.
