package com.example.demo.adapter.out.claimsservice;

import com.example.bff.adapter.out.claims.ApiClient;
import com.example.demo.application.auth.ServiceAccountTokenProvider;
import com.example.demo.testsupport.KnownDefect;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Risk 2 / F-03: the adapter is a singleton that shares one ApiClient and re-assigns its bearer token on
 * every call. Two users submitting at the same time can therefore have their requests sent upstream with
 * each other's token, so a claim is stored under the wrong owner.
 *
 * <p>This runs the REAL generated ApiClient against an in-process HTTP server that echoes back the token it
 * received, so no mock can hide the race.
 */
class ClaimsServiceAdapterConcurrencyTest {

    private static final int SUBMISSIONS_PER_USER = 40;
    private static final int MAX_BURSTS = 5;
    private static final int SERVER_THREADS = 32;
    private static final String ALICE_TOKEN = "token-of-alice";
    private static final String BOB_TOKEN = "token-of-bob";

    private HttpServer claimsServiceStub;
    private ExecutorService callers;
    private ClaimsServiceAdapter adapter;

    @BeforeEach
    void setUp() throws IOException {
        claimsServiceStub = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        claimsServiceStub.setExecutor(Executors.newFixedThreadPool(SERVER_THREADS));
        claimsServiceStub.createContext("/api/claims", exchange -> {
            String received = exchange.getRequestHeaders().getFirst("Authorization");
            byte[] body = claimJsonDescribedBy(received).getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(201, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        claimsServiceStub.start();

        ApiClient apiClient = new ApiClient();
        apiClient.setBasePath("http://127.0.0.1:" + claimsServiceStub.getAddress().getPort());
        adapter = new ClaimsServiceAdapter(
                apiClient, mock(ServiceAccountTokenProvider.class), new ObjectMapper().findAndRegisterModules());
        callers = Executors.newFixedThreadPool(SERVER_THREADS);
    }

    @AfterEach
    void tearDown() {
        callers.shutdownNow();
        claimsServiceStub.stop(0);
    }

    @Test
    @KnownDefect("F-03")
    void should_SendEachUsersOwnTokenUpstream_When_TwoUsersSubmitConcurrently() throws Exception {
        List<String> wrongTokens = new ArrayList<>();

        for (int burst = 0; burst < MAX_BURSTS && wrongTokens.isEmpty(); burst++) {
            wrongTokens.addAll(submitConcurrentlyAndCollectMismatches());
        }

        assertThat(wrongTokens)
                .as("requests that reached the claims service carrying another user's token")
                .isEmpty();
    }

    @Test
    void should_SendTheCallersToken_When_OneUserSubmitsAlone() {
        var record = adapter.submitClaim(ALICE_TOKEN, LocalDate.of(2026, 1, 10), "Orchard Road", "x", BigDecimal.TEN);

        assertThat(record.description()).isEqualTo("Bearer " + ALICE_TOKEN);
    }

    private List<String> submitConcurrentlyAndCollectMismatches() throws Exception {
        CountDownLatch startTogether = new CountDownLatch(1);
        List<Future<String>> pending = new ArrayList<>();
        for (int i = 0; i < SUBMISSIONS_PER_USER; i++) {
            pending.add(submitAs(ALICE_TOKEN, startTogether));
            pending.add(submitAs(BOB_TOKEN, startTogether));
        }
        startTogether.countDown();

        List<String> mismatches = new ArrayList<>();
        for (Future<String> result : pending) {
            String outcome = result.get();
            if (outcome != null) mismatches.add(outcome);
        }
        return mismatches;
    }

    /** @return null when the upstream saw the expected token, otherwise a description of the mix-up */
    private Future<String> submitAs(String userToken, CountDownLatch startTogether) {
        return callers.submit(() -> {
            startTogether.await();
            var record = adapter.submitClaim(userToken, LocalDate.of(2026, 1, 10), "Orchard Road", "x", BigDecimal.TEN);
            String expected = "Bearer " + userToken;
            return expected.equals(record.description()) ? null : "sent " + userToken + " but upstream saw " + record.description();
        });
    }

    private static String claimJsonDescribedBy(String receivedAuthorization) {
        return """
                {"claimId":"%s","userId":"%s","incidentDate":"2026-01-10","incidentLocation":"Orchard Road",
                 "description":"%s","claimAmount":10.0,"status":"SUBMITTED",
                 "createdAt":"2026-01-10T10:00:00Z","updatedAt":"2026-01-10T10:00:00Z"}
                """.formatted(java.util.UUID.randomUUID(), java.util.UUID.randomUUID(), receivedAuthorization);
    }
}