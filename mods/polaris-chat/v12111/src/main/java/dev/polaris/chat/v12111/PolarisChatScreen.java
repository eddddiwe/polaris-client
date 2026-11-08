package dev.polaris.chat.v12111;

import dev.polaris.chat.ChatInput;
import dev.polaris.chat.ChatUi;
import dev.polaris.chat.Paint;
import dev.polaris.chat.PolarisChat;
import net.minecraft.client.gui.Click;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.input.CharInput;
import net.minecraft.client.input.KeyInput;
import net.minecraft.text.Text;
import dev.polaris.chat.Keys;

public final class PolarisChatScreen extends Screen {
    private final ChatUi ui = new ChatUi();
    private final ChatInput input = new ChatInput();

    /** Draw target for the current frame only; cleared once rendering finishes. */
    private DrawContext drawContext;

    /** Reused adapter so each frame allocates no Paint instance. */
    private final Paint paint = new Paint() {
        @Override
        public void fill(int x1, int y1, int x2, int y2, int color) {
            drawContext.fill(x1, y1, x2, y2, color);
        }

        @Override
        public void text(String text, int x, int y, int color) {
            drawContext.drawText(textRenderer, text, x, y, color, false);
        }

        @Override
        public int width(String text) {
            return textRenderer.getWidth(text);
        }

        @Override
        public void clip(int x1, int y1, int x2, int y2) {
            drawContext.enableScissor(x1, y1, x2, y2);
        }

        @Override
        public void unclip() {
            drawContext.disableScissor();
        }
    };

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
        drawContext = context;
        try {
            ui.render(paint, PolarisChat.INSTANCE, input, width, height, mouseX, mouseY, System.currentTimeMillis());
        } finally {
            drawContext = null;
        }
    }

    @Override
    public boolean mouseClicked(Click click, boolean doubled) {
        ChatUi.Hit hit = ui.click((int) click.x(), (int) click.y(), click.button(), PolarisChat.INSTANCE, input);
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
            default -> super.mouseClicked(click, doubled);
        };
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontal, double vertical) {
        ui.scroll((int) mouseX, (int) mouseY, vertical);
        return true;
    }

    @Override
    public boolean keyPressed(KeyInput input) {
        if (input.key() == Keys.ESCAPE) {
            close();
            return true;
        }
        if (input.key() == Keys.ENTER || input.key() == Keys.KP_ENTER) {
            sendDraft();
            return true;
        }
        if (input.key() == Keys.BACKSPACE) {
            this.input.backspace();
            return true;
        }
        return super.keyPressed(input);
    }

    @Override
    public boolean charTyped(CharInput input) {
        int codePoint = input.codepoint();
        if (codePoint >= 32 && codePoint != 127) {
            this.input.append(codePoint);
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
