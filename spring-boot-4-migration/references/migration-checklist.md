# Spring Boot 4.0.0 Migration Checklist

## Sources

- Spring Boot 4.0 Migration Guide:
  https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide
- Spring Boot 3.5 dependency management:
  https://docs.spring.io/spring-boot/3.5/appendix/dependency-versions/coordinates.html
- Spring Boot 4.0 dependency management:
  https://docs.spring.io/spring-boot/4.0/appendix/dependency-versions/coordinates.html

## Baseline gates

- Upgrade to the latest available `3.5.x` release first.
- Require Java 17 or later.
- Require Kotlin 2.2 or later when Kotlin is used.
- Require GraalVM native-image 25 or later when native builds are used.
- Require Spring Framework 7.x.
- Expect Jakarta EE 11 and Servlet 6.1 compatibility across the deployment target.
- Review unmanaged dependencies such as Spring Cloud before changing the Boot version.

## Recommended migration order

1. Upgrade to the latest `3.5.x`.
2. Add `spring-boot-properties-migrator`.
3. Bump Spring Boot to `4.0.0`.
4. Run compile and tests to expose starter, import, and test-infrastructure gaps.
5. If modularization creates broad failures, temporarily switch to `spring-boot-starter-classic` and `spring-boot-starter-test-classic`.
6. Replace deprecated starters, package imports, and test annotations.
7. Move back from classic starters to focused starters.
8. Remove `spring-boot-properties-migrator`.

## Removed features

- Undertow embedded server support is removed because Boot 4 requires a Servlet 6.1 baseline.
- Spring Pulsar reactive client auto-configuration is removed.
- Embedded executable launch scripts for fully executable jars are removed.
- Spring Session Hazelcast support is removed from Spring Boot itself.
- Spring Session MongoDB support is removed from Spring Boot itself.
- Spring Boot Spock integration is removed.
- Classic uber-jar loader support is removed.

## Build and dependency changes

- Replace `spring-boot-starter-aop` with `spring-boot-starter-aspectj` only if the project actually needs AspectJ.
- Replace deprecated starter names with their Boot 4 names.
- Add dedicated starters for technologies that previously worked from third-party dependencies alone, especially Flyway and Liquibase.
- Remove `<loaderImplementation>CLASSIC</loaderImplementation>` and Gradle `loaderImplementation = ...CLASSIC`.
- In Maven uber jars, optional dependencies are no longer included unless `<includeOptional>true</includeOptional>` is set.
- Spring Retry dependency management is removed. If still used, specify an explicit version.
- Spring Authorization Server version overrides now flow through `spring-security.version` rather than `spring-authorization-server.version`.
- CycloneDX Gradle plugin must be at least `3.0.0`.
- If deploying a WAR to Tomcat, use `spring-boot-starter-tomcat-runtime`.

## Core code changes

- `BootstrapRegistry` moves from `org.springframework.boot` to `org.springframework.boot.bootstrap`.
- `EnvironmentPostProcessor` moves from the old `org.springframework.boot.env` package to `org.springframework.boot`.
- `PropertyMapper#alwaysApplyingWhenNonNull()` is removed. Use the default null-skipping behavior or `always()`.
- DevTools live reload is disabled by default. Enable it with `spring.devtools.livereload.enabled=true` if needed.

## Jackson changes

- Spring Boot 4 prefers Jackson 3.
- Many group IDs move from `com.fasterxml.jackson` to `tools.jackson`.
- `JsonObjectSerializer` becomes `ObjectValueSerializer`.
- `JsonValueDeserializer` becomes `ObjectValueDeserializer`.
- `Jackson2ObjectMapperBuilderCustomizer` becomes `JsonMapperBuilderCustomizer`.
- `@JsonComponent` becomes `@JacksonComponent`.
- `@JsonMixin` becomes `@JacksonMixin`.
- `spring.jackson.read.*` and `spring.jackson.write.*` move under `spring.jackson.json.read.*` and `spring.jackson.json.write.*`.
- `spring.jackson.parser.*` often maps to `spring.jackson.json.read.*`; use `JsonMapperBuilderCustomizer` when there is no direct property equivalent.
- Boot 4 auto-registers all Jackson modules found on the classpath. Disable with `spring.jackson.find-and-add-modules=false` if required.
- Temporary Jackson 2 bridge options:
  - Set `spring.jackson.use-jackson2-defaults=true`.
  - Add `org.springframework.boot:spring-boot-jackson2`.
  - Use `spring.jackson2.*` properties.

## Actuator and web changes

- Actuator endpoint parameters should use `org.jspecify.annotations.Nullable` instead of `org.springframework.lang.Nullable`.
- Liveness and readiness probes are enabled by default.
- `/fonts/**` is now part of common static resource locations.
- `spring.session.redis.*` becomes `spring.session.data.redis.*`.
- `spring.session.mongodb.*` becomes `spring.session.data.mongodb.*`.
- Boot `HttpMessageConverters` is deprecated. Prefer `ClientHttpMessageConvertersCustomizer` and `ServerHttpMessageConvertersCustomizer`.
- `server.forward-headers-strategy` no longer affects WAR deployment to an external container. Register `ForwardedHeaderFilter` explicitly when needed.
- Jersey 4 does not yet support Jackson 3. Use `spring-boot-jackson2` for Jersey JSON support when necessary.

## Data and messaging changes

- `RestClientBuilderCustomizer` becomes `Rest5ClientBuilderCustomizer` for Elasticsearch low-level client customization.
- `@EntityScan` import moves to `org.springframework.boot.persistence.autoconfigure.EntityScan`.
- `spring.dao.exceptiontranslation.enabled` becomes `spring.persistence.exceptiontranslation.enabled`.
- Many `spring.data.mongodb.*` connection properties move to `spring.mongodb.*`.
- Management Mongo properties rename `mongo` to `mongodb`.
- Explicitly set `spring.mongodb.representation.uuid` and `spring.data.mongodb.representation.big-decimal` when the representation matters.
- `hibernate-jpamodelgen` becomes `hibernate-processor`.
- `StreamBuilderFactoryBeanCustomizer` is removed in favor of `StreamsBuilderFactoryBeanConfigurer`.
- `spring.kafka.retry.topic.backoff.random` becomes `spring.kafka.retry.topic.backoff.jitter`.
- `RabbitRetryTemplateCustomizer` splits into `RabbitTemplateRetrySettingsCustomizer` and `RabbitListenerRetrySettingsCustomizer`.
- `spring-boot-starter-batch` now defaults to in-memory metadata. Use `spring-boot-starter-batch-jdbc` to keep JDBC-backed metadata.

## Testing changes

- `MockitoTestExecutionListener` is removed. Use `MockitoExtension` when plain Mockito fields stop working.
- `@SpringBootTest` no longer implies MockMvc support. Add `@AutoConfigureMockMvc`.
- HtmlUnit settings move under `@AutoConfigureMockMvc(htmlUnit = @HtmlUnit(...))`.
- `@SpringBootTest` no longer implies `WebClient` or `TestRestTemplate` beans.
- Add `@AutoConfigureTestRestTemplate` when keeping `TestRestTemplate`.
- Consider replacing `TestRestTemplate` with `RestTestClient` plus `@AutoConfigureRestTestClient`.
- `TestRestTemplate` now lives in `org.springframework.boot.resttestclient.TestRestTemplate`.
- Add test dependency `org.springframework.boot:spring-boot-resttestclient` and runtime dependency `org.springframework.boot:spring-boot-restclient` when keeping `TestRestTemplate`.
- `@PropertyMapping` moves to `org.springframework.boot.test.context`.
- `@MockBean` and `@SpyBean` are removed in favor of `@MockitoBean` and `@MockitoSpyBean`.
- Shared mocked beans should move from configuration classes to the test class or a composed annotation.

## External release notes to review

- Spring AMQP 4.0
- Spring Batch 6.0
- Spring Data 2025.1
- Spring GraphQL 2.0
- Spring Framework 7.0
- Spring Integration 7.0
- Spring for Apache Kafka 4.0
- Spring for Apache Pulsar 2.0
- Spring Security 7.0
- Spring REST Docs 4.0
- Spring Session 4.0
- Spring WS 5.0

## Cleanup criteria

- No classic starters remain unless intentionally retained as a temporary bridge.
- No properties-migrator dependency remains.
- No removed starter names or loader settings remain.
- No `@MockBean` or `@SpyBean` remain.
- No stale imports remain for moved Boot packages.
- Application starts cleanly on Spring Boot 4.0.0 and tests pass.
