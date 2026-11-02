package dev.polaris.chat.v26;

import dev.polaris.chat.ChatInput;
import dev.polaris.chat.ChatUi;
import dev.polaris.chat.Paint;
import dev.polaris.chat.PolarisChat;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.CharacterEvent;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import dev.polaris.chat.Keys;

public final class PolarisChatScreen extends Screen {
    private final ChatUi ui = new ChatUi();
    private final ChatInput input = new ChatInput();

    public PolarisChatScreen() {
        super(Component.literal("Polaris Chat"));
    }

    @Override
    protected void init() {
        PolarisChat.INSTANCE.setScreenOpen(true);
    }

    @Override
    public void removed() {
        PolarisChat.INSTANCE.setScreenOpen(false);
        super.removed();
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor extractor, int mouseX, int mouseY, float delta) {
        Font textFont = this.font;
        Paint paint = new Paint() {
            @Override
            public void fill(int x1, int y1, int x2, int y2, int color) {
                extractor.fill(x1, y1, x2, y2, color);
            }

            @Override
            public void text(String text, int x, int y, int color) {
                extractor.text(textFont, text, x, y, color);
            }

            @Override
            public int width(String text) {
                return textFont.width(text);
            }

            @Override
            public void centered(String text, int centerX, int y, int color) {
                extractor.centeredText(textFont, text, centerX, y, color);
            }
        };
        ui.render(paint, PolarisChat.INSTANCE, input, width, height, mouseX, mouseY, System.currentTimeMillis());
    }

    @Override
    public boolean mouseClicked(MouseButtonEvent event, boolean doubled) {
        ChatUi.Hit hit = ui.click((int) event.x(), (int) event.y(), event.button(), PolarisChat.INSTANCE, input);
        return switch (hit.action()) {
            case CLOSE -> {
                onClose();
                yield true;
            }
            case REFRESH -> {
                PolarisChat.INSTANCE.refresh();
                yield true;
            }
            case SELECT -> {
                input.clear();
                PolarisChat.INSTANCE.select(hit.code());
                yield true;
            }
            case SEND -> {
                sendDraft();
                yield true;
            }
            default -> super.mouseClicked(event, doubled);
        };
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontal, double vertical) {
        ui.scroll((int) mouseX, (int) mouseY, vertical);
        return true;
    }

    @Override
    public boolean keyPressed(KeyEvent event) {
        if (event.key() == Keys.ESCAPE) {
            onClose();
            return true;
        }
        if (event.key() == Keys.ENTER || event.key() == Keys.KP_ENTER) {
            sendDraft();
            return true;
        }
        if (event.key() == Keys.BACKSPACE) {
            input.backspace();
            return true;
        }
        return super.keyPressed(event);
    }

    @Override
    public boolean charTyped(CharacterEvent event) {
        int codePoint = event.codepoint();
        if (codePoint >= 32 && codePoint != 127) {
            input.append(codePoint);
            PolarisChat.INSTANCE.typing();
        }
        return true;
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }

    private void sendDraft() {
        if (!input.text().trim().isEmpty()) {
            PolarisChat.INSTANCE.send(input.text());
            input.clear();
        }
    }
}
