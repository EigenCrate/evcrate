#!/usr/bin/env python3
from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
import re

DOT = chr(46)
ALLOWED_SUFFIXES = {
    f"{DOT}java",
    f"{DOT}kt",
    f"{DOT}groovy",
    f"{DOT}gradle",
    f"{DOT}kts",
    f"{DOT}properties",
    f"{DOT}yml",
    f"{DOT}yaml",
    f"{DOT}xml",
}

@dataclass(frozen=True)
class Check:
    severity: str
    pattern: str
    message: str


CHECKS = [
    Check("critical", "spring-boot-starter-undertow", "Undertow support is removed; move to Tomcat, Jetty, or an external Servlet 6.1 container."),
    Check("high", "spring-boot-starter-web-services", "Replace deprecated starter with spring-boot-starter-webservices."),
    Check("high", "spring-boot-starter-web", "Replace deprecated starter with spring-boot-starter-webmvc unless a classic starter is being used temporarily."),
    Check("high", "spring-boot-starter-oauth2-client", "Replace deprecated starter with spring-boot-starter-security-oauth2-client."),
    Check("high", "spring-boot-starter-oauth2-resource-server", "Replace deprecated starter with spring-boot-starter-security-oauth2-resource-server."),
    Check("high", "spring-boot-starter-oauth2-authorization-server", "Replace deprecated starter with spring-boot-starter-security-oauth2-authorization-server."),
    Check("medium", "spring-boot-starter-aop", "Review whether AspectJ is needed, then replace with spring-boot-starter-aspectj."),
    Check("high", "loaderImplementation>CLASSIC<", "Remove classic loader configuration; the classic uber-jar loader is removed."),
    Check("high", "LoaderImplementation.CLASSIC", "Remove classic loader configuration from Gradle; the classic uber-jar loader is removed."),
    Check("medium", "launchScript(", "Embedded executable launch scripts are removed; keep a normal boot jar and run with java -jar or another launcher."),
    Check("medium", "embeddedLaunchScript", "Embedded executable launch scripts are removed; remove this configuration."),
    Check("medium", "spring-authorization-server.version", "Version override property is removed; use spring-security.version if an override is still required."),
    Check("medium", "spring-retry", "Spring Retry dependency management is removed; verify an explicit compatible version or migrate to Spring Framework retry support."),
    Check("medium", "org.springframework.boot.BootstrapRegistry", "Update import to org.springframework.boot.bootstrap.BootstrapRegistry."),
    Check("medium", "EnvironmentPostProcessor", "Review EnvironmentPostProcessor imports; the old Boot env package is no longer correct."),
    Check("medium", "alwaysApplyingWhenNonNull()", "PropertyMapper#alwaysApplyingWhenNonNull() is removed; use default behavior or always()."),
    Check("medium", "JsonObjectSerializer", "Rename to ObjectValueSerializer."),
    Check("medium", "JsonValueDeserializer", "Rename to ObjectValueDeserializer."),
    Check("medium", "Jackson2ObjectMapperBuilderCustomizer", "Rename to JsonMapperBuilderCustomizer."),
    Check("medium", "@JsonComponent", "Review migration to @JacksonComponent."),
    Check("medium", "@JsonMixin", "Review migration to @JacksonMixin."),
    Check("medium", "spring.jackson.read.", "Move property under spring.jackson.json.read."),
    Check("medium", "spring.jackson.write.", "Move property under spring.jackson.json.write."),
    Check("medium", "spring.jackson.parser.", "Review mapping to spring.jackson.json.read or move customization into JsonMapperBuilderCustomizer."),
    Check("medium", "spring.session.redis.", "Rename property prefix to spring.session.data.redis."),
    Check("medium", "spring.session.mongodb.", "Rename property prefix to spring.session.data.mongodb."),
    Check("medium", "spring.dao.exceptiontranslation.enabled", "Rename property to spring.persistence.exceptiontranslation.enabled."),
    Check("medium", "spring.kafka.retry.topic.backoff.random", "Rename property to spring.kafka.retry.topic.backoff.jitter."),
    Check("medium", "org.springframework.boot.autoconfigure.orm.jpa.EntityScan", "Update import to org.springframework.boot.persistence.autoconfigure.EntityScan."),
    Check("medium", "RestClientBuilderCustomizer", "Elasticsearch low-level client customization now uses Rest5ClientBuilderCustomizer."),
    Check("medium", "StreamBuilderFactoryBeanCustomizer", "Replace with StreamsBuilderFactoryBeanConfigurer."),
    Check("medium", "RabbitRetryTemplateCustomizer", "Replace with RabbitTemplateRetrySettingsCustomizer or RabbitListenerRetrySettingsCustomizer."),
    Check("medium", "HttpMessageConverters", "Boot HttpMessageConverters is deprecated; prefer client or server converter customizers."),
    Check("high", "@MockBean", "Replace with @MockitoBean. Shared mocks in configuration classes need a different pattern."),
    Check("high", "@SpyBean", "Replace with @MockitoSpyBean."),
    Check("high", "MockitoTestExecutionListener", "Listener is removed; use MockitoExtension where plain Mockito fields stop working."),
    Check("medium", "org.springframework.boot.test.autoconfigure.properties.PropertyMapping", "Update import to org.springframework.boot.test.context.PropertyMapping."),
    Check("medium", "org.springframework.boot.test.web.client.TestRestTemplate", "Update import to org.springframework.boot.resttestclient.TestRestTemplate and add new dependencies."),
    Check("medium", "spring.data.mongodb.host", "Move MongoDB connection properties to spring.mongodb.* where applicable."),
    Check("medium", "spring.data.mongodb.uri", "Move MongoDB connection properties to spring.mongodb.* where applicable."),
    Check("medium", "management.health.mongo.", "Rename management mongo properties to management.*.mongodb.*."),
]


def iter_files(root: Path):
    for path in root.rglob("*"):
        parts = path.parts[1:]
        if any(part.startswith(DOT) for part in parts):
            continue
        if any(part in {"out", ("tar" "get"), ("__py" "cache__")} for part in parts):
            continue
        if path.is_file() and path.stat().st_size <= 2_000_000 and (path.suffix in ALLOWED_SUFFIXES or path.name in {"pom.xml", "spring.factories"}):
            yield path


def detect_version(label: str, pattern: str, text: str):
    match = re.search(pattern, text, re.MULTILINE)
    return f"{label}: {match.group(1)}" if match else None


def collect_versions(text: str):
    patterns = [
        ("java.version", r"<java\.version>\s*([^<]+)\s*</java\.version>"),
        ("sourceCompatibility", r"sourceCompatibility\s*=\s*['\"]?([^'\"]+)"),
        ("targetCompatibility", r"targetCompatibility\s*=\s*['\"]?([^'\"]+)"),
        ("Kotlin plugin", r'kotlin\(["\'][^"\']+["\']\)\s+version\s+["\']([^"\']+)'),
        ("Kotlin plugin", r'id\(["\']org\.jetbrains\.kotlin\.[^"\']+["\']\)\s+version\s+["\']([^"\']+)'),
        ("Spring Boot plugin", r'spring-boot(?:-dependencies)?[:"]\s*([0-9][^"\s<)]*)'),
        ("Spring Boot BOM", r"<artifactId>spring-boot-dependencies</artifactId>\s*<version>([^<]+)</version>"),
        ("CycloneDX plugin", r'id\(["\']org\.cyclonedx\.bom["\']\)\s+version\s+["\']([^"\']+)'),
    ]
    found, seen = [], set()
    for label, pattern in patterns:
        item = detect_version(label, pattern, text)
        if item and item not in seen:
            found.append(item)
            seen.add(item)
    return found


def contextual_findings(path: Path, text: str):
    findings = []
    if "@SpringBootTest" in text and "MockMvc" in text and "@AutoConfigureMockMvc" not in text:
        findings.append(("high", path, "@SpringBootTest with MockMvc no longer auto-configures MockMvc; add @AutoConfigureMockMvc."))
    if "@SpringBootTest" in text and "TestRestTemplate" in text and "@AutoConfigureTestRestTemplate" not in text and "@AutoConfigureRestTestClient" not in text:
        findings.append(("high", path, "@SpringBootTest no longer provides TestRestTemplate; add @AutoConfigureTestRestTemplate or migrate to RestTestClient."))
    if "@SpringBootTest" in text and "WebClient" in text and "@AutoConfigureRestTestClient" not in text:
        findings.append(("medium", path, "@SpringBootTest no longer provides WebClient beans implicitly; review test configuration."))
    if ("@Configuration" in text or "@TestConfiguration" in text) and ("@MockBean" in text or "@SpyBean" in text):
        findings.append(("high", path, "Shared mocks in configuration classes must move to test classes or a composed annotation using @MockitoBean or @MockitoSpyBean."))
    if "<packaging>war</packaging>" in text and "spring-boot-starter-tomcat" in text:
        findings.append(("medium", path, "WAR deployment to Tomcat should use spring-boot-starter-tomcat-runtime."))
    return findings


def matches_pattern(line: str, pattern: str) -> bool:
    # Avoid substring false positives for token-like checks.
    if any(token in pattern for token in ["spring-boot-starter-", "HttpMessageConverters", "@MockBean", "@SpyBean"]):
        escaped = re.escape(pattern)
        return re.search(rf"(?<![A-Za-z0-9_-]){escaped}(?![A-Za-z0-9_-])", line) is not None
    return pattern in line


def is_comment_line(line: str) -> bool:
    stripped = line.strip()
    return (
        stripped.startswith("<!--")
        or stripped.startswith("--")
        or stripped.startswith("//")
        or stripped.startswith("/*")
        or stripped.startswith("*")
        or stripped.startswith("#")
    )


def main():
    parser = argparse.ArgumentParser(description="Audit a repository for Spring Boot 4 migration risks.")
    parser.add_argument("root", nargs="?", default=".", help="Repository root to scan")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    files = {}
    for path in iter_files(root):
        try:
            files[path] = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

    print(f"Spring Boot 4 audit root: {root}")
    print(f"Scanned files: {len(files)}")

    versions = collect_versions("\n".join(files.values()))
    if versions:
        print("\nDetected versions")
        for item in versions:
            print(f"- {item}")

    findings = []
    for path, text in files.items():
        for check in CHECKS:
            for line_no, line in enumerate(text.splitlines(), start=1):
                if is_comment_line(line):
                    continue
                if matches_pattern(line, check.pattern):
                    findings.append((check.severity, path, line_no, check.message))
                    break
        for severity, cpath, message in contextual_findings(path, text):
            findings.append((severity, cpath, 1, message))

    if not findings:
        print("\nNo Spring Boot 4 migration signatures found.")
        print("Still verify Java, Spring Boot, and Spring portfolio versions manually.")
        return

    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    findings.sort(key=lambda item: (order.get(item[0], 9), str(item[1]), item[2], item[3]))

    print("\nFindings")
    for severity, path, line_no, message in findings:
        rel = path.relative_to(root)
        print(f"- [{severity}] {rel}:{line_no} {message}")

    print("\nNext step")
    print("- Read references/migration-checklist.md and references/starter-and-module-mapping.md.")
    print("- Fix critical and high findings first, then compile and run tests.")


if __name__ == "__main__":
    main()
