package dev.polaris.chat;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ChatInputTest {
    @Test
    void appendsPrintableCharactersAndIgnoresControls() {
        ChatInput input = new ChatInput();
        input.append('a');
        input.append('\n');
        input.append(0x1F600);
        assertEquals("a\uD83D\uDE00", input.text());
    }

    @Test
    void backspaceRemovesAWholeCodePoint() {
        ChatInput input = new ChatInput();
        input.append('a');
        input.append(0x1F600);
        input.backspace();
        assertEquals("a", input.text());
        input.backspace();
        assertTrue(input.isEmpty());
    }

    @Test
    void enforcesTheServerLimit() {
        ChatInput input = new ChatInput();
        for (int i = 0; i < ChatCodes.MAX_TEXT + 20; i++) input.append('x');
        assertEquals(ChatCodes.MAX_TEXT, input.text().length());
    }

    @Test
    void setTextReplacesContentsWithoutSplittingCodePoints() {
        ChatInput input = new ChatInput();
        input.append('o');
        input.setText("hi \uD83D\uDE00");
        assertEquals("hi \uD83D\uDE00", input.text());
        input.setText(null);
        assertTrue(input.isEmpty());
    }
}
