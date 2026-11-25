package com.example.demo.testsupport;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.extension.ExtendWith;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a test that asserts the CORRECT behaviour of something that is currently broken.
 *
 * <p>While the defect exists the assertion failure is reported as an aborted ("expected failure") test, so
 * the build stays green and the defect stays visible. When the defect is fixed the test starts passing, and
 * this extension then fails it with a message to remove the marker. Only assertion failures are treated as
 * the defect: any other exception (infrastructure, a bug in the test) still fails the test.
 *
 * <p>Run with {@code -Dqa.knownDefects=fail} to see the raw assertion failures.
 * The value is the finding ID in evidence/01-Application-Risk-Assessment.docx.
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.METHOD, ElementType.TYPE})
@Tag("known-defect")
@ExtendWith(KnownDefectExtension.class)
public @interface KnownDefect {
    String value();
}