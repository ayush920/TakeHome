package com.example.demo.testsupport;

import org.junit.jupiter.api.extension.AfterTestExecutionCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.junit.jupiter.api.extension.TestExecutionExceptionHandler;
import org.junit.jupiter.api.extension.ExtensionContext.Namespace;
import org.opentest4j.AssertionFailedError;
import org.opentest4j.TestAbortedException;

class KnownDefectExtension implements TestExecutionExceptionHandler, AfterTestExecutionCallback {

    private static final String REPORT_AS_FAILURE_PROPERTY = "qa.knownDefects";
    private static final Namespace NAMESPACE = Namespace.create(KnownDefectExtension.class);
    private static final String DEFECT_OBSERVED = "defectObserved";

    @Override
    public void handleTestExecutionException(ExtensionContext context, Throwable thrown) throws Throwable {
        if (reportAsFailure() || !(thrown instanceof AssertionError)) {
            throw thrown;
        }
        context.getStore(NAMESPACE).put(DEFECT_OBSERVED, true);
        throw new TestAbortedException("Known defect " + findingId(context) + " still present: " + thrown.getMessage(), thrown);
    }

    @Override
    public void afterTestExecution(ExtensionContext context) {
        boolean defectObserved = context.getStore(NAMESPACE).getOrDefault(DEFECT_OBSERVED, Boolean.class, false);
        if (!reportAsFailure() && !defectObserved && context.getExecutionException().isEmpty()) {
            throw new AssertionFailedError("Known defect " + findingId(context)
                    + " appears to be fixed: remove @KnownDefect from this test");
        }
    }

    private static boolean reportAsFailure() {
        return "fail".equals(System.getProperty(REPORT_AS_FAILURE_PROPERTY));
    }

    private static String findingId(ExtensionContext context) {
        return context.getRequiredTestMethod().getAnnotation(KnownDefect.class) != null
                ? context.getRequiredTestMethod().getAnnotation(KnownDefect.class).value()
                : context.getRequiredTestClass().getAnnotation(KnownDefect.class).value();
    }
}