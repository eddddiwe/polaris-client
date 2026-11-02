package dev.polaris.chat;

import java.util.Locale;
import java.util.Map;

public record ChatMessage(String id, String from, String to, String fromName, String text, long createdAt) {
    public static ChatMessage from(Object raw) {
        Map<String, Object> map = Json.object(raw);
        String id = Json.string(map.get("id"), "");
        String from = Json.string(map.get("from"), "").toUpperCase(Locale.ROOT);
        String to = Json.string(map.get("to"), "").toUpperCase(Locale.ROOT);
        String text = ChatCodes.plainMessage(Json.string(map.get("text"), ""));
        if (!ChatCodes.isId(id) || !ChatCodes.isCode(from) || !ChatCodes.isCode(to)) return null;
        if (text.isBlank() || text.length() > ChatCodes.MAX_TEXT) return null;
        String name = ChatCodes.plain(Json.string(map.get("fromName"), from)).trim();
        if (name.isEmpty()) name = from;
        if (name.length() > 32) name = name.substring(0, 32);
        return new ChatMessage(id, from, to, name, text, Json.number(map.get("createdAt"), 0));
    }
}
