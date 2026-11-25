package com.example.demo.adapter.in.web;

import com.example.demo.application.exceptions.UnauthorizedClaimAccessException;
import com.example.demo.application.exceptions.UserNotFoundException;
import com.example.demo.domain.claim.ClaimNotFoundException;
import com.example.demo.domain.claim.InvalidClaimException;
import com.example.demo.domain.claim.InvalidStatusTransitionException;
import com.example.demo.testsupport.KnownDefect;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.method.annotation.ExceptionHandlerMethodResolver;

import java.lang.reflect.Method;
import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Risk 3: every business exception must be translated into a deliberate HTTP status. The advice is
 * resolved the way Spring MVC resolves it (by exception type), so a missing handler is caught here
 * instead of surfacing as an HTTP 500 in production.
 */
class ClaimExceptionHandlerCoverageTest {

    private static final String MESSAGE = "reason the request was refused";

    private ClaimExceptionHandler handler;
    private ExceptionHandlerMethodResolver resolver;

    @BeforeEach
    void setUp() {
        handler = new ClaimExceptionHandler(mock(ErrorTypeConstants.class));
        resolver = new ExceptionHandlerMethodResolver(ClaimExceptionHandler.class);
    }

    static Stream<Arguments> handledExceptions() {
        return Stream.of(
                Arguments.of(new ClaimNotFoundException(UUID.randomUUID()), HttpStatus.NOT_FOUND),
                Arguments.of(new UnauthorizedClaimAccessException(UUID.randomUUID(), UUID.randomUUID()), HttpStatus.FORBIDDEN),
                Arguments.of(new InvalidClaimException(MESSAGE), HttpStatus.BAD_REQUEST),
                Arguments.of(new UserNotFoundException(MESSAGE), HttpStatus.BAD_REQUEST)
        );
    }

    @ParameterizedTest(name = "{0} is answered with {1}")
    @MethodSource("handledExceptions")
    void should_TranslateBusinessExceptionToItsStatus(Exception exception, HttpStatus expectedStatus) throws Exception {
        Method method = resolver.resolveMethod(exception);

        assertThat(method).as("a handler exists for %s", exception.getClass().getSimpleName()).isNotNull();
        ProblemDetail problem = (ProblemDetail) method.invoke(handler, exception);
        assertThat(problem.getStatus()).isEqualTo(expectedStatus.value());
        assertThat(problem.getDetail()).isNotBlank();
    }

    @Test
    @KnownDefect("F-04")
    void should_TranslateInvalidStatusTransitionToAClientError() {
        var exception = new InvalidStatusTransitionException(MESSAGE);

        Method method = resolver.resolveMethod(exception);

        assertThat(method)
                .as("InvalidStatusTransitionException needs a handler, otherwise the API answers 500")
                .isNotNull();
    }
}