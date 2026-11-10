package dev.polaris.config;

import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;

/** 1.21.1-1.21.8 screen adapter. */
public class PolarisConfigScreen extends Screen {
    private final PolarisConfigSettings settings = PolarisConfigSettings.load();
    private final long openedAt;
    private int category;

    public PolarisConfigScreen() {
        super(Text.literal("PolarisConfig"));
        this.category = this.settings.rememberLastPage ? this.settings.category : 0;
        this.openedAt = System.currentTimeMillis();
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        TextRenderer font = this.textRenderer;
        PolarisConfigUi.Paint paint = new PolarisConfigUi.Paint() {
            @Override
            public void fill(int x1, int y1, int x2, int y2, int color) {
                context.fill(x1, y1, x2, y2, color);
            }

            @Override
            public void text(String value, int x, int y, int color) {
                context.drawText(font, Text.literal(value), x, y, color, false);
            }

            @Override
            public void centered(String value, int x, int y, int color) {
                context.drawCenteredTextWithShadow(font, Text.literal(value), x, y, color);
            }

            @Override
            public int textWidth(String value) {
                return font.getWidth(value);
            }

            @Override
            public void flat(String value, int x, int y, int color) {
                context.drawText(font, Text.literal(value), x, y, color, false);
            }

            @Override
            public void flatCentered(String value, int x, int y, int color) {
                this.flat(value, x - this.textWidth(value) / 2, y, color);
            }
        };
        PolarisConfigUi.render(paint, this.settings, this.category, mouseX, mouseY, this.width, this.height, this.openedAt);
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (button != 0) return false;
        int previous = this.category;
        PolarisConfigUi.ClickResult result = PolarisConfigUi.click(
                this.settings, this.category, mouseX, mouseY, this.width, this.height);
        this.category = result.category;
        if (result.close) {
            this.close();
            return true;
        }
        return result.changed || this.category != previous;
    }

    @Override
    public boolean shouldPause() {
        return this.settings.pauseGame;
    }
}
