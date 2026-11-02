package dev.polaris.chat;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class JsonTest {
    @Test
    void parsesObjectsArraysAndEscapes() {
        Object value = Json.parse("{\"a\":1,\"b\":[\"x\\n\\\"y\\\"\",true,null],\"c\":{\"d\":false}}");
        Map<String, Object> object = Json.object(value);
        assertEquals(1.0, object.get("a"));
        List<Object> list = Json.array(object.get("b"));
        assertEquals("x\n\"y\"", list.get(0));
        assertEquals(Boolean.TRUE, list.get(1));
        assertEquals(Boolean.FALSE, Json.object(object.get("c")).get("d"));
    }

    @Test
    void stringifiesWithoutExternalDependencies() {
        Map<String, Object> payload = new java.util.LinkedHashMap<>();
        payload.put("friendCode", "POLARIS-AB34-CD56");
        payload.put("text", "line \"one\"\nline two");
        String json = Json.stringify(payload);
        assertEquals(
                "{\"friendCode\":\"POLARIS-AB34-CD56\",\"text\":\"line \\\"one\\\"\\nline two\"}",
                json
        );
    }

    @Test
    void rejectsTrailingAndMalformedInput() {
        assertThrows(IllegalArgumentException.class, () -> Json.parse("{} extra"));
        assertThrows(IllegalArgumentException.class, () -> Json.parse("{\"a\":}"));
        assertThrows(IllegalArgumentException.class, () -> Json.parse(""));
    }
}
