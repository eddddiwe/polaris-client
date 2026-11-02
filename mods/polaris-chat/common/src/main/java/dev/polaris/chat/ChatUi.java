package dev.polaris.chat;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Version-independent chat screen layout, drawing and hit testing. */
public final class ChatUi {
    public enum Action {
        NONE, CLOSE, SELECT, SEND, REFRESH, RETRY
    }

    public record Hit(Action action, String code) {
        public static final Hit NONE = new Hit(Action.NONE, null);
    }

    private static final int BACKDROP = 0xE0060812;
    private static final int PANEL = 0xF00B0D16;
    private static final int PANEL_2 = 0xFF121522;
    private static final int PANEL_3 = 0xFF171A29;
    private static final int LINE = 0xFF2B2647;
    private static final int TEXT = 0xFFEEF0FA;
    private static final int MUTED = 0xFF9AA3BE;
    private static final int DIM = 0xFF6F7894;
    private static final int ACCENT = 0xFFB4A0FF;
    private static final int ACCENT_SOFT = 0xFF2A2447;
    private static final int CYAN = 0xFF38E8FF;
    private static final int GOOD = 0xFF4ADE80;
    private static final int WARN = 0xFFFBBF24;
    private static final int BAD = 0xFFF87171;
    private static final int DARK_TEXT = 0xFF07101A;

    private static final int ROW_HEIGHT = 30;
    private static final int LINE_HEIGHT = 11;

    private int listX;
    private int listY;
    private int listW;
    private int listH;
    private int messagesX;
    private int messagesY;
    private int messagesW;
    private int messagesH;
    private int composerX;
    private int composerY;
    private int composerW;
    private int composerH;
    private int closeX;
    private int closeY;
    private int closeW = 18;
    private int closeH = 18;
    private int refreshX;
    private int refreshY;
    private int refreshW;
    private int refreshH;
    private int sendX;
    private int sendY;
    private int sendW = 54;
    private int sendH = 22;
    private int olderX;
    private int olderY;
    private int olderW;
    private int olderH;
    private int newerX;
    private int newerY;
    private int newerW;
    private int newerH;

    private final List<Row> rows = new ArrayList<>();
    private List<Line> cachedLines = List.of();
    private String cachedCode;
    private int cachedCount = -1;
    private String cachedLastId = "";
    private int cachedWidth = -1;
    private int listOffset;
    private int maxListOffset;
    private int pageOffset;
    private int maxPage;
    private int visibleLines;

    private record Row(String code, int x1, int y1, int x2, int y2) {
    }

    private record Line(String text, int color) {
    }

    public void render(Paint paint, PolarisChat chat, ChatInput input, int width, int height,
                       int mouseX, int mouseY, long now) {
        paint.fill(0, 0, width, height, BACKDROP);

        int margin = Math.max(14, Math.min(36, width / 40));
        int panelX = margin;
        int panelY = margin;
        int panelW = width - margin * 2;
        int panelH = height - margin * 2;
        paint.fill(panelX, panelY, panelX + panelW, panelY + panelH, PANEL);
        paint.fill(panelX, panelY, panelX + panelW, panelY + 1, LINE);
        paint.fill(panelX, panelY + panelH - 1, panelX + panelW, panelY + panelH, LINE);
        paint.fill(panelX, panelY, panelX + 1, panelY + panelH, LINE);
        paint.fill(panelX + panelW - 1, panelY, panelX + panelW, panelY + panelH, LINE);

        int headerH = 42;
        paint.fill(panelX + 14, panelY + 14, panelX + 26, panelY + 26, ACCENT);
        paint.text("POLARIS CHAT", panelX + 32, panelY + 17, ACCENT);

        closeX = panelX + panelW - 28;
        closeY = panelY + 12;
        paint.text("X", closeX + 5, closeY + 4, MUTED);
        refreshW = paint.width("Refresh");
        refreshX = closeX - refreshW - 16;
        refreshY = panelY + 12;
        refreshH = 16;
        paint.text("Refresh", refreshX, refreshY + 4, MUTED);

        String status = chat.status();
        String statusText = switch (status) {
            case "live" -> "Live";
            case "connecting" -> "Connecting";
            case "unavailable" -> "Sign in";
            default -> "Offline";
        };
        int statusColor = switch (status) {
            case "live" -> GOOD;
            case "connecting" -> WARN;
            case "unavailable" -> BAD;
            default -> DIM;
        };
        int statusW = paint.width(statusText);
        int statusX = refreshX - statusW - 16;
        paint.fill(statusX, panelY + 18, statusX + 6, panelY + 24, statusColor);
        paint.text(statusText, statusX + 10, panelY + 17, statusColor);

        int bodyY = panelY + headerH;
        int bodyH = panelH - headerH;

        listX = panelX + 12;
        listY = bodyY;
        listW = Math.max(180, Math.min(250, panelW / 3));
        listH = bodyH - 12;
        paint.fill(listX, listY, listX + listW, listY + listH, PANEL_3);
        paint.text("FRIENDS", listX + 10, listY + 9, DIM);
        if (!chat.friends().isEmpty()) {
            paint.text(String.valueOf(chat.friends().size()), listX + listW - 24, listY + 9, DIM);
        }
        paint.fill(listX + 8, listY + 22, listX + listW - 8, listY + 23, LINE);

        rows.clear();
        int rowTop = listY + 26;
        int visibleRows = Math.max(1, (listH - 30) / ROW_HEIGHT);
        maxListOffset = Math.max(0, chat.friends().size() - visibleRows);
        listOffset = clamp(listOffset, 0, maxListOffset);
        List<Friend> friends = chat.friends();
        if (friends.isEmpty()) {
            paint.text("No friends yet.", listX + 10, rowTop + 4, DIM);
            paint.text("Add them in the launcher.", listX + 10, rowTop + 16, DIM);
        } else {
            for (int i = 0; i < visibleRows; i++) {
                int index = i + listOffset;
                if (index >= friends.size()) break;
                Friend friend = friends.get(index);
                int y = rowTop + i * ROW_HEIGHT;
                boolean active = friend.code().equals(chat.selected());
                boolean hover = mouseX >= listX + 6 && mouseX <= listX + listW - 6
                        && mouseY >= y && mouseY < y + ROW_HEIGHT - 2;
                int rowColor = active ? ACCENT_SOFT : hover ? PANEL_2 : PANEL_3;
                paint.fill(listX + 6, y, listX + listW - 6, y + ROW_HEIGHT - 2, rowColor);
                int nameColor = active ? TEXT : MUTED;
                paint.text(fit(paint, friend.name(), listW - 56), listX + 12, y + 6, nameColor);
                int count = chat.unread(friend.code());
                if (count > 0) {
                    String label = count > 99 ? "99+" : String.valueOf(count);
                    paint.text(label, listX + listW - 18 - paint.width(label), y + 6, CYAN);
                }
                paint.text(fit(paint, friend.code(), listW - 24), listX + 12, y + 17, DIM);
                rows.add(new Row(friend.code(), listX + 6, y, listX + listW - 6, y + ROW_HEIGHT - 2));
            }
            if (maxListOffset > 0) {
                paint.text("scroll", listX + listW - 46, listY + listH - 12, DIM);
            }
        }

        int threadX = listX + listW + 12;
        int threadW = panelX + panelW - 12 - threadX;
        String selected = chat.selected();
        Friend selectedFriend = null;
        for (Friend friend : friends) {
            if (friend.code().equals(selected)) selectedFriend = friend;
        }

        paint.fill(listX + listW, bodyY, listX + listW + 1, bodyY + listH, LINE);

        composerH = 30;
        composerY = panelY + panelH - 26 - composerH;
        composerX = threadX + 4;
        composerW = threadW - 8 - sendW - 8;
        messagesX = threadX + 6;
        messagesY = bodyY + 34;
        messagesW = threadW - 16;
        messagesH = composerY - messagesY - 22;
        visibleLines = Math.max(1, messagesH / LINE_HEIGHT);

        if (selectedFriend == null) {
            paint.centered("Select a friend", threadX + threadW / 2, bodyY + 40, MUTED);
            paint.centered("Your chats stay between the two of you.", threadX + threadW / 2, bodyY + 54, DIM);
            drawStatusNote(paint, chat, threadX, bodyY, threadW);
            return;
        }

        paint.text(selectedFriend.name(), threadX + 4, bodyY + 8, TEXT);
        paint.text(selectedFriend.code(), threadX + 4, bodyY + 20, DIM);

        int threadRight = threadX + threadW;
        String older = "Older";
        String newer = "Newer";
        olderW = paint.width(older);
        newerW = paint.width(newer);
        olderX = threadRight - olderW - 4;
        olderY = bodyY + 8;
        olderH = 10;
        newerX = olderX - newerW - 12;
        newerY = bodyY + 8;
        newerH = 10;
        if (pageOffset < maxPage) paint.text(older, olderX, olderY, ACCENT);
        if (pageOffset > 0) paint.text(newer, newerX, newerY, ACCENT);

        List<Line> lines = buildLines(paint, chat, selected, messagesW);
        maxPage = Math.max(0, lines.size() - visibleLines);
        pageOffset = clamp(pageOffset, 0, maxPage);
        int end = Math.max(0, lines.size() - pageOffset);
        int start = Math.max(0, end - visibleLines);
        int y = messagesY;
        if (lines.isEmpty()) {
            if (chat.isLoading(selected)) {
                paint.text("Loading messages...", messagesX, messagesY + 4, DIM);
            } else {
                paint.text("No messages yet. Say hello.", messagesX, messagesY + 4, DIM);
            }
        } else {
            for (int i = start; i < end; i++) {
                Line line = lines.get(i);
                paint.text(fit(paint, line.text(), messagesW), messagesX, y, line.color());
                y += LINE_HEIGHT;
            }
        }

        String typing = chat.typingName(selected);
        int hintY = composerY - 14;
        if (typing != null) {
            paint.text(typing + " is typing...", messagesX, hintY, CYAN);
        } else if (!chat.error().isEmpty()) {
            paint.text(fit(paint, chat.error(), messagesW), messagesX, hintY, BAD);
        }

        paint.fill(composerX, composerY, composerX + composerW, composerY + composerH, PANEL_2);
        paint.fill(composerX, composerY, composerX + composerW, composerY + 1, LINE);
        paint.fill(composerX, composerY + composerH - 1, composerX + composerW, composerY + composerH, LINE);
        String draft = input.text();
        String placeholder = "Message " + selectedFriend.name() + "...";
        int textX = composerX + 8;
        int textY = composerY + 10;
        int textW = composerW - 16;
        if (draft.isEmpty()) {
            paint.text(fit(paint, placeholder, textW), textX, textY, DIM);
        } else {
            String shown = fitTail(paint, draft, textW - 6);
            paint.text(shown, textX, textY, TEXT);
            if (now % 1000 < 550) {
                int caret = textX + paint.width(shown) + 1;
                paint.fill(caret, textY - 1, caret + 1, textY + 9, ACCENT);
            }
        }

        sendX = composerX + composerW + 8;
        sendY = composerY + 4;
        boolean canSend = !draft.trim().isEmpty();
        paint.fill(sendX, sendY, sendX + sendW, sendY + sendH, canSend ? ACCENT : PANEL_3);
        paint.centered("Send", sendX + sendW / 2, sendY + 7, canSend ? DARK_TEXT : DIM);
        paint.text("Enter to send - Esc to close", messagesX, composerY + composerH + 6, DIM);
        if (draft.length() > 700) {
            String count = draft.length() + "/" + ChatCodes.MAX_TEXT;
            paint.text(count, composerX + composerW - paint.width(count), composerY + composerH + 6,
                    draft.length() >= ChatCodes.MAX_TEXT ? BAD : DIM);
        }
    }

    public Hit click(int mouseX, int mouseY, int button, PolarisChat chat, ChatInput input) {
        if (button != 0) return Hit.NONE;
        if (inside(mouseX, mouseY, closeX, closeY, closeW, closeH)) return new Hit(Action.CLOSE, null);
        if (inside(mouseX, mouseY, refreshX, refreshY, refreshW, refreshH)) return new Hit(Action.REFRESH, null);
        if (inside(mouseX, mouseY, sendX, sendY, sendW, sendH)
                && chat.selected() != null && !input.text().trim().isEmpty()) {
            return new Hit(Action.SEND, null);
        }
        if (inside(mouseX, mouseY, olderX, olderY, olderW, olderH) && pageOffset < maxPage) {
            pageOffset = clamp(pageOffset + visibleLines, 0, maxPage);
            return Hit.NONE;
        }
        if (inside(mouseX, mouseY, newerX, newerY, newerW, newerH) && pageOffset > 0) {
            pageOffset = clamp(pageOffset - visibleLines, 0, maxPage);
            return Hit.NONE;
        }
        for (Row row : rows) {
            if (inside(mouseX, mouseY, row.x1(), row.y1(), row.x2() - row.x1(), row.y2() - row.y1())) {
                pageOffset = 0;
                return new Hit(Action.SELECT, row.code());
            }
        }
        return Hit.NONE;
    }

    public void scroll(int mouseX, int mouseY, double amount) {
        if (amount == 0) return;
        if (inside(mouseX, mouseY, listX, listY, listW, listH)) {
            listOffset = clamp(listOffset - (int) Math.signum(amount), 0, maxListOffset);
        } else if (inside(mouseX, mouseY, messagesX, messagesY, messagesW, messagesH)) {
            pageOffset = clamp(pageOffset + (int) Math.round(amount * 3), 0, maxPage);
        }
    }

    private void drawStatusNote(Paint paint, PolarisChat chat, int x, int y, int width) {
        String status = chat.status();
        if ("unavailable".equals(status)) {
            paint.centered("Chat is unavailable.", x + width / 2, y + 78, WARN);
            paint.centered("Launch Minecraft from Polaris with a Microsoft account.", x + width / 2, y + 92, DIM);
        } else if ("offline".equals(status)) {
            paint.centered(chat.error().isEmpty() ? "Polaris chat is offline." : chat.error(),
                    x + width / 2, y + 78, MUTED);
        }
    }

    private List<Line> buildLines(Paint paint, PolarisChat chat, String selected, int maxWidth) {
        List<ChatMessage> messages = chat.thread(selected);
        String lastId = messages.isEmpty() ? "" : messages.get(messages.size() - 1).id();
        if (selected.equals(cachedCode) && messages.size() == cachedCount
                && lastId.equals(cachedLastId) && maxWidth == cachedWidth) {
            return cachedLines;
        }
        List<Line> lines = new ArrayList<>();
        for (ChatMessage message : messages) {
            boolean mine = message.from().equals(chat.myCode());
            String prefix = mine ? "You: " : message.fromName() + ": ";
            int color = mine ? 0xFFD8D0FF : TEXT;
            List<String> wrapped = wrap(paint, prefix + message.text(), maxWidth);
            for (String line : wrapped) lines.add(new Line(line, color));
            lines.add(new Line("", color));
        }
        cachedCode = selected;
        cachedCount = messages.size();
        cachedLastId = lastId;
        cachedWidth = maxWidth;
        cachedLines = List.copyOf(lines);
        return cachedLines;
    }

    private static List<String> wrap(Paint paint, String text, int maxWidth) {
        List<String> out = new ArrayList<>();
        for (String paragraph : text.split("\n", -1)) {
            if (paragraph.isEmpty()) {
                out.add("");
                continue;
            }
            String current = "";
            for (String word : paragraph.split(" ")) {
                String candidate = current.isEmpty() ? word : current + " " + word;
                if (paint.width(candidate) <= maxWidth) {
                    current = candidate;
                    continue;
                }
                if (!current.isEmpty()) out.add(current);
                current = "";
                String rest = word;
                while (paint.width(rest) > maxWidth && rest.length() > 1) {
                    int cut = rest.length() - 1;
                    while (cut > 1 && paint.width(rest.substring(0, cut)) > maxWidth) cut--;
                    out.add(rest.substring(0, cut));
                    rest = rest.substring(cut);
                }
                current = rest;
            }
            out.add(current);
        }
        return out;
    }

    private static String fit(Paint paint, String text, int maxWidth) {
        if (paint.width(text) <= maxWidth) return text;
        String suffix = "...";
        int end = text.length();
        while (end > 1 && paint.width(text.substring(0, end) + suffix) > maxWidth) end--;
        return text.substring(0, end) + suffix;
    }

    private static String fitTail(Paint paint, String text, int maxWidth) {
        if (paint.width(text) <= maxWidth) return text;
        int start = 0;
        while (start < text.length() - 1 && paint.width(text.substring(start)) > maxWidth) start++;
        return text.substring(start);
    }

    private static boolean inside(int mx, int my, int x, int y, int w, int h) {
        return mx >= x && mx < x + w && my >= y && my < y + h;
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    public static String lower(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }
}
