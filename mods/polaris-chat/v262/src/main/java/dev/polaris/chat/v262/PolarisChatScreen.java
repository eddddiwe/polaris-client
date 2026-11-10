package dev.polaris.chat.v262;

import dev.polaris.chat.ChatInput;
import dev.polaris.chat.ChatUi;
import dev.polaris.chat.Paint;
import dev.polaris.chat.PolarisChat;
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

    /** Draw target for the current frame only; cleared once rendering finishes. */
    private GuiGraphicsExtractor extractor;

    /** Reused adapter so each frame allocates no Paint instance. */
    private final Paint paint = new Paint() {
        @Override
        public void fill(int x1, int y1, int x2, int y2, int color) {
            extractor.fill(x1, y1, x2, y2, color);
        }

        @Override
        public void text(String text, int x, int y, int color) {
            extractor.text(font, text, x, y, color);
        }

        @Override
        public int width(String text) {
            return font.width(text);
        }

        @Override
        public void centered(String text, int centerX, int y, int color) {
            extractor.centeredText(font, text, centerX, y, color);
        }

        @Override
        public void clip(int x1, int y1, int x2, int y2) {
            extractor.enableScissor(x1, y1, x2, y2);
        }

        @Override
        public void unclip() {
            extractor.disableScissor();
        }
    };

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
        this.extractor = extractor;
        try {
            ui.render(paint, PolarisChat.INSTANCE, input, width, height, mouseX, mouseY, System.currentTimeMillis());
        } finally {
            this.extractor = null;
        }
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

    /** Prevents Enter spam from sending the same draft twice while a POST is in flight. */
    private boolean sending;

    private void sendDraft() {
        if (sending) return;
        String draft = input.text();
        if (draft == null || draft.trim().isEmpty()) return;
        sending = true;
        String target = PolarisChat.INSTANCE.selected();
        // Keep the draft visible until the Worker confirms delivery. A failed
        // or timed-out send must never erase what the player typed.
        PolarisChat.INSTANCE.send(draft, ok -> {
            this.minecraft.execute(() -> {
                sending = false;
                // Ignore a late result after the user switched conversations.
                if (!ok || target == null || !target.equals(PolarisChat.INSTANCE.selected())) return;
                String current = input.text();
                if (current.equals(draft)) {
                    input.clear();
                } else if (current.startsWith(draft)) {
                    // The player kept typing while the send was in flight;
                    // keep only the new suffix.
                    input.setText(current.substring(draft.length()));
                }
            });
        });
    }
}
