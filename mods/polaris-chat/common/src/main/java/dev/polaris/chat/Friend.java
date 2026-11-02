package dev.polaris.chat;

import java.util.Locale;
import java.util.Map;

public record Friend(String code, String name, String uuid, long addedAt) {
    public static Friend from(Object raw) {
        Map<String, Object> map = Json.object(raw);
        String code = Json.string(map.get("code"), "").toUpperCase(Locale.ROOT);
        if (!ChatCodes.isCode(code)) return null;
        String name = ChatCodes.plain(Json.string(map.get("name"), code));
        if (name.isBlank()) name = code;
        String uuid = Json.string(map.get("uuid"), "");
        return new Friend(code, name, uuid, Json.number(map.get("addedAt"), 0));
    }
}
