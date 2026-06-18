# Starter and Module Mapping

## Module naming model

Spring Boot 4 modularizes support more aggressively.

- Main modules use `spring-boot-<technology>`.
- Main packages use `org.springframework.boot.<technology>`.
- Starters use `spring-boot-starter-<technology>`.
- Test modules use `spring-boot-<technology>-test`.
- Test starters use `spring-boot-starter-<technology>-test`.

Use moved imports as a signal that a focused starter is missing.

## Temporary bridge starters

Use these only to get a large codebase compiling while imports and starters are being corrected:

- `spring-boot-starter` -> `spring-boot-starter-classic`
- `spring-boot-starter-test` -> `spring-boot-starter-test-classic`

Remove them after the migration stabilizes.

## Deprecated starter replacements

- `spring-boot-starter-oauth2-authorization-server` -> `spring-boot-starter-security-oauth2-authorization-server`
- `spring-boot-starter-oauth2-client` -> `spring-boot-starter-security-oauth2-client`
- `spring-boot-starter-oauth2-resource-server` -> `spring-boot-starter-security-oauth2-resource-server`
- `spring-boot-starter-web` -> `spring-boot-starter-webmvc`
- `spring-boot-starter-web-services` -> `spring-boot-starter-webservices`
- `spring-boot-starter-aop` -> `spring-boot-starter-aspectj`

## Common explicit starter changes

- Flyway:
  use `spring-boot-starter-flyway`
- Liquibase:
  use `spring-boot-starter-liquibase`
- Security tests:
  use `spring-boot-starter-security-test`
- Batch with JDBC metadata:
  use `spring-boot-starter-batch-jdbc`
- WAR deployment to Tomcat:
  use `spring-boot-starter-tomcat-runtime`
- Keeping `TestRestTemplate`:
  add `spring-boot-resttestclient` and `spring-boot-restclient`
- Temporary Jackson 2 compatibility:
  add `spring-boot-jackson2`

## Package moves and replacements

- `org.springframework.boot.BootstrapRegistry`
  -> `org.springframework.boot.bootstrap.BootstrapRegistry`
- old `org.springframework.boot.env` `EnvironmentPostProcessor`
  -> `org.springframework.boot.EnvironmentPostProcessor`
- `org.springframework.boot.autoconfigure.orm.jpa.EntityScan`
  -> `org.springframework.boot.persistence.autoconfigure.EntityScan`
- `org.springframework.boot.test.autoconfigure.properties.PropertyMapping`
  -> `org.springframework.boot.test.context.PropertyMapping`
- `org.springframework.boot.test.web.client.TestRestTemplate`
  -> `org.springframework.boot.resttestclient.TestRestTemplate`

## Annotation replacements

- `@MockBean` -> `@MockitoBean`
- `@SpyBean` -> `@MockitoSpyBean`
- `@JsonComponent` -> `@JacksonComponent`
- `@JsonMixin` -> `@JacksonMixin`

## Property renames

- `spring.session.redis.*`
  -> `spring.session.data.redis.*`
- `spring.session.mongodb.*`
  -> `spring.session.data.mongodb.*`
- `spring.dao.exceptiontranslation.enabled`
  -> `spring.persistence.exceptiontranslation.enabled`
- `spring.kafka.retry.topic.backoff.random`
  -> `spring.kafka.retry.topic.backoff.jitter`
- `spring.jackson.read.*`
  -> `spring.jackson.json.read.*`
- `spring.jackson.write.*`
  -> `spring.jackson.json.write.*`

### MongoDB connection properties

Many connection-oriented properties move from `spring.data.mongodb.*` to `spring.mongodb.*`, including:

- `additional-hosts`
- `authentication-database`
- `database`
- `host`
- `password`
- `port`
- `protocol`
- `replica-set-name`
- `representation.uuid`
- `ssl.bundle`
- `ssl.enabled`
- `uri`
- `username`

Management properties also rename `mongo` to `mongodb`, for example:

- `management.health.mongodb.enabled`
- `management.metrics.mongodb.command.enabled`
- `management.metrics.mongodb.connectionpool.enabled`

Properties that still require Spring Data MongoDB remain under `spring.data.mongodb.*`, such as:

- `auto-index-creation`
- `field-naming-strategy`
- `gridfs.bucket`
- `gridfs.database`
- `repositories.type`

## Code patterns that need review

- `alwaysApplyingWhenNonNull()` on `PropertyMapper`
- `JsonObjectSerializer`
- `JsonValueDeserializer`
- `Jackson2ObjectMapperBuilderCustomizer`
- `HttpMessageConverters`
- `RestClientBuilderCustomizer`
- `StreamBuilderFactoryBeanCustomizer`
- `RabbitRetryTemplateCustomizer`
- `MockitoTestExecutionListener`
- `loaderImplementation = ...CLASSIC`
- `<loaderImplementation>CLASSIC</loaderImplementation>`

## Test-specific gaps to expect

- `@SpringBootTest` no longer brings MockMvc automatically.
- `@SpringBootTest` no longer brings `WebClient` or `TestRestTemplate` automatically.
- Shared mocks in configuration classes must move to the test class or a composed annotation.

## Decision rule for classic starters

- Use classic starters only when many imports or auto-configurations break at once.
- Remove them as soon as focused starters can be named and added explicitly.
