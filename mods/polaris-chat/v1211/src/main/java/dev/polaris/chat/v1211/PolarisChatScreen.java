package dev.polaris.chat.v1211;

import dev.polaris.chat.ChatInput;
import dev.polaris.chat.ChatUi;
import dev.polaris.chat.Paint;
import dev.polaris.chat.PolarisChat;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;
import dev.polaris.chat.Keys;

public final class PolarisChatScreen extends Screen {
    private final ChatUi ui = new ChatUi();
    private final ChatInput input = new ChatInput();

    public PolarisChatScreen() {
        super(Text.literal("Polaris Chat"));
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
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        Paint paint = new Paint() {
            @Override
            public void fill(int x1, int y1, int x2, int y2, int color) {
                context.fill(x1, y1, x2, y2, color);
            }

            @Override
            public void text(String text, int x, int y, int color) {
                context.drawText(textRenderer, text, x, y, color, false);
            }

            @Override
            public int width(String text) {
                return textRenderer.getWidth(text);
            }

            @Override
            public void clip(int x1, int y1, int x2, int y2) {
                context.enableScissor(x1, y1, x2, y2);
            }

            @Override
            public void unclip() {
                context.disableScissor();
            }
        };
        ui.render(paint, PolarisChat.INSTANCE, input, width, height, mouseX, mouseY, System.currentTimeMillis());
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        ChatUi.Hit hit = ui.click((int) mouseX, (int) mouseY, button, PolarisChat.INSTANCE, input);
        return switch (hit.action()) {
            case CLOSE -> {
                close();
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
            default -> super.mouseClicked(mouseX, mouseY, button);
        };
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontal, double vertical) {
        ui.scroll((int) mouseX, (int) mouseY, vertical);
        return true;
    }

    @Override
    public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
        if (keyCode == Keys.ESCAPE) {
            close();
            return true;
        }
        if (keyCode == Keys.ENTER || keyCode == Keys.KP_ENTER) {
            sendDraft();
            return true;
        }
        if (keyCode == Keys.BACKSPACE) {
            input.backspace();
            return true;
        }
        return super.keyPressed(keyCode, scanCode, modifiers);
    }

    @Override
    public boolean charTyped(char chr, int modifiers) {
        if (chr >= 32 && chr != 127) {
            input.append(chr);
            PolarisChat.INSTANCE.typing();
        }
        return true;
    }

    @Override
    public boolean shouldPause() {
        return false;
    }

    private void sendDraft() {
        if (!input.text().trim().isEmpty()) {
            PolarisChat.INSTANCE.send(input.text());
            input.clear();
        }
    }
}
