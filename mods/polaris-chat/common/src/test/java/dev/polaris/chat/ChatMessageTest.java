package dev.polaris.chat;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class ChatMessageTest {
    private static Map<String, Object> raw(String from, String to, String text) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", "11111111-1111-4111-8111-111111111111");
        map.put("from", from);
        map.put("to", to);
        map.put("fromName", "Nova");
        map.put("text", text);
        map.put("createdAt", 1_793_635_000_000d);
        return map;
    }

    @Test
    void acceptsAValidFriendMessage() {
        ChatMessage message = ChatMessage.from(raw("POLARIS-ZX89-QW23", "POLARIS-AB34-CD56", "hello"));
        assertEquals("POLARIS-ZX89-QW23", message.from());
        assertEquals("hello", message.text());
        assertEquals(1_793_635_000_000L, message.createdAt());
    }

    @Test
    void rejectsBadCodesEmptyTextAndOversizedPayloads() {
        assertNull(ChatMessage.from(raw("POLARIS-IO01-ABCD", "POLARIS-AB34-CD56", "hello")));
        assertNull(ChatMessage.from(raw("POLARIS-ZX89-QW23", "POLARIS-AB34-CD56", "   ")));
        String longText = "x".repeat(ChatCodes.MAX_TEXT + 1);
        assertNull(ChatMessage.from(raw("POLARIS-ZX89-QW23", "POLARIS-AB34-CD56", longText)));
    }

    @Test
    void clampsDisplayNames() {
        Map<String, Object> map = raw("POLARIS-ZX89-QW23", "POLARIS-AB34-CD56", "hello");
        map.put("fromName", "N".repeat(40));
        assertEquals(32, ChatMessage.from(map).fromName().length());
    }
}
