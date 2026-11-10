package dev.polaris.chat;

/** Plain text composer buffer; code-point aware so emoji are not split. */
public final class ChatInput {
    private final StringBuilder text = new StringBuilder();

    public String text() {
        return text.toString();
    }

    public boolean isEmpty() {
        return text.isEmpty();
    }

    public void clear() {
        text.setLength(0);
    }

    /** Replaces the composer contents, keeping the same printable/limit rules. */
    public void setText(String value) {
        text.setLength(0);
        if (value == null) return;
        value.codePoints().forEach(this::append);
    }

    public void append(int codePoint) {
        if (codePoint < 32 || codePoint == 127) return;
        if (text.codePointCount(0, text.length()) >= ChatCodes.MAX_TEXT) return;
        text.appendCodePoint(codePoint);
    }

    public void backspace() {
        if (text.isEmpty()) return;
        text.delete(text.offsetByCodePoints(text.length(), -1), text.length());
    }
}
