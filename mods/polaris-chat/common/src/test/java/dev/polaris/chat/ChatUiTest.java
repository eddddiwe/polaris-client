package dev.polaris.chat;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ChatUiTest {
    private static final class FakePaint implements Paint {
        @Override
        public void fill(int x1, int y1, int x2, int y2, int color) {
        }

        @Override
        public void text(String text, int x, int y, int color) {
        }

        @Override
        public int width(String text) {
            return text.length() * 6;
        }
    }

    private static final class RecordingPaint implements Paint {
        final List<String> texts = new ArrayList<>();

        @Override
        public void fill(int x1, int y1, int x2, int y2, int color) {
        }

        @Override
        public void text(String text, int x, int y, int color) {
            texts.add(text);
        }

        @Override
        public int width(String text) {
            return text.length() * 6;
        }
    }

    @AfterEach
    void cleanUp() {
        System.clearProperty("polaris.chat.demo");
        PolarisChat.INSTANCE.stop();
    }

    @Test
    void clickingTheFirstFriendSelectsThatConversation() {
        PolarisChat.INSTANCE.stop();
        System.setProperty("polaris.chat.demo", "1");
        PolarisChat chat = PolarisChat.INSTANCE;
        chat.start();

        ChatUi ui = new ChatUi();
        ChatInput input = new ChatInput();
        ui.render(new FakePaint(), chat, input, 800, 600, 0, 0, 0L);

        ChatUi.Row row = ui.friendRows().get(1);
        ChatUi.Hit hit = ui.click((row.x1() + row.x2()) / 2, (row.y1() + row.y2()) / 2, 0, chat, input);
        assertEquals(ChatUi.Action.SELECT, hit.action());
        assertEquals("POLARIS-KL55-MN78", hit.code());
    }

    @Test
    void longMessagesRemainReachableAtTheDefaultGuiScale() throws Exception {
        PolarisChat.INSTANCE.stop();
        System.setProperty("polaris.chat.demo", "1");
        PolarisChat chat = PolarisChat.INSTANCE;
        chat.start();

        String longText = "This is a long message that must remain readable. ".repeat(12);
        Method merge = PolarisChat.class.getDeclaredMethod("merge", String.class, List.class);
        merge.setAccessible(true);
        merge.invoke(chat, "POLARIS-ZX89-QW23", List.of(new ChatMessage(
                "b1111111-1111-4111-8111-111111111111",
                "POLARIS-ZX89-QW23",
                "POLARIS-AB34-CD56",
                "Nova",
                longText,
                System.currentTimeMillis())));

        RecordingPaint paint = new RecordingPaint();
        ChatUi ui = new ChatUi();
        ui.render(paint, chat, new ChatInput(), 427, 240, 0, 0, 0L);
        assertFalse(paint.texts.isEmpty());
        boolean hasContent = paint.texts.stream()
                .anyMatch(text -> longText.contains(text) && text.length() > 8);
        assertTrue(hasContent);
    }

    @Test
    void everyPartOfALongMessageIsReachable() throws Exception {
        PolarisChat.INSTANCE.stop();
        System.setProperty("polaris.chat.demo", "1");
        PolarisChat chat = PolarisChat.INSTANCE;
        chat.start();

        String longText = "This is a long message that must remain readable. ".repeat(12);
        Method merge = PolarisChat.class.getDeclaredMethod("merge", String.class, List.class);
        merge.setAccessible(true);
        merge.invoke(chat, "POLARIS-ZX89-QW23", List.of(new ChatMessage(
                "b1111111-1111-4111-8111-111111111112",
                "POLARIS-ZX89-QW23",
                "POLARIS-AB34-CD56",
                "Nova",
                longText,
                System.currentTimeMillis())));

        RecordingPaint paint = new RecordingPaint();
        ChatUi ui = new ChatUi();
        ChatInput input = new ChatInput();
        ui.render(paint, chat, input, 427, 240, 0, 0, 0L);
        ChatUi.Rect box = ui.messagesBox();
        boolean found = paint.texts.stream().anyMatch(text -> text.startsWith("This is a long"));
        for (int step = 0; step < 30 && !found; step++) {
            ui.scroll(box.centerX(), box.centerY(), 100);
            paint.texts.clear();
            ui.render(paint, chat, input, 427, 240, 0, 0, 0L);
            found = paint.texts.stream().anyMatch(text -> text.startsWith("This is a long"));
        }
        assertTrue(found);
    }

    @Test
    void composerTextIsSentOnlyThroughTheSendButton() {
        PolarisChat.INSTANCE.stop();
        System.setProperty("polaris.chat.demo", "1");
        PolarisChat chat = PolarisChat.INSTANCE;
        chat.start();

        ChatUi ui = new ChatUi();
        ChatInput input = new ChatInput();
        input.append('h');
        input.append('i');
        ui.render(new FakePaint(), chat, input, 800, 600, 0, 0, 0L);

        ChatUi.Rect send = ui.sendBox();
        ChatUi.Hit hit = ui.click(send.centerX(), send.centerY(), 0, chat, input);
        assertEquals(ChatUi.Action.SEND, hit.action());
    }
}
