package com.example.demo.adapter.in.messaging;

import com.example.demo.adapter.in.websocket.ClaimWebSocketHandler;
import com.example.demo.adapter.in.websocket.WebSocketMessage;
import com.example.demo.testsupport.KnownDefect;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * Risk 5: the consumer must understand the events that are REALLY produced. These payloads follow the
 * Debezium envelope for the {@code claims} table (snake_case columns) and the shape emitted by the
 * claims-service test endpoint, rather than whatever the consumer happens to parse.
 */
class ClaimEventCdcContractTest {

    private static final String CLAIM_ID = "5f2c1f44-8a0e-4b7e-9d1c-0f6a2f3b9c11";
    private static final String USER_ID = "b712e549-ffbb-427d-9fb3-c8e99908be71";
    private static final long EVENT_TIME_MS = 1_760_000_000_000L;

    private ClaimWebSocketHandler webSocketHandler;
    private ClaimEventKafkaConsumer consumer;

    @BeforeEach
    void setUp() {
        webSocketHandler = mock(ClaimWebSocketHandler.class);
        consumer = new ClaimEventKafkaConsumer(webSocketHandler, new ObjectMapper().registerModule(new JavaTimeModule()));
    }

    @Test
    void should_NotifyOwnerAndAdmins_When_DebeziumReportsAStatusUpdate() {
        consumer.consumeCdcEvent(debeziumEnvelope("u", "UNDER_REVIEW"));

        WebSocketMessage sent = captureUserAndAdminBroadcast();
        assertThat(sent.type()).isEqualTo("CLAIM_STATUS_CHANGED");
        assertThat(sent.claimId()).isEqualTo(CLAIM_ID);
        assertThat(sent.newStatus()).isEqualTo("UNDER_REVIEW");
    }

    @Test
    void should_NotifyAdmins_When_DebeziumReportsANewClaim() {
        consumer.consumeCdcEvent(debeziumEnvelope("c", "SUBMITTED"));

        var captor = ArgumentCaptor.forClass(WebSocketMessage.class);
        verify(webSocketHandler).broadcastToAdmins(captor.capture());
        assertThat(captor.getValue().type()).isEqualTo("CLAIM_SUBMITTED");
        assertThat(captor.getValue().claimId()).isEqualTo(CLAIM_ID);
    }

    @Test
    void should_IgnoreDeletesAndSnapshotReads() {
        consumer.consumeCdcEvent(debeziumEnvelope("d", "CLOSED"));
        consumer.consumeCdcEvent(debeziumEnvelope("r", "SUBMITTED"));

        verifyNoInteractions(webSocketHandler);
    }

    @Test
    void should_SurviveAMalformedMessage_WithoutBroadcastingAnything() {
        consumer.consumeCdcEvent("{ this is not json");

        verifyNoInteractions(webSocketHandler);
    }

    /** F-11: the claims-service test endpoint publishes {@code after.id}; the consumer reads {@code after.claim_id}. */
    @Test
    @KnownDefect("F-11")
    void should_ReadTheClaimId_When_EventComesFromTheClaimsServiceTestEndpoint() {
        String eventAsPublishedByTestEndpoint = """
                {"op":"u","after":{"id":"%s","status":"APPROVED","updated_at":%d},"ts_ms":%d}
                """.formatted(CLAIM_ID, EVENT_TIME_MS, EVENT_TIME_MS);

        consumer.consumeCdcEvent(eventAsPublishedByTestEndpoint);

        var captor = ArgumentCaptor.forClass(WebSocketMessage.class);
        verify(webSocketHandler).broadcastToAdmins(captor.capture());
        assertThat(captor.getValue().claimId()).isEqualTo(CLAIM_ID);
    }

    private WebSocketMessage captureUserAndAdminBroadcast() {
        var captor = ArgumentCaptor.forClass(WebSocketMessage.class);
        verify(webSocketHandler).broadcastToUserAndAdmins(eq(USER_ID), captor.capture());
        verify(webSocketHandler, never()).broadcastToAdmins(any());
        return captor.getValue();
    }

    private static String debeziumEnvelope(String operation, String status) {
        return """
                {"before":null,
                 "after":{"claim_id":"%s","user_id":"%s","status":"%s","claim_amount":250.0},
                 "source":{"connector":"postgresql","db":"demo_app","schema":"public","table":"claims"},
                 "op":"%s","ts_ms":%d}
                """.formatted(CLAIM_ID, USER_ID, status, operation, EVENT_TIME_MS);
    }
}