package dev.polaris.chat;

import java.util.ArrayList;
import java.util.List;

/**
 * Chat screen styled like the bundled PolarisConfig menu: centred panel,
 * header mark and version pill, dark sidebar, card rows, accent pills and a
 * footer action bar.
 */
public final class ChatUi {
    public enum Action {
        NONE, CLOSE, SELECT, SEND, REFRESH
    }

    public record Hit(Action action, String code) {
        public static final Hit NONE = new Hit(Action.NONE, null);
    }

    record Row(String code, int x1, int y1, int x2, int y2) {
    }

    record Rect(int x, int y, int w, int h) {
        boolean inside(int mx, int my) {
            return mx >= x && mx < x + w && my >= y && my < y + h;
        }

        int centerX() {
            return x + w / 2;
        }

        int centerY() {
            return y + h / 2;
        }
    }

    // PolarisConfig palette (same values as the shipped mod).
    private static final int BACKDROP = 0xFF03040A;
    private static final int PANEL = 0xFF0D0F18;
    private static final int PANEL_HI = 0xFF161B2B;
    private static final int SIDEBAR = 0xFF080A12;
    private static final int CARD = 0x10FFFFFF;
    private static final int CARD_HOVER = 0x1AFFFFFF;
    private static final int HAIRLINE = 0x24FFFFFF;
    private static final int TEXT = 0xFFEEF0FA;
    private static final int MUTED = 0xFF8C95B1;
    private static final int DIM = 0xFF8A93AD;
    private static final int ACCENT = 0xFFB4A0FF;
    private static final int ACCENT_SOFT = 0xFF38E8FF;
    private static final int CYAN = 0xFF22D3EE;
    private static final int GOOD = 0xFF4ADE80;
    private static final int WARN = 0xFFFBBF24;
    private static final int BAD = 0xFFFF6B81;
    private static final int DARK_TEXT = 0xFF07101A;

    private static final String[] MARK = {
            "...##...", "..####..", ".######.", "########",
            ".######.", "..####..", ".##..##.", "........"
    };
    private static final String[] CHAT_ICON = {
            "..####..", ".######.", "########", "########",
            "########", ".######.", "..####..", "...##..."
    };

    private static final int BASE_WIDTH = 820;
    private static final int BASE_HEIGHT = 520;

    private final List<Row> rows = new ArrayList<>();
    private List<Card> cachedCards = List.of();
    private String cachedCode;
    private int cachedCount = -1;
    private String cachedLastId = "";
    private String cachedLastText = "";
    private int cachedWidth = -1;
    private int cachedHeight = -1;

    private int panelX;
    private int panelY;
    private int panelW;
    private int panelH;
    private boolean compact;
    private float scale = 1f;

    private int sidebarX;
    private int sidebarY;
    private int sidebarW;
    private int sidebarH;
    private int contentX;
    private int contentY;
    private int contentW;
    private int contentH;

    private Rect closeButton = new Rect(0, 0, 0, 0);
    private Rect refreshButton = new Rect(0, 0, 0, 0);
    private Rect sendButton = new Rect(0, 0, 0, 0);
    private Rect olderButton = new Rect(0, 0, 0, 0);
    private Rect newerButton = new Rect(0, 0, 0, 0);
    private Rect messagesBox = new Rect(0, 0, 0, 0);
    private Rect sidebarBox = new Rect(0, 0, 0, 0);

    private int listOffset;
    private int maxListOffset;
    private int pageOffset;
    private int maxPage;

    record Card(int top, int height, String name, int nameColor, String time, List<String> text) {
    }

    public void render(Paint paint, PolarisChat chat, ChatInput input, int width, int height,
                       int mouseX, int mouseY, long now) {
        // Never let a click hit last frame's geometry if this frame returns early.
        closeButton = new Rect(0, 0, 0, 0);
        refreshButton = new Rect(0, 0, 0, 0);
        sendButton = new Rect(0, 0, 0, 0);
        olderButton = new Rect(0, 0, 0, 0);
        newerButton = new Rect(0, 0, 0, 0);
        messagesBox = new Rect(0, 0, 0, 0);
        sidebarBox = new Rect(0, 0, 0, 0);

        // Minecraft's GUI scale already handles DPI. Clamp the panel to the
        // logical screen instead of shrinking the text, like PolarisConfig.
        scale = 1f;
        panelW = Math.min(width - 12, BASE_WIDTH);
        panelH = Math.min(height - 8, BASE_HEIGHT);
        panelX = (width - panelW) / 2;
        panelY = (height - panelH) / 2;

        paint.fill(0, 0, width, height, withAlpha(BACKDROP, 216));
        roundRect(paint, panelX - 2, panelY - 2, panelW + 4, panelH + 4, radius(14), withAlpha(ACCENT, 35));
        roundRect(paint, panelX, panelY, panelW, panelH, radius(13), withAlpha(PANEL, 246));
        roundRectOutline(paint, panelX, panelY, panelW, panelH, radius(13), withAlpha(ACCENT, 48));

        compact = panelH < 320;
        int headerH = size(compact ? 48 : 60);
        int footerH = size(compact ? 32 : 48);
        int sideW = Math.min(size(204), Math.max(size(132), panelW / 4));
        sideW = Math.min(sideW, Math.max(size(40), panelW - size(80)));
        sidebarX = panelX;
        sidebarY = panelY + headerH;
        sidebarW = sideW;
        sidebarH = panelH - headerH - footerH;
        contentX = panelX + sidebarW + size(18);
        contentY = panelY + headerH + size(compact ? 6 : 14);
        contentW = Math.max(size(24), panelX + panelW - contentX - size(18));
        contentH = panelH - headerH - footerH - size(28);

        drawHeader(paint, chat, width, height, mouseX, mouseY, headerH);
        drawSidebar(paint, chat, mouseX, mouseY);
        drawFooter(paint, chat, mouseX, mouseY, footerH);
        drawContent(paint, chat, input, mouseX, mouseY, now);
    }

    // ------------------------------------------------------------------ header

    private void drawHeader(Paint paint, PolarisChat chat, int width, int height, int mouseX, int mouseY,
                            int headerH) {
        int x = panelX + size(18);
        int y = panelY + size(16);
        drawIcon(paint, x, y + size(1), size(18), MARK, ACCENT);

        int titleX = x + size(28);
        paint.text("Polaris Chat", titleX, y + size(2), TEXT);
        int titleW = paint.width("Polaris Chat");

        String version = "v1.0.0";
        int pillH = size(13);
        int pillW = paint.width(version) + size(12);
        int pillX = titleX + titleW + size(9);
        int pillY = y - size(1);
        pill(paint, pillX, pillY, pillW, pillH, withAlpha(0xFFFFFF, 16));
        pillOutline(paint, pillX, pillY, pillW, pillH, withAlpha(ACCENT, 58));
        paint.centered(version, pillX + pillW / 2, pillY + size(3), ACCENT_SOFT);

        String key = "F9";
        String label = "CHAT KEY";
        int keyW = Math.max(paint.width(key), paint.width(label)) + size(18);
        int keyH = size(28);
        int keyX = panelX + panelW - size(18) - keyW;
        paint.text(fit(paint, "Friend messages - 30-day history",
                keyX - titleX - size(10)), titleX, y + size(17), DIM);
        int keyY = panelY + size(14);
        boolean keyHover = mouseX >= keyX && mouseX < keyX + keyW && mouseY >= keyY && mouseY < keyY + keyH;
        pill(paint, keyX, keyY, keyW, keyH, withAlpha(0xFFFFFF, keyHover ? 24 : 12));
        pillOutline(paint, keyX, keyY, keyW, keyH, withAlpha(ACCENT, keyHover ? 100 : 50));
        paint.centered(label, keyX + keyW / 2, keyY + size(4), DIM);
        paint.centered(key, keyX + keyW / 2, keyY + size(14), TEXT);

        fadeLine(paint, panelX + size(18), panelY + headerH - 1, panelW - size(36), size(1),
                withAlpha(ACCENT, 90));
    }

    // ----------------------------------------------------------------- sidebar

    private void drawSidebar(Paint paint, PolarisChat chat, int mouseX, int mouseY) {
        roundRect(paint, sidebarX, sidebarY, sidebarW, sidebarH, radius(12), withAlpha(SIDEBAR, 236));
        // Soft gradient divider on the sidebar edge, like PolarisConfig.
        int segments = 14;
        for (int i = 0; i < segments; i++) {
            float t = (float) i / (segments - 1);
            float a = (float) Math.sin(Math.PI * t) * 0.55f;
            int top = sidebarY + Math.round((float) sidebarH * i / segments);
            int h = Math.max(1, sidebarH / segments + 1);
            paint.fill(sidebarX + sidebarW - 1, top, sidebarX + sidebarW, top + h,
                    withAlpha(0xFF8B5CF6, Math.round(120 * a)));
        }

        paint.text("CHATS", sidebarX + size(18), sidebarY + size(12), DIM);

        sidebarBox = new Rect(sidebarX + size(8), sidebarY + size(26),
                sidebarW - size(16), sidebarH - size(26) - size(compact ? 50 : 58));

        rows.clear();
        int rowH = size(32);
        int rowX = sidebarX + size(10);
        int rowW = sidebarW - size(20);
        int rowTop = sidebarY + size(28);
        int visible = Math.max(1, sidebarBox.h / rowH);
        List<Friend> friends = chat.friends();
        maxListOffset = Math.max(0, friends.size() - visible);
        listOffset = clamp(listOffset, 0, maxListOffset);

        if (friends.isEmpty()) {
            paint.text("No friends yet.", rowX + size(4), rowTop + size(6), DIM);
            paint.text("Add them in the launcher.", rowX + size(4), rowTop + size(19), DIM);
        } else {
            for (int i = 0; i < visible; i++) {
                int index = i + listOffset;
                if (index >= friends.size()) break;
                Friend friend = friends.get(index);
                int y = rowTop + i * rowH;
                boolean active = friend.code().equals(chat.selected());
                boolean hover = mouseX >= rowX && mouseX < rowX + rowW && mouseY >= y && mouseY < y + rowH - size(3);
                float t = active ? 1f : hover ? 0.55f : 0f;
                if (t > 0f) {
                    roundRect(paint, rowX, y, rowW, rowH - size(3), radius(9),
                            active ? withAlpha(mix(ACCENT, PANEL, 0.8f), 225) : withAlpha(0xFFFFFF, 13));
                    if (active) {
                        roundRect(paint, rowX + size(3), y + size(9), size(3), rowH - size(21),
                                size(1), ACCENT);
                        roundRectOutline(paint, rowX + size(2), y + size(8), size(5), rowH - size(19),
                                size(2), withAlpha(ACCENT, 60));
                    }
                }
                int iconColor = active ? ACCENT : mix(DIM, TEXT, 0.35f + 0.45f * t);
                drawIcon(paint, rowX + size(10), y + (rowH - size(8)) / 2 - size(2), size(8), CHAT_ICON, iconColor);
                int nameColor = active ? TEXT : mix(MUTED, TEXT, t);
                int unread = chat.unread(friend.code());
                int textW = rowW - size(16) - (unread > 0 ? size(28) : 0);
                boolean showCode = sidebarW >= size(180);
                int nameY = showCode ? y + size(7) : y + size(11);
                paint.text(fit(paint, friend.name(), textW), rowX + size(24), nameY, nameColor);
                if (showCode) {
                    paint.text(fit(paint, friend.code(), rowW - size(16)),
                            rowX + size(24), y + size(18), DIM);
                }

                if (unread > 0) {
                    String badge = unread > 99 ? "99+" : String.valueOf(unread);
                    int badgeW = paint.width(badge) + size(8);
                    int badgeH = size(12);
                    int badgeX = rowX + rowW - badgeW - size(7);
                    int badgeY = y + (rowH - size(3) - badgeH) / 2;
                    pill(paint, badgeX, badgeY, badgeW, badgeH, withAlpha(ACCENT_SOFT, 210));
                    paint.centered(badge, badgeX + badgeW / 2, badgeY + size(3), DARK_TEXT);
                }
                rows.add(new Row(friend.code(), rowX, y, rowX + rowW, y + rowH - size(3)));
            }
        }

        int footerH = size(compact ? 18 : 20);
        int footerX = sidebarX + size(12);
        int footerY = sidebarY + sidebarH - size(compact ? 44 : 52);
        int footerW = sidebarW - size(24);
        pill(paint, footerX, footerY, footerW, footerH, withAlpha(0xFFFFFF, 12));
        pillOutline(paint, footerX, footerY, footerW, footerH, withAlpha(0xFF8B5CF6, 46));
        circle(paint, footerX + size(10), footerY + footerH / 2, size(4), withAlpha(ACCENT, 220));
        paint.text("Polaris Client", footerX + size(20), footerY + size(6), MUTED);
        paint.text("In-game chat", footerX + size(2), footerY + footerH + size(6), DIM);
    }

    // ----------------------------------------------------------------- content

    private void drawContent(Paint paint, PolarisChat chat, ChatInput input, int mouseX, int mouseY, long now) {
        String status = chat.status();
        if ("unavailable".equals(status)) {
            paint.centered("Chat is unavailable", contentX + contentW / 2, contentY + size(42), WARN);
            paint.centered("Launch Minecraft from Polaris with a Microsoft account.",
                    contentX + contentW / 2, contentY + size(58), DIM);
            return;
        }

        String selected = chat.selected();
        Friend friend = null;
        for (Friend item : chat.friends()) {
            if (item.code().equals(selected)) friend = item;
        }
        if (friend == null) {
            paint.centered("Select a conversation", contentX + contentW / 2, contentY + size(42), MUTED);
            paint.centered("Choose a friend on the left to start chatting.",
                    contentX + contentW / 2, contentY + size(58), DIM);
            return;
        }

        paint.text(fit(paint, friend.name(), contentW - size(120)), contentX, contentY + size(2), TEXT);
        String code = fit(paint, friend.code(), contentW - size(24));
        int codeW = paint.width(code) + size(12);
        pill(paint, contentX, contentY + size(14), codeW, size(13), withAlpha(0xFFFFFF, 10));
        pillOutline(paint, contentX, contentY + size(14), codeW, size(13), withAlpha(ACCENT, 40));
        paint.text(code, contentX + size(6), contentY + size(17), DIM);

        int olderW = paint.width("Older") + size(16);
        int newerW = paint.width("Newer") + size(16);
        int navY = contentY + size(2);
        int navH = size(16);
        olderButton = new Rect(contentX + contentW - olderW, navY, olderW, navH);
        newerButton = new Rect(olderButton.x() - newerW - size(6), navY, newerW, navH);
        if (pageOffset < maxPage) {
            pill(paint, olderButton.x(), olderButton.y(), olderButton.w(), olderButton.h(),
                    withAlpha(0xFFFFFF, 10));
            pillOutline(paint, olderButton.x(), olderButton.y(), olderButton.w(), olderButton.h(), HAIRLINE);
            paint.centered("Older", olderButton.centerX(), olderButton.y() + size(4), ACCENT);
        }
        if (pageOffset > 0) {
            pill(paint, newerButton.x(), newerButton.y(), newerButton.w(), newerButton.h(),
                    withAlpha(0xFFFFFF, 10));
            pillOutline(paint, newerButton.x(), newerButton.y(), newerButton.w(), newerButton.h(), HAIRLINE);
            paint.centered("Newer", newerButton.centerX(), newerButton.y() + size(4), ACCENT);
        }

        int composerH = size(compact ? 24 : 30);
        int composerY = panelY + panelH - size(compact ? 32 : 48) - size(compact ? 8 : 18) - composerH;
        int composerW = Math.max(size(20), contentW - size(62));
        int messagesY = contentY + size(compact ? 30 : 34);
        int messagesH = Math.max(size(24), composerY - messagesY - size(14));
        messagesBox = new Rect(contentX, messagesY, contentW, messagesH);

        List<Card> cards = buildCards(paint, chat, selected, contentW, messagesH);
        int total = cards.isEmpty() ? 0 : cards.get(cards.size() - 1).top() + cards.get(cards.size() - 1).height();
        maxPage = Math.max(0, total - messagesH);
        pageOffset = clamp(pageOffset, 0, maxPage);
        int windowTop = total - pageOffset - messagesH;
        int windowBottom = total - pageOffset;

        if (chat.isLoading(selected) && cards.isEmpty()) {
            paint.text("Loading messages...", contentX, messagesY + size(4), DIM);
        } else if (cards.isEmpty()) {
            paint.text("No messages yet. Say hello.", contentX, messagesY + size(4), DIM);
        } else {
            for (Card card : cards) {
                if (card.top() < windowTop || card.top() + card.height() > windowBottom) continue;
                drawCard(paint, card, contentX, messagesY + card.top() - windowTop, contentW);
            }
        }

        int hintY = composerY - size(14);
        String typing = chat.typingName(selected);
        if (typing != null) {
            paint.text(typing + " is typing...", contentX, hintY, ACCENT_SOFT);
        } else if (!chat.error().isEmpty()) {
            paint.text(fit(paint, chat.error(), contentW), contentX, hintY, BAD);
        }

        roundRect(paint, contentX, composerY, composerW, composerH, radius(9), CARD);
        roundRectOutline(paint, contentX, composerY, composerW, composerH, radius(9), HAIRLINE);
        int textX = contentX + size(8);
        int textY = composerY + size(compact ? 8 : 10);
        int textW = composerW - size(16);
        String draft = input.text();
        if (draft.isEmpty()) {
            paint.text(fit(paint, "Message " + friend.name() + "...", textW), textX, textY, DIM);
        } else {
            String shown = fitTail(paint, draft, textW - size(6));
            paint.text(shown, textX, textY, TEXT);
            if (now % 1000 < 550) {
                int caret = textX + paint.width(shown) + 1;
                paint.fill(caret, textY - 1, caret + 1, textY + 9, ACCENT);
            }
        }

        int sendH = size(compact ? 18 : 22);
        sendButton = new Rect(contentX + composerW + size(8), composerY + (composerH - sendH) / 2,
                size(compact ? 44 : 54), sendH);
        boolean canSend = !draft.trim().isEmpty();
        pill(paint, sendButton.x(), sendButton.y(), sendButton.w(), sendButton.h(),
                canSend ? ACCENT : withAlpha(0xFFFFFF, 10));
        if (!canSend) {
            pillOutline(paint, sendButton.x(), sendButton.y(), sendButton.w(), sendButton.h(), HAIRLINE);
        }
        paint.centered("Send", sendButton.centerX(), sendButton.y() + size(compact ? 5 : 7), canSend ? DARK_TEXT : DIM);
        paint.text("Enter to send - Esc to close", contentX, composerY + composerH + size(compact ? 4 : 6), DIM);
        if (draft.length() > 700) {
            String count = draft.length() + "/" + ChatCodes.MAX_TEXT;
            paint.text(count, contentX + contentW - paint.width(count),
                    composerY + composerH + size(compact ? 4 : 6), draft.length() >= ChatCodes.MAX_TEXT ? BAD : DIM);
        }
    }

    private void drawCard(Paint paint, Card card, int x, int y, int width) {
        roundRect(paint, x, y, width, card.height(), radius(8), CARD);
        roundRectOutline(paint, x, y, width, card.height(), radius(8), HAIRLINE);
        int textY;
        if (card.name().isEmpty()) {
            textY = y + size(4);
        } else {
            int timeW = card.time().isEmpty() ? 0 : paint.width(card.time()) + size(8);
            paint.text(fit(paint, card.name(), width - size(16) - timeW),
                    x + size(8), y + size(3), card.nameColor());
            if (!card.time().isEmpty()) {
                paint.text(card.time(), x + width - size(8) - paint.width(card.time()), y + size(3), DIM);
            }
            textY = y + size(12);
        }
        for (String line : card.text()) {
            paint.text(fit(paint, line, width - size(16)), x + size(8), textY, TEXT);
            textY += size(8);
        }
    }

    private List<Card> buildCards(Paint paint, PolarisChat chat, String code, int width, int maxHeight) {
        List<ChatMessage> messages = chat.thread(code);
        String lastId = messages.isEmpty() ? "" : messages.get(messages.size() - 1).id();
        String lastText = messages.isEmpty() ? "" : messages.get(messages.size() - 1).text();
        if (code.equals(cachedCode) && messages.size() == cachedCount
                && lastId.equals(cachedLastId) && lastText.equals(cachedLastText)
                && width == cachedWidth && maxHeight == cachedHeight) {
            return cachedCards;
        }

        List<Card> cards = new ArrayList<>();
        int top = 0;
        int lineH = size(8);
        int maxLines = Math.max(1, (Math.max(size(24), maxHeight) - size(12) - size(2)) / lineH);
        for (ChatMessage message : messages) {
            boolean mine = message.from().equals(chat.myCode());
            String name = mine ? "You" : message.fromName();
            int nameColor = mine ? ACCENT_SOFT : ACCENT;
            List<String> wrapped = wrap(paint, message.text(), width - size(16));
            int offset = 0;
            boolean first = true;
            while (offset < wrapped.size()) {
                int count = Math.min(maxLines, wrapped.size() - offset);
                List<String> chunk = new ArrayList<>(wrapped.subList(offset, offset + count));
                String cardName = first ? name : "";
                String cardTime = first ? clock(message.createdAt()) : "";
                int height = (first ? size(12) : size(6)) + count * lineH + size(2);
                cards.add(new Card(top, height, cardName, nameColor, cardTime, chunk));
                top += height + size(3);
                offset += count;
                first = false;
            }
        }
        cachedCode = code;
        cachedCount = messages.size();
        cachedLastId = lastId;
        cachedLastText = lastText;
        cachedWidth = width;
        cachedHeight = maxHeight;
        cachedCards = List.copyOf(cards);
        return cards;
    }

    // ------------------------------------------------------------------ footer

    private void drawFooter(Paint paint, PolarisChat chat, int mouseX, int mouseY, int footerH) {
        int y = panelY + panelH - footerH;
        paint.fill(panelX + size(18), y, panelX + panelW - size(18), y + 1, HAIRLINE);

        String status = chat.status();
        String label = switch (status) {
            case "live" -> "Live";
            case "connecting" -> "Connecting";
            case "unavailable" -> "Sign in";
            default -> "Offline";
        };
        int color = switch (status) {
            case "live" -> GOOD;
            case "connecting" -> WARN;
            case "unavailable" -> BAD;
            default -> DIM;
        };
        int textY = y + size(20);
        circle(paint, panelX + size(22), textY + size(3), size(6), withAlpha(color, 230));
        paint.text(label, panelX + size(30), textY, color);
        if (!chat.error().isEmpty()) {
            int errorX = panelX + size(30) + paint.width(label) + size(12);
            paint.text(fit(paint, chat.error(), panelX + panelW - errorX - size(190)), errorX, textY, BAD);
        }

        int buttonH = size(24);
        int buttonY = y + (footerH - buttonH) / 2;
        int closeW = size(58);
        closeButton = new Rect(panelX + panelW - size(18) - closeW, buttonY, closeW, buttonH);
        pill(paint, closeButton.x(), closeButton.y(), closeButton.w(), closeButton.h(), ACCENT);
        paint.centered("Close", closeButton.centerX(), closeButton.y() + size(8), DARK_TEXT);

        int refreshW = paint.width("Refresh") + size(16);
        refreshButton = new Rect(closeButton.x() - refreshW - size(8), buttonY, refreshW, buttonH);
        pill(paint, refreshButton.x(), refreshButton.y(), refreshButton.w(), refreshButton.h(),
                withAlpha(0xFFFFFF, 10));
        pillOutline(paint, refreshButton.x(), refreshButton.y(), refreshButton.w(), refreshButton.h(), HAIRLINE);
        paint.centered("Refresh", refreshButton.centerX(), refreshButton.y() + size(8), MUTED);
    }

    // ------------------------------------------------------------------- input

    public Hit click(int mouseX, int mouseY, int button, PolarisChat chat, ChatInput input) {
        if (button != 0) return Hit.NONE;
        if (closeButton.inside(mouseX, mouseY)) return new Hit(Action.CLOSE, null);
        if (refreshButton.inside(mouseX, mouseY)) return new Hit(Action.REFRESH, null);
        if (sendButton.inside(mouseX, mouseY) && chat.selected() != null && !input.text().trim().isEmpty()) {
            return new Hit(Action.SEND, null);
        }
        if (olderButton.inside(mouseX, mouseY) && pageOffset < maxPage) {
            pageOffset = clamp(pageOffset + messagesBox.h, 0, maxPage);
            return Hit.NONE;
        }
        if (newerButton.inside(mouseX, mouseY) && pageOffset > 0) {
            pageOffset = clamp(pageOffset - messagesBox.h, 0, maxPage);
            return Hit.NONE;
        }
        for (Row row : rows) {
            if (mouseX >= row.x1() && mouseX < row.x2() && mouseY >= row.y1() && mouseY < row.y2()) {
                pageOffset = 0;
                return new Hit(Action.SELECT, row.code());
            }
        }
        return Hit.NONE;
    }

    public void scroll(int mouseX, int mouseY, double amount) {
        if (amount == 0) return;
        if (sidebarBox.inside(mouseX, mouseY)) {
            listOffset = clamp(listOffset - (int) Math.signum(amount), 0, maxListOffset);
        } else if (messagesBox.inside(mouseX, mouseY)) {
            pageOffset = clamp(pageOffset + (int) Math.round(amount * 40), 0, maxPage);
        }
    }

    // ------------------------------------------------------------------ helpers

    List<Row> friendRows() {
        return List.copyOf(rows);
    }

    Rect sendBox() {
        return sendButton;
    }

    Rect closeBox() {
        return closeButton;
    }

    private int size(float value) {
        return Math.max(1, Math.round(value * scale));
    }

    private int radius(int value) {
        return Math.max(1, Math.round(value * scale));
    }

    private static int withAlpha(int color, int alpha) {
        return (color & 0x00FFFFFF) | ((clamp(alpha, 0, 255)) << 24);
    }

    private static int mix(int a, int b, float t) {
        float clamped = Math.max(0f, Math.min(1f, t));
        int aa = (a >>> 24) & 0xFF;
        int ar = (a >> 16) & 0xFF;
        int ag = (a >> 8) & 0xFF;
        int ab = a & 0xFF;
        int ba = (b >>> 24) & 0xFF;
        int br = (b >> 16) & 0xFF;
        int bg = (b >> 8) & 0xFF;
        int bb = b & 0xFF;
        int alpha = Math.round(aa + (ba - aa) * clamped);
        int red = Math.round(ar + (br - ar) * clamped);
        int green = Math.round(ag + (bg - ag) * clamped);
        int blue = Math.round(ab + (bb - ab) * clamped);
        return (alpha << 24) | (red << 16) | (green << 8) | blue;
    }

    private static void roundRect(Paint paint, int x, int y, int w, int h, int r, int color) {
        if (w <= 0 || h <= 0) return;
        r = Math.min(r, Math.min(w / 2, h / 2));
        if (r <= 0) {
            paint.fill(x, y, x + w, y + h, color);
            return;
        }
        paint.fill(x + r, y + r, x + w - r, y + h - r, color);
        for (int i = 0; i < r; i++) {
            int dy = r - i - 1;
            int inset = r - (int) Math.round(Math.sqrt((double) r * r - (double) dy * dy));
            paint.fill(x + inset, y + i, x + w - inset, y + i + 1, color);
            paint.fill(x + inset, y + h - 1 - i, x + w - inset, y + h - i, color);
        }
    }

    private static void roundRectOutline(Paint paint, int x, int y, int w, int h, int r, int color) {
        if (w <= 0 || h <= 0) return;
        r = Math.min(r, Math.min(w / 2, h / 2));
        if (r <= 0) {
            paint.fill(x, y, x + w, y + 1, color);
            paint.fill(x, y + h - 1, x + w, y + h, color);
            paint.fill(x, y, x + 1, y + h, color);
            paint.fill(x + w - 1, y, x + w, y + h, color);
            return;
        }
        paint.fill(x + r, y, x + w - r, y + 1, color);
        paint.fill(x + r, y + h - 1, x + w - r, y + h, color);
        paint.fill(x, y + r, x + 1, y + h - r, color);
        paint.fill(x + w - 1, y + r, x + w, y + h - r, color);
        for (int i = 0; i < r; i++) {
            int dy = r - i - 1;
            int inset = r - (int) Math.round(Math.sqrt((double) r * r - (double) dy * dy));
            paint.fill(x + inset, y + i, x + inset + 1, y + i + 1, color);
            paint.fill(x + w - inset - 1, y + i, x + w - inset, y + i + 1, color);
            paint.fill(x + inset, y + h - 1 - i, x + inset + 1, y + h - i, color);
            paint.fill(x + w - inset - 1, y + h - 1 - i, x + w - inset, y + h - i, color);
        }
    }

    private static void pill(Paint paint, int x, int y, int w, int h, int color) {
        roundRect(paint, x, y, w, h, h / 2, color);
    }

    private static void pillOutline(Paint paint, int x, int y, int w, int h, int color) {
        roundRectOutline(paint, x, y, w, h, h / 2, color);
    }

    private static void circle(Paint paint, int cx, int cy, int size, int color) {
        roundRect(paint, cx - size / 2, cy - size / 2, size, size, size / 2, color);
    }

    private static void fadeLine(Paint paint, int x, int y, int width, int height, int color) {
        int segments = 24;
        for (int i = 0; i < segments; i++) {
            float t = (float) i / (segments - 1);
            float a = (float) Math.sin(Math.PI * t);
            int segX = x + Math.round((float) width * i / segments);
            int segW = Math.max(1, width / segments + 1);
            paint.fill(segX, y, segX + segW, y + height, withAlpha(color, Math.round((color >>> 24) * a)));
        }
    }

    private static void drawIcon(Paint paint, int x, int y, int size, String[] pattern, int color) {
        int pixel = Math.max(1, size / 8);
        for (int row = 0; row < pattern.length; row++) {
            String line = pattern[row];
            for (int col = 0; col < line.length(); col++) {
                if (line.charAt(col) != '#') continue;
                paint.fill(x + col * pixel, y + row * pixel, x + (col + 1) * pixel, y + (row + 1) * pixel, color);
            }
        }
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
        if (out.isEmpty()) out.add("");
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

    private static String clock(long timestamp) {
        if (timestamp <= 0) return "";
        java.time.Instant instant = java.time.Instant.ofEpochMilli(timestamp);
        java.time.ZonedDateTime time = instant.atZone(java.time.ZoneId.systemDefault());
        return String.format("%02d:%02d", time.getHour(), time.getMinute());
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
}
