package dev.polaris.chat;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

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

        ChatUi.Hit hit = ui.click(50, 95, 0, chat, input);
        assertEquals(ChatUi.Action.SELECT, hit.action());
        assertEquals("POLARIS-ZX89-QW23", hit.code());
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

        // The send button sits at the right edge of the composer.
        ChatUi.Hit hit = ui.click(730, 538, 0, chat, input);
        assertEquals(ChatUi.Action.SEND, hit.action());
    }
}
