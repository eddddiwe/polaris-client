package dev.polaris.chat;

import java.util.regex.Pattern;

final class ChatCodes {
    static final int MAX_TEXT = 800;
    private static final Pattern CODE = Pattern.compile("^POLARIS-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$");
    private static final Pattern ID = Pattern.compile("^[0-9a-f-]{8,64}$", Pattern.CASE_INSENSITIVE);

    private ChatCodes() {
    }

    static boolean isCode(String value) {
        return value != null && CODE.matcher(value).matches();
    }

    static boolean isId(String value) {
        return value != null && ID.matcher(value).matches();
    }

    static String plain(String text) {
        return sanitize(text, false);
    }

    static String plainMessage(String text) {
        return sanitize(text, true);
    }

    private static String sanitize(String text, boolean keepNewlines) {
        StringBuilder out = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (keepNewlines && (c == '\n' || c == '\t')) {
                out.append(c);
                continue;
            }
            if (c == '\u00a7' || c < 0x20 || (c >= 0x7f && c <= 0x9f)
                    || (c >= 0x200b && c <= 0x200f) || (c >= 0x202a && c <= 0x202e)
                    || (c >= 0x2066 && c <= 0x2069) || c == 0xfeff) {
                continue;
            }
            out.append(c);
        }
        return out.toString();
    }

    static String oneLine(String text) {
        return text.replace('\n', ' ').replace('\r', ' ').trim();
    }
}
